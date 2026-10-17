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
