import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateStudyPlanDto } from "./create-study-plan.dto.js";
import type { StudyPlanRecord } from "./study-plan.types.js";
import type { PilotPrincipal } from "@examate/contracts";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";

/**
 * due_date is formatted in SQL for the same reason as the exam columns: the pg
 * driver turns DATE into a JS Date, which JSON then writes as a UTC timestamp
 * and shifts the calendar day. completed_at is a real instant, so it stays a
 * timestamp.
 */
const PLAN_COLUMNS = `p.id,
  p.course_id,
  c.slug AS course_slug,
  c.name AS course_name,
  c.code AS course_code,
  p.title,
  p.detail,
  to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
  p.owner_name,
  p.completed_at,
  p.created_at,
  p.updated_at`;

@Injectable()
export class StudyPlansService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.query<StudyPlanRecord>(
      `SELECT ${PLAN_COLUMNS}
       FROM study_plans p
       JOIN courses c ON c.id = p.course_id AND c.workspace_id = p.workspace_id
       WHERE p.workspace_id = $1
       -- Unfinished work first within each subject, then by deadline. Items
       -- with no deadline sort last rather than first, which is what NULLS
       -- LAST guarantees and plain ORDER BY does not.
       ORDER BY c.code, (p.completed_at IS NOT NULL), p.due_date NULLS LAST, p.created_at`,
      [workspaceId],
    );
    return result.rows;
  }

  async create(input: CreateStudyPlanDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database
      .query<StudyPlanRecord>(
        `WITH inserted AS (
           INSERT INTO study_plans (course_id, title, detail, due_date, owner_name, workspace_id)
           VALUES ($1, $2, $3, $4::date, $5, $6)
           RETURNING *
         )
         SELECT ${PLAN_COLUMNS}
         FROM inserted p
         JOIN courses c ON c.id = p.course_id AND c.workspace_id = p.workspace_id`,
        [
          input.courseId,
          input.title,
          input.detail ?? null,
          input.dueDate ?? null,
          input.ownerName ?? null,
          workspaceId,
        ],
      )
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          (error as { code?: string }).code === "23503"
        ) {
          throw new BadRequestException({
            code: "COURSE_NOT_FOUND",
            message: "Môn học này không còn trong danh sách nữa.",
          });
        }
        throw error;
      });
    return result.rows[0];
  }

  async setCompletion(
    id: string,
    completed: boolean,
    principal?: PilotPrincipal,
  ) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database.query<StudyPlanRecord>(
      `WITH updated AS (
         UPDATE study_plans
         SET completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1 AND workspace_id = $3
         RETURNING *
       )
       SELECT ${PLAN_COLUMNS}
       FROM updated p
       JOIN courses c ON c.id = p.course_id AND c.workspace_id = p.workspace_id`,
      [id, completed, workspaceId],
    );
    const plan = result.rows[0];
    if (!plan) {
      throw new NotFoundException({
        code: "STUDY_PLAN_NOT_FOUND",
        message: "Việc cần ôn này không còn nữa, có thể đã được xoá.",
      });
    }
    return plan;
  }

  async remove(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requireManager(principal);
    const result = await this.database.query(
      "DELETE FROM study_plans WHERE id = $1 AND workspace_id = $2",
      [id, workspaceId],
    );
    if (!result.rowCount) {
      throw new NotFoundException({
        code: "STUDY_PLAN_NOT_FOUND",
        message: "Việc cần ôn này không còn nữa, có thể đã được xoá.",
      });
    }
  }
}
