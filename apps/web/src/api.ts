// The response shapes live in @examate/contracts, shared with the API, so the
// two sides cannot drift apart. They are re-exported here because the rest of
// the app already imports its types from "./api" — the module stays the single
// door to the backend, it just no longer owns a second copy of the shapes.
export type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantMode,
  AssistantReasonCode,
  AssistantStatus,
  Course,
  CourseAssessment,
  CourseTone,
  CourseTopic,
  DocumentProcessingResult,
  Exam,
  Expense,
  ExpenseCategory,
  HealthStatus,
  StoredDocument,
  StudyPlan,
  Task,
  TaskStatus,
} from "@examate/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
    readonly retryAt?: string,
  ) {
    super(`${message}${requestId ? ` (Request ID: ${requestId})` : ""}`);
    this.name = "ApiError";
  }
}
import { pilotHeaders, notifyPilotDenied } from "./pilot-client";
import type {
  PilotSessionResponse,
  PilotLoginRequest,
  PilotLogoutResponse,
} from "@examate/contracts";

import type {
  CreateAssistantFeedbackRequest,
  AssistantFeedbackReceipt,
  AssistantChatRequest,
  AssistantChatResponse,
  Course,
  DocumentProcessingResult,
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
  const authHeaders = pilotHeaders(path, init?.method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          ...(init?.body && !(init.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...init?.headers,
          ...authHeaders,
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
        code?: string;
        message?: string | string[];
        requestId?: string;
        retryAt?: string;
      } | null;
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message;
      const id = response.headers.get("X-Request-ID") ?? body?.requestId;
      if (!path.startsWith("/api/auth/")) notifyPilotDenied(body?.code ?? "");
      throw new ApiError(
        message ||
          ([502, 503, 504].includes(response.status)
            ? "Service is unavailable. Please retry."
            : `Request failed (${response.status}).`),
        body?.code || "REQUEST_FAILED",
        response.status,
        id,
        typeof body?.retryAt === "string" &&
          Number.isFinite(Date.parse(body.retryAt))
          ? body.retryAt
          : undefined,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  pilotSession: () => request<PilotSessionResponse>("/api/auth/session"),
  pilotLogin: (input: PilotLoginRequest) =>
    request<PilotSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  pilotLogout: () =>
    request<PilotLogoutResponse>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  pilotRefresh: () =>
    request<PilotSessionResponse>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  submitAssistantFeedback: (input: CreateAssistantFeedbackRequest) =>
    request<AssistantFeedbackReceipt>("/api/assistant/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  askAssistant: (input: AssistantChatRequest) =>
    request<AssistantChatResponse>("/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  updateExam: (
    id: string,
    input: {
      topic: string;
      examDate: string;
      examTime: string;
      room: string;
      revisionNote?: string;
    },
  ) =>
    request<Exam>(`/api/exams/${id}`, {
      method: "PATCH",
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
  uploadDocument: (file: File, courseId?: string) => {
    const body = new FormData();
    body.append("file", file);
    // Appended only when chosen: an empty string is not a UUID and the API
    // would reject the whole upload over an optional field.
    if (courseId) body.append("courseId", courseId);
    return request<StoredDocument>("/api/documents", { method: "POST", body });
  },
  setDocumentCourse: (id: string, courseId: string | null) =>
    request<StoredDocument>(`/api/documents/${id}/course`, {
      method: "PATCH",
      body: JSON.stringify({ courseId }),
    }),
  /**
   * A 60-second signed link to the PDF. By default it downloads the file under
   * its name; `inline` asks for one the browser shows instead, for a preview
   * or a reading tab. Keep the URL in memory only: its token is the access.
   */
  downloadDocument: (id: string, options: { inline?: boolean } = {}) =>
    request<{ url: string; expiresIn: number }>(
      `/api/documents/${id}/download${options.inline ? "?disposition=inline" : ""}`,
    ),
  processDocument: (id: string) =>
    request<DocumentProcessingResult>(`/api/documents/${id}/process`, {
      method: "POST",
    }),
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
