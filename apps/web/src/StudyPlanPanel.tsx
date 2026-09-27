import { useState, type FormEvent } from "react";
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

function DeletePlan({
  plan,
  busy,
  onDelete,
}: {
  plan: StudyPlan;
  busy: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={`Delete revision item: ${plan.title}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="exam-confirm">
      <span>Xoá việc này?</span>
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

export function StudyPlanPanel({ compact = false }: { compact?: boolean }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const store = useStudyPlans();
  const courses = useCourses();
  const [notice, setNotice] = useState("");

  const groups = groupByCourse(store.plans);
  const remaining = store.plans.filter((plan) => !plan.completed_at).length;
  const today = new Date();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const courseId = String(data.get("courseId") || "");
    const title = String(data.get("title") || "").trim();
    if (!courseId) {
      setNotice("Chọn giúp mình môn học của việc này nhé.");
      return;
    }
    if (title.length < 3) {
      setNotice("Tên việc cần ít nhất ba ký tự.");
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
      setNotice("Đã thêm vào kế hoạch ôn tập.");
    }
  }

  if (store.loading) {
    return (
      <Panel title="Study plan" icon={<ClipboardDocumentCheckIcon />}>
        <p role="status" className="empty-message">
          Đang mở kế hoạch ôn tập…
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Study plan" icon={<ClipboardDocumentCheckIcon />}>
      <p className="view-label">
        <ClipboardDocumentCheckIcon /> Ôn tập theo môn
        <span>{remaining ? `${remaining} việc còn lại` : "Đã xong hết"}</span>
      </p>

      {store.error && (
        <p role="alert" className="error-message">
          {store.error}
          <button className="text-button" type="button" onClick={store.reload}>
            <ArrowPathIcon /> Retry study plan
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
                    {group.done}/{group.plans.length} xong
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
                          aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${plan.title}`}
                          disabled={store.busy}
                          onClick={() =>
                            void store.setCompletion(plan.id, !done)
                          }
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
                        {!compact && (
                          <DeletePlan
                            plan={plan}
                            busy={store.busy}
                            onDelete={() => {
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
                Chưa có việc nào ở đây. Mỗi môn học một danh sách những thứ bạn
                cần ôn trước kỳ thi — thêm việc đầu tiên bên dưới nhé.
              </p>
            )}
      </div>

      {compact ? (
        <a className="text-button" href="#study-plan">
          <PlusIcon /> Add or view revision items
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
            What to revise
            <input
              name="title"
              placeholder="Ví dụ: Ôn lại chương ba"
              minLength={3}
              maxLength={160}
              required
            />
          </label>
          <label className="sm:col-span-2">
            Notes
            <textarea
              name="detail"
              rows={2}
              maxLength={500}
              placeholder="Cụ thể cần làm gì để coi như xong?"
            />
          </label>
          <label>
            Due date
            <input name="dueDate" type="date" />
          </label>
          <label>
            Owner
            <input name="ownerName" placeholder="Tài or Thắng" maxLength={80} />
          </label>
          <button className="primary-button" disabled={store.busy}>
            <PlusIcon />
            {store.busy ? "Đang lưu…" : "Add revision item"}
          </button>
          <p role="status">{notice}</p>
        </form>
      )}
    </Panel>
  );
}
