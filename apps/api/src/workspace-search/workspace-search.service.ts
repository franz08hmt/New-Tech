import { Injectable } from "@nestjs/common";
import type {
  PilotPrincipal,
  WorkspaceSearchItem,
  WorkspaceSearchPage,
  WorkspaceSearchQuery,
  WorkspaceSearchSort,
} from "@examate/contracts";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import { requirePrincipal } from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

const KIND_SQL: Record<WorkspaceSearchSort, string> = {
  kind: "CASE kind WHEN 'course' THEN 1 WHEN 'exam' THEN 2 WHEN 'plan' THEN 3 WHEN 'document' THEN 4 WHEN 'expense' THEN 5 ELSE 6 END",
  label: "lower(label)",
};

interface SearchResultRow {
  total: number;
  items: WorkspaceSearchItem[];
}

function searchSql(sort: WorkspaceSearchSort, direction: "asc" | "desc") {
  const order = `${KIND_SQL[sort]} ${direction.toUpperCase()}, kind ASC, id ASC`;
  return `WITH candidates AS MATERIALIZED (
    SELECT 'course'::text AS kind, c.id, c.slug, c.name AS label,
      concat_ws(' · ', c.code, c.detail) AS detail,
      ${foldedSearchSql("concat_ws(' ', c.name, c.code, c.detail)")} AS search_text
    FROM courses c
    WHERE c.workspace_id = $1
    UNION ALL
    SELECT 'exam', e.id, NULL::text, e.topic,
      concat_ws(' · ', c.name, to_char(e.exam_date, 'YYYY-MM-DD'), e.room),
      ${foldedSearchSql("concat_ws(' ', e.topic, c.name, to_char(e.exam_date, 'YYYY-MM-DD'), e.room)")}
    FROM exams e
    JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id
    WHERE e.workspace_id = $1
    UNION ALL
    SELECT 'plan', p.id, NULL::text, p.title, c.name,
      ${foldedSearchSql("concat_ws(' ', p.title, c.name)")}
    FROM study_plans p
    JOIN courses c ON c.id = p.course_id AND c.workspace_id = p.workspace_id
    WHERE p.workspace_id = $1
    UNION ALL
    SELECT 'document', d.id, NULL::text, d.name,
      COALESCE(c.name, 'Chưa gắn môn nào'),
      ${foldedSearchSql("concat_ws(' ', d.name, COALESCE(c.name, 'Chưa gắn môn nào'))")}
    FROM documents d
    LEFT JOIN courses c ON c.id = d.course_id AND c.workspace_id = d.workspace_id
    WHERE d.workspace_id = $1
    UNION ALL
    SELECT 'expense', e.id, NULL::text, e.description,
      concat_ws(' · ', e.amount::text || ' ₫',
        CASE e.category
          WHEN 'books' THEN 'Sách & tài liệu'
          WHEN 'transport' THEN 'Đi lại'
          WHEN 'food' THEN 'Ăn uống'
          WHEN 'supplies' THEN 'Dụng cụ'
          WHEN 'fees' THEN 'Học phí & lệ phí'
          ELSE 'Khác'
        END, c.code),
      ${foldedSearchSql("concat_ws(' ', e.description, e.amount::text, CASE e.category WHEN 'books' THEN 'Sách & tài liệu' WHEN 'transport' THEN 'Đi lại' WHEN 'food' THEN 'Ăn uống' WHEN 'supplies' THEN 'Dụng cụ' WHEN 'fees' THEN 'Học phí & lệ phí' ELSE 'Khác' END, c.code)")}
    FROM expenses e
    LEFT JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id
    WHERE e.workspace_id = $1
    UNION ALL
    SELECT 'task', t.id, NULL::text, t.title,
      COALESCE(t.owner_name, 'Chưa giao cho ai'),
      ${foldedSearchSql("concat_ws(' ', t.title, COALESCE(t.owner_name, 'Chưa giao cho ai'))")}
    FROM tasks t
    WHERE t.workspace_id = $1
  ), matching AS MATERIALIZED (
    SELECT kind, id, slug, label, detail
    FROM candidates
    WHERE ($3::text = 'all' OR kind = $3)
      AND search_text LIKE $2
  ), counted AS (
    SELECT count(*)::int AS total FROM matching
  ), page_rows AS (
    SELECT kind, id, slug, label, detail
    FROM matching
    ORDER BY ${order}
    LIMIT $4 OFFSET $5
  )
  SELECT counted.total,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', page_rows.id,
        'kind', page_rows.kind,
        'label', page_rows.label,
        'detail', page_rows.detail,
        'slug', page_rows.slug
      ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),
      '[]'::jsonb
    ) AS items
  FROM counted
  LEFT JOIN page_rows ON true
  GROUP BY counted.total`;
}

@Injectable()
export class WorkspaceSearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async search(
    principal: PilotPrincipal | undefined,
    query: WorkspaceSearchQuery,
  ): Promise<WorkspaceSearchPage> {
    const verified = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(
      verified,
      async (tx) => {
        await this.access.authorize(verified, "read", tx);
        return this.searchRows(tx, verified.workspaceId, query);
      },
    );
    return {
      items: result.items,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 12,
      total: result.total,
      totalPages:
        result.total === 0
          ? 0
          : Math.ceil(result.total / (query.pageSize ?? 12)),
    };
  }

  private async searchRows(
    tx: DatabaseTransaction,
    workspaceId: string,
    query: WorkspaceSearchQuery,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const folded = foldSearchText(query.q);
    const result = await tx.query<SearchResultRow>(
      searchSql(query.sort ?? "kind", query.direction ?? "asc"),
      [
        workspaceId,
        `%${folded}%`,
        query.kind ?? "all",
        pageSize,
        (page - 1) * pageSize,
      ],
    );
    return result.rows[0] ?? { total: 0, items: [] };
  }
}
