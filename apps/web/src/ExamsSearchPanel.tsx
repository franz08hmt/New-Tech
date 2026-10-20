import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type { Exam, ExamSearchPage, ExamSearchQuery } from "./api";
import { api } from "./api";
import { Panel } from "./AcademicPanels";
import { DeleteExam, EditButton, EditExam, ExamFacts } from "./ExamsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";
import { useExams } from "./use-exams";
import { usePagedSearch } from "./use-paged-search";
import { useScopedRecord } from "./use-scoped-record";

const INITIAL_QUERY: ExamSearchQuery & { page: number; pageSize: number } = {
  q: "",
  courseId: undefined,
  fromDate: undefined,
  toDate: undefined,
  sort: "exam_date",
  direction: "asc",
  page: 1,
  pageSize: 20,
};

function isCalendarDate(value?: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validDateRange(query: ExamSearchQuery) {
  return (
    isCalendarDate(query.fromDate) &&
    isCalendarDate(query.toDate) &&
    (!query.fromDate || !query.toDate || query.fromDate <= query.toDate)
  );
}

export function ExamsSearchPanel({ focusId }: { focusId?: string }) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  return (
    <ExamsSearchPanelState
      key={identity}
      identity={identity}
      focusId={focusId}
      role={principal?.role}
    />
  );
}

function ExamsSearchPanelState({
  identity,
  focusId,
  role,
}: {
  identity: string;
  focusId?: string;
  role?: "manager" | "member" | "viewer";
}) {
  const canWrite = role === "manager" || role === "member";
  const canDelete = role === "manager";
  const courses = useCourses();
  const exams = useExams({ loadList: false });
  const load = useCallback(
    (query: ExamSearchQuery, signal: AbortSignal) =>
      api.searchExams(query, signal),
    [],
  );
  const search = usePagedSearch<
    Exam,
    ExamSearchQuery & { page: number; pageSize: number },
    ExamSearchPage
  >(identity, INITIAL_QUERY, load, {
    enabled: (query) => Boolean(identity) && validDateRange(query),
  });
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const loadById = useCallback(
    (id: string, signal: AbortSignal) => api.getExam(id, signal),
    [],
  );
  const focused = useScopedRecord<Exam>(
    identity,
    focusId,
    Boolean(search.page) && !search.loading,
    search.items.some((exam) => exam.id === focusId),
    loadById,
    focusRevision,
  );
  const rangeInvalid = !validDateRange(search.query);

  useEffect(() => {
    setNotice("");
    setEditingId(null);
  }, [identity]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const courseId = String(data.get("courseId") || "");
    const topic = String(data.get("topic") || "").trim();
    if (!courseId || topic.length < 3) return;
    if (
      await exams.create({
        courseId,
        topic,
        examDate: String(data.get("examDate") || ""),
        examTime: String(data.get("examTime") || ""),
        room: String(data.get("room") || "").trim(),
        revisionNote:
          String(data.get("revisionNote") || "").trim() || undefined,
      })
    ) {
      setNotice("Exam added. The list was refreshed from the server.");
      search.refresh();
      form.reset();
    }
  }

  async function update(
    exam: Exam,
    input: {
      topic: string;
      examDate: string;
      examTime: string;
      room: string;
      revisionNote?: string;
    },
  ) {
    if (!canWrite) return;
    if (await exams.update(exam.id, input)) {
      setEditingId(null);
      setNotice("Exam updated. The list was refreshed from the server.");
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  async function remove(exam: Exam) {
    if (!canDelete) return;
    if (await exams.remove(exam.id)) {
      setEditingId(null);
      setNotice("Exam deleted. The list was refreshed from the server.");
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  return (
    <>
      {focused.record && !focused.error && (
        <FocusedExam
          exam={focused.record}
          editing={editingId === focused.record.id}
          busy={exams.busy}
          canWrite={canWrite}
          canDelete={canDelete}
          onEdit={() => setEditingId(focused.record!.id)}
          onDelete={() => void remove(focused.record!)}
          onSave={(input) => void update(focused.record!, input)}
          onCancel={() => setEditingId(null)}
        />
      )}
      {focusId && focused.error && (
        <p role="status" className="page-note">
          This exam is not available in the current workspace.
        </p>
      )}
      <Panel title="Exam schedule" icon={<CalendarDaysIcon />}>
        {!canWrite && (
          <p className="page-note">
            You have read-only access to the exam schedule.
          </p>
        )}
        <div className="paged-search-toolbar exam-search-toolbar">
          <label className="paged-search-field">
            Search exams
            <input
              aria-label="Search exams"
              type="search"
              maxLength={120}
              value={search.query.q ?? ""}
              onChange={(event) => search.setQuery({ q: event.target.value })}
              placeholder="Topic, course or room"
            />
          </label>
          <label>
            Filter exams by course
            <select
              aria-label="Filter exams by course"
              value={search.query.courseId ?? "all"}
              onChange={(event) =>
                search.setQuery({
                  courseId:
                    event.target.value === "all"
                      ? undefined
                      : event.target.value,
                })
              }
            >
              <option value="all">All courses</option>
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input
              aria-label="Exams from date"
              type="date"
              value={search.query.fromDate ?? ""}
              onChange={(event) =>
                search.setQuery({ fromDate: event.target.value || undefined })
              }
            />
          </label>
          <label>
            To date
            <input
              aria-label="Exams to date"
              type="date"
              value={search.query.toDate ?? ""}
              onChange={(event) =>
                search.setQuery({ toDate: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Sort exams by
            <select
              aria-label="Sort exams by"
              value={search.query.sort ?? "exam_date"}
              onChange={(event) =>
                search.setQuery({
                  sort: event.target.value as ExamSearchQuery["sort"],
                })
              }
            >
              <option value="exam_date">Exam date/time</option>
              <option value="topic">Topic</option>
              <option value="course">Course</option>
            </select>
          </label>
          <label>
            Direction
            <select
              aria-label="Exam sort direction"
              value={search.query.direction ?? "asc"}
              onChange={(event) =>
                search.setQuery({
                  direction: event.target.value as "asc" | "desc",
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <label>
            Page size
            <select
              aria-label="Exams per page"
              value={search.query.pageSize}
              onChange={(event) =>
                search.setQuery({ pageSize: Number(event.target.value) })
              }
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => search.setQuery({ ...INITIAL_QUERY })}
          >
            Reset filters
          </button>
        </div>
        {courses.error && (
          <p role="alert" className="error-message">
            Course choices could not be loaded. {courses.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={courses.retry}
            >
              Retry course choices
            </button>
          </p>
        )}
        {rangeInvalid ? (
          <p role="alert" className="error-message">
            Enter valid calendar dates and make sure the start date is not after
            the end date.
          </p>
        ) : search.tooShort ? (
          <p role="status" className="page-note">
            Enter at least two characters, or clear the field to browse all
            exams.
          </p>
        ) : search.unsupported ? (
          <p role="status" className="page-note">
            This search text has no supported characters. Try another term.
          </p>
        ) : search.loading ? (
          <p role="status" aria-busy="true" className="empty-message">
            Loading exams…
          </p>
        ) : search.error ? (
          <p role="alert" className="error-message">
            {search.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={search.retry}
            >
              Retry exams
            </button>
          </p>
        ) : search.page ? (
          <p role="status" className="page-note">
            {search.page.total} exam{search.page.total === 1 ? "" : "s"} · page{" "}
            {search.page.page} of {Math.max(search.page.totalPages, 1)}
          </p>
        ) : null}
        {search.page?.total === 0 && !search.error && (
          <p role="status" className="empty-message">
            No exams match this search.
          </p>
        )}
        {search.page &&
          search.page.total > 0 &&
          !search.error &&
          !rangeInvalid && (
            <>
              {search.items.length ? (
                <ul className="exam-list" aria-label="Exam results">
                  {search.items.map((exam) => (
                    <li key={exam.id} data-focus-id={exam.id}>
                      <span className="exam-when">{exam.exam_date}</span>
                      <span className="exam-copy">
                        <strong>{exam.topic}</strong>
                        <a href={`#courses/${exam.course_slug}`}>
                          {exam.course_name}
                        </a>
                        <ExamFacts exam={exam} />
                        {exam.revision_note && (
                          <small className="exam-note">
                            {exam.revision_note}
                          </small>
                        )}
                      </span>
                      {canWrite && (
                        <span className="exam-actions">
                          <EditButton
                            exam={exam}
                            busy={exams.busy}
                            onEdit={() => setEditingId(exam.id)}
                          />
                          {canDelete && (
                            <DeleteExam
                              exam={exam}
                              busy={exams.busy}
                              onDelete={() => void remove(exam)}
                            />
                          )}
                        </span>
                      )}
                      {editingId === exam.id && (
                        <EditExam
                          exam={exam}
                          busy={exams.busy}
                          onSave={(input) => void update(exam, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-message">
                  This page has no exams. The filtered total is{" "}
                  {search.page.total}.
                </p>
              )}
              <nav className="paged-search-pagination" aria-label="Exam pages">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={search.query.page <= 1 || search.loading}
                  onClick={() => search.setPage(search.query.page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {search.page.page} of {search.page.totalPages}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    search.query.page >= search.page.totalPages ||
                    search.loading
                  }
                  onClick={() => search.setPage(search.query.page + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        {notice && <p role="status">{notice}</p>}
        {exams.error && <p role="alert">{exams.error}</p>}
        {canWrite && (
          <form
            className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
            onSubmit={(event) => void submit(event)}
          >
            <label className="sm:col-span-2">
              Course
              <select name="courseId" defaultValue="" required>
                <option value="" disabled>
                  Choose a course
                </option>
                {courses.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} ({course.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Exam name
              <input name="topic" minLength={3} maxLength={160} required />
            </label>
            <label>
              Date
              <input name="examDate" type="date" required />
            </label>
            <label>
              Time
              <input name="examTime" type="time" required />
            </label>
            <label className="sm:col-span-2">
              Room
              <input name="room" maxLength={80} required />
            </label>
            <label className="sm:col-span-2">
              Revision note
              <textarea name="revisionNote" rows={2} maxLength={500} />
            </label>
            <button
              className="primary-button"
              disabled={exams.busy || courses.loading}
            >
              <PlusIcon />
              {exams.busy ? "Saving…" : "Add exam"}
            </button>
          </form>
        )}
      </Panel>
    </>
  );
}

function FocusedExam({
  exam,
  editing,
  busy,
  canWrite,
  canDelete,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: {
  exam: Exam;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: Parameters<typeof EditExam>[0]["onSave"];
  onCancel: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [exam.id]);
  return (
    <Panel title="Linked exam" icon={<CalendarDaysIcon />}>
      <article ref={ref} tabIndex={-1} data-focus-id={exam.id}>
        <h2>{exam.topic}</h2>
        <a href={`#courses/${exam.course_slug}`}>
          {exam.course_name} ({exam.course_code})
        </a>
        <ExamFacts exam={exam} />
        {exam.revision_note && (
          <p className="exam-note">{exam.revision_note}</p>
        )}
        {canWrite && (
          <span className="exam-actions">
            <EditButton exam={exam} busy={busy} onEdit={onEdit} />
            {canDelete && (
              <DeleteExam exam={exam} busy={busy} onDelete={onDelete} />
            )}
          </span>
        )}
        {editing && (
          <EditExam
            exam={exam}
            busy={busy}
            onSave={onSave}
            onCancel={onCancel}
          />
        )}
      </article>
      <p className="page-note">
        This linked exam is separate from the current filtered page. Adjust or
        reset the filters to include it in the result list; totals remain
        unchanged.
      </p>
    </Panel>
  );
}
