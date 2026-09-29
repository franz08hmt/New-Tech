import type {
  AssistantWorkspaceSource,
  AssistantWorkspaceSourceKind,
} from "@examate/contracts";

/*
 * Links from a workspace answer to the records it rests on.
 *
 * The API sends a kind and an id, never a URL, and the link is built here from
 * the app's own routes. An id that is not a record id, or a slug that is not a
 * slug, gets no link at all — so no text in a record, and no reply, can become
 * a link to somewhere else.
 */

const RECORD_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PAGE: Record<Exclude<AssistantWorkspaceSourceKind, "course">, string> = {
  task: "tasks",
  exam: "exams",
  study_plan: "study-plan",
  expense: "finances",
  document: "documents",
};

export const workspaceKindLabel: Record<AssistantWorkspaceSourceKind, string> =
  {
    task: "Task",
    exam: "Exam",
    study_plan: "Study plan",
    expense: "Expense",
    document: "Document",
    course: "Course",
  };

export function workspaceSourceHref(source: AssistantWorkspaceSource) {
  if (source.kind === "course")
    return source.slug && SLUG.test(source.slug)
      ? `#courses/${source.slug}`
      : null;
  const page = PAGE[source.kind];
  return page && RECORD_ID.test(source.id) ? `#${page}/${source.id}` : null;
}
