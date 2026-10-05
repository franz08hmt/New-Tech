import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { AssistantFeedbackReceipt } from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import { log } from "../common/log.js";
import { canonicalJson } from "./feedback-validation.js";
import type { CreateFeedbackDto } from "./create-feedback.dto.js";

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
  constructor(private readonly database: DatabaseService) {}
  async create(input: CreateFeedbackDto): Promise<AssistantFeedbackReceipt> {
    const hash = createHash("sha256")
      .update(canonicalJson(input))
      .digest("hex");
    let row: Row | undefined;
    try {
      const created = await this.database.query<Row>(
        `INSERT INTO assistant_feedback (answer_id, submission_id, rating, reasons, comment, snapshot, payload_hash)
        VALUES ($1, $2, $3, $4, $5, $6::json, $7)
        ON CONFLICT DO NOTHING RETURNING id, answer_id, submission_id, rating, created_at, payload_hash`,
        [
          input.answerId,
          input.submissionId,
          input.rating,
          input.reasons,
          input.comment ?? null,
          canonicalJson(input.snapshot),
          hash,
        ],
      );
      row = created.rows[0];
      if (!row)
        row =
          (
            await this.database.query<Row>(
              `SELECT id, answer_id, submission_id, rating, created_at, payload_hash FROM assistant_feedback WHERE submission_id = $1 OR answer_id = $2`,
              [input.submissionId, input.answerId],
            )
          ).rows.find((r) => r.submission_id === input.submissionId) ??
          undefined;
      if (!row || row.answer_id !== input.answerId || row.payload_hash !== hash)
        throw new ConflictException({
          code: "FEEDBACK_IDEMPOTENCY_CONFLICT",
          message:
            "Phản hồi đã được lưu với nội dung hoặc khóa khác. Không ghi đè phản hồi đã lưu.",
        });
      log("info", "feedback.saved", {
        feedbackId: row.id,
        outcome: created.rows.length ? "created" : "replayed",
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        log("info", "feedback.conflict", {
          outcome: "conflict",
          code: "FEEDBACK_IDEMPOTENCY_CONFLICT",
        });
        throw error;
      }
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
