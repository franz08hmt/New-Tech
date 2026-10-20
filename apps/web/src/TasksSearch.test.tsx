import type { PilotPrincipal, Task, TaskSearchPage } from "@examate/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { TasksPanel } from "./TasksPanel";
import type { Workspace } from "./use-workspace";

const principal: PilotPrincipal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member",
};

function task(id: string, title: string): Task {
  return {
    id,
    title,
    owner_name: null,
    status: "todo",
    due_date: null,
    evidence_type: null,
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T00:00:00.000Z",
  };
}

function page(items: Task[], total: number, current = 1): TaskSearchPage {
  return {
    items,
    page: current,
    pageSize: 20,
    total,
    totalPages: total ? Math.ceil(total / 20) : 0,
    summary: { total, done: 0 },
  };
}

const workspace = {
  tasks: [],
  loading: false,
  error: null,
  busy: false,
  reload: vi.fn(async () => {}),
  create: vi.fn(async () => true),
  update: vi.fn(async () => {}),
} as unknown as Workspace;

const otherPrincipal: PilotPrincipal = {
  ...principal,
  userId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "22222222-2222-4222-8222-222222222223",
};

function view(focusId?: string, currentPrincipal = principal) {
  return (
    <PilotPrincipalContext.Provider value={currentPrincipal}>
      <TasksPanel workspace={workspace} expanded focusId={focusId} />
    </PilotPrincipalContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("server-paged tasks", () => {
  it("uses bounded server pages and starts a changed query at page one", async () => {
    const search = vi.spyOn(api, "searchTasks");
    search.mockImplementation(async (query) => {
      if (query.q === "single result")
        return page([task("one", "Single result")], 1);
      if (query.page === 2)
        return page([task("page-two", "Page two task")], 24, 2);
      return page([task("page-one", "Page one task")], 24);
    });
    render(view());
    await screen.findByText("Page one task");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, status: "all" }),
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page two task");
    fireEvent.change(screen.getByLabelText("Search tasks"), {
      target: { value: "single result" },
    });
    await screen.findByText("Single result");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "single result", page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/1 task$/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Search tasks"), {
      target: { value: "" },
    });
    await screen.findByText("Page one task");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "", page: 1 }),
      expect.any(AbortSignal),
    );
  });

  it("retries only the bounded GET and resolves a focused task outside the current page", async () => {
    const search = vi
      .spyOn(api, "searchTasks")
      .mockRejectedValueOnce(new Error("offline"));
    search.mockResolvedValue(page([task("page-one", "Page one task")], 31));
    const getTask = vi
      .spyOn(api, "getTask")
      .mockResolvedValue(task("deep-target", "Deep linked task"));
    render(view("deep-target"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this list",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry tasks" }));
    await screen.findByText("Page one task");
    expect(await screen.findByText("Deep linked task")).toBeVisible();
    expect(getTask).toHaveBeenCalledExactlyOnceWith(
      "deep-target",
      expect.any(AbortSignal),
    );
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/31 tasks/)).toBeVisible();
  });

  it("does not let an older page response replace the newer query", async () => {
    const search = vi.spyOn(api, "searchTasks");
    let resolveOld!: (result: TaskSearchPage) => void;
    search.mockImplementation((query) => {
      if (query.page === 2)
        return new Promise((resolve) => (resolveOld = resolve));
      if (query.q === "new query")
        return Promise.resolve(page([task("new", "New query task")], 1));
      return Promise.resolve(page([task("first", "First page task")], 24));
    });
    render(view());
    await screen.findByText("First page task");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Search tasks"), {
      target: { value: "new query" },
    });
    await screen.findByText("New query task");
    expect(screen.getByText("New query task")).toBeVisible();
    await act(async () =>
      resolveOld(page([task("old", "Old page task")], 24, 2)),
    );
    expect(screen.getByText("New query task")).toBeVisible();
    expect(screen.queryByText("Old page task")).toBeNull();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(3));
  });

  it("starts at page one and drops pending results when principal changes", async () => {
    const search = vi.spyOn(api, "searchTasks");
    let resolveOldPage!: (result: TaskSearchPage) => void;
    search.mockImplementation((query) => {
      if (query.page === 2)
        return new Promise((resolve) => (resolveOldPage = resolve));
      if (search.mock.calls.length > 1)
        return Promise.resolve(
          page([task("new-user", "New principal task")], 1),
        );
      return Promise.resolve(
        page([task("old-user", "Old principal task")], 24),
      );
    });
    const rendered = render(view());
    await screen.findByText("Old principal task");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );

    rendered.rerender(view(undefined, otherPrincipal));
    await screen.findByText("New principal task");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    await act(async () =>
      resolveOldPage(page([task("late", "Late old principal task")], 24, 2)),
    );
    expect(screen.getByText("New principal task")).toBeVisible();
    expect(screen.queryByText("Late old principal task")).toBeNull();
    expect(screen.queryByText("Old principal task")).toBeNull();
  });
});
