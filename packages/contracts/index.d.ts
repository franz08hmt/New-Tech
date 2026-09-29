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

/** Response of `GET /api/health`. */
export interface HealthStatus {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
  databaseLatencyMs?: number;
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
}

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
  | "tasks_by_course_unsupported"
  | "exams_upcoming"
  | "study_plans_open"
  | "study_plans_overdue"
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
type AssistantResponseBase = {
  answer: string;
  answerable: boolean;
  promptVersion: string;
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

/** Response of `GET /api/assistant/status`. */
export type AssistantStatus = {
  provider: "google";
  modes: readonly AssistantMode[];
  ragEnabled: true;
  credentialsExposedToClient: false;
} & ({ status: "ready"; model: string } | { status: "not_configured" });
