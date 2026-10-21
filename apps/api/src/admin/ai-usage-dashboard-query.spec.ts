import { describe, expect, it } from "vitest";
import {
  parseAiUsageCallsQuery,
  parseAiUsageCostBreakdownQuery,
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
    { from: "0000-01-01", to: "0000-01-01" },
    { from: "9999-12-31", to: "9999-12-31" },
    { to: "0001-01-01" },
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

  it("recognizes the versioned Study Coach flashcards generation operation", () => {
    expect(
      parseAiUsageDashboardQuery({ operation: "study_flashcards" }),
    ).toMatchObject({
      operation: "study_flashcards",
    });
  });

  it("accepts the supported date boundaries and exact 90-day range", () => {
    expect(() =>
      parseAiUsageDashboardQuery({ from: "0001-01-01", to: "0001-01-01" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "0001-01-01", to: "0001-03-31" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "9999-10-02", to: "9999-12-30" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "9999-12-30", to: "9999-12-30" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "2024-02-29", to: "2024-02-29" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "2026-01-01", to: "2026-03-31" }),
    ).not.toThrow();
    expect(() =>
      parseAiUsageDashboardQuery({ from: "2026-01-01", to: "2026-04-01" }),
    ).toThrow();
  });

  it.each([null, [], { page: ["1", "2"] }, { pageSize: "51" }, { q: "x" }])(
    "rejects malformed provider-call pagination %#",
    (input) => {
      expect(() => parseAiUsageCallsQuery(input)).toThrow();
    },
  );

  it("preserves the selected model in a bounded provider-call query", () => {
    expect(
      parseAiUsageCallsQuery({ model: "gemini-2.5-flash", page: "2" }),
    ).toEqual({ model: "gemini-2.5-flash", page: 2, pageSize: 20 });
  });

  it.each([
    { model: ["a", "b"] },
    { model: { value: "a" } },
    { model: "x".repeat(85) },
    { model: "bad model" },
    { model: "valid", page: ["1", "2"] },
  ])("rejects malformed provider-call filter %#", (input) => {
    expect(() => parseAiUsageCallsQuery(input)).toThrow();
  });

  it("parses bounded currency and pricing-version breakdowns", () => {
    expect(parseAiUsageCostBreakdownQuery({})).toMatchObject({
      group: "currency",
      page: 1,
      pageSize: 20,
    });
    expect(
      parseAiUsageCostBreakdownQuery({
        group: "pricing_version",
        currency: "USD",
        model: "gemini-2.5-flash",
        from: "2026-10-01",
        to: "2026-10-21",
        page: "2",
        pageSize: "50",
      }),
    ).toMatchObject({
      group: "pricing_version",
      currency: "USD",
      model: "gemini-2.5-flash",
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    { group: "unbounded" },
    { group: ["currency", "pricing_version"] },
    { group: "pricing_version" },
    { group: "pricing_version", currency: "usd" },
    { group: "currency", currency: "USD" },
    { model: ["a", "b"] },
    { from: "0000-01-01", to: "0000-01-01" },
    { page: "1", pageSize: "51" },
  ])("rejects malformed cost breakdown query %#", (input) => {
    expect(() => parseAiUsageCostBreakdownQuery(input)).toThrow();
  });
});
