import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  exportFeedback,
  candidateFromFeedback,
  parseExportOptions,
  validateMaintenanceExport,
} from "../scripts/export-assistant-feedback.mjs";
import { testArtifacts } from "./test-artifacts.mjs";
const workspaceId = "22222222-2222-4222-8222-222222222222";
test("maintenance export refuses runtime credentials fallback and config/workspace mismatch", () => {
  assert.throws(
    () =>
      validateMaintenanceExport(
        { workspaceId },
        {
          PILOT_WORKSPACE_ID: workspaceId,
          DATABASE_URL: "synthetic-runtime-only",
        },
      ),
    /maintenance/,
  );
  assert.throws(
    () =>
      validateMaintenanceExport(
        { workspaceId },
        {
          PILOT_WORKSPACE_ID: randomUUID(),
          MIGRATION_DATABASE_URL: "synthetic-maintenance",
        },
      ),
    /workspace/,
  );
  assert.doesNotThrow(() =>
    validateMaintenanceExport(
      { workspaceId },
      {
        PILOT_WORKSPACE_ID: workspaceId,
        MIGRATION_DATABASE_URL: "synthetic-maintenance",
      },
    ),
  );
});
test("feedback export refuses missing workspace before every DB read", async () => {
  let reads = 0;
  await assert.rejects(
    exportFeedback(
      { ids: [randomUUID()] },
      {
        query: async () => {
          reads++;
          return { rows: [] };
        },
      },
    ),
    /workspace/i,
  );
  assert.equal(reads, 0);
});
test("CLI workspace input is one valid UUID, never an unbounded global export", () => {
  const id = randomUUID();
  assert.equal(
    parseExportOptions(["--workspace-id", workspaceId, "--ids", id])
      .workspaceId,
    workspaceId,
  );
  assert.throws(() =>
    parseExportOptions(["--workspace-id", "all", "--ids", id]),
  );
});
for (const explicit of [true, false])
  test(`export ${explicit ? "IDs" : "rating"} filters workspace before order/limit and candidates remain UNREVIEWED`, async (t) => {
    const id = randomUUID(),
      output = resolve(testArtifacts(t), "scoped.json");
    const row = {
      id,
      answer_id: randomUUID(),
      submission_id: randomUUID(),
      snapshot: {},
      rating: "helpful",
      created_at: new Date().toISOString(),
      receipt_id: null,
      user_id: null,
    };
    await exportFeedback(
      {
        workspaceId,
        output,
        ...(explicit ? { ids: [id] } : { rating: "helpful", limit: 1 }),
      },
      {
        query: async (sql, values) => {
          assert.match(
            sql,
            /WHERE[\s\S]*workspace_id\s*=\s*\$3[\s\S]*ORDER BY[\s\S]*LIMIT/,
          );
          assert.equal(values[2], workspaceId);
          return { rows: [row] };
        },
      },
    );
    const artifact = JSON.parse(await readFile(output, "utf8"));
    assert.equal(artifact.candidates[0].attribution, "legacy_unattributed");
    assert.equal(artifact.candidates[0].status, "UNREVIEWED");
    assert.equal(Object.hasOwn(artifact.candidates[0], "gold"), false);
  });
test("receipt attribution does not promote user assertions to ground truth", () => {
  const owned = candidateFromFeedback({
    receipt_id: randomUUID(),
    user_id: randomUUID(),
  });
  assert.equal(owned.attribution, "receipt_linked");
  assert.equal(owned.provenance, "client_reported");
  assert.equal(owned.status, "UNREVIEWED");
  assert.equal(
    candidateFromFeedback({ receipt_id: randomUUID(), user_id: null })
      .attribution,
    "user_removed",
  );
});
