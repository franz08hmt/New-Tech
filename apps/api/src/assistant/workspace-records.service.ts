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

/** Enough for every answer; an answer that would need more says so. */
export const ROW_LIMIT = 200;
/** Spending is summed row by row, so a total is refused past this many. */
export const EXPENSE_LIMIT = 1000;

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

  async tasks() {
    const result = await this.database.query<TaskRow>(
      `SELECT id, title, status, to_char(due_date, 'YYYY-MM-DD') AS due_date
       FROM tasks
       ORDER BY due_date NULLS LAST, created_at
       LIMIT ${ROW_LIMIT}`,
    );
    return result.rows;
  }

  /** Every exam of one course, or of all courses when none is given. */
  async exams(courseId: string | null) {
    const result = await this.database.query<ExamRow>(
      `SELECT e.id, e.topic,
              to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
              to_char(e.exam_time, 'HH24:MI') AS exam_time,
              e.room, e.course_id,
              c.name AS course_name, c.code AS course_code
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       WHERE $1::uuid IS NULL OR e.course_id = $1::uuid
       ORDER BY e.exam_date, e.exam_time
       LIMIT ${ROW_LIMIT}`,
      [courseId],
    );
    return result.rows;
  }

  /** Every study item, done or not, so "done" is decided in one place. */
  async studyPlans(courseId: string | null) {
    const result = await this.database.query<StudyPlanRow>(
      `SELECT p.id, p.title,
              to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
              p.completed_at IS NOT NULL AS completed,
              p.course_id,
              c.name AS course_name, c.code AS course_code
       FROM study_plans p
       JOIN courses c ON c.id = p.course_id
       WHERE $1::uuid IS NULL OR p.course_id = $1::uuid
       ORDER BY p.due_date NULLS LAST, p.created_at
       LIMIT ${ROW_LIMIT}`,
      [courseId],
    );
    return result.rows;
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
       LIMIT ${ROW_LIMIT}`,
    );
    return result.rows;
  }
}
