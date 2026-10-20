import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { configurePilotClient } from "./pilot-client";

afterEach(() => {
  vi.unstubAllGlobals();
  configurePilotClient();
});
it("document status reconciliation uses the existing authenticated GET helper without a POST", async () => {
  configurePilotClient("synthetic-csrf", true);
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "synthetic-document" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await api.getDocument("synthetic-document")).toEqual({
    id: "synthetic-document",
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe("/api/documents/synthetic-document");
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
});

it("workspace search transports a bounded typed GET and propagates cancellation", async () => {
  configurePilotClient("synthetic-csrf", true);
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [],
        page: 2,
        pageSize: 12,
        total: 25,
        totalPages: 3,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = await api.searchWorkspace(
    {
      q: "thuật toán_%",
      kind: "document",
      sort: "label",
      direction: "desc",
      page: 2,
      pageSize: 12,
    },
    controller.signal,
  );
  const url = new URL(String(fetch.mock.calls[0][0]), "http://127.0.0.1");
  expect(url.pathname).toBe("/api/search");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "thuật toán_%",
    kind: "document",
    sort: "label",
    direction: "desc",
    page: "2",
    pageSize: "12",
  });
  expect(fetch.mock.calls[0][1].method).toBeUndefined();
  expect(fetch.mock.calls[0][1].signal).toBeDefined();
  expect(result.total).toBe(25);
});
