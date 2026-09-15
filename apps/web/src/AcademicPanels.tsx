import { useState, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  ViewColumnsIcon,
  DocumentTextIcon,
  PlusIcon,
  TableCellsIcon,
  BookOpenIcon,
  ArrowUpRightIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { courseIconFor } from "./academic-data";
import type { Course } from "./api";
import { revealClass, useReveal } from "./use-reveal";

export function Panel({
  title,
  icon,
  warm,
  children,
}: {
  title: string;
  icon: ReactNode;
  warm?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2 className={`section-title ${warm ? "warm" : ""}`}>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
export function CalendarPanel() {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = (month.getDay() + 6) % 7;
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const today = new Date();
  const shift = (offset: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  return (
    <Panel title="This week's schedule" icon={<CalendarDaysIcon />}>
      <p className="view-label">
        <CalendarDaysIcon /> Calendar view{" "}
        <span className="example-label">Example schedule</span>
      </p>
      <header className="calendar-toolbar">
        <strong>
          {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
        </strong>
        <span className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </button>
          <button
            onClick={() =>
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Today
          </button>
          <button aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRightIcon />
          </button>
        </span>
      </header>
      <table className="calendar">
        <caption className="sr-only">
          Example academic schedule for{" "}
          {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
        </caption>
        <thead>
          <tr>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <th scope="col" key={day}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((first + count) / 7) }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, day) => {
                const date = week * 7 + day - first + 1;
                const valid = date > 0 && date <= count;
                const isToday =
                  valid &&
                  today.getDate() === date &&
                  today.getMonth() === month.getMonth() &&
                  today.getFullYear() === month.getFullYear();
                return (
                  <td key={day} className={valid ? "" : "outside-month"}>
                    {valid && (
                      <>
                        <span
                          className={isToday ? "current-day" : "day-number"}
                          aria-current={isToday ? "date" : undefined}
                        >
                          {date}
                        </span>
                        {day === 1 && date < 25 && (
                          <span className="calendar-event sage">
                            Computer S.
                          </span>
                        )}
                        {day === 3 && date < 22 && (
                          <span className="calendar-event sand">
                            Study group
                          </span>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
export function CoursesPanel({
  courses,
  expanded = false,
}: {
  courses: Course[];
  expanded?: boolean;
}) {
  const { ref, revealed } = useReveal<HTMLUListElement>();
  return (
    <Panel title="Course overview" icon={<AcademicCapIcon />}>
      <p className="view-label">
        <TableCellsIcon /> Gallery{" "}
        <span className="example-label">Example courses</span>
      </p>
      <ul
        ref={ref}
        className={`course-grid grid grid-cols-2 lg:grid-cols-4 gap-3 ${revealClass(revealed)}`}
      >
        {courses.map((course) => {
          const Icon = courseIconFor(course.slug);
          return (
            <li key={course.code}>
              <article className="course-card">
                <span className={`course-art ${course.tone}`}>
                  <Icon aria-hidden="true" />
                </span>
                <header>
                  <h3>
                    <a
                      className="course-card-link"
                      href={`#courses/${course.slug}`}
                    >
                      {course.name}
                    </a>
                  </h3>
                  <p>
                    <BookOpenIcon /> {course.code} · Class
                  </p>
                </header>
                {expanded && <p className="course-detail">{course.detail}</p>}
                <footer>
                  <p className="course-progress-label">
                    Progress <span>{course.progress}%</span>
                  </p>
                  <progress
                    aria-label={`${course.name} example progress: ${course.progress}%`}
                    value={course.progress}
                    max={100}
                  >
                    {course.progress}%
                  </progress>
                  <span className="course-card-action">
                    View course <ArrowUpRightIcon aria-hidden="true" />
                  </span>
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
interface Note {
  id: string;
  text: string;
  /** Index into the five sticky colours; stored so deleting never reshuffles them. */
  tone: number;
}

const NOTE_LIMIT = 6;
const NOTE_TONES = 5;
const UNDO_MS = 8000;

function noteId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reads whatever is in storage, including the older string[] format that
 * earlier builds wrote, so an existing user does not lose their notes.
 */
function loadNotes(): Note[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("examate-notes") || "null",
    );
    if (Array.isArray(saved)) {
      const restored = saved
        .map((item, index): Note | null => {
          if (typeof item === "string")
            return { id: noteId(), text: item, tone: index % NOTE_TONES };
          if (
            item &&
            typeof item === "object" &&
            typeof (item as Note).text === "string"
          ) {
            const note = item as Partial<Note>;
            return {
              id: typeof note.id === "string" ? note.id : noteId(),
              text: note.text as string,
              tone:
                typeof note.tone === "number"
                  ? note.tone % NOTE_TONES
                  : index % NOTE_TONES,
            };
          }
          return null;
        })
        .filter((note): note is Note => note !== null);
      if (restored.length) return restored.slice(0, NOTE_LIMIT);
    }
  } catch {
    /* Storage may be unavailable or hold something we cannot read. */
  }
  return [
    "Đi chậm một chút\ncũng không sao.",
    "Xem lại hợp đồng\nAPI trước buổi họp",
    "Giữ nguồn tài liệu\nở gần tay.",
    "Mỗi lần một việc\nthôi nhé.",
    "Bạn làm được mà!",
  ].map((text, index) => ({ id: noteId(), text, tone: index % NOTE_TONES }));
}

/** A note lifted out of the list, kept just long enough to be put back. */
interface RemovedNote {
  note: Note;
  index: number;
}

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [warning, setWarning] = useState("");
  const [removed, setRemoved] = useState<RemovedNote | null>(null);

  function save(next: Note[]) {
    setNotes(next);
    try {
      localStorage.setItem("examate-notes", JSON.stringify(next));
    } catch {
      setWarning("Ghi chú sẽ chỉ còn đến khi bạn đóng trang này thôi.");
    }
  }

  // Deleting is destructive, so the note is held aside and can be put back
  // rather than hidden behind a confirmation dialog for one line of text.
  function remove(index: number) {
    const note = notes[index];
    if (!note) return;
    save(notes.filter((_, i) => i !== index));
    setRemoved({ note, index });
    window.setTimeout(
      () =>
        setRemoved((current) =>
          current?.note.id === note.id ? null : current,
        ),
      UNDO_MS,
    );
  }

  function undo() {
    if (!removed) return;
    const next = [...notes];
    next.splice(Math.min(removed.index, next.length), 0, removed.note);
    save(next.slice(0, NOTE_LIMIT));
    setRemoved(null);
  }

  return (
    <Panel title="Quick notes" warm icon={<DocumentTextIcon />}>
      <p className="view-label">
        <TableCellsIcon /> Stickies{" "}
        <span className="example-label">Saved on this browser</span>
      </p>
      <ul className="notes-grid grid grid-cols-3 gap-2">
        {notes.map((note, index) => {
          const preview = note.text.trim().split("\n")[0].slice(0, 30);
          return (
            <li key={note.id} className={`sticky sticky-${note.tone}`}>
              <textarea
                aria-label={`Quick note ${index + 1}`}
                maxLength={180}
                value={note.text}
                onChange={(event) =>
                  save(
                    notes.map((item, i) =>
                      i === index
                        ? { ...item, text: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="sticky-remove"
                aria-label={
                  preview
                    ? `Delete note ${index + 1}: ${preview}`
                    : `Delete empty note ${index + 1}`
                }
                onClick={() => remove(index)}
              >
                <TrashIcon aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="notes-actions">
        <button
          className="text-button"
          type="button"
          disabled={notes.length >= NOTE_LIMIT}
          onClick={() =>
            save([
              ...notes,
              { id: noteId(), text: "", tone: notes.length % NOTE_TONES },
            ])
          }
        >
          <PlusIcon /> Add note
        </button>
      </p>
      <p role="status" className="notes-status">
        {removed ? (
          <>
            <span>Đã bỏ một tờ ghi chú.</span>
            <button className="text-button" type="button" onClick={undo}>
              <ArrowUturnLeftIcon /> Hoàn tác
            </button>
          </>
        ) : (
          warning
        )}
      </p>
    </Panel>
  );
}
