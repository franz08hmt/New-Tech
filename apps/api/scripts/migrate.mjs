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

export async function loadMigrations(root = projectRoot) {
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
  { loadSource = loadMigrations } = {},
) {
  if (!connectionString)
    throw new ConfigurationError(
      "Missing configuration: MIGRATION_DATABASE_URL. See .env.example",
    );
  const config = databaseConfig(connectionString);
  // Read every SQL file before connecting or changing database state.
  const files = await loadSource();
  const pool = new pg.Pool(config);
  let client;
  try {
    client = await pool.connect();
    await client.query("SET search_path TO public, extensions");
    await client.query("SELECT pg_advisory_lock(424204)");
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
    await client.query("COMMIT");
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
      await client.query("BEGIN");
      try {
        const appliedNow = await applyMigrationInTransaction(client, file, {
          pilotWorkspace: process.env.PILOT_WORKSPACE_ID,
        });
        if (!appliedNow)
          throw new MigrationFileError(file.path, {
            code: "MIGRATION_STATE_CHANGED",
          });
        await client.query("COMMIT");
        console.log(`Migration applied: ${file.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
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
    await migrate();
  } catch (error) {
    console.error(migrationFailure(error));
    process.exitCode = 1;
  }
}
