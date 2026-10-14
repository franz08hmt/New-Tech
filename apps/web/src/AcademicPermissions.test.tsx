import type { ReactNode } from "react";
import type { Course, Exam, Expense, StudyPlan } from "./api";
import type { PilotPrincipal as VerifiedPrincipal } from "@examate/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { BudgetPanel } from "./BudgetPanel";
import { CourseDetail } from "./CourseDetail";
import { ExamsPanel } from "./ExamsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { configurePilotClient } from "./pilot-client";
import { StudyPlanPanel } from "./StudyPlanPanel";
import { useCourses } from "./use-courses";
import { useDocuments } from "./use-documents";
import { useExams, type ExamsState } from "./use-exams";
import { useExpenses, type ExpensesState } from "./use-expenses";
import { useStudyPlans, type StudyPlansState } from "./use-study-plans";

vi.mock("./use-courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-courses")>()),
  useCourses: vi.fn(),
}));
vi.mock("./use-exams", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-exams")>()),
  useExams: vi.fn(),
}));
vi.mock("./use-study-plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-study-plans")>()),
  useStudyPlans: vi.fn(),
}));
vi.mock("./use-expenses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-expenses")>()),
  useExpenses: vi.fn(),
}));
vi.mock("./use-documents", () => ({ useDocuments: vi.fn() }));

const timestamp = "2026-10-14T00:00:00.000Z";
const course: Course = {
  id: "course-1",
  slug: "cs-201",
  name: "Công nghệ phần mềm",
  code: "CS 201",
  detail: "Thiết kế và kiểm thử phần mềm theo nhóm.",
  progress: 62,
  tone: "slate",
  cover: "/img/course-cs.webp",
  cover_alt: "Không gian học tập",
  outline: [{ title: "Phân tích yêu cầu", summary: "Xác định phạm vi." }],
  outcomes: ["Giải thích luồng đi của một tính năng."],
  assessment: [
    { method: "Thực hành", weight_percent: 100, description: "Demo." },
  ],
  created_at: timestamp,
  updated_at: timestamp,
};
const courseFields = {
  course_id: course.id,
  course_slug: course.slug,
  course_name: course.name,
  course_code: course.code,
  created_at: timestamp,
  updated_at: timestamp,
};
const exam: Exam = {
  ...courseFields,
  id: "exam-upcoming",
  topic: "Architecture midterm",
  exam_date: "2099-10-20",
  exam_time: "09:00",
  room: "A201",
  revision_note: "Review architecture decisions",
};
const pastExam: Exam = {
  ...exam,
  id: "exam-past",
  topic: "Past architecture exam",
  exam_date: "2020-01-01",
};
const plan: StudyPlan = {
  ...courseFields,
  id: "plan-open",
  title: "Review sequence diagrams",
  detail: "Check the login flow",
  due_date: "2099-10-19",
  owner_name: "Tài",
  completed_at: null,
};
const completedPlan: StudyPlan = {
  ...plan,
  id: "plan-done",
  title: "Read API contract",
  completed_at: timestamp,
};
const expense: Expense = {
  ...courseFields,
  id: "expense-1",
  amount: 35000,
  description: "Printed course notes",
  spent_on: "2026-10-14",
  category: "books",
};
const oldExpense: Expense = {
  ...expense,
  id: "expense-old",
  description: "Previous term textbook",
  spent_on: "2020-01-01",
};

let exams: ExamsState;
let plans: StudyPlansState;
let expenses: ExpensesState;

type Role = VerifiedPrincipal["role"];
function principal(role: Role): VerifiedPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role,
  };
}
function withPrincipal(children: ReactNode, role?: Role) {
  return (
    <PilotPrincipalContext.Provider value={role ? principal(role) : undefined}>
      {children}
    </PilotPrincipalContext.Provider>
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function fillExam(detail = false) {
  if (!detail) change("Course", course.id);
  change("Exam name", "New architecture exam");
  change(detail ? "Exam date" : "Date", "2099-10-21");
  change(detail ? "Exam time" : "Time", "10:00");
  change(detail ? "Exam room" : "Room", "B102");
}
function fillPlan(detail = false) {
  if (!detail) change("Course", course.id);
  change("What to revise", "Review authorization flow");
  change(detail ? "Revision due date" : "Due date", "2099-10-21");
}
function fillExpense(detail = false) {
  if (!detail) change("Course", course.id);
  change(detail ? "Expense amount" : "Amount (₫)", "45000");
  change(detail ? "Expense description" : "Description", "New course textbook");
  change(detail ? "Expense date" : "Date", "2026-10-14");
}
function expectUnavailableButton(name: string) {
  const button = screen.queryByRole("button", { name });
  if (button) expect(button).toBeDisabled();
}
function expectNoAcademicMutation() {
  for (const mutation of [
    exams.create,
    exams.update,
    exams.remove,
    plans.create,
    plans.setCompletion,
    plans.remove,
    expenses.create,
    expenses.remove,
  ]) {
    expect(mutation).not.toHaveBeenCalled();
  }
}
function expectReadOnlyForm(form: HTMLFormElement) {
  if (!form.isConnected) return;
  for (const field of form.querySelectorAll(
    "input, select, textarea, button",
  )) {
    if (field.getAttribute("type") !== "button") expect(field).toBeDisabled();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T08:00:00.000Z"));
  exams = {
    exams: [exam, pastExam],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(async () => true),
    update: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
  plans = {
    plans: [plan, completedPlan],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(async () => true),
    setCompletion: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
  expenses = {
    expenses: [expense, oldExpense],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
  vi.mocked(useCourses).mockReturnValue({
    courses: [course],
    loading: false,
    error: null,
    retry: vi.fn(),
  });
  vi.mocked(useExams).mockReturnValue(exams);
  vi.mocked(useStudyPlans).mockReturnValue(plans);
  vi.mocked(useExpenses).mockReturnValue(expenses);
  vi.mocked(useDocuments).mockReturnValue({
    documents: [],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    upload: vi.fn(async () => true),
    setCourse: vi.fn(async () => true),
  });
});
afterEach(() => {
  cleanup();
  configurePilotClient();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const standalone = [
  {
    name: "exams",
    view: () => <ExamsPanel />,
    add: "Add exam",
    fill: () => fillExam(),
    mutation: () => exams.create,
  },
  {
    name: "study plans",
    view: () => <StudyPlanPanel />,
    add: "Add revision item",
    fill: () => fillPlan(),
    mutation: () => plans.create,
  },
  {
    name: "finances",
    view: () => <BudgetPanel />,
    add: "Add expense",
    fill: () => fillExpense(),
    mutation: () => expenses.create,
  },
] as const;

describe("Academic permissions from the verified session principal", () => {
  describe.each(standalone)("$name", ({ view, add, fill, mutation }) => {
    it.each(["viewer", undefined] as const)(
      "makes creation unavailable for %s, with a Vietnamese explanation",
      (role) => {
        render(withPrincipal(view(), role));
        expectUnavailableButton(add);
        expect(screen.getByText(/quyền xem/i)).toBeVisible();
        expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
      },
    );

    it("blocks a forced submit after a member becomes a viewer", async () => {
      const rendered = render(withPrincipal(view(), "member"));
      fill();
      const oldForm = screen
        .getByRole("button", { name: add })
        .closest("form")!;
      rendered.rerender(withPrincipal(view(), "viewer"));

      // Dispatch submit directly: disabled submit buttons alone do not protect
      // a retained form's handler from programmatic events.
      await act(async () => {
        fireEvent.submit(oldForm);
      });
      expect(mutation()).not.toHaveBeenCalled();
      expectUnavailableButton(add);
      expectReadOnlyForm(oldForm);

      rendered.rerender(withPrincipal(view(), "member"));
      const freshForm = screen
        .getByRole("button", { name: add })
        .closest("form")!;
      const draftField = freshForm.querySelector<HTMLInputElement>(
        'input[name="topic"], input[name="title"], input[name="description"]',
      )!;
      expect(draftField).toHaveValue("");
    });

    it.each(["viewer", undefined] as const)(
      "does not invoke creation on a forced change, click or submit for %s",
      async (role) => {
        render(withPrincipal(view(), role));
        const button = screen.queryByRole("button", { name: add });
        if (button) {
          fill();
          const form = button.closest("form")!;
          await act(async () => {
            fireEvent.click(button);
            fireEvent.submit(form);
          });
        }
        expect(mutation()).not.toHaveBeenCalled();
        expectUnavailableButton(add);
      },
    );

    it.each(["member", "manager"] as const)(
      "preserves creation for %s",
      async (role) => {
        render(withPrincipal(view(), role));
        fill();
        const addButton = screen.getByRole("button", { name: add });
        expect(addButton).toBeEnabled();
        await act(async () => {
          fireEvent.click(addButton);
        });
        expect(mutation()).toHaveBeenCalledOnce();
        expect(mutation()).toHaveBeenCalledWith(
          expect.objectContaining({ courseId: course.id }),
        );
      },
    );
  });

  it.each(["viewer", "member", undefined] as const)(
    "shows no delete affordance for %s in featured, past, revision and finance rows",
    (role) => {
      render(
        withPrincipal(
          <>
            <ExamsPanel />
            <StudyPlanPanel />
            <BudgetPanel />
          </>,
          role,
        ),
      );
      expect(screen.getByText(exam.topic)).toBeVisible();
      expect(screen.getByText(pastExam.topic)).toBeVisible();
      expect(screen.getByText(plan.title)).toBeVisible();
      expect(screen.getByText(expense.description)).toBeVisible();
      expect(
        screen.queryAllByRole("button", { name: /^Delete / }),
      ).toHaveLength(0);
    },
  );

  it.each(["viewer", undefined] as const)(
    "prevents exam edits and revision completion for %s",
    (role) => {
      render(
        withPrincipal(
          <>
            <ExamsPanel />
            <StudyPlanPanel />
          </>,
          role,
        ),
      );
      const complete = screen.getByRole("button", {
        name: `Mark as done: ${plan.title}`,
      });
      const reopen = screen.getByRole("button", {
        name: `Mark as not done: ${completedPlan.title}`,
      });
      // Exercise handlers before the disabled assertions, so RED exposes a
      // real forbidden mutation rather than only a missing attribute.
      fireEvent.click(complete);
      fireEvent.click(reopen);
      expect(plans.setCompletion).not.toHaveBeenCalled();
      expect(complete).toBeDisabled();
      expect(reopen).toBeDisabled();
      expectUnavailableButton(`Edit exam: ${exam.topic}`);
    },
  );

  it.each(["member", "manager"] as const)(
    "preserves exam editing and revision complete/reopen for %s",
    async (role) => {
      render(
        withPrincipal(
          <>
            <ExamsPanel />
            <StudyPlanPanel />
          </>,
          role,
        ),
      );
      fireEvent.click(
        screen.getByRole("button", { name: `Edit exam: ${exam.topic}` }),
      );
      const edit = screen.getByRole("form", {
        name: `Edit exam: ${exam.topic}`,
      });
      fireEvent.change(within(edit).getByLabelText("Exam name"), {
        target: { value: "Updated architecture midterm" },
      });
      await act(async () => {
        fireEvent.submit(edit);
      });
      expect(exams.update).toHaveBeenCalledExactlyOnceWith(exam.id, {
        topic: "Updated architecture midterm",
        examDate: exam.exam_date,
        examTime: exam.exam_time,
        room: exam.room,
        revisionNote: exam.revision_note,
      });
      fireEvent.click(
        screen.getByRole("button", { name: `Mark as done: ${plan.title}` }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: `Mark as not done: ${completedPlan.title}`,
        }),
      );
      expect(plans.setCompletion).toHaveBeenCalledWith(plan.id, true);
      expect(plans.setCompletion).toHaveBeenCalledWith(completedPlan.id, false);
    },
  );

  it("blocks forced edit submission and completion after member becomes viewer", async () => {
    const view = () => (
      <>
        <ExamsPanel />
        <StudyPlanPanel />
      </>
    );
    const rendered = render(withPrincipal(view(), "member"));
    fireEvent.click(
      screen.getByRole("button", { name: `Edit exam: ${exam.topic}` }),
    );
    const edit = screen.getByRole("form", { name: `Edit exam: ${exam.topic}` });
    fireEvent.change(within(edit).getByLabelText("Exam name"), {
      target: { value: "Revoked member edit" },
    });
    rendered.rerender(withPrincipal(view(), "viewer"));
    await act(async () => {
      fireEvent.submit(edit);
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Mark as done: ${plan.title}` }),
    );
    expect(exams.update).not.toHaveBeenCalled();
    expect(plans.setCompletion).not.toHaveBeenCalled();
    expectReadOnlyForm(edit as HTMLFormElement);
    expect(
      screen.queryByRole("form", { name: `Edit exam: ${exam.topic}` }),
    ).toBeNull();
    expectUnavailableButton(`Edit exam: ${exam.topic}`);
  });

  it("keeps viewer budget filtering, course links and retries available", () => {
    exams.error = "Exam connection unavailable";
    plans.error = "Plan connection unavailable";
    expenses.error = "Budget connection unavailable";
    render(
      withPrincipal(
        <>
          <ExamsPanel />
          <StudyPlanPanel />
          <BudgetPanel />
        </>,
        "viewer",
      ),
    );
    const allPeriods = screen.getByRole("radio", { name: "Tất cả" });
    expect(allPeriods).toBeEnabled();
    expect(screen.queryByText(oldExpense.description)).toBeNull();
    fireEvent.click(allPeriods);
    expect(screen.getByText(oldExpense.description)).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: course.name }).length,
    ).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: course.name })) {
      expect(link).toHaveAttribute("href", `#courses/${course.slug}`);
    }
    fireEvent.click(screen.getByRole("button", { name: "Retry exams" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry study plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry budget" }));
    expect(exams.reload).toHaveBeenCalledOnce();
    expect(plans.reload).toHaveBeenCalledOnce();
    expect(expenses.reload).toHaveBeenCalledOnce();
    expectNoAcademicMutation();
  });

  it("keeps compact viewer navigation available with read-only wording", () => {
    render(
      withPrincipal(
        <>
          <ExamsPanel compact />
          <StudyPlanPanel compact />
        </>,
        "viewer",
      ),
    );
    expect(screen.getByRole("link", { name: "View exams" })).toHaveAttribute(
      "href",
      "#exams",
    );
    expect(
      screen.getByRole("link", { name: "View revision items" }),
    ).toHaveAttribute("href", "#study-plan");
    expect(screen.queryByRole("link", { name: /^Add/ })).toBeNull();
    expect(screen.getAllByText(/quyền xem/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: `Mark as done: ${plan.title}` }),
    ).toBeDisabled();
  });

  it("lets a manager confirm deletion of each academic entity", async () => {
    render(
      withPrincipal(
        <>
          <ExamsPanel />
          <StudyPlanPanel />
          <BudgetPanel />
        </>,
        "manager",
      ),
    );
    for (const [label, mutation, id] of [
      [`Delete exam: ${exam.topic}`, exams.remove, exam.id],
      [`Delete exam: ${pastExam.topic}`, exams.remove, pastExam.id],
      [`Delete revision item: ${plan.title}`, plans.remove, plan.id],
      [`Delete expense: ${expense.description}`, expenses.remove, expense.id],
    ] as const) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeEnabled();
      const confirmation = button.closest("li, article")!;
      fireEvent.click(button);
      await act(async () => {
        fireEvent.click(
          within(confirmation as HTMLElement).getByRole("button", {
            name: "Xoá",
          }),
        );
      });
      expect(mutation).toHaveBeenCalledWith(id);
    }
  });

  it.each(standalone)(
    "revokes an open $name delete confirmation when manager becomes member",
    async ({ name, view }) => {
      const label =
        name === "exams"
          ? `Delete exam: ${exam.topic}`
          : name === "study plans"
            ? `Delete revision item: ${plan.title}`
            : `Delete expense: ${expense.description}`;
      const rendered = render(withPrincipal(view(), "manager"));
      fireEvent.click(screen.getByRole("button", { name: label }));
      const oldConfirm = screen.getByRole("button", {
        name: "Xoá",
      });
      rendered.rerender(withPrincipal(view(), "member"));
      await act(async () => {
        fireEvent.click(oldConfirm);
      });
      expectNoAcademicMutation();
      expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    },
  );
});

describe("Academic permissions in the real course detail workspace", () => {
  const detail = () => <CourseDetail course={course} />;

  it.each(["viewer", undefined] as const)(
    "keeps %s course reading and navigation while preventing academic writes",
    (role) => {
      render(withPrincipal(detail(), role));
      expect(
        screen.getByRole("heading", { name: "At a glance" }),
      ).toBeVisible();
      expect(screen.getByText(exam.topic)).toBeVisible();
      expect(screen.getByText(plan.title)).toBeVisible();
      expect(screen.getByText(expense.description)).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Back to course gallery" }),
      ).toHaveAttribute("href", "#courses");
      expect(
        screen.getByRole("link", { name: "Mở trang Documents" }),
      ).toHaveAttribute("href", "#documents");
      for (const name of ["Add exam", "Add revision item", "Add expense"])
        expectUnavailableButton(name);
      expect(
        screen.queryAllByRole("button", { name: /^Delete / }),
      ).toHaveLength(0);
      const complete = screen.getByRole("button", {
        name: `Mark as done: ${plan.title}`,
      });
      fireEvent.click(complete);
      expect(plans.setCompletion).not.toHaveBeenCalled();
      expect(complete).toBeDisabled();
      expect(screen.getAllByText(/quyền xem/i).length).toBeGreaterThan(0);
    },
  );

  it("hides every academic delete control for a member in the course detail", () => {
    render(withPrincipal(detail(), "member"));
    expect(screen.queryAllByRole("button", { name: /^Delete / })).toHaveLength(
      0,
    );
    for (const name of ["Add exam", "Add revision item", "Add expense"])
      expect(screen.getByRole("button", { name })).toBeEnabled();
  });

  it.each(["member", "manager"] as const)(
    "preserves all course-specific creation and completion for %s",
    async (role) => {
      render(withPrincipal(detail(), role));
      fillExam(true);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Add exam" }));
      });
      expect(exams.create).toHaveBeenCalledExactlyOnceWith({
        courseId: course.id,
        topic: "New architecture exam",
        examDate: "2099-10-21",
        examTime: "10:00",
        room: "B102",
      });
      fillPlan(true);
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Add revision item" }),
        );
      });
      expect(plans.create).toHaveBeenCalledExactlyOnceWith({
        courseId: course.id,
        title: "Review authorization flow",
        dueDate: "2099-10-21",
      });
      fillExpense(true);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
      });
      expect(expenses.create).toHaveBeenCalledExactlyOnceWith({
        courseId: course.id,
        amount: 45000,
        description: "New course textbook",
        spentOn: "2026-10-14",
        category: "books",
      });
      fireEvent.click(
        screen.getByRole("button", { name: `Mark as done: ${plan.title}` }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: `Mark as not done: ${completedPlan.title}`,
        }),
      );
      expect(plans.setCompletion).toHaveBeenCalledWith(plan.id, true);
      expect(plans.setCompletion).toHaveBeenCalledWith(completedPlan.id, false);
    },
  );

  it("rejects all retained course form submissions and completion after a member becomes viewer", async () => {
    const rendered = render(withPrincipal(detail(), "member"));
    fillExam(true);
    fillPlan(true);
    fillExpense(true);
    const oldForms = ["Add exam", "Add revision item", "Add expense"].map(
      (name) => screen.getByRole("button", { name }).closest("form")!,
    );
    rendered.rerender(withPrincipal(detail(), "viewer"));
    await act(async () => {
      for (const form of oldForms) fireEvent.submit(form);
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Mark as done: ${plan.title}` }),
    );
    expectNoAcademicMutation();
    for (const form of oldForms) expectReadOnlyForm(form);
    for (const name of ["Add exam", "Add revision item", "Add expense"])
      expectUnavailableButton(name);

    rendered.rerender(withPrincipal(detail(), "member"));
    expect(screen.getByLabelText("Exam name")).toHaveValue("");
    expect(screen.getByLabelText("What to revise")).toHaveValue("");
    expect(screen.getByLabelText("Expense description")).toHaveValue("");
  });

  it("preserves a manager's course-specific academic delete confirmations", async () => {
    render(withPrincipal(detail(), "manager"));
    for (const [label, mutation, id] of [
      [`Delete exam: ${exam.topic}`, exams.remove, exam.id],
      [`Delete revision item: ${plan.title}`, plans.remove, plan.id],
      [`Delete expense: ${expense.description}`, expenses.remove, expense.id],
    ] as const) {
      const button = screen.getByRole("button", { name: label });
      const row = button.closest("li")!;
      fireEvent.click(button);
      await act(async () => {
        fireEvent.click(within(row).getByRole("button", { name: "Xoá" }));
      });
      expect(mutation).toHaveBeenCalledWith(id);
    }
  });

  it("revokes a course delete confirmation when manager becomes member", async () => {
    const rendered = render(withPrincipal(detail(), "manager"));
    fireEvent.click(
      screen.getByRole("button", { name: `Delete exam: ${exam.topic}` }),
    );
    const oldConfirm = screen.getByRole("button", { name: "Xoá" });
    rendered.rerender(withPrincipal(detail(), "member"));
    await act(async () => {
      fireEvent.click(oldConfirm);
    });
    expectNoAcademicMutation();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
  });
});

describe("Academic ROLE_FORBIDDEN transport regression", () => {
  it("surfaces Vietnamese permission denial while preserving the authenticated session", async () => {
    const denied = vi.fn();
    configurePilotClient("a".repeat(43), true, denied);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              code: "ROLE_FORBIDDEN",
              message: "Bạn chỉ có quyền xem lịch thi trong workspace này.",
              requestId: "academic-write-denied",
            },
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(Response.json([exam])),
    );
    await expect(
      api.updateExam(exam.id, {
        topic: exam.topic,
        examDate: exam.exam_date,
        examTime: exam.exam_time,
        room: exam.room,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        code: "ROLE_FORBIDDEN",
        status: 403,
        requestId: "academic-write-denied",
        message: expect.stringContaining("Bạn chỉ có quyền xem"),
      }),
    );
    expect(denied).not.toHaveBeenCalled();
    await expect(api.listExams()).resolves.toEqual([exam]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
