import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateTaskDto } from "./create-task.dto.js";
import type { TaskRecord, TaskStatus } from "./task.types.js";
import { log } from "../common/log.js";
import type { PilotPrincipal } from "@examate/contracts";
import { requirePrincipal, requireTaskWrite } from "../auth/principal.js";

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.query<TaskRecord>(
      `SELECT id, title, owner_name, status, due_date, evidence_type, created_at, updated_at
       FROM tasks
       WHERE workspace_id = $1
       ORDER BY
         CASE status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
         due_date NULLS LAST,
         created_at DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  async create(input: CreateTaskDto, principal?: PilotPrincipal) {
    const { workspaceId } = requireTaskWrite(principal);
    const result = await this.database.query<TaskRecord>(
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
    const result = await this.database.query<TaskRecord>(
      `UPDATE tasks
       SET status = $2, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $3
       RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at`,
      [id, status, workspaceId],
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
