import { useState } from "react";
import { StudyCoachPanel } from "./StudyCoachPanel";
import { StudyFlashcardsPanel } from "./StudyFlashcardsPanel";

type StudyCoachView = "quiz" | "flashcards";

export function StudyCoachWorkspace({ focusId }: { focusId?: string }) {
  const [view, setView] = useState<StudyCoachView>("quiz");
  const [flashcardsMounted, setFlashcardsMounted] = useState(false);

  function openFlashcards() {
    setFlashcardsMounted(true);
    setView("flashcards");
  }

  return (
    <section className="study-coach-workspace" aria-label="Study Coach">
      <nav className="study-coach-views" aria-label="Study Coach modes">
        <button
          type="button"
          aria-pressed={view === "quiz"}
          onClick={() => setView("quiz")}
        >
          Quiz
        </button>
        <button
          type="button"
          aria-pressed={view === "flashcards"}
          onClick={openFlashcards}
        >
          Flashcards
        </button>
      </nav>
      <div className="study-coach-view-panel" hidden={view !== "quiz"}>
        <StudyCoachPanel focusId={focusId} />
      </div>
      {flashcardsMounted && (
        <div className="study-coach-view-panel" hidden={view !== "flashcards"}>
          <StudyFlashcardsPanel />
        </div>
      )}
    </section>
  );
}
