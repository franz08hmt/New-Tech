import { createHash } from "node:crypto";
import { authConfig, uuid } from "../dist/auth/auth-config.js";
import { loadEnvironment } from "../dist/config/config.js";
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
    publicOriginMatchesDev:
      process.env.PUBLIC_ORIGIN === "http://127.0.0.1:5173",
    databaseSessionVerification:
      (process.env.AUTH_SESSION_VERIFICATION ?? "database") === "database",
  };
}

export async function runPilotPreflight(client, { target, authSummary }) {
  const source = await loadMigrations();
  return withReadOnly(client, async () => {
    const transaction = await client.query("SHOW transaction_read_only");
    if (transaction.rows[0]?.transaction_read_only !== "on")
      throw new Error("Read-only transaction required");
    const roleResult =
      await client.query(`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass
      FROM pg_roles r WHERE r.rolname=current_user`);
    const role = roleResult.rows[0];
    const schema = await client.query(
      "SELECT oid, has_schema_privilege(current_user,oid,'USAGE') AS usage FROM pg_namespace WHERE nspname='auth'",
    );
    const columns =
      await client.query(`SELECT a.attname, has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='auth' AND c.relname='sessions' AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname IN ('id','user_id','not_after')`);
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
      role: {
        isPostgres: role.name === "postgres",
        nameMasked: `${role.name.slice(0, 2)}…${role.name.slice(-2)}`,
        superuser: role.superuser,
        bypassRls: role.bypass,
        authUsage: schema.rows[0]?.usage === true,
        authSessionColumns: Object.fromEntries(
          ["id", "user_id", "not_after"].map((name) => [
            name,
            columns.rows.some((c) => c.attname === name && c.allowed),
          ]),
        ),
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
  if (!authSummary.authConfigValid) {
    console.log(
      JSON.stringify(
        {
          databaseChecked: false,
          target: { maskedProjectRef: target.maskedProjectRef },
          auth: authSummary,
          reason:
            "Auth configuration incomplete; database checks have not run.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  const { pool } = pilotConnection({ readOnly: true });
  try {
    const client = await pool.connect();
    try {
      const report = await runPilotPreflight(client, { target, authSummary });
      console.log(JSON.stringify(report, null, 2));
      if (
        !report.checksumsMatch ||
        !report.allSourceMigrationsApplied ||
        !report.stage012Applied ||
        !report.stage013Applied ||
        !report.stage014Applied ||
        !report.stage015Applied ||
        !report.auth.publicOriginMatchesDev ||
        !report.auth.databaseSessionVerification ||
        !report.role.authUsage ||
        !Object.values(report.role.authSessionColumns).every(Boolean)
      )
        process.exitCode = 1;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
if (isMain(import.meta.url)) main().catch(reportFailure);
