import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  openDocumentsTenantFixture,
  tenants,
  people,
} from "./documents-tenant-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { httpApp } from "./helpers.mjs";
import { ExpensesService } from "../dist/expenses/expenses.service.js";

const [A, B, inactiveTenant] = tenants;
let fixture;
const expenseIds = [];
const foreignExpenseId = randomUUID();
const alternateCourseId = randomUUID();
const targetId = randomUUID();

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await fixture.admin.query(`GRANT SELECT ON expenses TO "${fixture.role}"`);
  await fixture.admin.query(
    `CREATE POLICY f053_expenses_read ON expenses FOR SELECT TO "${fixture.role}" USING (
      workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
      AND EXISTS (
        SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
        WHERE m.workspace_id=expenses.workspace_id
          AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid
          AND m.active AND w.active
      )
    )`,
  );
  await fixture.admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'f053-expense-alt','Áp dụng số liệu','EC 202','Synthetic expense course','slate','/img/f.webp','Fixture')",
    [alternateCourseId, A.id],
  );

  const categories = [
    "books",
    "transport",
    "food",
    "supplies",
    "fees",
    "other",
  ];
  for (let index = 0; index < 25; index++) {
    const id = randomUUID();
    expenseIds.push(id);
    await fixture.admin.query(
      "INSERT INTO expenses(id,workspace_id,course_id,amount,description,spent_on,category) VALUES($1,$2,$3,$4,$5,$6::date,$7)",
      [
        id,
        A.id,
        index % 3 === 0 ? null : index % 2 ? alternateCourseId : A.course,
        1000 + index,
        `F053 expense ${String(index).padStart(2, "0")}`,
        index === 1
          ? "2027-02-01"
          : `2027-02-${String(index + 1).padStart(2, "0")}`,
        categories[index % categories.length],
      ],
    );
  }
  await fixture.admin.query(
    "INSERT INTO expenses(id,workspace_id,course_id,amount,description,spent_on,category) VALUES($1,$2,$3,125000,'Lập trình & lịch học — cây nhị phân','2027-03-01','books'),($4,$5,$6,1900000000,'F053 expense 99 foreign','2027-02-01','books')",
    [targetId, A.id, A.course, foreignExpenseId, B.id, B.course],
  );
});

after(async () => {
  await fixture?.close();
});

async function login(
  role,
  { membership = true, membershipActive = true, workspace = A } = {},
) {
  const auth = authFixture();
  auth.config.workspaceId = workspace.id;
  auth.config.origin = "http://127.0.0.1:5173";
  await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [
    auth.userId,
  ]);
  if (membership)
    await fixture.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,$4)",
      [workspace.id, auth.userId, role, membershipActive],
    );
  auth.store.membership = fixture.auth.membership.bind(fixture.auth);
  const facade = {
    workspaceTransactions: 0,
    query(...args) {
      return fixture.db.query(...args);
    },
    transaction(...args) {
      return fixture.db.transaction(...args);
    },
    workspaceTransaction(...args) {
      this.workspaceTransactions++;
      return fixture.db.workspaceTransaction(...args);
    },
  };
  const server = await httpApp(
    facade,
    fixture.storage,
    {
      generate: async () => {
        throw new Error("unexpected AI call");
      },
    },
    {
      process: async () => {
        throw new Error("unexpected OCR call");
      },
    },
    {
      retrieve: async () => {
        throw new Error("unexpected provider call");
      },
    },
    auth,
  );
  const prelogin = await server.request("/auth/session");
  const csrf = (await prelogin.json()).csrfToken;
  const loginResponse = await server.request("/auth/login", {
    method: "POST",
    headers: {
      Cookie: prelogin.headers.get("set-cookie").split(";")[0],
      Origin: auth.config.origin,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "expenses-search@example.test",
      password: "fixture",
    }),
  });
  assert.equal(loginResponse.status, 200);
  const session = await loginResponse.json();
  const headers = {
    Cookie: loginResponse.headers.get("set-cookie").split(";")[0],
    Origin: auth.config.origin,
    "X-CSRF-Token": session.csrfToken,
  };
  return {
    server,
    facade,
    request: (path, init = {}) =>
      server.request(path, {
        ...init,
        headers: { ...headers, ...init.headers },
      }),
  };
}

test("expense search returns tenant pages and all-filtered exact aggregates", async (t) => {
  const runtime = await fixture.db.workspaceTransaction(
    { userId: people.manager, workspaceId: A.id, role: "manager" },
    (tx) =>
      tx.query(
        "SELECT session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls",
      ),
  );
  assert.equal(runtime.rows[0].session_user, fixture.role);
  assert.equal(runtime.rows[0].current_user, fixture.role);
  assert.equal(runtime.rows[0].superuser, false);
  assert.equal(runtime.rows[0].bypassrls, false);

  const manager = await login("manager");
  const servers = [manager.server];
  const service = manager.server.app.get(ExpensesService);
  let spy;
  try {
    if (typeof service.search === "function") {
      const originalSearch = service.search;
      spy = t.mock.method(service, "search", (...args) =>
        originalSearch.apply(service, args),
      );
    }
    const firstResponse = await manager.request(
      "/expenses/search?q=F053%20expense&page=1&pageSize=10",
    );
    const firstText = await firstResponse.text();
    assert.equal(firstResponse.status, 200, firstText);
    const first = JSON.parse(firstText);
    assert.equal(first.total, 25);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 10);
    assert.deepEqual(first.summary, {
      totalAmount: "25300",
      largestAmount: "1024",
      byCourse: first.summary.byCourse,
    });
    assert.equal(
      first.summary.byCourse.reduce(
        (sum, group) => sum + BigInt(group.totalAmount),
        0n,
      ),
      25300n,
    );
    assert.ok(first.items.every((item) => expenseIds.includes(item.id)));
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "amount",
      "category",
      "course_code",
      "course_id",
      "course_name",
      "course_slug",
      "created_at",
      "description",
      "id",
      "spent_on",
      "updated_at",
    ]);

    const second = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&page=2&pageSize=10",
      )
    ).json();
    assert.equal(second.items.length, 10);
    assert.deepEqual(second.summary, first.summary);
    assert.ok(
      second.items.every(
        (item) => !first.items.some((row) => row.id === item.id),
      ),
    );

    const amountDescending = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&sort=amount&direction=desc&pageSize=50",
      )
    ).json();
    assert.equal(amountDescending.items[0].amount, 1024);
    const descriptionDescending = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&sort=description&direction=desc&pageSize=50",
      )
    ).json();
    assert.match(descriptionDescending.items[0].description, /24$/);
    const dateAscending = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&sort=spent_on&direction=asc&pageSize=50",
      )
    ).json();
    assert.equal(dateAscending.items[0].spent_on, "2027-02-01");
    assert.equal(dateAscending.items[24].spent_on, "2027-02-25");
    assert.deepEqual(
      dateAscending.items.slice(0, 2).map((item) => item.id),
      dateAscending.items
        .slice(0, 2)
        .map((item) => item.id)
        .sort(),
    );

    const categoryAndRange = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&category=books&fromDate=2027-02-01&toDate=2027-02-25&sort=spent_on&direction=asc&pageSize=50",
      )
    ).json();
    assert.equal(categoryAndRange.total, 5);
    assert.equal(categoryAndRange.summary.totalAmount, "5060");
    assert.equal(categoryAndRange.items[0].spent_on, "2027-02-01");

    const unassigned = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&courseId=unassigned&pageSize=50",
      )
    ).json();
    assert.equal(unassigned.total, 9);
    assert.ok(unassigned.items.every((item) => item.course_id === null));
    const foreignCourse = await (
      await manager.request(
        `/expenses/search?q=F053%20expense&courseId=${B.course}&pageSize=50`,
      )
    ).json();
    assert.equal(foreignCourse.total, 0);
    assert.equal(foreignCourse.summary.totalAmount, "0");
    const outOfRange = await (
      await manager.request(
        "/expenses/search?q=F053%20expense&page=4&pageSize=10",
      )
    ).json();
    assert.equal(outOfRange.total, 25);
    assert.deepEqual(outOfRange.items, []);
    assert.deepEqual(outOfRange.summary, first.summary);

    const vietnamese = await (
      await manager.request(
        `/expenses/search?q=${encodeURIComponent("LẬP TRÌNH & LỊCH")}`,
      )
    ).json();
    assert.equal(vietnamese.total, 1);
    assert.equal(vietnamese.items[0].id, targetId);
    assert.equal(vietnamese.items[0].spent_on, "2027-03-01");
    const noAccent = await (
      await manager.request(
        `/expenses/search?q=${encodeURIComponent("lap trinh lich")}`,
      )
    ).json();
    assert.equal(noAccent.total, 1);
    const browse = await (
      await manager.request("/expenses/search?pageSize=50")
    ).json();
    assert.equal(browse.total, 26);
    const blankBrowse = await (
      await manager.request("/expenses/search?q=%20%20&pageSize=50")
    ).json();
    assert.equal(blankBrowse.total, 26);
    const focused = await manager.request(`/expenses/${targetId}`);
    assert.equal(focused.status, 200);
    assert.equal((await focused.json()).id, targetId);
    const foreign = await manager.request(`/expenses/${foreignExpenseId}`);
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(await foreign.text(), /foreign/i);

    const beforeInvalid = manager.facade.workspaceTransactions;
    const beforeService = spy?.mock.callCount() ?? 0;
    for (const path of [
      "/expenses/search?q=F053&q=other",
      "/expenses/search?q[]=F053",
      "/expenses/search?q[x]=F053",
      "/expenses/search?category=unknown",
      "/expenses/search?category[]=books",
      "/expenses/search?courseId=not-a-uuid",
      "/expenses/search?sort=amount;DROP%20TABLE%20expenses",
      "/expenses/search?direction=sideways",
      "/expenses/search?page=0",
      "/expenses/search?page=1.1",
      "/expenses/search?pageSize=51",
      "/expenses/search?fromDate=2027-02-30",
      `/expenses/search?q=${"a".repeat(121)}`,
    ]) {
      const response = await manager.request(path);
      assert.equal(response.status, 400, path);
      assert.doesNotMatch(await response.text(), /DROP TABLE|F053/);
    }
    assert.equal(manager.facade.workspaceTransactions, beforeInvalid);
    assert.equal(spy?.mock.callCount() ?? 0, beforeService);

    const beforeUnsupported = manager.facade.workspaceTransactions;
    const unsupported = await manager.request(
      `/expenses/search?q=${encodeURIComponent("你好")}`,
    );
    assert.equal(unsupported.status, 400);
    assert.equal((await unsupported.json()).code, "SEARCH_QUERY_UNSUPPORTED");
    assert.equal(manager.facade.workspaceTransactions, beforeUnsupported);
    const beforeReversed = manager.facade.workspaceTransactions;
    assert.equal(
      (
        await manager.request(
          "/expenses/search?fromDate=2027-03-01&toDate=2027-02-01",
        )
      ).status,
      400,
    );
    assert.equal(manager.facade.workspaceTransactions, beforeReversed);
    assert.ok(manager.facade.workspaceTransactions > 0);

    for (const role of ["member", "viewer"]) {
      const runtime = await login(role);
      servers.push(runtime.server);
      const allowed = await runtime.request("/expenses/search?q=F053 expense");
      assert.equal(allowed.status, 200);
      await allowed.arrayBuffer();
    }
    const absent = await login("member", { membership: false });
    servers.push(absent.server);
    const deniedAbsent = await absent.request(
      "/expenses/search?q=F053 expense",
    );
    assert.equal(deniedAbsent.status, 403);
    assert.doesNotMatch(await deniedAbsent.text(), /F053 expense/);
    const inactive = await login("member", { membershipActive: false });
    servers.push(inactive.server);
    const deniedInactive = await inactive.request(
      "/expenses/search?q=F053 expense",
    );
    assert.equal(deniedInactive.status, 403);
    assert.doesNotMatch(await deniedInactive.text(), /F053 expense/);
    const workspaceInactive = await login("manager", {
      workspace: inactiveTenant,
    });
    servers.push(workspaceInactive.server);
    const deniedWorkspace = await workspaceInactive.request(
      "/expenses/search?q=F053 expense",
    );
    assert.equal(deniedWorkspace.status, 403);
    assert.doesNotMatch(await deniedWorkspace.text(), /F053 expense/);
  } finally {
    spy?.mock.restore();
    for (const server of servers) await server.app.close();
  }
});
