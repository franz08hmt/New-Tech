import {
  BookOpenIcon,
  DocumentMagnifyingGlassIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";

interface AssistantPanelProps {
  pageId: string;
  pageName: string;
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

export function AssistantPanel({
  pageId,
  pageName,
  onClose,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const prompts = promptsByPage[pageId] ?? fallbackPrompts;

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  return (
    <aside
      id="examate-ai-panel"
      className="assistant-panel"
      aria-label="ExaMate AI"
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
          ref={closeButton}
          type="button"
          aria-label="Close ExaMate AI"
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <section className="assistant-intro" aria-labelledby="assistant-title">
        <span className="preview-badge">Interface preview</span>
        <h2 id="assistant-title">Ask with your sources in view</h2>
        <p>
          This panel demonstrates the planned experience. Retrieval and the AI
          provider are not connected yet.
        </p>
      </section>

      <section
        className="assistant-suggestions"
        aria-labelledby="suggestions-title"
      >
        <h3 id="suggestions-title">Try asking</h3>
        <ul>
          {prompts.map((prompt) => (
            <li key={prompt}>
              <button type="button" onClick={() => setDraft(prompt)}>
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="assistant-composer"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="assistant-question">Question for ExaMate</label>
        <textarea
          id="assistant-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about your course or project sources…"
        />
        <button type="submit" disabled>
          <PaperAirplaneIcon aria-hidden="true" />
          Ask when RAG is ready
        </button>
      </form>

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
          Homework 3A asks for navigation, essential screens, a validated form,
          visible UI states and a responsive layout.
        </p>
        <footer>
          <BookOpenIcon aria-hidden="true" />
          <span>
            <strong>Week 3 course guide · p. 5</strong>
            <small>Example citation · not retrieved live</small>
          </span>
        </footer>
      </section>
    </aside>
  );
}
