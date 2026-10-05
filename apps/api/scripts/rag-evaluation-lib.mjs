import { Buffer } from "node:buffer";

export const EVALUATION_SCHEMA_VERSION = 2;

function pdfString(value) {
  return value.replace(/([^\x20-\x7e]|[\\()])/g, (character) => {
    if (character === "\\" || character === "(" || character === ")")
      return `\\${character}`;
    return "?";
  });
}

/** Build a deterministic, text-only PDF suitable for the extraction demo. */
export function makeEvaluationPdf(pageTexts) {
  if (!Array.isArray(pageTexts) || pageTexts.length === 0)
    throw new TypeError("At least one PDF page is required.");
  const objects = [];
  const pageObjectIds = pageTexts.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] ` +
    `/Count ${pageTexts.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (const [index, raw] of pageTexts.entries()) {
    if (typeof raw !== "string" || !raw.trim())
      throw new TypeError("Evaluation PDF pages must contain text.");
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const lines = raw.match(/.{1,82}(?:\s|$)/g) ?? [raw];
    const commands = lines
      .map(
        (line, lineIndex) =>
          `${lineIndex === 0 ? "72 720 Td" : "0 -18 Td"} (${pdfString(line.trim())}) Tj`,
      )
      .join("\n");
    const stream = `BT /F1 11 Tf ${commands} ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function markers(answer) {
  return typeof answer === "string"
    ? [...answer.matchAll(/\[(S[1-9][0-9]*)\]/g)].map((match) => match[1])
    : [];
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

/**
 * Evaluate only machine-verifiable response invariants. Semantic correctness
 * remains a named human-review step and is never reported as an automatic pass.
 */
export function evaluateLiveResult(caseDefinition, response) {
  const expected = caseDefinition.expected;
  const body = response.body;
  const checks = [
    check(
      "http_status",
      response.httpStatus === expected.httpStatus,
      `expected ${expected.httpStatus}, received ${response.httpStatus}`,
    ),
  ];

  if (expected.maxLatencyMs !== undefined) {
    checks.push(
      check(
        "latency",
        Number.isInteger(response.latencyMs) &&
          response.latencyMs <= expected.maxLatencyMs,
        `maximum ${expected.maxLatencyMs} ms, received ${response.latencyMs} ms`,
      ),
    );
  }

  if (expected.httpStatus === 200 && response.httpStatus === 200) {
    const validObject = Boolean(body && typeof body === "object");
    checks.push(check("json_object", validObject, "response must be JSON"));
    if (validObject) {
      const citations = Array.isArray(body.citations) ? body.citations : [];
      const answerMarkers = markers(body.answer);
      const citationIds = citations.map((item) => item?.sourceId);
      checks.push(
        check(
          "rag_metadata",
          body.mode === (caseDefinition.assistantMode ?? "documents") &&
            body.ragEnabled ===
              ((caseDefinition.assistantMode ?? "documents") === "documents") &&
            body.provider === "google" &&
            typeof body.model === "string" &&
            Boolean(body.model) &&
            typeof body.promptVersion === "string" &&
            Boolean(body.promptVersion),
          "mode/provider/model/promptVersion/ragEnabled must be consistent",
        ),
        check(
          "answer_shape",
          typeof body.answer === "string" &&
            Boolean(body.answer.trim()) &&
            typeof body.answerable === "boolean" &&
            Array.isArray(body.citations),
          "answer, answerable and citations must have the contract types",
        ),
        check(
          "reason_code",
          [
            "ANSWER_GENERATED",
            "PARTIAL_COVERAGE",
            "NO_RELEVANT_EVIDENCE",
          ].includes(body.reasonCode),
          "response must expose a stable reason code",
        ),
      );

      if (expected.reasonCode) {
        checks.push(
          check(
            "expected_reason_code",
            body.reasonCode === expected.reasonCode,
            `expected ${expected.reasonCode}, received ${String(body.reasonCode)}`,
          ),
        );
      }

      if (typeof expected.answerable === "boolean") {
        checks.push(
          check(
            "answerable",
            body.answerable === expected.answerable,
            `expected ${expected.answerable}, received ${String(body.answerable)}`,
          ),
        );
      }
      const minimum = expected.minCitations ?? 0;
      checks.push(
        check(
          "minimum_citations",
          citations.length >= minimum,
          `expected at least ${minimum}, received ${citations.length}`,
        ),
        check(
          "unique_citations",
          new Set(citationIds).size === citationIds.length,
          "source IDs must be unique",
        ),
        check(
          "citation_contract",
          citations.every(
            (citation) =>
              citation &&
              /^S[1-9][0-9]*$/.test(citation.sourceId) &&
              typeof citation.documentId === "string" &&
              Boolean(citation.documentId) &&
              typeof citation.chunkId === "string" &&
              Boolean(citation.chunkId) &&
              typeof citation.title === "string" &&
              Boolean(citation.title) &&
              (citation.page === null ||
                (Number.isInteger(citation.page) && citation.page > 0)) &&
              Number.isInteger(citation.chunkIndex) &&
              citation.chunkIndex >= 0,
          ),
          "citation shape only; existence and semantic support are separate checks",
        ),
        check(
          "inline_markers",
          new Set(answerMarkers).size === new Set(citationIds).size &&
            [...new Set(answerMarkers)].every((id) =>
              citationIds.includes(id),
            ) &&
            [...new Set(citationIds)].every((id) => answerMarkers.includes(id)),
          "inline source markers must match returned citations exactly",
        ),
      );

      for (const title of expected.requiredCitationTitles ?? []) {
        checks.push(
          check(
            `citation_title:${title}`,
            citations.some((citation) => citation?.title === title),
            `a validated citation to ${title} is required`,
          ),
        );
      }

      for (const [title, pages] of Object.entries(
        expected.allowedCitationPagesByTitle ?? {},
      )) {
        checks.push(
          check(
            `citation_gold_page:${title}`,
            citations
              .filter((citation) => citation?.title === title)
              .every((citation) => pages.includes(citation.page)),
            `citations to ${title} must point to a page known to contain the evaluated fact`,
          ),
        );
      }

      if (body.answerable === false) {
        checks.push(
          check(
            "unanswerable_has_no_sources",
            citations.length === 0 && answerMarkers.length === 0,
            "unanswerable responses must not claim a source",
          ),
        );
      }
    }
  }

  const failed = checks.some((item) => !item.passed);
  return {
    status: failed
      ? "fail"
      : caseDefinition.manualReview
        ? "review_required"
        : "auto_pass",
    checks,
  };
}

export const REPORT_SCHEMA_VERSION = 3;
export const RESULT_STATUSES = [
  "PASS",
  "FAIL",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "INCONCLUSIVE",
  "SKIP",
  "NOT_ATTEMPTED",
];

export function blockingReason(response) {
  const code = response.body?.code;
  if (code === "AI_UPSTREAM" && !response.rejection)
    return "AI_UPSTREAM_PROVIDER";
  if (
    [
      "EVALUATION_BUDGET_EXHAUSTED",
      "AI_QUOTA",
      "AI_AUTHENTICATION",
      "AI_NOT_CONFIGURED",
      "AI_UNAVAILABLE",
      "AI_TIMEOUT",
      "DATABASE_UNAVAILABLE",
      "STORAGE_UNAVAILABLE",
    ].includes(code)
  )
    return code;
  if (response.transportError || response.httpStatus === 0)
    return "NETWORK_OR_TIMEOUT";
  if ([401, 403, 429, 503, 504].includes(response.httpStatus))
    return `HTTP_${response.httpStatus}`;
  return null;
}

// Groups are facts with acceptable document/page alternatives, not chunk IDs.
// Multiple chunks on one page are not independent gold items.
function groupHits(groups, sources, requireFacts) {
  const hits = groups.map((group) => ({
    id: group.id,
    hit: group.alternatives.some((alternative) => {
      const matching = sources.filter(
        (source) =>
          (source.file ?? source.title) === alternative.file &&
          source.page === alternative.page,
      );
      return (
        matching.length > 0 &&
        (!requireFacts ||
          alternative.facts.every((id) =>
            matching.some((source) => source.factIds?.includes(id)),
          ))
      );
    }),
  }));
  const matched = hits.filter((item) => item.hit).length;
  return {
    matched,
    denominator: groups.length,
    fraction: groups.length ? matched / groups.length : null,
    hits,
  };
}

export function safeTrace(evidence) {
  return evidence.map((item, index) => ({
    rank: index + 1,
    sourceId: item.sourceId ?? null,
    documentId: item.documentId,
    chunkId: item.chunkId,
    title: item.documentName ?? item.title,
    page: item.sourcePage ?? item.page ?? null,
    chunkIndex: item.chunkIndex,
    score: Number.isFinite(item.score) ? item.score : "unknown",
    factIds: item.factIds ?? [],
  }));
}

export function evaluateQualityResult(item, response, observation = {}) {
  const blocked = blockingReason(response);
  const index = (observation.index ?? []).map((document) => ({
    ...document,
    coverage:
      document.totalPageCount == null || document.usefulTextPageCount == null
        ? "unknown"
        : document.usefulTextPageCount / document.totalPageCount,
    readyIsExtractionProof: false,
  }));
  const groups = item.goldGroups ?? [];
  const trace = observation.trace;
  const retrieval = Array.isArray(trace)
    ? {
        status: "observed",
        evidence: safeTrace(trace),
        groups: groupHits(groups, trace, true),
        allGroupsHit: groups.length
          ? groupHits(groups, trace, true).matched === groups.length
          : null,
        unit: "predeclared fact groups; all facts must be found across passages on an acceptable document/page alternative",
      }
    : {
        status: "unavailable",
        reason:
          "Final citations are not retrieval evidence; no exact context trace observed.",
      };
  if (blocked && item.group !== "failure_fallback")
    return {
      status: "BLOCKED",
      reason: blocked,
      index,
      retrieval,
      answer: { status: "not_evaluated" },
    };
  const structural = evaluateLiveResult(item, response);
  const checks = [...structural.checks];
  if (groups.length && Array.isArray(trace))
    checks.push(
      check(
        "all_gold_retrieval_fact_groups",
        retrieval.allGroupsHit,
        "Every required fact group must appear in the observed evidence; final citation page coverage is separate.",
      ),
    );
  const citations = Array.isArray(response.body?.citations)
    ? response.body.citations.filter((c) => c && typeof c === "object")
    : [];
  if (response.httpStatus === 200) {
    const answer =
      typeof response.body?.answer === "string" ? response.body.answer : "";
    checks.push(
      check(
        "marker_syntax",
        [...answer.matchAll(/\[S[^\]]*\]/g)].every(([marker]) =>
          /^\[S[1-9][0-9]*\]$/.test(marker),
        ),
        "Source-like markers must use [S1] syntax.",
      ),
    );
    if (observation.allowedDocumentIds)
      checks.push(
        check(
          "citation_scope",
          citations.every((c) =>
            observation.allowedDocumentIds.includes(c.documentId),
          ),
          "No citation may leave the verified scope.",
        ),
      );
    if (Array.isArray(trace) && observation.allowedDocumentIds)
      checks.push(
        check(
          "retrieval_scope",
          trace.every((e) =>
            observation.allowedDocumentIds.includes(e.documentId),
          ),
          "Observed evidence must remain inside verified scope.",
        ),
      );
    if (Array.isArray(trace))
      checks.push(
        check(
          "citation_in_observed_evidence",
          citations.every((c) =>
            trace.some(
              (e) =>
                e.chunkId === c.chunkId &&
                e.documentId === c.documentId &&
                (e.page ?? e.sourcePage) === c.page,
            ),
          ),
          "Citation membership in actual context, independent of semantic support.",
        ),
      );
    if (observation.verifiedCitations)
      checks.push(
        ...observation.verifiedCitations.map((c) =>
          check(
            `chunk_page_exists:${c.sourceId}`,
            c.exists,
            "Parameterized SELECT on approved corpus only.",
          ),
        ),
      );
  }
  const goldPageGroups = groupHits(groups, citations, false);
  if (groups.length && response.httpStatus === 200 && response.body?.answerable)
    checks.push(
      check(
        "all_gold_citation_page_groups",
        goldPageGroups.matched === groups.length,
        "Page membership is necessary, not proof of claim support.",
      ),
    );
  const injectionObserved =
    !item.injection ||
    (Array.isArray(trace) &&
      trace.some(
        (e) =>
          (e.title ?? e.file) === item.injection.file &&
          (e.page ?? e.sourcePage) === item.injection.page &&
          e.factIds?.includes(item.injection.fact),
      ));
  const review = observation.review;
  const validReview =
    review &&
    typeof review.reviewer === "string" &&
    review.reviewer.trim() &&
    typeof review.notes === "string" &&
    review.notes.trim() &&
    typeof review.factsCorrect === "boolean" &&
    typeof review.complete === "boolean" &&
    typeof review.abstentionCorrect === "boolean" &&
    Array.isArray(review.claims) &&
    (response.body?.answerable !== true || review.claims.length > 0) &&
    review.claims.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof c.claim === "string" &&
        c.claim.trim() &&
        typeof c.supported === "boolean" &&
        Array.isArray(c.sources) &&
        (c.sources.length > 0 || c.supported === false) &&
        c.sources.every(
          (s) =>
            s &&
            typeof s === "object" &&
            citations.some(
              (citation) =>
                citation.documentId === s.documentId &&
                citation.page === s.page,
            ),
        ),
    );
  const reviewPass =
    validReview &&
    review.factsCorrect &&
    review.complete &&
    review.abstentionCorrect &&
    review.claims.every((c) => c.supported);
  let status = checks.some((c) => !c.passed) ? "FAIL" : "REVIEW_REQUIRED";
  if (item.injection && !injectionObserved) status = "INCONCLUSIVE";
  else if (status !== "FAIL" && validReview) {
    const allCitationsVerified =
      response.body?.answerable !== true ||
      (Array.isArray(observation.verifiedCitations) &&
        citations.every((c) =>
          observation.verifiedCitations.some(
            (v) => v.sourceId === c.sourceId && v.exists,
          ),
        ));
    status = !reviewPass
      ? "FAIL"
      : allCitationsVerified
        ? "PASS"
        : "REVIEW_REQUIRED";
  }
  if (item.group === "failure_fallback" && status === "REVIEW_REQUIRED")
    status = "PASS";
  return {
    status,
    index,
    retrieval,
    answer: {
      checks,
      goldPageGroups,
      chunkExistence: observation.verifiedCitations ? "checked" : "unknown",
      semanticReview: validReview ? review : "pending",
      injectionObserved,
    },
  };
}

export function reportSummary(results) {
  const counts = Object.fromEntries(
    RESULT_STATUSES.map((status) => [
      status,
      results.filter((r) => r.assessment.status === status).length,
    ]),
  );
  const attempted = results.filter((r) => r.attempted);
  const quality = results.filter((r) => r.group === "pdf_quality");
  const valid = attempted.filter(
    (r) =>
      r.response?.httpStatus === 200 && Number.isFinite(r.response.latencyMs),
  );
  const times = valid.map((r) => r.response.latencyMs);
  return {
    counts,
    requestsAttempted: attempted.length,
    qualityDenominator: quality.length,
    qualityPasses: quality.filter((r) => r.assessment.status === "PASS").length,
    latency: {
      validSampleCount: times.length,
      meanMs: times.length
        ? times.reduce((a, b) => a + b, 0) / times.length
        : null,
      minMs: times.length ? Math.min(...times) : null,
      maxMs: times.length ? Math.max(...times) : null,
      blockedLatenciesMs: attempted
        .filter((r) => r.assessment.status === "BLOCKED")
        .map((r) => r.response?.latencyMs ?? null),
      interpretation:
        "Small descriptive sample; no production p95 or SLA claim.",
    },
  };
}

export function reportExitCode(results) {
  if (results.some((r) => r.assessment.status === "FAIL")) return 1;
  if (
    results.some((r) =>
      ["BLOCKED", "NOT_ATTEMPTED"].includes(r.assessment.status),
    )
  )
    return 3;
  if (
    results.some((r) =>
      ["REVIEW_REQUIRED", "INCONCLUSIVE", "SKIP"].includes(r.assessment.status),
    )
  )
    return 2;
  return 0;
}
