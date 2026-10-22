import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
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

  // F09-A.2/A.3 citation-contract oracle at the same report boundary: keep every
  // real HTTP, evidence, receipt and telemetry observation and change ONE named
  // field of the observed answer. The service, the other fields and the
  // measurements are never replaced.
  const scenarioOf = (row) =>
    definition.cases.find((c) => c.id === row.caseId)?.scenario;
  const grounded = new Set([
    "rag_document",
    "rag_course",
    "injection",
    "usage_zero",
    "usage_missing",
    "usage_partial",
    "privacy",
  ]);
  const rowsByKind = {
    grounded: report.results.filter(
      (row) =>
        grounded.has(scenarioOf(row)) &&
        typeof row.reviewOutput?.answer === "string",
    ),
    refusal: report.results.filter(
      (row) =>
        scenarioOf(row) === "rag_no_evidence" &&
        typeof row.reviewOutput?.answer === "string",
    ),
  };
  assert.ok(rowsByKind.grounded.length > 0, "runtime must observe answers");
  assert.equal(rowsByKind.refusal.length, 1, "one real refusal is observed");
  const firstMarker = (answer) => /\[S[1-9][0-9]*\]/.exec(answer)?.[0];
  const mutations = [
    {
      id: "F09A2-M01-remove-all-markers",
      rows: "grounded",
      field: "answer",
      expected: "FAIL",
      failedCheck: "markerPresence",
      change: (o) => {
        o.answer =
          o.answer.replace(/\[S[^\]]*\]/g, "").trim() ||
          "Synthetic unmarked answer.";
      },
    },
    {
      id: "F09A2-M02-marker-outside-returned-citations",
      rows: "grounded",
      field: "answer",
      expected: "FAIL",
      failedCheck: "markerCitationSet",
      change: (o) => {
        o.answer = o.answer.replace(/\[S[1-9][0-9]*\]/g, "[S999]");
      },
    },
    {
      id: "F09A2-M03-valid-marker-plus-malformed-marker",
      rows: "grounded",
      field: "answer",
      expected: "FAIL",
      failedCheck: "markerSyntax",
      change: (o) => {
        o.answer = `${o.answer} [S1, S999]`;
      },
    },
    {
      id: "F09A3-N01-nested-marker",
      rows: "grounded",
      field: "answer",
      expected: "FAIL",
      failedCheck: "markerSyntax",
      change: (o) => {
        o.answer = o.answer.replace(/\[(S[1-9][0-9]*)\]/, "[S[$1]");
      },
    },
    {
      id: "F09A3-R01-refusal-with-valid-marker",
      rows: "refusal",
      field: "answer",
      expected: "FAIL",
      failedCheck: "refusalMarkerFree",
      change: (o) => {
        o.answer = `${o.answer} [S1]`;
      },
    },
    {
      id: "F09A3-R02-refusal-with-malformed-marker",
      rows: "refusal",
      field: "answer",
      expected: "FAIL",
      failedCheck: "refusalMarkerFree",
      change: (o) => {
        o.answer = `${o.answer} [S1, S2]`;
      },
    },
    {
      id: "F09A3-R03-refusal-with-nested-marker",
      rows: "refusal",
      field: "answer",
      expected: "FAIL",
      failedCheck: "refusalMarkerFree",
      change: (o) => {
        o.answer = `${o.answer} [S[S1]`;
      },
    },
    {
      id: "F09A3-D01-duplicate-returned-citation-same-metadata",
      rows: "grounded",
      field: "citations",
      expected: "FAIL",
      failedCheck: "citationIdsUnique",
      change: (o) => {
        o.citations.push(structuredClone(o.citations[0]));
      },
    },
    {
      id: "F09A3-D02-duplicate-returned-id-contradictory-metadata",
      rows: "grounded",
      field: "citations",
      expected: "FAIL",
      failedCheck: "citationIdsUnique",
      change: (o) => {
        o.citations.push({
          ...o.citations[0],
          title: "other.pdf",
          page: o.citations[0].page + 1,
        });
      },
    },
    {
      id: "F09A2-P01-repeat-existing-valid-marker",
      rows: "grounded",
      field: "answer",
      expected: "PASS",
      change: (o) => {
        o.answer = `${o.answer} ${firstMarker(o.answer)}`;
      },
    },
    {
      id: "F09A2-P02-ordinary-brackets-are-not-markers",
      rows: "grounded",
      field: "answer",
      expected: "PASS",
      change: (o) => {
        o.answer = `${o.answer} (see [1] and [note])`;
      },
    },
    {
      id: "F09A3-P03-clean-refusal-with-ordinary-brackets",
      rows: "refusal",
      field: "answer",
      expected: "PASS",
      change: (o) => {
        o.answer = `${o.answer} (see [1] and [note])`;
      },
    },
  ];
  const sha = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const matrix = mutations.map((mutation) => {
    const sourceRows = rowsByKind[mutation.rows];
    const touched = new Set(sourceRows.map((row) => row.caseId));
    const results = report.results.map((row) => {
      if (!touched.has(row.caseId)) return row;
      const item = definition.cases.find((c) => c.id === row.caseId);
      const mutated = structuredClone(row);
      mutation.change(mutated.reviewOutput);
      // Only the named output field and the derived assessment may differ.
      const { reviewOutput: before, assessment: _a, ...rest } = row;
      const { reviewOutput: after, assessment: _b, ...kept } = mutated;
      assert.deepEqual(
        kept,
        rest,
        `${mutation.id} touched more than the answer`,
      );
      assert.deepEqual(
        { ...after, [mutation.field]: 0 },
        { ...before, [mutation.field]: 0 },
        `${mutation.id} touched more than ${mutation.field}`,
      );
      mutated.assessment = assessLocalCase(item, mutated);
      return mutated;
    });
    const derived = makeLocalReport({
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      git: report.git,
      definition,
      manifestBytes,
      selected: definition.cases,
      results,
      configuration: report.configuration,
    });
    const expectedFail = mutation.expected === "FAIL" ? sourceRows.length : 0;
    assert.equal(derived.summary.counts.FAIL, expectedFail, mutation.id);
    assert.equal(
      derived.summary.counts.PASS,
      report.summary.counts.PASS - expectedFail,
      mutation.id,
    );
    assert.equal(derived.summary.counts.SKIP, report.summary.counts.SKIP);
    assert.equal(derived.summary.qualityPasses, 0);
    assert.deepEqual(derived.measurements, report.measurements, mutation.id);
    assert.equal(derived.measurements.accounting.sdkDispatchedCalls, 37);
    assert.equal(derived.measurements.accounting.persistedCalls, 37);
    return {
      mutationId: mutation.id,
      expected: mutation.expected,
      sourceRunId: report.runId,
      rows: mutation.rows,
      mutatedField: `reviewOutput.${mutation.field}`,
      counts: derived.summary.counts,
      cases: sourceRows.map((row) => {
        const mutatedRow = results.find((r) => r.caseId === row.caseId);
        const failedChecks = Object.entries(mutatedRow.assessment.checks)
          .filter(([, ok]) => !ok)
          .map(([name]) => name);
        return {
          sourceCaseId: row.caseId,
          sourceFieldSha256: sha(row.reviewOutput[mutation.field]),
          mutatedFieldSha256: sha(mutatedRow.reviewOutput[mutation.field]),
          originalStatus: row.assessment.status,
          mutatedStatus: mutatedRow.assessment.status,
          failedChecks,
        };
      }),
    };
  });
  for (const [index, entry] of matrix.entries())
    for (const c of entry.cases) {
      assert.equal(c.originalStatus, "PASS", entry.mutationId);
      assert.equal(c.mutatedStatus, entry.expected, entry.mutationId);
      // A FAIL names the machine check that caught it; a PASS has none.
      if (entry.expected === "FAIL")
        assert.ok(
          c.failedChecks.includes(mutations[index].failedCheck),
          `${entry.mutationId} must fail ${mutations[index].failedCheck}`,
        );
      else assert.deepEqual(c.failedChecks, [], entry.mutationId);
    }
  writeFileSync(
    resolve(root, output, "citation-contract-mutation-matrix.json"),
    JSON.stringify(
      {
        derivedFromRunId: report.runId,
        testMutation:
          "Change one named reviewOutput field on real runtime observations",
        matrix,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      evaluationReport: output,
      mode: report.mode,
      counts: report.summary.counts,
      attempted: report.summary.requestsAttempted,
      negativeCounts: negative.summary.counts,
      citationContractMutations: matrix.map((entry) => ({
        id: entry.mutationId,
        counts: entry.counts,
      })),
    }),
  );
});
