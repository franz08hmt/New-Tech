import type { AssistantFeedbackSnapshot } from "@examate/contracts";

export const feedbackReasons = [
  "wrong_source",
  "missing_detail",
  "document_not_found",
  "incorrect_content",
  "other",
] as const;
export const SNAPSHOT_BYTES = 81920;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && [...v].length <= max;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const shape = (
  v: unknown,
  required: string[],
  optional: string[] = [],
): v is Record<string, unknown> =>
  object(v) &&
  required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => [...required, ...optional].includes(k));
const intents = [
  "tasks_open",
  "tasks_overdue",
  "tasks_done",
  "tasks_by_course_unsupported",
  "exams_upcoming",
  "study_plans_open",
  "study_plans_overdue",
  "study_plans_done",
  "expenses_total",
  "course_documents",
  "document_course",
  "courses_list",
  "course_required",
  "course_not_found",
  "course_ambiguous",
  "write_refused",
  "notes_unavailable",
  "unsupported",
];

export function validSnapshot(
  value: unknown,
): value is AssistantFeedbackSnapshot {
  if (
    !shape(value, ["schemaVersion", "request", "response"]) ||
    value.schemaVersion !== 1 ||
    Buffer.byteLength(canonicalJson(value), "utf8") > SNAPSHOT_BYTES
  )
    return false;
  const q = value.request,
    r = value.response;
  if (
    !shape(q, ["mode", "operation", "question"], ["courseId", "documentId"]) ||
    !text(q.question, 4000) ||
    !["general", "documents", "workspace"].includes(String(q.mode)) ||
    !["question", "summarize", "course_info"].includes(String(q.operation)) ||
    ["courseId", "documentId"].some(
      (k) => Object.hasOwn(q, k) && !uuid(q[k]),
    ) ||
    (q.mode !== "documents" && q.operation !== "question")
  )
    return false;
  const base = [
    "mode",
    "answer",
    "answerable",
    "reasonCode",
    "citations",
    "ragEnabled",
    "provider",
    "model",
    "promptVersion",
  ];
  if (
    !object(r) ||
    r.mode !== q.mode ||
    !text(r.answer, 32000) ||
    typeof r.answerable !== "boolean" ||
    !text(r.model, 200) ||
    !text(r.promptVersion, 120) ||
    !Array.isArray(r.citations) ||
    r.citations.length > 40
  )
    return false;
  if (q.mode === "workspace") {
    if (
      !shape(r, [...base, "workspaceSources", "workspaceIntent", "asOf"]) ||
      r.provider !== "workspace" ||
      r.model !== "database" ||
      r.ragEnabled !== false ||
      r.citations.length ||
      !["WORKSPACE_ANSWER", "WORKSPACE_UNSUPPORTED"].includes(
        String(r.reasonCode),
      ) ||
      !intents.includes(String(r.workspaceIntent)) ||
      typeof r.asOf !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.asOf) ||
      !Array.isArray(r.workspaceSources) ||
      r.workspaceSources.length > 40
    )
      return false;
    return r.workspaceSources.every(
      (s) =>
        shape(s, ["kind", "id", "label"], ["slug", "detail"]) &&
        [
          "task",
          "exam",
          "study_plan",
          "expense",
          "document",
          "course",
        ].includes(String(s.kind)) &&
        uuid(s.id) &&
        text(s.label, 1000) &&
        (!Object.hasOwn(s, "detail") || text(s.detail, 2000)) &&
        (!Object.hasOwn(s, "slug") ||
          (s.kind === "course" &&
            typeof s.slug === "string" &&
            /^[a-z0-9-]{1,120}$/.test(s.slug))),
    );
  }
  if (q.operation === "course_info") {
    if (
      !shape(r, [...base, "metadataSource"]) ||
      r.reasonCode !== "DOCUMENT_METADATA" ||
      r.provider !== "workspace" ||
      r.model !== "database" ||
      r.ragEnabled !== false ||
      r.citations.length ||
      !q.documentId
    )
      return false;
    const m = r.metadataSource;
    return (
      shape(m, [
        "documentId",
        "title",
        "courseId",
        "courseSlug",
        "courseName",
        "courseCode",
      ]) &&
      uuid(m.documentId) &&
      text(m.title, 1000) &&
      (m.courseId === null || uuid(m.courseId)) &&
      ["courseSlug", "courseName", "courseCode"].every(
        (k) => m[k] === null || text(m[k], 1000),
      )
    );
  }
  if (
    !shape(r, base) ||
    r.provider !== "google" ||
    r.ragEnabled !== (q.mode === "documents") ||
    !["ANSWER_GENERATED", "PARTIAL_COVERAGE", "NO_RELEVANT_EVIDENCE"].includes(
      String(r.reasonCode),
    ) ||
    (q.mode === "general" && r.citations.length)
  )
    return false;
  return r.citations.every(
    (c) =>
      shape(c, [
        "sourceId",
        "documentId",
        "chunkId",
        "title",
        "page",
        "chunkIndex",
      ]) &&
      typeof c.sourceId === "string" &&
      /^S[1-9]\d{0,2}$/.test(c.sourceId) &&
      uuid(c.documentId) &&
      uuid(c.chunkId) &&
      text(c.title, 1000) &&
      (c.page === null || (Number.isInteger(c.page) && Number(c.page) > 0)) &&
      Number.isInteger(c.chunkIndex) &&
      Number(c.chunkIndex) >= 0,
  );
}
