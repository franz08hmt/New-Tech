import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  PilotPrincipal,
  StudyQuizAttemptRequest,
  StudyQuizAttemptResult,
  StudyQuizDetail,
  StudyQuizGeneratedDraft,
  StudyQuizLanguage,
  StudyQuizListResponse,
  StudyQuizPreview,
  StudyQuizProgressResponse,
  StudyQuizSummary,
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
import { studyCoachQuizPrompt } from "../assistant/prompt-registry.js";
import {
  STUDY_QUIZ_SCHEMA_VERSION,
  parseStudyQuizOutput,
  studyQuizResponseSchema,
  type UnidentifiedStudyQuiz,
} from "./study-quiz-validation.js";
import type { StudyQuizGenerateDto, StudyQuizPage } from "./study-coach.dto.js";
import { studyCoachConfig } from "./study-coach.config.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_QUESTION_COUNT = 5;
const QUIZ_OUTPUT_TOKEN_BUDGET = 4096;
const RETRIEVAL_QUERY =
  "Identify the key concepts, definitions, relationships, methods, and facts in this selected study document that can support a short evidence-grounded quiz.";

interface QuizSourceSnapshot {
  sourceId: string;
  documentId: string;
  title: string;
  page: number | null;
  chunkIndex: number;
}

interface QuizPayload {
  documentTitle: string;
  quiz: StudyQuizPreview;
}

interface DraftRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  document_id: string;
  token_hash: string;
  payload: QuizPayload | null;
  state: "draft" | "confirmed" | "cancelled" | "expired";
  saved_quiz_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  expired: boolean;
}

interface QuizSummaryRow extends QueryResultRow {
  id: string;
  title: string;
  language: StudyQuizLanguage;
  document_id: string;
  document_title: string;
  source_available: boolean;
  question_count: number;
  created_at: Date | string;
  expires_at: Date | string;
  attempts: number;
  latest_score: string | null;
  best_score: string | null;
}

interface QuizContent {
  schemaVersion: typeof STUDY_QUIZ_SCHEMA_VERSION;
  title: string;
  language: StudyQuizLanguage;
  questions: StudyQuizPreview["questions"];
  sources: StudyQuizPreview["sources"];
}

interface QuizRow extends QueryResultRow {
  id: string;
  draft_id: string;
  workspace_id: string;
  user_id: string;
  document_id: string;
  document_title: string;
  language: StudyQuizLanguage;
  schema_version: string;
  content: QuizContent;
  question_count: number;
  created_at: Date | string;
  expires_at: Date | string;
  source_available: boolean;
  attempts?: number;
  latest_score?: string | null;
  best_score?: string | null;
}

interface AttemptRow extends QueryResultRow {
  id: string;
  attempt_key: string;
  answer_hash: string;
  answers: Array<{ questionId: string; selectedIndex: number }>;
  correct_count: number;
  question_count: number;
  score_percent: string;
  submitted_at: Date | string;
}

function bad(code = "STUDY_QUIZ_REQUEST_INVALID", status = 400): never {
  throw new HttpException(
    {
      code,
      message: "Yêu cầu Study Coach không hợp lệ hoặc không còn khả dụng.",
    },
    status,
  );
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function matchesDigest(expected: string, actual: string) {
  if (!/^[0-9a-f]{64}$/.test(expected) || !/^[0-9a-f]{64}$/.test(actual))
    return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(actual, "hex"),
  );
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

function noEvidence() {
  return new UnprocessableEntityException({
    code: "STUDY_QUIZ_EVIDENCE_INSUFFICIENT",
    message:
      "Tài liệu chưa có đủ bằng chứng đã lập chỉ mục để tạo quiz an toàn.",
  });
}

function sourceChanged() {
  return new ConflictException({
    code: "STUDY_QUIZ_SOURCE_CHANGED",
    message:
      "Tài liệu đã thay đổi trong lúc tạo quiz. Hãy kiểm tra tài liệu rồi chủ động tạo bản mới.",
  });
}

function safeProviderFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (error instanceof RetrievalError) {
    if (
      error.kind === "document_not_found" ||
      error.kind === "document_scope_mismatch"
    )
      throw new NotFoundException({
        code: "DOCUMENT_NOT_AVAILABLE",
        message: "Tài liệu không còn khả dụng trong workspace hiện tại.",
      });
    if (error.kind === "document_not_ready")
      throw new ConflictException({
        code: "DOCUMENT_NOT_READY",
        message: "Tài liệu chưa được lập chỉ mục sẵn sàng.",
      });
    if (error.kind === "document_has_no_useful_text") throw noEvidence();
    if (error.kind === "document_too_large")
      throw new UnprocessableEntityException({
        code: "STUDY_QUIZ_EVIDENCE_LIMIT",
        message: "Phạm vi bằng chứng vượt giới hạn an toàn của thao tác này.",
      });
    if (error.kind === "invalid_input") bad();
  }
  if (error instanceof AssistantError) {
    const code =
      error.kind === "timeout"
        ? "AI_TIMEOUT"
        : error.kind === "not_configured"
          ? "AI_NOT_CONFIGURED"
          : error.kind === "authentication"
            ? "AI_AUTHENTICATION"
            : error.kind === "quota"
              ? "AI_QUOTA"
              : error.kind === "unavailable"
                ? "AI_UNAVAILABLE"
                : "AI_UPSTREAM";
    throw new ServiceUnavailableException({
      code,
      message:
        "Không thể tạo bản nháp quiz lúc này. Bản nháp chưa được lưu; bạn có thể thử lại thủ công.",
    });
  }
  if (error instanceof EmbeddingError)
    throw new ServiceUnavailableException({
      code: "AI_UPSTREAM",
      message: "Không thể truy xuất bằng chứng cho tài liệu lúc này.",
    });
  throw error;
}

@Injectable()
export class StudyCoachService {
  private readonly config = studyCoachConfig();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
    private readonly retrieval: RagRetrievalService,
    private readonly provider: GeminiService,
    private readonly usage: AiUsageService,
  ) {}

  async generate(
    input: StudyQuizGenerateDto,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizGeneratedDraft> {
    const verified = requirePrincipal(principal);
    const questionCount = input.questionCount ?? DEFAULT_QUESTION_COUNT;
    if (
      !UUID.test(input.documentId) ||
      !Number.isInteger(questionCount) ||
      questionCount < 3 ||
      questionCount > 10 ||
      (input.language !== "vi" && input.language !== "en")
    )
      bad();

    try {
      return await this.usage.runOperation(
        verified,
        {
          operation: "study_quiz",
          mode: "documents",
          prompt: studyCoachQuizPrompt().reference,
        },
        async () => {
          // F04 reserves this operation before the first provider call.
          // Its declared plan is one retrieval embedding + one generation.
          await this.usage.preflightProviderCalls(2);
          const context = await this.retrieval.retrieve(
            RETRIEVAL_QUERY,
            { documentId: input.documentId },
            verified,
          );
          if (!context.evidence.length || !context.context) throw noEvidence();
          if (
            context.evidence.some(
              (item) => item.documentId !== input.documentId,
            )
          )
            throw sourceChanged();

          const prompt = studyCoachQuizPrompt();
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
              JSON.stringify({
                requestedQuestionCount: questionCount,
                language: input.language,
                evidence,
              }),
            ],
            responseMimeType: "application/json",
            responseJsonSchema: studyQuizResponseSchema(questionCount),
            maxOutputTokens: QUIZ_OUTPUT_TOKEN_BUDGET,
          });
          const parsed = parseStudyQuizOutput(
            raw,
            questionCount,
            input.language,
            new Set(context.evidence.map((item) => item.sourceId)),
          );
          if (!parsed) {
            this.usage.markOutcome("rejected");
            throw new UnprocessableEntityException({
              code: "STUDY_QUIZ_OUTPUT_INVALID",
              message:
                "AI chưa tạo được bản nháp đúng cấu trúc và nguồn. Không có quiz nào được lưu.",
            });
          }
          const preview = this.identifyQuiz(parsed, context.evidence);
          const draftId = randomUUID();
          const draftToken = randomBytes(32).toString("base64url");
          const tokenHash = digest(draftToken);
          const payload: QuizPayload = {
            documentTitle: context.evidence[0].documentName,
            quiz: preview,
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
                throw sourceChanged();
              const chunkIds = [
                ...new Set(context.evidence.map((item) => item.chunkId)),
              ];
              const currentChunks = await tx.query<{ id: string }>(
                `SELECT dc.id::text FROM public.document_chunks dc
                 JOIN public.documents d ON d.id=dc.document_id
                 WHERE d.id=$1::uuid AND d.workspace_id=$2::uuid
                   AND d.storage_status='stored' AND d.processing_status='ready'
                   AND dc.id=ANY($3::uuid[])`,
                [input.documentId, verified.workspaceId, chunkIds],
              );
              if (currentChunks.rowCount !== chunkIds.length)
                throw sourceChanged();
              const result = await tx.query<{ expires_at: Date | string }>(
                `INSERT INTO public.study_coach_quiz_drafts
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
              if (!result.rows[0])
                throw new Error("Quiz draft insert returned no row");
              return result.rows[0];
            },
          );
          return {
            draftId,
            draftToken,
            expiresAt: iso(created.expires_at),
            documentId: input.documentId,
            documentTitle: payload.documentTitle,
            quiz: preview,
          };
        },
      );
    } catch (error) {
      return safeProviderFailure(error);
    }
  }

  private identifyQuiz(
    parsed: UnidentifiedStudyQuiz,
    evidence: RagEvidence[],
  ): StudyQuizPreview {
    const bySource = new Map<string, QuizSourceSnapshot>(
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
      schemaVersion: STUDY_QUIZ_SCHEMA_VERSION,
      title: parsed.title,
      language: parsed.language,
      questions: parsed.questions.map((question) => ({
        id: randomUUID(),
        ...question,
      })),
      sources: [
        ...new Map(
          parsed.questions
            .flatMap((question) => question.sourceIds)
            .map((sourceId) => [sourceId, bySource.get(sourceId)!] as const),
        ).values(),
      ],
    };
  }

  async cancelDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ) {
    const verified = requirePrincipal(principal);
    const token = this.token(tokenInput);
    const rowId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const result = await tx.query<DraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_quiz_drafts WHERE id=$1::uuid FOR UPDATE`,
        [rowId],
      );
      const draft = this.requireToken(result.rows[0], token);
      if (draft.state === "confirmed")
        throw new ConflictException({
          code: "STUDY_QUIZ_ALREADY_CONFIRMED",
          message: "Bản nháp này đã được lưu thành quiz.",
        });
      if (draft.state === "draft")
        await tx.query(
          `UPDATE public.study_coach_quiz_drafts
           SET state=CASE WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
               payload=NULL
           WHERE id=$1::uuid AND state='draft'`,
          [rowId],
        );
      return {
        status: draft.expired ? ("expired" as const) : ("cancelled" as const),
      };
    });
  }

  async reconcileDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ) {
    const verified = requirePrincipal(principal);
    const rowId = this.id(id);
    const token = this.token(tokenInput);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const result = await tx.query<DraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_quiz_drafts WHERE id=$1::uuid`,
        [rowId],
      );
      const draft = this.requireToken(result.rows[0], token);
      if (draft.state === "confirmed") {
        const quiz = await this.summaryById(tx, draft.saved_quiz_id!);
        return quiz
          ? { status: "confirmed" as const, quiz }
          : { status: "deleted" as const };
      }
      if (draft.state === "cancelled") return { status: "cancelled" as const };
      if (draft.state === "expired" || draft.expired || !draft.payload)
        return { status: "expired" as const };
      return {
        status: "draft" as const,
        draft: {
          draftId: draft.id,
          expiresAt: iso(draft.expires_at),
          documentId: draft.document_id,
          documentTitle: draft.payload.documentTitle,
          quiz: draft.payload.quiz,
        },
      };
    });
  }

  async confirmDraft(
    id: string,
    tokenInput: unknown,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizSummary> {
    const verified = requirePrincipal(principal);
    const draftId = this.id(id);
    const token = this.token(tokenInput);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const found = await tx.query<DraftRow>(
        `SELECT *,expires_at<=clock_timestamp() AS expired
         FROM public.study_coach_quiz_drafts WHERE id=$1::uuid FOR UPDATE`,
        [draftId],
      );
      const draft = this.requireToken(found.rows[0], token);
      if (draft.state === "confirmed") {
        const existing = await this.summaryById(tx, draft.saved_quiz_id!);
        if (existing) return existing;
        throw new NotFoundException({
          code: "STUDY_QUIZ_DELETED",
          message: "Quiz này không còn khả dụng.",
        });
      }
      if (draft.state !== "draft" || draft.expired || !draft.payload) {
        if (draft.state === "draft")
          await tx.query(
            "UPDATE public.study_coach_quiz_drafts SET state='expired',payload=NULL WHERE id=$1::uuid AND state='draft'",
            [draftId],
          );
        throw new ConflictException({
          code: "STUDY_QUIZ_DRAFT_EXPIRED",
          message:
            "Bản nháp đã hết hạn hoặc đã bị hủy. Hãy tạo bản nháp mới một cách chủ động.",
        });
      }
      const payload = this.validatePayload(draft.payload);
      const document = await this.readyDocument(
        tx,
        draft.document_id,
        verified.workspaceId,
      );
      if (document.name !== payload.documentTitle) throw sourceChanged();
      const quizId = randomUUID();
      await tx.query(
        `INSERT INTO public.study_coach_quizzes
           (id,draft_id,workspace_id,user_id,document_id,document_title,
            language,schema_version,content,question_count,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,
            clock_timestamp()+$11::int*INTERVAL '1 day')`,
        [
          quizId,
          draftId,
          verified.workspaceId,
          verified.userId,
          draft.document_id,
          payload.documentTitle,
          payload.quiz.language,
          STUDY_QUIZ_SCHEMA_VERSION,
          JSON.stringify(payload.quiz),
          payload.quiz.questions.length,
          this.config.quizRetentionDays,
        ],
      );
      await tx.query(
        `UPDATE public.study_coach_quiz_drafts
         SET state='confirmed',payload=NULL,saved_quiz_id=$2
         WHERE id=$1::uuid AND state='draft'`,
        [draftId, quizId],
      );
      const created = await this.summaryById(tx, quizId);
      if (!created)
        throw new Error("Confirmed quiz could not be read in owner scope");
      return created;
    });
  }

  async list(
    page: StudyQuizPage,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizListResponse> {
    const verified = requirePrincipal(principal);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const offset = (page.page - 1) * page.pageSize;
      const result = await tx.query<{
        items: QuizSummaryRow[] | string;
        total: number;
      }>(
        `WITH scoped AS (
           SELECT q.id::text,q.content->>'title' AS title,q.language,q.document_id::text AS document_id,
             q.document_title,(d.id IS NOT NULL) AS source_available,q.question_count,
             q.created_at,q.expires_at,COALESCE(a.attempts,0)::int AS attempts,
             a.latest_score,a.best_score
           FROM public.study_coach_quizzes q
           LEFT JOIN public.documents d ON d.id=q.document_id AND d.workspace_id=q.workspace_id
             AND d.storage_status='stored' AND d.processing_status='ready'
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS attempts,
               (SELECT score_percent::text FROM public.study_coach_quiz_attempts x
                WHERE x.quiz_id=q.id ORDER BY x.submitted_at DESC,x.id DESC LIMIT 1) AS latest_score,
               max(score_percent)::text AS best_score
             FROM public.study_coach_quiz_attempts x
             WHERE x.quiz_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
           ) a ON true
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
      const rawItems = asJson<QuizSummaryRow[]>(row?.items) ?? [];
      const total = row?.total ?? 0;
      return {
        items: rawItems.map((item) => this.summary(item)),
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / page.pageSize),
      };
    });
  }

  async detail(
    id: string,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizDetail> {
    const verified = requirePrincipal(principal);
    const quizId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      const row = await this.readQuiz(tx, quizId);
      const content = this.quizContent(
        row.content,
        row.schema_version,
        row.question_count,
      );
      return {
        quiz: this.summary(row),
        schemaVersion: STUDY_QUIZ_SCHEMA_VERSION,
        questions: content.questions.map(
          ({ correctIndex: _answer, explanation: _why, ...question }) =>
            question,
        ),
        sources: content.sources.map((source) => ({
          ...source,
          available: row.source_available,
        })),
      };
    });
  }

  async delete(id: string, principal: PilotPrincipal | undefined) {
    const verified = requirePrincipal(principal);
    const quizId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
        [quizId],
      );
      const removed = await tx.query(
        `DELETE FROM public.study_coach_quizzes
         WHERE id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid
         RETURNING id`,
        [quizId, verified.workspaceId, verified.userId],
      );
      if (!removed.rowCount)
        throw new NotFoundException({
          code: "STUDY_QUIZ_NOT_FOUND",
          message: "Quiz không còn khả dụng trong tài khoản hiện tại.",
        });
      return { status: "deleted" as const };
    });
  }

  async submitAttempt(
    id: string,
    input: StudyQuizAttemptRequest,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizAttemptResult> {
    const verified = requirePrincipal(principal);
    const quizId = this.id(id);
    if (!UUID.test(input.attemptKey) || !Array.isArray(input.answers)) bad();
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
        [quizId],
      );
      const quizRow = await this.readQuiz(tx, quizId);
      const content = this.quizContent(
        quizRow.content,
        quizRow.schema_version,
        quizRow.question_count,
      );
      const normalized = this.normalizeAnswers(input, content);
      const answerHash = digest(JSON.stringify(normalized));
      const existing = await this.readAttempt(tx, quizId, input.attemptKey);
      if (existing) {
        if (!matchesDigest(existing.answer_hash, answerHash))
          throw new ConflictException({
            code: "STUDY_QUIZ_ATTEMPT_KEY_REUSED",
            message: "Khóa lượt làm đã được dùng với câu trả lời khác.",
          });
        return this.attemptResult(existing, content);
      }
      const correctCount = normalized.reduce(
        (count, answer, index) =>
          count +
          Number(
            answer.selectedIndex === content.questions[index].correctIndex,
          ),
        0,
      );
      const score =
        Math.round((correctCount / content.questions.length) * 10_000) / 100;
      const inserted = await tx.query(
        `INSERT INTO public.study_coach_quiz_attempts
           (id,quiz_id,workspace_id,user_id,attempt_key,answer_hash,answers,
            correct_count,question_count,score_percent)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         ON CONFLICT(quiz_id,user_id,attempt_key) DO NOTHING`,
        [
          randomUUID(),
          quizId,
          verified.workspaceId,
          verified.userId,
          input.attemptKey,
          answerHash,
          JSON.stringify(normalized),
          correctCount,
          content.questions.length,
          score,
        ],
      );
      const persisted = await this.readAttempt(tx, quizId, input.attemptKey);
      if (!persisted || !inserted.rowCount) {
        if (persisted && matchesDigest(persisted.answer_hash, answerHash))
          return this.attemptResult(persisted, content);
        if (persisted)
          throw new ConflictException({
            code: "STUDY_QUIZ_ATTEMPT_KEY_REUSED",
            message: "Khóa lượt làm đã được dùng với câu trả lời khác.",
          });
        throw new Error("Quiz attempt result could not be reconciled");
      }
      return this.attemptResult(persisted, content);
    });
  }

  async progress(
    id: string,
    principal: PilotPrincipal | undefined,
  ): Promise<StudyQuizProgressResponse> {
    const verified = requirePrincipal(principal);
    const quizId = this.id(id);
    return this.database.workspaceTransaction(verified, async (tx) => {
      await this.access.authorize(verified, "read", tx);
      await this.readQuiz(tx, quizId);
      const result = await tx.query<{
        attempts: number;
        latest_score: string | null;
        best_score: string | null;
        latest_submitted_at: Date | string | null;
      }>(
        `SELECT count(*)::int AS attempts,
           (SELECT score_percent::text FROM public.study_coach_quiz_attempts a
            WHERE a.quiz_id=$1::uuid ORDER BY a.submitted_at DESC,a.id DESC LIMIT 1) AS latest_score,
           max(score_percent)::text AS best_score,max(submitted_at) AS latest_submitted_at
         FROM public.study_coach_quiz_attempts
         WHERE quiz_id=$1::uuid AND workspace_id=$2::uuid AND user_id=$3::uuid`,
        [quizId, verified.workspaceId, verified.userId],
      );
      const row = result.rows[0];
      return {
        quizId,
        attempts: row?.attempts ?? 0,
        latestScore:
          row?.latest_score === null || row?.latest_score === undefined
            ? null
            : Number(row.latest_score),
        bestScore:
          row?.best_score === null || row?.best_score === undefined
            ? null
            : Number(row.best_score),
        latestSubmittedAt: row?.latest_submitted_at
          ? iso(row.latest_submitted_at)
          : null,
      };
    });
  }

  private id(value: string) {
    if (typeof value !== "string" || !UUID.test(value)) bad();
    return value;
  }

  private token(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) bad();
    return value as string;
  }

  private requireToken(row: DraftRow | undefined, token: string): DraftRow {
    if (!row || !matchesDigest(row.token_hash, digest(token)))
      throw new NotFoundException({
        code: "STUDY_QUIZ_DRAFT_NOT_FOUND",
        message: "Bản nháp không còn khả dụng trong tài khoản hiện tại.",
      });
    return row;
  }

  private async readyDocument(
    tx: DatabaseTransaction,
    documentId: string,
    workspaceId: string,
  ) {
    const result = await tx.query<{ id: string; name: string }>(
      `SELECT id::text,name FROM public.documents
       WHERE id=$1::uuid AND workspace_id=$2::uuid
         AND storage_status='stored' AND processing_status='ready'`,
      [documentId, workspaceId],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: "DOCUMENT_NOT_READY",
        message: "Tài liệu không còn sẵn sàng để sử dụng cho quiz.",
      });
    return result.rows[0];
  }

  private validatePayload(payload: QuizPayload) {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.documentTitle !== "string" ||
      !payload.quiz ||
      payload.quiz.schemaVersion !== STUDY_QUIZ_SCHEMA_VERSION ||
      !Array.isArray(payload.quiz.questions) ||
      payload.quiz.questions.length < 3 ||
      payload.quiz.questions.length > 10
    )
      throw new ServiceUnavailableException({
        code: "STUDY_QUIZ_DRAFT_INVALID",
        message:
          "Bản nháp không còn hợp lệ. Hãy tạo bản mới một cách chủ động.",
      });
    return payload;
  }

  private summary(row: QuizSummaryRow | QuizRow): StudyQuizSummary {
    return {
      id: row.id,
      title: row.title,
      language: row.language,
      documentId: row.document_id,
      documentTitle: row.document_title,
      sourceAvailable: row.source_available,
      questionCount: row.question_count,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      progress: {
        attempts: Number(row.attempts ?? 0),
        latestScore:
          row.latest_score === null || row.latest_score === undefined
            ? null
            : Number(row.latest_score),
        bestScore:
          row.best_score === null || row.best_score === undefined
            ? null
            : Number(row.best_score),
      },
    };
  }

  private async summaryById(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<StudyQuizSummary | undefined> {
    const result = await tx.query<QuizSummaryRow>(
      `SELECT q.id::text,q.content->>'title' AS title,q.language,q.document_id::text AS document_id,
        q.document_title,(d.id IS NOT NULL) AS source_available,q.question_count,
        q.created_at,q.expires_at,COALESCE(a.attempts,0)::int AS attempts,
        a.latest_score,a.best_score
       FROM public.study_coach_quizzes q
       LEFT JOIN public.documents d ON d.id=q.document_id AND d.workspace_id=q.workspace_id
         AND d.storage_status='stored' AND d.processing_status='ready'
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS attempts,
           (SELECT score_percent::text FROM public.study_coach_quiz_attempts x
            WHERE x.quiz_id=q.id ORDER BY x.submitted_at DESC,x.id DESC LIMIT 1) AS latest_score,
           max(score_percent)::text AS best_score
         FROM public.study_coach_quiz_attempts x
         WHERE x.quiz_id=q.id AND x.workspace_id=q.workspace_id AND x.user_id=q.user_id
       ) a ON true
       WHERE q.id=$1::uuid AND q.expires_at>clock_timestamp()`,
      [id],
    );
    return result.rows[0] ? this.summary(result.rows[0]) : undefined;
  }

  private async readQuiz(tx: DatabaseTransaction, id: string) {
    const result = await tx.query<QuizRow>(
      `SELECT q.id::text,q.draft_id::text,q.workspace_id::text,q.user_id::text,
        q.document_id::text,q.document_title,q.language,q.schema_version,q.content,
        q.question_count,q.created_at,q.expires_at,(d.id IS NOT NULL) AS source_available
       FROM public.study_coach_quizzes q
       LEFT JOIN public.documents d ON d.id=q.document_id AND d.workspace_id=q.workspace_id
         AND d.storage_status='stored' AND d.processing_status='ready'
       WHERE q.id=$1::uuid AND q.expires_at>clock_timestamp()`,
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: "STUDY_QUIZ_NOT_FOUND",
        message: "Quiz không còn khả dụng trong tài khoản hiện tại.",
      });
    return row;
  }

  private quizContent(
    contentValue: unknown,
    schemaVersion: string,
    count: number,
  ): QuizContent {
    const content = asJson<QuizContent>(contentValue);
    if (
      schemaVersion !== STUDY_QUIZ_SCHEMA_VERSION ||
      !content ||
      content.schemaVersion !== STUDY_QUIZ_SCHEMA_VERSION ||
      !Array.isArray(content.questions) ||
      content.questions.length !== count ||
      !Array.isArray(content.sources)
    )
      throw new ServiceUnavailableException({
        code: "STUDY_QUIZ_DATA_INVALID",
        message: "Quiz không thể được mở an toàn lúc này.",
      });
    return content;
  }

  private normalizeAnswers(
    input: StudyQuizAttemptRequest,
    content: QuizContent,
  ) {
    if (
      input.answers.length !== content.questions.length ||
      input.answers.some(
        (answer) =>
          !UUID.test(answer.questionId) ||
          !Number.isInteger(answer.selectedIndex) ||
          answer.selectedIndex < 0 ||
          answer.selectedIndex > 3,
      )
    )
      bad();
    const byId = new Map(
      content.questions.map((question, index) => [
        question.id,
        { question, index },
      ]),
    );
    const submitted = new Map<string, number>();
    for (const answer of input.answers) {
      if (!byId.has(answer.questionId) || submitted.has(answer.questionId))
        bad();
      submitted.set(answer.questionId, answer.selectedIndex);
    }
    if (submitted.size !== content.questions.length) bad();
    return content.questions.map((question) => ({
      questionId: question.id,
      selectedIndex: submitted.get(question.id)!,
    }));
  }

  private async readAttempt(
    tx: DatabaseTransaction,
    quizId: string,
    key: string,
  ) {
    const result = await tx.query<AttemptRow>(
      `SELECT id::text,attempt_key::text,answer_hash,answers,correct_count,
        question_count,score_percent::text,submitted_at
       FROM public.study_coach_quiz_attempts WHERE quiz_id=$1::uuid AND attempt_key=$2::uuid`,
      [quizId, key],
    );
    return result.rows[0];
  }

  private attemptResult(
    row: AttemptRow,
    content: QuizContent,
  ): StudyQuizAttemptResult {
    const answers =
      asJson<Array<{ questionId: string; selectedIndex: number }>>(
        row.answers,
      ) ?? [];
    const byId = new Map(
      content.questions.map((question) => [question.id, question]),
    );
    return {
      id: row.id,
      attemptKey: row.attempt_key,
      correctCount: Number(row.correct_count),
      questionCount: Number(row.question_count),
      scorePercent: Number(row.score_percent),
      submittedAt: iso(row.submitted_at),
      answers: answers.map((answer) => {
        const question = byId.get(answer.questionId);
        if (!question)
          throw new Error("Stored quiz attempt question is unavailable");
        return {
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          correctIndex: question.correctIndex,
          correct: answer.selectedIndex === question.correctIndex,
          explanation: question.explanation,
          sourceIds: question.sourceIds,
        };
      }),
    };
  }
}
