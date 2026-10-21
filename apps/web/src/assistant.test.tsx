import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant, type AskTransport } from "./use-assistant";
import { api, type StoredDocument } from "./api";
import type {
  AssistantChatResponse,
  AssistantConversationSummary,
  AssistantFeedbackSnapshot,
} from "@examate/contracts";

/**
 * These drive the panel with a fixture transport. They prove the seam Thắng
 * will plug into renders a reply, its sources, a pending state and a failure
 * correctly. The app's integration tests exercise the real HTTP transport.
 */
function Harness({
  transport,
  documents,
  persist = false,
  identityKey = "fixture-user-a",
}: {
  transport?: AskTransport;
  documents?: StoredDocument[];
  persist?: boolean;
  identityKey?: string;
}) {
  const assistant = useAssistant(transport, persist, identityKey);
  return (
    <AssistantPanel
      open
      modal={false}
      sheet={false}
      expanded={false}
      onToggleExpanded={() => {}}
      pageId="courses"
      pageName="Công nghệ phần mềm"
      assistant={assistant}
      documents={documents}
      onClose={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExaMate AI seam", () => {
  it("persists completed turns by server conversation ID and version without sending client history", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "documents",
      courseId: null,
      documentId: null,
      title: "First question",
      version: 0,
      turnCount: 0,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const transport = vi.fn<AskTransport>(
      async (_question, _context, _mode, _operation, options) => ({
        text: "Saved answer.",
        citations: [],
        conversationSave: {
          state: "saved",
          version: (options?.conversationVersion ?? 0) + 1,
        },
      }),
    );
    render(<Harness transport={transport} persist />);
    const composer = screen.getByRole("textbox");

    fireEvent.change(composer, { target: { value: "First question" } });
    fireEvent.submit(composer.closest("form")!);
    await screen.findByText("Saved answer.");
    expect(create).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][4]).toEqual(
      expect.objectContaining({
        conversationId: conversation.id,
        conversationVersion: 0,
      }),
    );
    expect(transport.mock.calls[0][4]).not.toHaveProperty("history");

    fireEvent.change(composer, { target: { value: "Follow-up question" } });
    fireEvent.submit(composer.closest("form")!);
    await waitFor(() =>
      expect(
        document.querySelectorAll(".assistant-messages > .is-assistant"),
      ).toHaveLength(2),
    );
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][4]).toEqual(
      expect.objectContaining({
        conversationId: conversation.id,
        conversationVersion: 1,
      }),
    );
    expect(transport.mock.calls[1][4]).not.toHaveProperty("history");
  });

  it("reconciles an uncertain create before posting another conversation", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "First question",
      version: 0,
      turnCount: 0,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockRejectedValueOnce(new Error("response lost"));
    const reconcile = vi
      .spyOn(api, "reconcileAssistantConversationCreate")
      .mockResolvedValue({ state: "found", conversation });
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Answer",
      citations: [],
      conversationSave: { state: "saved", version: 1 },
    }));
    render(<Harness transport={transport} persist />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(composer, { target: { value: "First question" } });
    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("response lost");

    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByText("Answer")).toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(reconcile.mock.calls[0][0]).toBe(create.mock.calls[0][0].createKey);
    expect(transport.mock.calls[0][4]).toEqual(
      expect.objectContaining({ conversationId: conversation.id }),
    );
  });

  it("uses GET to reconcile an unknown save and never reposts a found turn", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "First question",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const answerId = "88888888-8888-4888-8888-888888888888";
    const response: AssistantChatResponse = {
      mode: "general",
      answer: "Saved answer",
      answerable: true,
      promptVersion: "general-v1",
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: "gemini-fixture",
      ragEnabled: false,
    };
    const snapshot: AssistantFeedbackSnapshot = {
      schemaVersion: 1,
      request: { mode: "general", operation: "question", question: "Q" },
      response,
    };
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Saved answer",
      citations: [],
      response,
      answerId,
      conversationSave: { state: "unknown", answerId },
    }));
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockResolvedValue({
        conversation,
        items: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            sequence: 1,
            receiptId: answerId,
            snapshot,
            createdAt: conversation.createdAt,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      });
    const retry = vi.spyOn(api, "retrySaveAssistantTurn");
    render(<Harness transport={transport} persist />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(composer, { target: { value: "Q" } });
    fireEvent.submit(composer.closest("form")!);
    await screen.findByText("Saved answer");
    fireEvent.click(
      screen.getByRole("button", { name: "Đối chiếu trạng thái lưu" }),
    );

    await waitFor(() =>
      expect(
        document.querySelector(".assistant-save-status"),
      ).toHaveTextContent("Đã lưu cuộc trò chuyện"),
    );
    expect(create).toHaveBeenCalledOnce();
    expect(messages).toHaveBeenCalledWith(
      conversation.id,
      1,
      50,
      expect.any(AbortSignal),
    );
    expect(retry).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("drops a pending save reconciliation when the principal changes", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "First question",
      version: 0,
      turnCount: 0,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const response: AssistantChatResponse = {
      mode: "general",
      answer: "Old account answer",
      answerable: true,
      promptVersion: "general-v1",
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: "gemini-fixture",
      ragEnabled: false,
    };
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Old account answer",
      citations: [],
      response,
      answerId: "88888888-8888-4888-8888-888888888888",
      conversationSave: {
        state: "unknown",
        answerId: "88888888-8888-4888-8888-888888888888",
      },
    }));
    vi.spyOn(api, "createAssistantConversation").mockResolvedValue(
      conversation,
    );
    let resolveMessages:
      | ((value: {
          conversation: AssistantConversationSummary;
          items: [];
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        }) => void)
      | undefined;
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMessages = resolve;
          }),
      );
    const retry = vi.spyOn(api, "retrySaveAssistantTurn");
    const view = render(
      <Harness
        transport={transport}
        persist
        identityKey="account-a-workspace-a"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(composer, { target: { value: "Question" } });
    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByText("Old account answer")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Đối chiếu trạng thái lưu" }),
    );
    await waitFor(() => expect(messages).toHaveBeenCalledOnce());

    view.rerender(
      <Harness
        transport={transport}
        persist
        identityKey="account-b-workspace-b"
      />,
    );
    expect(screen.queryByText("Old account answer")).not.toBeInTheDocument();
    await act(async () =>
      resolveMessages?.({
        conversation,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      }),
    );
    expect(screen.queryByText("Old account answer")).not.toBeInTheDocument();
    expect(retry).not.toHaveBeenCalled();
  });

  it("requires confirmed absence before exposing the explicit save retry", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "First question",
      version: 0,
      turnCount: 0,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const answerId = "88888888-8888-4888-8888-888888888888";
    const response: AssistantChatResponse = {
      mode: "general",
      answer: "Saved answer",
      answerable: true,
      promptVersion: "general-v1",
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: "gemini-fixture",
      ragEnabled: false,
    };
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Saved answer",
      citations: [],
      response,
      answerId,
      conversationSave: { state: "unknown", answerId },
    }));
    vi.spyOn(api, "createAssistantConversation").mockResolvedValue(
      conversation,
    );
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockResolvedValue({
        conversation,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      });
    const retry = vi
      .spyOn(api, "retrySaveAssistantTurn")
      .mockResolvedValue({ state: "saved", version: 1 });
    render(<Harness transport={transport} persist />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(composer, { target: { value: "Q" } });
    fireEvent.submit(composer.closest("form")!);
    await screen.findByText("Saved answer");
    fireEvent.click(
      screen.getByRole("button", { name: "Đối chiếu trạng thái lưu" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Thử lưu lại (không gửi lại AI)",
        }),
      ).toBeInTheDocument(),
    );
    expect(retry).not.toHaveBeenCalled();
    expect(messages).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Thử lưu lại (không gửi lại AI)",
      }),
    );
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(transport).toHaveBeenCalledOnce();
  });

  it("loads a saved transcript without sending AI and deletes only after confirmation", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Persisted test title",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const snapshot = {
      schemaVersion: 1,
      request: {
        mode: "general",
        operation: "question",
        question: "Persisted question",
      },
      response: {
        mode: "general",
        answer: "Persisted answer",
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        ragEnabled: false,
        provider: "google",
        model: "gemini-test",
        promptVersion: "general-v1",
      },
    } as AssistantFeedbackSnapshot;
    const list = vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockResolvedValue({
        conversation,
        items: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            sequence: 1,
            receiptId: "88888888-8888-4888-8888-888888888888",
            snapshot,
            createdAt: conversation.createdAt,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      });
    const remove = vi
      .spyOn(api, "deleteAssistantConversation")
      .mockResolvedValue({ status: "deleted" });
    const transport = vi.fn<AskTransport>();
    render(<Harness transport={transport} persist />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const history = document.querySelector(
      ".assistant-saved-history",
    ) as HTMLElement;
    const savedItem = await waitFor(() => {
      const button = history.querySelector(".assistant-history-open");
      expect(button).not.toBeNull();
      return button as HTMLButtonElement;
    });
    expect(list).toHaveBeenCalledOnce();
    fireEvent.click(savedItem);
    expect(await screen.findByText("Persisted answer")).toBeInTheDocument();
    expect(messages).toHaveBeenCalledWith(
      conversation.id,
      1,
      50,
      expect.any(AbortSignal),
    );
    expect(transport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const reopenedHistory = document.querySelector(
      ".assistant-saved-history",
    ) as HTMLElement;
    await waitFor(() =>
      expect(
        reopenedHistory.querySelector(".assistant-history-row"),
      ).not.toBeNull(),
    );
    const row = reopenedHistory.querySelector(
      ".assistant-history-row",
    ) as HTMLElement;
    fireEvent.click(within(row).getAllByRole("button")[1]);
    fireEvent.click(within(row).getAllByRole("button")[1]);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(conversation.id));
    expect(reopenedHistory.querySelector(".assistant-history-row")).toBeNull();
  });

  it("drops a pending history response immediately when the principal changes", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Old account transcript",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    let finish:
      | ((value: {
          items: AssistantConversationSummary[];
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        }) => void)
      | undefined;
    vi.spyOn(api, "listAssistantConversations").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(
      <Harness
        transport={async () => ({ text: "", citations: [] })}
        persist
        identityKey="account-a"
      />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await waitFor(() => expect(finish).toBeDefined());
    view.rerender(
      <Harness
        transport={async () => ({ text: "", citations: [] })}
        persist
        identityKey="account-b"
      />,
    );
    expect(
      screen.queryByText("Old account transcript"),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish?.({
        items: [conversation],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });
    expect(
      screen.queryByText("Old account transcript"),
    ).not.toBeInTheDocument();
  });

  it("uses the CSS textarea minimum and recalculates it after viewport resize", () => {
    const getStyle = window.getComputedStyle.bind(window);
    let minHeight = "56px";
    const styleMock = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element) => {
        const style = getStyle(element);
        if (element.id === "assistant-question")
          Object.defineProperty(style, "minHeight", { value: minHeight });
        return style;
      });
    try {
      render(<Harness />);
      const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
      expect(composer.style.height).toBe("56px");
      minHeight = "96px";
      fireEvent(window, new Event("resize"));
      expect(composer.style.height).toBe("96px");
    } finally {
      styleMock.mockRestore();
    }
  });

  it("keeps suggestions and document actions scoped to the selected mode", () => {
    render(<Harness transport={async () => ({ text: "", citations: [] })} />);

    expect(
      screen.getByRole("heading", { name: "Gợi ý câu hỏi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Tìm các ý chính liên quan trong tài liệu đã lập chỉ mục.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Summarize this workspace section.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tóm tắt tài liệu" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Môn học của tài liệu" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    expect(
      screen.getByRole("button", {
        name: "Giải thích một khái niệm khó bằng ví dụ đơn giản.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chọn tài liệu để tra cứu"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
    expect(
      screen.getByRole("button", { name: "Task nào đã quá hạn?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Tài liệu" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chọn tài liệu để tra cứu"),
    ).not.toBeInTheDocument();
  });

  it("shows document-specific actions only after one ready document is selected", () => {
    const documents: StoredDocument[] = [
      {
        id: "doc-1",
        name: "de-cuong.pdf",
        media_type: "application/pdf",
        size_bytes: 2048,
        storage_status: "stored",
        processing_status: "ready",
        index_quality: null,
        course_id: null,
        course_slug: null,
        course_name: null,
        course_code: null,
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-09-15T00:00:00.000Z",
      },
    ];
    render(
      <Harness
        documents={documents}
        transport={async () => ({ text: "", citations: [] })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Tóm tắt tài liệu" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: "doc-1" },
    });

    expect(
      screen.getByRole("button", { name: "Tóm tắt tài liệu" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Môn học của tài liệu" }),
    ).toBeEnabled();
  });

  it("provides a keyboard-native new conversation control and reset notice", () => {
    render(
      <Harness transport={async () => ({ text: "Trả lời", citations: [] })} />,
    );
    const button = screen.getByRole("button", { name: "Cuộc trò chuyện mới" });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByText(/Đã mở cuộc hội thoại mới/)).toBeInTheDocument();
  });
  it("renders a reply and its sources once a transport answers", async () => {
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      citations: [{ title: "de-cuong-thuat-toan.pdf", locator: "tr. 3" }],
    }));
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Nên ôn gì trước?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText(
        "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/de-cuong-thuat-toan\.pdf/)).toBeInTheDocument();
    // The page context travels with the question, so the backend can scope it.
    expect(transport).toHaveBeenCalledWith(
      "Nên ôn gì trước?",
      {
        pageId: "courses",
        pageName: "Công nghệ phần mềm",
      },
      "documents",
      "question",
      expect.objectContaining({
        history: [],
        signal: expect.any(AbortSignal),
        onDelta: expect.any(Function),
        onStatus: expect.any(Function),
      }),
    );
    // Sent successfully, so the composer is ready for the next question.
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue("");
  });

  it("keeps the question in the composer when the transport fails", async () => {
    const transport = vi.fn<AskTransport>(async () => {
      throw new Error("offline");
    });
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Câu hỏi không được mất" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    // Losing what someone typed because the network dropped is the one thing
    // an error path must never do.
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Câu hỏi không được mất",
    );
  });

  it("refuses a second send while the first is still in flight", async () => {
    let finish: (value: { text: string; citations: [] }) => void = () => {};
    const transport = vi.fn<AskTransport>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Một lần thôi" },
    });
    const send = screen.getByRole("button", { name: /Gửi câu hỏi/ });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeDisabled());
    expect(transport).toHaveBeenCalledTimes(1);
    await act(async () => finish({ text: "Xong.", citations: [] }));
  });

  it("renders model deltas before the stream has completed", async () => {
    let finish: (value: { text: string; citations: [] }) => void = () => {};
    const transport = vi.fn<AskTransport>(
      (_question, _context, _mode, _operation, options) => {
        options?.onDelta?.("Gemini đang trả lời từng phần.");
        return new Promise((resolve) => (finish = resolve));
      },
    );
    render(<Harness transport={transport} />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Giải thích giúp tôi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText("Gemini đang trả lời từng phần."),
    ).toBeInTheDocument();
    expect(screen.getByText("Đang tạo câu trả lời…")).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Giải thích giúp tôi",
    );

    await act(async () =>
      finish({ text: "Gemini đã hoàn tất câu trả lời.", citations: [] }),
    );
    expect(
      await screen.findByText("Gemini đã hoàn tất câu trả lời."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Gemini đang trả lời từng phần.")).toBeNull();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue("");
  });

  it.each([
    ["generating", "Đang tạo câu trả lời…", "general"],
    ["retrieving", "Đang tìm bằng chứng trong tài liệu…", "documents"],
    ["querying_workspace", "Đang tra cứu dữ liệu workspace…", "workspace"],
  ] as const)(
    "shows truthful progress for the %s stream before it completes",
    async (stage, visibleStatus, mode) => {
      let finish: (value: { text: string; citations: [] }) => void = () => {};
      const transport = vi.fn<AskTransport>(
        (_question, _context, _mode, _operation, options) => {
          options?.onStatus?.(stage);
          return new Promise((resolve) => (finish = resolve));
        },
      );
      render(<Harness transport={transport} />);
      if (mode === "workspace")
        fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      else if (mode === "general")
        fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Kiểm tra trạng thái" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

      expect(await screen.findByText(visibleStatus)).toBeInTheDocument();
      await act(async () => finish({ text: "Đã xong.", citations: [] }));
      expect(screen.queryByText(visibleStatus)).toBeNull();
    },
  );

  it("stops an active stream and marks its partial answer incomplete", async () => {
    const transport = vi.fn<AskTransport>(
      (_question, _context, _mode, _operation, options) => {
        options?.onDelta?.("Phần trả lời đầu tiên.");
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Request cancelled", "AbortError")),
            { once: true },
          );
        });
      },
    );
    render(<Harness transport={transport} />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Câu hỏi đang stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));
    expect(
      await screen.findByText("Phần trả lời đầu tiên."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dừng trả lời" }));
    expect(screen.getByText(/Câu trả lời chưa hoàn tất/)).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Câu hỏi đang stream",
    );
  });

  it("does not send anything without a transport", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Có ai nghe không?" },
    });

    expect(screen.getByRole("button", { name: /Gửi câu hỏi/ })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Cuộc hội thoại" })).toBeNull();
  });
});
