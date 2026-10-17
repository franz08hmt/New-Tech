import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  openRetrievalTenantFixture,
  tenants,
  tenantPrincipal,
} from "./retrieval-tenant-fixture.mjs";

const golden = JSON.parse(
  readFileSync(
    new URL("./retrieval-context-golden.json", import.meta.url),
    "utf8",
  ),
);
// Materialization prevents an ANN order/limit plan. Every runtime predicate,
// including score and text length, is retained. This is a test-only oracle.
const exactSql = `WITH eligible AS MATERIALIZED (
 SELECT dc.id::text AS chunk_id, (1-(dc.embedding <=> $1::vector(768)))::double precision AS score
 FROM document_chunks dc JOIN documents d ON d.id=dc.document_id
 WHERE d.storage_status='stored' AND d.processing_status='ready'
 AND dc.embedding IS NOT NULL AND dc.embedding_model=$2 AND dc.embedding_dimensions=$3
 AND char_length(dc.content) BETWEEN 1 AND 1800
 AND ($4::uuid IS NULL OR d.course_id=$4::uuid)
 AND ($5::uuid IS NULL OR d.id=$5::uuid) AND d.workspace_id=$8::uuid
 ) SELECT chunk_id,score FROM eligible WHERE score >= $7 ORDER BY score DESC,chunk_id LIMIT $6`;

test(
  "shared physical corpus/index: 12 reset/reinsert cycles, scoped/all-documents and reversible lifecycle",
  { timeout: 90000 },
  async () => {
    const f = await openRetrievalTenantFixture(),
      A = tenants[0],
      p = tenantPrincipal(A);
    const output = new URL(
      `../../../artifacts/phase16-shared-${randomUUID()}/`,
      import.meta.url,
    );
    mkdirSync(output, { recursive: true });
    const phases = [];
    let phase = "setup",
      scans = [];
    const original = f.db.workspaceTransaction.bind(f.db);
    f.db.workspaceTransaction = (principal, work) =>
      original(principal, (tx) =>
        work({
          query: async (sql, values) => {
            if (!sql.includes("WITH nearest")) return tx.query(sql, values);
            scans.push(values[5]);
            const oracle = await tx.query(exactSql, values);
            const result = await tx.query(sql, values);
            if (!result.rows.length && oracle.rows.length) {
              // No scope-changing hooks run between the oracle and failing scan.
              const context = (
                await tx.query(
                  "SELECT current_user,session_user,pg_backend_pid(),current_setting('examate.user_id',true) AS principal,current_setting('examate.workspace_id',true) AS workspace",
                )
              ).rows;
              const membership = (
                await tx.query(
                  "SELECT m.workspace_id,m.user_id,m.role,m.active,w.active AS workspace_active FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 AND m.workspace_id=$2",
                  [principal.userId, principal.workspaceId],
                )
              ).rows;
              const documents = (
                await tx.query(
                  "SELECT id,workspace_id,course_id,storage_status,processing_status FROM documents",
                )
              ).rows;
              // Explicitly a SECOND execution, not a plan captured from the failed scan.
              const secondExecutionPlan = (
                await tx.query(
                  "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + sql,
                  values,
                )
              ).rows;
              writeFileSync(
                new URL("false-empty.json", output),
                JSON.stringify(
                  {
                    phase,
                    sql,
                    values,
                    exactSql,
                    oracle: oracle.rows,
                    nearest: result.rows,
                    context,
                    membership,
                    documents,
                    secondExecutionPlan,
                    planProvenance:
                      "second execution after observed empty; not the failed execution plan",
                  },
                  null,
                  2,
                ),
                { flag: "wx" },
              );
              assert.fail(
                "RUNTIME_FALSE_EMPTY: exact oracle has eligible rows; stop Part B and inspect private synthetic diagnostic",
              );
            }
            return result;
          },
        }),
      );
    try {
      const indexBefore = (
        await f.admin.query(
          "SELECT indexrelid::text AS oid,indexrelid::regclass::text AS name FROM pg_index WHERE indrelid='document_chunks'::regclass ORDER BY indexrelid",
        )
      ).rows;
      const pid = (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      for (let cycle = 0; cycle < 12; cycle++) {
        phase = `cycle-${cycle}-reset`;
        await f.reset();
        for (const scope of [
          { documentId: A.document, courseId: A.course },
          {},
        ]) {
          phase = `cycle-${cycle}-${scope.documentId ? "scoped" : "all"}`;
          scans = [];
          const result = await f.retrieval.retrieve("Question", scope, p);
          assert.deepEqual(result.evidence, golden.retrieve.evidence, phase);
          assert.deepEqual(result.citations, golden.retrieve.citations, phase);
          assert.deepEqual(scans, [4, 8], phase);
          phases.push({
            phase,
            ids: result.evidence.map((e) => e.chunkId),
            scans: [...scans],
          });
        }
        phase = `cycle-${cycle}-processing`;
        await f.admin.query(
          "UPDATE documents SET processing_status='processing',indexed_at=NULL WHERE id=$1",
          [A.document],
        );
        await assert.rejects(
          f.retrieval.retrieve("Question", { documentId: A.document }, p),
          (e) => e.kind === "document_not_ready",
        );
        assert.equal(
          (await f.retrieval.retrieve("Question", {}, p)).evidence.length,
          0,
          "negative lifecycle has no eligible evidence",
        );
        await f.admin.query(
          "UPDATE documents SET processing_status='ready',indexed_at=NOW() WHERE id=$1",
          [A.document],
        );
        phase = `cycle-${cycle}-restored`;
        scans = [];
        assert.deepEqual(
          (await f.retrieval.retrieve("Question", {}, p)).evidence,
          golden.retrieve.evidence,
        );
        assert.deepEqual(scans, [4, 8]);
        assert.deepEqual(
          (
            await f.admin.query(
              "SELECT indexrelid::text AS oid,indexrelid::regclass::text AS name FROM pg_index WHERE indrelid='document_chunks'::regclass ORDER BY indexrelid",
            )
          ).rows,
          indexBefore,
          "same physical index across cycles",
        );
        assert.equal(
          (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
          pid,
          "same runtime backend/pool",
        );
      }
      writeFileSync(
        new URL("bounded-result.json", output),
        JSON.stringify(
          {
            cycles: 12,
            positiveRetrievals: 36,
            lifecycleNegativeRetrievals: 24,
            phases,
            historicalFalseEmpty:
              "INCONCLUSIVE: not reproduced in this bounded run",
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
    } finally {
      f.db.workspaceTransaction = original;
      await f.close();
    }
  },
);
