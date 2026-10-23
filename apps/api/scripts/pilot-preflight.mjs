import { createHash } from "node:crypto";
import { authConfig, uuid } from "../dist/auth/auth-config.js";
import {
  authDatabaseConfig,
  databaseConfig,
  loadEnvironment,
} from "../dist/config/config.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { loadMigrations } from "./migrate.mjs";
import {
  isMain,
  pilotConnection,
  reportFailure,
  resolvePilotProject,
  withReadOnly,
} from "./pilot-cli-common.mjs";

export function authAvailability() {
  const present = (name) =>
    Boolean(process.env[name]?.trim()) &&
    !process.env[name].includes("REPLACE_");
  const key = process.env.SESSION_ENCRYPTION_KEY ?? "";
  let authConfigValid = false;
  try {
    authConfig();
    authConfigValid = true;
  } catch {
    /* Report availability only. */
  }
  let runtimeDatabaseConfigValid = false;
  let migrationDatabaseConfigValid = false;
  let runtimeRolesDistinct = false;
  try {
    databaseConfig();
    authDatabaseConfig();
    const business = new URL(process.env.DATABASE_URL);
    const auth = new URL(process.env.AUTH_DATABASE_URL);
    runtimeRolesDistinct =
      decodeURIComponent(business.username) !==
      decodeURIComponent(auth.username);
    runtimeDatabaseConfigValid = true;
  } catch {
    /* Report availability only. */
  }
  try {
    if (process.env.MIGRATION_DATABASE_URL?.trim()) {
      databaseConfig(process.env.MIGRATION_DATABASE_URL);
      const business = new URL(process.env.DATABASE_URL);
      const auth = new URL(process.env.AUTH_DATABASE_URL);
      const maintenance = new URL(process.env.MIGRATION_DATABASE_URL);
      const sameTarget = (left, right) =>
        left.hostname === right.hostname &&
        left.port === right.port &&
        left.pathname === right.pathname;
      migrationDatabaseConfigValid =
        sameTarget(business, auth) &&
        sameTarget(business, maintenance) &&
        decodeURIComponent(maintenance.username) !==
          decodeURIComponent(business.username) &&
        decodeURIComponent(maintenance.username) !==
          decodeURIComponent(auth.username);
    }
  } catch {
    /* Report availability only. */
  }
  return {
    PUBLIC_ORIGIN: present("PUBLIC_ORIGIN"),
    SUPABASE_PUBLISHABLE_KEY: present("SUPABASE_PUBLISHABLE_KEY"),
    SUPABASE_ANON_KEY: present("SUPABASE_ANON_KEY"),
    PILOT_WORKSPACE_ID:
      present("PILOT_WORKSPACE_ID") &&
      uuid.test(process.env.PILOT_WORKSPACE_ID),
    SESSION_ENCRYPTION_KEY:
      present("SESSION_ENCRYPTION_KEY") &&
      key.length === 44 &&
      Buffer.from(key, "base64").length === 32 &&
      Buffer.from(key, "base64").toString("base64") === key,
    authConfigValid,
    runtimeDatabaseConfigValid,
    migrationDatabaseConfigValid,
    runtimeRolesDistinct,
    googleRequested: process.env.AUTH_GOOGLE_ENABLED === "true",
    publicOriginMatchesDev:
      process.env.PUBLIC_ORIGIN === "http://127.0.0.1:5173",
    databaseSessionVerification:
      (process.env.AUTH_SESSION_VERIFICATION ?? "database") === "database",
  };
}

export async function runPilotPreflight(
  client,
  {
    target,
    authSummary,
    runtimeCapabilities = { business: false, auth: false },
  },
) {
  return withReadOnly(client, async () => {
    const transaction = await client.query("SHOW transaction_read_only");
    if (transaction.rows[0]?.transaction_read_only !== "on")
      throw new Error("Read-only transaction required");
    const roleResult =
      await client.query(`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass
      FROM pg_roles r WHERE r.rolname=current_user`);
    const role = roleResult.rows[0];
    const ledger = await client.query(
      "SELECT c.oid, has_table_privilege(current_user,c.oid,'SELECT') AS readable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='schema_migrations' AND c.relkind IN ('r','p')",
    );
    const migrationLedgerReadable = ledger.rows[0]?.readable === true;
    const applied = migrationLedgerReadable
      ? (
          await client.query(
            "SELECT name,checksum FROM public.schema_migrations",
          )
        ).rows
      : [];
    const profile = applied.some(
      (row) => row.name === "017_managed_runtime_rls.sql",
    )
      ? "supabase-managed"
      : "canonical";
    const source = await loadMigrations(undefined, { profile });
    const migrations = source.map((file) => {
      const row = applied.find((candidate) => candidate.name === file.name);
      return {
        name: file.name,
        applied: Boolean(row),
        checksumMatches:
          Boolean(row) &&
          row.checksum ===
            createHash("sha256")
              .update(file.sql.replace(/\r\n/g, "\n"))
              .digest("hex"),
      };
    });
    return {
      databaseChecked: true,
      transactionReadOnly: true,
      migrationLedgerReadable,
      target: { maskedProjectRef: target.maskedProjectRef },
      auth: authSummary,
      runtimeCapabilities,
      migrationProfile: profile,
      migrations,
      allSourceMigrationsApplied: migrations.every((m) => m.applied),
      checksumsMatch:
        migrationLedgerReadable &&
        applied.length > 0 &&
        applied.every((row) =>
          migrations.some((m) => m.name === row.name && m.checksumMatches),
        ),
      stage012Applied: migrations.some(
        (m) => m.name.startsWith("012_") && m.applied,
      ),
      stage013Applied: migrations.some(
        (m) => m.name.startsWith("013_") && m.applied,
      ),
      stage014Applied: migrations.some(
        (m) => m.name === "014_workspace_scope.sql" && m.applied,
      ),
      stage015Applied: migrations.some(
        (m) => m.name === "015_assistant_answer_receipts.sql" && m.applied,
      ),
      stage016Applied: migrations.some(
        (m) => m.name === "016_pilot_oauth_attempts.sql" && m.applied,
      ),
      stage017Applied: migrations.some(
        (m) =>
          ["017_runtime_rls.sql", "017_managed_runtime_rls.sql"].includes(
            m.name,
          ) && m.applied,
      ),
      maintenanceRole: {
        isPostgres: role.name === "postgres",
        nameMasked: `${role.name.slice(0, 2)}…${role.name.slice(-2)}`,
        superuser: role.superuser,
        bypassRls: role.bypass,
      },
    };
  });
}

async function main() {
  loadEnvironment();
  const authSummary = authAvailability();
  let target;
  try {
    target = resolvePilotProject(
      process.env.DATABASE_URL,
      process.env.SUPABASE_URL ?? "",
    );
  } catch {
    console.log(
      JSON.stringify(
        {
          databaseChecked: false,
          targetValid: false,
          auth: authSummary,
          reason: "Target configuration invalid; database checks have not run.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  // In this preparation phase, incomplete Auth configuration must not open a cloud connection.
  if (
    !authSummary.authConfigValid ||
    !authSummary.runtimeDatabaseConfigValid ||
    !authSummary.migrationDatabaseConfigValid ||
    !authSummary.runtimeRolesDistinct
  ) {
    console.log(
      JSON.stringify(
        {
          databaseChecked: false,
          target: { maskedProjectRef: target.maskedProjectRef },
          auth: authSummary,
          reason:
            "Auth or database capability configuration incomplete; database checks have not run.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  let capabilityTargetsMatch = false;
  try {
    const runtimeTarget = resolvePilotProject(
      process.env.AUTH_DATABASE_URL,
      process.env.SUPABASE_URL ?? "",
    );
    const maintenanceTarget = resolvePilotProject(
      process.env.MIGRATION_DATABASE_URL,
      process.env.SUPABASE_URL ?? "",
    );
    capabilityTargetsMatch =
      runtimeTarget.projectRef === target.projectRef &&
      maintenanceTarget.projectRef === target.projectRef;
  } catch {
    /* Do not open any connection until every configured capability matches. */
  }
  if (!capabilityTargetsMatch) {
    console.log(
      JSON.stringify(
        {
          databaseChecked: false,
          target: { maskedProjectRef: target.maskedProjectRef },
          auth: authSummary,
          reason:
            "Database capability targets do not match the configured project; no database checks have run.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  const runtimeCapabilities = await probeRuntimeCapabilities();
  const { pool } = pilotConnection({ maintenance: true, readOnly: true });
  try {
    const client = await pool.connect();
    try {
      const report = await runPilotPreflight(client, {
        target,
        authSummary,
        runtimeCapabilities,
      });
      console.log(JSON.stringify(report, null, 2));
      if (
        !report.checksumsMatch ||
        !report.allSourceMigrationsApplied ||
        !report.stage012Applied ||
        !report.stage013Applied ||
        !report.stage014Applied ||
        !report.stage015Applied ||
        !report.stage016Applied ||
        !report.stage017Applied ||
        !report.auth.publicOriginMatchesDev ||
        !report.auth.databaseSessionVerification ||
        !report.runtimeCapabilities.business ||
        !report.runtimeCapabilities.auth
      )
        process.exitCode = 1;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function probeRuntimeCapabilities() {
  const result = { business: false, auth: false };
  let business;
  let auth;
  try {
    business = new DatabaseService();
    await business.assertBusinessCapability();
    result.business = true;
  } catch {
    /* Capability probes intentionally return booleans only. */
  } finally {
    await business?.onModuleDestroy();
  }
  try {
    auth = new AuthDatabaseService();
    await auth.assertCapability("examate_auth");
    result.auth = true;
  } catch {
    /* Capability probes intentionally return booleans only. */
  } finally {
    await auth?.onModuleDestroy();
  }
  return result;
}
if (isMain(import.meta.url)) main().catch(reportFailure);
