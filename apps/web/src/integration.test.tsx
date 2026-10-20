import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp as App } from "./App";
import { configurePilotClient } from "./pilot-client";
import { api, request } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
beforeEach(() => configurePilotClient("a".repeat(43), true));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const task = {
  id: "task-1",
  title: "Review backend",
  status: "todo",
  owner_name: "Tài",
  due_date: null,
};
const documentRow = {
  id: "doc-1",
  name: "saved.pdf",
  media_type: "application/pdf",
  size_bytes: 100,
  storage_status: "stored",
};
const documentPage = (url: string) =>
  Response.json({
    items: [documentRow],
    page: Number(
      new URL(url, "http://127.0.0.1").searchParams.get("page") ?? 1,
    ),
    pageSize: Number(
      new URL(url, "http://127.0.0.1").searchParams.get("pageSize") ?? 20,
    ),
    total: 1,
    totalPages: 1,
  });
// Existing document CRUD regressions require the verified manager capability.
// Viewer/member/no-principal affordances are covered by DocumentsPermissions.
function DocumentsApp() {
  return (
    <PilotPrincipalContext.Provider
      value={{
        userId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        role: "manager",
      }}
    >
      <App />
    </PilotPrincipalContext.Provider>
  );
}

it("loads stored documents after remount, downloads and deletes through API", async () => {
  window.history.replaceState(null, "", "/#documents");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/download"))
        return Response.json({
          url: "https://storage.example.test/file",
          expiresIn: 60,
        });
      if (url.startsWith("/api/documents/search")) return documentPage(url);
      return Response.json(url === "/api/documents" ? [documentRow] : []);
    }),
  );
  const first = render(<DocumentsApp />);
  expect(await screen.findByText("saved.pdf")).toBeVisible();
  first.unmount();
  render(<DocumentsApp />);
  expect(await screen.findByText("saved.pdf")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Download saved.pdf" }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Delete saved.pdf" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete saved.pdf" }));
  await waitFor(() =>
    expect(screen.queryByText("saved.pdf")).not.toBeInTheDocument(),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/documents/doc-1",
    expect.objectContaining({ method: "DELETE" }),
  );
});
it("keeps stored document visible when delete fails and retries a failed list", async () => {
  window.history.replaceState(null, "", "/#documents");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let lists = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Response.json(
          { message: "Storage unavailable" },
          { status: 503 },
        );
      if (url.startsWith("/api/documents/search") && ++lists === 1)
        throw new Error("offline");
      if (url.startsWith("/api/documents/search")) return documentPage(url);
      return Response.json(url === "/api/documents" ? [documentRow] : []);
    }),
  );
  render(<DocumentsApp />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach");
  fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
  await screen.findByText("saved.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Delete saved.pdf" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Storage unavailable",
  );
  expect(await screen.findByText("saved.pdf")).toBeVisible();
});
it("updates task status using server response and shows failed submission", async () => {
  window.history.replaceState(null, "", "/#tasks");
  let currentTask = task;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        currentTask = { ...task, status: "done" };
        return Response.json(currentTask);
      }
      if (init?.method === "POST")
        return Response.json(
          { message: ["title is invalid"], requestId: "demo-request" },
          { status: 400 },
        );
      if (url.startsWith("/api/tasks/search"))
        return Response.json({
          items: [currentTask],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          summary: { total: 1, done: currentTask.status === "done" ? 1 : 0 },
        });
      return Response.json([currentTask]);
    }),
  );
  render(
    <PilotPrincipalContext.Provider
      value={{
        userId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        role: "member",
      }}
    >
      <App />
    </PilotPrincipalContext.Provider>,
  );
  await screen.findByText(task.title);
  fireEvent.change(screen.getByLabelText(`Status for ${task.title}`), {
    target: { value: "done" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText(`Status for ${task.title}`)).toHaveValue(
      "done",
    ),
  );
  fireEvent.change(screen.getByLabelText("Task title"), {
    target: { value: "Valid client title" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("demo-request");
  expect(
    screen.queryByText("Task added successfully."),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Task title")).toHaveValue("Valid client title");
});
it("API client handles proxy HTML, no-content and timeout without leaking HTML", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<html>nginx failure</html>", { status: 502 }),
      ),
  );
  await expect(api.listDocuments()).rejects.toThrow("Service is unavailable");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  await expect(api.deleteDocument("id")).resolves.toBeUndefined();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_path, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new Error("abort")),
          ),
        ),
    ),
  );
  const pending = expect(request("/api/tasks")).rejects.toThrow(
    "Reload the list before retrying",
  );
  await vi.advanceTimersByTimeAsync(60000);
  await pending;
});
