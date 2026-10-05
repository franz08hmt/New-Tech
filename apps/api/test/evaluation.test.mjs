import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  evaluateLiveResult,
  makeEvaluationPdf,
} from "../scripts/rag-evaluation-lib.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import * as evaluation from "../scripts/rag-evaluation-lib.mjs";

const goldCase = {
  ...caseDefinitionPlaceholder(),
  group: "pdf_quality",
  goldGroups: [
    {
      id: "duration",
      alternatives: [{ file: "source.pdf", page: 2, facts: ["duration"] }],
    },
    {
      id: "deadline",
      alternatives: [{ file: "policy.pdf", page: 1, facts: ["deadline"] }],
    },
  ],
};
function caseDefinitionPlaceholder() {
  return {
    expected: { httpStatus: 200, answerable: true, minCitations: 1 },
    manualReview: "Review every claim.",
  };
}
function qualityResponse(citations = [citation]) {
  return {
    httpStatus: 200,
    latencyMs: 20,
    body: {
      answer: citations.map((c) => `Claim [${c.sourceId}]`).join(" "),
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations,
      provider: "google",
      model: "test",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    },
  };
}

test("v3 evaluator fails a shape-valid citation on the wrong gold page", () => {
  const result = evaluation.evaluateQualityResult(
    goldCase,
    qualityResponse([{ ...citation, page: 9 }]),
  );
  assert.equal(result.status, "FAIL");
});
test("v3 distinguishes final citation coverage from unavailable retrieval", () => {
  const result = evaluation.evaluateQualityResult(goldCase, qualityResponse());
  assert.equal(result.answer.goldPageGroups.matched, 1);
  assert.equal(result.answer.goldPageGroups.denominator, 2);
  assert.equal(result.status, "FAIL");
  assert.equal(result.retrieval.status, "unavailable");
});
test("v3 detects malformed marker even beside valid markers", () => {
  const response = qualityResponse();
  response.body.answer += " [S1, S2]";
  assert.equal(
    evaluation.evaluateQualityResult({ ...goldCase, goldGroups: [] }, response)
      .status,
    "FAIL",
  );
});
test("v3 unknown coverage stays unknown and review without reviewer cannot pass", () => {
  const result = evaluation.evaluateQualityResult(
    { ...goldCase, goldGroups: [] },
    qualityResponse(),
    { index: [{ processingStatus: "ready", totalPageCount: null }] },
  );
  assert.equal(result.index[0].coverage, "unknown");
  assert.equal(result.status, "REVIEW_REQUIRED");
});
test("v3 injection is inconclusive unless malicious evidence reached context", () => {
  const item = {
    ...goldCase,
    goldGroups: [],
    injection: { file: "source.pdf", page: 3, fact: "injection" },
  };
  assert.equal(
    evaluation.evaluateQualityResult(item, qualityResponse()).status,
    "INCONCLUSIVE",
  );
  assert.equal(
    evaluation.evaluateQualityResult(item, qualityResponse(), { trace: [] })
      .status,
    "INCONCLUSIVE",
  );
});
test("v3 trace measures all evidence groups, never similarity as probability", () => {
  const trace = [{ ...citation, score: 0.9, factIds: ["duration"] }];
  const result = evaluation.evaluateQualityResult(goldCase, qualityResponse(), {
    trace,
  });
  assert.equal(result.retrieval.groups.matched, 1);
  assert.equal(result.retrieval.allGroupsHit, false);
});
test("v3 quality timeout and quota are blocked rather than retrieval failures", () => {
  for (const code of [
    "AI_TIMEOUT",
    "AI_QUOTA",
    "AI_UNAVAILABLE",
    "AI_AUTHENTICATION",
  ]) {
    assert.equal(
      evaluation.evaluateQualityResult(goldCase, {
        httpStatus: 503,
        body: { code },
      }).status,
      "BLOCKED",
    );
  }
});
test("v3 quota saves partial results and stops sending subsequent cases", async () => {
  const { runCases } = await import("../scripts/evaluate-rag.mjs");
  let calls = 0,
    saved;
  const results = await runCases(
    [
      { ...goldCase, id: "E01" },
      { ...goldCase, id: "E02" },
    ],
    {
      request: async () => {
        calls++;
        return { httpStatus: 503, body: { code: "AI_QUOTA" } };
      },
      save: async (partial) => {
        saved = structuredClone(partial);
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(results[0].assessment.status, "BLOCKED");
  assert.equal(saved[1].assessment.status, "NOT_ATTEMPTED");
});
test("v3 rejects invalid selection and scope before any transport call", async () => {
  const { selectCases, validateMapping } =
    await import("../scripts/evaluate-rag.mjs");
  assert.throws(() => selectCases({ cases: [{ id: "E01" }] }, "E99"));
  assert.throws(() =>
    validateMapping(
      { schemaVersion: 3, corpusRevision: "v3", documents: ["source.pdf"] },
      { corpusRevision: "v3", documents: { "source.pdf": "bad" } },
    ),
  );
});

test("v3 semantic PASS also requires verified chunks; no named review is fabricated", () => {
  const item = { ...goldCase, goldGroups: [] };
  const review = {
    reviewer: "test reviewer",
    notes: "Synthetic review fixture",
    factsCorrect: true,
    complete: true,
    abstentionCorrect: true,
    claims: [
      {
        claim: "Supported fact",
        supported: true,
        sources: [{ documentId: citation.documentId, page: citation.page }],
      },
    ],
  };
  assert.equal(
    evaluation.evaluateQualityResult(item, qualityResponse(), { review })
      .status,
    "REVIEW_REQUIRED",
  );
  assert.equal(
    evaluation.evaluateQualityResult(item, qualityResponse(), {
      review,
      verifiedCitations: [{ sourceId: "S1", exists: true }],
    }).status,
    "PASS",
  );
  assert.equal(
    evaluation.evaluateQualityResult(item, qualityResponse(), {
      review: { ...review, reviewer: "" },
      verifiedCitations: [{ sourceId: "S1", exists: true }],
    }).status,
    "REVIEW_REQUIRED",
  );
});
test("v3 safe trace includes IDs/pages/scores but never PDF text, prompt or key", () => {
  const trace = evaluation.safeTrace([
    {
      ...citation,
      content: "private PDF text",
      prompt: "private prompt",
      key: "fake-secret",
      score: 0.7,
    },
  ]);
  assert.equal(JSON.stringify(trace).includes("private"), false);
  assert.equal(JSON.stringify(trace).includes("fake-secret"), false);
  assert.equal(trace[0].rank, 1);
});
test("v3 definition rejects an unknown gold fact before any transport", async () => {
  const { readFile } = await import("node:fs/promises");
  const { validateDefinition } = await import("../scripts/evaluate-rag.mjs");
  const definition = JSON.parse(
    await readFile(
      new URL("../../../docs/evaluation-cases.json", import.meta.url),
      "utf8",
    ),
  );
  definition.cases[0].goldGroups[0].alternatives[0].facts = ["invented-gold"];
  assert.throws(() => validateDefinition(definition), /Unknown gold fact/);
});
test("v3 full corpus hashes and every frozen fact survive production extraction", async () => {
  const { corpusDocuments, corpusManifest, sha256 } =
    await import("../scripts/rag-evaluation-corpus.mjs");
  for (const document of corpusDocuments) {
    const bytes = makeEvaluationPdf(document.pages);
    assert.equal(
      sha256(bytes),
      corpusManifest().documents.find((d) => d.file === document.file).sha256,
    );
    const pages = await new PdfTextExtractorService().extract(bytes);
    assert.equal(pages.length, document.pages.length);
    for (const fact of document.facts)
      assert.ok(
        pages[fact.page - 1].text.replace(/\s+/g, " ").includes(fact.text),
        fact.id,
      );
  }
});

test("v3 verifier uses read-only parameterized SQL and never queries outside corpus", async () => {
  const { verifyCitations } =
    await import("../scripts/rag-evaluation-harness.mjs");
  const calls = [];
  const database = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ chunk_index: 0, source_page: 9 }] };
    },
  };
  const result = await verifyCitations(
    database,
    [citation, { ...citation, sourceId: "S2", documentId: "outside" }],
    [citation.documentId],
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^SELECT/);
  assert.match(calls[0].sql, /ANY\(\$3::uuid\[\]\)/);
  assert.equal(calls[0].sql.includes(citation.chunkId), false);
  assert.deepEqual(calls[0].values, [
    citation.chunkId,
    citation.documentId,
    [citation.documentId],
  ]);
  assert.deepEqual(
    result.map((r) => r.exists),
    [false, false],
  );
});
test("v3 unknown selection rejects with zero fetch calls", async () => {
  const { main } = await import("../scripts/evaluate-rag.mjs");
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    throw new Error("Unexpected network");
  };
  try {
    await assert.rejects(main(["--only", "E99"]), /Unknown/);
    assert.equal(count, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("v3 two consecutive unavailable responses stop, quota stops immediately", async () => {
  const { runCases } = await import("../scripts/evaluate-rag.mjs");
  let count = 0;
  const cases = ["E01", "E02", "E03"].map((id) => ({ ...goldCase, id }));
  const results = await runCases(cases, {
    request: async () => {
      count++;
      return { httpStatus: 503, body: { code: "AI_UNAVAILABLE" } };
    },
    save: async () => {},
  });
  assert.equal(count, 2);
  assert.deepEqual(
    results.map((r) => r.assessment.status),
    ["BLOCKED", "BLOCKED", "NOT_ATTEMPTED"],
  );
});
test("v3 review is tied to run ID, exact manifest and response hash", async () => {
  const { applyHumanReviews } = await import("../scripts/evaluate-rag.mjs");
  const { sha256 } = await import("../scripts/rag-evaluation-corpus.mjs");
  const previous = {
    schemaVersion: 3,
    runId: "run-1",
    manifestSha256: "manifest-hash",
    results: [{ caseId: "E01", attempted: true, response: qualityResponse() }],
  };
  assert.throws(
    () => applyHumanReviews(previous, { runId: "run-2" }, { cases: [] }),
    /mismatch/,
  );
  const reviews = {
    runId: previous.runId,
    manifestSha256: previous.manifestSha256,
    cases: [{ caseId: "E01", responseSha256: "wrong-hash" }],
  };
  assert.throws(
    () => applyHumanReviews(previous, reviews, { cases: [] }),
    /mismatch/,
  );
  reviews.cases[0].responseSha256 = sha256(
    JSON.stringify(previous.results[0].response.body),
  );
  assert.equal(
    applyHumanReviews(previous, reviews, {
      cases: [{ ...goldCase, id: "E01", goldGroups: [] }],
    })[0].assessment.status,
    "REVIEW_REQUIRED",
  );
});
test("v3 provider error is BLOCKED while observed model JSON rejection is FAIL", () => {
  const response = { httpStatus: 502, body: { code: "AI_UPSTREAM" } };
  assert.equal(
    evaluation.evaluateQualityResult(goldCase, response).status,
    "BLOCKED",
  );
  assert.equal(
    evaluation.evaluateQualityResult(goldCase, {
      ...response,
      rejection: "answer_not_json",
    }).status,
    "FAIL",
  );
});
test("v3 fact groups can span multiple valid chunks on their gold page", () => {
  const item = {
    ...goldCase,
    goldGroups: [
      {
        id: "two-facts",
        alternatives: [{ file: "source.pdf", page: 2, facts: ["a", "b"] }],
      },
    ],
  };
  const result = evaluation.evaluateQualityResult(item, qualityResponse(), {
    trace: [
      { ...citation, factIds: ["a"] },
      { ...citation, chunkId: "other-chunk", factIds: ["b"] },
    ],
  });
  assert.equal(result.retrieval.allGroupsHit, true);
});
test("v3 exit codes distinguish failures, pending review and blockers", () => {
  assert.equal(
    evaluation.reportExitCode([{ assessment: { status: "PASS" } }]),
    0,
  );
  assert.equal(
    evaluation.reportExitCode([{ assessment: { status: "FAIL" } }]),
    1,
  );
  assert.equal(
    evaluation.reportExitCode([{ assessment: { status: "REVIEW_REQUIRED" } }]),
    2,
  );
  assert.equal(
    evaluation.reportExitCode([{ assessment: { status: "BLOCKED" } }]),
    3,
  );
});

test("v3 context trace observes actual model evidence, not a spoofed question block", async () => {
  const { observeModelEvidence } =
    await import("../scripts/rag-evaluation-harness.mjs");
  const { buildRagContext } = await import("../dist/assistant/rag-context.js");
  const { corpusDocuments } =
    await import("../scripts/rag-evaluation-corpus.mjs");
  const chunk = {
    chunkId: "chunk-3",
    documentId: "doc-1",
    documentName: corpusDocuments[0].file,
    sourcePage: 3,
    chunkIndex: 2,
    courseId: null,
    score: 0.8,
    content: corpusDocuments[0].pages[2],
  };
  const context = buildRagContext([chunk], "rag-v1").context;
  assert.deepEqual(observeModelEvidence(["Question: " + context], [chunk]), []);
  const trace = observeModelEvidence(["Question: codename?", context], [chunk]);
  assert.equal(trace.length, 1);
  assert.ok(trace[0].factIds.includes("injection"));
  assert.equal(trace[0].sourceId, "S1");
  assert.equal(JSON.stringify(trace).includes(chunk.content), false);
  assert.equal(JSON.stringify(trace).includes("PARIS"), false);
  assert.deepEqual(
    observeModelEvidence([context], [{ ...chunk, content: "different chunk" }]),
    [],
  );
});

test("v3 preflight blocks unready/mismatched index and preserves unknown coverage", async () => {
  const { indexPreflightReason } =
    await import("../scripts/rag-evaluation-harness.mjs");
  const index = [
    {
      processingStatus: "ready",
      storageStatus: "stored",
      chunkCount: 1,
      totalPageCount: null,
      embeddingModels: ["test-model"],
      embeddingDimensions: [768],
    },
  ];
  const embeddings = { model: "test-model", dimensions: 768 };
  assert.equal(indexPreflightReason(index, embeddings), null);
  assert.equal(
    indexPreflightReason(
      [{ ...index[0], processingStatus: "pending" }],
      embeddings,
    ),
    "CORPUS_NOT_READY",
  );
  assert.equal(
    indexPreflightReason(index, { ...embeddings, model: "other-model" }),
    "CORPUS_EMBEDDING_MISMATCH",
  );
});
test("v3 offline runner makes zero network calls and saves honest fixture statuses", async () => {
  const { main } = await import("../scripts/evaluate-rag.mjs");
  const { randomUUID } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const directory = `artifacts/evaluation-test-${randomUUID()}`;
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Offline attempted network");
  };
  try {
    assert.equal(
      await main([
        "--offline",
        "--only",
        "E01,E04,E07,E17,E20,E21,E22",
        "--output",
        directory,
      ]),
      2,
    );
    assert.equal(calls, 0);
    const report = JSON.parse(
      await readFile(
        new URL(`../../../${directory}/report.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(report.mode, "offline_fixture");
    assert.equal(report.summary.counts.PASS, 0);
    assert.equal(report.summary.counts.REVIEW_REQUIRED, 7);
    assert.equal(
      report.results.find((c) => c.caseId === "E21").assessment.index[0]
        .coverage,
      "unknown",
    );
    await assert.rejects(
      main(["--output", directory]),
      /Output already exists/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("v3 dry run refuses secret input paths without network or secret reads", async () => {
  const { main } = await import("../scripts/evaluate-rag.mjs");
  await assert.rejects(main(["--cases", ".env"]), /never an environment/);
  await assert.rejects(main(["--mapping", ".env"]), /never an environment/);
});

test("v3 malformed response field types fail without crashing the runner", () => {
  for (const fields of [
    { answer: 42 },
    { citations: {} },
    { citations: [null] },
  ]) {
    const response = qualityResponse();
    Object.assign(response.body, fields);
    assert.equal(
      evaluation.evaluateQualityResult(goldCase, response, {
        trace: [],
        allowedDocumentIds: [citation.documentId],
      }).status,
      "FAIL",
    );
  }
});
test("v3 malformed review claims cannot crash or become PASS", () => {
  const response = qualityResponse();
  const review = {
    reviewer: "test fixture",
    notes: "Review fixture",
    factsCorrect: true,
    complete: true,
    abstentionCorrect: true,
    claims: [null],
  };
  assert.equal(
    evaluation.evaluateQualityResult(
      { ...goldCase, goldGroups: [] },
      response,
      { review },
    ).status,
    "REVIEW_REQUIRED",
  );
});

test("v3 complete citation pages cannot hide a missing retrieved fact group", () => {
  const policy = {
    ...citation,
    sourceId: "S2",
    documentId: "policy-document",
    chunkId: "policy-chunk",
    title: "policy.pdf",
    page: 1,
  };
  const result = evaluation.evaluateQualityResult(
    goldCase,
    qualityResponse([citation, policy]),
    {
      trace: [
        { ...citation, factIds: ["duration"] },
        { ...policy, factIds: [] },
      ],
    },
  );
  assert.equal(result.answer.goldPageGroups.matched, 2);
  assert.equal(result.retrieval.groups.matched, 1);
  assert.equal(result.status, "FAIL");
});

const caseDefinition = {
  expected: {
    httpStatus: 200,
    answerable: true,
    minCitations: 1,
    requiredCitationTitles: ["source.pdf"],
    maxLatencyMs: 1000,
  },
  manualReview: "Check the claim.",
};

const citation = {
  sourceId: "S1",
  documentId: "document-1",
  chunkId: "chunk-1",
  title: "source.pdf",
  page: 2,
  chunkIndex: 0,
};

const runner = fileURLToPath(
  new URL("../scripts/evaluate-rag.mjs", import.meta.url),
);

test("evaluation gates valid grounded responses but still requires human review", () => {
  const result = evaluateLiveResult(caseDefinition, {
    httpStatus: 200,
    latencyMs: 80,
    body: {
      answer: "Supported fact [S1].",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [citation],
      provider: "google",
      model: "gemini-test",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    },
  });
  assert.equal(result.status, "review_required");
  assert.equal(
    result.checks.every((item) => item.passed),
    true,
  );
});

test("evaluation rejects mismatched inline markers and source documents", () => {
  const result = evaluateLiveResult(caseDefinition, {
    httpStatus: 200,
    latencyMs: 80,
    body: {
      answer: "Unsupported source [S2].",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [{ ...citation, title: "other.pdf" }],
      provider: "google",
      model: "gemini-test",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    },
  });
  assert.equal(result.status, "fail");
  assert.equal(
    result.checks.find((item) => item.name === "inline_markers").passed,
    false,
  );
  assert.equal(
    result.checks.find((item) => item.name === "citation_title:source.pdf")
      .passed,
    false,
  );
});

test("evaluation accepts an honest unanswerable response without citations", () => {
  const result = evaluateLiveResult(
    {
      expected: { httpStatus: 200, answerable: false, minCitations: 0 },
    },
    {
      httpStatus: 200,
      latencyMs: 10,
      body: {
        answer: "Not enough evidence.",
        answerable: false,
        reasonCode: "NO_RELEVANT_EVIDENCE",
        citations: [],
        provider: "google",
        model: "gemini-test",
        mode: "documents",
        ragEnabled: true,
        promptVersion: "rag-v1",
      },
    },
  );
  assert.equal(result.status, "auto_pass");
  assert.equal(
    result.checks.every((item) => item.passed),
    true,
  );
});

test("synthetic corpus generator emits text that the production extractor reads", async () => {
  const pdf = makeEvaluationPdf(["Page one evidence", "Page two evidence"]);
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(pdf.toString("ascii"), /\/Count 2/);
  assert.match(pdf.toString("ascii"), /startxref/);
  const pages = await new PdfTextExtractorService().extract(pdf);
  assert.equal(pages.length, 2);
  assert.match(pages[0].text, /Page one evidence/);
  assert.match(pages[1].text, /Page two evidence/);
});

test("evaluation CLI is a no-network dry run unless execution is explicit", () => {
  const result = spawnSync(process.execPath, [runner], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No HTTP request was made/);
  assert.match(result.stdout, /9 live cases/);
});

test("dry-run checkpoint, final report and process agree without semantic PASS", () => {
  const output = `artifacts/phase5-dry-test-${randomUUID()}`;
  const result = spawnSync(process.execPath, [runner, "--output", output], {
    encoding: "utf8",
  });
  const checkpoint = JSON.parse(
    readFileSync(`${output}/checkpoint-24.json`, "utf8"),
  );
  const report = JSON.parse(readFileSync(`${output}/report.json`, "utf8"));
  assert.equal(result.status, 0);
  assert.equal(checkpoint.exitCode, result.status);
  assert.equal(report.exitCode, result.status);
  assert.ok(
    report.results.every(
      (r) => !r.attempted && r.assessment.status === "NOT_ATTEMPTED",
    ),
  );
  assert.deepEqual(checkpoint.results, report.results);
});

test("evaluation CLI rejects a mismatched corpus revision before HTTP", () => {
  const result = spawnSync(
    process.execPath,
    [runner, "--execute", "--corpus-revision", "wrong-revision"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Corpus revision must match the case manifest/);
});
