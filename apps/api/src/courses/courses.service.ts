import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CourseRecord } from "./course.types.js";
import type {
  CourseSearchItem,
  CourseSearchPage,
  CourseSearchQuery,
  CourseSearchSort,
  PilotPrincipal,
} from "@examate/contracts";
import { requirePrincipal } from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

const COURSE_COLUMNS = `id, slug, name, code, detail, progress, tone, cover, cover_alt,
  outline, outcomes, assessment, created_at, updated_at`;
const COURSE_SEARCH_SORT_SQL: Record<CourseSearchSort, string> = {
  name: "lower(name)",
  code: "lower(code)",
  progress: "progress",
};

interface CourseSearchRow {
  total: number;
  items: CourseSearchItem[];
}

function courseSearchSql(sort: CourseSearchSort, direction: "asc" | "desc") {
  const order = `${COURSE_SEARCH_SORT_SQL[sort]} ${direction.toUpperCase()}, id ASC`;
  return `WITH matching AS MATERIALIZED (
    SELECT c.id,c.slug,c.name,c.code,c.detail,c.progress,c.tone,c.cover,
      c.cover_alt,c.created_at,c.updated_at
    FROM courses c
    WHERE c.workspace_id=$1
      AND ($2::text IS NULL OR ${foldedSearchSql("concat_ws(' ',c.name,c.code,c.slug,c.detail)")} LIKE '%' || $2 || '%')
      AND ($3::smallint IS NULL OR c.progress >= $3)
      AND ($4::smallint IS NULL OR c.progress <= $4)
  ), counted AS (
    SELECT count(*)::int AS total FROM matching
  ), page_rows AS (
    SELECT id,slug,name,code,detail,progress,tone,cover,cover_alt,created_at,updated_at
    FROM matching
    ORDER BY ${order}
    LIMIT $5 OFFSET $6
  )
  SELECT counted.total,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',page_rows.id,'slug',page_rows.slug,'name',page_rows.name,
      'code',page_rows.code,'detail',page_rows.detail,'progress',page_rows.progress,
      'tone',page_rows.tone,'cover',page_rows.cover,'cover_alt',page_rows.cover_alt,
      'created_at',page_rows.created_at,'updated_at',page_rows.updated_at
    ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),'[]'::jsonb) AS items
  FROM counted LEFT JOIN page_rows ON true
  GROUP BY counted.total`;
}

@Injectable()
export class CoursesService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<CourseRecord>(
        `SELECT ${COURSE_COLUMNS}
       FROM courses
       WHERE workspace_id = $1
       ORDER BY code`,
        [workspaceId],
      ),
    );
    return result.rows;
  }

  async search(
    principal: PilotPrincipal | undefined,
    query: CourseSearchQuery,
  ): Promise<CourseSearchPage> {
    const { workspaceId } = requirePrincipal(principal);
    const rawQuery = query.q?.trim() ?? "";
    const folded = rawQuery ? foldSearchText(rawQuery) : "";
    if (rawQuery && !folded)
      throw new BadRequestException({
        code: "SEARCH_QUERY_UNSUPPORTED",
        message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
      });
    if (
      query.progressMin !== undefined &&
      query.progressMax !== undefined &&
      query.progressMin > query.progressMax
    )
      throw new BadRequestException({
        code: "COURSE_PROGRESS_RANGE_INVALID",
        message: "Khoảng tiến độ không hợp lệ.",
      });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<CourseSearchRow>(
        courseSearchSql(query.sort ?? "name", query.direction ?? "asc"),
        [
          workspaceId,
          folded || null,
          query.progressMin ?? null,
          query.progressMax ?? null,
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

  async getBySlug(slug: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<CourseRecord>(
        `SELECT ${COURSE_COLUMNS}
       FROM courses
       WHERE slug = $1 AND workspace_id = $2`,
        [slug, workspaceId],
      ),
    );
    const course = result.rows[0];
    if (!course) {
      throw new NotFoundException({
        code: "COURSE_NOT_FOUND",
        message: "Không tìm thấy môn học này. Có thể đường dẫn đã thay đổi.",
      });
    }
    return course;
  }
}
