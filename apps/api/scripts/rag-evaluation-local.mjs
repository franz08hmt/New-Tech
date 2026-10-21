import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assertTestDatabaseTarget } from "./test-database-target.mjs";
import {
  validateLocalDefinition,
  localGitSnapshot,
  makeLocalReport,
  makeLocalReviewPack,
  verifyLocalReviewBinding,
} from "./rag-evaluation-local-lib.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export function assessLocalCase(item, result) {
  const checks = {
    runtime: !result.runtimeFailure,
    providerAccounting: result.telemetryMatches !== false,
    privacy: result.privacyVerified !== false,
    httpStatus: result.httpStatus === item.expected.httpStatus,
    providerCalls: result.providerCalls === item.expected.providerCalls,
  };
  if (item.expected.code)
    checks.code =
      result.code === item.expected.code ||
      result.reasonCode === item.expected.code;
  const content = result.reviewOutput;
  if (item.scenario === "rag_no_evidence")
    checks.abstention =
      result.answerable === false && content?.citations.length === 0;
  if (content?.citations?.length)
    checks.citationScope = content.citations.every((c) =>
      result.evidence.some(
        (e) =>
          e.sourceId === c.sourceId && e.file === c.title && e.page === c.page,
      ),
    );
  if (content?.questions || content?.cards) {
    const items = content.questions ?? content.cards;
    checks.structuredOutput =
      items.length === 3 &&
      items.every(
        (q) =>
          q.sourceIds.length > 0 &&
          q.sourceIds.every((id) =>
            result.evidence.some((e) => e.sourceId === id),
          ),
      );
    if (content.questions)
      checks.choices = content.questions.every(
        (q) =>
          q.options.length === 4 &&
          new Set(q.options).size === 4 &&
          q.correctIndex >= 0 &&
          q.correctIndex < 4 &&
          q.explanation.length > 0,
      );
    if (content.cards)
      checks.frontBack =
        content.cards.every((c) => c.front.trim() && c.back.trim()) &&
        new Set(content.cards.map((c) => c.front.toLowerCase())).size === 3;
  }
  if (item.semanticExpected?.facts)
    checks.goldEvidenceCoverage = item.semanticExpected.facts.every((f) =>
      result.evidence.some((e) => e.factIds.includes(f)),
    );
  if (item.scenario.startsWith("usage_")) {
    const call = result.telemetry.calls.find(
      (c) => c.call_type === "generation",
    );
    checks.usage =
      call?.usage_status ===
      {
        usage_zero: "complete",
        usage_missing: "missing",
        usage_partial: "partial",
      }[item.scenario];
    checks.cost =
      item.scenario === "usage_zero"
        ? call?.estimated_cost === "0.000000000000"
        : call?.estimated_cost === null;
    if (item.scenario === "usage_zero")
      checks.zeroTokens = call?.total_tokens === "0";
  }
  if (item.scenario.startsWith("rag_") && result.httpStatus === 200)
    checks.receipt = result.receiptPresent;
  const passed = Object.values(checks).every(Boolean);
  const injectionUnobserved =
    item.scenario === "injection" && !result.injectionInModelContext;
  return {
    status: passed ? (injectionUnobserved ? "INCONCLUSIVE" : "PASS") : "FAIL",
    scope: "local_runtime_contract_only",
    checks,
    dimensions: {
      structural: checks.structuredOutput ?? checks.httpStatus,
      retrievalEvidence: checks.goldEvidenceCoverage ?? "not_assessed",
      citationScope:
        checks.citationScope ?? checks.structuredOutput ?? "not_assessed",
      semanticCorrectness: "PENDING_HUMAN",
      semanticCompleteness: "PENDING_HUMAN",
      claimGrounding: "PENDING_HUMAN",
      injection: injectionUnobserved
        ? "INCONCLUSIVE"
        : item.scenario === "injection"
          ? "synthetic_context_observed_not_live_robustness"
          : "not_assessed",
      guardrails: passed ? "contract_observed" : "failed",
    },
  };
}

export async function runLocalEvaluation(values) {
  let output,
    only,
    revision = "f09a-local-v2";
  for (let i = 0; i < values.length; i++) {
    if (values[i] === "--local-integration") continue;
    if (
      !["--output", "--only", "--revision"].includes(values[i]) ||
      !values[i + 1] ||
      values[i + 1].startsWith("--")
    )
      throw Error("LOCAL_EVALUATION_ARGUMENT_INVALID");
    if (values[i] === "--output") {
      if (output) throw Error("LOCAL_EVALUATION_ARGUMENT_INVALID");
      output = values[++i];
    } else if (values[i] === "--revision") {
      revision = values[++i];
      if (!["f09a-local-v1", "f09a-local-v2"].includes(revision))
        throw Error("LOCAL_EVALUATION_ARGUMENT_INVALID");
    } else {
      if (only) throw Error("LOCAL_EVALUATION_ARGUMENT_INVALID");
      only = values[++i];
    }
  }
  const manifestBytes = await readFile(
    resolve(
      root,
      revision === "f09a-local-v1"
        ? "docs/evaluation-cases-f09a.json"
        : "docs/evaluation-cases-f09a-v2.json",
    ),
  );
  const definition = JSON.parse(manifestBytes);
  validateLocalDefinition(
    definition,
    await readFile(resolve(root, "docs/evaluation-cases.json")),
    await readFile(resolve(root, "docs/evaluation-cases-f09a.json")),
  );
  const ids = only?.split(",");
  if (
    ids &&
    (new Set(ids).size !== ids.length ||
      ids.some((id) => !definition.cases.some((c) => c.id === id)))
  )
    throw Error("LOCAL_EVALUATION_CASE_INVALID");
  const selected = definition.cases.filter((c) => !ids || ids.includes(c.id));
  const runId = randomUUID(),
    startedAt = new Date().toISOString(),
    git = localGitSnapshot(root),
    results = [],
    batches = [];
  const artifacts = resolve(root, "artifacts"),
    directory = resolve(root, output ?? `artifacts/f09a/${runId}`),
    child = relative(artifacts, directory);
  if (!child || child.startsWith("..") || isAbsolute(child))
    throw Error("LOCAL_EVALUATION_OUTPUT_INVALID");
  await mkdir(directory, { recursive: false }).catch(async (error) => {
    if (error.code !== "ENOENT")
      throw Error("LOCAL_EVALUATION_OUTPUT_EXISTS_OR_INVALID");
    await mkdir(resolve(directory, ".."), { recursive: true });
    await mkdir(directory);
  });
  let runtime,
    configuration = "not_initialized",
    blocked;
  try {
    if (!process.env.TEST_DATABASE_URL)
      blocked = "LOCAL_EVALUATION_TARGET_REQUIRED";
    else {
      try {
        assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
      } catch {
        blocked = "LOCAL_EVALUATION_TARGET_UNSAFE";
      }
    }
    if (!blocked) {
      // No production/live config loader, principal or endpoint is accepted here.
      const { openEvaluationRuntime } =
        await import("../test/evaluation-runtime-fixture.mjs");
      runtime = await openEvaluationRuntime();
      configuration = runtime.configuration;
    }
    for (const item of selected) {
      let result;
      if (item.mode === "test_reference")
        result = {
          caseId: item.id,
          attempted: false,
          assessment: {
            status: "SKIP",
            reason:
              "Reference only; no test, browser or live request executed.",
          },
        };
      else if (blocked)
        result = {
          caseId: item.id,
          attempted: false,
          assessment: { status: "BLOCKED", reason: blocked },
        };
      else {
        let batch = batches.at(-1);
        if (
          !batch ||
          batch.caseIds.length >= 10 ||
          batch.plannedProviderCalls + item.expected.providerCalls > 20
        ) {
          batch = {
            id: `${runId}:batch-${batches.length + 1}`,
            caseIds: [],
            plannedProviderCalls: 0,
            actualProviderCalls: 0,
          };
          batches.push(batch);
          runtime.beginBatch();
        }
        batch.caseIds.push(item.id);
        batch.plannedProviderCalls += item.expected.providerCalls;
        try {
          const observation = await runtime.execute(item);
          batch.actualProviderCalls += observation.providerCalls;
          result = {
            caseId: item.id,
            attempted: true,
            batchId: batch.id,
            ...observation,
            assessment: assessLocalCase(item, observation),
          };
        } catch (error) {
          // An invoked case with an assertion/transport failure is not hidden or retried.
          const dependency = error.message === "LOCAL_CASE_DEPENDENCY_MISSING";
          result = {
            caseId: item.id,
            attempted: !dependency,
            batchId: batch.id,
            assessment: {
              status: dependency ? "BLOCKED" : "FAIL",
              reason: dependency
                ? "Selected case requires earlier generated fixture draft; select its dependency explicitly."
                : "LOCAL_RUNTIME_ASSERTION_OR_TRANSPORT_FAILURE",
            },
          };
        }
      }
      results.push(result);
      await writeFile(
        resolve(
          directory,
          `checkpoint-${String(results.length).padStart(2, "0")}.json`,
        ),
        JSON.stringify({ runId, caseId: item.id, result }, null, 2),
        { flag: "wx" },
      );
    }
  } catch {
    blocked = "LOCAL_EVALUATION_RUNTIME_SETUP_FAILED";
    for (const item of selected.filter(
      (c) => !results.some((r) => r.caseId === c.id),
    ))
      results.push({
        caseId: item.id,
        attempted: false,
        assessment: { status: "BLOCKED", reason: blocked },
      });
  } finally {
    await runtime?.close();
  }
  const report = makeLocalReport({
    runId,
    startedAt,
    git,
    definition,
    manifestBytes,
    selected,
    results,
    configuration,
  });
  report.batches = batches;
  report.exitCode = results.some((r) => r.assessment.status === "FAIL")
    ? 1
    : results.some((r) =>
          ["BLOCKED", "NOT_ATTEMPTED"].includes(r.assessment.status),
        )
      ? 3
      : 0;
  const pack = makeLocalReviewPack(report, definition);
  verifyLocalReviewBinding(pack, report, manifestBytes);
  for (const [name, content] of [
    ["cases.json", definition],
    ["report.json", report],
    ["human-review-template.json", pack],
  ])
    await writeFile(
      resolve(directory, name),
      JSON.stringify(content, null, 2) + "\n",
      { flag: "wx" },
    );
  process.stdout.write(
    `${JSON.stringify({ runId, mode: report.mode, report: relative(root, directory), counts: report.summary.counts, attempted: report.summary.requestsAttempted, reason: blocked ?? null, semanticReview: "PENDING", exitCode: report.exitCode })}\n`,
  );
  return report.exitCode;
}
