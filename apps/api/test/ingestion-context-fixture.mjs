// Synthetic orchestration only. SQL/RLS proof belongs to the disposable suite.
import "reflect-metadata";
import assert from "node:assert/strict";
import { DocumentIngestionService } from "../dist/documents/document-ingestion.service.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { requirePrincipal } from "../dist/auth/principal.js";
export const ingestionId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ingestionPrincipal = (role = "member") => ({
  userId: ingestionId(10),
  workspaceId: ingestionId(1),
  role,
});
export const fixedPages = [
  { page: 1, text: "First source paragraph." },
  { page: 2, text: "Second source paragraph." },
];
export const fixedVector = () => [1, ...Array(767).fill(0)];
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function bounded(promise, message = "fixture barrier timed out") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), 4000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function ingestionFixture() {
  const principal = ingestionPrincipal();
  const document = {
    id: ingestionId(100),
    workspace_id: principal.workspaceId,
    name: "study.pdf",
    storage_key: "synthetic-ingestion.pdf",
    storage_status: "stored",
    processing_status: "pending",
    indexed_at: null,
    processing_error_code: null,
  };
  const state = {
    active: 0,
    role: "member",
    workspaceCalls: 0,
    legacyCalls: 0,
    failInsert: false,
    failState: false,
    lostAck: null,
    afterCommit: null,
    chunks: [{ content: "old evidence" }],
    hooks: {},
    authCalls: [],
    queries: [],
    calls: { download: 0, extract: 0, ocr: 0, embedding: 0 },
    embeddingInputs: [],
    batches: [],
  };
  const clients = new WeakMap();
  async function run(work, p) {
    const before = structuredClone({ document, chunks: state.chunks });
    state.active++;
    let phase, result;
    const tx = {
      query: async (sql, values = []) => {
        state.queries.push({ sql, values: [...values], context: p, tx });
        const match = values[0] === document.id;
        if (sql.includes("SET processing_status = 'processing'")) {
          phase = "claim";
          if (
            !match ||
            values[1] !== document.workspace_id ||
            document.storage_status !== "stored" ||
            !["pending", "failed", "ready"].includes(document.processing_status)
          )
            return { rows: [] };
          Object.assign(document, {
            processing_status: "processing",
            indexed_at: null,
            processing_error_code: null,
          });
          return { rows: [{ ...document }] };
        }
        if (sql.includes("FROM documents WHERE id"))
          return {
            rows:
              match && values[1] === document.workspace_id
                ? [{ ...document }]
                : [],
          };
        if (sql.includes("SELECT id FROM documents"))
          return {
            rows:
              match &&
              values[1] === document.workspace_id &&
              document.storage_status === "stored" &&
              document.processing_status === "processing"
                ? [{ id: document.id }]
                : [],
          };
        if (sql.includes("DELETE FROM document_chunks")) {
          state.chunks = [];
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO document_chunks")) {
          if (state.failInsert) throw Error("synthetic insert failure");
          state.batches.push([...values]);
          for (let i = 0; i < values.length; i += 7)
            state.chunks.push({
              document_id: values[i],
              chunk_index: values[i + 1],
              content: values[i + 2],
              source_page: values[i + 3],
              embedding: values[i + 4],
              model: values[i + 5],
              dimensions: values[i + 6],
            });
          return { rows: [] };
        }
        if (sql.includes("SET processing_status = 'ready'")) {
          phase = "persist";
          if (
            !match ||
            values[9] !== document.workspace_id ||
            document.processing_status !== "processing" ||
            document.storage_status !== "stored"
          )
            return { rows: [] };
          Object.assign(document, {
            processing_status: "ready",
            indexed_at: "2026-10-17T00:00:00Z",
            processing_error_code: null,
          });
          return { rows: [{ indexed_at: document.indexed_at }] };
        }
        if (sql.includes("SET processing_status = 'failed'")) {
          phase = "failed";
          if (state.failState) throw Error("synthetic failed-state SQL error");
          if (
            !match ||
            values[2] !== document.workspace_id ||
            document.processing_status !== "processing" ||
            document.storage_status !== "stored"
          )
            return { rows: [], rowCount: 0 };
          Object.assign(document, {
            processing_status: "failed",
            indexed_at: null,
            processing_error_code: values[1],
          });
          return { rows: [{ id: document.id }], rowCount: 1 };
        }
        assert.fail("Unhandled ingestion fixture SQL");
      },
    };
    if (p) clients.set(tx, p);
    try {
      result = await work(tx);
    } catch (e) {
      Object.assign(document, before.document);
      state.chunks = before.chunks;
      throw e;
    } finally {
      state.active--;
    }
    await state.onCommitted?.(phase);
    // This fault occurs AFTER the committed state is retained, never rollback it.
    if (state.lostAck === phase) {
      state.lostAck = null;
      await state.afterCommit?.(phase);
      throw Object.assign(Error("synthetic lost COMMIT ACK"), {
        code: "ECONNRESET",
      });
    }
    return result;
  }
  const database = {
    query: async () => assert.fail("pool query outside workspace boundary"),
    transaction: async (work) => {
      state.legacyCalls++;
      return run(work);
    },
    workspaceTransaction: async (p, work) => {
      const verified = requirePrincipal(p);
      state.workspaceCalls++;
      return run(work, { ...verified });
    },
  };
  const access = new DocumentAccessService({
    membership: async (_w, _u, tx) => {
      state.authCalls.push({
        tx,
        context: clients.get(tx),
        active: state.active,
      });
      return state.role;
    },
  });
  async function step(name, value) {
    assert.equal(state.active, 0, `${name} must run outside DB transaction`);
    state.calls[name]++;
    return state.hooks[name] ? state.hooks[name](value) : value;
  }
  const storage = {
    downloadBuffer: () => step("download", Buffer.from("%PDF-synthetic")),
  };
  const extractor = {
    extract: () => step("extract", structuredClone(fixedPages)),
  };
  const ocr = {
    recover: async (_buffer, pages) => ({ pages: await step("ocr", pages) }),
  };
  const embeddings = {
    model: "gemini-embedding-001",
    dimensions: 768,
    embedDocuments: async (title, texts) => {
      state.embeddingInputs.push({ title, texts: [...texts] });
      return step("embedding", texts.map(fixedVector));
    },
  };
  const service = new DocumentIngestionService(
    database,
    storage,
    extractor,
    ocr,
    embeddings,
    access,
  );
  return {
    service,
    database,
    access,
    storage,
    extractor,
    ocr,
    embeddings,
    state,
    document,
    principal,
  };
}
