import type { PilotPrincipal, Task } from "@examate/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { configurePilotClient } from "./pilot-client";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { TasksPanel } from "./TasksPanel";
import type { Workspace } from "./use-workspace";

const task: Task = {
  id: "task-tai",
  title: "Review API contract",
  owner_name: "Tài",
  status: "todo",
  due_date: "2026-10-20",
  evidence_type: "proposal",
  created_at: "2026-10-13T00:00:00.000Z",
  updated_at: "2026-10-13T00:00:00.000Z",
};

function principal(role: PilotPrincipal["role"]): PilotPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role,
  };
}

function fixtureWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    tasks: [
      task,
      {
        ...task,
        id: "task-thang",
        title: "Prepare project demo",
        owner_name: "Thắng",
        status: "done",
      },
    ],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(async () => {}),
    create: vi.fn(async () => true),
    update: vi.fn(async () => {}),
    ...overrides,
  };
}

function taskView(
  workspace: Workspace,
  role?: PilotPrincipal["role"],
  expanded = true,
) {
  return (
    <PilotPrincipalContext.Provider value={role ? principal(role) : undefined}>
      <TasksPanel workspace={workspace} expanded={expanded} />
    </PilotPrincipalContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Task permissions", () => {
  it("lets a viewer read and filter tasks with a Vietnamese read-only explanation", () => {
    const workspace = fixtureWorkspace();
    render(taskView(workspace, "viewer"));

    expect(screen.getByText(/quyền xem/i)).toBeVisible();
    expect(screen.getByText(task.title)).toBeVisible();
    expect(screen.getByText("Prepare project demo")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(screen.getByLabelText("Status")).toBeEnabled();
    expect(screen.getByLabelText("Owner filter")).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Owner filter"), {
      target: { value: "Tài" },
    });
    expect(screen.getByText(task.title)).toBeVisible();
    expect(screen.queryByText("Prepare project demo")).toBeNull();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "done" },
    });
    expect(screen.getByText("No tasks match these filters.")).toBeVisible();
    expect(workspace.create).not.toHaveBeenCalled();
    expect(workspace.update).not.toHaveBeenCalled();
  });

  it("disables both viewer status controls and rejects attempted status changes", () => {
    const workspace = fixtureWorkspace();
    render(taskView(workspace, "viewer"));

    const complete = screen.getByRole("button", {
      name: `Complete ${task.title}`,
    });
    const status = screen.getByLabelText(`Status for ${task.title}`);
    expect(complete).toBeDisabled();
    expect(status).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reopen Prepare project demo" }),
    ).toBeDisabled();
    fireEvent.click(complete);
    fireEvent.change(status, { target: { value: "done" } });
    expect(workspace.update).not.toHaveBeenCalled();
  });

  it("fails closed when no server-verified principal is available", () => {
    const workspace = fixtureWorkspace();
    render(taskView(workspace));

    expect(screen.getByText(task.title)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(
      screen.getByRole("button", { name: `Complete ${task.title}` }),
    ).toBeDisabled();
    const status = screen.getByLabelText(`Status for ${task.title}`);
    expect(status).toBeDisabled();
    fireEvent.change(status, { target: { value: "done" } });
    expect(workspace.update).not.toHaveBeenCalled();
    expect(workspace.create).not.toHaveBeenCalled();
  });

  it("keeps viewer dashboard navigation and task retry available", () => {
    const workspace = fixtureWorkspace({ error: "Tasks are unavailable." });
    render(taskView(workspace, "viewer", false));

    expect(screen.getByText(/quyền xem/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "View tasks" })).toHaveAttribute(
      "href",
      "#tasks",
    );
    expect(screen.queryByRole("link", { name: /Add/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(workspace.reload).toHaveBeenCalledOnce();
    expect(workspace.create).not.toHaveBeenCalled();
    expect(workspace.update).not.toHaveBeenCalled();
  });

  it.each(["manager", "member"] as const)(
    "allows %s to create a task and change its status",
    async (role) => {
      const workspace = fixtureWorkspace();
      render(taskView(workspace, role));

      expect(screen.queryByText(/quyền xem/i)).toBeNull();
      const add = screen.getByRole("button", { name: "Add task" });
      const complete = screen.getByRole("button", {
        name: `Complete ${task.title}`,
      });
      const status = screen.getByLabelText(`Status for ${task.title}`);
      expect(add).toBeEnabled();
      expect(complete).toBeEnabled();
      expect(status).toBeEnabled();

      fireEvent.change(screen.getByLabelText("Task title"), {
        target: { value: "Build course page" },
      });
      fireEvent.change(screen.getByLabelText("Owner"), {
        target: { value: "Thắng" },
      });
      fireEvent.change(screen.getByLabelText("Due date"), {
        target: { value: "2026-10-21" },
      });
      fireEvent.change(screen.getByLabelText("Evidence type"), {
        target: { value: "architecture" },
      });
      fireEvent.click(add);
      await waitFor(() =>
        expect(screen.getByText("Task added successfully.")).toBeVisible(),
      );
      expect(workspace.create).toHaveBeenCalledExactlyOnceWith({
        title: "Build course page",
        ownerName: "Thắng",
        dueDate: "2026-10-21",
        evidenceType: "architecture",
      });
      expect(screen.getByLabelText("Task title")).toHaveValue("");

      fireEvent.change(status, { target: { value: "in_progress" } });
      expect(workspace.update).toHaveBeenCalledWith(task.id, "in_progress");
      fireEvent.click(complete);
      expect(workspace.update).toHaveBeenCalledWith(task.id, "done");
    },
  );

  it("removes a member's open draft when the verified role changes to viewer", () => {
    const workspace = fixtureWorkspace();
    const view = render(taskView(workspace, "member"));
    const title = screen.getByLabelText("Task title");
    fireEvent.change(title, { target: { value: "Previous member draft" } });
    const oldForm = title.closest("form")!;

    view.rerender(taskView(workspace, "viewer"));
    expect(screen.getByText(/quyền xem/i)).toBeVisible();
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
    expect(oldForm).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Complete ${task.title}` }),
    ).toBeDisabled();
    const status = screen.getByLabelText(`Status for ${task.title}`);
    expect(status).toBeDisabled();
    fireEvent.submit(oldForm);
    fireEvent.change(status, { target: { value: "done" } });
    expect(workspace.create).not.toHaveBeenCalled();
    expect(workspace.update).not.toHaveBeenCalled();

    view.rerender(taskView(workspace, "member"));
    expect(screen.getByLabelText("Task title")).toHaveValue("");
  });

  it("keeps the session usable after a Vietnamese ROLE_FORBIDDEN response", async () => {
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
              message: "Bạn chỉ có quyền xem công việc trong workspace này.",
              requestId: "viewer-write-denied",
            },
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(Response.json([task])),
    );

    await expect(api.updateTaskStatus(task.id, "done")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        code: "ROLE_FORBIDDEN",
        status: 403,
        requestId: "viewer-write-denied",
        message: expect.stringContaining("Bạn chỉ có quyền xem"),
      }),
    );
    expect(denied).not.toHaveBeenCalled();
    await expect(api.listTasks()).resolves.toEqual([task]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
