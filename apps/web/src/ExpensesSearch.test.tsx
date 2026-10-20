import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Expense, ExpenseSearchPage } from "./api";
import { ExpensesSearchPanel } from "./ExpensesSearchPanel";
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

  beforeEach(() => {
    calls = [];
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
          return Response.json(pageFor(url));
        if (url === "/api/expenses/expense-outside")
          return Response.json(outsideExpense);
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
