import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { testArtifacts } from "./test-artifacts.mjs";
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
test("export reads only selected IDs, creates private artifact and never overwrites", async (t) => {
  const r = row(),
    output = resolve(testArtifacts(t), "candidate.json");
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
    const artifact = JSON.parse(await readFile(output, "utf8"));
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.candidates[0].feedbackId, r.id);
    await assert.rejects(
      exportFeedback({ ids: [r.id], output }, database),
      /already exists/,
    );
    assert.equal(reads, 1);
    assert.match(await readFile(output, "utf8"), /Synthetic answer/);
  } finally {
    globalThis.fetch = providerBefore;
  }
});

test("CLI rejects an unreviewed candidate input before network and ignores adjacent candidates", async (t) => {
  const directory = testArtifacts(t),
    candidateFile = resolve(directory, "feedback-candidate.json"),
    marker = resolve(directory, "network-attempted.txt"),
    guard = resolve(directory, "network-guard.mjs");
  await writeFile(
    candidateFile,
    JSON.stringify({
      schemaVersion: 1,
      kind: "assistant_feedback_candidates",
      candidates: [candidateFromFeedback(row("unhelpful"))],
    }),
  );
  await writeFile(
    guard,
    `import { writeFileSync } from "node:fs"; globalThis.fetch = () => { writeFileSync(${JSON.stringify(marker)}, "network attempted"); throw new Error("Network forbidden in candidate test"); };`,
  );
  const runner = fileURLToPath(
    new URL("../scripts/evaluate-rag.mjs", import.meta.url),
  );
  const invalidOutput = resolve(directory, "rejected-run");
  const rejected = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(guard).href,
      runner,
      "--execute",
      "--cases",
      candidateFile,
      "--output",
      invalidOutput,
    ],
    { encoding: "utf8" },
  );
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Unsupported evaluation schema\/revision/);
  await assert.rejects(access(marker));
  await assert.rejects(access(invalidOutput));
  const output = resolve(directory, "official-run");
  const official = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(guard).href,
      runner,
      "--only",
      "E01",
      "--output",
      output,
    ],
    { encoding: "utf8" },
  );
  assert.equal(official.status, 0);
  const report = JSON.parse(
    await readFile(resolve(output, "report.json"), "utf8"),
  );
  assert.deepEqual(
    report.results.map((r) => r.caseId),
    ["E01"],
  );
  assert.equal(report.results[0].assessment.status, "NOT_ATTEMPTED");
  assert.equal(report.summary.counts.PASS, 0);
  assert.equal(Object.hasOwn(report, "candidates"), false);
  await assert.rejects(access(marker));
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
