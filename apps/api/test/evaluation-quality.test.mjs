import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { testArtifacts } from "./test-artifacts.mjs";
import { corpusManifest, sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import {
  validateQualitySuite,
  planQualityBatches,
  validateBatchPlan,
  buildGoldReviewPack,
  verifyGoldReviewBinding,
  verifyPdfGold,
  parseQualityArguments,
} from "../scripts/rag-evaluation-quality.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const path = join(root, "docs/evaluation-quality-cases-v1.json");
const bytes = readFileSync(path);
const original = JSON.parse(bytes);
const fresh = () => structuredClone(original);

test("quality draft: distinct objectives, frozen corpus and explicit support matrix", () => {
  const result = validateQualitySuite(original);
  assert.equal(result.caseCount, 24);
  assert.deepEqual(result.coverage, {
    grounded: 18,
    document: 16,
    course: 6,
    intersection: 2,
    no_evidence: 6,
    vietnamese: 18,
    injection: 4,
    summary: 3,
  });
  assert.equal(result.operationCompatible.length, 14);
  assert.equal(result.unsupported.length, 10);
  assert.equal(result.executable, 0);
  assert.equal(result.executed, 0);
  assert.equal(result.humanApproved, 0);
  assert.equal(result.status, "DRAFT_REVIEW_REQUIRED");
});

const invalid = [
  ["duplicate ID", (d) => (d.cases[1].id = d.cases[0].id), "CASE_ID"],
  [
    "duplicate objective",
    (d) => (d.cases[1].objective = d.cases[0].objective),
    "OBJECTIVE",
  ],
  [
    "renamed duplicate question",
    (d) => (d.cases[1].question = d.cases[0].question),
    "OBJECTIVE",
  ],
  ["invalid scope", (d) => (d.cases[0].scope.kind = "workspace"), "SCOPE"],
  [
    "unknown scope file",
    (d) => (d.cases[0].scope.file = "foreign.pdf"),
    "SCOPE",
  ],
  ["empty course", (d) => (d.cases[10].scope.courseFiles = []), "SCOPE"],
  [
    "intersection outside course",
    (d) => (d.cases[14].scope.courseFiles = [d.cases[15].scope.file]),
    "SCOPE",
  ],
  ["missing gold", (d) => (d.cases[0].goldGroups = []), "GOLD"],
  [
    "unknown fact",
    (d) => (d.cases[0].goldGroups[0].alternatives[0].facts = ["imaginary"]),
    "GOLD",
  ],
  [
    "wrong page",
    (d) => (d.cases[0].goldGroups[0].alternatives[0].page = 2),
    "GOLD",
  ],
  [
    "wrong document",
    (d) =>
      (d.cases[0].goldGroups[0].alternatives[0].file = d.cases[3].scope.file),
    "GOLD",
  ],
  [
    "wrong revision",
    (d) =>
      (d.cases[0].goldGroups[0].alternatives[0].corpusRevision = "rag-eval-v1"),
    "GOLD",
  ],
  [
    "wrong PDF hash",
    (d) => (d.cases[0].goldGroups[0].alternatives[0].sha256 = "0".repeat(64)),
    "GOLD",
  ],
  [
    "outside scope gold",
    (d) => (d.cases[0].goldGroups = d.cases[3].goldGroups),
    "GOLD",
  ],
  [
    "empty alternatives",
    (d) => (d.cases[0].goldGroups[0].alternatives = []),
    "GOLD",
  ],
  [
    "no refusal reason",
    (d) => (d.cases[16].noEvidence.reason = " "),
    "NO_EVIDENCE",
  ],
  [
    "no refusal oracle",
    (d) => delete d.cases[16].noEvidence.oracle,
    "NO_EVIDENCE",
  ],
  [
    "refusal source mismatch",
    (d) => (d.cases[16].noEvidence.sourceFiles = ["foreign.pdf"]),
    "NO_EVIDENCE",
  ],
  [
    "missing summary coverage",
    (d) => {
      d.cases = d.cases.filter((c) => c.api.operation !== "summarize");
    },
    "COVERAGE",
  ],
  [
    "mislabelled coverage",
    (d) => d.cases[0].coverage.push("course"),
    "COVERAGE",
  ],
  [
    "unsupported advertised executable",
    (d) => (d.cases[10].transport.executableNow = true),
    "TRANSPORT",
  ],
  [
    "summary advertised supported",
    (d) => (d.cases[20].transport.operationSupported = true),
    "TRANSPORT",
  ],
  ["missing human review", (d) => delete d.cases[0].humanReview, "REVIEW"],
  [
    "self-approved case",
    (d) => (d.cases[0].humanReview.status = "approved"),
    "REVIEW",
  ],
  ["self-frozen manifest", (d) => (d.status = "APPROVED"), "REVIEW"],
  [
    "changed corpus hash",
    (d) => (d.corpusManifestSha256 = "0".repeat(64)),
    "CORPUS",
  ],
  [
    "changed corpus revision",
    (d) => (d.corpusRevision = "rag-eval-v1"),
    "CORPUS",
  ],
  [
    "unknown API operation",
    (d) => (d.cases[0].api.operation = "generate"),
    "API",
  ],
];
for (const [label, mutate, code] of invalid)
  test(`quality rejects ${label}`, () => {
    const d = fresh();
    mutate(d);
    assert.throws(() => validateQualitySuite(d), {
      code: `QUALITY_${code}_INVALID`,
    });
  });

test("proposed batches partition only supported-operation candidates; nothing executed", () => {
  const plan = planQualityBatches(original, 5);
  assert.deepEqual(
    plan.batches.map((b) => b.caseIds.length),
    [5, 5, 4],
  );
  assert.equal(plan.deferredCaseIds.length, 10);
  assert.equal(plan.dispatchAllowed, false);
  assert.equal(plan.executed, 0);
  assert.equal(plan.maxRequests, 5);
  assert.equal(plan.providerCalls, null);
  validateBatchPlan(original, plan);
});
for (const size of [0, -1, 11, 1.5, "5"])
  test(`batch cap rejects ${size}`, () => {
    assert.throws(() => planQualityBatches(original, size), {
      code: "QUALITY_BATCH_INVALID",
    });
  });
for (const [label, mutate] of [
  ["duplicate", (p) => (p.batches[1].caseIds[0] = p.batches[0].caseIds[0])],
  ["omitted", (p) => p.batches[0].caseIds.pop()],
  ["over cap", (p) => p.batches[0].caseIds.push(...p.batches[1].caseIds)],
  [
    "unsupported scheduled",
    (p) => (p.batches[0].caseIds[0] = p.deferredCaseIds[0]),
  ],
  ["missing deferred", (p) => p.deferredCaseIds.pop()],
  ["dispatch enabled", (p) => (p.dispatchAllowed = true)],
  ["fake execution", (p) => (p.executed = 1)],
])
  test(`batch rejects ${label}`, () => {
    const p = planQualityBatches(original, 5);
    mutate(p);
    assert.throws(() => validateBatchPlan(original, p), {
      code: "QUALITY_BATCH_INVALID",
    });
  });

test("gold pack binds exact manifest bytes, corpus and every pending case; no agent approval", () => {
  const pack = buildGoldReviewPack(original, bytes);
  assert.equal(pack.status, "GOLD_REVIEW_PENDING");
  assert.equal(pack.phase, "PRE_EXECUTION_GOLD_REVIEW");
  assert.equal(pack.manifestSha256, sha256(bytes));
  assert.equal(pack.cases.length, 24);
  for (const c of pack.cases) {
    assert.equal(c.sourcePages.length > 0, true);
    assert.deepEqual(
      c.reviews.map((r) => r.assignedTo),
      ["Tài", "Thắng"],
    );
    assert.ok(
      c.reviews.every(
        (r) =>
          r.reviewer === "" &&
          r.reviewedAt === null &&
          r.decision === null &&
          r.notes === "",
      ),
    );
  }
  verifyGoldReviewBinding(original, bytes, pack);
});
for (const component of [
  "manifest",
  "bytes",
  "corpus",
  "case",
  "source",
  "approval",
  "decision",
])
  test(`gold review detects changed ${component}`, () => {
    const d = fresh(),
      p = buildGoldReviewPack(d, bytes);
    let b = bytes;
    if (component === "manifest")
      d.cases[0].expected.requiredBehavior += " changed";
    if (component === "bytes") b = Buffer.concat([bytes, Buffer.from("\n")]);
    if (component === "corpus") p.corpusManifestSha256 = "0".repeat(64);
    if (component === "case") p.cases[0].question = "changed";
    if (component === "source") p.cases[0].sourcePages[0].text = "changed";
    if (component === "approval") p.status = "APPROVED";
    if (component === "decision") p.cases[0].reviews[0].decision = "approved";
    assert.throws(() => verifyGoldReviewBinding(d, b, p), {
      code: "QUALITY_REVIEW_BINDING_INVALID",
    });
  });

test("all 10 frozen facts are verified on actual extracted PDF pages/hash, not generated answers", async () => {
  const result = await verifyPdfGold(original);
  assert.equal(result.documents.length, 2);
  assert.equal(result.factCount, 10);
  assert.deepEqual(
    result.documents.map((d) => d.sha256),
    corpusManifest().documents.map((d) => d.sha256),
  );
  assert.equal(result.runtimeProvenanceAttested, false);
});

test("wrong extracted page cannot pass gold verification", async () => {
  await assert.rejects(
    verifyPdfGold(original, {
      extract: async () => [{ page: 1, text: "wrong" }],
    }),
    { code: "QUALITY_PDF_BINDING_INVALID" },
  );
});

test("offline arguments allow only output directory and finite batch size", () => {
  assert.deepEqual(
    parseQualityArguments([
      "--output",
      "artifacts/quality",
      "--batch-size",
      "5",
    ]),
    { output: "artifacts/quality", batchSize: 5 },
  );
  for (const args of [
    ["--execute"],
    ["--credentials-stdin"],
    ["--force-ready"],
    ["--output", "x", "--output", "y"],
    ["--batch-size", "1e1"],
    ["--batch-size", "11"],
  ])
    assert.throws(() => parseQualityArguments(args));
});

test("offline CLI exports a new bounded pending pack without secrets/network/ledger access", (t) => {
  const dir = testArtifacts(t),
    output = join(dir, "pack");
  const guard = join(dir, "guard.mjs");
  writeFileSync(
    guard,
    `
import fs from 'node:fs'; import fsp from 'node:fs/promises';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw new Error('FORBIDDEN_SIDE_EFFECT')};
globalThis.fetch=deny; net.connect=deny; net.createConnection=deny; http.request=deny; https.request=deny;
for (const obj of [fs,fsp]) for (const key of ['readFile','readFileSync','open','openSync']) if(obj[key]) {
 const real=obj[key]; obj[key]=function(p,...a){if(/(?:\\.env|credential|ledger|active\\.json|lock\\.\\d)/i.test(String(p)))deny(); return real.call(this,p,...a)};
}
syncBuiltinESMExports();
`,
  );
  const args = [
    "--import",
    pathToFileURL(guard).href,
    "apps/api/scripts/prepare-rag-quality.mjs",
    "--output",
    output,
  ];
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(readFileSync(join(output, "catalog.json")));
  assert.equal(report.executed, 0);
  assert.equal(report.caseCount, 24);
  assert.equal(report.provenance.mode, "offline_gold_preparation");
  assert.match(report.provenance.gitSha, /^[a-f0-9]{40}$/);
  assert.equal(typeof report.provenance.dirty, "boolean");
  assert.ok(readdirSync(output).includes("gold-review-template.json"));
  assert.equal(
    readdirSync(output).some((f) => /ledger|intent|release|lock/.test(f)),
    false,
  );
  assert.equal(
    spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    }).status,
    1,
    "never overwrite previous pack",
  );
});

test("legacy manifests and live cap remain unchanged and independently validated", async () => {
  const { validateDefinition } = await import("../scripts/evaluate-rag.mjs");
  const legacy = JSON.parse(
    readFileSync(join(root, "docs/evaluation-cases.json")),
  );
  validateDefinition(legacy);
  assert.equal(legacy.schemaVersion, 3);
  assert.equal(legacy.cases.filter((c) => c.mode === "live").length, 9);
  for (const c of legacy.cases) if (c.group === "pdf_quality") c.mode = "live";
  assert.throws(() => validateDefinition(legacy), /10 live-case quota cap/);
});

test("injection objective cannot silently drop its coverage label", () => {
  const d = fresh();
  d.cases[8].coverage = d.cases[8].coverage.filter((t) => t !== "injection");
  assert.throws(() => validateQualitySuite(d), {
    code: "QUALITY_COVERAGE_INVALID",
  });
});

test("standalone proposed batches reject a changed suite even with identical IDs", () => {
  const d = fresh(),
    plan = planQualityBatches(d, 5);
  d.cases[0].expected.requiredBehavior += " Additional required criterion.";
  assert.throws(() => validateBatchPlan(d, plan), {
    code: "QUALITY_BATCH_INVALID",
  });
});

test("legacy predecessor must reference a case that actually exists", () => {
  const d = fresh();
  d.cases[0].legacyRelation.id = "E99";
  assert.throws(() => validateQualitySuite(d), {
    code: "QUALITY_CASE_INVALID",
  });
});

// ---- revision v2: AI-proposed corrections, still unreviewed and unexecuted ----

const v2Path = join(root, "docs/evaluation-quality-cases-v2.json");
const v2Bytes = () => readFileSync(v2Path);
const CHANGED_IN_V2 = [
  "RQ04",
  "RQ05",
  "RQ06",
  "RQ08",
  "RQ09",
  "RQ10",
  "RQ11",
  "RQ12",
  "RQ13",
  "RQ14",
  "RQ16",
  "RQ21",
  "RQ22",
  "RQ24",
];

test("v2 is a new revision of the same corpus: valid, pending, history kept", () => {
  const v1 = JSON.parse(bytes);
  const v2 = JSON.parse(v2Bytes());
  const result = validateQualitySuite(v2);
  assert.equal(v2.revision, "rag-quality-20261022-v2");
  assert.equal(v2.status, "DRAFT_REVIEW_REQUIRED");
  assert.equal(v2.corpusRevision, v1.corpusRevision);
  assert.equal(v2.corpusManifestSha256, v1.corpusManifestSha256);
  assert.equal(result.caseCount, 24);
  assert.equal(result.executed, 0);
  assert.equal(result.humanApproved, 0);
  // v1 is untouched and keeps its own hash, so everything bound to it stays bound to it.
  assert.equal(
    sha256(bytes),
    "97b029588eacdabd593fbc80da0315a8aeef273cbf3e233696b1aaed5e7df7b9",
  );
  assert.notEqual(sha256(v2Bytes()), sha256(bytes));
  for (const item of v2.cases) assert.equal(item.humanReview.status, "pending");
});

test("v2 differs from v1 only in the listed cases and never in the frozen corpus bindings", () => {
  const v1 = JSON.parse(bytes);
  const v2 = JSON.parse(v2Bytes());
  assert.deepEqual(
    v2.cases.map((c) => c.id),
    v1.cases.map((c) => c.id),
  );
  const changed = v2.cases
    .filter((c, i) => JSON.stringify(c) !== JSON.stringify(v1.cases[i]))
    .map((c) => c.id);
  assert.deepEqual(changed, CHANGED_IN_V2);
  // No gold fact, page or hash changed: the corrections are in wording and scope labels only.
  for (const item of v2.cases) {
    const before = v1.cases.find((c) => c.id === item.id);
    assert.deepEqual(item.goldGroups, before.goldGroups, item.id);
    assert.equal(item.expected.answerable, before.expected.answerable, item.id);
    assert.equal(item.kind, before.kind, item.id);
  }
  // RQ23 is deliberately unchanged: a course summary has no API path and stays deferred.
  assert.deepEqual(
    v2.cases.find((c) => c.id === "RQ23"),
    v1.cases.find((c) => c.id === "RQ23"),
  );
});

test("v2 carries the corrections the review asked for", () => {
  const v2 = JSON.parse(v2Bytes());
  const get = (id) => v2.cases.find((c) => c.id === id);
  assert.match(get("RQ04").expected.requiredBehavior, /02\/10\/2026/);
  assert.doesNotMatch(
    get("RQ05").expected.requiredBehavior,
    /distinguish report from the final package/,
  );
  assert.match(get("RQ06").expected.requiredBehavior, /200\.000/);
  assert.match(
    get("RQ09").question,
    /^What is the approved fictional project codename in the security fixture\?$/,
  );
  assert.doesNotMatch(get("RQ09").question, /not commands/i);
  assert.doesNotMatch(get("RQ10").question, /PARIS/);
  assert.ok(
    get("RQ09").expected.failureCriteria.some((c) => /only PARIS/.test(c)),
  );
  assert.equal(get("RQ13").scope.kind, "document");
  assert.doesNotMatch(
    get("RQ14").expected.requiredBehavior,
    /semantic correctness/,
  );
  assert.doesNotMatch(get("RQ22").expected.requiredBehavior, /currency/);
  assert.ok(
    get("RQ24").expected.failureCriteria.some((c) => /rag-eval-v2/.test(c)),
  );
  for (const id of ["RQ11", "RQ12", "RQ16"])
    assert.match(get(id).expected.requiredBehavior, /brief|policy/i);
  // The review criteria quote the same required behaviour as the expectation.
  for (const item of v2.cases)
    assert.equal(
      item.humanReview.criteria[1],
      item.expected.requiredBehavior,
      item.id,
    );
});

test("v2 stays plannable: 23 supported, only the course summary deferred", async () => {
  const { planQualitySuite } =
    await import("../scripts/rag-evaluation-quality-plan.mjs");
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const brief = "examate-eval-project-brief.pdf";
  const policy = "examate-eval-course-policy.pdf";
  const planned = await planQualitySuite({
    manifestBytes: v2Bytes(),
    mappingInput: {
      schemaVersion: "rag-quality-mapping-v1",
      corpusRevision: "rag-eval-v2",
      documents: { [brief]: id(11), [policy]: id(12) },
      scopes: [
        { files: [brief, policy], courseId: id(21) },
        { files: [policy], courseId: id(22), documents: { [policy]: id(13) } },
      ],
      provenanceTarget: {
        kind: "postgres+supabase-storage",
        databaseEndpoint: "db-host.example.invalid:5432/quality_test",
        storageOrigin: "https://storage-origin.example.invalid",
        storageBucket: "documents",
        workspaceId: id(1),
      },
    },
    target: {
      base: new URL("http://127.0.0.1:3000/api/"),
      origin: "http://127.0.0.1:5173",
    },
    options: { batchSize: 5, timeoutMs: 45000 },
  });
  assert.equal(planned.plan.limits.supportedSelected, 23);
  assert.deepEqual(planned.plan.deferred, [
    { id: "RQ23", reason: "SUMMARY_REQUIRES_ONE_DOCUMENT" },
  ]);
  assert.equal(planned.plan.suite.revision, "rag-quality-20261022-v2");
  assert.equal(planned.plan.suite.manifestSha256, sha256(v2Bytes()));
});

test("the prepare tool selects a versioned suite explicitly and defaults to v1", () => {
  assert.equal(parseQualityArguments([]).suite, undefined);
  assert.equal(
    parseQualityArguments(["--suite", "docs/evaluation-quality-cases-v2.json"])
      .suite,
    "docs/evaluation-quality-cases-v2.json",
  );
  for (const bad of [
    "docs/evaluation-cases.json",
    "docs/evaluation-quality-cases-v0.json",
    "../docs/evaluation-quality-cases-v2.json",
    "artifacts/evaluation-quality-cases-v2.json",
    "/etc/passwd",
    "docs/evaluation-quality-cases-v2.json.bak",
  ])
    assert.throws(
      () => parseQualityArguments(["--suite", bad]),
      undefined,
      bad,
    );
  assert.throws(() =>
    parseQualityArguments([
      "--suite",
      "docs/evaluation-quality-cases-v1.json",
      "--suite",
      "docs/evaluation-quality-cases-v2.json",
    ]),
  );
});

test("the prepare tool exports a pending pack bound to v2 when asked", (t) => {
  const dir = testArtifacts(t);
  const output = join(dir, "pack-v2");
  const child = spawnSync(
    process.execPath,
    [
      "apps/api/scripts/prepare-rag-quality.mjs",
      "--suite",
      "docs/evaluation-quality-cases-v2.json",
      "--output",
      output,
    ],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const catalog = JSON.parse(readFileSync(join(output, "catalog.json")));
  assert.equal(catalog.provenance.revision, "rag-quality-20261022-v2");
  assert.equal(catalog.provenance.manifestSha256, sha256(v2Bytes()));
  assert.equal(catalog.executed, 0);
  const template = JSON.parse(
    readFileSync(join(output, "gold-review-template.json")),
  );
  assert.equal(template.status, "GOLD_REVIEW_PENDING");
  assert.equal(template.manifestSha256, sha256(v2Bytes()));
  for (const item of template.cases)
    for (const review of item.reviews) {
      assert.equal(review.reviewer, "");
      assert.equal(review.reviewedAt, null);
      assert.equal(review.decision, null);
    }
});
