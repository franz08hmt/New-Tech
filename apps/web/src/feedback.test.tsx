import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AssistantChatResponse } from "@examate/contracts";
import { useEffect } from "react";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant } from "./use-assistant";
import { api, ApiError } from "./api";
import { AssistantFeedback } from "./AssistantFeedback";

const response: AssistantChatResponse = {
  mode: "workspace",
  provider: "workspace",
  model: "database",
  promptVersion: "workspace-v1",
  answer: "Không có task quá hạn (fixture).",
  answerable: true,
  reasonCode: "WORKSPACE_ANSWER",
  ragEnabled: false,
  citations: [],
  workspaceSources: [],
  workspaceIntent: "tasks_overdue",
  asOf: "2026-10-05",
};
const scope = {
  pageId: "tasks",
  pageName: "Tasks",
  courseId: "11111111-1111-4111-8111-111111111111",
};
function Harness({
  open = true,
  expanded = false,
  fail = false,
}: {
  open?: boolean;
  expanded?: boolean;
  fail?: boolean;
}) {
  const assistant = useAssistant(async () => {
    if (fail) throw new Error("fixture HTTP error");
    return { text: response.answer, citations: [], response };
  });
  useEffect(() => assistant.setMode("workspace"), [assistant.setMode]);
  return (
    <AssistantPanel
      open={open}
      modal={false}
      sheet={false}
      expanded={expanded}
      onToggleExpanded={() => {}}
      pageId="tasks"
      pageName="Tasks"
      assistant={assistant}
      onClose={() => {}}
    />
  );
}
async function ask(question = "Task quá hạn?") {
  fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: /Send question/ }));
  await screen.findByRole("button", { name: /Hữu ích.*câu trả lời 1/ });
}
const receipt = {
  id: "22222222-2222-4222-8222-222222222222",
  rating: "helpful" as const,
  createdAt: "2026-10-05T13:00:00.000Z",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
for (const mode of ["general", "documents", "workspace"] as const) {
  it(`preserves successful ${mode} answers without crypto.randomUUID`, async () => {
    const nativeCrypto = globalThis.crypto;
    const getRandomValues = vi.fn((bytes: Uint8Array<ArrayBuffer>) =>
      nativeCrypto.getRandomValues(bytes),
    );
    vi.stubGlobal("crypto", { getRandomValues });
    const raw: AssistantChatResponse =
      mode === "workspace"
        ? response
        : {
            ...(mode === "general"
              ? { mode: "general" as const, ragEnabled: false as const }
              : { mode: "documents" as const, ragEnabled: true as const }),
            provider: "google",
            model: "fixture",
            promptVersion: "fixture",
            answer: "Valid fixture answer",
            answerable: true,
            reasonCode: "ANSWER_GENERATED",
            citations: [],
          };
    const { result } = renderHook(() =>
      useAssistant(async () => ({
        text: raw.answer,
        citations: [],
        response: raw,
      })),
    );
    act(() => {
      result.current.setMode(mode);
      result.current.setDraft("HTTP fixture question");
    });
    await act(async () => {
      await result.current.send(scope);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].text).toBe(raw.answer);
    expect(result.current.status).toBe("idle");
    expect(result.current.messages[1].feedback?.answerId).toMatch(uuidV4);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
}
it("a random source failure cannot discard a successful chat answer", async () => {
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("Fixture random source unavailable");
    },
  });
  const { result } = renderHook(() =>
    useAssistant(async () => ({
      text: response.answer,
      citations: [],
      response,
    })),
  );
  act(() => result.current.setDraft("Keep this answer"));
  await act(async () => {
    await result.current.send(scope);
  });
  expect(result.current.messages).toHaveLength(2);
  expect(result.current.status).toBe("idle");
  expect(result.current.messages[1].feedback).toBeUndefined();
  expect(result.current.messages[1].feedbackUnavailable).toBe(true);
});
it("a restricted native UUID implementation falls back without losing the answer", async () => {
  const nativeCrypto = globalThis.crypto;
  vi.stubGlobal("crypto", {
    randomUUID: () => {
      throw new Error("Native UUID restricted");
    },
    getRandomValues: (bytes: Uint8Array<ArrayBuffer>) =>
      nativeCrypto.getRandomValues(bytes),
  });
  const { result } = renderHook(() =>
    useAssistant(async () => ({
      text: response.answer,
      citations: [],
      response,
    })),
  );
  act(() => result.current.setDraft("Restricted native fixture"));
  await act(async () => {
    await result.current.send(scope);
  });
  expect(result.current.messages).toHaveLength(2);
  expect(result.current.messages[1].feedback?.answerId).toMatch(uuidV4);
});
it("failure to create a submission UUID keeps the note and does not call the API", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("Fixture random source unavailable");
    },
  });
  const submit = vi.spyOn(api, "submitAssistantFeedback");
  render(
    <AssistantFeedback
      number={1}
      feedback={{
        answerId: receipt.id,
        snapshot: {
          schemaVersion: 1,
          request: {
            mode: "workspace",
            operation: "question",
            question: "Fixture",
          },
          response,
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích/ }));
  fireEvent.change(screen.getByLabelText(/Ghi chú/), {
    target: { value: "Keep note without randomness" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Gửi phản hồi/ }));
  expect(screen.getByRole("alert")).toHaveTextContent(/chưa tạo được mã gửi/i);
  expect(screen.getByLabelText(/Ghi chú/)).toHaveValue(
    "Keep note without randomness",
  );
  expect(submit).not.toHaveBeenCalled();
});
it("feedback submission and retry use a stable fallback UUID without crypto.randomUUID", async () => {
  const nativeCrypto = globalThis.crypto;
  const getRandomValues = vi.fn((bytes: Uint8Array<ArrayBuffer>) =>
    nativeCrypto.getRandomValues(bytes),
  );
  vi.stubGlobal("crypto", { getRandomValues });
  const submit = vi
    .spyOn(api, "submitAssistantFeedback")
    .mockRejectedValueOnce(
      new ApiError("Fixture unavailable", "FEEDBACK_STORAGE_UNAVAILABLE", 503),
    )
    .mockResolvedValue(receipt);
  render(<Harness />);
  await ask();
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích.*1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Gửi phản hồi/ }));
  await screen.findByText(/Chưa lưu được phản hồi/);
  const first = submit.mock.calls[0][0];
  expect(first.answerId).toMatch(uuidV4);
  expect(first.submissionId).toMatch(uuidV4);
  expect(first.submissionId).not.toBe(first.answerId);
  fireEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
  await screen.findByText(/Đã lưu phản hồi/);
  expect(submit.mock.calls[1][0]).toEqual(first);
  expect(getRandomValues).toHaveBeenCalledTimes(2);
});
for (const status of [400, 409])
  it(`feedback ${status} retains the selection without offering an impossible retry`, async () => {
    const submit = vi
      .spyOn(api, "submitAssistantFeedback")
      .mockRejectedValue(
        new ApiError("Private fixture details", "FIXTURE_REJECTED", status),
      );
    render(<Harness />);
    await ask();
    fireEvent.click(screen.getByRole("button", { name: /Chưa đúng.*1/ }));
    fireEvent.click(screen.getByLabelText("Thiếu ý"));
    fireEvent.change(screen.getByLabelText(/Ghi chú/), {
      target: { value: "Retained note" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi phản hồi/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      status === 400 ? /không hợp lệ/i : /đã có phản hồi/i,
    );
    expect(alert).not.toHaveTextContent("Private fixture details");
    expect(screen.getByLabelText(/Ghi chú/)).toHaveValue("Retained note");
    expect(
      screen.queryByRole("button", { name: /Thử lại|Gửi phản hồi/ }),
    ).toBeNull();
    expect(screen.queryByText(/Đã lưu phản hồi/)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
  });

it("feedback note limit counts Unicode characters and form submits through its accessible controls", async () => {
  const submit = vi
    .spyOn(api, "submitAssistantFeedback")
    .mockResolvedValue(receipt);
  render(<Harness />);
  await ask();
  const helpful = screen.getByRole("button", { name: /Hữu ích.*1/ });
  helpful.focus();
  expect(helpful).toHaveFocus();
  fireEvent.click(helpful);
  const note = screen.getByLabelText(/Ghi chú/);
  fireEvent.change(note, { target: { value: "😀".repeat(1001) } });
  expect(note).toHaveValue("😀".repeat(1000));
  fireEvent.submit(screen.getByRole("form", { name: /Gửi phản hồi/ }));
  await screen.findByText(/Đã lưu phản hồi/);
  expect(submit.mock.calls[0][0].comment).toBe("😀".repeat(1000));
});
it("malformed acknowledgement remains unsaved with retry", async () => {
  vi.spyOn(api, "submitAssistantFeedback").mockResolvedValue({
    ...receipt,
    id: "m2",
  });
  render(<Harness />);
  await ask();
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích.*1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Gửi phản hồi/ }));
  await screen.findByText(/Chưa lưu được phản hồi/);
  expect(screen.queryByText(/Đã lưu phản hồi/)).toBeNull();
});
it("oversize snapshot cannot be sent or silently truncated", () => {
  const submit = vi.spyOn(api, "submitAssistantFeedback");
  render(
    <AssistantFeedback
      number={1}
      feedback={{
        answerId: receipt.id,
        snapshot: {
          schemaVersion: 1,
          request: {
            mode: "workspace",
            operation: "question",
            question: "fixture",
          },
          response: { ...response, answer: "x".repeat(32001) },
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích/ }));
  fireEvent.click(screen.getByRole("button", { name: /Gửi phản hồi/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("vượt giới hạn");
  expect(submit).not.toHaveBeenCalled();
});

it("feedback draft and question draft survive source preview and Back", async () => {
  const citation = {
    id: "S1",
    title: "synthetic.pdf",
    documentId: receipt.id,
    page: 2,
    locator: "tr. 2",
  };
  const raw: AssistantChatResponse = {
    mode: "documents",
    provider: "google",
    model: "fixture",
    promptVersion: "fixture",
    answer: "Fixture answer [S1]",
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    ragEnabled: true,
    citations: [
      {
        sourceId: "S1",
        documentId: receipt.id,
        chunkId: receipt.id,
        title: "synthetic.pdf",
        page: 2,
        chunkIndex: 0,
      },
    ],
  };
  const loadSource = vi.fn(
    async () => "https://storage.example.test/synthetic.pdf",
  );
  function SourceHarness() {
    const assistant = useAssistant(async () => ({
      text: raw.answer,
      citations: [citation],
      response: raw,
    }));
    return (
      <AssistantPanel
        open
        modal={false}
        sheet={false}
        expanded
        onToggleExpanded={() => {}}
        pageId="documents"
        pageName="Documents"
        assistant={assistant}
        loadSource={loadSource}
        onOpenCitation={async () => {}}
        onClose={() => {}}
      />
    );
  }
  render(<SourceHarness />);
  await ask("Fixture source question");
  fireEvent.click(screen.getByRole("button", { name: /Chưa đúng.*1/ }));
  fireEvent.click(screen.getByLabelText("Thiếu ý"));
  fireEvent.change(screen.getByLabelText(/Ghi chú/), {
    target: { value: "Keep feedback draft" },
  });
  fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
    target: { value: "Keep question draft" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Open source synthetic/ }),
  );
  await waitFor(() => expect(loadSource).toHaveBeenCalledTimes(1));
  const back = screen.getByRole("button", { name: /Quay lại/ });
  fireEvent.click(back);
  expect(screen.getByLabelText(/Ghi chú/)).toHaveValue("Keep feedback draft");
  expect(screen.getByLabelText("Thiếu ý")).toBeChecked();
  expect(screen.getByLabelText("Question for ExaMate")).toHaveValue(
    "Keep question draft",
  );
});
it("feedback attaches controls only to successful assistant answers", async () => {
  render(<Harness />);
  await ask();
  const list = screen.getByRole("list", { name: "Conversation" });
  const messages = within(list).getAllByRole("listitem");
  expect(
    within(messages[0]).queryByRole("button", { name: /Hữu ích/ }),
  ).toBeNull();
  expect(
    within(messages[1]).getByRole("button", { name: /Hữu ích/ }),
  ).toBeInTheDocument();
});
it("snapshot captures request scope and mode before UI changes", async () => {
  const { result } = renderHook(() =>
    useAssistant(async () => ({
      text: response.answer,
      citations: [],
      response,
    })),
  );
  act(() => {
    result.current.setMode("workspace");
    result.current.setDraft("Old question");
  });
  await act(async () => {
    await result.current.send(scope);
  });
  act(() => {
    result.current.setMode("general");
    scope.pageName = "Changed";
  });
  const answer = result.current.messages[1];
  expect(answer.feedback?.snapshot.request).toEqual({
    mode: "workspace",
    operation: "question",
    question: "Old question",
    courseId: scope.courseId,
  });
  expect(answer.feedback?.answerId).toMatch(/^[0-9a-f-]{36}$/);
  expect(answer.feedback?.snapshot.response).toEqual(response);
});
it("helpful waits for real acknowledgement and prevents double click", async () => {
  let finish!: (r: typeof receipt) => void;
  const submit = vi.spyOn(api, "submitAssistantFeedback").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness />);
  await ask();
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích.*1/ }));
  expect(screen.getByText(/phản hồi sẽ lưu câu hỏi/i)).toBeInTheDocument();
  const send = screen.getByRole("button", {
    name: "Gửi phản hồi — câu trả lời 1",
  });
  fireEvent.click(send);
  fireEvent.click(send);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Đã lưu phản hồi/)).toBeNull();
  expect(screen.getByRole("button", { name: /Chưa đúng.*1/ })).toBeDisabled();
  await act(async () => finish(receipt));
  expect(screen.getByText(/Đã lưu phản hồi/)).toHaveAttribute("role", "status");
});
it("unhelpful validates reasons and other, retains note and retries identical payload", async () => {
  const submit = vi
    .spyOn(api, "submitAssistantFeedback")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ...receipt, rating: "unhelpful" });
  render(<Harness />);
  await ask();
  fireEvent.click(screen.getByRole("button", { name: /Chưa đúng.*1/ }));
  const send = screen.getByRole("button", { name: /Gửi phản hồi/ });
  fireEvent.click(send);
  expect(screen.getByRole("alert")).toHaveTextContent("ít nhất một lý do");
  fireEvent.click(screen.getByLabelText("Khác"));
  fireEvent.click(send);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Sai nguồn"));
  fireEvent.change(screen.getByLabelText(/Ghi chú/), {
    target: { value: "Fixture note" },
  });
  fireEvent.click(send);
  await screen.findByText(/Chưa lưu được phản hồi/);
  expect(screen.getByLabelText(/Ghi chú/)).toHaveValue("Fixture note");
  fireEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
  await screen.findByText(/Đã lưu phản hồi/);
  expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
  expect(submit.mock.calls[0][0].reasons).toEqual(["other", "wrong_source"]);
});
it("feedback drafts survive hide and expand and stay separate between answers", async () => {
  const submit = vi
    .spyOn(api, "submitAssistantFeedback")
    .mockResolvedValue(receipt);
  const view = render(<Harness />);
  await ask();
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích.*1/ }));
  fireEvent.change(screen.getByLabelText(/Ghi chú/), {
    target: { value: "First draft" },
  });
  view.rerender(<Harness open={false} />);
  view.rerender(<Harness open expanded />);
  expect(screen.getByLabelText(/Ghi chú/)).toHaveValue("First draft");
  await ask("Second question");
  fireEvent.click(screen.getByRole("button", { name: /Hữu ích.*2/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Gửi phản hồi — câu trả lời 2" }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0][0].snapshot.request.question).toBe(
    "Second question",
  );
  expect(submit.mock.calls[0][0].comment).toBeUndefined();
  expect(screen.getByLabelText("Ghi chú — câu trả lời 1")).toHaveValue(
    "First draft",
  );
});
it("HTTP errors do not get feedback controls", async () => {
  render(<Harness fail />);
  fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
    target: { value: "Fail" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Send question/ }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: /Hữu ích/ })).toBeNull();
});
