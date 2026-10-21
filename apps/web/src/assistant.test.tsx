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
import {
  useAssistant,
  type AskTransport,
  type AssistantState,
} from "./use-assistant";
import { ApiError, api, type StoredDocument } from "./api";
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
  onAssistant,
  courseId,
}: {
  transport?: AskTransport;
  documents?: StoredDocument[];
  persist?: boolean;
  identityKey?: string;
  onAssistant?: (assistant: AssistantState) => void;
  courseId?: string;
}) {
  const assistant = useAssistant(transport, persist, identityKey);
  onAssistant?.(assistant);
  return (
    <AssistantPanel
      open
      modal={false}
      sheet={false}
      expanded={false}
      onToggleExpanded={() => {}}
      pageId="courses"
      pageName="Công nghệ phần mềm"
      courseId={courseId}
      assistant={assistant}
      documents={documents}
      onClose={() => {}}
    />
  );
}

const savedDocumentId = "11111111-1111-4111-8111-111111111111";
const otherReadyDocumentId = "22222222-2222-4222-8222-222222222222";

function savedDocumentConversation(
  documentId = savedDocumentId,
  courseId: string | null = null,
): AssistantConversationSummary {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    mode: "documents",
    courseId,
    documentId,
    title: "Synthetic saved document conversation",
    version: 4,
    turnCount: 1,
    createdAt: "2026-09-15T08:00:00.000Z",
    updatedAt: "2026-09-15T08:00:00.000Z",
    expiresAt: "2026-12-14T08:00:00.000Z",
  };
}

function readyStoredDocument(
  id: string,
  name: string,
  courseId: string | null = null,
): StoredDocument {
  return {
    id,
    name,
    media_type: "application/pdf",
    size_bytes: 512,
    storage_status: "stored",
    processing_status: "ready",
    index_quality: null,
    course_id: courseId,
    course_slug: null,
    course_name: null,
    course_code: null,
    created_at: "2026-09-15T08:00:00.000Z",
    updated_at: "2026-09-15T08:00:00.000Z",
  };
}

function savedDocumentMessages(
  conversation: AssistantConversationSummary,
  answer = "Synthetic saved document answer",
) {
  return {
    conversation,
    items: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        sequence: 1,
        receiptId: "88888888-8888-4888-8888-888888888888",
        snapshot: {
          schemaVersion: 1,
          request: {
            mode: "documents",
            operation: "question",
            question: "Synthetic saved question",
            documentId: conversation.documentId!,
          },
          response: {
            mode: "documents",
            answer,
            answerable: true,
            reasonCode: "ANSWER_GENERATED",
            citations: [],
            ragEnabled: true,
            provider: "google",
            model: "gemini-test",
            promptVersion: "rag-v1",
          },
        } as AssistantFeedbackSnapshot,
        createdAt: conversation.createdAt,
      },
    ],
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
  };
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

  it("shows an open failure after closing history and retries only that transcript read", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Saved conversation",
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
        answer: "Persisted answer after retry",
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        ragEnabled: false,
        provider: "google",
        model: "gemini-test",
        promptVersion: "general-v1",
      },
    } as AssistantFeedbackSnapshot;
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValueOnce(
        new ApiError("Temporary service error", "INTERNAL_ERROR", 503),
      )
      .mockResolvedValueOnce({
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
    const transport = vi.fn<AskTransport>();
    const create = vi.spyOn(api, "createAssistantConversation");
    const save = vi.spyOn(api, "retrySaveAssistantTurn");
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
    fireEvent.click(savedItem);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /không mở được|thử mở lại|không tải được/i,
    );
    expect(
      screen.queryByRole("region", { name: "Lịch sử hội thoại đã lưu" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử mở lại" }));

    expect(
      await screen.findByText("Persisted answer after retry"),
    ).toBeInTheDocument();
    expect(messages).toHaveBeenCalledTimes(2);
    expect(messages).toHaveBeenNthCalledWith(
      2,
      conversation.id,
      1,
      50,
      expect.any(AbortSignal),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("applies the document selection when initially opening a saved document conversation", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockResolvedValue(savedDocumentMessages(conversation));
    const documents = [
      readyStoredDocument(savedDocumentId, "Target.pdf"),
      readyStoredDocument(otherReadyDocumentId, "Other.pdf"),
    ];

    render(<Harness documents={documents} transport={vi.fn()} persist />);
    const selector = screen.getByLabelText("Chọn tài liệu để tra cứu");
    fireEvent.change(selector, { target: { value: otherReadyDocumentId } });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );

    expect(
      await screen.findByText("Synthetic saved document answer"),
    ).toBeInTheDocument();
    await waitFor(() => expect(selector).toHaveValue(savedDocumentId));
    expect(messages).toHaveBeenCalledOnce();
  });

  it("restores the document selection after retry and continues with that saved scope", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValueOnce(
        new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
      )
      .mockResolvedValueOnce(savedDocumentMessages(conversation));
    const documents = [
      readyStoredDocument(savedDocumentId, "Target.pdf"),
      readyStoredDocument(otherReadyDocumentId, "Other.pdf"),
    ];
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const save = vi.spyOn(api, "retrySaveAssistantTurn");
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Follow-up answer",
      citations: [],
      conversationSave: { state: "saved", version: conversation.version + 1 },
    }));

    render(<Harness documents={documents} transport={transport} persist />);
    const selector = screen.getByLabelText("Chọn tài liệu để tra cứu");
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(selector, { target: { value: otherReadyDocumentId } });
    fireEvent.change(composer, {
      target: { value: "Draft retained through open retry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thử mở lại" }));
    expect(
      await screen.findByText("Synthetic saved document answer"),
    ).toBeInTheDocument();
    await waitFor(() => expect(selector).toHaveValue(savedDocumentId));
    expect(composer).toHaveValue("Draft retained through open retry");
    expect(messages).toHaveBeenCalledTimes(2);
    expect(transport).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(await screen.findByText("Follow-up answer")).toBeInTheDocument();
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][1]).toEqual(
      expect.objectContaining({ documentId: savedDocumentId }),
    );
    expect(transport.mock.calls[0][4]).toEqual(
      expect.objectContaining({
        conversationId: conversation.id,
        conversationVersion: conversation.version,
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["Tóm tắt tài liệu", "summarize", "Tóm tắt tài liệu đã chọn."],
    ["Môn học của tài liệu", "course_info", "Tài liệu này thuộc môn học nào?"],
  ] as const)(
    "blocks the %s control while a saved transcript is opening",
    async (label, _operation, _message) => {
      const conversation = savedDocumentConversation();
      vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
        items: [conversation],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      let finishOpen:
        | ((response: ReturnType<typeof savedDocumentMessages>) => void)
        | undefined;
      const messages = vi
        .spyOn(api, "getAssistantConversationMessages")
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              finishOpen = resolve;
            }),
        );
      const create = vi
        .spyOn(api, "createAssistantConversation")
        .mockResolvedValue(conversation);
      const transport = vi.fn<AskTransport>(async () => ({
        text: "Unexpected answer",
        citations: [],
        conversationSave: { state: "saved", version: conversation.version + 1 },
      }));
      render(
        <Harness
          documents={[readyStoredDocument(savedDocumentId, "Target.pdf")]}
          transport={transport}
          persist
        />,
      );
      fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
        target: { value: savedDocumentId },
      });
      fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
      fireEvent.click(
        await screen.findByRole("button", {
          name: /^Synthetic saved document conversation/,
        }),
      );
      await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");

      const action = screen.getByRole("button", { name: label });
      const wasDisabled = action.hasAttribute("disabled");
      fireEvent.click(action);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => {
        finishOpen?.(savedDocumentMessages(conversation));
      });

      expect({
        disabledWhileOpening: wasDisabled,
        creates: create.mock.calls.length,
        providerCalls: transport.mock.calls.length,
        openReads: messages.mock.calls.length,
      }).toEqual({
        disabledWhileOpening: true,
        creates: 0,
        providerCalls: 0,
        openReads: 1,
      });
    },
  );

  it("blocks direct document sends before context reset while an open request is pending", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    let finishOpen:
      | ((response: ReturnType<typeof savedDocumentMessages>) => void)
      | undefined;
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishOpen = resolve;
          }),
      );
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Unexpected answer",
      citations: [],
    }));
    let currentAssistant: AssistantState | undefined;
    render(
      <Harness
        documents={[
          readyStoredDocument(savedDocumentId, "Target.pdf"),
          readyStoredDocument(otherReadyDocumentId, "Other.pdf"),
        ]}
        transport={transport}
        persist
        onAssistant={(assistant) => {
          currentAssistant = assistant;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: savedDocumentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );
    await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");
    const openSignal = messages.mock.calls[0][3];

    await act(async () => {
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: otherReadyDocumentId,
        },
        { operation: "summarize", message: "Tóm tắt tài liệu đã chọn." },
      );
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: otherReadyDocumentId,
        },
        {
          operation: "course_info",
          message: "Tài liệu này thuộc môn học nào?",
        },
      );
    });

    expect({
      openRequestAborted: openSignal?.aborted,
      stillOpening: currentAssistant?.conversationOpenState?.status,
      creates: create.mock.calls.length,
      providerCalls: transport.mock.calls.length,
    }).toEqual({
      openRequestAborted: false,
      stillOpening: "loading",
      creates: 0,
      providerCalls: 0,
    });
    await act(async () => {
      finishOpen?.(savedDocumentMessages(conversation));
    });
  });

  it("keeps both document actions blocked after open failure and while retry is pending", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    let finishRetry:
      | ((response: ReturnType<typeof savedDocumentMessages>) => void)
      | undefined;
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValueOnce(
        new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
      )
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRetry = resolve;
          }),
      );
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Unexpected answer",
      citations: [],
    }));
    let currentAssistant: AssistantState | undefined;
    render(
      <Harness
        documents={[readyStoredDocument(savedDocumentId, "Target.pdf")]}
        transport={transport}
        persist
        onAssistant={(assistant) => {
          currentAssistant = assistant;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: savedDocumentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );
    await screen.findByRole("alert");
    const actionButtons = [
      screen.getByRole("button", { name: "Tóm tắt tài liệu" }),
      screen.getByRole("button", { name: "Môn học của tài liệu" }),
    ];
    const disabledAfterError = actionButtons.every((button) =>
      button.hasAttribute("disabled"),
    );

    const sendActions = async () => {
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: savedDocumentId,
        },
        { operation: "summarize", message: "Tóm tắt tài liệu đã chọn." },
      );
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: savedDocumentId,
        },
        {
          operation: "course_info",
          message: "Tài liệu này thuộc môn học nào?",
        },
      );
    };
    await act(async () => sendActions());
    fireEvent.click(screen.getByRole("button", { name: "Thử mở lại" }));
    await waitFor(() => expect(messages).toHaveBeenCalledTimes(2));
    await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");
    const disabledDuringRetry = actionButtons.every((button) =>
      button.hasAttribute("disabled"),
    );
    await act(async () => sendActions());
    const sideEffectsWhileBlocked = {
      creates: create.mock.calls.length,
      providerCalls: transport.mock.calls.length,
    };
    await act(async () => {
      finishRetry?.(savedDocumentMessages(conversation));
    });

    expect({
      disabledAfterError,
      disabledDuringRetry,
      sideEffectsWhileBlocked,
    }).toEqual({
      disabledAfterError: true,
      disabledDuringRetry: true,
      sideEffectsWhileBlocked: { creates: 0, providerCalls: 0 },
    });
  });

  it("does not dispatch either direct document operation while an open error is unresolved", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.spyOn(api, "getAssistantConversationMessages").mockRejectedValue(
      new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
    );
    const create = vi
      .spyOn(api, "createAssistantConversation")
      .mockResolvedValue(conversation);
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Unexpected answer",
      citations: [],
    }));
    let currentAssistant: AssistantState | undefined;
    render(
      <Harness
        documents={[readyStoredDocument(savedDocumentId, "Target.pdf")]}
        transport={transport}
        persist
        onAssistant={(assistant) => {
          currentAssistant = assistant;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: savedDocumentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );
    await screen.findByRole("alert");

    await act(async () => {
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: savedDocumentId,
        },
        { operation: "summarize", message: "Tóm tắt tài liệu đã chọn." },
      );
      await currentAssistant!.send(
        {
          pageId: "courses",
          pageName: "Công nghệ phần mềm",
          documentId: savedDocumentId,
        },
        {
          operation: "course_info",
          message: "Tài liệu này thuộc môn học nào?",
        },
      );
    });

    expect(create).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("allows document actions again after explicitly resetting an open attempt", async () => {
    const conversation = savedDocumentConversation();
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.spyOn(api, "getAssistantConversationMessages").mockImplementation(
      () => new Promise(() => {}),
    );
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Summary after reset",
      citations: [],
    }));
    render(
      <Harness
        documents={[readyStoredDocument(savedDocumentId, "Target.pdf")]}
        transport={transport}
      />,
    );
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: savedDocumentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );
    await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");

    fireEvent.click(
      within(
        document.querySelector(".assistant-conversation-tools") as HTMLElement,
      ).getByRole("button", { name: "Cuộc trò chuyện mới" }),
    );
    const summarize = screen.getByRole("button", { name: "Tóm tắt tài liệu" });
    expect(summarize).toBeEnabled();
    fireEvent.click(summarize);

    expect(await screen.findByText("Summary after reset")).toBeInTheDocument();
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][1]).toEqual(
      expect.objectContaining({ documentId: savedDocumentId }),
    );
    expect(transport.mock.calls[0][3]).toBe("summarize");
  });

  it("drops a late retry result after opening another saved document conversation", async () => {
    const first = {
      ...savedDocumentConversation(savedDocumentId),
      id: "66666666-6666-4666-8666-666666666661",
      title: "Conversation A",
    };
    const second = {
      ...savedDocumentConversation(otherReadyDocumentId),
      id: "66666666-6666-4666-8666-666666666662",
      title: "Conversation B",
    };
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [first, second],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    let finishRetry:
      | ((response: ReturnType<typeof savedDocumentMessages>) => void)
      | undefined;
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValueOnce(
        new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRetry = resolve;
          }),
      )
      .mockImplementationOnce(async () =>
        savedDocumentMessages(second, "Answer from B"),
      );
    const documents = [
      readyStoredDocument(savedDocumentId, "Target A.pdf"),
      readyStoredDocument(otherReadyDocumentId, "Target B.pdf"),
    ];
    render(
      <Harness
        documents={documents}
        transport={async () => ({ text: "", citations: [] })}
        persist
      />,
    );
    const selector = screen.getByLabelText("Chọn tài liệu để tra cứu");
    fireEvent.change(selector, { target: { value: savedDocumentId } });
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^Conversation A/ }),
    );
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Thử mở lại" }));
    await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^Conversation B/ }),
    );
    expect(await screen.findByText("Answer from B")).toBeInTheDocument();
    await waitFor(() => expect(selector).toHaveValue(otherReadyDocumentId));

    await act(async () => {
      finishRetry?.(savedDocumentMessages(first, "Late answer from A"));
    });
    expect(selector).toHaveValue(otherReadyDocumentId);
    expect(screen.getByText("Answer from B")).toBeInTheDocument();
    expect(screen.queryByText("Late answer from A")).not.toBeInTheDocument();
    expect(messages).toHaveBeenCalledTimes(3);
  });

  it("keeps a genuinely different course scope read-only after opening saved history", async () => {
    const conversation = savedDocumentConversation(savedDocumentId, "course-a");
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.spyOn(api, "getAssistantConversationMessages").mockResolvedValue(
      savedDocumentMessages(conversation),
    );
    const transport = vi.fn<AskTransport>();
    render(
      <Harness
        documents={[
          readyStoredDocument(savedDocumentId, "Target.pdf", "course-a"),
        ]}
        courseId="course-b"
        transport={transport}
        persist
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Synthetic saved document conversation/,
      }),
    );

    expect(
      await screen.findByText("Synthetic saved document answer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cuộc trò chuyện thuộc ngữ cảnh khác/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeDisabled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["reset", "principal change", "unmount"] as const)(
    "does not apply the document selection from a late successful open after %s",
    async (change) => {
      const conversation = savedDocumentConversation();
      vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
        items: [conversation],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      let finishOpen:
        | ((response: ReturnType<typeof savedDocumentMessages>) => void)
        | undefined;
      const messages = vi
        .spyOn(api, "getAssistantConversationMessages")
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              finishOpen = resolve;
            }),
        );
      const documents = [
        readyStoredDocument(savedDocumentId, "Target.pdf"),
        readyStoredDocument(otherReadyDocumentId, "Other.pdf"),
      ];
      const renderHarness = (identityKey: string) => (
        <Harness
          documents={documents}
          transport={async () => ({ text: "", citations: [] })}
          persist
          identityKey={identityKey}
        />
      );
      const view = render(renderHarness("account-a"));
      const selector = screen.getByLabelText("Chọn tài liệu để tra cứu");
      fireEvent.change(selector, { target: { value: otherReadyDocumentId } });
      fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
      fireEvent.click(
        await screen.findByRole("button", {
          name: /^Synthetic saved document conversation/,
        }),
      );
      await screen.findByText("Đang mở cuộc trò chuyện đã lưu…");
      const openSignal = messages.mock.calls[0][3];

      if (change === "reset") {
        fireEvent.click(
          within(
            document.querySelector(
              ".assistant-conversation-tools",
            ) as HTMLElement,
          ).getByRole("button", { name: "Cuộc trò chuyện mới" }),
        );
      } else if (change === "principal change") {
        view.rerender(renderHarness("account-b"));
      } else {
        view.unmount();
      }

      await act(async () => {
        finishOpen?.(savedDocumentMessages(conversation));
      });
      expect(openSignal?.aborted).toBe(true);
      expect(selector).toHaveValue(otherReadyDocumentId);
      expect(
        screen.queryByText("Synthetic saved document answer"),
      ).not.toBeInTheDocument();
    },
  );

  it("does not expose an expired transcript and offers list refresh or a new conversation", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Expired saved conversation",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const list = vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValue(
        new ApiError("Private server detail", "CONVERSATION_NOT_FOUND", 404),
      );
    const transport = vi.fn<AskTransport>();
    render(<Harness transport={transport} persist />);
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Bản nháp vẫn cần được giữ" },
    });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const row = await waitFor(() => {
      const found = document.querySelector(".assistant-history-open");
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(row);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cuộc trò chuyện này không còn khả dụng hoặc đã hết hạn",
    );
    expect(screen.queryByText("Private server detail")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Thử mở lại" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Bản nháp vẫn cần được giữ",
    );
    fireEvent.click(screen.getByRole("button", { name: "Làm mới lịch sử" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(messages).toHaveBeenCalledOnce();
    expect(transport).not.toHaveBeenCalled();

    fireEvent.click(
      within(
        document.querySelector(".assistant-conversation-tools") as HTMLElement,
      ).getAllByRole("button", { name: "Cuộc trò chuyện mới" })[0],
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Bản nháp vẫn cần được giữ",
    );
  });

  it("keeps authorization failures generic and does not offer an open retry", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Saved conversation",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const list = vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockRejectedValue(
        new ApiError("Private account detail", "ROLE_FORBIDDEN", 403),
      );
    const transport = vi.fn<AskTransport>();
    render(<Harness transport={transport} persist />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const savedItem = await waitFor(() => {
      const found = document.querySelector(
        ".assistant-history-open",
      ) as HTMLButtonElement | null;
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(savedItem);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể mở cuộc trò chuyện. Hãy kiểm tra phiên đăng nhập hoặc quyền truy cập",
    );
    expect(
      screen.queryByText("Private account detail"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử mở lại" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Làm mới lịch sử" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(messages).toHaveBeenCalledOnce();
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not offer an open retry for a non-transient client error", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Saved conversation",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.spyOn(api, "getAssistantConversationMessages").mockRejectedValue(
      new ApiError("Private validation detail", "INVALID_CONVERSATION", 400),
    );

    render(
      <Harness transport={async () => ({ text: "", citations: [] })} persist />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const savedItem = await waitFor(() => {
      const found = document.querySelector(
        ".assistant-history-open",
      ) as HTMLButtonElement | null;
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(savedItem);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể mở nội dung cuộc trò chuyện. Hãy làm mới lịch sử",
    );
    expect(screen.queryByRole("button", { name: "Thử mở lại" })).toBeNull();
    expect(
      screen.queryByText("Private validation detail"),
    ).not.toBeInTheDocument();
  });

  it("keeps list-load retry separate from opening a transcript", async () => {
    const list = vi
      .spyOn(api, "listAssistantConversations")
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
    const messages = vi.spyOn(api, "getAssistantConversationMessages");
    render(
      <Harness transport={async () => ({ text: "", citations: [] })} persist />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "network unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Thử đọc lại" }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("Chưa có cuộc trò chuyện đã lưu."),
    ).toBeInTheDocument();
    expect(messages).not.toHaveBeenCalled();
  });

  it("ignores a late open failure after another conversation has opened", async () => {
    const first: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Conversation A",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const second = {
      ...first,
      id: "77777777-7777-4777-8777-777777777777",
      title: "Conversation B",
    };
    const secondSnapshot = {
      schemaVersion: 1,
      request: {
        mode: "general",
        operation: "question",
        question: "Question from B",
      },
      response: {
        mode: "general",
        answer: "Answer from B",
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        ragEnabled: false,
        provider: "google",
        model: "gemini-test",
        promptVersion: "general-v1",
      },
    } as AssistantFeedbackSnapshot;
    let rejectFirst: ((error: Error) => void) | undefined;
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [first, second],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    vi.spyOn(api, "getAssistantConversationMessages").mockImplementation(
      (id) => {
        if (id === first.id)
          return new Promise((_, reject) => {
            rejectFirst = reject;
          });
        return Promise.resolve({
          conversation: second,
          items: [
            {
              id: "88888888-8888-4888-8888-888888888888",
              sequence: 1,
              receiptId: "99999999-9999-4999-8999-999999999999",
              snapshot: secondSnapshot,
              createdAt: second.createdAt,
            },
          ],
          page: 1,
          pageSize: 50,
          total: 1,
          totalPages: 1,
        });
      },
    );
    render(
      <Harness transport={async () => ({ text: "", citations: [] })} persist />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const rowA = await waitFor(() => {
      const found = document.querySelector(
        ".assistant-history-open",
      ) as HTMLButtonElement | null;
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(rowA);
    expect(
      await screen.findByText("Đang mở cuộc trò chuyện đã lưu…"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const rowB = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".assistant-history-open"),
    ).find((button) => button.textContent?.includes("Conversation B"));
    expect(rowB).toBeDefined();
    fireEvent.click(rowB!);
    expect(await screen.findByText("Answer from B")).toBeInTheDocument();

    await act(async () => {
      rejectFirst?.(new ApiError("Private detail", "INTERNAL_ERROR", 503));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Private detail")).not.toBeInTheDocument();
    expect(screen.getByText("Answer from B")).toBeInTheDocument();
  });

  it("clears the open target after reset/principal change and ignores both late responses", async () => {
    const conversation: AssistantConversationSummary = {
      id: "66666666-6666-4666-8666-666666666666",
      mode: "general",
      courseId: null,
      documentId: null,
      title: "Old principal conversation",
      version: 1,
      turnCount: 1,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-12-14T08:00:00.000Z",
    };
    const rejectPending: Array<(error: Error) => void> = [];
    vi.spyOn(api, "listAssistantConversations").mockResolvedValue({
      items: [conversation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const messages = vi
      .spyOn(api, "getAssistantConversationMessages")
      .mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectPending.push(reject);
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
    const savedItem = await waitFor(() => {
      const found = document.querySelector(
        ".assistant-history-open",
      ) as HTMLButtonElement | null;
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(savedItem);
    expect(
      await screen.findByText("Đang mở cuộc trò chuyện đã lưu…"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(
        document.querySelector(".assistant-conversation-tools") as HTMLElement,
      ).getByRole("button", { name: "Cuộc trò chuyện mới" }),
    );
    expect(screen.queryByText("Đang mở cuộc trò chuyện đã lưu…")).toBeNull();
    await act(async () => {
      rejectPending[0](
        new ApiError("Old reset response", "INTERNAL_ERROR", 503),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử đã lưu" }));
    const reopenedItem = await waitFor(() => {
      const found = document.querySelector(
        ".assistant-history-open",
      ) as HTMLButtonElement | null;
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(reopenedItem);
    expect(
      await screen.findByText("Đang mở cuộc trò chuyện đã lưu…"),
    ).toBeInTheDocument();

    view.rerender(
      <Harness
        transport={async () => ({ text: "", citations: [] })}
        persist
        identityKey="account-b"
      />,
    );
    expect(screen.queryByText("Đang mở cuộc trò chuyện đã lưu…")).toBeNull();
    expect(
      screen.queryByText("Old principal conversation"),
    ).not.toBeInTheDocument();
    await act(async () => {
      rejectPending[1](new ApiError("Private detail", "INTERNAL_ERROR", 503));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử mở lại" })).toBeNull();
    expect(messages).toHaveBeenCalledTimes(2);
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
