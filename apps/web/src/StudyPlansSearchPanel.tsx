import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type {
  StudyPlan,
  StudyPlanSearchPage,
  StudyPlanSearchQuery,
} from "./api";
import { api } from "./api";
import { Panel } from "./AcademicPanels";
import { DeletePlan } from "./StudyPlanPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";
import { countdownLabel, daysUntil } from "./use-exams";
import { groupByCourse, useStudyPlans } from "./use-study-plans";
import { usePagedSearch } from "./use-paged-search";
import { useScopedRecord } from "./use-scoped-record";

const INITIAL_QUERY: StudyPlanSearchQuery & { page: number; pageSize: number } =
  {
    q: "",
    courseId: undefined,
    completion: "all",
    owner: undefined,
    dueFrom: undefined,
    dueTo: undefined,
    sort: "due_date",
    direction: "asc",
    page: 1,
    pageSize: 20,
  };

type OwnerMode = "all" | "unassigned" | "named";

function isCalendarDate(value?: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validDateRange(query: StudyPlanSearchQuery) {
  return (
    isCalendarDate(query.dueFrom) &&
    isCalendarDate(query.dueTo) &&
    (!query.dueFrom || !query.dueTo || query.dueFrom <= query.dueTo)
  );
}

export function StudyPlansSearchPanel({ focusId }: { focusId?: string }) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  return (
    <StudyPlansSearchState
      key={identity}
      identity={identity}
      role={principal?.role}
      focusId={focusId}
    />
  );
}

function StudyPlansSearchState({
  identity,
  role,
  focusId,
}: {
  identity: string;
  role?: "manager" | "member" | "viewer";
  focusId?: string;
}) {
  const canWrite = role === "manager" || role === "member";
  const canDelete = role === "manager";
  const courses = useCourses();
  const plans = useStudyPlans({ loadList: false });
  const load = useCallback(
    (query: StudyPlanSearchQuery, signal: AbortSignal) =>
      api.searchStudyPlans(query, signal),
    [],
  );
  const search = usePagedSearch<
    StudyPlan,
    StudyPlanSearchQuery & { page: number; pageSize: number },
    StudyPlanSearchPage
  >(identity, INITIAL_QUERY, load, {
    enabled: (query) => Boolean(identity) && validDateRange(query),
  });
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("all");
  const [notice, setNotice] = useState("");
  const [focusRevision, setFocusRevision] = useState(0);
  const loadById = useCallback(
    (id: string, signal: AbortSignal) => api.getStudyPlan(id, signal),
    [],
  );
  const focused = useScopedRecord(
    identity,
    focusId,
    Boolean(search.page) && !search.loading,
    search.items.some((plan) => plan.id === focusId),
    loadById,
    focusRevision,
  );
  const dateRangeInvalid = !validDateRange(search.query);
  const groups = groupByCourse(search.items);
  const hasFilters = Boolean(
    search.query.q?.trim() ||
    search.query.courseId ||
    (search.query.completion && search.query.completion !== "all") ||
    search.query.owner ||
    search.query.dueFrom ||
    search.query.dueTo,
  );

  useEffect(() => {
    setNotice("");
    setOwnerMode("all");
  }, [identity]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
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
    if (
      await plans.create({
        courseId,
        title,
        detail: String(data.get("detail") || "").trim() || undefined,
        dueDate: String(data.get("dueDate") || "") || undefined,
        ownerName: String(data.get("ownerName") || "").trim() || undefined,
      })
    ) {
      form.reset();
      setNotice(
        "Đã thêm vào kế hoạch ôn tập; danh sách được đọc lại từ máy chủ.",
      );
      search.refresh();
    }
  }

  async function toggle(plan: StudyPlan, completed: boolean) {
    if (!canWrite) return;
    if (await plans.setCompletion(plan.id, completed)) {
      setNotice("Trạng thái đã được cập nhật.");
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  async function remove(id: string) {
    if (!canDelete) return;
    if (await plans.remove(id)) {
      setNotice("Việc ôn tập đã được xoá; danh sách được đọc lại từ máy chủ.");
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  const linkedPlan =
    focused.record &&
    !search.items.some((plan) => plan.id === focused.record?.id)
      ? focused.record
      : null;

  return (
    <>
      {linkedPlan && (
        <FocusedPlan
          plan={linkedPlan}
          busy={plans.busy}
          canWrite={canWrite}
          canDelete={canDelete}
          onToggle={(completed) => void toggle(linkedPlan, completed)}
          onDelete={() => void remove(linkedPlan.id)}
        />
      )}
      {focusId && focused.error && (
        <p role="status" className="page-note">
          Việc ôn tập này không có trong workspace hiện tại hoặc đã bị xoá.
        </p>
      )}
      <Panel title="Study plan" icon={<ClipboardDocumentCheckIcon />}>
        {!canWrite && (
          <p className="page-note">
            Bạn đang có quyền xem kế hoạch ôn tập. Nhờ thành viên hoặc người
            quản lý thêm và cập nhật việc cần ôn nhé.
          </p>
        )}
        <p className="view-label">
          <ClipboardDocumentCheckIcon /> Ôn tập theo môn
          {search.page && (
            <span>
              {search.page.summary.remaining} việc còn lại ·{" "}
              {search.page.summary.completed} đã xong trên toàn bộ kết quả lọc
            </span>
          )}
        </p>

        <div className="paged-search-toolbar study-plan-search-toolbar">
          <label className="paged-search-field">
            Tìm việc ôn tập
            <input
              aria-label="Tìm việc ôn tập"
              type="search"
              maxLength={120}
              value={search.query.q ?? ""}
              onChange={(event) => search.setQuery({ q: event.target.value })}
              placeholder="Tên, ghi chú hoặc môn học"
            />
          </label>
          <label>
            Lọc theo môn
            <select
              aria-label="Lọc việc ôn tập theo môn"
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
              <option value="all">Tất cả môn</option>
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái hoàn thành
            <select
              aria-label="Lọc trạng thái kế hoạch ôn tập"
              value={search.query.completion ?? "all"}
              onChange={(event) =>
                search.setQuery({
                  completion: event.target
                    .value as StudyPlanSearchQuery["completion"],
                })
              }
            >
              <option value="all">Tất cả</option>
              <option value="open">Chưa xong</option>
              <option value="completed">Đã xong</option>
            </select>
          </label>
          <label>
            Người phụ trách
            <select
              aria-label="Lọc người phụ trách kế hoạch"
              value={ownerMode}
              onChange={(event) => {
                const mode = event.target.value as OwnerMode;
                setOwnerMode(mode);
                search.setQuery({
                  owner:
                    mode === "unassigned"
                      ? "unassigned"
                      : mode === "all"
                        ? undefined
                        : search.query.owner === "unassigned"
                          ? undefined
                          : search.query.owner,
                });
              }}
            >
              <option value="all">Tất cả</option>
              <option value="unassigned">Chưa giao</option>
              <option value="named">Tên cụ thể</option>
            </select>
          </label>
          {ownerMode === "named" && (
            <label>
              Tên người phụ trách
              <input
                aria-label="Tên người phụ trách chính xác"
                maxLength={80}
                value={
                  search.query.owner === "unassigned"
                    ? ""
                    : (search.query.owner ?? "")
                }
                onChange={(event) =>
                  search.setQuery({ owner: event.target.value || undefined })
                }
              />
            </label>
          )}
          <label>
            Hạn từ ngày
            <input
              aria-label="Hạn từ ngày"
              type="date"
              value={search.query.dueFrom ?? ""}
              onChange={(event) =>
                search.setQuery({ dueFrom: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Hạn đến ngày
            <input
              aria-label="Hạn đến ngày"
              type="date"
              value={search.query.dueTo ?? ""}
              onChange={(event) =>
                search.setQuery({ dueTo: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Sắp xếp
            <select
              aria-label="Sắp xếp kế hoạch ôn tập"
              value={search.query.sort ?? "due_date"}
              onChange={(event) =>
                search.setQuery({
                  sort: event.target.value as StudyPlanSearchQuery["sort"],
                })
              }
            >
              <option value="due_date">Hạn chót</option>
              <option value="title">Tên việc</option>
              <option value="course">Môn học</option>
              <option value="completed">Trạng thái</option>
            </select>
          </label>
          <label>
            Chiều sắp xếp
            <select
              aria-label="Chiều sắp xếp kế hoạch ôn tập"
              value={search.query.direction ?? "asc"}
              onChange={(event) =>
                search.setQuery({
                  direction: event.target.value as "asc" | "desc",
                })
              }
            >
              <option value="asc">Tăng dần</option>
              <option value="desc">Giảm dần</option>
            </select>
          </label>
          <label>
            Số mục mỗi trang
            <select
              aria-label="Số kế hoạch ôn tập mỗi trang"
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
            onClick={() => {
              setOwnerMode("all");
              search.setQuery({ ...INITIAL_QUERY });
            }}
          >
            Đặt lại bộ lọc
          </button>
        </div>

        {courses.error && (
          <p role="alert" className="error-message">
            Không tải được lựa chọn môn học. {courses.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={courses.retry}
            >
              Tải lại môn học
            </button>
          </p>
        )}
        {dateRangeInvalid ? (
          <p role="alert" className="error-message">
            Chọn ngày hợp lệ và bảo đảm ngày bắt đầu không sau ngày kết thúc.
          </p>
        ) : search.tooShort ? (
          <p role="status" className="page-note">
            Nhập ít nhất hai ký tự hoặc xoá từ khoá để duyệt toàn bộ.
          </p>
        ) : search.unsupported ? (
          <p role="status" className="page-note">
            Từ khoá không có ký tự tìm kiếm phù hợp. Hãy thử từ khác.
          </p>
        ) : search.loading && !search.page ? (
          <p role="status" aria-busy="true" className="empty-message">
            Đang tải kế hoạch ôn tập…
          </p>
        ) : search.error ? (
          <p role="alert" className="error-message">
            {search.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={search.retry}
            >
              <ArrowPathIcon /> Thử tải lại
            </button>
          </p>
        ) : search.page ? (
          <p role="status" className="page-note">
            {search.page.total} việc · trang {search.page.page} /{" "}
            {Math.max(1, search.page.totalPages)}
          </p>
        ) : null}

        {search.page?.total === 0 && !search.error && (
          <p role="status" className="empty-message">
            {hasFilters
              ? "Không có việc ôn tập khớp bộ lọc này."
              : "Chưa có việc nào ở đây. Mỗi môn học một danh sách những thứ bạn cần ôn trước kỳ thi — thêm việc đầu tiên bên dưới nhé."}
          </p>
        )}
        {search.page &&
          search.page.total > 0 &&
          !search.error &&
          !dateRangeInvalid && (
            <>
              {groups.length ? (
                groups.map((group) => (
                  <section
                    key={group.slug}
                    className="plan-group"
                    aria-labelledby={`plan-search-${group.slug}`}
                  >
                    <h3 id={`plan-search-${group.slug}`}>
                      <a href={`#courses/${group.slug}`}>
                        {group.name} <ArrowUpRightIcon aria-hidden="true" />
                      </a>
                      <span>
                        {group.done}/{group.plans.length} xong trên trang này
                      </span>
                    </h3>
                    <PlanRows
                      plans={group.plans}
                      busy={plans.busy}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      onToggle={toggle}
                      onDelete={remove}
                    />
                  </section>
                ))
              ) : (
                <p className="empty-message">
                  Trang này hiện không có mục; tổng bộ lọc vẫn là{" "}
                  {search.page.total}.
                </p>
              )}
              <nav
                className="paged-search-pagination"
                aria-label="Trang kế hoạch ôn tập"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={search.query.page <= 1 || search.loading}
                  onClick={() => search.setPage(search.query.page - 1)}
                >
                  Trước
                </button>
                <span>
                  Trang {search.page.page} / {search.page.totalPages}
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
                  Sau
                </button>
              </nav>
            </>
          )}
        {plans.error && (
          <p role="alert" className="error-message">
            {plans.error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {canWrite && (
          <form
            className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
            onSubmit={(event) => void submit(event)}
          >
            <label className="sm:col-span-2">
              Môn học
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
              Việc cần ôn
              <input name="title" minLength={3} maxLength={160} required />
            </label>
            <label className="sm:col-span-2">
              Ghi chú
              <textarea name="detail" rows={2} maxLength={500} />
            </label>
            <label>
              Hạn chót
              <input name="dueDate" type="date" />
            </label>
            <label>
              Người phụ trách
              <input name="ownerName" maxLength={80} />
            </label>
            <button
              className="primary-button"
              disabled={plans.busy || courses.loading}
            >
              <PlusIcon />
              {plans.busy ? "Đang lưu…" : "Thêm việc ôn tập"}
            </button>
          </form>
        )}
      </Panel>
    </>
  );
}

function PlanRows({
  plans,
  busy,
  canWrite,
  canDelete,
  onToggle,
  onDelete,
}: {
  plans: StudyPlan[];
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onToggle: (plan: StudyPlan, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const today = new Date();
  return (
    <ul className="plan-list">
      {plans.map((plan) => {
        const done = Boolean(plan.completed_at);
        return (
          <li
            key={plan.id}
            data-focus-id={plan.id}
            data-focus-keyboard="true"
            tabIndex={-1}
            className={done ? "is-done" : ""}
          >
            <button
              type="button"
              className={`task-check ${done ? "checked" : ""}`}
              aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${plan.title}`}
              disabled={busy || !canWrite}
              onClick={() => void onToggle(plan, !done)}
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
                      : countdownLabel(daysUntil(plan.due_date, today))}
                  </time>
                )}
                {plan.owner_name && <span>{plan.owner_name}</span>}
              </small>
            </span>
            {canDelete && (
              <DeletePlan
                plan={plan}
                busy={busy}
                onDelete={() => void onDelete(plan.id)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FocusedPlan({
  plan,
  busy,
  canWrite,
  canDelete,
  onToggle,
  onDelete,
}: {
  plan: StudyPlan;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
}) {
  const done = Boolean(plan.completed_at);
  return (
    <Panel title="Việc mở từ liên kết" icon={<CalendarDaysIcon />}>
      <article data-focus-id={plan.id} data-focus-keyboard="true" tabIndex={-1}>
        <h2>{plan.title}</h2>
        <a href={`#courses/${plan.course_slug}`}>
          {plan.course_name} ({plan.course_code}){" "}
          <ArrowUpRightIcon aria-hidden="true" />
        </a>
        {plan.detail && <p>{plan.detail}</p>}
        {plan.due_date && <p>Hạn: {plan.due_date}</p>}
        {plan.owner_name && <p>Người phụ trách: {plan.owner_name}</p>}
        <p className="page-note">
          Mục được mở riêng theo liên kết; không được cộng vào tổng hoặc trang
          hiện tại.
        </p>
        <div className="exam-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !canWrite}
            aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${plan.title}`}
            onClick={() => onToggle(!done)}
          >
            {done ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
          </button>
          {canDelete && (
            <DeletePlan plan={plan} busy={busy} onDelete={onDelete} />
          )}
        </div>
      </article>
    </Panel>
  );
}
