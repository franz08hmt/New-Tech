import { BadRequestException } from "@nestjs/common";
import type {
  AiUsageDashboardQuery,
  AiUsageOperationName,
  AiUsageOperationMode,
  AiUsageOperationOutcome,
} from "@examate/contracts";

const queryKeys = new Set([
  "from",
  "to",
  "operation",
  "mode",
  "outcome",
  "model",
  "sort",
  "direction",
  "page",
  "pageSize",
]);
const operations: readonly AiUsageOperationName[] = [
  "assistant_question",
  "assistant_summary",
  "assistant_course_info",
  "document_index",
  "study_quiz",
];
const modes: readonly AiUsageOperationMode[] = [
  "general",
  "documents",
  "workspace",
];
const outcomes: readonly AiUsageOperationOutcome[] = [
  "success",
  "error",
  "timeout",
  "cancelled",
  "rejected",
  "unknown",
];
const sorts = ["started_at", "duration_ms", "operation", "outcome"] as const;
const fail = (): never => {
  throw new BadRequestException({
    code: "AI_USAGE_QUERY_INVALID",
    message: "Bộ lọc sử dụng AI không hợp lệ.",
  });
};

function scalar(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in input)) return undefined;
  const value = input[key];
  if (typeof value !== "string") return fail();
  return value;
}

function dateValue(value: string | undefined, fallback: string): string {
  const date = value ?? fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail();
  const year = Number(date.slice(0, 4));
  if (year < 1 || year > 9999 || date < "0001-01-01" || date > "9999-12-30")
    return fail();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || formatCalendarDate(parsed) !== date)
    return fail();
  return date;
}

function formatCalendarDate(date: Date) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return formatCalendarDate(value);
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  if (value === undefined) return fallback;
  if (!/^\d{1,9}$/.test(value)) return fail();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max)
    return fail();
  return number;
}

export function parseAiUsageDashboardQuery(
  input: unknown,
): AiUsageDashboardQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail();
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !queryKeys.has(key))) return fail();

  const today = localToday();
  const to = dateValue(scalar(record, "to"), today);
  const from = dateValue(scalar(record, "from"), addDays(to, -6));
  const fromUtc = Date.parse(`${from}T00:00:00.000Z`);
  const toUtc = Date.parse(`${to}T00:00:00.000Z`);
  const days = Math.floor((toUtc - fromUtc) / 86_400_000) + 1;
  if (days < 1 || days > 90) return fail();

  const operation = scalar(record, "operation");
  const mode = scalar(record, "mode");
  const outcome = scalar(record, "outcome");
  const model = scalar(record, "model")?.trim();
  const sort = scalar(record, "sort") ?? "started_at";
  const direction = scalar(record, "direction") ?? "desc";
  if (
    operation !== undefined &&
    !operations.includes(operation as AiUsageOperationName)
  )
    return fail();
  if (mode !== undefined && !modes.includes(mode as AiUsageOperationMode))
    return fail();
  if (
    outcome !== undefined &&
    !outcomes.includes(outcome as AiUsageOperationOutcome)
  )
    return fail();
  if (model !== undefined && !/^[A-Za-z0-9._-]{1,84}$/.test(model))
    return fail();
  if (!(sorts as readonly string[]).includes(sort)) return fail();
  if (direction !== "asc" && direction !== "desc") return fail();

  return {
    from,
    to,
    ...(operation ? { operation: operation as AiUsageOperationName } : {}),
    ...(mode ? { mode: mode as AiUsageOperationMode } : {}),
    ...(outcome ? { outcome: outcome as AiUsageOperationOutcome } : {}),
    ...(model ? { model } : {}),
    sort: sort as AiUsageDashboardQuery["sort"],
    direction,
    page: positiveInteger(scalar(record, "page"), 1, 1_000_000),
    pageSize: positiveInteger(scalar(record, "pageSize"), 20, 50),
  };
}

export interface AiUsageCallsQuery {
  page: number;
  pageSize: number;
  model?: string;
}

export function parseAiUsageCallsQuery(input: unknown): AiUsageCallsQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail();
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !["page", "pageSize", "model"].includes(key),
    )
  )
    return fail();
  const model = scalar(record, "model")?.trim();
  if (model !== undefined && !/^[A-Za-z0-9._-]{1,84}$/.test(model))
    return fail();
  return {
    page: positiveInteger(scalar(record, "page"), 1, 1_000_000),
    pageSize: positiveInteger(scalar(record, "pageSize"), 20, 50),
    ...(model ? { model } : {}),
  };
}

export type AiUsageCostBreakdownGroup = "currency" | "pricing_version";
export interface AiUsageCostBreakdownQuery {
  from: string;
  to: string;
  operation?: AiUsageDashboardQuery["operation"];
  mode?: AiUsageDashboardQuery["mode"];
  outcome?: AiUsageDashboardQuery["outcome"];
  model?: string;
  group: AiUsageCostBreakdownGroup;
  currency?: string;
  page: number;
  pageSize: number;
}

export function parseAiUsageCostBreakdownQuery(
  input: unknown,
): AiUsageCostBreakdownQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail();
  const record = input as Record<string, unknown>;
  const allowed = new Set([
    "from",
    "to",
    "operation",
    "mode",
    "outcome",
    "model",
    "group",
    "currency",
    "page",
    "pageSize",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return fail();
  const base = parseAiUsageDashboardQuery({
    ...(record.from !== undefined ? { from: record.from } : {}),
    ...(record.to !== undefined ? { to: record.to } : {}),
    ...(record.operation !== undefined ? { operation: record.operation } : {}),
    ...(record.mode !== undefined ? { mode: record.mode } : {}),
    ...(record.outcome !== undefined ? { outcome: record.outcome } : {}),
    ...(record.model !== undefined ? { model: record.model } : {}),
  });
  const group = scalar(record, "group") ?? "currency";
  const currency = scalar(record, "currency");
  if (group !== "currency" && group !== "pricing_version") return fail();
  if (group === "currency" && currency !== undefined) return fail();
  if (
    group === "pricing_version" &&
    (!currency || !/^[A-Z]{3}$/.test(currency))
  )
    return fail();
  return {
    from: base.from,
    to: base.to,
    ...(base.operation ? { operation: base.operation } : {}),
    ...(base.mode ? { mode: base.mode } : {}),
    ...(base.outcome ? { outcome: base.outcome } : {}),
    ...(base.model ? { model: base.model } : {}),
    group,
    ...(currency ? { currency } : {}),
    page: positiveInteger(scalar(record, "page"), 1, 1_000_000),
    pageSize: positiveInteger(scalar(record, "pageSize"), 20, 50),
  };
}
