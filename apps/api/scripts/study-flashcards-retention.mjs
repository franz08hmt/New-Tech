import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import { guardedLocalTarget } from "./f02-migration-common.mjs";

const MAX_BATCH = 100;

export async function runStudyFlashcardsRetention(
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
      "Study flashcard retention requires a bounded batch up to 100.",
    );
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    transactionMayBeOpen = true;
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (apply) await client.query("SELECT pg_advisory_xact_lock(424228)");
    const eligible = await client.query(
      `WITH expired_decks AS MATERIALIZED (
         SELECT id,draft_id FROM public.study_coach_flashcard_decks
         WHERE expires_at<=clock_timestamp()
         ORDER BY expires_at,id LIMIT $1
       ), expired_drafts AS MATERIALIZED (
         SELECT id FROM public.study_coach_flashcard_drafts
         WHERE state='draft' AND expires_at<=clock_timestamp()
         ORDER BY expires_at,id LIMIT $1
       ), purgeable_tombstones AS MATERIALIZED (
         SELECT d.id FROM public.study_coach_flashcard_drafts d
         WHERE d.state IN ('confirmed','cancelled','expired','deleted')
           AND d.tombstone_until<=clock_timestamp()
           AND NOT EXISTS(SELECT 1 FROM public.study_coach_flashcard_decks q WHERE q.draft_id=d.id)
         ORDER BY d.tombstone_until,d.id LIMIT $1
       ) SELECT
         (SELECT count(*)::text FROM expired_decks) AS decks,
         (SELECT count(*)::text FROM public.study_coach_flashcard_reviews r
           JOIN expired_decks q ON q.id=r.deck_id) AS reviews,
         (SELECT count(*)::text FROM expired_drafts) AS drafts,
         (SELECT count(*)::text FROM purgeable_tombstones) AS tombstones`,
      [batchSize],
    );
    const row = eligible.rows[0];
    if (!apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return {
        dryRun: true,
        eligibleDecks: row.decks,
        eligibleReviews: row.reviews,
        eligibleDrafts: row.drafts,
        eligibleTombstones: row.tombstones,
        deletedDecks: "0",
        deletedReviews: "0",
        deletedDrafts: "0",
      };
    }
    const expiredDecks = await client.query(
      `WITH picked AS MATERIALIZED (
         SELECT id,draft_id FROM public.study_coach_flashcard_decks
         WHERE expires_at<=clock_timestamp()
         ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
       ), tombstoned AS (
         UPDATE public.study_coach_flashcard_drafts d
         SET state='deleted',payload=NULL,saved_deck_id=NULL,
             tombstone_until=clock_timestamp()+INTERVAL '90 days'
         FROM picked p WHERE d.id=p.draft_id AND d.state='confirmed'
         RETURNING d.id
       ), removed AS (
         DELETE FROM public.study_coach_flashcard_decks q USING picked p
         WHERE q.id=p.id RETURNING q.id
       ) SELECT count(*)::text AS count FROM removed`,
      [batchSize],
    );
    const expiredDrafts = await client.query(
      `WITH picked AS MATERIALIZED (
         SELECT id FROM public.study_coach_flashcard_drafts
         WHERE state='draft' AND expires_at<=clock_timestamp()
         ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
       ), removed AS (
         UPDATE public.study_coach_flashcard_drafts d
         SET state='expired',payload=NULL,
             tombstone_until=clock_timestamp()+INTERVAL '90 days'
         FROM picked p WHERE d.id=p.id AND d.state='draft'
         RETURNING d.id
       ) SELECT count(*)::text AS count FROM removed`,
      [batchSize],
    );
    const purgedTombstones = await client.query(
      `WITH picked AS MATERIALIZED (
         SELECT d.id FROM public.study_coach_flashcard_drafts d
         WHERE d.state IN ('confirmed','cancelled','expired','deleted')
           AND d.tombstone_until<=clock_timestamp()
           AND NOT EXISTS(SELECT 1 FROM public.study_coach_flashcard_decks q WHERE q.draft_id=d.id)
         ORDER BY d.tombstone_until,d.id LIMIT $1 FOR UPDATE SKIP LOCKED
       ), removed AS (
         DELETE FROM public.study_coach_flashcard_drafts d USING picked p
         WHERE d.id=p.id RETURNING d.id
       ) SELECT count(*)::text AS count FROM removed`,
      [batchSize],
    );
    commitSent = true;
    await client.query("COMMIT");
    transactionMayBeOpen = false;
    return {
      dryRun: false,
      deletedDecks: String(expiredDecks.rowCount),
      deletedReviews: row.reviews,
      expiredDrafts: expiredDrafts.rows[0].count,
      purgedTombstones: purgedTombstones.rows[0].count,
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
        "Study flashcard retention outcome unknown: inspect the disposable target before retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Study flashcard retention failed; inspect local schema and connectivity privately.",
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
      throw new PilotCliError("Duplicate study flashcard retention flag.");
    seen.add(key);
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--confirm-database="))
      confirmDatabase = arg.slice("--confirm-database=".length);
    else if (arg.startsWith("--batch-size="))
      batchSize = Number(arg.slice("--batch-size=".length));
    else
      throw new PilotCliError("Invalid study flashcard retention arguments.");
  }
  const { href, databaseName } = guardedLocalTarget(
    process.env.TEST_DATABASE_URL,
  );
  if (apply && confirmDatabase !== databaseName)
    throw new PilotCliError(
      "Study flashcard retention write refused: exact disposable database confirmation is required.",
    );
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH)
    throw new PilotCliError(
      "Study flashcard retention batch size must be 1-100.",
    );
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const pool = new pg.Pool({ ...databaseConfig(href), max: 1 });
  const client = await pool.connect();
  let discard = false;
  try {
    console.log(
      JSON.stringify({
        targetDatabase: databaseName,
        ...(await runStudyFlashcardsRetention(client, { apply, batchSize })),
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

if (process.argv[1]?.endsWith("study-flashcards-retention.mjs"))
  main().catch(reportFailure);
