import { useState, type FormEvent } from "react";
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  PlusIcon,
  TrashIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "./AcademicPanels";
import { useCourses } from "./use-courses";
import {
  CATEGORY_LABELS,
  PERIOD_LABELS,
  inPeriod,
  spendByCourse,
  useExpenses,
  type Period,
} from "./use-expenses";
import { revealClass, useReveal } from "./use-reveal";
import type { Expense, ExpenseCategory } from "./api";

const money = new Intl.NumberFormat("vi-VN");
const PERIODS: Period[] = ["day", "week", "month"];

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function DeleteExpense({
  expense,
  busy,
  onDelete,
}: {
  expense: Expense;
  busy: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="exam-remove"
        aria-label={`Delete expense: ${expense.description}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="exam-confirm">
      <span>Xoá khoản này?</span>
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

export function BudgetPanel() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const store = useExpenses();
  const courses = useCourses();
  const [period, setPeriod] = useState<Period>("month");
  const [notice, setNotice] = useState("");

  const today = new Date();
  const visible = inPeriod(store.expenses, period, today);
  const total = visible.reduce((sum, item) => sum + item.amount, 0);
  const byCourse = spendByCourse(visible);
  const largest = byCourse[0]?.total ?? 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    // Number() rather than parseInt: it rejects "12abc" outright instead of
    // quietly reading 12, which is the behaviour a money field wants.
    const amount = Number(data.get("amount"));
    const description = String(data.get("description") || "").trim();
    if (!Number.isInteger(amount) || amount <= 0) {
      setNotice("Số tiền cần là một số nguyên dương, tính bằng đồng.");
      return;
    }
    if (description.length < 2) {
      setNotice("Ghi vắn tắt khoản này là gì giúp mình nhé.");
      return;
    }
    const ok = await store.create({
      amount,
      description,
      spentOn: String(data.get("spentOn") || ""),
      category: String(data.get("category") || "other") as ExpenseCategory,
      courseId: String(data.get("courseId") || "") || undefined,
    });
    if (ok) {
      form.reset();
      setNotice("Đã ghi khoản chi.");
    }
  }

  if (store.loading) {
    return (
      <Panel title="Student budget" icon={<WalletIcon />}>
        <p role="status" className="empty-message">
          Đang mở sổ chi tiêu…
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Student budget" icon={<WalletIcon />}>
      <p className="view-label">
        <WalletIcon /> {PERIOD_LABELS[period]}
        <span className="example-label">Illustrative budget · VND</span>
      </p>

      {store.error && (
        <p role="alert" className="error-message">
          {store.error}
          <button className="text-button" type="button" onClick={store.reload}>
            <ArrowPathIcon /> Retry budget
          </button>
        </p>
      )}

      <fieldset className="period-switch">
        <legend className="sr-only">Chọn khoảng thời gian</legend>
        {PERIODS.map((value) => (
          <label key={value} className={period === value ? "is-active" : ""}>
            <input
              type="radio"
              name="period"
              value={value}
              checked={period === value}
              onChange={() => setPeriod(value)}
            />
            {PERIOD_LABELS[value]}
          </label>
        ))}
      </fieldset>

      <div ref={ref} className={revealClass(revealed)}>
        <dl className="budget-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <dt>Đã chi {PERIOD_LABELS[period].toLowerCase()}</dt>
            <dd>{money.format(total)} ₫</dd>
          </div>
          <div>
            <dt>Số khoản</dt>
            <dd>{visible.length}</dd>
          </div>
          <div>
            <dt>Khoản lớn nhất</dt>
            <dd>
              {money.format(
                visible.reduce((max, item) => Math.max(max, item.amount), 0),
              )}{" "}
              ₫
            </dd>
          </div>
        </dl>

        {byCourse.length > 0 && (
          <section aria-labelledby="spend-by-course">
            <h3 id="spend-by-course" className="exam-group">
              Chi theo môn học
            </h3>
            <ul className="budget-bars">
              {byCourse.map((row) => (
                <li key={row.key}>
                  <label htmlFor={`spend-${row.key}`}>
                    {row.slug ? (
                      <a href={`#courses/${row.slug}`}>
                        {row.name} <ArrowUpRightIcon aria-hidden="true" />
                      </a>
                    ) : (
                      row.name
                    )}
                    <span>{money.format(row.total)} ₫</span>
                  </label>
                  {/* Scaled against the biggest subject rather than a planned
                      budget: there is no plan stored, and inventing one would
                      put a number on screen that means nothing. */}
                  <progress
                    id={`spend-${row.key}`}
                    value={row.total}
                    max={largest}
                  >
                    {Math.round((row.total / (largest || 1)) * 100)}%
                  </progress>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="expense-list">
          <h3 id="expense-list" className="exam-group">
            Các khoản đã ghi
          </h3>
          {visible.length ? (
            <ul className="expense-list">
              {visible.map((item) => (
                <li key={item.id} data-focus-id={item.id}>
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
                      {item.course_code && <span>{item.course_code}</span>}
                    </small>
                  </span>
                  <DeleteExpense
                    expense={item}
                    busy={store.busy}
                    onDelete={() => void store.remove(item.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            !store.error && (
              <p className="empty-message">
                Chưa ghi khoản nào trong {PERIOD_LABELS[period].toLowerCase()}.
                Thử đổi sang khoảng thời gian khác, hoặc ghi khoản đầu tiên bên
                dưới.
              </p>
            )
          )}
        </section>
      </div>

      <form
        className="exam-form grid grid-cols-1 sm:grid-cols-2 gap-4"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Amount (₫)
          <input
            name="amount"
            type="number"
            min={1}
            step={1}
            placeholder="35000"
            required
          />
        </label>
        <label>
          Date
          <input name="spentOn" type="date" required />
        </label>
        <label className="sm:col-span-2">
          Description
          <input
            name="description"
            placeholder="Ví dụ: In tài liệu ôn thi"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          Category
          <select name="category" defaultValue="books">
            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Course
          <select name="courseId" defaultValue="">
            <option value="">Không thuộc môn nào</option>
            {courses.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} ({course.code})
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={store.busy}>
          <PlusIcon />
          {store.busy ? "Đang lưu…" : "Add expense"}
        </button>
        <p role="status">{notice}</p>
      </form>

      <p className="page-note">
        Đây là sổ chi tiêu minh hoạ của workspace, không kết nối với tài khoản
        ngân hàng nào và không phải số liệu tài chính thật.
      </p>
    </Panel>
  );
}
