import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateExpenseDto } from "./create-expense.dto.js";
import type { ExpenseRecord } from "./expense.types.js";
import type { PilotPrincipal } from "@examate/contracts";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";

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
