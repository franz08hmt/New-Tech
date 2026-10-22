import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { corpusManifest, sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import {
  QualityPlanError,
  SUITE_PATH,
  loadQualitySuite,
  parseQualityMapping,
  planQualitySuite,
  summarizePlan,
  validateQualityPlan,
} from "../scripts/rag-evaluation-quality-plan.mjs";
import { canonicalJson } from "../scripts/rag-evaluation-provenance.mjs";

// F09-B.2B.2 planner. Pure: no file, network, credential or ledger access.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const manifestBytes = readFileSync(
  join(root, "docs/evaluation-quality-cases-v1.json"),
);
const BRIEF = "examate-eval-project-brief.pdf";
const POLICY = "examate-eval-course-policy.pdf";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DOC = { [BRIEF]: id(11), [POLICY]: id(12) };
const POLICY_COPY = id(13);
const COURSE_BOTH = id(21);
const COURSE_POLICY = id(22);
const WORKSPACE = id(1);

const mappingInput = () => ({
  schemaVersion: "rag-quality-mapping-v1",
  corpusRevision: "rag-eval-v2",
  documents: { ...DOC },
  scopes: [
    { files: [BRIEF, POLICY], courseId: COURSE_BOTH },
    {
      files: [POLICY],
      courseId: COURSE_POLICY,
      documents: { [POLICY]: POLICY_COPY },
    },
  ],
  provenanceTarget: {
    kind: "postgres+supabase-storage",
    databaseEndpoint: "db-host.example.invalid:5432/quality_test",
    storageOrigin: "https://storage-origin.example.invalid",
    storageBucket: "documents",
    workspaceId: WORKSPACE,
  },
});
const target = (port = 3000) => ({
  base: new URL(`http://127.0.0.1:${port}/api/`),
  origin: "http://127.0.0.1:5173",
});
const plan = (extra = {}) =>
  planQualitySuite({
    manifestBytes,
    mappingInput: mappingInput(),
    target: target(),
    options: { batchSize: 5, timeoutMs: 45000, ...extra },
  });
const caseOf = (result, caseId) =>
  result.plan.cases.find((item) => item.id === caseId);
const code = (promise) =>
  promise.then(
    () => null,
    (error) => error.code ?? error.message,
  );

test("suite loader: exact bytes, schema, corpus binding and versioned path", () => {
  const suite = loadQualitySuite(manifestBytes);
  assert.equal(suite.manifestSha256, sha256(manifestBytes));
  assert.equal(
    suite.manifestSha256,
    "97b029588eacdabd593fbc80da0315a8aeef273cbf3e233696b1aaed5e7df7b9",
  );
  assert.equal(suite.definition.revision, "rag-quality-20261022-v1");
  assert.equal(suite.definition.cases.length, 24);
  assert.ok(SUITE_PATH.test("docs/evaluation-quality-cases-v1.json"));
  for (const bad of [
    "docs/evaluation-cases.json",
    "docs/evaluation-quality-cases-v0.json",
    "docs/evaluation-quality-cases-v1.json.bak",
    "../docs/evaluation-quality-cases-v1.json",
    "artifacts/evaluation-quality-cases-v1.json",
  ])
    assert.equal(SUITE_PATH.test(bad), false, bad);
});

test("suite loader rejects wrong hash, revision, schema and broken case sets", () => {
  const original = JSON.parse(manifestBytes);
  const mutate = (change) => {
    const copy = structuredClone(original);
    change(copy);
    return Buffer.from(JSON.stringify(copy));
  };
  const rejects = (bytes, label) =>
    assert.throws(
      () => loadQualitySuite(bytes),
      { code: "QUALITY_SUITE_INVALID" },
      label,
    );
  rejects(
    mutate((m) => (m.corpusManifestSha256 = "0".repeat(64))),
    "corpus hash",
  );
  rejects(
    mutate((m) => (m.revision = "rag-quality-v1")),
    "revision shape",
  );
  rejects(
    mutate((m) => (m.schemaVersion = "rag-quality-suite-v2")),
    "schema",
  );
  rejects(
    mutate((m) => (m.corpusRevision = "rag-eval-v1")),
    "corpus revision",
  );
  rejects(
    mutate((m) => (m.status = "FROZEN")),
    "status",
  );
  rejects(
    mutate((m) => (m.cases[1].id = m.cases[0].id)),
    "duplicate id",
  );
  rejects(
    mutate((m) => (m.cases[0].extra = true)),
    "unknown field",
  );
  rejects(Buffer.from("{not json"), "not json");
  rejects(Buffer.alloc(0), "empty");
});

test("a manifest with a case removed is another suite: new hash, and the missing id cannot be selected", async () => {
  const smaller = JSON.parse(manifestBytes);
  smaller.cases = smaller.cases.filter((c) => c.id !== "RQ05");
  const bytes = Buffer.from(JSON.stringify(smaller));
  const suite = loadQualitySuite(bytes);
  assert.notEqual(suite.manifestSha256, sha256(manifestBytes));
  assert.equal(suite.definition.cases.length, 23);
  assert.equal(
    await code(
      planQualitySuite({
        manifestBytes: bytes,
        mappingInput: mappingInput(),
        target: target(),
        options: { batchSize: 5, timeoutMs: 45000, only: "RQ05" },
      }),
    ),
    "QUALITY_SELECTION_INVALID",
  );
});

test("whitespace-only change of the manifest bytes changes the bound hash", () => {
  const reformatted = Buffer.from(
    JSON.stringify(JSON.parse(manifestBytes), null, 4),
  );
  const suite = loadQualitySuite(reformatted);
  assert.notEqual(suite.manifestSha256, sha256(manifestBytes));
});

test("mapping: required per course file set, exact keys, valid ids", () => {
  const suite = loadQualitySuite(manifestBytes);
  const reject = (change, label) => {
    const input = mappingInput();
    change(input);
    assert.throws(
      () => parseQualityMapping(input, suite),
      { code: "QUALITY_MAPPING_INVALID" },
      label,
    );
  };
  assert.ok(parseQualityMapping(mappingInput(), suite));
  reject((m) => (m.schemaVersion = "rag-quality-mapping-v2"), "schema");
  reject((m) => (m.corpusRevision = "rag-eval-v1"), "revision");
  reject((m) => (m.extra = 1), "unknown key");
  reject((m) => delete m.provenanceTarget, "target missing");
  reject((m) => m.scopes.pop(), "policy-only course missing");
  reject((m) => m.scopes.shift(), "two-document course missing");
  reject(
    (m) => m.scopes.push({ files: [BRIEF], courseId: COURSE_BOTH }),
    "extra scope",
  );
  reject((m) => (m.scopes[1].courseId = "nope"), "bad course id");
  reject(
    (m) => (m.documents[POLICY] = m.documents[BRIEF]),
    "duplicate document id",
  );
  reject(
    (m) => (m.scopes[1].documents[POLICY] = m.documents[BRIEF]),
    "copy reuses id",
  );
  reject((m) => delete m.documents[POLICY], "file missing");
  reject((m) => (m.documents["other.pdf"] = id(99)), "unknown file");
  reject((m) => (m.scopes[1].files = [BRIEF]), "scope not in manifest");
  reject((m) => (m.provenanceTarget.workspaceId = "x"), "workspace id");
});

test("a policy copy with the same name but another id is a valid, separate mapping", async () => {
  const result = await plan();
  const ids = result.plan.mapping.scopes.flatMap((scope) =>
    Object.values(scope.documents),
  );
  assert.ok(ids.includes(POLICY_COPY));
  assert.ok(ids.includes(DOC[POLICY]));
  assert.notEqual(POLICY_COPY, DOC[POLICY]);
});

test("support matrix and request shapes follow what the API really accepts", async () => {
  const result = await plan();
  const supported = result.plan.cases.filter((c) => c.support === "supported");
  const unsupported = result.plan.cases.filter(
    (c) => c.support === "unsupported",
  );
  assert.equal(result.plan.cases.length, 24);
  assert.equal(supported.length, 23);
  assert.deepEqual(
    unsupported.map((c) => [c.id, c.reason]),
    [["RQ23", "SUMMARY_REQUIRES_ONE_DOCUMENT"]],
  );
  assert.equal(caseOf(result, "RQ23").request, undefined);
  assert.equal(caseOf(result, "RQ23").operation, "summarize");
  assert.equal(caseOf(result, "RQ23").scopeKind, "course");
  const body = (caseId) => caseOf(result, caseId).request.body;
  const shape = (caseId) => {
    const { message, pageContext, ...scope } = body(caseId);
    assert.equal(typeof message, "string");
    assert.deepEqual(pageContext, {
      pageId: "evaluation",
      pageName: "RAG evaluation",
    });
    return scope;
  };
  assert.deepEqual(shape("RQ01"), {
    mode: "documents",
    operation: "question",
    documentId: DOC[BRIEF],
  });
  assert.deepEqual(shape("RQ04"), {
    mode: "documents",
    operation: "question",
    documentId: DOC[POLICY],
  });
  assert.deepEqual(shape("RQ11"), {
    mode: "documents",
    operation: "question",
    courseId: COURSE_BOTH,
  });
  assert.deepEqual(shape("RQ12"), {
    mode: "documents",
    operation: "question",
    courseId: COURSE_BOTH,
  });
  assert.deepEqual(shape("RQ15"), {
    mode: "documents",
    operation: "question",
    documentId: DOC[BRIEF],
    courseId: COURSE_BOTH,
  });
  assert.deepEqual(shape("RQ16"), {
    mode: "documents",
    operation: "question",
    documentId: DOC[POLICY],
    courseId: COURSE_BOTH,
  });
  assert.deepEqual(shape("RQ21"), {
    mode: "documents",
    operation: "summarize",
    documentId: DOC[BRIEF],
  });
  assert.deepEqual(shape("RQ22"), {
    mode: "documents",
    operation: "summarize",
    documentId: DOC[POLICY],
  });
  // The policy-only course is a different course with its own copy; the copy is
  // never a document-scope target and the primary policy never joins that course.
  assert.deepEqual(shape("RQ24"), {
    mode: "documents",
    operation: "question",
    courseId: COURSE_POLICY,
  });
  for (const item of supported) {
    assert.equal(item.request.method, "POST");
    assert.equal(item.request.path, "assistant/chat");
    assert.match(item.requestSha256, /^[0-9a-f]{64}$/);
    assert.equal(item.shapeValidated, true, item.id);
    // Summaries stay summaries; nothing is relabelled to look supported.
    const manifestItem = loadQualitySuite(manifestBytes).definition.cases.find(
      (c) => c.id === item.id,
    );
    assert.equal(item.request.body.operation, manifestItem.api.operation);
    assert.equal(item.request.body.message, manifestItem.question);
  }
});

test("a request that violates the assistant contract is not accepted as a shape", async () => {
  const { requestShapeProblems } =
    await import("../scripts/rag-evaluation-quality-plan.mjs");
  const ok = {
    message: "q",
    mode: "documents",
    operation: "question",
    documentId: DOC[BRIEF],
  };
  assert.deepEqual(await requestShapeProblems(ok), []);
  for (const [label, body] of [
    ["no scope", { ...ok, documentId: undefined }],
    ["bad uuid", { ...ok, documentId: "x" }],
    ["unknown mode", { ...ok, mode: "debug" }],
    ["unknown operation", { ...ok, operation: "delete" }],
    [
      "summarize without document",
      {
        message: "q",
        mode: "documents",
        operation: "summarize",
        courseId: COURSE_BOTH,
      },
    ],
    ["general with document", { ...ok, mode: "general" }],
    ["empty message", { ...ok, message: "" }],
    ["too long", { ...ok, message: "x".repeat(4001) }],
  ])
    assert.notDeepEqual(await requestShapeProblems(body), [], label);
});

test("selection is deterministic, validated and keeps unsupported cases visible", async () => {
  const a = await plan({ only: "RQ05,RQ01" });
  const b = await plan({ only: "RQ01,RQ05" });
  assert.deepEqual(a.plan.selection.caseIds, ["RQ01", "RQ05"]);
  assert.equal(a.planSha256, b.planSha256);
  assert.notEqual(a.planSha256, (await plan()).planSha256);
  for (const only of ["RQ01,RQ01", "RQ99", "E01", "RQ1", "", "RQ01,"])
    assert.equal(await code(plan({ only })), "QUALITY_SELECTION_INVALID", only);
  const deferred = await plan({ only: "RQ23,RQ01" });
  assert.deepEqual(deferred.plan.deferred, [
    { id: "RQ23", reason: "SUMMARY_REQUIRES_ONE_DOCUMENT" },
  ]);
  assert.deepEqual(
    deferred.plan.batches.map((b) => b.caseIds),
    [["RQ01"]],
  );
});

test("batches: dataset size is not the per-batch cap; no case is lost or repeated", async () => {
  const five = await plan({ batchSize: 5 });
  assert.deepEqual(
    five.plan.batches.map((b) => b.caseIds.length),
    [5, 5, 5, 5, 3],
  );
  assert.equal(five.plan.limits.datasetSize, 24);
  assert.equal(five.plan.limits.maxRequestsPerBatch, 5);
  const ten = await plan({ batchSize: 10 });
  assert.deepEqual(
    ten.plan.batches.map((b) => b.caseIds.length),
    [10, 10, 3],
  );
  for (const result of [five, ten]) {
    const flat = result.plan.batches.flatMap((b) => b.caseIds);
    assert.equal(new Set(flat).size, flat.length);
    assert.deepEqual(
      [...flat, ...result.plan.deferred.map((d) => d.id)].sort(),
      result.plan.selection.caseIds.slice().sort(),
    );
    for (const batch of result.plan.batches) {
      assert.ok(batch.caseIds.length <= result.plan.limits.maxRequestsPerBatch);
      assert.match(batch.batchSha256, /^[0-9a-f]{64}$/);
    }
    validateQualityPlan(result.plan);
  }
  assert.notEqual(five.planSha256, ten.planSha256);
  for (const batchSize of [0, 11, 2.5, -1, "5", NaN])
    assert.equal(
      await code(plan({ batchSize })),
      "QUALITY_BATCH_INVALID",
      String(batchSize),
    );
  assert.equal(five.plan.approvals.batchApproval, "none");
});

test("plan validation catches lost, repeated, oversized and misplaced cases", async () => {
  const { plan: good } = await plan();
  validateQualityPlan(good);
  const reject = (change, label) => {
    const copy = structuredClone(good);
    change(copy);
    assert.throws(
      () => validateQualityPlan(copy),
      { code: "QUALITY_PLAN_INVALID" },
      label,
    );
  };
  reject((p) => p.batches[0].caseIds.pop(), "case lost");
  reject(
    (p) => p.batches[1].caseIds.push(p.batches[0].caseIds[0]),
    "case repeated",
  );
  reject((p) => p.batches[0].caseIds.push("RQ23"), "unsupported in a batch");
  reject((p) => (p.limits.maxRequestsPerBatch = 2), "batch over cap");
  reject((p) => (p.deferred = []), "unsupported dropped");
  reject(
    (p) => p.deferred.push({ id: "RQ01", reason: "X" }),
    "supported deferred",
  );
  reject((p) => (p.execution.generationRequests = 1), "generation count");
  reject((p) => (p.approvals.executionAuthorized = true), "authorization");
  reject((p) => (p.approvals.goldReview = "GOLD_REVIEW_APPROVED"), "gold");
  reject((p) => p.batches.reverse(), "batch order");
});

test("the plan hash covers every meaningful input", async () => {
  const base = (await plan()).planSha256;
  assert.equal((await plan()).planSha256, base);
  const variants = {
    manifest: () =>
      planQualitySuite({
        manifestBytes: Buffer.from(
          JSON.stringify(JSON.parse(manifestBytes), null, 1),
        ),
        mappingInput: mappingInput(),
        target: target(),
        options: { batchSize: 5, timeoutMs: 45000 },
      }),
    document: () => with_((m) => (m.documents[BRIEF] = id(77))),
    courseId: () => with_((m) => (m.scopes[0].courseId = id(78))),
    policyCopy: () => with_((m) => (m.scopes[1].documents[POLICY] = id(79))),
    workspace: () => with_((m) => (m.provenanceTarget.workspaceId = id(80))),
    endpoint: () =>
      with_(
        (m) =>
          (m.provenanceTarget.databaseEndpoint =
            "other.invalid:5432/other_test"),
      ),
    storageOrigin: () =>
      with_(
        (m) => (m.provenanceTarget.storageOrigin = "https://other.invalid"),
      ),
    bucket: () => with_((m) => (m.provenanceTarget.storageBucket = "other")),
    port: () =>
      planQualitySuite({
        manifestBytes,
        mappingInput: mappingInput(),
        target: target(3999),
        options: { batchSize: 5, timeoutMs: 45000 },
      }),
    origin: () =>
      planQualitySuite({
        manifestBytes,
        mappingInput: mappingInput(),
        target: { ...target(), origin: "http://localhost:5173" },
        options: { batchSize: 5, timeoutMs: 45000 },
      }),
    timeout: () => plan({ timeoutMs: 30000 }),
    batchSize: () => plan({ batchSize: 4 }),
    selection: () => plan({ only: "RQ01,RQ02" }),
  };
  function with_(change) {
    const input = mappingInput();
    change(input);
    return planQualitySuite({
      manifestBytes,
      mappingInput: input,
      target: target(),
      options: { batchSize: 5, timeoutMs: 45000 },
    });
  }
  const seen = new Set([base]);
  for (const [name, make] of Object.entries(variants)) {
    const result = await make();
    assert.ok(!seen.has(result.planSha256), name);
    seen.add(result.planSha256);
  }
  // Key order in the mapping file is not an input.
  const shuffled = mappingInput();
  shuffled.documents = { [POLICY]: DOC[POLICY], [BRIEF]: DOC[BRIEF] };
  assert.equal(
    (
      await planQualitySuite({
        manifestBytes,
        mappingInput: shuffled,
        target: target(),
        options: { batchSize: 5, timeoutMs: 45000 },
      })
    ).planSha256,
    base,
  );
});

test("the plan states that nothing ran, nothing is approved and execution is blocked", async () => {
  const { plan: p } = await plan();
  assert.equal(p.kind, "authenticated_http_quality_suite");
  assert.equal(p.execution.generationRequests, 0);
  assert.equal(p.execution.status, "BLOCKED");
  assert.equal(p.execution.reason, "QUALITY_SUITE_EXECUTION_NOT_IMPLEMENTED");
  assert.deepEqual(p.approvals, {
    goldReview: "GOLD_REVIEW_PENDING",
    batchApproval: "none",
    executionAuthorized: false,
  });
  assert.equal(p.suite.status, "DRAFT_REVIEW_REQUIRED");
  assert.equal(p.suite.manifestSha256, sha256(manifestBytes));
  assert.equal(
    p.suite.corpusManifestSha256,
    JSON.parse(manifestBytes).corpusManifestSha256,
  );
  assert.equal(
    p.suite.corpusManifestSha256,
    sha256(JSON.stringify(corpusManifest())),
  );
  assert.equal(p.contracts.planner, 1);
  assert.equal(p.contracts.provenanceProtocol, "examate.rag-corpus-provenance");
});

test("the plan keeps database and Storage endpoints out, as hashes only, and summaries print no ids", async () => {
  const result = await plan();
  const text = JSON.stringify(result.plan);
  for (const secret of [
    "db-host.example.invalid",
    "storage-origin.example.invalid",
    "quality_test",
  ])
    assert.equal(text.includes(secret), false, secret);
  assert.match(
    result.plan.provenanceTarget.databaseEndpointSha256,
    /^[0-9a-f]{64}$/,
  );
  const summary = summarizePlan(result);
  assert.ok(summary.includes(result.planSha256));
  assert.match(summary, /23 supported/);
  assert.match(summary, /1 deferred/);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(summary), false);
  assert.equal(/example\.invalid|password|cookie/i.test(summary), false);
});

test("planning is pure: it touches no network, environment, file or ledger", async () => {
  const realFetch = globalThis.fetch;
  const env = process.env;
  let touched = 0;
  globalThis.fetch = () => {
    touched++;
    throw new Error("network forbidden");
  };
  process.env = new Proxy(
    {},
    {
      get() {
        touched++;
        return undefined;
      },
    },
  );
  try {
    await plan();
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
  assert.equal(touched, 0);
  const source = readFileSync(
    fileURLToPath(
      new URL("../scripts/rag-evaluation-quality-plan.mjs", import.meta.url),
    ),
    "utf8",
  );
  const imports = [
    ...source.matchAll(/import\s+[^;]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g),
  ].map((m) => m[1] ?? m[2]);
  for (const forbidden of [
    "node:fs",
    "node:fs/promises",
    "node:net",
    "node:http",
    "node:https",
    "node:child_process",
  ])
    assert.equal(imports.includes(forbidden), false, forbidden);
  assert.equal(/process\.env|fetch\(|ledger/i.test(source), false);
});

test("a QualityPlanError message is its code only", async () => {
  const error = await plan({ only: "RQ99" }).catch((e) => e);
  assert.ok(error instanceof QualityPlanError);
  assert.equal(error.message, error.code);
});

test("plan validation also stops a forged plan whose batch checksums were recomputed", async () => {
  const { plan: good } = await plan();
  const rehashBatches = (p) => {
    for (const batch of p.batches)
      batch.batchSha256 = sha256(
        canonicalJson({
          id: batch.id,
          caseIds: batch.caseIds,
          requests: batch.caseIds.map(
            (id) => p.cases.find((c) => c.id === id).requestSha256,
          ),
        }),
      );
  };
  const reject = (change, label) => {
    const copy = structuredClone(good);
    change(copy);
    rehashBatches(copy);
    assert.throws(
      () => validateQualityPlan(copy),
      { code: "QUALITY_PLAN_INVALID" },
      label,
    );
  };
  reject((p) => p.batches[0].caseIds.pop(), "lost case");
  reject(
    (p) => p.batches[1].caseIds.push(p.batches[0].caseIds[0]),
    "repeated case",
  );
  reject((p) => {
    const [first, second] = p.batches;
    [first.caseIds[0], second.caseIds[0]] = [
      second.caseIds[0],
      first.caseIds[0],
    ];
  }, "case moved out of suite order");
  reject((p) => {
    p.limits.batchSize = 2;
    p.limits.maxRequestsPerBatch = 2;
  }, "batches larger than the declared cap");
  rehashBatches(good);
  validateQualityPlan(good);
});
