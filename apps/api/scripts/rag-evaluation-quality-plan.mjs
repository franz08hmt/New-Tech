// F09-B.2B.2 planner for a quality suite. Pure: it reads no file, environment,
// network, credential or execution record. It turns exact manifest bytes plus an operator
// mapping into an approvable plan: which requests the assistant API can really
// serve, in which batches, and what is deferred and why.
//
// Planning a request shape is not running it. Nothing here dispatches a
// generation, approves gold, or authorizes an execution.
import { corpusManifest, sha256 } from "./rag-evaluation-corpus.mjs";
import { validateQualitySuite } from "./rag-evaluation-quality.mjs";
import {
  PROVENANCE_PROTOCOL,
  PROVENANCE_SCHEMA_VERSION,
  canonicalJson,
  provenanceTargetBinding,
  validateProvenanceRequest,
} from "./rag-evaluation-provenance.mjs";

export const QUALITY_PLAN_VERSION = 1;
export const REQUEST_SHAPE_VERSION = 1;
export const SUITE_PATH = /^docs\/evaluation-quality-cases-v[1-9][0-9]*\.json$/;
export const MAPPING_SCHEMA = "rag-quality-mapping-v1";
export const EXECUTION_BLOCK_REASON = "QUALITY_SUITE_EXECUTION_NOT_IMPLEMENTED";
const CASE_ID = /^RQ[0-9]{2}$/;
const CHAT_PATH = "assistant/chat";

export class QualityPlanError extends Error {
  // Like the other evaluation errors, the message is the code only.
  constructor(code) {
    super(code);
    this.name = "QualityPlanError";
    this.code = code;
  }
}
const fail = (code) => new QualityPlanError(code);

const keyOf = (files) => [...files].sort().join("|");

/** Exact bytes in, validated suite out. The hash is of the bytes, not of a parse. */
export function loadQualitySuite(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error();
    const definition = JSON.parse(bytes.toString("utf8"));
    validateQualitySuite(definition);
    const corpus = corpusManifest();
    if (definition.corpusManifestSha256 !== sha256(JSON.stringify(corpus)))
      throw new Error();
    return { definition, bytes, manifestSha256: sha256(bytes), corpus };
  } catch {
    throw fail("QUALITY_SUITE_INVALID");
  }
}

const MAPPING_KEYS = [
  "schemaVersion",
  "corpusRevision",
  "documents",
  "scopes",
  "provenanceTarget",
];

/**
 * The operator's mapping: documents per corpus file, one course per course file
 * set the suite uses (a policy-only course needs its own policy copy), and the
 * target identity the provenance audit is bound to. Validation is the audit's
 * own request validator, so the planner and the verifier cannot disagree.
 */
export function parseQualityMapping(input, suite) {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).sort().join() !== [...MAPPING_KEYS].sort().join() ||
      input.schemaVersion !== MAPPING_SCHEMA
    )
      throw new Error();
    const parsed = validateProvenanceRequest({
      manifestBytes: suite.bytes,
      corpus: suite.corpus,
      target: input.provenanceTarget,
      mapping: {
        corpusRevision: input.corpusRevision,
        documents: input.documents,
      },
      scopes: input.scopes,
    });
    return {
      mapping: parsed.mapping,
      scopes: parsed.scopes,
      target: parsed.target,
      audited: parsed.audited,
    };
  } catch {
    throw fail("QUALITY_MAPPING_INVALID");
  }
}

let dto;
async function chatContract() {
  dto ??= (async () => {
    await import("reflect-metadata");
    const [{ AssistantChatDto }, transformer, validator] = await Promise.all([
      import("../dist/assistant/assistant-chat.dto.js"),
      import("class-transformer"),
      import("class-validator"),
    ]);
    return { AssistantChatDto, ...transformer, ...validator };
  })();
  return dto;
}

/**
 * Problems with a request body, judged by the assistant's own DTO plus the
 * routing rules its service applies (summaries need one document; a question
 * needs a document or a course; document modes only). Empty means the shape is
 * valid for the API; it says nothing about whether the request ever ran.
 */
export async function requestShapeProblems(body) {
  const { AssistantChatDto, plainToInstance, validate } = await chatContract();
  const problems = [];
  const errors = await validate(plainToInstance(AssistantChatDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  for (const error of errors) problems.push(`DTO_${error.property}`);
  if (body.mode !== "documents") problems.push("DOCUMENT_MODE_REQUIRED");
  if (body.operation === "summarize" && !body.documentId)
    problems.push("DOCUMENT_SELECTION_REQUIRED");
  if (body.operation === "question" && !body.documentId && !body.courseId)
    problems.push("SCOPE_REQUIRED");
  return problems;
}

function buildBody(item, resolved) {
  const scope = item.scope;
  const body = {
    message: item.question,
    mode: item.api.mode,
    operation: item.api.operation,
    pageContext: { pageId: "evaluation", pageName: "RAG evaluation" },
  };
  if (scope.kind === "document")
    body.documentId = resolved.mapping.documents[scope.file];
  else {
    const course = resolved.scopes.find(
      (s) => keyOf(s.files) === keyOf(scope.courseFiles),
    );
    if (!course) throw fail("QUALITY_MAPPING_INVALID");
    if (scope.kind === "intersection") {
      body.documentId = course.documents[scope.file];
      if (!body.documentId) throw fail("QUALITY_MAPPING_INVALID");
    }
    body.courseId = course.courseId;
  }
  return body;
}

async function planCase(item, resolved) {
  const base = {
    id: item.id,
    scopeKind: item.scope.kind,
    operation: item.api.operation,
  };
  // The assistant summarizes one indexed document at a time; a course scope has
  // no summary path. It is reported unsupported, never rewritten as a question.
  if (item.api.operation === "summarize" && item.scope.kind === "course")
    return {
      ...base,
      support: "unsupported",
      reason: "SUMMARY_REQUIRES_ONE_DOCUMENT",
    };
  const body = buildBody(item, resolved);
  if ((await requestShapeProblems(body)).length)
    return {
      ...base,
      support: "unsupported",
      reason: "REQUEST_SHAPE_REJECTED",
    };
  const request = { method: "POST", path: CHAT_PATH, body };
  return {
    ...base,
    support: "supported",
    shapeValidated: true,
    request,
    requestSha256: sha256(canonicalJson(request)),
  };
}

function batchesOf(cases, batchSize) {
  const supported = cases.filter((c) => c.support === "supported");
  const batches = [];
  for (let i = 0; i < supported.length; i += batchSize) {
    const slice = supported.slice(i, i + batchSize);
    const body = {
      id: `quality-batch-${batches.length + 1}`,
      caseIds: slice.map((c) => c.id),
    };
    batches.push({
      ...body,
      batchSha256: sha256(
        canonicalJson({ ...body, requests: slice.map((c) => c.requestSha256) }),
      ),
    });
  }
  return batches;
}

/**
 * @returns {{plan, planSha256, suite, resolved}} The plan hash covers the exact
 * manifest, the mapping and course scopes, the configured targets, the selection
 * and its order, the batches and the contract versions.
 */
export async function planQualitySuite({
  manifestBytes,
  mappingInput,
  target,
  options,
}) {
  const suite = loadQualitySuite(manifestBytes);
  const resolved = parseQualityMapping(mappingInput, suite);
  return {
    ...(await assembleQualityPlan({ suite, resolved, target, options })),
    suite,
    resolved,
  };
}

/**
 * The canonical assembly of a plan from a validated suite and mapping. The
 * planner uses it, and so does anyone who must check that a plan they were handed
 * is exactly what the planner would have produced from the same inputs.
 */
export async function assembleQualityPlan({
  suite,
  resolved,
  target,
  options,
}) {
  const { batchSize, timeoutMs, only } = options;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10)
    throw fail("QUALITY_BATCH_INVALID");
  const all = suite.definition.cases;
  let ids = all.map((c) => c.id);
  if (only !== undefined) {
    const requested = String(only).split(",");
    if (
      requested.some((id) => !CASE_ID.test(id)) ||
      new Set(requested).size !== requested.length ||
      requested.some((id) => !ids.includes(id))
    )
      throw fail("QUALITY_SELECTION_INVALID");
    ids = ids.filter((id) => requested.includes(id));
  }
  const cases = [];
  for (const id of ids)
    cases.push(
      await planCase(
        all.find((c) => c.id === id),
        resolved,
      ),
    );
  const batches = batchesOf(cases, batchSize);
  const plan = {
    version: QUALITY_PLAN_VERSION,
    kind: "authenticated_http_quality_suite",
    contracts: {
      planner: QUALITY_PLAN_VERSION,
      requestShape: REQUEST_SHAPE_VERSION,
      provenanceProtocol: PROVENANCE_PROTOCOL,
      provenanceSchemaVersion: PROVENANCE_SCHEMA_VERSION,
    },
    suite: {
      revision: suite.definition.revision,
      status: suite.definition.status,
      manifestSha256: suite.manifestSha256,
      corpusRevision: suite.definition.corpusRevision,
      corpusManifestSha256: suite.definition.corpusManifestSha256,
    },
    target: { base: target.base.href, origin: target.origin },
    timeoutMs,
    provenanceTarget: provenanceTargetBinding(resolved.target),
    mapping: {
      documents: Object.keys(resolved.mapping.documents)
        .sort()
        .map((file) => ({ file, id: resolved.mapping.documents[file] })),
      scopes: [...resolved.scopes]
        .sort((a, b) => keyOf(a.files).localeCompare(keyOf(b.files)))
        .map((s) => ({
          files: s.files,
          courseId: s.courseId,
          documents: s.documents,
        })),
    },
    selection: { requested: only === undefined ? "all" : ids, caseIds: ids },
    cases,
    batches,
    deferred: cases
      .filter((c) => c.support === "unsupported")
      .map((c) => ({ id: c.id, reason: c.reason })),
    limits: {
      datasetSize: all.length,
      selected: ids.length,
      supportedSelected: cases.filter((c) => c.support === "supported").length,
      batchSize,
      maxRequestsPerBatch: batchSize,
    },
    approvals: {
      goldReview: "GOLD_REVIEW_PENDING",
      batchApproval: "none",
      executionAuthorized: false,
    },
    execution: {
      generationRequests: 0,
      status: "BLOCKED",
      reason: EXECUTION_BLOCK_REASON,
    },
  };
  validateQualityPlan(plan);
  return { plan, planSha256: sha256(canonicalJson(plan)) };
}

/** Structural invariants that must hold however the plan was produced or edited. */
export function validateQualityPlan(plan) {
  const bad = () => fail("QUALITY_PLAN_INVALID");
  try {
    if (
      plan.version !== QUALITY_PLAN_VERSION ||
      plan.kind !== "authenticated_http_quality_suite" ||
      canonicalJson(plan.approvals) !==
        canonicalJson({
          goldReview: "GOLD_REVIEW_PENDING",
          batchApproval: "none",
          executionAuthorized: false,
        }) ||
      canonicalJson(plan.execution) !==
        canonicalJson({
          generationRequests: 0,
          status: "BLOCKED",
          reason: EXECUTION_BLOCK_REASON,
        })
    )
      throw bad();
    const ids = plan.cases.map((c) => c.id);
    if (
      new Set(ids).size !== ids.length ||
      canonicalJson(ids) !== canonicalJson(plan.selection.caseIds)
    )
      throw bad();
    const supported = plan.cases.filter((c) => c.support === "supported");
    const unsupported = plan.cases.filter((c) => c.support === "unsupported");
    if (supported.length + unsupported.length !== plan.cases.length)
      throw bad();
    const { batchSize, maxRequestsPerBatch } = plan.limits;
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 10 ||
      maxRequestsPerBatch !== batchSize ||
      plan.limits.selected !== ids.length ||
      plan.limits.supportedSelected !== supported.length
    )
      throw bad();
    const flat = plan.batches.flatMap((b) => b.caseIds);
    // Every supported case once, in suite order, and nothing else in a batch.
    if (canonicalJson(flat) !== canonicalJson(supported.map((c) => c.id)))
      throw bad();
    plan.batches.forEach((batch, index) => {
      const members = batch.caseIds.map((id) =>
        plan.cases.find((c) => c.id === id),
      );
      if (
        batch.id !== `quality-batch-${index + 1}` ||
        batch.caseIds.length < 1 ||
        batch.caseIds.length > maxRequestsPerBatch ||
        batch.batchSha256 !==
          sha256(
            canonicalJson({
              id: batch.id,
              caseIds: batch.caseIds,
              requests: members.map((c) => c.requestSha256),
            }),
          )
      )
        throw bad();
    });
    if (
      canonicalJson(plan.deferred) !==
      canonicalJson(unsupported.map((c) => ({ id: c.id, reason: c.reason })))
    )
      throw bad();
  } catch (error) {
    throw error instanceof QualityPlanError ? error : bad();
  }
}

/** One short, identifier-free description for stdout. */
export function summarizePlan({ plan, planSha256 }) {
  return (
    `Quality suite ${plan.suite.revision}: ${plan.limits.supportedSelected} supported, ` +
    `${plan.deferred.length} deferred of ${plan.limits.selected} selected ` +
    `(dataset ${plan.limits.datasetSize}); ${plan.batches.length} batches of at most ` +
    `${plan.limits.maxRequestsPerBatch}; generationRequests=0; executionAuthorized=false; ` +
    `planSha256=${planSha256}`
  );
}
