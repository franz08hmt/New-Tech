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
          "each citation must identify an existing document chunk",
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
            `citation_support:${title}`,
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
