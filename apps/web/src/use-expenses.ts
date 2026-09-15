import { useCallback, useEffect, useState } from "react";
import { api, type Expense, type ExpenseCategory } from "./api";

export type Period = "day" | "week" | "month";

export interface ExpensesState {
  expenses: Expense[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  create: (input: {
    amount: number;
    description: string;
    spentOn: string;
    category: ExpenseCategory;
    courseId?: string;
  }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

/** Vietnamese labels for the fixed category keys stored in the database. */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  books: "Sách & tài liệu",
  transport: "Đi lại",
  food: "Ăn uống",
  supplies: "Dụng cụ",
  fees: "Học phí & lệ phí",
  other: "Khác",
};

export const PERIOD_LABELS: Record<Period, string> = {
  day: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
};

/**
 * First calendar day of the period containing `today`.
 *
 * Calendar periods, not rolling windows: "tuần này" that quietly means "bảy
 * ngày qua" gives a different total every day and cannot be checked against
 * anything. The week starts on Monday, as it does in Vietnam.
 *
 * Everything is compared as a "YYYY-MM-DD" string. Expense dates arrive that
 * way from the API, and string comparison on that format sorts identically to
 * date comparison while sidestepping timezones entirely.
 */
export function periodStart(period: Period, today: Date): string {
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  if (period === "month") return toKey(new Date(year, month, 1));
  if (period === "day") return toKey(new Date(year, month, day));
  const weekday = (today.getDay() + 6) % 7; // Monday = 0
  return toKey(new Date(year, month, day - weekday));
}

function toKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function inPeriod(
  expenses: Expense[],
  period: Period,
  today: Date,
): Expense[] {
  const start = periodStart(period, today);
  const end = toKey(today);
  return expenses.filter(
    (item) => item.spent_on >= start && item.spent_on <= end,
  );
}

export interface CourseSpend {
  key: string;
  name: string;
  slug: string | null;
  total: number;
}

/** Total per subject, with unassigned spending kept visible as its own row. */
export function spendByCourse(expenses: Expense[]): CourseSpend[] {
  const totals = new Map<string, CourseSpend>();
  for (const item of expenses) {
    const key = item.course_id ?? "unassigned";
    let row = totals.get(key);
    if (!row) {
      row = {
        key,
        name: item.course_name ?? "Không thuộc môn nào",
        slug: item.course_slug,
        total: 0,
      };
      totals.set(key, row);
    }
    row.total += item.amount;
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export function useExpenses(): ExpensesState {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  const reload = useCallback(() => setRequestNumber((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .listExpenses()
      .then((result) => {
        if (active) setExpenses(result);
      })
      .catch(() => {
        if (active) {
          setExpenses([]);
          setError(
            "Chưa xem được các khoản chi. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestNumber]);

  const create = useCallback<ExpensesState["create"]>(async (input) => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createExpense(input);
      setExpenses((current) =>
        [created, ...current].sort((a, b) =>
          b.spent_on.localeCompare(a.spent_on),
        ),
      );
      return true;
    } catch {
      setError("Chưa lưu được khoản chi. Xem lại thông tin rồi thử lại nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback<ExpensesState["remove"]>(async (id) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteExpense(id);
      setExpenses((current) => current.filter((item) => item.id !== id));
      return true;
    } catch {
      setError("Chưa xoá được khoản chi. Thử lại một lần nữa nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { expenses, loading, busy, error, reload, create, remove };
}
