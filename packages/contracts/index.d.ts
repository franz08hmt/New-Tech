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
  created_at: string;
  updated_at: string;
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
