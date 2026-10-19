import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import {
  applyMigrationInTransaction,
  loadMigrations,
  migrationChecksum,
} from "./migrate.mjs";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import {
  assertRuntimeCatalogContract,
  assertNoManagedRuntimePolicyConflict,
  lockManagedRuntimeRelations,
} from "../dist/database/runtime-capability-contract.js";
import {
  F02_CAPABILITY_MARKER,
  guardedLocalTarget,
  parseF02Args,
  validateLocalConfirmation,
} from "./f02-migration-common.mjs";

const ENTRY = "018_runtime_rls_reindex.sql";
const BASE = "017_runtime_rls.sql";

async function assert017Baseline(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.f02_runtime_policy_state WHERE policy_name LIKE 'f02_%') AS saved_policies,
      (SELECT count(*)::int FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND p.polname LIKE 'f02_%') AS live_policies,
      EXISTS(
        SELECT 1 FROM public.f02_runtime_policy_state s
        LEFT JOIN pg_policy p ON p.polname=s.policy_name
        LEFT JOIN pg_class c ON c.oid=p.polrelid AND c.relname=s.relation_name
        LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
        WHERE s.policy_name LIKE 'f02_%' AND (p.oid IS NULL
          OR p.polcmd IS DISTINCT FROM s.command
          OR p.polpermissive IS DISTINCT FROM s.permissive
          OR ARRAY(SELECT CASE WHEN r.role_oid=0 THEN 'PUBLIC' ELSE x.rolname::text END
            FROM unnest(p.polroles) AS r(role_oid) LEFT JOIN pg_roles x ON x.oid=r.role_oid
            ORDER BY 1) IS DISTINCT FROM s.role_names
          OR pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM s.using_expression
          OR pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM s.check_expression)
      ) AS policy_drift,
      EXISTS(
        SELECT 1 FROM public.f02_runtime_rls_state s
        JOIN pg_class c ON c.oid=format('public.%I',s.relation_name)::regclass
        WHERE c.relrowsecurity IS DISTINCT FROM s.was_enabled
          OR c.relforcerowsecurity IS DISTINCT FROM s.was_forced
      ) AS rls_drift,
      (SELECT count(*)::int FROM public.f02_runtime_rls_state) AS saved_rls
  `);
  const row = result.rows[0];
  if (
    row.saved_policies !== row.live_policies ||
    row.policy_drift ||
    row.rls_drift ||
    row.saved_rls !== 15
  )
    throw new PilotCliError(
      "F02-A.1 apply refused: live 017 RLS/policy state differs from its migration snapshot.",
    );
}

async function inspect(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  if (
    ledger.some(
      (row) =>
        !source.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 18,
    )
  )
    throw new PilotCliError(
      "F02-A.1 apply refused: later or unknown migration exists.",
    );
  for (const file of source.filter(
    (item) => Number(item.name.slice(0, 3)) <= 17,
  )) {
    const matches = ledger.filter((row) => row.name === file.name);
    if (matches.length !== 1 || matches[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "F02-A.1 apply refused: source migration ledger/checksum differs.",
      );
  }
  if (ledger.length === 18) {
    const migration = source.find((file) => file.name === ENTRY);
    const applied = ledger.filter((row) => row.name === ENTRY);
    if (
      !migration ||
      applied.length !== 1 ||
      applied[0].checksum !== migrationChecksum(migration)
    )
      throw new PilotCliError(
        "F02-A.1 apply refused: migration 018 checksum differs from source.",
      );
    const absent = await client.query(
      "SELECT to_regclass('public.f02a1_runtime_policy_state') IS NULL AS missing",
    );
    if (absent.rows[0].missing)
      throw new PilotCliError(
        "F02-A.1 apply refused: migration 018 state is missing.",
      );
    try {
      await assertRuntimeCatalogContract(
        (text, values) => client.query(text, values),
        18,
      );
    } catch {
      throw new PilotCliError(
        "F02-A.1 apply refused: applied capability contract has drifted.",
      );
    }
    return { applied: true, migration: ENTRY, ledgerEntries: ledger.length };
  }
  if (
    ledger.length !== 17 ||
    !ledger.some((row) => row.name === BASE) ||
    !(
      await client.query(
        "SELECT to_regclass('public.f02a1_runtime_policy_state') IS NULL AS missing",
      )
    ).rows[0].missing
  )
    throw new PilotCliError(
      "F02-A.1 apply refused: expected exactly the 001–017 baseline.",
    );
  const roles = (
    await client.query(
      `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,
        r.rolcreaterole,r.rolreplication,r.rolinherit,
        shobj_description(r.oid,'pg_authid') AS marker,
        EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_parent,
        EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid=r.oid) AS has_members
      FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`,
      [["examate_business", "examate_auth", "examate_policy_owner"]],
    )
  ).rows;
  if (
    roles.length !== 3 ||
    roles.some(
      (role) =>
        role.marker !== F02_CAPABILITY_MARKER ||
        role.rolcanlogin ||
        role.rolsuper ||
        role.rolbypassrls ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolreplication ||
        role.rolinherit ||
        role.has_parent ||
        (role.rolname === "examate_policy_owner" && role.has_members),
    )
  )
    throw new PilotCliError(
      "F02-A.1 apply refused: managed runtime groups differ from the local contract.",
    );
  await assertNoManagedRuntimePolicyConflict(
    (text, values) => client.query(text, values),
    { allow017PolicyNames: true },
  );
  await assert017Baseline(client);
  return {
    applied: false,
    migration: ENTRY,
    ledgerEntries: ledger.length,
    capabilityRoles: 3,
    priorMigration: BASE,
  };
}

export async function runPilotApply018(
  client,
  input,
  { loadSource = loadMigrations, databaseName } = {},
) {
  const options = { apply: false, ...input };
  validateLocalConfirmation(options, databaseName ?? "");
  let started = false;
  let committing = false;
  try {
    const source = await loadSource();
    started = true;
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await lockManagedRuntimeRelations((text, values) =>
        client.query(text, values),
      );
      await client.query(
        "LOCK TABLE public.schema_migrations,public.f02_runtime_policy_state,public.f02_runtime_rls_state IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspect(client, source);
    if (!options.apply || plan.applied) {
      await client.query("ROLLBACK");
      started = false;
      return {
        dryRun: !options.apply,
        applied: plan.applied,
        changes: plan.applied
          ? []
          : ["018 workspace and re-index RLS policies"],
        ...plan,
      };
    }
    const file = source.find((item) => item.name === ENTRY);
    if (!file)
      throw new PilotCliError("F02-A.1 apply source migration is missing.");
    const applied = await applyMigrationInTransaction(client, file);
    if (!applied)
      throw new PilotCliError(
        "F02-A.1 apply refused: migration state changed while locked.",
      );
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, migration: ENTRY };
  } catch (error) {
    let rollbackFailed = false;
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    }
    if (committing) {
      const failure = new PilotCliError(
        "F02-A.1 apply outcome unknown; stop writers and inspect migration 018, its policy state and ledger before retrying.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (rollbackFailed) {
      const failure = new PilotCliError(
        "F02-A.1 transaction cleanup uncertain; discard the connection and inspect the disposable schema before retrying.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "F02-A.1 apply refused; inspect the disposable schema, prerequisite roles and connectivity privately.",
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
      JSON.stringify(
        {
          targetDatabase: databaseName,
          ...(await runPilotApply018(client, options, { databaseName })),
        },
        null,
        2,
      ),
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
