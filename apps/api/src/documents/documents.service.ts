import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { StoredDocument } from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import { log } from "../common/log.js";
import { StorageService } from "./storage.service.js";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export interface PdfFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
interface DocumentRecord {
  id: string;
  name: string;
  media_type: string;
  size_bytes: number | null;
  storage_key: string;
  storage_status: "stored" | "deleting" | "legacy";
  course_id: string | null;
  course_slug: string | null;
  course_name: string | null;
  course_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Every read goes through this list, so the course columns are joined in one
 * place. LEFT JOIN, because a document that belongs to no subject must still
 * come back — and the link is nullable by design.
 */
const DOCUMENT_COLUMNS = `d.id,
  d.name,
  d.media_type,
  d.size_bytes,
  d.storage_key,
  d.storage_status,
  d.course_id,
  c.slug AS course_slug,
  c.name AS course_name,
  c.code AS course_code,
  d.created_at,
  d.updated_at`;

const DOCUMENT_FROM = `FROM documents d
  LEFT JOIN courses c ON c.id = d.course_id`;
// The annotated return type is load-bearing: without it the shape was merely
// inferred, so an extra field here — `storage_key`, say — would have reached
// the browser with nothing to catch it. Now the contract rejects it.
function publicDocument(document: DocumentRecord): StoredDocument {
  // Exclude internal keys and the legacy processing_status (no AI pipeline).
  return {
    id: document.id,
    name: document.name,
    media_type: document.media_type,
    size_bytes: document.size_bytes,
    storage_status: document.storage_status,
    course_id: document.course_id,
    course_slug: document.course_slug,
    course_name: document.course_name,
    course_code: document.course_code,
    created_at: document.created_at,
    updated_at: document.updated_at,
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const result = await this.database.query<DocumentRecord>(
      `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_FROM}
       ORDER BY d.created_at DESC, d.id DESC`,
    );
    return result.rows.map(publicDocument);
  }

  private async find(id: string) {
    const result = await this.database.query<DocumentRecord>(
      `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_FROM} WHERE d.id = $1`,
      [id],
    );
    return result.rows[0];
  }

  async upload(file?: PdfFile, courseId?: string) {
    if (!file)
      throw new BadRequestException(
        "One PDF file in the 'file' field is required",
      );
    if (file.size > MAX_FILE_SIZE)
      throw new PayloadTooLargeException("PDF must not exceed 10 MiB");
    if (
      !/\.pdf$/i.test(file.originalname) ||
      file.mimetype !== "application/pdf" ||
      file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
    )
      throw new UnsupportedMediaTypeException(
        "Only PDF files with a PDF signature are accepted",
      );
    const name = file.originalname
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/[\x00-\x1f\x7f]/g, "")
      .trim();
    if (name.length < 5 || name.length > 255)
      throw new BadRequestException(
        "PDF filename must contain 5..255 characters",
      );
    const id = randomUUID();
    const key = `documents/${id}.pdf`;
    try {
      await this.storage.upload(key, file.buffer);
    } catch (error) {
      // Timeout may occur AFTER Storage accepted the object; keep its key in logs.
      log("error", "document.upload_uncertain", {
        documentId: id,
        storageKey: key,
      });
      throw error;
    }
    try {
      const result = await this.database.query<DocumentRecord>(
        `WITH inserted AS (
           INSERT INTO documents
             (id, name, media_type, storage_key, size_bytes, storage_status, course_id)
           VALUES ($1, $2, 'application/pdf', $3, $4, 'stored', $5)
           RETURNING *
         )
         SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_FROM.replace("FROM documents d", "FROM inserted d")}`,
        [id, name, key, file.size, courseId ?? null],
      );
      log("info", "document.stored", { documentId: id, sizeBytes: file.size });
      return publicDocument(result.rows[0]);
    } catch (error) {
      // A DB timeout can mean an INSERT committed but its response was lost.
      // Confirm absence before compensating, to avoid deleting a committed file.
      let existing: DocumentRecord | undefined;
      try {
        existing = await this.find(id);
      } catch {
        log("error", "document.reconciliation_required", {
          documentId: id,
          storageKey: key,
        });
        throw error;
      }
      if (existing) return publicDocument(existing);
      try {
        await this.storage.remove(key);
      } catch {
        log("error", "document.cleanup_failed", {
          documentId: id,
          storageKey: key,
        });
      }
      throw error;
    }
  }

  async download(id: string) {
    const document = await this.find(id);
    if (!document) throw new NotFoundException("Document not found");
    if (document.storage_status !== "stored")
      throw new ConflictException("Document is not available for download");
    return this.storage.signedDownload(document.storage_key, document.name);
  }

  /** Re-file a document under another subject, or under none. */
  async setCourse(id: string, courseId: string | null) {
    const result = await this.database
      .query<DocumentRecord>(
        `WITH updated AS (
           UPDATE documents SET course_id = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING *
         )
         SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_FROM.replace("FROM documents d", "FROM updated d")}`,
        [id, courseId],
      )
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          (error as { code?: string }).code === "23503"
        ) {
          throw new BadRequestException({
            code: "COURSE_NOT_FOUND",
            message: "Môn học này không còn trong danh sách nữa.",
          });
        }
        throw error;
      });
    const document = result.rows[0];
    if (!document) throw new NotFoundException("Document not found");
    return publicDocument(document);
  }

  async remove(id: string) {
    const document = await this.find(id);
    if (!document) return; // Idempotent 204, also after a lost successful response.
    if (document.storage_status === "legacy")
      throw new ConflictException(
        "Legacy document requires manual storage reconciliation",
      );
    await this.database.query(
      "UPDATE documents SET storage_status = 'deleting', updated_at = NOW() WHERE id = $1",
      [id],
    );
    await this.storage.remove(document.storage_key);
    await this.database.query("DELETE FROM documents WHERE id = $1", [id]);
    log("info", "document.deleted", { documentId: id });
  }
}
