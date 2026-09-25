import {
  BookOpenIcon,
  DocumentMagnifyingGlassIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import type { AssistantState } from "./use-assistant";

interface AssistantPanelProps {
  open: boolean;
  /** Narrow screens show a modal sheet; wider ones a floating window. */
  modal: boolean;
  pageId: string;
  pageName: string;
  assistant: AssistantState;
  onClose: () => void;
}

const promptsByPage: Record<string, string[]> = {
  dashboard: [
    "What should I focus on today?",
    "Summarize our current project progress.",
  ],
  tasks: [
    "Which tasks still need evidence?",
    "Help us choose the next project task.",
  ],
  documents: [
    "What evidence is required for the final project?",
    "Summarize an approved document.",
  ],
  courses: [
    "Create a review plan for this course.",
    "Which concepts should I revisit first?",
  ],
};

const fallbackPrompts = [
  "Summarize this workspace section.",
  "What should I review next?",
];

/**
 * The ExaMate AI window.
 *
 * Presentational and always mounted: App owns whether it is open and the
 * conversation it shows. Closing sets `hidden`, which takes it out of the tab
 * order and the accessibility tree, instead of unmounting it — so nothing the
 * student typed goes with it.
 */
export function AssistantPanel({
  open,
  modal,
  pageId,
  pageName,
  assistant,
  onClose,
}: AssistantPanelProps) {
  const composer = useRef<HTMLTextAreaElement>(null);
  const prompts = promptsByPage[pageId] ?? fallbackPrompts;
  const preview = assistant.status === "unavailable";

  // Opening lands in the composer: typing a question is what the launcher is
  // for. Keyed on `open` alone, so switching page behind an open panel does
  // not steal focus back into it.
  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open]);

  return (
    <aside
      id="examate-ai-panel"
      className={`assistant-panel ${modal ? "is-sheet" : "is-window"}`}
      aria-label="ExaMate AI"
      // An aside is complementary content beside the page. As a sheet that
      // covers the page and holds focus, it is a modal dialog, and says so.
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      hidden={!open}
    >
      <header className="assistant-panel-header">
        <span className="assistant-mark" aria-hidden="true">
          <SparklesIcon />
        </span>
        <span>
          <strong>ExaMate AI</strong>
          <small>{pageName} context</small>
        </span>
        <button
          type="button"
          aria-label="Close ExaMate AI"
          title="Thu gọn — bản nháp vẫn được giữ"
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <div className="assistant-body">
        {preview && (
          <section
            className="assistant-intro"
            aria-labelledby="assistant-title"
          >
            <span className="preview-badge">Interface preview</span>
            <h2 id="assistant-title">Ask with your sources in view</h2>
            <p>
              Phần AI đang được Thắng kết nối. Bạn có thể chuẩn bị câu hỏi,
              nhưng chưa gửi để nhận trả lời được.
            </p>
          </section>
        )}

        {assistant.messages.length > 0 && (
          <ol className="assistant-messages" aria-label="Conversation">
            {assistant.messages.map((message) => (
              <li key={message.id} className={`is-${message.role}`}>
                {/* Rendered as text, never as HTML: a model's output is not
                    trusted markup. */}
                <p>{message.text}</p>
                {message.citations.length > 0 && (
                  <ul className="assistant-citations" aria-label="Sources">
                    {message.citations.map((citation) => (
                      <li key={`${citation.title}-${citation.locator ?? ""}`}>
                        <BookOpenIcon aria-hidden="true" />
                        {citation.title}
                        {citation.locator && ` · ${citation.locator}`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}

        <section
          className="assistant-suggestions"
          aria-labelledby="suggestions-title"
        >
          <h3 id="suggestions-title">Try asking</h3>
          <ul>
            {prompts.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => assistant.setDraft(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {preview && (
          <section
            className="assistant-answer-preview"
            aria-labelledby="answer-preview-title"
          >
            <header>
              <DocumentMagnifyingGlassIcon aria-hidden="true" />
              <span>
                <small>Example grounded answer</small>
                <h3 id="answer-preview-title">Evidence stays checkable</h3>
              </span>
            </header>
            <p>
              Homework 3A asks for navigation, essential screens, a validated
              form, visible UI states and a responsive layout.
            </p>
            <footer>
              <BookOpenIcon aria-hidden="true" />
              <span>
                <strong>Week 3 course guide · p. 5</strong>
                <small>Example citation · not retrieved live</small>
              </span>
            </footer>
          </section>
        )}
      </div>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void assistant.send({ pageId, pageName });
        }}
      >
        <label htmlFor="assistant-question">Question for ExaMate</label>
        <textarea
          id="assistant-question"
          ref={composer}
          value={assistant.draft}
          onChange={(event) => assistant.setDraft(event.target.value)}
          placeholder="Ask about your course or project sources…"
        />
        {/* A small status line of its own, announced when it changes. The
            conversation above is not a live region, so a new reply does not
            make a screen reader read the whole history again. */}
        {assistant.status === "error" ? (
          <p role="alert" className="assistant-status">
            Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé.
          </p>
        ) : (
          <p role="status" className="assistant-status">
            {assistant.status === "sending" ? "Đang gửi câu hỏi…" : ""}
          </p>
        )}
        <button type="submit" disabled={!assistant.canSend}>
          <PaperAirplaneIcon aria-hidden="true" />
          Send question
        </button>
      </form>
    </aside>
  );
}
