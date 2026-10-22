import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import {
  makeLocalReport,
  verifyLocalReviewBinding,
} from "../scripts/rag-evaluation-local-lib.mjs";
import { assessLocalCase } from "../scripts/rag-evaluation-local.mjs";

test("F09-A authenticated Nest/PG17 runtime executes fixed cases with real RLS/admission/telemetry", () => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const output = `artifacts/f09a-integration-${randomUUID()}`;
  const child = spawnSync(
    process.execPath,
    [
      "apps/api/scripts/evaluate-rag.mjs",
      "--local-integration",
      "--output",
      output,
    ],
    { cwd: root, env: { ...process.env }, encoding: "utf8", timeout: 180000 },
  );
  // Raw reports, including failures, are retained in ignored artifacts for diagnosis.
  const report = JSON.parse(
    readFileSync(resolve(root, output, "report.json"), "utf8"),
  );
  assert.equal(
    child.status,
    0,
    JSON.stringify(
      report.results
        .filter(
          (r) =>
            r.assessment.status === "FAIL" || r.assessment.status === "BLOCKED",
        )
        .map((r) => ({
          caseId: r.caseId,
          ...r.assessment,
          httpStatus: r.httpStatus,
          code: r.code,
          providerCalls: r.providerCalls,
        })),
    ),
  );
  assert.equal(report.summary.requestsAttempted, 33);
  assert.equal(report.summary.counts.PASS, 33);
  assert.equal(report.summary.counts.SKIP, 2);
  assert.equal(report.summary.qualityPasses, 0);
  assert.equal(report.limits.liveRequestsExecuted, 0);
  assert.equal(report.limits.humanReviews, 0);
  assert.ok(
    report.batches.every(
      (b) => b.caseIds.length <= 10 && b.actualProviderCalls <= 20,
    ),
  );
  const pack = JSON.parse(
    readFileSync(resolve(root, output, "human-review-template.json"), "utf8"),
  );
  verifyLocalReviewBinding(
    pack,
    report,
    readFileSync(resolve(root, "docs/evaluation-cases-f09a-v2.json")),
  );
  assert.ok(pack.cases.some((c) => c.output.questions));
  assert.ok(pack.cases.some((c) => c.output.cards));
  assert.ok(pack.cases.some((c) => c.output.answer));
  assert.ok(
    pack.cases.some(
      (c) =>
        c.output.question ===
        "What is the approved fictional project codename?",
    ),
  );
  assert.ok(pack.cases.every((c) => c.reviewer === "" && c.decision === null));
  const persisted = JSON.stringify({ report, pack });
  for (const sentinel of [
    "draftToken",
    "csrfToken",
    "synthetic-only-no-live-key",
    "F09_PRIVATE_SENTINEL_NOT_REPORT_CONTENT",
    "postgresql://",
    "set-cookie",
    "signedUrl",
  ])
    assert.equal(
      persisted.includes(sentinel),
      false,
      `report must omit ${sentinel}`,
    );
  // Negative oracle at the report boundary: retain real HTTP/evidence/telemetry
  // observations and remove only the three promised outputs, never the service.
  const manifestBytes = readFileSync(
    resolve(root, "docs/evaluation-cases-f09a-v2.json"),
  );
  const definition = JSON.parse(manifestBytes);
  const affected = new Set(["rag_document", "quiz_valid", "flashcards_valid"]);
  const observations = report.results.map((row) => {
    const item = definition.cases.find((c) => c.id === row.caseId);
    if (!affected.has(item.scenario)) return row;
    const missing = { ...row, reviewOutput: undefined };
    return { ...missing, assessment: assessLocalCase(item, missing) };
  });
  const negative = makeLocalReport({
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    git: report.git,
    definition,
    manifestBytes,
    selected: definition.cases,
    results: observations,
    configuration: report.configuration,
  });
  negative.derivedFromRunId = report.runId;
  negative.testMutation =
    "Remove only required reviewOutput from three real runtime observations";
  writeFileSync(
    resolve(root, output, "negative-output-report.json"),
    JSON.stringify(negative, null, 2),
    { flag: "wx" },
  );
  assert.equal(negative.summary.counts.FAIL, 3);
  assert.equal(negative.summary.counts.PASS, 30);
  assert.equal(negative.summary.counts.SKIP, 2);
  assert.equal(negative.summary.qualityPasses, 0);
  assert.deepEqual(negative.measurements, report.measurements);
  assert.equal(negative.measurements.accounting.sdkDispatchedCalls, 37);
  assert.equal(negative.measurements.accounting.persistedCalls, 37);
  console.log(
    JSON.stringify({
      evaluationReport: output,
      mode: report.mode,
      counts: report.summary.counts,
      attempted: report.summary.requestsAttempted,
      negativeCounts: negative.summary.counts,
    }),
  );
});
