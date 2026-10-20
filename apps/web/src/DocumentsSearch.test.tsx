import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSearchPage, StoredDocument } from "./api";
import { api } from "./api";
import { DocumentsPanel } from "./DocumentsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";

vi.mock("./use-courses", () => ({ useCourses: vi.fn() }));

const row = (id: number, name: string): StoredDocument => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  name,
  media_type: "application/pdf",
  size_bytes: 100,
  storage_status: "stored",
  processing_status: "ready",
  index_quality: null,
  course_id: null,
  course_slug: null,
  course_name: null,
  course_code: null,
  created_at: "2026-10-20T00:00:00.000Z",
  updated_at: "2026-10-20T00:00:00.000Z",
});

function page(
  items: StoredDocument[],
  query: { page?: number; pageSize?: number } = {},
  total = items.length,
): DocumentSearchPage {
  const pageNumber = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return {
    items,
    page: pageNumber,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function view(
  principal = {
    userId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    role: "manager" as const,
  },
) {
  return (
    <PilotPrincipalContext.Provider value={principal}>
      <DocumentsPanel />
    </PilotPrincipalContext.Provider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(useCourses).mockReturnValue({
    courses: [],
    loading: false,
    error: null,
    retry: vi.fn(),
  });
  vi.spyOn(api, "searchDocuments").mockResolvedValue(
    page([row(1, "First.pdf"), row(2, "Second.pdf")], {}, 21),
  );
  vi.spyOn(api, "processDocument").mockResolvedValue({
    document_id: row(1, "First.pdf").id,
    processing_status: "ready",
    chunk_count: 1,
    indexed_at: "2026-10-20T00:00:00.000Z",
    index_quality: {
      total_page_count: 1,
      useful_text_page_count: 1,
      low_text_page_count: 0,
      indexed_chunk_count: 1,
      skipped_page_numbers: [],
      needs_ocr: false,
      ocr_page_count: 0,
      ocr_page_numbers: [],
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Documents server search", () => {
  it("sends bounded query controls to the server and resets pagination on filter changes", async () => {
    render(view());
    await screen.findByText("First.pdf");
    expect(api.searchDocuments).toHaveBeenNthCalledWith(
      1,
      {
        q: undefined,
        course: "all",
        storage_status: undefined,
        processing_status: undefined,
        sort: "created_at",
        direction: "desc",
        page: 1,
        pageSize: 20,
      },
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(api.searchDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 }),
        expect.any(AbortSignal),
      ),
    );

    fireEvent.change(screen.getByLabelText("Filter by course"), {
      target: { value: "none" },
    });
    await waitFor(() =>
      expect(api.searchDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ course: "unassigned", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Filter by storage status"), {
      target: { value: "stored" },
    });
    fireEvent.change(screen.getByLabelText("Filter by processing status"), {
      target: { value: "ready" },
    });
    fireEvent.change(screen.getByLabelText("Sort documents by"), {
      target: { value: "name" },
    });
    fireEvent.change(screen.getByLabelText("Sort direction"), {
      target: { value: "asc" },
    });
    fireEvent.change(screen.getByLabelText("Results per page"), {
      target: { value: "50" },
    });
    await waitFor(() =>
      expect(api.searchDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({
          course: "unassigned",
          storage_status: "stored",
          processing_status: "ready",
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 50,
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("debounces metadata search and drops an older page response", async () => {
    const oldRead = deferred<DocumentSearchPage>();
    const newRead = deferred<DocumentSearchPage>();
    vi.mocked(api.searchDocuments)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    render(view());
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "  thuật-toán%_draft  " },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(2));
    expect(api.searchDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "thuật-toán%_draft", page: 1 }),
      expect.any(AbortSignal),
    );
    await act(async () => newRead.resolve(page([row(3, "Newest result.pdf")])));
    expect(await screen.findByText("Newest result.pdf")).toBeVisible();
    await act(async () => oldRead.resolve(page([row(4, "Stale result.pdf")])));
    expect(screen.queryByText("Stale result.pdf")).toBeNull();
    expect(screen.getByText("Newest result.pdf")).toBeVisible();
    expect(api.processDocument).not.toHaveBeenCalled();
  });

  it("shows a read failure distinctly and retries only GET", async () => {
    vi.mocked(api.searchDocuments)
      .mockRejectedValueOnce(new Error("Read unavailable"))
      .mockResolvedValueOnce(page([row(5, "Recovered.pdf")]));
    render(view());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Read unavailable",
    );
    expect(screen.queryByText(/Chưa có tài liệu nào/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
    expect(await screen.findByText("Recovered.pdf")).toBeVisible();
    expect(api.searchDocuments).toHaveBeenCalledTimes(2);
    expect(api.processDocument).not.toHaveBeenCalled();
  });

  it("distinguishes an empty library from a filtered no-match result", async () => {
    vi.mocked(api.searchDocuments)
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]));
    render(view());
    expect(await screen.findByText(/Chưa có tài liệu nào/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "missing metadata" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(
      await screen.findByText(/Không tìm thấy tài liệu phù hợp/),
    ).toBeVisible();
    expect(screen.queryByText(/Chưa có tài liệu nào/)).toBeNull();
  });

  it("does not render a delayed response from a previous principal", async () => {
    const oldRead = deferred<DocumentSearchPage>();
    const newRead = deferred<DocumentSearchPage>();
    vi.mocked(api.searchDocuments)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    const rendered = render(view());
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(1));
    rendered.rerender(
      view({
        userId: "33333333-3333-4333-8333-333333333333",
        workspaceId: "44444444-4444-4444-8444-444444444444",
        role: "manager",
      }),
    );
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(2));
    await act(async () =>
      newRead.resolve(page([row(6, "Current tenant.pdf")])),
    );
    expect(await screen.findByText("Current tenant.pdf")).toBeVisible();
    await act(async () => oldRead.resolve(page([row(7, "Old tenant.pdf")])));
    expect(screen.queryByText("Old tenant.pdf")).toBeNull();
    expect(screen.getByText("Current tenant.pdf")).toBeVisible();
  });
});
