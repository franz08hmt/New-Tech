import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { api, request } from "./api";

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
      return Response.json(url === "/api/documents" ? [documentRow] : []);
    }),
  );
  const first = render(<App />);
  expect(await screen.findByText("saved.pdf")).toBeVisible();
  first.unmount();
  render(<App />);
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
      if (url === "/api/documents" && ++lists === 1) throw new Error("offline");
      return Response.json(url === "/api/documents" ? [documentRow] : []);
    }),
  );
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach");
  fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
  await screen.findByText("saved.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Delete saved.pdf" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Storage unavailable",
  );
  expect(screen.getByText("saved.pdf")).toBeVisible();
});
it("updates task status using server response and shows failed submission", async () => {
  window.history.replaceState(null, "", "/#tasks");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return Response.json({ ...task, status: "done" });
      if (init?.method === "POST")
        return Response.json(
          { message: ["title is invalid"], requestId: "demo-request" },
          { status: 400 },
        );
      return Response.json([task]);
    }),
  );
  render(<App />);
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
