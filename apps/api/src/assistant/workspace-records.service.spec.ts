import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import {
  ROW_LIMIT,
  WorkspaceRecordsService,
} from "./workspace-records.service.js";

const COURSE = "11111111-1111-4111-8111-111111111111";
const NOW = { date: "2026-09-29", time: "00:30" };
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function recording(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows }));
  const records = new WorkspaceRecordsService({
    query,
  } as unknown as DatabaseService);
  return { records, query };
}

async function allQueries() {
  const { records, query } = recording([{ count: 2 }]);
  await records.courses();
  await records.tasks({ state: "open" });
  await records.tasks({ state: "done" });
  await records.exams(null, NOW);
  await records.exams(COURSE, NOW);
  await records.studyPlans(COURSE, { state: "open" });
  await records.courseExpenses(COURSE);
  await records.unassignedExpenseCount();
  await records.documents();
  return query.mock.calls.map(([sql, values]) => ({
    sql: String(sql).replace(/\s+/g, " ").trim(),
    values: values ?? [],
  }));
}

/*
 * A stand-in for Postgres that understands exactly the predicates these
 * queries use, then applies ORDER and LIMIT as the database would. It is what
 * lets a test put 200 non-matching rows ahead of the one that matters and
 * check that the filter runs before the limit, not after.
 */
function tableDatabase(tables: {
  tasks?: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
  }[];
  exams?: {
    id: string;
    topic: string;
    exam_date: string;
    exam_time: string;
    course_id: string;
  }[];
  plans?: {
    id: string;
    title: string;
    due_date: string | null;
    completed: boolean;
    course_id: string;
  }[];
}) {
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    // Predicates are read from the WHERE clause only: the column list also
    // mentions "completed_at IS NOT NULL", as a selected value.
    const flat = text.replace(/\s+/g, " ");
    const sql = flat.slice(Math.max(0, flat.indexOf(" FROM ")));
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? Infinity);
    const byDue = (
      a: { due_date: string | null },
      b: { due_date: string | null },
    ) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    if (/FROM tasks/.test(sql)) {
      let rows = [...(tables.tasks ?? [])];
      if (sql.includes("status <> 'done'"))
        rows = rows.filter((t) => t.status !== "done");
      if (sql.includes("status = 'done'"))
        rows = rows.filter((t) => t.status === "done");
      if (values[0])
        rows = rows.filter(
          (t) => t.due_date !== null && t.due_date < String(values[0]),
        );
      return { rows: rows.sort(byDue).slice(0, limit) };
    }
    if (/FROM exams/.test(sql)) {
      const [courseId, date, time] = values as [string | null, string, string];
      const started = (e: { exam_date: string; exam_time: string }) =>
        e.exam_date < date || (e.exam_date === date && e.exam_time < time);
      let rows = (tables.exams ?? []).filter(
        (e) => !courseId || e.course_id === courseId,
      );
      const past = sql.includes("DESC");
      rows = rows.filter((e) => (past ? started(e) : !started(e)));
      const key = (e: { exam_date: string; exam_time: string }) =>
        `${e.exam_date} ${e.exam_time}`;
      rows.sort((a, b) =>
        past ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b)),
      );
      return { rows: rows.slice(0, limit) };
    }
    if (/FROM study_plans/.test(sql)) {
      const [courseId, dueBefore] = values as [string | null, string | null];
      let rows = (tables.plans ?? []).filter(
        (p) => !courseId || p.course_id === courseId,
      );
      if (sql.includes("completed_at IS NULL"))
        rows = rows.filter((p) => !p.completed);
      if (sql.includes("completed_at IS NOT NULL"))
        rows = rows.filter((p) => p.completed);
      if (dueBefore)
        rows = rows.filter(
          (p) => p.due_date !== null && p.due_date < dueBefore,
        );
      return { rows: rows.sort(byDue).slice(0, limit) };
    }
    return { rows: [] };
  });
  return new WorkspaceRecordsService({ query } as unknown as DatabaseService);
}

describe("WorkspaceRecordsService", () => {
  it("only ever reads, and every list is bounded", async () => {
    const calls = await allQueries();
    expect(calls).toHaveLength(11);
    for (const { sql } of calls) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i,
      );
      if (!/COUNT\(\*\)/.test(sql)) expect(sql).toMatch(/ LIMIT \d+$/);
    }
  });

  it("passes the course and the dates as parameters, never inside the SQL text", async () => {
    const calls = await allQueries();
    const scoped = calls.filter(({ values }) => values.includes(COURSE));
    expect(scoped).toHaveLength(4);
    for (const { sql } of calls) {
      expect(sql).not.toContain(COURSE);
      expect(sql).not.toContain(NOW.date);
    }
  });

  it("scopes spending to exactly one course, and counts the unassigned apart", async () => {
    const calls = await allQueries();
    const spending = calls.find(
      ({ sql }) => /FROM expenses/.test(sql) && !/COUNT/.test(sql),
    );
    expect(spending?.sql).toMatch(/WHERE course_id = \$1/);
    const unassigned = calls.find(
      ({ sql }) => /FROM expenses/.test(sql) && /COUNT/.test(sql),
    );
    expect(unassigned?.sql).toMatch(/WHERE course_id IS NULL/);
  });

  it("never selects a document's storage key or its text", async () => {
    const calls = await allQueries();
    const documents = calls.find(({ sql }) => /FROM documents/.test(sql));
    expect(documents?.sql).not.toMatch(/storage_key|content|document_chunks/);
    expect(documents?.sql).toMatch(/storage_status <> 'deleting'/);
  });

  it("reads the unassigned count as a number", async () => {
    const { records } = recording([{ count: "3" }]);
    await expect(records.unassignedExpenseCount()).resolves.toBe(3);
  });

  it("finds the one unfinished task behind 200 finished ones", async () => {
    const records = tableDatabase({
      tasks: [
        ...Array.from({ length: ROW_LIMIT }, (_, n) => ({
          id: id(n + 1),
          title: `Đã xong ${n}`,
          status: "done",
          due_date: "2026-09-01",
        })),
        {
          id: id(999),
          title: "Còn dở",
          status: "todo",
          due_date: "2026-12-01",
        },
      ],
    });
    const open = await records.tasks({ state: "open" });
    expect(open.rows.map((t) => t.id)).toEqual([id(999)]);
    expect(open.truncated).toBe(false);
  });

  it("finds the one upcoming exam behind 200 that are over", async () => {
    const records = tableDatabase({
      exams: [
        ...Array.from({ length: ROW_LIMIT }, (_, n) => ({
          id: id(n + 1),
          topic: `Đã thi ${n}`,
          exam_date: "2026-01-01",
          exam_time: "08:00",
          course_id: COURSE,
        })),
        {
          id: id(999),
          topic: "Sắp thi",
          exam_date: "2026-10-10",
          exam_time: "08:00",
          course_id: COURSE,
        },
      ],
    });
    const { upcoming, latestPast } = await records.exams(COURSE, NOW);
    expect(upcoming.rows.map((e) => e.id)).toEqual([id(999)]);
    expect(upcoming.truncated).toBe(false);
    expect(latestPast?.topic).toMatch(/^Đã thi/);
  });

  it("finds the one overdue study item behind 200 that are done or not yet due", async () => {
    const records = tableDatabase({
      plans: [
        ...Array.from({ length: ROW_LIMIT / 2 }, (_, n) => ({
          id: id(n + 1),
          title: `Đã ôn ${n}`,
          due_date: "2026-09-01",
          completed: true,
          course_id: COURSE,
        })),
        ...Array.from({ length: ROW_LIMIT / 2 }, (_, n) => ({
          id: id(n + 500),
          title: `Chưa tới hạn ${n}`,
          due_date: null,
          completed: false,
          course_id: COURSE,
        })),
        {
          id: id(999),
          title: "Trễ hạn",
          due_date: "2026-09-20",
          completed: false,
          course_id: COURSE,
        },
      ],
    });
    const overdue = await records.studyPlans(COURSE, {
      state: "open",
      dueBefore: NOW.date,
    });
    expect(overdue.rows.map((p) => p.id)).toEqual([id(999)]);
    expect(overdue.truncated).toBe(false);
  });

  it("says when more rows match than it read", async () => {
    const records = tableDatabase({
      tasks: Array.from({ length: ROW_LIMIT + 5 }, (_, n) => ({
        id: id(n + 1),
        title: `Việc ${n}`,
        status: "todo",
        due_date: null,
      })),
    });
    const open = await records.tasks({ state: "open" });
    expect(open.rows).toHaveLength(ROW_LIMIT);
    expect(open.truncated).toBe(true);
  });
});
