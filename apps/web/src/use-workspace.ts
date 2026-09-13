import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Task, type TaskStatus } from "./api";

export function useWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const mutating = useRef(false);
  const reload = useCallback(async () => {
    if (mutating.current) return;
    const currentVersion = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const next = await api.listTasks();
      if (currentVersion === version.current) setTasks(next);
    } catch (caught) {
      if (currentVersion !== version.current) return;
      setError(
        `Tasks are unavailable. ${caught instanceof Error ? caught.message : "Please retry."}`,
      );
    } finally {
      if (currentVersion === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => {
      version.current++;
    };
  }, [reload]);
  async function create(input: Parameters<typeof api.createTask>[0]) {
    if (mutating.current) return false;
    mutating.current = true;
    version.current++;
    setLoading(false);
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
      mutating.current = false;
      setBusy(false);
    }
  }
  async function update(id: string, status: TaskStatus) {
    if (mutating.current) return;
    mutating.current = true;
    version.current++;
    setLoading(false);
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTaskStatus(id, status);
      setTasks((current) =>
        current.map((task) => (task.id === id ? updated : task)),
      );
    } catch (caught) {
      setError(
        `Could not update task. Your previous status has been kept. ${caught instanceof Error ? caught.message : ""}`,
      );
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  return { tasks, loading, error, busy, reload, create, update };
}
export type Workspace = ReturnType<typeof useWorkspace>;
