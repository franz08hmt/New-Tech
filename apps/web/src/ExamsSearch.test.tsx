import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exam, ExamSearchPage } from "./api";
import { api } from "./api";
import { ExamsSearchPanel } from "./ExamsSearchPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useExams } from "./use-exams";
import type { ReactNode } from "react";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};

const sample: Exam = {
  id: "exam-1",
  course_id: "course-1",
  course_slug: "cs-201",
  course_name: "Computer Science",
  course_code: "CS 201",
  topic: "API contract exam",
  exam_date: "2027-01-15",
  exam_time: "09:30",
  room: "Room A201",
  revision_note: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};

function page(items: Exam[], total: number, current = 1): ExamSearchPage {
  return {
    items,
    page: current,
    pageSize: 20,
    total,
    totalPages: total ? Math.ceil(total / 20) : 0,
  };
}

function Wrapper({
  children,
  role = "member",
}: {
  children: ReactNode;
  role?: "manager" | "member" | "viewer";
}) {
  return (
    <PilotPrincipalContext.Provider value={{ ...principal, role }}>
      {children}
    </PilotPrincipalContext.Provider>
  );
}

function renderPanel(
  role: "manager" | "member" | "viewer" = "member",
  focusId?: string,
) {
  return render(
    <Wrapper role={role}>
      <ExamsSearchPanel focusId={focusId} />
    </Wrapper>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(api, "listCourses").mockResolvedValue([]);
});

describe("server-paged Exams route", () => {
  it("loads bounded pages and resets to page one for course and date filters", async () => {
    const search = vi
      .spyOn(api, "searchExams")
      .mockImplementation(async (query) => {
        if (query.page === 2)
          return page(
            [{ ...sample, id: "exam-2", topic: "Second page exam" }],
            25,
            2,
          );
        if (query.courseId || query.fromDate)
          return page([{ ...sample, topic: "Filtered exam" }], 1);
        return page(
          [sample, { ...sample, id: "exam-2", topic: "Second page exam" }],
          25,
        );
      });
    vi.spyOn(api, "listCourses").mockResolvedValue([
      {
        id: sample.course_id,
        slug: sample.course_slug,
        name: sample.course_name,
        code: sample.course_code,
        detail: "Course detail",
        progress: 50,
        tone: "slate",
        cover: "/img/course.webp",
        cover_alt: "Course",
        outline: [],
        outcomes: [],
        assessment: [],
        created_at: sample.created_at,
        updated_at: sample.updated_at,
      },
    ]);
    renderPanel();
    expect(await screen.findByText("API contract exam")).toBeVisible();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Second page exam")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Filter exams by course"), {
      target: { value: sample.course_id },
    });
    expect(await screen.findByText("Filtered exam")).toBeVisible();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ courseId: sample.course_id, page: 1 }),
      expect.any(AbortSignal),
    );
    fireEvent.change(screen.getByLabelText("Exams from date"), {
      target: { value: "2027-01-10" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ fromDate: "2027-01-10", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("blocks invalid date ranges before search and keeps the error distinct", async () => {
    const search = vi
      .spyOn(api, "searchExams")
      .mockResolvedValue(page([sample], 1));
    renderPanel();
    expect(await screen.findByText("API contract exam")).toBeVisible();
    const calls = search.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Exams to date"), {
      target: { value: "2027-01-10" },
    });
    fireEvent.change(screen.getByLabelText("Exams from date"), {
      target: { value: "2027-01-20" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "start date is not after the end date",
    );
    expect(search).toHaveBeenCalledTimes(calls);
  });

  it("discards old-principal results and uses a scoped lookup for a focused target", async () => {
    const search = vi.spyOn(api, "searchExams");
    let resolveOld!: (result: ExamSearchPage) => void;
    search.mockImplementationOnce(
      () => new Promise((resolve) => (resolveOld = resolve)),
    );
    search.mockResolvedValueOnce(
      page([{ ...sample, topic: "New workspace exam" }], 1),
    );
    const getExam = vi.spyOn(api, "getExam").mockResolvedValue({
      ...sample,
      id: "exam-outside-page",
      topic: "Focused exam",
    });
    const rendered = render(
      <Wrapper>
        <ExamsSearchPanel />
      </Wrapper>,
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    const newPrincipal = {
      ...principal,
      workspaceId: "33333333-3333-4333-8333-333333333333",
    };
    rendered.rerender(
      <PilotPrincipalContext.Provider value={newPrincipal}>
        <ExamsSearchPanel focusId="exam-outside-page" />
      </PilotPrincipalContext.Provider>,
    );
    expect(await screen.findByText("New workspace exam")).toBeVisible();
    expect(await screen.findByText("Focused exam")).toBeVisible();
    expect(getExam).toHaveBeenCalledWith(
      "exam-outside-page",
      expect.any(AbortSignal),
    );
    expect(
      screen.getByText(/separate from the current filtered page/),
    ).toBeVisible();
    await act(async () =>
      resolveOld(page([{ ...sample, topic: "Old workspace exam" }], 1)),
    );
    expect(screen.queryByText("Old workspace exam")).toBeNull();
  });

  it("does not restore a delayed focused record after the principal changes", async () => {
    vi.spyOn(api, "searchExams").mockResolvedValue(page([sample], 1));
    let resolveOld!: (exam: Exam) => void;
    const oldTarget = {
      ...sample,
      id: "old-target",
      topic: "Old tenant target",
    };
    const newTarget = {
      ...sample,
      id: "old-target",
      topic: "Current tenant target",
    };
    const getExam = vi
      .spyOn(api, "getExam")
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOld = resolve)),
      )
      .mockResolvedValueOnce(newTarget);
    const rendered = renderPanel("member", oldTarget.id);
    await waitFor(() => expect(getExam).toHaveBeenCalledTimes(1));

    rendered.rerender(
      <PilotPrincipalContext.Provider
        value={{
          ...principal,
          workspaceId: "33333333-3333-4333-8333-333333333333",
        }}
      >
        <ExamsSearchPanel focusId={oldTarget.id} />
      </PilotPrincipalContext.Provider>,
    );
    expect(await screen.findByText("Current tenant target")).toBeVisible();
    await act(async () => resolveOld(oldTarget));

    expect(screen.queryByText("Old tenant target")).toBeNull();
    expect(
      document.querySelectorAll(`[data-focus-id="${oldTarget.id}"]`),
    ).toHaveLength(1);
  });

  it("renders a focused exam once when it enters the current search page", async () => {
    const target = { ...sample, id: "exam-target", topic: "Target exam topic" };
    const search = vi
      .spyOn(api, "searchExams")
      .mockImplementation(async (query) =>
        query.q ? page([target], 1) : page([sample], 25),
      );
    const getExam = vi
      .spyOn(api, "getExam")
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ ...target, topic: "Fresh target exam" });

    renderPanel("member", target.id);
    expect(await screen.findByText("Target exam topic")).toBeVisible();
    expect(
      document.querySelectorAll(`[data-focus-id="${target.id}"]`),
    ).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Search exams"), {
      target: { value: "Target exam topic" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Target exam topic", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(
        document.querySelectorAll(`[data-focus-id="${target.id}"]`),
      ).toHaveLength(1),
    );

    fireEvent.change(screen.getByLabelText("Search exams"), {
      target: { value: "" },
    });
    expect(await screen.findByText("Fresh target exam")).toBeVisible();
    expect(getExam).toHaveBeenCalledTimes(2);
    expect(
      document.querySelectorAll(`[data-focus-id="${target.id}"]`),
    ).toHaveLength(1);
  });

  it("does not resurrect a delayed focused lookup after the target enters the page", async () => {
    const target = { ...sample, id: "exam-target", topic: "Target exam topic" };
    const search = vi
      .spyOn(api, "searchExams")
      .mockImplementation(async (query) =>
        query.q ? page([target], 1) : page([sample], 25),
      );
    let resolveLookup!: (exam: Exam) => void;
    vi.spyOn(api, "getExam").mockImplementation(
      () => new Promise((resolve) => (resolveLookup = resolve)),
    );

    renderPanel("member", target.id);
    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Search exams"), {
      target: { value: "Target exam topic" },
    });
    await screen.findByText("Target exam topic");
    await act(async () => resolveLookup(target));

    expect(
      document.querySelectorAll(`[data-focus-id="${target.id}"]`),
    ).toHaveLength(1);
    expect(
      screen.queryByText(/not available in the current workspace/i),
    ).toBeNull();
  });

  it("keeps viewer read-only while members can edit but not delete", async () => {
    vi.spyOn(api, "searchExams").mockResolvedValue(page([sample], 1));
    const viewer = renderPanel("viewer");
    expect(await screen.findByText("API contract exam")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit exam: API contract exam" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete exam: API contract exam" }),
    ).toBeNull();
    viewer.unmount();
    renderPanel("member");
    await screen.findByText("API contract exam");
    expect(
      screen.getByRole("button", { name: "Edit exam: API contract exam" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Delete exam: API contract exam" }),
    ).toBeNull();
  });

  it("does not load the unpaged list for admission-free search reads", () => {
    const legacyList = vi.spyOn(api, "listExams");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Wrapper>{children}</Wrapper>
    );
    const result = renderHook(() => useExams({ loadList: false }), { wrapper });
    expect(result.result.current.loading).toBe(false);
    expect(legacyList).not.toHaveBeenCalled();
  });
});
