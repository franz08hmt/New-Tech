export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  owner_name: string | null;
  status: TaskStatus;
  due_date: string | null;
  evidence_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
  databaseLatencyMs?: number;
}

export interface StoredDocument {
  id: string;
  name: string;
  size_bytes: number | null;
  media_type: string;
  storage_status: "stored" | "deleting" | "legacy";
  created_at: string;
  updated_at: string;
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init?.body && !(init.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new Error(
        controller.signal.aborted
          ? "Request timed out. Reload the list before retrying; the server may have saved your changes."
          : "Cannot reach the API. Check your connection and retry.",
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
        requestId?: string;
      } | null;
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message;
      const id = response.headers.get("X-Request-ID") ?? body?.requestId;
      throw new Error(
        `${message || ([502, 503, 504].includes(response.status) ? "Service is unavailable. Please retry." : `Request failed (${response.status}).`)}${id ? ` (Request ID: ${id})` : ""}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  listDocuments: () => request<StoredDocument[]>("/api/documents"),
  uploadDocument: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<StoredDocument>("/api/documents", { method: "POST", body });
  },
  downloadDocument: (id: string) =>
    request<{ url: string; expiresIn: number }>(
      `/api/documents/${id}/download`,
    ),
  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: "DELETE" }),
  health: () => request<HealthStatus>("/api/health"),
  listTasks: () => request<Task[]>("/api/tasks"),
  createTask: (input: {
    title: string;
    ownerName?: string;
    dueDate?: string;
    evidenceType?: string;
  }) =>
    request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTaskStatus: (id: string, status: TaskStatus) =>
    request<Task>(`/api/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
