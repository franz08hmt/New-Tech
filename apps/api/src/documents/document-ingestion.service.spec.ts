import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbeddingError } from "../assistant/gemini-embedding.service.js";
import { DocumentIngestionService } from "./document-ingestion.service.js";
import { DocumentOcrError } from "./document-ocr.service.js";

const indexedAt = "2026-09-25T12:00:00.000Z";
const vector = () => [1, ...Array.from({ length: 767 }, () => 0)];

function fixture() {
  const document: {
    id: string;
    name: string;
    storage_key: string;
    storage_status: string;
    processing_status: string;
    indexed_at: string | null;
    processing_error_code: string | null;
  } = {
    id: randomUUID(),
    name: "study.pdf",
    storage_key: "documents/study.pdf",
    storage_status: "stored",
    processing_status: "pending",
    indexed_at: null,
    processing_error_code: null,
  };
  let chunks: Array<Record<string, unknown>> = [];
  let failInsert = false;
  const insertCalls: { sql: string; values: unknown[] }[] = [];

  const database = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (
        sql.includes("UPDATE documents") &&
        sql.includes("processing_status = 'failed'")
      ) {
        if (document.processing_status === "processing") {
          document.processing_status = "failed";
          document.indexed_at = null;
          document.processing_error_code = String(values[1]);
        }
        return { rows: [] };
      }
      if (
        sql.includes("UPDATE documents") &&
        sql.includes("processing_status = 'processing'")
      ) {
        if (
          document.storage_status === "stored" &&
          ["pending", "failed", "ready"].includes(document.processing_status)
        ) {
          document.processing_status = "processing";
          document.indexed_at = null;
          document.processing_error_code = null;
          return { rows: [{ ...document }] };
        }
        return { rows: [] };
      }
      if (sql.includes("FROM documents WHERE id = $1"))
        return { rows: values[0] === document.id ? [{ ...document }] : [] };
      throw new Error("Unhandled fixture query");
    }),
    transaction: vi.fn(async (work: (tx: { query: Function }) => unknown) => {
      const beforeChunks = chunks.map((row) => ({ ...row }));
      const beforeDocument = { ...document };
      const tx = {
        query: vi.fn(async (sql: string, values: unknown[] = []) => {
          if (sql.includes("DELETE FROM document_chunks")) {
            chunks = [];
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO document_chunks")) {
            if (failInsert) throw new Error("fixture insert failure");
            insertCalls.push({ sql, values });
            for (let start = 0; start < values.length; start += 7) {
              chunks.push({
                document_id: values[start],
                chunk_index: values[start + 1],
                content: values[start + 2],
                source_page: values[start + 3],
                embedding: values[start + 4],
                embedding_model: values[start + 5],
                embedding_dimensions: values[start + 6],
              });
            }
            return { rows: [] };
          }
          if (
            sql.includes("UPDATE documents") &&
            sql.includes("processing_status = 'ready'")
          ) {
            if (
              document.storage_status !== "stored" ||
              document.processing_status !== "processing"
            )
              return { rows: [] };
            document.processing_status = "ready";
            document.indexed_at = indexedAt;
            document.processing_error_code = null;
            return { rows: [{ indexed_at: indexedAt }] };
          }
          throw new Error("Unhandled fixture transaction query");
        }),
      };
      try {
        return await work(tx);
      } catch (error) {
        chunks = beforeChunks;
        Object.assign(document, beforeDocument);
        throw error;
      }
    }),
  };
  const storage = {
    downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-fixture")),
  };
  const extractor = {
    extract: vi.fn().mockResolvedValue([
      { page: 1, text: "First source paragraph." },
      { page: 2, text: "Second source paragraph." },
    ]),
  };
  const ocr = {
    recover: vi.fn(async (_buffer: Buffer, pages: unknown[]) => ({
      pages,
      attemptedPageNumbers: [] as number[],
    })),
  };
  const embeddings = {
    model: "gemini-embedding-001",
    dimensions: 768,
    embedDocuments: vi.fn().mockResolvedValue([vector(), vector()]),
  };
  const service = new DocumentIngestionService(
    database as never,
    storage as never,
    extractor as never,
    ocr as never,
    embeddings as never,
  );
  return {
    service,
    database,
    storage,
    extractor,
    ocr,
    embeddings,
    document,
    insertCalls,
    get chunks() {
      return chunks;
    },
    set chunks(value) {
      chunks = value;
    },
    set failInsert(value: boolean) {
      failInsert = value;
    },
  };
}

describe("DocumentIngestionService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads, extracts, embeds and atomically replaces document chunks", async () => {
    const item = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(item.service.process(item.document.id)).resolves.toEqual({
      document_id: item.document.id,
      processing_status: "ready",
      chunk_count: 2,
      indexed_at: indexedAt,
      index_quality: {
        total_page_count: 2,
        useful_text_page_count: 2,
        low_text_page_count: 0,
        indexed_chunk_count: 2,
        skipped_page_numbers: [],
        needs_ocr: false,
        ocr_page_count: 0,
        ocr_page_numbers: [],
      },
    });
    expect(item.storage.downloadBuffer).toHaveBeenCalledWith(
      item.document.storage_key,
    );
    expect(item.embeddings.embedDocuments).toHaveBeenCalledWith("study.pdf", [
      "First source paragraph.",
      "Second source paragraph.",
    ]);
    expect(item.chunks).toHaveLength(2);
    expect(item.chunks[1]).toMatchObject({
      chunk_index: 1,
      source_page: 2,
      embedding_model: "gemini-embedding-001",
      embedding_dimensions: 768,
    });
    expect(item.insertCalls[0].sql).toContain("$5::vector");
    expect(item.insertCalls[0].sql).not.toContain("First source paragraph");
    expect(item.insertCalls[0].values[4]).toMatch(/^\[1,0,/);
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logs).not.toContain("First source paragraph");
    expect(logs).not.toContain("[1,0,");
  });

  it("rejects a concurrent processing request before Storage or Gemini", async () => {
    const item = fixture();
    item.document.processing_status = "processing";
    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 409,
      response: { code: "DOCUMENT_PROCESSING" },
    });
    expect(item.storage.downloadBuffer).not.toHaveBeenCalled();
    expect(item.embeddings.embedDocuments).not.toHaveBeenCalled();
  });

  it("embeds OCR-recovered pages and reports their exact page numbers", async () => {
    const item = fixture();
    item.extractor.extract.mockResolvedValue([
      { page: 1, text: "First source paragraph." },
      { page: 2, text: "" },
    ]);
    item.ocr.recover.mockResolvedValue({
      pages: [
        { page: 1, text: "First source paragraph." },
        {
          page: 2,
          text: "Recovered OCR paragraph with useful information.",
          source: "ocr",
        },
      ],
      attemptedPageNumbers: [2],
    });

    await expect(item.service.process(item.document.id)).resolves.toMatchObject(
      {
        index_quality: {
          useful_text_page_count: 2,
          low_text_page_count: 0,
          needs_ocr: false,
          ocr_page_count: 1,
          ocr_page_numbers: [2],
        },
      },
    );
    expect(item.embeddings.embedDocuments).toHaveBeenCalledWith("study.pdf", [
      "First source paragraph.",
      "Recovered OCR paragraph with useful information.",
    ]);
  });

  it("keeps the old index and exposes a safe retryable OCR failure", async () => {
    const item = fixture();
    item.chunks = [{ document_id: item.document.id, content: "old evidence" }];
    item.ocr.recover.mockRejectedValue(new DocumentOcrError("OCR_TIMEOUT"));
    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 504,
      response: { code: "OCR_TIMEOUT" },
    });
    expect(item.chunks).toEqual([
      { document_id: item.document.id, content: "old evidence" },
    ]);
    expect(item.embeddings.embedDocuments).not.toHaveBeenCalled();
  });

  it("marks an empty PDF failed without calling embeddings", async () => {
    const item = fixture();
    item.extractor.extract.mockResolvedValue([
      { page: 1, text: "" },
      { page: 2, text: "" },
    ]);
    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 422,
      response: { code: "NO_USEFUL_TEXT" },
    });
    expect(item.document.processing_status).toBe("failed");
    expect(item.document.processing_error_code).toBe("NO_USEFUL_TEXT");
    expect(item.embeddings.embedDocuments).not.toHaveBeenCalled();
  });

  it("fails clearly when extracted text contains only page residue", async () => {
    const item = fixture();
    item.chunks = [{ document_id: item.document.id, content: "old evidence" }];
    item.extractor.extract.mockResolvedValue([
      { page: 1, text: "1" },
      { page: 2, text: "Top Sites\n3" },
    ]);

    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 422,
      response: { code: "NO_USEFUL_TEXT" },
    });
    expect(item.embeddings.embedDocuments).not.toHaveBeenCalled();
    expect(item.chunks).toEqual([
      { document_id: item.document.id, content: "old evidence" },
    ]);
  });

  it("marks timeout failed and can retry idempotently without duplicate chunks", async () => {
    const item = fixture();
    item.embeddings.embedDocuments
      .mockRejectedValueOnce(new EmbeddingError("timeout"))
      .mockResolvedValueOnce([vector(), vector()]);
    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 504,
      response: { code: "EMBEDDING_TIMEOUT" },
    });
    expect(item.document.processing_status).toBe("failed");
    await expect(item.service.process(item.document.id)).resolves.toMatchObject(
      {
        processing_status: "ready",
        chunk_count: 2,
      },
    );
    expect(item.chunks).toHaveLength(2);
    expect(item.embeddings.embedDocuments).toHaveBeenCalledTimes(2);
  });

  it("rolls back deleted old chunks when a new batch insert fails", async () => {
    const item = fixture();
    item.chunks = [{ document_id: item.document.id, content: "old evidence" }];
    item.failInsert = true;
    await expect(item.service.process(item.document.id)).rejects.toThrow(
      "fixture insert failure",
    );
    expect(item.chunks).toEqual([
      { document_id: item.document.id, content: "old evidence" },
    ]);
    expect(item.document.processing_status).toBe("failed");
    expect(item.document.processing_error_code).toBe("PROCESSING_FAILED");
  });

  it("rolls back and rejects malformed embedding dimensions", async () => {
    const item = fixture();
    item.chunks = [{ document_id: item.document.id, content: "old evidence" }];
    item.embeddings.embedDocuments.mockResolvedValue([
      [1, 2],
      [1, 2],
    ]);
    await expect(item.service.process(item.document.id)).rejects.toMatchObject({
      status: 502,
      response: { code: "EMBEDDING_INVALID_RESPONSE" },
    });
    expect(item.chunks).toEqual([
      { document_id: item.document.id, content: "old evidence" },
    ]);
    expect(item.document.processing_status).toBe("failed");
  });
});
