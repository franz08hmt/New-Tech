import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validate(options) {
  if (options.ids) {
    if (
      options.rating ||
      options.limit ||
      !Array.isArray(options.ids) ||
      !options.ids.length ||
      options.ids.length > 50 ||
      new Set(options.ids).size !== options.ids.length ||
      options.ids.some((id) => !uuid.test(id))
    )
      throw new Error("Invalid explicit feedback IDs.");
  } else if (
    !["helpful", "unhelpful"].includes(options.rating) ||
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 50
  )
    throw new Error("Select IDs or rating with an explicit limit 1..50.");
}
export function parseExportOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = {
      "--ids": "ids",
      "--rating": "rating",
      "--limit": "limit",
      "--output": "output",
    }[args[i]];
    if (
      !key ||
      options[key] !== undefined ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Invalid export arguments.");
    options[key] = args[++i];
  }
  if (options.ids) options.ids = options.ids.split(",");
  if (options.limit !== undefined) options.limit = Number(options.limit);
  validate(options);
  return options;
}
export function candidateFromFeedback(row) {
  return {
    feedbackId: row.id,
    answerId: row.answer_id,
    submissionId: row.submission_id,
    rating: row.rating,
    reasons: row.reasons,
    comment: row.comment,
    snapshot: row.snapshot,
    provenance: "client_reported",
    createdAt: row.created_at,
    status: "UNREVIEWED",
    evidenceLimitations: [
      "Client snapshot is not server-authenticated evidence.",
      "Sources may have changed or been deleted; citation snapshots do not prove current existence.",
      "Rating and comment are signals, never gold answers or semantic verdicts.",
    ],
    review: {
      reviewer: null,
      reviewedAt: null,
      conclusion: null,
      evidenceExplanation: null,
      errorType: null,
      comparedSources: [],
      expectedBehavior: null,
      proposedTestKind: null,
    },
  };
}
export async function exportFeedback(options, database) {
  validate(options);
  const output = resolve(
    root,
    options.output ?? `artifacts/feedback-candidates/${randomUUID()}.json`,
  );
  const path = relative(resolve(root, "artifacts"), output);
  if (
    !path ||
    path.startsWith("..") ||
    isAbsolute(path) ||
    !output.endsWith(".json")
  )
    throw new Error("Output must be a new JSON artifact.");
  try {
    await access(output);
    throw new Error("Output already exists.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const columns =
    "id, answer_id, submission_id, rating, reasons, comment, snapshot, provenance, review_status, created_at";
  const result = options.ids
    ? await database.query(
        `SELECT ${columns} FROM assistant_feedback WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC, id LIMIT $2`,
        [options.ids, options.ids.length],
      )
    : await database.query(
        `SELECT ${columns} FROM assistant_feedback WHERE rating = $1 ORDER BY created_at DESC, id LIMIT $2`,
        [options.rating, options.limit],
      );
  const artifact = {
    schemaVersion: 1,
    kind: "assistant_feedback_candidates",
    exportedAt: new Date().toISOString(),
    selection: options.ids
      ? { ids: options.ids }
      : { rating: options.rating, limit: options.limit },
    notFoundIds:
      options.ids?.filter((id) => !result.rows.some((r) => r.id === id)) ?? [],
    candidates: result.rows.map(candidateFromFeedback),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(artifact, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return { count: artifact.candidates.length, output: relative(root, output) };
}
async function main() {
  const options = parseExportOptions(process.argv.slice(2));
  const { loadEnvironment } = await import("../dist/config/config.js");
  loadEnvironment();
  const { DatabaseService } =
    await import("../dist/database/database.service.js");
  const database = new DatabaseService();
  try {
    const result = await exportFeedback(options, database);
    process.stdout.write(
      `Exported ${result.count} UNREVIEWED candidates to ${result.output}. Keep this artifact private.\n`,
    );
  } finally {
    await database.onModuleDestroy();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    process.stderr.write(
      "Feedback export rejected. Check selection, output and database configuration; no feedback content printed.\n",
    );
    process.exitCode = 1;
  });
}
