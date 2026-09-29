import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import { WorkspaceRecordsService } from "./workspace-records.service.js";

const COURSE = "11111111-1111-4111-8111-111111111111";

function fixture(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows }));
  const records = new WorkspaceRecordsService({
    query,
  } as unknown as DatabaseService);
  return { records, query };
}

async function allQueries() {
  const { records, query } = fixture([{ count: 2 }]);
  await records.courses();
  await records.tasks();
  await records.exams(null);
  await records.exams(COURSE);
  await records.studyPlans(COURSE);
  await records.courseExpenses(COURSE);
  await records.unassignedExpenseCount();
  await records.documents();
  return query.mock.calls.map(([sql, values]) => ({
    sql: String(sql).replace(/\s+/g, " ").trim(),
    values: values ?? [],
  }));
}

describe("WorkspaceRecordsService", () => {
  it("only ever reads, and every list is bounded", async () => {
    const calls = await allQueries();
    expect(calls).toHaveLength(8);
    for (const { sql } of calls) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i,
      );
      if (!/COUNT\(\*\)/.test(sql)) expect(sql).toMatch(/ LIMIT \d+$/);
    }
  });

  it("passes the course as a parameter, never inside the SQL text", async () => {
    const calls = await allQueries();
    const scoped = calls.filter(({ values }) => values.includes(COURSE));
    expect(scoped).toHaveLength(3);
    for (const { sql } of calls) expect(sql).not.toContain(COURSE);
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
    const { records } = fixture([{ count: "3" }]);
    await expect(records.unassignedExpenseCount()).resolves.toBe(3);
  });
});
