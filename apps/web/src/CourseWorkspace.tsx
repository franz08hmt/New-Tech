import { useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { countdownLabel, daysUntil, useExams } from "./use-exams";
import { useStudyPlans } from "./use-study-plans";
import { CATEGORY_LABELS, useExpenses } from "./use-expenses";
import { useDocuments } from "./use-documents";
import type { Course, ExpenseCategory } from "./api";

const money = new Intl.NumberFormat("vi-VN");

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** A two-step delete, shared by every block below. */
function RemoveButton({
  label,
  busy,
  onDelete,
}: {
  label: string;
  busy: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={label}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="exam-confirm">
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
        Giữ
      </button>
    </span>
  );
}

function Block({
  title,
  icon,
  summary,
  loading,
  children,
}: {
  title: string;
  icon: ReactNode;
  summary: string;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <section className="cw-block" aria-label={title}>
      <h3>
        {icon}
        {title}
        {/* No count until there is one to give: "0 sắp tới" while the request
            is still in flight is a wrong answer, not a placeholder. */}
        <span>{loading ? "…" : summary}</span>
      </h3>
      {loading ? (
        <p role="status" className="empty-message">
          Đang tải…
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Everything the workspace holds for one subject, in one place.
 *
 * Each block reuses the list hook that already backs its own page rather than
 * calling a new per-course endpoint. At this size the whole table is a few
 * dozen rows, and one source of truth per entity means an item added here and
 * an item added on its own page cannot disagree.
 */
export function CourseWorkspace({ course }: { course: Course }) {
  const exams = useExams();
  const plans = useStudyPlans();
  const expenses = useExpenses();
  const documents = useDocuments();
  const [notice, setNotice] = useState("");
  const today = new Date();

  const courseExams = exams.exams
    .filter((exam) => exam.course_id === course.id)
    .filter((exam) => daysUntil(exam.exam_date, today) >= 0);
  const coursePlans = plans.plans.filter(
    (plan) => plan.course_id === course.id,
  );
  const planRemaining = coursePlans.filter((plan) => !plan.completed_at).length;
  const courseExpenses = expenses.expenses.filter(
    (item) => item.course_id === course.id,
  );
  const spent = courseExpenses.reduce((sum, item) => sum + item.amount, 0);
  const courseDocuments = documents.documents.filter(
    (item) => item.course_id === course.id,
  );

  /**
   * Keeps the status line honest: a delete must not leave the message from the
   * last add standing, claiming something that is no longer what just happened.
   */
  async function removeAnd(
    action: Promise<boolean>,
    what: string,
    verb = "đã được xoá",
  ) {
    setNotice("");
    const ok = await action;
    if (ok) setNotice(`${what} ${verb}.`);
  }

  async function addExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await exams.create({
      courseId: course.id,
      topic: String(data.get("topic") || "").trim(),
      examDate: String(data.get("examDate") || ""),
      examTime: String(data.get("examTime") || ""),
      room: String(data.get("room") || "").trim(),
    });
    if (ok) {
      form.reset();
      setNotice("Đã thêm kỳ thi cho môn này.");
    }
  }

  async function addPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await plans.create({
      courseId: course.id,
      title: String(data.get("title") || "").trim(),
      dueDate: String(data.get("dueDate") || "") || undefined,
    });
    if (ok) {
      form.reset();
      setNotice("Đã thêm việc cần ôn.");
    }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice("Số tiền cần là một số nguyên dương.");
      return;
    }
    const ok = await expenses.create({
      courseId: course.id,
      amount,
      description: String(data.get("description") || "").trim(),
      spentOn: String(data.get("spentOn") || ""),
      category: String(data.get("category") || "books") as ExpenseCategory,
    });
    if (ok) {
      form.reset();
      setNotice("Đã ghi khoản chi cho môn này.");
    }
  }

  return (
    <section className="course-workspace" aria-labelledby="course-workspace">
      <h2 id="course-workspace">Workspace for this course</h2>
      <p className="page-note">
        Mọi thứ bạn thêm ở đây đều được gắn sẵn cho môn này, và cũng hiện ở
        trang tương ứng của nó.
      </p>

      <div className="cw-grid">
        <Block
          title="Exams"
          loading={exams.loading}
          icon={<CalendarDaysIcon aria-hidden="true" />}
          summary={`${courseExams.length} sắp tới`}
        >
          <ul className="cw-list">
            {courseExams.map((exam) => (
              <li key={exam.id}>
                <span className="plan-copy">
                  <strong>{exam.topic}</strong>
                  <small className="plan-meta">
                    <span>
                      {countdownLabel(daysUntil(exam.exam_date, today))}
                    </span>
                    <time dateTime={exam.exam_date}>
                      {formatDate(exam.exam_date)} · {exam.exam_time}
                    </time>
                    <span>{exam.room}</span>
                  </small>
                </span>
                <RemoveButton
                  label={`Delete exam: ${exam.topic}`}
                  busy={exams.busy}
                  onDelete={() =>
                    void removeAnd(exams.remove(exam.id), "Kỳ thi")
                  }
                />
              </li>
            ))}
          </ul>
          {!courseExams.length && (
            <p className="empty-message">Chưa có kỳ thi nào sắp tới.</p>
          )}
          <form className="cw-form" onSubmit={(event) => void addExam(event)}>
            <label>
              <span className="sr-only">Exam name</span>
              <input
                name="topic"
                placeholder="Tên kỳ thi"
                minLength={3}
                maxLength={160}
                required
              />
            </label>
            <label>
              <span className="sr-only">Exam date</span>
              <input name="examDate" type="date" required />
            </label>
            <label>
              <span className="sr-only">Exam time</span>
              <input name="examTime" type="time" required />
            </label>
            <label>
              <span className="sr-only">Exam room</span>
              <input name="room" placeholder="Phòng" maxLength={80} required />
            </label>
            <button className="text-button" disabled={exams.busy}>
              <PlusIcon /> Add exam
            </button>
          </form>
        </Block>

        <Block
          title="Study plan"
          loading={plans.loading}
          icon={<ClipboardDocumentCheckIcon aria-hidden="true" />}
          summary={`${planRemaining} việc còn lại`}
        >
          <ul className="cw-list">
            {coursePlans.map((plan) => {
              const done = Boolean(plan.completed_at);
              return (
                <li key={plan.id} className={done ? "is-done" : ""}>
                  <button
                    type="button"
                    className={`task-check ${done ? "checked" : ""}`}
                    aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${plan.title}`}
                    disabled={plans.busy}
                    onClick={() => void plans.setCompletion(plan.id, !done)}
                  >
                    {done && <CheckIcon />}
                  </button>
                  <span className="plan-copy">
                    <strong>{plan.title}</strong>
                    {plan.due_date && (
                      <small className="plan-meta">
                        <time dateTime={plan.due_date}>
                          {done
                            ? formatDate(plan.due_date)
                            : countdownLabel(daysUntil(plan.due_date, today))}
                        </time>
                      </small>
                    )}
                  </span>
                  <RemoveButton
                    label={`Delete revision item: ${plan.title}`}
                    busy={plans.busy}
                    onDelete={() =>
                      void removeAnd(plans.remove(plan.id), "Việc cần ôn")
                    }
                  />
                </li>
              );
            })}
          </ul>
          {!coursePlans.length && (
            <p className="empty-message">Chưa có việc nào cần ôn.</p>
          )}
          <form className="cw-form" onSubmit={(event) => void addPlan(event)}>
            <label>
              <span className="sr-only">What to revise</span>
              <input
                name="title"
                placeholder="Cần ôn gì?"
                minLength={3}
                maxLength={160}
                required
              />
            </label>
            <label>
              <span className="sr-only">Revision due date</span>
              <input name="dueDate" type="date" />
            </label>
            <button className="text-button" disabled={plans.busy}>
              <PlusIcon /> Add revision item
            </button>
          </form>
        </Block>

        <Block
          title="Spending"
          loading={expenses.loading}
          icon={<WalletIcon aria-hidden="true" />}
          summary={`${money.format(spent)} ₫`}
        >
          <ul className="cw-list">
            {courseExpenses.map((item) => (
              <li key={item.id}>
                <span className="expense-amount">
                  {money.format(item.amount)} ₫
                </span>
                <span className="plan-copy">
                  <strong>{item.description}</strong>
                  <small className="plan-meta">
                    <time dateTime={item.spent_on}>
                      {formatDate(item.spent_on)}
                    </time>
                    <span>{CATEGORY_LABELS[item.category]}</span>
                  </small>
                </span>
                <RemoveButton
                  label={`Delete expense: ${item.description}`}
                  busy={expenses.busy}
                  onDelete={() =>
                    void removeAnd(expenses.remove(item.id), "Khoản chi")
                  }
                />
              </li>
            ))}
          </ul>
          {!courseExpenses.length && (
            <p className="empty-message">Chưa ghi khoản chi nào cho môn này.</p>
          )}
          <form
            className="cw-form"
            onSubmit={(event) => void addExpense(event)}
          >
            <label>
              <span className="sr-only">Expense amount</span>
              <input
                name="amount"
                type="number"
                min={1}
                step={1}
                placeholder="Số tiền"
                required
              />
            </label>
            <label>
              <span className="sr-only">Expense description</span>
              <input
                name="description"
                placeholder="Chi cho việc gì?"
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label>
              <span className="sr-only">Expense date</span>
              <input name="spentOn" type="date" required />
            </label>
            <label>
              <span className="sr-only">Expense category</span>
              <select name="category" defaultValue="books">
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABELS[key]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button className="text-button" disabled={expenses.busy}>
              <PlusIcon /> Add expense
            </button>
          </form>
        </Block>

        <Block
          title="Documents"
          loading={documents.loading}
          icon={<DocumentTextIcon aria-hidden="true" />}
          summary={`${courseDocuments.length} tệp`}
        >
          <ul className="cw-list">
            {courseDocuments.map((item) => (
              <li key={item.id}>
                <span className="plan-copy">
                  <strong>{item.name}</strong>
                  <small className="plan-meta">
                    <span>{item.storage_status}</span>
                  </small>
                </span>
                <RemoveButton
                  label={`Detach document: ${item.name}`}
                  busy={documents.busy}
                  onDelete={() =>
                    void removeAnd(
                      documents.setCourse(item.id, null),
                      "Tài liệu",
                      "đã được gỡ khỏi môn này",
                    )
                  }
                />
              </li>
            ))}
          </ul>
          {!courseDocuments.length && (
            <p className="empty-message">Chưa có tài liệu nào cho môn này.</p>
          )}
          {/* Uploading a PDF needs the file picker, its size and type checks and
              the retry path that the Documents page already owns. Sending the
              student there is honest; rebuilding a second uploader here would
              be a second place for those rules to drift. */}
          <a className="text-button" href="#documents">
            <PlusIcon /> Tải tài liệu lên ở trang Documents
          </a>
        </Block>
      </div>

      <p role="status" className="cw-notice">
        {notice}
      </p>
    </section>
  );
}
