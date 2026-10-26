import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useCallback } from "react";
import { usePagedSearch, type PagedSearchPage } from "./use-paged-search";

interface Row {
  id: string;
}
type Query = { q?: string; page: number; pageSize: number };
const INITIAL: Query = { q: "", page: 1, pageSize: 10 };

let handle: ReturnType<typeof usePagedSearch<Row, Query, PagedSearchPage<Row>>>;
const pending: Array<{
  query: Query;
  resolve: (page: PagedSearchPage<Row>) => void;
  reject: (error: unknown) => void;
}> = [];
const pageOf = (ids: string[], totalPages = 1): PagedSearchPage<Row> => ({
  items: ids.map((id) => ({ id })),
  page: 1,
  pageSize: 10,
  total: ids.length,
  totalPages,
});

function Probe({ identity }: { identity: string }) {
  const load = useCallback(
    (query: Query) =>
      new Promise<PagedSearchPage<Row>>((resolve, reject) => {
        pending.push({ query, resolve, reject });
      }),
    [],
  );
  handle = usePagedSearch<Row, Query, PagedSearchPage<Row>>(
    identity,
    INITIAL,
    load,
    { debounceMs: 0 },
  );
  return (
    <ul aria-busy={handle.loading}>
      {handle.items.map((row) => (
        <li key={row.id}>{row.id}</li>
      ))}
    </ul>
  );
}

afterEach(() => {
  cleanup();
  pending.length = 0;
  vi.restoreAllMocks();
});

async function loaded(ids: string[]) {
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await act(async () => pending.shift()!.resolve(pageOf(ids)));
}

it("keeps the rows on screen while the same list is reloaded", async () => {
  render(<Probe identity="u:w" />);
  await loaded(["a", "b"]);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  await act(async () => handle.refresh());
  await waitFor(() => expect(handle.loading).toBe(true));
  // The reload is in flight and the list has not collapsed.
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(handle.page).not.toBeNull();
  expect(handle.stale).toBe(true);
  await loaded(["a", "b", "c"]);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(handle.stale).toBe(false);
});

it("does not show rows or totals of another query while a new search or page loads", async () => {
  render(<Probe identity="u:w" />);
  await loaded(["a", "b"]);
  await act(async () => handle.setQuery({ q: "zz" }));
  await waitFor(() => expect(handle.loading).toBe(true));
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  expect(handle.page).toBeNull();
  expect(handle.stale).toBe(false);
  await loaded(["z"]);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("never shows another principal's rows while a new identity loads", async () => {
  const { rerender } = render(<Probe identity="u1:w" />);
  await loaded(["a", "b"]);
  rerender(<Probe identity="u2:w" />);
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  expect(handle.page).toBeNull();
  await loaded(["x"]);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("does not reconcile the page number against rows of a previous query", async () => {
  render(<Probe identity="u:w" />);
  await loaded(["a"]);
  await act(async () => handle.setPage(3));
  await waitFor(() => expect(handle.loading).toBe(true));
  // The stale page claims one page in total; page 3 must still be requested.
  expect(handle.query.page).toBe(3);
  await waitFor(() => expect(pending.at(-1)?.query.page).toBe(3));
});

it("a failed reload replaces the rows with the error instead of showing stale data as current", async () => {
  render(<Probe identity="u:w" />);
  await loaded(["a", "b"]);
  await act(async () => handle.refresh());
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await act(async () => pending.shift()!.reject(new Error("offline")));
  expect(handle.error).not.toBeNull();
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
