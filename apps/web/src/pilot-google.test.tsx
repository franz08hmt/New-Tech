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
import { navigateGoogle } from "./pilot-google";
vi.mock("./pilot-google", async (original) => ({
  ...(await original<typeof import("./pilot-google")>()),
  navigateGoogle: vi.fn(),
}));
const anonymous = { status: "anonymous", csrfToken: "a".repeat(43) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      postMessage() {}
      close() {}
    },
  );
});

it("a Google start response after unmount cannot navigate or replay", async () => {
  let release!: (response: Response) => void;
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path);
      if (path === "/api/auth/session") return Response.json(anonymous);
      if (path === "/api/auth/google/status")
        return Response.json({ status: "enabled" });
      return new Promise<Response>((resolve) => (release = resolve));
    }),
  );
  const view = render(
    <PilotAccess>
      <p>Protected</p>
    </PilotAccess>,
  );
  const button = await screen.findByRole("button", {
    name: "Đăng nhập bằng Google",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await waitFor(() => expect(release).toBeDefined());
  view.unmount();
  await act(async () =>
    release(
      Response.json({
        authorizationUrl:
          "https://fixture.supabase.test/auth/v1/authorize?provider=google",
      }),
    ),
  );
  expect(navigateGoogle).not.toHaveBeenCalled();
  expect(paths.filter((p) => p.endsWith("/start"))).toHaveLength(1);
});
afterEach(() => {
  cleanup();
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});
it("Google button is a separate keyboard button; start is serialized with CSRF, no password submit or auto retry", async () => {
  const paths: string[] = [];
  let finish: () => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (path === "/api/auth/session") return Response.json(anonymous);
      if (path === "/api/auth/google/status")
        return Response.json({ status: "enabled" });
      expect(path).toBe("/api/auth/google/start");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
        anonymous.csrfToken,
      );
      await new Promise<void>((r) => (finish = r));
      return Response.json(
        {
          code: "OAUTH_RESTART_REQUIRED",
          message: "Hãy bắt đầu lại đăng nhập Google.",
        },
        { status: 400 },
      );
    }),
  );
  render(
    <PilotAccess>
      <p>Protected</p>
    </PilotAccess>,
  );
  const button = await screen.findByRole("button", {
    name: "Đăng nhập bằng Google",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(button).toHaveAttribute("type", "button");
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() =>
    expect(paths.filter((p) => p.endsWith("/start"))).toHaveLength(1),
  );
  expect(paths).not.toContain("/api/auth/login");
  await act(async () => finish());
  await screen.findByText(/bắt đầu lại đăng nhập Google/);
  expect(paths.filter((p) => p.endsWith("/start"))).toHaveLength(1);
});
it("not configured Google is explicit and leaves password login available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path === "/api/auth/session" ? anonymous : { status: "not_configured" },
      ),
    ),
  );
  render(
    <PilotAccess>
      <p>Protected</p>
    </PilotAccess>,
  );
  const google = await screen.findByRole("button", {
    name: "Đăng nhập bằng Google",
  });
  await waitFor(() => expect(google).toBeDisabled());
  expect(await screen.findByText(/Google chưa được bật/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
});
it("clean allowlisted callback result is consumed without reflecting arbitrary query or replaying login", async () => {
  history.replaceState(
    null,
    "",
    "/?oauth=cancelled&error_description=PRIVATE_SENTINEL",
  );
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path);
      return Response.json(
        path === "/api/auth/session" ? anonymous : { status: "enabled" },
      );
    }),
  );
  render(
    <PilotAccess>
      <p>Protected</p>
    </PilotAccess>,
  );
  await screen.findByText(/đã hủy đăng nhập Google/i);
  expect(location.search).toBe("");
  expect(document.body.textContent).not.toContain("PRIVATE_SENTINEL");
  expect(paths.some((p) => p.endsWith("/start") || p.endsWith("/login"))).toBe(
    false,
  );
});
