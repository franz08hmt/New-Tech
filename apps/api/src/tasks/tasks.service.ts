import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateTaskDto } from "./create-task.dto.js";
import type { TaskRecord, TaskStatus } from "./task.types.js";
import { log } from "../common/log.js";
import type {
  PilotPrincipal,
  TaskSearchPage,
  TaskSearchQuery,
  TaskSearchSort,
} from "@examate/contracts";
import { requirePrincipal, requireTaskWrite } from "../auth/principal.js";
import { foldSearchText, foldedSearchSql } from "../common/search-text.js";

const TASK_SORT_SQL: Record<TaskSearchSort, string> = {
  title: "lower(title)",
  status: "CASE status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END",
  due_date: "due_date",
  created_at: "created_at",
};

interface TaskSearchRow {
  total: number;
  done: number;
  items: TaskRecord[];
}

function taskSearchSql(sort: TaskSearchSort, direction: "asc" | "desc") {
  const order = `${TASK_SORT_SQL[sort]} ${direction.toUpperCase()}${sort === "due_date" ? " NULLS LAST" : ""}, id ASC`;
  return `WITH matching AS MATERIALIZED (
    SELECT t.id, t.title, t.owner_name, t.status::text AS status,
      to_char(t.due_date,'YYYY-MM-DD') AS due_date, t.evidence_type,
      t.created_at, t.updated_at,
      ${foldedSearchSql("concat_ws(' ',t.title,t.owner_name)")} AS search_text
    FROM tasks t
    WHERE t.workspace_id=$1
      AND ($2::text IS NULL OR ${foldedSearchSql("concat_ws(' ',t.title,t.owner_name)")} LIKE '%' || $2 || '%')
      AND ($3::text='all' OR t.status::text=$3)
      AND ($4::text IS NULL OR ($4='unassigned' AND t.owner_name IS NULL) OR t.owner_name=$4)
  ), counted AS (
    SELECT count(*)::int AS total, count(*) FILTER (WHERE status='done')::int AS done
    FROM matching
  ), page_rows AS (
    SELECT id,title,owner_name,status,due_date,evidence_type,created_at,updated_at
    FROM matching
    ORDER BY ${order}
    LIMIT $5 OFFSET $6
  )
  SELECT counted.total,counted.done,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',page_rows.id,'title',page_rows.title,'owner_name',page_rows.owner_name,
      'status',page_rows.status,'due_date',page_rows.due_date,
      'evidence_type',page_rows.evidence_type,'created_at',page_rows.created_at,
      'updated_at',page_rows.updated_at
    ) ORDER BY ${order}) FILTER (WHERE page_rows.id IS NOT NULL),'[]'::jsonb) AS items
  FROM counted LEFT JOIN page_rows ON true
  GROUP BY counted.total,counted.done`;
}

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<TaskRecord>(
        `SELECT id, title, owner_name, status, due_date, evidence_type, created_at, updated_at
       FROM tasks
       WHERE workspace_id = $1
       ORDER BY
         CASE status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
         due_date NULLS LAST,
         created_at DESC`,
        [workspaceId],
      ),
    );
    return result.rows;
  }

  async search(
    principal: PilotPrincipal | undefined,
    query: TaskSearchQuery,
  ): Promise<TaskSearchPage> {
    const { workspaceId } = requirePrincipal(principal);
    const rawQuery = query.q?.trim() ?? "";
    const folded = rawQuery ? foldSearchText(rawQuery) : "";
    if (rawQuery && !folded)
      throw new BadRequestException({
        code: "SEARCH_QUERY_UNSUPPORTED",
        message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
      });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<TaskSearchRow>(
        taskSearchSql(query.sort ?? "due_date", query.direction ?? "asc"),
        [
          workspaceId,
          folded || null,
          query.status ?? "all",
          query.owner?.trim() || null,
          pageSize,
          (page - 1) * pageSize,
        ],
      ),
    );
    const row = result.rows[0] ?? { total: 0, done: 0, items: [] };
    return {
      items: row.items,
      page,
      pageSize,
      total: row.total,
      totalPages: row.total === 0 ? 0 : Math.ceil(row.total / pageSize),
      summary: { total: row.total, done: row.done },
    };
  }

  async getById(id: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<TaskRecord>(
        `SELECT id,title,owner_name,status::text AS status,
          to_char(due_date,'YYYY-MM-DD') AS due_date,evidence_type,created_at,updated_at
         FROM tasks WHERE id=$1 AND workspace_id=$2`,
        [id, workspaceId],
      ),
    );
    const task = result.rows[0];
    if (!task)
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Không tìm thấy công việc này.",
      });
    return task;
  }

  async create(input: CreateTaskDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireTaskWrite(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<TaskRecord>(
        `INSERT INTO tasks (title, owner_name, status, due_date, evidence_type, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at`,
        [
          input.title.trim(),
          input.ownerName?.trim() || null,
          input.status ?? "todo",
          input.dueDate ?? null,
          input.evidenceType?.trim() || null,
          workspaceId,
        ],
      ),
    );
    log("info", "task.created", { taskId: result.rows[0].id });
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    principal?: PilotPrincipal,
  ) {
    const { workspaceId } = requireTaskWrite(principal);
    const result = await this.database.workspaceTransaction(principal, (tx) =>
      tx.query<TaskRecord>(
        `UPDATE tasks
       SET status = $2, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $3
       RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at`,
        [id, status, workspaceId],
      ),
    );

    const task = result.rows[0];
    if (!task) {
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Task not found",
      });
    }
    log("info", "task.status_updated", { taskId: id, status });
    return task;
  }
}
