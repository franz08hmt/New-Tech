import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PilotPrincipal } from "@examate/contracts";
import type { Course, StudyPlan, StudyPlanSearchPage } from "./api";
import { api } from "./api";
import { StudyPlansSearchPanel } from "./StudyPlansSearchPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { configurePilotClient } from "./pilot-client";

const principal: PilotPrincipal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager",
};

const plan: StudyPlan = {
  id: "plan-1",
  course_id: "course-1",
  course_slug: "cs-201",
  course_name: "Công nghệ phần mềm",
  course_code: "CS 201",
  title: "Review API contract",
  detail: "Check the workspace search boundary",
  due_date: "2026-10-24",
  owner_name: "Tài",
  completed_at: null,
  created_at: "2026-10-20T00:00:00.000Z",
  updated_at: "2026-10-20T00:00:00.000Z",
};

const course: Course = {
  id: "course-1",
  slug: "cs-201",
  name: "Công nghệ phần mềm",
  code: "CS 201",
  detail: "Synthetic course detail",
  progress: 35,
  tone: "slate",
  cover: "/img/course-cs.webp",
  cover_alt: "Course cover",
  outline: [],
  outcomes: [],
  assessment: [],
  created_at: "2026-10-20T00:00:00.000Z",
  updated_at: "2026-10-20T00:00:00.000Z",
};

function result(items = [plan]): StudyPlanSearchPage {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: 41,
    totalPages: 3,
    summary: {
      total: 41,
      completed: 13,
      remaining: 28,
    },
  };
}

function renderPanel(focusId?: string) {
  return render(
    <PilotPrincipalContext.Provider value={principal}>
      <StudyPlansSearchPanel focusId={focusId} />
    </PilotPrincipalContext.Provider>,
  );
}

describe("Study plans server-side search", () => {
  beforeEach(() => {
    configurePilotClient("a".repeat(43), true);
    vi.spyOn(api, "listCourses").mockResolvedValue([course]);
  });

  afterEach(() => {
    cleanup();
    configurePilotClient();
    vi.restoreAllMocks();
  });

  it("uses the bounded search endpoint, keeps all-match summary, and never loads the legacy list", async () => {
    const search = vi
      .spyOn(api, "searchStudyPlans")
      .mockResolvedValue(result());
    const legacy = vi.spyOn(api, "listStudyPlans");
    renderPanel();

    expect(await screen.findByText(/28 việc còn lại/)).toHaveTextContent(
      "13 đã xong trên toàn bộ kết quả lọc",
    );
    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        completion: "all",
        sort: "due_date",
      }),
      expect.any(AbortSignal),
    );
    expect(legacy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );

    fireEvent.change(screen.getByLabelText("Lọc trạng thái kế hoạch ôn tập"), {
      target: { value: "completed" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ completion: "completed", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Lọc việc ôn tập theo môn"), {
      target: { value: course.id },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ courseId: course.id, page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Lọc người phụ trách kế hoạch"), {
      target: { value: "unassigned" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ owner: "unassigned", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Sắp xếp kế hoạch ôn tập"), {
      target: { value: "title" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "title", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Hạn từ ngày"), {
      target: { value: "2026-10-21" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ dueFrom: "2026-10-21", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("refreshes after a confirmed completion write and retries only a failed read", async () => {
    const search = vi
      .spyOn(api, "searchStudyPlans")
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("fixture read failure"))
      .mockResolvedValue(
        result([{ ...plan, completed_at: "2026-10-20T08:00:00.000Z" }]),
      );
    const toggle = vi
      .spyOn(api, "setStudyPlanCompletion")
      .mockResolvedValue({ ...plan, completed_at: "2026-10-20T08:00:00.000Z" });
    const legacy = vi.spyOn(api, "listStudyPlans");
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mark as done: Review API contract",
      }),
    );
    await waitFor(() => expect(toggle).toHaveBeenCalledOnce());
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this list",
    );
    const callsBeforeRetry = search.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Thử tải lại" }));
    await waitFor(() =>
      expect(search).toHaveBeenCalledTimes(callsBeforeRetry + 1),
    );
    expect(legacy).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("loads a scoped deep-link target outside the current page without adding it to the result total", async () => {
    vi.spyOn(api, "searchStudyPlans").mockResolvedValue(result([]));
    const lookup = vi.spyOn(api, "getStudyPlan").mockResolvedValue(plan);
    renderPanel(plan.id);

    expect(
      await screen.findByRole("heading", { name: "Review API contract" }),
    ).toBeVisible();
    expect(screen.getByText(/không được cộng vào tổng/)).toBeVisible();
    expect(screen.getByText(/41 việc/)).toBeVisible();
    expect(lookup).toHaveBeenCalledWith(plan.id, expect.any(AbortSignal));
  });

  it("does not duplicate a deep-link target already present on the current page", async () => {
    vi.spyOn(api, "searchStudyPlans").mockResolvedValue(result());
    const lookup = vi.spyOn(api, "getStudyPlan");
    renderPanel(plan.id);

    expect(await screen.findByText(plan.title)).toBeVisible();
    expect(screen.getAllByText(plan.title)).toHaveLength(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});
