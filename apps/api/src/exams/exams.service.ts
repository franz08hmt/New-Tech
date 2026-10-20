import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateExamDto } from "./create-exam.dto.js";
import type { UpdateExamDto } from "./update-exam.dto.js";
import type { ExamRecord } from "./exam.types.js";
import type {
  ExamSearchPage,
  ExamSearchQuery,
  ExamSearchSort,
  PilotPrincipal,
} from "@examate/contracts";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

/**
 * exam_date and exam_time are formatted in SQL rather than handed to the pg
 * driver's type parsers. A DATE comes back as a JS Date, which JSON.stringify
 * then writes as a UTC timestamp — so a 21 September exam can reach the browser
 * as "2026-09-20T17:00:00.000Z" east of Greenwich. Formatting here keeps the
 * calendar day and the wall-clock time exactly as they were entered.
 */
const EXAM_COLUMNS = `e.id,
  e.course_id,
  c.slug AS course_slug,
  c.name AS course_name,
  c.code AS course_code,
  e.topic,
  to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
  to_char(e.exam_time, 'HH24:MI') AS exam_time,
  e.room,
  e.revision_note,
  e.created_at,
  e.updated_at`;

const EXAM_SEARCH_SORT_SQL: Record<ExamSearchSort, string[]> = {
  exam_date: ["exam_date", "exam_time"],
  topic: ["lower(topic)"],
  course: ["lower(course_name)", "lower(course_code)"],
};

interface ExamSearchRow {
  total: number;
  items: ExamRecord[];
}

function examSearchSql(sort: ExamSearchSort, direction: "asc" | "desc") {
  const order = [
    ...EXAM_SEARCH_SORT_SQL[sort].map(
      (expression) => `${expression} ${direction.toUpperCase()}`,
    ),
    "id ASC",
  ].join(", ");
  return `WITH matching AS MATERIALIZED (
    SELECT ${EXAM_COLUMNS}
    FROM exams e
    JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id
    WHERE e.workspace_id = $1
      AND ($2::text IS NULL OR ${foldedSearchSql("concat_ws(' ',e.topic,c.name,c.code,e.room)")} LIKE '%' || $2 || '%')
      AND ($3::uuid IS NULL OR e.course_id = $3)
      AND ($4::date IS NULL OR e.exam_date >= $4::date)
      AND ($5::date IS NULL OR e.exam_date <= $5::date)
  ), counted AS (
    SELECT count(*)::int AS total FROM matching
  ), page_rows AS (
    SELECT * FROM matching
    ORDER BY ${order}
    LIMIT $6 OFFSET $7
  )
  SELECT counted.total,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',page_rows.id,'course_id',page_rows.course_id,
      'course_slug',page_rows.course_slug,'course_name',page_rows.course_name,
      'course_code',page_rows.course_code,'topic',page_rows.topic,
      'exam_date',page_rows.exam_date,'exam_time',page_rows.exam_time,
      'room',page_rows.room,'revision_note',page_rows.revision_note,
      'created_at',page_rows.created_at,'updated_at',page_rows.updated_at
    ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),'[]'::jsonb) AS items
  FROM counted LEFT JOIN page_rows ON true
  GROUP BY counted.total`;
}

@Injectable()
export class ExamsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExamRecord>(
        `SELECT ${EXAM_COLUMNS}
       FROM exams e
       JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id
       WHERE e.workspace_id = $1
       ORDER BY e.exam_date, e.exam_time, c.code`,
        [workspaceId],
      ),
    );
    return result.rows;
  }

  async search(
    principal: PilotPrincipal | undefined,
    query: ExamSearchQuery,
  ): Promise<ExamSearchPage> {
    const { workspaceId } = requirePrincipal(principal);
    const rawQuery = query.q?.trim() ?? "";
    const folded = rawQuery ? foldSearchText(rawQuery) : "";
    if (rawQuery && !folded)
      throw new BadRequestException({
        code: "SEARCH_QUERY_UNSUPPORTED",
        message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
      });
    if (query.fromDate && query.toDate && query.fromDate > query.toDate)
      throw new BadRequestException({
        code: "EXAM_DATE_RANGE_INVALID",
        message: "Khoảng ngày thi không hợp lệ.",
      });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExamSearchRow>(
        examSearchSql(query.sort ?? "exam_date", query.direction ?? "asc"),
        [
          workspaceId,
          folded || null,
          query.courseId ?? null,
          query.fromDate ?? null,
          query.toDate ?? null,
          pageSize,
          (page - 1) * pageSize,
        ],
      ),
    );
    const row = result.rows[0] ?? { total: 0, items: [] };
    return {
      items: row.items,
      page,
      pageSize,
      total: row.total,
      totalPages: row.total === 0 ? 0 : Math.ceil(row.total / pageSize),
    };
  }

  async getById(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExamRecord>(
        `SELECT ${EXAM_COLUMNS}
         FROM exams e
         JOIN courses c ON c.id=e.course_id AND c.workspace_id=e.workspace_id
         WHERE e.id=$1 AND e.workspace_id=$2`,
        [id, workspaceId],
      ),
    );
    const exam = result.rows[0];
    if (!exam)
      throw new NotFoundException({
        code: "EXAM_NOT_FOUND",
        message: "Không tìm thấy kỳ thi này trong workspace hiện tại.",
      });
    return exam;
  }

  async create(input: CreateExamDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database
      .workspaceTransaction(principal, (tx) =>
        tx.query<ExamRecord>(
          `WITH inserted AS (
           INSERT INTO exams (course_id, topic, exam_date, exam_time, room, revision_note, workspace_id)
           VALUES ($1, $2, $3::date, $4::time, $5, $6, $7)
           RETURNING *
         )
         SELECT ${EXAM_COLUMNS}
         FROM inserted e
         JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id`,
          [
            input.courseId,
            input.topic,
            input.examDate,
            input.examTime,
            input.room,
            input.revisionNote ?? null,
            workspaceId,
          ],
        ),
      )
      .catch((error: unknown) => {
        // The foreign key is the only way a well-formed request can fail, and
        // it means the course is absent from this workspace: a caller's mistake,
        // not a server fault, so it must not surface as a 500.
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

  async update(id: string, input: UpdateExamDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExamRecord>(
        `WITH updated AS (
         UPDATE exams
         SET topic = $2,
             exam_date = $3::date,
             exam_time = $4::time,
             room = $5,
             revision_note = $6,
             updated_at = NOW()
         WHERE id = $1 AND workspace_id = $7
         RETURNING *
       )
       SELECT ${EXAM_COLUMNS}
       FROM updated e
       JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id`,
        [
          id,
          input.topic,
          input.examDate,
          input.examTime,
          input.room,
          input.revisionNote ?? null,
          workspaceId,
        ],
      ),
    );
    const exam = result.rows[0];
    if (!exam) {
      throw new NotFoundException({
        code: "EXAM_NOT_FOUND",
        message: "Kỳ thi này không còn nữa, có thể ai đó đã xoá trước rồi.",
      });
    }
    return exam;
  }

  async remove(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requireManager(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query("DELETE FROM exams WHERE id = $1 AND workspace_id = $2", [
        id,
        workspaceId,
      ]),
    );
    if (!result.rowCount) {
      throw new NotFoundException({
        code: "EXAM_NOT_FOUND",
        message: "Kỳ thi này không còn nữa, có thể ai đó đã xoá trước rồi.",
      });
    }
  }
}
