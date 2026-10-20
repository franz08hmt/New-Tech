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

const ENTRY = "020_ai_admission.sql";
const RELATIONS = ["ai_admission_operations", "ai_admission_user_daily"];

async function inspect020(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  const managed = source.filter((file) => Number(file.name.slice(0, 3)) <= 20);
  if (
    ledger.length !== 20 ||
    ledger.at(-1)?.name !== ENTRY ||
    ledger.some(
      (row) =>
        !managed.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 20,
    )
  )
    throw new PilotCliError(
      "Rollback 020 refused: ledger is not the exact 001-020 migration chain.",
    );
  for (const file of managed) {
    const rows = ledger.filter((row) => row.name === file.name);
    if (rows.length !== 1 || rows[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 020 refused: source checksum or migration ledger differs.",
      );
  }
  try {
    await assertRuntimeCatalogContract(
      (text, values) => client.query(text, values),
      20,
    );
  } catch {
    throw new PilotCliError(
      "Rollback 020 refused: admission/runtime schema, grants or RLS contract has drifted.",
    );
  }
  const relations = await client.query(
    `SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($1::text[])
     ORDER BY c.relname`,
    [RELATIONS],
  );
  if (
    relations.rowCount !== RELATIONS.length ||
    relations.rows.some((row) => row.relkind !== "r" || !row.relrowsecurity)
  )
    throw new PilotCliError(
      "Rollback 020 refused: admission table structure or RLS is incomplete.",
    );

  const dependencies = await client.query(
    `SELECT count(*)::int AS count
     FROM pg_depend d
     JOIN pg_class target ON target.oid=d.refobjid
     JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
     LEFT JOIN pg_type dependent_type
       ON d.classid='pg_type'::regclass AND dependent_type.oid=d.objid
     LEFT JOIN pg_constraint dependent_constraint
       ON d.classid='pg_constraint'::regclass AND dependent_constraint.oid=d.objid
     LEFT JOIN pg_class dependent_relation
       ON d.classid='pg_class'::regclass AND dependent_relation.oid=d.objid
     LEFT JOIN pg_index dependent_index
       ON dependent_index.indexrelid=dependent_relation.oid
     LEFT JOIN pg_rewrite dependent_rule
       ON d.classid='pg_rewrite'::regclass AND dependent_rule.oid=d.objid
     LEFT JOIN pg_attrdef dependent_default
       ON d.classid='pg_attrdef'::regclass AND dependent_default.oid=d.objid
     LEFT JOIN pg_policy dependent_policy
       ON d.classid='pg_policy'::regclass AND dependent_policy.oid=d.objid
     LEFT JOIN pg_trigger dependent_trigger
       ON d.classid='pg_trigger'::regclass AND dependent_trigger.oid=d.objid
     WHERE d.refclassid='pg_class'::regclass AND target_ns.nspname='public'
       AND target.relname=ANY($1::text[])
       AND NOT (
         (d.classid='pg_type'::regclass AND dependent_type.typrelid=target.oid)
         OR (d.classid='pg_constraint'::regclass AND dependent_constraint.conrelid=target.oid)
         OR (d.classid='pg_constraint'::regclass
             AND dependent_constraint.confrelid=target.oid
             AND dependent_constraint.conrelid=target.oid)
         OR (d.classid='pg_class'::regclass AND dependent_index.indrelid=target.oid)
         OR (d.classid='pg_rewrite'::regclass AND dependent_rule.ev_class=target.oid)
         OR (d.classid='pg_attrdef'::regclass AND dependent_default.adrelid=target.oid)
         OR (d.classid='pg_policy'::regclass AND dependent_policy.polrelid=target.oid)
         OR (d.classid='pg_trigger'::regclass AND dependent_trigger.tgrelid=target.oid)
       )`,
    [RELATIONS],
  );
  if (dependencies.rows[0]?.count !== 0)
    throw new PilotCliError(
      "Rollback 020 refused: external catalog dependencies use admission tables.",
    );

  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM public.ai_admission_operations) AS operations,
       (SELECT count(*)::int FROM public.ai_admission_user_daily) AS daily_rows`,
  );
  return {
    objects: RELATIONS.map((name) => `public.${name}`),
    admissionOperationsLostOnApply: counts.rows[0].operations,
    dailyCounterRowsLostOnApply: counts.rows[0].daily_rows,
    businessRowsDeleted: 0,
    authRowsDeleted: 0,
  };
}

export async function runPilotRollback020(
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
      "Rollback 020 requires a guarded disposable database.",
    );
  validateLocalConfirmation(options, databaseName);
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    const source = await loadSource();
    // Track before sending BEGIN: the server may start a transaction even when
    // the client loses the acknowledgement.
    transactionMayBeOpen = true;
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations,public.ai_admission_operations,public.ai_admission_user_daily IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspect020(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await client.query("DROP TABLE public.ai_admission_operations RESTRICT");
    await client.query("DROP TABLE public.ai_admission_user_daily RESTRICT");
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 020 refused: migration ledger changed.",
      );
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
        "Rollback 020 outcome unknown: stop writers and inspect schema/ledger before any retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 020 refused; inspect schema, dependency and connectivity privately.",
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
        ...(await runPilotRollback020(client, options, { databaseName })),
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
