import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assertTestDatabaseTarget } from "./test-database-target.mjs";
import { parseStudyQuizOutput } from "../dist/study-coach/study-quiz-validation.js";
import { parseStudyFlashcardsOutput } from "../dist/study-coach/study-flashcards-validation.js";
import {
  validateLocalDefinition,
  localGitSnapshot,
  makeLocalReport,
  makeLocalReviewPack,
  verifyLocalReviewBinding,
} from "./rag-evaluation-local-lib.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
// Contracts belong to scenarios, never to whichever optional fields arrived.
const contentContracts = Object.freeze({
  rag_document: "grounded_rag",
  rag_course: "grounded_rag",
  injection: "grounded_rag",
  usage_zero: "grounded_rag",
  usage_missing: "grounded_rag",
  usage_partial: "grounded_rag",
  privacy: "grounded_rag",
  rag_no_evidence: "refusal",
  quiz_valid: "quiz",
  flashcards_valid: "flashcards",
});
const nonContentScenarios = new Set([
  "auth_capability",
  "read_save_practice",
  "workspace_sql",
  "reference_browser",
  "reference_live_semantic",
]);
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonBlank = (value) =>
  typeof value === "string" && value.trim().length > 0;

// Inline source markers follow AssistantService.validateCitations: a grounded
// answer needs well-formed markers and their ID set must equal the returned
// citation IDs. Syntax is stricter than production's count comparison: every
// source-like [S...] text must be exactly [S<n>], as in legacy marker_syntax.
// Whether a cited source supports the claim stays human-reviewed.
const sourceLikeMarker = /\[S[^\]]*\]/g;
const sourceMarker = /^\[S[1-9][0-9]*\]$/;
function markerChecks(answer, citationIds) {
  const sourceLike = [...answer.matchAll(sourceLikeMarker)].map(([m]) => m);
  const referenced = new Set(
    sourceLike.filter((m) => sourceMarker.test(m)).map((m) => m.slice(1, -1)),
  );
  const returned = new Set(citationIds);
  return {
    markerSyntax: sourceLike.every((m) => sourceMarker.test(m)),
    markerPresence: referenced.size > 0,
    markerCitationSet:
      referenced.size === returned.size &&
      [...referenced].every((id) => returned.has(id)),
  };
}

function checkContent(contract, result) {
  const content = result.reviewOutput;
  const evidence = Array.isArray(result.evidence)
    ? result.evidence.filter(record)
    : [];
  if (contract === "grounded_rag" || contract === "refusal") {
    const cited = contract === "grounded_rag";
    const structure =
      record(content) &&
      !Object.hasOwn(content, "questions") &&
      !Object.hasOwn(content, "cards") &&
      nonBlank(content.answer) &&
      typeof content.answerable === "boolean" &&
      Array.isArray(content.citations) &&
      (cited ? content.citations.length > 0 : content.citations.length === 0) &&
      content.citations.every(
        (c) =>
          record(c) &&
          nonBlank(c.sourceId) &&
          nonBlank(c.title) &&
          Number.isSafeInteger(c.page) &&
          c.page > 0,
      );
    return {
      responseStructure: structure,
      // Refusals keep their own contract: no citations and no marker checks.
      ...(cited
        ? structure
          ? markerChecks(
              content.answer,
              content.citations.map((c) => c.sourceId),
            )
          : {
              markerSyntax: false,
              markerPresence: false,
              markerCitationSet: false,
            }
        : {}),
      answerability:
        structure &&
        content.answerable === cited &&
        result.answerable === cited,
      citationScope:
        structure &&
        content.citations.every((c) =>
          evidence.some(
            (e) =>
              e.sourceId === c.sourceId &&
              e.file === c.title &&
              e.page === c.page,
          ),
        ),
      receipt: result.receiptPresent === true,
    };
  }
  // The observation is a projection, with server source metadata alongside it.
  // Reuse pure production validators for its actual artifact payload; do not
  // fabricate title/language or accept a different artifact as a substitute.
  const sourceIds = new Set(
    evidence.filter((e) => nonBlank(e.sourceId)).map((e) => e.sourceId),
  );
  let validated;
  if (record(content)) {
    try {
      if (contract === "quiz" && !Object.hasOwn(content, "cards"))
        validated = parseStudyQuizOutput(
          JSON.stringify({
            title: content.title,
            language: content.language,
            questions: content.questions,
          }),
          3,
          "en",
          sourceIds,
        );
      if (contract === "flashcards" && !Object.hasOwn(content, "questions"))
        validated = parseStudyFlashcardsOutput(
          JSON.stringify({
            title: content.title,
            language: content.language,
            cards: content.cards,
          }),
          3,
          "en",
          sourceIds,
        );
    } catch {
      // Malformed observations are machine failures; never leak raw content.
      validated = undefined;
    }
  }
  return {
    responseStructure: validated !== undefined,
    citationScope: validated !== undefined,
  };
}

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
  const contract =
    contentContracts[item.scenario] ??
    (item.expected.httpStatus >= 400
      ? "expected_error"
      : nonContentScenarios.has(item.scenario)
        ? "no_generated_content"
        : undefined);
  checks.outputContract = contract !== undefined;
  if (Object.hasOwn(contentContracts, item.scenario))
    Object.assign(checks, checkContent(contract, result));
  if (item.semanticExpected?.facts)
    checks.goldEvidenceCoverage =
      Array.isArray(result.evidence) &&
      item.semanticExpected.facts.every((f) =>
        result.evidence.some(
          (e) => record(e) && Array.isArray(e.factIds) && e.factIds.includes(f),
        ),
      );
  if (item.scenario.startsWith("usage_")) {
    const call = Array.isArray(result.telemetry?.calls)
      ? result.telemetry.calls.find(
          (c) => record(c) && c.call_type === "generation",
        )
      : undefined;
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
  const passed = Object.values(checks).every(Boolean);
  const injectionUnobserved =
    item.scenario === "injection" && !result.injectionInModelContext;
  return {
    status: passed ? (injectionUnobserved ? "INCONCLUSIVE" : "PASS") : "FAIL",
    scope: "local_runtime_contract_only",
    reason: passed ? null : "LOCAL_CONTRACT_CHECK_FAILED",
    checks,
    dimensions: {
      structural: checks.responseStructure ?? "not_assessed",
      retrievalEvidence: checks.goldEvidenceCoverage ?? "not_assessed",
      citationScope: checks.citationScope ?? "not_assessed",
      markerConsistency: Object.hasOwn(checks, "markerSyntax")
        ? checks.markerSyntax &&
          checks.markerPresence &&
          checks.markerCitationSet
        : "not_assessed",
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
