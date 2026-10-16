import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExamsService } from "../dist/exams/exams.service.js";
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";
import { ExpensesService } from "../dist/expenses/expenses.service.js";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager",
};
const id = "33333333-3333-4333-8333-333333333333";
const exam = {
  courseId: id,
  topic: "Synthetic exam",
  examDate: "2028-02-29",
  examTime: "09:15",
  room: "Fixture room",
};
const plan = {
  courseId: id,
  title: "Synthetic revision",
  dueDate: "2028-02-29",
};
const expense = {
  courseId: id,
  amount: 125000,
  description: "Synthetic expense",
  spentOn: "2028-02-29",
  category: "books",
};
const domains = [
  {
    name: "exams",
    Service: ExamsService,
    input: exam,
    update: (s, p) => s.update(id, exam, p),
  },
  {
    name: "plans",
    Service: StudyPlansService,
    input: plan,
    update: (s, p) => s.setCompletion(id, true, p),
  },
  { name: "expenses", Service: ExpensesService, input: expense },
];
function fixture(error) {
  const events = [];
  const db = {
    query: () => assert.fail("business query bypassed workspaceTransaction"),
    workspaceTransaction: async (p, work) => {
      events.push({ kind: "begin", principal: p });
      try {
        const result = await work({
          query: async (sql, values) => {
            events.push({ kind: "query", sql, values });
            if (error) throw error;
            return { rows: [{ id }], rowCount: 1 };
          },
        });
        events.push({ kind: "commit" });
        return result;
      } catch (e) {
        events.push({ kind: "rollback" });
        throw e;
      }
    },
  };
  return { db, events };
}
for (const d of domains) {
  const methods = {
    list: (s, p) => s.list(p),
    create: (s, p) => s.create(d.input, p),
    remove: (s, p) => s.remove(id, p),
    ...(d.update ? { update: d.update } : {}),
  };
  for (const [name, invoke] of Object.entries(methods))
    test(`${d.name}.${name} uses one workspace callback and tx.query with unchanged bound workspace`, async () => {
      const f = fixture();
      await invoke(new d.Service(f.db), principal);
      assert.equal(f.events.length, 3);
      assert.equal(f.events[0].principal, principal);
      assert.equal(f.events[1].kind, "query");
      assert.ok(f.events[1].values.includes(principal.workspaceId));
      assert.equal(f.events[2].kind, "commit");
    });
  test(`${d.name} rejects invalid principals before business boundary`, async () => {
    const f = fixture(),
      s = new d.Service(f.db);
    for (const p of [
      undefined,
      {},
      { ...principal, workspaceId: "invalid" },
      { ...principal, role: "admin" },
    ])
      for (const invoke of Object.values(methods))
        await assert.rejects(
          invoke(s, p),
          (e) =>
            e.getStatus?.() === 401 && e.getResponse().code === "AUTH_REQUIRED",
        );
    assert.deepEqual(f.events, []);
  });
  test(`${d.name} viewer writes and member delete stop before transaction`, async () => {
    const f = fixture(),
      s = new d.Service(f.db),
      viewer = { ...principal, role: "viewer" };
    for (const invoke of [
      () => s.create(d.input, viewer),
      () => s.remove(id, viewer),
      () => s.remove(id, { ...principal, role: "member" }),
      ...(d.update ? [() => d.update(s, viewer)] : []),
    ])
      await assert.rejects(
        invoke(),
        (e) =>
          e.getStatus() === 403 && e.getResponse().code === "ROLE_FORBIDDEN",
      );
    assert.deepEqual(f.events, []);
  });
  test(`${d.name} maps FK error only after transaction rollback`, async () => {
    const error = Object.assign(Error("synthetic FK detail"), {
        code: "23503",
      }),
      f = fixture(error);
    await assert.rejects(
      new d.Service(f.db).create(d.input, principal),
      (e) => {
        assert.equal(f.events.at(-1).kind, "rollback");
        return (
          e.getStatus?.() === 400 && e.getResponse().code === "COURSE_NOT_FOUND"
        );
      },
    );
    assert.equal(f.events.filter((e) => e.kind === "query").length, 1);
  });
  test(`${d.name} preserves permission error 42501 after rollback without mapping or retry`, async () => {
    const error = Object.assign(Error("synthetic grant failure"), {
        code: "42501",
      }),
      f = fixture(error);
    await assert.rejects(
      new d.Service(f.db).create(d.input, principal),
      (e) => e === error,
    );
    assert.equal(f.events.at(-1).kind, "rollback");
    assert.equal(f.events.filter((e) => e.kind === "query").length, 1);
  });
}
