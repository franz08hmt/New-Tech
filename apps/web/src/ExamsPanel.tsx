import { useState, type FormEvent } from "react";
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "./AcademicPanels";
import { useCourses } from "./use-courses";
import { countdownLabel, daysUntil, useExams } from "./use-exams";
import { revealClass, useReveal } from "./use-reveal";
import type { Exam } from "./api";

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** Shared by the featured card and each row, so the wording never diverges. */
function ExamFacts({ exam }: { exam: Exam }) {
  return (
    <p className="exam-facts">
      <span>
        <ClockIcon aria-hidden="true" />
        <time dateTime={`${exam.exam_date}T${exam.exam_time}`}>
          {formatDate(exam.exam_date)} · {exam.exam_time}
        </time>
      </span>
      <span>
        <MapPinIcon aria-hidden="true" />
        {exam.room}
      </span>
    </p>
  );
}

function DeleteExam({
  exam,
  busy,
  onDelete,
}: {
  exam: Exam;
  busy: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // Removing an exam loses a date, a room and a revision note, so the action
  // asks once in place rather than firing on the first click.
  if (!confirming) {
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={`Delete exam: ${exam.topic}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="exam-confirm">
      <span>Xoá kỳ thi này?</span>
      <button
        type="button"
        className="exam-confirm-yes"
        disabled={busy}
        onClick={onDelete}
      >
        Xoá
      </button>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Giữ lại
      </button>
    </span>
  );
}

/**
 * Inline editor for one exam.
 *
 * Pre-filled with what is stored and submits every field, matching the API,
 * which replaces an exam's details rather than patching them: with a form this
 * small, "left blank" would be ambiguous between "unchanged" and "cleared".
 */
function EditButton({
  exam,
  busy,
  onEdit,
}: {
  exam: Exam;
  busy: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      className="exam-remove"
      aria-label={`Edit exam: ${exam.topic}`}
      disabled={busy}
      onClick={onEdit}
    >
      <PencilSquareIcon aria-hidden="true" />
    </button>
  );
}

function EditExam({
  exam,
  busy,
  onSave,
  onCancel,
}: {
  exam: Exam;
  busy: boolean;
  onSave: (input: {
    topic: string;
    examDate: string;
    examTime: string;
    room: string;
    revisionNote?: string;
  }) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      topic: String(data.get("topic") || "").trim(),
      examDate: String(data.get("examDate") || ""),
      examTime: String(data.get("examTime") || ""),
      room: String(data.get("room") || "").trim(),
      revisionNote: String(data.get("revisionNote") || "").trim() || undefined,
    });
  }
  return (
    <form
      className="exam-edit exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
      aria-label={`Edit exam: ${exam.topic}`}
      onSubmit={submit}
    >
      <label className="sm:col-span-2">
        Exam name
        <input
          name="topic"
          defaultValue={exam.topic}
          minLength={3}
          maxLength={160}
          required
        />
      </label>
      <label>
        Date
        <input
          name="examDate"
          type="date"
          defaultValue={exam.exam_date}
          required
        />
      </label>
      <label>
        Time
        <input
          name="examTime"
          type="time"
          defaultValue={exam.exam_time}
          required
        />
      </label>
      <label className="sm:col-span-2">
        Room
        <input name="room" defaultValue={exam.room} maxLength={80} required />
      </label>
      <label className="sm:col-span-2">
        Revision note
        <textarea
          name="revisionNote"
          rows={2}
          maxLength={500}
          defaultValue={exam.revision_note ?? ""}
        />
      </label>
      <span className="exam-edit-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? "Đang lưu…" : "Save changes"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onCancel}
        >
          Huỷ
        </button>
      </span>
    </form>
  );
}

export function ExamsPanel({ compact = false }: { compact?: boolean }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const exams = useExams();
  const courses = useCourses();
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const today = new Date();
  // A past exam is still useful when revising, but it must never sit among the
  // ones still to come.
  const upcoming = exams.exams.filter(
    (exam) => daysUntil(exam.exam_date, today) >= 0,
  );
  const past = exams.exams.filter(
    (exam) => daysUntil(exam.exam_date, today) < 0,
  );
  const [next, ...laterExams] = upcoming;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const courseId = String(data.get("courseId") || "");
    const topic = String(data.get("topic") || "").trim();
    if (!courseId) {
      setNotice("Chọn giúp mình môn học của kỳ thi này nhé.");
      return;
    }
    if (topic.length < 3) {
      setNotice("Tên kỳ thi cần ít nhất ba ký tự.");
      return;
    }
    const ok = await exams.create({
      courseId,
      topic,
      examDate: String(data.get("examDate") || ""),
      examTime: String(data.get("examTime") || ""),
      room: String(data.get("room") || "").trim(),
      revisionNote: String(data.get("revisionNote") || "").trim() || undefined,
    });
    if (ok) {
      form.reset();
      setNotice("Đã thêm kỳ thi vào lịch.");
    }
  }

  async function save(
    exam: Exam,
    input: {
      topic: string;
      examDate: string;
      examTime: string;
      room: string;
      revisionNote?: string;
    },
  ) {
    const ok = await exams.update(exam.id, input);
    if (ok) {
      setEditingId(null);
      setNotice("Đã lưu thay đổi cho kỳ thi.");
    }
  }

  async function remove(exam: Exam) {
    const ok = await exams.remove(exam.id);
    if (ok) setNotice("Đã xoá kỳ thi khỏi lịch.");
  }

  if (exams.loading) {
    return (
      <Panel title="Upcoming exams" icon={<CalendarDaysIcon />}>
        <p role="status" className="empty-message">
          Đang xem lại lịch thi…
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Upcoming exams" icon={<CalendarDaysIcon />}>
      <p className="view-label">
        <ClockIcon /> Countdown
        <span>
          {upcoming.length} sắp tới · {past.length} đã qua
        </span>
      </p>

      {exams.error && (
        <p role="alert" className="error-message">
          {exams.error}
          <button className="text-button" type="button" onClick={exams.reload}>
            <ArrowPathIcon /> Retry exams
          </button>
        </p>
      )}

      <div ref={ref} className={revealClass(revealed)}>
        {next ? (
          <article className="exam-next">
            <p className="exam-countdown">
              {countdownLabel(daysUntil(next.exam_date, today))}
            </p>
            <h3>{next.topic}</h3>
            <p className="exam-course">
              <a href={`#courses/${next.course_slug}`}>
                {next.course_name} <ArrowUpRightIcon aria-hidden="true" />
              </a>
              <small>{next.course_code}</small>
            </p>
            <ExamFacts exam={next} />
            {next.revision_note && (
              <p className="exam-note">{next.revision_note}</p>
            )}
            {!compact && (
              <span className="exam-actions">
                <EditButton
                  exam={next}
                  busy={exams.busy}
                  onEdit={() => setEditingId(next.id)}
                />
                {/* Keyed by the exam itself: without this, deleting the
                    featured exam would leave the next one mounted with the
                    previous component's open confirmation, primed to delete
                    on one click. */}
                <DeleteExam
                  key={next.id}
                  exam={next}
                  busy={exams.busy}
                  onDelete={() => void remove(next)}
                />
              </span>
            )}
            {editingId === next.id && (
              <EditExam
                exam={next}
                busy={exams.busy}
                onSave={(input) => void save(next, input)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </article>
        ) : (
          !exams.error && (
            <p className="empty-message">
              Chưa có kỳ thi nào sắp tới. Tận hưởng khoảng lặng này một chút
              nhé.
            </p>
          )
        )}

        {laterExams.length > 0 && (
          <section aria-labelledby="exams-later">
            <h3 id="exams-later" className="exam-group">
              Những kỳ thi sau đó
            </h3>
            <ul className="exam-list">
              {(compact ? laterExams.slice(0, 2) : laterExams).map((exam) => (
                <li key={exam.id}>
                  <span className="exam-when">
                    {countdownLabel(daysUntil(exam.exam_date, today))}
                  </span>
                  <span className="exam-copy">
                    <strong>{exam.topic}</strong>
                    <a href={`#courses/${exam.course_slug}`}>
                      {exam.course_name}
                    </a>
                    <ExamFacts exam={exam} />
                    {!compact && exam.revision_note && (
                      <small className="exam-note">{exam.revision_note}</small>
                    )}
                  </span>
                  {!compact && (
                    <span className="exam-actions">
                      <EditButton
                        exam={exam}
                        busy={exams.busy}
                        onEdit={() => setEditingId(exam.id)}
                      />
                      <DeleteExam
                        exam={exam}
                        busy={exams.busy}
                        onDelete={() => void remove(exam)}
                      />
                    </span>
                  )}
                  {editingId === exam.id && (
                    <EditExam
                      exam={exam}
                      busy={exams.busy}
                      onSave={(input) => void save(exam, input)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!compact && past.length > 0 && (
          <section aria-labelledby="exams-past">
            <h3 id="exams-past" className="exam-group">
              Đã qua
            </h3>
            <ul className="exam-list is-past">
              {past.map((exam) => (
                <li key={exam.id}>
                  <span className="exam-when">
                    {countdownLabel(daysUntil(exam.exam_date, today))}
                  </span>
                  <span className="exam-copy">
                    <strong>{exam.topic}</strong>
                    <a href={`#courses/${exam.course_slug}`}>
                      {exam.course_name}
                    </a>
                    <ExamFacts exam={exam} />
                  </span>
                  <DeleteExam
                    exam={exam}
                    busy={exams.busy}
                    onDelete={() => void remove(exam)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {compact ? (
        <a className="text-button" href="#exams">
          <PlusIcon /> Add or view exams
        </a>
      ) : (
        <form
          className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="sm:col-span-2">
            Course
            <select name="courseId" defaultValue="" required>
              <option value="" disabled>
                Chọn môn học
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
            <input
              name="topic"
              placeholder="Ví dụ: Kiểm tra giữa kỳ"
              minLength={3}
              maxLength={160}
              required
            />
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
            <input
              name="room"
              placeholder="Ví dụ: Phòng A201"
              maxLength={80}
              required
            />
          </label>
          <label className="sm:col-span-2">
            Revision note
            <textarea
              name="revisionNote"
              rows={2}
              maxLength={500}
              placeholder="Cần ôn lại những gì trước ngày thi?"
            />
          </label>
          <button className="primary-button" disabled={exams.busy}>
            <PlusIcon />
            {exams.busy ? "Đang lưu…" : "Add exam"}
          </button>
          <p role="status">{notice}</p>
        </form>
      )}
    </Panel>
  );
}
