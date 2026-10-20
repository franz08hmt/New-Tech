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
import { TasksService } from "../dist/tasks/tasks.service.js";

const [A, B] = tenants;
let fixture;
const taskIds = [];
const foreignTaskIds = [];

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await fixture.admin.query('GRANT SELECT ON tasks TO "' + fixture.role + '"');
  await fixture.admin.query(
    "CREATE POLICY f053_tasks_read ON tasks FOR SELECT TO PUBLIC USING (workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'') AND EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=tasks.workspace_id AND m.user_id::text=NULLIF(current_setting('examate.user_id',true),'') AND m.active AND w.active))",
  );
  for (const [workspaceIndex, workspace] of [A, B].entries()) {
    const count = workspaceIndex === 0 ? 24 : 6;
    for (let n = 0; n < count; n++) {
      const id = randomUUID();
      if (workspaceIndex === 0) taskIds.push(id);
      else foreignTaskIds.push(id);
      await fixture.admin.query(
        "INSERT INTO tasks(id,workspace_id,title,owner_name,status,due_date) VALUES($1,$2,$3,$4,$5,$6::date)",
        [
          id,
          workspace.id,
          "F053 needle task " + String(n).padStart(2, "0"),
          n % 3 === 0 ? null : n % 2 === 0 ? "Tài" : "Thắng",
          ["todo", "in_progress", "done"][n % 3],
          "2026-11-" + String((n % 27) + 1).padStart(2, "0"),
        ],
      );
    }
  }
  await fixture.admin.query(
    "INSERT INTO tasks(id,workspace_id,title,owner_name,status,due_date) VALUES($1,$2,$3,$4,'todo','2026-11-29')",
    [randomUUID(), A.id, "Lập trình tiếng Việt", "Đặng"],
  );
});

after(async () => {
  await fixture?.close();
});

async function login(role, { membership = true } = {}) {
  const auth = authFixture();
  auth.config.workspaceId = A.id;
  auth.config.origin = "http://127.0.0.1:5173";
  await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [
    auth.userId,
  ]);
  if (membership)
    await fixture.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [A.id, auth.userId, role],
    );
  auth.store.membership = fixture.auth.membership.bind(fixture.auth);
  const facade = {
    queries: 0,
    transactions: 0,
    workspaceTransactions: 0,
    query(...args) {
      this.queries++;
      return fixture.db.query(...args);
    },
    transaction(...args) {
      this.transactions++;
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
  assert.equal(prelogin.status, 200);
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
      email: "tasks-search@example.test",
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
    databaseCalls: facade,
    request: (path, init = {}) =>
      server.request(path, {
        ...init,
        headers: { ...headers, ...init.headers },
      }),
  };
}

test("Tasks search pages and filters real tenant rows on a non-owner runtime", async (t) => {
  const runtime = await fixture.db.workspaceTransaction(
    { userId: people.manager, workspaceId: A.id, role: "manager" },
    (tx) =>
      tx.query(
        "SELECT session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls",
      ),
  );
  assert.deepEqual(runtime.rows[0], {
    session_user: fixture.role,
    current_user: fixture.role,
    superuser: false,
    bypassrls: false,
  });
  const manager = await login("manager");
  const service = manager.server.app.get(TasksService);
  const originalSearch = service.search;
  const spy = originalSearch
    ? t.mock.method(service, "search", (...args) =>
        originalSearch.apply(service, args),
      )
    : null;
  try {
    const response = await manager.request(
      "/tasks/search?q=needle&page=1&pageSize=10",
    );
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.equal(first.total, 24);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 10);
    assert.deepEqual(first.summary, { total: 24, done: 8 });
    assert.ok(first.items.every((item) => taskIds.includes(item.id)));
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "created_at",
      "due_date",
      "evidence_type",
      "id",
      "owner_name",
      "status",
      "title",
      "updated_at",
    ]);
    const browse = await manager.request("/tasks/search?pageSize=50");
    assert.equal((await browse.json()).total, 25);
    const blank = await manager.request("/tasks/search?q=%20%20&pageSize=50");
    assert.equal((await blank.json()).total, 25);
    const vietnamese = await manager.request("/tasks/search?q=lap%20trinh");
    assert.equal(
      (await vietnamese.json()).items[0].title,
      "Lập trình tiếng Việt",
    );
    const ownerFold = await manager.request("/tasks/search?q=dang");
    assert.equal((await ownerFold.json()).items[0].owner_name, "Đặng");
    const pageTwo = await manager.request(
      "/tasks/search?q=needle&page=2&pageSize=10&sort=due_date&direction=asc",
    );
    assert.equal((await pageTwo.json()).items.length, 10);
    const doneOnly = await manager.request(
      "/tasks/search?q=needle&status=done&sort=title&direction=desc&pageSize=50",
    );
    const doneBody = await doneOnly.json();
    assert.equal(doneBody.total, 8);
    assert.ok(doneBody.items.every((item) => item.status === "done"));
    const focused = await manager.request(`/tasks/${taskIds.at(-1)}`);
    assert.equal(focused.status, 200);
    assert.equal((await focused.json()).id, taskIds.at(-1));
    const foreignFocus = await manager.request(`/tasks/${foreignTaskIds[0]}`);
    assert.equal(foreignFocus.status, 404);
    assert.doesNotMatch(
      await foreignFocus.text(),
      /workspace|Synthetic|foreign/i,
    );
    const beyond = await manager.request(
      "/tasks/search?q=needle&page=4&pageSize=10",
    );
    assert.deepEqual(await beyond.json(), {
      items: [],
      page: 4,
      pageSize: 10,
      total: 24,
      totalPages: 3,
      summary: { total: 24, done: 8 },
    });
    const unassigned = await manager.request(
      "/tasks/search?q=needle&owner=unassigned&pageSize=50",
    );
    const unassignedBody = await unassigned.json();
    assert.equal(unassignedBody.total, 8);
    assert.ok(unassignedBody.items.every((item) => item.owner_name === null));
    const beforeInvalid = spy?.mock.callCount() ?? 0;
    for (const path of [
      "/tasks/search?q=needle&q=other",
      "/tasks/search?q%5B%5D=needle",
      "/tasks/search?q=needle&status=unknown",
      "/tasks/search?q=needle&sort=title%3Bdrop",
      "/tasks/search?q=needle&page=1.5",
      "/tasks/search?q=needle&pageSize=51",
      "/tasks/search?q=x",
    ]) {
      const invalid = await manager.request(path);
      assert.equal(invalid.status, 400, path);
      assert.doesNotMatch(await invalid.text(), /SELECT|stack|needle|drop/i);
    }
    if (spy) assert.equal(spy.mock.callCount(), beforeInvalid);
    const beforeUnsupportedTx = manager.databaseCalls.workspaceTransactions;
    const beforeUnsupportedService = spy?.mock.callCount() ?? 0;
    const unsupported = await manager.request("/tasks/search?q=你好");
    assert.equal(unsupported.status, 400);
    assert.match(await unsupported.text(), /SEARCH_QUERY_UNSUPPORTED/);
    assert.equal(
      manager.databaseCalls.workspaceTransactions,
      beforeUnsupportedTx,
    );
    if (spy) assert.equal(spy.mock.callCount(), beforeUnsupportedService + 1);
    for (const role of ["member", "viewer"]) {
      const reader = await login(role);
      try {
        const result = await reader.request(
          "/tasks/search?q=needle&pageSize=50",
        );
        assert.equal(result.status, 200);
        const body = await result.json();
        assert.equal(body.total, 24);
        assert.ok(body.items.every((item) => taskIds.includes(item.id)));
      } finally {
        await reader.server.app.close();
      }
    }
    const absent = await login("member", { membership: false });
    try {
      assert.equal(
        (await absent.request("/tasks/search?q=needle")).status,
        403,
      );
    } finally {
      await absent.server.app.close();
    }
  } finally {
    await manager.server.app.close();
  }
});
