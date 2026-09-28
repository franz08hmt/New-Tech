import { Injectable } from "@nestjs/common";
import type { AssistantMetadataSource } from "@examate/contracts";
import type { QueryResultRow } from "pg";
import { log } from "../common/log.js";
import { ragConfig } from "../config/config.js";
import { DatabaseService } from "../database/database.service.js";
import { MAX_DOCUMENT_CHUNKS } from "../documents/document-chunker.js";
import { isUsefulDocumentText } from "../documents/document-text-quality.js";
import { GeminiEmbeddingService } from "./gemini-embedding.service.js";
import { buildRagContext, type RetrievedChunk } from "./rag-context.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CANDIDATE_SCAN = 100;

interface RetrievalRow extends QueryResultRow {
  chunk_id: string;
  document_id: string;
  document_name: string;
  course_id: string | null;
  chunk_index: number;
  source_page: number | null;
  content: string;
  score: number;
}

export interface RetrievalScope {
  courseId?: string | null;
  documentId?: string | null;
}

export type RetrievalFailure =
  | "invalid_input"
  | "invalid_response"
  | "document_not_found"
  | "document_scope_mismatch"
  | "document_not_ready"
  | "document_has_no_useful_text"
  | "document_too_large";

interface DocumentScopeRow extends QueryResultRow {
  id: string;
  name: string;
  course_id: string | null;
  storage_status: string;
  processing_status: string;
  total_page_count: number | null;
  useful_text_page_count: number | null;
  low_text_page_count: number | null;
  needs_ocr: boolean | null;
  course_slug: string | null;
  course_name: string | null;
  course_code: string | null;
}

export interface DocumentSummaryMaterial {
  documentId: string;
  documentName: string;
  chunks: RetrievedChunk[];
  coverage: {
    totalPageCount: number | null;
    usefulTextPageCount: number | null;
    lowTextPageCount: number | null;
    needsOcr: boolean | null;
  };
}

export class RetrievalError extends Error {
  constructor(readonly kind: RetrievalFailure) {
    super("Document retrieval failed.");
  }
}

@Injectable()
export class RagRetrievalService {
  private readonly config = ragConfig();

  constructor(
    private readonly database: DatabaseService,
    private readonly embeddings: GeminiEmbeddingService,
  ) {}

  async retrieve(question: string, scope: RetrievalScope = {}) {
    const normalizedQuestion = question.trim();
    const courseId = scope.courseId ?? null;
    const documentId = scope.documentId ?? null;
    if (
      !normalizedQuestion ||
      normalizedQuestion.length > 4_000 ||
      (courseId !== null && !UUID_PATTERN.test(courseId)) ||
      (documentId !== null && !UUID_PATTERN.test(documentId))
    )
      throw new RetrievalError("invalid_input");

    const startedAt = Date.now();
    try {
      const scopedDocument = documentId
        ? await this.documentInScope(documentId, courseId)
        : null;
      const vector = await this.embeddings.embedQuery(normalizedQuestion);
      if (
        vector.length !== this.embeddings.dimensions ||
        vector.some((value) => !Number.isFinite(value))
      )
        throw new RetrievalError("invalid_response");

      let scanLimit = this.config.candidateLimit;
      let candidates: RetrievedChunk[] = [];
      let usefulCandidates: RetrievedChunk[] = [];
      while (true) {
        const result = await this.database.query<RetrievalRow>(
          `WITH nearest AS (
           SELECT dc.id::text AS chunk_id,
                  d.id::text AS document_id,
                  d.name AS document_name,
                  d.course_id::text AS course_id,
                  dc.chunk_index,
                  dc.source_page,
                  dc.content,
                  (1 - (dc.embedding <=> $1::vector(768)))::double precision AS score
           FROM document_chunks dc
           INNER JOIN documents d ON d.id = dc.document_id
           WHERE d.storage_status = 'stored'
             AND d.processing_status = 'ready'
             AND dc.embedding IS NOT NULL
             AND dc.embedding_model = $2
             AND dc.embedding_dimensions = $3
             AND char_length(dc.content) BETWEEN 1 AND 1800
             AND ($4::uuid IS NULL OR d.course_id = $4::uuid)
             AND ($5::uuid IS NULL OR d.id = $5::uuid)
           ORDER BY dc.embedding <=> $1::vector(768), dc.id
           LIMIT $6
         )
         SELECT chunk_id, document_id, document_name, course_id,
                chunk_index, source_page, content, score
         FROM nearest
         WHERE score >= $7
         ORDER BY score DESC, chunk_id`,
          [
            `[${vector.join(",")}]`,
            this.embeddings.model,
            this.embeddings.dimensions,
            courseId,
            documentId,
            scanLimit,
            this.config.minScore,
          ],
        );

        if (result.rows.length > scanLimit)
          throw new RetrievalError("invalid_response");
        candidates = result.rows.map((row) => this.validateRow(row));
        if (
          candidates.some((chunk) => chunk.score < this.config.minScore) ||
          new Set(candidates.map((chunk) => chunk.chunkId)).size !==
            candidates.length
        )
          throw new RetrievalError("invalid_response");
        usefulCandidates = candidates.filter((chunk) =>
          isUsefulDocumentText(chunk.content, chunk.sourcePage ?? undefined),
        );
        if (
          usefulCandidates.length >= this.config.topK ||
          result.rows.length < scanLimit ||
          scanLimit >= MAX_CANDIDATE_SCAN
        )
          break;
        scanLimit = Math.min(MAX_CANDIDATE_SCAN, scanLimit * 2);
      }
      const chunks = usefulCandidates.slice(0, this.config.topK);
      const ragContext: ReturnType<typeof buildRagContext> = {
        ...buildRagContext(chunks, this.config.promptVersion),
        ...(scopedDocument
          ? {
              coverage: {
                totalPageCount: scopedDocument.total_page_count,
                usefulTextPageCount: scopedDocument.useful_text_page_count,
                lowTextPageCount: scopedDocument.low_text_page_count,
                needsOcr: scopedDocument.needs_ocr,
              },
            }
          : {}),
      };
      log("info", "rag.retrieval.completed", {
        model: this.embeddings.model,
        candidateCount: candidates.length,
        scanLimit,
        rejectedLowInformationCount:
          candidates.length - usefulCandidates.length,
        evidenceCount: ragContext.evidence.length,
        scopedToCourse: courseId !== null,
        scopedToDocument: documentId !== null,
        promptVersion: this.config.promptVersion,
        ...(ragContext.coverage
          ? {
              totalPageCount: ragContext.coverage.totalPageCount,
              usefulTextPageCount: ragContext.coverage.usefulTextPageCount,
              lowTextPageCount: ragContext.coverage.lowTextPageCount,
              needsOcr: ragContext.coverage.needsOcr,
            }
          : {}),
        durationMs: Date.now() - startedAt,
      });
      return ragContext;
    } catch (error: unknown) {
      log("error", "rag.retrieval.failed", {
        model: this.embeddings.model,
        scopedToCourse: courseId !== null,
        scopedToDocument: documentId !== null,
        promptVersion: this.config.promptVersion,
        durationMs: Date.now() - startedAt,
        errorType:
          error instanceof RetrievalError ? error.kind : "dependency_failure",
      });
      throw error;
    }
  }

  async documentForSummary(
    documentId: string,
    scope: { courseId?: string | null } = {},
  ): Promise<DocumentSummaryMaterial> {
    const courseId = scope.courseId ?? null;
    if (
      !UUID_PATTERN.test(documentId) ||
      (courseId !== null && !UUID_PATTERN.test(courseId))
    )
      throw new RetrievalError("invalid_input");

    const document = await this.documentInScope(documentId, courseId);
    const result = await this.database.query<RetrievalRow>(
      `SELECT dc.id::text AS chunk_id,
              d.id::text AS document_id,
              d.name AS document_name,
              d.course_id::text AS course_id,
              dc.chunk_index,
              dc.source_page,
              dc.content,
              1::double precision AS score
       FROM document_chunks dc
       INNER JOIN documents d ON d.id = dc.document_id
       WHERE d.id = $1::uuid
         AND d.storage_status = 'stored'
         AND d.processing_status = 'ready'
         AND char_length(dc.content) BETWEEN 1 AND 1800
       ORDER BY dc.source_page NULLS LAST, dc.chunk_index, dc.id
       LIMIT $2`,
      [documentId, MAX_DOCUMENT_CHUNKS + 1],
    );
    if (result.rows.length > MAX_DOCUMENT_CHUNKS)
      throw new RetrievalError("document_too_large");
    const chunks = result.rows
      .map((row) => this.validateRow(row))
      .filter((chunk) =>
        isUsefulDocumentText(chunk.content, chunk.sourcePage ?? undefined),
      );
    if (!chunks.length) throw new RetrievalError("document_has_no_useful_text");
    return {
      documentId,
      documentName: document.name,
      chunks,
      coverage: {
        totalPageCount: document.total_page_count,
        usefulTextPageCount: document.useful_text_page_count,
        lowTextPageCount: document.low_text_page_count,
        needsOcr: document.needs_ocr,
      },
    };
  }

  async documentMetadata(
    documentId: string,
    scope: { courseId?: string | null } = {},
  ): Promise<AssistantMetadataSource> {
    const courseId = scope.courseId ?? null;
    if (
      !UUID_PATTERN.test(documentId) ||
      (courseId !== null && !UUID_PATTERN.test(courseId))
    )
      throw new RetrievalError("invalid_input");
    const document = await this.documentInScope(documentId, courseId);
    return {
      documentId: document.id,
      title: document.name,
      courseId: document.course_id,
      courseSlug: document.course_slug,
      courseName: document.course_name,
      courseCode: document.course_code,
    };
  }

  private async documentInScope(documentId: string, courseId: string | null) {
    const result = await this.database.query<DocumentScopeRow>(
      `SELECT d.id::text, d.name, d.course_id::text AS course_id,
              c.slug AS course_slug, c.name AS course_name,
              c.code AS course_code, d.storage_status, d.processing_status,
              d.total_page_count, d.useful_text_page_count,
              d.low_text_page_count, d.needs_ocr
       FROM documents d
       LEFT JOIN courses c ON c.id = d.course_id
       WHERE d.id = $1::uuid`,
      [documentId],
    );
    const document = result.rows[0];
    if (!document) throw new RetrievalError("document_not_found");
    if (courseId !== null && document.course_id !== courseId)
      throw new RetrievalError("document_scope_mismatch");
    if (
      document.storage_status !== "stored" ||
      document.processing_status !== "ready"
    )
      throw new RetrievalError("document_not_ready");
    return document;
  }

  private validateRow(row: RetrievalRow): RetrievedChunk {
    if (
      !UUID_PATTERN.test(row.chunk_id) ||
      !UUID_PATTERN.test(row.document_id) ||
      (row.course_id !== null && !UUID_PATTERN.test(row.course_id)) ||
      typeof row.document_name !== "string" ||
      !row.document_name.trim() ||
      row.document_name.length > 255 ||
      !Number.isInteger(row.chunk_index) ||
      row.chunk_index < 0 ||
      (row.source_page !== null &&
        (!Number.isInteger(row.source_page) || row.source_page < 1)) ||
      typeof row.content !== "string" ||
      !row.content.trim() ||
      row.content.length > 1_800 ||
      typeof row.score !== "number" ||
      !Number.isFinite(row.score) ||
      row.score < -1.000_001 ||
      row.score > 1.000_001
    )
      throw new RetrievalError("invalid_response");

    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.document_name,
      courseId: row.course_id,
      chunkIndex: row.chunk_index,
      sourcePage: row.source_page,
      content: row.content,
      score: Math.max(-1, Math.min(1, row.score)),
    };
  }
}
