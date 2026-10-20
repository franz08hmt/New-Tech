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
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";

const [A, B] = tenants;
let fixture;
const planIds = [];
const foreignPlanId = randomUUID();
const secondCourseId = randomUUID();
const tiedPlanId = randomUUID();

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await fixture.admin.query(`GRANT SELECT ON study_plans TO "${fixture.role}"`);
  await fixture.admin.query(
    `CREATE POLICY f053_study_plans_read ON study_plans FOR SELECT TO "${fixture.role}" USING (
      workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
      AND EXISTS (
        SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
        WHERE m.workspace_id=study_plans.workspace_id
          AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid
          AND m.active AND w.active
      )
    )`,
  );
  await fixture.admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'f053-alt-plan-course','Applied Biology','BI 2','Synthetic alternate course','slate','/img/f.webp','Fixture')",
    [secondCourseId, A.id],
  );
  for (let n = 0; n < 24; n++) {
    const id = randomUUID();
    planIds.push(id);
    await fixture.admin.query(
      "INSERT INTO study_plans(id,course_id,title,detail,due_date,owner_name,completed_at,workspace_id) VALUES($1,$2,$3,$4,$5::date,$6,$7::timestamptz,$8)",
      [
        id,
        n % 2 ? secondCourseId : A.course,
        `F053 common plan ${String(n).padStart(2, "0")}`,
        `Synthetic review detail ${n}`,
        `2027-01-${String(n + 1).padStart(2, "0")}`,
        n % 4 === 0 ? null : n % 2 ? "Thắng" : "Tài",
        n % 3 === 0 ? "2026-10-01T12:00:00Z" : null,
        A.id,
      ],
    );
  }
  await fixture.admin.query(
    "INSERT INTO study_plans(id,course_id,title,detail,due_date,owner_name,workspace_id) VALUES($1,$2,'Lập trình & lịch ôn thi','cây nhị phân và nội dung có dấu','2027-02-28','Thắng',$3),($4,$5,'F053 common plan 00','Foreign tenant detail','2027-01-01','Foreign owner',$6)",
    [randomUUID(), A.course, A.id, foreignPlanId, B.course, B.id],
  );
  await fixture.admin.query(
    "INSERT INTO study_plans(id,course_id,title,detail,due_date,owner_name,workspace_id) VALUES($1,$2,'F053 common plan 24','Equal due date for stable UUID tie break','2027-01-24',NULL,$3)",
    [tiedPlanId, secondCourseId, A.id],
  );
});

after(async () => {
  await fixture?.close();
});

async function login(
  role,
  { membership = true, membershipActive = true } = {},
) {
  const auth = authFixture();
  auth.config.workspaceId = A.id;
  auth.config.origin = "http://127.0.0.1:5173";
  await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [
    auth.userId,
  ]);
  if (membership)
    await fixture.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,$4)",
      [A.id, auth.userId, role, membershipActive],
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
      email: "plans-search@example.test",
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

test("Study plan search pages tenant rows, keeps all-match summary, and scopes lookup", async (t) => {
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
  const service = manager.server.app.get(StudyPlansService);
  let spy;
  try {
    if (typeof service.search === "function") {
      const originalSearch = service.search;
      spy = t.mock.method(service, "search", (...args) =>
        originalSearch.apply(service, args),
      );
    }
    const beforeValidRequests = manager.facade.workspaceTransactions;
    const response = await manager.request(
      "/study-plans/search?q=common&page=1&pageSize=10",
    );
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody);
    const first = JSON.parse(responseBody);
    assert.equal(first.total, 25);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 10);
    assert.deepEqual(first.summary, { total: 25, completed: 8, remaining: 17 });
    assert.ok(first.items.every((plan) => planIds.includes(plan.id)));
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "completed_at",
      "course_code",
      "course_id",
      "course_name",
      "course_slug",
      "created_at",
      "detail",
      "due_date",
      "id",
      "owner_name",
      "title",
      "updated_at",
    ]);
    const second = await (
      await manager.request("/study-plans/search?q=common&page=2&pageSize=10")
    ).json();
    assert.equal(second.items.length, 10);
    assert.ok(
      second.items.every((plan) => !first.items.some((x) => x.id === plan.id)),
    );
    const dueDescending = await (
      await manager.request(
        "/study-plans/search?q=common&sort=due_date&direction=desc&pageSize=50",
      )
    ).json();
    assert.equal(dueDescending.items[0].due_date, "2027-01-24");
    assert.deepEqual(
      dueDescending.items.slice(0, 2).map((plan) => plan.id),
      dueDescending.items
        .slice(0, 2)
        .map((plan) => plan.id)
        .sort(),
    );
    const byTitle = await (
      await manager.request(
        "/study-plans/search?q=common&sort=title&direction=desc&pageSize=50",
      )
    ).json();
    assert.match(byTitle.items[0].title, /24$/);
    const byCourse = await (
      await manager.request(
        "/study-plans/search?q=common&sort=course&pageSize=50",
      )
    ).json();
    assert.equal(byCourse.items[0].course_name, "Applied Biology");

    const filtered = await (
      await manager.request(
        `/study-plans/search?courseId=${secondCourseId}&dueFrom=2027-01-05&dueTo=2027-01-16&completion=open&owner=Thắng`,
      )
    ).json();
    assert.equal(filtered.total, 4);
    assert.equal(filtered.summary.remaining, 4);
    assert.ok(
      filtered.items.every(
        (plan) =>
          plan.course_id === secondCourseId &&
          !plan.completed_at &&
          plan.owner_name === "Thắng" &&
          plan.due_date >= "2027-01-05" &&
          plan.due_date <= "2027-01-16",
      ),
    );
    const unassigned = await (
      await manager.request(
        "/study-plans/search?q=common&owner=unassigned&pageSize=50",
      )
    ).json();
    assert.equal(unassigned.total, 7);
    const detailSearch = await (
      await manager.request("/study-plans/search?q=review%20detail%207")
    ).json();
    assert.equal(detailSearch.total, 1);
    const vietnamese = await (
      await manager.request("/study-plans/search?q=lich%20on")
    ).json();
    assert.equal(vietnamese.total, 1);
    assert.equal(vietnamese.items[0].due_date, "2027-02-28");
    const punctuation = await (
      await manager.request(
        `/study-plans/search?q=${encodeURIComponent("lập trình & lịch")}`,
      )
    ).json();
    assert.equal(punctuation.total, 1);
    const courseMetadata = await (
      await manager.request("/study-plans/search?q=Applied%20Biology")
    ).json();
    assert.equal(courseMetadata.total, 13);
    const blank = await (
      await manager.request("/study-plans/search?q=%20%20&pageSize=50")
    ).json();
    assert.equal(blank.total, 26);
    const browse = await (
      await manager.request("/study-plans/search?pageSize=50")
    ).json();
    assert.equal(browse.total, 26);
    const beyond = await (
      await manager.request("/study-plans/search?q=common&page=4&pageSize=10")
    ).json();
    assert.deepEqual(
      {
        items: beyond.items,
        page: beyond.page,
        total: beyond.total,
        summary: beyond.summary,
      },
      {
        items: [],
        page: 4,
        total: 25,
        summary: { total: 25, completed: 8, remaining: 17 },
      },
    );

    const foreign = await manager.request(`/study-plans/${foreignPlanId}`);
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(
      await foreign.text(),
      /Foreign tenant detail|Foreign owner/,
    );
    const focused = await manager.request(`/study-plans/${planIds[23]}`);
    assert.equal(focused.status, 200);
    assert.equal((await focused.json()).id, planIds[23]);

    const beforeService = spy?.mock.callCount() ?? 0;
    for (const path of [
      "/study-plans/search?q=common&q=other",
      "/study-plans/search?q[]=common",
      "/study-plans/search?q[x]=common",
      "/study-plans/search?completion=finished",
      "/study-plans/search?owner[]=Tài",
      "/study-plans/search?dueFrom=2027-02-30",
      "/study-plans/search?courseId=not-a-uuid",
      "/study-plans/search?sort=owner_name",
      "/study-plans/search?direction=sideways",
      "/study-plans/search?page=0",
      "/study-plans/search?page=1.5",
      "/study-plans/search?pageSize=51",
      `/study-plans/search?q=${"a".repeat(121)}`,
    ])
      assert.equal((await manager.request(path)).status, 400, path);
    assert.equal(spy?.mock.callCount() ?? 0, beforeService);
    const beforeUnsupported = manager.facade.workspaceTransactions;
    const unsupported = await manager.request(
      `/study-plans/search?q=${encodeURIComponent("你好")}`,
    );
    assert.equal(unsupported.status, 400);
    assert.equal((await unsupported.json()).code, "SEARCH_QUERY_UNSUPPORTED");
    assert.equal(manager.facade.workspaceTransactions, beforeUnsupported);
    const beforeReversed = manager.facade.workspaceTransactions;
    assert.equal(
      (
        await manager.request(
          "/study-plans/search?dueFrom=2027-02-01&dueTo=2027-01-01",
        )
      ).status,
      400,
    );
    assert.equal(manager.facade.workspaceTransactions, beforeReversed);
    assert.equal(
      manager.facade.workspaceTransactions > beforeValidRequests,
      true,
    );

    for (const role of ["member", "viewer"]) {
      const runtime = await login(role);
      servers.push(runtime.server);
      const allowed = await runtime.request("/study-plans/search?q=common");
      assert.equal(allowed.status, 200);
      await allowed.arrayBuffer();
    }
    const absent = await login("member", { membership: false });
    servers.push(absent.server);
    const noMembership = await absent.request("/study-plans/search?q=common");
    assert.equal(noMembership.status, 403);
    assert.doesNotMatch(await noMembership.text(), /F053 common plan/);
    const inactive = await login("member", { membershipActive: false });
    servers.push(inactive.server);
    const inactiveMembership = await inactive.request(
      "/study-plans/search?q=common",
    );
    assert.equal(inactiveMembership.status, 403);
    assert.doesNotMatch(await inactiveMembership.text(), /F053 common plan/);
    await fixture.admin.query(
      "UPDATE workspaces SET active=false WHERE id=$1",
      [A.id],
    );
    const inactiveWorkspace = await manager.request(
      "/study-plans/search?q=common",
    );
    assert.equal(inactiveWorkspace.status, 403);
    assert.doesNotMatch(await inactiveWorkspace.text(), /F053 common plan/);
    await fixture.admin.query("UPDATE workspaces SET active=true WHERE id=$1", [
      A.id,
    ]);
  } finally {
    spy?.mock.restore();
    for (const server of servers) await server.app.close();
  }
});
