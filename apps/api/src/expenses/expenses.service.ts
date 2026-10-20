import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateExpenseDto } from "./create-expense.dto.js";
import type { ExpenseRecord } from "./expense.types.js";
import type {
  ExpenseSearchPage,
  ExpenseSearchQuery,
  ExpenseSearchSort,
  PilotPrincipal,
} from "@examate/contracts";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

/**
 * spent_on is formatted in SQL for the same reason as every other date column
 * here: the pg driver turns DATE into a JS Date and JSON then writes it as a
 * UTC timestamp, moving the expense to the previous day east of Greenwich.
 * That would put spending in the wrong week, and the totals with it.
 */
const EXPENSE_COLUMNS = `e.id,
  e.amount,
  e.description,
  to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on,
  e.category,
  e.course_id,
  c.slug AS course_slug,
  c.name AS course_name,
  c.code AS course_code,
  e.created_at,
  e.updated_at`;

const EXPENSE_SEARCH_SORT_SQL: Record<ExpenseSearchSort, string[]> = {
  spent_on: ["spent_on"],
  amount: ["amount"],
  description: ["lower(description)"],
};

interface ExpenseSearchRow {
  total: number;
  total_amount: string;
  largest_amount: string;
  by_course: ExpenseSearchPage["summary"]["byCourse"];
  items: ExpenseRecord[];
}

function expenseSearchSql(sort: ExpenseSearchSort, direction: "asc" | "desc") {
  const order = [
    ...EXPENSE_SEARCH_SORT_SQL[sort].map(
      (expression) => `${expression} ${direction.toUpperCase()} NULLS LAST`,
    ),
    "id ASC",
  ].join(", ");
  return `WITH matching AS MATERIALIZED (
    SELECT ${EXPENSE_COLUMNS}
    FROM expenses e
    LEFT JOIN courses c ON c.id=e.course_id AND c.workspace_id=e.workspace_id
    WHERE e.workspace_id=$1
      AND ($2::text IS NULL OR ${foldedSearchSql("concat_ws(' ',e.description,c.name,c.code,c.slug)")} LIKE '%' || $2 || '%')
      AND ($3::text IS NULL OR e.category=$3)
      AND ($4::uuid IS NULL OR e.course_id=$4::uuid)
      AND (NOT $5::boolean OR e.course_id IS NULL)
      AND ($6::date IS NULL OR e.spent_on >= $6::date)
      AND ($7::date IS NULL OR e.spent_on <= $7::date)
  ), grouped AS (
    SELECT course_id,course_slug,COALESCE(course_name,'Không thuộc môn nào') AS course_name,
      course_code,sum(amount)::text AS total_amount
    FROM matching
    GROUP BY course_id,course_slug,course_name,course_code
  ), summary AS (
    SELECT count(*)::int AS total,
      COALESCE(sum(amount)::text,'0') AS total_amount,
      COALESCE(max(amount)::text,'0') AS largest_amount,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'course_id',course_id,'course_slug',course_slug,'course_name',course_name,
        'course_code',course_code,'totalAmount',total_amount
      ) ORDER BY total_amount::numeric DESC,course_id ASC NULLS LAST),'[]'::jsonb)
       FROM grouped) AS by_course
    FROM matching
  ), page_rows AS (
    SELECT * FROM matching
    ORDER BY ${order}
    LIMIT $8 OFFSET $9
  )
  SELECT summary.total,summary.total_amount,summary.largest_amount,summary.by_course,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',page_rows.id,'amount',page_rows.amount,'description',page_rows.description,
      'spent_on',page_rows.spent_on,'category',page_rows.category,
      'course_id',page_rows.course_id,'course_slug',page_rows.course_slug,
      'course_name',page_rows.course_name,'course_code',page_rows.course_code,
      'created_at',page_rows.created_at,'updated_at',page_rows.updated_at
    ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),'[]'::jsonb) AS items
  FROM summary LEFT JOIN page_rows ON true
  GROUP BY summary.total,summary.total_amount,summary.largest_amount,summary.by_course`;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    // LEFT JOIN: an expense with no course must still appear, and it is the
    // only join in this codebase that has to be outer.
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExpenseRecord>(
        `SELECT ${EXPENSE_COLUMNS}
       FROM expenses e
       LEFT JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id
       WHERE e.workspace_id = $1
       ORDER BY e.spent_on DESC, e.created_at DESC`,
        [workspaceId],
      ),
    );
    return result.rows;
  }

  async search(
    principal: PilotPrincipal | undefined,
    query: ExpenseSearchQuery,
  ): Promise<ExpenseSearchPage> {
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
        code: "EXPENSE_DATE_RANGE_INVALID",
        message: "Khoảng ngày chi tiêu không hợp lệ.",
      });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExpenseSearchRow>(
        expenseSearchSql(query.sort ?? "spent_on", query.direction ?? "desc"),
        [
          workspaceId,
          folded || null,
          query.category && query.category !== "all" ? query.category : null,
          query.courseId && query.courseId !== "unassigned"
            ? query.courseId
            : null,
          query.courseId === "unassigned",
          query.fromDate ?? null,
          query.toDate ?? null,
          pageSize,
          (page - 1) * pageSize,
        ],
      ),
    );
    const row = result.rows[0] ?? {
      total: 0,
      total_amount: "0",
      largest_amount: "0",
      by_course: [],
      items: [],
    };
    return {
      items: row.items,
      page,
      pageSize,
      total: row.total,
      totalPages: row.total === 0 ? 0 : Math.ceil(row.total / pageSize),
      summary: {
        totalAmount: row.total_amount,
        largestAmount: row.largest_amount,
        byCourse: row.by_course,
      },
    };
  }

  async getById(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<ExpenseRecord>(
        `SELECT ${EXPENSE_COLUMNS}
         FROM expenses e
         LEFT JOIN courses c ON c.id=e.course_id AND c.workspace_id=e.workspace_id
         WHERE e.id=$1 AND e.workspace_id=$2`,
        [id, workspaceId],
      ),
    );
    const expense = result.rows[0];
    if (!expense)
      throw new NotFoundException({
        code: "EXPENSE_NOT_FOUND",
        message: "Khoản chi này không còn trong workspace hiện tại.",
      });
    return expense;
  }

  async create(input: CreateExpenseDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireRecordWrite(principal);
    const result = await this.database
      .workspaceTransaction(principal, (tx) =>
        tx.query<ExpenseRecord>(
          `WITH inserted AS (
           INSERT INTO expenses (amount, description, spent_on, category, course_id, workspace_id)
           VALUES ($1, $2, $3::date, $4, $5, $6)
           RETURNING *
         )
         SELECT ${EXPENSE_COLUMNS}
         FROM inserted e
         LEFT JOIN courses c ON c.id = e.course_id AND c.workspace_id = e.workspace_id`,
          [
            input.amount,
            input.description,
            input.spentOn,
            input.category,
            input.courseId ?? null,
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

  async remove(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requireManager(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query("DELETE FROM expenses WHERE id = $1 AND workspace_id = $2", [
        id,
        workspaceId,
      ]),
    );
    if (!result.rowCount) {
      throw new NotFoundException({
        code: "EXPENSE_NOT_FOUND",
        message: "Khoản chi này không còn nữa, có thể đã được xoá.",
      });
    }
  }
}
