import { describe, expect, it } from "vitest";
import {
  parseAiUsageCallsQuery,
  parseAiUsageDashboardQuery,
} from "./ai-usage-dashboard-query.js";

describe("F06 AI usage query contract", () => {
  it("defaults to a seven-day Vietnam report and bounded first page", () => {
    const query = parseAiUsageDashboardQuery({});
    expect(
      Date.parse(`${query.to}T00:00:00Z`) -
        Date.parse(`${query.from}T00:00:00Z`),
    ).toBe(6 * 86_400_000);
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.sort).toBe("started_at");
  });

  it.each([
    null,
    [],
    { from: ["2026-10-01", "2026-10-02"] },
    { model: { value: "gemini-2.5-flash" } },
    { from: "2026-02-30" },
    { from: "2026-10-01", to: "2026-12-31" },
    { operation: "unknown" },
    { outcome: "denied" },
    { mode: "private" },
    { sort: "started_at; DROP TABLE" },
    { direction: "sideways" },
    { page: "0" },
    { page: "1000001" },
    { page: "1.5" },
    { pageSize: "51" },
    { pageSize: ["20"] },
    { unexpected: "value" },
  ])("rejects malformed dashboard query %# with a safe 400", (input) => {
    try {
      parseAiUsageDashboardQuery(input);
      throw new Error("expected validation to reject input");
    } catch (error) {
      expect(error).toMatchObject({ status: 400 });
      expect(JSON.stringify(error)).not.toContain("DROP TABLE");
    }
  });

  it("accepts known filters without coercing repeated values", () => {
    expect(
      parseAiUsageDashboardQuery({
        from: "2026-10-01",
        to: "2026-10-30",
        operation: "assistant_question",
        mode: "documents",
        outcome: "timeout",
        model: "gemini-2.5-flash",
        sort: "duration_ms",
        direction: "asc",
        page: "2",
        pageSize: "50",
      }),
    ).toMatchObject({
      operation: "assistant_question",
      mode: "documents",
      outcome: "timeout",
      model: "gemini-2.5-flash",
      page: 2,
      pageSize: 50,
      sort: "duration_ms",
      direction: "asc",
    });
  });

  it.each([null, [], { page: ["1", "2"] }, { pageSize: "51" }, { q: "x" }])(
    "rejects malformed provider-call pagination %#",
    (input) => {
      expect(() => parseAiUsageCallsQuery(input)).toThrow();
    },
  );
});
