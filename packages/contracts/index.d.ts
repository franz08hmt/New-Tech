/**
 * The HTTP contract between @examate/api and @examate/web.
 *
 * These are the shapes that actually travel over the wire. Both sides import
 * from here instead of declaring their own copy, so a field can no longer be
 * added on one side and quietly missed on the other.
 *
 * Deliberately types only, authored as a `.d.ts`:
 *
 *  - The API compiles with `rootDir: ./src` and runs as real ESM from `dist/`.
 *    A `.ts` file outside that root would need its own build step and a real
 *    runtime import. A `.d.ts` is erased by definition, so both apps can share
 *    it with no build wiring and no runtime dependency at all.
 *  - Consequently there are no runtime values here. Something like the
 *    `taskStatuses` array that class-validator needs at runtime stays in the
 *    API, tied back to this file by a compile-time check (see task.types.ts).
 */

/** Voice input produces a draft; it never sends an Assistant question. */
export type SpeechLanguage = "auto" | "vietnamese" | "english";

export interface SpeechStatusResponse {
  status:
    | "ready"
    | "not_configured"
    | "media_unavailable"
    | "model_missing"
    | "loading"
    | "model_error";
  maxAudioBytes: number;
  maxDurationMs: number;
  supportedMimeTypes: string[];
}
export interface SpeechTranscriptionResponse {
  text: string;
  detectedLanguages: string[];
  requestId: string;
}

/** Lifecycle of a task. Mirrored by the `tasks_status_check` constraint. */
export type TaskStatus = "todo" | "in_progress" | "done";

/** A task exactly as `GET/POST /api/tasks` returns it. */
export interface Task {
  id: string;
  title: string;
  owner_name: string | null;
  status: TaskStatus;
  due_date: string | null;
  /**
   * Which piece of coursework evidence this task produces — "proposal",
   * "environment", and so on. Free text and optional by design: the column
   * carries no CHECK constraint, so the UI suggests values without forcing
   * them.
   */
  evidence_type: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskSearchSort = "title" | "status" | "due_date" | "created_at";
export interface TaskSearchQuery {
  q?: string;
  status?: TaskStatus | "all";
  /** `unassigned` selects NULL owner_name; other values are exact owner labels. */
  owner?: string;
  sort?: TaskSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export interface TaskSearchPage {
  items: Task[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: { total: number; done: number };
}

/**
 * A document as the API exposes it.
 *
 * Narrower than the database row on purpose: `storage_key` is an internal
 * Supabase pointer and must never reach the browser. Annotating the API's
 * mapper with this type is what keeps that promise enforced by the compiler
 * rather than by memory.
 */
export interface StoredDocument {
  id: string;
  name: string;
  media_type: string;
  size_bytes: number | null;
  storage_status: "stored" | "deleting" | "legacy";
  processing_status: "pending" | "processing" | "ready" | "failed";
  index_quality: DocumentIndexQuality | null;
  /**
   * Which subject this file belongs to, or null for material that is not tied
   * to one. The link can also go null on its own if the course is removed: the
   * file outlives it.
   */
  course_id: string | null;
  course_slug: string | null;
  course_name: string | null;
  course_code: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentSearchSort =
  | "created_at"
  | "name"
  | "course_name"
  | "storage_status"
  | "processing_status";

export interface DocumentSearchQuery {
  /** Trimmed, case/diacritic-insensitive metadata search, at most 120 chars. */
  q?: string;
  /** all, unassigned, or a course UUID in the verified workspace. */
  course?: string;
  storage_status?: "stored" | "deleting" | "legacy";
  processing_status?: "pending" | "processing" | "ready" | "failed";
  sort?: DocumentSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface DocumentSearchPage {
  items: StoredDocument[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Bounded, metadata-only workspace sidebar search. */
export type WorkspaceSearchKind =
  "all" | "course" | "exam" | "plan" | "document" | "expense" | "task";
export type WorkspaceSearchSort = "kind" | "label";
export interface WorkspaceSearchQuery {
  q: string;
  kind?: WorkspaceSearchKind;
  sort?: WorkspaceSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export interface WorkspaceSearchItem {
  id: string;
  kind: Exclude<WorkspaceSearchKind, "all">;
  label: string;
  detail: string;
  /** Non-null for courses; all other kinds return null. */
  slug: string | null;
}
export interface WorkspaceSearchPage {
  items: WorkspaceSearchItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Processing coverage returned for an indexed PDF; extracted text stays server-side. */
export interface DocumentIndexQuality {
  total_page_count: number;
  useful_text_page_count: number;
  low_text_page_count: number;
  indexed_chunk_count: number;
  skipped_page_numbers: number[];
  needs_ocr: boolean;
  ocr_page_count: number;
  ocr_page_numbers: number[];
}

export interface DocumentProcessingResult {
  document_id: string;
  processing_status: "ready";
  chunk_count: number;
  indexed_at: string;
  index_quality: DocumentIndexQuality;
}

/** Visual treatment chosen from the existing ExaMate course-card palette. */
export type CourseTone = "slate" | "sage" | "sand" | "navy" | "rose";

export interface CourseTopic {
  title: string;
  summary: string;
}

export interface CourseAssessment {
  method: string;
  weight_percent: number;
  description: string;
}

/** A course exactly as `GET /api/courses` and `GET /api/courses/:slug` return it. */
export interface Course {
  id: string;
  slug: string;
  name: string;
  code: string;
  detail: string;
  progress: number;
  tone: CourseTone;
  cover: string;
  cover_alt: string;
  outline: CourseTopic[];
  outcomes: string[];
  assessment: CourseAssessment[];
  created_at: string;
  updated_at: string;
}

export type CourseSearchSort = "name" | "code" | "progress";
export interface CourseSearchQuery {
  q?: string;
  progressMin?: number;
  progressMax?: number;
  sort?: CourseSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
/** Metadata for the course list; long syllabus material is loaded by slug. */
export type CourseSearchItem = Pick<
  Course,
  | "id"
  | "slug"
  | "name"
  | "code"
  | "detail"
  | "progress"
  | "tone"
  | "cover"
  | "cover_alt"
  | "created_at"
  | "updated_at"
>;
export interface CourseSearchPage {
  items: CourseSearchItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * An exam as `GET /api/exams` returns it.
 *
 * The course fields are joined in rather than left to a second request: every
 * screen that lists an exam also names its course and links to it.
 *
 * `exam_date` and `exam_time` are plain strings ("2026-09-21", "09:00"), not
 * timestamps. The database columns are DATE and TIME, and the pg driver would
 * otherwise hand back a JS Date that shifts across timezones on the way to
 * JSON — the API formats them in SQL to keep the calendar day intact.
 */
export interface Exam {
  id: string;
  course_id: string;
  course_slug: string;
  course_name: string;
  course_code: string;
  topic: string;
  exam_date: string;
  exam_time: string;
  room: string;
  revision_note: string | null;
  created_at: string;
  updated_at: string;
}

export type ExamSearchSort = "exam_date" | "topic" | "course";
export interface ExamSearchQuery {
  q?: string;
  courseId?: string;
  fromDate?: string;
  toDate?: string;
  sort?: ExamSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export interface ExamSearchPage {
  items: Exam[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * One thing to revise for a course, as `GET /api/study-plans` returns it.
 *
 * `completed_at` carries both facts at once: null means still to do, a
 * timestamp means done and says when. There is no separate boolean that could
 * disagree with it.
 *
 * `due_date` is a plain calendar day for the same reason as `Exam.exam_date`.
 */
export interface StudyPlan {
  id: string;
  course_id: string;
  course_slug: string;
  course_name: string;
  course_code: string;
  title: string;
  detail: string | null;
  due_date: string | null;
  owner_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StudyPlanSearchSort = "due_date" | "title" | "course" | "completed";
export interface StudyPlanSearchQuery {
  q?: string;
  courseId?: string;
  completion?: "all" | "open" | "completed";
  /** `unassigned` selects NULL owner_name; other values are exact labels. */
  owner?: string;
  dueFrom?: string;
  dueTo?: string;
  sort?: StudyPlanSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export interface StudyPlanSearchPage {
  items: StudyPlan[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Aggregates over every row matching the filters, not only this page. */
  summary: { total: number; completed: number; remaining: number };
}

/** The fixed spending categories, mirrored by `expenses_category_check`. */
export type ExpenseCategory =
  "books" | "transport" | "food" | "supplies" | "fees" | "other";

/**
 * One expense as `GET /api/expenses` returns it.
 *
 * `amount` is a whole number of dong, and arrives as a JSON number because the
 * column is INTEGER — see the migration for why that matters.
 *
 * The course fields are null for spending that belongs to no subject, and they
 * also go null if that course is later removed: the expense outlives the link.
 */
export interface Expense {
  id: string;
  amount: number;
  description: string;
  spent_on: string;
  category: ExpenseCategory;
  course_id: string | null;
  course_slug: string | null;
  course_name: string | null;
  course_code: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseSearchSort = "spent_on" | "amount" | "description";
export interface ExpenseSearchQuery {
  q?: string;
  category?: "all" | ExpenseCategory;
  /** A workspace course UUID, or the `unassigned` sentinel. */
  courseId?: string;
  fromDate?: string;
  toDate?: string;
  sort?: ExpenseSearchSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export interface ExpenseCourseSummary {
  course_id: string | null;
  course_slug: string | null;
  course_name: string;
  course_code: string | null;
  /** Exact whole-VND amount; returned as a decimal string to avoid bigint loss. */
  totalAmount: string;
}
export interface ExpenseSearchPage {
  items: Expense[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Aggregates cover every row matching the filters, independent of page. */
  summary: {
    totalAmount: string;
    largestAmount: string;
    byCourse: ExpenseCourseSummary[];
  };
}

/** Response of `GET /api/health`. */
export interface HealthStatus {
  status: "ok" | "degraded";
}

/** Untrusted screen metadata attached to a single Assistant request. */
export interface AssistantPageContext {
  pageId: string;
  pageName: string;
}

/**
 * general: general knowledge, reads nothing from the workspace.
 * documents: RAG over indexed PDF content, with [S…] citations.
 * workspace: structured records from the database — tasks, exams, study
 * plans, expenses, courses and document metadata — answered by fixed,
 * read-only queries, never by a model.
 */
export type PilotRole = "manager" | "member" | "viewer";
export interface PilotRequestHeaders {
  "X-CSRF-Token": string;
}
export type PilotAuthErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REFRESH_REQUIRED"
  | "CSRF_INVALID"
  | "WORKSPACE_ACCESS_DENIED"
  | "ROLE_FORBIDDEN"
  | "AUTH_UNAVAILABLE"
  | "LOGIN_RATE_LIMITED"
  | "OAUTH_NOT_CONFIGURED"
  | "OAUTH_RESTART_REQUIRED"
  | "OAUTH_LOGOUT_REQUIRED";
export interface PilotAuthErrorResponse {
  code: PilotAuthErrorCode;
  message: string;
  retryAt?: string;
  requestId?: string;
}
export interface PilotPrincipal {
  userId: string;
  workspaceId: string;
  role: PilotRole;
}
export interface PilotLoginRequest {
  email: string;
  password: string;
}
export type PilotSessionResponse =
  | {
      status: "anonymous" | "no_access" | "refresh_required";
      csrfToken: string;
    }
  | {
      status: "authenticated";
      csrfToken: string;
      principal: PilotPrincipal;
      expiresAt: string;
      accessExpiresAt: string;
    };
export interface PilotLogoutResponse {
  status: "signed_out";
  upstreamRevoked: boolean;
}

export type AssistantMode = "general" | "documents" | "workspace";
export type AssistantOperation = "question" | "summarize" | "course_info";

/** Request body of `POST /api/assistant/chat`. */
export interface AssistantChatRequest {
  message: string;
  /** Defaults to documents mode for clients that do not yet choose a mode. */
  mode?: AssistantMode;
  /** Summarize and course_info require a specific document in documents mode. */
  operation?: AssistantOperation;
  pageContext?: AssistantPageContext | null;
  courseId?: string | null;
  documentId?: string | null;
  /** Server-owned persistent conversation. When set, client history is forbidden. */
  conversationId?: string;
  /** Optimistic version returned by the conversation API. */
  conversationVersion?: number;
  /** At most six receipted turns, oldest first. Question operation only.
   * UTF-8 JSON <=81920 bytes and <=64000 serialized characters in total. */
  history?: AssistantHistoryTurn[];
}

export interface AssistantConversationCreateRequest {
  createKey: string;
  mode: AssistantMode;
  courseId?: string | null;
  documentId?: string | null;
  firstQuestion: string;
}
export interface AssistantConversationSummary {
  id: string;
  mode: AssistantMode;
  courseId: string | null;
  documentId: string | null;
  title: string;
  version: number;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
export interface AssistantConversationListResponse {
  items: AssistantConversationSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export type AssistantConversationCreateReconciliation =
  | { state: "absent" }
  | { state: "deleted" }
  | { state: "found"; conversation: AssistantConversationSummary };
export interface AssistantConversationMessage {
  id: string;
  sequence: number;
  receiptId: string;
  snapshot: AssistantFeedbackSnapshot;
  createdAt: string;
}
export interface AssistantConversationSaveRetryRequest {
  receiptId: string;
  expectedVersion: number;
  snapshot: AssistantFeedbackSnapshot;
}
export interface AssistantConversationMessagesResponse {
  conversation: AssistantConversationSummary;
  items: AssistantConversationMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export type AssistantConversationSaveState = "saved" | "not_saved" | "unknown";
export interface AssistantConversationSaveMetadata {
  state: AssistantConversationSaveState;
  version?: number;
  answerId?: string;
}

export interface AssistantHistoryTurn {
  receiptId: string;
  snapshot: AssistantFeedbackSnapshot;
}
export type AssistantHistoryErrorCode = "HISTORY_INVALID";

export interface AssistantCitation {
  sourceId: string;
  documentId: string;
  chunkId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
}

/** Verified workspace association, not a claim extracted from the PDF. */
export interface AssistantMetadataSource {
  documentId: string;
  title: string;
  courseId: string | null;
  courseSlug: string | null;
  courseName: string | null;
  courseCode: string | null;
}

/** The kinds of workspace record an answer can rest on. */
export type AssistantWorkspaceSourceKind =
  "task" | "exam" | "study_plan" | "expense" | "document" | "course";

/**
 * One workspace record behind an answer.
 *
 * No URL travels here on purpose: the web app builds each link itself from
 * `kind` and `id` (or a course's `slug`), so nothing the server — or a record's
 * own text — says can become a link somewhere else. It is not a PDF citation
 * and carries no page.
 */
export interface AssistantWorkspaceSource {
  kind: AssistantWorkspaceSourceKind;
  id: string;
  /** Courses are addressed by slug in the app; set for kind "course" only. */
  slug?: string;
  label: string;
  /** A short fact about the record: its date, status or amount. */
  detail?: string;
}

/** Which fixed question a workspace answer was computed for. */
export type AssistantWorkspaceIntent =
  | "tasks_open"
  | "tasks_overdue"
  | "tasks_done"
  | "tasks_by_course_unsupported"
  | "exams_upcoming"
  | "study_plans_open"
  | "study_plans_overdue"
  | "study_plans_done"
  | "expenses_total"
  | "course_documents"
  | "document_course"
  | "courses_list"
  | "course_required"
  | "course_not_found"
  | "course_ambiguous"
  | "write_refused"
  | "notes_unavailable"
  | "unsupported";

/**
 * WORKSPACE_ANSWER: computed from records. WORKSPACE_UNSUPPORTED: the question
 * is outside what the records can answer, and the reply says so instead.
 */
export type AssistantWorkspaceReasonCode =
  "WORKSPACE_ANSWER" | "WORKSPACE_UNSUPPORTED";

export type AssistantReasonCode =
  | "ANSWER_GENERATED"
  | "PARTIAL_COVERAGE"
  | "NO_RELEVANT_EVIDENCE"
  | "DOCUMENT_METADATA";

/** Response from general chat or document-grounded RAG. */
/** Server UUID after successful receipt persistence. Absent on receipt outages. */
export type AssistantAnswerIdHeader = "X-Assistant-Answer-ID";
export type AssistantReceiptErrorCode =
  "ANSWER_RECEIPT_UNAVAILABLE" | "ANSWER_RECEIPT_NOT_FOUND";

type AssistantResponseBase = {
  answer: string;
  answerable: boolean;
  promptVersion: string;
  /** Present only when non-empty history was supplied (legacy answers unchanged). */
  contextTurnsUsed?: number;
  contextTruncated?: boolean;
};

export type AssistantChatResponse =
  | (AssistantResponseBase & {
      reasonCode: Exclude<AssistantReasonCode, "DOCUMENT_METADATA">;
      citations: AssistantCitation[];
      provider: "google";
      model: string;
      metadataSource?: never;
    } & (
        | { mode: "general"; ragEnabled: false }
        | { mode: "documents"; ragEnabled: true }
      ))
  | (AssistantResponseBase & {
      reasonCode: "DOCUMENT_METADATA";
      citations: [];
      provider: "workspace";
      model: "database";
      mode: "documents";
      ragEnabled: false;
      metadataSource: AssistantMetadataSource;
    })
  | (AssistantResponseBase & {
      reasonCode: AssistantWorkspaceReasonCode;
      citations: [];
      provider: "workspace";
      model: "database";
      mode: "workspace";
      ragEnabled: false;
      workspaceIntent: AssistantWorkspaceIntent;
      workspaceSources: AssistantWorkspaceSource[];
      /** The calendar day "today" meant, in Asia/Ho_Chi_Minh: "2026-09-29". */
      asOf: string;
      metadataSource?: never;
    });

/** Server-sent events returned by `POST /api/assistant/chat/stream`. */
export type AssistantStreamStage =
  "retrieving" | "generating" | "querying_workspace";

export type AssistantStreamEvent =
  | { type: "start" }
  | { type: "status"; stage: AssistantStreamStage }
  | { type: "delta"; text: string }
  | {
      type: "done";
      response: AssistantChatResponse;
      /** Present only when the server persisted an answer receipt. */
      answerId?: string;
      /** Present only for a persistent conversation append. */
      conversationSave?: AssistantConversationSaveMetadata;
    }
  | { type: "error"; code: string; message: string };

/** Response of `GET /api/assistant/status`. */
export type AssistantStatus = {
  provider: "google";
  modes: readonly AssistantMode[];
  ragEnabled: true;
  credentialsExposedToClient: false;
} & ({ status: "ready"; model: string } | { status: "not_configured" });

/** User signals require source review; they are never evaluation verdicts. */
export type AssistantFeedbackRating = "helpful" | "unhelpful";
export type AssistantFeedbackReason =
  | "wrong_source"
  | "missing_detail"
  | "document_not_found"
  | "incorrect_content"
  | "other";

/** Only this turn, reported by the client, not authenticated server evidence. */
export interface AssistantFeedbackSnapshot {
  schemaVersion: 1;
  request: {
    mode: AssistantMode;
    operation: AssistantOperation;
    question: string;
    courseId?: string;
    documentId?: string;
  };
  response: AssistantChatResponse;
}

/** Limits: note 1000, question 4000, answer 32000 characters;
 * canonical UTF-8 snapshot <=81920 bytes, <=40 sources. No truncation. */
export interface CreateAssistantFeedbackRequest {
  answerId: string;
  submissionId: string;
  rating: AssistantFeedbackRating;
  reasons: AssistantFeedbackReason[];
  comment?: string;
  snapshot: AssistantFeedbackSnapshot;
}
export interface AssistantFeedbackReceipt {
  id: string;
  rating: AssistantFeedbackRating;
  createdAt: string;
}

/** Fixed Google-only BFF routes. No tokens/verifiers are HTTP response fields. */
export interface PilotGoogleStatus {
  status: "enabled" | "not_configured";
}
/** POST /api/auth/google/start, empty body; prelogin + Origin + CSRF required. */
export interface PilotGoogleStart {
  authorizationUrl: string;
}
/** GET /api/auth/google/callback accepts attempt and code (or provider error),
 * then 303 to PUBLIC_ORIGIN /?oauth=<allowlisted result>. Never reflects errors. */
export type PilotGoogleResult =
  "success" | "cancelled" | "restart_required" | "unavailable";

export type AiUsageOperationName =
  | "assistant_question"
  | "assistant_summary"
  | "assistant_course_info"
  | "document_index"
  | "study_quiz";
export type AiUsageOperationMode = "general" | "documents" | "workspace";
export type AiUsageOperationOutcome =
  "success" | "error" | "timeout" | "cancelled" | "rejected" | "unknown";
export type AiUsageDashboardSort =
  "started_at" | "duration_ms" | "operation" | "outcome";
export interface AiUsageDashboardQuery {
  from: string;
  to: string;
  operation?: AiUsageOperationName;
  mode?: AiUsageOperationMode;
  outcome?: AiUsageOperationOutcome;
  model?: string;
  sort: AiUsageDashboardSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}
export type AiUsageCostBreakdownGroup = "currency" | "pricing_version";
export interface AiUsageCostBreakdownQuery {
  from?: string;
  to?: string;
  operation?: AiUsageOperationName;
  mode?: AiUsageOperationMode;
  outcome?: AiUsageOperationOutcome;
  model?: string;
  group?: AiUsageCostBreakdownGroup;
  currency?: string;
  page?: number;
  pageSize?: number;
}
export interface AiUsageCostBreakdownItem {
  currency: string;
  pricingVersion: string | null;
  pricingVersionCount: string | null;
  estimatedCalls: string;
  estimatedCost: string;
}
export interface AiUsageCostBreakdownResponse {
  group: AiUsageCostBreakdownGroup;
  currency: string | null;
  page: number;
  pageSize: number;
  totalGroups: string;
  totalEstimatedCalls: string;
  totalPages: number;
  totalEstimatedCost: string | null;
  items: AiUsageCostBreakdownItem[];
}
export interface AiUsageOperationCount {
  total: string;
  outcomes: Record<AiUsageOperationOutcome, string>;
  latency: {
    sampleCount: string;
    averageMs: string | null;
    p95Ms: string | null;
  };
}
export interface AiUsageProviderCallCount {
  total: string;
  outcomes: Record<
    "success" | "error" | "timeout" | "cancelled" | "unknown",
    string
  >;
  usage: Record<"complete" | "partial" | "missing" | "invalid", string>;
  tokens: {
    input: string | null;
    inputSamples: string;
    output: string | null;
    outputSamples: string;
    total: string | null;
    totalSamples: string;
  };
  cost: {
    estimatedCalls: string;
    unknownCalls: string;
  };
  latency: {
    sampleCount: string;
    averageMs: string | null;
    p95Ms: string | null;
  };
}
export interface AiUsageDashboardOperation {
  operationId: string;
  operation: AiUsageOperationName;
  mode: AiUsageOperationMode | null;
  promptId: string | null;
  promptVersion: string | null;
  outcome: AiUsageOperationOutcome;
  startedAt: string;
  durationMs: number;
  providerCalls: string;
  knownTotalTokens: string | null;
  totalTokenSamples: string;
}
export interface AiUsageDashboardResponse {
  from: string;
  to: string;
  timezone: "Asia/Ho_Chi_Minh";
  modelCohort: string;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    operations: AiUsageOperationCount;
    providerCalls: AiUsageProviderCallCount;
    daily: Array<{ day: string; operations: string; providerCalls: string }>;
    models: Array<{
      model: string;
      providerCalls: string;
      operations: string;
      knownTotalTokens: string | null;
      tokenSamples: string;
    }>;
    modelCoverage: {
      totalModels: string;
      displayedModels: string;
      omittedModels: string;
      totalProviderCalls: string;
      displayedProviderCalls: string;
      omittedProviderCalls: string;
      knownTotalTokens: string | null;
      displayedKnownTotalTokens: string | null;
      omittedKnownTotalTokens: string | null;
      tokenSamples: string;
      displayedTokenSamples: string;
      omittedTokenSamples: string;
    };
    telemetryIsBestEffort: true;
    ttft: "not_collected";
    monetaryBudget: false;
  };
  operations: {
    items: AiUsageDashboardOperation[];
    total: string;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
export interface AiUsageProviderCall {
  callId: string;
  model: string;
  type: string;
  outcome: "success" | "error" | "timeout" | "cancelled" | "unknown";
  usageStatus: "complete" | "partial" | "missing" | "invalid";
  inputTokens: string | null;
  outputTokens: string | null;
  totalTokens: string | null;
  costStatus: "estimated" | "unknown_price" | "unknown_usage" | "invalid";
  estimatedCost: string | null;
  pricingVersion: string | null;
  currency: string | null;
  durationMs: number;
  startedAt: string;
}
export interface AiUsageProviderCallsResponse {
  operationId: string;
  page: number;
  pageSize: number;
  total: string;
  totalPages: number;
  items: AiUsageProviderCall[];
}

/** F08-A grounded Study Coach quiz wire contracts. */
export type StudyQuizLanguage = "vi" | "en";
export interface StudyQuizGenerateRequest {
  documentId: string;
  questionCount?: number;
  language: StudyQuizLanguage;
}
export interface StudyQuizSource {
  sourceId: string;
  documentId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
  available?: boolean;
}
export interface StudyQuizQuestionPreview {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  sourceIds: string[];
}
export interface StudyQuizQuestionForPractice {
  id: string;
  question: string;
  options: [string, string, string, string];
  sourceIds: string[];
}
export interface StudyQuizPreview {
  schemaVersion: "study-quiz-v1";
  title: string;
  language: StudyQuizLanguage;
  questions: StudyQuizQuestionPreview[];
  sources: StudyQuizSource[];
}
export interface StudyQuizGeneratedDraft {
  draftId: string;
  draftToken: string;
  expiresAt: string;
  documentId: string;
  documentTitle: string;
  quiz: StudyQuizPreview;
}
export type StudyQuizDraftReconciliation =
  | {
      status: "draft";
      draft: {
        draftId: string;
        expiresAt: string;
        documentId: string;
        documentTitle: string;
        quiz: StudyQuizPreview;
      };
    }
  | { status: "confirmed"; quiz: StudyQuizSummary }
  | { status: "cancelled" | "expired" | "deleted" };
export interface StudyQuizConfirmRequest {
  draftToken: string;
}
export interface StudyQuizSummary {
  id: string;
  title: string;
  language: StudyQuizLanguage;
  documentId: string;
  documentTitle: string;
  sourceAvailable: boolean;
  questionCount: number;
  createdAt: string;
  expiresAt: string;
  progress: {
    attempts: number;
    latestScore: number | null;
    bestScore: number | null;
  };
}
export interface StudyQuizListResponse {
  items: StudyQuizSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface StudyQuizDetail {
  quiz: StudyQuizSummary;
  schemaVersion: "study-quiz-v1";
  questions: StudyQuizQuestionForPractice[];
  sources: StudyQuizSource[];
}
export interface StudyQuizAttemptRequest {
  attemptKey: string;
  answers: Array<{ questionId: string; selectedIndex: number }>;
}
export interface StudyQuizAttemptResult {
  id: string;
  attemptKey: string;
  correctCount: number;
  questionCount: number;
  scorePercent: number;
  submittedAt: string;
  answers: Array<{
    questionId: string;
    selectedIndex: number;
    correctIndex: number;
    correct: boolean;
    explanation: string;
    sourceIds: string[];
  }>;
}
export interface StudyQuizProgressResponse {
  quizId: string;
  attempts: number;
  latestScore: number | null;
  bestScore: number | null;
  latestSubmittedAt: string | null;
}
