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
