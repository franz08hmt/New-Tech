import { useState } from "react";
import { StudyCoachPanel } from "./StudyCoachPanel";
import { StudyFlashcardsPanel } from "./StudyFlashcardsPanel";
import { useTr } from "./i18n";

type StudyCoachView = "quiz" | "flashcards";

export function StudyCoachWorkspace({ focusId }: { focusId?: string }) {
  const tr = useTr();
  const [view, setView] = useState<StudyCoachView>("quiz");
  const [flashcardsMounted, setFlashcardsMounted] = useState(false);

  function openFlashcards() {
    setFlashcardsMounted(true);
    setView("flashcards");
  }

  return (
    <section className="study-coach-workspace" aria-label={tr("Study Coach")}>
      <nav className="study-coach-views" aria-label={tr("Study Coach modes")}>
        <button
          type="button"
          aria-pressed={view === "quiz"}
          onClick={() => setView("quiz")}
        >
          {tr("Quiz")}
        </button>
        <button
          type="button"
          aria-pressed={view === "flashcards"}
          onClick={openFlashcards}
        >
          {tr("Flashcards")}
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
