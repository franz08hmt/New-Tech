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

const ENTRY = "019_ai_usage_telemetry.sql";
const OPERATIONS = "ai_usage_operations";
const CALLS = "ai_usage_provider_calls";

async function inspect019(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  const managed = source.filter((file) => Number(file.name.slice(0, 3)) <= 19);
  if (
    ledger.some(
      (row) =>
        !managed.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 19,
    ) ||
    ledger.length !== 19 ||
    ledger.at(-1)?.name !== ENTRY
  )
    throw new PilotCliError(
      "Rollback 019 refused: ledger is not the exact 001–019 migration chain.",
    );
  for (const file of managed) {
    const rows = ledger.filter((row) => row.name === file.name);
    if (rows.length !== 1 || rows[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 019 refused: source checksum or migration ledger differs.",
      );
  }
  try {
    await assertRuntimeCatalogContract(
      (text, values) => client.query(text, values),
      19,
    );
  } catch {
    throw new PilotCliError(
      "Rollback 019 refused: capability schema, grants, RLS or policy contract has drifted.",
    );
  }
  const relations = await client.query(
    `SELECT c.relname,c.relkind,c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
    [[OPERATIONS, CALLS]],
  );
  if (
    relations.rowCount !== 2 ||
    relations.rows.some((row) => row.relkind !== "r" || !row.relrowsecurity)
  )
    throw new PilotCliError(
      "Rollback 019 refused: usage table structure or RLS is incomplete.",
    );
  const dependency = await client.query(
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
    LEFT JOIN pg_index dependent_index ON dependent_index.indexrelid=dependent_relation.oid
    LEFT JOIN pg_rewrite dependent_rule
      ON d.classid='pg_rewrite'::regclass AND dependent_rule.oid=d.objid
    LEFT JOIN pg_attrdef dependent_default
      ON d.classid='pg_attrdef'::regclass AND dependent_default.oid=d.objid
    LEFT JOIN pg_policy dependent_policy
      ON d.classid='pg_policy'::regclass AND dependent_policy.oid=d.objid
    WHERE d.refclassid='pg_class'::regclass AND target_ns.nspname='public'
      AND target.relname=ANY($1::text[])
      AND NOT (
        (d.classid='pg_type'::regclass AND dependent_type.typrelid=target.oid)
        OR (d.classid='pg_constraint'::regclass AND dependent_constraint.conrelid=target.oid)
        OR (d.classid='pg_constraint'::regclass
          AND dependent_constraint.conrelid=to_regclass('public.ai_usage_provider_calls')
          AND dependent_constraint.confrelid=target.oid)
        OR (d.classid='pg_class'::regclass AND dependent_index.indrelid=target.oid)
        OR (d.classid='pg_rewrite'::regclass AND dependent_rule.ev_class=target.oid)
        OR (d.classid='pg_attrdef'::regclass AND dependent_default.adrelid=target.oid)
        OR (d.classid='pg_policy'::regclass AND dependent_policy.polrelid=target.oid)
      )`,
    [[OPERATIONS, CALLS]],
  );
  if (dependency.rows[0]?.count !== 0)
    throw new PilotCliError(
      "Rollback 019 refused: external catalog dependencies use telemetry tables.",
    );
  const counts = await client.query(
    `SELECT
      (SELECT count(*)::int FROM public.ai_usage_operations) AS operations,
      (SELECT count(*)::int FROM public.ai_usage_provider_calls) AS provider_calls`,
  );
  return {
    objects: ["public.ai_usage_provider_calls", "public.ai_usage_operations"],
    operationsLostOnApply: counts.rows[0].operations,
    providerCallsLostOnApply: counts.rows[0].provider_calls,
    businessRowsDeleted: 0,
    authRowsDeleted: 0,
  };
}

export async function runPilotRollback019(
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
      "Rollback 019 requires a guarded disposable database.",
    );
  validateLocalConfirmation(options, databaseName);
  let started = false;
  let committing = false;
  try {
    const source = await loadSource();
    // Mark immediately before sending BEGIN: a lost acknowledgement may still
    // leave the server inside a transaction.
    started = true;
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations,public.ai_usage_operations,public.ai_usage_provider_calls IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspect019(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await client.query("DROP TABLE public.ai_usage_provider_calls RESTRICT");
    await client.query("DROP TABLE public.ai_usage_operations RESTRICT");
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 019 refused: migration ledger changed.",
      );
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, ...plan };
  } catch (error) {
    let rollbackFailed = false;
    if (started) {
      try {
        await client.query("ROLLBACK");
        started = false;
      } catch {
        rollbackFailed = true;
      }
    }
    if (committing || rollbackFailed) {
      const failure = new PilotCliError(
        "Rollback 019 outcome unknown: stop writers and inspect table/ledger before retrying.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 019 refused; inspect schema, dependency and connectivity privately.",
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
        ...(await runPilotRollback019(client, options, { databaseName })),
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
