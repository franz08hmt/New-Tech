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

const [A, B] = tenants;
let fixture;
const courseIds = [];
const foreignSlug = "f053-foreign-only";

before(async () => {
  fixture = await openDocumentsTenantFixture();
  for (let n = 0; n < 24; n++) {
    const id = randomUUID();
    courseIds.push(id);
    await fixture.admin.query(
      "INSERT INTO courses(id,workspace_id,slug,name,code,detail,progress,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,$6,$7,'slate','/img/fixture.webp','Synthetic cover')",
      [
        id,
        A.id,
        `f053-course-${String(n).padStart(2, "0")}`,
        `F053 Course ${String(n).padStart(2, "0")}`,
        `F5 ${String(n).padStart(2, "0")}`,
        `Punctuation code/alpha ${String(n).padStart(2, "0")}`,
        (n % 6) * 10,
      ],
    );
  }
  await fixture.admin.query(
    "INSERT INTO courses(workspace_id,slug,name,code,detail,progress,tone,cover,cover_alt) VALUES($1,'f053-lap-trinh','Lập trình tiếng Việt','VI 701','Đồ án & tìm kiếm',37,'sage','/img/fixture.webp','Vietnamese course'),($2,$3,'F053 Course 00','F5 X1','Foreign duplicate name',10,'slate','/img/fixture.webp','Foreign course')",
    [A.id, B.id, foreignSlug],
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
    workspaceTransactions: 0,
    query: (...args) => fixture.db.query(...args),
    transaction: (...args) => fixture.db.transaction(...args),
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
      email: "courses@example.test",
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

test("Courses search pages filtered tenant metadata on real non-owner HTTP", async (t) => {
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
  try {
    const firstResponse = await manager.request(
      "/courses/search?q=f053%20course&page=1&pageSize=10",
    );
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.total, 24);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 10);
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "code",
      "cover",
      "cover_alt",
      "created_at",
      "detail",
      "id",
      "name",
      "progress",
      "slug",
      "tone",
      "updated_at",
    ]);
    assert.equal("outline" in first.items[0], false);
    assert.equal("workspace_id" in first.items[0], false);
    const second = await (
      await manager.request(
        "/courses/search?q=f053%20course&page=2&pageSize=10&sort=progress&direction=desc",
      )
    ).json();
    assert.equal(second.items.length, 10);
    const bounded = await (
      await manager.request(
        "/courses/search?q=f053%20course&progressMin=40&progressMax=80&pageSize=50",
      )
    ).json();
    assert.ok(
      bounded.items.every((item) => item.progress >= 40 && item.progress <= 80),
    );
    const progressSorted = await (
      await manager.request(
        "/courses/search?progressMin=0&progressMax=100&pageSize=50&sort=progress",
      )
    ).json();
    const progressAgain = await (
      await manager.request(
        "/courses/search?progressMin=0&progressMax=100&pageSize=50&sort=progress",
      )
    ).json();
    assert.deepEqual(
      progressSorted.items.map((item) => item.id),
      progressAgain.items.map((item) => item.id),
    );
    for (const group of Map.groupBy(
      progressSorted.items,
      (item) => item.progress,
    ).values())
      assert.deepEqual(
        group.map((item) => item.id),
        [...group.map((item) => item.id)].sort(),
      );
    const beyond = await (
      await manager.request(
        "/courses/search?q=f053%20course&page=4&pageSize=10",
      )
    ).json();
    assert.deepEqual(
      {
        items: beyond.items,
        page: beyond.page,
        total: beyond.total,
        totalPages: beyond.totalPages,
      },
      { items: [], page: 4, total: 24, totalPages: 3 },
    );
    const folded = await (
      await manager.request("/courses/search?q=lap%20trinh")
    ).json();
    assert.equal(folded.total, 1);
    assert.equal(folded.items[0].name, "Lập trình tiếng Việt");
    const punctuation = await (
      await manager.request("/courses/search?q=code%20alpha")
    ).json();
    assert.equal(punctuation.total, 24);
    const browse = await (
      await manager.request("/courses/search?q=%20%20&pageSize=50")
    ).json();
    assert.equal(browse.total, 26);
    const missingQuery = await (
      await manager.request("/courses/search?pageSize=50")
    ).json();
    assert.equal(missingQuery.total, 26);
    const legacyList = await (await manager.request("/courses")).json();
    assert.equal(Array.isArray(legacyList), true);
    assert.equal(legacyList.length, 26);
    assert.ok(legacyList.some((item) => Array.isArray(item.outline)));
    const focused = await manager.request("/courses/f053-course-23");
    assert.equal(focused.status, 200);
    assert.equal((await focused.json()).id, courseIds[23]);
    const foreign = await manager.request(`/courses/${foreignSlug}`);
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(await foreign.text(), /Foreign duplicate|F053 Course/);
    const transactions = manager.databaseCalls.workspaceTransactions;
    for (const path of [
      "/courses/search?q=f053&q=other",
      "/courses/search?q%5B%5D=f053",
      "/courses/search?q=x",
      "/courses/search?progressMin=-1",
      "/courses/search?progressMax=101",
      "/courses/search?progressMin=80&progressMax=40",
      "/courses/search?sort=name%3Bdrop",
      "/courses/search?page=1.5",
    ]) {
      const response = await manager.request(path);
      assert.equal(response.status, 400, path);
    }
    assert.equal(manager.databaseCalls.workspaceTransactions, transactions);
    const unsupported = await manager.request(
      "/courses/search?q=%E4%BD%A0%E5%A5%BD",
    );
    assert.equal(unsupported.status, 400);
    assert.match(await unsupported.text(), /SEARCH_QUERY_UNSUPPORTED/);
    assert.equal(manager.databaseCalls.workspaceTransactions, transactions);
    for (const role of ["member", "viewer"]) {
      const reader = await login(role);
      try {
        const result = await reader.request(
          "/courses/search?q=f053%20course&pageSize=50",
        );
        assert.equal(result.status, 200);
        assert.equal((await result.json()).total, 24);
      } finally {
        await reader.server.app.close();
      }
    }
    const absent = await login("member", { membership: false });
    try {
      assert.equal(
        (await absent.request("/courses/search?q=f053%20course")).status,
        403,
      );
    } finally {
      await absent.server.app.close();
    }
  } finally {
    await manager.server.app.close();
  }
});
