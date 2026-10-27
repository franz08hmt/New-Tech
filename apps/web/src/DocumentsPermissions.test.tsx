import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import type { PilotPrincipal } from "@examate/contracts";
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
import { api, ApiError, type Course, type StoredDocument } from "./api";
import { CourseWorkspace } from "./CourseWorkspace";
import { DocumentsPanel } from "./DocumentsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useCourses } from "./use-courses";
import { useDocuments, type DocumentsState } from "./use-documents";
import { useExams } from "./use-exams";
import { useExpenses } from "./use-expenses";
import { useStudyPlans } from "./use-study-plans";

vi.mock("./use-courses", () => ({ useCourses: vi.fn() }));
vi.mock("./use-documents", () => ({ useDocuments: vi.fn() }));
vi.mock("./use-exams", async (original) => ({
  ...(await original<typeof import("./use-exams")>()),
  useExams: vi.fn(),
}));
vi.mock("./use-expenses", async (original) => ({
  ...(await original<typeof import("./use-expenses")>()),
  useExpenses: vi.fn(),
}));
vi.mock("./use-study-plans", async (original) => ({
  ...(await original<typeof import("./use-study-plans")>()),
  useStudyPlans: vi.fn(),
}));

const timestamp = "2026-10-14T00:00:00.000Z";
const course: Course = {
  id: "course-1",
  slug: "cs-201",
  name: "Công nghệ phần mềm",
  code: "CS 201",
  detail: "Thiết kế và kiểm thử theo nhóm.",
  progress: 62,
  tone: "slate",
  cover: "/img/course-cs.webp",
  cover_alt: "Không gian học tập",
  outline: [{ title: "Phân tích yêu cầu", summary: "Xác định phạm vi." }],
  outcomes: ["Giải thích một tính năng."],
  assessment: [
    { method: "Thực hành", weight_percent: 100, description: "Demo." },
  ],
  created_at: timestamp,
  updated_at: timestamp,
};
const stored: StoredDocument = {
  id: "document-1",
  name: "Bài giảng.pdf",
  media_type: "application/pdf",
  size_bytes: 1234,
  storage_status: "stored",
  processing_status: "pending",
  index_quality: null,
  course_id: course.id,
  course_name: course.name,
  course_code: course.code,
  course_slug: course.slug,
  created_at: timestamp,
  updated_at: timestamp,
};
const unassigned: StoredDocument = {
  ...stored,
  id: "document-2",
  name: "Ghi chú.pdf",
  course_id: null,
  course_name: null,
  course_code: null,
  course_slug: null,
};
const pdf = () =>
  new File(["%PDF-1.7\nfixture"], "Bản nháp.pdf", {
    type: "application/pdf",
    lastModified: 1,
  });
type Role = PilotPrincipal["role"];
function asRole(children: ReactNode, role?: Role) {
  return (
    <PilotPrincipalContext.Provider
      value={
        role
          ? {
              userId: "11111111-1111-4111-8111-111111111111",
              workspaceId: "22222222-2222-4222-8222-222222222222",
              role,
            }
          : undefined
      }
    >
      {children}
    </PilotPrincipalContext.Provider>
  );
}
let documents: DocumentsState;
let anchorClick: ReturnType<typeof vi.spyOn>;
let serverDocuments: StoredDocument[];
function unavailable(button: HTMLElement | null) {
  if (button) expect(button).toBeDisabled();
}
function picker() {
  return screen.queryByLabelText("Choose documents");
}
async function loaded() {
  await screen.findByRole("button", { name: `Download ${stored.name}` });
}
function noWrites() {
  expect(api.uploadDocument).not.toHaveBeenCalled();
  expect(api.setDocumentCourse).not.toHaveBeenCalled();
  expect(api.processDocument).not.toHaveBeenCalled();
  expect(api.deleteDocument).not.toHaveBeenCalled();
}
async function select(input: HTMLElement, file = pdf()) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  return file;
}
beforeEach(() => {
  serverDocuments = [stored, unassigned];
  vi.spyOn(api, "listDocuments").mockResolvedValue(serverDocuments);
  vi.spyOn(api, "searchDocuments").mockImplementation(async (query = {}) => {
    let rows = serverDocuments;
    if (query.course === "unassigned")
      rows = rows.filter((row) => row.course_id === null);
    else if (query.course && query.course !== "all")
      rows = rows.filter((row) => row.course_id === query.course);
    if (query.storage_status)
      rows = rows.filter((row) => row.storage_status === query.storage_status);
    if (query.processing_status)
      rows = rows.filter(
        (row) => row.processing_status === query.processing_status,
      );
    return {
      items: rows,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      total: rows.length,
      totalPages: rows.length ? 1 : 0,
    };
  });
  vi.spyOn(api, "uploadDocument").mockImplementation(async (file, courseId) => {
    const uploaded = {
      ...stored,
      id: "document-new",
      name: file.name,
      course_id: courseId ?? null,
    };
    serverDocuments = [uploaded, ...serverDocuments];
    return uploaded;
  });
  vi.spyOn(api, "setDocumentCourse").mockImplementation(
    async (id, courseId) => {
      const updated = { ...stored, id, course_id: courseId };
      serverDocuments = serverDocuments.map((row) =>
        row.id === id ? updated : row,
      );
      return updated;
    },
  );
  vi.spyOn(api, "processDocument").mockResolvedValue({
    document_id: stored.id,
    processing_status: "ready",
    chunk_count: 1,
    indexed_at: timestamp,
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
  vi.spyOn(api, "deleteDocument").mockImplementation(async (id) => {
    serverDocuments = serverDocuments.filter((row) => row.id !== id);
  });
  vi.spyOn(api, "downloadDocument").mockResolvedValue({
    url: "http://127.0.0.1/fixture.pdf",
    expiresIn: 60,
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  vi.mocked(useCourses).mockReturnValue({
    courses: [course],
    loading: false,
    error: null,
    retry: vi.fn(),
  });
  documents = {
    documents: [stored],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    upload: vi.fn(async () => true),
    setCourse: vi.fn(async () => true),
  };
  vi.mocked(useDocuments).mockReturnValue(documents);
  vi.mocked(useExams).mockReturnValue({
    exams: [],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  });
  vi.mocked(useStudyPlans).mockReturnValue({
    plans: [],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(),
    setCompletion: vi.fn(),
    remove: vi.fn(),
  });
  vi.mocked(useExpenses).mockReturnValue({
    expenses: [],
    loading: false,
    busy: false,
    error: null,
    reload: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Document permissions from the verified principal", () => {
  it.each(["viewer", undefined] as const)(
    "does not select or upload a PDF as %s even via a forced change",
    async (role) => {
      render(asRole(<DocumentsPanel />, role));
      await loaded();
      const input = picker();
      if (input) {
        await select(input);
        const upload = screen.queryByRole("button", {
          name: "Upload Bản nháp.pdf",
        });
        if (upload)
          await act(async () => {
            fireEvent.click(upload);
          });
      }
      noWrites();
      unavailable(input);
      expect(
        screen.queryByRole("region", { name: "Selected documents" }),
      ).toBeNull();
      expect(screen.getByText(/quyền xem/i)).toBeVisible();
    },
  );
  it.each(["viewer", undefined] as const)(
    "blocks course reassignment and indexing for %s",
    async (role) => {
      render(asRole(<DocumentsPanel />, role));
      await loaded();
      const courseSelect = screen.queryByLabelText(`Course for ${stored.name}`);
      const index = screen.queryByRole("button", {
        name: `Index ${stored.name}`,
      });
      await act(async () => {
        if (courseSelect)
          fireEvent.change(courseSelect, { target: { value: "" } });
        if (index) fireEvent.click(index);
      });
      noWrites();
      unavailable(courseSelect);
      unavailable(index);
    },
  );
  it.each(["viewer", "member", undefined] as const)(
    "makes server deletion unavailable for %s",
    async (role) => {
      render(asRole(<DocumentsPanel />, role));
      await loaded();
      const remove = screen.queryByRole("button", {
        name: `Delete ${stored.name}`,
      });
      if (remove)
        await act(async () => {
          fireEvent.click(remove);
        });
      expect(api.deleteDocument).not.toHaveBeenCalled();
      expect(window.confirm).not.toHaveBeenCalled();
      unavailable(remove);
    },
  );
  it.each(["member", "manager"] as const)(
    "preserves upload, reassignment and indexing for %s",
    async (role) => {
      render(asRole(<DocumentsPanel />, role));
      await loaded();
      const file = await select(screen.getByLabelText("Choose documents"));
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: `Upload ${file.name}` }),
        );
      });
      expect(api.uploadDocument).toHaveBeenCalledExactlyOnceWith(
        file,
        undefined,
      );
      await act(async () => {
        fireEvent.change(screen.getByLabelText(`Course for ${stored.name}`), {
          target: { value: "" },
        });
      });
      expect(api.setDocumentCourse).toHaveBeenCalledExactlyOnceWith(
        stored.id,
        null,
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: `Index ${stored.name}` }),
        );
      });
      expect(api.processDocument).toHaveBeenCalledExactlyOnceWith(stored.id);
    },
  );
  it("keeps manager delete confirmation and removes only the confirmed row", async () => {
    render(asRole(<DocumentsPanel />, "manager"));
    await loaded();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: `Delete ${stored.name}` }),
      );
    });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(api.deleteDocument).toHaveBeenCalledExactlyOnceWith(stored.id);
    expect(screen.queryByText(stored.name)).toBeNull();
    expect(screen.getByText(unassigned.name)).toBeVisible();
  });
  it("does not call deletion if confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(asRole(<DocumentsPanel />, "manager"));
    await loaded();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: `Delete ${stored.name}` }),
      );
    });
    expect(api.deleteDocument).not.toHaveBeenCalled();
    expect(screen.getByText(stored.name)).toBeVisible();
  });
  it("rechecks the current role after confirmation rather than a stale manager closure", async () => {
    const rendered = render(asRole(<DocumentsPanel />, "manager"));
    await loaded();
    vi.mocked(window.confirm).mockImplementation(() => {
      // Commit the verified role change while confirm is pending; an outer
      // event act otherwise batches rerender until after the click handler.
      flushSync(() => rendered.rerender(asRole(<DocumentsPanel />, "member")));
      return true;
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: `Delete ${stored.name}` }),
      );
    });
    expect(api.deleteDocument).not.toHaveBeenCalled();
    expect(screen.getByText(stored.name)).toBeVisible();
  });
  it.each(["viewer", undefined] as const)(
    "discards the selected draft when write access changes to %s",
    async (role) => {
      const rendered = render(asRole(<DocumentsPanel />, "member"));
      await loaded();
      const oldPicker = screen.getByLabelText("Choose documents");
      await select(oldPicker);
      const oldUpload = screen.getByRole("button", {
        name: "Upload Bản nháp.pdf",
      });
      rendered.rerender(asRole(<DocumentsPanel />, role));
      await act(async () => {
        fireEvent.click(oldUpload);
        fireEvent.change(oldPicker, { target: { files: [pdf()] } });
      });
      noWrites();
      expect(
        screen.queryByRole("region", { name: "Selected documents" }),
      ).toBeNull();
      rendered.rerender(asRole(<DocumentsPanel />, "member"));
      expect(
        screen.queryByRole("region", { name: "Selected documents" }),
      ).toBeNull();
      expect(screen.getByLabelText("Save under course")).toHaveValue("");
    },
  );
  it("blocks retained refile/index controls after member becomes viewer", async () => {
    const rendered = render(asRole(<DocumentsPanel />, "member"));
    await loaded();
    const courseSelect = screen.getByLabelText(`Course for ${stored.name}`);
    const index = screen.getByRole("button", { name: `Index ${stored.name}` });
    rendered.rerender(asRole(<DocumentsPanel />, "viewer"));
    await act(async () => {
      fireEvent.change(courseSelect, { target: { value: "" } });
      fireEvent.click(index);
    });
    noWrites();
  });
  it.each(["manager", "member", "viewer"] as const)(
    "preserves filtering, metadata, list refresh and attachment download for %s",
    async (role) => {
      render(asRole(<DocumentsPanel />, role));
      await loaded();
      expect(screen.getByText(stored.name)).toBeVisible();
      expect(screen.getByText(unassigned.name)).toBeVisible();
      fireEvent.change(screen.getByLabelText("Filter by course"), {
        target: { value: "none" },
      });
      expect(screen.queryByText(stored.name)).toBeNull();
      expect(await screen.findByText(unassigned.name)).toBeVisible();
      fireEvent.change(screen.getByLabelText("Filter by course"), {
        target: { value: "all" },
      });
      expect(await screen.findByText(stored.name)).toBeVisible();
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: `Download ${stored.name}` }),
        );
      });
      expect(api.downloadDocument).toHaveBeenCalledExactlyOnceWith(stored.id);
      expect(anchorClick).toHaveBeenCalledOnce();
      const listCalls = vi.mocked(api.searchDocuments).mock.calls.length;
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
      });
      await waitFor(() =>
        expect(api.searchDocuments).toHaveBeenCalledTimes(listCalls + 1),
      );
      noWrites();
    },
  );
  it.each(["manager", "member", "viewer"] as const)(
    "preserves the failed-list retry for %s",
    async (role) => {
      vi.mocked(api.searchDocuments).mockRejectedValueOnce(
        new Error("Chưa tải được danh sách, thử lại nhé."),
      );
      render(asRole(<DocumentsPanel />, role));
      await screen.findByRole("alert");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
      });
      await loaded();
      expect(api.searchDocuments).toHaveBeenCalledTimes(2);
      noWrites();
    },
  );
  it("keeps rejected backend writes visible without silently retrying", async () => {
    const read = vi.spyOn(api, "getDocument");
    vi.mocked(api.processDocument).mockRejectedValue(
      new ApiError("Bạn chỉ có quyền xem tài liệu này.", "ROLE_FORBIDDEN", 403),
    );
    render(asRole(<DocumentsPanel />, "member"));
    await loaded();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: `Index ${stored.name}` }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bạn chỉ có quyền xem tài liệu này.",
    );
    expect(api.processDocument).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: `Index ${stored.name}` }),
    ).toBeDisabled();
    expect(read).not.toHaveBeenCalled();
  });
  it("discards pending download signing after the old account view unmounts", async () => {
    let resolveSigning!: (result: { url: string; expiresIn: number }) => void;
    vi.mocked(api.downloadDocument).mockReturnValue(
      new Promise((resolve) => {
        resolveSigning = resolve;
      }),
    );
    const rendered = render(asRole(<DocumentsPanel />, "viewer"));
    await loaded();
    fireEvent.click(
      screen.getByRole("button", { name: `Download ${stored.name}` }),
    );
    expect(api.downloadDocument).toHaveBeenCalledOnce();
    // PilotAccess keys its child by verified user + workspace, so switching
    // accounts unmounts this instance before mounting the next account view.
    rendered.unmount();
    await act(async () => {
      resolveSigning({ url: "http://127.0.0.1/fixture.pdf", expiresIn: 60 });
    });
    expect(anchorClick).not.toHaveBeenCalled();
  });
});

describe("Course workspace document permissions", () => {
  it.each(["viewer", undefined] as const)(
    "blocks course upload and detach for %s",
    async (role) => {
      render(asRole(<CourseWorkspace course={course} />, role));
      const region = screen.getByRole("region", { name: "Documents" });
      const input = within(region).queryByLabelText("Chọn tệp PDF cho môn này");
      if (input) await select(input);
      const detach = within(region).queryByRole("button", {
        name: `Detach document: ${stored.name}`,
      });
      if (detach) {
        fireEvent.click(detach);
        const confirm = within(region).queryByRole("button", { name: "Xoá" });
        if (confirm)
          await act(async () => {
            fireEvent.click(confirm);
          });
      }
      expect(documents.upload).not.toHaveBeenCalled();
      expect(documents.setCourse).not.toHaveBeenCalled();
      unavailable(input);
      unavailable(detach);
      expect(
        within(region).getByRole("link", { name: "Mở trang Documents" }),
      ).toHaveAttribute("href", "#documents");
    },
  );
  it.each(["member", "manager"] as const)(
    "preserves upload and detach (not server delete) for %s",
    async (role) => {
      render(asRole(<CourseWorkspace course={course} />, role));
      const region = screen.getByRole("region", { name: "Documents" });
      const file = await select(
        within(region).getByLabelText("Chọn tệp PDF cho môn này"),
      );
      expect(documents.upload).toHaveBeenCalledExactlyOnceWith(file, course.id);
      fireEvent.click(
        within(region).getByRole("button", {
          name: `Detach document: ${stored.name}`,
        }),
      );
      await act(async () => {
        fireEvent.click(within(region).getByRole("button", { name: "Xoá" }));
      });
      expect(documents.setCourse).toHaveBeenCalledExactlyOnceWith(
        stored.id,
        null,
      );
      expect(api.deleteDocument).not.toHaveBeenCalled();
    },
  );
  it("revokes an open detach confirmation and old picker on downgrade", async () => {
    const rendered = render(
      asRole(<CourseWorkspace course={course} />, "member"),
    );
    const region = screen.getByRole("region", { name: "Documents" });
    const oldInput = within(region).getByLabelText("Chọn tệp PDF cho môn này");
    fireEvent.click(
      within(region).getByRole("button", {
        name: `Detach document: ${stored.name}`,
      }),
    );
    const oldConfirm = within(region).getByRole("button", { name: "Xoá" });
    rendered.rerender(asRole(<CourseWorkspace course={course} />, "viewer"));
    await act(async () => {
      fireEvent.change(oldInput, { target: { files: [pdf()] } });
      fireEvent.click(oldConfirm);
    });
    expect(documents.upload).not.toHaveBeenCalled();
    expect(documents.setCourse).not.toHaveBeenCalled();
    expect(within(region).queryByRole("button", { name: "Xoá" })).toBeNull();
    rendered.rerender(asRole(<CourseWorkspace course={course} />, "member"));
    expect(within(region).queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(
      within(region).getByRole("button", {
        name: `Detach document: ${stored.name}`,
      }),
    ).toBeEnabled();
  });
});
