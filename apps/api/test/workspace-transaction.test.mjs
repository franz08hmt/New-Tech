import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { TasksService } from "../dist/tasks/tasks.service.js";
import { CoursesService } from "../dist/courses/courses.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member",
};
function fixture(t, failures = {}) {
  const saved = { ...process.env };
  process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1/unit_test";
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const calls = [],
    releases = [],
    logs = [];
  let acquisitions = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (failures[sql]) throw failures[sql];
      return { rows: [{ result: "callback result" }] };
    },
    release(...args) {
      releases.push(args);
    },
  };
  t.mock.method(pg.Pool.prototype, "connect", async () => {
    acquisitions++;
    if (failures.connect) throw failures.connect;
    return client;
  });
  t.mock.method(pg.Pool.prototype, "query", () =>
    assert.fail("pool.query cannot execute transaction work"),
  );
  t.mock.method(console, "log", (line) => logs.push(line));
  const db = new DatabaseService();
  t.after(async () => {
    await db.onModuleDestroy();
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  return { db, calls, releases, logs, acquisitions: () => acquisitions };
}

for (const invalid of [
  undefined,
  null,
  {},
  { ...principal, userId: "invalid" },
  { ...principal, workspaceId: "" },
  { ...principal, role: "admin" },
]) {
  test(`workspace transaction rejects malformed principal before acquire (${JSON.stringify(invalid)})`, async (t) => {
    const f = fixture(t);
    let callbacks = 0;
    await assert.rejects(
      async () =>
        f.db.workspaceTransaction(invalid, async () => {
          callbacks++;
        }),
      (error) =>
        error.getStatus?.() === 401 &&
        error.getResponse().code === "AUTH_REQUIRED",
    );
    assert.equal(f.acquisitions(), 0);
    assert.equal(callbacks, 0);
    assert.equal(f.calls.length, 0);
  });
}

test("workspace transaction binds fixed local settings and business queries on the acquired client", async (t) => {
  const f = fixture(t);
  const result = await f.db.workspaceTransaction(
    principal,
    async (tx) => (await tx.query("SELECT business", ["bound"])).rows[0],
  );
  assert.deepEqual(result, { result: "callback result" });
  assert.equal(f.acquisitions(), 1);
  assert.equal(f.calls[0].sql, "BEGIN");
  const context = f.calls[1];
  assert.match(context.sql, /set_config\('examate\.user_id',\s*\$1,\s*true\)/);
  assert.match(
    context.sql,
    /set_config\('examate\.workspace_id',\s*\$2,\s*true\)/,
  );
  assert.deepEqual(context.values, [principal.userId, principal.workspaceId]);
  assert.ok(
    !context.sql.includes(principal.userId) &&
      !context.sql.includes(principal.workspaceId),
  );
  assert.doesNotMatch(context.sql, /set_config\('.*role|SET ROLE/i);
  assert.deepEqual(f.calls.slice(2), [
    { sql: "SELECT business", values: ["bound"] },
    { sql: "COMMIT", values: [] },
  ]);
  assert.equal(f.releases.length, 1);
  assert.ok(!f.releases[0][0]);
});

test("callback failure rolls back once, preserves original error and releases a clean client", async (t) => {
  const f = fixture(t),
    error = new Error("synthetic callback failure");
  await assert.rejects(
    f.db.transaction(async (tx) => {
      await tx.query("WRITE");
      throw error;
    }),
    (e) => e === error,
  );
  assert.deepEqual(
    f.calls.map((c) => c.sql),
    ["BEGIN", "WRITE", "ROLLBACK"],
  );
  assert.equal(f.releases.length, 1);
  assert.ok(!f.releases[0][0]);
});

for (const step of ["BEGIN", "COMMIT", "ROLLBACK"]) {
  test(`${step} failure discards client, never retries write, and logs only safe codes`, async (t) => {
    const failure = Object.assign(new Error("secret snapshot password SQL"), {
      code: "ECONNRESET",
    });
    const f = fixture(t, { [step]: failure });
    let callbacks = 0;
    await assert.rejects(
      f.db.transaction(async (tx) => {
        callbacks++;
        await tx.query("WRITE");
        if (step === "ROLLBACK") throw new Error("original callback failure");
      }),
    );
    assert.equal(callbacks, step === "BEGIN" ? 0 : 1);
    assert.equal(f.calls.filter((c) => c.sql === "WRITE").length, callbacks);
    assert.equal(f.calls.filter((c) => c.sql === step).length, 1);
    assert.deepEqual(f.releases, [[true]]);
    if (step === "COMMIT") {
      assert.equal(
        f.calls.some((c) => c.sql === "ROLLBACK"),
        false,
        "COMMIT outcome is unknown; do not claim rollback",
      );
      assert.ok(
        f.logs.some(
          (line) => JSON.parse(line).event === "database.commit_unknown",
        ),
      );
    }
    assert.doesNotMatch(f.logs.join("\n"), /secret|snapshot|password|SQL/);
  });
}

test("connection acquisition failure does not invoke callback or release an unacquired client", async (t) => {
  const f = fixture(t, {
    connect: Object.assign(new Error("private details"), {
      code: "ECONNREFUSED",
    }),
  });
  await assert.rejects(
    f.db.transaction(async () => assert.fail("no connection")),
    (error) =>
      error.getStatus() === 503 &&
      error.getResponse().code === "DATABASE_UNAVAILABLE",
  );
  assert.equal(f.releases.length, 0);
});

test("context setup failure rolls back without entering business callback", async (t) => {
  const sql =
    "SELECT set_config('examate.user_id', $1, true), set_config('examate.workspace_id', $2, true)";
  const error = Object.assign(new Error("synthetic setup failure"), {
    code: "42501",
  });
  const f = fixture(t, { [sql]: error });
  await assert.rejects(
    f.db.workspaceTransaction(principal, async () =>
      assert.fail("context was not established"),
    ),
    (e) => e === error,
  );
  assert.deepEqual(
    f.calls.map((c) => c.sql),
    ["BEGIN", sql, "ROLLBACK"],
  );
  assert.equal(f.releases.length, 1);
  assert.ok(!f.releases[0][0]);
});

test("Auth bootstrap row lock uses ordinary transaction without tenant principal/context", async (t) => {
  const f = fixture(t),
    store = new AuthStore(f.db);
  t.mock.method(f.db, "workspaceTransaction", () =>
    assert.fail("Auth bootstrap must not require a tenant"),
  );
  await store.lockedSession("synthetic-hash", async (row, tx) => {
    assert.deepEqual(row, { result: "callback result" });
    await tx.query("AUTH WORK");
  });
  assert.equal(f.calls[0].sql, "BEGIN");
  assert.match(f.calls[1].sql, /pilot_sessions.*cookie_hash=\$1 FOR UPDATE/);
  assert.deepEqual(f.calls[1].values, ["synthetic-hash"]);
  assert.equal(f.calls.at(-1).sql, "COMMIT");
  assert.ok(f.calls.every((c) => !c.sql.includes("set_config")));
});

for (const operation of [
  "task list",
  "task create",
  "task update",
  "course list",
  "course detail",
]) {
  test(`${operation} delegates principal and business SQL to workspace transaction, never pool query`, async () => {
    const calls = [];
    const db = {
      query: () => assert.fail("business query bypassed workspace transaction"),
      workspaceTransaction: async (identity, work) => {
        assert.equal(identity, principal);
        calls.push("workspace");
        return work({
          query: async (sql, values) => {
            calls.push({ sql, values });
            return { rows: [{ id: principal.userId, status: "todo" }] };
          },
        });
      },
    };
    const tasks = new TasksService(db),
      courses = new CoursesService(db);
    if (operation === "task list") await tasks.list(principal);
    if (operation === "task create")
      await tasks.create({ title: "Synthetic task" }, principal);
    if (operation === "task update")
      await tasks.updateStatus(principal.userId, "done", principal);
    if (operation === "course list") await courses.list(principal);
    if (operation === "course detail")
      await courses.getBySlug("synthetic-course", principal);
    assert.equal(calls[0], "workspace");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].values.includes(principal.workspaceId));
  });
}
