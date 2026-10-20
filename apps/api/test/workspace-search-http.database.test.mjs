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
import { WorkspaceSearchService } from "../dist/workspace-search/workspace-search.service.js";

const [A, B] = tenants;
let fixture;

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await installSearchFixture();
});

after(async () => {
  await fixture?.close();
});

async function installSearchFixture() {
  const role = fixture.role;
  assert.match(role, /^examate_docsctx_[a-f0-9]+$/);
  await fixture.admin.query(
    `GRANT SELECT ON exams,study_plans,expenses,tasks TO "${role}"`,
  );
  for (const table of ["exams", "study_plans", "expenses", "tasks"])
    await fixture.admin.query(
      `CREATE POLICY ws_search_${table} ON ${table} FOR SELECT TO "${role}" USING (
        workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
        AND EXISTS (
          SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
          WHERE m.workspace_id=${table}.workspace_id
            AND m.user_id::text=NULLIF(current_setting('examate.user_id',true),'')
            AND m.active AND w.active
        )
      )`,
    );

  const visibleIds = [];
  for (const [index, workspace] of [A, B].entries()) {
    const courseId = randomUUID();
    await fixture.admin.query(
      `INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt)
       VALUES($1,$2,$3,'Searchneedle course',$4,'Tài liệu học tổng hợp','sage','/img/fixture.webp','Synthetic course')`,
      [courseId, workspace.id, `ws-search-${index}`, `SN ${index}`],
    );
    for (let n = 0; n < 2; n++) {
      const examId = randomUUID(),
        planId = randomUUID(),
        expenseId = randomUUID();
      await fixture.admin.query(
        `INSERT INTO exams(id,workspace_id,course_id,topic,exam_date,exam_time,room)
         VALUES($1,$2,$3,$4,'2026-11-01','09:00','Phòng tổng hợp')`,
        [examId, workspace.id, courseId, `Searchneedle exam ${n}`],
      );
      await fixture.admin.query(
        `INSERT INTO study_plans(id,workspace_id,course_id,title,detail)
         VALUES($1,$2,$3,$4,'Nội dung ôn tập')`,
        [planId, workspace.id, courseId, `Searchneedle plan ${n}`],
      );
      await fixture.admin.query(
        `INSERT INTO expenses(id,workspace_id,course_id,amount,description,spent_on,category)
         VALUES($1,$2,$3,12500,$4,'2026-10-20','books')`,
        [expenseId, workspace.id, courseId, `Searchneedle expense ${n}`],
      );
      if (index === 0) visibleIds.push(examId, planId, expenseId);
    }
    for (let n = 0; n < 3; n++) {
      const taskId = randomUUID(),
        documentId = randomUUID();
      await fixture.admin.query(
        `INSERT INTO tasks(id,workspace_id,title,owner_name)
         VALUES($1,$2,$3,'Synthetic owner')`,
        [taskId, workspace.id, `Searchneedle task ${n}`],
      );
      await fixture.admin.query(
        `INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,course_id)
         VALUES($1,$2,$3,'application/pdf',$4,321,'stored',$5)`,
        [
          documentId,
          workspace.id,
          n === 0 && index === 0
            ? "Đề cương thuật-toán_%'\\.pdf"
            : `Searchneedle document ${n}.pdf`,
          `fixture-workspace-search/${index}/${n}.pdf`,
          courseId,
        ],
      );
      if (index === 0) visibleIds.push(taskId, documentId);
    }
    if (index === 0) visibleIds.push(courseId);
  }
  // The punctuation fixture is also searchable, but is outside the common
  // seed query so the primary page count remains deterministic.
  fixture.searchVisibleIds = visibleIds;
}

function forbiddenProvider(calls) {
  return async () => {
    calls.count++;
    throw new Error("Workspace metadata search must never call providers");
  };
}

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
  const external = { count: 0 };
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
    { generate: forbiddenProvider(external) },
    { process: forbiddenProvider(external) },
    { retrieve: forbiddenProvider(external) },
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
    body: JSON.stringify({ email: "search@example.test", password: "fixture" }),
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
    external,
    request: (path, init = {}) =>
      server.request(path, {
        ...init,
        headers: { ...headers, ...init.headers },
      }),
    databaseCalls: facade,
    userId: auth.userId,
  };
}

test("workspace search uses non-owner tenant SQL, one snapshot, validation and current read membership", async (t) => {
  const runtime = await fixture.db.workspaceTransaction(
    { userId: people.manager, workspaceId: A.id, role: "manager" },
    (tx) =>
      tx.query(
        `SELECT session_user, current_user,
          (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls`,
      ),
  );
  assert.deepEqual(runtime.rows[0], {
    session_user: fixture.role,
    current_user: fixture.role,
    superuser: false,
    bypassrls: false,
  });

  const manager = await login("manager");
  const service = manager.server.app.get(WorkspaceSearchService);
  const serviceSearch = service.search.bind(service);
  const searchCalls = t.mock.method(service, "search", (...args) =>
    serviceSearch(...args),
  );
  try {
    const pageResponse = await manager.request(
      "/search?q=searchneedle&page=1&pageSize=5",
    );
    assert.equal(pageResponse.status, 200);
    const first = await pageResponse.json();
    assert.equal(first.total, 13);
    assert.equal(first.page, 1);
    assert.equal(first.pageSize, 5);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 5);
    assert.ok(
      first.items.every((item) => fixture.searchVisibleIds.includes(item.id)),
    );
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "detail",
      "id",
      "kind",
      "label",
      "slug",
    ]);
    assert.doesNotMatch(
      JSON.stringify(first),
      /storage_key|fixture-workspace-search|embedding|chunk/i,
    );

    const pageTwo = await manager.request(
      "/search?q=searchneedle&page=2&pageSize=5",
    );
    assert.equal((await pageTwo.json()).items.length, 5);
    const beyond = await manager.request(
      "/search?q=searchneedle&page=4&pageSize=5",
    );
    assert.deepEqual(await beyond.json(), {
      items: [],
      page: 4,
      pageSize: 5,
      total: 13,
      totalPages: 3,
    });

    const tasks = await manager.request(
      "/search?q=searchneedle&kind=task&sort=label&direction=desc&pageSize=50",
    );
    const taskPage = await tasks.json();
    assert.equal(taskPage.total, 3);
    assert.ok(taskPage.items.every((item) => item.kind === "task"));
    const repeated = await manager.request(
      "/search?q=searchneedle&kind=task&sort=label&direction=desc&pageSize=50",
    );
    assert.deepEqual(
      (await repeated.json()).items.map((item) => item.id),
      taskPage.items.map((item) => item.id),
    );

    const course = await manager.request("/search?q=searchneedle&kind=course");
    const coursePage = await course.json();
    assert.equal(coursePage.total, 1);
    assert.equal(coursePage.items[0].slug, "ws-search-0");

    const punctuation = await manager.request(
      "/search?q=thu%E1%BA%ADt-to%C3%A1n_%25%27%5C",
    );
    assert.equal(punctuation.status, 200);
    assert.ok(
      (await punctuation.json()).items.some((item) =>
        item.label.startsWith("Đề cương thuật-toán"),
      ),
    );

    const spyCount = searchCalls.mock.callCount();
    const invalid = [
      "/search",
      "/search?q=",
      "/search?q=%20%20",
      "/search?q=x",
      "/search?q=searchneedle&q=other",
      "/search?q=searchneedle&q=",
      "/search?q%5B%5D=searchneedle",
      "/search?q%5Bterm%5D=searchneedle",
      `/search?q=${"x".repeat(121)}`,
      "/search?q=searchneedle&kind=unknown",
      "/search?q=searchneedle&sort=label%3Bdrop%20table",
      "/search?q=searchneedle&direction=sideways",
      "/search?q=searchneedle&page=0",
      "/search?q=searchneedle&page=1.2",
      "/search?q=searchneedle&page=1000001",
      "/search?q=searchneedle&pageSize=0",
      "/search?q=searchneedle&pageSize=51",
      "/search?q=searchneedle&page=1&page=2",
    ];
    for (const path of invalid) {
      const response = await manager.request(path);
      assert.equal(response.status, 400, path);
      const text = await response.text();
      assert.doesNotMatch(text, /SELECT|INSERT|stack|searchneedle|drop table/i);
    }
    assert.equal(searchCalls.mock.callCount(), spyCount);

    const beforeUnsupportedQuery = {
      queries: manager.databaseCalls.queries,
      transactions: manager.databaseCalls.transactions,
      workspaceTransactions: manager.databaseCalls.workspaceTransactions,
    };
    for (const path of [
      "/search?q=%E4%BD%A0%E5%A5%BD",
      "/search?q=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82",
    ]) {
      const response = await manager.request(path);
      assert.equal(response.status, 400, path);
      const body = await response.json();
      assert.deepEqual(
        { code: body.code, message: body.message },
        {
          code: "SEARCH_QUERY_UNSUPPORTED",
          message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
        },
      );
      assert.doesNotMatch(JSON.stringify(body), /你好|Привет|SELECT|stack/i);
    }
    assert.deepEqual(
      {
        queries: manager.databaseCalls.queries,
        transactions: manager.databaseCalls.transactions,
        workspaceTransactions: manager.databaseCalls.workspaceTransactions,
      },
      beforeUnsupportedQuery,
      "a query folded to empty must not query business storage or open a transaction",
    );
    const deniedSearchCalls = searchCalls.mock.callCount();

    const noCookie = await manager.server.request("/search?q=searchneedle");
    assert.equal(noCookie.status, 401);

    const member = await login("member");
    try {
      const response = await member.request("/search?q=searchneedle");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).total, 13);
    } finally {
      await member.server.app.close();
    }
    const viewer = await login("viewer");
    try {
      const response = await viewer.request("/search?q=searchneedle");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).total, 13);
    } finally {
      await viewer.server.app.close();
    }

    await fixture.admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [A.id, manager.userId],
    );
    const revoked = await manager.request("/search?q=searchneedle");
    assert.ok([401, 403].includes(revoked.status));
    assert.equal(searchCalls.mock.callCount(), deniedSearchCalls);
    assert.equal(manager.external.count, 0);

    const absent = await login("viewer", { membership: false });
    try {
      const response = await absent.request("/search?q=searchneedle");
      assert.ok([401, 403].includes(response.status));
      assert.equal(absent.external.count, 0);
    } finally {
      await absent.server.app.close();
    }
  } finally {
    await manager.server.app.close();
  }
});
