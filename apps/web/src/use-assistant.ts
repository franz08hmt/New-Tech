import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantMetadataSource,
  AssistantMode,
  AssistantOperation,
  AssistantWorkspaceSource,
  AssistantChatResponse,
  AssistantFeedbackSnapshot,
  AssistantHistoryTurn,
  AssistantStreamStage,
} from "@examate/contracts";

/*
 * The conversation behind the ExaMate AI panel.
 *
 * Owned by App, not by the panel. The panel is what gets hidden and shown; if
 * it owned the draft, closing it or switching page would be one step from
 * losing what the student had typed. Held here, the draft lives for as long as
 * the app is open in this tab — no longer: nothing is written to storage, and
 * a reload starts fresh.
 *
 * These are front-end view types, not the HTTP contract. How a question
 * travels to the backend, and what comes back, is Thắng's to define in
 * packages/contracts once the RAG endpoint exists; the transport below is the
 * single place that shape will be translated into these.
 */

export interface AssistantCitation {
  /** Stable backend source ID, when the transport provides one. */
  id?: string;
  /** What to show: a document name, a page title. */
  title: string;
  /** Where inside it, if the backend can say: "tr. 3", "mục 2.1". */
  locator?: string;
  /** Backend document ID used to request a short-lived source URL. */
  documentId?: string;
  /** One-based PDF page, when extraction produced page metadata. */
  page?: number | null;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: AssistantCitation[];
  metadataSource?: AssistantMetadataSource;
  /** Workspace records the answer rests on; never PDF citations. */
  workspaceSources?: AssistantWorkspaceSource[];
  feedback?: { answerId: string; snapshot: AssistantFeedbackSnapshot };
  feedbackUnavailable?: boolean;
  streaming?: boolean;
  incomplete?: boolean;
}

/** What the student was looking at when they asked. */
export interface AssistantContext {
  pageId: string;
  pageName: string;
  /** Narrows retrieval to the course currently being viewed. */
  courseId?: string;
  documentId?: string;
}

/**
 * Sends one question and resolves with the reply.
 *
 * Without a transport nothing can be sent and no answer can appear. App owns
 * the one production transport that translates the HTTP citation contract.
 */
export type AskTransport = (
  question: string,
  context: AssistantContext,
  mode: AssistantMode,
  operation: AssistantOperation,
  options?: {
    history?: AssistantHistoryTurn[];
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
    onStatus?: (stage: AssistantStreamStage) => void;
  },
) => Promise<{
  text: string;
  citations: AssistantCitation[];
  metadataSource?: AssistantMetadataSource;
  workspaceSources?: AssistantWorkspaceSource[];
  response?: AssistantChatResponse;
  /** UUID issued by the server; never generated from client randomness. */
  answerId?: string;
}>;

export type AssistantStatus = "unavailable" | "idle" | "sending" | "error";

export interface AssistantState {
  draft: string;
  setDraft: (value: string) => void;
  messages: AssistantMessage[];
  status: AssistantStatus;
  streamStage: AssistantStreamStage | null;
  errorMessage: string;
  canSend: boolean;
  mode: AssistantMode;
  setMode: (mode: AssistantMode) => void;
  contextNotice: string;
  conversationVersion: number;
  resetConversation: (note?: string) => void;
  syncContext: (
    context: Pick<AssistantContext, "courseId" | "documentId">,
  ) => void;
  send: (
    context: AssistantContext,
    options?: { operation?: AssistantOperation; message?: string },
  ) => Promise<void>;
  cancel: () => void;
}

export function useAssistant(transport?: AskTransport): AssistantState {
  const [draft, setDraftState] = useState("");
  const draftRevision = useRef(0);
  const setDraft = useCallback((value: string) => {
    // Record intent synchronously, including edits batched with a reply or reverted later.
    draftRevision.current++;
    setDraftState(value);
  }, []);
  const [mode, setModeState] = useState<AssistantMode>("documents");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>(
    transport ? "idle" : "unavailable",
  );
  const [streamStage, setStreamStage] = useState<AssistantStreamStage | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  // A ref, not state: a double click lands both events before React has
  // re-rendered, so a state flag would still read "not sending" on the second.
  const inFlight = useRef(false);
  const nextId = useRef(0);
  const epoch = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const activeStreamMessage = useRef<{
    userId: string;
    assistantId: string;
    text: string;
  } | null>(null);
  const history = useRef<AssistantHistoryTurn[]>([]);
  const scope = useRef<string | undefined>(undefined);
  const [contextNotice, setContextNotice] = useState("");
  const [conversationVersion, setConversationVersion] = useState(0);

  const resetConversation = useCallback(
    (note = "Đã mở cuộc hội thoại mới. Ngữ cảnh cũ không được gửi tiếp.") => {
      epoch.current++;
      setConversationVersion((value) => value + 1);
      pending.current?.abort();
      pending.current = null;
      activeStreamMessage.current = null;
      inFlight.current = false;
      history.current = [];
      setMessages([]);
      setStatus(transport ? "idle" : "unavailable");
      setStreamStage(null);
      setErrorMessage("");
      setContextNotice(note);
    },
    [transport],
  );

  const syncContext = useCallback(
    (context: Pick<AssistantContext, "courseId" | "documentId">) => {
      const next = JSON.stringify([
        context.courseId ?? null,
        context.documentId ?? null,
      ]);
      if (scope.current !== undefined && scope.current !== next)
        resetConversation(
          "Bạn vừa đổi môn hoặc tài liệu. Mình bắt đầu ngữ cảnh mới để không lẫn nguồn nhé.",
        );
      scope.current = next;
    },
    [resetConversation],
  );

  useEffect(
    () => () => {
      epoch.current++;
      pending.current?.abort();
    },
    [],
  );

  const canSend =
    Boolean(transport) && draft.trim().length > 0 && status !== "sending";

  const send = useCallback(
    async (
      context: AssistantContext,
      options?: { operation?: AssistantOperation; message?: string },
    ) => {
      const question = (options?.message ?? draft).trim();
      syncContext(context);
      if (!transport || !question || inFlight.current) return;
      inFlight.current = true;
      const requestMode = mode;
      const requestOperation = options?.operation ?? "question";
      const requestContext = { ...context };
      const requestEpoch = epoch.current;
      const requestDraftRevision = draftRevision.current;
      const controller = new AbortController();
      pending.current = controller;
      let streamedText = "";
      let streamedUserId: string | undefined;
      let streamedAssistantId: string | undefined;
      const onDelta = (delta: string) => {
        if (
          !delta ||
          requestEpoch !== epoch.current ||
          controller.signal.aborted
        )
          return;
        if (!streamedUserId || !streamedAssistantId) {
          nextId.current += 2;
          streamedUserId = `m${nextId.current - 1}`;
          streamedAssistantId = `m${nextId.current}`;
          activeStreamMessage.current = {
            userId: streamedUserId,
            assistantId: streamedAssistantId,
            text: "",
          };
          setMessages((current) => [
            ...current,
            {
              id: streamedUserId!,
              role: "user",
              text: question,
              citations: [],
            },
            {
              id: streamedAssistantId!,
              role: "assistant",
              text: "",
              citations: [],
              streaming: true,
            },
          ]);
        }
        streamedText += delta;
        if (activeStreamMessage.current)
          activeStreamMessage.current.text = streamedText;
        const assistantId = streamedAssistantId;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, text: streamedText, streaming: true }
              : message,
          ),
        );
      };
      const onStatus = (stage: AssistantStreamStage) => {
        if (requestEpoch === epoch.current && !controller.signal.aborted)
          setStreamStage(stage);
      };
      const prior = history.current.slice(-6);
      while (prior.length) {
        const serialized = JSON.stringify(prior);
        if (
          serialized.length <= 64000 &&
          new TextEncoder().encode(serialized).byteLength <= 81920
        )
          break;
        prior.shift();
      }
      if (prior.length !== history.current.length)
        setContextNotice(
          "Ngữ cảnh dài nên chỉ gửi các lượt gần nhất; hội thoại hiển thị vẫn còn nguyên.",
        );
      setStatus("sending");
      setStreamStage(null);
      setErrorMessage("");
      try {
        const reply = await transport(
          question,
          requestContext,
          requestMode,
          requestOperation,
          {
            signal: controller.signal,
            ...(requestMode !== "workspace" && requestOperation === "question"
              ? { history: prior }
              : {}),
            ...(requestOperation === "question" ? { onDelta, onStatus } : {}),
          },
        );
        if (requestEpoch !== epoch.current || controller.signal.aborted) return;
        const answerId =
          reply.answerId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            reply.answerId,
          )
            ? reply.answerId
            : undefined;
        const feedback =
          reply.response && answerId
            ? {
                answerId,
                snapshot: JSON.parse(
                  JSON.stringify({
                    schemaVersion: 1,
                    request: {
                      mode: requestMode,
                      operation: requestOperation,
                      question,
                      ...(requestContext.courseId
                        ? { courseId: requestContext.courseId }
                        : {}),
                      ...(requestContext.documentId
                        ? { documentId: requestContext.documentId }
                        : {}),
                    },
                    response: reply.response,
                  }),
                ) as AssistantFeedbackSnapshot,
              }
            : undefined;
        if (feedback && requestMode !== "workspace")
          history.current = [
            ...history.current,
            { receiptId: feedback.answerId, snapshot: feedback.snapshot },
          ].slice(-6);
        if (reply.response?.contextTruncated)
          setContextNotice(
            "Ngữ cảnh dài nên server đã bỏ lượt cũ hoặc rút gọn phần dài. Nguồn trích dẫn vẫn lấy ở lượt hiện tại.",
          );
        const assistantMessage: AssistantMessage = {
          id: streamedAssistantId ?? `m${nextId.current + 2}`,
          role: "assistant",
          text: reply.text,
          citations: reply.citations,
          ...(feedback ? { feedback } : {}),
          ...(reply.response && !answerId ? { feedbackUnavailable: true } : {}),
          ...(reply.metadataSource
            ? { metadataSource: reply.metadataSource }
            : {}),
          ...(reply.workspaceSources
            ? { workspaceSources: reply.workspaceSources }
            : {}),
        };
        if (streamedAssistantId) {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamedAssistantId ? assistantMessage : message,
            ),
          );
        } else {
          nextId.current += 2;
          setMessages((current) => [
            ...current,
            {
              id: `m${nextId.current - 1}`,
              role: "user",
              text: question,
              citations: [],
            },
            { ...assistantMessage, id: `m${nextId.current}` },
          ]);
        }
        activeStreamMessage.current = null;
        // Clear only the untouched composer that supplied this successful request.
        // An explicit message override never owns the composer draft.
        if (
          options?.message === undefined &&
          draftRevision.current === requestDraftRevision
        )
          setDraftState("");
        setStatus("idle");
        setStreamStage(null);
      } catch (error: unknown) {
        if (requestEpoch !== epoch.current || controller.signal.aborted) return;
        if (streamedAssistantId && streamedText) {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamedAssistantId
                ? { ...message, streaming: false, incomplete: true }
                : message,
            ),
          );
        }
        activeStreamMessage.current = null;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé.",
        );
        setStatus("error");
        setStreamStage(null);
      } finally {
        if (requestEpoch === epoch.current && pending.current === controller) {
          inFlight.current = false;
          pending.current = null;
          activeStreamMessage.current = null;
        }
      }
    },
    [draft, mode, transport, syncContext],
  );

  const cancel = useCallback(() => {
    const controller = pending.current;
    if (!controller) return;
    controller.abort();
    const partial = activeStreamMessage.current;
    if (partial?.text) {
      setMessages((current) =>
        current.map((message) =>
          message.id === partial.assistantId
            ? { ...message, streaming: false, incomplete: true }
            : message,
        ),
      );
    }
    activeStreamMessage.current = null;
    pending.current = null;
    inFlight.current = false;
    setStatus(transport ? "idle" : "unavailable");
    setStreamStage(null);
    setErrorMessage("");
  }, [transport]);

  const setMode = useCallback(
    (nextMode: AssistantMode) => {
      if (nextMode === mode) return;
      resetConversation("Bạn vừa đổi chế độ. Mình bắt đầu ngữ cảnh mới nhé.");
      scope.current = undefined;
      setModeState(nextMode);
    },
    [mode, resetConversation],
  );

  return {
    draft,
    setDraft,
    messages,
    status,
    streamStage,
    errorMessage,
    canSend,
    mode,
    setMode,
    contextNotice,
    conversationVersion,
    resetConversation,
    syncContext,
    send,
    cancel,
  };
}
