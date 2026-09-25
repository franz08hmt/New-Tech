import { useCallback, useRef, useState } from "react";

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
  /** What to show: a document name, a page title. */
  title: string;
  /** Where inside it, if the backend can say: "tr. 3", "mục 2.1". */
  locator?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: AssistantCitation[];
}

/** What the student was looking at when they asked. */
export interface AssistantContext {
  pageId: string;
  pageName: string;
}

/**
 * Sends one question and resolves with the reply.
 *
 * The app passes none today, which is what keeps the panel an honest preview:
 * without a transport nothing can be sent and no answer can appear. When the
 * backend is ready this is the one function to write.
 */
export type AskTransport = (
  question: string,
  context: AssistantContext,
) => Promise<{ text: string; citations: AssistantCitation[] }>;

export type AssistantStatus = "unavailable" | "idle" | "sending" | "error";

export interface AssistantState {
  draft: string;
  setDraft: (value: string) => void;
  messages: AssistantMessage[];
  status: AssistantStatus;
  canSend: boolean;
  send: (context: AssistantContext) => Promise<void>;
}

export function useAssistant(transport?: AskTransport): AssistantState {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>(
    transport ? "idle" : "unavailable",
  );
  // A ref, not state: a double click lands both events before React has
  // re-rendered, so a state flag would still read "not sending" on the second.
  const inFlight = useRef(false);
  const nextId = useRef(0);

  const canSend =
    Boolean(transport) && draft.trim().length > 0 && status !== "sending";

  const send = useCallback(
    async (context: AssistantContext) => {
      const question = draft.trim();
      if (!transport || !question || inFlight.current) return;
      inFlight.current = true;
      setStatus("sending");
      try {
        const reply = await transport(question, context);
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
          },
        ]);
        // Cleared only once the question has an answer. On failure the draft
        // stays exactly as typed, ready to send again.
        setDraft("");
        setStatus("idle");
      } catch {
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [draft, transport],
  );

  return { draft, setDraft, messages, status, canSend, send };
}
