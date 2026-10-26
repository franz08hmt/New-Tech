import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import { tl } from "./i18n";

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

interface Options<Query extends PagedSearchQuery> {
  enabled?: boolean | ((query: Query) => boolean);
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
  options: Options<Query> = {},
) {
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
  const enabled =
    typeof options.enabled === "function"
      ? options.enabled(query)
      : (options.enabled ?? true);
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
  // The last page that arrived for this exact identity and query. Reloading the
  // same query (after a save or a retry) keeps showing it, marked stale, instead
  // of collapsing the list into a placeholder and moving everything below it.
  // A different query or identity never inherits it: its totals and rows would
  // describe something else.
  const lastGood = useRef<{ identity: string; key: string; page: Page } | null>(
    null,
  );

  useEffect(() => {
    const currentRevision = ++revision.current;
    if (!enabled || !identity || tooShort) return;
    const controller = new AbortController();
    setState({
      key,
      loading: true,
      error: null,
      unsupported: false,
      page:
        lastGood.current?.identity === identity && lastGood.current.key === key
          ? lastGood.current.page
          : null,
    });
    const timer = window.setTimeout(() => {
      void load(query, controller.signal)
        .then((result) => {
          if (controller.signal.aborted || revision.current !== currentRevision)
            return;
          lastGood.current = { identity, key, page: result };
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
          lastGood.current = null;
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
            error: tl(
              "Could not load this list. Check your connection and retry.",
            ),
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

  // Between a render and the effect that restarts the load of the same query,
  // keep the previous answer (stale) rather than an empty frame.
  const settled = state?.key === key ? state : null;
  const carried =
    !settled &&
    lastGood.current?.identity === identity &&
    lastGood.current.key === key
      ? lastGood.current.page
      : null;
  const current: SearchState<Page> | null =
    settled ??
    (carried
      ? { key, loading: true, error: null, unsupported: false, page: carried }
      : null);
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
    // Only a settled answer says how many pages exist; a page kept on screen
    // while another one loads describes a different query.
    const result = current?.loading ? undefined : current?.page;
    if (!result || query.page <= Math.max(1, result.totalPages)) return;
    setQuery({ page: Math.max(1, result.totalPages) } as Partial<Query>, false);
  }, [current?.loading, current?.page, query.page, setQuery]);

  const loading =
    enabled && Boolean(identity) && !tooShort && (current?.loading ?? true);
  return {
    query,
    page: current?.page ?? null,
    items: current?.page?.items ?? [],
    loading,
    /** A reload is running and the rows shown are from the previous answer. */
    stale: loading && Boolean(current?.page),
    error: current?.error ?? null,
    unsupported: current?.unsupported ?? false,
    tooShort,
    retry: () => setRetryVersion((value) => value + 1),
    refresh: () => setRetryVersion((value) => value + 1),
    setQuery,
    setPage: (page: number) => setQuery({ page } as Partial<Query>, false),
  };
}
