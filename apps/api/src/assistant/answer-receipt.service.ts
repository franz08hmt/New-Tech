import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantFeedbackSnapshot,
  PilotPrincipal,
} from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { canonicalJson } from "../feedback/feedback-validation.js";
import { log } from "../common/log.js";

@Injectable()
export class AnswerReceiptService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async issue(
    input: AssistantChatRequest,
    response: AssistantChatResponse,
    principal: PilotPrincipal | undefined,
    requestId: string,
  ): Promise<string> {
    // Hash the public response, never rendered Markdown or model raw output.
    // Feedback size limits do not become a new chat acceptance rule.
    const snapshot: AssistantFeedbackSnapshot = {
      schemaVersion: 1,
      request: {
        mode: response.mode,
        operation: input.operation ?? "question",
        question: input.message.trim(),
        ...(input.courseId ? { courseId: input.courseId } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
      },
      response,
    };
    const snapshotHash = createHash("sha256")
      .update(canonicalJson(snapshot))
      .digest("hex");
    const id = randomUUID();
    try {
      await this.database.transaction(async (tx) => {
        const owner = await this.access.authorize(principal, "read", tx);
        const result = await tx.query(
          `INSERT INTO assistant_answer_receipts (id, workspace_id, user_id, mode, request_id, snapshot_hash)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            id,
            owner.workspaceId,
            owner.userId,
            response.mode,
            requestId,
            snapshotHash,
          ],
        );
        if (result.rows.length !== 1)
          throw new Error("Receipt was not persisted");
      });
      return id;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500)
        throw error;
      log("error", "assistant.receipt.failed", {
        code: "ANSWER_RECEIPT_UNAVAILABLE",
      });
      throw new ServiceUnavailableException({
        code: "ANSWER_RECEIPT_UNAVAILABLE",
        message:
          "Chưa lưu được mã xác nhận câu trả lời. Bạn thử gửi lại sau nhé.",
      });
    }
  }
}
