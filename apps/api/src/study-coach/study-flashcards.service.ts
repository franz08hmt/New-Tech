import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  PilotPrincipal,
  StudyFlashcardLanguage,
  StudyFlashcardsDetail,
  StudyFlashcardsDraftReconciliation,
  StudyFlashcardsGeneratedDraft,
  StudyFlashcardsListResponse,
  StudyFlashcardsPreview,
  StudyFlashcardsProgress,
  StudyFlashcardsProgressResponse,
  StudyFlashcardsReviewRequest,
  StudyFlashcardsReviewResult,
  StudyFlashcardsSummary,
} from "@examate/contracts";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { QueryResultRow } from "pg";
import { requirePrincipal } from "../auth/principal.js";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { AssistantError } from "../assistant/assistant.types.js";
import { AiUsageService } from "../assistant/ai-usage.service.js";
import { EmbeddingError } from "../assistant/gemini-embedding.service.js";
import { GeminiService } from "../assistant/gemini.service.js";
import {
  RagRetrievalService,
  RetrievalError,
} from "../assistant/rag-retrieval.service.js";
import type { RagEvidence } from "../assistant/rag-context.js";
import { studyCoachFlashcardsPrompt } from "../assistant/prompt-registry.js";
import {
  STUDY_FLASHCARDS_SCHEMA_VERSION,
  parseStudyFlashcardsOutput,
  studyFlashcardsResponseSchema,
  type UnidentifiedStudyFlashcards,
} from "./study-flashcards-validation.js";
import type {
  StudyFlashcardsGenerateDto,
  StudyFlashcardsPage,
  StudyFlashcardsReviewDto,
} from "./study-flashcards.dto.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CARD_COUNT = 5;
const OUTPUT_TOKEN_BUDGET = 4096;
const RETRIEVAL_QUERY =
  "Identify distinct key concepts, definitions, relationships, methods, and facts in this selected study document that can support concise evidence-grounded flashcards.";

interface FlashcardSourceSnapshot {
  sourceId: string;
  documentId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
}
interface FlashcardPayload {
  documentTitle: string;
  sourceChunkIds: string[];
  flashcards: StudyFlashcardsPreview;
}
interface FlashcardDraftRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  document_id: string;
  token_hash: string;
  payload: FlashcardPayload | null;
  state: "draft" | "confirmed" | "cancelled" | "expired" | "deleted";
  saved_deck_id: string | null;
  expires_at: Date | string;
  expired: boolean;
}
interface FlashcardSummaryRow extends QueryResultRow {
  id: string;
  title: string;
  language: StudyFlashcardLanguage;
  document_id: string;
  document_title: string;
  source_available: boolean;
  card_count: number;
  created_at: Date | string;
  expires_at: Date | string;
  reviews: number;
  latest_at: Date | string | null;
  latest_remembered: number | null;
  latest_needs_review: number | null;
}
interface FlashcardDeckRow extends QueryResultRow {
  id: string;
  draft_id: string;
  workspace_id: string;
  user_id: string;
  document_id: string;
  document_title: string;
  title: string;
  language: StudyFlashcardLanguage;
  schema_version: string;
  content: StudyFlashcardsPreview;
  card_count: number;
  created_at: Date | string;
  expires_at: Date | string;
  source_available: boolean;
  reviews: number;
  latest_at: Date | string | null;
  latest_remembered: number | null;
  latest_needs_review: number | null;
}
interface ReviewRow extends QueryResultRow {
  id: string;
  review_key: string;
  payload_hash: string;
  ratings: Array<{ cardId: string; rating: "remembered" | "needs_review" }>;
  remembered_count: number;
  needs_review_count: number;
  completed_at: Date | string;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function matchesDigest(expected: string, actual: string) {
  return /^[0-9a-f]{64}$/.test(expected) && /^[0-9a-f]{64}$/.test(actual)
    ? timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"))
    : false;
}
function iso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid database timestamp");
  return date.toISOString();
}
function asJson<T>(value: unknown): T | undefined {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" ? (value as T) : undefined;
}
function safeFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (error instanceof RetrievalError) {
    if (["document_not_found", "document_scope_mismatch"].includes(error.kind))
      throw new NotFoundException({
        code: "DOCUMENT_NOT_AVAILABLE",
        message: "Tài liệu không còn khả dụng trong workspace hiện tại.",
      });
    if (error.kind === "document_not_ready")
      throw new ConflictException({
        code: "DOCUMENT_NOT_READY",
        message: "Tài liệu chưa được lập chỉ mục sẵn sàng.",
      });
    if (error.kind === "document_has_no_useful_text")
      throw new UnprocessableEntityException({
        code: "STUDY_FLASHCARDS_EVIDENCE_INSUFFICIENT",
        message: "Tài liệu chưa có đủ bằng chứng để tạo bộ thẻ an toàn.",
      });
    if (error.kind === "document_too_large")
      throw new UnprocessableEntityException({
        code: "STUDY_FLASHCARDS_EVIDENCE_LIMIT",
        message: "Phạm vi bằng chứng vượt giới hạn an toàn của thao tác này.",
      });
    if (error.kind === "invalid_input")
      throw new UnprocessableEntityException({
        code: "STUDY_FLASHCARDS_REQUEST_INVALID",
        message: "Yêu cầu flashcards không hợp lệ.",
      });
  }
  if (error instanceof AssistantError || error instanceof EmbeddingError)
    throw new ServiceUnavailableException({
      code: error instanceof AssistantError ? "AI_UPSTREAM" : "AI_UPSTREAM",
      message: "Không thể tạo bản xem trước flashcards lúc này.",
    });
  throw error;
}

@Injectable()
export class StudyFlashcardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
    private readonly retrieval: RagRetrievalService,
    private readonly provider: GeminiService,
    private readonly usage: AiUsageService,
  ) {}

  async generate(
    input: StudyFlashcardsGenerateDto,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsGeneratedDraft> {
    const verified = requirePrincipal(principal);
    const cardCount = input.cardCount ?? DEFAULT_CARD_COUNT;
    if (
      typeof input.documentId !== "string" ||
      !UUID.test(input.documentId) ||
      !Number.isInteger(cardCount) ||
      cardCount < 3 ||
      cardCount > 10 ||
      (input.language !== "vi" && input.language !== "en")
    )
      throw new UnprocessableEntityException({
        code: "STUDY_FLASHCARDS_REQUEST_INVALID",
        message: "Yêu cầu flashcards không hợp lệ.",
      });
    try {
      return await this.usage.runOperation(
        verified,
        {
          operation: "study_flashcards",
          mode: "documents",
          prompt: studyCoachFlashcardsPrompt().reference,
        },
        async () => {
          await this.usage.preflightProviderCalls(2);
          const context = await this.retrieval.retrieve(
            RETRIEVAL_QUERY,
            { documentId: input.documentId },
            verified,
          );
          if (!context.context || context.evidence.length === 0)
            throw new UnprocessableEntityException({
              code: "STUDY_FLASHCARDS_EVIDENCE_INSUFFICIENT",
              message: "Tài liệu chưa có đủ bằng chứng để tạo bộ thẻ an toàn.",
            });
          if (
            context.evidence.some(
              (item) => item.documentId !== input.documentId,
            )
          )
            throw this.sourceChanged();

          const prompt = studyCoachFlashcardsPrompt();
          const evidence = context.evidence.map((item) => ({
            sourceId: item.sourceId,
            title: item.documentName,
            page: item.sourcePage,
            text: item.content,
          }));
          const raw = await this.provider.generate({
            systemInstruction: prompt.systemInstruction,
            prompt: prompt.reference,
            userParts: [
              JSON.stringify({ cardCount, language: input.language, evidence }),
            ],
            responseMimeType: "application/json",
            responseJsonSchema: studyFlashcardsResponseSchema(cardCount),
            maxOutputTokens: OUTPUT_TOKEN_BUDGET,
          });
          const parsed = parseStudyFlashcardsOutput(
            raw,
            cardCount,
            input.language,
            new Set(context.evidence.map((item) => item.sourceId)),
          );
          if (!parsed) {
            this.usage.markOutcome("rejected");
            throw new UnprocessableEntityException({
              code: "STUDY_FLASHCARDS_OUTPUT_INVALID",
              message:
                "AI chưa tạo được bản xem trước đúng cấu trúc và nguồn. Không có bộ thẻ nào được lưu.",
            });
          }
          const preview = this.identify(parsed, context.evidence);
          const draftId = randomUUID();
          const draftToken = randomBytes(32).toString("base64url");
          const tokenHash = digest(draftToken);
          const payload: FlashcardPayload = {
            documentTitle: context.evidence[0].documentName,
            sourceChunkIds: [
              ...new Set(context.evidence.map((item) => item.chunkId)),
            ],
            flashcards: preview,
          };
          const created = await this.database.workspaceTransaction(
            verified,
            async (tx) => {
              await this.access.authorize(verified, "read", tx);
              const document = await this.readyDocument(
                tx,
                input.documentId,
                verified.workspaceId,
              );
              if (document.name !== payload.documentTitle)
                throw this.sourceChanged();
              const chunkIds = [
                ...new Set(context.evidence.map((item) => item.chunkId)),
              ];
              const current = await tx.query<{ id: string }>(
                `SELECT dc.id::text FROM public.document_chunks dc
                 JOIN public.documents d ON d.id=dc.document_id
                 WHERE d.id=$1::uuid AND d.workspace_id=$2::uuid
                   AND d.storage_status='stored' AND d.processing_status='ready'
                   AND dc.id=ANY($3::uuid[])`,
                [input.documentId, verified.workspaceId, chunkIds],
              );
              if (current.rowCount !== chunkIds.length)
                throw this.sourceChanged();
              const inserted = await tx.query<{ expires_at: Date | string }>(
                `INSERT INTO public.study_coach_flashcard_drafts
                   (id,workspace_id,user_id,document_id,token_hash,payload)
                 VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING expires_at`,
                [
                  draftId,
                  verified.workspaceId,
                  verified.userId,
                  input.documentId,
                  tokenHash,
                  JSON.stringify(payload),
                ],
              );
              if (!inserted.rows[0])
                throw new Error("Flashcard draft insert returned no row");
              return inserted.rows[0];
            },
          );
          return {
            draftId,
            draftToken,
            expiresAt: iso(created.expires_at),
            documentId: input.documentId,
            documentTitle: payload.documentTitle,
            flashcards: preview,
          };
        },
      );
    } catch (error) {
      return safeFailure(error);
    }
  }

  private identify(
    parsed: UnidentifiedStudyFlashcards,
    evidence: RagEvidence[],
  ): StudyFlashcardsPreview {
    const bySource = new Map<string, FlashcardSourceSnapshot>(
      evidence.map((item) => [
        item.sourceId,
        {
          sourceId: item.sourceId,
          documentId: item.documentId,
          title: item.documentName,
          page: item.sourcePage,
          chunkIndex: item.chunkIndex,
        },
      ]),
    );
    return {
      schemaVersion: STUDY_FLASHCARDS_SCHEMA_VERSION,
      title: parsed.title,
      language: parsed.language,
      cards: parsed.cards.map((card) => ({ id: randomUUID(), ...card })),
      sources: [...new Set(parsed.cards.flatMap((card) => card.sourceIds))]
        .map((sourceId) => bySource.get(sourceId)!)
        .filter(Boolean),
    };
  }

  async reconcileDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsDraftReconciliation> {
    const verified = requirePrincipal(principal);
    const draftId = this.id(id);
    const token = this.token(tokenInput);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const found = await tx.query<FlashcardDraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_flashcard_drafts WHERE id=$1::uuid`,
        [draftId],
      );
      const draft = this.requireToken(found.rows[0], token);
      if (draft.state === "confirmed") {
        const deck = await this.summaryById(tx, draft.saved_deck_id!);
        return deck ? { status: "confirmed", deck } : { status: "deleted" };
      }
      if (draft.state === "cancelled" || draft.state === "deleted")
        return { status: draft.state };
      if (draft.state === "expired" || draft.expired || !draft.payload)
        return { status: "expired" };
      return {
        status: "draft",
        draft: {
          draftId: draft.id,
          expiresAt: iso(draft.expires_at),
          documentId: draft.document_id,
          documentTitle: draft.payload.documentTitle,
          flashcards: draft.payload.flashcards,
        },
      };
    });
  }

  async confirmDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsSummary> {
    const verified = requirePrincipal(principal);
    const draftId = this.id(id);
    const token = this.token(tokenInput);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const found = await tx.query<FlashcardDraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_flashcard_drafts WHERE id=$1::uuid FOR UPDATE`,
        [draftId],
      );
      const draft = this.requireToken(found.rows[0], token);
      if (draft.state === "confirmed") {
        const existing = await this.summaryById(tx, draft.saved_deck_id!);
        if (existing) return existing;
        throw this.unavailableDeck();
      }
      if (draft.state !== "draft" || draft.expired || !draft.payload)
        throw new ConflictException({
          code: "STUDY_FLASHCARDS_DRAFT_UNAVAILABLE",
          message:
            "Bản xem trước đã hết hạn hoặc không còn khả dụng. Hãy kiểm tra trạng thái trước khi tạo bản mới.",
        });
      const payload = this.validatePayload(draft.payload);
      const document = await this.readyDocument(
        tx,
        draft.document_id,
        verified.workspaceId,
      );
      if (document.name !== payload.documentTitle) throw this.sourceChanged();
      const currentSources = await tx.query<{ count: number }>(
        `SELECT count(DISTINCT dc.id)::int AS count
         FROM public.document_chunks dc JOIN public.documents d ON d.id=dc.document_id
         WHERE d.id=$1::uuid AND d.workspace_id=$2::uuid
           AND d.storage_status='stored' AND d.processing_status='ready'
           AND dc.id=ANY($3::uuid[])`,
        [draft.document_id, verified.workspaceId, payload.sourceChunkIds],
      );
      // Re-check the actual chunk IDs captured during retrieval. They are stored
      // as server-owned source metadata only in the private draft payload.
      if (
        !payload.sourceChunkIds.length ||
        Number(currentSources.rows[0]?.count ?? 0) !==
          payload.sourceChunkIds.length
      )
        throw this.sourceChanged();
      const deckId = randomUUID();
      await tx.query(
        `INSERT INTO public.study_coach_flashcard_decks
           (id,draft_id,workspace_id,user_id,document_id,document_title,language,
            schema_version,content,card_count,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,
           clock_timestamp()+INTERVAL '90 days')`,
        [
          deckId,
          draftId,
          verified.workspaceId,
          verified.userId,
          draft.document_id,
          payload.documentTitle,
          payload.flashcards.language,
          STUDY_FLASHCARDS_SCHEMA_VERSION,
          JSON.stringify(payload.flashcards),
          payload.flashcards.cards.length,
        ],
      );
      await tx.query(
        `UPDATE public.study_coach_flashcard_drafts
         SET state='confirmed',payload=NULL,saved_deck_id=$2,
             tombstone_until=clock_timestamp()+INTERVAL '180 days'
         WHERE id=$1::uuid AND state='draft'`,
        [draftId, deckId],
      );
      const summary = await this.summaryById(tx, deckId);
      if (!summary)
        throw new Error("Confirmed flashcard deck could not be read");
      return summary;
    });
  }

  async cancelDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ) {
    const verified = requirePrincipal(principal);
    const draftId = this.id(id);
    const token = this.token(tokenInput);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const found = await tx.query<FlashcardDraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_flashcard_drafts WHERE id=$1::uuid FOR UPDATE`,
        [draftId],
      );
      const draft = this.requireToken(found.rows[0], token);
      if (draft.state === "confirmed")
        throw new ConflictException({
          code: "STUDY_FLASHCARDS_ALREADY_CONFIRMED",
          message: "Bản xem trước này đã được lưu thành bộ flashcards.",
        });
      if (draft.state === "draft")
        await tx.query(
          `UPDATE public.study_coach_flashcard_drafts
           SET state=CASE WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
               payload=NULL,tombstone_until=clock_timestamp()+INTERVAL '90 days'
           WHERE id=$1::uuid AND state='draft'`,
          [draftId],
        );
      return {
        status: draft.expired ? ("expired" as const) : ("cancelled" as const),
      };
    });
  }

  async list(
    page: StudyFlashcardsPage,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsListResponse> {
    const verified = requirePrincipal(principal);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const offset = (page.page - 1) * page.pageSize;
      const result = await tx.query<{
        items: FlashcardSummaryRow[] | string;
        total: number;
      }>(
        `WITH scoped AS (
           ${this.summarySql("q")}
           WHERE q.workspace_id=$1::uuid AND q.user_id=$2::uuid
             AND q.expires_at>clock_timestamp()
         ), page_rows AS (
           SELECT * FROM scoped ORDER BY created_at DESC,id DESC OFFSET $3 LIMIT $4
         )
         SELECT COALESCE((SELECT json_agg(row_to_json(p) ORDER BY p.created_at DESC,p.id DESC)
                          FROM page_rows p),'[]'::json) AS items,
           (SELECT count(*)::int FROM scoped) AS total`,
        [verified.workspaceId, verified.userId, offset, page.pageSize],
      );
      const row = result.rows[0];
      const items = asJson<FlashcardSummaryRow[]>(row?.items) ?? [];
      const total = Number(row?.total ?? 0);
      return {
        items: items.map((item) => this.summary(item)),
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: Math.ceil(total / page.pageSize),
      };
    });
  }

  async detail(
    id: string,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsDetail> {
    const verified = requirePrincipal(principal);
    const deckId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const row = await this.readDeck(tx, deckId);
      const content = this.deckContent(
        row.content,
        row.schema_version,
        row.card_count,
      );
      const availableSources = await tx.query<{ id: string }>(
        `SELECT id::text FROM public.documents
         WHERE workspace_id=$1::uuid AND id=ANY($2::uuid[])
           AND storage_status='stored' AND processing_status='ready'`,
        [
          verified.workspaceId,
          [...new Set(content.sources.map((source) => source.documentId))],
        ],
      );
      const available = new Set(
        availableSources.rows.map((source) => source.id),
      );
      return {
        deck: this.summary(row),
        schemaVersion: STUDY_FLASHCARDS_SCHEMA_VERSION,
        cards: content.cards,
        sources: content.sources.map((source) => ({
          ...source,
          available: available.has(source.documentId),
        })),
      };
    });
  }

  async delete(id: string, principal: PilotPrincipal | undefined) {
    const verified = requirePrincipal(principal);
    const deckId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const deck = await tx.query<{ draft_id: string }>(
        `SELECT draft_id::text FROM public.study_coach_flashcard_decks
         WHERE id=$1::uuid AND expires_at>clock_timestamp()`,
        [deckId],
      );
      if (!deck.rows[0]) throw this.notFound();
      await tx.query(
        `UPDATE public.study_coach_flashcard_drafts
         SET state='deleted',payload=NULL,saved_deck_id=NULL,
             tombstone_until=clock_timestamp()+INTERVAL '90 days'
         WHERE id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid
           AND state='confirmed'`,
        [deck.rows[0].draft_id, verified.workspaceId, verified.userId],
      );
      const removed = await tx.query(
        `DELETE FROM public.study_coach_flashcard_decks
         WHERE id=$1::uuid AND expires_at>clock_timestamp()`,
        [deckId],
      );
      if (removed.rowCount !== 1) throw this.notFound();
      return { status: "deleted" as const };
    });
  }

  async submitReview(
    id: string,
    input: StudyFlashcardsReviewDto,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsReviewResult> {
    const verified = requirePrincipal(principal);
    const deckId = this.id(id);
    if (!UUID.test(input.reviewKey) || !Array.isArray(input.ratings))
      throw this.invalid();
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const deckRow = await this.readDeck(tx, deckId);
      const content = this.deckContent(
        deckRow.content,
        deckRow.schema_version,
        deckRow.card_count,
      );
      const ratingsById = new Map<string, "remembered" | "needs_review">();
      for (const item of input.ratings) {
        if (
          !item ||
          !UUID.test(item.cardId) ||
          !["remembered", "needs_review"].includes(item.rating) ||
          ratingsById.has(item.cardId)
        )
          throw this.invalid();
        ratingsById.set(item.cardId, item.rating);
      }
      if (
        ratingsById.size !== content.cards.length ||
        content.cards.some((card) => !ratingsById.has(card.id))
      )
        throw this.invalid();
      const canonical = content.cards.map((card) => ({
        cardId: card.id,
        rating: ratingsById.get(card.id)!,
      }));
      const payloadHash = digest(JSON.stringify(canonical));
      const existing = await this.readReview(tx, deckId, input.reviewKey);
      if (existing) {
        if (!matchesDigest(existing.payload_hash, payloadHash))
          throw this.reviewConflict();
        return this.reviewResult(
          existing,
          await this.progressFor(
            tx,
            deckId,
            verified.workspaceId,
            verified.userId,
          ),
        );
      }
      const remembered = canonical.filter(
        (item) => item.rating === "remembered",
      ).length;
      await tx.query(
        `INSERT INTO public.study_coach_flashcard_reviews
           (id,deck_id,workspace_id,user_id,review_key,payload_hash,ratings,
            remembered_count,needs_review_count)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
         ON CONFLICT(deck_id,user_id,review_key) DO NOTHING`,
        [
          randomUUID(),
          deckId,
          verified.workspaceId,
          verified.userId,
          input.reviewKey,
          payloadHash,
          JSON.stringify(canonical),
          remembered,
          canonical.length - remembered,
        ],
      );
      const saved = await this.readReview(tx, deckId, input.reviewKey);
      if (!saved) throw this.notFound();
      if (!matchesDigest(saved.payload_hash, payloadHash))
        throw this.reviewConflict();
      const progress = await this.progressFor(
        tx,
        deckId,
        verified.workspaceId,
        verified.userId,
      );
      return this.reviewResult(saved, progress);
    });
  }

  async progress(
    id: string,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyFlashcardsProgressResponse> {
    const verified = requirePrincipal(principal);
    const deckId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      await this.readDeck(tx, deckId);
      return {
        deckId,
        progress: await this.progressFor(
          tx,
          deckId,
          verified.workspaceId,
          verified.userId,
        ),
      };
    });
  }

  private summarySql(alias: string) {
    return `SELECT q.id::text,q.content->>'title' AS title,q.language,
      q.document_id::text AS document_id,q.document_title,
      (d.id IS NOT NULL) AS source_available,q.card_count,q.created_at,q.expires_at,
      COALESCE(r.reviews,0)::int AS reviews,r.latest_at,
      r.latest_remembered,r.latest_needs_review
      FROM public.study_coach_flashcard_decks ${alias}
      LEFT JOIN public.documents d ON d.id=q.document_id AND d.workspace_id=q.workspace_id
        AND d.storage_status='stored' AND d.processing_status='ready'
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS reviews,
          (SELECT completed_at FROM public.study_coach_flashcard_reviews x
           WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
           ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_at,
          (SELECT remembered_count FROM public.study_coach_flashcard_reviews x
           WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
           ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_remembered,
          (SELECT needs_review_count FROM public.study_coach_flashcard_reviews x
           WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
           ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_needs_review
        FROM public.study_coach_flashcard_reviews x
        WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
      ) r ON true`;
  }

  private async summaryById(tx: DatabaseTransaction, id: string) {
    const result = await tx.query<FlashcardSummaryRow>(
      `${this.summarySql("q")}
       WHERE q.id=$1::uuid AND q.expires_at>clock_timestamp()`,
      [id],
    );
    return result.rows[0] ? this.summary(result.rows[0]) : undefined;
  }

  private async readDeck(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<FlashcardDeckRow> {
    const result = await tx.query<FlashcardDeckRow>(
      `SELECT q.id::text,q.draft_id::text,q.workspace_id::text,q.user_id::text,
        q.document_id::text,q.document_title,q.content->>'title' AS title,q.language,q.schema_version,q.content,
        q.card_count,q.created_at,q.expires_at,(d.id IS NOT NULL) AS source_available,
        COALESCE(r.reviews,0)::int AS reviews,r.latest_at,r.latest_remembered,r.latest_needs_review
       FROM public.study_coach_flashcard_decks q
       LEFT JOIN public.documents d ON d.id=q.document_id AND d.workspace_id=q.workspace_id
         AND d.storage_status='stored' AND d.processing_status='ready'
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS reviews,
           (SELECT completed_at FROM public.study_coach_flashcard_reviews x
            WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
            ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_at,
           (SELECT remembered_count FROM public.study_coach_flashcard_reviews x
            WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
            ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_remembered,
           (SELECT needs_review_count FROM public.study_coach_flashcard_reviews x
            WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
            ORDER BY x.completed_at DESC,x.id DESC LIMIT 1) AS latest_needs_review
         FROM public.study_coach_flashcard_reviews x
         WHERE x.deck_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
       ) r ON true
       WHERE q.id=$1::uuid AND q.expires_at>clock_timestamp()`,
      [id],
    );
    if (!result.rows[0]) throw this.notFound();
    return result.rows[0];
  }

  private async progressFor(
    tx: DatabaseTransaction,
    deckId: string,
    workspaceId: string,
    userId: string,
  ): Promise<StudyFlashcardsProgress> {
    const result = await tx.query<{
      reviews: number;
      latest_at: Date | string | null;
      latest_remembered: number | null;
      latest_needs_review: number | null;
    }>(
      `SELECT count(*)::int AS reviews,
        (SELECT completed_at FROM public.study_coach_flashcard_reviews
         WHERE deck_id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid
         ORDER BY completed_at DESC,id DESC LIMIT 1) AS latest_at,
        (SELECT remembered_count FROM public.study_coach_flashcard_reviews
         WHERE deck_id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid
         ORDER BY completed_at DESC,id DESC LIMIT 1) AS latest_remembered,
        (SELECT needs_review_count FROM public.study_coach_flashcard_reviews
         WHERE deck_id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid
         ORDER BY completed_at DESC,id DESC LIMIT 1) AS latest_needs_review
       FROM public.study_coach_flashcard_reviews
       WHERE deck_id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid`,
      [deckId, workspaceId, userId],
    );
    const row = result.rows[0];
    return {
      reviews: Number(row?.reviews ?? 0),
      latestAt: row?.latest_at ? iso(row.latest_at) : null,
      latestRemembered: row?.latest_remembered ?? null,
      latestNeedsReview: row?.latest_needs_review ?? null,
    };
  }

  private async readReview(
    tx: DatabaseTransaction,
    deckId: string,
    reviewKey: string,
  ) {
    const result = await tx.query<ReviewRow>(
      `SELECT id::text,review_key::text,payload_hash,ratings,remembered_count,
        needs_review_count,completed_at
       FROM public.study_coach_flashcard_reviews
       WHERE deck_id=$1::uuid AND review_key=$2::uuid`,
      [deckId, reviewKey],
    );
    return result.rows[0];
  }

  private reviewResult(
    row: ReviewRow,
    progress: StudyFlashcardsProgress,
  ): StudyFlashcardsReviewResult {
    return {
      id: row.id,
      reviewKey: row.review_key,
      completedAt: iso(row.completed_at),
      rememberedCount: row.remembered_count,
      needsReviewCount: row.needs_review_count,
      progress,
    };
  }

  private summary(
    row: FlashcardSummaryRow | FlashcardDeckRow,
  ): StudyFlashcardsSummary {
    return {
      id: row.id,
      title:
        row.title ?? asJson<StudyFlashcardsPreview>(row.content)?.title ?? "",
      language: row.language,
      documentId: row.document_id,
      documentTitle: row.document_title,
      sourceAvailable: row.source_available,
      cardCount: row.card_count,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      progress: {
        reviews: Number(row.reviews),
        latestAt: row.latest_at ? iso(row.latest_at) : null,
        latestRemembered: row.latest_remembered,
        latestNeedsReview: row.latest_needs_review,
      },
    };
  }

  private async readyDocument(
    tx: DatabaseTransaction,
    id: string,
    workspaceId: string,
  ) {
    const result = await tx.query<{ id: string; name: string }>(
      `SELECT id::text,name FROM public.documents
       WHERE id=$1::uuid AND workspace_id=$2::uuid
         AND storage_status='stored' AND processing_status='ready'`,
      [id, workspaceId],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: "DOCUMENT_NOT_READY",
        message: "Tài liệu không còn sẵn sàng để dùng cho flashcards.",
      });
    return result.rows[0];
  }

  private validatePayload(payload: FlashcardPayload): FlashcardPayload {
    const deck = payload?.flashcards;
    if (
      !payload ||
      typeof payload.documentTitle !== "string" ||
      !deck ||
      deck.schemaVersion !== STUDY_FLASHCARDS_SCHEMA_VERSION ||
      !Array.isArray(deck.cards) ||
      deck.cards.length < 3 ||
      deck.cards.length > 10 ||
      !Array.isArray(deck.sources) ||
      deck.sources.length === 0
    )
      throw new ServiceUnavailableException({
        code: "STUDY_FLASHCARDS_DRAFT_INVALID",
        message:
          "Bản xem trước không còn hợp lệ. Hãy kiểm tra trạng thái trước khi tạo bản mới.",
      });
    return payload;
  }

  private deckContent(
    value: unknown,
    schemaVersion: string,
    cardCount: number,
  ): StudyFlashcardsPreview {
    const content = asJson<StudyFlashcardsPreview>(value);
    if (
      !content ||
      schemaVersion !== STUDY_FLASHCARDS_SCHEMA_VERSION ||
      content.schemaVersion !== STUDY_FLASHCARDS_SCHEMA_VERSION ||
      !Array.isArray(content.cards) ||
      content.cards.length !== cardCount ||
      content.cards.length < 3 ||
      content.cards.length > 10 ||
      !Array.isArray(content.sources) ||
      content.sources.length === 0 ||
      content.cards.some(
        (card) =>
          !UUID.test(card.id) ||
          !card.front ||
          !card.back ||
          !card.sourceIds.length,
      )
    )
      throw new ServiceUnavailableException({
        code: "STUDY_FLASHCARDS_DECK_INVALID",
        message: "Bộ flashcards không còn khả dụng.",
      });
    return content;
  }

  private id(value: string) {
    if (typeof value !== "string" || !UUID.test(value)) throw this.invalid();
    return value;
  }
  private token(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
      throw this.invalid();
    return value;
  }
  private requireToken(row: FlashcardDraftRow | undefined, token: string) {
    if (!row || !matchesDigest(row.token_hash, digest(token)))
      throw new NotFoundException({
        code: "STUDY_FLASHCARDS_DRAFT_NOT_FOUND",
        message: "Bản xem trước không còn khả dụng trong tài khoản hiện tại.",
      });
    return row;
  }
  private invalid() {
    return new HttpException(
      {
        code: "STUDY_FLASHCARDS_REQUEST_INVALID",
        message: "Yêu cầu flashcards không hợp lệ.",
      },
      400,
    );
  }
  private notFound() {
    return new NotFoundException({
      code: "STUDY_FLASHCARDS_NOT_FOUND",
      message: "Bộ flashcards không còn khả dụng trong tài khoản hiện tại.",
    });
  }
  private unavailableDeck() {
    return new NotFoundException({
      code: "STUDY_FLASHCARDS_DELETED",
      message: "Bộ flashcards không còn khả dụng.",
    });
  }
  private reviewConflict() {
    return new ConflictException({
      code: "STUDY_FLASHCARDS_REVIEW_CONFLICT",
      message: "Lượt tự đánh giá này đã được lưu với nội dung khác.",
    });
  }
  private sourceChanged() {
    return new ConflictException({
      code: "STUDY_FLASHCARDS_SOURCE_CHANGED",
      message:
        "Tài liệu đã thay đổi trong lúc tạo. Hãy kiểm tra rồi chủ động tạo bản xem trước mới.",
    });
  }
}
