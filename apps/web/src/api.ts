// The response shapes live in @examate/contracts, shared with the API, so the
// two sides cannot drift apart. They are re-exported here because the rest of
// the app already imports its types from "./api" — the module stays the single
// door to the backend, it just no longer owns a second copy of the shapes.
export type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantStreamStage,
  AssistantStreamEvent,
  AssistantMode,
  AssistantReasonCode,
  AssistantStatus,
  Course,
  CourseAssessment,
  CourseTone,
  CourseTopic,
  DocumentSearchPage,
  DocumentSearchQuery,
  DocumentSearchSort,
  DocumentProcessingResult,
  Exam,
  Expense,
  ExpenseCategory,
  HealthStatus,
  SpeechLanguage,
  StoredDocument,
  SpeechStatusResponse,
  SpeechTranscriptionResponse,
  StudyPlan,
  Task,
  TaskStatus,
} from "@examate/contracts";
import { parseAssistantSse } from "./assistant-stream";

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
import {
  readPilotSession,
  changePilotSession,
} from "./pilot-session-transport";
import type {
  PilotSessionResponse,
  PilotLoginRequest,
  PilotLogoutResponse,
  PilotGoogleStart,
  PilotGoogleStatus,
} from "@examate/contracts";

import type {
  CreateAssistantFeedbackRequest,
  AssistantFeedbackReceipt,
  AssistantAnswerIdHeader,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantStreamStage,
  Course,
  DocumentSearchPage,
  DocumentSearchQuery,
  DocumentProcessingResult,
  Exam,
  Expense,
  ExpenseCategory,
  HealthStatus,
  SpeechLanguage,
  StoredDocument,
  SpeechStatusResponse,
  SpeechTranscriptionResponse,
  StudyPlan,
  Task,
  TaskStatus,
} from "@examate/contracts";
export async function request<T>(
  path: string,
  init?: RequestInit,
  onResponse?: (headers: Headers) => void,
): Promise<T> {
  const authHeaders = pilotHeaders(path, init?.method);
  const controller = new AbortController();
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  const timer = setTimeout(() => controller.abort(), 60000);
  const cancel = () => controller.abort();
  if (init?.signal?.aborted) cancel();
  init?.signal?.addEventListener("abort", cancel, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        signal,
        headers: {
          ...(init?.body && !(init.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...init?.headers,
          ...authHeaders,
        },
      });
    } catch {
      if (init?.signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
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
          (body?.code === "ROLE_FORBIDDEN"
            ? "Bạn đang có quyền xem. Nhờ thành viên hoặc người quản lý cập nhật công việc nhé."
            : undefined) ||
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
    if (response.status === 204) {
      if (init?.signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      return undefined as T;
    }
    const body = (await response.json()) as T;
    if (init?.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    onResponse?.(response.headers);
    return body;
  } catch (error) {
    if (init?.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error(
        "Request timed out. Reload the list before retrying; the server may have saved your changes.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", cancel);
  }
}

export const api = {
  speechStatus: (signal?: AbortSignal) =>
    request<SpeechStatusResponse>("/api/speech/status", { signal }),
  transcribeSpeech: (
    audio: Blob,
    signal: AbortSignal,
    language: SpeechLanguage = "auto",
  ) => {
    const mime = audio.type.split(";")[0];
    const extension =
      mime === "audio/webm" ? "webm" : mime.includes("wav") ? "wav" : "m4a";
    const body = new FormData();
    body.append("file", audio, `recording.${extension}`);
    body.append("language", language);
    return request<SpeechTranscriptionResponse>("/api/speech/transcriptions", {
      method: "POST",
      body,
      signal,
    });
  },
  pilotGoogleStatus: () =>
    request<PilotGoogleStatus>("/api/auth/google/status"),
  pilotGoogleStart: () =>
    changePilotSession(() =>
      request<PilotGoogleStart>("/api/auth/google/start", {
        method: "POST",
        body: "{}",
      }),
    ),
  pilotSession: () =>
    readPilotSession(() => request<PilotSessionResponse>("/api/auth/session")),
  pilotLogin: (input: PilotLoginRequest) =>
    changePilotSession(() =>
      request<PilotSessionResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ),
  pilotLogout: () =>
    changePilotSession(() =>
      request<PilotLogoutResponse>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    ),
  pilotRefresh: () =>
    changePilotSession(() =>
      request<PilotSessionResponse>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    ),
  submitAssistantFeedback: (input: CreateAssistantFeedbackRequest) =>
    request<AssistantFeedbackReceipt>("/api/assistant/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  askAssistant: (
    input: AssistantChatRequest,
    onAnswerId?: (id: string | undefined) => void,
    signal?: AbortSignal,
  ) =>
    request<AssistantChatResponse>(
      "/api/assistant/chat",
      {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      },
      (headers) => {
        const header: AssistantAnswerIdHeader = "X-Assistant-Answer-ID";
        const id = headers.get(header);
        onAnswerId?.(
          id &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              id,
            )
            ? id
            : undefined,
        );
      },
    ),
  streamAssistant: async (
    input: AssistantChatRequest,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    onStatus?: (stage: AssistantStreamStage) => void,
  ): Promise<{ response: AssistantChatResponse; answerId?: string }> => {
    const path = "/api/assistant/chat/stream";
    const authHeaders = pilotHeaders(path, "POST");
    const controller = new AbortController();
    let timedOut = false;
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    try {
      let response: Response;
      try {
        response = await fetch(path, {
          method: "POST",
          body: JSON.stringify(input),
          credentials: "same-origin",
          signal: combinedSignal,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...authHeaders,
          },
        });
      } catch {
        if (signal?.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        throw new Error(
          timedOut
            ? "AI phản hồi quá lâu. Bạn thử lại nhé."
            : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.",
        );
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string | string[];
          requestId?: string;
        } | null;
        notifyPilotDenied(body?.code ?? "");
        const message = Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message;
        throw new ApiError(
          message || `Request failed (${response.status}).`,
          body?.code || "REQUEST_FAILED",
          response.status,
          response.headers.get("X-Request-ID") ?? body?.requestId,
        );
      }
      if (
        !response.headers.get("Content-Type")?.startsWith("text/event-stream")
      )
        throw new Error("Máy chủ không mở được luồng trả lời realtime.");
      if (!response.body)
        throw new Error("Máy chủ không gửi dữ liệu streaming.");

      let started = false;
      let result:
        { response: AssistantChatResponse; answerId?: string } | undefined;
      for await (const event of parseAssistantSse(response.body)) {
        if (signal?.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        if (event.type === "start") {
          if (started || result)
            throw new Error("Máy chủ gửi trình tự streaming không hợp lệ.");
          started = true;
        } else if (event.type === "status") {
          if (!started || result)
            throw new Error("Máy chủ gửi trình tự streaming không hợp lệ.");
          onStatus?.(event.stage);
        } else if (event.type === "delta") {
          if (!started || result)
            throw new Error("Máy chủ gửi trình tự streaming không hợp lệ.");
          if (event.text) onDelta(event.text);
        } else if (event.type === "error") {
          notifyPilotDenied(event.code);
          throw new ApiError(
            event.message,
            event.code,
            502,
            response.headers.get("X-Request-ID") ?? undefined,
          );
        } else {
          if (!started || result)
            throw new Error("Máy chủ gửi trình tự streaming không hợp lệ.");
          result = {
            response: event.response,
            ...(event.answerId ? { answerId: event.answerId } : {}),
          };
        }
      }
      if (!result)
        throw new Error("Luồng kết thúc trước khi hoàn tất câu trả lời.");
      return result;
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (controller.signal.aborted && timedOut)
        throw new Error("AI phản hồi quá lâu. Bạn thử lại nhé.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },
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
  // Keep the unpaged legacy transport for Assistant/sidebar consumers. The
  // Documents screen opts into this bounded server query explicitly.
  searchDocuments: (query: DocumentSearchQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== null) params.set(key, String(value));
    const suffix = params.size ? `?${params.toString()}` : "";
    return request<DocumentSearchPage>(`/api/documents/search${suffix}`, {
      signal,
    });
  },
  listDocuments: () => request<StoredDocument[]>("/api/documents"),
  getDocument: (id: string, signal?: AbortSignal) =>
    request<StoredDocument>(`/api/documents/${encodeURIComponent(id)}`, {
      signal,
    }),
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
