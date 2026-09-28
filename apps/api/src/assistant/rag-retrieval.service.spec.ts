import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingError } from "./gemini-embedding.service.js";
import {
  RagRetrievalService,
  RetrievalError,
} from "./rag-retrieval.service.js";

const queryVector = () => [1, ...Array.from({ length: 767 }, () => 0)];
const firstRow = {
  chunk_id: "11111111-1111-4111-8111-111111111111",
  document_id: "22222222-2222-4222-8222-222222222222",
  document_name: "requirements.pdf",
  course_id: "33333333-3333-4333-8333-333333333333",
  chunk_index: 4,
  source_page: 7,
  content: "The final report must include evaluation evidence.",
  score: 0.91,
};

function fixture(rows: unknown[] = [firstRow]) {
  const database = {
    query: vi.fn().mockResolvedValue({ rows }),
  };
  const embeddings = {
    model: "gemini-embedding-001",
    dimensions: 768,
    embedQuery: vi.fn().mockResolvedValue(queryVector()),
  };
  return {
    database,
    embeddings,
    service: new RagRetrievalService(database as never, embeddings as never),
  };
}

describe("RagRetrievalService", () => {
  beforeEach(() => {
    vi.stubEnv("RAG_TOP_K", "6");
    vi.stubEnv("RAG_CANDIDATE_LIMIT", "10");
    vi.stubEnv("RAG_MIN_SCORE", "0.55");
    vi.stubEnv("RAG_PROMPT_VERSION", "rag-v1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("embeds the question and retrieves only eligible chunks with parameterized pgvector SQL", async () => {
    const { service, embeddings, database } = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await service.retrieve("  What is required?  ", {
      courseId: firstRow.course_id,
    });

    expect(embeddings.embedQuery).toHaveBeenCalledWith("What is required?");
    const [sql, values] = database.query.mock.calls[0];
    expect(sql).toContain("dc.embedding <=> $1::vector(768)");
    expect(sql).toContain("d.storage_status = 'stored'");
    expect(sql).toContain("d.processing_status = 'ready'");
    expect(sql).toContain("dc.embedding_model = $2");
    expect(sql).toContain("score >= $7");
    expect(sql).not.toContain("What is required?");
    expect(sql).not.toContain(values[0]);
    expect(values).toEqual([
      expect.stringMatching(/^\[1,0,/),
      "gemini-embedding-001",
      768,
      firstRow.course_id,
      null,
      10,
      0.55,
    ]);
    expect(result.evidence[0]).toMatchObject({
      sourceId: "S1",
      documentName: "requirements.pdf",
      sourcePage: 7,
      score: 0.91,
    });
    expect(result.citations[0]).not.toHaveProperty("content");
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logs).not.toContain("What is required?");
    expect(logs).not.toContain(firstRow.content);
    expect(logs).not.toContain(values[0]);
  });

  it("returns an explicit empty retrieval result without inventing sources", async () => {
    const { service } = fixture([]);
    await expect(service.retrieve("Unknown topic")).resolves.toEqual({
      promptVersion: "rag-v1",
      context: null,
      evidence: [],
      citations: [],
    });
  });

  it("filters low-information legacy chunks and fills results from bounded candidates", async () => {
    const rows = [
      {
        ...firstRow,
        chunk_id: "11111111-1111-4111-8111-111111111112",
        content: "61",
        source_page: 60,
        score: 0.95,
      },
      {
        ...firstRow,
        chunk_id: "11111111-1111-4111-8111-111111111113",
        content: "P2P\n34",
        source_page: 33,
        score: 0.94,
      },
      {
        ...firstRow,
        chunk_id: "11111111-1111-4111-8111-111111111114",
        content: "Top Sites\n55",
        source_page: 54,
        score: 0.93,
      },
      firstRow,
    ];
    const { service } = fixture(rows);

    const result = await service.retrieve("What is required?");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].content).toBe(firstRow.content);
  });

  it("searches beyond the first ten legacy fragments for usable evidence", async () => {
    const fragments = Array.from({ length: 10 }, (_, index) => ({
      ...firstRow,
      chunk_id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      content: "61",
      source_page: 60,
      score: 0.95 - index * 0.01,
    }));
    const useful = { ...firstRow, score: 0.8 };
    const { service, database } = fixture([]);
    database.query.mockImplementation(async (_sql, values) => ({
      rows: [...fragments, useful].slice(0, Number(values[5])),
    }));

    const result = await service.retrieve("What does the PDF explain?");

    expect(result.evidence.map((item) => item.chunkId)).toEqual([
      useful.chunk_id,
    ]);
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  it("stops after a bounded scan when every legacy fragment is unusable", async () => {
    const fragments = Array.from({ length: 120 }, (_, index) => ({
      ...firstRow,
      chunk_id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      content: "61",
      source_page: 60,
      score: 0.95 - index * 0.001,
    }));
    const { service, database } = fixture([]);
    database.query.mockImplementation(async (_sql, values) => ({
      rows: fragments.slice(0, Number(values[5])),
    }));

    const result = await service.retrieve("What does the PDF explain?");

    expect(result.evidence).toEqual([]);
    expect(database.query.mock.calls.map(([, values]) => values[5])).toEqual([
      10, 20, 40, 80, 100,
    ]);
  });

  it.each([
    ["bad chunk id", { chunk_id: "not-a-uuid" }],
    ["blank content", { content: " " }],
    ["oversized content", { content: "x".repeat(1_801) }],
    ["invalid page", { source_page: 0 }],
    ["invalid score type", { score: "0.9" }],
    ["score outside cosine range", { score: 2 }],
    ["score below configured threshold", { score: 0.2 }],
  ])("rejects a malformed database row: %s", async (_name, override) => {
    const { service } = fixture([{ ...firstRow, ...override }]);
    await expect(service.retrieve("Question")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("rejects duplicate chunks so citation IDs remain one-to-one", async () => {
    const { service } = fixture([firstRow, { ...firstRow }]);
    await expect(service.retrieve("Question")).rejects.toBeInstanceOf(
      RetrievalError,
    );
  });

  it.each(["", "   ", "x".repeat(4_001)])(
    "rejects an invalid question before embedding",
    async (question) => {
      const { service, embeddings, database } = fixture();
      await expect(service.retrieve(question)).rejects.toMatchObject({
        kind: "invalid_input",
      });
      expect(embeddings.embedQuery).not.toHaveBeenCalled();
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid course scope before embedding", async () => {
    const { service, embeddings } = fixture();
    await expect(
      service.retrieve("Question", { courseId: "all-courses' OR TRUE" }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
  });

  it("checks an exact document scope before embedding and applies both boundaries", async () => {
    const documentId = firstRow.document_id;
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: documentId,
              name: firstRow.document_name,
              course_id: firstRow.course_id,
              storage_status: "stored",
              processing_status: "ready",
              total_page_count: 10,
              useful_text_page_count: 9,
              low_text_page_count: 1,
              needs_ocr: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [firstRow] }),
    };
    const embeddings = {
      model: "gemini-embedding-001",
      dimensions: 768,
      embedQuery: vi.fn().mockResolvedValue(queryVector()),
    };
    const service = new RagRetrievalService(
      database as never,
      embeddings as never,
    );
    await service.retrieve("Question", {
      courseId: firstRow.course_id,
      documentId,
    });
    expect(database.query.mock.calls[1][0]).toContain("d.id = $5::uuid");
    expect(database.query.mock.calls[1][1][4]).toBe(documentId);
  });

  it("reads a selected document's course metadata without embedding or chunk text", async () => {
    const { service, database, embeddings } = fixture([]);
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: firstRow.document_id,
          name: firstRow.document_name,
          course_id: firstRow.course_id,
          course_slug: "cs-201",
          course_name: "Công nghệ phần mềm",
          course_code: "CS 201",
          storage_status: "stored",
          processing_status: "ready",
        },
      ],
    });

    await expect(
      (
        service as unknown as {
          documentMetadata: (id: string) => Promise<unknown>;
        }
      ).documentMetadata(firstRow.document_id),
    ).resolves.toMatchObject({
      documentId: firstRow.document_id,
      courseName: "Công nghệ phần mềm",
      courseCode: "CS 201",
    });
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
    expect(database.query.mock.calls[0][0]).not.toContain("document_chunks");
  });

  it("rejects a document outside the selected course before embedding", async () => {
    const { service, database, embeddings } = fixture();
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: firstRow.document_id,
          name: firstRow.document_name,
          course_id: "44444444-4444-4444-8444-444444444444",
          storage_status: "stored",
          processing_status: "ready",
          total_page_count: null,
          useful_text_page_count: null,
          low_text_page_count: null,
          needs_ocr: null,
        },
      ],
    });
    await expect(
      service.retrieve("Question", {
        courseId: firstRow.course_id,
        documentId: firstRow.document_id,
      }),
    ).rejects.toMatchObject({ kind: "document_scope_mismatch" });
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
  });

  it("propagates a normalized embedding timeout without querying PostgreSQL", async () => {
    const { service, embeddings, database } = fixture();
    embeddings.embedQuery.mockRejectedValue(new EmbeddingError("timeout"));
    await expect(service.retrieve("Question")).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it("rejects a malformed query vector without sending it to PostgreSQL", async () => {
    const { service, embeddings, database } = fixture();
    embeddings.embedQuery.mockResolvedValue([Number.NaN]);
    await expect(service.retrieve("Question")).rejects.toMatchObject({
      kind: "invalid_response",
    });
    expect(database.query).not.toHaveBeenCalled();
  });
});
