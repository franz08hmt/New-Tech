import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type {
  AssistantChatRequest,
  AssistantConversationCreateRequest,
  AssistantConversationCreateReconciliation,
  AssistantConversationListResponse,
  AssistantConversationMessage,
  AssistantConversationMessagesResponse,
  AssistantConversationSaveMetadata,
  AssistantConversationSummary,
  AssistantFeedbackSnapshot,
  AssistantHistoryTurn,
  AssistantMode,
  AssistantChatResponse,
  PilotPrincipal,
} from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import {
  canonicalJson,
  validSnapshot,
} from "../feedback/feedback-validation.js";
import { boundedHistoryInput } from "./history-validation.js";
import { AnswerReceiptService } from "./answer-receipt.service.js";

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const MAX_TURNS = 100;
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;

interface ConversationRow {
  id: string;
  mode: AssistantMode;
  course_id: string | null;
  document_id: string | null;
  title: string;
  version: number;
  turn_count: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}
interface ConversationJsonRow {
  id: string;
  mode: AssistantMode;
  course_id: string | null;
  document_id: string | null;
  title: string;
  version: number;
  turn_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
interface TurnRow {
  id: string;
  sequence: number;
  receipt_id: string;
  snapshot: unknown;
  snapshot_hash: string;
  mode: AssistantMode;
  created_at: Date;
}

function pageValues(page = 1, pageSize = PAGE_DEFAULT) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PAGE_MAX
  )
    throw new BadRequestException({
      code: "CONVERSATION_QUERY_INVALID",
      message: "Thông tin phân trang hội thoại không hợp lệ.",
    });
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function summary(row: ConversationRow): AssistantConversationSummary {
  return {
    id: row.id,
    mode: row.mode,
    courseId: row.course_id,
    documentId: row.document_id,
    title: row.title,
    version: row.version,
    turnCount: row.turn_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

function notFound() {
  return new NotFoundException({
    code: "CONVERSATION_NOT_FOUND",
    message: "Không tìm thấy cuộc trò chuyện này.",
  });
}

function invalidHistory() {
  return new ConflictException({
    code: "CONVERSATION_HISTORY_INVALID",
    message:
      "Không thể xác minh lịch sử hội thoại này. Hãy mở cuộc trò chuyện mới.",
  });
}

@Injectable()
export class AssistantConversationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
    private readonly receipts: AnswerReceiptService,
  ) {}

  async create(
    input: AssistantConversationCreateRequest,
    principal: PilotPrincipal | undefined,
  ): Promise<AssistantConversationSummary> {
    const mode = input.mode;
    const courseId = input.courseId ?? null;
    const documentId = input.documentId ?? null;
    if (mode !== "documents" && documentId)
      throw new BadRequestException({
        code: "CONVERSATION_SCOPE_INVALID",
        message: "Phạm vi cuộc trò chuyện không hợp lệ.",
      });
    const title = Array.from(input.firstQuestion.trim()).slice(0, 120).join("");
    const id = randomUUID();
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      if (courseId) {
        const course = await tx.query(
          "SELECT id FROM courses WHERE id=$1 AND workspace_id=$2",
          [courseId, owner.workspaceId],
        );
        if (!course.rowCount) throw notFound();
      }
      if (documentId) {
        const document = await tx.query(
          "SELECT id FROM documents WHERE id=$1 AND workspace_id=$2",
          [documentId, owner.workspaceId],
        );
        if (!document.rowCount) throw notFound();
      }
      const claimed = await tx.query(
        `INSERT INTO assistant_conversation_create_keys
          (workspace_id,user_id,create_key)
         VALUES ($1,$2,$3)
         ON CONFLICT (workspace_id,user_id,create_key) DO NOTHING
         RETURNING create_key`,
        [owner.workspaceId, owner.userId, input.createKey],
      );
      if (!claimed.rowCount) {
        const prior = (
          await tx.query<ConversationRow>(
            `SELECT id,mode,course_id,document_id,title,version,turn_count,created_at,updated_at,expires_at
             FROM assistant_conversations
             WHERE workspace_id=$1 AND user_id=$2 AND create_key=$3`,
            [owner.workspaceId, owner.userId, input.createKey],
          )
        ).rows[0];
        if (
          prior &&
          prior.mode === mode &&
          prior.course_id === courseId &&
          prior.document_id === documentId &&
          prior.title === title
        )
          return summary(prior);
        throw new ConflictException({
          code: "CONVERSATION_CREATE_CONFLICT",
          message: "Không thể tạo lại cuộc trò chuyện theo yêu cầu cũ.",
        });
      }
      const inserted = await tx.query<ConversationRow>(
        `INSERT INTO assistant_conversations
          (id,workspace_id,user_id,mode,course_id,document_id,title,create_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,mode,course_id,document_id,title,version,turn_count,created_at,updated_at,expires_at`,
        [
          id,
          owner.workspaceId,
          owner.userId,
          mode,
          courseId,
          documentId,
          title,
          input.createKey,
        ],
      );
      const row = inserted.rows[0];
      if (
        !row ||
        row.mode !== mode ||
        row.course_id !== courseId ||
        row.document_id !== documentId ||
        row.title !== title
      )
        throw new ConflictException({
          code: "CONVERSATION_CREATE_CONFLICT",
          message: "Không thể xác nhận lần tạo hội thoại trước.",
        });
      return summary(row);
    });
  }

  async list(
    principal: PilotPrincipal | undefined,
    pageInput?: number,
    sizeInput?: number,
  ): Promise<AssistantConversationListResponse> {
    const { page, pageSize, offset } = pageValues(pageInput, sizeInput);
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      const result = await tx.query<{
        items: ConversationJsonRow[];
        total: string;
      }>(
        `WITH base AS MATERIALIZED (
           SELECT id,mode,course_id,document_id,title,version,turn_count,created_at,updated_at,expires_at
           FROM assistant_conversations
           WHERE workspace_id=$1 AND user_id=$2 AND expires_at>clock_timestamp() AND turn_count>0
         ), page_rows AS (
           SELECT * FROM base ORDER BY updated_at DESC,id DESC LIMIT $3 OFFSET $4
         ), total_rows AS (SELECT count(*)::text AS total FROM base)
         SELECT COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb) AS items,
           total_rows.total FROM total_rows`,
        [owner.workspaceId, owner.userId, pageSize, offset],
      );
      const items = result.rows[0].items.map((row) =>
        summary({
          id: row.id,
          mode: row.mode,
          course_id: row.course_id,
          document_id: row.document_id,
          title: row.title,
          version: row.version,
          turn_count: row.turn_count,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          expires_at: new Date(row.expires_at),
        }),
      );
      const total = Number(result.rows[0].total);
      return {
        items,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async reconcileCreate(
    createKey: string,
    principal: PilotPrincipal | undefined,
  ): Promise<AssistantConversationCreateReconciliation> {
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      const result = await tx.query<ConversationRow>(
        `SELECT c.id,c.mode,c.course_id,c.document_id,c.title,c.version,c.turn_count,
          c.created_at,c.updated_at,c.expires_at
         FROM assistant_conversation_create_keys k
         LEFT JOIN assistant_conversations c
           ON c.workspace_id=k.workspace_id AND c.user_id=k.user_id
             AND c.create_key=k.create_key AND c.expires_at>clock_timestamp()
         WHERE k.workspace_id=$1 AND k.user_id=$2 AND k.create_key=$3`,
        [owner.workspaceId, owner.userId, createKey],
      );
      const row = result.rows[0];
      if (!row) return { state: "absent" };
      if (!row.id) return { state: "deleted" };
      return { state: "found", conversation: summary(row) };
    });
  }

  async messages(
    id: string,
    principal: PilotPrincipal | undefined,
    pageInput?: number,
    sizeInput?: number,
  ): Promise<AssistantConversationMessagesResponse> {
    const { page, pageSize, offset } = pageValues(pageInput, sizeInput);
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      const result = await tx.query<{
        conversation: ConversationRow;
        items: TurnRow[];
        total: string;
      }>(
        `WITH conversation AS MATERIALIZED (
           SELECT id,mode,course_id,document_id,title,version,turn_count,created_at,updated_at,expires_at
           FROM assistant_conversations
           WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND expires_at>clock_timestamp()
         ), page_rows AS (
           SELECT t.id,t.sequence,t.receipt_id,t.snapshot,r.snapshot_hash,r.mode,t.created_at
           FROM assistant_conversation_turns t JOIN conversation c ON c.id=t.conversation_id
           JOIN assistant_answer_receipts r ON r.id=t.receipt_id AND r.workspace_id=t.workspace_id
             AND r.user_id=t.user_id AND r.mode=t.snapshot->'request'->>'mode'
           ORDER BY t.sequence LIMIT $4 OFFSET $5
         ), total_rows AS (
           SELECT count(*)::text AS total FROM assistant_conversation_turns t
           JOIN conversation c ON c.id=t.conversation_id
           JOIN assistant_answer_receipts r ON r.id=t.receipt_id AND r.workspace_id=t.workspace_id
             AND r.user_id=t.user_id AND r.mode=t.snapshot->'request'->>'mode'
         )
         SELECT (SELECT to_jsonb(c) FROM conversation c) AS conversation,
           COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sequence) FROM page_rows p),'[]'::jsonb) AS items,
           (SELECT total FROM total_rows) AS total`,
        [id, owner.workspaceId, owner.userId, pageSize, offset],
      );
      const row = result.rows[0];
      if (!row?.conversation) throw notFound();
      const conversation = summary({
        ...row.conversation,
        course_id: row.conversation.course_id,
        document_id: row.conversation.document_id,
        turn_count: row.conversation.turn_count,
        created_at: new Date(row.conversation.created_at),
        updated_at: new Date(row.conversation.updated_at),
        expires_at: new Date(row.conversation.expires_at),
      });
      const items: AssistantConversationMessage[] = row.items.map((turn) => {
        const snapshot = turn.snapshot as AssistantFeedbackSnapshot;
        if (
          !validSnapshot(snapshot) ||
          turn.mode !== conversation.mode ||
          snapshot.request.mode !== conversation.mode ||
          (snapshot.request.courseId ?? null) !== conversation.courseId ||
          (snapshot.request.documentId ?? null) !== conversation.documentId ||
          createHash("sha256").update(canonicalJson(snapshot)).digest("hex") !==
            turn.snapshot_hash
        )
          throw invalidHistory();
        return {
          id: turn.id,
          sequence: turn.sequence,
          receiptId: turn.receipt_id,
          snapshot,
          createdAt: new Date(turn.created_at).toISOString(),
        };
      });
      const total = Number(row.total ?? 0);
      return {
        conversation,
        items,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async delete(id: string, principal: PilotPrincipal | undefined) {
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      const result = await tx.query(
        `DELETE FROM assistant_conversations
         WHERE id=$1 AND workspace_id=$2 AND user_id=$3 RETURNING id`,
        [id, owner.workspaceId, owner.userId],
      );
      if (!result.rowCount) throw notFound();
      return { status: "deleted" as const };
    });
  }

  async prepareChat(
    input: AssistantChatRequest,
    principal: PilotPrincipal | undefined,
  ): Promise<AssistantHistoryTurn[] | undefined> {
    if (!input.conversationId) {
      if (input.conversationVersion !== undefined)
        throw new BadRequestException({
          code: "CONVERSATION_VERSION_INVALID",
          message: "Phiên bản hội thoại không hợp lệ.",
        });
      return input.history;
    }
    if (
      input.history !== undefined ||
      !Number.isInteger(input.conversationVersion)
    )
      throw new BadRequestException({
        code: "CONVERSATION_HISTORY_CONFLICT",
        message:
          "Lịch sử hội thoại được tải từ máy chủ, không gửi kèm từ trình duyệt.",
      });
    return this.database.workspaceTransaction(principal, async (tx) => {
      const owner = await this.access.authorize(principal, "read", tx);
      const conversation = await tx.query<ConversationRow>(
        `SELECT id,mode,course_id,document_id,title,version,turn_count,created_at,updated_at,expires_at
         FROM assistant_conversations
         WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND expires_at>clock_timestamp()
         FOR SHARE`,
        [input.conversationId, owner.workspaceId, owner.userId],
      );
      const row = conversation.rows[0];
      if (!row) throw notFound();
      if (
        row.mode !== (input.mode ?? "documents") ||
        row.course_id !== (input.courseId ?? null) ||
        row.document_id !== (input.documentId ?? null)
      )
        throw new ConflictException({
          code: "CONVERSATION_SCOPE_CHANGED",
          message: "Ngữ cảnh đã thay đổi. Hãy bắt đầu cuộc trò chuyện mới.",
        });
      if (row.version !== input.conversationVersion)
        throw new ConflictException({
          code: "CONVERSATION_VERSION_CONFLICT",
          message:
            "Cuộc trò chuyện đã được cập nhật ở nơi khác. Hãy tải lại lịch sử.",
        });
      if (row.mode === "workspace") return [];
      const turns = await tx.query<TurnRow>(
        `SELECT t.id,t.sequence,t.receipt_id,t.snapshot,r.snapshot_hash,r.mode,t.created_at
         FROM assistant_conversation_turns t JOIN assistant_answer_receipts r
           ON r.id=t.receipt_id AND r.workspace_id=t.workspace_id AND r.user_id=t.user_id
         WHERE t.conversation_id=$1 AND t.workspace_id=$2 AND t.user_id=$3
           AND r.mode=t.snapshot->'request'->>'mode'
         ORDER BY t.sequence DESC LIMIT 6`,
        [row.id, owner.workspaceId, owner.userId],
      );
      const history = turns.rows.reverse().map((turn) => {
        const snapshot = turn.snapshot as AssistantFeedbackSnapshot;
        if (
          !validSnapshot(snapshot) ||
          turn.mode !== snapshot.request.mode ||
          snapshot.request.mode !== row.mode ||
          (snapshot.request.courseId ?? null) !== row.course_id ||
          (snapshot.request.documentId ?? null) !== row.document_id ||
          createHash("sha256").update(canonicalJson(snapshot)).digest("hex") !==
            turn.snapshot_hash
        )
          throw invalidHistory();
        return { receiptId: turn.receipt_id, snapshot };
      });
      return history;
    });
  }

  async appendCompleted(
    input: AssistantChatRequest,
    answer: AssistantChatResponse,
    principal: PilotPrincipal | undefined,
    requestId: string,
  ): Promise<AssistantConversationSaveMetadata> {
    if (!input.conversationId) return { state: "saved" };
    const prepared = this.receipts.prepare(input, answer);
    const contentBytes = Buffer.byteLength(
      canonicalJson(prepared.snapshot),
      "utf8",
    );
    try {
      return await this.database.workspaceTransaction(principal, async (tx) => {
        const owner = await this.access.authorize(principal, "read", tx);
        const selected = await tx.query<
          ConversationRow & { content_bytes: number }
        >(
          `SELECT id,mode,course_id,document_id,title,version,turn_count,content_bytes,created_at,updated_at,expires_at
           FROM assistant_conversations WHERE id=$1 AND workspace_id=$2 AND user_id=$3
             AND expires_at>clock_timestamp() FOR UPDATE`,
          [input.conversationId, owner.workspaceId, owner.userId],
        );
        const current = selected.rows[0];
        if (!current) return { state: "not_saved" };
        await this.receipts.insert(tx, owner, requestId, prepared);
        if (
          current.version !== input.conversationVersion ||
          current.mode !== answer.mode ||
          current.course_id !== (input.courseId ?? null) ||
          current.document_id !== (input.documentId ?? null) ||
          current.turn_count >= MAX_TURNS ||
          current.content_bytes + contentBytes > MAX_CONTENT_BYTES
        )
          return {
            state: "not_saved",
            version: current.version,
            answerId: prepared.id,
          };
        const updated = await tx.query<{ version: number }>(
          `UPDATE assistant_conversations
           SET version=version+1,turn_count=turn_count+1,content_bytes=content_bytes+$4,updated_at=clock_timestamp()
           WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND version=$5
             AND expires_at>clock_timestamp() AND turn_count<$6 AND content_bytes+$4<=$7
           RETURNING version`,
          [
            input.conversationId,
            owner.workspaceId,
            owner.userId,
            contentBytes,
            input.conversationVersion,
            MAX_TURNS,
            MAX_CONTENT_BYTES,
          ],
        );
        if (!updated.rowCount)
          return {
            state: "not_saved",
            version: current.version,
            answerId: prepared.id,
          };
        const inserted = await tx.query(
          `INSERT INTO assistant_conversation_turns
           (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            randomUUID(),
            input.conversationId,
            owner.workspaceId,
            owner.userId,
            updated.rows[0].version,
            requestId,
            prepared.id,
            JSON.stringify(prepared.snapshot),
          ],
        );
        if (inserted.rowCount !== 1)
          throw new Error("Conversation turn was not saved");
        return {
          state: "saved",
          version: updated.rows[0].version,
          answerId: prepared.id,
        };
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500)
        throw error;
      // Completion may have committed before an acknowledgement was lost. The
      // caller sees unknown and must reconcile with GET, never replay the AI call.
      return { state: "unknown", answerId: prepared.id };
    }
  }

  async retryAppend(
    id: string,
    input: { receiptId: string; expectedVersion: number; snapshot: unknown },
    principal: PilotPrincipal | undefined,
  ): Promise<AssistantConversationSaveMetadata> {
    if (
      !boundedHistoryInput(input.snapshot) ||
      !validSnapshot(input.snapshot) ||
      Buffer.byteLength(JSON.stringify(input.snapshot), "utf8") > 81920
    )
      throw new BadRequestException({
        code: "CONVERSATION_TURN_INVALID",
        message: "Không thể xác minh lượt hội thoại cần lưu.",
      });
    const snapshot = input.snapshot;
    const snapshotHash = createHash("sha256")
      .update(canonicalJson(snapshot))
      .digest("hex");
    try {
      return await this.database.workspaceTransaction(principal, async (tx) => {
        const owner = await this.access.authorize(principal, "read", tx);
        const found = await tx.query<
          ConversationRow & { content_bytes: number }
        >(
          `SELECT id,mode,course_id,document_id,title,version,turn_count,content_bytes,created_at,updated_at,expires_at
           FROM assistant_conversations WHERE id=$1 AND workspace_id=$2 AND user_id=$3
             AND expires_at>clock_timestamp() FOR UPDATE`,
          [id, owner.workspaceId, owner.userId],
        );
        const conversation = found.rows[0];
        if (!conversation) throw notFound();
        if (
          snapshot.request.mode !== conversation.mode ||
          (snapshot.request.courseId ?? null) !== conversation.course_id ||
          (snapshot.request.documentId ?? null) !== conversation.document_id
        )
          throw new BadRequestException({
            code: "CONVERSATION_SCOPE_CHANGED",
            message: "Lượt trả lời không thuộc phạm vi hội thoại này.",
          });
        const receipt = await tx.query<{ request_id: string }>(
          `SELECT request_id FROM assistant_answer_receipts
           WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND mode=$4 AND snapshot_hash=$5 FOR SHARE`,
          [
            input.receiptId,
            owner.workspaceId,
            owner.userId,
            conversation.mode,
            snapshotHash,
          ],
        );
        if (!receipt.rowCount)
          throw new ConflictException({
            code: "CONVERSATION_RECEIPT_UNAVAILABLE",
            message: "Không thể xác minh lượt trả lời để lưu lại.",
          });
        const existing = await tx.query<{ sequence: number }>(
          `SELECT sequence FROM assistant_conversation_turns
           WHERE receipt_id=$1 AND conversation_id=$2`,
          [input.receiptId, id],
        );
        if (existing.rowCount)
          return {
            state: "saved",
            version: conversation.version,
            answerId: input.receiptId,
          };
        const elsewhere = await tx.query(
          "SELECT id FROM assistant_conversation_turns WHERE receipt_id=$1",
          [input.receiptId],
        );
        if (elsewhere.rowCount)
          throw new ConflictException({
            code: "CONVERSATION_RECEIPT_ALREADY_USED",
            message: "Lượt trả lời đã thuộc một hội thoại khác.",
          });
        const bytes = Buffer.byteLength(canonicalJson(snapshot), "utf8");
        if (
          conversation.version !== input.expectedVersion ||
          conversation.turn_count >= MAX_TURNS ||
          conversation.content_bytes + bytes > MAX_CONTENT_BYTES
        )
          return {
            state: "not_saved",
            version: conversation.version,
            answerId: input.receiptId,
          };
        const updated = await tx.query<{ version: number }>(
          `UPDATE assistant_conversations
           SET version=version+1,turn_count=turn_count+1,content_bytes=content_bytes+$4,updated_at=clock_timestamp()
           WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND version=$5
             AND expires_at>clock_timestamp() AND turn_count<$6 AND content_bytes+$4<=$7
           RETURNING version`,
          [
            id,
            owner.workspaceId,
            owner.userId,
            bytes,
            input.expectedVersion,
            MAX_TURNS,
            MAX_CONTENT_BYTES,
          ],
        );
        if (!updated.rowCount)
          return {
            state: "not_saved",
            version: conversation.version,
            answerId: input.receiptId,
          };
        await tx.query(
          `INSERT INTO assistant_conversation_turns
           (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            randomUUID(),
            id,
            owner.workspaceId,
            owner.userId,
            updated.rows[0].version,
            receipt.rows[0].request_id,
            input.receiptId,
            JSON.stringify(snapshot),
          ],
        );
        return {
          state: "saved",
          version: updated.rows[0].version,
          answerId: input.receiptId,
        };
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500)
        throw error;
      return { state: "unknown", answerId: input.receiptId };
    }
  }
}
