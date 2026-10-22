// A separate process running the quality batch executor with injected, synthetic
// prerequisites. Used to race real processes on one batch ledger.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { planQualitySuite } from "../../scripts/rag-evaluation-quality-plan.mjs";
import { canonicalJson } from "../../scripts/rag-evaluation-provenance.mjs";
import {
  BATCH_APPROVAL_SCHEMA,
  batchBinding,
  executeQualityBatch,
} from "../../scripts/rag-evaluation-quality-executor.mjs";

const config = JSON.parse(process.env.F09B25_CHILD);
const key = Buffer.from(config.keyHex, "hex");
const sign = (binds) =>
  createHmac("sha256", key).update(canonicalJson(binds)).digest("hex");
try {
  const manifestBytes = readFileSync(config.manifestPath);
  const planned = await planQualitySuite({
    manifestBytes,
    mappingInput: config.mapping,
    target: { base: new URL(config.base), origin: config.origin },
    options: config.options,
  });
  const binds = batchBinding(planned, config.batchId);
  const report = await executeQualityBatch({
    planned,
    batchId: config.batchId,
    approval: {
      schema: BATCH_APPROVAL_SCHEMA,
      binds,
      evidence: { signature: sign(binds) },
    },
    authorize: async ({ approval, binding }) =>
      approval.evidence?.signature === sign(binding)
        ? { goldReview: { status: "verified" }, batch: { status: "verified" } }
        : { goldReview: { status: "failed" }, batch: { status: "failed" } },
    targetEquivalence: async () => ({ status: "verified" }),
    provenance: { manifestBytes, ...config.provenance },
    credentials: async () => config.credentials,
    ledgerDir: config.ledgerDir,
  });
  process.stdout.write(
    JSON.stringify({
      status: report.status,
      reason: report.refusal?.reason ?? null,
      generationRequests: report.generationRequests,
    }) + "\n",
  );
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: error.code ?? error.message }) + "\n",
  );
  process.exitCode = 1;
}
