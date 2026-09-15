// The response shapes live in @examate/contracts, shared with the API, so the
// two sides cannot drift apart. They are re-exported here because the rest of
// the app already imports its types from "./api" — the module stays the single
// door to the backend, it just no longer owns a second copy of the shapes.
export type {
  Course,
  CourseAssessment,
  CourseTone,
  CourseTopic,
  Exam,
  Expense,
  ExpenseCategory,
  HealthStatus,
  StoredDocument,
  StudyPlan,
  Task,
  TaskStatus,
} from "@examate/contracts";

import type {
  Course,
  Exam,
  Expense,
  ExpenseCategory,
  HealthStatus,
  StoredDocument,
  StudyPlan,
  Task,
  TaskStatus,
} from "@examate/contracts";
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
  listCourses: () => request<Course[]>("/api/courses"),
  getCourse: (slug: string) =>
    request<Course>(`/api/courses/${encodeURIComponent(slug)}`),
  listExams: () => request<Exam[]>("/api/exams"),
  createExam: (input: {
    courseId: string;
    topic: string;
    examDate: string;
    examTime: string;
    room: string;
    revisionNote?: string;
  }) =>
    request<Exam>("/api/exams", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteExam: (id: string) =>
    request<void>(`/api/exams/${id}`, { method: "DELETE" }),
  listExpenses: () => request<Expense[]>("/api/expenses"),
  createExpense: (input: {
    amount: number;
    description: string;
    spentOn: string;
    category: ExpenseCategory;
    courseId?: string;
  }) =>
    request<Expense>("/api/expenses", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteExpense: (id: string) =>
    request<void>(`/api/expenses/${id}`, { method: "DELETE" }),
  listStudyPlans: () => request<StudyPlan[]>("/api/study-plans"),
  createStudyPlan: (input: {
    courseId: string;
    title: string;
    detail?: string;
    dueDate?: string;
    ownerName?: string;
  }) =>
    request<StudyPlan>("/api/study-plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setStudyPlanCompletion: (id: string, completed: boolean) =>
    request<StudyPlan>(`/api/study-plans/${id}/completion`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),
  deleteStudyPlan: (id: string) =>
    request<void>(`/api/study-plans/${id}`, { method: "DELETE" }),
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
