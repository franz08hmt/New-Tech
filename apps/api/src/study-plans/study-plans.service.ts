import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateStudyPlanDto } from "./create-study-plan.dto.js";
import type { StudyPlanRecord } from "./study-plan.types.js";
import type { PilotPrincipal } from "@examate/contracts";
import type {
  StudyPlanSearchPage,
  StudyPlanSearchQuery,
  StudyPlanSearchSort,
} from "@examate/contracts";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

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

const STUDY_PLAN_SORT_SQL: Record<StudyPlanSearchSort, string[]> = {
  due_date: ["due_date"],
  title: ["lower(title)"],
  course: ["lower(course_name)", "lower(course_code)"],
  completed: ["(completed_at IS NOT NULL)"],
};

interface StudyPlanSearchRow {
  total: number;
  completed: number;
  items: StudyPlanRecord[];
}

function studyPlanSearchSql(
  sort: StudyPlanSearchSort,
  direction: "asc" | "desc",
) {
  const order = [
    ...STUDY_PLAN_SORT_SQL[sort].map(
      (expression) =>
        `${expression} ${direction.toUpperCase()}${sort === "due_date" ? " NULLS LAST" : ""}`,
    ),
    "id ASC",
  ].join(", ");
  return `WITH matching AS MATERIALIZED (
    SELECT ${PLAN_COLUMNS}
    FROM study_plans p
    JOIN courses c ON c.id=p.course_id AND c.workspace_id=p.workspace_id
    WHERE p.workspace_id=$1
      AND ($2::text IS NULL OR ${foldedSearchSql("concat_ws(' ',p.title,p.detail,c.name,c.code,c.slug)")} LIKE '%' || $2 || '%')
      AND ($3::uuid IS NULL OR p.course_id=$3)
      AND ($4::text='all' OR ($4='open' AND p.completed_at IS NULL) OR ($4='completed' AND p.completed_at IS NOT NULL))
      AND ($5::text IS NULL OR ($5='unassigned' AND p.owner_name IS NULL) OR p.owner_name=$5)
      AND ($6::date IS NULL OR p.due_date >= $6::date)
      AND ($7::date IS NULL OR p.due_date <= $7::date)
  ), counted AS (
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
    FROM matching
  ), page_rows AS (
    SELECT * FROM matching
    ORDER BY ${order}
    LIMIT $8 OFFSET $9
  )
  SELECT counted.total,counted.completed,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',page_rows.id,'course_id',page_rows.course_id,
      'course_slug',page_rows.course_slug,'course_name',page_rows.course_name,
      'course_code',page_rows.course_code,'title',page_rows.title,
      'detail',page_rows.detail,'due_date',page_rows.due_date,
      'owner_name',page_rows.owner_name,'completed_at',page_rows.completed_at,
      'created_at',page_rows.created_at,'updated_at',page_rows.updated_at
    ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),'[]'::jsonb) AS items
  FROM counted LEFT JOIN page_rows ON true
  GROUP BY counted.total,counted.completed`;
}

@Injectable()
export class StudyPlansService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<StudyPlanRecord>(
        `SELECT ${PLAN_COLUMNS}
       FROM study_plans p
       JOIN courses c ON c.id = p.course_id AND c.workspace_id = p.workspace_id
       WHERE p.workspace_id = $1
       -- Unfinished work first within each subject, then by deadline. Items
       -- with no deadline sort last rather than first, which is what NULLS
       -- LAST guarantees and plain ORDER BY does not.
       ORDER BY c.code, (p.completed_at IS NOT NULL), p.due_date NULLS LAST, p.created_at`,
        [workspaceId],
      ),
    );
    return result.rows;
  }

  async search(
    principal: PilotPrincipal | undefined,
    query: StudyPlanSearchQuery,
  ): Promise<StudyPlanSearchPage> {
    const { workspaceId } = requirePrincipal(principal);
    const rawQuery = query.q?.trim() ?? "";
    const folded = rawQuery ? foldSearchText(rawQuery) : "";
    if (rawQuery && !folded)
      throw new BadRequestException({
        code: "SEARCH_QUERY_UNSUPPORTED",
        message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
      });
    if (query.dueFrom && query.dueTo && query.dueFrom > query.dueTo)
      throw new BadRequestException({
        code: "STUDY_PLAN_DATE_RANGE_INVALID",
        message: "Khoảng ngày hạn chót không hợp lệ.",
      });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<StudyPlanSearchRow>(
        studyPlanSearchSql(query.sort ?? "due_date", query.direction ?? "asc"),
        [
          workspaceId,
          folded || null,
          query.courseId ?? null,
          query.completion ?? "all",
          query.owner?.trim() || null,
          query.dueFrom ?? null,
          query.dueTo ?? null,
          pageSize,
          (page - 1) * pageSize,
        ],
      ),
    );
    const row = result.rows[0] ?? { total: 0, completed: 0, items: [] };
    return {
      items: row.items,
      page,
      pageSize,
      total: row.total,
      totalPages: row.total === 0 ? 0 : Math.ceil(row.total / pageSize),
      summary: {
        total: row.total,
        completed: row.completed,
        remaining: row.total - row.completed,
      },
    };
  }

  async getById(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<StudyPlanRecord>(
        `SELECT ${PLAN_COLUMNS}
         FROM study_plans p
         JOIN courses c ON c.id=p.course_id AND c.workspace_id=p.workspace_id
         WHERE p.id=$1 AND p.workspace_id=$2`,
        [id, workspaceId],
      ),
    );
    const plan = result.rows[0];
    if (!plan)
      throw new NotFoundException({
        code: "STUDY_PLAN_NOT_FOUND",
        message: "Không tìm thấy việc ôn tập này trong workspace hiện tại.",
      });
    return plan;
  }

  async create(input: CreateStudyPlanDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database
      .workspaceTransaction(principal, (tx) =>
        tx.query<StudyPlanRecord>(
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
        ),
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
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<StudyPlanRecord>(
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
      ),
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
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query("DELETE FROM study_plans WHERE id = $1 AND workspace_id = $2", [
        id,
        workspaceId,
      ]),
    );
    if (!result.rowCount) {
      throw new NotFoundException({
        code: "STUDY_PLAN_NOT_FOUND",
        message: "Việc cần ôn này không còn nữa, có thể đã được xoá.",
      });
    }
  }
}
