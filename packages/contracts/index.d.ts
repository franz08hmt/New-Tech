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

/** Response of `GET /api/health`. */
export interface HealthStatus {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
  databaseLatencyMs?: number;
}
