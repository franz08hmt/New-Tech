import { randomUUID } from "node:crypto";
import { corpusManifest, sha256 } from "./rag-evaluation-corpus.mjs";
import { canonicalJson } from "./rag-evaluation-provenance.mjs";
import {
  HttpEvaluationError,
  LEDGER_UNAVAILABLE,
  createHttpTransport,
  runPreflight,
} from "./rag-evaluation-http-lib.mjs";
import { createPlanLedger } from "./rag-evaluation-http-ledger.mjs";
import {
  blockingReason,
  evaluateQualityResult,
  reportSummary,
} from "./rag-evaluation-lib.mjs";
import {
  assembleQualityPlan,
  loadQualitySuite,
} from "./rag-evaluation-quality-plan.mjs";
import {
  checkCourseScopes,
  classify,
  evaluateProvenance,
  neededScope,
} from "./rag-evaluation-quality-http.mjs";

// F09-B.2B.5: the core executor of ONE batch of a quality suite.
//
// It does not decide who may run anything. It checks that the approval record it
// is handed binds exactly this suite, plan, batch, case order, target and limits;
// it asks an injected authorizer whether that record is authentic; it requires a
// pinned, current provenance artifact and an injected target-equivalence proof;
// it reads access and scope through the public API; and only then does it reserve
// the batch in the existing ledger and send each case once, in order. There is no
// flag, boolean, environment variable or default that supplies a missing piece.
//
// It never starts a second batch, never retries a generation, never replays after
// an unknown outcome, and never turns an unobserved quantity into zero. A response
// that is well formed is not a semantic pass: semantic review stays pending.
export const BATCH_APPROVAL_SCHEMA = "rag-quality-batch-approval-v1";
export const BATCH_REPORT_SCHEMA = "rag-quality-batch-report-v1";

const APPROVAL_KEYS = ["schema", "binds", "evidence"];

/** Everything an approval of exactly one batch must cover. */
export function batchBinding(planned, batchId) {
  const { plan } = planned;
  const index = plan.batches.findIndex((batch) => batch.id === batchId);
  if (index < 0) return null;
  const batch = plan.batches[index];
  return {
    schema: BATCH_APPROVAL_SCHEMA,
    suite: {
      revision: plan.suite.revision,
      manifestSha256: plan.suite.manifestSha256,
    },
    planSha256: planned.planSha256,
    batch: {
      id: batch.id,
      index: index + 1,
      batchSha256: batch.batchSha256,
      caseIds: [...batch.caseIds],
    },
    caseRequests: batch.caseIds.map((id) => ({
      id,
      requestSha256: plan.cases.find((c) => c.id === id).requestSha256,
    })),
    target: { base: plan.target.base, origin: plan.target.origin },
    provenanceTarget: plan.provenanceTarget.identitySha256,
    limits: {
      maxClientRequests: batch.caseIds.length,
      timeoutMs: plan.timeoutMs,
      sequential: true,
      retries: 0,
    },
  };
}

/** One ledger directory per approved batch, derived from everything it binds. */
export function ledgerKeyOf(binding) {
  return sha256(canonicalJson(binding));
}

function refusal(reason, stage, extra = {}) {
  return {
    schema: BATCH_REPORT_SCHEMA,
    status: "REFUSED",
    refusal: { reason, stage },
    generationRequests: 0,
    requests: { read: 0, authLifecycle: 0, generation: 0, other: 0 },
    results: [],
    nextBatch: "not_started",
    humanSemanticReview: "pending",
    ...extra,
  };
}

/** The item shape the existing evaluator expects, built from a suite case. */
function evaluatorItem(suiteCase) {
  const gold = suiteCase.goldGroups.flatMap((g) => g.alternatives);
  const pages = {};
  for (const a of gold) (pages[a.file] ??= []).push(a.page);
  const injection =
    suiteCase.kind === "injection"
      ? gold.find((a) => a.facts.includes("injection"))
      : undefined;
  return {
    id: suiteCase.id,
    group: "pdf_quality",
    assistantMode: suiteCase.api.mode,
    operation: suiteCase.api.operation,
    manualReview: suiteCase.humanReview.criteria.join(" | "),
    expectedBehavior: suiteCase.expected.requiredBehavior,
    expected: {
      httpStatus: 200,
      answerable: suiteCase.expected.answerable,
      minCitations: suiteCase.expected.minCitations,
      ...(suiteCase.expected.answerable
        ? {
            requiredCitationTitles: Object.keys(pages),
            allowedCitationPagesByTitle: pages,
          }
        : { reasonCode: "NO_RELEVANT_EVIDENCE" }),
    },
    goldGroups: suiteCase.goldGroups,
    ...(injection
      ? {
          injection: {
            file: injection.file,
            page: injection.page,
            fact: "injection",
          },
        }
      : {}),
  };
}

function responseSummary(reply, bodyHash) {
  const body = reply.body && typeof reply.body === "object" ? reply.body : null;
  return {
    httpStatus: reply.httpStatus,
    code: body?.code ?? null,
    reasonCode: body?.reasonCode ?? null,
    answerable: body?.answerable ?? null,
    answer: typeof body?.answer === "string" ? body.answer : null,
    citations: Array.isArray(body?.citations)
      ? body.citations.map((c) => ({
          sourceId: c?.sourceId,
          documentId: c?.documentId,
          title: c?.title,
          page: c?.page,
          chunkIndex: c?.chunkIndex,
          chunkId: c?.chunkId,
        }))
      : [],
    provider: body?.provider ?? null,
    model: body?.model ?? null,
    promptVersion: body?.promptVersion ?? null,
    requestId: reply.requestId ?? null,
    receiptPresent: Boolean(reply.receiptPresent),
    latencyMs: reply.latencyMs,
    bodyStatus: reply.bodyStatus ?? (body ? "json" : "empty"),
    bodySha256: bodyHash,
    // The HTTP surface exposes no token or cost figures: unobserved is not zero.
    usage: "unobserved",
    ...(reply.outcome
      ? { outcome: reply.outcome, transportPhase: reply.transportPhase }
      : {}),
  };
}

const failureKindOf = (reply, assessment, reason) => {
  if (
    reply.outcome === "unknown_after_dispatch" ||
    reason === "NETWORK_OR_TIMEOUT"
  )
    return "transport";
  if (reason) return "access_or_quota";
  return assessment.status === "FAIL" ? "contract" : "none";
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * The caller's plan, copied in one synchronous step. It runs before this module
 * awaits anything, so what it copies is one consistent moment of the caller's
 * objects; nothing the caller owns is read after it. The suite bytes are copied
 * into a buffer only this module holds, and that same buffer is hashed, parsed,
 * used for the rebuild, kept in the sealed copy and handed to the provenance
 * verifier. (Object.freeze cannot make a buffer immutable; owning a private copy
 * and never exposing it is what does.)
 */
function snapshotCandidate(candidate) {
  try {
    const bytes = candidate?.suite?.bytes;
    return {
      bytes: Buffer.isBuffer(bytes) ? Buffer.from(bytes) : null,
      suiteSha256: candidate.suite.manifestSha256,
      definition: structuredClone(candidate.suite.definition),
      plan: structuredClone(candidate.plan),
      planSha256: candidate.planSha256,
      resolved: structuredClone(candidate.resolved),
    };
  } catch {
    return null;
  }
}

/** The approval record as it was when the call was made, or a marker if it cannot be read. */
function snapshotApproval(value) {
  if (value === undefined || value === null) return value;
  try {
    return structuredClone(value);
  } catch {
    return "unreadable";
  }
}

/**
 * Checks the plan against the data it claims to describe and returns a private,
 * immutable copy of what was verified. Nothing is trusted because it is stored:
 * the suite bytes are re-hashed and re-parsed with the canonical loader, every
 * request hash is recomputed from the request itself, and the whole plan is
 * rebuilt by the canonical planner from those bytes and compared. It reads only
 * the snapshot it is given, never the caller's objects.
 */
async function sealPlanned(snap) {
  const refuse = (reason) => ({ reason });
  try {
    if (!snap || !Buffer.isBuffer(snap.bytes))
      return refuse("SUITE_BYTES_MISMATCH");
    const digest = sha256(snap.bytes);
    if (
      snap.suiteSha256 !== digest ||
      snap.plan?.suite?.manifestSha256 !== digest
    )
      return refuse("SUITE_BYTES_MISMATCH");
    let loaded;
    try {
      loaded = loadQualitySuite(snap.bytes);
    } catch {
      return refuse("SUITE_BYTES_MISMATCH");
    }
    // The definition used for evaluation must be the one in those exact bytes.
    if (canonicalJson(loaded.definition) !== canonicalJson(snap.definition))
      return refuse("SUITE_DEFINITION_MISMATCH");
    const given = snap.plan;
    for (const item of given.cases) {
      const request = item.request;
      if (
        item.support === "supported" &&
        (!request || sha256(canonicalJson(request)) !== item.requestSha256)
      )
        return refuse("PLAN_REQUEST_HASH_MISMATCH");
    }
    if (sha256(canonicalJson(given)) !== snap.planSha256)
      return refuse("PLAN_HASH_MISMATCH");
    const rebuilt = await assembleQualityPlan({
      suite: loaded,
      resolved: structuredClone(snap.resolved),
      target: { base: new URL(given.target.base), origin: given.target.origin },
      options: {
        batchSize: given.limits.batchSize,
        timeoutMs: given.timeoutMs,
        only:
          given.selection.requested === "all"
            ? undefined
            : given.selection.requested.join(","),
      },
    });
    if (rebuilt.planSha256 !== snap.planSha256) {
      const without = (plan) => canonicalJson({ ...plan, batches: null });
      return refuse(
        without(rebuilt.plan) === without(given)
          ? "PLAN_BATCH_MISMATCH"
          : "PLAN_CONTENT_MISMATCH",
      );
    }
    return {
      sealed: deepFreeze({
        plan: structuredClone(rebuilt.plan),
        planSha256: rebuilt.planSha256,
        resolved: structuredClone(snap.resolved),
        suite: {
          definition: structuredClone(loaded.definition),
          manifestSha256: digest,
          // The very buffer that was hashed and parsed: never copied again.
          bytes: snap.bytes,
        },
      }),
    };
  } catch {
    return refuse("PLAN_CONTENT_MISMATCH");
  }
}

/**
 * Executes exactly one batch. Returns a report; expected refusals are returned as
 * REFUSED reports with the reason and the stage that stopped them.
 */
export async function executeQualityBatch({
  planned: callerPlanned,
  batchId,
  approval: callerApproval,
  authorize,
  targetEquivalence,
  provenance = {},
  credentials,
  fetchImpl = globalThis.fetch,
  ledgerDir,
  ledgerFs,
  rerunAcknowledged = [],
  onCheckpoint = async () => {},
  runId = randomUUID(),
}) {
  // Everything the caller owns is copied here, synchronously, before the first
  // await. Nothing below reads the caller's objects again.
  const snap = snapshotCandidate(callerPlanned);
  const approval = snapshotApproval(callerApproval);
  const prov = {
    manifestBytes: Buffer.isBuffer(provenance?.manifestBytes)
      ? Buffer.from(provenance.manifestBytes)
      : provenance?.manifestBytes,
    artifactText: provenance?.artifactText,
    observationText: provenance?.observationText,
    expectedDigest: provenance?.expectedDigest,
  };
  const acknowledged = Array.isArray(rerunAcknowledged)
    ? [...rerunAcknowledged]
    : [];
  const sealedResult = await sealPlanned(snap);
  if (sealedResult.reason) return refusal(sealedResult.reason, "integrity");
  const planned = sealedResult.sealed;
  // Provenance must have been verified against the very bytes of the approved suite.
  if (
    prov.manifestBytes !== undefined &&
    (!Buffer.isBuffer(prov.manifestBytes) ||
      sha256(prov.manifestBytes) !== planned.suite.manifestSha256)
  )
    return refusal("PROVENANCE_SUITE_MISMATCH", "integrity");
  const binding = deepFreeze(batchBinding(planned, batchId) ?? null);
  if (!binding) return refusal("BATCH_UNKNOWN", "binding");

  // 1. The approval record must have the exact shape and bind exactly this batch.
  if (approval === undefined || approval === null)
    return refusal("APPROVAL_MISSING", "approval");
  if (
    typeof approval !== "object" ||
    Array.isArray(approval) ||
    Object.keys(approval).sort().join() !== [...APPROVAL_KEYS].sort().join() ||
    approval.schema !== BATCH_APPROVAL_SCHEMA ||
    typeof approval.evidence !== "object" ||
    approval.evidence === null
  )
    return refusal("APPROVAL_SCHEMA_INVALID", "approval");
  let bound;
  try {
    bound = canonicalJson(approval.binds) === canonicalJson(binding);
  } catch {
    bound = false;
  }
  if (!bound) return refusal("APPROVAL_BINDING_MISMATCH", "approval");

  // 2. Authenticity comes from an injected authorizer; nothing in the record can
  // vouch for itself. Without one there is no way to tell, so the run is refused.
  if (typeof authorize !== "function")
    return refusal("APPROVAL_AUTHORIZER_UNAVAILABLE", "approval");
  let verdict;
  try {
    verdict = await authorize({
      approval: structuredClone(approval),
      binding: structuredClone(binding),
    });
  } catch {
    return refusal("APPROVAL_NOT_AUTHENTIC", "approval");
  }
  if (
    verdict?.goldReview?.status !== "verified" ||
    verdict?.batch?.status !== "verified"
  )
    return refusal("APPROVAL_NOT_AUTHENTIC", "approval");

  // 3. Evidence about the data the cases will be asked about.
  const evidence = evaluateProvenance({
    manifestBytes: planned.suite.bytes,
    resolved: planned.resolved,
    artifactText: prov.artifactText,
    observationText: prov.observationText,
    expectedDigest: prov.expectedDigest,
  });
  if (evidence.provenanceArtifact.status === "unverified")
    return refusal("PROVENANCE_ARTIFACT_NOT_PROVIDED", "provenance");
  if (evidence.provenanceArtifact.status !== "verified")
    return refusal("PROVENANCE_ARTIFACT_FAILED", "provenance");
  if (evidence.provenanceAuthenticity.status !== "verified")
    return refusal("PROVENANCE_AUTHENTICITY_UNVERIFIED", "provenance");
  if (evidence.provenanceCurrentness.status !== "verified")
    return refusal("PROVENANCE_CURRENTNESS_UNVERIFIED", "provenance");
  let equivalence;
  try {
    equivalence =
      typeof targetEquivalence === "function"
        ? await targetEquivalence({ binding: structuredClone(binding) })
        : undefined;
  } catch {
    equivalence = undefined;
  }
  if (equivalence?.status !== "verified")
    return refusal("TARGET_EQUIVALENCE_UNVERIFIED", "target");

  // 4. The ledger is consulted before any credential is read.
  const ledger = createPlanLedger({
    dir: ledgerDir,
    planSha256: ledgerKeyOf(binding),
    fs: ledgerFs,
  });
  try {
    await ledger.precheck({ acknowledged });
  } catch (error) {
    return refusal(
      error instanceof HttpEvaluationError ? error.code : LEDGER_UNAVAILABLE,
      "ledger",
    );
  }

  // 5. Authenticated reads: access and scope. Nothing is generated here.
  const counters = { read: 0, authLifecycle: 0, generation: 0, other: 0 };
  const transport = createHttpTransport({
    base: new URL(planned.plan.target.base),
    origin: planned.plan.target.origin,
    timeoutMs: planned.plan.timeoutMs,
    fetchImpl: (url, init) => {
      classify(counters, init?.method ?? "GET", new URL(url).pathname);
      return fetchImpl(url, init);
    },
  });
  const suiteCases = planned.suite.definition.cases;
  const batchCases = binding.batch.caseIds.map((id) => ({
    plan: planned.plan.cases.find((c) => c.id === id),
    suite: suiteCases.find((c) => c.id === id),
  }));
  const needed = neededScope({
    plan: { cases: batchCases.map((c) => c.plan) },
    resolved: planned.resolved,
  });
  const report = {
    schema: BATCH_REPORT_SCHEMA,
    runId,
    startedAt: new Date().toISOString(),
    status: "IN_PROGRESS",
    suite: planned.plan.suite,
    planSha256: planned.planSha256,
    bindingSha256: ledgerKeyOf(binding),
    batch: structuredClone(binding.batch),
    // Which authority said yes is the injected authorizer's; a test authorizer is no evidence of human approval.
    approval: {
      binding: "exact",
      authenticity: "verified_by_injected_authorizer",
    },
    provenance: {
      artifact: evidence.provenanceArtifact.status,
      authenticity: evidence.provenanceAuthenticity.status,
      currentness: evidence.provenanceCurrentness.status,
      targetEquivalence: "verified_by_injected_proof",
    },
    limits: {
      clientRequests: binding.limits.maxClientRequests,
      providerCalls: "unknown",
      monetaryBudget: "not_enforced",
      retries: 0,
    },
    requests: counters,
    results: [],
    generationRequests: 0,
    nextBatch: "not_started",
    humanSemanticReview: "pending",
  };
  let reservation;
  let outcome = "unknown_after_dispatch";
  try {
    let secret;
    try {
      secret = await credentials();
    } catch {
      return refusal("CREDENTIALS_UNAVAILABLE", "credentials", {
        requests: counters,
      });
    }
    const login = await runPreflight({
      transport,
      credentials: secret,
      plan: { documents: needed.documents },
      definition: { corpus: corpusManifest() },
    });
    const courseScopes = login.readiness.transportReady
      ? await checkCourseScopes(transport, needed.scopes)
      : { status: "unknown" };
    const blocked = [
      ...[
        "authSession",
        "membership",
        "documentScope",
        "assistantStatus",
      ].filter((name) => login.conditions[name].status !== "verified"),
      ...(courseScopes.status === "verified" ? [] : ["courseScopes"]),
    ][0];
    if (blocked)
      return refusal(`PREFLIGHT_${blocked.toUpperCase()}`, "preflight", {
        requests: counters,
      });

    // 6. Reserve the batch. The intent is durable before the first POST; if it
    // cannot be written nothing is sent.
    try {
      reservation = await ledger.reserve({ runId, acknowledged });
    } catch (error) {
      return refusal(
        error instanceof HttpEvaluationError ? error.code : LEDGER_UNAVAILABLE,
        "ledger",
        {
          requests: counters,
        },
      );
    }
    report.execution = { reservation: "acquired", intentRecorded: true };

    // 7. Sequential dispatch, one POST per case, never repeated.
    let stopped = null;
    for (const { plan: planCase, suite: suiteCase } of batchCases) {
      if (stopped) {
        report.results.push({
          caseId: planCase.id,
          group: "pdf_quality",
          attempted: false,
          assessment: { status: "NOT_ATTEMPTED", reason: stopped },
        });
        continue;
      }
      const started = performance.now();
      let reply;
      try {
        const sent = await transport.post(
          "assistant/chat",
          planCase.request.body,
        );
        reply = {
          httpStatus: sent.status,
          body: sent.body,
          bodyStatus: sent.bodyStatus,
          requestId: sent.requestId,
          receiptPresent: sent.receiptPresent,
          latencyMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        // The server may have acted on it: unknown, not failed, and never retried.
        reply = {
          httpStatus: 0,
          body: null,
          transportError:
            error.code === "REDIRECT_REFUSED"
              ? "REDIRECT_REFUSED"
              : "NETWORK_OR_TIMEOUT",
          outcome: "unknown_after_dispatch",
          transportPhase: error.phase ?? "before_response",
          latencyMs: Math.round(performance.now() - started),
        };
      }
      const allowed = [
        ...new Set(
          planCase.request.body.courseId
            ? planned.resolved.scopes
                .find((s) => s.courseId === planCase.request.body.courseId)
                .files.map(
                  (f) =>
                    planned.resolved.scopes.find(
                      (s) => s.courseId === planCase.request.body.courseId,
                    ).documents[f],
                )
            : [planCase.request.body.documentId],
        ),
      ];
      const assessment = evaluateQualityResult(
        evaluatorItem(suiteCase),
        reply,
        {
          allowedDocumentIds: allowed,
          index: login.index,
        },
      );
      const reason = blockingReason(reply);
      report.results.push({
        caseId: planCase.id,
        group: "pdf_quality",
        attempted: true,
        failureKind: failureKindOf(reply, assessment, reason),
        response: responseSummary(
          reply,
          reply.body && typeof reply.body === "object"
            ? sha256(canonicalJson(reply.body))
            : null,
        ),
        assessment,
      });
      report.generationRequests = counters.generation;
      await onCheckpoint(structuredClone({ ...report, status: "IN_PROGRESS" }));
      // Any blocking outcome ends the batch: no second generation is sent while the
      // first may still be running or have been served.
      if (reason)
        stopped = `Batch stopped after ${reason}; no automatic retry.`;
    }
    const unknown = report.results.some(
      (r) => r.response?.outcome === "unknown_after_dispatch",
    );
    outcome = unknown ? "unknown_after_dispatch" : "completed";
    report.status = unknown
      ? "UNKNOWN_OUTCOME"
      : stopped
        ? "STOPPED"
        : "COMPLETED";
    report.summary = reportSummary(report.results);
    return report;
  } finally {
    // The ledger records what happened even when the runner itself failed.
    if (reservation) {
      const finished = await reservation.finish({ outcome }).catch(() => ({}));
      report.execution = {
        reservation: "acquired",
        intentRecorded: true,
        outcome,
        ...finished,
      };
    }
    report.generationRequests = counters.generation;
    await transport.logout().catch(() => false);
  }
}
