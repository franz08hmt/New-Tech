import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import {
  exportFeedback,
  candidateFromFeedback,
  parseExportOptions,
} from "../scripts/export-assistant-feedback.mjs";
import { validateDefinition } from "../scripts/evaluate-rag.mjs";

const row = (rating = "helpful") => ({
  id: randomUUID(),
  answer_id: randomUUID(),
  submission_id: randomUUID(),
  rating,
  reasons: rating === "helpful" ? [] : ["incorrect_content"],
  comment: "User assertion is not gold",
  snapshot: {
    schemaVersion: 1,
    request: { question: "Synthetic question" },
    response: { answer: "Synthetic answer" },
  },
  provenance: "client_reported",
  review_status: "UNREVIEWED",
  created_at: new Date().toISOString(),
});
for (const rating of ["helpful", "unhelpful"])
  test(`candidate ${rating} remains unreviewed without verdict or gold`, () => {
    const candidate = candidateFromFeedback(row(rating));
    assert.equal(candidate.status, "UNREVIEWED");
    assert.equal(candidate.provenance, "client_reported");
    assert.equal(candidate.review.conclusion, null);
    assert.equal(candidate.review.expectedBehavior, null);
    assert.equal(Object.hasOwn(candidate, "gold"), false);
    assert.equal(Object.hasOwn(candidate, "passed"), false);
    assert.throws(() =>
      validateDefinition({ schemaVersion: 1, candidates: [candidate] }),
    );
  });
test("export requires explicit bounded selection before database access", () => {
  for (const args of [
    [],
    ["--limit", "100"],
    ["--rating", "bad", "--limit", "2"],
    ["--ids", "m2"],
    ["--ids", `${randomUUID()},${randomUUID()}`, "--limit", "1"],
  ])
    assert.throws(() => parseExportOptions(args));
});
test("export reads only selected IDs, creates private artifact and never overwrites", async () => {
  const r = row(),
    output = `artifacts/feedback-export-test-${randomUUID()}.json`;
  let reads = 0;
  const database = {
    async query(sql, values) {
      reads++;
      assert.match(sql, /^SELECT /);
      assert.ok(sql.includes("$1"));
      assert.deepEqual(values[0], [r.id]);
      return { rows: [r] };
    },
  };
  const providerBefore = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Provider/network forbidden");
  };
  try {
    await exportFeedback({ ids: [r.id], output }, database);
    const artifact = JSON.parse(
      await readFile(new URL(`../../../${output}`, import.meta.url), "utf8"),
    );
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.candidates[0].feedbackId, r.id);
    await assert.rejects(
      exportFeedback({ ids: [r.id], output }, database),
      /already exists/,
    );
    assert.equal(reads, 1);
    assert.match(
      await readFile(new URL(`../../../${output}`, import.meta.url), "utf8"),
      /Synthetic answer/,
    );
  } finally {
    globalThis.fetch = providerBefore;
  }
});
test("export rejects output outside artifacts before SELECT", async () => {
  let reads = 0;
  await assert.rejects(
    exportFeedback(
      { ids: [randomUUID()], output: "docs/private-feedback.json" },
      {
        query() {
          reads++;
        },
      },
    ),
  );
  assert.equal(reads, 0);
  await assert.rejects(access("docs/private-feedback.json"));
});
