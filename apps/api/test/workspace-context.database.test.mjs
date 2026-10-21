import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { TasksService } from "../dist/tasks/tasks.service.js";
import { CoursesService } from "../dist/courses/courses.service.js";
import { migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

// TEST ONLY: no cloud/env loader, production migration, or application role DDL.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const saved = { ...process.env };
const nonce = randomUUID().replaceAll("-", "");
const databaseName = `examate_context_${nonce}_test`;
const roleName = `examate_context_${nonce}`;
const marker = `ExaMate context disposable ${nonce}`;
const password = randomBytes(24).toString("hex");
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const adminUrl = assertTestDatabaseTarget(target.href);
target.username = roleName;
target.password = password;
const runtimeUrl = assertTestDatabaseTarget(target.href);
const A = randomUUID(),
  B = randomUUID(),
  inactiveWorkspace = randomUUID();
const users = Object.fromEntries(
  ["manager", "member", "viewer", "absent", "inactive"].map((key) => [
    key,
    randomUUID(),
  ]),
);
const principal = (workspaceId = A, role = "member", user = role) => ({
  userId: users[user],
  workspaceId,
  role,
});
let parent,
  admin,
  single,
  concurrent,
  dbCreated = false,
  roleCreated = false;
let taskA, taskB, courseA, courseB;
const connections = [];

function guard(url) {
  return assertTestDatabaseTarget(url, {
    runtimeUrl: saved.DATABASE_URL ?? "",
  });
}
async function owned(pool, name) {
  assert.equal(
    (
      await pool.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
  );
}
function openRuntime(max) {
  guard(runtimeUrl);
  process.env.DATABASE_URL = runtimeUrl;
  process.env.DATABASE_POOL_MAX = String(max);
  const db = new DatabaseService();
  connections.push(db);
  return db;
}

// Membership/workspace reads below are a permissive internal bootstrap FIXTURE,
// not the least-privilege production design. No such policy on business tables.
// DB membership role wins; no role GUC or principal.role appears in policy SQL.
function membership(table, write = false) {
  return `${table}.workspace_id = NULLIF(current_setting('examate.workspace_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.workspace_id=${table}.workspace_id
        AND m.user_id=NULLIF(current_setting('examate.user_id', true), '')::uuid
        AND m.active AND w.active ${write ? "AND m.role IN ('manager','member')" : ""})`;
}

before(async () => {
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  process.env.PILOT_WORKSPACE_ID = A;
  guard(parentUrl);
  parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
  await owned(parent, decodeURIComponent(new URL(parentUrl).pathname.slice(1)));
  guard(adminUrl);
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  dbCreated = true;
  admin = new pg.Pool({ connectionString: adminUrl, ssl: false, max: 1 });
  await owned(admin, databaseName);
  await prepareAuthFixture(admin);
  guard(adminUrl);
  await migrate(adminUrl);
  assert.equal(
    (await admin.query("SELECT count(*)::int AS n FROM schema_migrations"))
      .rows[0].n,
    23,
  );
  await admin.query(
    "INSERT INTO workspaces(id,active) VALUES($1,true),($2,false)",
    [B, inactiveWorkspace],
  );
  for (const id of Object.values(users))
    await admin.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
  for (const workspaceId of [A, B, inactiveWorkspace])
    for (const role of ["manager", "member", "viewer", "inactive"])
      await admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,$4)",
        [
          workspaceId,
          users[role],
          role === "inactive" ? "member" : role,
          role !== "inactive",
        ],
      );
  taskA = (
    await admin.query(
      "INSERT INTO tasks(workspace_id,title) VALUES($1,'Context A fixture') RETURNING *",
      [A],
    )
  ).rows[0];
  taskB = (
    await admin.query(
      "INSERT INTO tasks(workspace_id,title) VALUES($1,'Context B fixture') RETURNING *",
      [B],
    )
  ).rows[0];
  courseA = (
    await admin.query(
      "SELECT * FROM courses WHERE workspace_id=$1 ORDER BY slug LIMIT 1",
      [A],
    )
  ).rows[0];
  courseB = (
    await admin.query(
      "INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,'context-b','Context B','B FIXTURE','Synthetic course description','slate','/img/fixture.webp','Fixture cover') RETURNING *",
      [B],
    )
  ).rows[0];
  await admin.query(
    "INSERT INTO tasks(workspace_id,title) VALUES($1,'Inactive workspace fixture')",
    [inactiveWorkspace],
  );
  await admin.query(
    "INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt) SELECT $1,'inactive-context',name,'INACTIVE FIXTURE',detail,tone,cover,cover_alt FROM courses WHERE id=$2",
    [inactiveWorkspace, courseA.id],
  );
  guard(adminUrl);
  assert.equal(
    (await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [roleName]))
      .rowCount,
    0,
  );
  // Identifiers/password are generated here, never request data; no broad grants.
  await admin.query(
    `CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`,
  );
  roleCreated = true;
  await admin.query(`COMMENT ON ROLE "${roleName}" IS '${marker}'`);
  await admin.query(`REVOKE CONNECT,TEMPORARY ON DATABASE "${databaseName}" FROM PUBLIC;
    GRANT CONNECT ON DATABASE "${databaseName}" TO "${roleName}";
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO "${roleName}";
    GRANT SELECT ON tasks,courses,workspaces,workspace_memberships TO "${roleName}";
    GRANT INSERT(title,owner_name,status,due_date,evidence_type,workspace_id) ON tasks TO "${roleName}";
    GRANT UPDATE(status,updated_at) ON tasks TO "${roleName}";
    CREATE POLICY context_bootstrap_fixture ON workspaces FOR SELECT TO "${roleName}" USING(true);
    CREATE POLICY context_bootstrap_fixture ON workspace_memberships FOR SELECT TO "${roleName}" USING(true);
    CREATE POLICY context_read ON tasks FOR SELECT TO "${roleName}" USING(${membership("tasks")});
    CREATE POLICY context_insert ON tasks FOR INSERT TO "${roleName}" WITH CHECK(${membership("tasks", true)});
    CREATE POLICY context_update ON tasks FOR UPDATE TO "${roleName}" USING(${membership("tasks", true)}) WITH CHECK(${membership("tasks", true)});
    CREATE POLICY context_read ON courses FOR SELECT TO "${roleName}" USING(${membership("courses")});`);
  single = openRuntime(1);
  concurrent = openRuntime(2);
});

after(async () => {
  try {
    await Promise.all(connections.map((db) => db.onModuleDestroy()));
    if (dbCreated) {
      guard(adminUrl);
      await owned(admin, databaseName);
      await admin.end();
      guard(parentUrl);
      await parent.query(`DROP DATABASE "${databaseName}"`);
      dbCreated = false;
    } else await admin?.end();
    if (roleCreated) {
      guard(parentUrl);
      const role = (
        await parent.query(
          "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
          [roleName],
        )
      ).rows[0];
      assert.equal(
        role?.marker,
        marker,
        "only drop the exact role created by this suite",
      );
      await parent.query(`DROP ROLE "${roleName}"`);
    }
    assert.equal(
      (
        await parent.query(
          "SELECT count(*)::int AS n FROM pg_database WHERE datname=$1",
          [databaseName],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await parent.query(
          "SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1",
          [roleName],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await parent?.end();
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

const identitySql =
  "SELECT pg_backend_pid() AS pid, NULLIF(current_setting('examate.user_id',true),'') AS uid, NULLIF(current_setting('examate.workspace_id',true),'') AS wid";
const identity = async (tx) => (await tx.query(identitySql)).rows[0];
async function expected(table, workspaceId) {
  return (
    await admin.query(
      `SELECT id FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
      [workspaceId],
    )
  ).rows.map((row) => row.id);
}
async function visible(tx, table, workspaceId) {
  // Deliberately NO WHERE: scoped service SQL cannot hide a missing RLS policy.
  const rows = (
    await tx.query(`SELECT id,workspace_id FROM ${table} ORDER BY id`)
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.id),
    await expected(table, workspaceId),
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.workspace_id === workspaceId));
}
const denied = (operation) =>
  assert.rejects(operation, (error) => error.code === "42501");

test("catalog and actual login prove non-owner NOBYPASSRLS, no inherited or excessive privileges", async () => {
  const role = (
    await single.query(
      "SELECT current_user=session_user AS direct_login,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(role, {
    direct_login: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: false,
  });
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
        [roleName],
      )
    ).rows[0].n,
    0,
  );
  const tables = (
    await single.query(
      "SELECT relname,relrowsecurity,pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=ANY(ARRAY['tasks'::regclass,'courses'::regclass]) ORDER BY relname",
    )
  ).rows;
  assert.deepEqual(tables, [
    { relname: "courses", relrowsecurity: true, owned: false },
    { relname: "tasks", relrowsecurity: true, owned: false },
  ]);
  for (const sql of [
    "SELECT * FROM auth.users",
    "SELECT * FROM auth.sessions",
    "UPDATE workspace_memberships SET active=false",
    "DELETE FROM tasks",
    "TRUNCATE tasks",
    "INSERT INTO courses DEFAULT VALUES",
    "UPDATE courses SET name='bad'",
    "DELETE FROM schema_migrations",
    "CREATE TABLE public.forbidden_fixture(id int)",
    "CREATE TEMP TABLE forbidden_fixture(id int)",
    `SET ROLE "${new URL(parentUrl).username}"`,
  ])
    await denied(single.query(sql));
  const columns = (
    await admin.query(
      "SELECT column_name,privilege_type FROM information_schema.column_privileges WHERE grantee=$1 AND table_name='tasks' AND privilege_type IN ('INSERT','UPDATE') ORDER BY privilege_type,column_name",
      [roleName],
    )
  ).rows;
  assert.deepEqual(columns, [
    ...[
      "due_date",
      "evidence_type",
      "owner_name",
      "status",
      "title",
      "workspace_id",
    ].map((column_name) => ({ column_name, privilege_type: "INSERT" })),
    ...["status", "updated_at"].map((column_name) => ({
      column_name,
      privilege_type: "UPDATE",
    })),
  ]);
  const policies = (
    await admin.query(
      "SELECT tablename,cmd,qual,with_check FROM pg_policies WHERE policyname LIKE 'context_%' AND tablename IN ('tasks','courses') ORDER BY tablename,cmd",
    )
  ).rows;
  assert.equal(policies.length, 4);
  for (const policy of policies) {
    assert.match(
      policy.qual ?? policy.with_check,
      /workspace_id|workspace_memberships/,
    );
    if (["UPDATE", "INSERT"].includes(policy.cmd))
      assert.match(policy.with_check, /manager.*member/);
  }
});

test("missing and explicit empty context deny all business rows and writes", async () => {
  for (const explicit of [false, true])
    await single.transaction(async (tx) => {
      if (explicit)
        await tx.query(
          "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
        );
      assert.deepEqual((await tx.query("SELECT id FROM tasks")).rows, []);
      assert.deepEqual((await tx.query("SELECT id FROM courses")).rows, []);
      assert.equal(
        (await tx.query("UPDATE tasks SET status='done'")).rowCount,
        0,
      );
    });
  await denied(
    single.transaction((tx) =>
      tx.query(
        "INSERT INTO tasks(title,workspace_id) VALUES('No context',$1)",
        [A],
      ),
    ),
  );
});

for (const role of ["manager", "member", "viewer"])
  test(`direct SQL without WHERE isolates ${role} reads to A and B`, async () => {
    for (const workspaceId of [A, B])
      await single.workspaceTransaction(
        principal(workspaceId, role),
        async (tx) => {
          await visible(tx, "tasks", workspaceId);
          await visible(tx, "courses", workspaceId);
          const context = await identity(tx);
          assert.equal(context.uid, users[role]);
          assert.equal(context.wid, workspaceId);
        },
      );
  });

test("pool max=1 COMMIT reuses exact backend PID without leaking A into no-context or B", async () => {
  const first = await single.workspaceTransaction(principal(A), identity);
  const blank = await identity(single);
  assert.equal(blank.pid, first.pid);
  assert.equal(blank.uid, null);
  assert.equal(blank.wid, null);
  assert.equal((await single.query("SELECT id FROM tasks")).rowCount, 0);
  const second = await single.workspaceTransaction(principal(B), async (tx) => {
    await visible(tx, "tasks", B);
    return identity(tx);
  });
  assert.equal(second.pid, first.pid);
  assert.equal(second.wid, B);
  assert.equal((await identity(single)).wid, null);
});

test("pool max=1 ROLLBACK preserves rows and clears identity before B on the same PID", async () => {
  const beforeRows = (await admin.query("SELECT * FROM tasks ORDER BY id"))
    .rows;
  let first;
  await assert.rejects(
    single.workspaceTransaction(principal(A), async (tx) => {
      first = await identity(tx);
      await tx.query(
        "INSERT INTO tasks(title,workspace_id) VALUES('Must rollback',$1)",
        [A],
      );
      await tx.query("UPDATE tasks SET status='done' WHERE id=$1", [taskA.id]);
      throw Error("synthetic rollback");
    }),
    /synthetic rollback/,
  );
  assert.deepEqual(
    (await admin.query("SELECT * FROM tasks ORDER BY id")).rows,
    beforeRows,
  );
  const blank = await identity(single);
  assert.equal(blank.pid, first.pid);
  assert.equal(blank.uid, null);
  assert.equal(blank.wid, null);
  const second = await single.workspaceTransaction(principal(B), async (tx) => {
    await visible(tx, "courses", B);
    return identity(tx);
  });
  assert.equal(second.pid, first.pid);
  assert.equal(second.wid, B);
});

test("pool max=2 barrier proves simultaneous A/B contexts and rows never mix", async () => {
  let arrivals = 0,
    release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(() => release(), 3000);
  try {
    const results = await Promise.all(
      [A, B].map((workspaceId) =>
        concurrent.workspaceTransaction(principal(workspaceId), async (tx) => {
          const first = await identity(tx);
          if (++arrivals === 2) release();
          await barrier;
          assert.equal(
            arrivals,
            2,
            "both connections must be held concurrently before timeout",
          );
          await visible(tx, "tasks", workspaceId);
          await visible(tx, "courses", workspaceId);
          assert.deepEqual(await identity(tx), first);
          return first;
        }),
      ),
    );
    assert.notEqual(results[0].pid, results[1].pid);
    assert.deepEqual(
      results.map((r) => r.wid),
      [A, B],
    );
    // Checkout both pooled clients concurrently again with no tenant context.
    const clean = await Promise.all(
      [0, 1].map(() => concurrent.transaction(identity)),
    );
    assert.deepEqual(
      new Set(clean.map((row) => row.pid)),
      new Set(results.map((row) => row.pid)),
    );
    assert.ok(clean.every((r) => r.uid === null && r.wid === null));
  } finally {
    clearTimeout(timer);
    release();
  }
});

for (const [label, p] of [
  ["no membership", principal(A, "member", "absent")],
  ["inactive membership", principal(A, "member", "inactive")],
  ["inactive workspace", principal(inactiveWorkspace)],
])
  test(`${label} fails closed despite valid principal shape`, async () => {
    await single.workspaceTransaction(p, async (tx) => {
      assert.equal((await tx.query("SELECT id FROM tasks")).rowCount, 0);
      assert.equal((await tx.query("SELECT id FROM courses")).rowCount, 0);
      assert.equal(
        (await tx.query("UPDATE tasks SET status='done'")).rowCount,
        0,
      );
    });
    await denied(
      single.workspaceTransaction(p, (tx) =>
        tx.query(
          "INSERT INTO tasks(title,workspace_id) VALUES('Denied member',$1)",
          [p.workspaceId],
        ),
      ),
    );
  });

test("viewer cannot write even when principal claims manager/member; DB rows stay identical", async () => {
  const beforeRows = (await admin.query("SELECT * FROM tasks ORDER BY id"))
    .rows;
  for (const role of ["manager", "member"]) {
    const spoofed = principal(A, role, "viewer");
    await denied(
      single.workspaceTransaction(spoofed, (tx) =>
        tx.query(
          "INSERT INTO tasks(title,workspace_id) VALUES('Spoofed role',$1)",
          [A],
        ),
      ),
    );
    const result = await single.workspaceTransaction(spoofed, (tx) =>
      tx.query("UPDATE tasks SET status='done' WHERE id=$1", [taskA.id]),
    );
    assert.equal(result.rowCount, 0);
  }
  assert.deepEqual(
    (await admin.query("SELECT * FROM tasks ORDER BY id")).rows,
    beforeRows,
  );
});

test("cross-workspace INSERT/UPDATE and workspace reassignment cannot change any row", async () => {
  const beforeRows = (await admin.query("SELECT * FROM tasks ORDER BY id"))
    .rows;
  await denied(
    single.workspaceTransaction(principal(A), (tx) =>
      tx.query(
        "INSERT INTO tasks(title,workspace_id) VALUES('Wrong workspace',$1)",
        [B],
      ),
    ),
  );
  const result = await single.workspaceTransaction(principal(A), (tx) =>
    tx.query("UPDATE tasks SET status='done' WHERE id=$1", [taskB.id]),
  );
  assert.equal(result.rowCount, 0);
  // Column grant independently disallows reassignment; policy WITH CHECK also
  // applies to every permitted new row (asserted via catalog above).
  await denied(
    single.workspaceTransaction(principal(A), (tx) =>
      tx.query("UPDATE tasks SET workspace_id=$1 WHERE id=$2", [B, taskA.id]),
    ),
  );
  assert.deepEqual(
    (await admin.query("SELECT * FROM tasks ORDER BY id")).rows,
    beforeRows,
  );
});

for (const role of ["manager", "member"])
  test(`service integration ${role}: real non-owner reads/create/status and outside-scope 404`, async () => {
    const tasks = new TasksService(single),
      courses = new CoursesService(single),
      p = principal(A, role);
    const listed = await tasks.list(p);
    assert.ok(listed.some((t) => t.id === taskA.id));
    assert.ok(!listed.some((t) => t.id === taskB.id));
    assert.ok((await courses.list(p)).some((c) => c.id === courseA.id));
    assert.equal((await courses.getBySlug(courseA.slug, p)).id, courseA.id);
    const created = await tasks.create({ title: `Synthetic ${role} task` }, p);
    assert.equal(
      (await tasks.updateStatus(created.id, "done", p)).status,
      "done",
    );
    assert.equal(
      (
        await admin.query("SELECT workspace_id,status FROM tasks WHERE id=$1", [
          created.id,
        ])
      ).rows[0].workspace_id,
      A,
    );
    for (const row of [created, ...listed, ...(await courses.list(p))])
      assert.equal("workspace_id" in row, false);
    await assert.rejects(
      tasks.updateStatus(taskB.id, "done", p),
      (error) =>
        error.getStatus() === 404 &&
        error.getResponse().code === "TASK_NOT_FOUND",
    );
    await assert.rejects(
      courses.getBySlug(courseB.slug, p),
      (error) =>
        error.getStatus() === 404 &&
        error.getResponse().code === "COURSE_NOT_FOUND",
    );
  });

test("viewer service write denied before acquiring connection, read still works", async (t) => {
  const tasks = new TasksService(single),
    courses = new CoursesService(single),
    p = principal(A, "viewer");
  assert.ok((await tasks.list(p)).length);
  assert.ok((await courses.list(p)).length);
  const transaction = t.mock.method(single, "workspaceTransaction");
  for (const call of [
    () => tasks.create({ title: "Viewer denied" }, p),
    () => tasks.updateStatus(taskA.id, "done", p),
  ])
    await assert.rejects(
      call(),
      (error) =>
        error.getStatus() === 403 &&
        error.getResponse().code === "ROLE_FORBIDDEN",
    );
  assert.equal(transaction.mock.callCount(), 0);
});

for (const role of ["manager", "member", "viewer"])
  test(`HTTP ${role}: real service/client/RLS, synthetic Auth adapter/store, unchanged scope/CSRF/errors`, async (t) => {
    const auth = authFixture();
    auth.config.workspaceId = A;
    await admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
    await admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [A, auth.userId, role],
    );
    // Pre-principal membership lookup is explicit admin fixture bootstrap, never
    // a claim that this runtime role can serve the whole app/Auth yet.
    auth.store.membership = async (w, u) =>
      (
        await admin.query(
          "SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.active AND w.active",
          [w, u],
        )
      ).rows[0]?.role;
    const { storage } = fakeDependencies();
    // App owns this facade; the suite owns and closes the shared real pool.
    const db = {
      query: (...args) => single.query(...args),
      transaction: (...args) => single.transaction(...args),
      workspaceTransaction: (...args) => single.workspaceTransaction(...args),
    };
    const server = await httpApp(
      db,
      storage,
      undefined,
      undefined,
      undefined,
      auth,
    );
    try {
      assert.equal((await server.request("/tasks")).status, 401);
      const bootstrap = await server.request("/auth/session");
      const csrf = (await bootstrap.json()).csrfToken;
      const login = await server.request("/auth/login", {
        ...json("POST", {
          email: "context@example.test",
          password: "synthetic-password",
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(login.status, 200);
      const session = await login.json();
      const headers = {
        Cookie: login.headers.get("set-cookie").split(";")[0],
        Origin: auth.config.origin,
        "X-CSRF-Token": session.csrfToken,
      };
      const request = (path, init = {}) =>
        server.request(path, {
          ...init,
          headers: { ...headers, ...init.headers },
        });
      const read = await request("/tasks");
      assert.equal(read.status, 200);
      const rows = await read.json();
      assert.ok(rows.some((r) => r.id === taskA.id));
      assert.ok(!rows.some((r) => r.id === taskB.id));
      assert.equal((await request(`/courses/${courseA.slug}`)).status, 200);
      for (const [path, init] of [
        [`/courses/${courseB.slug}`, {}],
        [`/tasks/${taskB.id}/status`, json("PATCH", { status: "done" })],
      ]) {
        const res = await request(path, init);
        assert.equal(
          res.status,
          role === "viewer" && path.startsWith("/tasks") ? 403 : 404,
        );
        const body = await res.json();
        assert.doesNotMatch(
          JSON.stringify(body),
          /workspace_id|Context B|SELECT|INSERT|stack/,
        );
      }
      const transaction = t.mock.method(single, "workspaceTransaction");
      const before = transaction.mock.callCount();
      assert.equal(
        (
          await request("/tasks", {
            ...json("POST", { title: "Missing CSRF" }),
            headers: { "Content-Type": "application/json", "X-CSRF-Token": "" },
          })
        ).status,
        403,
      );
      assert.equal(transaction.mock.callCount(), before);
      const created = await request(
        "/tasks",
        json("POST", { title: `HTTP context ${role}` }),
      );
      assert.equal(created.status, role === "viewer" ? 403 : 201);
      if (role !== "viewer") {
        const task = await created.json();
        assert.equal("workspace_id" in task, false);
        const updated = await request(
          `/tasks/${task.id}/status`,
          json("PATCH", { status: "done" }),
        );
        assert.equal(updated.status, 200);
        assert.equal((await updated.json()).status, "done");
      }
      await admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [A, auth.userId],
      );
      const count = transaction.mock.callCount();
      const denied = await request("/tasks");
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).code, "WORKSPACE_ACCESS_DENIED");
      assert.equal(transaction.mock.callCount(), count);
    } finally {
      await server.app.close();
    }
  });
