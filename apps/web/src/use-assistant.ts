import { useCallback, useRef, useState } from "react";
import type {
  AssistantMetadataSource,
  AssistantMode,
  AssistantOperation,
  AssistantWorkspaceSource,
  AssistantChatResponse,
  AssistantFeedbackSnapshot,
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
) => Promise<{
  text: string;
  citations: AssistantCitation[];
  metadataSource?: AssistantMetadataSource;
  workspaceSources?: AssistantWorkspaceSource[];
  response?: AssistantChatResponse;
}>;

export type AssistantStatus = "unavailable" | "idle" | "sending" | "error";

export interface AssistantState {
  draft: string;
  setDraft: (value: string) => void;
  messages: AssistantMessage[];
  status: AssistantStatus;
  errorMessage: string;
  canSend: boolean;
  mode: AssistantMode;
  setMode: (mode: AssistantMode) => void;
  send: (
    context: AssistantContext,
    options?: { operation?: AssistantOperation; message?: string },
  ) => Promise<void>;
}

export function useAssistant(transport?: AskTransport): AssistantState {
  const [draft, setDraft] = useState("");
  const [mode, setModeState] = useState<AssistantMode>("documents");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>(
    transport ? "idle" : "unavailable",
  );
  const [errorMessage, setErrorMessage] = useState("");
  // A ref, not state: a double click lands both events before React has
  // re-rendered, so a state flag would still read "not sending" on the second.
  const inFlight = useRef(false);
  const nextId = useRef(0);

  const canSend =
    Boolean(transport) && draft.trim().length > 0 && status !== "sending";

  const send = useCallback(
    async (
      context: AssistantContext,
      options?: { operation?: AssistantOperation; message?: string },
    ) => {
      const question = (options?.message ?? draft).trim();
      if (!transport || !question || inFlight.current) return;
      inFlight.current = true;
      const requestMode = mode;
      const requestOperation = options?.operation ?? "question";
      const requestContext = { ...context };
      setStatus("sending");
      setErrorMessage("");
      try {
        const reply = await transport(
          question,
          requestContext,
          requestMode,
          requestOperation,
        );
        const feedback = reply.response
          ? {
              answerId: crypto.randomUUID(),
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
        nextId.current += 2;
        setMessages((current) => [
          ...current,
          {
            id: `m${nextId.current - 1}`,
            role: "user",
            text: question,
            citations: [],
          },
          {
            id: `m${nextId.current}`,
            role: "assistant",
            text: reply.text,
            citations: reply.citations,
            ...(feedback ? { feedback } : {}),
            ...(reply.metadataSource
              ? { metadataSource: reply.metadataSource }
              : {}),
            ...(reply.workspaceSources
              ? { workspaceSources: reply.workspaceSources }
              : {}),
          },
        ]);
        // Cleared only once the question has an answer. On failure the draft
        // stays exactly as typed, ready to send again.
        if (options?.message === undefined) setDraft("");
        setStatus("idle");
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé.",
        );
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [draft, mode, transport],
  );

  const setMode = useCallback((nextMode: AssistantMode) => {
    if (!inFlight.current) setModeState(nextMode);
  }, []);

  return {
    draft,
    setDraft,
    messages,
    status,
    errorMessage,
    canSend,
    mode,
    setMode,
    send,
  };
}
