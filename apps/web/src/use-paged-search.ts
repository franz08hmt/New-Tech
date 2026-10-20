import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";

export interface PagedSearchPage<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PagedSearchQuery {
  q?: string;
  page: number;
  pageSize: number;
}

type SearchState<Page> = {
  key: string;
  loading: boolean;
  error: string | null;
  unsupported: boolean;
  page: Page | null;
};

interface Options {
  enabled?: boolean;
  debounceMs?: number;
  minimumQueryLength?: number;
}

/**
 * Bounded server paging with a principal-scoped query key. The effective
 * query becomes page one synchronously when identity changes, so an effect
 * cannot briefly dispatch the previous principal's page.
 */
export function usePagedSearch<
  Item,
  Query extends PagedSearchQuery,
  Page extends PagedSearchPage<Item>,
>(
  identity: string,
  initialQuery: Query,
  load: (query: Query, signal: AbortSignal) => Promise<Page>,
  options: Options = {},
) {
  const enabled = options.enabled ?? true;
  const debounceMs = options.debounceMs ?? 280;
  const minimumQueryLength = options.minimumQueryLength ?? 2;
  const [stored, setStored] = useState({ identity, query: initialQuery });
  const query = useMemo(
    () =>
      stored.identity === identity
        ? stored.query
        : ({ ...initialQuery, q: "", page: 1 } as Query),
    [identity, initialQuery, stored],
  );
  const normalizedQuery = query.q?.trim() ?? "";
  const tooShort =
    normalizedQuery.length > 0 && normalizedQuery.length < minimumQueryLength;
  const key = useMemo(
    () => JSON.stringify([identity, query]),
    [identity, query],
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<SearchState<Page> | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    const currentRevision = ++revision.current;
    if (!enabled || !identity || tooShort) return;
    const controller = new AbortController();
    setState({
      key,
      loading: true,
      error: null,
      unsupported: false,
      page: null,
    });
    const timer = window.setTimeout(() => {
      void load(query, controller.signal)
        .then((result) => {
          if (controller.signal.aborted || revision.current !== currentRevision)
            return;
          setState({
            key,
            loading: false,
            error: null,
            unsupported: false,
            page: result,
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
              page: null,
            });
            return;
          }
          setState({
            key,
            loading: false,
            error: "Could not load this list. Check your connection and retry.",
            unsupported: false,
            page: null,
          });
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (revision.current === currentRevision) revision.current++;
    };
  }, [debounceMs, enabled, identity, key, load, query, retryVersion, tooShort]);

  const current = state?.key === key ? state : null;
  const setQuery = useCallback(
    (patch: Partial<Query>, resetPage = true) => {
      setStored((currentStored) => {
        const currentQuery =
          currentStored.identity === identity
            ? currentStored.query
            : ({ ...initialQuery, q: "", page: 1 } as Query);
        return {
          identity,
          query: {
            ...currentQuery,
            ...patch,
            page: resetPage ? 1 : (patch.page ?? currentQuery.page),
          },
        };
      });
    },
    [identity, initialQuery],
  );

  // A successful delete can make the current last page disappear. Reconcile
  // the page number with the server total, then fetch that valid page once.
  useEffect(() => {
    const result = current?.page;
    if (!result || query.page <= Math.max(1, result.totalPages)) return;
    setQuery({ page: Math.max(1, result.totalPages) } as Partial<Query>, false);
  }, [current?.page, query.page, setQuery]);

  return {
    query,
    page: current?.page ?? null,
    items: current?.page?.items ?? [],
    loading:
      enabled && Boolean(identity) && !tooShort && (current?.loading ?? true),
    error: current?.error ?? null,
    unsupported: current?.unsupported ?? false,
    tooShort,
    retry: () => setRetryVersion((value) => value + 1),
    refresh: () => setRetryVersion((value) => value + 1),
    setQuery,
    setPage: (page: number) => setQuery({ page } as Partial<Query>, false),
  };
}
