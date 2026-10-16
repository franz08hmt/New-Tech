import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { ExamsService } from "../dist/exams/exams.service.js";
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";
import { ExpensesService } from "../dist/expenses/expenses.service.js";
import {
  openAcademicFixture,
  spaces,
  principal,
  users,
  fixtureId,
} from "./academic-context-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";
let f;
const [A, B, I] = spaces;
const domains = [
  {
    table: "exams",
    Service: ExamsService,
    path: "/exams",
    key: "exam",
    code: "EXAM_NOT_FOUND",
    create: (w) => ({
      courseId: w.course,
      topic: "Created synthetic exam",
      examDate: "2028-02-29",
      examTime: "09:15",
      room: "Fixture room",
    }),
    update: (s, id, p) =>
      s.update(
        id,
        {
          topic: "Updated synthetic exam",
          examDate: "2028-03-01",
          examTime: "10:45",
          room: "New room",
        },
        p,
      ),
    patch: "",
    payload: {
      topic: "Updated HTTP exam",
      examDate: "2028-03-01",
      examTime: "10:45",
      room: "New room",
    },
    insert:
      "(course_id,topic,exam_date,exam_time,room,workspace_id) VALUES($1,'Raw fixture exam','2028-02-29','09:15','Room',$2)",
    change: "topic='Raw updated exam'",
  },
  {
    table: "study_plans",
    Service: StudyPlansService,
    path: "/study-plans",
    key: "plan",
    code: "STUDY_PLAN_NOT_FOUND",
    create: (w) => ({
      courseId: w.course,
      title: "Created synthetic plan",
      dueDate: "2028-02-29",
    }),
    update: (s, id, p) => s.setCompletion(id, true, p),
    patch: "/completion",
    payload: { completed: true },
    insert: "(course_id,title,workspace_id) VALUES($1,'Raw fixture plan',$2)",
    change: "completed_at=NOW()",
  },
  {
    table: "expenses",
    Service: ExpensesService,
    path: "/expenses",
    key: "expense",
    code: "EXPENSE_NOT_FOUND",
    create: (w) => ({
      courseId: w.course,
      amount: 2000000000,
      description: "Created synthetic expense",
      spentOn: "2028-02-29",
      category: "books",
    }),
    insert:
      "(course_id,amount,description,spent_on,category,workspace_id) VALUES($1,125000,'Raw fixture expense','2028-02-29','books',$2)",
  },
];
before(async () => {
  f = await openAcademicFixture();
});
after(async () => {
  await f?.close();
});
const denied = (p) => assert.rejects(p, (e) => e.code === "42501");
async function safeError(p, status, code) {
  let body;
  await assert.rejects(p, (e) => {
    assert.equal(e.getStatus?.(), status);
    body = e.getResponse();
    assert.equal(body.code, code);
    assert.doesNotMatch(
      JSON.stringify(body),
      /SELECT|INSERT|UPDATE|DELETE|workspace_id|constraint|fixture-private|stack/,
    );
    return true;
  });
  return body;
}
test("academic catalog: direct LOGIN non-owner NOBYPASSRLS, exact grants and denied elevated privileges", async () => {
  const role = (
    await f.db.query(
      "SELECT current_user=session_user AS direct,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(role, {
    direct: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: false,
  });
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
        [f.role],
      )
    ).rows[0].n,
    0,
  );
  for (const d of domains) {
    const row = (
      await f.db.query(
        "SELECT relrowsecurity,pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=$1::regclass",
        [d.table],
      )
    ).rows[0];
    assert.deepEqual(row, { relrowsecurity: true, owned: false });
    const policies = (
      await f.admin.query(
        "SELECT cmd,qual,with_check FROM pg_policies WHERE tablename=$1 AND policyname LIKE 'ac_%' ORDER BY cmd",
        [d.table],
      )
    ).rows;
    assert.equal(policies.length, 4);
    assert.match(policies.find((p) => p.cmd === "DELETE").qual, /manager/);
    assert.match(
      policies.find((p) => p.cmd === "UPDATE").with_check,
      /workspace_id/,
    );
    await denied(f.db.query(`TRUNCATE ${d.table}`));
    await denied(f.db.query(`UPDATE ${d.table} SET workspace_id=$1`, [B.id]));
  }
  for (const sql of [
    "SELECT * FROM auth.users",
    "UPDATE workspace_memberships SET active=false",
    "DELETE FROM schema_migrations",
    "SELECT storage_key FROM documents",
    "SELECT content FROM document_chunks",
    "CREATE TABLE public.forbidden_context(id int)",
    "CREATE TEMP TABLE forbidden_context(id int)",
    "SET ROLE examate_test",
  ])
    await denied(f.db.query(sql));
});
for (const d of domains) {
  test(`SQL ${d.table} without WHERE isolates A/B read and context resets on reused backend`, async () => {
    let pid;
    for (const w of [A, B])
      await f.db.workspaceTransaction(principal(w), async (tx) => {
        const current = (await tx.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid;
        if (pid) assert.equal(current, pid);
        pid = current;
        const actual = (await tx.query(`SELECT id FROM ${d.table} ORDER BY id`))
            .rows,
          expected = (
            await f.admin.query(
              `SELECT id FROM ${d.table} WHERE workspace_id=$1 ORDER BY id`,
              [w.id],
            )
          ).rows;
        assert.deepEqual(actual, expected);
        assert.ok(actual.length);
      });
    const raw = (
      await f.db.query(
        "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.workspace_id',true),'') AS wid",
      )
    ).rows[0];
    assert.equal(raw.pid, pid);
    assert.equal(raw.wid, null);
    assert.equal((await f.db.query(`SELECT id FROM ${d.table}`)).rowCount, 0);
  });
  test(`SQL ${d.table} missing/empty/inactive/nonmember context denies reads and writes`, async () => {
    for (const p of [
      null,
      principal(A, "member", "absent"),
      principal(A, "member", "inactive"),
      principal(I),
    ]) {
      const work = async (tx) => {
        if (!p)
          await tx.query(
            "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
          );
        assert.equal((await tx.query(`SELECT id FROM ${d.table}`)).rowCount, 0);
        assert.equal((await tx.query(`DELETE FROM ${d.table}`)).rowCount, 0);
      };
      if (p) await f.db.workspaceTransaction(p, work);
      else await f.db.transaction(work);
      const insert = (tx) =>
        tx.query(`INSERT INTO ${d.table} ${d.insert}`, [
          p?.workspaceId === I.id ? I.course : A.course,
          p?.workspaceId ?? A.id,
        ]);
      await denied(
        p ? f.db.workspaceTransaction(p, insert) : f.db.transaction(insert),
      );
    }
  });
  test(`SQL ${d.table} member-delete and viewer-delete denied despite claimed manager; rows unchanged`, async () => {
    const before = await f.rows(d.table);
    for (const user of ["member", "viewer"]) {
      const result = await f.db.workspaceTransaction(
        principal(A, "manager", user),
        (tx) => tx.query(`DELETE FROM ${d.table} WHERE id=$1`, [A[d.key]]),
      );
      assert.equal(
        result.rowCount,
        0,
        "DB membership must prevent deletion even with forged principal role",
      );
    }
    assert.deepEqual(await f.rows(d.table), before);
  });
  test(`SQL ${d.table} cross-workspace insert/update/delete and viewer write preserve all rows`, async () => {
    const before = await f.rows(d.table);
    await denied(
      f.db.workspaceTransaction(principal(A), (tx) =>
        tx.query(`INSERT INTO ${d.table} ${d.insert}`, [B.course, B.id]),
      ),
    );
    await denied(
      f.db.workspaceTransaction(principal(A, "manager", "viewer"), (tx) =>
        tx.query(`INSERT INTO ${d.table} ${d.insert}`, [A.course, A.id]),
      ),
    );
    for (const p of [
      principal(A, "manager"),
      principal(A, "manager", "viewer"),
    ]) {
      const result = await f.db.workspaceTransaction(p, (tx) =>
        tx.query(`DELETE FROM ${d.table} WHERE id=$1`, [
          p.userId === users.viewer ? A[d.key] : B[d.key],
        ]),
      );
      assert.equal(result.rowCount, 0);
      if (d.change) {
        const changed = await f.db.workspaceTransaction(p, (tx) =>
          tx.query(`UPDATE ${d.table} SET ${d.change} WHERE id=$1`, [
            p.userId === users.viewer ? A[d.key] : B[d.key],
          ]),
        );
        assert.equal(changed.rowCount, 0);
      }
    }
    assert.deepEqual(await f.rows(d.table), before);
  });
  for (const role of ["member", "manager"])
    test(`service ${d.table} ${role} positive non-owner CRUD, stable dates/money, foreign course rollback`, async () => {
      const s = new d.Service(f.db),
        p = principal(A, role);
      assert.ok((await s.list(p)).some((row) => row.id === A[d.key]));
      const before = await f.rows(d.table);
      await safeError(
        s.create({ ...d.create(A), courseId: B.course }, p),
        400,
        "COURSE_NOT_FOUND",
      );
      assert.deepEqual(await f.rows(d.table), before);
      const created = await s.create(d.create(A), p);
      assert.ok(created?.id);
      assert.equal(created.course_id, A.course);
      assert.equal("workspace_id" in created, false);
      if (d.table === "exams") {
        assert.equal(created.exam_date, "2028-02-29");
        assert.equal(created.exam_time, "09:15");
      }
      if (d.table === "study_plans")
        assert.equal(created.due_date, "2028-02-29");
      if (d.table === "expenses") {
        assert.equal(created.amount, 2000000000);
        assert.equal(created.spent_on, "2028-02-29");
      }
      if (d.update) {
        const updated = await d.update(s, created.id, p);
        if (d.table === "exams") {
          assert.equal(updated.exam_date, "2028-03-01");
          assert.equal(updated.exam_time, "10:45");
        } else {
          assert.ok(updated.completed_at);
          assert.equal(
            (await s.setCompletion(created.id, false, p)).completed_at,
            null,
          );
        }
      }
      if (role === "member")
        await safeError(s.remove(created.id, p), 403, "ROLE_FORBIDDEN");
      await s.remove(created.id, principal(A, "manager"));
      assert.equal(
        (
          await f.admin.query(`SELECT id FROM ${d.table} WHERE id=$1`, [
            created.id,
          ])
        ).rowCount,
        0,
      );
      const outside = await safeError(
          s.remove(B[d.key], principal(A, "manager")),
          404,
          d.code,
        ),
        missing = await safeError(
          s.remove(fixtureId(999999), principal(A, "manager")),
          404,
          d.code,
        );
      assert.deepEqual(outside, missing);
      if (d.update) await safeError(d.update(s, B[d.key], p), 404, d.code);
    });
}
test("academic callback rollback restores writes and clears user/workspace on same pool client", async () => {
  const before = await f.rows("exams");
  let pid;
  await assert.rejects(
    f.db.workspaceTransaction(principal(A), async (tx) => {
      pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await tx.query("UPDATE exams SET topic='Must rollback' WHERE id=$1", [
        A.exam,
      ]);
      await tx.query(`INSERT INTO exams ${domains[0].insert}`, [
        A.course,
        A.id,
      ]);
      throw Error("synthetic transaction rollback");
    }),
    /synthetic transaction rollback/,
  );
  assert.deepEqual(await f.rows("exams"), before);
  const raw = (
    await f.db.query(
      "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.user_id',true),'') AS uid,NULLIF(current_setting('examate.workspace_id',true),'') AS wid",
    )
  ).rows[0];
  assert.deepEqual(raw, { pid, uid: null, wid: null });
});
test("expense NULL course keeps LEFT JOIN projection and numeric dong", async () => {
  const s = new ExpensesService(f.db),
    row = await s.create(
      { ...domains[2].create(A), courseId: null },
      principal(A),
    );
  assert.equal(row.course_id, null);
  assert.equal(row.course_name, null);
  assert.equal(typeof row.amount, "number");
  assert.ok((await s.list(principal(A))).some((r) => r.id === row.id));
  await s.remove(row.id, principal(A, "manager"));
});

for (const role of ["manager", "member", "viewer"])
  test(`HTTP academic ${role}: real SQL/RLS and AuthService, synthetic upstream/session store`, async (t) => {
    const auth = authFixture();
    auth.config.workspaceId = A.id;
    await f.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
    await f.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [A.id, auth.userId, role],
    );
    // Pre-principal bootstrap SELECT uses the non-owner fixture grant. These
    // permissive bootstrap policies are not a production Auth design.
    auth.store.membership = async (w, u) =>
      (
        await f.db.query(
          "SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.active AND w.active",
          [w, u],
        )
      ).rows[0]?.role;
    const facade = {
      query: (...args) => f.db.query(...args),
      transaction: (...args) => f.db.transaction(...args),
      workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
    };
    const server = await httpApp(
      facade,
      fakeDependencies().storage,
      undefined,
      undefined,
      undefined,
      auth,
    );
    try {
      const bootstrap = await server.request("/auth/session"),
        csrf = (await bootstrap.json()).csrfToken;
      const login = await server.request("/auth/login", {
        ...json("POST", {
          email: "academic-context@example.test",
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
      assert.equal(session.principal.role, role);
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
      const boundary = t.mock.method(f.db, "workspaceTransaction");
      for (const d of domains) {
        const before = await f.rows(d.table);
        for (const [path, init] of [
          [d.path, {}],
          [d.path, json("POST", d.create(A))],
          [`${d.path}/${A[d.key]}`, { method: "DELETE" }],
          ...(d.update
            ? [[`${d.path}/${A[d.key]}${d.patch}`, json("PATCH", d.payload)]]
            : []),
        ])
          assert.equal((await server.request(path, init)).status, 401);
        const read = await request(d.path);
        assert.equal(read.status, 200);
        assert.ok(!(await read.json()).some((row) => row.id === B[d.key]));
        const count = boundary.mock.callCount();
        const badCsrf = await request(d.path, {
          ...json("POST", d.create(A)),
          headers: { "Content-Type": "application/json", "X-CSRF-Token": "" },
        });
        assert.equal(badCsrf.status, 403);
        assert.equal(boundary.mock.callCount(), count);
        const invalid = {
          ...d.create(A),
          ...(d.table === "exams"
            ? { examDate: "2028-02-30", examTime: "25:00" }
            : d.table === "study_plans"
              ? { dueDate: "bad" }
              : { amount: 12.5 }),
        };
        assert.equal(
          (await request(d.path, json("POST", invalid))).status,
          400,
        );
        const foreign = await request(
          d.path,
          json("POST", { ...d.create(A), courseId: B.course }),
        );
        assert.equal(foreign.status, role === "viewer" ? 403 : 400);
        const error = await foreign.json();
        assert.equal(
          error.code,
          role === "viewer" ? "ROLE_FORBIDDEN" : "COURSE_NOT_FOUND",
        );
        assert.doesNotMatch(
          JSON.stringify(error),
          /constraint|workspace_id|SELECT|INSERT|stack|Fixture course B/,
        );
        const created = await request(d.path, json("POST", d.create(A)));
        assert.equal(created.status, role === "viewer" ? 403 : 201);
        if (role !== "viewer") {
          const row = await created.json();
          if (d.update)
            assert.equal(
              (
                await request(
                  `${d.path}/${row.id}${d.patch}`,
                  json("PATCH", d.payload),
                )
              ).status,
              200,
            );
          const removed = await request(`${d.path}/${row.id}`, {
            method: "DELETE",
          });
          assert.equal(removed.status, role === "manager" ? 204 : 403);
          if (role === "member")
            await new d.Service(f.db).remove(row.id, principal(A, "manager"));
        }
        const foreignDelete = await request(`${d.path}/${B[d.key]}`, {
          method: "DELETE",
        });
        assert.equal(foreignDelete.status, role === "manager" ? 404 : 403);
        if (d.update) {
          const foreignUpdate = await request(
            `${d.path}/${B[d.key]}${d.patch}`,
            json("PATCH", d.payload),
          );
          assert.equal(foreignUpdate.status, role === "viewer" ? 403 : 404);
        }
        assert.deepEqual(await f.rows(d.table), before);
      }
      await f.admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [A.id, auth.userId],
      );
      const count = boundary.mock.callCount();
      for (const d of domains)
        for (const [path, init] of [
          [d.path, {}],
          [d.path, json("POST", d.create(A))],
          [`${d.path}/${A[d.key]}`, { method: "DELETE" }],
          ...(d.update
            ? [[`${d.path}/${A[d.key]}${d.patch}`, json("PATCH", d.payload)]]
            : []),
        ])
          assert.equal((await request(path, init)).status, 403);
      assert.equal(boundary.mock.callCount(), count);
    } finally {
      await server.app.close();
    }
  });
