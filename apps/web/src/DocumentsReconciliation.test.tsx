import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError, type StoredDocument } from "./api";
import { DocumentsPanel } from "./DocumentsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";

vi.mock("./use-courses", () => ({ useCourses: vi.fn() }));
// The future transport is mocked before the UI fix so RED measures behavior,
// rather than a missing import or real network call.
vi.mock("./api", async (original) => {
  const module = await original<typeof import("./api")>();
  return { ...module, api: { ...module.api, getDocument: vi.fn() } };
});
const getDocument = vi.mocked(
  (
    api as typeof api & {
      getDocument(id: string): Promise<StoredDocument>;
    }
  ).getDocument,
);
const item: StoredDocument = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Synthetic A.pdf",
  media_type: "application/pdf",
  size_bytes: 100,
  storage_status: "stored",
  processing_status: "pending",
  index_quality: null,
  course_id: null,
  course_name: null,
  course_code: null,
  course_slug: null,
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
};
const other = {
  ...item,
  id: "00000000-0000-4000-8000-000000000002",
  name: "Synthetic B.pdf",
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const view = (userId = "00000000-0000-4000-8000-000000000010") => (
  <PilotPrincipalContext.Provider
    value={{
      userId,
      workspaceId: "00000000-0000-4000-8000-000000000020",
      role: "manager",
    }}
  >
    <DocumentsPanel />
  </PilotPrincipalContext.Provider>
);
async function start(document = item) {
  await screen.findByRole("button", { name: `Index ${document.name}` });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: `Index ${document.name}` }),
    );
  });
}
const card = (name = item.name) =>
  within(screen.getByText(name).closest("article")!);
beforeEach(() => {
  vi.mocked(useCourses).mockReturnValue({
    courses: [],
    loading: false,
    error: "",
    reload: vi.fn(),
  } as never);
  vi.spyOn(api, "searchDocuments").mockResolvedValue({
    items: [item, other],
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  });
  vi.spyOn(api, "processDocument").mockRejectedValue(
    new Error("Request ACK unavailable"),
  );
  getDocument.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["ready", "Searchable content ready", "Re-index", true],
  ["processing", "Processing…", "Index", false],
  ["failed", "Failed, retry available", "Retry indexing", true],
  ["pending", "Waiting to be indexed", "Index", true],
] as const)(
  "reconciles rejected POST to server %s with exactly one POST/GET",
  async (state, text, action, enabled) => {
    getDocument.mockResolvedValue({ ...item, processing_status: state });
    render(view());
    await start();
    expect(card().getByText(new RegExp(text))).toBeVisible();
    const button = card().getByRole("button", {
      name: `${action} ${item.name}`,
    });
    if (enabled) expect(button).toBeEnabled();
    else expect(button).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Request ACK unavailable",
    );
    expect(api.processDocument).toHaveBeenCalledExactlyOnceWith(item.id);
    expect(getDocument).toHaveBeenCalledExactlyOnceWith(item.id);
  },
);

it("shows ready quality from GET rather than the pre-request snapshot", async () => {
  getDocument.mockResolvedValue({
    ...item,
    processing_status: "ready",
    index_quality: {
      total_page_count: 3,
      useful_text_page_count: 2,
      low_text_page_count: 1,
      indexed_chunk_count: 4,
      skipped_page_numbers: [3],
      needs_ocr: true,
      ocr_page_count: 0,
      ocr_page_numbers: [],
    },
  });
  render(view());
  await start();
  expect(card().getByText(/đọc được 2\/3 trang/i)).toBeVisible();
});

it("GET failure keeps uncertainty and only a manual read checks again", async () => {
  getDocument
    .mockRejectedValueOnce(new Error("read unavailable"))
    .mockResolvedValueOnce({ ...item, processing_status: "ready" });
  render(view());
  await start();
  expect(card().getByText(/chưa xác nhận/i)).toBeVisible();
  expect(
    card().getByRole("button", { name: `Index ${item.name}` }),
  ).toBeDisabled();
  expect(getDocument).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.click(
      card().getByRole("button", { name: `Check index status ${item.name}` }),
    );
  });
  expect(card().getByText(/Searchable content ready/)).toBeVisible();
  expect(api.processDocument).toHaveBeenCalledTimes(1);
  expect(getDocument).toHaveBeenCalledTimes(2);
});

it("404 removes only the inaccessible row", async () => {
  getDocument.mockRejectedValue(
    new ApiError("Not found", "DOCUMENT_NOT_FOUND", 404),
  );
  render(view());
  await start();
  expect(screen.queryByText(item.name)).toBeNull();
  expect(screen.getByText(other.name)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Request ACK unavailable",
  );
});
it.each([401, 403])("GET %s never enables a write retry", async (status) => {
  getDocument.mockRejectedValue(
    new ApiError("Access denied", "WORKSPACE_ACCESS_DENIED", status),
  );
  render(view());
  await start();
  expect(
    card().getByRole("button", { name: `Index ${item.name}` }),
  ).toBeDisabled();
  expect(
    card().queryByRole("button", { name: `Check index status ${item.name}` }),
  ).toBeNull();
  expect(api.processDocument).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  });
  expect(
    card().getByRole("button", { name: `Index ${item.name}` }),
  ).toBeDisabled();
});

it.each(["legacy", "deleting"] as const)(
  "GET retains server storage lifecycle %s",
  async (storage_status) => {
    getDocument.mockResolvedValue({ ...item, storage_status });
    render(view());
    await start();
    expect(
      card().getByRole("button", { name: `Index ${item.name}` }),
    ).toBeDisabled();
    expect(
      card().getByText(
        storage_status === "legacy" ? /Legacy metadata/ : /Deletion pending/,
      ),
    ).toBeVisible();
  },
);

it("unmount before POST rejection does not start reconciliation", async () => {
  const pending = deferred<never>();
  vi.mocked(api.processDocument).mockReturnValue(pending.promise);
  const rendered = render(view());
  await start();
  rendered.unmount();
  await act(async () => {
    pending.reject(Error("late"));
  });
  expect(getDocument).not.toHaveBeenCalled();
});
it("account change before POST rejection does not start reconciliation", async () => {
  const pending = deferred<never>();
  vi.mocked(api.processDocument).mockReturnValue(pending.promise);
  const rendered = render(view());
  await start();
  rendered.rerender(view("00000000-0000-4000-8000-000000000011"));
  await act(async () => {
    pending.reject(Error("old account"));
  });
  expect(getDocument).not.toHaveBeenCalled();
});
it("late GET from an old account cannot overwrite the new account's row", async () => {
  const pending = deferred<StoredDocument>();
  getDocument.mockReturnValue(pending.promise);
  const rendered = render(view());
  await start();
  rendered.rerender(view("00000000-0000-4000-8000-000000000011"));
  await screen.findByRole("button", { name: `Index ${item.name}` });
  await act(async () => {
    pending.resolve({ ...item, processing_status: "ready" });
  });
  expect(card().queryByText(/Searchable content ready/)).toBeNull();
});
it("independent document operations update only their own rows", async () => {
  const pending = deferred<StoredDocument>();
  getDocument.mockImplementation((id) =>
    id === item.id
      ? pending.promise
      : Promise.resolve({ ...other, processing_status: "failed" }),
  );
  render(view());
  await start();
  await start(other);
  expect(card(other.name).getByText(/Failed, retry available/)).toBeVisible();
  await act(async () => {
    pending.resolve({ ...item, processing_status: "ready" });
  });
  expect(card().getByText(/Searchable content ready/)).toBeVisible();
  expect(card(other.name).getByText(/Failed, retry available/)).toBeVisible();
  expect(api.processDocument).toHaveBeenCalledTimes(2);
});
