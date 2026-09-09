import { useState, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  ViewColumnsIcon,
  DocumentTextIcon,
  PlusIcon,
  ClockIcon,
  TableCellsIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { courses, exams, research } from "./academic-data";

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
export function CoursesPanel({ expanded = false }: { expanded?: boolean }) {
  return (
    <Panel title="Course overview" icon={<AcademicCapIcon />}>
      <p className="view-label">
        <TableCellsIcon /> Gallery{" "}
        <span className="example-label">Example courses</span>
      </p>
      <ul className="course-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
        {courses.map((course) => (
          <li key={course.code}>
            <article className="course-card">
              <span className={`course-art ${course.tone}`}>
                <course.icon aria-hidden="true" />
              </span>
              <header>
                <h3>{course.name}</h3>
                <p>
                  <BookOpenIcon /> {course.code} · Class
                </p>
              </header>
              {expanded && <p className="course-detail">{course.detail}</p>}
              <footer>
                <label htmlFor={course.code}>
                  Progress <span>{course.progress}%</span>
                </label>
                <progress id={course.code} value={course.progress} max={100}>
                  {course.progress}%
                </progress>
              </footer>
            </article>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
export function ExamsPanel() {
  return (
    <Panel title="Upcoming exams" icon={<CalendarDaysIcon />}>
      <p className="view-label">
        <ClockIcon /> Countdown{" "}
        <span className="example-label">Example dates</span>
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Exam schedule"
        tabIndex={0}
      >
        <table className="exam-table">
          <caption className="sr-only">
            Upcoming example examinations, dates and locations
          </caption>
          <thead>
            <tr>
              <th scope="col">Aa Name</th>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
              <th scope="col">Location</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.name}>
                <th scope="row">
                  {exam.name}
                  <small>{exam.topic}</small>
                </th>
                <td>
                  <time dateTime={exam.date} className="date-tag">
                    {new Date(`${exam.date}T12:00:00`).toLocaleDateString(
                      "en",
                      { month: "short", day: "numeric" },
                    )}
                  </time>
                </td>
                <td>{exam.time}</td>
                <td>{exam.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
export function ResearchPanel() {
  return (
    <Panel title="Research projects" icon={<BookOpenIcon />}>
      <p className="view-label">
        <ViewColumnsIcon /> Board{" "}
        <span className="example-label">Planning examples</span>
      </p>
      <ul className="research-grid grid grid-cols-1 sm:grid-cols-3 gap-3">
        {research.map((item) => (
          <li key={item.title} className="board-column">
            <h3>
              <span className={`board-tag ${item.tone}`}>{item.status}</span>
              <span>1</span>
            </h3>
            <article className="research-card">
              <h4>{item.title}</h4>
              <p>{item.detail}</p>
              <footer>
                <span className="avatar">{item.owner.slice(0, 1)}</span>
                {item.owner}
              </footer>
            </article>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
export function NotesPanel() {
  const [notes, setNotes] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("coursemate-notes") || "null",
      );
      if (
        Array.isArray(saved) &&
        saved.every((item) => typeof item === "string")
      )
        return saved.slice(0, 6);
    } catch {
      /* Storage may be unavailable. */
    }
    return [
      "Small steps,\nbig progress.",
      "Review the\nAPI contract",
      "Keep your\nsources close.",
      "One thing\nat a time.",
      "You’ve got this!",
    ];
  });
  const [warning, setWarning] = useState("");
  function save(next: string[]) {
    setNotes(next);
    try {
      localStorage.setItem("coursemate-notes", JSON.stringify(next));
    } catch {
      setWarning("Notes are kept only until this page is closed.");
    }
  }
  return (
    <Panel title="Quick notes" warm icon={<DocumentTextIcon />}>
      <p className="view-label">
        <TableCellsIcon /> Stickies{" "}
        <span className="example-label">Saved on this browser</span>
      </p>
      <ul className="notes-grid grid grid-cols-3 gap-2">
        {notes.map((note, index) => (
          <li key={index} className={`sticky sticky-${index % 5}`}>
            <textarea
              aria-label={`Quick note ${index + 1}`}
              maxLength={180}
              value={note}
              onChange={(event) =>
                save(
                  notes.map((item, i) =>
                    i === index ? event.target.value : item,
                  ),
                )
              }
            />
          </li>
        ))}
      </ul>
      <button
        className="text-button"
        disabled={notes.length >= 6}
        onClick={() => save([...notes, ""])}
      >
        <PlusIcon /> Add note
      </button>
      {warning && <p role="status">{warning}</p>}
    </Panel>
  );
}
