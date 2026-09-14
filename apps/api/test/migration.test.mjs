import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import pg from "pg";
import { ConfigurationError } from "../dist/config/config.js";
import {
  migrate,
  migrationFailure,
  loadMigrations,
} from "../scripts/migrate.mjs";

const saved = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
function databaseMock({ failSql = false, wrongChecksum = false } = {}) {
  process.env.DATABASE_URL = "postgres://fixture:fixture@cloud.example/db";
  process.env.DATABASE_SSL = "true";
  delete process.env.DATABASE_CA_CERT_PATH;
  delete process.env.MIGRATION_DATABASE_URL;
  const history = new Map();
  const statements = [];
  const configs = [];
  let releases = 0;
  let ends = 0;
  const client = {
    async query(sql, values) {
      statements.push(sql);
      if (sql.startsWith("SELECT checksum"))
        return {
          rows: history.has(values[0])
            ? [{ checksum: wrongChecksum ? "changed" : history.get(values[0]) }]
            : [],
        };
      if (failSql && sql.startsWith("CREATE EXTENSION"))
        throw Object.assign(new Error("private provider details"), {
          code: "42501",
        });
      if (sql.startsWith("INSERT INTO schema_migrations"))
        history.set(values[0], values[1]);
      return { rows: [] };
    },
    release() {
      releases++;
    },
  };
  mock.method(pg, "Pool", function (config) {
    configs.push(config);
    return {
      async connect() {
        return client;
      },
      async end() {
        ends++;
      },
    };
  });
  const messages = [];
  mock.method(console, "log", (message) => messages.push(message));
  return {
    history,
    statements,
    configs,
    messages,
    get releases() {
      return releases;
    },
    get ends() {
      return ends;
    },
  };
}

test("migration applies then skips both files with verified TLS and empty URL fallback (mock DB)", async () => {
  const db = databaseMock();
  process.env.MIGRATION_DATABASE_URL = "";
  await migrate();
  process.env.MIGRATION_DATABASE_URL = "   ";
  await migrate();
  assert.deepEqual(db.messages, [
    "Migration applied: 001_init.sql",
    "Migration applied: 002_non_ai_storage.sql",
    "Migration already applied: 001_init.sql",
    "Migration already applied: 002_non_ai_storage.sql",
  ]);
  assert.equal(db.history.size, 2);
  assert.equal(
    db.statements.filter((s) => s.startsWith("CREATE EXTENSION")).length,
    1,
  );
  for (const config of db.configs) {
    assert.equal(config.connectionString, process.env.DATABASE_URL);
    assert.equal(config.ssl.rejectUnauthorized, true);
  }
  assert.equal(db.releases, 2);
  assert.equal(db.ends, 2);
});

test("migration owner override is used when present (mock DB)", async () => {
  const db = databaseMock();
  process.env.MIGRATION_DATABASE_URL =
    "postgres://owner:fixture@cloud.example/db";
  await migrate();
  assert.equal(
    db.configs[0].connectionString,
    process.env.MIGRATION_DATABASE_URL,
  );
});

test("failed SQL rolls back, unlocks and closes without recording migration (mock DB)", async () => {
  const db = databaseMock({ failSql: true });
  await assert.rejects(migrate(), { code: "42501" });
  assert.equal(db.history.size, 0);
  assert.ok(db.statements.includes("ROLLBACK"));
  assert.ok(db.statements.includes("SELECT pg_advisory_unlock(424204)"));
  assert.equal(db.releases, 1);
  assert.equal(db.ends, 1);
});

test("changed migration checksum fails without reapplying SQL (mock DB)", async () => {
  const db = databaseMock({ wrongChecksum: true });
  await migrate();
  await assert.rejects(migrate(), { code: "MIGRATION_CHECKSUM_CHANGED" });
  assert.equal(
    db.statements.filter((s) => s.startsWith("CREATE EXTENSION")).length,
    1,
  );
});

test("CA configuration failure happens before a pool is created", async () => {
  const db = databaseMock();
  process.env.DATABASE_CA_CERT_PATH = "secrets/absent-migration-ca.pem";
  await assert.rejects(migrate(), /DATABASE_CA_CERT_PATH does not point/);
  assert.equal(db.configs.length, 0);
});

test("missing SQL directory and init file identify migration input without absolute paths", async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "examate-migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(loadMigrations(directory), (error) => {
    assert.equal(
      migrationFailure(error),
      "Migration failed [ENOENT]: Cannot read migration input: infra/postgres/migrations",
    );
    return true;
  });
  mkdirSync(resolve(directory, "infra/postgres/migrations"), {
    recursive: true,
  });
  await assert.rejects(loadMigrations(directory), (error) => {
    assert.equal(
      migrationFailure(error),
      "Migration failed [ENOENT]: Cannot read migration input: infra/postgres/init/001_init.sql",
    );
    return true;
  });
});

test("diagnostics expose safe configuration messages and error codes, never provider secrets", () => {
  assert.match(
    migrationFailure(new ConfigurationError("Invalid DATABASE_URL")),
    /Invalid DATABASE_URL/,
  );
  for (const code of [
    "28P01",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNKNOWN",
    "bad-code",
  ]) {
    const result = migrationFailure(
      Object.assign(
        new Error(
          "postgres://user:private-password@private-host/db sb_secret_private",
        ),
        { code },
      ),
    );
    assert.doesNotMatch(result, /private|postgres:\/\//);
  }
});
