// Operator-side binding only. This module opens no connection, reads no secret,
// and does not replace executor provenance, target proof, ledger or dispatch
// budget enforcement. The caller pins a private campaign record independently
// of untrusted per-batch approval input. No human signature is inferred.
import { sha256 } from "./rag-evaluation-corpus.mjs";
import { canonicalJson } from "./rag-evaluation-provenance.mjs";
import { loadQualitySuite } from "./rag-evaluation-quality-plan.mjs";

const AUTHORITY = "user-request-20261023-final-completion";
const hash = /^[a-f0-9]{64}$/;
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function verifyDelegatedGoldReview(manifestBytes, review) {
  try {
    const suite = loadQualitySuite(manifestBytes);
    if (
      review.schema !== "rag-delegated-gold-review-v1" ||
      review.phase !== "PRE_EXECUTION_GOLD_REVIEW" ||
      review.revision !== suite.definition.revision ||
      review.manifestSha256 !== suite.manifestSha256 ||
      review.corpusManifestSha256 !== suite.definition.corpusManifestSha256 ||
      review.reviewer?.kind !== "ai_under_user_delegation" ||
      review.reviewer.authority !== AUTHORITY ||
      !nonempty(review.reviewer.name) ||
      !Array.isArray(review.cases) ||
      review.cases.length !== suite.definition.cases.length
    )
      throw Error();
    for (const [index, item] of suite.definition.cases.entries()) {
      const r = review.cases[index];
      if (
        r.id !== item.id ||
        r.caseSha256 !== sha256(JSON.stringify(item)) ||
        r.decision !== "ACCEPT_FOR_BASELINE" ||
        !nonempty(r.notes)
      )
        throw Error();
    }
    return {
      cases: review.cases.length,
      status: "AI_TECHNICAL_GOLD_REVIEWED",
      humanReview: "not_claimed",
      modelOutputSemanticReview: "pending",
    };
  } catch {
    throw Error("GOLD_REVIEW_INVALID");
  }
}

export function createCampaignAuthorizer({
  campaignBytes,
  campaignSha256,
  manifestBytes,
  goldReviewBytes,
  phase,
  now = Date.now,
}) {
  let campaign, bindings, goldSha, suiteSha, caseIds;
  try {
    if (
      !Buffer.isBuffer(campaignBytes) ||
      !hash.test(campaignSha256) ||
      sha256(campaignBytes) !== campaignSha256 ||
      !Buffer.isBuffer(goldReviewBytes)
    )
      throw Error();
    campaign = JSON.parse(campaignBytes.toString("utf8"));
    verifyDelegatedGoldReview(
      manifestBytes,
      JSON.parse(goldReviewBytes.toString("utf8")),
    );
    suiteSha = sha256(manifestBytes);
    caseIds = new Set(
      JSON.parse(goldReviewBytes.toString("utf8")).cases.map((c) => c.id),
    );
    goldSha = sha256(goldReviewBytes);
    const l = campaign.limits;
    if (
      campaign.schema !== "rag-authorized-campaign-v1" ||
      campaign.authority !== AUTHORITY ||
      campaign.goldReviewSha256 !== goldSha ||
      !Number.isFinite(Date.parse(campaign.expiresAt)) ||
      Date.parse(campaign.expiresAt) <= now() ||
      l.budgetUsd !== "1.00" ||
      l.stopBeforeDispatchUsd !== "0.80" ||
      !Number.isInteger(l.providerCalls) ||
      l.providerCalls < 1 ||
      l.providerCalls > 200 ||
      !Number.isInteger(l.batchRequests) ||
      l.batchRequests < 1 ||
      l.batchRequests > 5 ||
      l.sequential !== true ||
      l.retries !== 0 ||
      !["baseline", "improved"].includes(phase)
    )
      throw Error();
    const approved = campaign.phases[phase].bindingSha256s;
    if (
      !Array.isArray(approved) ||
      approved.length === 0 ||
      approved.some((v) => !hash.test(v)) ||
      new Set(approved).size !== approved.length
    )
      throw Error();
    bindings = new Set(approved);
  } catch {
    throw Error("CAMPAIGN_AUTHORITY_INVALID");
  }
  // Snapshot approved bindings and limits; mutations of caller objects cannot
  // authorize another target, cohort, batch, phase or request after this point.
  const expires = Date.parse(campaign.expiresAt),
    max = campaign.limits.batchRequests;
  return async ({ approval, binding }) => {
    let accepted = false;
    try {
      accepted =
        now() < expires &&
        bindings.has(sha256(canonicalJson(binding))) &&
        binding.suite.manifestSha256 === suiteSha &&
        new Set(binding.batch.caseIds).size === binding.batch.caseIds.length &&
        binding.batch.caseIds.every((id) => caseIds.has(id)) &&
        canonicalJson(approval.binds) === canonicalJson(binding) &&
        approval.evidence.campaignSha256 === campaignSha256 &&
        approval.evidence.phase === phase &&
        approval.evidence.goldReviewSha256 === goldSha &&
        binding.limits.sequential === true &&
        binding.limits.retries === 0 &&
        binding.limits.maxClientRequests === binding.batch.caseIds.length &&
        binding.batch.caseIds.length <= max;
    } catch {
      /* Malformed approval is a refusal, never an execution error. */
    }
    return {
      goldReview: {
        status: accepted ? "verified" : "failed",
        method: "user_delegated_ai_not_human",
      },
      batch: { status: accepted ? "verified" : "failed" },
    };
  };
}
