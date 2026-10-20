import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { PilotPrincipal } from "@examate/contracts";
import { DocumentAccessService } from "./document-access.service.js";
import { requireRecordWrite } from "../auth/principal.js";
import {
  EmbeddingError,
  GeminiEmbeddingService,
} from "../assistant/gemini-embedding.service.js";
import { log } from "../common/log.js";
import { DatabaseService } from "../database/database.service.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import {
  DocumentChunkingError,
  chunkDocumentPages,
  prepareDocumentPages,
} from "./document-chunker.js";
import {
  PdfExtractionError,
  PdfTextExtractorService,
} from "./pdf-text-extractor.service.js";
import {
  DocumentOcrError,
  DocumentOcrService,
} from "./document-ocr.service.js";
import { StorageService } from "./storage.service.js";
import { AiUsageService } from "../assistant/ai-usage.service.js";

interface IngestionDocument extends QueryResultRow {
  id: string;
  name: string;
  storage_key: string;
  storage_status: "stored" | "deleting" | "legacy";
  processing_status: "pending" | "processing" | "ready" | "failed";
}

interface IndexedAtRow extends QueryResultRow {
  indexed_at: string;
}

class ProcessingStateError extends Error {}

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly extractor: PdfTextExtractorService,
    private readonly ocr: DocumentOcrService,
    private readonly embeddings: GeminiEmbeddingService,
    private readonly access: DocumentAccessService,
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  async process(documentId: string, principal?: PilotPrincipal) {
    const startedAt = Date.now();
    const { workspaceId } = requireRecordWrite(principal);
    const document = await this.claim(documentId, workspaceId, principal);
    let persistBodyCompleted = false;
    try {
      await this.authorize(principal);
      const buffer = await this.storage.downloadBuffer(document.storage_key);
      await this.authorize(principal);
      const nativePages = await this.extractor.extract(buffer);
      await this.authorize(principal);
      const ocrProviderCalls = this.ocr.plannedProviderCalls(nativePages);
      await this.usage?.preflightProviderCalls(ocrProviderCalls);
      const { pages } = await this.ocr.recover(buffer, nativePages);
      const prepared = prepareDocumentPages(pages);
      const { chunks, quality } = prepared;
      if (chunks.length === 0)
        throw new DocumentChunkingError("NO_USEFUL_TEXT");
      await this.authorize(principal);
      await this.usage?.preflightProviderCalls(
        ocrProviderCalls + this.embeddings.documentBatchCount(chunks.length),
      );
      const vectors = await this.embeddings.embedDocuments(
        document.name,
        chunks.map(({ content }) => content),
      );
      if (vectors.length !== chunks.length)
        throw new EmbeddingError("invalid_response");

      const indexedAt = await this.database.workspaceTransaction(
        principal,
        async (tx) => {
          await this.access.authorize(principal, "write", tx);
          // Lock the authorized parent while replacing derived chunks. A delete
          // or state change during extraction cannot commit work to another job.
          const locked = await tx.query(
            "SELECT id FROM documents WHERE id = $1 AND workspace_id = $2 AND storage_status = 'stored' AND processing_status = 'processing' FOR UPDATE",
            [document.id, workspaceId],
          );
          if (!locked.rows.length) throw new ProcessingStateError();
          await tx.query(
            "DELETE FROM document_chunks dc USING documents d WHERE dc.document_id = d.id AND d.id = $1 AND d.workspace_id = $2",
            [document.id, workspaceId],
          );
          for (let start = 0; start < chunks.length; start += 50) {
            await this.insertBatch(
              tx,
              document.id,
              chunks.slice(start, start + 50),
              vectors.slice(start, start + 50),
            );
          }
          const ready = await tx.query<IndexedAtRow>(
            `UPDATE documents
           SET processing_status = 'ready',
               indexed_at = NOW(),
               processing_error_code = NULL,
               total_page_count = $2,
               useful_text_page_count = $3,
               low_text_page_count = $4,
               indexed_chunk_count = $5,
               skipped_page_numbers = $6::smallint[],
               needs_ocr = $7,
               ocr_page_count = $8,
               ocr_page_numbers = $9::smallint[],
               updated_at = NOW()
           WHERE id = $1
             AND workspace_id = $10
             AND storage_status = 'stored'
             AND processing_status = 'processing'
           RETURNING indexed_at::text AS indexed_at`,
            [
              document.id,
              quality.totalPageCount,
              quality.usefulTextPageCount,
              quality.lowTextPageCount,
              chunks.length,
              quality.skippedPageNumbers,
              quality.needsOcr,
              quality.ocrPageNumbers.length,
              quality.ocrPageNumbers,
              workspaceId,
            ],
          );
          if (!ready.rows[0]) throw new ProcessingStateError();
          // No later failed-state write may run if COMMIT loses its ACK: ready
          // may be committed, and another request may already have claimed it.
          persistBodyCompleted = true;
          return ready.rows[0].indexed_at;
        },
      );

      log("info", "document.processing_completed", {
        documentId,
        chunkCount: chunks.length,
        totalPageCount: quality.totalPageCount,
        usefulTextPageCount: quality.usefulTextPageCount,
        lowTextPageCount: quality.lowTextPageCount,
        needsOcr: quality.needsOcr,
        ocrPageCount: quality.ocrPageNumbers.length,
        model: this.embeddings.model,
        dimensions: this.embeddings.dimensions,
        durationMs: Date.now() - startedAt,
      });
      return {
        document_id: document.id,
        processing_status: "ready" as const,
        chunk_count: chunks.length,
        indexed_at: indexedAt,
        index_quality: {
          total_page_count: quality.totalPageCount,
          useful_text_page_count: quality.usefulTextPageCount,
          low_text_page_count: quality.lowTextPageCount,
          indexed_chunk_count: chunks.length,
          skipped_page_numbers: quality.skippedPageNumbers,
          needs_ocr: quality.needsOcr,
          ocr_page_count: quality.ocrPageNumbers.length,
          ocr_page_numbers: quality.ocrPageNumbers,
        },
      };
    } catch (error: unknown) {
      const code = this.processingCode(error);
      if (persistBodyCompleted || error instanceof ProcessingStateError) {
        log("error", "document.processing_reconciliation_required", {
          documentId,
          errorCode: persistBodyCompleted ? "PERSIST_OUTCOME_UNKNOWN" : code,
        });
        throw this.publicError(error, code);
      }
      try {
        await this.database.workspaceTransaction(principal, async (tx) => {
          await this.access.authorize(principal, "write", tx);
          const failed = await tx.query(
            `UPDATE documents
           SET processing_status = 'failed',
               indexed_at = NULL,
               processing_error_code = $2,
               updated_at = NOW()
           WHERE id = $1
             AND workspace_id = $3
             AND storage_status = 'stored'
             AND processing_status = 'processing'
           RETURNING id`,
            [document.id, code, workspaceId],
          );
          if (!failed.rows[0]) throw new ProcessingStateError();
        });
      } catch (stateError) {
        log("error", "document.processing_reconciliation_required", {
          documentId,
          errorCode: code,
        });
        throw stateError;
      }
      log("error", "document.processing_failed", {
        documentId,
        errorCode: code,
        durationMs: Date.now() - startedAt,
      });
      throw this.publicError(error, code);
    }
  }

  private authorize(principal?: PilotPrincipal) {
    return this.database.workspaceTransaction(principal, (tx) =>
      this.access.authorize(principal, "write", tx),
    );
  }

  private async claim(
    documentId: string,
    workspaceId: string,
    principal?: PilotPrincipal,
  ) {
    let claimBodyCompleted = false;
    try {
      return await this.database.workspaceTransaction(principal, async (tx) => {
        await this.access.authorize(principal, "write", tx);
        const claimed = await tx.query<IngestionDocument>(
          `UPDATE documents
       SET processing_status = 'processing',
           indexed_at = NULL,
           processing_error_code = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND workspace_id = $2
         AND storage_status = 'stored'
         AND processing_status IN ('pending', 'failed', 'ready')
       RETURNING id, name, storage_key, storage_status, processing_status`,
          [documentId, workspaceId],
        );
        if (claimed.rows[0]) {
          claimBodyCompleted = true;
          return claimed.rows[0];
        }

        const current = await tx.query<IngestionDocument>(
          `SELECT id, name, storage_key, storage_status, processing_status
       FROM documents WHERE id = $1 AND workspace_id = $2`,
          [documentId, workspaceId],
        );
        if (!current.rows[0]) throw new NotFoundException("Document not found");
        if (current.rows[0].processing_status === "processing")
          throw new ConflictException({
            code: "DOCUMENT_PROCESSING",
            message: "Document processing is already in progress.",
          });
        throw new ConflictException({
          code: "DOCUMENT_NOT_PROCESSABLE",
          message: "Document is not available for processing.",
        });
      });
    } catch (error) {
      if (claimBodyCompleted)
        log("error", "document.processing_reconciliation_required", {
          documentId,
          errorCode: "CLAIM_OUTCOME_UNKNOWN",
        });
      throw error;
    }
  }

  private async insertBatch(
    tx: DatabaseTransaction,
    documentId: string,
    chunks: ReturnType<typeof chunkDocumentPages>,
    vectors: number[][],
  ) {
    const values: unknown[] = [];
    const rows = chunks.map((chunk, index) => {
      const vector = vectors[index];
      if (!vector || vector.length !== this.embeddings.dimensions)
        throw new EmbeddingError("invalid_response");
      const offset = index * 7;
      values.push(
        documentId,
        chunk.chunkIndex,
        chunk.content,
        chunk.sourcePage,
        `[${vector.join(",")}]`,
        this.embeddings.model,
        this.embeddings.dimensions,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::vector, $${offset + 6}, $${offset + 7})`;
    });
    await tx.query(
      `INSERT INTO document_chunks
        (document_id, chunk_index, content, source_page, embedding,
         embedding_model, embedding_dimensions)
       VALUES ${rows.join(", ")}`,
      values,
    );
  }

  private processingCode(error: unknown) {
    if (error instanceof PdfExtractionError) return error.code;
    if (error instanceof DocumentOcrError) return error.code;
    if (error instanceof DocumentChunkingError) return error.code;
    if (error instanceof EmbeddingError)
      return `EMBEDDING_${error.kind.toUpperCase()}`;
    if (error instanceof ProcessingStateError)
      return "PROCESSING_STATE_CHANGED";
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === "object") {
        const code = (response as { code?: unknown }).code;
        if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(code))
          return code;
      }
    }
    return "PROCESSING_FAILED";
  }

  private publicError(error: unknown, code: string): unknown {
    if (error instanceof HttpException) return error;
    if (error instanceof PdfExtractionError)
      return new UnprocessableEntityException({
        code,
        message: "The PDF could not be converted into searchable text.",
      });
    if (error instanceof DocumentOcrError) {
      if (error.code === "OCR_TIMEOUT")
        return new GatewayTimeoutException({
          code,
          message: "Document OCR timed out. Please retry.",
        });
      if (["OCR_INVALID_RESPONSE", "OCR_RENDER_FAILED"].includes(error.code))
        return new BadGatewayException({
          code,
          message: "The document OCR step returned an invalid result.",
        });
      return new ServiceUnavailableException({
        code,
        message: "Document OCR is unavailable. Check configuration or retry.",
      });
    }
    if (error instanceof DocumentChunkingError)
      return new UnprocessableEntityException({
        code,
        message:
          error.code === "NO_USEFUL_TEXT"
            ? "The PDF contains no text with enough information to index. OCR may be required."
            : "The document could not be divided into searchable sections.",
      });
    if (error instanceof EmbeddingError) {
      if (error.kind === "timeout")
        return new GatewayTimeoutException({
          code,
          message: "Document embedding timed out. Please retry.",
        });
      if (["upstream", "invalid_response"].includes(error.kind))
        return new BadGatewayException({
          code,
          message: "The embedding provider returned an invalid response.",
        });
      return new ServiceUnavailableException({
        code,
        message: "Document embedding is temporarily unavailable.",
      });
    }
    return error;
  }
}
