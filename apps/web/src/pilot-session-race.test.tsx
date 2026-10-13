import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PilotSessionResponse } from "@examate/contracts";
import { PilotAccess } from "./PilotAccess";
import { configurePilotClient, notifyPilotDenied } from "./pilot-client";

const csrfA = "a".repeat(43);
const csrfB = "b".repeat(43);
const anonymous = (csrfToken = csrfA): PilotSessionResponse => ({
  status: "anonymous",
  csrfToken,
});
const authenticated = (): PilotSessionResponse => ({
  status: "authenticated",
  csrfToken: csrfA,
  principal: {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role: "member",
  },
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
});

type SessionRequest = {
  resolve: (body: PilotSessionResponse, cookie?: string) => void;
  fail: () => void;
  settled: boolean;
};

// Only the HTTP boundary is simulated. Applying the synthetic cookie before
// resolving fetch models a browser processing Set-Cookie on arrival, even when
// the hook later ignores that response's JSON as stale. No real cookies/tokens
// are read, and the fetch signal is deliberately not used to erase arrivals.
function browserBoundary() {
  const sessions: SessionRequest[] = [];
  const logins: Array<{ csrf: string | null; cookie: string | undefined }> = [];
  let cookie: string | undefined;
  let draining = false;
  const fetcher = vi.fn((path: string, init?: RequestInit) => {
    if (path === "/api/auth/session") {
      if (draining) return Promise.resolve(Response.json(anonymous()));
      return new Promise<Response>((resolve) => {
        const pending: SessionRequest = {
          settled: false,
          resolve(body, nextCookie) {
            if (pending.settled)
              throw Error("Fixture response already settled");
            pending.settled = true;
            if (nextCookie !== undefined) cookie = nextCookie;
            resolve(Response.json(body));
          },
          fail() {
            if (pending.settled)
              throw Error("Fixture response already settled");
            pending.settled = true;
            resolve(
              Response.json(
                { code: "AUTH_UNAVAILABLE", message: "Synthetic Auth outage" },
                { status: 503 },
              ),
            );
          },
        };
        sessions.push(pending);
      });
    }
    if (path === "/api/auth/login") {
      const sentCsrf = new Headers(init?.headers).get("X-CSRF-Token");
      logins.push({ csrf: sentCsrf, cookie });
      if (!cookie || sentCsrf !== cookie)
        return Promise.resolve(
          Response.json(
            { code: "CSRF_INVALID", message: "Synthetic cookie/CSRF mismatch" },
            { status: 403 },
          ),
        );
      cookie = csrfA;
      return Promise.resolve(Response.json(authenticated()));
    }
    throw Error(`Unexpected fixture HTTP path: ${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    sessions,
    logins,
    drain() {
      draining = true;
      for (const pending of sessions)
        if (!pending.settled) pending.resolve(anonymous());
    },
  };
}

let boundary: ReturnType<typeof browserBoundary> | undefined;
afterEach(async () => {
  cleanup();
  // Drain unresolved boundary promises even after a failing assertion so
  // request timers/shared pending work cannot leak into another test.
  await act(async () => {
    boundary?.drain();
  });
  boundary = undefined;
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function gate(strict = false) {
  const content = (
    <PilotAccess>
      <p>Protected race fixture</p>
    </PilotAccess>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

async function settleSession(
  pending: SessionRequest,
  value: PilotSessionResponse,
  cookie?: string,
) {
  await act(async () => pending.resolve(value, cookie));
}

async function submitLogin() {
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "invited@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

it("cold StrictMode bootstrap sends only one cookie-producing session request", async () => {
  boundary = browserBoundary();
  gate(true);
  await waitFor(() => expect(boundary!.sessions.length).toBeGreaterThan(0));
  expect(boundary.sessions).toHaveLength(1);
  await settleSession(boundary.sessions[0], anonymous(), csrfA);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

it("login succeeds when cold bootstrap responses would otherwise arrive in reverse order", async () => {
  boundary = browserBoundary();
  gate(true);
  await waitFor(() => expect(boundary!.sessions.length).toBeGreaterThan(0));
  const requests = [...boundary.sessions];
  // A fixed client has one request; the broken StrictMode client has two.
  // Newest JSON activates the form first, then the earlier response applies
  // its cookie. Discarding stale JSON alone cannot protect the browser cookie.
  await settleSession(requests.at(-1)!, anonymous(csrfB), csrfB);
  await screen.findByRole("button", { name: "Sign in" });
  for (const stale of requests.slice(0, -1))
    await settleSession(stale, anonymous(csrfA), csrfA);
  await submitLogin();
  await waitFor(() => {
    expect(boundary!.logins).toHaveLength(1);
    expect(boundary!.logins[0].csrf).toBe(boundary!.logins[0].cookie);
  });
  expect(await screen.findByText("Protected race fixture")).toBeVisible();
});

it("a real component unmount/remount shares pending bootstrap and can still log in", async () => {
  boundary = browserBoundary();
  const first = gate();
  await waitFor(() => expect(boundary!.sessions).toHaveLength(1));
  first.unmount();
  gate();
  expect(boundary.sessions).toHaveLength(1);
  await settleSession(boundary.sessions[0], anonymous(), csrfA);
  await submitLogin();
  expect(await screen.findByText("Protected race fixture")).toBeVisible();
});

it("focus and visibility bursts share one pending session verification", async () => {
  boundary = browserBoundary();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  gate();
  await settleSession(boundary.sessions[0], authenticated(), csrfA);
  await screen.findByText("Protected race fixture");
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  expect(boundary.sessions).toHaveLength(2);
  await settleSession(boundary.sessions[1], authenticated());
  expect(screen.getByText("Protected race fixture")).toBeVisible();
});

it("regression: failed bootstrap releases pending work so retry can establish a fresh login", async () => {
  boundary = browserBoundary();
  gate();
  await act(async () => boundary!.sessions[0].fail());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Chưa xác minh được phiên",
  );
  fireEvent.click(screen.getByRole("button", { name: "Check session" }));
  await waitFor(() => expect(boundary!.sessions).toHaveLength(2));
  await settleSession(boundary.sessions[1], anonymous(csrfB), csrfB);
  await submitLogin();
  expect(await screen.findByText("Protected race fixture")).toBeVisible();
});

it.each(["logout", "session_changed"])(
  "regression: a tab %s event prevents an older authenticated verification from reopening access",
  async (type) => {
    boundary = browserBoundary();
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    gate();
    await settleSession(boundary.sessions[0], authenticated(), csrfA);
    await screen.findByText("Protected race fixture");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(boundary.sessions).toHaveLength(2);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "examate-pilot-event",
          newValue: JSON.stringify({ type }),
        }),
      );
    });
    await settleSession(boundary.sessions[1], authenticated());
    expect(
      screen.queryByText("Protected race fixture"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check session" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Check session" }));
    await waitFor(() => expect(boundary!.sessions).toHaveLength(3));
    await settleSession(boundary.sessions[2], anonymous(csrfB), csrfB);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(
      screen.queryByText("Protected race fixture"),
    ).not.toBeInTheDocument();
  },
);

it.each(["logout", "session_changed"])(
  "a fresh check after a tab %s event cannot consume a verification started before that event",
  async (type) => {
    boundary = browserBoundary();
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    gate();
    await settleSession(boundary.sessions[0], authenticated(), csrfA);
    await screen.findByText("Protected race fixture");
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "examate-pilot-event",
          newValue: JSON.stringify({ type }),
        }),
      );
    });
    // User checks again before the pre-event response has arrived.
    fireEvent.click(screen.getByRole("button", { name: "Check session" }));
    await settleSession(boundary.sessions[1], authenticated());
    expect(
      screen.queryByText("Protected race fixture"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(boundary!.sessions).toHaveLength(3));
    await settleSession(boundary.sessions[2], anonymous(csrfB), csrfB);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  },
);

it("regression: denied workspace access invalidates an older pending verification before retry", async () => {
  boundary = browserBoundary();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  gate();
  await settleSession(boundary.sessions[0], authenticated(), csrfA);
  const content = await screen.findByText("Protected race fixture");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => notifyPilotDenied("WORKSPACE_ACCESS_DENIED"));
  fireEvent.click(screen.getByRole("button", { name: "Check session" }));
  await settleSession(boundary.sessions[1], authenticated());
  expect(content).not.toBeVisible();
  await waitFor(() => expect(boundary!.sessions).toHaveLength(3));
  await settleSession(boundary.sessions[2], {
    status: "no_access",
    csrfToken: csrfB,
  });
  expect(content).not.toBeVisible();
  expect(screen.getByText(/chưa được cấp quyền workspace/)).toBeVisible();
});
