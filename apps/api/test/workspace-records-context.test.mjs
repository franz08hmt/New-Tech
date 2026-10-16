import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceRecordsService } from "../dist/assistant/workspace-records.service.js";
const p = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "viewer",
};
const course = "33333333-3333-4333-8333-333333333333",
  now = { date: "2026-09-29", time: "00:30" };
const methods = {
  courses: (s, p) => s.courses(p),
  tasks: (s, p) => s.tasks({ state: "open" }, p),
  exams: (s, p) => s.exams(course, now, p),
  studyPlans: (s, p) => s.studyPlans(course, { state: "open" }, p),
  courseExpenses: (s, p) => s.courseExpenses(course, p),
  unassignedExpenseCount: (s, p) => s.unassignedExpenseCount(p),
  documents: (s, p) => s.documents(p),
};
function fixture(failSecond = false) {
  const calls = [],
    events = [];
  let active = false;
  const db = {
    query: () => assert.fail("records query bypassed context callback"),
    workspaceTransaction: async (principal, work) => {
      assert.equal(principal, p);
      assert.equal(active, false, "no nested transactions");
      active = true;
      events.push("begin");
      const tx = {
        query: async (sql, values) => {
          assert.equal(active, true);
          calls.push({ sql, values, tx });
          if (failSecond && calls.length === 2)
            throw Error("synthetic second SELECT failure");
          return { rows: [] };
        },
      };
      try {
        const result = await work(tx);
        events.push("commit");
        return result;
      } catch (e) {
        events.push("rollback");
        throw e;
      } finally {
        active = false;
      }
    },
  };
  return { db, calls, events };
}
for (const [name, invoke] of Object.entries(methods))
  test(`records.${name} uses one workspace transaction and only its tx client`, async () => {
    const f = fixture();
    await invoke(new WorkspaceRecordsService(f.db), p);
    assert.deepEqual(f.events, ["begin", "commit"]);
    assert.equal(f.calls.length, name === "exams" ? 2 : 1);
    assert.ok(
      f.calls.every(
        (q) =>
          q.values.includes(p.workspaceId) &&
          /^SELECT\s/.test(q.sql) &&
          q.tx === f.calls[0].tx,
      ),
    );
    if (name === "exams") {
      assert.match(f.calls[0].sql, /LIMIT 201/);
      assert.match(
        f.calls[1].sql,
        /ORDER BY e.exam_date DESC, e.exam_time DESC\s+LIMIT 1/,
      );
    }
  });
test("records exams second SELECT failure exits one callback via rollback, no fallback query", async () => {
  const f = fixture(true);
  await assert.rejects(
    new WorkspaceRecordsService(f.db).exams(course, now, p),
    /synthetic second SELECT failure/,
  );
  assert.deepEqual(f.events, ["begin", "rollback"]);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].tx, f.calls[1].tx);
});
test("all records methods fail closed for missing or malformed principals before transaction", async () => {
  const f = fixture(),
    s = new WorkspaceRecordsService(f.db);
  for (const principal of [
    undefined,
    {},
    { ...p, userId: "bad" },
    { ...p, role: "owner" },
  ])
    for (const invoke of Object.values(methods))
      await assert.rejects(
        invoke(s, principal),
        (e) =>
          e.getStatus?.() === 401 && e.getResponse().code === "AUTH_REQUIRED",
      );
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.calls, []);
});
