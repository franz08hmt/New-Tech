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
import { ExamsService } from "../dist/exams/exams.service.js";

const [A, B] = tenants;
let fixture;
const examIds = [];
const foreignExamId = randomUUID();
const secondCourseId = randomUUID();

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await fixture.admin.query(`GRANT SELECT ON exams TO "${fixture.role}"`);
  await fixture.admin.query(
    `CREATE POLICY f053_exams_read ON exams FOR SELECT TO "${fixture.role}" USING (
      workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
      AND EXISTS (
        SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
        WHERE m.workspace_id=exams.workspace_id
          AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid
          AND m.active AND w.active
      )
    )`,
  );
  await fixture.admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'f053-alt-course','Applied Maths','MA 2','Synthetic alternate course','slate','/img/f.webp','Fixture')",
    [secondCourseId, A.id],
  );
  for (let n = 0; n < 24; n++) {
    const id = randomUUID();
    examIds.push(id);
    const day = String(n + 1).padStart(2, "0");
    await fixture.admin.query(
      "INSERT INTO exams(id,course_id,topic,exam_date,exam_time,room,revision_note,workspace_id) VALUES($1,$2,$3,$4::date,$5::time,$6,$7,$8)",
      [
        id,
        n % 2 ? secondCourseId : A.course,
        `F053 common exam ${String(n).padStart(2, "0")}`,
        `2027-01-${day}`,
        `${String(n % 24).padStart(2, "0")}:30`,
        `Room ${n % 4}`,
        null,
        A.id,
      ],
    );
  }
  await fixture.admin.query(
    "INSERT INTO exams(id,course_id,topic,exam_date,exam_time,room,workspace_id) VALUES($1,$2,'Lập trình & lịch thi','2027-02-28','09:15','Phòng Đ-2',$3),($4,$5,'F053 common exam 00','2027-01-01','08:00','Foreign room',$6)",
    [randomUUID(), A.course, A.id, foreignExamId, B.course, B.id],
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
    workspaceTransactions: 0,
    query(...args) {
      this.queries++;
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
      email: "exams-search@example.test",
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

test("Exams search pages tenant rows with date and course filters", async (t) => {
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
  const service = manager.server.app.get(ExamsService);
  const originalSearch = service.search;
  const spy = originalSearch
    ? t.mock.method(service, "search", (...args) =>
        originalSearch.apply(service, args),
      )
    : null;
  try {
    const response = await manager.request(
      "/exams/search?q=common&page=1&pageSize=10",
    );
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.equal(first.total, 24);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 10);
    assert.ok(first.items.every((exam) => examIds.includes(exam.id)));
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "course_code",
      "course_id",
      "course_name",
      "course_slug",
      "created_at",
      "exam_date",
      "exam_time",
      "id",
      "revision_note",
      "room",
      "topic",
      "updated_at",
    ]);
    const second = await (
      await manager.request("/exams/search?q=common&page=2&pageSize=10")
    ).json();
    assert.equal(second.items.length, 10);
    const byDate = await (
      await manager.request(
        "/exams/search?q=common&sort=exam_date&direction=desc&pageSize=50",
      )
    ).json();
    assert.equal(byDate.items[0].exam_date, "2027-01-24");
    assert.deepEqual(
      byDate.items.map((exam) => exam.id),
      (
        await (
          await manager.request(
            "/exams/search?q=common&sort=exam_date&direction=desc&pageSize=50",
          )
        ).json()
      ).items.map((exam) => exam.id),
    );
    const byCourse = await (
      await manager.request("/exams/search?q=common&sort=course&pageSize=50")
    ).json();
    assert.equal(byCourse.items[0].course_name, "Applied Maths");
    const filtered = await (
      await manager.request(
        `/exams/search?courseId=${secondCourseId}&fromDate=2027-01-05&toDate=2027-01-16`,
      )
    ).json();
    assert.equal(filtered.total, 6);
    assert.ok(
      filtered.items.every((exam) => exam.course_id === secondCourseId),
    );
    assert.ok(
      filtered.items.every(
        (exam) =>
          exam.exam_date >= "2027-01-05" && exam.exam_date <= "2027-01-16",
      ),
    );
    const vietnamese = await (
      await manager.request("/exams/search?q=lich%20thi")
    ).json();
    assert.equal(vietnamese.total, 1);
    assert.equal(vietnamese.items[0].exam_date, "2027-02-28");
    const blank = await (
      await manager.request("/exams/search?q=%20%20&pageSize=50")
    ).json();
    assert.equal(blank.total, 25);
    const beyond = await (
      await manager.request("/exams/search?q=common&page=4&pageSize=10")
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
    const foreign = await manager.request(`/exams/${foreignExamId}`);
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(await foreign.text(), /Foreign room|F053 common/);
    const focused = await manager.request(`/exams/${examIds[23]}`);
    assert.equal(focused.status, 200);
    assert.equal((await focused.json()).id, examIds[23]);
    const beforeInvalid = spy?.mock.callCount() ?? 0;
    for (const path of [
      "/exams/search?q=common&q=other",
      "/exams/search?q%5B%5D=common",
      "/exams/search?sort=topic%3Bdrop",
      "/exams/search?fromDate=2027-02-30",
      "/exams/search?courseId=not-a-uuid",
      "/exams/search?page=0",
    ]) {
      const invalid = await manager.request(path);
      assert.equal(invalid.status, 400, path);
    }
    if (spy) assert.equal(spy.mock.callCount(), beforeInvalid);
    const beforeReversedRange = manager.databaseCalls.workspaceTransactions;
    const reversedRange = await manager.request(
      "/exams/search?fromDate=2027-01-20&toDate=2027-01-10",
    );
    assert.equal(reversedRange.status, 400);
    assert.equal(
      manager.databaseCalls.workspaceTransactions,
      beforeReversedRange,
    );
    const beforeUnsupported = manager.databaseCalls.workspaceTransactions;
    const unsupported = await manager.request(
      "/exams/search?q=%E4%BD%A0%E5%A5%BD",
    );
    assert.equal(unsupported.status, 400);
    assert.match(await unsupported.text(), /SEARCH_QUERY_UNSUPPORTED/);
    assert.equal(
      manager.databaseCalls.workspaceTransactions,
      beforeUnsupported,
    );
    const unknownCourse = await manager.request(
      `/exams/search?courseId=${B.course}`,
    );
    assert.equal(unknownCourse.status, 200);
    assert.equal((await unknownCourse.json()).total, 0);
    const legacy = await (await manager.request("/exams")).json();
    assert.ok(Array.isArray(legacy));
    for (const role of ["member", "viewer"]) {
      const reader = await login(role);
      try {
        const result = await reader.request(
          "/exams/search?q=common&pageSize=50",
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
        (await absent.request("/exams/search?q=common")).status,
        403,
      );
    } finally {
      await absent.server.app.close();
    }
  } finally {
    await manager.server.app.close();
  }
});
