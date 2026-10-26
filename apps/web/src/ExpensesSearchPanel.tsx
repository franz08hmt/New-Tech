import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  PlusIcon,
  TrashIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import type {
  Expense,
  ExpenseCategory,
  ExpenseSearchPage,
  ExpenseSearchQuery,
} from "./api";
import { api } from "./api";
import { Panel } from "./AcademicPanels";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";
import { CATEGORY_LABELS, PERIOD_LABELS, useExpenses } from "./use-expenses";
import { usePagedSearch } from "./use-paged-search";
import { useScopedRecord } from "./use-scoped-record";
import { useTr } from "./i18n";

type Period = "day" | "week" | "month" | "all" | "custom";
type DateRange = Pick<ExpenseSearchQuery, "fromDate" | "toDate">;

const money = new Intl.NumberFormat("vi-VN");

function dateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function periodRange(
  period: Exclude<Period, "custom">,
  today: Date,
): DateRange {
  if (period === "all") return { fromDate: undefined, toDate: undefined };
  if (period === "day") {
    const todayKey = dateKey(today);
    return { fromDate: todayKey, toDate: todayKey };
  }
  if (period === "month") {
    return {
      fromDate: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
      toDate: dateKey(today),
    };
  }
  const mondayOffset = (today.getDay() + 6) % 7;
  return {
    fromDate: dateKey(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - mondayOffset,
      ),
    ),
    toDate: dateKey(today),
  };
}

function isCalendarDate(value?: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validRange(query: ExpenseSearchQuery) {
  return (
    isCalendarDate(query.fromDate) &&
    isCalendarDate(query.toDate) &&
    (!query.fromDate || !query.toDate || query.fromDate <= query.toDate)
  );
}

function formatWholeDong(value: string) {
  return money.format(BigInt(value));
}

export function courseSpendPercent(value: string, largestCourseTotal: string) {
  const denominator = BigInt(largestCourseTotal);
  if (denominator <= 0n) return 0;
  // `largestCourseTotal` is computed from the same filtered groups, so this
  // fixed-point ratio is bounded to 0..100 before converting to Number.
  return Number((BigInt(value) * 10_000n) / denominator) / 100;
}

const INITIAL_QUERY: ExpenseSearchQuery & { page: number; pageSize: number } = {
  q: "",
  category: "all",
  courseId: undefined,
  fromDate: undefined,
  toDate: undefined,
  sort: "spent_on",
  direction: "desc",
  page: 1,
  pageSize: 20,
};

export function ExpensesSearchPanel({ focusId }: { focusId?: string }) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  return (
    <ExpensesSearchPanelState
      key={identity}
      identity={identity}
      role={principal?.role}
      focusId={focusId}
    />
  );
}

function ExpensesSearchPanelState({
  identity,
  role,
  focusId,
}: {
  identity: string;
  role?: "manager" | "member" | "viewer";
  focusId?: string;
}) {
  const tr = useTr();
  const canWrite = role === "manager" || role === "member";
  const canDelete = role === "manager";
  const expenses = useExpenses({ loadList: false });
  const courses = useCourses();
  const load = useCallback(
    (query: ExpenseSearchQuery, signal: AbortSignal) =>
      api.searchExpenses(query, signal),
    [],
  );
  const initialQuery = useMemo(() => {
    const range = periodRange("month", new Date());
    return { ...INITIAL_QUERY, ...range };
  }, []);
  const search = usePagedSearch<
    Expense,
    ExpenseSearchQuery & { page: number; pageSize: number },
    ExpenseSearchPage
  >(identity, initialQuery, load, {
    enabled: (query) => Boolean(identity) && validRange(query),
  });
  // A reload keeps the previous rows on screen; only the first load is empty.
  const initialLoading = search.loading && !search.page;
  const [period, setPeriod] = useState<Period>("month");
  const [notice, setNotice] = useState("");
  const [focusRevision, setFocusRevision] = useState(0);
  const loadById = useCallback(
    (id: string, signal: AbortSignal) => api.getExpense(id, signal),
    [],
  );
  const focused = useScopedRecord<Expense>(
    identity,
    focusId,
    !search.loading && validRange(search.query),
    search.items.some((expense) => expense.id === focusId),
    loadById,
    focusRevision,
  );

  useEffect(() => setNotice(""), [identity]);

  function setPeriodRange(value: Period) {
    setPeriod(value);
    if (value !== "custom") search.setQuery(periodRange(value, new Date()));
  }

  function resetFilters() {
    setPeriod("month");
    search.setQuery({
      ...INITIAL_QUERY,
      ...periodRange("month", new Date()),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    const description = String(data.get("description") || "").trim();
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice(tr("Số tiền cần là một số nguyên dương, tính bằng đồng."));
      return;
    }
    if (description.length < 2) {
      setNotice(tr("Ghi vắn tắt khoản này là gì giúp mình nhé."));
      return;
    }
    const created = await expenses.create({
      amount,
      description,
      spentOn: String(data.get("spentOn") || ""),
      category: String(data.get("category") || "other") as ExpenseCategory,
      courseId: String(data.get("courseId") || "") || undefined,
    });
    if (created) {
      form.reset();
      setNotice(tr("Đã ghi khoản chi. Danh sách và tổng đã được đọc lại."));
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  async function remove(expense: Expense) {
    if (!canDelete) return;
    if (await expenses.remove(expense.id)) {
      setNotice(tr("Đã xoá khoản chi. Danh sách và tổng đã được đọc lại."));
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  const rangeInvalid = !validRange(search.query);
  const summary = search.page?.summary;
  const largestCourseTotal =
    summary?.byCourse
      .reduce(
        (largest, group) =>
          BigInt(group.totalAmount) > largest
            ? BigInt(group.totalAmount)
            : largest,
        0n,
      )
      .toString() ?? "0";
  const hasFilters =
    Boolean(search.query.q?.trim()) ||
    search.query.category !== "all" ||
    Boolean(search.query.courseId) ||
    period !== "all";

  return (
    <>
      <Panel title={tr("Student budget")} icon={<WalletIcon />}>
        {!canWrite && (
          <p className="page-note">
            {tr(
              "Bạn đang có quyền xem các khoản chi. Nhờ thành viên hoặc người quản lý ghi khoản chi mới nhé.",
            )}
          </p>
        )}

        <div className="paged-search-toolbar expense-search-toolbar">
          <label className="paged-search-field">
            {tr("Tìm khoản chi")}
            <input
              aria-label={tr("Tìm khoản chi")}
              type="search"
              maxLength={120}
              value={search.query.q ?? ""}
              onChange={(event) => search.setQuery({ q: event.target.value })}
              placeholder={tr("Mô tả hoặc môn học")}
            />
          </label>
          <label>
            {tr("Khoảng thời gian")}
            <select
              aria-label={tr("Khoảng thời gian chi tiêu")}
              value={period}
              onChange={(event) => setPeriodRange(event.target.value as Period)}
            >
              <option value="day">{PERIOD_LABELS.day}</option>
              <option value="week">{PERIOD_LABELS.week}</option>
              <option value="month">{PERIOD_LABELS.month}</option>
              <option value="all">{PERIOD_LABELS.all}</option>
              <option value="custom">{tr("Khoảng tùy chỉnh")}</option>
            </select>
          </label>
          <label>
            {tr("Từ ngày")}
            <input
              aria-label={tr("Khoản chi từ ngày")}
              type="date"
              value={search.query.fromDate ?? ""}
              onChange={(event) => {
                setPeriod("custom");
                search.setQuery({ fromDate: event.target.value || undefined });
              }}
            />
          </label>
          <label>
            {tr("Đến ngày")}
            <input
              aria-label={tr("Khoản chi đến ngày")}
              type="date"
              value={search.query.toDate ?? ""}
              onChange={(event) => {
                setPeriod("custom");
                search.setQuery({ toDate: event.target.value || undefined });
              }}
            />
          </label>
          <label>
            {tr("Danh mục")}
            <select
              aria-label={tr("Lọc danh mục chi tiêu")}
              value={search.query.category ?? "all"}
              onChange={(event) =>
                search.setQuery({
                  category: event.target
                    .value as ExpenseSearchQuery["category"],
                })
              }
            >
              <option value="all">{tr("Tất cả danh mục")}</option>
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(
                (category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {tr("Môn học")}
            <select
              aria-label={tr("Lọc môn học chi tiêu")}
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
              <option value="all">{tr("Tất cả môn")}</option>
              <option value="unassigned">{tr("Chưa gắn môn")}</option>
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Sắp xếp")}
            <select
              aria-label={tr("Sắp xếp khoản chi")}
              value={search.query.sort ?? "spent_on"}
              onChange={(event) =>
                search.setQuery({
                  sort: event.target.value as ExpenseSearchQuery["sort"],
                })
              }
            >
              <option value="spent_on">{tr("Ngày chi")}</option>
              <option value="amount">{tr("Số tiền")}</option>
              <option value="description">{tr("Mô tả")}</option>
            </select>
          </label>
          <label>
            {tr("Chiều sắp xếp")}
            <select
              aria-label={tr("Chiều sắp xếp khoản chi")}
              value={search.query.direction ?? "desc"}
              onChange={(event) =>
                search.setQuery({
                  direction: event.target.value as "asc" | "desc",
                })
              }
            >
              <option value="desc">{tr("Giảm dần")}</option>
              <option value="asc">{tr("Tăng dần")}</option>
            </select>
          </label>
          <label>
            {tr("Số mục mỗi trang")}
            <select
              aria-label={tr("Số khoản chi mỗi trang")}
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
            onClick={resetFilters}
          >
            {tr("Đặt lại bộ lọc")}
          </button>
        </div>

        {courses.error && (
          <p role="alert" className="error-message">
            {tr("Không tải được lựa chọn môn học.")} {courses.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={courses.retry}
            >
              {tr("Tải lại môn học")}
            </button>
          </p>
        )}
        {rangeInvalid ? (
          <p role="alert" className="error-message">
            {tr(
              "Chọn ngày hợp lệ và bảo đảm ngày bắt đầu không sau ngày kết thúc.",
            )}
          </p>
        ) : search.tooShort ? (
          <p role="status" className="page-note">
            {tr("Nhập ít nhất hai ký tự hoặc xoá từ khoá để duyệt.")}
          </p>
        ) : search.unsupported ? (
          <p role="status" className="page-note">
            {tr("Từ khoá không có ký tự tìm kiếm phù hợp. Hãy thử từ khác.")}
          </p>
        ) : search.loading && !search.page ? (
          <p role="status" aria-busy="true" className="empty-message">
            {tr("Đang tải sổ chi tiêu…")}
          </p>
        ) : search.error ? (
          <p role="alert" className="error-message">
            {search.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={search.retry}
            >
              <ArrowPathIcon /> {tr("Thử tải lại")}
            </button>
          </p>
        ) : search.page ? (
          <p role="status" className="page-note">
            {search.page.total} {tr("khoản · trang")} {search.page.page} /{" "}
            {Math.max(1, search.page.totalPages)}{" "}
            {tr("· Tổng theo bộ lọc hiện tại")}
            {period === "custom"
              ? tr(" (khoảng tùy chỉnh)")
              : ` (${PERIOD_LABELS[period]})`}
          </p>
        ) : null}

        {summary && !search.error && !rangeInvalid && (
          <>
            <dl className="budget-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <dt>{tr("Tổng đã chi")}</dt>
                <dd>{formatWholeDong(summary.totalAmount)} ₫</dd>
              </div>
              <div>
                <dt>{tr("Số khoản khớp bộ lọc")}</dt>
                <dd>{search.page?.total ?? 0}</dd>
              </div>
              <div>
                <dt>{tr("Khoản lớn nhất trong kết quả")}</dt>
                <dd>{formatWholeDong(summary.largestAmount)} ₫</dd>
              </div>
            </dl>
            {summary.byCourse.length > 0 && (
              <section aria-labelledby="spend-by-course">
                <h3 id="spend-by-course" className="exam-group">
                  {tr("Chi theo môn học trong bộ lọc")}
                </h3>
                <p className="page-note">
                  {tr(
                    "Độ dài thanh được so với môn có tổng chi cao nhất trong bộ lọc, không phải tỷ trọng của ngân sách.",
                  )}
                </p>
                <ul className="budget-bars">
                  {summary.byCourse.map((group) => (
                    <li key={group.course_id ?? "unassigned"}>
                      <label htmlFor={`spend-${group.course_id ?? "none"}`}>
                        {group.course_slug ? (
                          <a
                            href={`#courses/${encodeURIComponent(group.course_slug)}`}
                          >
                            {group.course_name}{" "}
                            <ArrowUpRightIcon aria-hidden="true" />
                          </a>
                        ) : (
                          group.course_name
                        )}
                        <span>{formatWholeDong(group.totalAmount)} ₫</span>
                      </label>
                      <progress
                        id={`spend-${group.course_id ?? "none"}`}
                        value={courseSpendPercent(
                          group.totalAmount,
                          largestCourseTotal,
                        )}
                        max={100}
                      >
                        {Math.round(
                          courseSpendPercent(
                            group.totalAmount,
                            largestCourseTotal,
                          ),
                        )}
                        %
                      </progress>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section aria-labelledby="expense-list">
          <h3 id="expense-list" className="exam-group">
            {tr("Các khoản đã ghi")}
          </h3>
          {search.page?.total === 0 && !search.error && !initialLoading && (
            <p className="empty-message">
              {hasFilters
                ? tr("Không có khoản chi khớp bộ lọc này.")
                : tr(
                    "Chưa ghi khoản chi nào. Ghi khoản đầu tiên bên dưới nhé.",
                  )}
            </p>
          )}
          {search.page &&
            search.page.total > 0 &&
            !initialLoading &&
            !search.error &&
            (search.items.length ? (
              <ExpenseRows
                expenses={search.items}
                busy={expenses.busy}
                canDelete={canDelete}
                onDelete={(expense) => void remove(expense)}
              />
            ) : (
              <p className="empty-message">
                {tr("Trang này hiện chưa có mục; tổng theo bộ lọc vẫn là")}{" "}
                {search.page.total}.
              </p>
            ))}
          <nav
            className="paged-search-pagination"
            aria-label={tr("Trang khoản chi")}
          >
            <button
              type="button"
              className="secondary-button"
              disabled={search.query.page <= 1 || search.loading}
              onClick={() => search.setPage(search.query.page - 1)}
            >
              {tr("Trước")}
            </button>
            <span>
              {tr("Trang")} {search.page?.page ?? search.query.page} /{" "}
              {Math.max(1, search.page?.totalPages ?? 0)}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={
                search.loading ||
                !search.page ||
                search.query.page >= search.page.totalPages
              }
              onClick={() => search.setPage(search.query.page + 1)}
            >
              {tr("Sau")}
            </button>
          </nav>
        </section>

        {expenses.error && (
          <p role="alert" className="error-message">
            {expenses.error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}

        {canWrite && (
          <form
            className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
            onSubmit={(event) => void submit(event)}
          >
            <label>
              {tr("Amount (₫)")}
              <input name="amount" type="number" min={1} step={1} required />
            </label>
            <label>
              {tr("Date")}
              <input name="spentOn" type="date" required />
            </label>
            <label className="sm:col-span-2">
              {tr("Description")}
              <input
                name="description"
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label>
              {tr("Category")}
              <select name="category" defaultValue="books">
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(
                  (category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {tr("Course")}
              <select name="courseId" defaultValue="">
                <option value="">{tr("Không thuộc môn nào")}</option>
                {courses.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} ({course.code})
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" disabled={expenses.busy}>
              <PlusIcon />
              {expenses.busy ? tr("Đang lưu…") : tr("Add expense")}
            </button>
          </form>
        )}
        <p className="page-note">
          {tr(
            "Đây là sổ chi tiêu minh hoạ của workspace, không kết nối với tài khoản ngân hàng nào và không phải số liệu tài chính thật.",
          )}
        </p>
      </Panel>

      {focused.loading && (
        <Panel title={tr("Khoản chi từ liên kết")} icon={<WalletIcon />}>
          <p role="status" aria-busy="true">
            {tr("Đang mở khoản chi…")}
          </p>
        </Panel>
      )}
      {focused.error && (
        <Panel title={tr("Khoản chi từ liên kết")} icon={<WalletIcon />}>
          <p role="status">{focused.error}</p>
        </Panel>
      )}
      {focused.record && !focused.error && (
        <Panel title={tr("Khoản chi từ liên kết")} icon={<WalletIcon />}>
          <article
            data-focus-id={focused.record.id}
            data-focus-keyboard="true"
            tabIndex={-1}
          >
            <h2>{focused.record.description}</h2>
            <p>
              {formatWholeDong(String(focused.record.amount))} ₫ ·{" "}
              {focused.record.spent_on}
            </p>
            <p>
              {CATEGORY_LABELS[focused.record.category]} ·{" "}
              {focused.record.course_name ?? tr("Không thuộc môn nào")}
            </p>
            <p className="page-note">
              {tr(
                "Mục tiêu được mở riêng; có thể không khớp bộ lọc đang chọn và không được cộng vào tổng hoặc trang kết quả.",
              )}
            </p>
            {canDelete && (
              <ExpenseDelete
                expense={focused.record}
                busy={expenses.busy}
                onDelete={() => void remove(focused.record!)}
              />
            )}
          </article>
        </Panel>
      )}
    </>
  );
}

function ExpenseRows({
  expenses,
  busy,
  canDelete,
  onDelete,
}: {
  expenses: Expense[];
  busy: boolean;
  canDelete: boolean;
  onDelete: (expense: Expense) => void;
}) {
  return (
    <ul className="expense-list">
      {expenses.map((expense) => (
        <li
          key={expense.id}
          data-focus-id={expense.id}
          data-focus-keyboard="true"
          tabIndex={-1}
        >
          <span className="expense-amount">
            {money.format(expense.amount)} ₫
          </span>
          <span className="plan-copy">
            <strong>{expense.description}</strong>
            <small className="plan-meta">
              <time dateTime={expense.spent_on}>{expense.spent_on}</time>
              <span>{CATEGORY_LABELS[expense.category]}</span>
              {expense.course_code && <span>{expense.course_code}</span>}
            </small>
          </span>
          {canDelete && (
            <ExpenseDelete
              expense={expense}
              busy={busy}
              onDelete={() => onDelete(expense)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function ExpenseDelete({
  expense,
  busy,
  onDelete,
}: {
  expense: Expense;
  busy: boolean;
  onDelete: () => void;
}) {
  const tr = useTr();
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={tr("Delete expense: {description}", {
          description: expense.description,
        })}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  return (
    <span className="exam-confirm">
      <span>{tr("Xoá khoản này?")}</span>
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
