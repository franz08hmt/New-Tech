import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import App from "./App";
import { PilotAccess } from "./PilotAccess";
import { api } from "./api";
import { configurePilotClient } from "./pilot-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  configurePilotClient();
});
const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member",
};
const granted = {
  status: "authenticated",
  csrfToken: "a".repeat(43),
  principal,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};
it("production App stays locked and sends no workspace request before login", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/session"
      ? Response.json({ status: "anonymous", csrfToken: "a".repeat(43) })
      : Response.json(
          url === "/api/assistant/status"
            ? { status: "not_configured" }
            : url === "/api/health"
              ? { status: "ok" }
              : [],
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Đăng nhập" }),
    ).toBeInTheDocument(),
  );
  expect(fetcher.mock.calls.every(([url]) => url === "/api/auth/session")).toBe(
    true,
  );
});
it("authorized production App records a mock initial page-load request inventory", async () => {
  window.history.replaceState(null, "", "/#dashboard");
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url === "/api/auth/session"
        ? granted
        : url === "/api/health"
          ? { status: "ok" }
          : [],
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await screen.findByRole("heading", { name: "Student academic dashboard" });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  const paths = fetcher.mock.calls.map(([url]) => url);
  expect(paths).toContain("/api/auth/session");
  expect(paths).toContain("/api/tasks");
  expect(paths).toContain("/api/courses");
  expect(paths).toContain("/api/documents");
  expect(paths).toEqual([
    "/api/auth/session",
    "/api/exams",
    "/api/courses",
    "/api/study-plans",
    "/api/courses",
    "/api/tasks",
    "/api/documents",
    "/api/courses",
  ]);
});
it("login uses cookie credentials and CSRF; invalid credentials retain a usable login form", async () => {
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) =>
    url === "/api/auth/session"
      ? Response.json({ status: "anonymous", csrfToken: "a".repeat(43) })
      : Response.json(
          { code: "AUTH_INVALID", message: "fixture" },
          { status: 401 },
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <PilotAccess>
      <p>Protected fixture</p>
    </PilotAccess>,
  );
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "fixture@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await screen.findByText(/Email hoặc mật khẩu chưa đúng/);
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
  const call = fetcher.mock.calls.find(([url]) => url === "/api/auth/login")!;
  const init = call[1] as RequestInit;
  expect(init.credentials).toBe("same-origin");
  expect(init.headers).toMatchObject({ "X-CSRF-Token": "a".repeat(43) });
});
it("Auth outage locks UI without losing draft; retry logout retains CSRF and confirms only after response", async () => {
  let outage = false,
    loggedOut = false;
  const fetcher = vi.fn(async (url: string) => {
    if (url === "/api/auth/session")
      return Response.json(
        loggedOut
          ? { status: "anonymous", csrfToken: "b".repeat(43) }
          : granted,
      );
    if (url === "/api/auth/logout") {
      if (outage) throw Error("fixture offline");
      loggedOut = true;
      return Response.json({ status: "signed_out", upstreamRevoked: true });
    }
    return Response.json(
      { code: "AUTH_UNAVAILABLE", message: "fixture outage" },
      { status: 503 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <PilotAccess>
      <label>
        Draft
        <input defaultValue="Keep this draft" />
      </label>
    </PilotAccess>,
  );
  await screen.findByLabelText("Draft");
  await act(async () => {
    await api.listTasks().catch(() => {});
  });
  expect(screen.getByLabelText("Draft")).toHaveValue("Keep this draft");
  expect(screen.getByLabelText("Draft")).not.toBeVisible();
  outage = true;
  fireEvent.click(screen.getByRole("button", { name: "Thử đăng xuất" }));
  await screen.findByText(/Chưa xác nhận được đăng xuất/);
  expect(screen.queryByText("Đã đăng xuất.")).not.toBeInTheDocument();
  outage = false;
  fireEvent.click(screen.getByRole("button", { name: "Thử đăng xuất" }));
  await screen.findByText("Đã đăng xuất.");
  expect(
    fetcher.mock.calls.filter(([url]) => url === "/api/auth/logout"),
  ).toHaveLength(2);
  expect(screen.queryByLabelText("Draft")).not.toBeInTheDocument();
});
it("legacy notes stay hidden and workspace access without membership is denied", async () => {
  localStorage.setItem(
    "examate-notes",
    JSON.stringify(["Legacy private fixture"]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(granted)),
  );
  const view = render(
    <PilotAccess>
      <p>Authorized fixture</p>
    </PilotAccess>,
  );
  await screen.findByText(/Ghi chú cũ trên trình duyệt đang được ẩn/);
  expect(localStorage.getItem("examate-notes")).toContain(
    "Legacy private fixture",
  );
  expect(screen.queryByText("Legacy private fixture")).not.toBeInTheDocument();
  view.unmount();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ status: "no_access", csrfToken: "a".repeat(43) }),
    ),
  );
  render(
    <PilotAccess>
      <p>Unauthorized fixture</p>
    </PilotAccess>,
  );
  await screen.findByText(/chưa được cấp quyền workspace/);
  expect(screen.queryByText("Unauthorized fixture")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thử đăng xuất" })).toBeEnabled();
});
