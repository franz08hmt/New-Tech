import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, HealthStatus, Task, TaskStatus } from "./api";

const statusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function formatDate(date: string | null) {
  if (!date) return "No due date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date.slice(0, 10)}T00:00:00`));
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRows, healthResult] = await Promise.all([
        api.listTasks(),
        api.health(),
      ]);
      setTasks(taskRows);
      setHealth(healthResult);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load workspace",
      );
      setHealth({ status: "degraded", database: "unavailable" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const completed = useMemo(
    () => tasks.filter((task) => task.status === "done").length,
    [tasks],
  );
  const progress =
    tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3) {
      setError("Task title must contain at least three characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const task = await api.createTask({
        title: title.trim(),
        ownerName: ownerName.trim() || undefined,
        dueDate: dueDate || undefined,
        evidenceType: "milestone",
      });
      setTasks((current) => [task, ...current]);
      setTitle("");
      setOwnerName("");
      setDueDate("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create task",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    const previous = tasks;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item)),
    );
    try {
      const updated = await api.updateTaskStatus(task.id, status);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? updated : item)),
      );
    } catch (caught) {
      setTasks(previous);
      setError(
        caught instanceof Error ? caught.message : "Could not update task",
      );
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-hidden="true">
          CM
        </div>
        <div className="brand-copy">
          <strong>CourseMate AI</strong>
          <span>Final project workspace</span>
        </div>
        <nav aria-label="Primary navigation">
          <a className="nav-link active" href="#workspace">
            Workspace
          </a>
          <a className="nav-link" href="#tasks">
            Tasks
          </a>
          <a className="nav-link" href="#assistant">
            Assistant
          </a>
          <a className="nav-link" href="#evidence">
            Evidence
          </a>
        </nav>
        <div className="sidebar-note">
          <span>Release gate</span>
          <strong>Baseline build</strong>
          <small>Conventional application before AI integration</small>
        </div>
      </aside>

      <main id="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Team workspace</p>
            <h1>Final project control room</h1>
          </div>
          <div
            className={`service-state ${health?.status === "ok" ? "online" : "offline"}`}
          >
            <span aria-hidden="true" />
            {health?.status === "ok"
              ? "API and database online"
              : "Local services offline"}
          </div>
        </header>

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadWorkspace()}>
              Retry
            </button>
          </div>
        )}

        <section className="summary-grid" aria-label="Project summary">
          <article className="summary-card emphasis">
            <span>Milestone progress</span>
            <strong>{progress}%</strong>
            <div
              className="progress-track"
              aria-label={`${progress}% complete`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>
              {completed} of {tasks.length} tracked tasks complete
            </small>
          </article>
          <article className="summary-card">
            <span>Evidence gaps</span>
            <strong>
              {tasks.filter((task) => task.status !== "done").length}
            </strong>
            <small>Open work still needs review or proof</small>
          </article>
          <article className="summary-card">
            <span>AI boundary</span>
            <strong>RAG</strong>
            <small>
              Provider disabled until the evaluation baseline is ready
            </small>
          </article>
        </section>

        <div className="workspace-grid">
          <section className="panel task-panel" id="tasks">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Current milestone</p>
                <h2>Team tasks</h2>
              </div>
              <span>{tasks.length} items</span>
            </div>

            <form className="task-form" onSubmit={submitTask}>
              <label>
                Task title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Add acceptance test evidence"
                  maxLength={160}
                  required
                />
              </label>
              <label>
                Owner
                <input
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  placeholder="Member A"
                  maxLength={80}
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
              <button className="primary-button" disabled={saving}>
                {saving ? "Adding…" : "Add task"}
              </button>
            </form>

            <div className="task-list" aria-live="polite">
              {loading ? (
                <div className="empty-state">Loading project tasks…</div>
              ) : tasks.length === 0 ? (
                <div className="empty-state">
                  No tasks yet. Add the first project milestone above.
                </div>
              ) : (
                tasks.map((task) => (
                  <article className="task-row" key={task.id}>
                    <div
                      className={`status-glyph ${task.status}`}
                      aria-hidden="true"
                    />
                    <div className="task-copy">
                      <strong>{task.title}</strong>
                      <span>
                        {task.owner_name || "Unassigned"} ·{" "}
                        {formatDate(task.due_date)}
                      </span>
                    </div>
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={(event) =>
                        void changeStatus(
                          task,
                          event.target.value as TaskStatus,
                        )
                      }
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside className="panel assistant-panel" id="assistant">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Controlled AI</p>
                <h2>Ask CourseMate</h2>
              </div>
              <span className="planned-state">Planned</span>
            </div>
            <div className="assistant-message">
              <span className="assistant-avatar">AI</span>
              <p>
                The assistant will answer from approved project documents and
                show the source passage for every grounded claim.
              </p>
            </div>
            <label className="assistant-input">
              Question
              <textarea
                placeholder="What evidence is required before the final release gate?"
                disabled
              />
            </label>
            <button className="secondary-button" disabled>
              Ask after RAG setup
            </button>
            <div className="fallback-note">
              <strong>Failure behavior is visible from day one.</strong>
              <span>
                Task management remains available while the AI provider is
                disabled.
              </span>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
