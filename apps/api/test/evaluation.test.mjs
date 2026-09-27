import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateLiveResult,
  makeEvaluationPdf,
} from "../scripts/rag-evaluation-lib.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";

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
  assert.match(result.stdout, /8 live cases and 6 automated-test references/);
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
