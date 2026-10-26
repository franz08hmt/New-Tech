import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AssistantMetadataSource,
  AssistantMode,
  AssistantOperation,
  AssistantWorkspaceSource,
  AssistantChatResponse,
  AssistantFeedbackSnapshot,
  AssistantHistoryTurn,
  AssistantStreamStage,
  AssistantConversationSummary,
  AssistantConversationSaveMetadata,
} from "@examate/contracts";
import { ApiError, api } from "./api";
import { tl } from "./i18n";

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
    conversationId?: string;
    conversationVersion?: number;
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
  conversationSave?: AssistantConversationSaveMetadata;
}>;

export type AssistantStatus = "unavailable" | "idle" | "sending" | "error";

export type AssistantConversationOpenState =
  | { status: "loading" }
  | {
      status: "error";
      message: string;
      retryable: boolean;
    }
  | null;

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
  activeConversation: AssistantConversationSummary | null;
  conversationSaveState: "saved" | "saving" | "not_saved" | "unknown" | null;
  savedConversations: AssistantConversationSummary[];
  historyLoading: boolean;
  historyError: string;
  historyHasMore: boolean;
  conversationOpenState: AssistantConversationOpenState;
  conversationSaveError: string;
  retryConversationSave: () => Promise<void>;
  loadConversationHistory: (append?: boolean) => Promise<void>;
  openConversation: (
    id: string,
  ) => Promise<AssistantConversationSummary | null>;
  retryOpenConversation: () => Promise<AssistantConversationSummary | null>;
  deleteConversation: (id: string) => Promise<void>;
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

export function useAssistant(
  transport?: AskTransport,
  persistConversations = false,
  principalKey = "",
): AssistantState {
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
  const [activeConversation, setActiveConversation] =
    useState<AssistantConversationSummary | null>(null);
  const activeConversationRef = useRef<AssistantConversationSummary | null>(
    null,
  );
  const [conversationSaveState, setConversationSaveState] =
    useState<AssistantState["conversationSaveState"]>(null);
  const [conversationSaveError, setConversationSaveError] = useState("");
  const pendingSave = useRef<{
    conversationId: string;
    receiptId: string;
    expectedVersion: number;
    snapshot: AssistantFeedbackSnapshot;
  } | null>(null);
  const [savedConversations, setSavedConversations] = useState<
    AssistantConversationSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [conversationOpenState, setConversationOpenState] =
    useState<AssistantConversationOpenState>(null);
  // Synchronous guard for callbacks that can run before React commits the
  // loading/error state. An open failure remains blocking until some
  // conversation opens successfully or the user explicitly resets.
  const conversationOpenBlocked = useRef(false);
  const conversationOpenRequestInFlight = useRef(false);
  const historyPage = useRef(0);
  const historyEpoch = useRef(0);
  const historyAbort = useRef<AbortController | null>(null);
  const conversationOpenTarget = useRef<{
    id: string;
    principalKey: string;
  } | null>(null);
  const saveResolutionAbort = useRef<AbortController | null>(null);
  const saveResolutionEpoch = useRef(0);
  const pendingCreateKey = useRef<string | null>(null);
  const principalKeyRef = useRef(principalKey);
  principalKeyRef.current = principalKey;
  const committedPrincipalKey = useRef(principalKey);

  const setActive = useCallback(
    (conversation: AssistantConversationSummary | null) => {
      activeConversationRef.current = conversation;
      setActiveConversation(conversation);
    },
    [],
  );

  const resetConversation = useCallback(
    (
      note = tl("Đã mở cuộc hội thoại mới. Ngữ cảnh cũ không được gửi tiếp."),
    ) => {
      epoch.current++;
      setConversationVersion((value) => value + 1);
      pending.current?.abort();
      pending.current = null;
      historyAbort.current?.abort();
      historyEpoch.current++;
      conversationOpenTarget.current = null;
      conversationOpenBlocked.current = false;
      conversationOpenRequestInFlight.current = false;
      setConversationOpenState(null);
      setHistoryError("");
      setHistoryLoading(false);
      saveResolutionAbort.current?.abort();
      saveResolutionAbort.current = null;
      saveResolutionEpoch.current++;
      activeStreamMessage.current = null;
      inFlight.current = false;
      history.current = [];
      setActive(null);
      pendingCreateKey.current = null;
      setConversationSaveState(null);
      setConversationSaveError("");
      pendingSave.current = null;
      setMessages([]);
      setStatus(transport ? "idle" : "unavailable");
      setStreamStage(null);
      setErrorMessage("");
      setContextNotice(note);
    },
    [setActive, transport],
  );

  useLayoutEffect(() => {
    if (committedPrincipalKey.current === principalKey) return;
    committedPrincipalKey.current = principalKey;
    resetConversation(
      tl(
        "Phiên hoặc workspace đã đổi. Dữ liệu hội thoại cũ đã được xóa khỏi màn hình.",
      ),
    );
    historyPage.current = 0;
    setSavedConversations([]);
    setHistoryHasMore(false);
  }, [principalKey, resetConversation]);

  const syncContext = useCallback(
    (context: Pick<AssistantContext, "courseId" | "documentId">) => {
      const next = JSON.stringify([
        context.courseId ?? null,
        context.documentId ?? null,
      ]);
      if (scope.current !== undefined && scope.current !== next)
        resetConversation(
          tl(
            "Bạn vừa đổi môn hoặc tài liệu. Mình bắt đầu ngữ cảnh mới để không lẫn nguồn nhé.",
          ),
        );
      scope.current = next;
    },
    [resetConversation],
  );

  useEffect(
    () => () => {
      epoch.current++;
      pending.current?.abort();
      historyAbort.current?.abort();
      historyEpoch.current++;
      conversationOpenTarget.current = null;
      conversationOpenBlocked.current = false;
      conversationOpenRequestInFlight.current = false;
      saveResolutionAbort.current?.abort();
    },
    [],
  );

  const canSend =
    Boolean(transport) &&
    draft.trim().length > 0 &&
    !historyLoading &&
    conversationOpenState === null &&
    status !== "sending" &&
    conversationSaveState !== "not_saved" &&
    conversationSaveState !== "unknown";

  const send = useCallback(
    async (
      context: AssistantContext,
      options?: { operation?: AssistantOperation; message?: string },
    ) => {
      // This check must precede syncContext: that call can reset the current
      // conversation and create a new one before dispatching the transport.
      // It intentionally covers fixed-message operations such as summarize.
      if (conversationOpenBlocked.current) return;
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
          tl(
            "Ngữ cảnh dài nên chỉ gửi các lượt gần nhất; hội thoại hiển thị vẫn còn nguyên.",
          ),
        );
      setStatus("sending");
      setStreamStage(null);
      setErrorMessage("");
      let persistent = activeConversationRef.current;
      try {
        if (persistConversations && !persistent) {
          const retryingCreate = pendingCreateKey.current !== null;
          pendingCreateKey.current ??= crypto.randomUUID();
          let createKey = pendingCreateKey.current;
          if (retryingCreate && createKey) {
            const reconciliation =
              await api.reconcileAssistantConversationCreate(
                createKey,
                controller.signal,
              );
            if (requestEpoch !== epoch.current || controller.signal.aborted)
              return;
            if (reconciliation.state === "found") {
              persistent = reconciliation.conversation;
              pendingCreateKey.current = null;
            } else if (reconciliation.state === "deleted") {
              createKey = crypto.randomUUID();
              pendingCreateKey.current = createKey;
            }
          }
          if (!persistent) {
            persistent = await api.createAssistantConversation(
              {
                createKey: pendingCreateKey.current!,
                mode: requestMode,
                courseId: requestContext.courseId ?? null,
                documentId: requestContext.documentId ?? null,
                firstQuestion: question,
              },
              controller.signal,
            );
          }
          if (requestEpoch !== epoch.current || controller.signal.aborted)
            return;
          pendingCreateKey.current = null;
          setActive(persistent);
        }
        setConversationSaveState("saving");
        const reply = await transport(
          question,
          requestContext,
          requestMode,
          requestOperation,
          {
            signal: controller.signal,
            ...(persistent
              ? {
                  conversationId: persistent.id,
                  conversationVersion: persistent.version,
                }
              : requestMode !== "workspace" && requestOperation === "question"
                ? { history: prior }
                : {}),
            ...(requestOperation === "question" ? { onDelta, onStatus } : {}),
          },
        );
        if (requestEpoch !== epoch.current || controller.signal.aborted) return;
        if (reply.conversationSave) {
          setConversationSaveState(reply.conversationSave.state);
          if (reply.conversationSave.version !== undefined && persistent) {
            persistent = {
              ...persistent,
              version: reply.conversationSave.version,
            };
            setActive(persistent);
          }
        } else if (persistent) setConversationSaveState("unknown");
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
        if (persistent && feedback && reply.conversationSave) {
          if (reply.conversationSave.state === "saved") {
            pendingSave.current = null;
            setConversationSaveError("");
          } else {
            pendingSave.current = {
              conversationId: persistent.id,
              receiptId: feedback.answerId,
              expectedVersion:
                reply.conversationSave.version ?? persistent.version,
              snapshot: feedback.snapshot,
            };
          }
        }
        if (feedback && requestMode !== "workspace" && !persistent)
          history.current = [
            ...history.current,
            { receiptId: feedback.answerId, snapshot: feedback.snapshot },
          ].slice(-6);
        if (reply.response?.contextTruncated)
          setContextNotice(
            tl(
              "Ngữ cảnh dài nên server đã bỏ lượt cũ hoặc rút gọn phần dài. Nguồn trích dẫn vẫn lấy ở lượt hiện tại.",
            ),
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
            : tl(
                "Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé.",
              ),
        );
        setStatus("error");
        if (persistent) setConversationSaveState(null);
        setStreamStage(null);
      } finally {
        if (requestEpoch === epoch.current && pending.current === controller) {
          inFlight.current = false;
          pending.current = null;
          activeStreamMessage.current = null;
        }
      }
    },
    [draft, mode, persistConversations, setActive, transport, syncContext],
  );

  const loadConversationHistory = useCallback(
    async (append = false) => {
      if (historyLoading) return;
      if (conversationOpenRequestInFlight.current) {
        conversationOpenTarget.current = null;
        conversationOpenBlocked.current = false;
        conversationOpenRequestInFlight.current = false;
        setConversationOpenState(null);
      }
      const requestedPage = append ? historyPage.current + 1 : 1;
      historyAbort.current?.abort();
      const controller = new AbortController();
      historyAbort.current = controller;
      const requestEpoch = ++historyEpoch.current;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await api.listAssistantConversations(
          requestedPage,
          20,
          controller.signal,
        );
        if (requestEpoch !== historyEpoch.current || controller.signal.aborted)
          return;
        setSavedConversations((current) =>
          requestedPage === 1
            ? response.items
            : [...current, ...response.items],
        );
        historyPage.current = requestedPage;
        setHistoryHasMore(requestedPage < response.totalPages);
      } catch (error) {
        if (requestEpoch !== historyEpoch.current || controller.signal.aborted)
          return;
        setHistoryError(
          error instanceof Error
            ? error.message
            : tl("Chưa tải được lịch sử. Hãy thử đọc lại."),
        );
      } finally {
        if (requestEpoch === historyEpoch.current) setHistoryLoading(false);
      }
    },
    [historyLoading],
  );

  const openConversation = useCallback(
    async (id: string) => {
      conversationOpenBlocked.current = true;
      conversationOpenRequestInFlight.current = true;
      historyAbort.current?.abort();
      saveResolutionAbort.current?.abort();
      saveResolutionAbort.current = null;
      saveResolutionEpoch.current++;
      const controller = new AbortController();
      historyAbort.current = controller;
      const requestEpoch = ++historyEpoch.current;
      epoch.current++;
      const requestPrincipal = principalKeyRef.current;
      pending.current?.abort();
      pending.current = null;
      inFlight.current = false;
      setActive(null);
      setMessages([]);
      history.current = [];
      pendingCreateKey.current = null;
      setConversationSaveState(null);
      setConversationSaveError("");
      pendingSave.current = null;
      activeStreamMessage.current = null;
      setStatus(transport ? "idle" : "unavailable");
      setErrorMessage("");
      setHistoryLoading(false);
      setHistoryError("");
      conversationOpenTarget.current = {
        id,
        principalKey: requestPrincipal,
      };
      setConversationOpenState({ status: "loading" });
      try {
        const first = await api.getAssistantConversationMessages(
          id,
          1,
          50,
          controller.signal,
        );
        let turns = first.items;
        for (let page = 2; page <= first.totalPages; page++) {
          const next = await api.getAssistantConversationMessages(
            id,
            page,
            50,
            controller.signal,
          );
          turns = [...turns, ...next.items];
        }
        if (
          requestEpoch !== historyEpoch.current ||
          controller.signal.aborted ||
          principalKeyRef.current !== requestPrincipal
        )
          return null;
        const conversation = first.conversation;
        const loaded = turns.flatMap((turn) => {
          const snapshot = turn.snapshot;
          const citations = snapshot.response.citations.map((item) => ({
            id: item.sourceId,
            title: item.title,
            locator:
              item.page === null
                ? tl("đoạn {value}", { value: item.chunkIndex + 1 })
                : tl("tr. {page}", { page: item.page }),
            documentId: item.documentId,
            page: item.page,
          }));
          return [
            {
              id: `${turn.id}-q`,
              role: "user" as const,
              text: snapshot.request.question,
              citations: [],
            },
            {
              id: `${turn.id}-a`,
              role: "assistant" as const,
              text: snapshot.response.answer,
              citations,
              feedback: { answerId: turn.receiptId, snapshot },
              ...(snapshot.response.mode === "workspace"
                ? { workspaceSources: snapshot.response.workspaceSources }
                : {}),
              ...(snapshot.response.mode === "documents" &&
              snapshot.response.reasonCode === "DOCUMENT_METADATA"
                ? { metadataSource: snapshot.response.metadataSource }
                : {}),
            },
          ];
        });
        epoch.current++;
        history.current = turns
          .filter((turn) => turn.snapshot.request.mode !== "workspace")
          .slice(-6)
          .map((turn) => ({
            receiptId: turn.receiptId,
            snapshot: turn.snapshot,
          }));
        scope.current = JSON.stringify([
          conversation.courseId,
          conversation.documentId,
        ]);
        setModeState(conversation.mode);
        setActive(conversation);
        setConversationVersion(conversation.version);
        setConversationSaveState("saved");
        setMessages(loaded);
        setStreamStage(null);
        conversationOpenTarget.current = null;
        setConversationOpenState(null);
        conversationOpenBlocked.current = false;
        return conversation;
      } catch (error) {
        if (
          requestEpoch !== historyEpoch.current ||
          controller.signal.aborted ||
          principalKeyRef.current !== requestPrincipal
        )
          return null;
        const unavailable =
          error instanceof ApiError &&
          (error.status === 404 || error.status === 410);
        const authorizationFailure =
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403);
        const retryable =
          !(error instanceof ApiError) ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500;
        setConversationOpenState({
          status: "error",
          message: unavailable
            ? tl(
                "Cuộc trò chuyện này không còn khả dụng hoặc đã hết hạn. Hãy làm mới lịch sử hoặc bắt đầu cuộc trò chuyện mới.",
              )
            : authorizationFailure
              ? tl(
                  "Không thể mở cuộc trò chuyện. Hãy kiểm tra phiên đăng nhập hoặc quyền truy cập rồi làm mới lịch sử.",
                )
              : retryable
                ? tl(
                    "Chưa tải được nội dung cuộc trò chuyện. Bạn có thể thử mở lại hoặc làm mới lịch sử.",
                  )
                : tl(
                    "Không thể mở nội dung cuộc trò chuyện. Hãy làm mới lịch sử hoặc bắt đầu cuộc trò chuyện mới.",
                  ),
          retryable,
        });
        if (unavailable || authorizationFailure)
          conversationOpenTarget.current = null;
        // Keep sends blocked even when the target is no longer retryable.
        // The user must explicitly reset before creating a new conversation.
        return null;
      } finally {
        if (requestEpoch === historyEpoch.current) {
          conversationOpenRequestInFlight.current = false;
          setHistoryLoading(false);
        }
      }
    },
    [setActive, transport],
  );

  const retryOpenConversation = useCallback(() => {
    const target = conversationOpenTarget.current;
    if (!target || target.principalKey !== principalKeyRef.current)
      return Promise.resolve(null);
    return openConversation(target.id);
  }, [openConversation]);

  const deleteConversation = useCallback(
    async (id: string) => {
      const requestPrincipal = principalKeyRef.current;
      setHistoryError("");
      try {
        await api.deleteAssistantConversation(id);
        if (principalKeyRef.current !== requestPrincipal) return;
        if (conversationOpenTarget.current?.id === id) {
          historyAbort.current?.abort();
          historyEpoch.current++;
          conversationOpenTarget.current = null;
          conversationOpenBlocked.current = false;
          conversationOpenRequestInFlight.current = false;
          setConversationOpenState(null);
        }
        setSavedConversations((items) =>
          items.filter((item) => item.id !== id),
        );
        if (activeConversationRef.current?.id === id) resetConversation();
      } catch (error) {
        if (principalKeyRef.current !== requestPrincipal) return;
        setHistoryError(
          error instanceof Error
            ? tl("{message} Lịch sử đang được đối chiếu lại.", {
                message: error.message,
              })
            : tl(
                "Chưa xác nhận được thao tác xóa. Lịch sử đang được đối chiếu lại.",
              ),
        );
        void loadConversationHistory(false);
      }
    },
    [loadConversationHistory, resetConversation],
  );

  const retryConversationSave = useCallback(async () => {
    const pendingTurn = pendingSave.current;
    if (!pendingTurn || saveResolutionAbort.current) return;
    const requestPrincipal = principalKeyRef.current;
    const requestConversationId = pendingTurn.conversationId;
    const requestEpoch = ++saveResolutionEpoch.current;
    const controller = new AbortController();
    saveResolutionAbort.current = controller;
    const isCurrent = () =>
      requestEpoch === saveResolutionEpoch.current &&
      !controller.signal.aborted &&
      principalKeyRef.current === requestPrincipal &&
      activeConversationRef.current?.id === requestConversationId;
    setConversationSaveError("");
    setConversationSaveState("saving");
    try {
      if (conversationSaveState === "unknown") {
        let response = await api.getAssistantConversationMessages(
          pendingTurn.conversationId,
          1,
          50,
          controller.signal,
        );
        if (!isCurrent()) return;
        if (response.totalPages > 2) {
          setConversationSaveState("unknown");
          setConversationSaveError(
            tl(
              "Chưa đối chiếu được lượt lưu trong giới hạn an toàn. Hãy tải lại hội thoại từ danh sách lịch sử.",
            ),
          );
          return;
        }
        let turns = response.items;
        for (let page = 2; page <= response.totalPages; page++) {
          const next = await api.getAssistantConversationMessages(
            pendingTurn.conversationId,
            page,
            50,
            controller.signal,
          );
          if (!isCurrent()) return;
          turns = [...turns, ...next.items];
          response = next;
        }
        if (!isCurrent()) return;
        setActive(response.conversation);
        if (turns.some((turn) => turn.receiptId === pendingTurn.receiptId)) {
          pendingSave.current = null;
          setConversationSaveState("saved");
          setConversationSaveError("");
        } else {
          pendingTurn.expectedVersion = response.conversation.version;
          setConversationSaveState("not_saved");
          setConversationSaveError(
            tl(
              "Lượt này chưa có trong hội thoại. Bạn có thể chủ động thử lưu lại; ExaMate sẽ không gửi lại câu hỏi cho AI.",
            ),
          );
        }
        return;
      }
      const result = await api.retrySaveAssistantTurn(
        pendingTurn.conversationId,
        {
          receiptId: pendingTurn.receiptId,
          expectedVersion: pendingTurn.expectedVersion,
          snapshot: pendingTurn.snapshot,
        },
        controller.signal,
      );
      if (!isCurrent()) return;
      setConversationSaveState(result.state);
      if (result.version !== undefined) {
        const updated = {
          ...activeConversationRef.current,
          version: result.version,
        };
        if (updated.id) setActive(updated as AssistantConversationSummary);
        pendingTurn.expectedVersion = result.version;
      }
      if (result.state === "saved") pendingSave.current = null;
      else if (result.state === "unknown")
        setConversationSaveError(
          tl(
            "Chưa xác định được kết quả lưu. Hãy mở lịch sử để đối chiếu trước khi thử lại.",
          ),
        );
    } catch {
      if (!isCurrent()) return;
      setConversationSaveState("unknown");
      setConversationSaveError(
        tl(
          "Chưa xác định được kết quả ghi. Hãy đối chiếu lịch sử trước khi thử lưu tiếp.",
        ),
      );
    } finally {
      if (saveResolutionAbort.current === controller)
        saveResolutionAbort.current = null;
    }
  }, [conversationSaveState, setActive]);

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
      resetConversation(
        tl("Bạn vừa đổi chế độ. Mình bắt đầu ngữ cảnh mới nhé."),
      );
      scope.current = undefined;
      setModeState(nextMode);
    },
    [mode, resetConversation],
  );

  useEffect(
    () => () => {
      historyAbort.current?.abort();
      historyEpoch.current++;
    },
    [],
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
    activeConversation,
    conversationSaveState,
    savedConversations,
    historyLoading,
    historyError,
    historyHasMore,
    conversationOpenState,
    conversationSaveError,
    retryConversationSave,
    loadConversationHistory,
    openConversation,
    retryOpenConversation,
    deleteConversation,
    resetConversation,
    syncContext,
    send,
    cancel,
  };
}
