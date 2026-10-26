import { useContext, useEffect, useState, type FormEvent } from "react";
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "./AcademicPanels";
import { useCourses } from "./use-courses";
import { groupByCourse, useStudyPlans } from "./use-study-plans";
import { countdownLabel, daysUntil } from "./use-exams";
import { revealClass, useReveal } from "./use-reveal";
import type { StudyPlan } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useTr } from "./i18n";

export function DeletePlan({
  plan,
  busy,
  onDelete,
}: {
  plan: StudyPlan;
  busy: boolean;
  onDelete: () => void;
}) {
  const tr = useTr();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={tr("Delete revision item: {title}", { title: plan.title })}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="exam-confirm">
      <span>{tr("Xoá việc này?")}</span>
      <button
        type="button"
        className="exam-confirm-yes"
        disabled={busy}
        onClick={onDelete}
      >
        {tr("Xoá")}
      </button>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        {tr("Giữ lại")}
      </button>
    </span>
  );
}

export function StudyPlanPanel({ compact = false }: { compact?: boolean }) {
  const tr = useTr();
  const principal = useContext(PilotPrincipalContext);
  const canWrite =
    principal?.role === "manager" || principal?.role === "member";
  const canDelete = principal?.role === "manager";
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const store = useStudyPlans();
  const courses = useCourses();
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!canWrite) setNotice("");
  }, [canWrite]);

  const groups = groupByCourse(store.plans);
  const remaining = store.plans.filter((plan) => !plan.completed_at).length;
  const today = new Date();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const courseId = String(data.get("courseId") || "");
    const title = String(data.get("title") || "").trim();
    if (!courseId) {
      setNotice(tr("Chọn giúp mình môn học của việc này nhé."));
      return;
    }
    if (title.length < 3) {
      setNotice(tr("Tên việc cần ít nhất ba ký tự."));
      return;
    }
    const ok = await store.create({
      courseId,
      title,
      detail: String(data.get("detail") || "").trim() || undefined,
      dueDate: String(data.get("dueDate") || "") || undefined,
      ownerName: String(data.get("ownerName") || "").trim() || undefined,
    });
    if (ok) {
      form.reset();
      setNotice(tr("Đã thêm vào kế hoạch ôn tập."));
    }
  }

  if (store.loading) {
    return (
      <Panel title={tr("Study plan")} icon={<ClipboardDocumentCheckIcon />}>
        <p role="status" className="empty-message">
          {tr("Đang mở kế hoạch ôn tập…")}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={tr("Study plan")} icon={<ClipboardDocumentCheckIcon />}>
      {!canWrite && (
        <p className="page-note">
          {tr(
            "Bạn đang có quyền xem kế hoạch ôn tập. Nhờ thành viên hoặc người quản lý thêm và cập nhật việc cần ôn nhé.",
          )}
        </p>
      )}
      <p className="view-label">
        <ClipboardDocumentCheckIcon /> {tr("Ôn tập theo môn")}
        <span>
          {remaining
            ? tr("{remaining} việc còn lại", { remaining })
            : tr("Đã xong hết")}
        </span>
      </p>

      {store.error && (
        <p role="alert" className="error-message">
          {store.error}
          <button className="text-button" type="button" onClick={store.reload}>
            <ArrowPathIcon /> {tr("Retry study plan")}
          </button>
        </p>
      )}

      <div ref={ref} className={revealClass(revealed)}>
        {groups.length
          ? (compact ? groups.slice(0, 2) : groups).map((group) => (
              <section
                key={group.slug}
                className="plan-group"
                aria-labelledby={`plan-${group.slug}`}
              >
                <h3 id={`plan-${group.slug}`}>
                  <a href={`#courses/${group.slug}`}>
                    {group.name} <ArrowUpRightIcon aria-hidden="true" />
                  </a>
                  <span>
                    {group.done}/{group.plans.length} {tr("xong")}
                  </span>
                </h3>
                <ul className="plan-list">
                  {group.plans.map((plan) => {
                    const done = Boolean(plan.completed_at);
                    return (
                      <li
                        key={plan.id}
                        data-focus-id={plan.id}
                        className={done ? "is-done" : ""}
                      >
                        <button
                          type="button"
                          className={`task-check ${done ? "checked" : ""}`}
                          aria-label={`${done ? tr("Mark as not done") : tr("Mark as done")}: ${plan.title}`}
                          disabled={store.busy || !canWrite}
                          onClick={() => {
                            if (!canWrite) return;
                            void store.setCompletion(plan.id, !done);
                          }}
                        >
                          {done && <CheckIcon />}
                        </button>
                        <span className="plan-copy">
                          <strong>{plan.title}</strong>
                          {plan.detail && <small>{plan.detail}</small>}
                          <small className="plan-meta">
                            {plan.due_date && (
                              <time dateTime={plan.due_date}>
                                {done
                                  ? plan.due_date
                                  : countdownLabel(
                                      daysUntil(plan.due_date, today),
                                    )}
                              </time>
                            )}
                            {plan.owner_name && <span>{plan.owner_name}</span>}
                          </small>
                        </span>
                        {!compact && canDelete && (
                          <DeletePlan
                            plan={plan}
                            busy={store.busy}
                            onDelete={() => {
                              if (!canDelete) return;
                              void store.remove(plan.id);
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          : !store.error && (
              <p className="empty-message">
                {tr(
                  "Chưa có việc nào ở đây. Mỗi môn học một danh sách những thứ bạn cần ôn trước kỳ thi — thêm việc đầu tiên bên dưới nhé.",
                )}
              </p>
            )}
      </div>

      {compact ? (
        <a className="text-button" href="#study-plan">
          {canWrite && <PlusIcon />}
          {canWrite
            ? tr("Add or view revision items")
            : tr("View revision items")}
        </a>
      ) : canWrite ? (
        <form
          className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="sm:col-span-2">
            {tr("Course")}
            <select name="courseId" defaultValue="" required>
              <option value="" disabled>
                {tr("Chọn môn học")}
              </option>
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code})
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            {tr("What to revise")}
            <input
              name="title"
              placeholder={tr("Ví dụ: Ôn lại chương ba")}
              minLength={3}
              maxLength={160}
              required
            />
          </label>
          <label className="sm:col-span-2">
            {tr("Notes")}
            <textarea
              name="detail"
              rows={2}
              maxLength={500}
              placeholder={tr("Cụ thể cần làm gì để coi như xong?")}
            />
          </label>
          <label>
            {tr("Due date")}
            <input name="dueDate" type="date" />
          </label>
          <label>
            {tr("Owner")}
            <input
              name="ownerName"
              placeholder={tr("Tài or Thắng")}
              maxLength={80}
            />
          </label>
          <button className="primary-button" disabled={store.busy}>
            <PlusIcon />
            {store.busy ? tr("Đang lưu…") : tr("Add revision item")}
          </button>
          <p role="status">{notice}</p>
        </form>
      ) : null}
    </Panel>
  );
}
