import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import {
  corpusDocuments,
  corpusManifest,
} from "../scripts/rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "../scripts/rag-evaluation-lib.mjs";
import { gitSnapshot } from "../scripts/evaluate-rag.mjs";
import {
  auditCorpusProvenance,
  collectDatabaseObservation,
  createStorageObjectReader,
  openReadOnlySnapshot,
  verifyProvenanceArtifact,
} from "../scripts/rag-evaluation-provenance.mjs";
import { runQualityHttpEvaluation } from "../scripts/rag-evaluation-quality-http.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { prepareDocumentPages } from "../dist/documents/document-chunker.js";
import { geminiEmbeddingConfig } from "../dist/config/config.js";
import { openDocumentsTenantFixture } from "./documents-tenant-fixture.mjs";
import {
  BUCKET,
  openIngestionChain,
  syntheticVector,
} from "./evaluation-ingestion-chain-fixture.mjs";

// F09-B.2B.3: upload API -> ingestion service -> provenance audit -> quality
// preflight on one disposable runtime. Documents and their index are created by
// the public upload route and the processing endpoint through the real services;
// this file never inserts or updates a document or chunk to build a happy path.
// Direct SQL appears only below the NEGATIVE-CORRUPTION marker, to damage data
// on purpose. Only the Auth upstream, the remote Storage (a stand-in that keeps
// the bytes it receives) and the SDK transport are synthetic.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const SUITE = "docs/evaluation-quality-cases-v1.json";
const nativeFetch = globalThis.fetch;
const [BRIEF, POLICY] = corpusDocuments;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const pdfOf = (document) => makeEvaluationPdf(document.pages);
const keyOf = (id) => `documents/${id}.pdf`;

async function expectedIndex(document) {
  const pages = await new PdfTextExtractorService().extract(pdfOf(document));
  return prepareDocumentPages(pages);
}

test("F09-B.2B.3 upload -> ingestion -> audit -> quality preflight on one runtime", async (t) => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const manifestBytes = await readFile(join(root, SUITE));
  const work = await mkdtemp(join(tmpdir(), "ingestion-chain-"));
  await mkdir(join(work, "docs"), { recursive: true });
  await writeFile(join(work, SUITE), manifestBytes);
  const chain = await openIngestionChain();
  t.after(async () => {
    await chain.close();
    await rm(work, { recursive: true, force: true });
  });
  const { A } = chain.tenants;
  const owner = chain.actor("owner");
  const viewer = chain.actor("viewer");
  const foreign = chain.actor("foreign");
  const batchSize = geminiEmbeddingConfig().batchSize;
  const batches = (chunks) => Math.ceil(chunks / batchSize);
  const query = async (sql, params) =>
    (await chain.admin.query(sql, params)).rows;
  const docRow = async (id) =>
    (
      await query(
        "SELECT processing_status, indexed_at, indexed_chunk_count, processing_error_code, course_id, name FROM documents WHERE id=$1",
        [id],
      )
    )[0];
  const chunkRows = (id) =>
    query(
      "SELECT chunk_index, source_page, content, embedding_model, embedding_dimensions, encode(sha256(convert_to(embedding::text,'UTF8')),'hex') AS embedding_sha256 FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
      [id],
    );
  const reindex = (actor, id) =>
    actor.request(`/documents/${id}/process`, undefined, "POST");

  // ---- phase 0: setup (base data only; no documents) ------------------------
  const courseBoth = await chain.seedCourse(A, "chain-both");
  const coursePolicy = await chain.seedCourse(A, "chain-policy");
  const setup = await chain.telemetry();
  // The baseline is blank: base data exists, but no document, chunk, provider
  // call, operation or receipt does. Checked on the database, not inferred from
  // source or from which helper the fixture happens to call.
  assert.deepEqual(
    (
      await query(
        "SELECT (SELECT count(*)::int FROM documents) AS documents, (SELECT count(*)::int FROM document_chunks) AS chunks",
      )
    )[0],
    { documents: 0, chunks: 0 },
  );
  assert.deepEqual(setup, {
    sdk: { embedding: 0, embeddingInputs: [], generation: 0, ocr: 0 },
    operations: 0,
    documentIndexOperations: 0,
    providerCalls: 0,
    receipts: 0,
    chunks: 0,
  });
  for (const table of ["workspaces", "workspace_memberships", "courses"])
    assert.ok(
      (await query(`SELECT count(*)::int AS n FROM ${table}`))[0].n > 0,
      `${table} is base data`,
    );

  // ---- phase 1: upload through the public route -----------------------------
  const ids = {};
  await t.test(
    "upload: denials stop before Storage; owner uploads three PDFs; bytes are kept",
    async () => {
      const before = await chain.telemetry();
      const storageBefore = chain.storage.log.length;
      // A viewer cannot write; a manager of another workspace cannot use this course.
      assert.equal(
        (await viewer.upload(pdfOf(BRIEF), BRIEF.file, courseBoth)).status,
        403,
      );
      const crossed = await foreign.upload(
        pdfOf(BRIEF),
        BRIEF.file,
        courseBoth,
      );
      assert.ok(
        [400, 403, 404].includes(crossed.status),
        String(crossed.status),
      );
      assert.equal(
        chain.storage.log.length,
        storageBefore,
        "no Storage request before denial",
      );
      assert.deepEqual(await chain.telemetry(), before);

      for (const [name, document, course] of [
        ["brief", BRIEF, courseBoth],
        ["policy", POLICY, courseBoth],
        ["copy", POLICY, coursePolicy],
      ]) {
        const response = await owner.upload(
          pdfOf(document),
          document.file,
          course,
        );
        assert.equal(response.status, 201, name);
        const body = await response.json();
        assert.equal(body.name, document.file);
        assert.equal(body.processing_status, "pending");
        assert.equal(body.storage_status, "stored");
        assert.equal(body.course_id, course);
        ids[name] = body.id;
      }
      assert.equal(new Set(Object.values(ids)).size, 3);
      // The stand-in holds exactly the bytes that were uploaded, per object key.
      for (const [name, document] of [
        ["brief", BRIEF],
        ["policy", POLICY],
        ["copy", POLICY],
      ])
        assert.equal(
          sha(chain.storage.objects.get(keyOf(ids[name]))),
          sha(pdfOf(document)),
          name,
        );
      assert.equal(chain.storage.objects.size, 3);
      // The database holds exactly the three documents the API returned, no chunk.
      assert.deepEqual(
        (await query("SELECT id FROM documents")).map((r) => r.id).sort(),
        Object.values(ids).sort(),
      );
      assert.equal(
        (await query("SELECT count(*)::int AS n FROM document_chunks"))[0].n,
        0,
      );
      // Upload has side effects (Storage, rows) but makes no provider call.
      const after = await chain.telemetry();
      assert.deepEqual(after.sdk, before.sdk);
      assert.equal(after.operations, before.operations);
      assert.equal(after.chunks, before.chunks);
      for (const id of Object.values(ids)) {
        assert.equal((await docRow(id)).processing_status, "pending");
        assert.equal((await chunkRows(id)).length, 0);
      }
    },
  );

  // ---- phase 2: processing through DocumentIngestionService -----------------
  const processed = {};
  await t.test(
    "processing: denials make no SDK or Storage call; the real service indexes each document",
    async () => {
      const preDenial = await chain.telemetry();
      const downloads = chain.storage.log.filter(
        (l) => l.kind === "download",
      ).length;
      assert.equal((await reindex(viewer, ids.brief)).status, 403);
      assert.equal((await reindex(foreign, ids.brief)).status, 404);
      // The usage layer records each refused request as an operation, with zero
      // provider calls; nothing else moves and no transport call is made.
      const before = await chain.telemetry();
      assert.deepEqual(
        { ...before, operations: 0, documentIndexOperations: 0 },
        { ...preDenial, operations: 0, documentIndexOperations: 0 },
      );
      assert.equal(before.operations - preDenial.operations, 2);
      assert.deepEqual(
        (
          await query(
            "SELECT outcome, provider_call_count FROM ai_usage_operations ORDER BY started_at DESC LIMIT 2",
          )
        ).map((r) => [r.outcome, r.provider_call_count]),
        [
          ["rejected", 0],
          ["rejected", 0],
        ],
      );
      assert.equal(
        chain.storage.log.filter((l) => l.kind === "download").length,
        downloads,
      );

      for (const [name, document] of [
        ["brief", BRIEF],
        ["policy", POLICY],
        ["copy", POLICY],
      ]) {
        const response = await reindex(owner, ids[name]);
        assert.equal(response.status, 200, name);
        const result = await response.json();
        assert.equal(result.processing_status, "ready");
        processed[name] = result;
        const expected = await expectedIndex(document);
        // The persisted chunks equal what the production pipeline makes of the bytes.
        const rows = await chunkRows(ids[name]);
        assert.equal(result.chunk_count, expected.chunks.length, name);
        assert.deepEqual(
          rows.map((r) => [r.chunk_index, r.source_page, r.content]),
          expected.chunks.map((c) => [c.chunkIndex, c.sourcePage, c.content]),
          name,
        );
        // Each vector is the service's embedding of that chunk's own text.
        for (const row of rows) {
          assert.equal(row.embedding_model, "gemini-embedding-001");
          assert.equal(row.embedding_dimensions, 768);
          assert.equal(
            row.embedding_sha256,
            sha(`[${syntheticVector(row.content).join(",")}]`),
            `${name} chunk ${row.chunk_index}`,
          );
        }
        const detail = await (
          await owner.request(`/documents/${ids[name]}`)
        ).json();
        assert.equal(detail.processing_status, "ready");
        assert.equal(
          detail.index_quality.indexed_chunk_count,
          expected.chunks.length,
        );
        assert.equal(
          detail.index_quality.total_page_count,
          document.pages.length,
        );
        assert.equal(detail.index_quality.needs_ocr, false);
      }
      const after = await chain.telemetry();
      assert.deepEqual(
        (await query("SELECT id FROM documents")).map((r) => r.id).sort(),
        Object.values(ids).sort(),
      );
      assert.deepEqual(
        (await query("SELECT DISTINCT document_id FROM document_chunks"))
          .map((r) => r.document_id)
          .sort(),
        Object.values(ids).sort(),
      );
      assert.equal(
        (await query("SELECT count(*)::int AS n FROM document_chunks"))[0].n,
        Object.values(processed).reduce((n, r) => n + r.chunk_count, 0),
      );
      const chunkTotal = Object.values(processed).reduce(
        (n, r) => n + r.chunk_count,
        0,
      );
      // Calls follow the real batching; nothing is hard-coded.
      const expectedCalls = Object.values(processed).reduce(
        (n, r) => n + batches(r.chunk_count),
        0,
      );
      assert.equal(after.sdk.embedding - before.sdk.embedding, expectedCalls);
      assert.equal(
        after.sdk.embeddingInputs
          .slice(before.sdk.embeddingInputs.length)
          .reduce((a, b) => a + b, 0),
        chunkTotal,
      );
      assert.ok(after.sdk.embeddingInputs.every((n) => n <= batchSize));
      assert.equal(
        after.documentIndexOperations - before.documentIndexOperations,
        3,
      );
      assert.equal(after.providerCalls - before.providerCalls, expectedCalls);
      assert.equal(after.sdk.generation, 0);
      assert.equal(after.sdk.ocr, 0, "ASCII corpus needs no OCR");
      assert.equal(after.receipts, 0);
      assert.equal(chain.outbound.blocked, 0);
    },
  );

  // ---- baseline after indexing; everything below is read-only ---------------
  const baseline = {
    telemetry: await chain.telemetry(),
    tables: await chain.tableState(),
  };

  const databaseEndpoint = chain.databaseEndpoint();
  const mapping = () => ({
    schemaVersion: "rag-quality-mapping-v1",
    corpusRevision: "rag-eval-v2",
    documents: { [BRIEF.file]: ids.brief, [POLICY.file]: ids.policy },
    scopes: [
      { files: [BRIEF.file, POLICY.file], courseId: courseBoth },
      {
        files: [POLICY.file],
        courseId: coursePolicy,
        documents: { [POLICY.file]: ids.copy },
      },
    ],
    provenanceTarget: {
      kind: "postgres+supabase-storage",
      databaseEndpoint,
      storageOrigin: chain.storage.origin(),
      storageBucket: BUCKET,
      workspaceId: A.id,
    },
  });
  const auditRequest = (m = mapping()) => ({
    manifestBytes,
    corpus: corpusManifest(),
    target: m.provenanceTarget,
    mapping: { corpusRevision: m.corpusRevision, documents: m.documents },
    scopes: m.scopes,
  });
  const snapshot = openReadOnlySnapshot(chain.admin, {
    statementTimeoutMs: 5000,
  });
  // The maintenance auditor: separate from the evaluator and the API process.
  const audit = (m = mapping(), extra = {}) => {
    const request = auditRequest(m);
    return auditCorpusProvenance(request, {
      readDatabase: () =>
        snapshot((client) => collectDatabaseObservation(client, request)),
      readStorage: createStorageObjectReader({
        origin: chain.storage.origin(),
        bucket: BUCKET,
        key: "maintenance-read-key-synthetic",
        fetchImpl: nativeFetch,
        timeoutMs: 3000,
      }),
      git: gitSnapshot,
      deadlineMs: 15000,
      ...extra,
    });
  };
  const sameState = async (label) => {
    assert.deepEqual(await chain.telemetry(), baseline.telemetry, label);
    assert.deepEqual(await chain.tableState(), baseline.tables, label);
  };
  const cond = (report, name) => report.preflight.conditions[name];

  let artifact;
  await t.test(
    "audit: stored bytes and persisted chunks are consistent, read-only, no provider call",
    async () => {
      const storageBefore = chain.storage.log.length;
      artifact = await audit();
      assert.equal(
        artifact.verdict,
        "OBSERVED_CONSISTENT",
        JSON.stringify(artifact.conditions),
      );
      assert.equal(artifact.documents.length, 3);
      for (const entry of artifact.documents) {
        assert.equal(entry.verdict, "OBSERVED_CONSISTENT");
        assert.equal(
          entry.storage.sha256,
          corpusManifest().documents.find((d) => d.file === entry.file).sha256,
        );
      }
      assert.deepEqual(
        artifact.conditions.courseScopes.map((s) => s.status),
        ["verified", "verified"],
      );
      // The audit's view matches what the processing endpoint reported.
      for (const [name, result] of Object.entries(processed))
        assert.equal(
          artifact.documents.find((d) => d.documentId === ids[name]).index
            .chunkCount,
          result.chunk_count,
        );
      // Storage saw reads only; no table, call, receipt or operation changed.
      assert.ok(
        chain.storage.log.slice(storageBefore).every((l) => l.method === "GET"),
      );
      await sameState("audit changed state");
      // The checksum is not trust; with a pin from outside and a second audit it binds.
      const second = await audit(mapping(), {
        auditId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
      const bound = verifyProvenanceArtifact(artifact, {
        manifestBytes,
        corpus: corpusManifest(),
        target: mapping().provenanceTarget,
        mapping: auditRequest().mapping,
        scopes: mapping().scopes,
        expectedDigest: artifact.integrity.digest,
        observation: second,
      });
      assert.equal(bound.status, "BOUND");
      assert.equal(bound.currentness, "matches_observation");
      await sameState("second audit changed state");
    },
  );

  // ---- phase 4: quality preflight over the same runtime ---------------------
  let steps = 0;
  async function preflight(name, extra = [], m = mapping(), files = {}) {
    await writeFile(join(work, "mapping.json"), JSON.stringify(m));
    for (const [file, value] of Object.entries(files))
      await writeFile(join(work, file), JSON.stringify(value));
    const target = chain.httpTarget(name);
    const out = [];
    const output = `artifacts/run-${String(++steps).padStart(2, "0")}`;
    const exit = await runQualityHttpEvaluation(
      [
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "mapping.json",
        "--base-url",
        target.baseUrl,
        "--origin",
        target.origin,
        "--output",
        output,
        "--preflight",
        "--credentials-stdin",
        ...extra,
      ],
      {
        root: work,
        credentials: async () => target.credentials,
        write: (text) => out.push(String(text)),
        fetchImpl: (url, init) => globalThis.fetch(url, init),
      },
    );
    const report = JSON.parse(
      await readFile(join(work, output, "report.json"), "utf8"),
    );
    return { exit, report, out: out.join(""), output };
  }

  await t.test(
    "preflight: Auth plus the public read APIs of this runtime; evidence verified apart; execution blocked",
    async () => {
      const observation = await audit(mapping(), {
        auditId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      });
      const { exit, report, out, output } = await preflight(
        "owner",
        [
          "--provenance-artifact",
          "artifact.json",
          "--provenance-observation",
          "observation.json",
          "--expected-digest",
          artifact.integrity.digest,
        ],
        mapping(),
        { "artifact.json": artifact, "observation.json": observation },
      );
      assert.equal(exit, 0, out);
      for (const name of [
        "target",
        "authSession",
        "membership",
        "documentScope",
        "assistantStatus",
        "courseScopes",
        "provenanceArtifact",
        "provenanceAuthenticity",
        "provenanceCurrentness",
      ])
        assert.equal(cond(report, name).status, "verified", name);
      // What this fixture cannot give a production preflight stays unverified.
      for (const name of [
        "goldApproval",
        "targetEquivalence",
        "corpusProvenance",
        "admissionReadiness",
      ])
        assert.equal(cond(report, name).status, "unverified", name);
      assert.equal(cond(report, "executionPath").status, "blocked");
      assert.equal(report.preflight.readiness.qualityExecutionReady, false);
      assert.equal(report.executionAuthorized, false);
      assert.equal(report.generationRequests, 0);
      assert.equal(report.requests.other, 0);
      // From the post-indexing baseline: only Auth bookkeeping may differ.
      const after = await chain.telemetry();
      assert.deepEqual(after, baseline.telemetry);
      const tables = await chain.tableState();
      const changed = Object.keys(tables).filter(
        (n) => JSON.stringify(tables[n]) !== JSON.stringify(baseline.tables[n]),
      );
      for (const name of changed)
        assert.ok(["pilot_sessions", "pilot_auth_limits"].includes(name), name);
      // Nothing identifying leaves through stdout or any retained file.
      let text = out;
      for (const file of await readdir(join(work, output)))
        text += await readFile(join(work, output, file), "utf8");
      for (const secret of [
        chain.httpTarget("owner").credentials.password,
        databaseEndpoint,
        "maintenance-read-key-synthetic",
        "examate_session",
      ])
        assert.equal(text.includes(secret), false, secret);
      assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(out), false);
      baseline.tables = tables;
    },
  );

  await t.test(
    "preflight: a viewer reads; a manager of another workspace cannot see these documents",
    async () => {
      assert.equal(
        cond((await preflight("viewer")).report, "courseScopes").status,
        "verified",
      );
      const foreignRun = await preflight("foreign");
      assert.equal(foreignRun.exit, 3);
      assert.equal(cond(foreignRun.report, "documentScope").status, "failed");
      assert.equal(foreignRun.report.generationRequests, 0);
    },
  );

  await t.test(
    "--execute is refused before credentials, network or generation",
    async () => {
      await writeFile(join(work, "mapping.json"), JSON.stringify(mapping()));
      const target = chain.httpTarget("owner");
      const guard = globalThis.fetch;
      let fetched = 0;
      globalThis.fetch = (url, init) => {
        fetched++;
        return guard(url, init);
      };
      let exit;
      try {
        exit = await runQualityHttpEvaluation(
          [
            "--http-evaluation",
            "--quality-suite",
            SUITE,
            "--mapping",
            "mapping.json",
            "--base-url",
            target.baseUrl,
            "--origin",
            target.origin,
            "--output",
            "artifacts/refused",
            "--execute",
            "--credentials-stdin",
            "--approve-plan",
            "a".repeat(64),
          ],
          {
            root: work,
            credentials: async () => {
              throw new Error("credentials forbidden");
            },
            write: () => {},
          },
        );
      } finally {
        globalThis.fetch = guard;
      }
      assert.equal(exit, 3);
      assert.equal(fetched, 0);
      const report = JSON.parse(
        await readFile(join(work, "artifacts/refused/report.json"), "utf8"),
      );
      assert.equal(report.generationRequests, 0);
      assert.equal(report.executionAuthorized, false);
      assert.equal((await chain.telemetry()).sdk.generation, 0);
    },
  );

  // ---- failures of the chain itself -----------------------------------------
  await t.test(
    "Storage returns the wrong bytes or fails: the audit is inconsistent or inconclusive",
    async () => {
      const key = keyOf(ids.brief);
      const good = chain.storage.objects.get(key);
      chain.storage.objects.set(key, pdfOf(POLICY));
      let result = await audit();
      assert.equal(result.verdict, "INCONSISTENT");
      assert.equal(
        result.documents.find((d) => d.documentId === ids.brief).conditions
          .storageBytes.status,
        "failed",
      );
      chain.storage.objects.set(key, good);
      chain.storage.hooks.download = (requested, res) => {
        if (requested !== key) return false;
        res.writeHead(500).end();
        return true;
      };
      result = await audit();
      chain.storage.hooks.download = null;
      assert.equal(result.verdict, "INCONCLUSIVE");
      assert.equal(result.failure, "STORAGE_READ_FAILED");
      // The same failures stop the ingestion service: nothing partial is persisted.
      chain.storage.hooks.download = (requested, res) => {
        if (requested !== key) return false;
        res.writeHead(500).end();
        return true;
      };
      const before = (await chunkRows(ids.brief)).length;
      const retried = await reindex(owner, ids.brief);
      chain.storage.hooks.download = null;
      assert.equal(retried.status, 503);
      assert.equal((await docRow(ids.brief)).processing_status, "failed");
      assert.equal(
        (await chunkRows(ids.brief)).length,
        before,
        "failed processing keeps the previous index rows",
      );
      assert.equal(
        (await audit()).verdict,
        "INCONSISTENT",
        "a failed document is not consistent",
      );
      assert.equal((await reindex(owner, ids.brief)).status, 200);
      baseline.telemetry = await chain.telemetry();
      baseline.tables = await chain.tableState();
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "a document whose processing failed or never ran is not consistent; a retry through the service recovers",
    async () => {
      const extra = await (
        await owner.upload(pdfOf(POLICY), POLICY.file, coursePolicy)
      ).json();
      const alt = mapping();
      alt.scopes[1].documents[POLICY.file] = extra.id;
      // Pending: uploaded but not processed.
      let result = await audit(alt);
      assert.equal(result.verdict, "INCONSISTENT");
      assert.equal(
        result.documents.find((d) => d.documentId === extra.id).conditions
          .processingState.status,
        "failed",
      );
      // The embedding transport fails: the real service marks the document failed.
      const calls = (await chain.telemetry()).sdk.embedding;
      chain.hooks.embedding = () => {
        throw new chain.ApiError({ message: "synthetic quota", status: 429 });
      };
      const failed = await reindex(owner, extra.id);
      chain.hooks.embedding = null;
      assert.ok(
        failed.status >= 500 || failed.status === 429,
        String(failed.status),
      );
      assert.equal((await docRow(extra.id)).processing_status, "failed");
      assert.equal((await chunkRows(extra.id)).length, 0);
      assert.equal((await chain.telemetry()).sdk.embedding, calls + 1);
      result = await audit(alt);
      assert.equal(result.verdict, "INCONSISTENT");
      // Retry through the endpoint.
      assert.equal((await reindex(owner, extra.id)).status, 200);
      result = await audit(alt);
      // The retried document itself is now consistent ...
      assert.equal(
        result.documents.find((d) => d.documentId === extra.id).verdict,
        "OBSERVED_CONSISTENT",
      );
      // ... but the policy-only course now holds two documents, so neither
      // mapping describes its exact set until the extra one is removed.
      assert.equal(result.conditions.courseScopes[1].status, "failed");
      assert.equal(result.verdict, "INCONSISTENT");
      const original = await audit();
      assert.equal(original.conditions.courseScopes[1].status, "failed");
    },
  );

  // NEGATIVE-CORRUPTION-BEGIN: direct SQL below damages data on purpose.
  await t.test(
    "damaged index rows are detected; re-indexing through the service replaces them without duplicating",
    async () => {
      // Remove the extra policy-only document through the public API first.
      const extraRows = await query(
        "SELECT id FROM documents WHERE course_id=$1 AND id<>$2",
        [coursePolicy, ids.copy],
      );
      for (const row of extraRows)
        assert.equal(
          (await owner.request(`/documents/${row.id}`, undefined, "DELETE"))
            .status,
          204,
        );
      baseline.telemetry = await chain.telemetry();
      baseline.tables = await chain.tableState();
      artifact = await audit();
      assert.equal(artifact.verdict, "OBSERVED_CONSISTENT");

      const id = ids.policy;
      const expected = await expectedIndex(POLICY);
      const damage = {
        "missing chunk": () =>
          chain.admin.query(
            "DELETE FROM document_chunks WHERE document_id=$1 AND source_page=2",
            [id],
          ),
        "wrong text": () =>
          chain.admin.query(
            "UPDATE document_chunks SET content=replace(content,'200000','300000') WHERE document_id=$1",
            [id],
          ),
        "wrong page": () =>
          chain.admin.query(
            "UPDATE document_chunks SET source_page=1 WHERE document_id=$1 AND source_page=2",
            [id],
          ),
      };
      for (const [label, harm] of Object.entries(damage)) {
        await harm();
        const result = await audit();
        assert.equal(result.verdict, "INCONSISTENT", label);
        assert.equal(
          result.documents.find((d) => d.documentId === id).verdict,
          "INCONSISTENT",
          label,
        );
        const before = await chain.telemetry();
        assert.equal((await reindex(owner, id)).status, 200, label);
        const rows = await chunkRows(id);
        assert.equal(
          rows.length,
          expected.chunks.length,
          `${label}: not duplicated`,
        );
        assert.deepEqual(
          rows.map((r) => [r.chunk_index, r.source_page, r.content]),
          expected.chunks.map((c) => [c.chunkIndex, c.sourcePage, c.content]),
          label,
        );
        const after = await chain.telemetry();
        assert.equal(
          after.sdk.embedding - before.sdk.embedding,
          batches(expected.chunks.length),
          label,
        );
        assert.equal(
          (await audit()).verdict,
          "OBSERVED_CONSISTENT",
          `${label}: consistent again`,
        );
      }
      // Re-indexing yields the same index, so the earlier artifact still matches it.
      const drifted = await audit();
      const unchanged = verifyProvenanceArtifact(artifact, {
        manifestBytes,
        corpus: corpusManifest(),
        target: mapping().provenanceTarget,
        mapping: auditRequest().mapping,
        scopes: mapping().scopes,
        observation: drifted,
      });
      assert.equal(unchanged.currentness, "matches_observation");

      // Drift: a stored vector changes after the audit.
      await chain.admin.query(
        "UPDATE document_chunks SET embedding=$2::vector(768) WHERE document_id=$1 AND source_page=1",
        [ids.copy, JSON.stringify([0, 1, ...Array(766).fill(0)])],
      );
      const moved = await audit();
      assert.equal(moved.verdict, "OBSERVED_CONSISTENT");
      const stale = verifyProvenanceArtifact(artifact, {
        manifestBytes,
        corpus: corpusManifest(),
        target: mapping().provenanceTarget,
        mapping: auditRequest().mapping,
        scopes: mapping().scopes,
        observation: moved,
      });
      assert.equal(stale.status, "MISMATCH");
      assert.notEqual(stale.currentness, "matches_observation");
      assert.ok(stale.reasons.includes("INDEX_FINGERPRINT_MISMATCH"));
      // A damaged text is not even a consistent observation.
      await chain.admin.query(
        "UPDATE document_chunks SET content=content||' x' WHERE document_id=$1 AND source_page=1",
        [ids.copy],
      );
      const broken = await audit();
      assert.equal(broken.verdict, "INCONSISTENT");
      const rejected = verifyProvenanceArtifact(artifact, {
        manifestBytes,
        corpus: corpusManifest(),
        target: mapping().provenanceTarget,
        mapping: auditRequest().mapping,
        scopes: mapping().scopes,
        observation: broken,
      });
      assert.ok(rejected.reasons.includes("OBSERVATION_NOT_CONSISTENT"));
      // Restore through the service.
      assert.equal((await reindex(owner, ids.copy)).status, 200);
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "the whole chain made no generation, OCR or answer receipt",
    async () => {
      const final = await chain.telemetry();
      assert.equal(final.sdk.generation, 0);
      assert.equal(final.sdk.ocr, 0);
      assert.equal(final.receipts, 0);
      assert.equal(chain.outbound.blocked, 0);
    },
  );
});

// A supplementary source check, not the proof. It only sees this file and the
// chain fixture; SQL seeded by a helper they call is invisible to it. The proof
// that nothing but the API created documents is the runtime assertion on the
// database before upload, after upload and after processing, above.
test("source check: no document or chunk write in the chain fixture or before the negative section", async () => {
  const marker = "NEGATIVE-CORRUPTION-BEGIN";
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  const fixture = await readFile(
    fileURLToPath(
      new URL("./evaluation-ingestion-chain-fixture.mjs", import.meta.url),
    ),
    "utf8",
  );
  const writes =
    /(INSERT INTO|UPDATE|DELETE FROM)\s+(documents|document_chunks)\b/gi;
  // Guard against a vacuous scan: the pattern must match known write text.
  assert.equal("UPDATE documents SET x".match(writes)?.length, 1);
  assert.deepEqual([...fixture.matchAll(writes)], []);
  const at = source.indexOf(`// ${marker}`);
  assert.ok(at > 0);
  for (const match of source.matchAll(writes))
    assert.ok(match.index > at, "write before the marker: " + match[0]);
  // The bootstrap helper is called in its blank mode, and only in that mode.
  const calls = [...fixture.matchAll(/openDocumentsTenantFixture\(([^)]*)\)/g)];
  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /seedDocuments:\s*false/);
});

test("the shared bootstrap keeps its default sample data and has a blank mode with the same base data", async () => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const counts = async (fixture) =>
    (
      await fixture.admin.query(
        `SELECT (SELECT count(*)::int FROM documents) AS documents,
                (SELECT count(*)::int FROM document_chunks) AS chunks,
                (SELECT count(*)::int FROM workspaces) AS workspaces,
                (SELECT count(*)::int FROM workspace_memberships) AS memberships,
                (SELECT count(*)::int FROM courses) AS courses,
                (SELECT count(*)::int FROM schema_migrations) AS migrations`,
      )
    ).rows[0];
  const seeded = await openDocumentsTenantFixture();
  let withSamples;
  try {
    withSamples = await counts(seeded);
  } finally {
    await seeded.close();
  }
  const blank = await openDocumentsTenantFixture({ seedDocuments: false });
  let withoutSamples;
  try {
    withoutSamples = await counts(blank);
  } finally {
    await blank.close();
  }
  // Default behaviour is unchanged: twelve sample documents and chunks.
  assert.equal(withSamples.documents, 12);
  assert.equal(withSamples.chunks, 12);
  // Blank mode removes only those; everything else is identical.
  assert.deepEqual({ ...withSamples, documents: 0, chunks: 0 }, withoutSamples);
  assert.ok(withoutSamples.migrations > 0 && withoutSamples.courses > 0);
});
