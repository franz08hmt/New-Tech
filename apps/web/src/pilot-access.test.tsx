import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PilotAccess } from "./PilotAccess";
import { configurePilotClient } from "./pilot-client";
import { api } from "./api";

it.each([
  ["manager", "Manager · Người quản lý"],
  ["member", "Member · Thành viên"],
  ["viewer", "Viewer · Chỉ xem"],
] as const)(
  "shows the verified %s role in the workspace bar",
  async (role, label) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...granted,
          principal: { ...granted.principal, role },
        }),
      ),
    );
    render(
      <PilotAccess>
        <p>Protected fixture</p>
      </PilotAccess>,
    );
    const badge = await screen.findByText(label);
    expect(badge).toBeVisible();
    expect(badge.closest(".pilot-session-bar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  },
);

it("keeps the role visible during a background check, replaces it with the verified one and removes it on logout", async () => {
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/auth/session" && ++reads === 1)
        return Response.json({
          ...granted,
          principal: { ...granted.principal, role: "manager" },
        });
      if (path === "/api/auth/session" && reads === 2)
        return new Promise<Response>((resolve) => {
          drain = () =>
            resolve(
              Response.json({
                ...granted,
                principal: { ...granted.principal, role: "viewer" },
              }),
            );
        });
      return Response.json(anonymous);
    }),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  await screen.findByText("Manager · Người quản lý");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText("Manager · Người quản lý")).toBeVisible();
  await act(async () => drain?.());
  expect(await screen.findByText("Viewer · Chỉ xem")).toBeVisible();
  expect(screen.queryByText("Manager · Người quản lý")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("button", { name: "Sign in" });
  expect(screen.queryByText("Viewer · Chỉ xem")).toBeNull();
});

it("revalidation preserves the page shell, title and focus without exposing the login screen", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const fetcher = vi.fn(async () => {
    if (fetcher.mock.calls.length === 1) return Response.json(granted);
    return new Promise<Response>((resolve) => {
      drain = () => resolve(Response.json(granted));
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <PilotAccess>
      <main data-testid="workspace-shell" style={{ minHeight: 1800 }}>
        <label>
          Current draft
          <input defaultValue="Keep my course draft" />
        </label>
      </main>
    </PilotAccess>,
  );
  const draft = await screen.findByLabelText("Current draft");
  const shell = screen.getByTestId("workspace-shell");
  document.title = "Courses · ExaMate AI";
  draft.focus();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(
    screen.queryByRole("heading", { name: "Sign in to ExaMate" }),
  ).toBeNull();
  expect(shell.closest("[hidden]")).toBeNull();
  expect(shell).toBeVisible();
  expect(shell.closest("[inert]")).toBeNull();
  expect(document.title).toBe("Courses · ExaMate AI");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => drain?.());
  await waitFor(() => expect(shell).toBeVisible());
  expect(screen.getByLabelText("Current draft")).toBe(draft);
  expect(draft).toHaveValue("Keep my course draft");
  expect(draft).toHaveFocus();
});

it.each(["revoked"])(
  "revalidation still locks private content once the answer says access is gone (%s)",
  async (outcome) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (++count === 1) return Response.json(granted);
        return new Promise<Response>((resolve) => {
          drain = () =>
            resolve(
              outcome === "outage"
                ? unavailable()
                : Response.json({
                    status: "no_access",
                    csrfToken: "a".repeat(43),
                  }),
            );
        });
      }),
    );
    render(
      <PilotAccess>
        <button>Private operation</button>
      </PilotAccess>,
    );
    const action = await screen.findByRole("button", {
      name: "Private operation",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      screen.queryByRole("heading", { name: "Sign in to ExaMate" }),
    ).toBeNull();
    expect(action).toBeVisible();
    await act(async () => drain?.());
    await screen.findByRole("heading", { name: "Sign in to ExaMate" });
    expect(action).not.toBeVisible();
    await expect(api.listCourses()).rejects.toThrow(/đang khóa/);
  },
);

it("revalidation cannot restore an old principal after a cross-tab session change", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (++count === 1) return Response.json(granted);
      return new Promise<Response>((resolve) => {
        drain = () => resolve(Response.json(granted));
      });
    }),
  );
  render(
    <PilotAccess>
      <input
        aria-label="Old principal draft"
        defaultValue="Private old draft"
      />
    </PilotAccess>,
  );
  await screen.findByLabelText("Old principal draft");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(
    screen.queryByRole("heading", { name: "Sign in to ExaMate" }),
  ).toBeNull();
  await act(async () =>
    tabChannel.onmessage?.(
      new MessageEvent("message", { data: { type: "session_changed" } }),
    ),
  );
  expect(screen.queryByLabelText("Old principal draft")).toBeNull();
  await act(async () => drain?.());
  expect(screen.queryByLabelText("Old principal draft")).toBeNull();
  expect(screen.getByText(/Phiên đã đổi ở tab khác/)).toBeVisible();
});

const anonymous = { status: "anonymous", csrfToken: "a".repeat(43) };
const granted = {
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
const unavailable = () =>
  Response.json(
    { code: "AUTH_UNAVAILABLE", message: "Synthetic Auth outage" },
    { status: 503 },
  );
let drain: (() => void) | undefined;
const originalTitle = document.title;
let tabChannel: { onmessage: ((event: MessageEvent) => void) | null };

beforeEach(() => {
  // Each test represents its own browser tab. Native Node channels cross
  // Vitest worker boundaries, unlike this test's isolated DOM and HTTP fake.
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() {
        tabChannel = this;
      }
      postMessage() {}
      close() {
        this.onmessage = null;
      }
    },
  );
});

afterEach(async () => {
  cleanup();
  await act(async () => drain?.());
  drain = undefined;
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.title = originalTitle;
});

it("focuses the access heading when the gate first opens", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(anonymous)),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  const heading = screen.getByRole("heading", { level: 1 });
  await waitFor(() => expect(heading).toHaveFocus());
});

it("keeps the same retry control focused during verification and after failure", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (++calls === 1) return unavailable();
      return new Promise<Response>((resolve) => {
        drain = () => resolve(unavailable());
      });
    }),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  await screen.findByRole("alert");
  const retry = screen.getByRole("button", {
    name: /Kiểm tra lại phiên|Check session/,
  });
  retry.focus();
  fireEvent.click(retry);
  await waitFor(() => expect(calls).toBe(2));
  expect(retry).toBeInTheDocument();
  expect(retry).toHaveFocus();
  expect(retry).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(retry);
  expect(calls).toBe(2);
  await act(async () => drain?.());
  await screen.findByRole("alert");
  expect(retry).toHaveFocus();
  expect(retry).toHaveAttribute("aria-disabled", "false");
});

it("preserves an editable sign-in draft and its focus while background verification is pending", async () => {
  const paths: string[] = [];
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path);
      if (paths.length === 1) return Response.json(anonymous);
      return new Promise<Response>((resolve) => {
        drain = () => resolve(Response.json(anonymous));
      });
    }),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  const email = await screen.findByLabelText("Email");
  const password = screen.getByLabelText(/Mật khẩu|Password/);
  fireEvent.change(email, { target: { value: "invited@example.test" } });
  fireEvent.change(password, { target: { value: "synthetic-draft" } });
  password.focus();
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Đang xác minh phiên…");
  expect(password).toBeInTheDocument();
  expect(password).toHaveFocus();
  expect(password).toBeEnabled();
  expect(password).toHaveValue("synthetic-draft");
  const signIn = screen.getByRole("button", { name: "Sign in" });
  expect(signIn).toHaveAttribute("aria-disabled", "true");
  fireEvent.submit(password.closest("form")!);
  expect(paths).not.toContain("/api/auth/login");
  await act(async () => drain?.());
  expect(password).toHaveFocus();
  expect(email).toHaveValue("invited@example.test");
});

it("moves focus from hidden workspace content to the access heading when a focus check finds the session gone", async () => {
  let outage = false;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      outage
        ? Response.json(
            { code: "AUTH_REQUIRED", message: "Session ended" },
            { status: 401 },
          )
        : Response.json(granted),
    ),
  );
  render(
    <PilotAccess>
      <button>Private action</button>
      <input aria-label="Workspace draft" defaultValue="Keep this draft" />
    </PilotAccess>,
  );
  const action = await screen.findByRole("button", { name: "Private action" });
  action.focus();
  outage = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(action).not.toBeVisible());
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  expect(screen.getByLabelText("Workspace draft")).toHaveValue(
    "Keep this draft",
  );
});

it("locks the sign-in gate when its own tab receives a session change", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(anonymous)),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  const password = await screen.findByLabelText("Password");
  password.focus();
  await act(async () => {
    tabChannel.onmessage?.(
      new MessageEvent("message", { data: { type: "session_changed" } }),
    );
  });
  expect(
    screen.getByText(
      "Phiên đã đổi ở tab khác. Kiểm tra lại trước khi tiếp tục.",
    ),
  ).toBeInTheDocument();
  expect(password).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Check session" }));
  expect(await screen.findByLabelText("Password")).toBeEnabled();
});

it("uses English control labels and a sign-in document title on the access page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(anonymous)),
  );
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  await screen.findByRole("button", { name: "Sign in" });
  expect(
    screen.getByRole("heading", { name: "Sign in to ExaMate" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(screen.getByRole("button", { name: "Check session" })).toBeVisible();
  expect(document.title).toBe("Sign in · ExaMate AI");
});

it.each([
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "SESSION_REFRESH_REQUIRED",
  "CSRF_INVALID",
])(
  "requires an explicit fresh session after sign-in receives %s, without replaying the password",
  async (code) => {
    const paths: string[] = [];
    let sessions = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        paths.push(path);
        return path === "/api/auth/session"
          ? Response.json({
              ...anonymous,
              csrfToken: (++sessions === 1 ? "a" : "b").repeat(43),
            })
          : Response.json(
              { code, message: "Synthetic stale pre-login session" },
              { status: code === "CSRF_INVALID" ? 403 : 401 },
            );
      }),
    );
    render(
      <PilotAccess>
        <p>Protected fixture</p>
      </PilotAccess>,
    );
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "invited@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "synthetic-only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(
      /Chưa đăng nhập được|Phiên gửi yêu cầu|Phiên đăng nhập/,
    );
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(paths.filter((p) => p !== "/api/auth/google/status")).toEqual([
      "/api/auth/session",
      "/api/auth/login",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Check session" }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(paths.filter((p) => p !== "/api/auth/google/status")).toEqual([
      "/api/auth/session",
      "/api/auth/login",
      "/api/auth/session",
    ]);
  },
);
