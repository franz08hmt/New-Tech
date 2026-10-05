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

const expectedMigrationNames = [
  "001_init.sql",
  "002_non_ai_storage.sql",
  "003_courses.sql",
  "004_exams.sql",
  "005_study_plans.sql",
  "006_expenses.sql",
  "007_document_course.sql",
  "008_rag_foundation.sql",
  "009_document_index_quality.sql",
  "010_document_ocr_coverage.sql",
  "011_assistant_feedback.sql",
];

const saved = { ...process.env };
test("feedback migration keeps private, immutable review provenance and bounded snapshots", async () => {
  const migration = (await loadMigrations()).find(
    (m) => m.name === "011_assistant_feedback.sql",
  );
  const sql = migration.sql;
  for (const pattern of [
    /answer_id UUID NOT NULL UNIQUE/,
    /submission_id UUID NOT NULL UNIQUE/,
    /char_length\(comment\) <= 1000/,
    /octet_length\(snapshot::TEXT\) <= 81920/,
    /UNREVIEWED/,
    /client_reported/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE ALL ON assistant_feedback FROM PUBLIC/,
    /'anon', 'authenticated'/,
    /array_positions\(reasons, 'other'\)/,
    /COALESCE/,
  ])
    assert.match(sql, pattern);
  assert.doesNotMatch(
    sql,
    /REFERENCES|ON DELETE CASCADE|INSERT INTO ai_evaluations/,
  );
});
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
      if (failSql === true && sql.startsWith("CREATE EXTENSION"))
        throw Object.assign(new Error("private provider details"), {
          code: "42501",
        });
      if (failSql === "courses" && sql.startsWith("CREATE TABLE courses"))
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

test("migration applies then skips all files with verified TLS and empty URL fallback (mock DB)", async () => {
  const db = databaseMock();
  process.env.MIGRATION_DATABASE_URL = "";
  await migrate();
  process.env.MIGRATION_DATABASE_URL = "   ";
  await migrate();
  assert.deepEqual(db.messages, [
    ...expectedMigrationNames.map((name) => `Migration applied: ${name}`),
    ...expectedMigrationNames.map(
      (name) => `Migration already applied: ${name}`,
    ),
  ]);
  assert.equal(db.history.size, expectedMigrationNames.length);
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

test("linking documents to courses is additive and keeps the file", async () => {
  const migrations = await loadMigrations();
  const linkMigration = migrations[6].sql;
  // ALTER, not a rebuild: documents already hold real files in Storage.
  assert.match(linkMigration, /ALTER TABLE documents/);
  assert.match(
    linkMigration,
    /ADD COLUMN course_id UUID REFERENCES courses \(id\) ON DELETE SET NULL/,
  );
  // Dropping the row would orphan an object that still exists in Supabase.
  assert.doesNotMatch(linkMigration, /ON DELETE CASCADE/);
  assert.doesNotMatch(linkMigration, /DROP TABLE|DROP COLUMN/);
});

test("RAG foundation fixes vector dimensions and adds safe processing state", async () => {
  const migrations = await loadMigrations();
  const ragMigration = migrations[7].sql;
  assert.match(ragMigration, /ALTER COLUMN embedding TYPE VECTOR\(768\)/);
  assert.match(ragMigration, /vector_dims\(embedding\) <> 768/);
  assert.match(ragMigration, /USING hnsw \(embedding vector_cosine_ops\)/);
  assert.match(
    ragMigration,
    /processing_status IN \('pending', 'processing', 'ready', 'failed'\)/,
  );
  assert.match(ragMigration, /ADD COLUMN indexed_at TIMESTAMPTZ/);
  assert.match(ragMigration, /ADD COLUMN processing_error_code VARCHAR\(80\)/);
  assert.match(ragMigration, /ADD COLUMN embedding_model VARCHAR\(100\)/);
  assert.match(ragMigration, /ADD COLUMN embedding_dimensions SMALLINT/);
  assert.doesNotMatch(ragMigration, /DROP TABLE|TRUNCATE|DELETE FROM/);
});

test("document index quality is additive and preserves unknown legacy coverage", async () => {
  const migrations = await loadMigrations();
  const qualityMigration = migrations[8].sql;
  assert.match(qualityMigration, /ALTER TABLE documents/);
  assert.match(qualityMigration, /ADD COLUMN total_page_count SMALLINT/);
  assert.match(qualityMigration, /ADD COLUMN useful_text_page_count SMALLINT/);
  assert.match(
    qualityMigration,
    /ADD COLUMN skipped_page_numbers SMALLINT\[\]/,
  );
  assert.match(qualityMigration, /ADD COLUMN needs_ocr BOOLEAN/);
  assert.doesNotMatch(
    qualityMigration,
    /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE documents/,
  );
});

test("OCR coverage is additive and bounded without storing page images", async () => {
  const migrations = await loadMigrations();
  const ocrMigration = migrations[9].sql;
  assert.match(ocrMigration, /ADD COLUMN ocr_page_count SMALLINT/);
  assert.match(ocrMigration, /ADD COLUMN ocr_page_numbers SMALLINT\[\]/);
  assert.match(ocrMigration, /ocr_page_count BETWEEN 0 AND 50/);
  assert.doesNotMatch(
    ocrMigration,
    /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|BYTEA/,
  );
});

test("expenses are an additive sixth migration that outlive their course", async () => {
  const migrations = await loadMigrations();
  const expenseMigration = migrations[5].sql;
  assert.match(expenseMigration, /CREATE TABLE expenses/);
  // SET NULL, not CASCADE: money that was spent stays spent even if the
  // subject is removed. Deleting the expense would misstate the total.
  assert.match(
    expenseMigration,
    /course_id UUID REFERENCES courses \(id\) ON DELETE SET NULL/,
  );
  // INTEGER, not BIGINT: the pg driver returns BIGINT as a string, which would
  // concatenate instead of add when the UI totals a period.
  assert.match(expenseMigration, /amount INTEGER NOT NULL/);
  assert.doesNotMatch(expenseMigration, /amount BIGINT|amount NUMERIC/);
  assert.match(
    expenseMigration,
    /CHECK \(amount > 0 AND amount <= 2000000000\)/,
  );
  assert.match(expenseMigration, /ENABLE ROW LEVEL SECURITY/);
  // Seeds join on slug and must tolerate a NULL slug for unassigned spending.
  assert.match(expenseMigration, /LEFT JOIN courses c ON c\.slug = v\.slug/);
  assert.doesNotMatch(expenseMigration, /ALTER TABLE courses/);
});

test("study plans are an additive fifth migration tied to courses", async () => {
  const migrations = await loadMigrations();
  const planMigration = migrations[4].sql;
  assert.match(planMigration, /CREATE TABLE study_plans/);
  assert.match(
    planMigration,
    /course_id UUID NOT NULL REFERENCES courses \(id\) ON DELETE CASCADE/,
  );
  assert.match(planMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(planMigration, /JOIN courses c ON c\.slug = v\.slug/);
  // Completion is one nullable timestamp, not a boolean plus a date that
  // could contradict each other.
  assert.match(planMigration, /completed_at TIMESTAMPTZ/);
  assert.doesNotMatch(planMigration, /is_done|completed BOOLEAN/);
  assert.doesNotMatch(planMigration, /ALTER TABLE courses/);
});

test("exam schedule is an additive fourth migration tied to courses", async () => {
  const migrations = await loadMigrations();
  const examMigration = migrations[3].sql;
  assert.match(examMigration, /CREATE TABLE exams/);
  // An exam without its course is meaningless, so the row must not outlive it.
  assert.match(
    examMigration,
    /course_id UUID NOT NULL REFERENCES courses \(id\) ON DELETE CASCADE/,
  );
  assert.match(examMigration, /ENABLE ROW LEVEL SECURITY/);
  // Seeds are joined to courses by slug rather than carrying hardcoded ids,
  // which would break the moment the course table is reseeded.
  assert.match(examMigration, /JOIN courses c ON c\.slug = v\.slug/);
  assert.doesNotMatch(examMigration, /ALTER TABLE courses/);
});

test("course foundation is an additive third migration with typed illustrative seed data", async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(
    migrations.map(({ name }) => name),
    expectedMigrationNames,
  );
  const courseMigration = migrations[2].sql;
  assert.match(courseMigration, /CREATE TABLE courses/);
  assert.match(courseMigration, /JSONB/);
  assert.match(courseMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.equal((courseMigration.match(/'cs-201'/g) ?? []).length, 1);
  assert.equal((courseMigration.match(/\),\s*\(/g) ?? []).length, 5);
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

test("failed course seed is rolled back without recording the third migration", async () => {
  const db = databaseMock({ failSql: "courses" });
  await assert.rejects(migrate(), { code: "42501" });
  assert.deepEqual(
    [...db.history.keys()],
    ["001_init.sql", "002_non_ai_storage.sql"],
  );
  assert.ok(db.statements.includes("ROLLBACK"));
  assert.ok(db.statements.includes("SELECT pg_advisory_unlock(424204)"));
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
