import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { testArtifacts } from "./test-artifacts.mjs";
import {
  evaluateLiveResult,
  makeEvaluationPdf,
} from "../scripts/rag-evaluation-lib.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import * as evaluation from "../scripts/rag-evaluation-lib.mjs";
import {
  validateLocalDefinition,
  makeLocalReport,
  makeLocalReviewPack,
  verifyLocalReviewBinding,
  summarizeMeasurements,
} from "../scripts/rag-evaluation-local-lib.mjs";
import { assessLocalCase } from "../scripts/rag-evaluation-local.mjs";
import { corpusManifest, sha256 } from "../scripts/rag-evaluation-corpus.mjs";

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
test("v3 offline runner makes zero network calls and saves honest fixture statuses", async (t) => {
  const { main } = await import("../scripts/evaluate-rag.mjs");
  const { readFile } = await import("node:fs/promises");
  const directory = resolve(testArtifacts(t), "offline-run");
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
      await readFile(resolve(directory, "report.json"), "utf8"),
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

async function guardedLiveFixture(t) {
  const savedEnvironment = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL:
      "postgresql://evaluation_fixture:evaluation_fixture@127.0.0.1:5432/evaluation_fixture_test",
    DATABASE_SSL: "false",
    SUPABASE_URL: "https://evaluation-fixture.supabase.test",
    SUPABASE_SECRET_KEY: "sb_secret_evaluation_synthetic_only",
    SUPABASE_STORAGE_BUCKET: "evaluation-fixture",
    GEMINI_API_KEY: "evaluation_synthetic_key_only",
    NODE_ENV: "test",
  });
  const calls = {
    loadEnvironment: 0,
    databaseQuery: 0,
    poolConnect: 0,
    storage: 0,
    embedding: 0,
    generation: 0,
    fetch: 0,
  };
  // Stub the built-in named import too: RED must NEVER load the real .env.
  t.mock.method(process, "loadEnvFile", () => {
    calls.loadEnvironment++;
  });
  syncBuiltinESMExports();
  const { DatabaseService } =
    await import("../dist/database/database.service.js");
  const { StorageService } =
    await import("../dist/documents/storage.service.js");
  const { GeminiEmbeddingService } =
    await import("../dist/assistant/gemini-embedding.service.js");
  const { GeminiService } = await import("../dist/assistant/gemini.service.js");
  const { Pool } = await import("pg");
  const forbidden = (key) => async () => {
    calls[key]++;
    throw new Error("Forbidden live evaluation boundary");
  };
  t.mock.method(DatabaseService.prototype, "query", forbidden("databaseQuery"));
  t.mock.method(Pool.prototype, "connect", forbidden("poolConnect"));
  for (const method of ["upload", "remove", "downloadBuffer", "signedDownload"])
    t.mock.method(StorageService.prototype, method, forbidden("storage"));
  for (const method of ["embedQuery", "embedDocuments"])
    t.mock.method(
      GeminiEmbeddingService.prototype,
      method,
      forbidden("embedding"),
    );
  t.mock.method(GeminiService.prototype, "generate", forbidden("generation"));
  t.mock.method(globalThis, "fetch", forbidden("fetch"));
  const definition = JSON.parse(
    readFileSync(
      new URL("../../../docs/evaluation-cases.json", import.meta.url),
      "utf8",
    ),
  );
  const mapping = {
    corpusRevision: definition.corpusRevision,
    documents: Object.fromEntries(
      definition.documents.map((file) => [file, randomUUID()]),
    ),
    courseId: randomUUID(),
  };
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    for (const key of Object.keys(process.env))
      if (!(key in savedEnvironment)) delete process.env[key];
    Object.assign(process.env, savedEnvironment);
  });
  return { calls, definition, mapping };
}

test("v3 live harness fails closed before environment, DB, Storage or provider access", async (t) => {
  const { calls, definition, mapping } = await guardedLiveFixture(t);
  const { createLiveHarness } =
    await import("../scripts/rag-evaluation-harness.mjs");
  let rejection;
  try {
    await createLiveHarness(definition, mapping);
  } catch (error) {
    rejection = error;
  }
  assert.ok(
    Object.values(calls).every((count) => count === 0),
    "live harness must stop before any environment or external access",
  );
  assert.equal(rejection?.code, "LIVE_EVALUATION_AUTH_REQUIRED");
  assert.equal(
    rejection?.message,
    "Chưa có principal workspace cho runner live; chờ đợt tích hợp Auth.",
  );
});

for (const transport of ["internal", "http"]) {
  test(`v3 --execute ${transport} reports BLOCKED with zero budget and no attempts`, async (t) => {
    const { calls, definition, mapping } = await guardedLiveFixture(t);
    const { main } = await import("../scripts/evaluate-rag.mjs");
    const { writeFile, readFile } = await import("node:fs/promises");
    const directory = testArtifacts(t);
    const mappingPath = resolve(directory, "mapping.json");
    const output = resolve(directory, `blocked-${transport}`);
    await writeFile(mappingPath, JSON.stringify(mapping));
    let stdout = "";
    t.mock.method(process.stdout, "write", (chunk) => {
      stdout += chunk;
      return true;
    });
    const exit = await main([
      "--execute",
      "--transport",
      transport,
      "--only",
      "E01",
      "--corpus-revision",
      definition.corpusRevision,
      "--mapping",
      mappingPath,
      "--output",
      output,
    ]);
    assert.equal(exit, 3);
    const report = JSON.parse(
      await readFile(resolve(output, "report.json"), "utf8"),
    );
    assert.ok(
      Object.values(calls).every((count) => count === 0),
      "CLI must stop before environment/DB/Storage/provider/HTTP access",
    );
    assert.equal(report.preflight.status, "BLOCKED");
    assert.equal(report.preflight.reason, "LIVE_EVALUATION_AUTH_REQUIRED");
    assert.equal(
      report.preflight.message,
      "Chưa có principal workspace cho runner live; chờ đợt tích hợp Auth.",
    );
    assert.ok(
      stdout.includes(report.preflight.message),
      "CLI displays the actionable Vietnamese boundary message",
    );
    assert.ok(
      report.results.length === 1 &&
        report.results.every(
          (item) =>
            !item.attempted && item.assessment.status === "NOT_ATTEMPTED",
        ),
    );
    assert.ok(
      typeof report.actualProviderBudget === "object" &&
        Object.values(report.actualProviderBudget).every(
          (value) => value === 0,
        ),
      "blocked provider budget must be explicitly zero, never unknown",
    );
  });
}

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

test("evaluation CLI is a no-network dry run unless execution is explicit", (t) => {
  const output = resolve(testArtifacts(t), "dry-run");
  const result = spawnSync(process.execPath, [runner, "--output", output], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No HTTP request was made/);
  assert.match(result.stdout, /9 live cases/);
});

test("dry-run checkpoint, final report and process agree without semantic PASS", (t) => {
  const output = resolve(testArtifacts(t), "dry-run");
  const result = spawnSync(process.execPath, [runner, "--output", output], {
    encoding: "utf8",
  });
  const checkpoint = JSON.parse(
    readFileSync(resolve(output, "checkpoint-24.json"), "utf8"),
  );
  const report = JSON.parse(
    readFileSync(resolve(output, "report.json"), "utf8"),
  );
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

test("authenticated local evaluation without a disposable target blocks before runtime access", () => {
  const env = { ...process.env };
  delete env.TEST_DATABASE_URL;
  const result = spawnSync(process.execPath, [runner, "--local-integration"], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /LOCAL_EVALUATION_TARGET_REQUIRED/);
  assert.doesNotMatch(result.stdout + result.stderr, /postgres(?:ql)?:\/\//);
});

const localManifestBytes = readFileSync(
  new URL("../../../docs/evaluation-cases-f09a.json", import.meta.url),
);
const localDefinition = JSON.parse(localManifestBytes);
function localReportFixture() {
  return makeLocalReport({
    runId: randomUUID(),
    startedAt: "2026-10-21T00:00:00Z",
    git: { sha: "fixture", dirty: true },
    definition: localDefinition,
    manifestBytes: localManifestBytes,
    selected: localDefinition.cases.slice(0, 1),
    configuration: { source: "synthetic" },
    results: [
      {
        caseId: "F09A-001",
        attempted: true,
        assessment: { status: "PASS" },
        latencyMs: 5,
        reviewOutput: {
          answer: "Six minutes [S1]",
          citations: [
            {
              sourceId: "S1",
              title: "examate-eval-project-brief.pdf",
              page: 1,
            },
          ],
        },
      },
    ],
  });
}
test("F09-A revision pins unchanged historical manifest and frozen corpus before execution", () => {
  const base = readFileSync(
    new URL("../../../docs/evaluation-cases.json", import.meta.url),
  );
  validateLocalDefinition(localDefinition, base);
  assert.equal(
    localDefinition.cases.filter((c) => c.mode === "local_integration").length,
    33,
  );
  assert.throws(() =>
    validateLocalDefinition(
      { ...localDefinition, corpusSha256: "0".repeat(64) },
      base,
    ),
  );
  assert.throws(() =>
    validateLocalDefinition(
      localDefinition,
      Buffer.concat([base, Buffer.from(" ")]),
    ),
  );
});

test("F09-A v2 explicitly binds its predecessor and changes no semantic gold", () => {
  const nextBytes = readFileSync(
      new URL("../../../docs/evaluation-cases-f09a-v2.json", import.meta.url),
    ),
    next = JSON.parse(nextBytes);
  const base = readFileSync(
    new URL("../../../docs/evaluation-cases.json", import.meta.url),
  );
  validateLocalDefinition(next, base, localManifestBytes);
  assert.throws(() =>
    validateLocalDefinition(next, base, Buffer.from("altered predecessor")),
  );
  const before = localDefinition.cases.find((c) => c.id === "F09A-005"),
    after = next.cases.find((c) => c.id === "F09A-105");
  assert.equal(before.expected.httpStatus, 400);
  assert.equal(after.expected.httpStatus, 404);
  assert.equal(
    next.cases.some((c) => c.id === "F09A-005"),
    false,
  );
  assert.deepEqual(
    next.cases.map((c) => c.semanticExpected),
    localDefinition.cases.map((c) => c.semanticExpected),
  );
  assert.equal(next.corpusSha256, localDefinition.corpusSha256);
});

test("F09-A source hash tolerates only Git LF/CRLF checkout differences", () => {
  const next = JSON.parse(
    readFileSync(
      new URL("../../../docs/evaluation-cases-f09a-v2.json", import.meta.url),
    ),
  );
  const base = readFileSync(
    new URL("../../../docs/evaluation-cases.json", import.meta.url),
  );
  const lf = Buffer.from(base.toString("utf8").replace(/\r\n/g, "\n"));
  const crlfPredecessor = Buffer.from(
    localManifestBytes
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\n/g, "\r\n"),
  );
  validateLocalDefinition(next, lf, crlfPredecessor);
  assert.throws(() =>
    validateLocalDefinition(
      next,
      Buffer.concat([lf, Buffer.from(" ")]),
      crlfPredecessor,
    ),
  );
});
test("F09-A telemetry missing after SDK dispatch stays explicitly unknown rather than free", () => {
  const totals = summarizeMeasurements([
    { providerCalls: 2, telemetry: { calls: [], operations: [] } },
  ]);
  assert.equal(totals.accounting.missingTelemetryCalls, 2);
  assert.equal(totals.cost.estimatedCalls, 0);
  assert.equal(totals.cost.unknownCalls, 2);
  assert.equal(totals.tokens.total.knownCalls, 0);
  assert.equal(totals.tokens.total.known, null);
  assert.equal(totals.tokens.total.totalCalls, 2);
});
test("F09-A unsafe target blocks before importing the runtime fixture", () => {
  const env = {
    ...process.env,
    TEST_DATABASE_URL:
      "postgresql://synthetic:synthetic@cloud.invalid/not_disposable",
  };
  const result = spawnSync(process.execPath, [runner, "--local-integration"], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /LOCAL_EVALUATION_TARGET_UNSAFE/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /Migration applied|cloud\.invalid|postgresql:\/\//,
  );
});
for (const field of ["run", "manifest", "corpus", "response", "report"])
  test(`F09-A review binding rejects altered ${field}`, () => {
    const report = localReportFixture(),
      pack = makeLocalReviewPack(report, localDefinition);
    assert.equal(
      verifyLocalReviewBinding(pack, report, localManifestBytes),
      true,
    );
    assert.equal(pack.cases[0].reviewer, "");
    assert.equal(pack.cases[0].decision, null);
    if (field === "run") pack.runId = randomUUID();
    if (field === "manifest") pack.manifestSha256 = "0".repeat(64);
    if (field === "corpus") report.corpusSha256 = "0".repeat(64);
    if (field === "response") pack.cases[0].output.answer = "Altered answer";
    if (field === "report") report.mode = "live";
    assert.throws(
      () => verifyLocalReviewBinding(pack, report, localManifestBytes),
      /BINDING_INVALID/,
    );
  });

test("F09-A review pack rejects altered source pages rather than trusting its corpus hash label", () => {
  const report = localReportFixture(),
    pack = makeLocalReviewPack(report, localDefinition);
  pack.cases[0].sources[0].pages[0].text = "Altered source text";
  assert.throws(
    () => verifyLocalReviewBinding(pack, report, localManifestBytes),
    /BINDING_INVALID/,
  );
});
test("F09-A unexecuted references and blockers cannot contribute a quality or execution PASS", () => {
  const report = makeLocalReport({
    runId: randomUUID(),
    definition: localDefinition,
    manifestBytes: localManifestBytes,
    selected: localDefinition.cases.slice(0, 4),
    results: [
      { caseId: "F09A-001", attempted: false, assessment: { status: "PASS" } },
      {
        caseId: "F09A-002",
        attempted: false,
        assessment: { status: "BLOCKED" },
      },
      { caseId: "F09A-003", attempted: false, assessment: { status: "SKIP" } },
      {
        caseId: "F09A-004",
        attempted: false,
        assessment: { status: "NOT_ATTEMPTED" },
      },
    ],
  });
  assert.equal(report.summary.counts.PASS, 0);
  assert.equal(report.summary.requestsAttempted, 0);
  assert.equal(report.summary.qualityPasses, 0);
  assert.equal(report.summary.counts.BLOCKED, 1);
  assert.equal(report.summary.counts.SKIP, 1);
  assert.equal(report.summary.counts.NOT_ATTEMPTED, 2);
});
test("F09-A costs preserve currency/pricing and unknown coverage, valid zero differs from missing", () => {
  const result = summarizeMeasurements([
    {
      attempted: true,
      telemetry: {
        calls: [
          {
            usage_status: "complete",
            input_tokens: "0",
            output_tokens: "0",
            total_tokens: "0",
            cost_status: "estimated",
            estimated_cost: "0.000000000000",
            currency: "USD",
            pricing_version: "v1",
          },
          {
            usage_status: "missing",
            input_tokens: null,
            output_tokens: null,
            total_tokens: null,
            cost_status: "unknown_usage",
            estimated_cost: null,
          },
          {
            usage_status: "complete",
            total_tokens: "9007199254740992",
            cost_status: "estimated",
            estimated_cost: "0.100000000001",
            currency: "USD",
            pricing_version: "v1",
          },
          {
            usage_status: "partial",
            input_tokens: "7",
            cost_status: "unknown_usage",
            estimated_cost: null,
          },
          {
            usage_status: "complete",
            total_tokens: "1",
            cost_status: "estimated",
            estimated_cost: "0.200000000002",
            currency: "EUR",
            pricing_version: "v1",
          },
          {
            usage_status: "complete",
            total_tokens: "1",
            cost_status: "estimated",
            estimated_cost: "0.300000000003",
            currency: "USD",
            pricing_version: "v2",
          },
        ],
        operations: [],
      },
    },
  ]);
  assert.equal(result.tokens.total.known, "9007199254740994");
  assert.equal(result.tokens.total.knownCalls, 4);
  assert.equal(result.cost.unknownCalls, 2);
  assert.deepEqual(
    result.cost.byCurrencyAndPricingVersion.map((c) => c.knownEstimate),
    ["0.100000000001", "0.200000000002", "0.300000000003"],
  );
  assert.equal(result.usageCoverage.missing, 1);
  assert.equal(result.usageCoverage.partial, 1);
});
test("F09-A injection conclusion is INCONCLUSIVE if malicious data did not enter provider context", () => {
  const { item, result } = requiredOutputObservation("injection");
  result.injectionInModelContext = false;
  const assessment = assessLocalCase(item, result);
  assert.equal(assessment.status, "INCONCLUSIVE");
  assert.equal(assessment.dimensions.claimGrounding, "PENDING_HUMAN");
});
test("F09-A refuses principal/base URL/live arguments rather than enabling an Auth bypass", () => {
  for (const args of [
    ["--principal", "manager"],
    ["--base-url", "http://127.0.0.1:3000"],
    ["--execute"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [runner, "--local-integration", ...args],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LOCAL_EVALUATION_ARGUMENT_INVALID/);
  }
});

// Independent observations of the promised HTTP output, not SDK-generated answers.
const currentLocalDefinition = JSON.parse(
  readFileSync(
    new URL("../../../docs/evaluation-cases-f09a-v2.json", import.meta.url),
  ),
);
function requiredOutputObservation(scenario) {
  const item = currentLocalDefinition.cases.find(
    (c) => c.scenario === scenario,
  );
  const evidence = [
    {
      sourceId: "S1",
      file: "source.pdf",
      page: 1,
      factIds: item.semanticExpected?.facts ?? [],
    },
  ];
  const quiz = {
    title: "Synthetic quiz",
    language: "en",
    questions: Array.from({ length: 3 }, (_, i) => ({
      question: `Question ${i + 1}?`,
      options: ["One", "Two", "Three", "Four"],
      correctIndex: 0,
      explanation: "An explanation.",
      sourceIds: ["S1"],
    })),
  };
  const cards = {
    title: "Synthetic cards",
    language: "en",
    cards: Array.from({ length: 3 }, (_, i) => ({
      front: `Front ${i + 1}`,
      back: "Back",
      sourceIds: ["S1"],
    })),
  };
  const refusal = scenario === "rag_no_evidence";
  return {
    item,
    result: {
      httpStatus: item.expected.httpStatus,
      providerCalls: item.expected.providerCalls,
      reasonCode: item.expected.code,
      telemetryMatches: true,
      privacyVerified: true,
      receiptPresent: true,
      answerable: !refusal,
      injectionInModelContext: true,
      evidence,
      reviewOutput:
        scenario === "quiz_valid"
          ? quiz
          : scenario === "flashcards_valid"
            ? cards
            : {
                answer: refusal ? "Not enough evidence." : "A grounded answer.",
                answerable: !refusal,
                citations: refusal
                  ? []
                  : [{ sourceId: "S1", title: "source.pdf", page: 1 }],
              },
    },
  };
}
for (const scenario of [
  "rag_document",
  "quiz_valid",
  "flashcards_valid",
  "rag_no_evidence",
]) {
  test(`F09-A.1 ${scenario} valid output is a structural contract PASS`, () => {
    const { item, result } = requiredOutputObservation(scenario);
    const assessment = assessLocalCase(item, result);
    assert.equal(assessment.status, "PASS");
    assert.equal(assessment.dimensions.structural, true);
    assert.equal(assessment.dimensions.semanticCorrectness, "PENDING_HUMAN");
  });
  for (const [label, value] of [
    ["missing", undefined],
    ["null", null],
    ["string", "not an output"],
    ["array", []],
    ["number", 42],
  ]) {
    test(`F09-A.1 ${scenario} rejects ${label} required output without throwing`, () => {
      const { item, result } = requiredOutputObservation(scenario);
      result.reviewOutput = value;
      const assessment = assessLocalCase(item, result);
      assert.equal(assessment.status, "FAIL");
      assert.equal(assessment.dimensions.structural, false);
    });
  }
}
const outputMutations = {
  rag_document: {
    "missing answer": (o) => delete o.answer,
    "blank answer": (o) => (o.answer = " \n "),
    "wrong answer type": (o) => (o.answer = 123),
    "missing citations": (o) => delete o.citations,
    "empty citations": (o) => (o.citations = []),
    "wrong citations type": (o) => (o.citations = {}),
    "null citation": (o) => (o.citations = [null]),
    "missing citation field": (o) => delete o.citations[0].page,
    "invalid citation page": (o) => (o.citations[0].page = "1"),
    "foreign citation": (o) => (o.citations[0].sourceId = "FOREIGN"),
    "wrong answerability": (o) => (o.answerable = false),
  },
  rag_no_evidence: {
    "missing answer": (o) => delete o.answer,
    "missing citations": (o) => delete o.citations,
    "cited refusal": (o) =>
      (o.citations = [{ sourceId: "S1", title: "source.pdf", page: 1 }]),
    "wrong answerability": (o) => (o.answerable = true),
  },
  quiz_valid: {
    "missing questions": (o) => delete o.questions,
    "wrong questions type": (o) => (o.questions = {}),
    "wrong count": (o) => o.questions.pop(),
    "null question": (o) => (o.questions[0] = null),
    "blank question": (o) => (o.questions[0].question = " "),
    "wrong question type": (o) => (o.questions[0].question = 1),
    "wrong options type": (o) => (o.questions[0].options = "four"),
    "blank option": (o) => (o.questions[0].options[0] = " "),
    "wrong option type": (o) => (o.questions[0].options[0] = 1),
    "duplicate options": (o) =>
      (o.questions[0].options[0] = o.questions[0].options[1]),
    "blank explanation": (o) => (o.questions[0].explanation = " "),
    "wrong explanation type": (o) => (o.questions[0].explanation = 1),
    "fractional index": (o) => (o.questions[0].correctIndex = 0.5),
    "out of range index": (o) => (o.questions[0].correctIndex = 4),
    "string index": (o) => (o.questions[0].correctIndex = "0"),
    "wrong source IDs type": (o) => (o.questions[0].sourceIds = "S1"),
    "wrong source ID type": (o) => (o.questions[0].sourceIds = [1]),
    "empty sources": (o) => (o.questions[0].sourceIds = []),
    "foreign sources": (o) => (o.questions[0].sourceIds = ["FOREIGN"]),
    "duplicate question": (o) =>
      (o.questions[1].question = o.questions[0].question),
    "flashcards instead": (o) => {
      delete o.questions;
      o.cards =
        requiredOutputObservation("flashcards_valid").result.reviewOutput.cards;
    },
    "both artifact types": (o) => (o.cards = []),
  },
  flashcards_valid: {
    "missing cards": (o) => delete o.cards,
    "wrong cards type": (o) => (o.cards = {}),
    "wrong count": (o) => o.cards.pop(),
    "null card": (o) => (o.cards[0] = null),
    "blank front": (o) => (o.cards[0].front = " "),
    "wrong front type": (o) => (o.cards[0].front = 1),
    "blank back": (o) => (o.cards[0].back = " \n "),
    "wrong back type": (o) => (o.cards[0].back = 1),
    "wrong source IDs type": (o) => (o.cards[0].sourceIds = "S1"),
    "wrong source ID type": (o) => (o.cards[0].sourceIds = [1]),
    "empty sources": (o) => (o.cards[0].sourceIds = []),
    "foreign sources": (o) => (o.cards[0].sourceIds = ["FOREIGN"]),
    "duplicate front normalized": (o) =>
      (o.cards[1].front = ` ${o.cards[0].front.toUpperCase()} `),
    "quiz instead": (o) => {
      delete o.cards;
      o.questions =
        requiredOutputObservation("quiz_valid").result.reviewOutput.questions;
    },
    "both artifact types": (o) => (o.questions = []),
  },
};
for (const [scenario, mutations] of Object.entries(outputMutations)) {
  for (const [label, mutate] of Object.entries(mutations)) {
    test(`F09-A.1 ${scenario} rejects ${label}`, () => {
      const { item, result } = requiredOutputObservation(scenario);
      mutate(result.reviewOutput);
      const assessment = assessLocalCase(item, result);
      assert.equal(assessment.status, "FAIL");
      assert.ok(Object.values(assessment.checks).includes(false));
    });
  }
}
test("F09-A.1 missing evidence or receipt cannot replace a valid grounded response", () => {
  for (const mutate of [
    (r) => (r.evidence = undefined),
    (r) => (r.evidence = [null]),
    (r) => (r.receiptPresent = false),
  ]) {
    const { item, result } = requiredOutputObservation("rag_document");
    mutate(result);
    assert.equal(assessLocalCase(item, result).status, "FAIL");
  }
});
test("F09-A.1 expected errors and non-content cases do not require generated answers", () => {
  const scenarios = [
    "provider_timeout",
    "quiz_malformed",
    "flashcards_source",
    "missing_session",
    "expired_session",
    "forged_principal",
    "auth_capability",
    "admission_denial",
    "workspace_sql",
    "read_save_practice",
  ];
  for (const scenario of scenarios) {
    const item = currentLocalDefinition.cases.find(
      (c) => c.scenario === scenario,
    );
    const assessment = assessLocalCase(item, {
      httpStatus: item.expected.httpStatus,
      providerCalls: item.expected.providerCalls,
      code: item.expected.code,
    });
    assert.equal(assessment.status, "PASS", scenario);
    assert.equal(assessment.dimensions.structural, "not_assessed", scenario);
  }
});
