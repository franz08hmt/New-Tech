import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import { canonicalJson } from "../scripts/rag-evaluation-provenance.mjs";
import {
  verifyDelegatedGoldReview,
  createCampaignAuthorizer,
} from "../scripts/rag-evaluation-campaign.mjs";

const bytes = readFileSync(
  new URL("../../../docs/evaluation-quality-cases-v2.json", import.meta.url),
);
const suite = JSON.parse(bytes);
test("checked-in delegated v2 review matches the frozen suite, without a human signature", () => {
  const record = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/evaluation-quality-gold-review-v2.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(verifyDelegatedGoldReview(bytes, record).cases, 24);
  assert.equal(record.sourceVerification.factCount, 10);
  assert.equal(record.sourceVerification.pages, 5);
});
const review = () => ({
  schema: "rag-delegated-gold-review-v1",
  phase: "PRE_EXECUTION_GOLD_REVIEW",
  revision: suite.revision,
  manifestSha256: sha256(bytes),
  corpusManifestSha256: suite.corpusManifestSha256,
  reviewer: {
    kind: "ai_under_user_delegation",
    name: "Test-owned reviewer",
    authority: "user-request-20261023-final-completion",
  },
  cases: suite.cases.map((c) => ({
    id: c.id,
    caseSha256: sha256(JSON.stringify(c)),
    decision: "ACCEPT_FOR_BASELINE",
    notes:
      "Checked against bound source pages and scope; no model outputs observed.",
  })),
});

test("delegated gold review binds all case bytes without pretending to be human review", () => {
  assert.equal(verifyDelegatedGoldReview(bytes, review()).cases, 24);
  for (const change of [
    (r) => {
      r.cases.pop();
    },
    (r) => {
      r.cases[0].caseSha256 = "0".repeat(64);
    },
    (r) => {
      r.cases[0].decision = "pending";
    },
    (r) => {
      r.reviewer.kind = "human";
    },
    (r) => {
      r.manifestSha256 = "0".repeat(64);
    },
    (r) => {
      r.cases[0].notes = "";
    },
  ]) {
    const bad = review();
    change(bad);
    assert.throws(
      () => verifyDelegatedGoldReview(bytes, bad),
      /GOLD_REVIEW_INVALID/,
    );
  }
});

test("campaign authority is pinned outside the batch and rejects tampering, unbound targets and excessive limits", async () => {
  const goldBytes = Buffer.from(JSON.stringify(review()));
  const binding = {
    suite: { revision: suite.revision, manifestSha256: sha256(bytes) },
    planSha256: "1".repeat(64),
    batch: { id: "B01", caseIds: ["RQ01"] },
    caseRequests: [{ id: "RQ01", requestSha256: "2".repeat(64) }],
    target: {
      base: "http://127.0.0.1:8080/api/",
      origin: "http://127.0.0.1:8080",
    },
    limits: { maxClientRequests: 1, sequential: true, retries: 0 },
  };
  const campaign = {
    schema: "rag-authorized-campaign-v1",
    authority: "user-request-20261023-final-completion",
    goldReviewSha256: sha256(goldBytes),
    expiresAt: "2026-10-24T00:00:00Z",
    limits: {
      budgetUsd: "1.00",
      stopBeforeDispatchUsd: "0.80",
      providerCalls: 200,
      batchRequests: 5,
      sequential: true,
      retries: 0,
    },
    phases: { baseline: { bindingSha256s: [sha256(canonicalJson(binding))] } },
  };
  const build = (c = campaign, pin) => {
    const campaignBytes = Buffer.from(JSON.stringify(c));
    return createCampaignAuthorizer({
      campaignBytes,
      campaignSha256: pin ?? sha256(campaignBytes),
      manifestBytes: bytes,
      goldReviewBytes: goldBytes,
      phase: "baseline",
      now: () => Date.parse("2026-10-23T10:00:00Z"),
    });
  };
  const authorize = build();
  const request = {
    binding,
    approval: {
      binds: binding,
      evidence: {
        campaignSha256: sha256(Buffer.from(JSON.stringify(campaign))),
        phase: "baseline",
        goldReviewSha256: sha256(goldBytes),
      },
    },
  };
  assert.equal((await authorize(request)).batch.status, "verified");
  const changed = structuredClone(request);
  changed.binding.target.origin = "http://other.invalid";
  assert.equal((await authorize(changed)).batch.status, "failed");
  assert.throws(
    () => build(campaign, "0".repeat(64)),
    /CAMPAIGN_AUTHORITY_INVALID/,
  );
  for (const mutate of [
    (c) => {
      c.limits.providerCalls = 201;
    },
    (c) => {
      c.limits.batchRequests = 6;
    },
    (c) => {
      c.limits.stopBeforeDispatchUsd = "0.81";
    },
    (c) => {
      c.expiresAt = "2026-10-22T00:00:00Z";
    },
    (c) => {
      c.phases.baseline.bindingSha256s = [];
    },
  ]) {
    const c = structuredClone(campaign);
    mutate(c);
    assert.throws(() => build(c), /CAMPAIGN_AUTHORITY_INVALID/);
  }
});
