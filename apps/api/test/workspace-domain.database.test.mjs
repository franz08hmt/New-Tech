import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { TasksService } from "../dist/tasks/tasks.service.js";
import { CoursesService } from "../dist/courses/courses.service.js";
import { migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

// Fail before opening any pool. Do not load .env or connect to a cloud service.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const environmentNames = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "DATABASE_POOL_MAX",
  "PILOT_WORKSPACE_ID",
];
const saved = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);
const databaseName = `examate_b2_domain_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const url = assertTestDatabaseTarget(target.href);
const workspaceA = randomUUID(),
  workspaceB = randomUUID(),
  userId = randomUUID();
const principal = (workspaceId, role = "member") => ({
  userId,
  workspaceId,
  role,
});
let parent,
  admin,
  database,
  tasks,
  courses,
  ownTask,
  otherTask,
  ownCourse,
  otherCourse,
  created = false;

async function assertOwnedDatabase(pool, name) {
  assert.equal(
    (
      await pool.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
    "fixture role must own the exact database",
  );
}

before(async () => {
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  process.env.DATABASE_POOL_MAX = "3";
  process.env.PILOT_WORKSPACE_ID = workspaceA;
  parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
  await assertOwnedDatabase(
    parent,
    decodeURIComponent(new URL(parentUrl).pathname.slice(1)),
  );
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  admin = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  await assertOwnedDatabase(admin, databaseName);
  await prepareAuthFixture(admin);
  await migrate(url);
  await admin.query("INSERT INTO workspaces(id) VALUES($1)", [workspaceB]);
  otherTask = (
    await admin.query(
      "INSERT INTO tasks(workspace_id,title,status) VALUES($1,'Private workspace B task','todo') RETURNING *",
      [workspaceB],
    )
  ).rows[0];
  ownTask = (
    await admin.query(
      "SELECT * FROM tasks WHERE workspace_id=$1 ORDER BY id LIMIT 1",
      [workspaceA],
    )
  ).rows[0];
  ownCourse = (
    await admin.query(
      "SELECT * FROM courses WHERE workspace_id=$1 ORDER BY slug LIMIT 1",
      [workspaceA],
    )
  ).rows[0];
  otherCourse = (
    await admin.query(
      `INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt)
     VALUES($1,'private-workspace-b','Private workspace B course','B FIXTURE','Private B syllabus description','slate','/img/fixture.webp','Private B fixture cover') RETURNING *`,
      [workspaceB],
    )
  ).rows[0];
  // The actual application pool uses the guarded disposable target. Table-owner
  // SQL makes missing service predicates visible; RLS cannot hide the defect.
  process.env.DATABASE_URL = url;
  database = new DatabaseService();
  const ownership = (
    await database.query(
      "SELECT c.relname,pg_get_userbyid(c.relowner)=current_user AS owned FROM pg_class c WHERE c.oid=ANY(ARRAY['public.tasks'::regclass,'public.courses'::regclass]) ORDER BY c.relname",
    )
  ).rows;
  assert.deepEqual(ownership, [
    { relname: "courses", owned: true },
    { relname: "tasks", owned: true },
  ]);
  tasks = new TasksService(database);
  courses = new CoursesService(database);
});

after(async () => {
  try {
    await database?.onModuleDestroy();
    await admin?.end();
    if (created) {
      assertTestDatabaseTarget(url, { runtimeUrl: saved.DATABASE_URL ?? "" });
      await assertOwnedDatabase(parent, databaseName);
      // Exact database created above, never a shared database/schema reset.
      await parent.query(`DROP DATABASE "${databaseName}"`);
    }
  } finally {
    await parent?.end();
    for (const name of environmentNames) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

async function safeError(operation, status, code) {
  let body;
  await assert.rejects(operation, (error) => {
    assert.equal(error.getStatus(), status);
    body = error.getResponse();
    assert.equal(body.code, code);
    assert.doesNotMatch(
      JSON.stringify(body),
      /SELECT|UPDATE|INSERT|workspace_id|Private|stack|postgres:/,
    );
    assert.equal(JSON.stringify(body).includes(workspaceB), false);
    assert.equal(JSON.stringify(body).includes(otherTask.id), false);
    return true;
  });
  return body;
}

async function taskRows() {
  return (await admin.query("SELECT * FROM tasks ORDER BY id")).rows;
}

for (const role of ["viewer", "member", "manager"]) {
  test(`real SQL ${role} task and course reads are restricted to the principal workspace`, async () => {
    for (const workspaceId of [workspaceA, workspaceB]) {
      const identity = principal(workspaceId, role);
      const taskList = await tasks.list(identity);
      const courseList = await courses.list(identity);
      const expectedTasks = (
        await admin.query("SELECT id FROM tasks WHERE workspace_id=$1", [
          workspaceId,
        ])
      ).rows;
      const expectedCourses = (
        await admin.query("SELECT id FROM courses WHERE workspace_id=$1", [
          workspaceId,
        ])
      ).rows;
      assert.deepEqual(
        new Set(taskList.map(({ id }) => id)),
        new Set(expectedTasks.map(({ id }) => id)),
      );
      assert.deepEqual(
        new Set(courseList.map(({ id }) => id)),
        new Set(expectedCourses.map(({ id }) => id)),
      );
      assert.ok(taskList.length > 0);
      assert.ok(courseList.length > 0);
      for (const row of [...taskList, ...courseList])
        assert.equal("workspace_id" in row, false);
    }
  });
}

test("real SQL course detail returns its own course and hides a foreign slug with the same 404 as a missing course", async () => {
  for (const [workspaceId, own, foreign] of [
    [workspaceA, ownCourse, otherCourse],
    [workspaceB, otherCourse, ownCourse],
  ]) {
    const identity = principal(workspaceId);
    assert.equal((await courses.getBySlug(own.slug, identity)).id, own.id);
    const outside = await safeError(
      courses.getBySlug(foreign.slug, identity),
      404,
      "COURSE_NOT_FOUND",
    );
    const missing = await safeError(
      courses.getBySlug("missing-workspace-course", identity),
      404,
      "COURSE_NOT_FOUND",
    );
    assert.deepEqual(outside, missing);
  }
});

for (const role of ["member", "manager"]) {
  test(`real SQL ${role} creates and updates a task using the server principal despite extra input identity fields`, async () => {
    const identity = principal(workspaceA, role);
    const createdTask = await tasks.create(
      {
        title: `  ${role} scoped task  `,
        ownerName: "  Fixture owner  ",
        dueDate: "2028-02-29",
        evidenceType: "  Fixture evidence  ",
        workspaceId: workspaceB,
        workspace_id: workspaceB,
        userId: randomUUID(),
        role: "viewer",
      },
      identity,
    );
    assert.equal(createdTask.title, `${role} scoped task`);
    assert.equal(createdTask.owner_name, "Fixture owner");
    assert.equal(createdTask.due_date, "2028-02-29");
    assert.equal(createdTask.evidence_type, "Fixture evidence");
    assert.equal(createdTask.status, "todo");
    assert.equal("workspace_id" in createdTask, false);
    const stored = (
      await admin.query("SELECT workspace_id FROM tasks WHERE id=$1", [
        createdTask.id,
      ])
    ).rows[0];
    assert.equal(stored.workspace_id, workspaceA);
    const beforeForeign = (
      await admin.query("SELECT * FROM tasks WHERE id=$1", [otherTask.id])
    ).rows[0];
    const updated = await tasks.updateStatus(createdTask.id, "done", identity);
    assert.equal(updated.status, "done");
    assert.equal(
      (
        await admin.query("SELECT status FROM tasks WHERE id=$1", [
          createdTask.id,
        ])
      ).rows[0].status,
      "done",
    );
    assert.deepEqual(
      (await admin.query("SELECT * FROM tasks WHERE id=$1", [otherTask.id]))
        .rows[0],
      beforeForeign,
    );
    assert.ok(
      (await tasks.list(identity)).some(
        ({ id, status }) => id === createdTask.id && status === "done",
      ),
    );
    assert.equal(
      (await tasks.list(principal(workspaceB))).some(
        ({ id }) => id === createdTask.id,
      ),
      false,
    );
  });
}

test("real SQL foreign task status updates return the same safe 404 as missing IDs and preserve all rows", async () => {
  const beforeRows = await taskRows();
  for (const [workspaceId, foreign] of [
    [workspaceA, otherTask],
    [workspaceB, ownTask],
  ]) {
    const identity = principal(workspaceId);
    const outside = await safeError(
      tasks.updateStatus(foreign.id, "done", identity),
      404,
      "TASK_NOT_FOUND",
    );
    const missing = await safeError(
      tasks.updateStatus(randomUUID(), "done", identity),
      404,
      "TASK_NOT_FOUND",
    );
    assert.deepEqual(outside, missing);
  }
  assert.deepEqual(await taskRows(), beforeRows);
});

test("viewer task writes return 403 before the real database query boundary for own, foreign and missing rows", async (t) => {
  const beforeRows = await taskRows();
  const query = t.mock.method(database, "query"); // Calls through to the real implementation if reached.
  const identity = principal(workspaceA, "viewer");
  const forbidden = await safeError(
    tasks.create(
      {
        title: "Forbidden viewer create",
        role: "manager",
        workspaceId: workspaceB,
      },
      identity,
    ),
    403,
    "ROLE_FORBIDDEN",
  );
  for (const id of [ownTask.id, otherTask.id, randomUUID()]) {
    const body = await safeError(
      tasks.updateStatus(id, "done", identity),
      403,
      "ROLE_FORBIDDEN",
    );
    assert.deepEqual(body, forbidden);
  }
  assert.equal(query.mock.callCount(), 0);
  assert.deepEqual(await taskRows(), beforeRows);
});

test("missing or malformed principals fail closed before real domain SQL", async (t) => {
  const query = t.mock.method(database, "query");
  for (const identity of [
    undefined,
    { userId, role: "member" },
    principal("not-a-uuid"),
    principal(workspaceA, "admin"),
  ]) {
    for (const operation of [
      () => tasks.list(identity),
      () => courses.list(identity),
      () => courses.getBySlug(ownCourse.slug, identity),
      () => tasks.create({ title: "Rejected principal task" }, identity),
      () => tasks.updateStatus(ownTask.id, "done", identity),
    ])
      await safeError(operation(), 401, "AUTH_REQUIRED");
  }
  assert.equal(query.mock.callCount(), 0);
});
