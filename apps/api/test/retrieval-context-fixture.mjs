import "reflect-metadata";
import assert from "node:assert/strict";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";
import { AssistantService } from "../dist/assistant/assistant.service.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { requirePrincipal } from "../dist/auth/principal.js";
export { deferred, bounded } from "./ingestion-context-fixture.mjs";
export const id = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const principal = (role) => ({
  userId: id(10),
  workspaceId: id(1),
  role: role ?? "member",
});
export const vector = (offset = 0) => [1, offset, ...Array(766).fill(0)];
export const row = (n = 0) => ({
  chunk_id: id(1000 + n),
  document_id: id(100),
  document_name: "Synthetic source.pdf",
  course_id: id(50),
  chunk_index: n,
  source_page: n + 1,
  content: `Synthetic evidence paragraph ${n + 1} contains a useful source statement.`,
  score: 0.9 - n / 100,
});
export function retrievalFixture() {
  const p = principal(),
    state = {
      role: "member",
      active: 0,
      legacy: 0,
      workspace: 0,
      queries: [],
      auth: [],
      scans: [],
      embedding: 0,
      generations: [],
      afterEmbedding: null,
      afterScan: null,
      afterGeneration: null,
      document: {
        id: id(100),
        name: "Synthetic source.pdf",
        course_id: id(50),
        course_slug: "synthetic",
        course_name: "Synthetic course",
        course_code: "SYN",
        storage_status: "stored",
        processing_status: "ready",
        total_page_count: 3,
        useful_text_page_count: 3,
        low_text_page_count: 0,
        needs_ocr: false,
      },
      rows: [row()],
    };
  async function query(sql, values = [], tx) {
    state.queries.push({ sql, values, tx });
    if (sql.includes("FROM courses"))
      return { rows: values[0] === id(50) ? [{ id: id(50) }] : [] };
    if (sql.includes("WITH nearest")) {
      state.scans.push(values[5]);
      const rows =
        state.document?.processing_status === "ready"
          ? state.rows.slice(0, values[5]).map((r) => ({ ...r }))
          : [];
      await state.afterScan?.();
      return { rows };
    }
    if (sql.includes("FROM document_chunks"))
      return { rows: structuredClone(state.rows) };
    if (sql.includes("FROM documents d"))
      return {
        rows:
          state.document && values[0] === state.document.id
            ? [structuredClone(state.document)]
            : [],
      };
    assert.fail("Unexpected synthetic query");
  }
  const database = {
    query: (...args) => {
      state.legacy++;
      return query(...args);
    },
    transaction: async (work) => work({ query: (...args) => query(...args) }),
    workspaceTransaction: async (p, work) => {
      requirePrincipal(p);
      state.workspace++;
      state.active++;
      const tx = { query: (sql, values) => query(sql, values, tx) };
      try {
        return await work(tx);
      } finally {
        state.active--;
      }
    },
  };
  const access = new DocumentAccessService({
    membership: async (_w, _u, tx) => {
      state.auth.push({ tx, active: state.active });
      return state.role;
    },
  });
  const embeddings = {
    model: "gemini-test-fixed",
    dimensions: 768,
    embedQuery: async () => {
      assert.equal(state.active, 0, "embedding holds no transaction");
      state.embedding++;
      await state.afterEmbedding?.();
      return vector();
    },
  };
  const provider = {
    model: "synthetic-generation",
    status: () => ({ configured: true }),
    generate: async (input) => {
      assert.equal(state.active, 0, "generation holds no transaction");
      state.generations.push(input);
      await state.afterGeneration?.();
      const source =
        /"sourceId":"(S\d+)"/.exec(input.userParts.join("\n"))?.[1] ?? "S1";
      return JSON.stringify({
        answerable: true,
        answer: `Synthetic answer [${source}].`,
        citationIds: [source],
      });
    },
  };
  const retrieval = new RagRetrievalService(database, embeddings, access);
  return {
    p,
    state,
    database,
    access,
    embeddings,
    provider,
    retrieval,
    assistant: new AssistantService(provider, retrieval, access, database),
  };
}
