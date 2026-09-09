import { useState, type FormEvent } from "react";
import {
  CheckIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "./AcademicPanels";
import type { Workspace } from "./use-workspace";
import type { TaskStatus } from "./api";

export function TasksPanel({
  workspace,
  expanded = false,
}: {
  workspace: Workspace;
  expanded?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const tasks = workspace.tasks.filter((task) =>
    expanded
      ? filter === "all" || task.status === filter
      : task.status !== "done",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (title.length < 3) {
      setNotice("Task title must contain at least three characters.");
      return;
    }
    const ok = await workspace.create({
      title,
      ownerName: String(data.get("ownerName") || "") || undefined,
      dueDate: String(data.get("dueDate") || "") || undefined,
      evidenceType: "milestone",
    });
    if (ok) {
      form.reset();
      setNotice("Task added successfully.");
    }
  }
  return (
    <Panel
      title={expanded ? "Team tasks" : "Urgent tasks"}
      warm={!expanded}
      icon={<ClipboardDocumentListIcon />}
    >
      <p className="view-label">
        <ClipboardDocumentListIcon />{" "}
        {expanded ? "Task list" : "Progress tasks"}
        <span>
          {workspace.tasks.filter((task) => task.status === "done").length}{" "}
          complete
        </span>
      </p>
      {workspace.error && (
        <p role="alert" className="error-message">
          {workspace.error}
          <button
            className="text-button"
            onClick={() => void workspace.reload()}
          >
            <ArrowPathIcon /> Retry
          </button>
        </p>
      )}
      {expanded && (
        <label className="filter-label">
          Status{" "}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All tasks</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>
      )}
      {workspace.loading ? (
        <p role="status" className="empty-message">
          Loading project tasks…
        </p>
      ) : tasks.length ? (
        <ul className="task-list">
          {(expanded ? tasks : tasks.slice(0, 4)).map((task) => (
            <li key={task.id}>
              <button
                className={`task-check ${task.status === "done" ? "checked" : ""}`}
                aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                disabled={workspace.busy}
                onClick={() =>
                  void workspace.update(
                    task.id,
                    task.status === "done" ? "todo" : "done",
                  )
                }
              >
                {task.status === "done" && <CheckIcon />}
              </button>
              <span className="task-copy">
                <strong>{task.title}</strong>
                <small>
                  {task.owner_name || "Unassigned"}{" "}
                  {task.due_date && (
                    <>
                      ·{" "}
                      <time dateTime={task.due_date}>
                        {task.due_date.slice(0, 10)}
                      </time>
                    </>
                  )}
                </small>
              </span>
              {expanded && (
                <select
                  aria-label={`Status for ${task.title}`}
                  value={task.status}
                  disabled={workspace.busy}
                  onChange={(event) =>
                    void workspace.update(
                      task.id,
                      event.target.value as TaskStatus,
                    )
                  }
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !workspace.error && (
          <p className="empty-message">
            {expanded
              ? "No tasks in this view. Add a project milestone below."
              : "Nothing urgent. A little room to breathe."}
          </p>
        )
      )}
      {expanded ? (
        <form
          className="task-form grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="sm:col-span-2">
            Task title
            <input
              name="title"
              placeholder="What’s the next small step?"
              minLength={3}
              maxLength={160}
              required
            />
          </label>
          <label>
            Owner
            <input name="ownerName" placeholder="Tài or Thắng" maxLength={80} />
          </label>
          <label>
            Due date
            <input name="dueDate" type="date" />
          </label>
          <button className="primary-button" disabled={workspace.busy}>
            <PlusIcon />
            {workspace.busy ? "Saving…" : "Add task"}
          </button>
          <p role="status">{notice}</p>
        </form>
      ) : (
        <a className="text-button" href="#tasks">
          <PlusIcon /> Add or view tasks
        </a>
      )}
    </Panel>
  );
}
