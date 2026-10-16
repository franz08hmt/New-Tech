import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { useState } from "react";
import { SpeechInput } from "./SpeechInput";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { api, request } from "./api";
import { configurePilotClient } from "./pilot-client";

class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = (mime: string) => mime.startsWith("audio/webm");
  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["last chunk"]) });
    this.onstop?.();
  });
  constructor() {
    Recorder.instances.push(this);
  }
}
const principal = {
  userId: "user-a",
  workspaceId: "workspace-a",
  role: "member" as const,
};
const ready = {
  status: "ready" as const,
  maxAudioBytes: 5242880,
  maxDurationMs: 60000,
  supportedMimeTypes: ["audio/webm", "audio/mp4"],
};
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let transcribe: MockInstance<typeof api.transcribeSpeech>;
const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
function Harness({
  active = true,
  scope = "general",
}: {
  active?: boolean;
  scope?: string;
}) {
  const [draft, setDraft] = useState("Câu hỏi đang nhập");
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="draft">Câu hỏi</label>
      <textarea
        id="draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <SpeechInput
        active={active}
        scope={scope}
        draft={draft}
        onDraft={setDraft}
      />
    </form>
  );
}
beforeEach(() => {
  Recorder.instances = [];
  stopTrack = vi.fn();
  getUserMedia = vi
    .fn()
    .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(api, "speechStatus").mockResolvedValue(ready);
  transcribe = vi.spyOn(api, "transcribeSpeech").mockResolvedValue({
    text: "Kỳ thi React khi nào?",
    detectedLanguages: ["vi"],
    requestId: "fixture",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  configurePilotClient();
  if (originalMediaDevices)
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});
async function record() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ghi âm câu hỏi" }));
  await screen.findByRole("button", { name: "Dừng ghi âm" });
}
async function finish() {
  await record();
  fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
  await screen.findByLabelText("Bản chép giọng nói");
}

describe("voice input", () => {
  it("stops oversized recordings before upload", async () => {
    vi.mocked(api.speechStatus).mockResolvedValue({
      ...ready,
      maxAudioBytes: 20,
    });
    render(<Harness />);
    await record();
    act(() =>
      Recorder.instances[0].ondataavailable?.({
        data: new Blob(["x".repeat(21)]),
      }),
    );
    expect(stopTrack).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Bản ghi quá lớn");
  });
  it("automatically stops at the recording deadline and releases tracks", async () => {
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
      ).toBeEnabled(),
    );
    vi.useFakeTimers();
    try {
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Ghi âm câu hỏi" })),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(59500);
      });
      expect(stopTrack).toHaveBeenCalled();
      expect(transcribe).toHaveBeenCalledOnce();
      expect(screen.getByLabelText("Bản chép giọng nói")).toHaveValue(
        "Kỳ thi React khi nào?",
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("uploads every chunk exactly once, edits and appends to the latest draft without submitting", async () => {
    const submit = vi.fn();
    render(
      <div onSubmit={submit}>
        <Harness />
      </div>,
    );
    await record();
    const recorder = Recorder.instances[0];
    act(() => recorder.ondataavailable?.({ data: new Blob(["first chunk"]) }));
    const stop = screen.getByRole("button", { name: "Dừng ghi âm" });
    fireEvent.click(stop);
    fireEvent.click(stop);
    await screen.findByLabelText("Bản chép giọng nói");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][0].size).toBe(
      "first chunklast chunk".length,
    );
    expect(stopTrack).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Câu hỏi"), {
      target: { value: "Nội dung mới" },
    });
    fireEvent.change(screen.getByLabelText("Bản chép giọng nói"), {
      target: { value: "Bản chép đã sửa" },
    });
    const insert = screen.getByRole("button", { name: "Chèn vào câu hỏi" });
    fireEvent.click(insert);
    fireEvent.click(insert);
    expect(screen.getByLabelText("Câu hỏi")).toHaveValue(
      "Nội dung mới\nBản chép đã sửa",
    );
    expect(submit).not.toHaveBeenCalled();
  });
  it("shows permission denial and retains the typed question", async () => {
    getUserMedia.mockRejectedValue(
      new DOMException("fixture denied", "NotAllowedError"),
    );
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ghi âm câu hỏi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Quyền microphone bị từ chối",
    );
    expect(screen.getByLabelText("Câu hỏi")).toHaveValue("Câu hỏi đang nhập");
    expect(transcribe).not.toHaveBeenCalled();
  });
  it("stops a permission stream that arrives after the panel is hidden", async () => {
    let resolveStream!: (value: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );
    const view = render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ghi âm câu hỏi" }));
    view.rerender(<Harness active={false} />);
    await act(async () =>
      resolveStream({ getTracks: () => [{ stop: stopTrack }] }),
    );
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(Recorder.instances).toHaveLength(0);
    expect(transcribe).not.toHaveBeenCalled();
  });
  it.each(["cancel", "hide", "scope", "principal", "unmount"])(
    "drops a late transcript after %s",
    async (operation) => {
      let resolveReply!: (value: {
        text: string;
        detectedLanguages: string[];
        requestId: string;
      }) => void;
      transcribe.mockReturnValue(
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
      );
      const content = (who = principal, active = true, scope = "general") => (
        <PilotPrincipalContext.Provider value={who}>
          <Harness active={active} scope={scope} />
        </PilotPrincipalContext.Provider>
      );
      const view = render(content());
      await record();
      fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
      await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
      const signal = transcribe.mock.calls[0][1];
      if (operation === "cancel")
        fireEvent.click(screen.getByRole("button", { name: "Hủy ghi âm" }));
      if (operation === "hide") view.rerender(content(principal, false));
      if (operation === "scope")
        view.rerender(content(principal, true, "documents"));
      if (operation === "principal")
        view.rerender(content({ ...principal, userId: "other-user" }));
      if (operation === "unmount") view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () =>
        resolveReply({
          text: "Stale private transcript",
          detectedLanguages: [],
          requestId: "old",
        }),
      );
      expect(screen.queryByText("Stale private transcript")).toBeNull();
      expect(screen.queryByLabelText("Bản chép giọng nói")).toBeNull();
      if (operation !== "unmount")
        expect(screen.getByLabelText("Câu hỏi")).toHaveValue(
          "Câu hỏi đang nhập",
        );
    },
  );
  it("rejects an overlong insertion without losing either editable text", async () => {
    render(<Harness />);
    await finish();
    const draft = "x".repeat(4000);
    fireEvent.change(screen.getByLabelText("Câu hỏi"), {
      target: { value: draft },
    });
    fireEvent.click(screen.getByRole("button", { name: "Chèn vào câu hỏi" }));
    expect(screen.getByRole("alert")).toHaveTextContent("4000");
    expect(screen.getByLabelText("Câu hỏi")).toHaveValue(draft);
    expect(screen.getByLabelText("Bản chép giọng nói")).toHaveValue(
      "Kỳ thi React khi nào?",
    );
  });
  it("releases the microphone when the recorder fails and does not upload", async () => {
    render(<Harness />);
    await record();
    act(() => Recorder.instances[0].onerror?.());
    expect(stopTrack).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone gặp lỗi");
  });
  it("shows upstream failure and supports a fresh recording", async () => {
    transcribe.mockRejectedValueOnce(
      Error("Dịch vụ nhận dạng tạm thời không khả dụng."),
    );
    render(<Harness />);
    await record();
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tạm thời không khả dụng",
    );
    await finish();
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
  it("keeps keyboard input usable when STT is disabled", async () => {
    vi.mocked(api.speechStatus).mockResolvedValue({
      ...ready,
      status: "not_configured",
    });
    render(<Harness />);
    await screen.findByText("Nhập bằng giọng nói chưa được bật.");
    expect(
      screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Câu hỏi"), {
      target: { value: "Gõ bình thường" },
    });
    expect(screen.getByLabelText("Câu hỏi")).toHaveValue("Gõ bình thường");
  });
  it("explains when local weights are missing and polls while the model loads", async () => {
    vi.mocked(api.speechStatus)
      .mockResolvedValueOnce({ ...ready, status: "model_missing" })
      .mockResolvedValueOnce({ ...ready, status: "loading" })
      .mockResolvedValueOnce(ready);
    render(<Harness />);
    await screen.findByText(/Chưa có file model Whisper/);
    expect(
      screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra lại ghi âm" }),
    );
    await screen.findByText(/Đang nạp model Whisper local/);
    vi.useFakeTimers();
    try {
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ghi âm câu hỏi" }),
      ).toBeEnabled(),
    );
  });
});

describe("API cancellation", () => {
  it("propagates caller cancellation through fetch and distinguishes it from timeout", async () => {
    configurePilotClient("a".repeat(43), true);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();
    const pending = request("/api/speech/transcriptions", {
      method: "POST",
      body: new FormData(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.signal?.aborted).toBe(true);
    expect(init?.credentials).toBe("same-origin");
    expect(init?.headers).not.toHaveProperty("Content-Type");
    expect(init?.headers).toHaveProperty("X-CSRF-Token", "a".repeat(43));
  });
  it("also ignores a response body resolved after the caller aborted", async () => {
    configurePilotClient("a".repeat(43), true);
    let complete!: (body: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      }),
    );
    const controller = new AbortController();
    const pending = request("/api/speech/status", {
      signal: controller.signal,
    });
    await waitFor(() => expect(complete).toBeDefined());
    controller.abort();
    complete(ready);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
