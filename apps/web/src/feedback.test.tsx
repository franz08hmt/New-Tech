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
import { api } from "./api";
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
