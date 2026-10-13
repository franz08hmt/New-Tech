import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { inspect } from "node:util";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";

const fixtureDirectories = new Set();
const temporaryRoot = resolve(tmpdir());
const savedEnvironment = { ...process.env };

afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env))
    if (!(key in savedEnvironment)) delete process.env[key];
  Object.assign(process.env, savedEnvironment);
  for (const directory of fixtureDirectories) {
    assert.equal(dirname(directory), temporaryRoot);
    assert.ok(directory.startsWith(join(temporaryRoot, "examate-db-guard-")));
    rmSync(directory, { recursive: true, force: true });
    fixtureDirectories.delete(directory);
  }
});

function environmentFixture(contents = "") {
  const directory = resolve(
    mkdtempSync(join(temporaryRoot, "examate-db-guard-")),
  );
  fixtureDirectories.add(directory);
  const envFilePath = join(directory, ".env");
  writeFileSync(envFilePath, contents, "utf8");
  return envFilePath;
}

function isolatedOptions(contents = "", runtimeUrl = "") {
  return { envFilePath: environmentFixture(contents), runtimeUrl };
}

function rejectsTarget(value, options) {
  assert.throws(() => assertTestDatabaseTarget(value, options), Error);
}

for (const value of [
  "postgres://fixture:fixture@localhost/examate_test",
  "postgresql://fixture:fixture@127.0.0.1:5433/examate_test",
]) {
  test(`accepts dedicated local PostgreSQL target: ${new URL(value).hostname}`, () => {
    const validated = assertTestDatabaseTarget(value, isolatedOptions());
    assert.equal(typeof validated, "string");
    assert.equal(new URL(validated).href, new URL(value).href);
  });
}

test("accepts a distinct database or port on the local runtime host", () => {
  const options = isolatedOptions(
    "DATABASE_URL=postgres://fixture:fixture@localhost:5432/runtime\n",
    "postgres://fixture:fixture@localhost:5432/runtime_test",
  );
  for (const value of [
    "postgres://fixture:fixture@localhost:5432/dedicated_test",
    "postgres://fixture:fixture@localhost:5433/runtime_test",
  ]) {
    assert.equal(typeof assertTestDatabaseTarget(value, options), "string");
  }
});

for (const hostname of [
  "db.fixture.supabase.co",
  "aws-0.fixture.pooler.supabase.com",
  "remote.example",
  "192.168.1.10",
  "localhost.evil.example",
  "localhost.",
  "127.0.0.1.evil.example",
  "127.0.0.2",
  "127.1",
  "2130706433",
  "[::1]",
  "%6cocalhost",
]) {
  test(`rejects a host outside the exact local allowlist: ${hostname}`, () => {
    rejectsTarget(
      `postgres://fixture:fixture@${hostname}/dedicated_test`,
      isolatedOptions(),
    );
  });
}

for (const value of [
  undefined,
  "",
  "not a URI",
  "https://localhost/dedicated_test",
  "mysql://localhost/dedicated_test",
  "file:///dedicated_test",
  "postgres://localhost",
  "postgres://localhost/",
  "postgres://localhost/runtime",
  "postgres://localhost/test",
  "postgres://localhost/dedicated_test_extra",
  "postgres:///dedicated_test",
  "postgres://%2Fvar%2Frun%2Fpostgresql/dedicated_test",
]) {
  test(`rejects missing, malformed, or unsafe database target ${JSON.stringify(value)}`, () => {
    rejectsTarget(value, isolatedOptions());
  });
}

for (const suffix of [
  "?host=remote.example",
  "?host=%2Fvar%2Frun%2Fpostgresql",
  "?port=6543",
  "?dbname=runtime",
  "?sslmode=disable",
  "#fragment",
]) {
  test(`rejects query or fragment target overrides: ${suffix}`, () => {
    rejectsTarget(
      `postgres://fixture:fixture@localhost/dedicated_test${suffix}`,
      isolatedOptions(),
    );
  });
}

for (const [candidate, runtimeUrl] of [
  [
    "postgres://test_user:test_password@localhost/runtime_test",
    "postgresql://runtime_user:runtime_password@localhost/runtime_test",
  ],
  [
    "postgres://fixture:fixture@127.0.0.1:5432/runtime_test",
    "postgres://other:other@localhost/runtime_test",
  ],
  [
    "postgres://fixture:fixture@localhost/runtime_test",
    "postgres://other:other@127.0.0.1:5432/runtime_test",
  ],
  [
    "postgres://fixture:fixture@localhost/runtime%5Ftest",
    "postgres://other:other@localhost:5432/runtime_test",
  ],
  [
    "postgres://fixture:fixture@localhost/runtime_test",
    "postgres://other:other@localhost/runtime%5ftest",
  ],
]) {
  test(`rejects runtime endpoint equality after canonicalization: ${new URL(candidate).pathname} versus ${new URL(runtimeUrl).hostname}`, () => {
    rejectsTarget(candidate, isolatedOptions("", runtimeUrl));
  });
}

test("checks the .env runtime endpoint even when process DATABASE_URL overrides it", () => {
  process.env.DATABASE_URL =
    "postgres://process_fixture:fixture@localhost/different_runtime";
  const envFilePath = environmentFixture(
    '# This is an isolated fixture, never the repository .env.\nexport DATABASE_URL = "postgresql://env_fixture:fixture@127.0.0.1:5432/runtime%5Ftest" # runtime\n',
  );
  rejectsTarget("postgres://test_fixture:fixture@localhost/runtime_test", {
    envFilePath,
  });
});

test("checks the process runtime endpoint independently of a distinct .env target", () => {
  process.env.DATABASE_URL =
    "postgres://process_fixture:fixture@127.0.0.1/runtime_test";
  const envFilePath = environmentFixture(
    "DATABASE_URL='postgres://env_fixture:fixture@localhost/other_runtime'\n",
  );
  rejectsTarget(
    "postgresql://test_fixture:fixture@localhost:5432/runtime_test",
    {
      envFilePath,
    },
  );
});

test("reads .env for comparison without loading it into process.env", () => {
  process.env.DATABASE_URL =
    "postgres://process_fixture:fixture@localhost/process_runtime";
  process.env.EXAMATE_GUARD_FIXTURE_SENTINEL = "process-value";
  const before = { ...process.env };
  const envFilePath = environmentFixture(
    "DATABASE_URL=postgres://env_fixture:fixture@localhost/env_runtime\nEXAMATE_GUARD_FIXTURE_SENTINEL=env-file-value\nEXAMATE_GUARD_FIXTURE_NEW_KEY=must-not-load\n",
  );
  assertTestDatabaseTarget(
    "postgres://test_fixture:fixture@localhost/dedicated_test",
    { envFilePath },
  );
  assert.deepEqual({ ...process.env }, before);
});

test("an absent explicitly selected .env does not prevent a safe local target", () => {
  const envFilePath = environmentFixture();
  const missingEnvFilePath = join(dirname(envFilePath), "absent.env");
  assert.equal(
    typeof assertTestDatabaseTarget(
      "postgres://fixture:fixture@localhost/dedicated_test",
      { runtimeUrl: "", envFilePath: missingEnvFilePath },
    ),
    "string",
  );
});

test("rejection errors and console output never echo URI or credential contents", () => {
  const sentinel = "SYNTHETIC_GUARD_SECRET_7eb9";
  const emitted = [];
  for (const method of ["log", "info", "warn", "error", "debug"])
    mock.method(console, method, (...args) => emitted.push(inspect(args)));
  const options = isolatedOptions();
  for (const value of [
    `postgres://${sentinel}:${sentinel}@remote.example/${sentinel}_test`,
    `invalid URI ${sentinel}`,
  ]) {
    assert.throws(
      () => assertTestDatabaseTarget(value, options),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.length > 0);
        assert.ok(!inspect(error).includes(sentinel));
        assert.ok(!inspect(error).includes(value));
        return true;
      },
    );
  }
  assert.ok(emitted.every((entry) => !entry.includes(sentinel)));
});
