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

const ENTRY = "021_ai_usage_dashboard.sql";
const TABLES = ["ai_usage_operations", "ai_usage_provider_calls"];
const OPERATION_COLUMNS =
  "operation_id,workspace_id,user_id,operation,mode,prompt_id,prompt_version,outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at";
const CALL_COLUMNS =
  "call_id,operation_id,workspace_id,user_id,provider,model,call_type,prompt_id,prompt_version,outcome,usage_status,input_tokens,output_tokens,total_tokens,cost_status,estimated_cost,pricing_version,currency,duration_ms,started_at,completed_at,expires_at";

async function inspect021(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  const managed = source.filter((file) => Number(file.name.slice(0, 3)) <= 21);
  if (
    ledger.length !== 21 ||
    ledger.at(-1)?.name !== ENTRY ||
    ledger.some(
      (row) =>
        !managed.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 21,
    )
  )
    throw new PilotCliError(
      "Rollback 021 refused: ledger is not the exact 001-021 migration chain.",
    );
  for (const file of managed) {
    const matches = ledger.filter((row) => row.name === file.name);
    if (matches.length !== 1 || matches[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 021 refused: source checksum or migration ledger differs.",
      );
  }
  try {
    await assertRuntimeCatalogContract(
      (text, values) => client.query(text, values),
      21,
    );
  } catch {
    throw new PilotCliError(
      "Rollback 021 refused: runtime capability or telemetry dashboard contract has drifted.",
    );
  }
  const relations = await client.query(
    `SELECT c.relname,c.relkind,c.relrowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($1::text[])
     ORDER BY c.relname`,
    [TABLES],
  );
  if (
    relations.rowCount !== TABLES.length ||
    relations.rows.some((row) => row.relkind !== "r" || !row.relrowsecurity)
  )
    throw new PilotCliError(
      "Rollback 021 refused: telemetry tables or RLS are incomplete.",
    );
  const counts = await client.query(
    `SELECT (SELECT count(*)::text FROM public.ai_usage_operations) AS operations,
      (SELECT count(*)::text FROM public.ai_usage_provider_calls) AS provider_calls`,
  );
  return {
    changedObjects: [
      "F06 manager SELECT policies",
      "F06 column-scoped SELECT grants to examate_business",
      `public.schema_migrations[${ENTRY}]`,
    ],
    telemetryRowsPreservedOnApply: counts.rows[0],
    businessRowsDeleted: 0,
    authRowsDeleted: 0,
  };
}

export async function runPilotRollback021(
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
      "Rollback 021 requires a guarded disposable database.",
    );
  validateLocalConfirmation(options, databaseName);
  let transactionMayBeOpen = false;
  let commitSent = false;
  try {
    const source = await loadSource();
    // Track before BEGIN is sent: PostgreSQL may start it before its ACK is lost.
    transactionMayBeOpen = true;
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
    const plan = await inspect021(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      transactionMayBeOpen = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await client.query(
      "DROP POLICY f06_usage_operations_manager_select ON public.ai_usage_operations",
    );
    await client.query(
      "DROP POLICY f06_usage_calls_manager_select ON public.ai_usage_provider_calls",
    );
    await client.query(
      `REVOKE SELECT (${OPERATION_COLUMNS}) ON public.ai_usage_operations FROM examate_business`,
    );
    await client.query(
      `REVOKE SELECT (${CALL_COLUMNS}) ON public.ai_usage_provider_calls FROM examate_business`,
    );
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 021 refused: migration ledger changed.",
      );
    try {
      await assertRuntimeCatalogContract(
        (text, values) => client.query(text, values),
        20,
      );
    } catch {
      throw new PilotCliError(
        "Rollback 021 refused: the restored F04 capability contract does not match.",
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
        "Rollback 021 outcome unknown: stop writers and inspect policy, grant and ledger state before any retry.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 021 refused; inspect local schema and connectivity privately.",
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
        ...(await runPilotRollback021(client, options, { databaseName })),
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
