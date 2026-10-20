// Test-only extension in its OWN disposable database. Production policies and
// Phase11's metadata-only fixture remain unchanged.
import assert from "node:assert/strict";
import { DocumentIngestionService } from "../dist/documents/document-ingestion.service.js";
import {
  openDocumentsTenantFixture,
  documentsPolicy,
  tenants,
  people,
  tenantPrincipal,
} from "./documents-tenant-fixture.mjs";
import { fixedPages, fixedVector } from "./ingestion-context-fixture.mjs";
export {
  tenants,
  people,
  tenantPrincipal,
} from "./documents-tenant-fixture.mjs";
export async function openIngestionTenantFixture() {
  const f = await openDocumentsTenantFixture();
  try {
    f.guard(process.env.TEST_DATABASE_URL);
    const parent = (write) =>
      `EXISTS(SELECT 1 FROM documents d WHERE d.id=document_chunks.document_id AND ${documentsPolicy(write).replaceAll("documents.", "d.")} ${write ? "AND d.storage_status='stored' AND d.processing_status='processing'" : ""})`;
    await f.admin.query(`
      GRANT UPDATE(processing_status,indexed_at,processing_error_code,total_page_count,useful_text_page_count,low_text_page_count,indexed_chunk_count,skipped_page_numbers,needs_ocr,ocr_page_count,ocr_page_numbers) ON documents TO "${f.role}";
      GRANT SELECT,DELETE ON document_chunks TO "${f.role}";
      GRANT INSERT(document_id,chunk_index,content,source_page,embedding,embedding_model,embedding_dimensions) ON document_chunks TO "${f.role}";
      CREATE POLICY ing_chunks_read ON document_chunks FOR SELECT TO "${f.role}" USING(${parent(false)});
      CREATE POLICY ing_chunks_insert ON document_chunks FOR INSERT TO "${f.role}" WITH CHECK(${parent(true)});
      CREATE POLICY ing_chunks_delete ON document_chunks FOR DELETE TO "${f.role}" USING(${parent(true)});
    `);
    const state = {
      calls: { download: 0, extract: 0, ocr: 0, embedding: 0 },
      hooks: {},
      inputs: [],
    };
    async function step(name, value) {
      assert.equal(
        f.active.count,
        0,
        `${name} must release the workspace transaction`,
      );
      state.calls[name]++;
      return state.hooks[name] ? state.hooks[name](value) : value;
    }
    const storage = {
      ...f.storage,
      downloadBuffer: () =>
        step("download", Buffer.from("%PDF-synthetic-ingestion")),
    };
    const extractor = {
      extract: () => step("extract", structuredClone(fixedPages)),
    };
    const ocr = {
      plannedProviderCalls: () => 0,
      recover: async (_buffer, pages) => ({ pages: await step("ocr", pages) }),
    };
    const embeddings = {
      model: "gemini-embedding-001",
      dimensions: 768,
      embedDocuments: async (title, texts) => {
        state.inputs.push({ title, texts: [...texts] });
        return step("embedding", texts.map(fixedVector));
      },
    };
    const makeService = (db = f.db, overrides = {}) =>
      new DocumentIngestionService(
        db,
        overrides.storage ?? storage,
        overrides.extractor ?? extractor,
        overrides.ocr ?? ocr,
        overrides.embeddings ?? embeddings,
        f.access,
      );
    async function reset() {
      state.calls = { download: 0, extract: 0, ocr: 0, embedding: 0 };
      state.hooks = {};
      state.inputs = [];
      for (const w of tenants) {
        await f.admin.query("UPDATE workspaces SET active=$2 WHERE id=$1", [
          w.id,
          w !== tenants[2],
        ]);
        for (const role of ["manager", "member", "viewer", "inactive"])
          await f.admin.query(
            "UPDATE workspace_memberships SET role=$3,active=$4 WHERE workspace_id=$1 AND user_id=$2",
            [
              w.id,
              people[role],
              role === "inactive" ? "member" : role,
              role !== "inactive",
            ],
          );
        await f.admin.query(
          "UPDATE documents SET processing_status='pending',indexed_at=NULL,processing_error_code=NULL,total_page_count=NULL,useful_text_page_count=NULL,low_text_page_count=NULL,indexed_chunk_count=NULL,skipped_page_numbers=NULL,needs_ocr=NULL,ocr_page_count=0,ocr_page_numbers='{}' WHERE id=$1",
          [w.document],
        );
        await f.admin.query(
          "DELETE FROM document_chunks WHERE document_id=$1",
          [w.document],
        );
        await f.admin.query(
          "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,0,'old evidence',1)",
          [w.document],
        );
      }
    }
    return {
      ...f,
      storage,
      extractor,
      ocr,
      embeddings,
      ingestion: makeService(),
      makeService,
      state,
      reset,
    };
  } catch (e) {
    await f.close();
    throw e;
  }
}
