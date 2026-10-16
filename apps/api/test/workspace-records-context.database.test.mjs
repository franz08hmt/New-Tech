import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import {
  WorkspaceRecordsService,
  ROW_LIMIT,
  EXPENSE_LIMIT,
} from "../dist/assistant/workspace-records.service.js";
import { WorkspaceAssistantService } from "../dist/assistant/workspace-assistant.service.js";
import { AnswerReceiptService } from "../dist/assistant/answer-receipt.service.js";
import { AuthService } from "../dist/auth/auth.service.js";
import { AUTH_CONFIG, AUTH_ADAPTER } from "../dist/auth/auth-config.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { configureApp } from "../dist/common/http.js";
import {
  openAcademicFixture,
  spaces,
  principal,
  users,
  fixtureId,
  clock,
  fixtureInstant,
} from "./academic-context-fixture.mjs";
import {
  readRecords,
  workspaceQuestions,
} from "./workspace-records-context-cases.mjs";
import { json } from "./helpers.mjs";
const gold = JSON.parse(
  readFileSync(
    new URL("./fixtures/workspace-records-context-gold.json", import.meta.url),
    "utf8",
  ),
);
const [A, B, I] = spaces;
let f, records, assistant;
before(async () => {
  f = await openAcademicFixture({ metadata: true });
  records = new WorkspaceRecordsService(f.db);
  assistant = new WorkspaceAssistantService(records);
  assistant.now = () => new Date(fixtureInstant);
});
after(async () => {
  await f?.close();
});
const denied = (p) => assert.rejects(p, (e) => e.code === "42501");
test("records documents metadata grants are exact; runtime cannot read storage_key/text/chunks or write/index", async () => {
  const grants = (
    await f.admin.query(
      "SELECT column_name FROM information_schema.column_privileges WHERE grantee=$1 AND table_name='documents' AND privilege_type='SELECT' ORDER BY column_name",
      [f.role],
    )
  ).rows.map((r) => r.column_name);
  assert.deepEqual(grants, [
    "course_id",
    "id",
    "name",
    "processing_status",
    "storage_status",
    "workspace_id",
  ]);
  const ownership = (
    await f.db.query(
      "SELECT current_user=session_user AS direct,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(ownership, {
    direct: true,
    rolsuper: false,
    rolbypassrls: false,
  });
  assert.deepEqual(
    (
      await f.db.query(
        "SELECT relrowsecurity,pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid='documents'::regclass",
      )
    ).rows[0],
    { relrowsecurity: true, owned: false },
  );
  for (const sql of [
    "SELECT storage_key FROM documents",
    "SELECT * FROM documents",
    "SELECT content FROM document_chunks",
    "UPDATE documents SET processing_status='ready'",
    "INSERT INTO documents DEFAULT VALUES",
    "DELETE FROM documents",
    "SELECT * FROM assistant_answer_receipts",
    "SELECT * FROM assistant_feedback",
  ])
    await denied(f.db.query(sql));
});
test("records SQL direct without WHERE isolates each table including document metadata", async () => {
  for (const w of [A, B])
    for (const table of [
      "courses",
      "tasks",
      "exams",
      "study_plans",
      "expenses",
      "documents",
    ])
      await f.db.workspaceTransaction(principal(w, "viewer"), async (tx) => {
        const actual = (await tx.query(`SELECT id FROM ${table} ORDER BY id`))
            .rows,
          expected = (
            await f.admin.query(
              `SELECT id FROM ${table} WHERE workspace_id=$1 ORDER BY id`,
              [w.id],
            )
          ).rows;
        assert.deepEqual(actual, expected);
        assert.ok(actual.length);
      });
});
test("records service positive non-owner retains fixed one-workspace IDs/order/date/money/count/truncated gold captured before implementation", async () => {
  assert.equal(gold.synthetic, true);
  assert.equal(gold.sourceRevision, "7176246");
  assert.equal(gold.clock, fixtureInstant);
  const result = await readRecords(records, principal(A, "viewer"), A.course);
  assert.deepEqual(result, gold.rows);
  assert.deepEqual(
    result.tasksOpen.rows.map((r) => r.id),
    [A.task, A.nullTask],
  );
  assert.equal(result.exams.upcoming.rows[0].exam_time, "00:30");
  assert.equal(result.exams.latestPast.exam_time, "00:15");
  assert.equal(result.unassigned, 1);
  assert.equal(
    result.expenses.reduce((s, r) => s + r.amount, 0),
    200000,
  );
  assert.ok(result.documents.rows.some((r) => r.course_id === null));
  assert.ok(!result.documents.rows.some((r) => r.id === A.deletingDocument));
  assert.doesNotMatch(
    JSON.stringify(result),
    /storage_key|fixture-private|SYNTHETIC_EXTRACTED_TEXT/,
  );
});
for (const [intent, message, scoped] of workspaceQuestions)
  test(`records intent ${intent} keeps independent pre-change answer/source gold; B cannot crowd A`, async () => {
    const answer = await assistant.chat(
      { mode: "workspace", message, ...(scoped ? { courseId: A.course } : {}) },
      principal(A, "viewer"),
    );
    assert.deepEqual(answer, gold.answers[intent]);
    assert.ok(!JSON.stringify(answer).includes("B bulk"));
  });
test("records every method denies absent/inactive context and foreign course; no rows/counts/metadata escape", async () => {
  for (const p of [
    principal(A, "viewer", "absent"),
    principal(A, "viewer", "inactive"),
    principal(I, "viewer"),
  ]) {
    const all = await readRecords(
      records,
      p,
      p.workspaceId === I.id ? I.course : A.course,
    );
    assert.deepEqual(all.courses, []);
    assert.equal(all.unassigned, 0);
    assert.deepEqual(all.expenses, []);
    for (const k of [
      "tasksOpen",
      "tasksDone",
      "tasksOverdue",
      "plansOpen",
      "plansDone",
      "plansOverdue",
      "documents",
    ])
      assert.deepEqual(all[k], { rows: [], truncated: false });
    assert.deepEqual(all.exams, {
      upcoming: { rows: [], truncated: false },
      latestPast: null,
    });
  }
  const p = principal(A, "viewer");
  assert.deepEqual(await records.exams(B.course, clock, p), {
    upcoming: { rows: [], truncated: false },
    latestPast: null,
  });
  assert.deepEqual(await records.studyPlans(B.course, { state: "open" }, p), {
    rows: [],
    truncated: false,
  });
  assert.deepEqual(await records.courseExpenses(B.course, p), []);
  await f.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
    );
    for (const table of [
      "courses",
      "tasks",
      "exams",
      "study_plans",
      "expenses",
      "documents",
    ])
      assert.equal((await tx.query(`SELECT id FROM ${table}`)).rowCount, 0);
  });
});
test("records upcoming and latestPast use same real backend transaction and context", async (t) => {
  const original = f.db.workspaceTransaction.bind(f.db),
    observed = [];
  t.mock.method(f.db, "workspaceTransaction", (p, work) =>
    original(p, (tx) =>
      work({
        query: async (sql, values) => {
          const state = (
            await tx.query(
              "SELECT pg_backend_pid() AS pid,txid_current()::text AS xid,current_setting('examate.workspace_id') AS wid",
            )
          ).rows[0];
          observed.push(state);
          return tx.query(sql, values);
        },
      }),
    ),
  );
  const result = await records.exams(null, clock, principal(A));
  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], observed[1]);
  assert.equal(observed[0].wid, A.id);
  assert.equal(result.latestPast.id, A.pastExam);
  // Same client/transaction is NOT a claim of an immutable READ COMMITTED snapshot.
});

const L = { id: fixtureId(4), course: fixtureId(104) };
async function limitWorkspace() {
  await f.admin.query(
    "INSERT INTO workspaces(id) VALUES($1) ON CONFLICT DO NOTHING",
    [L.id],
  );
  await f.admin.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'viewer') ON CONFLICT DO NOTHING",
    [L.id, users.viewer],
  );
  await f.admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'limit-course','Limit course','LIMIT 101','Synthetic limit fixture','slate','/img/fixture.webp','Fixture cover') ON CONFLICT DO NOTHING",
    [L.course, L.id],
  );
}
async function addRows(table, start, count, offset) {
  const ids = Array.from({ length: count }, (_, i) =>
    fixtureId(offset + start + i),
  );
  const time =
    "'2026-01-01'::timestamptz+right(id::text,12)::bigint*INTERVAL '1 second'";
  const clauses = {
    tasks: `(id,workspace_id,title,status,due_date,created_at) SELECT id,$2,'Limit task '||id,'todo','2026-09-28',${time}`,
    exams: `(id,workspace_id,course_id,topic,exam_date,exam_time,room) SELECT id,$2,$3,'Limit exam '||id,'2028-01-01','09:00','Fixture room'`,
    study_plans: `(id,workspace_id,course_id,title,due_date,created_at) SELECT id,$2,$3,'Limit plan '||id,'2026-09-28',${time}`,
    documents:
      "(id,workspace_id,name,media_type,storage_key,size_bytes) SELECT id,$2,'Limit document '||id||'.pdf','application/pdf','fixture-limits/'||id,10",
    expenses:
      "(id,workspace_id,course_id,amount,description,spent_on,category) SELECT id,$2,$3,1,'Limit expense '||id,'2026-09-28','other'",
  };
  const query = `INSERT INTO ${table} ${clauses[table]} FROM unnest($1::uuid[]) AS v(id)`;
  await f.admin.query(
    query,
    table === "tasks" || table === "documents"
      ? [ids, L.id]
      : [ids, L.id, L.course],
  );
}
for (const [table, read] of [
  ["tasks", (p) => records.tasks({ state: "open" }, p)],
  ["exams", async (p) => (await records.exams(L.course, clock, p)).upcoming],
  ["study_plans", (p) => records.studyPlans(L.course, { state: "open" }, p)],
  ["documents", (p) => records.documents(p)],
])
  test(`records ${table} ROW_LIMIT-1/exact/+1 preserve bound/truncated semantics`, async () => {
    await limitWorkspace();
    const offset = {
      tasks: 10000,
      exams: 20000,
      study_plans: 30000,
      documents: 40000,
    }[table];
    await addRows(table, 1, 199, offset);
    for (const n of [199, 200, 201]) {
      if (n > 199) await addRows(table, n, 1, offset);
      const result = await read(principal(L, "viewer"));
      assert.equal(result.rows.length, Math.min(n, ROW_LIMIT));
      assert.equal(result.truncated, n > ROW_LIMIT);
    }
  });
test("records expenses 999/1000/1001 keep original conservative total refusal and exact course cap", async () => {
  await limitWorkspace();
  await addRows("expenses", 1, 999, 50000);
  for (const n of [999, 1000, 1001]) {
    if (n > 999) await addRows("expenses", n, 1, 50000);
    const rows = await records.courseExpenses(L.course, principal(L, "viewer"));
    assert.equal(rows.length, Math.min(n, EXPENSE_LIMIT));
    const answer = await assistant.chat(
      {
        mode: "workspace",
        message: "Tổng chi là bao nhiêu?",
        courseId: L.course,
      },
      principal(L, "viewer"),
    );
    assert.equal(answer.answerable, n < EXPENSE_LIMIT);
    if (n >= EXPENSE_LIMIT)
      assert.equal(answer.reasonCode, "WORKSPACE_UNSUPPORTED");
  }
});
test("records courses retain plain array LIMIT (no invented truncated field)", async () => {
  await limitWorkspace();
  await f.admin.query(
    "INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt) SELECT $1,'limit-extra-'||n,'Limit extra '||n,'LM'||lpad(n::text,4,'0'),'Synthetic limit fixture','slate','/img/fixture.webp','Fixture cover' FROM generate_series(1,198) n",
    [L.id],
  );
  assert.equal((await records.courses(principal(L, "viewer"))).length, 199);
  for (const n of [199, 200]) {
    await f.admin.query(
      "INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,'Synthetic limit fixture','slate','/img/fixture.webp','Fixture cover')",
      [
        L.id,
        `limit-extra-${n}`,
        `Limit extra ${n}`,
        `LM${String(n).padStart(4, "0")}`,
      ],
    );
    const result = await records.courses(principal(L, "viewer"));
    assert.equal(result.length, 200);
    assert.equal("truncated" in result, false);
  }
});

test("HTTP workspace dispatch uses real non-owner records, zero provider/embedding/OCR/Storage; receipt boundary explicitly mocked", async () => {
  const calls = {
    generation: 0,
    embedding: 0,
    ocr: 0,
    storage: 0,
    receipts: 0,
  };
  const forbidden = (key) => async () => {
    calls[key]++;
    throw Error("Unexpected external dependency dispatch");
  };
  const facade = {
    query: (...args) => f.db.query(...args),
    transaction: (...args) => f.db.transaction(...args),
    workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(facade)
    .overrideProvider(AuthService)
    .useValue({ authenticate: async () => principal(A, "viewer") })
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => {
      throw Error("No real Auth config");
    })
    .overrideProvider(AUTH_ADAPTER)
    .useValue({})
    .overrideProvider(AnswerReceiptService)
    .useValue({
      verifyHistory: async (input) => assert.equal(input.history, undefined),
      issue: async (_input, _answer, p) => {
        assert.equal(p.workspaceId, A.id);
        assert.equal(p.userId, users.viewer);
        return fixtureId(80000 + ++calls.receipts);
      },
    })
    .overrideProvider(GeminiService)
    .useValue({
      generate: forbidden("generation"),
      model: "synthetic-not-called",
    })
    .overrideProvider(GeminiEmbeddingService)
    .useValue({
      embedQuery: forbidden("embedding"),
      embedDocuments: forbidden("embedding"),
    })
    .overrideProvider(DocumentOcrService)
    .useValue({ recover: forbidden("ocr") })
    .overrideProvider(StorageService)
    .useValue({
      upload: forbidden("storage"),
      remove: forbidden("storage"),
      signedDownload: forbidden("storage"),
      downloadBuffer: forbidden("storage"),
    })
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  module.get(WorkspaceAssistantService).now = () => new Date(fixtureInstant);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try {
    for (const [intent, message, scoped] of workspaceQuestions) {
      const response = await fetch(
        `${base}/api/assistant/chat`,
        json("POST", {
          mode: "workspace",
          message,
          ...(scoped ? { courseId: A.course } : {}),
        }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), gold.answers[intent]);
      assert.ok(response.headers.has("x-assistant-answer-id"));
    }
    assert.deepEqual(calls, {
      generation: 0,
      embedding: 0,
      ocr: 0,
      storage: 0,
      receipts: 11,
    });
    assert.equal(
      (
        await f.admin.query(
          "SELECT count(*)::int AS n FROM assistant_answer_receipts WHERE workspace_id=$1",
          [A.id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await app.close();
  }
});
