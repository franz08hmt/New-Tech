import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { databaseConfig } from "../dist/config/config.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { migrate, loadMigrations } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import {
  prepareAuthFixture,
  prepareRuntimeFixture,
  runtimeRole,
  runtimePassword,
} from "./disposable-auth-fixture.mjs";
import { fakeDependencies, httpApp, json, pdfForm } from "./helpers.mjs";

// Fail BEFORE any pool, migration, grant or cleanup. Never load .env.
const url = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const saved = { ...process.env };
const domainWorkspaceId = "22222222-2222-4222-8222-222222222222";
let admin,
  runtimeDb,
  store,
  ledger,
  prepared = false;
const userId = randomUUID(),
  workspaceId = randomUUID(),
  authSessionId = randomUUID();
const sessionKeys = [],
  limitKeys = [];
function newSession(kind = "prelogin") {
  const cookie_hash = randomBytes(32).toString("hex");
  sessionKeys.push(cookie_hash);
  return {
    cookie_hash,
    kind,
    user_id: kind === "prelogin" ? null : userId,
    auth_session_id: kind === "prelogin" ? null : authSessionId,
    csrf_token: randomBytes(32).toString("base64url"),
    tokens: kind === "prelogin" ? null : { fixture: true },
    expires_at: new Date(Date.now() + 600000),
    idle_expires_at: new Date(Date.now() + 300000),
    revoked_at: null,
    version: 0,
  };
}
function newLimit() {
  const key = randomBytes(32).toString("hex");
  limitKeys.push(key);
  return key;
}
function openRuntime() {
  const runtime = new URL(url);
  runtime.username = runtimeRole;
  runtime.password = runtimePassword;
  process.env.DATABASE_URL = runtime.href;
  runtimeDb = new DatabaseService();
  store = new AuthStore(runtimeDb);
}
before(async () => {
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  process.env.DATABASE_POOL_MAX = "5";
  process.env.PILOT_WORKSPACE_ID = domainWorkspaceId;
  admin = new pg.Pool(databaseConfig(url));
  await prepareAuthFixture(admin);
  await migrate(url);
  ledger = (
    await admin.query(
      "SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name",
    )
  ).rows;
  await migrate(url);
  assert.deepEqual(
    (
      await admin.query(
        "SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name",
      )
    ).rows,
    ledger,
  );
  await prepareRuntimeFixture(admin);
  prepared = true;
  await admin.query("INSERT INTO auth.users(id) VALUES($1)", [userId]);
  await admin.query(
    "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,NULL)",
    [authSessionId, userId],
  );
  await admin.query("INSERT INTO workspaces(id) VALUES($1)", [workspaceId]);
  await admin.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'member')",
    [workspaceId, userId],
  );
  openRuntime();
});
after(async () => {
  try {
    await runtimeDb?.onModuleDestroy();
    if (prepared) {
      // ONLY this run's UUID/hash rows; never truncate/drop/reset a database.
      await admin.query(
        "DELETE FROM pilot_refresh_attempts WHERE cookie_hash=ANY($1::text[])",
        [sessionKeys],
      );
      await admin.query(
        "DELETE FROM pilot_sessions WHERE cookie_hash=ANY($1::text[])",
        [sessionKeys],
      );
      await admin.query(
        "DELETE FROM pilot_auth_limits WHERE key=ANY($1::text[])",
        [limitKeys],
      );
      await admin.query(
        "DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
        [workspaceId, userId],
      );
      await admin.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
      await admin.query("DELETE FROM auth.sessions WHERE id=$1", [
        authSessionId,
      ]);
      await admin.query("DELETE FROM auth.users WHERE id=$1", [userId]);
    }
  } finally {
    await admin?.end();
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
test("all migrations run twice with unchanged checksums and timestamps", async () => {
  const files = await loadMigrations();
  assert.equal(ledger.length, files.length);
  assert.equal(files.length, 14);
  for (const file of files)
    assert.equal(
      ledger.find((row) => row.name === file.name).checksum,
      createHash("sha256")
        .update(file.sql.replace(/\r\n/g, "\n"))
        .digest("hex"),
    );
});
test("runtime is LOGIN non-owner NOBYPASSRLS with minimal privileges", async () => {
  const row = (
    await runtimeDb.query(
      "SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.equal(row.name, runtimeRole);
  for (const key of [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
  ])
    assert.equal(row[key], false);
  const tables = (
    await admin.query(
      "SELECT c.relname,c.relrowsecurity,r.rolname AS owner FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relname=ANY($1::text[])",
      [
        [
          "workspaces",
          "workspace_memberships",
          "pilot_sessions",
          "pilot_auth_limits",
          "pilot_refresh_attempts",
        ],
      ],
    )
  ).rows;
  assert.equal(tables.length, 5);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true);
    assert.notEqual(table.owner, runtimeRole);
  }
  for (const sql of [
    "SELECT * FROM auth.users",
    "SELECT * FROM schema_migrations",
    "CREATE TABLE public.b0d_denied(id INT)",
    "SET ROLE examate_test",
    "INSERT INTO workspaces(id) VALUES(gen_random_uuid())",
    "DELETE FROM pilot_auth_limits",
  ])
    await assert.rejects(
      runtimeDb.query(sql),
      (error) => error.code === "42501",
    );
});
test("RLS default-deny is enforced even when runtime has SQL table grants", async () => {
  const table = "b0d_rls_" + randomUUID().replaceAll("-", "");
  await admin.query(
    `CREATE TABLE ${table}(id INT); INSERT INTO ${table} VALUES(1); ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT ON ${table} TO ${runtimeRole}`,
  );
  try {
    assert.equal(
      (await runtimeDb.query(`SELECT * FROM ${table}`)).rows.length,
      0,
    );
    await assert.rejects(
      runtimeDb.query(`INSERT INTO ${table} VALUES(2)`),
      (error) => error.code === "42501",
    );
  } finally {
    await admin.query(`DROP TABLE ${table}`);
  }
});
test("migration 012 session, membership, Auth-session reads and revocation work as runtime", async () => {
  const row = newSession();
  await store.create(row);
  assert.equal((await store.find(row.cookie_hash)).kind, "prelogin");
  assert.equal(await store.membership(workspaceId, userId), "member");
  assert.equal(await store.authSessionActive(authSessionId, userId), true);
  await store.touch(row.cookie_hash);
  await store.revoke(row.cookie_hash);
  assert.ok((await store.find(row.cookie_hash)).revoked_at instanceof Date);
  assert.equal(await store.membership(randomUUID(), userId), undefined);
});
test("prelogin replacement commits one transaction as runtime", async () => {
  const old = newSession(),
    replacement = newSession("authenticated");
  await store.create(old);
  await store.replacePreSession(old.cookie_hash, replacement);
  assert.ok((await store.find(old.cookie_hash)).revoked_at);
  assert.equal((await store.find(replacement.cookie_hash)).user_id, userId);
  await assert.rejects(
    store.replacePreSession(old.cookie_hash, newSession("authenticated")),
    /PRESESSION_CONSUMED/,
  );
});
test("refresh row lock serializes readers while independent intent commits", async () => {
  const row = newSession();
  await store.create(row);
  let release, entered;
  const held = new Promise((resolve) => (release = resolve)),
    acquired = new Promise((resolve) => (entered = resolve));
  const first = store.lockedSession(row.cookie_hash, async (_, tx) => {
    entered();
    await held;
    await tx.query(
      "UPDATE pilot_sessions SET version=version+1 WHERE cookie_hash=$1",
      [row.cookie_hash],
    );
  });
  await acquired;
  let secondEntered = false;
  const second = store.lockedSession(row.cookie_hash, async (current) => {
    secondEntered = true;
    return current.version;
  });
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      waiting =
        (
          await admin.query(
            "SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",
            [runtimeRole],
          )
        ).rows.length > 0;
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, "PostgreSQL reports lock wait");
    assert.equal(secondEntered, false);
    assert.equal(await store.markRefreshStarted(row.cookie_hash, 0), true);
    assert.equal(await store.markRefreshStarted(row.cookie_hash, 0), false);
  } finally {
    release();
    await first;
  }
  assert.equal(await second, 1);
});
test("migration 013 parallel admission accepts exactly the cap without overshoot", async () => {
  const key = newLimit();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => store.admission([{ key, limit: 3 }], 900)),
  );
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal(results.filter((result) => !result.allowed).length, 17);
  assert.equal(
    (
      await runtimeDb.query(
        "SELECT SUM(hits)::int AS hits FROM pilot_auth_limits WHERE key=$1",
        [key],
      )
    ).rows[0].hits,
    3,
  );
  for (const result of results.filter((result) => !result.allowed))
    assert.ok(Number.isFinite(Date.parse(result.resetAt)));
});
test("multi-key admission rolls back earlier counter when later bucket is full", async () => {
  const [available, blocked] = [newLimit(), newLimit()].sort();
  assert.equal(
    (await store.admission([{ key: blocked, limit: 1 }], 900)).allowed,
    true,
  );
  assert.equal(
    (
      await store.admission(
        [
          { key: available, limit: 10 },
          { key: blocked, limit: 1 },
        ],
        900,
      )
    ).allowed,
    false,
  );
  assert.equal(
    (
      await runtimeDb.query("SELECT hits FROM pilot_auth_limits WHERE key=$1", [
        available,
      ])
    ).rows.length,
    0,
  );
});
test("session, refresh intent and admission persist after real pool restart", async () => {
  const row = newSession(),
    key = newLimit();
  await store.create(row);
  await store.markRefreshStarted(row.cookie_hash, 7);
  await store.admission([{ key, limit: 5 }], 900);
  await runtimeDb.onModuleDestroy();
  openRuntime();
  assert.ok((await store.find(row.cookie_hash)).csrf_token === row.csrf_token);
  assert.equal(await store.markRefreshStarted(row.cookie_hash, 7), false);
  assert.equal(
    (
      await runtimeDb.query("SELECT hits FROM pilot_auth_limits WHERE key=$1", [
        key,
      ])
    ).rows[0].hits,
    1,
  );
});
test("HTTP Tasks/Documents persist across API restart; actual owner domain SQL, Storage/Auth mocked", async () => {
  const fixture = fakeDependencies();
  let server, taskId, documentId;
  const runtimeUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url; // Domain persistence only, NOT runtime authorization evidence.
  try {
    server = await httpApp(undefined, fixture.storage);
    const response = await server.request(
      "/tasks",
      json("POST", {
        title: `Persistence ${randomUUID()}`,
        dueDate: "2028-02-29",
      }),
    );
    assert.equal(response.status, 201);
    taskId = (await response.json()).id;
    assert.equal(
      (
        await server.request(
          `/tasks/${taskId}/status`,
          json("PATCH", { status: "done" }),
        )
      ).status,
      200,
    );
    const uploaded = await server.request("/documents", pdfForm());
    assert.equal(uploaded.status, 201);
    documentId = (await uploaded.json()).id;
    await server.app.close();
    server = await httpApp(undefined, fixture.storage);
    const tasks = await (await server.request("/tasks")).json(),
      docs = await (await server.request("/documents")).json();
    assert.equal(tasks.find((row) => row.id === taskId).status, "done");
    assert.equal(tasks.find((row) => row.id === taskId).due_date, "2028-02-29");
    assert.equal(
      docs.find((row) => row.id === documentId).storage_status,
      "stored",
    );
    assert.equal(
      (await server.request(`/documents/${documentId}/download`)).status,
      200,
    );
    assert.equal(
      (await server.request(`/documents/${documentId}`, { method: "DELETE" }))
        .status,
      204,
    );
  } finally {
    await server?.app.close();
    if (documentId)
      await admin.query("DELETE FROM documents WHERE id=$1", [documentId]);
    if (taskId) await admin.query("DELETE FROM tasks WHERE id=$1", [taskId]);
    process.env.DATABASE_URL = runtimeUrl;
  }
});
