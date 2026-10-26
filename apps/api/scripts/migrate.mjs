import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { uuid } from "../dist/auth/auth-config.js";
import {
  databaseConfig,
  loadEnvironment,
  projectRoot,
  ConfigurationError,
} from "../dist/config/config.js";
import {
  EXPECTED_021_RUNTIME_POLICIES,
  EXPECTED_022_RUNTIME_POLICIES,
  EXPECTED_023_RUNTIME_POLICIES,
  assertNoManagedRuntimePolicyConflict,
  lockManagedRuntimeRelations,
} from "../dist/database/runtime-capability-contract.js";

class MigrationFileError extends Error {
  constructor(target, error) {
    super(
      error.code === "MIGRATION_CHECKSUM_CHANGED"
        ? `Migration checksum changed: ${target}`
        : `Cannot read migration input: ${target}`,
    );
    this.code = error.code;
  }
}

export async function loadMigrations(
  root = projectRoot,
  { profile = "canonical" } = {},
) {
  if (!["canonical", "supabase-managed"].includes(profile))
    throw new ConfigurationError("Unknown migration profile.");
  const directory = "infra/postgres/migrations";
  let names;
  try {
    names = await readdir(resolve(root, directory));
  } catch (error) {
    throw new MigrationFileError(directory, error);
  }
  const files = [
    { name: "001_init.sql", path: "infra/postgres/init/001_init.sql" },
    ...names
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({
        name,
        path: `${directory}/${name}`,
      })),
  ];
  // Canonical migrations after 025 (027 onwards) are additive and identical in
  // both profiles; the managed profile applies them after its own 026.
  const laterMigrations = [];
  if (profile === "supabase-managed") {
    if (files.length < 25)
      throw new ConfigurationError(
        "Managed profile requires reviewed 001-025 source manifest.",
      );
    laterMigrations.push(...files.splice(25));
    if (laterMigrations.some((file) => !/^0(2[7-9]|[3-9]\d)_/.test(file.name)))
      throw new ConfigurationError(
        "Managed profile only accepts additive migrations numbered 027 or later after the reviewed manifest.",
      );
    for (const index of [16, 24]) {
      if (
        !files[index]?.name.startsWith(`${String(index + 1).padStart(3, "0")}_`)
      )
        throw new ConfigurationError("Managed migration source order changed.");
      files[index] = {
        name:
          index === 16
            ? "017_managed_runtime_rls.sql"
            : "025_managed_auth_verifier.sql",
        path: `infra/postgres/managed-migrations/${index === 16 ? "017_managed_runtime_rls.sql" : "025_managed_auth_verifier.sql"}`,
      };
    }
  }
  if (profile === "supabase-managed")
    files.push({
      name: "026_managed_platform_connect.sql",
      path: "infra/postgres/managed-migrations/026_managed_platform_connect.sql",
    });
  files.push(...laterMigrations);
  for (const file of files) {
    try {
      file.sql = await readFile(resolve(root, file.path), "utf8");
    } catch (error) {
      throw new MigrationFileError(file.path, error);
    }
  }
  return files;
}

export function migrationFailure(error) {
  const backfillHints = new Set([
    "014: workspace backfill requires exactly one workspace; multiple workspaces need an explicit mapping first",
    "014: PILOT_WORKSPACE_ID must be a valid UUID",
    "014: PILOT_WORKSPACE_ID differs from the existing workspace; check configuration before migrating",
    "014: seeded data needs a workspace; set a valid PILOT_WORKSPACE_ID before db:migrate",
  ]);
  const code = /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : "CONFIG_OR_SCHEMA_ERROR";
  const reasons = {
    SELF_SIGNED_CERT_IN_CHAIN:
      "Database TLS chain is not trusted by the configured CA",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      "Database TLS certificate issuer could not be verified",
    CERT_HAS_EXPIRED: "Database TLS certificate has expired",
    ERR_TLS_CERT_ALTNAME_INVALID:
      "Database hostname does not match its TLS certificate",
    ENOTFOUND: "Database hostname could not be resolved",
    EAI_AGAIN: "Database DNS lookup temporarily failed",
    ENETUNREACH: "Database network is unreachable",
    EACCES: "Database network access was denied",
    EPERM: "Database network access was denied",
    ECONNREFUSED: "Database endpoint refused the connection",
    ETIMEDOUT: "Database connection timed out",
    "28P01":
      "Database rejected password authentication for the configured connection",
    42501: "Database role lacks permission for the migration operation",
    42710:
      "Migration tried to create an existing schema object; inspect existing schema and migration history",
    "58P01": "Database server could not find a required extension file",
    RUNTIME_POLICY_CONFLICT:
      "An unmanaged row policy affects a protected runtime capability; inspect it before migration",
  };
  const message =
    error instanceof ConfigurationError || error instanceof MigrationFileError
      ? error.message
      : (code === "P0001" && backfillHints.has(error.message)
          ? error.message
          : undefined) ||
        reasons[code] ||
        "Database migration failed; inspect server logs for this error code";
  return `Migration failed [${code}]: ${message}`;
}

export function migrationChecksum(file) {
  return createHash("sha256")
    .update(file.sql.replace(/\r\n/g, "\n"))
    .digest("hex");
}

export function validateMigrationLedger(ledger, files) {
  const ordered = [...ledger].sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, row] of ordered.entries()) {
    const file = files[index];
    if (!file || row.name !== file.name)
      throw new ConfigurationError(
        "Migration history is not a prefix of the selected profile.",
      );
    if (row.checksum !== migrationChecksum(file))
      throw new MigrationFileError(file.path, {
        code: "MIGRATION_CHECKSUM_CHANGED",
      });
  }
}

/** Apply exactly one already-loaded migration inside the caller's transaction. */
export async function applyMigrationInTransaction(
  client,
  file,
  { pilotWorkspace } = {},
) {
  const checksum = migrationChecksum(file);
  const applied = await client.query(
    "SELECT checksum FROM schema_migrations WHERE name = $1",
    [file.name],
  );
  if (applied.rows.length) {
    if (applied.rows[0].checksum !== checksum)
      throw new MigrationFileError(file.path, {
        code: "MIGRATION_CHECKSUM_CHANGED",
      });
    return false;
  }
  if (pilotWorkspace && uuid.test(pilotWorkspace))
    await client.query(
      "SELECT set_config('examate.pilot_workspace_id',$1,true)",
      [pilotWorkspace],
    );
  await client.query(file.sql);
  // Secure initial tables before the 001 transaction commits, even if 002 fails.
  if (file.name === "001_init.sql")
    await client.query(`
      ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ai_evaluations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON tasks, documents, document_chunks, ai_evaluations FROM PUBLIC;
      DO $$ DECLARE r TEXT; BEGIN
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
            EXECUTE format('REVOKE ALL ON tasks, documents, document_chunks, ai_evaluations FROM %I', r);
          END IF;
        END LOOP;
      END $$;
    `);
  await client.query(
    "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
    [file.name, checksum],
  );
  return true;
}

export async function migrate(
  connectionString = process.env.MIGRATION_DATABASE_URL?.trim(),
  { loadSource, profile = "canonical", beforeCommit } = {},
) {
  if (!["canonical", "supabase-managed"].includes(profile))
    throw new ConfigurationError("Unknown migration profile.");
  if (
    beforeCommit !== undefined &&
    (profile !== "supabase-managed" || typeof beforeCommit !== "function")
  )
    throw new ConfigurationError(
      "beforeCommit requires a managed migration profile and a function.",
    );
  if (!connectionString)
    throw new ConfigurationError(
      "Missing configuration: MIGRATION_DATABASE_URL. See .env.example",
    );
  const config = databaseConfig(connectionString);
  // Read every SQL file before connecting or changing database state.
  const files = await (loadSource
    ? loadSource()
    : loadMigrations(projectRoot, { profile }));
  const pool = new pg.Pool(config);
  let client;
  try {
    client = await pool.connect();
    await client.query("SET search_path TO public, extensions");
    await client.query("SELECT pg_advisory_lock(424204)");
    if (!loadSource || profile === "supabase-managed") {
      const exists = await client.query(
        "SELECT to_regclass('public.schema_migrations') AS ledger",
      );
      const ledger = exists.rows[0]?.ledger
        ? (
            await client.query(
              "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
            )
          ).rows
        : [];
      validateMigrationLedger(ledger, files);
      if (profile === "supabase-managed" && ledger.length < 16)
        throw new ConfigurationError(
          "Managed profile requires verified 001-016 history before installation.",
        );
    }
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query("REVOKE ALL ON schema_migrations FROM PUBLIC");
    await client.query(
      "ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY",
    );
    await client.query(`DO $$ DECLARE r TEXT; BEGIN
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
          EXECUTE format('REVOKE ALL ON schema_migrations FROM %I', r);
        END IF;
      END LOOP;
    END $$`);
    if (profile !== "supabase-managed") await client.query("COMMIT");
    for (const file of files) {
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [file.name],
      );
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== migrationChecksum(file))
          throw new MigrationFileError(file.path, {
            code: "MIGRATION_CHECKSUM_CHANGED",
          });
        console.log(`Migration already applied: ${file.name}`);
        continue;
      }
      if (profile !== "supabase-managed") await client.query("BEGIN");
      try {
        if (
          [
            "017_runtime_rls.sql",
            "017_managed_runtime_rls.sql",
            "018_runtime_rls_reindex.sql",
          ].includes(file.name)
        ) {
          await lockManagedRuntimeRelations((text, values) =>
            client.query(text, values),
          );
          await assertNoManagedRuntimePolicyConflict(
            (text, values) => client.query(text, values),
            {
              allow017PolicyNames: file.name === "018_runtime_rls_reindex.sql",
            },
          );
        } else if (file.name === "021_ai_usage_dashboard.sql") {
          await lockManagedRuntimeRelations(
            (text, values) => client.query(text, values),
            { includeAiUsage: true },
          );
          await assertNoManagedRuntimePolicyConflict(
            (text, values) => client.query(text, values),
            { allowedPolicyNames: EXPECTED_021_RUNTIME_POLICIES },
          );
        } else if (file.name === "022_assistant_conversations.sql") {
          await lockManagedRuntimeRelations(
            (text, values) => client.query(text, values),
            { includeAiUsage: true },
          );
          await assertNoManagedRuntimePolicyConflict(
            (text, values) => client.query(text, values),
            { allowedPolicyNames: EXPECTED_021_RUNTIME_POLICIES },
          );
        } else if (file.name === "023_study_coach_quizzes.sql") {
          await lockManagedRuntimeRelations(
            (text, values) => client.query(text, values),
            { includeAiUsage: true },
          );
          await assertNoManagedRuntimePolicyConflict(
            (text, values) => client.query(text, values),
            { allowedPolicyNames: EXPECTED_022_RUNTIME_POLICIES },
          );
        } else if (file.name === "024_study_coach_flashcards.sql") {
          await lockManagedRuntimeRelations(
            (text, values) => client.query(text, values),
            { includeAiUsage: true },
          );
          await assertNoManagedRuntimePolicyConflict(
            (text, values) => client.query(text, values),
            { allowedPolicyNames: EXPECTED_023_RUNTIME_POLICIES },
          );
        }
        const appliedNow = await applyMigrationInTransaction(client, file, {
          pilotWorkspace: process.env.PILOT_WORKSPACE_ID,
        });
        if (!appliedNow)
          throw new MigrationFileError(file.path, {
            code: "MIGRATION_STATE_CHANGED",
          });
        if (profile !== "supabase-managed") await client.query("COMMIT");
        console.log(
          `Migration ${profile === "supabase-managed" ? "staged" : "applied"}: ${file.name}`,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    if (profile === "supabase-managed") {
      if (beforeCommit) await beforeCommit(client);
      await client.query("COMMIT");
    }
  } finally {
    await client?.query("ROLLBACK").catch(() => {});
    await client?.query("SELECT pg_advisory_unlock(424204)").catch(() => {});
    client?.release();
    await pool.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    loadEnvironment();
    const args = process.argv.slice(2);
    if (
      args.length &&
      (args.length !== 1 || args[0] !== "--profile=supabase-managed")
    )
      throw new ConfigurationError("Invalid migration arguments.");
    await migrate(undefined, {
      profile: args.length ? "supabase-managed" : "canonical",
    });
  } catch (error) {
    console.error(migrationFailure(error));
    process.exitCode = 1;
  }
}
