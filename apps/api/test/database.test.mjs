import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { loadEnvironment, databaseConfig } from "../dist/config/config.js";
import { migrate } from "../scripts/migrate.mjs";
import { fakeDependencies, httpApp, json, pdfForm } from "./helpers.mjs";
import { DatabaseService } from "../dist/database/database.service.js";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";

loadEnvironment();
const url = process.env.TEST_DATABASE_URL;
test(
  "real PostgreSQL: migrations twice, HTTP Tasks/Documents persist after API restart; Storage mocked",
  { skip: !url ? "TEST_DATABASE_URL is absent; no real DB evidence" : false },
  async () => {
    const parsed = new URL(url);
    assert.match(
      parsed.pathname,
      /_test$/,
      "Use a dedicated database whose name ends in _test",
    );
    if (process.env.DATABASE_URL) {
      const runtime = new URL(process.env.DATABASE_URL);
      assert.ok(
        parsed.hostname !== runtime.hostname ||
          parsed.port !== runtime.port ||
          parsed.pathname !== runtime.pathname,
        "Test target must differ from runtime database",
      );
    }
    await migrate(url);
    await migrate(url);
    const pool = new pg.Pool(databaseConfig(url));
    const oldUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    const fixture = fakeDependencies();
    let server, taskId, documentId;
    try {
      server = await httpApp(undefined, fixture.storage);
      const response = await server.request(
        "/tasks",
        json("POST", {
          title: `Persistence ${randomUUID()}`,
          dueDate: "2028-02-29",
        }),
      );
      assert.equal(response.status, 201);
      const task = await response.json();
      taskId = task.id;
      assert.equal(
        (
          await server.request(
            `/tasks/${taskId}/status`,
            json("PATCH", { status: "done" }),
          )
        ).status,
        200,
      );
      const uploaded = await server.request("/documents", pdfForm());
      assert.equal(uploaded.status, 201);
      documentId = (await uploaded.json()).id;
      await server.app.close();
      server = await httpApp(undefined, fixture.storage);
      const tasks = await (await server.request("/tasks")).json();
      assert.equal(tasks.find((row) => row.id === taskId).status, "done");
      assert.equal(
        tasks.find((row) => row.id === taskId).due_date,
        "2028-02-29",
      );
      const docs = await (await server.request("/documents")).json();
      assert.equal(
        docs.find((row) => row.id === documentId).storage_status,
        "stored",
      );
      assert.equal(
        (await server.request(`/documents/${documentId}/download`)).status,
        200,
      );
      assert.equal(
        (await server.request(`/documents/${documentId}`, { method: "DELETE" }))
          .status,
        204,
      );
      const result = await pool.query("SELECT status FROM tasks WHERE id=$1", [
        taskId,
      ]);
      assert.equal(result.rows[0].status, "done");
      console.log(
        "DATA PROOF: task persisted as done after API restart; document metadata persisted; Storage was mocked.",
      );
    } finally {
      await server?.app.close();
      if (documentId)
        await pool.query("DELETE FROM documents WHERE id=$1", [documentId]);
      if (taskId) await pool.query("DELETE FROM tasks WHERE id=$1", [taskId]);
      await pool.end();
      if (oldUrl) process.env.DATABASE_URL = oldUrl;
      else delete process.env.DATABASE_URL;
    }
  },
);

test(
  "real PostgreSQL: pgvector retrieval keeps only ready, scoped and relevant chunks",
  {
    skip: !url
      ? "TEST_DATABASE_URL is absent; no real pgvector evidence"
      : false,
  },
  async () => {
    const parsed = new URL(url);
    assert.match(
      parsed.pathname,
      /_test$/,
      "Use a dedicated database whose name ends in _test",
    );
    await migrate(url);

    const oldEnvironment = {
      databaseUrl: process.env.DATABASE_URL,
      topK: process.env.RAG_TOP_K,
      candidateLimit: process.env.RAG_CANDIDATE_LIMIT,
      minScore: process.env.RAG_MIN_SCORE,
      promptVersion: process.env.RAG_PROMPT_VERSION,
    };
    process.env.DATABASE_URL = url;
    process.env.RAG_TOP_K = "6";
    process.env.RAG_CANDIDATE_LIMIT = "10";
    process.env.RAG_MIN_SCORE = "0.55";
    process.env.RAG_PROMPT_VERSION = "rag-db-test";

    const pool = new pg.Pool(databaseConfig(url));
    const database = new DatabaseService();
    const courseId = randomUUID();
    const readyDocumentId = randomUUID();
    const pendingDocumentId = randomUUID();
    const nearChunkId = randomUUID();
    const zeroVector = Array.from({ length: 768 }, () => 0);
    const nearVector = [...zeroVector];
    const farVector = [...zeroVector];
    nearVector[0] = 1;
    farVector[1] = 1;
    const embedding = {
      model: "gemini-embedding-001",
      dimensions: 768,
      async embedQuery() {
        return nearVector;
      },
    };
    try {
      await pool.query(
        `INSERT INTO courses
           (id, slug, name, code, detail, progress, tone, cover, cover_alt)
         VALUES ($1, $2, 'RAG test course', $3, 'Isolated retrieval test data',
                 0, 'slate', '/img/rag-test.webp', 'RAG test cover')`,
        [
          courseId,
          `rag-test-${courseId.slice(0, 8)}`,
          `RT${courseId.slice(0, 8)}`,
        ],
      );
      await pool.query(
        `INSERT INTO documents
           (id, name, media_type, storage_key, size_bytes, storage_status,
            processing_status, indexed_at, course_id)
         VALUES
           ($1, 'ready.pdf', 'application/pdf', $2, 100, 'stored', 'ready', NOW(), $5),
           ($3, 'pending.pdf', 'application/pdf', $4, 100, 'stored', 'pending', NULL, $5)`,
        [
          readyDocumentId,
          `documents/${readyDocumentId}.pdf`,
          pendingDocumentId,
          `documents/${pendingDocumentId}.pdf`,
          courseId,
        ],
      );
      await pool.query(
        `INSERT INTO document_chunks
           (id, document_id, chunk_index, content, source_page, embedding,
            embedding_model, embedding_dimensions)
         VALUES
           ($1, $2, 0, 'Relevant ready evidence', 2, $4::vector, 'gemini-embedding-001', 768),
           ($5, $2, 1, 'Irrelevant ready evidence', 3, $6::vector, 'gemini-embedding-001', 768),
           ($7, $3, 0, 'Relevant but pending evidence', 1, $4::vector, 'gemini-embedding-001', 768)`,
        [
          nearChunkId,
          readyDocumentId,
          pendingDocumentId,
          `[${nearVector.join(",")}]`,
          randomUUID(),
          `[${farVector.join(",")}]`,
          randomUUID(),
        ],
      );

      const retrieval = new RagRetrievalService(database, embedding);
      const result = await retrieval.retrieve("Find the ready evidence", {
        courseId,
      });
      assert.equal(result.evidence.length, 1);
      assert.equal(result.evidence[0].chunkId, nearChunkId);
      assert.equal(result.evidence[0].documentId, readyDocumentId);
      assert.equal(result.citations[0].sourceId, "S1");
      assert.match(result.context, /Relevant ready evidence/);
      assert.doesNotMatch(result.context, /pending|Irrelevant/);
    } finally {
      await database.onModuleDestroy();
      await pool.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [
        [readyDocumentId, pendingDocumentId],
      ]);
      await pool.query("DELETE FROM courses WHERE id = $1", [courseId]);
      await pool.end();
      for (const [name, value] of [
        ["DATABASE_URL", oldEnvironment.databaseUrl],
        ["RAG_TOP_K", oldEnvironment.topK],
        ["RAG_CANDIDATE_LIMIT", oldEnvironment.candidateLimit],
        ["RAG_MIN_SCORE", oldEnvironment.minScore],
        ["RAG_PROMPT_VERSION", oldEnvironment.promptVersion],
      ]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  },
);
