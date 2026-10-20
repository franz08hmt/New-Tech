import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course, CourseSearchItem, CourseSearchPage } from "./api";
import { api } from "./api";
import { PageSections } from "./PageSections";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import type { Workspace } from "./use-workspace";
import type { CoursesState } from "./use-courses";
import { useCourses } from "./use-courses";
import { useCourseLookup } from "./use-course-lookup";
import type { ReactNode } from "react";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};

function course(id: string, name = `Course ${id}`): CourseSearchItem {
  return {
    id,
    slug: id,
    name,
    code: `CS ${id}`,
    detail: "Synthetic course detail",
    progress: 40,
    tone: "slate",
    cover: "/img/fixture.webp",
    cover_alt: "Synthetic course",
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T00:00:00.000Z",
  };
}

function page(
  items: CourseSearchItem[],
  total: number,
  current = 1,
): CourseSearchPage {
  return {
    items,
    page: current,
    pageSize: 20,
    total,
    totalPages: total ? Math.ceil(total / 20) : 0,
  };
}

const workspace = {} as Workspace;
const legacyCourse: Course = {
  ...course("legacy", "Legacy course"),
  outline: [],
  outcomes: [],
  assessment: [],
};
const coursesState = {
  courses: [legacyCourse],
  loading: false,
  error: null,
  retry: vi.fn(),
} as unknown as CoursesState;
const courseLookup = {
  course: null,
  loading: false,
  error: null,
  retry: vi.fn(),
};

function view() {
  return (
    <PilotPrincipalContext.Provider value={principal}>
      <PageSections
        pageId="courses"
        coursesState={coursesState}
        courseLookup={courseLookup}
        workspace={workspace}
        onOpenAssistant={vi.fn()}
        onDocumentsChanged={vi.fn()}
      />
    </PilotPrincipalContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("server-paged Courses route", () => {
  it("loads bounded server pages and resets pagination when filters change", async () => {
    const search = vi.spyOn(api, "searchCourses");
    search.mockImplementation(async (query) => {
      if (query.page === 2) return page([course("page-two")], 25, 2);
      if (query.progressMin === 50)
        return page([course("filtered", "Filtered course")], 1);
      return page([course("page-one", "First page course")], 25);
    });
    render(view());

    expect(await screen.findByText("First page course")).toBeVisible();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Course page-two");
    fireEvent.change(screen.getByLabelText("Minimum progress"), {
      target: { value: "50" },
    });
    await screen.findByText("Filtered course");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressMin: 50, page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 course · page 1 of 1",
    );
  });

  it("does not let an old principal response replace the new course page", async () => {
    const search = vi.spyOn(api, "searchCourses");
    let resolveOld!: (result: CourseSearchPage) => void;
    search.mockImplementation((_query, signal) => {
      if (signal?.aborted)
        return Promise.reject(new DOMException("aborted", "AbortError"));
      if (search.mock.calls.length === 1)
        return new Promise((resolve) => (resolveOld = resolve));
      return Promise.resolve(page([course("new", "New principal course")], 1));
    });
    const rendered = render(view());
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    const newPrincipal = {
      ...principal,
      userId: "11111111-1111-4111-8111-111111111112",
    };
    rendered.rerender(
      <PilotPrincipalContext.Provider value={newPrincipal}>
        <PageSections
          pageId="courses"
          coursesState={coursesState}
          courseLookup={courseLookup}
          workspace={workspace}
          onOpenAssistant={vi.fn()}
          onDocumentsChanged={vi.fn()}
        />
      </PilotPrincipalContext.Provider>,
    );
    expect(await screen.findByText("New principal course")).toBeVisible();
    await act(async () =>
      resolveOld(page([course("old", "Old principal course")], 1)),
    );
    expect(screen.queryByText("Old principal course")).toBeNull();
  });

  it("keeps read errors distinct from an empty result and retries only the GET", async () => {
    const search = vi
      .spyOn(api, "searchCourses")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(page([], 0));
    render(view());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this list",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry courses" }));
    expect(
      await screen.findByText("No courses match this search."),
    ).toBeVisible();
    expect(search).toHaveBeenCalledTimes(2);
    expect(
      search.mock.calls.every((call) => call[1] instanceof AbortSignal),
    ).toBe(true);
    expect(
      screen.queryByRole("navigation", { name: "Course pages" }),
    ).toBeNull();
  });

  it("uses a scoped slug request for course details and discards an old target", async () => {
    const getCourse = vi.spyOn(api, "getCourse");
    let resolveOld!: (result: Course) => void;
    const detail = (slug: string): Course => ({
      ...legacyCourse,
      slug,
      name: `${slug} detail`,
    });
    getCourse
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOld = resolve)),
      )
      .mockResolvedValueOnce(detail("ma-210"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PilotPrincipalContext.Provider value={principal}>
        {children}
      </PilotPrincipalContext.Provider>
    );
    const lookup = renderHook(({ slug }) => useCourseLookup(slug), {
      initialProps: { slug: "cs-201" },
      wrapper,
    });
    expect(getCourse).toHaveBeenCalledWith("cs-201", expect.any(AbortSignal));
    lookup.rerender({ slug: "ma-210" });
    await waitFor(() =>
      expect(lookup.result.current.course?.slug).toBe("ma-210"),
    );
    await act(async () => resolveOld(detail("cs-201")));
    expect(lookup.result.current.course?.slug).toBe("ma-210");
  });

  it("does not load the unpaged course catalog when a page does not need it", () => {
    const list = vi.spyOn(api, "listCourses");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PilotPrincipalContext.Provider value={principal}>
        {children}
      </PilotPrincipalContext.Provider>
    );
    const result = renderHook(() => useCourses(false), { wrapper });
    expect(result.result.current.courses).toEqual([]);
    expect(result.result.current.loading).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });
});
