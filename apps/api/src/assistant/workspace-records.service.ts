import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

/*
 * Read-only access to the records the workspace assistant answers from.
 *
 * Every statement here is a parameterised SELECT with a LIMIT, choosing only
 * the columns an answer shows or links to. Nothing is written, and nothing
 * leaves for a model: these rows become fixed sentences and links.
 *
 * Dates are formatted in SQL (to_char) for the same reason as the exams API:
 * a DATE handed to the pg driver can shift a calendar day across zones. The
 * comparison with "today" happens in the caller, against Asia/Ho_Chi_Minh.
 *
 * Tasks carry no course_id in the schema, so no query here relates a task to
 * a course.
 */

export interface CourseRow {
  id: string;
  slug: string;
  name: string;
  code: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
}

export interface ExamRow {
  id: string;
  topic: string;
  exam_date: string;
  exam_time: string;
  room: string;
  course_id: string;
  course_name: string;
  course_code: string;
}

export interface StudyPlanRow {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  course_id: string;
  course_name: string;
  course_code: string;
}

export interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  spent_on: string;
  course_id: string | null;
}

export interface DocumentRow {
  id: string;
  name: string;
  processing_status: "pending" | "processing" | "ready" | "failed";
  course_id: string | null;
  course_slug: string | null;
  course_name: string | null;
  course_code: string | null;
}

/**
 * How many matching rows an answer reads. The filter runs in the query, before
 * the limit, so non-matching rows can never crowd out one that matters; one
 * extra row is read to tell "exactly this many" from "at least this many".
 */
export const ROW_LIMIT = 200;
/** Spending is summed row by row, so a total is refused past this many. */
export const EXPENSE_LIMIT = 1000;

/** Rows that matched, and whether more matched than were read. */
export interface Bounded<T> {
  rows: T[];
  truncated: boolean;
}

function bounded<T>(rows: T[]): Bounded<T> {
  return {
    rows: rows.slice(0, ROW_LIMIT),
    truncated: rows.length > ROW_LIMIT,
  };
}

/** Which tasks: still to do (optionally due before a day), or done. */
export type TaskFilter =
  { state: "open"; dueBefore?: string } | { state: "done" };

/** Which study items: still open (optionally due before a day), or completed. */
export type StudyPlanFilter =
  { state: "open"; dueBefore?: string } | { state: "completed" };

@Injectable()
export class WorkspaceRecordsService {
  constructor(private readonly database: DatabaseService) {}

  async courses() {
    const result = await this.database.query<CourseRow>(
      `SELECT id, slug, name, code
       FROM courses
       ORDER BY code
       LIMIT ${ROW_LIMIT}`,
    );
    return result.rows;
  }

  async tasks(filter: TaskFilter) {
    // The status condition is one of two fixed strings, never input.
    const status =
      filter.state === "done" ? "status = 'done'" : "status <> 'done'";
    const result = await this.database.query<TaskRow>(
      `SELECT id, title, status, to_char(due_date, 'YYYY-MM-DD') AS due_date
       FROM tasks
       WHERE ${status}
         AND ($1::date IS NULL OR due_date < $1::date)
       ORDER BY due_date NULLS LAST, created_at
       LIMIT ${ROW_LIMIT + 1}`,
      [filter.state === "open" ? (filter.dueBefore ?? null) : null],
    );
    return bounded(result.rows);
  }

  /**
   * One course's exams, or every course's: those not yet started at `now`
   * (Vietnamese wall-clock time), and separately the latest one that has.
   */
  async exams(courseId: string | null, now: { date: string; time: string }) {
    const columns = `e.id, e.topic,
              to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
              to_char(e.exam_time, 'HH24:MI') AS exam_time,
              e.room, e.course_id,
              c.name AS course_name, c.code AS course_code`;
    const upcoming = await this.database.query<ExamRow>(
      `SELECT ${columns}
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       WHERE ($1::uuid IS NULL OR e.course_id = $1::uuid)
         AND (e.exam_date > $2::date
              OR (e.exam_date = $2::date AND e.exam_time >= $3::time))
       ORDER BY e.exam_date, e.exam_time
       LIMIT ${ROW_LIMIT + 1}`,
      [courseId, now.date, now.time],
    );
    const past = await this.database.query<ExamRow>(
      `SELECT ${columns}
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       WHERE ($1::uuid IS NULL OR e.course_id = $1::uuid)
         AND (e.exam_date < $2::date
              OR (e.exam_date = $2::date AND e.exam_time < $3::time))
       ORDER BY e.exam_date DESC, e.exam_time DESC
       LIMIT 1`,
      [courseId, now.date, now.time],
    );
    return {
      upcoming: bounded(upcoming.rows),
      latestPast: past.rows[0] ?? null,
    };
  }

  async studyPlans(courseId: string | null, filter: StudyPlanFilter) {
    const completed =
      filter.state === "completed"
        ? "p.completed_at IS NOT NULL"
        : "p.completed_at IS NULL";
    const order =
      filter.state === "completed"
        ? "p.completed_at DESC"
        : "p.due_date NULLS LAST, p.created_at";
    const result = await this.database.query<StudyPlanRow>(
      `SELECT p.id, p.title,
              to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
              p.completed_at IS NOT NULL AS completed,
              p.course_id,
              c.name AS course_name, c.code AS course_code
       FROM study_plans p
       JOIN courses c ON c.id = p.course_id
       WHERE ($1::uuid IS NULL OR p.course_id = $1::uuid)
         AND ${completed}
         AND ($2::date IS NULL OR p.due_date < $2::date)
       ORDER BY ${order}
       LIMIT ${ROW_LIMIT + 1}`,
      [courseId, filter.state === "open" ? (filter.dueBefore ?? null) : null],
    );
    return bounded(result.rows);
  }

  /** One course's spending; spending tied to no course is never included. */
  async courseExpenses(courseId: string) {
    const result = await this.database.query<ExpenseRow>(
      `SELECT id, description, amount,
              to_char(spent_on, 'YYYY-MM-DD') AS spent_on,
              course_id
       FROM expenses
       WHERE course_id = $1
       ORDER BY spent_on DESC, created_at DESC
       LIMIT ${EXPENSE_LIMIT}`,
      [courseId],
    );
    return result.rows;
  }

  async unassignedExpenseCount() {
    const result = await this.database.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count
       FROM expenses
       WHERE course_id IS NULL`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Metadata only: never the storage key, never the extracted text. */
  async documents() {
    const result = await this.database.query<DocumentRow>(
      `SELECT d.id, d.name, d.processing_status, d.course_id,
              c.slug AS course_slug, c.name AS course_name, c.code AS course_code
       FROM documents d
       LEFT JOIN courses c ON c.id = d.course_id
       WHERE d.storage_status <> 'deleting'
       ORDER BY d.name
       LIMIT ${ROW_LIMIT + 1}`,
    );
    return bounded(result.rows);
  }
}
