import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type { AssistantChatDto } from "./assistant-chat.dto.js";
import type { AssistantReasonCode, PilotPrincipal } from "@examate/contracts";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { DatabaseService } from "../database/database.service.js";
import { AiUsageService } from "./ai-usage.service.js";
import { log } from "../common/log.js";
import { conversationConfig } from "../config/config.js";
import {
  buildConversationContext,
  retrievalQuestion,
  type ConversationTurn,
} from "./conversation-context.js";
import { EmbeddingError } from "./gemini-embedding.service.js";
import { GeminiService } from "./gemini.service.js";
import { buildRagContext } from "./rag-context.js";
import type { RagCitation, RagContext, RetrievedChunk } from "./rag-context.js";
import {
  RagRetrievalService,
  RetrievalError,
} from "./rag-retrieval.service.js";
import {
  AssistantError,
  type AssistantAnswer,
  type AssistantProvider,
  type AssistantStreamResult,
} from "./assistant.types.js";
import { StructuredAnswerStream } from "./structured-answer-stream.js";
import {
  groundedAnswerSchema,
  GROUNDED_OUTPUT_TOKENS,
  GROUNDED_THINKING_TOKENS,
  renderGroundedBlocks,
} from "./grounded-answer-format.js";
import {
  isSourceId,
  sameSourceIdSet,
  scanSourceMarkers,
} from "./source-markers.js";
import {
  documentsQuestionPrompt,
  generalPrompt,
  PROMPT_VERSIONS,
  summarySectionPrompt,
  summarySynthesisPrompt,
} from "./prompt-registry.js";

const SUMMARY_BATCH_CHARACTERS = 60_000;
const MAX_SUMMARY_BATCHES = 16;

const UNANSWERABLE =
  "Không đủ bằng chứng trong các tài liệu đã lập chỉ mục để trả lời câu hỏi này.";

interface StructuredAnswer {
  answerable: boolean;
  answer: string;
  citationIds: string[];
}

@Injectable()
export class AssistantService {
  constructor(
    @Inject(GeminiService) private readonly provider: AssistantProvider,
    private readonly retrieval: RagRetrievalService,
    private readonly access: DocumentAccessService,
    private readonly database: DatabaseService,
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  private authorize(principal?: PilotPrincipal) {
    return this.database.workspaceTransaction(principal, (tx) =>
      this.access.authorize(principal, "read", tx),
    );
  }

  status() {
    return this.provider.status();
  }

  async chat(
    input: AssistantChatDto,
    principal?: PilotPrincipal,
  ): Promise<AssistantAnswer> {
    const mode = input.mode ?? "documents";
    const operation = input.operation ?? "question";
    const startedAt = Date.now();
    try {
      const verified = await this.authorize(principal);
      const context = buildConversationContext(
        input.history ?? [],
        conversationConfig().maxChars,
      );
      const finish = (answer: AssistantAnswer): AssistantAnswer => {
        if (!input.history?.length) return answer;
        const result = {
          ...answer,
          contextTurnsUsed: context.turns.length,
          contextTruncated: context.truncated,
          promptVersion:
            mode === "general"
              ? PROMPT_VERSIONS.generalConversation
              : PROMPT_VERSIONS.documentsConversation,
        };
        log("info", "assistant.context.applied", {
          mode,
          promptVersion: result.promptVersion,
          contextTurnsUsed: context.turns.length,
          contextTruncated: context.truncated,
        });
        return result;
      };
      if (mode === "general") {
        if (operation !== "question" || input.documentId)
          throw new BadRequestException({
            code: "DOCUMENT_MODE_REQUIRED",
            message:
              "Document selection and summarization require documents mode.",
          });
        return finish(
          await this.generalChat(input, startedAt, verified, context.turns),
        );
      }
      if (operation === "summarize")
        return await this.summarizeDocument(input, startedAt, verified);
      if (operation === "course_info")
        return await this.documentCourseInfo(input, startedAt, verified);
      return finish(
        await this.documentChat(input, startedAt, verified, context.turns),
      );
    } catch (error: unknown) {
      log("error", "assistant.chat.failed", {
        mode,
        operation,
        reasonCode: this.failureReasonCode(error),
        // Which validation refused the answer, when that is what failed.
        rejection:
          error instanceof AssistantError ? error.rejection : undefined,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async *streamGeneralChat(
    input: AssistantChatDto,
    principal: PilotPrincipal | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<AssistantStreamResult> {
    const startedAt = Date.now();
    try {
      if (
        input.mode !== "general" ||
        (input.operation !== undefined && input.operation !== "question") ||
        input.documentId
      )
        throw new BadRequestException({
          code: "STREAM_GENERAL_ONLY",
          message:
            "Streaming hiện hỗ trợ Chat thông thường; Hỏi tài liệu giữ xác minh citation trước khi trả lời.",
        });

      const verified = await this.authorize(principal);
      const context = buildConversationContext(
        input.history ?? [],
        conversationConfig().maxChars,
      );
      const generateStream = this.provider.generateStream;
      if (!generateStream) throw new AssistantError("unavailable");
      const generationStartedAt = Date.now();
      const parts = this.userParts(input);
      await this.authorize(verified);
      await this.usage?.preflightProviderCalls(1);
      const prompt = generalPrompt(context.turns.length > 0);
      yield { type: "status", stage: "generating" };

      let answer = "";
      for await (const delta of generateStream.call(
        this.provider,
        {
          systemInstruction: prompt.systemInstruction,
          prompt: prompt.reference,
          userParts: parts,
          ...this.conversation(context.turns),
        },
        signal,
      )) {
        if (signal?.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        answer += delta;
        yield { type: "delta", text: delta };
      }

      answer = answer.trim();
      if (!answer) throw new AssistantError("upstream");
      const result: AssistantAnswer = {
        answer,
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        provider: "google",
        model: this.provider.model,
        mode: "general",
        ragEnabled: false,
        promptVersion: prompt.reference.version,
        ...(input.history?.length
          ? {
              contextTurnsUsed: context.turns.length,
              contextTruncated: context.truncated,
            }
          : {}),
      };
      if (input.history?.length)
        log("info", "assistant.context.applied", {
          mode: "general",
          promptVersion: result.promptVersion,
          contextTurnsUsed: context.turns.length,
          contextTruncated: context.truncated,
        });
      this.logCompleted("general", "question", result.reasonCode, startedAt, {
        evidenceCount: 0,
        generationMs: Date.now() - generationStartedAt,
        streaming: true,
      });
      yield { type: "result", answer: result };
    } catch (error: unknown) {
      if (!signal?.aborted)
        log("error", "assistant.chat.failed", {
          mode: "general",
          operation: "question",
          reasonCode: this.failureReasonCode(error),
          durationMs: Date.now() - startedAt,
          streaming: true,
        });
      throw error;
    }
  }

  async *streamDocumentChat(
    input: AssistantChatDto,
    principal: PilotPrincipal | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<AssistantStreamResult> {
    const startedAt = Date.now();
    try {
      if (
        input.mode !== "documents" ||
        (input.operation !== undefined && input.operation !== "question")
      )
        throw new BadRequestException({
          code: "STREAM_QUESTION_ONLY",
          message:
            "Streaming chỉ hỗ trợ câu hỏi; tóm tắt và thông tin môn học dùng thao tác riêng.",
        });

      const verified = await this.authorize(principal);
      const context = buildConversationContext(
        input.history ?? [],
        conversationConfig().maxChars,
      );
      await this.usage?.preflightProviderCalls(2);
      yield { type: "status", stage: "retrieving" };

      const retrievalStartedAt = Date.now();
      let rag: RagContext;
      try {
        rag = await this.retrieval.retrieve(
          retrievalQuestion(input.message, context.turns),
          {
            courseId: input.courseId,
            ...(input.documentId ? { documentId: input.documentId } : {}),
          },
          verified,
        );
      } catch (error: unknown) {
        throw this.normalizeRetrievalError(error);
      }
      const retrievalMs = Date.now() - retrievalStartedAt;
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (!rag.context) {
        let answer = this.response(
          UNANSWERABLE,
          false,
          [],
          rag.promptVersion,
          "NO_RELEVANT_EVIDENCE",
        );
        if (input.history?.length)
          answer = {
            ...answer,
            contextTurnsUsed: context.turns.length,
            contextTruncated: context.truncated,
            promptVersion: PROMPT_VERSIONS.documentsConversation,
          };
        this.logCompleted(
          "documents",
          "question",
          answer.reasonCode,
          startedAt,
          {
            evidenceCount: 0,
            retrievalMs,
            streaming: true,
          },
        );
        yield { type: "result", answer };
        return;
      }

      const generateStream = this.provider.generateStream;
      if (!generateStream) throw new AssistantError("unavailable");
      const userParts = this.userParts(input);
      userParts.push(rag.context);
      const generationStartedAt = Date.now();
      await this.authorize(verified);
      await this.usage?.preflightProviderCalls(2);
      const prompt = documentsQuestionPrompt(
        rag.promptVersion,
        context.turns.length > 0,
      );
      yield { type: "status", stage: "generating" };

      const parser = new StructuredAnswerStream();
      for await (const chunk of generateStream.call(
        this.provider,
        {
          systemInstruction: prompt.systemInstruction,
          prompt: prompt.reference,
          userParts,
          ...this.conversation(context.turns),
          responseMimeType: "application/json",
          responseJsonSchema: groundedAnswerSchema(
            rag.citations.map((item) => item.sourceId),
          ),
          maxOutputTokens: GROUNDED_OUTPUT_TOKENS,
          thinkingBudget: GROUNDED_THINKING_TOKENS,
        },
        signal,
      )) {
        if (signal?.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        try {
          // Document output stays private until the complete citation validator
          // and the controller's fresh receipt authorization have both passed.
          // Removing source markers alone cannot make an unverified claim safe.
          parser.push(chunk);
        } catch {
          throw new AssistantError("upstream", "answer_not_json");
        }
      }
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");

      const parsed = this.parseStructuredAnswer(parser.completeRaw);
      let answer: AssistantAnswer;
      if (!parsed.answerable) {
        if (this.refusalCarriesSources(parsed))
          throw new AssistantError("upstream", "unanswerable_with_citations");
        answer = this.response(
          UNANSWERABLE,
          false,
          [],
          prompt.reference.version,
          "NO_RELEVANT_EVIDENCE",
        );
      } else {
        const citations = this.validateCitations(parsed, rag);
        const partial = this.isPartialCoverage(rag.coverage);
        answer = this.response(
          parsed.answer,
          true,
          citations,
          prompt.reference.version,
          partial ? "PARTIAL_COVERAGE" : "ANSWER_GENERATED",
        );
      }
      if (input.history?.length) {
        answer = {
          ...answer,
          contextTurnsUsed: context.turns.length,
          contextTruncated: context.truncated,
          promptVersion: PROMPT_VERSIONS.documentsConversation,
        };
        log("info", "assistant.context.applied", {
          mode: "documents",
          promptVersion: answer.promptVersion,
          contextTurnsUsed: context.turns.length,
          contextTruncated: context.truncated,
        });
      }
      this.logCompleted("documents", "question", answer.reasonCode, startedAt, {
        evidenceCount: rag.evidence.length,
        retrievalMs,
        generationMs: Date.now() - generationStartedAt,
        streaming: true,
        ...(rag.coverage ?? {}),
      });
      yield { type: "result", answer };
    } catch (error: unknown) {
      if (!signal?.aborted)
        log("error", "assistant.chat.failed", {
          mode: "documents",
          operation: "question",
          reasonCode: this.failureReasonCode(error),
          rejection:
            error instanceof AssistantError ? error.rejection : undefined,
          durationMs: Date.now() - startedAt,
          streaming: true,
        });
      throw error;
    }
  }

  private async generalChat(
    input: AssistantChatDto,
    startedAt: number,
    principal: PilotPrincipal,
    turns: ConversationTurn[] = [],
  ): Promise<AssistantAnswer> {
    const generationStartedAt = Date.now();
    const userParts = this.userParts(input);
    await this.authorize(principal);
    await this.usage?.preflightProviderCalls(1);
    const prompt = generalPrompt(turns.length > 0);
    const answer = await this.provider.generate({
      systemInstruction: prompt.systemInstruction,
      prompt: prompt.reference,
      userParts,
      ...this.conversation(turns),
    });
    const result: AssistantAnswer = {
      answer,
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: this.provider.model,
      mode: "general",
      ragEnabled: false,
      promptVersion: prompt.reference.version,
    };
    this.logCompleted("general", "question", result.reasonCode, startedAt, {
      evidenceCount: 0,
      generationMs: Date.now() - generationStartedAt,
    });
    return result;
  }

  private async documentChat(
    input: AssistantChatDto,
    startedAt: number,
    principal: PilotPrincipal,
    turns: ConversationTurn[] = [],
  ): Promise<AssistantAnswer> {
    const retrievalStartedAt = Date.now();
    await this.usage?.preflightProviderCalls(2);
    let rag: RagContext;
    try {
      rag = await this.retrieval.retrieve(
        retrievalQuestion(input.message, turns),
        {
          courseId: input.courseId,
          ...(input.documentId ? { documentId: input.documentId } : {}),
        },
        principal,
      );
    } catch (error: unknown) {
      throw this.normalizeRetrievalError(error);
    }

    const retrievalMs = Date.now() - retrievalStartedAt;
    if (!rag.context) {
      const result = this.response(
        UNANSWERABLE,
        false,
        [],
        rag.promptVersion,
        "NO_RELEVANT_EVIDENCE",
      );
      this.logCompleted("documents", "question", result.reasonCode, startedAt, {
        evidenceCount: 0,
        retrievalMs,
      });
      return result;
    }

    const userParts = this.userParts(input);
    userParts.push(rag.context);
    const generationStartedAt = Date.now();
    await this.authorize(principal);
    const prompt = documentsQuestionPrompt(rag.promptVersion, turns.length > 0);
    const raw = await this.provider.generate({
      systemInstruction: prompt.systemInstruction,
      prompt: prompt.reference,
      userParts,
      ...this.conversation(turns),
      responseMimeType: "application/json",
      responseJsonSchema: groundedAnswerSchema(
        rag.citations.map((item) => item.sourceId),
      ),
      maxOutputTokens: GROUNDED_OUTPUT_TOKENS,
      thinkingBudget: GROUNDED_THINKING_TOKENS,
    });
    const parsed = this.parseStructuredAnswer(raw);
    if (!parsed.answerable) {
      if (this.refusalCarriesSources(parsed))
        throw new AssistantError("upstream", "unanswerable_with_citations");
      const result = this.response(
        UNANSWERABLE,
        false,
        [],
        prompt.reference.version,
        "NO_RELEVANT_EVIDENCE",
      );
      this.logCompleted("documents", "question", result.reasonCode, startedAt, {
        evidenceCount: rag.evidence.length,
        retrievalMs,
        generationMs: Date.now() - generationStartedAt,
      });
      return result;
    }

    const citations = this.validateCitations(parsed, rag);
    const partial = this.isPartialCoverage(rag.coverage);
    const result = this.response(
      parsed.answer,
      true,
      citations,
      prompt.reference.version,
      partial ? "PARTIAL_COVERAGE" : "ANSWER_GENERATED",
    );
    this.logCompleted("documents", "question", result.reasonCode, startedAt, {
      evidenceCount: rag.evidence.length,
      retrievalMs,
      generationMs: Date.now() - generationStartedAt,
      ...(rag.coverage ?? {}),
    });
    return result;
  }

  private async documentCourseInfo(
    input: AssistantChatDto,
    startedAt: number,
    principal: PilotPrincipal,
  ): Promise<AssistantAnswer> {
    if (!input.documentId)
      throw new BadRequestException({
        code: "DOCUMENT_SELECTION_REQUIRED",
        message: "Choose one document before asking for its course.",
      });

    let source;
    try {
      source = await this.retrieval.documentMetadata(
        input.documentId,
        {
          courseId: input.courseId,
        },
        principal,
      );
    } catch (error: unknown) {
      throw this.normalizeRetrievalError(error);
    }
    const result: AssistantAnswer = {
      answer: source.courseName
        ? `Trong workspace, tài liệu “${source.title}” được gắn với môn ${source.courseName} (${source.courseCode}). Đây là thông tin bạn đã gán cho tài liệu, không phải kết luận rút ra từ nội dung PDF.`
        : `Trong workspace, tài liệu “${source.title}” chưa được gắn với môn học nào.`,
      answerable: true,
      reasonCode: "DOCUMENT_METADATA",
      citations: [],
      provider: "workspace",
      model: "database",
      mode: "documents",
      ragEnabled: false,
      promptVersion: "workspace-metadata-v1",
      metadataSource: source,
    };
    this.logCompleted(
      "documents",
      "course_info",
      result.reasonCode,
      startedAt,
      {
        evidenceCount: 0,
      },
    );
    return result;
  }

  private async summarizeDocument(
    input: AssistantChatDto,
    startedAt: number,
    principal: PilotPrincipal,
  ): Promise<AssistantAnswer> {
    if (!input.documentId)
      throw new BadRequestException({
        code: "DOCUMENT_SELECTION_REQUIRED",
        message: "Choose one indexed document before requesting a summary.",
      });

    const retrievalStartedAt = Date.now();
    let material;
    try {
      material = await this.retrieval.documentForSummary(
        input.documentId,
        {
          courseId: input.courseId,
        },
        principal,
      );
    } catch (error: unknown) {
      throw this.normalizeRetrievalError(error);
    }

    const retrievalMs = Date.now() - retrievalStartedAt;
    const groups: RetrievedChunk[][] = [];
    let current: RetrievedChunk[] = [];
    let currentCharacters = 0;
    for (const chunk of material.chunks) {
      if (
        current.length &&
        currentCharacters + chunk.content.length > SUMMARY_BATCH_CHARACTERS
      ) {
        groups.push(current);
        current = [];
        currentCharacters = 0;
      }
      current.push(chunk);
      currentCharacters += chunk.content.length;
    }
    if (current.length) groups.push(current);
    if (groups.length > MAX_SUMMARY_BATCHES)
      throw new ConflictException({
        code: "DOCUMENT_TOO_LARGE",
        message:
          "The document is too large to summarize safely in one request.",
      });

    await this.usage?.preflightProviderCalls(
      groups.length + (groups.length > 1 ? 1 : 0),
    );

    const sectionSummaries: Array<{
      section: number;
      answer: string;
      citationIds: string[];
    }> = [];
    const allCitations: RagCitation[] = [];
    let sourceOffset = 0;
    for (const [index, group] of groups.entries()) {
      const rag = buildRagContext(group, PROMPT_VERSIONS.summary, sourceOffset);
      if (!rag.context || rag.evidence.length !== group.length)
        throw new ConflictException({
          code: "DOCUMENT_TOO_LARGE",
          message:
            "The document section exceeds the safe summary context limit.",
        });
      sourceOffset += rag.evidence.length;
      await this.authorize(principal);
      const prompt = summarySectionPrompt();
      const raw = await this.provider.generate({
        systemInstruction: prompt.systemInstruction,
        prompt: prompt.reference,
        userParts: [
          `Summarize section ${index + 1} of ${groups.length} from the selected document ${JSON.stringify(material.documentName)}.`,
          `User request and target language (untrusted): ${JSON.stringify(input.message)}`,
          rag.context,
        ],
        responseMimeType: "application/json",
        responseJsonSchema: groundedAnswerSchema(
          rag.citations.map((item) => item.sourceId),
        ),
        maxOutputTokens: GROUNDED_OUTPUT_TOKENS,
        thinkingBudget: GROUNDED_THINKING_TOKENS,
      });
      const parsed = this.parseStructuredAnswer(raw);
      if (!parsed.answerable)
        throw new AssistantError("upstream", "summary_section_unanswerable");
      const citations = this.validateCitations(parsed, rag);
      allCitations.push(...citations);
      sectionSummaries.push({
        section: index + 1,
        answer: parsed.answer,
        citationIds: parsed.citationIds,
      });
    }

    let answer: string;
    let citations: RagCitation[];
    if (sectionSummaries.length === 1) {
      answer = sectionSummaries[0].answer;
      citations = allCitations;
    } else {
      const uniqueCitations = [
        ...new Map(allCitations.map((item) => [item.sourceId, item])).values(),
      ];
      await this.authorize(principal);
      const prompt = summarySynthesisPrompt();
      const raw = await this.provider.generate({
        systemInstruction: prompt.systemInstruction,
        prompt: prompt.reference,
        userParts: [
          `Create the final summary requested by the user: ${input.message}`,
          `Untrusted section summaries: ${JSON.stringify(sectionSummaries)}`,
          `Allowed source catalog: ${JSON.stringify(
            uniqueCitations.map(({ sourceId, title, page }) => ({
              sourceId,
              title,
              page,
            })),
          )}`,
        ],
        responseMimeType: "application/json",
        responseJsonSchema: groundedAnswerSchema(
          uniqueCitations.map((item) => item.sourceId),
        ),
        maxOutputTokens: GROUNDED_OUTPUT_TOKENS,
        thinkingBudget: GROUNDED_THINKING_TOKENS,
      });
      const parsed = this.parseStructuredAnswer(raw);
      if (!parsed.answerable)
        throw new AssistantError("upstream", "summary_unanswerable");
      const syntheticRag: RagContext = {
        promptVersion: PROMPT_VERSIONS.summary,
        context: null,
        evidence: [],
        citations: uniqueCitations,
      };
      citations = this.validateCitations(parsed, syntheticRag);
      answer = parsed.answer;
    }

    const coverage = material.coverage;
    const partial =
      coverage.needsOcr ||
      (coverage.lowTextPageCount ?? 0) > 0 ||
      coverage.totalPageCount === null;
    const reasonCode: AssistantReasonCode = partial
      ? "PARTIAL_COVERAGE"
      : "ANSWER_GENERATED";
    const result = this.response(
      answer,
      true,
      citations,
      PROMPT_VERSIONS.summary,
      reasonCode,
    );
    this.logCompleted("documents", "summarize", reasonCode, startedAt, {
      evidenceCount: material.chunks.length,
      retrievalMs,
      generationMs: Date.now() - retrievalStartedAt - retrievalMs,
      totalPageCount: coverage.totalPageCount,
      usefulTextPageCount: coverage.usefulTextPageCount,
      lowTextPageCount: coverage.lowTextPageCount,
      needsOcr: coverage.needsOcr,
    });
    return result;
  }

  private userParts(input: AssistantChatDto) {
    const parts: string[] = [];
    if (input.pageContext) {
      parts.push(
        `Untrusted UI page metadata: ${JSON.stringify({
          pageId: input.pageContext.pageId,
          pageName: input.pageContext.pageName,
        })}`,
      );
    }
    parts.push(`Question: ${input.message}`);
    return parts;
  }

  private parseStructuredAnswer(raw: string): StructuredAnswer {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AssistantError("upstream", "answer_not_json");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new AssistantError("upstream", "answer_not_object");
    const record = Object.hasOwn(value, "blocks")
      ? renderGroundedBlocks(value as Record<string, unknown>)
      : (value as Record<string, unknown>);
    if (
      Object.keys(record).sort().join(",") !==
        "answer,answerable,citationIds" ||
      typeof record.answerable !== "boolean" ||
      typeof record.answer !== "string" ||
      !record.answer.trim() ||
      record.answer.length > 8_000 ||
      !Array.isArray(record.citationIds) ||
      record.citationIds.length > 20 ||
      record.citationIds.some((id) => !isSourceId(id))
    )
      throw new AssistantError("upstream", "answer_shape_invalid");
    const citationIds = record.citationIds as string[];
    if (new Set(citationIds).size !== citationIds.length)
      throw new AssistantError("upstream", "citation_ids_duplicate");
    return {
      answerable: record.answerable,
      answer: record.answer.trim(),
      citationIds,
    };
  }

  /** A refusal carries no citation IDs and no source-like text, well formed or
   * not; both document paths apply the same rule before the fixed refusal text
   * replaces the model's wording. */
  private refusalCarriesSources(parsed: StructuredAnswer) {
    return (
      parsed.citationIds.length > 0 ||
      scanSourceMarkers(parsed.answer).sourceLike.length > 0
    );
  }

  private validateCitations(parsed: StructuredAnswer, rag: RagContext) {
    if (parsed.citationIds.length === 0)
      throw new AssistantError("upstream", "citation_ids_missing");
    const scan = scanSourceMarkers(parsed.answer);
    // Split only so the refusal can say which rule failed. Malformed is checked
    // before missing: "[S1, S2]" is an attempt to cite in the wrong form, not
    // an answer that forgot to cite.
    if (scan.malformed)
      throw new AssistantError("upstream", "source_marker_malformed");
    if (scan.ids.length === 0)
      throw new AssistantError("upstream", "source_marker_missing");
    if (!sameSourceIdSet(scan.ids, parsed.citationIds))
      throw new AssistantError("upstream", "source_marker_mismatch");
    const available = new Map(
      rag.citations.map((item) => [item.sourceId, item]),
    );
    const citations = parsed.citationIds.map((id) => available.get(id));
    if (citations.some((citation) => !citation))
      throw new AssistantError("upstream", "citation_not_in_evidence");
    return citations as RagCitation[];
  }

  private conversation(turns: ConversationTurn[]) {
    return turns.length
      ? {
          conversation: turns.flatMap((turn) => [
            { role: "user" as const, text: turn.question },
            { role: "model" as const, text: turn.answer },
          ]),
        }
      : {};
  }

  private response(
    answer: string,
    answerable: boolean,
    citations: RagCitation[],
    promptVersion: string,
    reasonCode: Exclude<AssistantReasonCode, "DOCUMENT_METADATA">,
  ): AssistantAnswer {
    return {
      answer,
      answerable,
      reasonCode,
      citations,
      provider: "google",
      model: this.provider.model,
      mode: "documents",
      ragEnabled: true,
      promptVersion,
    };
  }

  private normalizeRetrievalError(error: unknown): unknown {
    if (error instanceof AssistantError) return error;
    if (error instanceof RetrievalError) {
      if (
        error.kind === "document_not_found" ||
        error.kind === "document_scope_mismatch" ||
        error.kind === "invalid_input"
      )
        return new BadRequestException({
          code:
            error.kind === "document_scope_mismatch"
              ? "DOCUMENT_SCOPE_MISMATCH"
              : "DOCUMENT_NOT_FOUND",
          message:
            "The selected document is invalid or outside the current course.",
        });
      if (
        error.kind === "document_not_ready" ||
        error.kind === "document_has_no_useful_text" ||
        error.kind === "document_too_large"
      )
        return new ConflictException({
          code:
            error.kind === "document_has_no_useful_text"
              ? "NO_USABLE_CONTENT"
              : error.kind === "document_too_large"
                ? "DOCUMENT_TOO_LARGE"
                : "DOCUMENT_NOT_INDEXED",
          message: "The selected document is not ready for this operation.",
        });
      return new AssistantError("upstream");
    }
    if (error instanceof EmbeddingError) {
      if (error.kind === "invalid_input" || error.kind === "invalid_response")
        return new AssistantError("upstream");
      return new AssistantError(error.kind);
    }
    return error;
  }

  private logCompleted(
    mode: "general" | "documents",
    operation: "question" | "summarize" | "course_info",
    reasonCode: AssistantReasonCode,
    startedAt: number,
    fields: Record<string, unknown>,
  ) {
    log("info", "assistant.chat.completed", {
      mode,
      operation,
      reasonCode,
      ...fields,
      durationMs: Date.now() - startedAt,
    });
  }

  private failureReasonCode(error: unknown) {
    if (error instanceof AssistantError)
      return {
        not_configured: "AI_NOT_CONFIGURED",
        timeout: "AI_TIMEOUT",
        quota: "AI_QUOTA",
        authentication: "AI_AUTHENTICATION",
        unavailable: "AI_UNAVAILABLE",
        upstream: "AI_UPSTREAM",
      }[error.kind];
    if (error && typeof error === "object") {
      const response = (
        error as { getResponse?: () => unknown }
      ).getResponse?.();
      if (response && typeof response === "object")
        return (response as { code?: unknown }).code ?? "REQUEST_REJECTED";
    }
    return "INTERNAL_ERROR";
  }

  private isPartialCoverage(coverage: RagContext["coverage"]) {
    return Boolean(
      coverage &&
      (coverage.needsOcr ||
        (coverage.lowTextPageCount ?? 0) > 0 ||
        coverage.totalPageCount === null),
    );
  }
}
