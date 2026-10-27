import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useContext } from "react";
import { PilotAccess } from "./PilotAccess";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { configurePilotClient } from "./pilot-client";
import { api } from "./api";

const granted = (role: "manager" | "member" | "viewer" = "member") => ({
  status: "authenticated",
  csrfToken: "a".repeat(43),
  principal: {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role,
  },
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
});
let release: (() => void) | undefined;
let sessionReads = 0;

/** First session read answers at once; later ones wait until `release()`. */
function stubSession(
  later: () => Response | Promise<Response>,
  courses: () => Response = () => Response.json([]),
) {
  sessionReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/auth/session") {
        if (++sessionReads === 1) return Response.json(granted("manager"));
        return new Promise<Response>((resolve) => {
          release = () => resolve(later());
        });
      }
      if (path.startsWith("/api/courses")) return courses();
      return Response.json({});
    }),
  );
}

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {}
      close() {
        this.onmessage = null;
      }
    },
  );
});

afterEach(async () => {
  cleanup();
  await act(async () => release?.());
  release = undefined;
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Shell() {
  return (
    <main data-testid="shell" style={{ minHeight: 1800 }}>
      <label>
        Draft
        <input defaultValue="my draft" />
      </label>
    </main>
  );
}

it("a focus revalidation of an authenticated session does not hide or lock the workspace", async () => {
  stubSession(() => Response.json(granted("manager")));
  render(
    <PilotAccess>
      <Shell />
    </PilotAccess>,
  );
  const draft = await screen.findByLabelText("Draft");
  const shell = screen.getByTestId("shell");
  draft.focus();
  await act(async () => window.dispatchEvent(new Event("focus")));
  // The check is in flight, yet nothing visible changed.
  expect(sessionReads).toBe(2);
  expect(shell).toBeVisible();
  expect(shell.closest("[inert]")).toBeNull();
  expect(screen.queryByText("Checking workspace access")).toBeNull();
  expect(draft).toHaveFocus();
  // Work during the check is not blocked by the client (the server still
  // authorizes every request).
  await expect(api.listCourses()).resolves.toBeDefined();
  await act(async () => release?.());
  expect(shell).toBeVisible();
  expect(screen.getByLabelText("Draft")).toBe(draft);
});

it("an unchanged principal keeps its object identity so consumers do not refetch", async () => {
  stubSession(() => Response.json(granted("manager")));
  const seen = new Set<unknown>();
  function Probe() {
    seen.add(useContext(PilotPrincipalContext));
    return <p>probe</p>;
  }
  render(
    <PilotAccess>
      <Probe />
    </PilotAccess>,
  );
  await screen.findByText("probe");
  const before = seen.size;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => release?.());
  expect(seen.size).toBe(before);
});

it("a silent revalidation that finds another role updates it without a hidden state", async () => {
  stubSession(() => Response.json(granted("viewer")));
  render(
    <PilotAccess>
      <Shell />
    </PilotAccess>,
  );
  await screen.findByText("Manager · Người quản lý");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText("Manager · Người quản lý")).toBeVisible();
  await act(async () => release?.());
  await waitFor(() =>
    expect(screen.queryByText("Manager · Người quản lý")).toBeNull(),
  );
  expect(screen.queryByText("Viewer · Chỉ xem")).toBeNull();
  expect(screen.getByTestId("shell")).toBeVisible();
});

it("a silent revalidation answered 401 locks the workspace", async () => {
  stubSession(() =>
    Response.json({ code: "AUTH_REQUIRED", message: "x" }, { status: 401 }),
  );
  render(
    <PilotAccess>
      <Shell />
    </PilotAccess>,
  );
  const shell = (await screen.findByLabelText("Draft")).closest("main")!;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(shell).toBeVisible();
  await act(async () => release?.());
  await waitFor(() => expect(shell).not.toBeVisible());
  expect(screen.getByText(/Phiên đã hết hạn/)).toBeVisible();
});

it("a transient outage during a silent revalidation keeps the page usable", async () => {
  stubSession(() =>
    Response.json(
      { code: "AUTH_UNAVAILABLE", message: "Synthetic Auth outage" },
      { status: 503 },
    ),
  );
  render(
    <PilotAccess>
      <Shell />
    </PilotAccess>,
  );
  const draft = await screen.findByLabelText("Draft");
  const shell = screen.getByTestId("shell");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => release?.());
  expect(shell).toBeVisible();
  expect(shell.closest("[inert]")).toBeNull();
  expect(screen.getByLabelText("Draft")).toBe(draft);
});

it("the explicit Check session button still shows the verifying gate", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ status: "anonymous", csrfToken: "a".repeat(43) }),
    ),
  );
  render(
    <PilotAccess>
      <Shell />
    </PilotAccess>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Check session" }));
  expect(
    screen.getByRole("heading", { name: "Sign in to ExaMate" }),
  ).toBeVisible();
});
