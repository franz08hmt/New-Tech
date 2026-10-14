import "reflect-metadata";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { ExamsService } from "../dist/exams/exams.service.js";
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";
import { ExpensesService } from "../dist/expenses/expenses.service.js";
import { WorkspaceRecordsService } from "../dist/assistant/workspace-records.service.js";
import { WorkspaceAssistantService } from "../dist/assistant/workspace-assistant.service.js";
import { migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

// Guard before opening any pool. Never load environment files or use a cloud DB.
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
const databaseName = `examate_b2_academic_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const url = assertTestDatabaseTarget(target.href);
const userId = randomUUID();
const workspaces = ["A", "B"].map((tag) => ({
  tag,
  id: randomUUID(),
  course: randomUUID(),
  secondCourse: randomUUID(),
  task: randomUUID(),
  doneTask: randomUUID(),
  futureTask: randomUUID(),
  exam: randomUUID(),
  pastExam: randomUUID(),
  plan: randomUUID(),
  donePlan: randomUUID(),
  futurePlan: randomUUID(),
  expense: randomUUID(),
  secondExpense: randomUUID(),
  unassigned: randomUUID(),
  document: randomUUID(),
  unassignedDocument: randomUUID(),
}));
const principal = (workspace, role = "member") => ({
  userId,
  workspaceId: workspace.id,
  role,
});
const now = { date: "2026-09-29", time: "00:30" };
let parent,
  admin,
  database,
  records,
  assistant,
  created = false;
const domains = [];

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
  process.env.PILOT_WORKSPACE_ID = workspaces[0].id;
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
  await admin.query("INSERT INTO workspaces(id) VALUES($1)", [
    workspaces[1].id,
  ]);
  process.env.DATABASE_URL = url;
  database = new DatabaseService();
  // Owner SQL deliberately bypasses server-table RLS: only application tenant
  // predicates can satisfy these tests. No tenant policy is installed here.
  const ownership = (
    await database.query(
      "SELECT c.relname,pg_get_userbyid(c.relowner)=current_user AS owned FROM pg_class c WHERE c.oid=ANY(ARRAY['public.courses'::regclass,'public.tasks'::regclass,'public.exams'::regclass,'public.study_plans'::regclass,'public.expenses'::regclass,'public.documents'::regclass]) ORDER BY c.relname",
    )
  ).rows;
  assert.equal(ownership.length, 6);
  assert.ok(ownership.every((row) => row.owned));
  records = new WorkspaceRecordsService(database);
  assistant = new WorkspaceAssistantService(records);
  assistant.now = () => new Date("2026-09-28T17:30:00.000Z");
  domains.push(
    {
      table: "exams",
      code: "EXAM_NOT_FOUND",
      service: new ExamsService(database),
      key: "exam",
      create: (w) => ({
        courseId: w.course,
        topic: "Created fixture exam",
        examDate: "2028-02-29",
        examTime: "09:15",
        room: "Fixture room",
        revisionNote: "Fixture revision",
      }),
      update: (service, id, p) =>
        service.update(
          id,
          {
            topic: "Updated fixture exam",
            examDate: "2028-03-01",
            examTime: "10:45",
            room: "Updated room",
            revisionNote: "Updated revision",
          },
          p,
        ),
    },
    {
      table: "study_plans",
      code: "STUDY_PLAN_NOT_FOUND",
      service: new StudyPlansService(database),
      key: "plan",
      create: (w) => ({
        courseId: w.course,
        title: "Created fixture plan",
        detail: "Fixture plan detail",
        dueDate: "2028-02-29",
        ownerName: "Fixture owner",
      }),
      update: (service, id, p) => service.setCompletion(id, true, p),
    },
    {
      table: "expenses",
      code: "EXPENSE_NOT_FOUND",
      service: new ExpensesService(database),
      key: "expense",
      create: (w) => ({
        courseId: w.course,
        amount: 123456,
        description: "Created fixture expense",
        spentOn: "2028-02-29",
        category: "books",
      }),
    },
  );
});

beforeEach(async () => {
  // These tables exist only in this suite's freshly created exact database.
  for (const table of [
    "document_chunks",
    "documents",
    "exams",
    "study_plans",
    "expenses",
    "tasks",
    "courses",
  ])
    await admin.query(`DELETE FROM ${table}`);
  for (const w of workspaces) {
    await admin.query(
      `INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,'Fixture detail','slate','/img/fixture.webp','Fixture cover'),($6,$2,$7,$8,$9,'Second fixture detail','slate','/img/fixture.webp','Fixture cover')`,
      [
        w.course,
        w.id,
        `fixture-${w.tag.toLowerCase()}-algebra`,
        `Fixture algebra ${w.tag}`,
        `FX${w.tag} 101`,
        w.secondCourse,
        `fixture-${w.tag.toLowerCase()}-biology`,
        `Fixture biology ${w.tag}`,
        `FX${w.tag} 102`,
      ],
    );
    await admin.query(
      `INSERT INTO tasks(id,workspace_id,title,status,due_date) VALUES($1,$2,$3,'todo','2026-09-28'),($4,$2,$5,'done','2026-09-01'),($6,$2,$7,'in_progress','2026-10-02')`,
      [
        w.task,
        w.id,
        `WS_${w.tag} overdue task`,
        w.doneTask,
        `WS_${w.tag} done task`,
        w.futureTask,
        `WS_${w.tag} future task`,
      ],
    );
    await admin.query(
      `INSERT INTO exams(id,workspace_id,course_id,topic,exam_date,exam_time,room) VALUES($1,$2,$3,$4,'2026-09-30','09:00','Fixture room'),($5,$2,$3,$6,'2026-09-29',$7::time,'Fixture past room')`,
      [
        w.exam,
        w.id,
        w.course,
        `WS_${w.tag} upcoming exam`,
        w.pastExam,
        `WS_${w.tag} past exam`,
        w.tag === "A" ? "00:15" : "00:25",
      ],
    );
    await admin.query(
      `INSERT INTO study_plans(id,workspace_id,course_id,title,due_date,completed_at) VALUES($1,$2,$3,$4,'2026-09-28',NULL),($5,$2,$3,$6,'2026-09-01','2026-09-29T00:00:00Z'),($7,$2,$8,$9,'2026-10-02',NULL)`,
      [
        w.plan,
        w.id,
        w.course,
        `WS_${w.tag} overdue plan`,
        w.donePlan,
        `WS_${w.tag} completed plan`,
        w.futurePlan,
        w.secondCourse,
        `WS_${w.tag} future plan`,
      ],
    );
    await admin.query(
      `INSERT INTO expenses(id,workspace_id,course_id,amount,description,spent_on,category) VALUES($1,$2,$3,125000,$4,'2026-09-12','books'),($5,$2,$6,99000,$7,'2026-09-13','books'),($8,$2,NULL,50000,$9,'2026-09-14','transport')`,
      [
        w.expense,
        w.id,
        w.course,
        `WS_${w.tag} algebra expense`,
        w.secondExpense,
        w.secondCourse,
        `WS_${w.tag} biology expense`,
        w.unassigned,
        `WS_${w.tag} unassigned expense`,
      ],
    );
    await admin.query(
      `INSERT INTO documents(id,workspace_id,course_id,name,media_type,storage_key,size_bytes) VALUES($1,$2,$3,$4,'application/pdf',$5,9),($6,$2,NULL,$7,'application/pdf',$8,9)`,
      [
        w.document,
        w.id,
        w.course,
        `scope-${w.tag.toLowerCase()}-handout.pdf`,
        `fixture-private-storage/${w.document}.pdf`,
        w.unassignedDocument,
        `scope-${w.tag.toLowerCase()}-unassigned.pdf`,
        `fixture-private-storage/${w.unassignedDocument}.pdf`,
      ],
    );
    await admin.query(
      "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,0,'EXTRACTED_FIXTURE_TEXT_MUST_NOT_APPEAR',1)",
      [w.document],
    );
  }
});

after(async () => {
  try {
    await database?.onModuleDestroy();
    await admin?.end();
    if (created) {
      assertTestDatabaseTarget(url, { runtimeUrl: saved.DATABASE_URL ?? "" });
      await assertOwnedDatabase(parent, databaseName);
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
    assert.equal(
      typeof error.getStatus,
      "function",
      "expected a safe HTTP exception",
    );
    assert.equal(error.getStatus(), status);
    body = error.getResponse();
    assert.equal(body.code, code);
    assert.doesNotMatch(
      JSON.stringify(body),
      /SELECT|UPDATE|INSERT|DELETE|workspace_id|WS_[AB]|stack|postgres:|fixture-private-storage/,
    );
    for (const w of workspaces)
      assert.equal(JSON.stringify(body).includes(w.id), false);
    return true;
  });
  return body;
}
const ids = (rows) => new Set(rows.map(({ id }) => id));
const storedRows = async (table) =>
  (await admin.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
async function expectOwnRows(table, rows, workspace) {
  const expected = (
    await admin.query(`SELECT id FROM ${table} WHERE workspace_id=$1`, [
      workspace.id,
    ])
  ).rows;
  assert.deepEqual(ids(rows), ids(expected));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => !("workspace_id" in row)));
}

for (const role of ["viewer", "member", "manager"]) {
  for (const table of ["exams", "study_plans", "expenses"]) {
    test(`real SQL ${role} ${table} list includes only the principal workspace`, async () => {
      const domain = domains.find((item) => item.table === table);
      for (const w of workspaces)
        await expectOwnRows(
          table,
          await domain.service.list(principal(w, role)),
          w,
        );
    });
  }
}

for (const role of ["member", "manager"]) {
  for (const table of ["exams", "study_plans", "expenses"]) {
    test(`real SQL ${role} ${table} create and supported update preserve server workspace identity`, async () => {
      const d = domains.find((item) => item.table === table);
      for (const [w, foreign] of [
        [workspaces[0], workspaces[1]],
        [workspaces[1], workspaces[0]],
      ]) {
        const p = principal(w, role);
        const value = await d.service.create(
          {
            ...d.create(w),
            workspaceId: foreign.id,
            workspace_id: foreign.id,
            role: "viewer",
            userId: randomUUID(),
          },
          p,
        );
        assert.equal("workspace_id" in value, false);
        assert.equal(value.course_id, w.course);
        assert.equal(
          (
            await admin.query(`SELECT workspace_id FROM ${table} WHERE id=$1`, [
              value.id,
            ])
          ).rows[0].workspace_id,
          w.id,
        );
        if (table === "exams") {
          assert.equal(value.exam_date, "2028-02-29");
          assert.equal(value.exam_time, "09:15");
        }
        if (table === "study_plans") assert.equal(value.due_date, "2028-02-29");
        if (table === "expenses") {
          assert.equal(value.spent_on, "2028-02-29");
          assert.equal(value.amount, 123456);
        }
        const beforeForeign = (
          await admin.query(
            `SELECT * FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
            [foreign.id],
          )
        ).rows;
        if (d.update) {
          const updated = await d.update(d.service, value.id, p);
          assert.equal(updated.id, value.id);
          assert.equal("workspace_id" in updated, false);
          if (table === "exams") {
            assert.equal(updated.topic, "Updated fixture exam");
            assert.equal(updated.exam_date, "2028-03-01");
            assert.equal(updated.exam_time, "10:45");
          }
          if (table === "study_plans") {
            assert.ok(updated.completed_at);
            assert.equal(
              (await d.service.setCompletion(value.id, false, p)).completed_at,
              null,
            );
          }
        }
        assert.deepEqual(
          (
            await admin.query(
              `SELECT * FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
              [foreign.id],
            )
          ).rows,
          beforeForeign,
        );
        assert.ok((await d.service.list(p)).some((row) => row.id === value.id));
        assert.equal(
          (await d.service.list(principal(foreign))).some(
            (row) => row.id === value.id,
          ),
          false,
        );
      }
    });
  }
}

for (const table of ["exams", "study_plans", "expenses"]) {
  test(`real SQL ${table} cross-workspace and missing course creates return the same safe 400`, async () => {
    const d = domains.find((item) => item.table === table);
    const beforeRows = await storedRows(table);
    for (const [w, foreign] of [
      [workspaces[0], workspaces[1]],
      [workspaces[1], workspaces[0]],
    ]) {
      const outside = await safeError(
        d.service.create(
          { ...d.create(w), courseId: foreign.course },
          principal(w),
        ),
        400,
        "COURSE_NOT_FOUND",
      );
      const missing = await safeError(
        d.service.create(
          { ...d.create(w), courseId: randomUUID() },
          principal(w),
        ),
        400,
        "COURSE_NOT_FOUND",
      );
      assert.deepEqual(outside, missing);
    }
    assert.deepEqual(await storedRows(table), beforeRows);
  });

  test(`real SQL manager ${table} delete removes only the own row`, async () => {
    const d = domains.find((item) => item.table === table);
    for (const [w, foreign] of [
      [workspaces[0], workspaces[1]],
      [workspaces[1], workspaces[0]],
    ]) {
      const beforeForeign = (
        await admin.query(
          `SELECT * FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
          [foreign.id],
        )
      ).rows;
      await d.service.remove(w[d.key], principal(w, "manager"));
      assert.equal(
        (await admin.query(`SELECT id FROM ${table} WHERE id=$1`, [w[d.key]]))
          .rowCount,
        0,
      );
      assert.deepEqual(
        (
          await admin.query(
            `SELECT * FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
            [foreign.id],
          )
        ).rows,
        beforeForeign,
      );
    }
  });

  test(`real SQL foreign ${table} mutations equal missing 404 and preserve every row`, async () => {
    const d = domains.find((item) => item.table === table);
    const beforeRows = await storedRows(table);
    for (const [w, foreign] of [
      [workspaces[0], workspaces[1]],
      [workspaces[1], workspaces[0]],
    ]) {
      const p = principal(w, "manager");
      const operations = [
        (id) => d.service.remove(id, p),
        ...(d.update ? [(id) => d.update(d.service, id, p)] : []),
      ];
      for (const operation of operations) {
        const outside = await safeError(operation(foreign[d.key]), 404, d.code);
        const missing = await safeError(operation(randomUUID()), 404, d.code);
        assert.deepEqual(outside, missing);
      }
    }
    assert.deepEqual(await storedRows(table), beforeRows);
  });

  test(`real SQL ${table} forbidden writes reject before SQL for own, foreign and missing IDs`, async (t) => {
    const d = domains.find((item) => item.table === table);
    const beforeRows = await storedRows(table);
    const query = t.mock.method(database, "query"); // Calls through if reached.
    const viewer = principal(workspaces[0], "viewer");
    const forbidden = await safeError(
      d.service.create({ ...d.create(workspaces[0]), role: "manager" }, viewer),
      403,
      "ROLE_FORBIDDEN",
    );
    // Create/update and manager-only deletion may explain different permissions.
    // Compare the same operation across own/foreign/missing IDs, not its copy.
    const deleteForbidden = await safeError(
      d.service.remove(workspaces[0][d.key], viewer),
      403,
      "ROLE_FORBIDDEN",
    );
    for (const id of [
      workspaces[0][d.key],
      workspaces[1][d.key],
      randomUUID(),
    ]) {
      if (d.update)
        assert.deepEqual(
          await safeError(
            d.update(d.service, id, viewer),
            403,
            "ROLE_FORBIDDEN",
          ),
          forbidden,
        );
      for (const role of ["viewer", "member"])
        assert.deepEqual(
          await safeError(
            d.service.remove(id, principal(workspaces[0], role)),
            403,
            "ROLE_FORBIDDEN",
          ),
          deleteForbidden,
        );
    }
    assert.equal(query.mock.callCount(), 0);
    assert.deepEqual(await storedRows(table), beforeRows);
  });

  test(`real SQL ${table} missing or malformed principal fails closed before SQL`, async (t) => {
    const d = domains.find((item) => item.table === table);
    const query = t.mock.method(database, "query");
    for (const p of [
      undefined,
      { userId, role: "member" },
      { ...principal(workspaces[0]), workspaceId: "not-a-uuid" },
      principal(workspaces[0], "admin"),
    ]) {
      for (const operation of [
        () => d.service.list(p),
        () => d.service.create(d.create(workspaces[0]), p),
        () => d.service.remove(workspaces[0][d.key], p),
        ...(d.update
          ? [() => d.update(d.service, workspaces[0][d.key], p)]
          : []),
      ])
        await safeError(operation(), 401, "AUTH_REQUIRED");
    }
    assert.equal(query.mock.callCount(), 0);
  });
}

test("real SQL member expense create permits a null course without taking input workspace identity", async () => {
  const service = domains.find((item) => item.table === "expenses").service;
  for (const w of workspaces) {
    const row = await service.create(
      {
        amount: 55000,
        description: "Unassigned fixture expense",
        spentOn: "2028-02-29",
        category: "other",
        workspaceId: randomUUID(),
      },
      principal(w),
    );
    assert.equal(row.course_id, null);
    assert.equal(row.course_name, null);
    assert.equal(
      (
        await admin.query("SELECT workspace_id FROM expenses WHERE id=$1", [
          row.id,
        ])
      ).rows[0].workspace_id,
      w.id,
    );
  }
});

for (const w of workspaces) {
  test(`real records workspace ${w.tag} reads scope all filters, joins, metadata and unassigned count`, async () => {
    const p = principal(w, "viewer");
    assert.deepEqual(
      ids(await records.courses(p)),
      new Set([w.course, w.secondCourse]),
    );
    assert.deepEqual(
      ids((await records.tasks({ state: "open" }, p)).rows),
      new Set([w.task, w.futureTask]),
    );
    assert.deepEqual(
      ids((await records.tasks({ state: "done" }, p)).rows),
      new Set([w.doneTask]),
    );
    assert.deepEqual(
      ids(
        (await records.tasks({ state: "open", dueBefore: now.date }, p)).rows,
      ),
      new Set([w.task]),
    );
    const exams = await records.exams(null, now, p);
    assert.deepEqual(ids(exams.upcoming.rows), new Set([w.exam]));
    assert.equal(exams.upcoming.truncated, false);
    assert.equal(exams.latestPast.id, w.pastExam);
    assert.deepEqual(
      ids((await records.studyPlans(null, { state: "open" }, p)).rows),
      new Set([w.plan, w.futurePlan]),
    );
    assert.deepEqual(
      ids((await records.studyPlans(null, { state: "completed" }, p)).rows),
      new Set([w.donePlan]),
    );
    assert.deepEqual(
      ids(
        (
          await records.studyPlans(
            null,
            { state: "open", dueBefore: now.date },
            p,
          )
        ).rows,
      ),
      new Set([w.plan]),
    );
    assert.deepEqual(
      ids((await records.studyPlans(w.course, { state: "open" }, p)).rows),
      new Set([w.plan]),
    );
    assert.deepEqual(
      ids(await records.courseExpenses(w.course, p)),
      new Set([w.expense]),
    );
    assert.equal(await records.unassignedExpenseCount(p), 1);
    const documents = await records.documents(p);
    assert.deepEqual(
      ids(documents.rows),
      new Set([w.document, w.unassignedDocument]),
    );
    assert.equal(documents.truncated, false);
    assert.doesNotMatch(
      JSON.stringify(documents),
      /storage_key|source_uri|fixture-private-storage|EXTRACTED_FIXTURE_TEXT/,
    );
  });

  test(`real records workspace ${w.tag} course argument cannot expose another workspace`, async () => {
    const foreign = workspaces.find((item) => item !== w);
    const p = principal(w);
    const exams = await records.exams(foreign.course, now, p);
    assert.deepEqual(exams, {
      upcoming: { rows: [], truncated: false },
      latestPast: null,
    });
    for (const filter of [{ state: "open" }, { state: "completed" }])
      assert.deepEqual(await records.studyPlans(foreign.course, filter, p), {
        rows: [],
        truncated: false,
      });
    assert.deepEqual(await records.courseExpenses(foreign.course, p), []);
  });
}

test("real records missing or malformed principal rejects every read before SQL", async (t) => {
  const query = t.mock.method(database, "query");
  for (const p of [
    undefined,
    { userId, role: "member" },
    { ...principal(workspaces[0]), workspaceId: "invalid" },
    principal(workspaces[0], "admin"),
  ]) {
    for (const operation of [
      () => records.courses(p),
      () => records.tasks({ state: "open" }, p),
      () => records.exams(null, now, p),
      () => records.studyPlans(null, { state: "open" }, p),
      () => records.courseExpenses(workspaces[0].course, p),
      () => records.unassignedExpenseCount(p),
      () => records.documents(p),
    ])
      await safeError(operation(), 401, "AUTH_REQUIRED");
  }
  assert.equal(query.mock.callCount(), 0);
});

const questions = [
  ["tasks_open", "Task nào chưa xong?", "task", "task"],
  ["tasks_done", "Task nào đã xong?", "doneTask", "task"],
  ["tasks_overdue", "Task nào quá hạn?", "task", "task"],
  ["exams_upcoming", "Kỳ thi nào sắp tới?", "exam", "exam"],
  [
    "study_plans_open",
    "Việc cần ôn nào chưa hoàn thành?",
    "plan",
    "study_plan",
  ],
  [
    "study_plans_done",
    "Việc cần ôn nào đã hoàn thành?",
    "donePlan",
    "study_plan",
  ],
  ["study_plans_overdue", "Việc cần ôn nào quá hạn?", "plan", "study_plan"],
  ["expenses_total", "Tổng chi là bao nhiêu?", "expense", "expense", true],
  ["courses_list", "Workspace có những môn học nào?", "course", "course"],
  [
    "document_course",
    (w) => `Tài liệu scope-${w.tag.toLowerCase()}-handout.pdf thuộc môn nào?`,
    "document",
    "document",
  ],
  ["course_documents", "Có tài liệu nào?", "document", "document", true],
];

async function assertOwnSources(answer, w) {
  const sourceTables = {
    course: "courses",
    task: "tasks",
    exam: "exams",
    study_plan: "study_plans",
    expense: "expenses",
    document: "documents",
  };
  for (const source of answer.workspaceSources) {
    assert.ok(sourceTables[source.kind], "known workspace source kind");
    const row = (
      await admin.query(
        `SELECT workspace_id FROM ${sourceTables[source.kind]} WHERE id=$1`,
        [source.id],
      )
    ).rows[0];
    assert.equal(
      row?.workspace_id,
      w.id,
      "every cited source belongs to the principal workspace",
    );
  }
  const foreign = workspaces.find((item) => item !== w);
  assert.equal(JSON.stringify(answer).includes(`WS_${foreign.tag}`), false);
  assert.equal(
    JSON.stringify(answer).includes(`scope-${foreign.tag.toLowerCase()}-`),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(answer),
    /storage_key|source_uri|fixture-private-storage|EXTRACTED_FIXTURE_TEXT/,
  );
  assert.equal(answer.asOf, now.date);
  assert.deepEqual(answer.citations, []);
}

// Added after implementation: concurrency regression, not a RED-first claim.
test("real assistant singleton keeps simultaneous workspace principals separate", async () => {
  for (let round = 0; round < 4; round++) {
    const cases = workspaces.flatMap((w) => [
      { w, intent: "tasks_open", message: "Task nào chưa xong?" },
      { w, intent: "exams_upcoming", message: "Kỳ thi nào sắp tới?" },
      {
        w,
        intent: "expenses_total",
        message: "Tổng chi là bao nhiêu?",
        courseId: w.course,
      },
    ]);
    const answers = await Promise.all(
      cases.map(({ w, message, courseId }) =>
        assistant.chat(
          { mode: "workspace", message, ...(courseId ? { courseId } : {}) },
          principal(w, "viewer"),
        ),
      ),
    );
    for (let i = 0; i < cases.length; i++) {
      const { w, intent } = cases[i];
      const answer = answers[i];
      assert.equal(answer.workspaceIntent, intent);
      assert.equal(answer.answerable, true);
      await assertOwnSources(answer, w);
      if (intent === "expenses_total")
        assert.deepEqual(ids(answer.workspaceSources), new Set([w.expense]));
      if (intent === "tasks_open")
        assert.deepEqual(
          ids(answer.workspaceSources),
          new Set([w.task, w.futureTask]),
        );
      if (intent === "exams_upcoming")
        assert.deepEqual(
          ids(answer.workspaceSources),
          new Set([w.exam, w.pastExam]),
        );
    }
  }
});

for (const w of workspaces) {
  for (const [intent, question, key, kind, page] of questions) {
    test(`real assistant workspace ${w.tag} ${intent} cites only its own SQL records`, async () => {
      const answer = await assistant.chat(
        {
          mode: "workspace",
          message: typeof question === "function" ? question(w) : question,
          ...(page ? { courseId: w.course } : {}),
        },
        principal(w, "viewer"),
      );
      assert.equal(answer.answerable, true);
      assert.equal(answer.workspaceIntent, intent);
      assert.ok(
        answer.workspaceSources.some(
          (source) => source.kind === kind && source.id === w[key],
        ),
      );
      await assertOwnSources(answer, w);
      if (intent === "exams_upcoming")
        assert.ok(
          answer.workspaceSources.some((source) => source.id === w.pastExam),
        );
      if (intent === "expenses_total") {
        assert.match(answer.answer, /125[.,]000/);
        assert.match(answer.answer, /Có 1 khoản chi chưa gắn môn/);
      }
    });
  }

  test(`real assistant workspace ${w.tag} supplied foreign course ID exposes no records`, async () => {
    const foreign = workspaces.find((item) => item !== w);
    for (const message of [
      "Kỳ thi sắp tới?",
      "Việc cần ôn nào?",
      "Tổng chi là bao nhiêu?",
      "Có tài liệu nào?",
    ]) {
      const answer = await assistant.chat(
        { mode: "workspace", message, courseId: foreign.course },
        principal(w),
      );
      await assertOwnSources(answer, w);
      if (
        message === "Tổng chi là bao nhiêu?" ||
        message === "Có tài liệu nào?"
      ) {
        assert.equal(answer.answerable, false);
        assert.equal(answer.workspaceIntent, "course_required");
      }
    }
    for (const message of [
      `Kỳ thi của môn Fixture algebra ${foreign.tag}?`,
      `Tổng chi của môn Fixture algebra ${foreign.tag}?`,
    ]) {
      const answer = await assistant.chat(
        { mode: "workspace", message },
        principal(w),
      );
      await assertOwnSources(answer, w);
      assert.equal(answer.answerable, false);
      assert.equal(answer.workspaceIntent, "course_not_found");
    }
  });
}

test("real assistant missing or malformed principal rejects supported and unsupported questions before SQL", async (t) => {
  const query = t.mock.method(database, "query");
  for (const p of [
    undefined,
    { userId, role: "member" },
    { ...principal(workspaces[0]), workspaceId: "invalid" },
    principal(workspaces[0], "admin"),
  ]) {
    for (const message of [
      "Task nào chưa xong?",
      "Tổng chi cho môn đang mở?",
      "Thời tiết hôm nay thế nào?",
      "Xóa task",
      "Ghi chú nhanh có gì?",
    ])
      await safeError(
        assistant.chat({ mode: "workspace", message }, p),
        401,
        "AUTH_REQUIRED",
      );
  }
  assert.equal(query.mock.callCount(), 0);
});

async function bulkMatchingRows(w, count) {
  await admin.query(
    "INSERT INTO tasks(workspace_id,title,status,due_date) SELECT $1,'WS_'||$2||' bulk overdue task '||n,'todo','2026-01-01' FROM generate_series(1,$3::int) n",
    [w.id, w.tag, count],
  );
  await admin.query(
    "INSERT INTO study_plans(workspace_id,course_id,title,due_date) SELECT $1,$2,'WS_'||$3||' bulk overdue plan '||n,'2026-01-01' FROM generate_series(1,$4::int) n",
    [w.id, w.course, w.tag, count],
  );
  await admin.query(
    "INSERT INTO exams(workspace_id,course_id,topic,exam_date,exam_time,room) SELECT $1,$2,'WS_'||$3||' bulk upcoming exam '||n,'2026-09-29','00:40','Bulk fixture room' FROM generate_series(1,$4::int) n",
    [w.id, w.course, w.tag, count],
  );
  await admin.query(
    "INSERT INTO documents(workspace_id,course_id,name,media_type,storage_key,size_bytes) SELECT $1,$2,'000-WS_'||$3||'-bulk-'||n||'.pdf','application/pdf','fixture-private-storage/bulk-'||n,9 FROM generate_series(1,$4::int) n",
    [w.id, w.course, w.tag, count],
  );
}

test("real SQL foreign rows cannot crowd authorized rows or set false truncation before LIMIT plus one", async () => {
  const own = workspaces[0],
    foreign = workspaces[1],
    p = principal(own);
  await bulkMatchingRows(foreign, 205);
  const groups = [
    [await records.tasks({ state: "open" }, p), [own.task, own.futureTask]],
    [
      await records.tasks({ state: "open", dueBefore: now.date }, p),
      [own.task],
    ],
    [
      await records.studyPlans(null, { state: "open" }, p),
      [own.plan, own.futurePlan],
    ],
    [
      await records.studyPlans(null, { state: "open", dueBefore: now.date }, p),
      [own.plan],
    ],
    [(await records.exams(null, now, p)).upcoming, [own.exam]],
    [await records.documents(p), [own.document, own.unassignedDocument]],
  ];
  for (const [found, expected] of groups) {
    assert.deepEqual(ids(found.rows), new Set(expected));
    assert.equal(found.truncated, false);
  }
  for (const [intent, message] of [
    ["tasks_open", "Task nào chưa xong?"],
    ["tasks_overdue", "Task nào quá hạn?"],
    ["study_plans_open", "Việc cần ôn nào chưa hoàn thành?"],
    ["study_plans_overdue", "Việc cần ôn nào quá hạn?"],
    ["exams_upcoming", "Kỳ thi nào sắp tới?"],
    ["course_documents", "Có tài liệu nào?"],
  ]) {
    const answer = await assistant.chat(
      { mode: "workspace", message, courseId: own.course },
      p,
    );
    assert.equal(answer.workspaceIntent, intent);
    assert.equal(answer.answerable, true);
    assert.doesNotMatch(answer.answer, /ít nhất|chỉ đọc tối đa/);
    await assertOwnSources(answer, own);
  }
});

test("real SQL more than 200 own matching rows reports authorized truncation and bounded assistant sources", async () => {
  const own = workspaces[0],
    p = principal(own);
  await bulkMatchingRows(own, 205);
  for (const found of [
    await records.tasks({ state: "open" }, p),
    await records.studyPlans(null, { state: "open" }, p),
    (await records.exams(null, now, p)).upcoming,
    await records.documents(p),
  ]) {
    assert.equal(found.rows.length, 200);
    assert.equal(found.truncated, true);
  }
  for (const [intent, message] of [
    ["tasks_open", "Task nào chưa xong?"],
    ["study_plans_open", "Việc cần ôn nào chưa hoàn thành?"],
    ["exams_upcoming", "Kỳ thi nào sắp tới?"],
    ["course_documents", "Có tài liệu nào?"],
  ]) {
    const answer = await assistant.chat(
      {
        mode: "workspace",
        message,
        ...(intent === "course_documents" ? { courseId: own.course } : {}),
      },
      p,
    );
    assert.equal(answer.workspaceIntent, intent);
    assert.match(answer.answer, /ít nhất 200/);
    assert.ok(
      answer.workspaceSources.length <= (intent === "exams_upcoming" ? 11 : 10),
    );
    await assertOwnSources(answer, own);
  }
});

test("real SQL assistant expense total and unassigned count exclude many foreign linked and null-course rows", async () => {
  const own = workspaces[0],
    foreign = workspaces[1],
    p = principal(own);
  await admin.query(
    "INSERT INTO expenses(workspace_id,course_id,amount,description,spent_on,category) SELECT $1,CASE WHEN n%2=0 THEN $2::uuid ELSE NULL END,1900000000,'WS_B foreign large expense '||n,'2026-09-29','other' FROM generate_series(1,205) n",
    [foreign.id, foreign.course],
  );
  assert.equal(await records.unassignedExpenseCount(p), 1);
  assert.deepEqual(
    ids(await records.courseExpenses(own.course, p)),
    new Set([own.expense]),
  );
  const answer = await assistant.chat(
    {
      mode: "workspace",
      message: "Tổng chi là bao nhiêu?",
      courseId: own.course,
    },
    p,
  );
  assert.equal(answer.workspaceIntent, "expenses_total");
  assert.match(answer.answer, /125[.,]000/);
  assert.match(answer.answer, /Có 1 khoản chi chưa gắn môn/);
  await assertOwnSources(answer, own);
});
