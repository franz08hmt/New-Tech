import {
  corpusManifest,
  corpusDocuments,
  sha256,
} from "./rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "./rag-evaluation-lib.mjs";
import { eligibleCases } from "./rag-evaluation-http-lib.mjs";
import legacy from "../../../docs/evaluation-cases.json" with { type: "json" };

// Offline authoring only. No adapter execution, principal, credentials or ledger.
// A new schema avoids changing v3's meaning or its ten-live-case manifest cap.
const tags = [
  "grounded",
  "document",
  "course",
  "intersection",
  "no_evidence",
  "vietnamese",
  "injection",
  "summary",
];
const corpus = corpusManifest();
const digest = (value) => sha256(JSON.stringify(value));
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 4000;
const unique = (values) => new Set(values).size === values.length;
const equalSet = (a, b) =>
  Array.isArray(a) &&
  unique(a) &&
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function requireThat(condition, part) {
  if (!condition)
    throw Object.assign(new Error(`QUALITY_${part}_INVALID`), {
      code: `QUALITY_${part}_INVALID`,
    });
}
function keys(value, required, optional, part) {
  requireThat(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      required.every((k) => Object.hasOwn(value, k)) &&
      Object.keys(value).every(
        (k) => required.includes(k) || optional.includes(k),
      ),
    part,
  );
}
function scopeFiles(scope) {
  return scope.kind === "course" ? scope.courseFiles : [scope.file];
}
function compatible(item) {
  return (
    eligibleCases({
      cases: [
        {
          mode: "live",
          group: "pdf_quality",
          scope: item.scope,
          assistantMode: item.api.mode,
          operation: item.api.operation,
        },
      ],
    }).length === 1
  );
}

export function validateQualitySuite(definition) {
  keys(
    definition,
    [
      "schemaVersion",
      "revision",
      "status",
      "corpusRevision",
      "corpusManifestSha256",
      "limitations",
      "cases",
    ],
    [],
    "SCHEMA",
  );
  requireThat(
    definition.schemaVersion === "rag-quality-suite-v1" &&
      /^rag-quality-\d{8}-v[1-9]\d*$/.test(definition.revision) &&
      Array.isArray(definition.cases) &&
      definition.cases.length >= 20 &&
      definition.cases.length <= 40,
    "SCHEMA",
  );
  requireThat(definition.status === "DRAFT_REVIEW_REQUIRED", "REVIEW");
  requireThat(
    definition.corpusRevision === corpus.corpusRevision &&
      definition.corpusManifestSha256 === digest(corpus),
    "CORPUS",
  );
  requireThat(
    Array.isArray(definition.limitations) &&
      definition.limitations.length >= 3 &&
      definition.limitations.every(nonempty),
    "SCHEMA",
  );
  const ids = new Set(),
    objectives = new Set(),
    questions = new Set();
  const coverage = Object.fromEntries(tags.map((t) => [t, 0]));
  const operationCompatible = [],
    unsupported = [];
  for (const item of definition.cases) {
    requireThat(item?.humanReview, "REVIEW");
    keys(
      item,
      [
        "id",
        "objective",
        "language",
        "kind",
        "question",
        "scope",
        "api",
        "coverage",
        "expected",
        "goldGroups",
        "humanReview",
        "transport",
        "legacyRelation",
      ],
      ["noEvidence"],
      "CASE",
    );
    requireThat(/^RQ\d{2}$/.test(item.id) && !ids.has(item.id), "CASE_ID");
    ids.add(item.id);
    const question =
      typeof item.question === "string"
        ? item.question
            .normalize("NFC")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase()
        : "";
    requireThat(
      /^[a-z][a-z0-9-]{2,79}$/.test(item.objective) &&
        !objectives.has(item.objective) &&
        nonempty(item.question) &&
        !questions.has(question),
      "OBJECTIVE",
    );
    objectives.add(item.objective);
    questions.add(question);
    requireThat(["vi", "en"].includes(item.language), "CASE");
    keys(item.scope, ["kind"], ["file", "courseFiles"], "SCOPE");
    requireThat(
      ["document", "course", "intersection"].includes(item.scope.kind),
      "SCOPE",
    );
    const known = (f) => corpus.documents.some((d) => d.file === f);
    if (item.scope.kind !== "document")
      requireThat(
        Array.isArray(item.scope.courseFiles) &&
          item.scope.courseFiles.length > 0 &&
          unique(item.scope.courseFiles) &&
          item.scope.courseFiles.every(known),
        "SCOPE",
      );
    else requireThat(item.scope.courseFiles === undefined, "SCOPE");
    if (item.scope.kind !== "course")
      requireThat(
        known(item.scope.file) &&
          (item.scope.kind !== "intersection" ||
            item.scope.courseFiles.includes(item.scope.file)),
        "SCOPE",
      );
    else requireThat(item.scope.file === undefined, "SCOPE");
    keys(item.api, ["method", "path", "mode", "operation"], [], "API");
    requireThat(
      item.api.method === "POST" &&
        item.api.path === "/api/assistant/chat" &&
        item.api.mode === "documents" &&
        ["question", "summarize"].includes(item.api.operation),
      "API",
    );
    keys(
      item.expected,
      ["answerable", "minCitations", "requiredBehavior", "failureCriteria"],
      [],
      "EXPECTED",
    );
    const grounded = item.expected.answerable;
    requireThat(
      typeof grounded === "boolean" &&
        item.expected.minCitations === (grounded ? 1 : 0) &&
        nonempty(item.expected.requiredBehavior) &&
        Array.isArray(item.expected.failureCriteria) &&
        item.expected.failureCriteria.length > 0 &&
        item.expected.failureCriteria.every(nonempty),
      "EXPECTED",
    );
    requireThat(
      ["grounded", "refusal", "injection", "summary"].includes(item.kind) &&
        (grounded ? item.kind !== "refusal" : item.kind === "refusal") &&
        (item.api.operation === "summarize") === (item.kind === "summary"),
      "CASE",
    );
    const derived = [
      grounded ? "grounded" : "no_evidence",
      item.scope.kind,
      ...(item.language === "vi" ? ["vietnamese"] : []),
      ...(item.kind === "summary" ? ["summary"] : []),
    ];
    // Injection may intersect summary/grounded; it is explicitly authored and
    // must bind the malicious fact below, not merely label arbitrary questions.
    if (
      item.kind === "injection" ||
      (Array.isArray(item.coverage) && item.coverage.includes("injection"))
    )
      derived.push("injection");
    requireThat(equalSet(item.coverage, derived), "COVERAGE");
    for (const t of derived) coverage[t]++;
    const allowedFiles = scopeFiles(item.scope);
    requireThat(
      Array.isArray(item.goldGroups) &&
        (grounded ? item.goldGroups.length > 0 : item.goldGroups.length === 0),
      "GOLD",
    );
    const groupIds = new Set();
    for (const group of item.goldGroups) {
      keys(group, ["id", "alternatives"], [], "GOLD");
      requireThat(
        nonempty(group.id) &&
          !groupIds.has(group.id) &&
          Array.isArray(group.alternatives) &&
          group.alternatives.length > 0,
        "GOLD",
      );
      groupIds.add(group.id);
      for (const a of group.alternatives) {
        keys(
          a,
          ["file", "sha256", "corpusRevision", "page", "facts"],
          [],
          "GOLD",
        );
        const doc = corpus.documents.find((d) => d.file === a.file);
        requireThat(
          doc &&
            allowedFiles.includes(a.file) &&
            a.sha256 === doc.sha256 &&
            a.corpusRevision === corpus.corpusRevision &&
            Number.isInteger(a.page) &&
            a.page >= 1 &&
            a.page <= doc.pageCount &&
            Array.isArray(a.facts) &&
            a.facts.length > 0 &&
            unique(a.facts) &&
            a.facts.every((id) =>
              doc.facts.some((f) => f.id === id && f.page === a.page),
            ),
          "GOLD",
        );
      }
    }
    if (derived.includes("injection"))
      requireThat(
        item.goldGroups.some((g) =>
          g.alternatives.some((a) => a.facts.includes("injection")),
        ),
        "GOLD",
      );
    if (!grounded) {
      keys(
        item.noEvidence,
        ["reason", "oracle", "sourceFiles"],
        [],
        "NO_EVIDENCE",
      );
      requireThat(
        nonempty(item.noEvidence.reason) &&
          nonempty(item.noEvidence.oracle) &&
          equalSet(item.noEvidence.sourceFiles, allowedFiles),
        "NO_EVIDENCE",
      );
    } else requireThat(item.noEvidence === undefined, "GOLD");
    keys(item.humanReview, ["status", "criteria"], [], "REVIEW");
    requireThat(
      item.humanReview.status === "pending" &&
        Array.isArray(item.humanReview.criteria) &&
        item.humanReview.criteria.length >= 3 &&
        item.humanReview.criteria.every(nonempty),
      "REVIEW",
    );
    keys(
      item.transport,
      ["operationSupported", "executableNow", "reason"],
      [],
      "TRANSPORT",
    );
    const supported = compatible(item);
    const reason =
      item.scope.kind !== "document"
        ? "SCOPE_NOT_SUPPORTED"
        : item.api.operation !== "question"
          ? "SUMMARY_NOT_SUPPORTED"
          : "NEW_MANIFEST_NOT_WIRED";
    requireThat(
      item.transport.operationSupported === supported &&
        item.transport.executableNow === false &&
        item.transport.reason === reason,
      "TRANSPORT",
    );
    (supported ? operationCompatible : unsupported).push(item.id);
    if (item.legacyRelation !== null) {
      keys(item.legacyRelation, ["id", "relation"], [], "CASE");
      requireThat(
        /^E\d{2}$/.test(item.legacyRelation.id) &&
          legacy.cases.some((c) => c.id === item.legacyRelation.id) &&
          nonempty(item.legacyRelation.relation),
        "CASE",
      );
    }
  }
  // Unique objectives are a machine prerequisite, not proof of semantic variety:
  // the two human reviewers must approve the substantive distinctions too.
  const minimum = {
    grounded: 12,
    document: 6,
    course: 2,
    intersection: 2,
    no_evidence: 4,
    vietnamese: 6,
    injection: 2,
    summary: 3,
  };
  requireThat(
    tags.every((t) => coverage[t] >= minimum[t]),
    "COVERAGE",
  );
  return {
    status: definition.status,
    caseCount: definition.cases.length,
    coverage,
    operationCompatible,
    unsupported,
    executable: 0,
    executed: 0,
    humanApproved: 0,
  };
}

export function planQualityBatches(definition, maxRequests = 5) {
  const result = validateQualitySuite(definition);
  requireThat(
    Number.isInteger(maxRequests) && maxRequests >= 1 && maxRequests <= 10,
    "BATCH",
  );
  const batches = [];
  for (let i = 0; i < result.operationCompatible.length; i += maxRequests)
    batches.push({
      id: `proposed-${batches.length + 1}`,
      caseIds: result.operationCompatible.slice(i, i + maxRequests),
    });
  const plan = {
    revision: definition.revision,
    definitionSha256: digest(definition),
    corpusManifestSha256: definition.corpusManifestSha256,
    status: "PROPOSED_NOT_EXECUTABLE",
    dispatchAllowed: false,
    maxRequests,
    providerCalls: null,
    executed: 0,
    batches,
    deferredCaseIds: result.unsupported,
  };
  validateBatchPlan(definition, plan);
  return plan;
}

export function validateBatchPlan(definition, plan) {
  const result = validateQualitySuite(definition);
  requireThat(
    plan &&
      plan.status === "PROPOSED_NOT_EXECUTABLE" &&
      plan.revision === definition.revision &&
      plan.definitionSha256 === digest(definition) &&
      plan.corpusManifestSha256 === definition.corpusManifestSha256 &&
      plan.dispatchAllowed === false &&
      plan.executed === 0 &&
      plan.providerCalls === null &&
      Number.isInteger(plan.maxRequests) &&
      plan.maxRequests >= 1 &&
      plan.maxRequests <= 10 &&
      Array.isArray(plan.batches),
    "BATCH",
  );
  const ids = [];
  const batchIds = [];
  for (const b of plan.batches) {
    requireThat(
      b &&
        nonempty(b.id) &&
        !batchIds.includes(b.id) &&
        Array.isArray(b.caseIds) &&
        b.caseIds.length > 0 &&
        b.caseIds.length <= plan.maxRequests,
      "BATCH",
    );
    batchIds.push(b.id);
    ids.push(...b.caseIds);
  }
  requireThat(
    equalSet(ids, result.operationCompatible) &&
      equalSet(plan.deferredCaseIds, result.unsupported),
    "BATCH",
  );
}

function reviewCases(definition) {
  return definition.cases.map((item) => ({
    ...structuredClone(item),
    caseSha256: digest(item),
    sourcePages: scopeFiles(item.scope).flatMap((file) => {
      const doc = corpusDocuments.find((d) => d.file === file);
      return doc.pages.map((text, i) => ({
        file,
        page: i + 1,
        sha256: corpus.documents.find((d) => d.file === file).sha256,
        text,
      }));
    }),
    reviews: ["Tài", "Thắng"].map((assignedTo) => ({
      assignedTo,
      reviewer: "",
      reviewedAt: null,
      decision: null,
      notes: "",
    })),
  }));
}
export function buildGoldReviewPack(definition, manifestBytes) {
  validateQualitySuite(definition);
  requireThat(
    digest(JSON.parse(manifestBytes.toString("utf8"))) === digest(definition),
    "REVIEW_BINDING",
  );
  return {
    schemaVersion: 1,
    phase: "PRE_EXECUTION_GOLD_REVIEW",
    status: "GOLD_REVIEW_PENDING",
    revision: definition.revision,
    manifestSha256: sha256(manifestBytes),
    corpusManifestSha256: digest(corpus),
    rubric: [
      "Check each required fact, exact source/page, acceptable paraphrases, scope exclusions and no-evidence oracle.",
      "Confirm distinct objectives and useful coverage, not count inflation by paraphrase.",
      "Read injection in context; keyword occurrence alone is not evidence of obedience.",
      "No approval is issued by this tool. Hand completed reviews to the maintainers for a separately bound freeze decision.",
      "This is gold authoring review, not model-output semantic review or runtime corpus provenance attestation.",
    ],
    cases: reviewCases(definition),
  };
}
export function verifyGoldReviewBinding(definition, manifestBytes, pack) {
  // This slice exports/validates a pending template only. A future human approval
  // ingestion workflow is not silently implemented via editable decision strings.
  let expected;
  try {
    expected = buildGoldReviewPack(definition, manifestBytes);
  } catch {
    requireThat(false, "REVIEW_BINDING");
  }
  requireThat(digest(pack) === digest(expected), "REVIEW_BINDING");
}

export async function verifyPdfGold(definition, extractor) {
  validateQualitySuite(definition);
  if (!extractor) {
    const { PdfTextExtractorService } =
      await import("../dist/documents/pdf-text-extractor.service.js");
    extractor = new PdfTextExtractorService();
  }
  const documents = [];
  let factCount = 0;
  const normalize = (s) => s.replace(/\s+/g, " ").trim();
  for (const doc of corpusDocuments) {
    const bytes = makeEvaluationPdf(doc.pages);
    const frozen = corpus.documents.find((d) => d.file === doc.file);
    requireThat(sha256(bytes) === frozen.sha256, "PDF_BINDING");
    const pages = await extractor.extract(bytes);
    requireThat(pages.length === frozen.pageCount, "PDF_BINDING");
    for (const fact of frozen.facts) {
      const page = pages.find((p) => p.page === fact.page);
      requireThat(
        page &&
          typeof page.text === "string" &&
          normalize(page.text).includes(normalize(fact.text)),
        "PDF_BINDING",
      );
      factCount++;
    }
    documents.push({
      file: doc.file,
      sha256: frozen.sha256,
      pageCount: pages.length,
      verifiedFactIds: frozen.facts.map((f) => f.id),
    });
  }
  return {
    method:
      "deterministic PDF bytes + production local text extractor + frozen page/fact substring",
    factCount,
    documents,
    runtimeProvenanceAttested: false,
  };
}

export function parseQualityArguments(args) {
  const options = { batchSize: 5 },
    seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i],
      value = args[++i];
    requireThat(
      ["--output", "--batch-size"].includes(flag) &&
        !seen.has(flag) &&
        typeof value === "string" &&
        !value.startsWith("--"),
      "ARGUMENT",
    );
    seen.add(flag);
    if (flag === "--output") options.output = value;
    else {
      requireThat(/^(?:[1-9]|10)$/.test(value), "ARGUMENT");
      options.batchSize = Number(value);
    }
  }
  return options;
}
