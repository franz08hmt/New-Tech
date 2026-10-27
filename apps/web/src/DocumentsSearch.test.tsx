import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { ApiError, type DocumentSearchPage, type StoredDocument } from "./api";
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

// Keep the route-facing prop in this regression before the panel's type is
// extended, so RED reflects the missing lookup behavior rather than a TS error.
const FocusableDocumentsPanel = DocumentsPanel as unknown as ComponentType<{
  focusId?: string;
}>;
const focusView = (
  focusId: string,
  userId = "11111111-1111-4111-8111-111111111111",
  role: "manager" | "member" | "viewer" = "manager",
) => (
  <PilotPrincipalContext.Provider
    value={{
      userId,
      workspaceId: "22222222-2222-4222-8222-222222222222",
      role,
    }}
  >
    <FocusableDocumentsPanel focusId={focusId} />
  </PilotPrincipalContext.Provider>
);

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

it.each([
  ["notes.md", "text/markdown"],
  ["notes.txt", ""],
  [
    "notes.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["notes.doc", "application/msword"],
])(
  "selects %s without auto-upload or indexing and explains PDF conversion",
  async (name, type) => {
    const upload = vi.spyOn(api, "uploadDocument");
    render(view());
    const input = screen.getByLabelText("Choose documents");
    fireEvent.change(input, {
      target: { files: [new File(["fixture"], name, { type })] },
    });
    expect(
      await screen.findByRole("button", { name: `Upload ${name}` }),
    ).toBeEnabled();
    expect(screen.getByText(/converted to PDF on the server/i)).toBeVisible();
    expect(upload).not.toHaveBeenCalled();
    expect(api.processDocument).not.toHaveBeenCalled();
  },
);

describe("Documents server search", () => {
  it("keeps the rows and the pager on screen while the same list is refreshed", async () => {
    render(view());
    expect(await screen.findByText("First.pdf")).toBeVisible();
    const slow = deferred<DocumentSearchPage>();
    vi.mocked(api.searchDocuments).mockReturnValueOnce(slow.promise);
    fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(2));
    // The refresh is in flight: nothing collapsed into a placeholder.
    expect(screen.getByText("First.pdf")).toBeVisible();
    expect(screen.getByText("Second.pdf")).toBeVisible();
    expect(screen.queryByText("Loading documents…")).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Document pages" }),
    ).toBeVisible();
    await act(async () =>
      slow.resolve(page([row(1, "First.pdf"), row(3, "Third.pdf")], {}, 21)),
    );
    expect(await screen.findByText("Third.pdf")).toBeVisible();
    expect(screen.queryByText("Second.pdf")).toBeNull();
  });

  it("still starts from an empty list when the query changes", async () => {
    render(view());
    expect(await screen.findByText("First.pdf")).toBeVisible();
    const slow = deferred<DocumentSearchPage>();
    vi.mocked(api.searchDocuments).mockReturnValueOnce(slow.promise);
    fireEvent.change(screen.getByLabelText("Filter by processing status"), {
      target: { value: "failed" },
    });
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Loading documents…")).toBeVisible();
    expect(screen.queryByText("First.pdf")).toBeNull();
    await act(async () => slow.resolve(page([], {}, 0)));
  });

  it("loads a deep-linked document outside page one by its scoped id", async () => {
    const target = row(99, "Page two target.pdf");
    const lookup = vi.spyOn(api, "getDocument").mockResolvedValue(target);
    render(focusView(target.id));

    expect(
      await screen.findByRole("heading", { name: "Linked document" }),
    ).toBeVisible();
    expect(await screen.findByText(target.name)).toBeVisible();
    expect(lookup).toHaveBeenCalledExactlyOnceWith(
      target.id,
      expect.any(AbortSignal),
    );
    expect(api.searchDocuments).toHaveBeenCalledTimes(1);
    expect(screen.getByText("21 results", { exact: true })).toBeVisible();
  });

  it("does not duplicate a target already present on the current page", async () => {
    const target = row(1, "Already on this page.pdf");
    const lookup = vi.spyOn(api, "getDocument");
    render(focusView(target.id));

    expect(await screen.findByText("First.pdf")).toBeVisible();
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(1));
    expect(lookup).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll(`[data-focus-id="${target.id}"]`),
    ).toHaveLength(1);
  });

  it("shows a filtered-out target separately without changing result totals", async () => {
    const target = row(99, "Filtered target.pdf");
    vi.spyOn(api, "getDocument").mockResolvedValue(target);
    render(focusView(target.id));
    fireEvent.change(screen.getByLabelText("Filter by processing status"), {
      target: { value: "failed" },
    });

    expect(
      await screen.findByText(/outside the current page or filters/i),
    ).toBeVisible();
    expect(api.searchDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ processing_status: "failed" }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText("21 results", { exact: true })).toBeVisible();
    expect(await screen.findByText(target.name)).toBeVisible();
  });

  it("drops an old target response when navigation changes A to B", async () => {
    const first = row(91, "Old linked document.pdf");
    const second = row(92, "Current linked document.pdf");
    const oldRead = deferred<StoredDocument>();
    const newRead = deferred<StoredDocument>();
    const lookup = vi
      .spyOn(api, "getDocument")
      .mockImplementation((id) =>
        id === first.id ? oldRead.promise : newRead.promise,
      );
    const rendered = render(focusView(first.id));
    await waitFor(() =>
      expect(lookup).toHaveBeenCalledWith(first.id, expect.any(AbortSignal)),
    );
    const oldSignal = lookup.mock.calls[0][1]!;

    rendered.rerender(focusView(second.id));
    await waitFor(() =>
      expect(lookup).toHaveBeenCalledWith(second.id, expect.any(AbortSignal)),
    );
    expect(oldSignal.aborted).toBe(true);
    await act(async () => newRead.resolve(second));
    expect(await screen.findByText(second.name)).toBeVisible();
    await act(async () => oldRead.resolve(first));
    expect(screen.queryByText(first.name)).toBeNull();
    expect(screen.getByText(second.name)).toBeVisible();
  });

  it("does not show a delayed focused lookup after principal change", async () => {
    const oldTarget = row(93, "Old principal document.pdf");
    const newTarget = { ...oldTarget, name: "Current principal document.pdf" };
    const oldRead = deferred<StoredDocument>();
    const newRead = deferred<StoredDocument>();
    let calls = 0;
    const lookup = vi
      .spyOn(api, "getDocument")
      .mockImplementation((_id, signal) =>
        signal?.aborted
          ? Promise.reject(new DOMException("Aborted", "AbortError"))
          : ++calls === 1
            ? oldRead.promise
            : newRead.promise,
      );
    const rendered = render(focusView(oldTarget.id));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    rendered.rerender(
      focusView(oldTarget.id, "33333333-3333-4333-8333-333333333333"),
    );
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    await act(async () => newRead.resolve(newTarget));
    expect(await screen.findByText(newTarget.name)).toBeVisible();
    await act(async () => oldRead.resolve(oldTarget));
    expect(screen.queryByText(oldTarget.name)).toBeNull();
    expect(screen.getByText(newTarget.name)).toBeVisible();
  });

  it.each([400, 403, 404])(
    "keeps a denied or missing focused target non-disclosing (%s)",
    async (status) => {
      const target = row(95, "Private target.pdf");
      vi.spyOn(api, "getDocument").mockRejectedValue(
        new ApiError("Sensitive workspace detail", "NOT_FOUND", status),
      );
      render(focusView(target.id));

      expect(
        await screen.findByText(
          /no longer available in the current workspace/i,
        ),
      ).toBeVisible();
      expect(screen.queryByText(target.name)).toBeNull();
      expect(screen.queryByText(/Sensitive workspace detail/)).toBeNull();
    },
  );

  it("keeps focused lookup retry read-only after a transient failure", async () => {
    const target = row(96, "Retry target.pdf");
    const lookup = vi
      .spyOn(api, "getDocument")
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValueOnce(target);
    render(focusView(target.id));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not check this linked document",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry document lookup" }),
    );
    expect(await screen.findByText(target.name)).toBeVisible();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(api.processDocument).not.toHaveBeenCalled();
  });

  it("keeps viewer focused cards read-only", async () => {
    const target = row(97, "Viewer linked document.pdf");
    vi.spyOn(api, "getDocument").mockResolvedValue(target);
    render(focusView(target.id, undefined, "viewer"));

    expect(await screen.findByText(target.name)).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Download ${target.name}` }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: `Index ${target.name}` }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: `Delete ${target.name}` }),
    ).toBeNull();
    expect(screen.getByLabelText(`Course for ${target.name}`)).toBeDisabled();
  });

  it("keeps the focused target while upload refreshes the paged library", async () => {
    const target = row(96, "Existing focused document.pdf");
    const uploaded = row(97, "New upload.pdf");
    vi.spyOn(api, "getDocument").mockResolvedValue(target);
    const upload = vi.spyOn(api, "uploadDocument").mockResolvedValue(uploaded);
    render(focusView(target.id));

    expect(await screen.findByText(target.name)).toBeVisible();
    const file = new File(["%PDF-1.7\n"], uploaded.name, {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose documents"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Upload ${uploaded.name}` }),
    );

    await waitFor(() =>
      expect(upload).toHaveBeenCalledExactlyOnceWith(file, undefined),
    );
    await waitFor(() => expect(api.searchDocuments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getDocument).toHaveBeenCalledTimes(2));
    expect(screen.getByText(target.name)).toBeVisible();
    expect(
      screen.getByText(`${uploaded.name} stored successfully.`),
    ).toBeVisible();
    expect(api.processDocument).not.toHaveBeenCalled();
  });

  it("uses existing assign, re-index and delete handlers for the focused document", async () => {
    const target = row(98, "Manage linked document.pdf");
    const assigned = { ...target, course_id: "course-focused" };
    const reconciled = { ...assigned, processing_status: "ready" as const };
    vi.mocked(useCourses).mockReturnValue({
      courses: [
        {
          id: "course-focused",
          slug: "focused-course",
          name: "Focused course",
          code: "FC-1",
          detail: "",
          progress: 0,
          tone: "slate",
          cover: "",
          cover_alt: "",
          outline: [],
          outcomes: [],
          assessment: [],
          created_at: "2026-10-20T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z",
        },
      ],
      loading: false,
      error: null,
      retry: vi.fn(),
    } as never);
    const lookup = vi
      .spyOn(api, "getDocument")
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(reconciled)
      .mockRejectedValueOnce(
        new ApiError("Not found", "DOCUMENT_NOT_FOUND", 404),
      );
    const process = vi.mocked(api.processDocument);
    process
      .mockResolvedValueOnce({
        document_id: target.id,
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
      })
      .mockRejectedValueOnce(new Error("Lost response"));
    const assign = vi
      .spyOn(api, "setDocumentCourse")
      .mockResolvedValue(assigned);
    const remove = vi.spyOn(api, "deleteDocument").mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(focusView(target.id));
    const focusedCard = () =>
      within(document.querySelector(`[data-focus-id="${target.id}"]`)!);

    expect(await screen.findByText(target.name)).toBeVisible();
    fireEvent.change(screen.getByLabelText(`Course for ${target.name}`), {
      target: { value: "course-focused" },
    });
    await waitFor(() =>
      expect(assign).toHaveBeenCalledExactlyOnceWith(
        target.id,
        "course-focused",
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(`Course for ${target.name}`)).toHaveValue(
        "course-focused",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: `Re-index ${target.name}` }),
    );
    await waitFor(() =>
      expect(api.processDocument).toHaveBeenCalledExactlyOnceWith(target.id),
    );
    expect(
      await focusedCard().findByText(/Searchable content ready/),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: `Re-index ${target.name}` }),
    );
    await waitFor(() => expect(process).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(3));
    expect(
      await focusedCard().findByText(/Searchable content ready/),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Lost response");
    expect(process).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${target.name}` }),
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith(target.id);
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(
        screen.getByText(/no longer available in the current workspace/i),
      ).toBeVisible(),
    );
    expect(screen.queryByText(target.name)).toBeNull();
  });

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
