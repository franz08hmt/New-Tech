import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Expense, ExpenseSearchPage } from "./api";
import { courseSpendPercent, ExpensesSearchPanel } from "./ExpensesSearchPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { configurePilotClient } from "./pilot-client";

const firstExpense: Expense = {
  id: "expense-one",
  amount: 35000,
  description: "In tài liệu ôn thuật toán",
  spent_on: "2026-09-15",
  category: "books",
  course_id: "course-one",
  course_slug: "cs-201",
  course_name: "Công nghệ phần mềm",
  course_code: "CS 201",
  created_at: "2026-09-15T00:00:00.000Z",
  updated_at: "2026-09-15T00:00:00.000Z",
};
const secondExpense: Expense = {
  ...firstExpense,
  id: "expense-two",
  amount: 20000,
  description: "Cà phê ngồi học nhóm",
  spent_on: "2026-09-14",
  category: "food",
  course_id: null,
  course_slug: null,
  course_name: null,
  course_code: null,
};
const outsideExpense: Expense = {
  ...firstExpense,
  id: "expense-outside",
  description: "Khoản chi ngoài trang hiện tại",
  spent_on: "2026-08-20",
};

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager" as const,
};

function pageFor(url: string): ExpenseSearchPage {
  const params = new URL(url, "http://127.0.0.1").searchParams;
  const page = Number(params.get("page") ?? 1);
  return {
    items: page === 1 ? [firstExpense] : [secondExpense],
    page,
    pageSize: Number(params.get("pageSize") ?? 20),
    total: 2,
    totalPages: 2,
    summary: {
      totalAmount: "55000",
      largestAmount: "35000",
      byCourse: [
        {
          course_id: "course-one",
          course_slug: "cs-201",
          course_name: "Công nghệ phần mềm",
          course_code: "CS 201",
          totalAmount: "35000",
        },
        {
          course_id: null,
          course_slug: null,
          course_name: "Không thuộc môn nào",
          course_code: null,
          totalAmount: "20000",
        },
      ],
    },
  };
}

let responseFor: (url: string) => ExpenseSearchPage;

function mount(
  role: "manager" | "member" | "viewer" = "manager",
  focusId?: string,
) {
  return render(
    <PilotPrincipalContext.Provider value={{ ...principal, role }}>
      <ExpensesSearchPanel focusId={focusId} />
    </PilotPrincipalContext.Provider>,
  );
}

describe("ExpensesSearchPanel", () => {
  let calls: string[];
  let outsideLookupCalls: number;
  let outsideLookupFails: boolean;

  beforeEach(() => {
    calls = [];
    outsideLookupCalls = 0;
    outsideLookupFails = false;
    responseFor = pageFor;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-15T08:00:00.000Z"));
    configurePilotClient("a".repeat(43), true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/courses")
          return Response.json([
            {
              id: "course-one",
              slug: "cs-201",
              name: "Công nghệ phần mềm",
              code: "CS 201",
            },
          ]);
        if (url.startsWith("/api/expenses/search"))
          return Response.json(responseFor(url));
        if (url === "/api/expenses/expense-outside") {
          outsideLookupCalls++;
          if (outsideLookupFails)
            return Response.json({ message: "not found" }, { status: 404 });
          return Response.json(outsideExpense);
        }
        return Response.json({ message: "not found" }, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    configurePilotClient();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses bounded server pages and keeps all-filtered aggregates stable", async () => {
    mount();
    expect(await screen.findByText("In tài liệu ôn thuật toán")).toBeVisible();
    expect(screen.getByText("55.000 ₫")).toBeVisible();
    expect(calls.some((call) => call === "GET /api/expenses")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    expect(await screen.findByText("Cà phê ngồi học nhóm")).toBeVisible();
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.includes("/api/expenses/search?") && call.includes("page=2"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText("55.000 ₫")).toBeVisible();
    expect(calls.some((call) => call === "GET /api/expenses")).toBe(false);
  });

  it("sends date, category, course, sort and search filters to the server", async () => {
    mount();
    await screen.findByText("In tài liệu ôn thuật toán");

    fireEvent.change(screen.getByLabelText("Danh mục"), {
      target: { value: "books" },
    });
    await waitFor(() =>
      expect(calls.some((call) => call.includes("category=books"))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Môn học"), {
      target: { value: "unassigned" },
    });
    fireEvent.change(screen.getByLabelText("Sắp xếp khoản chi"), {
      target: { value: "amount" },
    });
    fireEvent.change(screen.getByLabelText("Tìm khoản chi"), {
      target: { value: "tài liệu" },
    });
    await waitFor(() =>
      expect(
        calls.some((call) => {
          if (!call.startsWith("GET /api/expenses/search")) return false;
          const params = new URL(call.slice(4), "http://127.0.0.1")
            .searchParams;
          return (
            params.get("category") === "books" &&
            params.get("courseId") === "unassigned" &&
            params.get("sort") === "amount" &&
            params.get("q") === "tài liệu" &&
            params.get("fromDate") === "2026-09-01"
          );
        }),
      ).toBe(true),
    );
    expect(calls.some((call) => call === "GET /api/expenses")).toBe(false);
  });

  it("loads a deep-link target outside the filtered page through scoped ID lookup", async () => {
    mount("manager", outsideExpense.id);
    expect(await screen.findByText(outsideExpense.description)).toBeVisible();
    expect(screen.getByText(/không khớp bộ lọc đang chọn/)).toBeInTheDocument();
    expect(
      calls.some((call) => call.includes(`/api/expenses/${outsideExpense.id}`)),
    ).toBe(true);
    expect(screen.getByText("55.000 ₫")).toBeVisible();
  });

  it("hides a focused expense as soon as the active page includes it", async () => {
    responseFor = (url) => {
      const params = new URL(url, "http://127.0.0.1").searchParams;
      const base = pageFor(url);
      return params.has("fromDate")
        ? base
        : {
            ...base,
            items: [firstExpense, outsideExpense],
            total: 2,
            totalPages: 1,
          };
    };
    mount("manager", outsideExpense.id);
    expect(await screen.findByText(outsideExpense.description)).toBeVisible();
    expect(
      document.querySelectorAll(`[data-focus-id="${outsideExpense.id}"]`),
    ).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Khoảng thời gian chi tiêu"), {
      target: { value: "all" },
    });
    await waitFor(() =>
      expect(
        calls.some((call) => {
          if (!call.startsWith("GET /api/expenses/search?")) return false;
          return !new URL(call.slice(4), "http://127.0.0.1").searchParams.has(
            "fromDate",
          );
        }),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll(`[data-focus-id="${outsideExpense.id}"]`),
      ).toHaveLength(1),
    );

    fireEvent.change(screen.getByLabelText("Khoảng thời gian chi tiêu"), {
      target: { value: "month" },
    });
    await waitFor(() => expect(outsideLookupCalls).toBe(2));
    expect(
      document.querySelectorAll(`[data-focus-id="${outsideExpense.id}"]`),
    ).toHaveLength(1);
  });

  it("hides a stale lookup error when the list later contains that expense", async () => {
    outsideLookupFails = true;
    responseFor = (url) => {
      const params = new URL(url, "http://127.0.0.1").searchParams;
      const base = pageFor(url);
      return params.has("fromDate")
        ? base
        : {
            ...base,
            items: [firstExpense, outsideExpense],
            total: 2,
            totalPages: 1,
          };
    };
    mount("manager", outsideExpense.id);
    expect(
      await screen.findByText(
        "This item is not available in the current workspace.",
      ),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Khoảng thời gian chi tiêu"), {
      target: { value: "all" },
    });
    expect(await screen.findByText(outsideExpense.description)).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByText(
          "This item is not available in the current workspace.",
        ),
      ).toBeNull(),
    );
    expect(
      document.querySelectorAll(`[data-focus-id="${outsideExpense.id}"]`),
    ).toHaveLength(1);
  });

  it("normalizes course bars against the largest filtered course total", async () => {
    const courseA = {
      ...firstExpense,
      id: "a-1",
      amount: 10000,
      course_id: "course-a",
      course_slug: "course-a",
      course_name: "Course A",
      course_code: "A",
    };
    const courseASecond = { ...courseA, id: "a-2" };
    const courseAThird = { ...courseA, id: "a-3", amount: 4000 };
    const courseB = {
      ...firstExpense,
      id: "b-1",
      amount: 10000,
      course_id: "course-b",
      course_slug: "course-b",
      course_name: "Course B",
      course_code: "B",
    };
    const summary = {
      totalAmount: "44000",
      largestAmount: "10000",
      byCourse: [
        {
          course_id: "course-a",
          course_slug: "course-a",
          course_name: "Course A",
          course_code: "A",
          totalAmount: "24000",
        },
        {
          course_id: "course-b",
          course_slug: "course-b",
          course_name: "Course B",
          course_code: "B",
          totalAmount: "20000",
        },
      ],
    };
    const courseBOtherExpenses = [
      ...Array.from({ length: 17 }, (_, index) => ({
        ...courseB,
        id: `b-small-${index + 1}`,
        amount: 500,
      })),
      { ...courseB, id: "b-final", amount: 1500 },
    ];
    const filteredExpenses = [
      courseA,
      courseASecond,
      courseAThird,
      courseB,
      ...courseBOtherExpenses,
    ];
    responseFor = (url) => {
      const page = Number(
        new URL(url, "http://127.0.0.1").searchParams.get("page") ?? 1,
      );
      return {
        items: filteredExpenses.slice((page - 1) * 20, page * 20),
        page,
        pageSize: 20,
        total: filteredExpenses.length,
        totalPages: 2,
        summary,
      };
    };

    mount();
    await screen.findByText("Course A");
    const courseAProgress = document.getElementById(
      "spend-course-a",
    ) as HTMLProgressElement;
    const courseBProgress = document.getElementById(
      "spend-course-b",
    ) as HTMLProgressElement;
    expect(Number(courseAProgress.getAttribute("value"))).toBe(100);
    expect(Number(courseBProgress.getAttribute("value"))).toBeCloseTo(83.33, 2);
    expect(screen.getByText(/so với môn có tổng chi cao nhất/)).toBeVisible();
    const largest = screen
      .getByText("Khoản lớn nhất trong kết quả")
      .parentElement!.querySelector("dd");
    expect(largest).toHaveTextContent("10.000 ₫");

    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(screen.getByText("Trang 2 / 2")).toBeVisible());
    expect(Number(courseBProgress.getAttribute("value"))).toBeCloseTo(83.33, 2);
    expect(Number(courseAProgress.getAttribute("value"))).toBe(100);
    expect(largest).toHaveTextContent("10.000 ₫");
  });

  it("keeps bar percentages finite for empty, zero, equal, and large values", () => {
    expect(courseSpendPercent("0", "0")).toBe(0);
    expect(courseSpendPercent("0", "24")).toBe(0);
    expect(courseSpendPercent("24", "24")).toBe(100);
    expect(courseSpendPercent("20000", "24000")).toBeCloseTo(83.33, 2);
    const veryLarge = "900719925474099300000000000000";
    expect(courseSpendPercent(veryLarge, veryLarge)).toBe(100);
    expect(courseSpendPercent("0", veryLarge)).toBe(0);
  });

  it("gives tied top-spending courses equal full-length bars", async () => {
    const courseA = {
      ...firstExpense,
      id: "equal-a",
      amount: 12000,
      course_id: "course-a",
      course_slug: "course-a",
      course_name: "Course A",
      course_code: "A",
    };
    const courseB = {
      ...courseA,
      id: "equal-b",
      course_id: "course-b",
      course_slug: "course-b",
      course_name: "Course B",
      course_code: "B",
    };
    responseFor = () => ({
      items: [courseA, courseB],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      summary: {
        totalAmount: "24000",
        largestAmount: "12000",
        byCourse: [
          {
            course_id: "course-a",
            course_slug: "course-a",
            course_name: "Course A",
            course_code: "A",
            totalAmount: "12000",
          },
          {
            course_id: "course-b",
            course_slug: "course-b",
            course_name: "Course B",
            course_code: "B",
            totalAmount: "12000",
          },
        ],
      },
    });
    mount();
    await screen.findByText("Course A");
    expect(
      Number(document.getElementById("spend-course-a")?.getAttribute("value")),
    ).toBe(100);
    expect(
      Number(document.getElementById("spend-course-b")?.getAttribute("value")),
    ).toBe(100);
  });

  it("renders an empty aggregate without a progress bar or invalid number", async () => {
    responseFor = () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      summary: { totalAmount: "0", largestAmount: "0", byCourse: [] },
    });
    mount();
    expect(
      await screen.findByText("Không có khoản chi khớp bộ lọc này."),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("keeps viewer read-only while preserving filtered reads", async () => {
    mount("viewer");
    expect(await screen.findByText("In tài liệu ôn thuật toán")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Delete expense:/ }),
    ).toBeNull();
    expect(
      calls.some((call) => call.startsWith("GET /api/expenses/search")),
    ).toBe(true);
  });
});
