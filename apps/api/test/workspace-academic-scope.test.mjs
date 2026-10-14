import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "../dist/auth/auth.controller.js";
import { AuthService } from "../dist/auth/auth.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { PilotAuthGuard } from "../dist/auth/auth.guard.js";
import { ExamsController } from "../dist/exams/exams.controller.js";
import { ExamsService } from "../dist/exams/exams.service.js";
import { StudyPlansController } from "../dist/study-plans/study-plans.controller.js";
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";
import { ExpensesController } from "../dist/expenses/expenses.controller.js";
import { ExpensesService } from "../dist/expenses/expenses.service.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { json } from "./helpers.mjs";

const workspaceA = "22222222-2222-4222-8222-222222222222";
const workspaceB = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-10-14T00:00:00.000Z";
const modules = [
  { table: "exams", path: "/exams", code: "EXAM_NOT_FOUND", alias: "e" },
  {
    table: "study_plans",
    path: "/study-plans",
    code: "STUDY_PLAN_NOT_FOUND",
    alias: "p",
  },
  {
    table: "expenses",
    path: "/expenses",
    code: "EXPENSE_NOT_FOUND",
    alias: "e",
  },
];

function course(workspaceId, name) {
  return {
    id: randomUUID(),
    workspace_id: workspaceId,
    slug: `course-${workspaceId.slice(0, 8)}`,
    name,
    code: workspaceId === workspaceA ? "CS A" : "CS B",
  };
}

function academicRow(table, workspaceId, courseId) {
  const base = {
    id: randomUUID(),
    workspace_id: workspaceId,
    course_id: courseId,
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (table === "exams")
    return {
      ...base,
      topic: "Fixture exam",
      exam_date: "2028-02-29",
      exam_time: "09:30",
      room: "A 101",
      revision_note: null,
    };
  if (table === "study_plans")
    return {
      ...base,
      title: "Fixture revision",
      detail: null,
      due_date: null,
      owner_name: null,
      completed_at: null,
    };
  return {
    ...base,
    amount: 25000,
    description: "Fixture expense",
    spent_on: "2028-02-29",
    category: "other",
  };
}

// This is a stateful SQL fake, not a pre-scoped response stub. It binds actual
// INSERT values and WHERE predicates against rows from BOTH workspaces, and
// enforces the workspace/course composite FK used by migration 014.
function academicDatabase() {
  const ownCourse = course(workspaceA, "Workspace A course");
  const otherCourse = course(workspaceB, "Workspace B private course");
  const courses = new Map([
    [otherCourse.id, otherCourse],
    [ownCourse.id, ownCourse],
  ]);
  const tables = new Map();
  const own = {},
    other = {};
  for (const { table } of modules) {
    own[table] = academicRow(table, workspaceA, ownCourse.id);
    other[table] = academicRow(table, workspaceB, otherCourse.id);
    tables.set(
      table,
      new Map([
        [other[table].id, other[table]],
        [own[table].id, own[table]],
      ]),
    );
  }
  const unlinkedExpense = academicRow("expenses", workspaceA, null);
  tables.get("expenses").set(unlinkedExpense.id, unlinkedExpense);
  const queries = [];

  function parameter(expression, values) {
    const match = expression.trim().match(/^\$(\d+)(?:::[\w]+)?$/);
    assert.ok(match, `fixture expects parameterized value: ${expression}`);
    return values[Number(match[1]) - 1];
  }

  function selectedRows(rows, sql, values) {
    const where = sql.match(
      /\bWHERE\b([\s\S]*?)(?:\bRETURNING\b|\bORDER\s+BY\b|$)/i,
    )?.[1];
    if (!where) return [...rows];
    const predicates = [
      ...where.matchAll(/(?:\b\w+\.)?\b(id|workspace_id)\s*=\s*\$(\d+)/gi),
    ];
    return [...rows].filter((row) =>
      predicates.every(
        ([, column, index]) =>
          row[column.toLowerCase()] === values[Number(index) - 1],
      ),
    );
  }

  function joinedRow(table, row, sql, values) {
    const linkedCourse = courses.get(row.course_id);
    const join = sql.match(
      /(?:LEFT\s+)?JOIN\s+courses\s+c\s+ON\s+([\s\S]*?)(?:\bWHERE\b|\bORDER\s+BY\b|$)/i,
    )?.[1];
    assert.ok(join, "fixture expects the academic course join");
    const alias = modules.find((item) => item.table === table).alias;
    const matchesWorkspace = new RegExp(
      `(?:c\\.workspace_id\\s*=\\s*${alias}\\.workspace_id|${alias}\\.workspace_id\\s*=\\s*c\\.workspace_id)`,
      "i",
    ).test(join);
    const boundWorkspace = join.match(/c\.workspace_id\s*=\s*\$(\d+)/i);
    const linked =
      linkedCourse &&
      (!matchesWorkspace || linkedCourse.workspace_id === row.workspace_id) &&
      (!boundWorkspace ||
        linkedCourse.workspace_id === values[Number(boundWorkspace[1]) - 1]);
    if (!linked && !/LEFT\s+JOIN\s+courses/i.test(sql)) return undefined;
    const { workspace_id, ...record } = row;
    return {
      ...record,
      course_slug: linked ? linkedCourse.slug : null,
      course_name: linked ? linkedCourse.name : null,
      course_code: linked ? linkedCourse.code : null,
    };
  }

  const database = {
    async query(rawSql, values = []) {
      queries.push({ sql: rawSql, values: [...values] });
      const sql = rawSql.replace(/--[^\n]*/g, " ");
      const insert = sql.match(
        /\bINSERT\s+INTO\s+(exams|study_plans|expenses)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
      let table, selected;
      if (insert) {
        table = insert[1];
        const columns = insert[2].split(",").map((column) => column.trim());
        const expressions = insert[3].split(",");
        assert.equal(columns.length, expressions.length);
        const row = academicRow(table, workspaceB, null);
        columns.forEach((column, index) => {
          row[column] = parameter(expressions[index], values);
        });
        if (row.course_id !== null) {
          const linkedCourse = courses.get(row.course_id);
          if (!linkedCourse || linkedCourse.workspace_id !== row.workspace_id)
            throw Object.assign(
              new Error("sensitive workspace_id composite FK SQL"),
              { code: "23503" },
            );
        }
        tables.get(table).set(row.id, row);
        selected = [row];
      } else {
        const operation = sql.match(
          /\b(UPDATE|DELETE\s+FROM|FROM)\s+(exams|study_plans|expenses)\b/i,
        );
        assert.ok(operation, "Unhandled SQL in academic scope fixture");
        table = operation[2];
        selected = selectedRows(tables.get(table).values(), sql, values);
        if (/^DELETE/i.test(operation[1])) {
          selected.forEach((row) => tables.get(table).delete(row.id));
          return { rows: [], rowCount: selected.length };
        }
        if (/^UPDATE/i.test(operation[1])) {
          const set = sql.match(/\bSET\b([\s\S]*?)\bWHERE\b/i)?.[1];
          assert.ok(set, "fixture expects UPDATE assignments before WHERE");
          if (table === "study_plans") {
            const completed = set.match(
              /completed_at\s*=\s*CASE\s+WHEN\s+\$(\d+)/i,
            );
            assert.ok(completed, "fixture expects parameterized completion");
            selected.forEach((row) => {
              row.completed_at = values[Number(completed[1]) - 1]
                ? timestamp
                : null;
            });
          } else {
            for (const [, column, index] of set.matchAll(
              /\b(topic|exam_date|exam_time|room|revision_note)\s*=\s*\$(\d+)/gi,
            ))
              selected.forEach((row) => {
                row[column] = values[Number(index) - 1];
              });
          }
        }
      }
      const rows = selected
        .map((row) => joinedRow(table, row, sql, values))
        .filter(Boolean);
      return { rows, rowCount: rows.length };
    },
  };
  return {
    database,
    queries,
    tables,
    own,
    other,
    ownCourse,
    otherCourse,
    unlinkedExpense,
  };
}

async function academicApp(role, run) {
  const fixture = academicDatabase();
  const auth = authFixture();
  auth.config.workspaceId = workspaceA;
  auth.state.role = role;
  auth.store.membership = async (workspaceId, userId) => {
    assert.equal(workspaceId, auth.config.workspaceId);
    assert.equal(userId, auth.userId);
    return auth.state.member ? auth.state.role : undefined;
  };
  const module = await Test.createTestingModule({
    controllers: [
      AuthController,
      ExamsController,
      StudyPlansController,
      ExpensesController,
    ],
    providers: [
      AuthService,
      ExamsService,
      StudyPlansService,
      ExpensesService,
      { provide: DatabaseService, useValue: fixture.database },
      { provide: AuthStore, useValue: auth.store },
      { provide: AUTH_CONFIG, useValue: () => auth.config },
      { provide: AUTH_ADAPTER, useValue: auth.adapter },
      { provide: APP_GUARD, useClass: PilotAuthGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const rawRequest = (path, init) => fetch(`${base}/api${path}`, init);
  try {
    const bootstrap = await rawRequest("/auth/session");
    assert.equal(bootstrap.status, 200);
    const initialCookie = bootstrap.headers.get("set-cookie").split(";")[0];
    const bootstrapCsrf = (await bootstrap.json()).csrfToken;
    const login = await rawRequest("/auth/login", {
      ...json("POST", {
        email: "academic@example.test",
        password: "synthetic-password",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: initialCookie,
        Origin: auth.config.origin,
        "X-CSRF-Token": bootstrapCsrf,
      },
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const session = await login.json();
    assert.equal(session.principal.role, role);
    assert.equal(session.principal.workspaceId, workspaceA);
    const request = (path, init = {}) =>
      rawRequest(path, {
        ...init,
        headers: {
          ...init.headers,
          Cookie: cookie,
          Origin: auth.config.origin,
          "X-CSRF-Token": session.csrfToken,
        },
      });
    await run({ fixture, auth, request });
    assert.ok(
      auth.state.verifyCalls >= 2,
      "requests use server-verified identity",
    );
  } finally {
    await app.close();
  }
}

async function safeError(response, status, code) {
  assert.equal(response.status, status);
  const { requestId, ...body } = await response.json();
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(body.code, code);
  assert.doesNotMatch(
    JSON.stringify(body),
    /SELECT|workspace_id|Workspace B|sensitive|stack/i,
  );
  return body;
}

function createInput(table, courseId) {
  if (table === "exams")
    return {
      courseId,
      topic: "  Scoped exam  ",
      examDate: "2028-02-29",
      examTime: "09:30",
      room: "  A 101  ",
      revisionNote: "  Revision note  ",
    };
  if (table === "study_plans")
    return {
      courseId,
      title: "  Scoped revision  ",
      detail: "  Revision detail  ",
      dueDate: "2028-02-29",
      ownerName: "  Fixture owner  ",
    };
  return {
    amount: 32000,
    description: "  Scoped expense  ",
    spentOn: "2028-02-29",
    category: "other",
    courseId,
  };
}

function updateRoute(item, id) {
  return item.table === "exams"
    ? `${item.path}/${id}`
    : `${item.path}/${id}/completion`;
}

function updateInput(table) {
  return table === "exams"
    ? {
        topic: "  Updated exam  ",
        examDate: "2028-03-01",
        examTime: "14:15",
        room: "  B 202  ",
        revisionNote: "  Updated revision  ",
      }
    : { completed: true };
}

function spoofed(init = {}) {
  return {
    ...init,
    headers: {
      ...init.headers,
      "X-Workspace-ID": workspaceB,
      "X-User-ID": randomUUID(),
      "X-Role": "manager",
    },
  };
}

function assertScopedJoin(fixture, alias) {
  const query = fixture.queries.at(-1);
  const join = query.sql.match(
    /(?:LEFT\s+)?JOIN\s+courses\s+c\s+ON\s+([\s\S]*?)(?:\bWHERE\b|\bORDER\s+BY\b|$)/i,
  )?.[1];
  assert.ok(join, "course details are joined");
  assert.match(
    join,
    new RegExp(
      `(?:c\\.workspace_id\\s*=\\s*${alias}\\.workspace_id|${alias}\\.workspace_id\\s*=\\s*c\\.workspace_id|c\\.workspace_id\\s*=\\s*\\$\\d+)`,
      "i",
    ),
    "course join must also constrain workspace",
  );
}

for (const item of modules) {
  for (const role of ["viewer", "member", "manager"])
    test(`academic HTTP: ${role} lists only own ${item.table}, ignoring workspace/role header and query spoofing`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        const response = await request(
          `${item.path}?workspaceId=${workspaceB}&workspace_id=${workspaceB}&role=manager`,
          spoofed(),
        );
        assert.equal(response.status, 200);
        const rows = await response.json();
        const expectedIds = [fixture.own[item.table].id];
        if (item.table === "expenses")
          expectedIds.push(fixture.unlinkedExpense.id);
        assert.deepEqual(
          new Set(rows.map((row) => row.id)),
          new Set(expectedIds),
        );
        assert.equal(
          rows.find((row) => row.id === fixture.own[item.table].id).course_name,
          fixture.ownCourse.name,
        );
        if (item.table === "expenses") {
          const unlinked = rows.find(
            (row) => row.id === fixture.unlinkedExpense.id,
          );
          assert.equal(unlinked.course_id, null);
          assert.equal(unlinked.course_name, null);
        }
        assertScopedJoin(fixture, item.alias);
      }));

  for (const role of ["member", "manager"])
    test(`academic HTTP: ${role} creates ${item.table} with mapped fields in server workspace despite spoofing`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        const response = await request(
          `${item.path}?workspaceId=${workspaceB}&role=manager`,
          spoofed(json("POST", createInput(item.table, fixture.ownCourse.id))),
        );
        assert.equal(response.status, 201);
        const record = await response.json();
        const stored = fixture.tables.get(item.table).get(record.id);
        assert.ok(stored);
        assert.equal(stored.workspace_id, workspaceA);
        assert.equal(stored.course_id, fixture.ownCourse.id);
        assert.equal(record.course_slug, fixture.ownCourse.slug);
        assert.equal(record.course_name, fixture.ownCourse.name);
        assert.equal(record.course_code, fixture.ownCourse.code);
        if (item.table === "exams") {
          assert.equal(record.topic, "Scoped exam");
          assert.equal(record.exam_date, "2028-02-29");
          assert.equal(record.exam_time, "09:30");
          assert.equal(record.room, "A 101");
          assert.equal(record.revision_note, "Revision note");
        } else if (item.table === "study_plans") {
          assert.equal(record.title, "Scoped revision");
          assert.equal(record.detail, "Revision detail");
          assert.equal(record.due_date, "2028-02-29");
          assert.equal(record.owner_name, "Fixture owner");
          assert.equal(record.completed_at, null);
        } else {
          assert.equal(record.amount, 32000);
          assert.equal(record.description, "Scoped expense");
          assert.equal(record.spent_on, "2028-02-29");
          assert.equal(record.category, "other");
        }
        assertScopedJoin(fixture, item.alias);
      }));

  test(`academic HTTP: viewer POST ${item.path} is denied before SQL despite manager spoofing`, async () =>
    academicApp("viewer", async ({ fixture, request }) => {
      const before = fixture.tables.get(item.table).size;
      const response = await request(
        `${item.path}?role=manager`,
        spoofed(json("POST", createInput(item.table, fixture.ownCourse.id))),
      );
      assert.equal(
        fixture.queries.length,
        0,
        "role denial must precede module SQL",
      );
      await safeError(response, 403, "ROLE_FORBIDDEN");
      assert.equal(fixture.tables.get(item.table).size, before);
    }));

  for (const role of ["viewer", "member"])
    test(`academic HTTP: ${role} DELETE ${item.path} denies own, foreign and missing IDs before SQL`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        for (const id of [
          fixture.own[item.table].id,
          fixture.other[item.table].id,
          randomUUID(),
        ]) {
          const response = await request(
            `${item.path}/${id}?role=manager`,
            spoofed({ method: "DELETE" }),
          );
          assert.equal(
            fixture.queries.length,
            0,
            "manager-only deletion must deny before SQL",
          );
          await safeError(response, 403, "ROLE_FORBIDDEN");
        }
        assert.ok(
          fixture.tables.get(item.table).has(fixture.own[item.table].id),
        );
        assert.ok(
          fixture.tables.get(item.table).has(fixture.other[item.table].id),
        );
      }));

  test(`academic HTTP: manager DELETE ${item.path} removes own record only`, async () =>
    academicApp("manager", async ({ fixture, request }) => {
      const response = await request(
        `${item.path}/${fixture.own[item.table].id}`,
        { method: "DELETE" },
      );
      assert.equal(response.status, 204);
      assert.equal(await response.text(), "");
      assert.equal(
        fixture.tables.get(item.table).has(fixture.own[item.table].id),
        false,
      );
      assert.ok(
        fixture.tables.get(item.table).has(fixture.other[item.table].id),
      );
      const query = fixture.queries.at(-1);
      assert.match(query.sql, /\bworkspace_id\s*=\s*\$\d+/i);
      assert.ok(query.values.includes(workspaceA));
    }));

  test(`academic HTTP: manager foreign DELETE ${item.path} equals safe missing 404 and preserves foreign record`, async () =>
    academicApp("manager", async ({ fixture, request }) => {
      const foreignBefore = { ...fixture.other[item.table] };
      const foreign = await safeError(
        await request(`${item.path}/${fixture.other[item.table].id}`, {
          method: "DELETE",
        }),
        404,
        item.code,
      );
      const missing = await safeError(
        await request(`${item.path}/${randomUUID()}`, { method: "DELETE" }),
        404,
        item.code,
      );
      assert.deepEqual(foreign, missing);
      assert.deepEqual(
        fixture.tables.get(item.table).get(foreignBefore.id),
        foreignBefore,
      );
      assert.ok(fixture.tables.get(item.table).has(fixture.own[item.table].id));
    }));

  for (const role of ["member", "manager"])
    test(`academic HTTP: ${role} foreign/missing course POST ${item.path} maps composite FK 23503 to safe 400`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        const before = fixture.tables.get(item.table).size;
        const foreign = await safeError(
          await request(
            item.path,
            json("POST", createInput(item.table, fixture.otherCourse.id)),
          ),
          400,
          "COURSE_NOT_FOUND",
        );
        const missing = await safeError(
          await request(
            item.path,
            json("POST", createInput(item.table, randomUUID())),
          ),
          400,
          "COURSE_NOT_FOUND",
        );
        assert.deepEqual(foreign, missing);
        assert.equal(fixture.tables.get(item.table).size, before);
      }));

  test(`academic HTTP: POST ${item.path} rejects client identity/workspace/role body fields before SQL`, async () =>
    academicApp("manager", async ({ fixture, request }) => {
      for (const field of ["workspaceId", "workspace_id", "userId", "role"]) {
        const response = await request(
          item.path,
          json("POST", {
            ...createInput(item.table, fixture.ownCourse.id),
            [field]: field === "role" ? "manager" : workspaceB,
          }),
        );
        assert.equal(response.status, 400);
        assert.equal(fixture.queries.length, 0);
      }
    }));

  test(`academic HTTP: real authentication rejects no membership for every existing ${item.table} route before module SQL`, async () =>
    academicApp("manager", async ({ fixture, auth, request }) => {
      auth.state.member = false;
      const routes = [
        [item.path],
        [
          item.path,
          json("POST", createInput(item.table, fixture.ownCourse.id)),
        ],
      ];
      for (const id of [
        fixture.own[item.table].id,
        fixture.other[item.table].id,
        randomUUID(),
      ]) {
        routes.push([`${item.path}/${id}`, { method: "DELETE" }]);
        if (item.table !== "expenses")
          routes.push([
            updateRoute(item, id),
            json("PATCH", updateInput(item.table)),
          ]);
      }
      for (const [path, init] of routes) {
        const response = await request(
          `${path}?workspaceId=${workspaceB}&role=manager`,
          spoofed(init),
        );
        assert.equal(
          fixture.queries.length,
          0,
          "membership denial must precede domain SQL",
        );
        await safeError(response, 403, "WORKSPACE_ACCESS_DENIED");
      }
    }));

  if (item.table === "expenses") continue;

  for (const role of ["member", "manager"])
    test(`academic HTTP: ${role} PATCH ${item.path} changes own fields and preserves course details`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        const foreignBefore = { ...fixture.other[item.table] };
        const response = await request(
          `${updateRoute(item, fixture.own[item.table].id)}?workspaceId=${workspaceB}`,
          spoofed(json("PATCH", updateInput(item.table))),
        );
        assert.equal(response.status, 200);
        const record = await response.json();
        assert.equal(record.id, fixture.own[item.table].id);
        assert.equal(record.course_name, fixture.ownCourse.name);
        assert.equal(record.course_id, fixture.ownCourse.id);
        if (item.table === "exams") {
          assert.equal(record.topic, "Updated exam");
          assert.equal(record.exam_date, "2028-03-01");
          assert.equal(record.exam_time, "14:15");
          assert.equal(record.room, "B 202");
          assert.equal(record.revision_note, "Updated revision");
        } else {
          assert.equal(record.completed_at, timestamp);
          const reset = await request(
            updateRoute(item, record.id),
            json("PATCH", { completed: false }),
          );
          assert.equal(reset.status, 200);
          assert.equal((await reset.json()).completed_at, null);
        }
        assert.deepEqual(fixture.other[item.table], foreignBefore);
        assertScopedJoin(fixture, item.alias);
        const query = fixture.queries.at(-1);
        assert.match(query.sql, /\bworkspace_id\s*=\s*\$\d+/i);
        assert.ok(query.values.includes(workspaceA));
      }));

  test(`academic HTTP: viewer PATCH ${item.path} denies own, foreign and missing IDs before SQL`, async () =>
    academicApp("viewer", async ({ fixture, request }) => {
      for (const id of [
        fixture.own[item.table].id,
        fixture.other[item.table].id,
        randomUUID(),
      ]) {
        const response = await request(
          `${updateRoute(item, id)}?role=manager`,
          spoofed(json("PATCH", updateInput(item.table))),
        );
        assert.equal(
          fixture.queries.length,
          0,
          "viewer update denial must precede SQL",
        );
        await safeError(response, 403, "ROLE_FORBIDDEN");
      }
    }));

  for (const role of ["member", "manager"])
    test(`academic HTTP: ${role} foreign PATCH ${item.path} equals safe missing 404 without modification`, async () =>
      academicApp(role, async ({ fixture, request }) => {
        const foreignBefore = { ...fixture.other[item.table] };
        const ownBefore = { ...fixture.own[item.table] };
        const foreign = await safeError(
          await request(
            updateRoute(item, fixture.other[item.table].id),
            json("PATCH", updateInput(item.table)),
          ),
          404,
          item.code,
        );
        const missing = await safeError(
          await request(
            updateRoute(item, randomUUID()),
            json("PATCH", updateInput(item.table)),
          ),
          404,
          item.code,
        );
        assert.deepEqual(foreign, missing);
        assert.deepEqual(fixture.other[item.table], foreignBefore);
        assert.deepEqual(fixture.own[item.table], ownBefore);
      }));
}

test("academic HTTP: optional create fields retain null defaults and unlinked expense remains readable", async () =>
  academicApp("member", async ({ fixture, request }) => {
    const inputs = [
      [
        "/exams",
        {
          courseId: fixture.ownCourse.id,
          topic: "Nullable note",
          examDate: "2028-02-29",
          examTime: "09:30",
          room: "A 101",
        },
        ["revision_note"],
      ],
      [
        "/study-plans",
        { courseId: fixture.ownCourse.id, title: "Nullable plan" },
        ["detail", "due_date", "owner_name", "completed_at"],
      ],
      [
        "/expenses",
        {
          amount: 10000,
          description: "Unlinked expense",
          spentOn: "2028-02-29",
          category: "other",
        },
        ["course_id", "course_slug", "course_name", "course_code"],
      ],
    ];
    let expenseId;
    for (const [path, input, fields] of inputs) {
      const response = await request(path, json("POST", input));
      assert.equal(response.status, 201);
      const row = await response.json();
      for (const field of fields)
        assert.equal(row[field], null, `${path} ${field}`);
      if (path === "/expenses") expenseId = row.id;
    }
    const response = await request("/expenses");
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.ok(
      rows.some((row) => row.id === expenseId && row.course_id === null),
    );
    assert.equal(
      rows.some((row) => row.id === fixture.other.expenses.id),
      false,
    );
  }));
