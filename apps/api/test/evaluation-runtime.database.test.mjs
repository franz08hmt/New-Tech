import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { verifyLocalReviewBinding } from "../scripts/rag-evaluation-local-lib.mjs";

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
  console.log(
    JSON.stringify({
      evaluationReport: output,
      mode: report.mode,
      counts: report.summary.counts,
      attempted: report.summary.requestsAttempted,
    }),
  );
});
