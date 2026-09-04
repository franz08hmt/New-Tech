import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateTaskDto } from "./create-task.dto.js";
import type { TaskRecord, TaskStatus } from "./task.types.js";

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const result = await this.database.query<TaskRecord>(
      `SELECT id, title, owner_name, status, due_date, evidence_type, created_at, updated_at
       FROM tasks
       ORDER BY
         CASE status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
         due_date NULLS LAST,
         created_at DESC`,
    );
    return result.rows;
  }

  async create(input: CreateTaskDto) {
    const result = await this.database.query<TaskRecord>(
      `INSERT INTO tasks (title, owner_name, status, due_date, evidence_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at`,
      [
        input.title.trim(),
        input.ownerName?.trim() || null,
        input.status ?? "todo",
        input.dueDate ?? null,
        input.evidenceType?.trim() || null,
      ],
    );
    return result.rows[0];
  }

  async updateStatus(id: string, status: TaskStatus) {
    const result = await this.database.query<TaskRecord>(
      `UPDATE tasks
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at`,
      [id, status],
    );

    const task = result.rows[0];
    if (!task) {
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Task not found",
      });
    }
    return task;
  }
}
