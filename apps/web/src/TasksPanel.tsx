import { useCallback, useContext, useState, type FormEvent } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type { Task, TaskSearchPage, TaskSearchQuery, TaskStatus } from "./api";
import { api } from "./api";
import { Panel } from "./AcademicPanels";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import type { Workspace } from "./use-workspace";
import { usePagedSearch } from "./use-paged-search";
import { useScopedRecord } from "./use-scoped-record";
import { TaskStatusBadge } from "./WorkspaceBadges";
import { useTr } from "./i18n";

const INITIAL_SEARCH: TaskSearchQuery & { page: number; pageSize: number } = {
  q: "",
  status: "all",
  owner: undefined,
  sort: "due_date",
  direction: "asc",
  page: 1,
  pageSize: 20,
};

export function TasksPanel({
  workspace,
  expanded = false,
  focusId,
}: {
  workspace: Workspace;
  expanded?: boolean;
  focusId?: string;
}) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "anonymous";
  return expanded ? (
    <ExpandedTasks key={identity} workspace={workspace} focusId={focusId} />
  ) : (
    <DashboardTasks key={identity} workspace={workspace} />
  );
}

function DashboardTasks({ workspace }: { workspace: Workspace }) {
  const tr = useTr();
  const principal = useContext(PilotPrincipalContext);
  const canWrite =
    principal?.role === "member" || principal?.role === "manager";
  const tasks = workspace.tasks
    .filter((task) => task.status !== "done")
    .slice(0, 4);
  return (
    <Panel title={tr("Urgent tasks")} warm icon={<ClipboardDocumentListIcon />}>
      <p className="view-label">
        <ClipboardDocumentListIcon /> {tr("Progress tasks")}
        <span>
          {workspace.tasks.filter((task) => task.status === "done").length}{" "}
          {tr("complete")}
        </span>
      </p>
      {!canWrite && (
        <p className="page-note">
          {tr("You have read-only access to workspace tasks.")}
        </p>
      )}
      {workspace.loading ? (
        <p role="status" className="empty-message">
          {tr("Loading project tasks…")}
        </p>
      ) : workspace.error ? (
        <p role="alert" className="error-message">
          {workspace.error}
          <button
            className="text-button"
            disabled={workspace.busy}
            onClick={() => void workspace.reload()}
          >
            <ArrowPathIcon /> {tr("Retry")}
          </button>
        </p>
      ) : tasks.length ? (
        <TaskRows
          tasks={tasks}
          canWrite={canWrite}
          busy={workspace.busy}
          onUpdate={(task, status) => workspace.update(task.id, status)}
        />
      ) : (
        <p className="empty-message">
          {tr("Nothing urgent. A little room to breathe.")}
        </p>
      )}
      <a className="text-button" href="#tasks">
        {canWrite ? (
          <>
            <PlusIcon /> {tr("Add or view tasks")}
          </>
        ) : (
          <>
            <ClipboardDocumentListIcon /> {tr("View tasks")}
          </>
        )}
      </a>
    </Panel>
  );
}

function ExpandedTasks({
  workspace,
  focusId,
}: {
  workspace: Workspace;
  focusId?: string;
}) {
  const tr = useTr();
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const canWrite =
    principal?.role === "member" || principal?.role === "manager";
  const load = useCallback(
    (query: TaskSearchQuery, signal: AbortSignal) =>
      api.searchTasks(query, signal),
    [],
  );
  const search = usePagedSearch<
    Task,
    TaskSearchQuery & { page: number; pageSize: number },
    TaskSearchPage
  >(identity, INITIAL_SEARCH, load);
  const [ownerMode, setOwnerMode] = useState<"all" | "unassigned" | "named">(
    "all",
  );
  const [notice, setNotice] = useState("");
  const [focusRevision, setFocusRevision] = useState(0);
  const loadById = useCallback(
    (id: string, signal: AbortSignal) => api.getTask(id, signal),
    [],
  );
  const focused = useScopedRecord<Task>(
    identity,
    focusId,
    Boolean(search.page) && !search.loading,
    search.items.some((task) => task.id === focusId),
    loadById,
    focusRevision,
  );

  async function update(task: Task, status: TaskStatus) {
    const saved = await workspace.update(task.id, status);
    if (saved) {
      setNotice(tr("Task status updated."));
      search.refresh();
      setFocusRevision((revision) => revision + 1);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || workspace.busy) return;
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (title.length < 3) {
      setNotice(tr("Task title must contain at least three characters."));
      return;
    }
    if (
      await workspace.create({
        title,
        ownerName: String(data.get("ownerName") || "") || undefined,
        dueDate: String(data.get("dueDate") || "") || undefined,
        evidenceType: String(data.get("evidenceType") || "") || undefined,
      })
    ) {
      form.reset();
      setNotice(tr("Task added successfully."));
      search.refresh();
    }
  }

  return (
    <Panel title={tr("Team tasks")} icon={<ClipboardDocumentListIcon />}>
      <p className="view-label">
        <ClipboardDocumentListIcon /> {tr("Task list")}
        {search.page && (
          <span>
            {search.page.summary.done} / {search.page.summary.total}{" "}
            {tr("complete")}
          </span>
        )}
      </p>
      {!canWrite && (
        <p className="page-note">
          {tr(
            "You have read-only access. Ask a member or manager to update tasks.",
          )}
        </p>
      )}
      {workspace.error && (
        <p role="alert" className="error-message">
          {workspace.error}
        </p>
      )}

      <div className="paged-search-toolbar task-search-toolbar">
        <label className="paged-search-field">
          {tr("Search tasks")}
          <input
            aria-label={tr("Search tasks")}
            type="search"
            maxLength={120}
            value={search.query.q ?? ""}
            onChange={(event) => search.setQuery({ q: event.target.value })}
            placeholder={tr("Search title or owner")}
          />
        </label>
        <label>
          {tr("Status")}
          <select
            aria-label={tr("Filter tasks by status")}
            value={search.query.status ?? "all"}
            onChange={(event) =>
              search.setQuery({
                status: event.target.value as TaskSearchQuery["status"],
              })
            }
          >
            <option value="all">{tr("All tasks")}</option>
            <option value="todo">{tr("To do")}</option>
            <option value="in_progress">{tr("In progress")}</option>
            <option value="done">{tr("Done")}</option>
          </select>
        </label>
        <label>
          {tr("Owner")}
          <select
            aria-label={tr("Filter tasks by owner")}
            value={ownerMode}
            onChange={(event) => {
              const next = event.target.value as typeof ownerMode;
              setOwnerMode(next);
              search.setQuery({
                owner: next === "unassigned" ? "unassigned" : undefined,
              });
            }}
          >
            <option value="all">{tr("All owners")}</option>
            <option value="unassigned">{tr("Unassigned")}</option>
            <option value="named">{tr("Named owner…")}</option>
          </select>
        </label>
        {ownerMode === "named" && (
          <label>
            {tr("Owner name")}
            <input
              aria-label={tr("Owner name filter")}
              maxLength={80}
              value={search.query.owner ?? ""}
              onChange={(event) =>
                search.setQuery({ owner: event.target.value })
              }
            />
          </label>
        )}
        <label>
          {tr("Sort tasks by")}
          <select
            aria-label={tr("Sort tasks by")}
            value={search.query.sort ?? "due_date"}
            onChange={(event) =>
              search.setQuery({
                sort: event.target.value as TaskSearchQuery["sort"],
              })
            }
          >
            <option value="due_date">{tr("Due date")}</option>
            <option value="title">{tr("Title")}</option>
            <option value="status">{tr("Status")}</option>
            <option value="created_at">{tr("Created")}</option>
          </select>
        </label>
        <label>
          {tr("Direction")}
          <select
            aria-label={tr("Task sort direction")}
            value={search.query.direction ?? "asc"}
            onChange={(event) =>
              search.setQuery({
                direction: event.target.value as "asc" | "desc",
              })
            }
          >
            <option value="asc">{tr("Ascending")}</option>
            <option value="desc">{tr("Descending")}</option>
          </select>
        </label>
        <label>
          {tr("Page size")}
          <select
            aria-label={tr("Tasks per page")}
            value={search.query.pageSize}
            onChange={(event) =>
              search.setQuery({ pageSize: Number(event.target.value) })
            }
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setOwnerMode("all");
            search.setQuery({ ...INITIAL_SEARCH });
          }}
        >
          {tr("Reset filters")}
        </button>
      </div>

      {!identity ? (
        <p role="status" className="page-note">
          {tr("Sign in to view tasks.")}
        </p>
      ) : search.tooShort ? (
        <p role="status" className="page-note">
          {tr(
            "Enter at least two characters to search, or clear the field to browse all tasks.",
          )}
        </p>
      ) : search.unsupported ? (
        <p role="status" className="page-note">
          {tr(
            "This search text has no supported characters. Try a different term.",
          )}
        </p>
      ) : search.loading && !search.page ? (
        <p role="status" aria-busy="true" className="empty-message">
          {tr("Loading tasks…")}
        </p>
      ) : search.error ? (
        <p role="alert" className="error-message">
          {search.error}
          <button type="button" className="text-button" onClick={search.retry}>
            <ArrowPathIcon /> {tr("Retry tasks")}
          </button>
        </p>
      ) : (
        <>
          {focused.loading && (
            <p role="status" className="page-note">
              {tr("Loading linked task…")}
            </p>
          )}
          {focused.error && focusId && (
            <p role="status" className="page-note">
              {focused.error}
            </p>
          )}
          {focused.record &&
            !search.items.some((task) => task.id === focused.record?.id) && (
              <section
                className="focused-record-card"
                aria-label={tr("Linked task outside current results")}
              >
                <p className="page-note">
                  {tr(
                    "This linked task is outside the current page or filters.",
                  )}
                </p>
                <TaskRows
                  tasks={[focused.record]}
                  canWrite={canWrite}
                  busy={workspace.busy}
                  onUpdate={update}
                  focusedId={focusId}
                />
              </section>
            )}
          {search.items.length ? (
            <TaskRows
              tasks={search.items}
              canWrite={canWrite}
              busy={workspace.busy}
              onUpdate={update}
              focusedId={focusId}
            />
          ) : (
            <p className="empty-message">
              {search.page?.total
                ? tr("No tasks on this page.")
                : tr("No tasks match this search.")}
            </p>
          )}
          <nav className="document-pagination" aria-label={tr("Task pages")}>
            <button
              type="button"
              disabled={!search.page || search.page.page <= 1}
              onClick={() => search.setPage(search.query.page - 1)}
            >
              {tr("Previous")}
            </button>
            <span>
              {search.page
                ? tr("Page {page} of {totalPages} · {total} {noun}", {
                    page: search.page.page,
                    totalPages: search.page.totalPages || 1,
                    total: search.page.total,
                    noun: search.page.total === 1 ? tr("task") : tr("tasks"),
                  })
                : tr("0 tasks")}
            </span>
            <button
              type="button"
              aria-label={tr("Next")}
              disabled={
                !search.page || search.page.page >= search.page.totalPages
              }
              onClick={() => search.setPage(search.query.page + 1)}
            >
              {tr("Next")}
            </button>
          </nav>
        </>
      )}

      {canWrite && (
        <form
          className="task-form grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="sm:col-span-2">
            {tr("Task title")}
            <input
              name="title"
              placeholder={tr("What is the next small step?")}
              minLength={3}
              maxLength={160}
              required
            />
          </label>
          <label>
            {tr("Owner")}
            <input
              aria-label={tr("Task owner")}
              name="ownerName"
              placeholder={tr("Enter any owner name")}
              maxLength={80}
            />
          </label>
          <label>
            {tr("Due date")}
            <input name="dueDate" type="date" />
          </label>
          <label>
            {tr("Evidence type")}
            <input name="evidenceType" maxLength={80} />
          </label>
          <button className="primary-button" disabled={workspace.busy}>
            <PlusIcon />
            {workspace.busy ? tr("Saving…") : tr("Add task")}
          </button>
          <p role="status">{notice}</p>
        </form>
      )}
    </Panel>
  );
}

function TaskRows({
  tasks,
  canWrite,
  busy,
  onUpdate,
  focusedId,
}: {
  tasks: Task[];
  canWrite: boolean;
  busy: boolean;
  onUpdate: (task: Task, status: TaskStatus) => unknown;
  focusedId?: string;
}) {
  const tr = useTr();
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <li
          key={task.id}
          data-focus-id={task.id}
          data-focus-keyboard={focusedId === task.id ? "" : undefined}
          tabIndex={focusedId === task.id ? -1 : undefined}
        >
          <button
            type="button"
            className={`task-check ${task.status === "done" ? "checked" : ""}`}
            aria-label={`${task.status === "done" ? tr("Reopen") : tr("Complete")} ${task.title}`}
            disabled={busy || !canWrite}
            onClick={() =>
              canWrite &&
              void onUpdate(task, task.status === "done" ? "todo" : "done")
            }
          >
            {task.status === "done" && <CheckIcon />}
          </button>
          <span className="task-copy">
            <span className="task-title-line">
              <strong>{task.title}</strong>
              <TaskStatusBadge status={task.status} />
            </span>
            <small>
              {task.owner_name || tr("Unassigned")}
              {task.due_date && (
                <>
                  {" "}
                  ·{" "}
                  <time dateTime={task.due_date}>
                    {task.due_date.slice(0, 10)}
                  </time>
                </>
              )}
              {task.evidence_type && <> · {task.evidence_type}</>}
            </small>
          </span>
          <select
            className="task-status-select"
            aria-label={tr("Status for {title}", { title: task.title })}
            value={task.status}
            disabled={busy || !canWrite}
            onChange={(event) =>
              canWrite && void onUpdate(task, event.target.value as TaskStatus)
            }
          >
            <option value="todo">{tr("To do")}</option>
            <option value="in_progress">{tr("In progress")}</option>
            <option value="done">{tr("Done")}</option>
          </select>
        </li>
      ))}
    </ul>
  );
}
