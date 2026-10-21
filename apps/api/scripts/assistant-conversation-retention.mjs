import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import { guardedLocalTarget } from "./f02-migration-common.mjs";

const MAX_BATCH = 100;

export async function runConversationRetention(
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
      "Conversation retention requires a bounded batch up to 100.",
    );
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    transactionMayBeOpen = true;
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    if (apply) await client.query("SELECT pg_advisory_xact_lock(424207)");
    const count = await client.query(
      `WITH batch AS MATERIALIZED (
         SELECT id FROM assistant_conversations
         WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $1
       ) SELECT count(*)::text AS expired,
           (SELECT count(*)::text FROM assistant_conversation_turns t
             JOIN batch b ON b.id=t.conversation_id) AS eligible_turns
         FROM batch`,
      [batchSize],
    );
    if (!apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return {
        dryRun: true,
        eligibleInBoundedBatch: count.rows[0].expired,
        eligibleTurns: count.rows[0].eligible_turns,
        deletedConversations: "0",
        deletedTurns: "0",
        receiptsDeleted: "0",
      };
    }
    const removed = await client.query(
      `WITH expired AS MATERIALIZED (
         SELECT id FROM assistant_conversations
         WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
       ), turn_counts AS (
         SELECT count(*)::text AS count FROM assistant_conversation_turns t
         JOIN expired e ON e.id=t.conversation_id
       ), removed AS (
         DELETE FROM assistant_conversations c USING expired e WHERE c.id=e.id RETURNING c.id
       ) SELECT (SELECT count(*)::text FROM removed) AS deleted,
           turn_counts.count AS deleted_turns FROM turn_counts`,
      [batchSize],
    );
    const deleted = removed.rows[0].deleted;
    commitSent = true;
    await client.query("COMMIT");
    transactionMayBeOpen = false;
    return {
      dryRun: false,
      deletedConversations: deleted,
      deletedTurns: removed.rows[0].deleted_turns,
      receiptsPreserved: "all",
      batchSize,
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
        "Conversation retention outcome unknown: inspect the disposable target before retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Conversation retention failed; inspect the local disposable target privately.",
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
    if (seen.has(arg.split("=")[0]))
      throw new PilotCliError("Duplicate conversation retention flag.");
    seen.add(arg.split("=")[0]);
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--confirm-database="))
      confirmDatabase = arg.slice("--confirm-database=".length);
    else if (arg.startsWith("--batch-size="))
      batchSize = Number(arg.slice("--batch-size=".length));
    else throw new PilotCliError("Invalid conversation retention arguments.");
  }
  const { href, databaseName } = guardedLocalTarget(
    process.env.TEST_DATABASE_URL,
  );
  if (apply && confirmDatabase !== databaseName)
    throw new PilotCliError(
      "Conversation retention write refused: exact disposable database confirmation is required.",
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
        ...(await runConversationRetention(client, { apply, batchSize })),
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

if (process.argv[1]?.endsWith("assistant-conversation-retention.mjs"))
  main().catch(reportFailure);
