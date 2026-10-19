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
  F02_CAPABILITY_MARKER,
  F02_ENTRY,
  guardedLocalTarget,
  parseF02Args,
  validateLocalConfirmation,
} from "./f02-migration-common.mjs";

const lockedTables = `public.schema_migrations,public.workspaces,public.workspace_memberships,
  public.tasks,public.courses,public.exams,public.study_plans,public.expenses,
  public.documents,public.document_chunks,public.assistant_answer_receipts,
  public.assistant_feedback,public.pilot_sessions,public.pilot_auth_limits,
  public.pilot_refresh_attempts,public.pilot_oauth_attempts,
  public.ai_evaluations,auth.sessions`;

async function inspect(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  const expected = source.filter((file) => Number(file.name.slice(0, 3)) <= 16);
  if (
    ledger.some(
      (row) =>
        !source.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 17,
    )
  )
    throw new PilotCliError(
      "F02-A apply refused: later or unknown migration exists.",
    );
  for (const file of expected) {
    const matches = ledger.filter((row) => row.name === file.name);
    if (matches.length !== 1 || matches[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "F02-A apply refused: baseline migration ledger/checksum differs from source.",
      );
  }
  const f02 = source.find((file) => file.name === F02_ENTRY);
  if (!f02) throw new PilotCliError("F02-A apply source migration is missing.");
  const applied = ledger.filter((row) => row.name === F02_ENTRY);
  if (
    applied.length &&
    (applied.length !== 1 || applied[0].checksum !== migrationChecksum(f02))
  )
    throw new PilotCliError(
      "F02-A apply refused: migration 017 checksum differs from source.",
    );
  if (applied.length)
    return {
      applied: true,
      migration: F02_ENTRY,
      ledgerEntries: ledger.length,
    };
  if (ledger.length !== expected.length)
    throw new PilotCliError(
      "F02-A apply refused: baseline ledger is not exactly 001–016.",
    );
  const roles = (
    await client.query(
      `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,
      r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolinherit,
      shobj_description(r.oid,'pg_authid') AS marker,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_parent,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid=r.oid) AS has_members
    FROM pg_roles r WHERE r.rolname=ANY($1::text[])
    ORDER BY r.rolname`,
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
      "F02-A apply refused: pre-provisioned capability roles do not match the local contract.",
    );
  const collisions = await client.query(`SELECT
      to_regclass('public.f02_runtime_acl_state') IS NOT NULL OR
      to_regclass('public.f02_runtime_rls_state') IS NOT NULL OR
      to_regprocedure('public.examate_workspace_role(uuid)') IS NOT NULL OR
      EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND p.polname LIKE 'f02_%') AS found`);
  if (collisions.rows[0]?.found)
    throw new PilotCliError(
      "F02-A apply refused: target contains pre-existing F02 objects.",
    );
  return {
    applied: false,
    migration: F02_ENTRY,
    ledgerEntries: ledger.length,
    capabilityRoles: 3,
  };
}

export async function runPilotApply017(
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
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(`LOCK TABLE ${lockedTables} IN ACCESS EXCLUSIVE MODE`);
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
          : ["017 runtime role grants and tenant RLS policies"],
        ...plan,
      };
    }
    const file = source.find((item) => item.name === F02_ENTRY);
    const applied = await applyMigrationInTransaction(client, file);
    if (!applied)
      throw new PilotCliError(
        "F02-A apply refused: migration state changed while locked.",
      );
    committing = true;
    await client.query("COMMIT");
    started = false;
    return {
      dryRun: false,
      applied: true,
      migration: F02_ENTRY,
      ledgerEntries: plan.ledgerEntries + 1,
    };
  } catch (error) {
    let rollbackFailed = false;
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    }
    if (committing || rollbackFailed) {
      const unknown = new PilotCliError(
        "F02-A apply outcome unknown; stop the local app and inspect migration 017 and schema_migrations before retrying.",
      );
      unknown.discardConnection = true;
      throw unknown;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "F02-A apply refused; inspect disposable schema, role prerequisites and connectivity privately.",
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
          ...(await runPilotApply017(client, options, { databaseName })),
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
