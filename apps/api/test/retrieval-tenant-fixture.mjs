// Test-only read fixture, independent of ingestion write grants/policies.
import assert from "node:assert/strict";
import {
  openDocumentsTenantFixture,
  documentsPolicy,
  tenants,
  people,
  tenantPrincipal,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";
import { AssistantService } from "../dist/assistant/assistant.service.js";
import { vector } from "./retrieval-context-fixture.mjs";
export { tenants, people, tenantPrincipal, fixedId };
export async function openRetrievalTenantFixture() {
  const f = await openDocumentsTenantFixture();
  try {
    f.guard(process.env.TEST_DATABASE_URL);
    await f.admin
      .query(`REVOKE ALL PRIVILEGES ON documents,courses FROM "${f.role}";
   REVOKE INSERT(id,name,media_type,storage_key,size_bytes,storage_status,course_id,workspace_id),UPDATE(course_id,storage_status,updated_at) ON documents FROM "${f.role}";
   GRANT SELECT(id,name,workspace_id,course_id,storage_status,processing_status,total_page_count,useful_text_page_count,low_text_page_count,needs_ocr) ON documents TO "${f.role}";
   GRANT SELECT(id,workspace_id,slug,name,code) ON courses TO "${f.role}";
   GRANT SELECT(id,document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) ON document_chunks TO "${f.role}";
   CREATE POLICY retrieval_chunks_read ON document_chunks FOR SELECT TO "${f.role}" USING(EXISTS(SELECT 1 FROM documents d WHERE d.id=document_chunks.document_id AND ${documentsPolicy().replaceAll("documents.", "d.")}));`);
    Object.assign(process.env, {
      RAG_TOP_K: "3",
      RAG_CANDIDATE_LIMIT: "4",
      RAG_MIN_SCORE: "0.55",
      RAG_PROMPT_VERSION: "rag-v1",
    });
    const state = {
      embedding: 0,
      generations: [],
      afterEmbedding: null,
      afterGeneration: null,
    };
    const originals = (
      await f.admin.query(
        "SELECT id,workspace_id,name,storage_key,course_id,storage_status FROM documents",
      )
    ).rows;
    const embeddings = {
      model: "gemini-test-fixed",
      dimensions: 768,
      embedQuery: async () => {
        assert.equal(
          f.active.count,
          0,
          "embedding must release workspace client",
        );
        state.embedding++;
        await state.afterEmbedding?.();
        return vector();
      },
    };
    const provider = {
      model: "synthetic-generation",
      status: () => ({ configured: true }),
      generate: async (input) => {
        assert.equal(
          f.active.count,
          0,
          "generation must release workspace client",
        );
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
    function make(db = f.db, access = f.access) {
      const retrieval = new RagRetrievalService(db, embeddings, access);
      return {
        retrieval,
        assistant: new AssistantService(provider, retrieval, access, db),
      };
    }
    async function reset({ large = false } = {}) {
      state.embedding = 0;
      state.generations = [];
      state.afterEmbedding = null;
      state.afterGeneration = null;
      await f.admin.query("DELETE FROM document_chunks");
      for (const d of originals)
        await f.admin.query(
          "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes,course_id,storage_status) VALUES($1,$2,$3,'application/pdf',$4,100,$5,$6) ON CONFLICT(id) DO NOTHING",
          [
            d.id,
            d.workspace_id,
            d.name,
            d.storage_key,
            d.course_id,
            d.storage_status,
          ],
        );
      for (const [n, w] of tenants.entries()) {
        await f.admin.query("UPDATE workspaces SET active=$2 WHERE id=$1", [
          w.id,
          n !== 2,
        ]);
        for (const r of ["manager", "member", "viewer", "inactive"])
          await f.admin.query(
            "UPDATE workspace_memberships SET role=$3,active=$4 WHERE workspace_id=$1 AND user_id=$2",
            [
              w.id,
              people[r],
              r === "inactive" ? "member" : r,
              r !== "inactive",
            ],
          );
        const count = n === 1 ? 120 : large ? 40 : 8,
          low = n !== 1 && !large ? 3 : 0;
        await f.admin.query(
          "UPDATE documents SET course_id=$2,storage_status='stored',processing_status='ready',indexed_at=NOW(),total_page_count=$3,useful_text_page_count=$4::smallint,low_text_page_count=$5,indexed_chunk_count=$4::smallint,skipped_page_numbers=$6,needs_ocr=$7 WHERE id=$1",
          [
            w.document,
            w.course,
            count,
            count - low,
            low,
            low ? [1, 2, 3] : [],
            low > 0,
          ],
        );
        await f.admin.query(
          "UPDATE documents SET processing_status='ready',indexed_at=NOW() WHERE id=$1",
          [w.unassigned],
        );
        for (let i = 0; i < count; i++)
          await f.admin.query(
            "INSERT INTO document_chunks(id,document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) VALUES($1,$2,$3,$4,$5,$6::vector(768),$7,768)",
            [
              fixedId(1000 + n * 1000 + i),
              w.document,
              i,
              i + 1,
              large
                ? `Synthetic evidence ${i}. ` +
                  "Useful document material for summary. ".repeat(44)
                : n === 1
                  ? `Other tenant evidence ${i} must never enter context.`
                  : i < 3
                    ? "61"
                    : `Synthetic evidence paragraph ${i + 1} contains a useful source statement.`,
              `[${vector(n === 1 ? 0 : i / 10).join(",")}]`,
              "gemini-test-fixed",
            ],
          );
      }
    }
    return { ...f, ...make(), make, embeddings, provider, state, reset };
  } catch (error) {
    await f.close();
    throw error;
  }
}
