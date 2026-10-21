// F09-A additive report contract. Historical v3 reports/gold stay unchanged.
import { execFileSync } from "node:child_process";
import {
  sha256,
  corpusManifest,
  corpusDocuments,
} from "./rag-evaluation-corpus.mjs";
import { reportSummary, RESULT_STATUSES } from "./rag-evaluation-lib.mjs";

export function localGitSnapshot(root) {
  try {
    return {
      sha: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ),
    };
  } catch {
    return { sha: "unknown", dirty: "unknown" };
  }
}

function sourceHashMatches(bytes, expected) {
  // Git may materialize unchanged JSON as LF or CRLF. No other byte changes
  // (including whitespace) are accepted; per-run report hashes remain raw-byte exact.
  const lf = bytes.toString("utf8").replace(/\r\n/g, "\n");
  return (
    expected === sha256(lf) || expected === sha256(lf.replace(/\n/g, "\r\n"))
  );
}
export function validateLocalDefinition(definition, baseBytes, previousBytes) {
  if (
    definition.schemaVersion !== 4 ||
    !["f09a-local-v1", "f09a-local-v2"].includes(definition.revision) ||
    !sourceHashMatches(baseBytes, definition.baseManifestSha256) ||
    definition.corpusSha256 !== sha256(JSON.stringify(corpusManifest())) ||
    definition.corpusRevision !== corpusManifest().corpusRevision ||
    !Array.isArray(definition.cases) ||
    definition.cases.length < 20 ||
    definition.cases.length > 50
  )
    throw new Error("LOCAL_EVALUATION_PROVENANCE_INVALID");
  if (
    definition.revision === "f09a-local-v2" &&
    (!previousBytes ||
      !sourceHashMatches(previousBytes, definition.predecessorSha256))
  )
    throw new Error("LOCAL_EVALUATION_PROVENANCE_INVALID");
  const ids = new Set();
  for (const item of definition.cases) {
    if (
      !/^F09A-\d{3}$/.test(item.id) ||
      ids.has(item.id) ||
      !["local_integration", "test_reference"].includes(item.mode) ||
      !item.expected ||
      typeof item.expectedBehavior !== "string" ||
      !item.expectedBehavior.trim() ||
      typeof item.scenario !== "string" ||
      !Number.isInteger(item.expected.providerCalls) ||
      item.expected.providerCalls < 0 ||
      item.expected.providerCalls > 2 ||
      (item.mode === "local_integration" &&
        (!Number.isInteger(item.expected.httpStatus) ||
          item.expected.httpStatus < 100 ||
          item.expected.httpStatus > 599))
    )
      throw new Error("LOCAL_EVALUATION_CASE_INVALID");
    ids.add(item.id);
  }
}

export function summarizeMeasurements(results) {
  const calls = results.flatMap((r) => r.telemetry?.calls ?? []);
  const dispatchedCalls = results.reduce(
    (n, r) => n + (r.providerCalls ?? r.telemetry?.calls.length ?? 0),
    0,
  );
  const tokens = (field) => {
    const known = calls.filter(
      (c) => /^\d+$/.test(c[field] ?? "") && c.usage_status !== "invalid",
    );
    return {
      known: known.reduce((sum, c) => sum + BigInt(c[field]), 0n).toString(),
      knownCalls: known.length,
      totalCalls: dispatchedCalls,
    };
  };
  const costs = new Map();
  let estimatedCalls = 0;
  for (const call of calls) {
    if (
      call.cost_status !== "estimated" ||
      !/^\d+\.\d{12}$/.test(call.estimated_cost ?? "") ||
      !call.currency ||
      !call.pricing_version
    )
      continue;
    const key = JSON.stringify([call.currency, call.pricing_version]);
    costs.set(
      key,
      (costs.get(key) ?? 0n) + BigInt(call.estimated_cost.replace(".", "")),
    );
    estimatedCalls++;
  }
  return {
    accounting: {
      sdkDispatchedCalls: dispatchedCalls,
      persistedCalls: calls.length,
      missingTelemetryCalls: Math.max(0, dispatchedCalls - calls.length),
    },
    tokens: {
      input: tokens("input_tokens"),
      output: tokens("output_tokens"),
      total: tokens("total_tokens"),
    },
    usageCoverage: Object.fromEntries(
      ["complete", "partial", "missing", "invalid"].map((k) => [
        k,
        calls.filter((c) => c.usage_status === k).length,
      ]),
    ),
    cost: {
      estimatedCalls,
      unknownCalls: dispatchedCalls - estimatedCalls,
      byCurrencyAndPricingVersion: [...costs].map(([key, value]) => {
        const [currency, pricingVersion] = JSON.parse(key);
        return {
          currency,
          pricingVersion,
          knownEstimate: `${value / 1000000000000n}.${(value % 1000000000000n).toString().padStart(12, "0")}`,
        };
      }),
      interpretation:
        "Stored historical estimates only; unknown is not free; best-effort telemetry is not billing or admission.",
    },
    latency: {
      kind: "synthetic_transport_local_runtime",
      samples: results
        .filter((r) => r.attempted)
        .map((r) => ({
          caseId: r.caseId,
          httpMs: r.latencyMs,
          operationMs: r.telemetry?.operations.map((o) => o.duration_ms) ?? [],
          providerMs: r.telemetry?.calls.map((c) => c.duration_ms) ?? [],
        })),
      interpretation:
        "Fixture timing only, not live-model latency or production SLA. TTFT not measured.",
    },
  };
}

export function makeLocalReport({
  runId,
  startedAt,
  git,
  definition,
  manifestBytes,
  selected,
  results,
  configuration,
}) {
  const safeResults = results.map((r) => ({
    ...r,
    group: "local_contract",
    assessment: {
      ...r.assessment,
      status:
        !r.attempted && r.assessment.status === "PASS"
          ? "NOT_ATTEMPTED"
          : r.assessment.status,
    },
  }));
  if (safeResults.some((r) => !RESULT_STATUSES.includes(r.assessment.status)))
    throw new Error("LOCAL_RESULT_STATUS_INVALID");
  return {
    schemaVersion: 4,
    runId,
    mode: "authenticated_local_integration",
    startedAt,
    completedAt: new Date().toISOString(),
    git,
    manifestRevision: definition.revision,
    manifestSha256: sha256(manifestBytes),
    baseManifestSha256: definition.baseManifestSha256,
    corpusRevision: definition.corpusRevision,
    corpusSha256: definition.corpusSha256,
    selectedCaseIds: selected.map((c) => c.id),
    configuration,
    provenance:
      "Frozen synthetic rag-eval-v2 pages seeded as indexed fixtures, not a new extraction/index benchmark. Real Nest/session/membership/RLS/retrieval/admission/telemetry; only Auth upstream, Storage and SDK transports synthetic. No live-provider execution.",
    limits: {
      perCaseProviderAttempts: 2,
      retries: 0,
      liveRequestsExecuted: 0,
      humanReviews: 0,
      browserAcceptance: "not_executed",
    },
    results: safeResults,
    summary: reportSummary(safeResults),
    measurements: summarizeMeasurements(safeResults),
    semanticReview:
      "pending_human_review_of_synthetic_readiness_samples; not live semantic evidence",
  };
}

export function makeLocalReviewPack(report, definition) {
  return {
    schemaVersion: 1,
    kind: "synthetic_readiness_not_live_evidence",
    runId: report.runId,
    reportSha256: sha256(JSON.stringify(report)),
    manifestSha256: report.manifestSha256,
    corpusSha256: report.corpusSha256,
    rubric: [
      "Facts correct against the exact cited pages?",
      "Complete for the question/card/quiz scope?",
      "Each claim/answer/explanation grounded in the source?",
      "Untrusted instructions ignored? If not in context, mark INCONCLUSIVE.",
      "Schema/citation existence is separate from semantic correctness.",
    ],
    cases: report.results
      .filter((r) => r.attempted && r.reviewOutput)
      .map((r) => ({
        caseId: r.caseId,
        runId: report.runId,
        responseSha256: sha256(JSON.stringify(r.reviewOutput)),
        output: r.reviewOutput,
        evidence: r.evidence ?? [],
        injectionInModelContext: r.injectionInModelContext ?? false,
        expected:
          definition.cases.find((c) => c.id === r.caseId).semanticExpected ??
          null,
        sources: corpusDocuments.map((d) => ({
          file: d.file,
          pages: d.pages.map((text, i) => ({ page: i + 1, text })),
        })),
        reviewer: "",
        decision: null,
        notes: "",
        factsCorrect: null,
        complete: null,
        claimGrounding: null,
      })),
  };
}

export function verifyLocalReviewBinding(pack, report, manifestBytes) {
  if (
    pack.runId !== report.runId ||
    pack.reportSha256 !== sha256(JSON.stringify(report)) ||
    pack.manifestSha256 !== sha256(manifestBytes) ||
    report.manifestSha256 !== sha256(manifestBytes) ||
    pack.corpusSha256 !== report.corpusSha256 ||
    report.corpusSha256 !== sha256(JSON.stringify(corpusManifest()))
  )
    throw new Error("LOCAL_REVIEW_BINDING_INVALID");
  const expectedPack = makeLocalReviewPack(report, JSON.parse(manifestBytes));
  if (
    !Array.isArray(pack.cases) ||
    pack.cases.length !== expectedPack.cases.length ||
    pack.kind !== expectedPack.kind ||
    JSON.stringify(pack.rubric) !== JSON.stringify(expectedPack.rubric)
  )
    throw new Error("LOCAL_REVIEW_BINDING_INVALID");
  const seen = new Set();
  for (const item of pack.cases) {
    const result = report.results.find(
      (r) => r.caseId === item.caseId && r.attempted && r.reviewOutput,
    );
    const expected = expectedPack.cases.find((c) => c.caseId === item.caseId);
    if (
      !result ||
      seen.has(item.caseId) ||
      item.runId !== report.runId ||
      item.responseSha256 !== sha256(JSON.stringify(result.reviewOutput)) ||
      item.responseSha256 !== sha256(JSON.stringify(item.output)) ||
      ["sources", "expected", "evidence", "injectionInModelContext"].some(
        (key) => JSON.stringify(item[key]) !== JSON.stringify(expected?.[key]),
      )
    )
      throw new Error("LOCAL_REVIEW_BINDING_INVALID");
    seen.add(item.caseId);
  }
  return true;
}
