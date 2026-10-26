import { useContext, useEffect, useRef, useState } from "react";
import type {
  WorkspaceSearchItem,
  WorkspaceSearchKind,
  WorkspaceSearchSort,
} from "@examate/contracts";
import { ApiError, api } from "./api";
import { CATEGORY_LABELS } from "./use-expenses";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { lazyLabels, tl } from "./i18n";

export type HitKind = Exclude<WorkspaceSearchKind, "all">;

export interface SearchHit extends WorkspaceSearchItem {
  key: string;
  href: string;
}

/** Captions are also used in the type filter and are never derived from data. */
export const KIND_LABELS: Record<HitKind, string> = lazyLabels({
  course: "Môn học",
  exam: "Kỳ thi",
  plan: "Việc cần ôn",
  document: "Tài liệu",
  expense: "Khoản chi",
  task: "Công việc",
});

const SEARCH_KINDS: Exclude<WorkspaceSearchKind, "all">[] = [
  "course",
  "exam",
  "plan",
  "document",
  "expense",
  "task",
];
const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 12;
const DEBOUNCE_MS = 280;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COURSE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const money = new Intl.NumberFormat("vi-VN");

interface SearchState {
  key: string;
  loading: boolean;
  error: string | null;
  unsupported: boolean;
  data: {
    hits: SearchHit[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | null;
}

function hasUsefulQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= MIN_QUERY_LENGTH && /[\p{L}\p{N}]/u.test(trimmed);
}

function resultHref(item: WorkspaceSearchItem) {
  if (item.kind === "course")
    return item.slug && COURSE_SLUG.test(item.slug)
      ? `#courses/${encodeURIComponent(item.slug)}`
      : undefined;
  if (!UUID.test(item.id)) return undefined;
  switch (item.kind) {
    case "exam":
      return `#exams/${encodeURIComponent(item.id)}`;
    case "plan":
      return `#study-plan/${encodeURIComponent(item.id)}`;
    case "document":
      return `#documents/${encodeURIComponent(item.id)}`;
    case "expense":
      return `#finances/${encodeURIComponent(item.id)}`;
    case "task":
      return `#tasks/${encodeURIComponent(item.id)}`;
  }
}

function displayDetail(item: WorkspaceSearchItem) {
  if (item.kind !== "expense") return item.detail;
  // The public search payload contains only its label/detail. For older rows
  // the server formats the amount/category as part of detail; keep this
  // fallback only for a deliberately empty detail, never infer a route.
  return item.detail || CATEGORY_LABELS.other;
}

/**
 * Searches the verified workspace through one bounded API page. The key is
 * principal + normalized query controls, so a late response from another
 * query or account cannot be rendered even before its effect cleanup runs.
 */
export function useWorkspaceSearch(query: string) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const trimmedQuery = query.trim();
  const ready = hasUsefulQuery(query);
  const [kind, setKindValue] = useState<WorkspaceSearchKind>("all");
  const [sort, setSortValue] = useState<WorkspaceSearchSort>("kind");
  const [direction, setDirectionValue] = useState<"asc" | "desc">("asc");
  const pageScope = JSON.stringify([identity, trimmedQuery]);
  const [pageState, setPageState] = useState({ scope: "", page: 1 });
  // A changed effective query or principal is immediately page one, before
  // either effect can schedule a request with the previous page.
  const page = pageState.scope === pageScope ? pageState.page : 1;
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<SearchState | null>(null);
  const revision = useRef(0);

  const key = JSON.stringify([
    identity,
    trimmedQuery,
    kind,
    sort,
    direction,
    page,
  ]);

  useEffect(() => {
    if (pageState.scope !== pageScope)
      setPageState({ scope: pageScope, page: 1 });
  }, [pageScope, pageState.scope]);

  useEffect(() => {
    const currentRevision = ++revision.current;
    if (!ready || !identity) return;

    const controller = new AbortController();
    setState({
      key,
      loading: true,
      error: null,
      unsupported: false,
      data: null,
    });
    const timer = setTimeout(() => {
      void api
        .searchWorkspace(
          { q: trimmedQuery, kind, sort, direction, page, pageSize: PAGE_SIZE },
          controller.signal,
        )
        .then((result) => {
          if (controller.signal.aborted || revision.current !== currentRevision)
            return;
          const hits = result.items.flatMap((item) => {
            const href = resultHref(item);
            return href
              ? [
                  {
                    ...item,
                    detail: displayDetail(item),
                    href,
                    key: `${item.kind}-${item.id}`,
                  },
                ]
              : [];
          });
          setState({
            key,
            loading: false,
            error: null,
            unsupported: false,
            data: {
              hits,
              total: result.total,
              page: result.page,
              pageSize: result.pageSize,
              totalPages: result.totalPages,
            },
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || revision.current !== currentRevision)
            return;
          if (
            error instanceof ApiError &&
            error.code === "SEARCH_QUERY_UNSUPPORTED"
          ) {
            setState({
              key,
              loading: false,
              error: null,
              unsupported: true,
              data: null,
            });
            return;
          }
          setState({
            key,
            loading: false,
            error: tl(
              "Chưa tìm được lúc này. Kiểm tra kết nối rồi thử lại nhé.",
            ),
            unsupported: false,
            data: null,
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (revision.current === currentRevision) revision.current++;
    };
  }, [
    direction,
    identity,
    kind,
    key,
    page,
    ready,
    retryRevision,
    sort,
    trimmedQuery,
  ]);

  const current = state?.key === key ? state : null;
  const hits = current?.data?.hits ?? [];

  const resetPage = () => setPageState({ scope: pageScope, page: 1 });
  return {
    hits,
    total: current?.data?.total ?? 0,
    totalPages: current?.data?.totalPages ?? 0,
    page,
    pageSize: current?.data?.pageSize ?? PAGE_SIZE,
    searching: trimmedQuery.length > 0,
    tooShort: trimmedQuery.length > 0 && !ready,
    loading: ready && Boolean(identity) && (current?.loading ?? true),
    error: current?.error ?? null,
    unsupported: current?.unsupported ?? false,
    kind,
    sort,
    direction,
    setKind: (next: WorkspaceSearchKind) => {
      setKindValue(next);
      resetPage();
    },
    setSort: (next: WorkspaceSearchSort) => {
      setSortValue(next);
      resetPage();
    },
    setDirection: (next: "asc" | "desc") => {
      setDirectionValue(next);
      resetPage();
    },
    previousPage: () =>
      setPageState({ scope: pageScope, page: Math.max(1, page - 1) }),
    nextPage: () =>
      setPageState({
        scope: pageScope,
        page: Math.min(current?.data?.totalPages ?? page, page + 1),
      }),
    retry: () => setRetryRevision((value) => value + 1),
  };
}

export const workspaceSearchKinds = SEARCH_KINDS;
