import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { loadMigrations, migrationChecksum } from "./migrate.mjs";
import { assertRuntimeCatalogContract } from "../dist/database/runtime-capability-contract.js";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import {
  guardedLocalTarget,
  parseF02Args,
  validateLocalConfirmation,
} from "./f02-migration-common.mjs";

const ENTRY = "022_assistant_conversations.sql";
const TABLES = [
  "assistant_conversations",
  "assistant_conversation_turns",
  "assistant_conversation_create_keys",
];

async function inspect022(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  const managed = source.filter((file) => Number(file.name.slice(0, 3)) <= 22);
  if (
    ledger.length !== 22 ||
    ledger.at(-1)?.name !== ENTRY ||
    ledger.some((row) => !managed.some((file) => file.name === row.name))
  )
    throw new PilotCliError(
      "Rollback 022 refused: ledger is not the exact 001-022 migration chain.",
    );
  for (const file of managed) {
    const rows = ledger.filter((row) => row.name === file.name);
    if (rows.length !== 1 || rows[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 022 refused: source checksum or migration ledger differs.",
      );
  }
  try {
    await assertRuntimeCatalogContract(
      (text, values) => client.query(text, values),
      22,
    );
  } catch {
    throw new PilotCliError(
      "Rollback 022 refused: runtime capability or conversation schema has drifted.",
    );
  }
  const tables = await client.query(
    `SELECT c.relname,c.relkind,c.relrowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
    [TABLES],
  );
  if (
    tables.rowCount !== TABLES.length ||
    tables.rows.some((row) => row.relkind !== "r" || !row.relrowsecurity)
  )
    throw new PilotCliError(
      "Rollback 022 refused: private conversation tables or RLS are incomplete.",
    );
  const dependencies = await client.query(
    `SELECT count(*)::int AS count FROM (
       SELECT con.oid FROM pg_constraint con
       WHERE con.contype='f' AND con.confrelid=ANY($1::regclass[])
         AND con.conrelid<>ALL($1::regclass[])
       UNION ALL
       SELECT d.objid FROM pg_depend d
       JOIN pg_rewrite rw ON d.classid='pg_rewrite'::regclass AND rw.oid=d.objid
       JOIN pg_class view_rel ON view_rel.oid=rw.ev_class
       WHERE d.refclassid='pg_class'::regclass AND d.refobjid=ANY($1::regclass[])
         AND view_rel.relkind IN ('v','m') AND view_rel.oid<>ALL($1::regclass[])
     ) external_dependency`,
    [TABLES.map((name) => `public.${name}`)],
  );
  if (dependencies.rows[0].count)
    throw new PilotCliError(
      "Rollback 022 refused: an external database object depends on conversation data.",
    );
  const counts = await client.query(
    `SELECT (SELECT count(*)::text FROM public.assistant_conversations) AS conversations,
      (SELECT count(*)::text FROM public.assistant_conversation_turns) AS turns,
      (SELECT count(*)::text FROM public.assistant_conversation_create_keys) AS createKeys,
      (SELECT count(*)::text FROM public.assistant_answer_receipts) AS receipts`,
  );
  return {
    changedObjects: [
      ...TABLES.map((name) => `public.${name}`),
      `public.schema_migrations[${ENTRY}]`,
    ],
    contentRowsLostOnApply: {
      conversations: counts.rows[0].conversations,
      turns: counts.rows[0].turns,
    },
    idempotencyKeysLostOnApply: counts.rows[0].createkeys,
    receiptsPreserved: counts.rows[0].receipts,
    businessRowsDeleted: 0,
  };
}

export async function runPilotRollback022(
  client,
  input,
  { databaseName, loadSource = loadMigrations } = {},
) {
  const options = { apply: false, ...input };
  if (
    typeof options.apply !== "boolean" ||
    !/^[a-z][a-z0-9_]*_test$/.test(databaseName ?? "")
  )
    throw new PilotCliError(
      "Rollback 022 requires a guarded disposable database.",
    );
  validateLocalConfirmation(options, databaseName);
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    const source = await loadSource();
    transactionMayBeOpen = true;
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations,public.assistant_conversations,public.assistant_conversation_turns,public.assistant_conversation_create_keys IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspect022(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await client.query(
      "DROP TABLE public.assistant_conversation_turns RESTRICT",
    );
    await client.query("DROP TABLE public.assistant_conversations RESTRICT");
    await client.query(
      "DROP TABLE public.assistant_conversation_create_keys RESTRICT",
    );
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 022 refused: migration ledger changed.",
      );
    try {
      await assertRuntimeCatalogContract(
        (text, values) => client.query(text, values),
        21,
      );
    } catch {
      throw new PilotCliError(
        "Rollback 022 refused: restored F06 capability contract does not match.",
      );
    }
    commitSent = true;
    await client.query("COMMIT");
    transactionMayBeOpen = false;
    return { dryRun: false, applied: true, ...plan };
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
        "Rollback 022 outcome unknown: inspect the exact disposable target before any retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 022 refused; inspect local schema and connectivity privately.",
    );
  }
}

async function main() {
  const options = parseF02Args(process.argv.slice(2));
  const { href, databaseName } = guardedLocalTarget(
    process.env.TEST_DATABASE_URL,
  );
  validateLocalConfirmation(options, databaseName);
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const pool = new pg.Pool({ ...databaseConfig(href), max: 1 });
  const client = await pool.connect();
  let discard = false;
  try {
    console.log(
      JSON.stringify({
        targetDatabase: databaseName,
        ...(await runPilotRollback022(client, options, { databaseName })),
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(reportFailure);
