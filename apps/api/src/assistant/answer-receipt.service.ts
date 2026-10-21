import {
  HttpException,
  BadRequestException,
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
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { canonicalJson } from "../feedback/feedback-validation.js";
import { log } from "../common/log.js";

export interface PreparedAnswerReceipt {
  id: string;
  snapshot: AssistantFeedbackSnapshot;
  snapshotHash: string;
}

@Injectable()
export class AnswerReceiptService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async verifyHistory(
    input: AssistantChatRequest,
    principal: PilotPrincipal | undefined,
  ) {
    if (!input.history?.length) return;
    await this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      for (const turn of input.history!) {
        const snapshot = turn.snapshot;
        const request = snapshot.request;
        const invalid = () =>
          new BadRequestException({
            code: "HISTORY_INVALID",
            message:
              "Chưa xác minh được ngữ cảnh. Bạn mở cuộc hội thoại mới rồi thử lại nhé.",
          });
        if (
          request.mode !== (input.mode ?? "documents") ||
          (request.courseId ?? null) !== (input.courseId ?? null) ||
          (request.documentId ?? null) !== (input.documentId ?? null)
        )
          throw invalid();
        const hash = createHash("sha256")
          .update(canonicalJson(snapshot))
          .digest("hex");
        const result = await tx.query(
          `SELECT id FROM assistant_answer_receipts
          WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND mode = $4 AND snapshot_hash = $5 FOR SHARE`,
          [turn.receiptId, owner.workspaceId, owner.userId, request.mode, hash],
        );
        if (result.rows.length !== 1) throw invalid();
      }
    });
  }

  prepare(
    input: AssistantChatRequest,
    response: AssistantChatResponse,
  ): PreparedAnswerReceipt {
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
    return { id: randomUUID(), snapshot, snapshotHash };
  }

  async insert(
    tx: DatabaseTransaction,
    owner: PilotPrincipal,
    requestId: string,
    prepared: PreparedAnswerReceipt,
  ) {
    const result = await tx.query(
      `INSERT INTO assistant_answer_receipts (id, workspace_id, user_id, mode, request_id, snapshot_hash)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        prepared.id,
        owner.workspaceId,
        owner.userId,
        prepared.snapshot.request.mode,
        requestId,
        prepared.snapshotHash,
      ],
    );
    if (result.rows.length !== 1) throw new Error("Receipt was not persisted");
  }

  async issue(
    input: AssistantChatRequest,
    response: AssistantChatResponse,
    principal: PilotPrincipal | undefined,
    requestId: string,
  ): Promise<string> {
    const prepared = this.prepare(input, response);
    try {
      await this.database.workspaceTransaction(principal, async (tx) => {
        const owner = await this.access.authorize(principal, "read", tx);
        await this.insert(tx, owner, requestId, prepared);
      });
      return prepared.id;
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
