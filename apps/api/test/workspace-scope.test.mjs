import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { AuthService } from "../dist/auth/auth.service.js";
import { PilotAuthGuard } from "../dist/auth/auth.guard.js";
import { TasksController } from "../dist/tasks/tasks.controller.js";
import { TasksService } from "../dist/tasks/tasks.service.js";
import { CoursesController } from "../dist/courses/courses.controller.js";
import { CoursesService } from "../dist/courses/courses.service.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { requirePrincipal } from "../dist/auth/principal.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

const workspaceA = "22222222-2222-4222-8222-222222222222";
const workspaceB = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-13T00:00:00.000Z";

function task(workspaceId, title) {
  return {
    id: randomUUID(),
    workspace_id: workspaceId,
    title,
    owner_name: null,
    status: "todo",
    due_date: null,
    evidence_type: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function course(workspaceId, slug, name) {
  return {
    id: randomUUID(),
    workspace_id: workspaceId,
    slug,
    name,
    code: "CS 201",
    detail: "Fixture guide",
    progress: 40,
    tone: "slate",
    cover: "/img/course-cs.webp",
    cover_alt: "Fixture cover",
    outline: [],
    outcomes: [],
    assessment: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

// This fake evaluates bound predicates rather than returning a pre-scoped stub.
// Omitting a WHERE workspace_id predicate exposes the other workspace's rows.
function scopedDatabase() {
  const ownTask = task(workspaceA, "Workspace A task");
  const otherTask = task(workspaceB, "Workspace B private task");
  const tasks = new Map([
    [ownTask.id, ownTask],
    [otherTask.id, otherTask],
  ]);
  const ownCourse = course(workspaceA, "shared-course", "Workspace A course");
  const otherCourse = course(workspaceB, "shared-course", "Workspace B course");
  const privateCourse = course(workspaceB, "private-course", "Private B guide");
  // Put B first so a slug-only detail query cannot accidentally return A.
  const courses = [otherCourse, ownCourse, privateCourse];
  const queries = [];

  function boundPredicate(sql, column, values) {
    const where = sql.match(
      /\bWHERE\b([\s\S]*?)(?:\bRETURNING\b|\bORDER\s+BY\b|$)/i,
    )?.[1];
    const match = where?.match(
      new RegExp(`(?:\\b\\w+\\.)?\\b${column}\\s*=\\s*\\$(\\d+)`, "i"),
    );
    return match ? { value: values[Number(match[1]) - 1] } : undefined;
  }

  function selectRows(rows, sql, values) {
    return rows.filter((row) =>
      ["workspace_id", "id", "slug"].every((column) => {
        const predicate = boundPredicate(sql, column, values);
        return !predicate || row[column] === predicate.value;
      }),
    );
  }

  const database = {
    async workspaceTransaction(principal, work) {
      requirePrincipal(principal);
      return work(database);
    },
    async query(sql, values = []) {
      queries.push({ sql, values: [...values] });
      if (/\bINSERT\s+INTO\s+tasks\b/i.test(sql)) {
        const insert = sql.match(
          /INSERT\s+INTO\s+tasks\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
        );
        assert.ok(insert, "fixture expects a parameterized task INSERT");
        const columns = insert[1].split(",").map((column) => column.trim());
        const expressions = insert[2].split(",");
        const row = task(workspaceB, "Untitled fixture task");
        columns.forEach((column, index) => {
          const parameter = expressions[index].match(/\$(\d+)/);
          assert.ok(parameter, `fixture expects a bound value for ${column}`);
          row[column] = values[Number(parameter[1]) - 1];
        });
        tasks.set(row.id, row);
        return { rows: [{ ...row }] };
      }
      if (/\bUPDATE\s+tasks\b/i.test(sql)) {
        const selected = selectRows([...tasks.values()], sql, values);
        const status = sql.match(/\bSET\s+status\s*=\s*\$(\d+)/i);
        assert.ok(status, "fixture expects a bound task status");
        selected.forEach((row) => {
          row.status = values[Number(status[1]) - 1];
        });
        return { rows: selected.map((row) => ({ ...row })) };
      }
      if (/\bFROM\s+tasks\b/i.test(sql))
        return {
          rows: selectRows([...tasks.values()], sql, values).map((row) => ({
            ...row,
          })),
        };
      if (/\bFROM\s+courses\b/i.test(sql))
        return {
          rows: selectRows(courses, sql, values).map((row) => ({ ...row })),
        };
      throw new Error("Unhandled SQL in workspace scope fixture");
    },
  };
  return {
    database,
    queries,
    tasks,
    ownTask,
    otherTask,
    ownCourse,
    privateCourse,
  };
}

async function scopeApp(run, role = "member") {
  const fixture = scopedDatabase();
  // Only this server-side fixture controls identity and role. Request headers,
  // query strings and body fields are deliberately ignored by authenticate.
  const authState = { principal: { userId, workspaceId: workspaceA, role } };
  const module = await Test.createTestingModule({
    controllers: [TasksController, CoursesController],
    providers: [
      TasksService,
      CoursesService,
      { provide: DatabaseService, useValue: fixture.database },
      {
        provide: AuthService,
        useValue: { authenticate: async () => authState.principal },
      },
      { provide: APP_GUARD, useClass: PilotAuthGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const request = (path, init) => fetch(`${base}/api${path}`, init);
  try {
    await run({ fixture, request, authState });
  } finally {
    await app.close();
  }
}

async function errorBody(response, status, code) {
  assert.equal(response.status, status);
  const { requestId, ...body } = await response.json();
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(body.code, code);
  assert.doesNotMatch(
    JSON.stringify(body),
    /SELECT|workspace_id|Workspace B|Private B|stack/,
  );
  return body;
}

for (const role of ["viewer", "member", "manager"])
  test(`HTTP workspace scope: ${role} reads only the verified workspace's tasks and courses`, async () =>
    scopeApp(async ({ fixture, request }) => {
      const tasks = await request("/tasks");
      assert.equal(tasks.status, 200);
      assert.deepEqual(
        (await tasks.json()).map((row) => row.id),
        [fixture.ownTask.id],
      );
      const courses = await request("/courses");
      assert.equal(courses.status, 200);
      assert.deepEqual(
        (await courses.json()).map((row) => row.id),
        [fixture.ownCourse.id],
      );
      const detail = await request("/courses/shared-course");
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).id, fixture.ownCourse.id);
    }, role));

test("HTTP workspace scope: query and header workspace spoofing cannot change reads", async () =>
  scopeApp(async ({ fixture, request }) => {
    const spoof = {
      headers: {
        "X-Workspace-ID": workspaceB,
        "X-User-ID": randomUUID(),
        "X-Role": "manager",
      },
    };
    for (const [path, expectedId] of [
      ["/tasks", fixture.ownTask.id],
      ["/courses", fixture.ownCourse.id],
    ]) {
      const response = await request(
        `${path}?workspaceId=${workspaceB}&workspace_id=${workspaceB}`,
        spoof,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(
        (await response.json()).map((row) => row.id),
        [expectedId],
      );
    }
    const detail = await request(
      `/courses/shared-course?workspaceId=${workspaceB}`,
      spoof,
    );
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).id, fixture.ownCourse.id);
  }));

for (const role of ["member", "manager"])
  test(`HTTP workspace scope: ${role} creates and updates a task in the verified workspace`, async () =>
    scopeApp(async ({ fixture, request }) => {
      const created = await request(
        "/tasks",
        json("POST", {
          title: "  Scoped task  ",
          ownerName: "  Fixture owner  ",
          dueDate: "2028-02-29",
        }),
      );
      assert.equal(created.status, 201);
      const row = await created.json();
      assert.equal(row.title, "Scoped task");
      assert.equal(fixture.tasks.get(row.id).workspace_id, workspaceA);
      assert.equal(fixture.tasks.get(row.id).owner_name, "Fixture owner");
      assert.equal(fixture.tasks.get(row.id).due_date, "2028-02-29");
      const updated = await request(
        `/tasks/${row.id}/status`,
        json("PATCH", { status: "done" }),
      );
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).status, "done");
      assert.equal(fixture.tasks.get(row.id).status, "done");
      assert.equal(fixture.otherTask.status, "todo");
      const list = await request("/tasks");
      assert.equal(list.status, 200);
      assert.deepEqual(
        new Set((await list.json()).map((item) => item.id)),
        new Set([fixture.ownTask.id, row.id]),
      );
    }, role));

test("HTTP workspace scope: task INSERT uses server workspace despite spoofed query and headers", async () =>
  scopeApp(async ({ fixture, request }) => {
    const init = json("POST", { title: "Scoped insert" });
    init.headers["X-Workspace-ID"] = workspaceB;
    init.headers["X-Role"] = "manager";
    const response = await request(`/tasks?workspaceId=${workspaceB}`, init);
    assert.equal(response.status, 201);
    const row = await response.json();
    assert.equal(fixture.tasks.get(row.id).workspace_id, workspaceA);
  }));

for (const field of ["workspaceId", "workspace_id", "userId", "role"])
  test(`HTTP workspace scope: task body rejects client-supplied ${field} before SQL`, async () =>
    scopeApp(async ({ fixture, request }) => {
      const response = await request(
        "/tasks",
        json("POST", {
          title: "Scoped body",
          [field]: field === "role" ? "manager" : workspaceB,
        }),
      );
      assert.equal(response.status, 400);
      assert.equal(fixture.queries.length, 0);
      assert.equal(fixture.tasks.size, 2);
    }));

test("HTTP workspace scope: viewer cannot create even with a forged manager header", async () =>
  scopeApp(async ({ fixture, request }) => {
    const init = json("POST", { title: "Forbidden viewer task" });
    init.headers["X-Role"] = "manager";
    init.headers["X-Workspace-ID"] = workspaceB;
    await errorBody(
      await request("/tasks?role=manager", init),
      403,
      "ROLE_FORBIDDEN",
    );
    assert.equal(fixture.queries.length, 0);
    assert.equal(fixture.tasks.size, 2);
  }, "viewer"));

test("HTTP workspace scope: viewer status writes fail before SQL for own, outside and missing task IDs", async () =>
  scopeApp(async ({ fixture, request }) => {
    for (const id of [fixture.ownTask.id, fixture.otherTask.id, randomUUID()]) {
      await errorBody(
        await request(`/tasks/${id}/status`, json("PATCH", { status: "done" })),
        403,
        "ROLE_FORBIDDEN",
      );
      assert.equal(fixture.queries.length, 0);
    }
    assert.equal(fixture.ownTask.status, "todo");
    assert.equal(fixture.otherTask.status, "todo");
  }, "viewer"));

test("HTTP workspace scope: outside task status update is the same safe 404 as a missing task", async () =>
  scopeApp(async ({ fixture, request }) => {
    const before = { ...fixture.otherTask };
    const outside = await errorBody(
      await request(
        `/tasks/${fixture.otherTask.id}/status`,
        json("PATCH", { status: "done" }),
      ),
      404,
      "TASK_NOT_FOUND",
    );
    const missing = await errorBody(
      await request(
        `/tasks/${randomUUID()}/status`,
        json("PATCH", { status: "done" }),
      ),
      404,
      "TASK_NOT_FOUND",
    );
    assert.deepEqual(outside, missing);
    assert.deepEqual(fixture.otherTask, before);
  }));

test("HTTP workspace scope: outside course slug is the same safe 404 as a missing course", async () =>
  scopeApp(async ({ request }) => {
    const outside = await errorBody(
      await request("/courses/private-course"),
      404,
      "COURSE_NOT_FOUND",
    );
    const missing = await errorBody(
      await request("/courses/missing-course"),
      404,
      "COURSE_NOT_FOUND",
    );
    assert.deepEqual(outside, missing);
  }));

test("HTTP workspace scope: each request follows the server principal when its workspace changes", async () =>
  scopeApp(async ({ fixture, request, authState }) => {
    authState.principal = { userId, workspaceId: workspaceB, role: "member" };
    const tasks = await request("/tasks");
    assert.equal(tasks.status, 200);
    assert.deepEqual(
      (await tasks.json()).map((row) => row.id),
      [fixture.otherTask.id],
    );
    const detail = await request("/courses/private-course");
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).id, fixture.privateCourse.id);
    const created = await request(
      "/tasks",
      json("POST", { title: "Workspace B creation" }),
    );
    assert.equal(created.status, 201);
    assert.equal(
      fixture.tasks.get((await created.json()).id).workspace_id,
      workspaceB,
    );
    const outside = await request(
      `/tasks/${fixture.ownTask.id}/status`,
      json("PATCH", { status: "done" }),
    );
    await errorBody(outside, 404, "TASK_NOT_FOUND");
    assert.equal(fixture.ownTask.status, "todo");
  }));

for (const [label, principal] of [
  ["absent", undefined],
  ["missing workspace", { userId, role: "member" }],
  ["invalid role", { userId, workspaceId: workspaceA, role: "admin" }],
])
  test(`HTTP workspace scope: ${label} principal fails closed before domain SQL`, async () =>
    scopeApp(async ({ fixture, request, authState }) => {
      authState.principal = principal;
      for (const [path, init] of [
        ["/tasks"],
        ["/courses"],
        ["/courses/shared-course"],
        ["/tasks", json("POST", { title: "Unauthenticated create" })],
        [
          `/tasks/${fixture.ownTask.id}/status`,
          json("PATCH", { status: "done" }),
        ],
      ]) {
        await errorBody(await request(path, init), 401, "AUTH_REQUIRED");
        assert.equal(fixture.queries.length, 0);
      }
    }));

test("HTTP workspace scope: real authentication rejects non-members before domain SQL", async () => {
  const fixture = scopedDatabase();
  const auth = authFixture();
  auth.config.workspaceId = workspaceA;
  const { storage } = fakeDependencies();
  const server = await httpApp(
    fixture.database,
    storage,
    undefined,
    undefined,
    undefined,
    auth,
  );
  try {
    const bootstrap = await server.request("/auth/session");
    const initialCookie = bootstrap.headers.get("set-cookie").split(";")[0];
    const csrf = (await bootstrap.json()).csrfToken;
    const login = await server.request("/auth/login", {
      ...json("POST", {
        email: "scope@example.test",
        password: "synthetic-password",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: initialCookie,
        Origin: auth.config.origin,
        "X-CSRF-Token": csrf,
      },
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const authenticatedCsrf = (await login.json()).csrfToken;
    auth.state.member = false;
    for (const [path, init = {}] of [
      ["/tasks"],
      ["/courses"],
      ["/courses/shared-course"],
      ["/tasks", json("POST", { title: "Nonmember create" })],
      [
        `/tasks/${fixture.ownTask.id}/status`,
        json("PATCH", { status: "done" }),
      ],
    ]) {
      const response = await server.request(path, {
        ...init,
        headers: {
          ...init.headers,
          Cookie: cookie,
          Origin: auth.config.origin,
          "X-CSRF-Token": authenticatedCsrf,
          "X-Role": "manager",
          "X-Workspace-ID": workspaceB,
        },
      });
      await errorBody(response, 403, "WORKSPACE_ACCESS_DENIED");
      assert.equal(fixture.queries.length, 0);
    }
  } finally {
    await server.app.close();
  }
});
