import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { configurePilotClient } from "./pilot-client";

const anonymous = { status: "anonymous", csrfToken: "a".repeat(43) };
const authenticated = {
  status: "authenticated",
  csrfToken: "a".repeat(43),
  principal: {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role: "member",
  },
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};
afterEach(() => {
  configurePilotClient();
  vi.unstubAllGlobals();
});

it.each(["login", "logout"] as const)(
  "a session read after %s cannot reuse the response from before that account transition",
  async (operation) => {
    configurePilotClient(anonymous.csrfToken, true);
    let transitioned = false;
    let drain = false;
    const pending: Array<() => void> = [];
    const calls: string[] = [];
    const fetcher = vi.fn((path: string) => {
      calls.push(path);
      const body = () => {
        if (path === `/api/auth/${operation}`) {
          transitioned = true;
          return operation === "login"
            ? authenticated
            : { status: "signed_out", upstreamRevoked: true };
        }
        return operation === "login"
          ? transitioned
            ? authenticated
            : anonymous
          : transitioned
            ? anonymous
            : authenticated;
      };
      if (drain) return Promise.resolve(Response.json(body()));
      // A session response snapshots identity when the server handles it.
      const snapshot = path === "/api/auth/session" ? body() : undefined;
      return new Promise<Response>((resolve) =>
        pending.push(() => resolve(Response.json(snapshot ?? body()))),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const before = api.pilotSession();
    const mutation =
      operation === "login"
        ? api.pilotLogin({
            email: "invited@example.test",
            password: "synthetic-only",
          })
        : api.pilotLogout();
    const after = api.pilotSession();
    const requests = [before, mutation, after];
    try {
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
      // Cookie-producing GET must finish before a mutation can rotate/delete it.
      expect(calls).toEqual(["/api/auth/session"]);
      pending.shift()!();
      await before;
      await vi.waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1]).toBe(`/api/auth/${operation}`);
      pending.shift()!();
      await mutation;
      await vi.waitFor(() => expect(calls).toHaveLength(3));
      pending.shift()!();
      expect((await after).status).toBe(
        operation === "login" ? "authenticated" : "anonymous",
      );
      expect(calls).toEqual([
        "/api/auth/session",
        `/api/auth/${operation}`,
        "/api/auth/session",
      ]);
    } finally {
      drain = true;
      for (const resolve of pending) resolve();
      await Promise.allSettled(requests);
    }
  },
);

it("a failed auth mutation does not block fresh verification or replay the mutation", async () => {
  configurePilotClient(anonymous.csrfToken);
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      calls.push(path);
      return path === "/api/auth/login"
        ? Response.json(
            { code: "AUTH_UNAVAILABLE", message: "Synthetic Auth outage" },
            { status: 503 },
          )
        : Response.json(anonymous);
    }),
  );
  const login = api.pilotLogin({
    email: "invited@example.test",
    password: "synthetic-only",
  });
  const session = api.pilotSession();
  await expect(login).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
  expect((await session).status).toBe("anonymous");
  expect(calls).toEqual(["/api/auth/login", "/api/auth/session"]);
});
