import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  access,
  mkdir,
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
  canonicalJson,
  collectDatabaseObservation,
  createStorageObjectReader,
  openReadOnlySnapshot,
} from "../scripts/rag-evaluation-provenance.mjs";
import { planQualitySuite } from "../scripts/rag-evaluation-quality-plan.mjs";
import {
  BATCH_APPROVAL_SCHEMA,
  batchBinding,
  executeQualityBatch,
  ledgerKeyOf,
} from "../scripts/rag-evaluation-quality-executor.mjs";
import {
  BUCKET,
  openIngestionChain,
  syntheticVector,
} from "./evaluation-ingestion-chain-fixture.mjs";

// F09-B.2B.5 against the real stack: Nest guards, Auth/CSRF/Origin, non-owner
// NOBYPASSRLS LOGINs on PG17, the real upload/ingestion/retrieval/admission/usage/
// receipt services, and a real HTTP round trip from the executor. Only the Auth
// upstream, remote Storage and the SDK transport are synthetic, and the model is
// a stand-in that answers from the retrieved evidence. Nothing here is a live run,
// a human approval or a measure of model quality.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const SUITE = "docs/evaluation-quality-cases-v1.json";
const nativeFetch = globalThis.fetch;
const [BRIEF, POLICY] = corpusDocuments;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const pdfOf = (document) => makeEvaluationPdf(document.pages);
const KEY = randomBytes(32);
const sign = (binds) =>
  createHmac("sha256", KEY).update(canonicalJson(binds)).digest("hex");

test("F09-B.2B.5 one quality batch through the real Nest/PG17 stack", async (t) => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const manifestBytes = await readFile(join(root, SUITE));
  const work = await mkdtemp(join(tmpdir(), "quality-executor-db-"));
  const chain = await openIngestionChain();
  t.after(async () => {
    await chain.close();
    await rm(work, { recursive: true, force: true });
  });
  const { A } = chain.tenants;
  const owner = chain.actor("owner");
  const query = async (sql, params) =>
    (await chain.admin.query(sql, params)).rows;

  // ---- setup: documents made by the real upload and ingestion services ------
  const courseBoth = await chain.seedCourse(A, "exec-both");
  const coursePolicy = await chain.seedCourse(A, "exec-policy");
  const ids = {};
  for (const [name, document, course] of [
    ["brief", BRIEF, courseBoth],
    ["policy", POLICY, courseBoth],
    ["copy", POLICY, coursePolicy],
  ]) {
    const up = await owner.upload(pdfOf(document), document.file, course);
    assert.equal(up.status, 201, name);
    ids[name] = (await up.json()).id;
  }
  for (const id of Object.values(ids))
    assert.equal(
      (await owner.request(`/documents/${id}/process`, undefined, "POST"))
        .status,
      200,
    );

  const target = chain.httpTarget("owner");
  const mapping = {
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
      databaseEndpoint: chain.databaseEndpoint(),
      storageOrigin: chain.storage.origin(),
      storageBucket: BUCKET,
      workspaceId: A.id,
    },
  };
  const plan = (only, batchSize, timeoutMs = 20000) =>
    planQualitySuite({
      manifestBytes,
      mappingInput: mapping,
      target: { base: new URL(target.baseUrl), origin: target.origin },
      options: { batchSize, timeoutMs, only },
    });
  const auditRequest = {
    manifestBytes,
    corpus: corpusManifest(),
    target: mapping.provenanceTarget,
    mapping: {
      corpusRevision: mapping.corpusRevision,
      documents: mapping.documents,
    },
    scopes: mapping.scopes,
  };
  const snapshot = openReadOnlySnapshot(chain.admin, {
    statementTimeoutMs: 5000,
  });
  const audit = (auditId) =>
    auditCorpusProvenance(auditRequest, {
      readDatabase: () =>
        snapshot((client) => collectDatabaseObservation(client, auditRequest)),
      readStorage: createStorageObjectReader({
        origin: chain.storage.origin(),
        bucket: BUCKET,
        key: "maintenance-read-key-synthetic",
        fetchImpl: nativeFetch,
        timeoutMs: 3000,
      }),
      git: gitSnapshot,
      deadlineMs: 15000,
      ...(auditId ? { auditId } : {}),
    });
  const artifact = await audit();
  const observation = await audit("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(artifact.verdict, "OBSERVED_CONSISTENT");

  // The synthetic model answers from the evidence it was given, and a question
  // reaches its gold chunks because its query vector is the (normalised) sum of
  // their own vectors. A question with no gold embeds like any text and matches nothing.
  const suiteCases = JSON.parse(manifestBytes).cases;
  const docOf = (suiteCase, file) =>
    suiteCase.scope.kind === "document" ||
    suiteCase.scope.kind === "intersection"
      ? file === suiteCase.scope.file
        ? mapping.documents[file]
        : null
      : mapping.documents[file];
  const chunkTexts = new Map();
  for (const id of [ids.brief, ids.policy])
    for (const row of await query(
      "SELECT source_page, content FROM document_chunks WHERE document_id=$1",
      [id],
    ))
      chunkTexts.set(`${id}:${row.source_page}`, row.content);
  chain.hooks.queryVector = (text) => {
    const item = suiteCases.find((c) => c.question === text);
    if (!item || !item.goldGroups.length) return null;
    const sum = Array(768).fill(0);
    for (const group of item.goldGroups)
      for (const alt of group.alternatives) {
        const documentId = mapping.documents[alt.file];
        for (const [i, v] of syntheticVector(
          chunkTexts.get(`${documentId}:${alt.page}`),
        ).entries())
          sum[i] += v;
      }
    const norm = Math.hypot(...sum);
    return sum.map((v) => v / norm);
  };
  chain.hooks.generation = async (_request, { evidence }) => ({
    text: JSON.stringify({
      answerable: true,
      answer: `Synthetic answer. ${evidence.map((e) => `[${e.sourceId}]`).join(" ")}`,
      citationIds: evidence.map((e) => e.sourceId),
    }),
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
    modelVersion: "gemini-2.5-flash",
  });

  const authorize = async ({ approval, binding }) =>
    approval.evidence?.signature === sign(binding)
      ? { goldReview: { status: "verified" }, batch: { status: "verified" } }
      : { goldReview: { status: "failed" }, batch: { status: "failed" } };
  const approvalFor = (planned, batchId) => {
    const binds = batchBinding(planned, batchId);
    return {
      schema: BATCH_APPROVAL_SCHEMA,
      binds,
      evidence: { signature: sign(binds) },
    };
  };
  const ledgerDir = join(work, "ledger");
  await mkdir(ledgerDir, { recursive: true });
  const inputs = (planned, batchId, extra = {}) => ({
    planned,
    batchId,
    approval: approvalFor(planned, batchId),
    authorize,
    targetEquivalence: async () => ({ status: "verified" }),
    provenance: {
      manifestBytes,
      artifactText: JSON.stringify(artifact),
      observationText: JSON.stringify(observation),
      expectedDigest: artifact.integrity.digest,
    },
    credentials: async () => target.credentials,
    ledgerDir,
    fetchImpl: (url, init) => globalThis.fetch(url, init),
    ...extra,
  });
  const states = async () => ({
    telemetry: await chain.telemetry(),
    tables: await chain.tableState(),
  });
  const changed = (a, b) =>
    Object.keys(b).filter((n) => JSON.stringify(a[n]) !== JSON.stringify(b[n]));

  // ---- the batch under test --------------------------------------------------
  const SELECTION = "RQ01,RQ02,RQ04,RQ05,RQ11,RQ16,RQ17";
  const planned = await plan(SELECTION, 5);
  assert.deepEqual(
    planned.plan.batches.map((b) => b.caseIds),
    [
      ["RQ01", "RQ02", "RQ04", "RQ05", "RQ11"],
      ["RQ16", "RQ17"],
    ],
  );

  await t.test("a refused batch costs the real server nothing", async () => {
    const before = await states();
    const refused = await executeQualityBatch({
      ...inputs(planned, "quality-batch-1"),
      approval: {
        ...approvalFor(planned, "quality-batch-1"),
        evidence: { signature: "0".repeat(64) },
      },
    });
    assert.equal(refused.status, "REFUSED");
    assert.equal(refused.refusal.reason, "APPROVAL_NOT_AUTHENTIC");
    const wrongBatch = await executeQualityBatch({
      ...inputs(planned, "quality-batch-1"),
      approval: approvalFor(planned, "quality-batch-2"),
    });
    assert.equal(wrongBatch.refusal.reason, "APPROVAL_BINDING_MISMATCH");
    const other = await plan("RQ01,RQ02,RQ04,RQ05", 5);
    const stale = await executeQualityBatch({
      ...inputs(planned, "quality-batch-1"),
      planned: other,
    });
    assert.equal(stale.refusal.reason, "APPROVAL_BINDING_MISMATCH");
    const after = await states();
    assert.deepEqual(after.telemetry, before.telemetry);
    assert.deepEqual(changed(before.tables, after.tables), []);
    await assert.rejects(
      access(
        join(ledgerDir, ledgerKeyOf(batchBinding(planned, "quality-batch-1"))),
      ),
    );
  });

  let first;
  let beforeRun;
  await t.test(
    "positive control: batch 1 is sent over HTTP to the real stack, once, in order",
    async () => {
      beforeRun = await states();
      first = await executeQualityBatch(inputs(planned, "quality-batch-1"));
      assert.equal(
        first.status,
        "COMPLETED",
        JSON.stringify(first.refusal ?? first.summary),
      );
      assert.deepEqual(
        first.results.map((r) => r.caseId),
        ["RQ01", "RQ02", "RQ04", "RQ05", "RQ11"],
      );
      for (const result of first.results) {
        assert.equal(result.attempted, true);
        assert.equal(result.response.httpStatus, 200, result.caseId);
        assert.equal(result.response.answerable, true, result.caseId);
        assert.ok(result.response.citations.length > 0, result.caseId);
        assert.notEqual(
          result.assessment.status,
          "PASS",
          "no semantic pass without a human review",
        );
        assert.equal(result.assessment.answer.semanticReview, "pending");
        assert.equal(result.response.usage, "unobserved");
      }
      // Citations stay inside the case's own scope and on gold pages.
      for (const result of first.results)
        assert.ok(
          result.assessment.answer.checks
            .filter((c) => /^citation_(scope|gold_page)/.test(c.name))
            .every((c) => c.passed),
          result.caseId,
        );
      assert.equal(first.generationRequests, 5);
      assert.equal(first.nextBatch, "not_started");
      assert.equal(first.requests.other, 0);
    },
  );

  await t.test(
    "the request counters, SDK calls, persisted usage and receipts agree",
    async () => {
      const afterRun = await states();
      const delta = (key) => afterRun.telemetry[key] - beforeRun.telemetry[key];
      const answered = first.results.filter(
        (r) => r.response.answerable === true,
      ).length;
      const embeddingCalls =
        afterRun.telemetry.sdk.embedding - beforeRun.telemetry.sdk.embedding;
      const generationCalls =
        afterRun.telemetry.sdk.generation - beforeRun.telemetry.sdk.generation;
      // One query embedding per request, one generation per request that had evidence.
      assert.equal(embeddingCalls, 5);
      assert.equal(generationCalls, answered);
      assert.equal(
        generationCalls,
        first.generationRequests,
        "every request here reached the model",
      );
      // The services recorded the same calls and one operation per request.
      assert.equal(delta("providerCalls"), embeddingCalls + generationCalls);
      assert.equal(delta("operations"), 5);
      assert.equal(delta("documentIndexOperations"), 0);
      // A receipt exists exactly for the responses that announced one.
      const announced = first.results.filter(
        (r) => r.response.receiptPresent,
      ).length;
      assert.equal(delta("receipts"), announced);
      assert.ok(announced > 0);
      // Documents, chunks and base data are untouched; only usage, receipts and Auth bookkeeping moved.
      const moved = changed(beforeRun.tables, afterRun.tables);
      for (const name of moved)
        assert.ok(
          ["pilot_sessions", "pilot_auth_limits"].includes(name) ||
            /^ai_usage_|^ai_admission_|^assistant_/.test(name),
          `unexpected change in ${name}`,
        );
      for (const name of [
        "documents",
        "document_chunks",
        "courses",
        "workspaces",
        "workspace_memberships",
      ])
        assert.ok(!moved.includes(name), name);
      assert.equal(afterRun.telemetry.sdk.ocr, 0);
    },
  );

  await t.test(
    "the ledger holds the intent and outcome; a second run and the next batch stay untouched",
    async () => {
      const key = ledgerKeyOf(batchBinding(planned, "quality-batch-1"));
      const files = await readdir(join(ledgerDir, key));
      assert.ok(files.some((f) => /\.intent\.json$/.test(f)));
      assert.ok(files.some((f) => /\.outcome\.json$/.test(f)));
      const before = await states();
      const again = await executeQualityBatch(
        inputs(planned, "quality-batch-1"),
      );
      assert.equal(again.status, "REFUSED");
      assert.equal(
        again.refusal.reason,
        "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
      );
      assert.deepEqual((await states()).telemetry, before.telemetry);
      // Batch 2 was never approved or reserved, so it has no ledger and no effect.
      await assert.rejects(
        access(
          join(
            ledgerDir,
            ledgerKeyOf(batchBinding(planned, "quality-batch-2")),
          ),
        ),
      );
      assert.equal(
        first.results.some((r) => ["RQ16", "RQ17"].includes(r.caseId)),
        false,
      );
    },
  );

  await t.test("two runs racing for one batch dispatch it once", async () => {
    const race = await plan("RQ01,RQ04", 2);
    const before = await states();
    const runs = await Promise.all([
      executeQualityBatch(inputs(race, "quality-batch-1")),
      executeQualityBatch(inputs(race, "quality-batch-1")),
    ]);
    const done = runs.filter((r) => r.status === "COMPLETED");
    const refused = runs.filter((r) => r.status === "REFUSED");
    assert.equal(done.length, 1);
    assert.equal(refused.length, 1);
    assert.match(refused[0].refusal.reason, /PLAN_(RESERVED|ALREADY_EXECUTED)/);
    const after = await states();
    assert.equal(
      after.telemetry.sdk.embedding - before.telemetry.sdk.embedding,
      2,
    );
    assert.equal(done[0].generationRequests + refused[0].generationRequests, 2);
  });

  await t.test(
    "a provider outage ends the batch: the failing case is reported, the rest are not attempted",
    async () => {
      const outage = await plan("RQ01,RQ02,RQ04", 3, 20000);
      // The synthetic model hangs; the service's own deadline answers 504 and the batch must stop.
      chain.hooks.generation = (request) =>
        new Promise((_resolve, reject) =>
          request.config.abortSignal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      const before = await states();
      const report = await executeQualityBatch(
        inputs(outage, "quality-batch-1"),
      );
      assert.equal(report.status, "STOPPED");
      assert.equal(report.results[0].attempted, true);
      assert.equal(report.results[0].failureKind, "access_or_quota");
      assert.deepEqual(
        report.results.slice(1).map((r) => r.assessment.status),
        ["NOT_ATTEMPTED", "NOT_ATTEMPTED"],
      );
      assert.equal(report.generationRequests, 1);
      assert.equal(
        (await states()).telemetry.sdk.embedding -
          before.telemetry.sdk.embedding,
        1,
      );
      // The outage is not retried by a later run either.
      const again = await executeQualityBatch(
        inputs(outage, "quality-batch-1"),
      );
      assert.equal(again.status, "REFUSED");
      assert.equal(report.results[0].assessment.status === "PASS", false);
    },
  );

  await t.test("the report keeps no secret and no seeded answer", async () => {
    const text = JSON.stringify(first);
    for (const secret of [
      target.credentials.password,
      target.credentials.email,
      "examate_session",
      "maintenance-read-key-synthetic",
      chain.databaseEndpoint(),
    ])
      assert.equal(text.includes(secret), false, secret);
    // Every answer text in the report was produced by the stack for that request.
    for (const result of first.results)
      assert.match(result.response.answer, /^Synthetic answer\./);
  });
});
