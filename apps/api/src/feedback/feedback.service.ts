import {
  ConflictException,
  Injectable,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { AssistantFeedbackReceipt } from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import { log } from "../common/log.js";
import { canonicalJson } from "./feedback-validation.js";
import type { CreateFeedbackDto } from "./create-feedback.dto.js";
import type { PilotPrincipal } from "@examate/contracts";
import { DocumentAccessService } from "../documents/document-access.service.js";

type Row = {
  id: string;
  answer_id: string;
  submission_id: string;
  rating: AssistantFeedbackReceipt["rating"];
  created_at: Date;
  payload_hash: string;
};
@Injectable()
export class FeedbackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}
  async create(
    input: CreateFeedbackDto,
    principal?: PilotPrincipal,
  ): Promise<AssistantFeedbackReceipt> {
    const hash = createHash("sha256")
      .update(canonicalJson(input))
      .digest("hex");
    let row: Row | undefined;
    let createdNew = false;
    try {
      row = await this.database.transaction(async (tx) => {
        const { workspaceId, userId } = await this.access.authorize(
          principal,
          "read",
          tx,
        );
        const snapshotHash = createHash("sha256")
          .update(canonicalJson(input.snapshot))
          .digest("hex");
        const receipt = await tx.query(
          `SELECT id FROM assistant_answer_receipts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND snapshot_hash=$4 FOR SHARE`,
          [input.answerId, workspaceId, userId, snapshotHash],
        );
        if (receipt.rows.length !== 1)
          throw new NotFoundException({
            code: "ANSWER_RECEIPT_NOT_FOUND",
            message:
              "Chưa tìm thấy câu trả lời của bạn để lưu phản hồi. Hãy gửi một câu hỏi mới nhé.",
          });
        const created = await tx.query<Row>(
          `INSERT INTO assistant_feedback (answer_id, submission_id, rating, reasons, comment, snapshot, payload_hash, workspace_id, receipt_id, user_id)
        VALUES ($1, $2, $3, $4, $5, $6::json, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING RETURNING id, answer_id, submission_id, rating, created_at, payload_hash`,
          [
            input.answerId,
            input.submissionId,
            input.rating,
            input.reasons,
            input.comment ?? null,
            canonicalJson(input.snapshot),
            hash,
            workspaceId,
            input.answerId,
            userId,
          ],
        );
        let row: Row | undefined = created.rows[0];
        if (!row)
          row =
            (
              await tx.query<Row>(
                `SELECT id, answer_id, submission_id, rating, created_at, payload_hash FROM assistant_feedback WHERE (submission_id = $1 OR answer_id = $2) AND workspace_id=$3 AND user_id=$4 AND receipt_id=$2`,
                [input.submissionId, input.answerId, workspaceId, userId],
              )
            ).rows.find((r) => r.submission_id === input.submissionId) ??
            undefined;
        if (
          !row ||
          row.answer_id !== input.answerId ||
          row.payload_hash !== hash
        )
          throw new ConflictException({
            code: "FEEDBACK_IDEMPOTENCY_CONFLICT",
            message:
              "Phản hồi đã được lưu với nội dung hoặc khóa khác. Không ghi đè phản hồi đã lưu.",
          });
        createdNew = created.rows.length > 0;
        return row;
      });
      log("info", "feedback.saved", {
        feedbackId: row.id,
        outcome: createdNew ? "created" : "replayed",
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        log("info", "feedback.conflict", {
          outcome: "conflict",
          code: "FEEDBACK_IDEMPOTENCY_CONFLICT",
        });
        throw error;
      }
      if (error instanceof HttpException && error.getStatus() < 500)
        throw error;
      log("error", "feedback.failed", {
        outcome: "blocked",
        code: "FEEDBACK_STORAGE_UNAVAILABLE",
      });
      throw new ServiceUnavailableException({
        code: "FEEDBACK_STORAGE_UNAVAILABLE",
        message:
          "Chưa lưu được phản hồi. Giữ nội dung và thử lại với cùng khóa gửi.",
      });
    }
    return {
      id: row.id,
      rating: row.rating,
      createdAt: row.created_at.toISOString(),
    };
  }
}
