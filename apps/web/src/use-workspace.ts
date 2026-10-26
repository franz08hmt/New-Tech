import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Task, type TaskStatus } from "./api";
import { tl } from "./i18n";

export function useWorkspace(loadDashboardTasks = true) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const mutating = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!loadDashboardTasks || mutating.current) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const currentVersion = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const next = await api.listTasks(controller.signal);
      if (currentVersion === version.current) setTasks(next);
    } catch (caught) {
      if (currentVersion !== version.current || controller.signal.aborted)
        return;
      setError(
        `${tl("Tasks are unavailable.")} ${caught instanceof Error ? caught.message : tl("Please retry.")}`,
      );
    } finally {
      if (currentVersion === version.current) setLoading(false);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [loadDashboardTasks]);
  useEffect(() => {
    if (loadDashboardTasks) {
      void reload();
    } else {
      activeRequest.current?.abort();
      version.current++;
      setTasks([]);
      setError(null);
      setLoading(false);
    }
    return () => {
      version.current++;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadDashboardTasks, reload]);
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
        caught instanceof Error ? caught.message : tl("Could not save task."),
      );
      return false;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function update(id: string, status: TaskStatus): Promise<boolean> {
    if (mutating.current) return false;
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
      return true;
    } catch (caught) {
      setError(
        `${tl("Could not update task. Your previous status has been kept.")} ${caught instanceof Error ? caught.message : ""}`,
      );
      return false;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  return { tasks, loading, error, busy, reload, create, update };
}
export type Workspace = ReturnType<typeof useWorkspace>;
