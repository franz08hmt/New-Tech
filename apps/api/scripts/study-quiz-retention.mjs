import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import { guardedLocalTarget } from "./f02-migration-common.mjs";

const MAX_BATCH = 100;

export async function runStudyQuizRetention(
  client,
  { apply = false, batchSize = MAX_BATCH } = {},
) {
  if (
    typeof apply !== "boolean" ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH
  )
    throw new PilotCliError(
      "Study quiz retention requires a bounded batch up to 100.",
    );
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    transactionMayBeOpen = true;
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (apply) await client.query("SELECT pg_advisory_xact_lock(424208)");
    const eligible = await client.query(
      `WITH expired_quizzes AS MATERIALIZED (
         SELECT id,draft_id FROM public.study_coach_quizzes
         WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $1
       ), expired_drafts AS MATERIALIZED (
         SELECT d.id FROM public.study_coach_quiz_drafts d
         WHERE d.expires_at<=clock_timestamp()
           AND NOT EXISTS(
             SELECT 1 FROM public.study_coach_quizzes q
             WHERE q.draft_id=d.id
               AND NOT EXISTS(SELECT 1 FROM expired_quizzes selected WHERE selected.id=q.id)
           )
         ORDER BY d.expires_at,d.id LIMIT $1
       ) SELECT
         (SELECT count(*)::text FROM expired_quizzes) AS quizzes,
         (SELECT count(*)::text FROM expired_drafts) AS drafts,
         (SELECT count(*)::text FROM public.study_coach_quiz_attempts a
           JOIN expired_quizzes q ON q.id=a.quiz_id) AS attempts,
         COALESCE((SELECT array_agg(id::text ORDER BY id) FROM expired_quizzes),'{}') AS quiz_ids`,
      [batchSize],
    );
    if (!apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return {
        dryRun: true,
        eligibleQuizzes: eligible.rows[0].quizzes,
        eligibleDrafts: eligible.rows[0].drafts,
        eligibleAttempts: eligible.rows[0].attempts,
        deletedQuizzes: "0",
        deletedDrafts: "0",
        deletedAttempts: "0",
      };
    }
    const quizIds = eligible.rows[0].quiz_ids;
    const attempts = quizIds.length
      ? await client.query(
          "DELETE FROM public.study_coach_quiz_attempts WHERE quiz_id=ANY($1::uuid[])",
          [quizIds],
        )
      : { rowCount: 0 };
    const quizzes = quizIds.length
      ? await client.query(
          "DELETE FROM public.study_coach_quizzes WHERE id=ANY($1::uuid[])",
          [quizIds],
        )
      : { rowCount: 0 };
    const drafts = await client.query(
      `WITH expired AS MATERIALIZED (
         SELECT d.id FROM public.study_coach_quiz_drafts d
         WHERE d.expires_at<=clock_timestamp()
           AND NOT EXISTS(SELECT 1 FROM public.study_coach_quizzes q WHERE q.draft_id=d.id)
         ORDER BY d.expires_at,d.id LIMIT $1 FOR UPDATE SKIP LOCKED
       ), removed AS (
         DELETE FROM public.study_coach_quiz_drafts d USING expired e
         WHERE d.id=e.id RETURNING d.id
       ) SELECT count(*)::text AS count FROM removed`,
      [batchSize],
    );
    commitSent = true;
    await client.query("COMMIT");
    transactionMayBeOpen = false;
    return {
      dryRun: false,
      deletedQuizzes: String(quizzes.rowCount),
      deletedDrafts: drafts.rows[0].count,
      deletedAttempts: String(attempts.rowCount),
      batchSizePerRelation: batchSize,
    };
  } catch (error) {
    let cleanupFailed = false;
    if (transactionMayBeOpen) {
      try {
        await client.query("ROLLBACK");
        transactionMayBeOpen = false;
      } catch {
        cleanupFailed = true;
      }
    }
    if (commitSent || cleanupFailed) {
      const failure = new PilotCliError(
        "Study quiz retention outcome unknown: inspect the disposable target before retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Study quiz retention failed; inspect the disposable target privately.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const seen = new Set();
  let apply = false;
  let confirmDatabase;
  let batchSize = MAX_BATCH;
  for (const arg of args) {
    const key = arg.split("=")[0];
    if (seen.has(key))
      throw new PilotCliError("Duplicate study quiz retention flag.");
    seen.add(key);
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--confirm-database="))
      confirmDatabase = arg.slice("--confirm-database=".length);
    else if (arg.startsWith("--batch-size="))
      batchSize = Number(arg.slice("--batch-size=".length));
    else throw new PilotCliError("Invalid study quiz retention arguments.");
  }
  const { href, databaseName } = guardedLocalTarget(
    process.env.TEST_DATABASE_URL,
  );
  if (apply && confirmDatabase !== databaseName)
    throw new PilotCliError(
      "Study quiz retention write refused: exact disposable database confirmation is required.",
    );
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH)
    throw new PilotCliError("Study quiz retention batch size must be 1-100.");
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const pool = new pg.Pool({ ...databaseConfig(href), max: 1 });
  const client = await pool.connect();
  let discard = false;
  try {
    console.log(
      JSON.stringify({
        targetDatabase: databaseName,
        ...(await runStudyQuizRetention(client, { apply, batchSize })),
      }),
    );
  } catch (error) {
    discard = error?.discardConnection === true;
    throw error;
  } finally {
    client.release(discard);
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("study-quiz-retention.mjs"))
  main().catch(reportFailure);
