import { useCallback, useEffect, useState } from "react";
import { api, type Task, type TaskStatus } from "./api";

export function useWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await api.listTasks());
    } catch {
      setError(
        "Tasks are unavailable. Start the API and database, then retry.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function create(input: Parameters<typeof api.createTask>[0]) {
    setBusy(true);
    setError(null);
    try {
      const task = await api.createTask(input);
      setTasks((current) => [task, ...current]);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save task.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, status: TaskStatus) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTaskStatus(id, status);
      setTasks((current) =>
        current.map((task) => (task.id === id ? updated : task)),
      );
    } catch {
      setError("Could not update task. Your previous status has been kept.");
    } finally {
      setBusy(false);
    }
  }
  return { tasks, loading, error, busy, reload, create, update };
}
export type Workspace = ReturnType<typeof useWorkspace>;
