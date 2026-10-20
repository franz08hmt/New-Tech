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
import { WorkspaceApp } from "./App";
import type { StoredDocument } from "./api";
import { configurePilotClient } from "./pilot-client";
import { NotesStorageContext } from "./NotesStorageContext";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
function assistantSseResponse(
  response: Record<string, any>,
  delta = typeof response.answer === "string" ? response.answer : "",
) {
  const stages =
    response.mode === "documents"
      ? [
          { type: "status", stage: "retrieving" },
          { type: "status", stage: "generating" },
        ]
      : [
          {
            type: "status",
            stage:
              response.mode === "workspace"
                ? "querying_workspace"
                : "generating",
          },
        ];
  return new Response(
    [
      { type: "start" },
      ...stages,
      ...(delta ? [{ type: "delta", text: delta }] : []),
      {
        type: "done",
        response,
        answerId: "77777777-7777-4777-8777-777777777777",
      },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}
function App() {
  return (
    <NotesStorageContext.Provider value="examate-notes:test-user:test-workspace">
      <PilotPrincipalContext.Provider
        value={{
          userId: "11111111-1111-4111-8111-111111111111",
          workspaceId: "22222222-2222-4222-8222-222222222222",
          // Legacy full-CRUD regressions run as manager; role matrix has its own suite.
          role: "manager",
        }}
      >
        <WorkspaceApp />
      </PilotPrincipalContext.Provider>
    </NotesStorageContext.Provider>
  );
}
import { moveNote } from "./AcademicPanels";

const task = {
  id: "task-1",
  title: "Review API contract",
  owner_name: "Tài",
  status: "todo",
  due_date: null,
  evidence_type: null,
  created_at: "2026-09-09",
  updated_at: "2026-09-09",
};
const course = {
  id: "course-1",
  slug: "cs-201",
  name: "Công nghệ phần mềm",
  code: "CS 201",
  detail: "Thiết kế, kiểm thử và vận hành phần mềm theo nhóm",
  progress: 62,
  tone: "slate",
  cover: "/img/course-cs.webp",
  cover_alt: "Màn hình mã nguồn trong không gian học tập",
  outline: [
    {
      title: "Phân tích yêu cầu",
      summary: "Chuyển nhu cầu thành phạm vi và tiêu chí kiểm chứng rõ ràng.",
    },
  ],
  outcomes: ["Giải thích được luồng đi của một tính năng trong hệ thống."],
  assessment: [
    {
      method: "Bài tập thực hành",
      weight_percent: 40,
      description: "Xây dựng và kiểm chứng một lát cắt chức năng nhỏ.",
    },
  ],
  created_at: "2026-09-15T00:00:00.000Z",
  updated_at: "2026-09-15T00:00:00.000Z",
};
const courseFixtures = [
  course,
  {
    ...course,
    id: "course-2",
    slug: "ma-210",
    name: "Toán ứng dụng",
    code: "MA 210",
    cover: "/img/course-math.webp",
  },
  {
    ...course,
    id: "course-3",
    slug: "ec-102",
    name: "Kinh tế vi mô",
    code: "EC 102",
    cover: "/img/course-econ.webp",
  },
  {
    ...course,
    id: "course-4",
    slug: "bi-150",
    name: "Sinh học đại cương",
    code: "BI 150",
    cover: "/img/course-bio.webp",
  },
  {
    ...course,
    id: "course-5",
    slug: "hi-204",
    name: "Lịch sử thế giới hiện đại",
    code: "HI 204",
    cover: "/img/course-hist.webp",
  },
  {
    ...course,
    id: "course-6",
    slug: "lt-101",
    name: "Văn học và tư duy phản biện",
    code: "LT 101",
    cover: "/img/course-lit.webp",
  },
];
const examFixtures = [
  {
    id: "exam-1",
    course_id: "course-1",
    course_slug: "cs-201",
    course_name: "Công nghệ phần mềm",
    course_code: "CS 201",
    topic: "Kiểm tra giữa kỳ phần thuật toán",
    exam_date: "2026-09-21",
    exam_time: "09:00",
    room: "Phòng A201",
    revision_note: "Ôn lại độ phức tạp và cây nhị phân tìm kiếm.",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "exam-3",
    course_id: "course-3",
    course_slug: "ec-102",
    course_name: "Kinh tế vi mô",
    course_code: "EC 102",
    topic: "Bài kiểm tra kinh tế vi mô",
    exam_date: "2026-09-24",
    exam_time: "13:30",
    room: "Phòng B102",
    revision_note: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "exam-2",
    course_id: "course-4",
    course_slug: "bi-150",
    course_name: "Sinh học đại cương",
    course_code: "BI 150",
    topic: "Bài kiểm tra chương tế bào",
    exam_date: "2026-09-08",
    exam_time: "14:00",
    room: "Phòng D204",
    revision_note: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
];
const planFixtures = [
  {
    id: "plan-1",
    course_id: "course-1",
    course_slug: "cs-201",
    course_name: "Công nghệ phần mềm",
    course_code: "CS 201",
    title: "Ôn lại độ phức tạp thuật toán",
    detail: "Làm lại năm bài so sánh.",
    due_date: "2026-09-19",
    owner_name: "Tài",
    completed_at: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "plan-2",
    course_id: "course-1",
    course_slug: "cs-201",
    course_name: "Công nghệ phần mềm",
    course_code: "CS 201",
    title: "Đọc lại ghi chú buổi thực hành",
    detail: null,
    due_date: "2026-09-16",
    owner_name: null,
    completed_at: "2026-09-14T10:00:00.000Z",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "plan-3",
    course_id: "course-3",
    course_slug: "ec-102",
    course_name: "Kinh tế vi mô",
    course_code: "EC 102",
    title: "Vẽ lại đồ thị cung cầu",
    detail: null,
    due_date: null,
    owner_name: "Thắng",
    completed_at: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
];
const documentFixtures: StoredDocument[] = [
  {
    id: "doc-1",
    name: "de-cuong-thuat-toan.pdf",
    media_type: "application/pdf",
    size_bytes: 2048,
    storage_status: "stored",
    processing_status: "pending",
    index_quality: null,
    course_id: "course-1",
    course_slug: "cs-201",
    course_name: "C\u00f4ng ngh\u1ec7 ph\u1ea7n m\u1ec1m",
    course_code: "CS 201",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "doc-2",
    name: "ghi-chu-chung.pdf",
    media_type: "application/pdf",
    size_bytes: 1024,
    storage_status: "stored",
    processing_status: "ready",
    index_quality: null,
    course_id: null,
    course_slug: null,
    course_name: null,
    course_code: null,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
  },
];
type SearchFixture = Pick<
  StoredDocument,
  | "id"
  | "name"
  | "course_id"
  | "course_name"
  | "course_code"
  | "course_slug"
  | "storage_status"
  | "processing_status"
  | "created_at"
>;
function documentSearchResponse(rows: readonly SearchFixture[], url: string) {
  const params = new URL(url, "http://127.0.0.1").searchParams;
  const q = params.get("q")?.toLowerCase();
  let filtered = [...rows];
  const course = params.get("course") ?? "all";
  if (course === "unassigned")
    filtered = filtered.filter((row) => row.course_id === null);
  else if (course !== "all")
    filtered = filtered.filter((row) => row.course_id === course);
  const storage = params.get("storage_status");
  if (storage)
    filtered = filtered.filter((row) => row.storage_status === storage);
  const processing = params.get("processing_status");
  if (processing)
    filtered = filtered.filter((row) => row.processing_status === processing);
  if (q)
    filtered = filtered.filter((row) =>
      [row.name, row.course_name, row.course_code, row.course_slug]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  const sort = params.get("sort") ?? "created_at";
  const direction = params.get("direction") === "asc" ? 1 : -1;
  const sortValue = (row: SearchFixture) => {
    if (sort === "name") return row.name.toLowerCase();
    if (sort === "course_name") return row.course_name?.toLowerCase() ?? null;
    if (sort === "storage_status") return row.storage_status;
    if (sort === "processing_status") return row.processing_status;
    return row.created_at;
  };
  filtered.sort((left, right) => {
    const leftValue = sortValue(left),
      rightValue = sortValue(right);
    if (leftValue === null)
      return rightValue === null ? left.id.localeCompare(right.id) : 1;
    if (rightValue === null) return -1;
    const compared = String(leftValue).localeCompare(String(rightValue));
    return compared ? compared * direction : left.id.localeCompare(right.id);
  });
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 20);
  return Response.json({
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    totalPages: Math.ceil(filtered.length / pageSize),
  });
}
const expenseFixtures = [
  {
    id: "exp-1",
    amount: 35000,
    description: "In tài liệu ôn thuật toán",
    spent_on: "2026-09-15",
    category: "books",
    course_id: "course-1",
    course_slug: "cs-201",
    course_name: "Công nghệ phần mềm",
    course_code: "CS 201",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "exp-2",
    amount: 25000,
    description: "Cà phê ngồi học nhóm",
    spent_on: "2026-09-14",
    category: "food",
    course_id: null,
    course_slug: null,
    course_name: null,
    course_code: null,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
  },
  {
    id: "exp-3",
    amount: 150000,
    description: "Lệ phí thi lại học phần",
    spent_on: "2026-09-05",
    category: "fees",
    course_id: "course-2",
    course_slug: "ma-210",
    course_name: "Toán ứng dụng",
    course_code: "MA 210",
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  },
];
/**
 * Builds the row a create endpoint returns: the submitted body, resolved
 * against the course fixtures, plus timestamps.
 */
function createdRow(
  init: RequestInit,
  shape: (
    body: Record<string, any>,
    course: (typeof courseFixtures)[number] | undefined,
  ) => Record<string, unknown>,
) {
  const body = JSON.parse(String(init.body)) as Record<string, any>;
  const course = courseFixtures.find((row) => row.id === body.courseId);
  return {
    ...shape(body, course),
    created_at: "2026-09-15T08:00:00.000Z",
    updated_at: "2026-09-15T08:00:00.000Z",
  };
}
beforeEach(() => {
  configurePilotClient("a".repeat(43), true);
  // The exam list separates upcoming from past, so the clock is pinned:
  // otherwise these tests would start failing on their own once the fixture
  // dates slipped into the past.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-15T08:00:00.000Z"));

  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            answer:
              "Chia bài thuyết trình thành mục tiêu, demo và phần hỏi đáp.",
            answerable: true,
            reasonCode: "ANSWER_GENERATED",
            citations: [],
            provider: "google",
            model: "gemini-2.5-flash",
            mode: "documents",
            ragEnabled: true,
            promptVersion: "rag-v1",
          }),
          { status: 200 },
        );
      }
      if (url === "/api/assistant/chat/stream" && init?.method === "POST") {
        const mode = JSON.parse(String(init.body)).mode;
        const answer =
          mode === "documents"
            ? "Chia bài thuyết trình thành mục tiêu, demo và phần hỏi đáp."
            : mode === "workspace"
              ? "Có 1 task chưa xong trong danh sách chung."
              : "Chat general response.";
        const response = {
          answer,
          answerable: true,
          reasonCode:
            mode === "workspace" ? "WORKSPACE_ANSWER" : "ANSWER_GENERATED",
          citations: [],
          provider: mode === "workspace" ? "workspace" : "google",
          model: mode === "workspace" ? "database" : "gemini-2.5-flash",
          mode,
          ragEnabled: mode === "documents",
          promptVersion:
            mode === "workspace"
              ? "workspace-v1"
              : mode === "documents"
                ? "rag-v1"
                : "general-v1",
          ...(mode === "workspace"
            ? {
                workspaceIntent: "tasks_open",
                workspaceSources: [],
                asOf: "2026-09-29",
              }
            : {}),
        };
        return assistantSseResponse(
          response,
          mode === "workspace" ? "" : answer,
        );
      }
      if (url === "/api/documents" && init?.method !== "POST") {
        return new Response(JSON.stringify(documentFixtures), { status: 200 });
      }
      if (url.startsWith("/api/documents/search"))
        return documentSearchResponse(documentFixtures, url);
      if (
        url.startsWith("/api/documents/") &&
        url.endsWith("/process") &&
        init?.method === "POST"
      ) {
        return Response.json({
          document_id: "doc-1",
          processing_status: "ready",
          chunk_count: 4,
          indexed_at: "2026-09-15T08:00:00.000Z",
          index_quality: {
            total_page_count: 5,
            useful_text_page_count: 4,
            low_text_page_count: 1,
            indexed_chunk_count: 4,
            skipped_page_numbers: [3],
            needs_ocr: true,
            ocr_page_count: 0,
            ocr_page_numbers: [],
          },
        });
      }
      if (url.startsWith("/api/documents/") && url.includes("/download")) {
        return Response.json({
          url: "https://storage.example.test/source.pdf?token=signed",
          expiresIn: 60,
        });
      }
      if (url.startsWith("/api/documents/") && url.endsWith("/course")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          courseId?: string | null;
        };
        const target = documentFixtures.find((row) => url.includes(row.id))!;
        return new Response(
          JSON.stringify(
            body.courseId
              ? {
                  ...target,
                  course_id: "course-3",
                  course_slug: "ec-102",
                  course_name: "Kinh t\u1ebf vi m\u00f4",
                  course_code: "EC 102",
                }
              : {
                  ...target,
                  course_id: null,
                  course_slug: null,
                  course_name: null,
                  course_code: null,
                },
          ),
          { status: 200 },
        );
      }
      if (url === "/api/expenses") {
        if (init?.method === "POST") {
          // Echo what was sent, the way POST /api/expenses answers. Returning
          // the whole fixture list here handed the component an array where it
          // expected one row, and the sort that follows a create threw on
          // `spent_on` being undefined — after the test had already passed,
          // which is why it surfaced only as an unhandled error.
          return new Response(
            JSON.stringify(
              createdRow(init, (body, course) => ({
                id: "exp-new",
                amount: body.amount,
                description: body.description,
                spent_on: body.spentOn,
                category: body.category,
                course_id: course?.id ?? null,
                course_slug: course?.slug ?? null,
                course_name: course?.name ?? null,
                course_code: course?.code ?? null,
              })),
            ),
            { status: 201 },
          );
        }
        return new Response(JSON.stringify(expenseFixtures), { status: 200 });
      }
      if (url.startsWith("/api/expenses/") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/study-plans") {
        return new Response(JSON.stringify(planFixtures), { status: 200 });
      }
      if (url.startsWith("/api/study-plans/")) {
        if (init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          completed?: boolean;
        };
        return new Response(
          JSON.stringify({
            ...planFixtures[0],
            completed_at: body.completed ? "2026-09-15T08:00:00.000Z" : null,
          }),
          { status: 200 },
        );
      }
      if (url === "/api/exams") {
        if (init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify(
              createdRow(init, (body, course) => ({
                id: "exam-new",
                course_id: body.courseId,
                course_slug: course!.slug,
                course_name: course!.name,
                course_code: course!.code,
                topic: body.topic,
                exam_date: body.examDate,
                exam_time: body.examTime,
                room: body.room,
                revision_note: body.revisionNote ?? null,
              })),
            ),
            { status: 201 },
          );
        }
        return new Response(JSON.stringify(examFixtures), { status: 200 });
      }
      if (url.startsWith("/api/exams/") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("/api/exams/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          string
        >;
        return new Response(
          JSON.stringify({
            ...examFixtures[0],
            topic: body.topic,
            exam_date: body.examDate,
            exam_time: body.examTime,
            room: body.room,
          }),
          { status: 200 },
        );
      }
      if (url === "/api/courses") {
        return new Response(JSON.stringify(courseFixtures), { status: 200 });
      }
      if (init?.method !== "POST") {
        return new Response(JSON.stringify([task]), { status: 200 });
      }
      // Echo the submitted fields back, like the real POST /api/tasks
      // response does, instead of a response fixed regardless of input.
      const submitted = JSON.parse(String(init.body)) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          ...task,
          id: "task-2",
          title: submitted.title,
          owner_name: submitted.ownerName ?? null,
          due_date: submitted.dueDate ?? null,
          evidence_type: submitted.evidenceType ?? null,
        }),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
  vi.unstubAllGlobals();
});

describe("Academic workspace", () => {
  it("loads the course gallery from the API instead of static fixtures", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Công nghệ phần mềm",
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/courses",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows a useful course error without falling back to invented static data", async () => {
    window.history.replaceState(null, "", "/#courses");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/courses") throw new Error("Offline");
        return Response.json(url === "/api/documents" ? [] : [task]);
      }),
    );
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa tải được danh sách môn học",
    );
    expect(screen.queryByText("Computer Science")).not.toBeInTheDocument();
  });
  it("renders semantic dashboard and explicit sample data", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Student academic dashboard",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Review API contract")).toBeInTheDocument();
    expect(screen.getByText("Example courses")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });
  it("opens and closes the ExaMate AI panel without replacing the page", async () => {
    render(<App />);

    const trigger = screen.getByRole("button", {
      name: "Open ExaMate AI",
    });
    fireEvent.click(trigger);

    expect(
      screen.getByRole("complementary", { name: "ExaMate AI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Student academic dashboard",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ngữ cảnh: Dashboard")).toBeVisible();
    // A chat opens to its composer: that is what the launcher is for.
    await waitFor(() =>
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveFocus(),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("complementary", { name: "ExaMate AI" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("shows AI Chat and workspace as the two top-level modes with nested AI scope", () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Tìm các ý chính liên quan trong tài liệu đã lập chỉ mục.",
      }),
    );

    expect(screen.getByText("Ngữ cảnh: Documents")).toBeVisible();
    expect(screen.getByRole("radio", { name: "AI Chat" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Hỏi workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tài liệu" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Kiến thức chung" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Tìm các ý chính liên quan trong tài liệu đã lập chỉ mục.",
    );
    expect(
      screen.getByText(
        /AI Chat tìm trong tài liệu đã lập chỉ mục.*metadata riêng/,
      ),
    ).toBeVisible();
    expect(screen.queryByText("Xem trước giao diện")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Week 3 course guide · p. 5"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeEnabled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).startsWith("/api/assistant")),
    ).toBe(false);
  });
  it("supports page routing, task creation and the existing API contract", async () => {
    window.history.replaceState(null, "", "/#tasks");
    render(<App />);
    await screen.findByText("Review API contract");
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Build course page" },
    });
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "Tài" },
    });
    fireEvent.change(screen.getByLabelText("Evidence type"), {
      target: { value: "proposal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(
      await screen.findByText("Task added successfully."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Build course page",
          ownerName: "Tài",
          evidenceType: "proposal",
        }),
      }),
    );
    // The API echoes evidence_type back (mocked below); the list must render
    // it rather than only sending it — a one-way contract test would miss a
    // response that is sent but silently dropped on render.
    expect(await screen.findByText(/proposal/)).toBeInTheDocument();
  });
  it("omits evidence type from the request when the field is left blank", async () => {
    window.history.replaceState(null, "", "/#tasks");
    render(<App />);
    await screen.findByText("Review API contract");
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Build course page" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByText("Task added successfully.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Build course page" }),
      }),
    );
  });
  it("filters tasks by owner and shows an empty state when none match", async () => {
    window.history.replaceState(null, "", "/#tasks");
    render(<App />);
    await screen.findByText("Review API contract");

    const ownerFilter = screen.getByLabelText("Owner filter");
    expect(ownerFilter).toHaveValue("all");

    fireEvent.change(ownerFilter, { target: { value: "Tài" } });
    expect(screen.getByText("Review API contract")).toBeInTheDocument();

    fireEvent.change(ownerFilter, { target: { value: "Thắng" } });
    expect(screen.queryByText("Review API contract")).not.toBeInTheDocument();
    expect(
      screen.getByText("No tasks match these filters."),
    ).toBeInTheDocument();
  });
  it("moves the course gallery between subjects and announces the change", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Công nghệ phần mềm",
      }),
    ).toBeInTheDocument();
    const gallery = screen.getByRole("region", { name: "Course gallery" });

    fireEvent.click(screen.getByRole("button", { name: "Next course" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Toán ứng dụng" }),
    ).toBeInTheDocument();
    expect(gallery).toHaveTextContent("Course 2 of 6: Toán ứng dụng");

    // Wrapping backwards from the first subject lands on the last one.
    fireEvent.click(screen.getByRole("button", { name: "Previous course" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous course" }));
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Văn học và tư duy phản biện",
      }),
    ).toBeInTheDocument();
    expect(gallery).toHaveTextContent(
      "Course 6 of 6: Văn học và tư duy phản biện",
    );
  });
  it("opens the matching course detail from a course overview card", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    const overview = (
      await screen.findByRole("heading", { level: 2, name: "Course overview" })
    ).closest("section")!;
    fireEvent.click(
      within(overview).getByRole("link", { name: /Công nghệ phần mềm/ }),
    );

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Công nghệ phần mềm",
    });
    expect(window.location.hash).toBe("#courses/cs-201");
    await waitFor(() => expect(heading).toHaveFocus());
  });
  it("keeps carousel thumbnails for selection and offers a separate detail link", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select Toán ứng dụng course",
      }),
    );
    expect(window.location.hash).toBe("#courses");

    fireEvent.click(
      screen.getByRole("link", { name: "Explore Toán ứng dụng course" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Toán ứng dụng" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#courses/ma-210");
  });
  it("renders meaningful course content from a direct deep link", async () => {
    window.history.replaceState(null, "", "/#courses/hi-204");
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Lịch sử thế giới hiện đại",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Course outline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Learning outcomes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Assessment approach" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/illustrative, not an official syllabus/i),
    ).toBeVisible();
  });
  it("shows a friendly fallback for an unknown course code", async () => {
    window.history.replaceState(null, "", "/#courses/not-a-course");
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Course not found",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Không tìm thấy môn học minh họa này/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to course gallery" }),
    ).toHaveAttribute("href", "#courses");
  });
  it("returns from a course detail to the gallery with a visible back link", async () => {
    window.history.replaceState(null, "", "/#courses/lt-101");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("link", { name: "Back to course gallery" }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Your learning journey",
      }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#courses");
  });
  it("selects PDFs locally and loads persisted documents without uploading automatically", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    const pdf = new File(["week three notes"], "week-3-notes.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pdf] },
    });

    expect(await screen.findByText("week-3-notes.pdf")).toBeInTheDocument();
    expect(
      screen.getByText("Selected locally · Not uploaded"),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) => url === "/api/documents" && init?.method === "POST",
        ),
    ).toBe(false);
  });
  it("indexes a stored PDF and exposes its searchable state", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Index de-cuong-thuat-toan.pdf",
      }),
    );

    expect(
      await screen.findByText("AI index · Searchable content ready"),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "4 đoạn để Assistant truy xuất",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents/doc-1/process",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("shows a newly indexed document in Assistant without reloading the app", async () => {
    window.history.replaceState(null, "", "/#documents");
    const quality = {
      total_page_count: 2,
      useful_text_page_count: 2,
      low_text_page_count: 0,
      indexed_chunk_count: 1,
      skipped_page_numbers: [],
      needs_ocr: false,
      ocr_page_count: 0,
      ocr_page_numbers: [],
    };
    let serverDocument = { ...documentFixtures[0] } as StoredDocument;
    let listReads = 0;
    let processCalls = 0;
    const existingFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/documents" && init?.method !== "POST") {
        listReads++;
        return Response.json([serverDocument, documentFixtures[1]]);
      }
      if (url === "/api/documents/doc-1/process" && init?.method === "POST") {
        processCalls++;
        const currentQuality = {
          ...quality,
          indexed_chunk_count: processCalls,
        };
        serverDocument = {
          ...serverDocument,
          processing_status: "ready",
          index_quality: currentQuality,
        };
        return Response.json({
          document_id: "doc-1",
          processing_status: "ready",
          chunk_count: processCalls,
          indexed_at: "2026-09-15T08:00:00.000Z",
          index_quality: currentQuality,
        });
      }
      return existingFetch(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Index de-cuong-thuat-toan.pdf",
      }),
    );
    expect(
      await screen.findByText("AI index · Searchable content ready"),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    expect(
      await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" }),
    ).toBeInTheDocument();
    // The Documents panel now reads its paged endpoint; only Assistant's
    // legacy complete source list is counted here.
    expect(listReads).toBe(2);
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: "doc-1" },
    });
    expect(
      await screen.findByText(/1 đoạn đã lập chỉ mục/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Re-index de-cuong-thuat-toan.pdf",
      }),
    );
    expect(
      await screen.findByText(/2 đoạn đã lập chỉ mục/),
    ).toBeInTheDocument();
    expect(processCalls).toBe(2);
    expect(window.location.hash).toBe("#documents");
  });
  it("does not offer pending documents as Assistant sources", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));

    const picker = await screen.findByLabelText("Chọn tài liệu để tra cứu");
    expect(
      within(picker).queryByRole("option", {
        name: "de-cuong-thuat-toan.pdf",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(picker).getByRole("option", { name: "ghi-chu-chung.pdf" }),
    ).toBeInTheDocument();
  });
  it("keeps a list refresh error visible and retries only the read", async () => {
    window.history.replaceState(null, "", "/#documents");
    let serverDocument = { ...documentFixtures[0] };
    let listReads = 0;
    let processCalls = 0;
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST") {
          listReads++;
          if (listReads === 2)
            return Response.json(
              { message: "temporary read failure" },
              { status: 503 },
            );
          return Response.json([serverDocument, documentFixtures[1]]);
        }
        if (url === "/api/documents/doc-1/process" && init?.method === "POST") {
          processCalls++;
          serverDocument = { ...serverDocument, processing_status: "ready" };
          return Response.json({
            document_id: "doc-1",
            processing_status: "ready",
            chunk_count: 1,
            indexed_at: "2026-09-15T08:00:00.000Z",
            index_quality: null,
          });
        }
        return existingFetch(url, init);
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Index de-cuong-thuat-toan.pdf",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa xem được tài liệu",
    );
    expect(
      screen.queryByText("Chưa có tài liệu sẵn sàng để hỏi."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Thử lại danh sách tài liệu" }),
    );
    expect(
      await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" }),
    ).toBeInTheDocument();
    expect(processCalls).toBe(1);
    expect(listReads).toBe(3);
  });
  it("reconciles a failed index POST from the server before exposing the source", async () => {
    window.history.replaceState(null, "", "/#documents");
    let serverDocument = { ...documentFixtures[0] };
    let processCalls = 0;
    let statusReads = 0;
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json([serverDocument, documentFixtures[1]]);
        if (url === "/api/documents/doc-1/process" && init?.method === "POST") {
          processCalls++;
          serverDocument = { ...serverDocument, processing_status: "ready" };
          return Response.json(
            { message: "response lost after persistence" },
            { status: 503 },
          );
        }
        if (url === "/api/documents/doc-1" && init?.method !== "POST") {
          statusReads++;
          return Response.json(serverDocument);
        }
        return existingFetch(url, init);
      }),
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Index de-cuong-thuat-toan.pdf",
      }),
    );
    expect(
      await screen.findByText("AI index · Searchable content ready"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    expect(
      await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" }),
    ).toBeInTheDocument();
    expect(processCalls).toBe(1);
    expect(statusReads).toBe(1);
  });
  it("syncs an upload and its confirmed index into Assistant in the same session", async () => {
    window.history.replaceState(null, "", "/#documents");
    const stored: StoredDocument = {
      ...documentFixtures[0],
      id: "doc-uploaded",
      name: "fresh-notes.pdf",
      processing_status: "pending",
      index_quality: null,
    };
    let serverDocuments = [documentFixtures[1]];
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method === "POST") {
          serverDocuments = [stored, ...serverDocuments];
          return Response.json(stored, { status: 201 });
        }
        if (url.startsWith("/api/documents/search"))
          return documentSearchResponse(serverDocuments, url);
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json(serverDocuments);
        if (
          url === "/api/documents/doc-uploaded/process" &&
          init?.method === "POST"
        ) {
          const ready: StoredDocument = {
            ...stored,
            processing_status: "ready",
          };
          serverDocuments = serverDocuments.map((item) =>
            item.id === ready.id ? ready : item,
          );
          return Response.json({
            document_id: ready.id,
            processing_status: "ready",
            chunk_count: 1,
            indexed_at: "2026-09-15T08:00:00.000Z",
            index_quality: null,
          });
        }
        return existingFetch(url, init);
      }),
    );

    render(<App />);
    const file = new File(["%PDF-1.7 synthetic"], stored.name, {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [file] },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: `Upload ${stored.name}` }),
    );
    expect(
      await screen.findByRole("button", { name: `Index ${stored.name}` }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: `Index ${stored.name}` }),
    );
    expect(
      await screen.findByText("AI index · Searchable content ready"),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    expect(
      await screen.findByRole("option", { name: stored.name }),
    ).toBeInTheDocument();
  });
  it("refreshes course assignment without resetting draft, then clears a deleted selection", async () => {
    window.history.replaceState(null, "", "/#documents");
    let serverDocuments: StoredDocument[] = [
      { ...documentFixtures[0], processing_status: "ready" },
      documentFixtures[1],
    ];
    let listReads = 0;
    const existingFetch = globalThis.fetch;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/documents/search"))
          return documentSearchResponse(serverDocuments, url);
        if (url === "/api/documents" && init?.method !== "POST") {
          listReads++;
          return Response.json(serverDocuments);
        }
        if (url === "/api/documents/doc-1/course" && init?.method === "PATCH") {
          const moved = {
            ...serverDocuments.find((item) => item.id === "doc-1")!,
            course_id: "course-3",
            course_slug: "ec-102",
            course_name: "Kinh tế vi mô",
            course_code: "EC 102",
          };
          serverDocuments = serverDocuments.map((item) =>
            item.id === moved.id ? moved : item,
          );
          return Response.json(moved);
        }
        if (url === "/api/documents/doc-1" && init?.method === "DELETE") {
          serverDocuments = serverDocuments.filter(
            (item) => item.id !== "doc-1",
          );
          return new Response(null, { status: 204 });
        }
        return existingFetch(url, init);
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    const sourcePicker = await screen.findByLabelText(
      "Chọn tài liệu để tra cứu",
    );
    fireEvent.change(sourcePicker, { target: { value: "doc-1" } });
    const draft = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(draft, { target: { value: "Giữ phần nháp này" } });
    fireEvent.change(
      screen.getByLabelText("Course for de-cuong-thuat-toan.pdf"),
      { target: { value: "course-3" } },
    );
    await waitFor(() => expect(sourcePicker).toHaveValue("doc-1"));
    await waitFor(() => expect(listReads).toBe(2));
    expect(draft).toHaveValue("Giữ phần nháp này");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete de-cuong-thuat-toan.pdf",
      }),
    );
    await waitFor(() => expect(sourcePicker).toHaveValue(""));
    await waitFor(() => expect(listReads).toBe(3));
    expect(
      screen.queryByRole("option", { name: "de-cuong-thuat-toan.pdf" }),
    ).not.toBeInTheDocument();
    expect(draft).toHaveValue("Giữ phần nháp này");
  });
  it("clears a course-scoped source after it is detached in the course workspace", async () => {
    window.history.replaceState(null, "", "/#courses/cs-201");
    let serverDocuments = [
      { ...documentFixtures[0], processing_status: "ready" },
      documentFixtures[1],
    ];
    const existingFetch = globalThis.fetch;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json(serverDocuments);
        if (url === "/api/documents/doc-1/course" && init?.method === "PATCH") {
          const detached = {
            ...serverDocuments.find((item) => item.id === "doc-1")!,
            course_id: null,
            course_slug: null,
            course_name: null,
            course_code: null,
          };
          serverDocuments = serverDocuments.map((item) =>
            item.id === detached.id ? detached : item,
          );
          return Response.json(detached);
        }
        return existingFetch(url, init);
      }),
    );

    render(<App />);
    expect(
      await screen.findByRole("button", {
        name: "Detach document: de-cuong-thuat-toan.pdf",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    const picker = await screen.findByLabelText("Chọn tài liệu để tra cứu");
    fireEvent.change(picker, { target: { value: "doc-1" } });
    const draft = screen.getByLabelText("Câu hỏi cho ExaMate");
    fireEvent.change(draft, { target: { value: "Câu hỏi đúng phạm vi môn" } });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Detach document: de-cuong-thuat-toan.pdf",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(picker).toHaveValue(""));
    expect(draft).toHaveValue("Câu hỏi đúng phạm vi môn");
    expect(
      screen.queryByRole("option", { name: "de-cuong-thuat-toan.pdf" }),
    ).not.toBeInTheDocument();
    expect(serverDocuments[0].course_id).toBeNull();
  });
  it("keeps one card when the same PDF is picked twice in one selection", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    // Two picks of the same file on disk share name, size and lastModified.
    const pick = () =>
      new File(["shared syllabus"], "syllabus.pdf", {
        type: "application/pdf",
        lastModified: 1757000000000,
      });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pick(), pick()] },
    });

    expect(await screen.findAllByText("syllabus.pdf")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 already in the list was skipped",
    );
  });
  it("reports nothing added when a selected PDF is already listed", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    const picker = screen.getByLabelText("Choose PDF files");
    const pick = () =>
      new File(["shared syllabus"], "syllabus.pdf", {
        type: "application/pdf",
        lastModified: 1757000000000,
      });

    fireEvent.change(picker, { target: { files: [pick()] } });
    await screen.findByText("syllabus.pdf");

    fireEvent.change(picker, { target: { files: [pick()] } });

    expect(screen.getAllByText("syllabus.pdf")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "That PDF is already in the list.",
    );
  });
  it("uploads a PDF through the API and keeps File for retry after failure", async () => {
    window.history.replaceState(null, "", "/#documents");
    let attempts = 0;
    let storedAfterRetry: StoredDocument | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method === "POST") {
          attempts++;
          if (attempts === 2)
            storedAfterRetry = {
              ...documentFixtures[0],
              id: "document-1",
              name: "lifecycle.pdf",
            };
          return Response.json(
            attempts === 1
              ? { message: "Storage unavailable" }
              : {
                  id: "document-1",
                  name: "lifecycle.pdf",
                  size_bytes: 20,
                  media_type: "application/pdf",
                  storage_status: "stored",
                },
            { status: attempts === 1 ? 503 : 201 },
          );
        }
        if (url.startsWith("/api/documents/search"))
          return documentSearchResponse(
            storedAfterRetry ? [storedAfterRetry] : [],
            url,
          );
        return Response.json(url === "/api/documents" ? [] : [task]);
      }),
    );
    render(<App />);
    const pdf = new File(["%PDF-1.4"], "lifecycle.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pdf] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload lifecycle.pdf" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Upload lifecycle.pdf" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage unavailable",
    );
    expect(
      screen.queryByText("Stored · File and metadata saved"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry lifecycle.pdf" }),
    );
    expect(
      await screen.findByText("Stored · File and metadata saved"),
    ).toBeVisible();
    const calls = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST");
    expect(calls).toHaveLength(2);
    expect((calls[1][1]?.body as FormData).get("file")).toBe(pdf);
    expect(calls[1][1]?.headers).not.toHaveProperty("Content-Type");
    expect(
      screen.queryByLabelText("Preview state for lifecycle.pdf"),
    ).not.toBeInTheDocument();
  });
  it("rejects non-PDF files before any upload", () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    const textFile = new File(["not a pdf"], "notes.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [textFile] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only PDF files are accepted",
    );
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
  it("keeps tasks intact on a failed status update", async () => {
    window.history.replaceState(null, "", "/#tasks");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Response(
            JSON.stringify(
              init?.method === "PATCH" ? { message: "Unavailable" } : [task],
            ),
            { status: init?.method === "PATCH" ? 503 : 200 },
          ),
      ),
    );
    render(<App />);
    await screen.findByText("Review API contract");
    fireEvent.change(screen.getByLabelText("Status for Review API contract"), {
      target: { value: "done" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your previous status has been kept",
    );
    expect(screen.getByLabelText("Status for Review API contract")).toHaveValue(
      "todo",
    );
  });
  it("shows a retry action when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    render(<App />);
    expect(
      await screen.findByText(/Tasks are unavailable/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("opens the one shared panel from the assistant page, not a second composer", async () => {
    window.history.replaceState(null, "", "/#assistant");
    render(<App />);

    expect(
      await screen.findByRole("complementary", { name: "ExaMate AI" }),
    ).toBeInTheDocument();
    // One draft, one place to type it. The page used to have its own disabled
    // textarea, which was a second draft that could never be sent either.
    expect(screen.getAllByRole("textbox", { name: /câu hỏi/i })).toHaveLength(
      1,
    );
    expect(screen.getByRole("button", { name: /Gửi câu hỏi/ })).toBeDisabled();
  });
  it("keeps a past exam out of the upcoming list", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    // The fixtures straddle the pinned date: 21 Sep is ahead, 8 Sep is behind.
    // The soonest upcoming exam is the one featured at the top.
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Kiểm tra giữa kỳ phần thuật toán",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Còn 6 ngày")).toBeInTheDocument();

    // The past exam must appear once, and only under "Đã qua". Listing it in
    // both places would still satisfy a test that merely looked for it there.
    expect(screen.getAllByText("Bài kiểm tra chương tế bào")).toHaveLength(1);
    const pastGroup = screen.getByRole("heading", { level: 3, name: "Đã qua" });
    expect(
      within(pastGroup.parentElement!).getByText("Bài kiểm tra chương tế bào"),
    ).toBeInTheDocument();
    expect(screen.getByText("7 ngày trước")).toBeInTheDocument();
  });
  it("reveals the exam list even though its container mounts after loading", async () => {
    // jsdom ships no matchMedia, so useReveal treats every test as
    // "reduced motion" and starts revealed. That silently skipped the whole
    // animated path: this stub is what makes the hidden state real here.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    const heading = await screen.findByRole("heading", {
      level: 3,
      name: "Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
    });

    // `.reveal > *` holds every child at opacity 0 until `is-revealed` lands.
    // The panel renders a loading state first, so the container attaches on a
    // later render than the hook. If the reveal only looked for it once, the
    // exams stay in the DOM and invisible — which is the blank panel the page
    // was showing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(heading.closest(".reveal")).toHaveClass("is-revealed");
  });
  it("links an exam to the course it belongs to", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    const link = await screen.findByRole("link", {
      name: /C\u00f4ng ngh\u1ec7 ph\u1ea7n m\u1ec1m/,
    });
    expect(link).toHaveAttribute("href", "#courses/cs-201");
  });
  it("sends a new exam to the API with the date kept as a calendar day", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);
    await screen.findByLabelText("Exam name");

    fireEvent.change(screen.getByLabelText("Course"), {
      target: { value: "course-1" },
    });
    fireEvent.change(screen.getByLabelText("Exam name"), {
      target: { value: "Ki\u1ec3m tra cu\u1ed1i k\u1ef3" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-12-01" },
    });
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "07:30" },
    });
    fireEvent.change(screen.getByLabelText("Room"), {
      target: { value: "Ph\u00f2ng B203" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/exams",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            courseId: "course-1",
            topic: "Ki\u1ec3m tra cu\u1ed1i k\u1ef3",
            examDate: "2026-12-01",
            examTime: "07:30",
            room: "Ph\u00f2ng B203",
          }),
        }),
      ),
    );
  });
  it("asks before deleting an exam and only then calls the API", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete exam: Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      }),
    );

    // Nothing is sent on the first click: the row asks first.
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "DELETE",
        ),
    ).toBe(false);
    expect(
      screen.getByText("Xo\u00e1 k\u1ef3 thi n\u00e0y?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xo\u00e1" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/exams/exam-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          level: 3,
          name: "Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it("does not leave the next exam primed for deletion", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete exam: Kiểm tra giữa kỳ phần thuật toán",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    // The deleted exam was the featured one, so another exam takes its place.
    // That new card must start closed: inheriting the open confirmation would
    // put a one-click delete under the pointer that just clicked there.
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          level: 3,
          name: "Kiểm tra giữa kỳ phần thuật toán",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Xoá kỳ thi này?")).not.toBeInTheDocument();
  });
  it("keeps the exam when the confirmation is dismissed", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete exam: Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Gi\u1eef l\u1ea1i" }));

    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "DELETE",
        ),
    ).toBe(false);
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      }),
    ).toBeInTheDocument();
  });
  it("shows a readable message when the exam list cannot be loaded", async () => {
    window.history.replaceState(null, "", "/#exams");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/exams") throw new Error("Offline");
        if (url === "/api/courses") return Response.json(courseFixtures);
        return Response.json(url === "/api/documents" ? [] : [task]);
      }),
    );
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Ch\u01b0a xem \u0111\u01b0\u1ee3c l\u1ecbch thi",
    );
    expect(
      within(alert).getByRole("button", { name: /Retry exams/ }),
    ).toBeInTheDocument();
  });
  it("groups revision items by course and counts what is finished", async () => {
    window.history.replaceState(null, "", "/#study-plan");
    render(<App />);

    const cs = await screen.findByRole("heading", {
      level: 3,
      name: /Công nghệ phần mềm/,
    });
    // Two items for this course, one of them already done.
    expect(cs).toHaveTextContent("1/2 xọng".replace("xọng", "xong"));
    expect(
      within(cs).getByRole("link", { name: /Công nghệ phần mềm/ }),
    ).toHaveAttribute("href", "#courses/cs-201");

    const ec = screen.getByRole("heading", { level: 3, name: /Kinh tế vi mô/ });
    expect(ec).toHaveTextContent("0/1 xong");
  });
  it("marks a revision item as done through the API", async () => {
    window.history.replaceState(null, "", "/#study-plan");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mark as done: Ôn lại độ phức tạp thuật toán",
      }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/study-plans/plan-1/completion",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ completed: true }),
        }),
      ),
    );
    // The button flips, so the same control can undo what it just did.
    expect(
      await screen.findByRole("button", {
        name: "Mark as not done: Ôn lại độ phức tạp thuật toán",
      }),
    ).toBeInTheDocument();
  });
  it("asks before deleting a revision item", async () => {
    window.history.replaceState(null, "", "/#study-plan");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete revision item: Ôn lại độ phức tạp thuật toán",
      }),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "DELETE",
        ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/study-plans/plan-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
  it("explains what the study plan is for when there is nothing in it", async () => {
    window.history.replaceState(null, "", "/#study-plan");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/study-plans") return Response.json([]);
        if (url === "/api/courses") return Response.json(courseFixtures);
        if (url === "/api/exams") return Response.json([]);
        return Response.json(url === "/api/documents" ? [] : [task]);
      }),
    );
    render(<App />);

    expect(
      await screen.findByText(/những thứ bạn cần ôn trước kỳ thi/),
    ).toBeInTheDocument();
  });
  it("totals only the expenses inside the chosen period", async () => {
    window.history.replaceState(null, "", "/#finances");
    render(<App />);

    // Amounts repeat across the summary, the per-course bars and the rows, so
    // every assertion is scoped to the summary list it is actually about.
    const total = async () => {
      const term = await screen.findByText(/^\u0110\u00e3 chi /);
      return term.parentElement!.querySelector("dd")!.textContent;
    };

    expect(await total()).toBe("210.000 \u20ab");

    fireEvent.click(screen.getByLabelText("Tu\u1ea7n n\u00e0y"));
    // The week starts on Monday 14 Sep, so the 5 Sep fee drops out.
    expect(await total()).toBe("60.000 \u20ab");
    expect(
      screen.queryByText("L\u1ec7 ph\u00ed thi l\u1ea1i h\u1ecdc ph\u1ea7n"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("H\u00f4m nay"));
    expect(await total()).toBe("35.000 \u20ab");
    expect(
      screen.queryByText("C\u00e0 ph\u00ea ng\u1ed3i h\u1ecdc nh\u00f3m"),
    ).not.toBeInTheDocument();
  });
  describe("following a link to one expense", () => {
    const august = {
      ...expenseFixtures[2],
      id: "exp-aug",
      description: "Sách giáo trình học kỳ trước",
      spent_on: "2026-08-20",
    };
    function withExpenses(rows: object[]) {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/expenses" && init?.method !== "POST"
            ? Response.json(rows)
            : existingFetch(url, init),
        ),
      );
    }

    it("opens a wider period when the expense is outside this month, so its row exists", async () => {
      withExpenses([...expenseFixtures, august]);
      window.history.replaceState(null, "", "/#finances/exp-aug");
      render(<App />);

      expect(
        await screen.findByText("Sách giáo trình học kỳ trước"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Tất cả" })).toBeChecked();
      expect(
        document.querySelector('[data-focus-id="exp-aug"]'),
      ).not.toBeNull();
    });

    it("leaves the period alone when the expense is already in it", async () => {
      withExpenses([...expenseFixtures, august]);
      window.history.replaceState(null, "", "/#finances/exp-3");
      render(<App />);

      await screen.findByText("Lệ phí thi lại học phần");
      expect(screen.getByRole("radio", { name: "Tháng này" })).toBeChecked();
    });

    it("keeps this month as the default when no expense is linked", async () => {
      withExpenses([...expenseFixtures, august]);
      window.history.replaceState(null, "", "/#finances");
      render(<App />);

      await screen.findByText("Lệ phí thi lại học phần");
      expect(screen.getByRole("radio", { name: "Tháng này" })).toBeChecked();
      expect(
        screen.queryByText("Sách giáo trình học kỳ trước"),
      ).not.toBeInTheDocument();
    });

    it("can show every expense on request", async () => {
      withExpenses([...expenseFixtures, august]);
      window.history.replaceState(null, "", "/#finances");
      render(<App />);
      await screen.findByText("Lệ phí thi lại học phần");

      fireEvent.click(screen.getByRole("radio", { name: "Tất cả" }));

      expect(
        screen.getByText("Sách giáo trình học kỳ trước"),
      ).toBeInTheDocument();
    });
  });
  it("totals spending per course and keeps unassigned spending visible", async () => {
    window.history.replaceState(null, "", "/#finances");
    render(<App />);

    const heading = await screen.findByRole("heading", {
      level: 3,
      name: "Chi theo môn học",
    });
    const list = heading.nextElementSibling as HTMLElement;
    expect(within(list).getByText("150.000 ₫")).toBeInTheDocument();
    expect(within(list).getByText("35.000 ₫")).toBeInTheDocument();
    // Money that belongs to no subject must not silently vanish from the
    // breakdown, or the per-course totals would not add up to the headline.
    expect(within(list).getByText("Không thuộc môn nào")).toBeInTheDocument();
  });
  it("sends a new expense as a number, not a string", async () => {
    window.history.replaceState(null, "", "/#finances");
    render(<App />);
    await screen.findByLabelText("Description");

    fireEvent.change(screen.getByLabelText("Amount (₫)"), {
      target: { value: "42000" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Mua bút" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/expenses",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 42000,
            description: "Mua bút",
            spentOn: "2026-09-15",
            category: "books",
          }),
        }),
      ),
    );
  });
  it("never sends a fractional amount to the API", async () => {
    window.history.replaceState(null, "", "/#finances");
    render(<App />);
    await screen.findByLabelText("Description");

    fireEvent.change(screen.getByLabelText("Amount (\u20ab)"), {
      target: { value: "12.5" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Le" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));

    // Two layers stop this, and the test locks the outcome rather than either
    // one. A number input steps by 1 unless told otherwise, so 12.5 fails
    // constraint validation and the submit never fires; if the field were ever
    // changed to type="text", the integer check in the handler catches it
    // instead. Verified by mutation: the test only goes red when both are gone.
    // It matters because the column stores INTEGER.
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url, init]) =>
              url === "/api/expenses" &&
              (init as RequestInit)?.method === "POST",
          ),
      ).toBe(false),
    );
  });
  it("asks before deleting an expense", async () => {
    window.history.replaceState(null, "", "/#finances");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete expense: In tài liệu ôn thuật toán",
      }),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "DELETE",
        ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/expenses/exp-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
  it("sends the chosen course with an uploaded PDF", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);
    await screen.findByLabelText("Save under course");

    fireEvent.change(screen.getByLabelText("Save under course"), {
      target: { value: "course-1" },
    });
    const pdf = new File(["%PDF-1.4"], "de-cuong.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pdf] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload de-cuong.pdf" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Upload de-cuong.pdf" }),
    );

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) =>
            url === "/api/documents" &&
            (init as RequestInit)?.method === "POST",
        );
      expect(call).toBeDefined();
      const body = (call![1] as RequestInit).body as FormData;
      expect(body.get("courseId")).toBe("course-1");
    });
  });
  it("omits the course field when no subject is chosen", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);
    await screen.findByLabelText("Save under course");

    const pdf = new File(["%PDF-1.4"], "roi-rac.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pdf] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload roi-rac.pdf" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Upload roi-rac.pdf" }));

    // An empty string is not a UUID; sending it would fail the whole upload
    // over a field the student deliberately left alone.
    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) =>
            url === "/api/documents" &&
            (init as RequestInit)?.method === "POST",
        );
      expect(call).toBeDefined();
      expect(((call![1] as RequestInit).body as FormData).has("courseId")).toBe(
        false,
      );
    });
  });
  it("filters stored documents by course, including those with none", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    expect(
      await screen.findByText("de-cuong-thuat-toan.pdf"),
    ).toBeInTheDocument();
    expect(screen.getByText("ghi-chu-chung.pdf")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter by course/), {
      target: { value: "course-1" },
    });
    expect(
      await screen.findByText("de-cuong-thuat-toan.pdf"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("ghi-chu-chung.pdf")).not.toBeInTheDocument(),
    );

    // "no course" is its own choice, not the absence of a filter.
    fireEvent.change(screen.getByLabelText(/Filter by course/), {
      target: { value: "none" },
    });
    expect(await screen.findByText("ghi-chu-chung.pdf")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("de-cuong-thuat-toan.pdf"),
      ).not.toBeInTheDocument(),
    );
  });
  it("re-files a stored document under another course", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);
    await screen.findByText("ghi-chu-chung.pdf");

    fireEvent.change(screen.getByLabelText("Course for ghi-chu-chung.pdf"), {
      target: { value: "course-3" },
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/documents/doc-2/course",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ courseId: "course-3" }),
        }),
      ),
    );
  });
  it("shows only this course's work on its detail page", async () => {
    window.history.replaceState(null, "", "/#courses/cs-201");
    render(<App />);

    const workspace = await screen.findByRole("region", {
      name: "Workspace for this course",
    });
    // Belongs to CS 201. findBy, not getBy: each block fetches its own
    // list, so the workspace renders before any of them land.
    expect(
      await within(workspace).findByText(
        "Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      ),
    ).toBeInTheDocument();
    expect(
      within(workspace).getByText("de-cuong-thuat-toan.pdf"),
    ).toBeInTheDocument();
    // Belongs to other subjects, or to none.
    expect(
      within(workspace).queryByText(
        "B\u00e0i ki\u1ec3m tra kinh t\u1ebf vi m\u00f4",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(workspace).queryByText("ghi-chu-chung.pdf"),
    ).not.toBeInTheDocument();
  });
  it("adds a revision item from the course page with the course already set", async () => {
    window.history.replaceState(null, "", "/#courses/cs-201");
    render(<App />);
    const workspace = await screen.findByRole("region", {
      name: "Workspace for this course",
    });

    fireEvent.change(
      await within(workspace).findByLabelText("What to revise"),
      {
        target: { value: "\u00d4n ch\u01b0\u01a1ng b\u1ed1n" },
      },
    );
    fireEvent.click(
      within(workspace).getByRole("button", { name: /Add revision item/ }),
    );

    // The student never picked a subject here: the page already knows it.
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/study-plans",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            courseId: "course-1",
            title: "\u00d4n ch\u01b0\u01a1ng b\u1ed1n",
          }),
        }),
      ),
    );
  });
  it("edits an exam in place and sends every field", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit exam: Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      }),
    );
    const form = screen.getByRole("form", {
      name: "Edit exam: Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
    });
    // Pre-filled with what is stored, so the student corrects rather than
    // retypes: an empty form would make "unchanged" indistinguishable from
    // "cleared".
    expect(within(form).getByLabelText("Room")).toHaveValue("Ph\u00f2ng A201");

    fireEvent.change(within(form).getByLabelText("Room"), {
      target: { value: "Ph\u00f2ng B999" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/exams/exam-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            topic:
              "Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
            examDate: "2026-09-21",
            examTime: "09:00",
            room: "Ph\u00f2ng B999",
            revisionNote:
              "\u00d4n l\u1ea1i \u0111\u1ed9 ph\u1ee9c t\u1ea1p v\u00e0 c\u00e2y nh\u1ecb ph\u00e2n t\u00ecm ki\u1ebfm.",
          }),
        }),
      ),
    );
  });
  it("closes the exam editor without saving when cancelled", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit exam: Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hu\u1ef7" }));

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === "PATCH",
        ),
    ).toBe(false);
  });
  it("uploads a PDF straight from the course page with the course attached", async () => {
    window.history.replaceState(null, "", "/#courses/cs-201");
    render(<App />);
    const workspace = await screen.findByRole("region", {
      name: "Workspace for this course",
    });

    const picker = await within(workspace).findByLabelText(
      /Ch\u1ecdn t\u1ec7p PDF cho m\u00f4n n\u00e0y/,
    );
    const pdf = new File(["%PDF-1.4"], "slide-buoi-1.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(picker, { target: { files: [pdf] } });

    // The student never chose a subject here; the page supplies it.
    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) =>
            url === "/api/documents" &&
            (init as RequestInit)?.method === "POST",
        );
      expect(call).toBeDefined();
      const body = (call![1] as RequestInit).body as FormData;
      expect(body.get("courseId")).toBe("course-1");
      expect((body.get("file") as File).name).toBe("slide-buoi-1.pdf");
    });
  });
  it("finds workspace objects by name and links each to where it lives", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Find an object"), {
      target: { value: "thu\u1eadt to\u00e1n" },
    });

    const results = await screen.findByRole("region", {
      name: "Search results",
    });
    // One phrase, three different kinds of object. Each link names the
    // object itself, not just its page, so the destination can scroll to it.
    expect(
      within(results).getByRole("link", {
        name: /Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n/,
      }),
    ).toHaveAttribute("href", "#exams/exam-1");
    expect(
      within(results).getByRole("link", {
        name: /\u00d4n l\u1ea1i \u0111\u1ed9 ph\u1ee9c t\u1ea1p thu\u1eadt to\u00e1n/,
      }),
    ).toHaveAttribute("href", "#study-plan/plan-1");
    expect(
      within(results).getByRole("link", { name: /de-cuong-thuat-toan\.pdf/ }),
    ).toHaveAttribute("href", "#documents/doc-1");
  });
  it("finds a course and links straight to its own page", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Find an object"), {
      target: { value: "C\u00f4ng ngh\u1ec7" },
    });

    const results = await screen.findByRole("region", {
      name: "Search results",
    });
    // The phrase also appears on every exam, revision item and document
    // belonging to that course, which is the point of matching the
    // supporting line too. Scoped to the course group to be unambiguous.
    const courseGroup =
      within(results).getByText("M\u00f4n h\u1ecdc").parentElement!;
    expect(
      within(courseGroup).getByRole("link", {
        name: /C\u00f4ng ngh\u1ec7 ph\u1ea7n m\u1ec1m/,
      }),
    ).toHaveAttribute("href", "#courses/cs-201");
  });
  it("matches Vietnamese text typed without tone marks", async () => {
    render(<App />);

    // How most people type in a hurry. Folding the diacritics on both sides is
    // what makes "thuat toan" reach "thuật toán".
    fireEvent.change(screen.getByLabelText("Find an object"), {
      target: { value: "thuat toan" },
    });

    const results = await screen.findByRole("region", {
      name: "Search results",
    });
    expect(
      within(results).getByRole("link", {
        name: /Ki\u1ec3m tra gi\u1eefa k\u1ef3 ph\u1ea7n thu\u1eadt to\u00e1n/,
      }),
    ).toBeInTheDocument();
  });
  it("says so plainly when nothing matches", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Find an object"), {
      target: { value: "zzzzz" },
    });

    expect(
      await screen.findByText(
        "Kh\u00f4ng t\u00ecm th\u1ea5y g\u00ec kh\u1edbp.",
      ),
    ).toBeInTheDocument();
  });
  it("keeps every page in the sidebar while searching", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const before = within(nav).getAllByRole("link").length;

    fireEvent.change(screen.getByLabelText("Find an object"), {
      target: { value: "zzzzz" },
    });
    await screen.findByText("Kh\u00f4ng t\u00ecm th\u1ea5y g\u00ec kh\u1edbp.");

    // The box used to hide pages as you typed. It no longer touches the nav:
    // that filtering was the reason it was useless, every page being visible
    // already.
    expect(within(nav).getAllByRole("link")).toHaveLength(before);
  });
  it("scrolls to and marks the object a link named", async () => {
    // jsdom has no layout, so scrollIntoView is a stub; spying on it is the
    // only way to prove the right element was the one scrolled to.
    const scrolled: HTMLElement[] = [];
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoViewSpy(
      this: HTMLElement,
    ) {
      scrolled.push(this);
    };
    try {
      window.history.replaceState(null, "", "/#exams/exam-3");
      render(<App />);

      // The id after the page name must not be mistaken for part of it. Get
      // this wrong and the app falls back to the dashboard, which also lists
      // exams — so the row would still be found, on entirely the wrong page.
      expect(
        await screen.findByRole("heading", { level: 1, name: /prepared/i }),
      ).toBeInTheDocument();

      const row = await waitFor(() => {
        const found = document.querySelector<HTMLElement>(
          '[data-focus-id="exam-3"]',
        );
        expect(found).not.toBeNull();
        return found!;
      });

      // The row only exists once the list has loaded, which is after the
      // navigation: the lookup has to keep trying, not run once.
      await waitFor(() => expect(scrolled).toContain(row));
      expect(row).toHaveClass("is-focus-target");
      expect(row).toHaveTextContent(
        "B\u00e0i ki\u1ec3m tra kinh t\u1ebf vi m\u00f4",
      );
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });
  it("still opens a page when the link carries no object", async () => {
    window.history.replaceState(null, "", "/#exams");
    render(<App />);

    // Links written before search existed have no id after the page name and
    // must keep working untouched.
    expect(
      await screen.findByRole("heading", { level: 1, name: /prepared/i }),
    ).toBeInTheDocument();
    expect(document.querySelector(".is-focus-target")).toBeNull();
  });
  it("moves one note without disturbing the order of the rest", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveNote(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveNote(items, 3, 1)).toEqual(["a", "d", "b", "c"]);
    // Nothing to do, and nothing to break: the same array comes back.
    expect(moveNote(items, 1, 1)).toBe(items);
    expect(moveNote(items, 0, 9)).toBe(items);
    expect(moveNote(items, -1, 0)).toBe(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });
  it("reorders notes with the arrow keys and remembers the new order", async () => {
    localStorage.setItem(
      "examate-notes:test-user:test-workspace",
      JSON.stringify([
        { id: "n1", text: "\u0110\u1ea7u ti\u00ean", tone: 0 },
        { id: "n2", text: "Th\u1ee9 hai", tone: 1 },
        { id: "n3", text: "Th\u1ee9 ba", tone: 2 },
      ]),
    );
    render(<App />);

    const handle = screen.getByRole("button", {
      name: /Move note 1: \u0110\u1ea7u ti\u00ean/,
    });
    fireEvent.keyDown(handle, { key: "ArrowRight" });

    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem("examate-notes:test-user:test-workspace")!,
      ) as {
        id: string;
      }[];
      expect(saved.map((note) => note.id)).toEqual(["n2", "n1", "n3"]);
    });
    // The move is announced, because nothing about it is visible to someone
    // who cannot see the grid rearrange.
    expect(
      screen.getByText(
        /\u0110\u00e3 chuy\u1ec3n \u0110\u1ea7u ti\u00ean sang v\u1ecb tr\u00ed 2 tr\u00ean 3/,
      ),
    ).toBeInTheDocument();
  });
  it("refuses to move the first note further back or the last one further on", async () => {
    localStorage.setItem(
      "examate-notes:test-user:test-workspace",
      JSON.stringify([
        { id: "n1", text: "\u0110\u1ea7u ti\u00ean", tone: 0 },
        { id: "n2", text: "Th\u1ee9 hai", tone: 1 },
      ]),
    );
    render(<App />);

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /Move note 1: \u0110\u1ea7u ti\u00ean/,
      }),
      { key: "ArrowLeft" },
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Move note 2: Th\u1ee9 hai/ }),
      { key: "ArrowRight" },
    );

    // Neither edge wraps around, and neither writes anything.
    expect(localStorage.getItem("examate-notes:test-user:test-workspace")).toBe(
      JSON.stringify([
        { id: "n1", text: "\u0110\u1ea7u ti\u00ean", tone: 0 },
        { id: "n2", text: "Th\u1ee9 hai", tone: 1 },
      ]),
    );
  });
  it("keeps the note text editable, which is why dragging has its own handle", async () => {
    render(<App />);

    // The textarea is not inside anything draggable: the handle is a separate
    // control, so selecting and editing the text still works normally.
    const field = screen.getByLabelText("Quick note 1");
    expect(field.closest("[draggable=true]")).toBeNull();
    fireEvent.change(field, {
      target: {
        value: "S\u1eeda \u0111\u01b0\u1ee3c b\u00ecnh th\u01b0\u1eddng",
      },
    });
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem("examate-notes:test-user:test-workspace")!,
        )[0].text,
      ).toBe("S\u1eeda \u0111\u01b0\u1ee3c b\u00ecnh th\u01b0\u1eddng"),
    );
  });
  it("replaces the header Ask AI button with one floating launcher", () => {
    render(<App />);

    expect(screen.queryByText("Ask AI")).not.toBeInTheDocument();
    const launchers = screen.getAllByRole("button", {
      name: "Open ExaMate AI",
    });
    expect(launchers).toHaveLength(1);
    expect(launchers[0]).toHaveAttribute("aria-expanded", "false");
    expect(launchers[0]).toHaveAttribute("aria-controls", "examate-ai-panel");

    fireEvent.click(launchers[0]);
    expect(launchers[0]).toHaveAttribute("aria-expanded", "true");
  });
  it("keeps the panel mounted but out of reach while it is closed", () => {
    render(<App />);

    // Mounted, so the draft has somewhere to live; hidden, so a closed panel
    // takes no Tab stops and is not read out.
    const panel = document.getElementById("examate-ai-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");
    expect(
      screen.queryByRole("complementary", { name: "ExaMate AI" }),
    ).not.toBeInTheDocument();
  });
  it("keeps the draft when the panel is closed and opened again", () => {
    render(<App />);
    const launcher = screen.getByRole("button", { name: "Open ExaMate AI" });

    fireEvent.click(launcher);
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "C\u00e2u h\u1ecfi \u0111ang g\u00f5 d\u1edf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đóng ExaMate AI" }));
    fireEvent.click(launcher);

    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "C\u00e2u h\u1ecfi \u0111ang g\u00f5 d\u1edf",
    );
  });
  it("keeps the draft when the page changes underneath it", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Gi\u1eef qua chuy\u1ec3n trang" },
    });

    window.history.replaceState(null, "", "/#tasks");
    fireEvent(window, new HashChangeEvent("hashchange"));

    expect(
      await screen.findByRole("heading", { level: 1, name: /Small steps/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Gi\u1eef qua chuy\u1ec3n trang",
    );
  });
  it("returns focus to whichever control opened the panel", () => {
    render(<App />);

    const hero = screen.getByRole("button", { name: /Ask ExaMate/ });
    fireEvent.click(hero);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(hero).toHaveFocus();
  });
  it("sends the question in document-grounded mode and renders the answer", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Tôi nên chuẩn bị phần nào cho bài thuyết trình?" },
    });

    const send = screen.getByRole("button", { name: /Gửi câu hỏi/ });
    expect(send).toBeEnabled();
    expect(screen.getByRole("group", { name: "Chế độ" })).toBeInTheDocument();
    fireEvent.click(send);

    expect(
      await screen.findByText(
        "Chia bài thuyết trình thành mục tiêu, demo và phần hỏi đáp.",
      ),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/assistant/chat/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Tôi nên chuẩn bị phần nào cho bài thuyết trình?",
          mode: "documents",
          operation: "question",
          pageContext: { pageId: "dashboard", pageName: "Dashboard" },
          history: [],
        }),
      }),
    );
    expect(screen.queryByText("Ví dụ câu trả lời có nguồn")).toBeNull();
  });
  it("uses the live SSE endpoint and replaces the partial text with the final answer", async () => {
    const encoder = new TextEncoder();
    let finishStream: () => void = () => {};
    const doneResponse = {
      answer: "Đây là câu trả lời cuối cùng.",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: "gemini-2.5-flash",
      mode: "general",
      ragEnabled: false,
      promptVersion: "general-v1",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/assistant/chat/stream" && init?.method === "POST")
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "start" })}\n\n` +
                      `data: ${JSON.stringify({ type: "delta", text: "Đây là câu trả lời đang được tạo" })}\n\n`,
                  ),
                );
                finishStream = () => {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "done", response: doneResponse, answerId: "77777777-7777-4777-8777-777777777777" })}\n\n`,
                    ),
                  );
                  controller.close();
                };
              },
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        return Response.json(url === "/api/documents" ? documentFixtures : []);
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Giải thích câu này" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText("Đây là câu trả lời đang được tạo"),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/assistant/chat/stream",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Accept: "text/event-stream" }),
        body: expect.stringContaining('"mode":"general"'),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Dừng trả lời" }),
    ).toBeInTheDocument();

    await act(async () => finishStream());
    expect(
      await screen.findByText("Đây là câu trả lời cuối cùng."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Đây là câu trả lời đang được tạo")).toBeNull();
  });
  it("streams AI Chat document questions after retrieval and applies verified citations on completion", async () => {
    const citedResponse = {
      answer: "Chương 2 nói về độ phức tạp thuật toán [S1].",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [
        {
          sourceId: "S1",
          documentId: "doc-2",
          chunkId: "chunk-1",
          title: "ghi-chu-chung.pdf",
          page: 3,
          chunkIndex: 0,
        },
      ],
      provider: "google",
      model: "gemini-2.5-flash",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    };
    const events = [
      { type: "start" },
      { type: "status", stage: "retrieving" },
      { type: "status", stage: "generating" },
      { type: "delta", text: "Chương 2 nói về độ phức tạp thuật toán ." },
      { type: "done", response: citedResponse },
    ];
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url === "/api/assistant/chat/stream" && init?.method === "POST"
          ? new Response(
              events
                .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                .join(""),
              { status: 200, headers: { "Content-Type": "text/event-stream" } },
            )
          : existingFetch(url, init),
      ),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Chương 2 nói gì?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText("Chương 2 nói về độ phức tạp thuật toán [S1]."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/assistant/chat/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"mode":"documents"'),
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      }),
    ).toBeInTheDocument();
  });
  it("routes a named document's course question to verified workspace metadata", async () => {
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json([
            { ...documentFixtures[0], processing_status: "ready" },
            documentFixtures[1],
          ]);
        if (url === "/api/assistant/chat" && init?.method === "POST")
          return Response.json({
            answer:
              "Trong workspace, tài liệu được gắn với môn Công nghệ phần mềm (CS 201).",
            answerable: true,
            reasonCode: "DOCUMENT_METADATA",
            citations: [],
            provider: "workspace",
            model: "database",
            mode: "documents",
            ragEnabled: false,
            promptVersion: "workspace-metadata-v1",
            metadataSource: {
              documentId: "doc-1",
              title: "de-cuong-thuat-toan.pdf",
              courseId: "course-1",
              courseSlug: "cs-201",
              courseName: "Công nghệ phần mềm",
              courseCode: "CS 201",
            },
          });
        return existingFetch(url, init);
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" });
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "de-cuong-thuat-toan.pdf thuộc khóa học nào" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/assistant/chat",
        expect.objectContaining({
          body: expect.stringContaining('"operation":"course_info"'),
        }),
      ),
    );
    const chatCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/assistant/chat");
    expect(JSON.parse(String(chatCall?.[1]?.body))).toMatchObject({
      documentId: "doc-1",
      mode: "documents",
      operation: "course_info",
    });
    expect(
      await screen.findByRole("link", { name: /Công nghệ phần mềm.*CS 201/ }),
    ).toHaveAttribute("href", "#courses/cs-201");
  });
  it("summarizes a named PDF and explains when its legacy index has no coverage", async () => {
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json([
            { ...documentFixtures[0], processing_status: "ready" },
            documentFixtures[1],
          ]);
        return existingFetch(url, init);
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" });
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "de-cuong-thuat-toan.pdf có nội dung về gì" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    await waitFor(() => {
      const chatCall = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => url === "/api/assistant/chat");
      expect(JSON.parse(String(chatCall?.[1]?.body))).toMatchObject({
        documentId: "doc-1",
        operation: "summarize",
      });
    });
    expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
      "doc-1",
    );
    expect(
      screen.getByText(
        /Đã lập chỉ mục theo phiên bản cũ; chưa có thống kê độ phủ/,
      ),
    ).toBeInTheDocument();
  });
  it("does not search a different PDF when the named document is unavailable", async () => {
    const existingFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method !== "POST")
          return Response.json([
            { ...documentFixtures[0], processing_status: "ready" },
          ]);
        return existingFetch(url, init);
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    await screen.findByRole("option", { name: "de-cuong-thuat-toan.pdf" });
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "tai-lieu-chua-co.pdf có nội dung về gì" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Không tìm thấy đúng tài liệu PDF này/,
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => url === "/api/assistant/chat"),
    ).toBe(false);
  });
  it("opens as a modal sheet on a narrow screen and releases the page on close", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));

    const sheet = screen.getByRole("dialog", { name: "ExaMate AI" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    // Everything behind the sheet is inert, which is what keeps Tab inside it,
    // and the page underneath stops scrolling.
    expect(document.querySelector(".desktop-shell")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    // Nothing outside the sheet may stay reachable. The skip link sits outside
    // the shell, so making only the shell inert left Tab one stop to escape
    // through — found by listing every focusable element at 375px.
    const panel = document.getElementById("examate-ai-panel")!;
    const reachable = [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, summary",
      ),
    ].filter(
      (element) => !panel.contains(element) && !element.closest("[inert]"),
    );
    expect(reachable).toEqual([]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".desktop-shell")).not.toHaveAttribute(
      "inert",
    );
    expect(document.body.style.overflow).toBe("");
  });
  it("does not let navigation pull focus out of an open modal sheet", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
    await waitFor(() => expect(composer).toHaveFocus());

    window.history.replaceState(null, "", "/#tasks");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // The router normally moves focus to the new page heading. With a modal
    // open that heading is inert behind it, so focus has to stay put.
    expect(composer).toHaveFocus();
  });
  describe("ExaMate AI panel", () => {
    /** A matchMedia whose answer is decided per query. */
    function stubScreen(matches: (query: string) => boolean) {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: matches(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));
    }
    const tabletOnly = (query: string) => query.includes("1023px");
    const citedAnswer = {
      answer: "Chương 2 nói về độ phức tạp thuật toán.",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [
        {
          sourceId: "src-1",
          documentId: "doc-2",
          chunkId: "chunk-1",
          title: "ghi-chu-chung.pdf",
          page: 3 as number | null,
          chunkIndex: 0,
        },
      ],
      provider: "google",
      model: "gemini-2.5-flash",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    };
    function answerWithCitation() {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/assistant/chat/stream" && init?.method === "POST"
            ? assistantSseResponse(
                citedAnswer,
                citedAnswer.answer.replace(/\[S[^\]]*\]/g, ""),
              )
            : existingFetch(url, init),
        ),
      );
    }
    /** Stands in for the blank tab `window.open("", "_blank")` returns. */
    function fakeTab() {
      return {
        opener: window as Window | null,
        location: { replace: vi.fn() },
        close: vi.fn(),
      };
    }
    function answerWithCitations(citations: (typeof citedAnswer)["citations"]) {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/assistant/chat/stream" && init?.method === "POST"
            ? assistantSseResponse(
                { ...citedAnswer, citations },
                citedAnswer.answer.replace(/\[S[^\]]*\]/g, ""),
              )
            : existingFetch(url, init),
        ),
      );
    }
    const chatBodies = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          ["/api/assistant/chat", "/api/assistant/chat/stream"].includes(
            String(url),
          ),
        )
        .map(([, init]) => JSON.parse(String(init?.body)));
    async function openWithDocument() {
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      await screen.findByRole("option", { name: "ghi-chu-chung.pdf" });
      fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
        target: { value: "doc-2" },
      });
    }
    async function ask(question: string) {
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: question },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));
      await waitFor(() =>
        expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(""),
      );
    }

    const TASK_ID = "00000000-0000-4000-8000-000000000001";
    const EXAM_ID = "00000000-0000-4000-8000-000000000011";
    const PLAN_ID = "00000000-0000-4000-8000-000000000021";
    const EXPENSE_ID = "00000000-0000-4000-8000-000000000031";
    const DOC_ID = "00000000-0000-4000-8000-000000000041";
    const workspaceAnswer = {
      answer:
        "Có 1 task chưa xong trong danh sách chung (task không gắn với môn học nào):\n- Viết báo cáo tiến độ — Chưa bắt đầu · hạn 28/09/2026\n\nTính theo ngày 29/09/2026 (giờ Việt Nam), từ dữ liệu đang lưu trong workspace demo dùng chung — không qua AI.",
      answerable: true,
      reasonCode: "WORKSPACE_ANSWER",
      citations: [],
      provider: "workspace",
      model: "database",
      mode: "workspace",
      ragEnabled: false,
      promptVersion: "workspace-v1",
      workspaceIntent: "tasks_open",
      asOf: "2026-09-29",
      workspaceSources: [
        {
          kind: "task",
          id: TASK_ID,
          label: "Viết báo cáo tiến độ",
          detail: "Chưa bắt đầu · hạn 28/09/2026",
        },
        { kind: "exam", id: EXAM_ID, label: "Cuối kỳ", detail: "Sắp tới" },
        { kind: "study_plan", id: PLAN_ID, label: "Ôn chương 3" },
        { kind: "expense", id: EXPENSE_ID, label: "Giáo trình" },
        { kind: "document", id: DOC_ID, label: "de-cuong-thuat-toan.pdf" },
        {
          kind: "course",
          id: "11111111-1111-4111-8111-111111111111",
          slug: "cs-201",
          label: "Công nghệ phần mềm (CS 201)",
        },
      ],
    };
    function answerFromWorkspace(response: object = workspaceAnswer) {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/assistant/chat/stream" && init?.method === "POST"
            ? assistantSseResponse(response as Record<string, any>)
            : existingFetch(url, init),
        ),
      );
    }

    it("answers a workspace question from the records, with a link to each one", async () => {
      answerFromWorkspace();
      render(<App />);
      await openWithDocument();
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      // Documents-only controls step aside; the mode says what it reads.
      expect(screen.queryByLabelText("Chọn tài liệu để tra cứu")).toBeNull();
      expect(screen.getByText(/không đọc nội dung PDF/i)).toBeInTheDocument();

      await ask("Task nào chưa xong?");

      const [body] = chatBodies();
      expect(body).toEqual({
        message: "Task nào chưa xong?",
        mode: "workspace",
        operation: "question",
        pageContext: { pageId: "dashboard", pageName: "Dashboard" },
      });
      expect(
        await screen.findByText(/Có 1 task chưa xong trong danh sách chung/),
      ).toBeInTheDocument();

      const sources = screen.getByRole("list", { name: "Nguồn workspace" });
      const links = within(sources)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]);
      expect(links).toEqual([
        ["Task: Viết báo cáo tiến độ", `#tasks/${TASK_ID}`],
        ["Exam: Cuối kỳ", `#exams/${EXAM_ID}`],
        ["Study plan: Ôn chương 3", `#study-plan/${PLAN_ID}`],
        ["Expense: Giáo trình", `#finances/${EXPENSE_ID}`],
        ["Document: de-cuong-thuat-toan.pdf", `#documents/${DOC_ID}`],
        ["Course: Công nghệ phần mềm (CS 201)", "#courses/cs-201"],
      ]);
      expect(
        within(sources).getByText("Chưa bắt đầu · hạn 28/09/2026"),
      ).toBeInTheDocument();
      // A record is not a PDF citation: no page, no preview button.
      expect(
        screen.queryByRole("list", { name: "Nguồn tham khảo" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: /Mở nguồn/ })).toBeNull();
    });

    it("on a phone, following a workspace source puts the record in view", async () => {
      stubScreen((query) => query.includes("max-width"));
      answerFromWorkspace();
      render(<App />);
      const launcher = screen.getByRole("button", { name: "Open ExaMate AI" });
      fireEvent.click(launcher);
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      await ask("Task nào chưa xong?");
      const panel = document.getElementById("examate-ai-panel")!;

      fireEvent.click(
        screen.getByRole("link", { name: "Task: Viết báo cáo tiến độ" }),
      );

      // The sheet covered the whole screen; it steps aside so the record the
      // student asked to see is actually visible, and the page is usable.
      await waitFor(() => expect(panel).not.toBeVisible());
      expect(document.querySelector(".desktop-shell")).not.toHaveAttribute(
        "inert",
      );
      expect(document.body.style.overflow).toBe("");
      await waitFor(() =>
        expect(window.location.hash).toBe(`#tasks/${TASK_ID}`),
      );
      // Focus goes to the page that opened, not back to the launcher.
      await waitFor(() =>
        expect(screen.getByRole("heading", { level: 1 })).toHaveFocus(),
      );

      // The conversation is still there when the student comes back to it.
      fireEvent.click(launcher);
      expect(
        screen.getByText(/Có 1 task chưa xong trong danh sách chung/),
      ).toBeInTheDocument();
    });

    it("on a wide screen, following a workspace source keeps the window open beside the page", async () => {
      answerFromWorkspace();
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      await ask("Task nào chưa xong?");

      fireEvent.click(
        screen.getByRole("link", { name: "Task: Viết báo cáo tiến độ" }),
      );

      await waitFor(() =>
        expect(window.location.hash).toBe(`#tasks/${TASK_ID}`),
      );
      expect(document.getElementById("examate-ai-panel")).toBeVisible();
    });

    it("moves focus to the page heading without scrolling away from a linked record", async () => {
      render(<App />);
      const focus = vi.spyOn(HTMLElement.prototype, "focus");

      window.history.replaceState(null, "", `/#tasks/${TASK_ID}`);
      fireEvent(window, new HashChangeEvent("hashchange"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );

      // Focus lands on the heading, but the page must stay where the record
      // is: a plain focus() scrolls to the top and pushes the record away.
      const onHeading = focus.mock.instances
        .map((element, index) => ({
          element,
          options: focus.mock.calls[index][0],
        }))
        .filter(({ element }) => (element as HTMLElement).tagName === "H1");
      expect(onHeading.length).toBeGreaterThan(0);
      for (const { options } of onHeading)
        expect(options).toMatchObject({ preventScroll: true });
      focus.mockRestore();
    });

    it("still scrolls to the top for an ordinary page change", async () => {
      render(<App />);
      const focus = vi.spyOn(HTMLElement.prototype, "focus");

      window.history.replaceState(null, "", "/#exams");
      fireEvent(window, new HashChangeEvent("hashchange"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );

      const onHeading = focus.mock.instances
        .map((element, index) => ({
          element,
          options: focus.mock.calls[index][0],
        }))
        .filter(({ element }) => (element as HTMLElement).tagName === "H1");
      expect(onHeading.length).toBeGreaterThan(0);
      for (const { options } of onHeading)
        expect(options?.preventScroll).not.toBe(true);
      focus.mockRestore();
    });

    it("does not turn a source into a link unless it is a real record id", async () => {
      answerFromWorkspace({
        ...workspaceAnswer,
        workspaceSources: [
          { kind: "task", id: "javascript:alert(1)", label: "Bẫy liên kết" },
          { kind: "course", id: TASK_ID, slug: "../../evil", label: "Khóa lạ" },
        ],
      });
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      await ask("Task nào chưa xong?");

      const sources = await screen.findByRole("list", {
        name: "Nguồn workspace",
      });
      expect(within(sources).queryAllByRole("link")).toEqual([]);
      expect(
        within(sources).getByText("Task: Bẫy liên kết"),
      ).toBeInTheDocument();
    });

    it("says the workspace data could not be read and keeps the draft", async () => {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/assistant/chat/stream" && init?.method === "POST"
            ? Response.json(
                {
                  statusCode: 503,
                  code: "DATABASE_UNAVAILABLE",
                  message: "Database is unavailable. Please retry.",
                  requestId: "req-db-1",
                },
                { status: 503 },
              )
            : existingFetch(url, init),
        ),
      );
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Kỳ thi sắp tới?" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Chưa đọc được dữ liệu workspace/,
      );
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Kỳ thi sắp tới?",
      );
    });

    it.each([
      [
        "a gateway error with no body",
        async () => new Response("", { status: 502 }),
      ],
      [
        "no connection at all",
        async () => {
          throw new TypeError("Failed to fetch");
        },
      ],
    ])(
      "explains in Vietnamese when the server cannot be reached (%s), keeping the draft",
      async (_name, failChat) => {
        const existingFetch = globalThis.fetch;
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url: string, init?: RequestInit) =>
            url === "/api/assistant/chat/stream" && init?.method === "POST"
              ? failChat()
              : existingFetch(url, init),
          ),
        );
        render(<App />);
        fireEvent.click(
          screen.getByRole("button", { name: "Open ExaMate AI" }),
        );
        fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
        fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
          target: { value: "Task nào đã quá hạn?" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Chưa kết nối được máy chủ ExaMate/,
        );
        expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
          "Task nào đã quá hạn?",
        );
      },
    );

    it("resets conversation while keeping document selection across a trip through workspace mode", async () => {
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");

      answerFromWorkspace();
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Task nào chưa xong?" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));
      await screen.findByRole("list", { name: "Nguồn workspace" });

      fireEvent.click(screen.getByRole("radio", { name: "AI Chat" }));
      fireEvent.click(screen.getByRole("radio", { name: "Tài liệu" }));
      expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
        "doc-2",
      );
      expect(
        screen.queryByText("Chương 2 nói về độ phức tạp thuật toán."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Có 1 task chưa xong trong danh sách chung/),
      ).not.toBeInTheDocument();
      // Old citations must not remain in a fresh conversation scope.
      expect(
        screen.queryByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      ).not.toBeInTheDocument();
    });

    it("offers workspace questions to try, and fills the draft with one", async () => {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));

      fireEvent.click(
        screen.getByRole("button", { name: "Task nào đã quá hạn?" }),
      );
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Task nào đã quá hạn?",
      );
    });

    it("downloads in place instead of opening a tab the popup blocker can refuse", async () => {
      window.history.replaceState(null, "", "/#documents");
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      render(<App />);

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Download ghi-chu-chung.pdf",
        }),
      );

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      // The link is an attachment: the browser saves it without leaving the
      // page. A target="_blank" on top of that is opened after an await, which
      // a popup blocker may refuse once the click's permission has lapsed.
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(
        "https://storage.example.test/source.pdf?token=signed",
      );
      expect(link.target).not.toBe("_blank");
      click.mockRestore();
    });

    it("keeps the Documents download as an ordinary attachment link", async () => {
      window.history.replaceState(null, "", "/#documents");
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      render(<App />);

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Download ghi-chu-chung.pdf",
        }),
      );

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          "/api/documents/doc-2/download",
          expect.anything(),
        ),
      );
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("disposition")),
      ).toBe(false);
    });

    it("leaves the selected document out of an ordinary chat request", async () => {
      render(<App />);
      await openWithDocument();
      fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
      await ask("Xin chào");

      // The backend refuses a document in general mode (400), so it must not
      // travel with an ordinary question.
      const [general] = chatBodies();
      expect(general).toMatchObject({ mode: "general", operation: "question" });
      expect(general).not.toHaveProperty("documentId");

      // The choice is still there for when the student switches back.
      fireEvent.click(screen.getByRole("radio", { name: "Tài liệu" }));
      expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
        "doc-2",
      );
      await ask("Tài liệu này nói gì?");
      expect(chatBodies()[1]).toMatchObject({
        mode: "documents",
        documentId: "doc-2",
      });
    });

    it("formats a reply's Markdown but shows the student's question as typed", async () => {
      const existingFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url === "/api/assistant/chat/stream" && init?.method === "POST"
            ? assistantSseResponse({
                ...citedAnswer,
                answer: "**Ý chính**\n\n- Độ phức tạp\n- Cây nhị phân",
                citations: [],
              })
            : existingFetch(url, init),
        ),
      );
      render(<App />);
      await openWithDocument();
      await ask("Viết **đậm** giúp mình");

      const conversation = screen.getByRole("list", { name: "Cuộc hội thoại" });
      // The two messages themselves, not the bullets inside the reply.
      const [question, reply] = [...conversation.children] as HTMLElement[];
      expect(within(reply).getByText("Ý chính").tagName).toBe("STRONG");
      expect(
        within(reply)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Độ phức tạp", "Cây nhị phân"]);
      expect(reply).not.toHaveTextContent("**");
      // What the student typed is not reinterpreted.
      expect(question).toHaveTextContent("Viết **đậm** giúp mình");
      expect(question.querySelector("strong")).toBeNull();
    });

    it("expands and collapses from the header without losing the conversation", async () => {
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Câu hỏi tiếp theo đang soạn" },
      });
      const panel = document.getElementById("examate-ai-panel")!;

      fireEvent.click(
        within(panel).getByRole("button", { name: "Mở rộng ExaMate AI" }),
      );
      expect(panel).toHaveClass("is-expanded");
      // Still the one panel, and still non-modal on a wide screen.
      expect(screen.getAllByRole("textbox", { name: /câu hỏi/i })).toHaveLength(
        1,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        screen.getByText("Chương 2 nói về độ phức tạp thuật toán."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Câu hỏi tiếp theo đang soạn",
      );
      expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
        "doc-2",
      );
      expect(screen.getByRole("radio", { name: "Tài liệu" })).toBeChecked();

      fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
      fireEvent.click(
        within(panel).getByRole("button", { name: "Thu nhỏ ExaMate AI" }),
      );
      expect(panel).not.toHaveClass("is-expanded");
      expect(
        screen.getByRole("radio", { name: "Kiến thức chung" }),
      ).toBeChecked();
      fireEvent.click(screen.getByRole("radio", { name: "Tài liệu" }));
      expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
        "doc-2",
      );
      expect(
        screen.queryByText("Chương 2 nói về độ phức tạp thuật toán."),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Câu hỏi tiếp theo đang soạn",
      );
    });

    it("keeps the document scope and verified history when expanded", async () => {
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", { name: "Mở rộng ExaMate AI" }),
      );
      await ask("Chương 2 nói gì?");

      const [compact, expanded] = chatBodies();
      const { history: compactHistory, ...compactRequest } = compact;
      const { history: expandedHistory, ...expandedRequest } = expanded;
      expect(expandedRequest).toEqual(compactRequest);
      expect(compactHistory).toEqual([]);
      expect(expandedHistory).toHaveLength(1);
      expect(expandedHistory[0]).toMatchObject({
        receiptId: "77777777-7777-4777-8777-777777777777",
      });
      expect(expanded).toMatchObject({
        mode: "documents",
        documentId: "doc-2",
      });

      const sources = screen.getAllByRole("button", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      });
      fireEvent.click(sources[sources.length - 1]);
      expect(
        await screen.findByTitle("ghi-chu-chung.pdf, trang 3"),
      ).toHaveAttribute(
        "src",
        "https://storage.example.test/source.pdf?token=signed#page=3",
      );
    });

    it("shows the cited page beside the answer, keeping the whole conversation", async () => {
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Câu hỏi tiếp theo" },
      });
      const citation = screen.getByRole("button", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      });

      fireEvent.click(citation);

      // Compact grows to make room, and on a wide screen the source sits
      // beside the conversation rather than replacing it.
      const panel = document.getElementById("examate-ai-panel")!;
      expect(panel).toHaveClass("is-expanded", "is-split");
      const source = screen.getByRole("region", { name: "ghi-chu-chung.pdf" });
      expect(
        within(source).getByRole("heading", {
          level: 2,
          name: "ghi-chu-chung.pdf",
        }),
      ).toHaveFocus();
      expect(within(source).getByText(/Trang 3/)).toBeInTheDocument();
      expect(
        within(source).getByText(/Nguồn của câu trả lời 1/),
      ).toBeInTheDocument();
      expect(within(source).getByRole("status")).toHaveTextContent(
        "Đang mở tài liệu nguồn…",
      );
      expect(
        await within(source).findByTitle("ghi-chu-chung.pdf, trang 3"),
      ).toHaveAttribute(
        "src",
        "https://storage.example.test/source.pdf?token=signed#page=3",
      );
      // The preview asks for the inline link; nothing is built client-side.
      expect(
        vi
          .mocked(fetch)
          .mock.calls.map(([url]) => String(url))
          .filter((url) => url.includes("/download")),
      ).toEqual(["/api/documents/doc-2/download?disposition=inline"]);
      // The citation that is open says so.
      expect(citation).toHaveAttribute("aria-current", "true");

      expect(
        screen.getByText("Chương 2 nói về độ phức tạp thuật toán."),
      ).toBeVisible();
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Câu hỏi tiếp theo",
      );
      expect(screen.getByRole("radio", { name: "Tài liệu" })).toBeChecked();
      expect(screen.getByLabelText("Chọn tài liệu để tra cứu")).toHaveValue(
        "doc-2",
      );
    });

    it("opens a source without a page number at the start, guessing none", async () => {
      answerWithCitations([
        {
          sourceId: "src-2",
          documentId: "doc-1",
          chunkId: "chunk-9",
          title: "de-cuong-thuat-toan.pdf",
          page: null,
          chunkIndex: 4,
        },
      ]);
      render(<App />);
      await openWithDocument();
      await ask("Đề cương gồm gì?");

      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn de-cuong-thuat-toan.pdf, đoạn 5",
        }),
      );

      const frame = await screen.findByTitle("de-cuong-thuat-toan.pdf");
      expect(frame).toHaveAttribute(
        "src",
        "https://storage.example.test/source.pdf?token=signed",
      );
      expect(screen.getByText(/Không có số trang/)).toBeInTheDocument();
    });

    it("keeps the conversation through a failed source and asks for a new link on retry", async () => {
      answerWithCitation();
      const answering = globalThis.fetch;
      let links = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (!url.includes("/download")) return answering(url, init);
          links += 1;
          return links === 1
            ? Response.json({ message: "Storage is down" }, { status: 503 })
            : Response.json({
                url: `https://storage.example.test/source.pdf?token=t${links}`,
                expiresIn: 60,
              });
        }),
      );
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );

      const source = screen.getByRole("region", { name: "ghi-chu-chung.pdf" });
      expect(await within(source).findByRole("alert")).toHaveTextContent(
        "Chưa mở được tài liệu nguồn.",
      );
      expect(
        screen.getByText("Chương 2 nói về độ phức tạp thuật toán."),
      ).toBeVisible();

      fireEvent.click(within(source).getByRole("button", { name: "Thử lại" }));
      expect(
        await within(source).findByTitle("ghi-chu-chung.pdf, trang 3"),
      ).toHaveAttribute(
        "src",
        "https://storage.example.test/source.pdf?token=t2#page=3",
      );

      // A signed link lasts a minute; reloading asks for a fresh one rather
      // than reusing the one that may have expired.
      fireEvent.click(
        within(source).getByRole("button", { name: "Tải lại nguồn" }),
      );
      await waitFor(() =>
        expect(
          within(source).getByTitle("ghi-chu-chung.pdf, trang 3"),
        ).toHaveAttribute(
          "src",
          "https://storage.example.test/source.pdf?token=t3#page=3",
        ),
      );
    });

    it("does not let a slow earlier source overwrite the one just chosen", async () => {
      answerWithCitations([
        citedAnswer.citations[0],
        {
          sourceId: "src-2",
          documentId: "doc-1",
          chunkId: "chunk-9",
          title: "de-cuong-thuat-toan.pdf",
          page: null,
          chunkIndex: 4,
        },
      ]);
      const answering = globalThis.fetch;
      let releaseFirst: () => void = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.includes("/doc-2/download")) {
            await new Promise<void>((resolve) => (releaseFirst = resolve));
            return Response.json({
              url: "https://storage.example.test/slow.pdf?token=old",
              expiresIn: 60,
            });
          }
          if (url.includes("/doc-1/download"))
            return Response.json({
              url: "https://storage.example.test/fast.pdf?token=new",
              expiresIn: 60,
            });
          return answering(url, init);
        }),
      );
      render(<App />);
      await openWithDocument();
      await ask("So sánh hai tài liệu");

      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn de-cuong-thuat-toan.pdf, đoạn 5",
        }),
      );
      expect(
        await screen.findByTitle("de-cuong-thuat-toan.pdf"),
      ).toHaveAttribute(
        "src",
        "https://storage.example.test/fast.pdf?token=new",
      );

      await act(async () => releaseFirst());
      // The late answer for the first source is dropped.
      expect(screen.getByTitle("de-cuong-thuat-toan.pdf")).toHaveAttribute(
        "src",
        "https://storage.example.test/fast.pdf?token=new",
      );
      expect(screen.queryByTitle("ghi-chu-chung.pdf, trang 3")).toBeNull();
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "de-cuong-thuat-toan.pdf",
        }),
      ).toBeInTheDocument();
    });

    it("goes back to the conversation on a phone and returns focus to the citation", async () => {
      stubScreen((query) => query.includes("max-width"));
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Bản nháp còn đây" },
      });
      const citation = screen.getByRole("button", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      });
      citation.focus();
      fireEvent.click(citation);

      // No room for two columns: the source takes the sheet's place, and the
      // conversation waits hidden, not unmounted.
      const panel = document.getElementById("examate-ai-panel")!;
      expect(panel).toHaveClass("is-sheet", "is-source-screen");
      expect(panel).not.toHaveClass("is-split");
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).not.toBeVisible();
      const back = screen.getByRole("button", { name: "Quay lại hội thoại" });
      expect(back).toBeVisible();

      fireEvent.click(back);
      expect(
        screen.queryByRole("region", { name: "ghi-chu-chung.pdf" }),
      ).toBeNull();
      await waitFor(() => expect(citation).toHaveFocus());
      expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
        "Bản nháp còn đây",
      );

      // Escape closes the source first, and only then the assistant.
      fireEvent.click(citation);
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Quay lại hội thoại" }),
        {
          key: "Escape",
        },
      );
      await waitFor(() => expect(citation).toHaveFocus());
      expect(panel).toBeVisible();
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(panel).not.toBeVisible());
    });

    it("hides the source pane on a wide screen and hands focus back to the citation", async () => {
      answerWithCitation();
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      const citation = screen.getByRole("button", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      });
      fireEvent.click(citation);
      const source = screen.getByRole("region", { name: "ghi-chu-chung.pdf" });

      fireEvent.click(
        within(source).getByRole("button", { name: "Ẩn vùng nguồn" }),
      );

      expect(
        screen.queryByRole("region", { name: "ghi-chu-chung.pdf" }),
      ).toBeNull();
      await waitFor(() => expect(citation).toHaveFocus());
      expect(citation).not.toHaveAttribute("aria-current");
    });

    it("opens a citation preview in a user-initiated tab with a fresh signed URL", async () => {
      answerWithCitation();
      const tab = fakeTab();
      const open = vi.fn(() => tab);
      vi.stubGlobal("open", open);
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );
      const source = screen.getByRole("region", { name: "ghi-chu-chung.pdf" });
      await within(source).findByTitle("ghi-chu-chung.pdf, trang 3");
      fireEvent.click(
        within(source).getByRole("button", { name: /trong tab/ }),
      );
      expect(open).toHaveBeenCalledWith("", "_blank");
      await waitFor(() =>
        expect(tab.location.replace).toHaveBeenCalledWith(
          "https://storage.example.test/source.pdf?token=signed#page=3",
        ),
      );
      // Opening signs again through the API instead of reusing preview state.
      expect(
        vi
          .mocked(fetch)
          .mock.calls.map(([url]) => String(url))
          .filter((url) => url.includes("/download")),
      ).toEqual([
        "/api/documents/doc-2/download?disposition=inline",
        "/api/documents/doc-2/download?disposition=inline",
      ]);
    });

    it("gets a newly authorized signed URL when opening a preview after its TTL", async () => {
      answerWithCitation();
      const normalFetch = globalThis.fetch;
      let signCount = 0;
      const signedExpiries: number[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url === "/api/documents/doc-2/download?disposition=inline") {
            signCount += 1;
            signedExpiries.push(Date.now() + 60_000);
            return Response.json({
              url: `https://storage.example.test/source.pdf?token=signed-${signCount}`,
              expiresIn: 60,
            });
          }
          return normalFetch(url, init);
        }),
      );
      const tab = fakeTab();
      const open = vi.fn(() => tab);
      vi.stubGlobal("open", open);

      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", { name: /ghi-chu-chung\.pdf, tr\. 3/ }),
      );
      const source = screen.getByRole("region", { name: "ghi-chu-chung.pdf" });
      await within(source).findByTitle("ghi-chu-chung.pdf, trang 3");
      expect(signCount).toBe(1);

      // The preview URL has now outlived Storage's 60-second signature.
      vi.setSystemTime(new Date(Date.now() + 61_000));
      expect(signedExpiries[0]).toBeLessThanOrEqual(Date.now());
      fireEvent.click(
        within(source).getByRole("button", { name: /trong tab/ }),
      );

      // Open synchronously in the user gesture, then replace it only with the
      // URL freshly signed after the click and current authorization check.
      expect(open).toHaveBeenCalledWith("", "_blank");
      await waitFor(() =>
        expect(tab.location.replace).toHaveBeenCalledWith(
          "https://storage.example.test/source.pdf?token=signed-2#page=3",
        ),
      );
      expect(signCount).toBe(2);
      expect(
        vi
          .mocked(fetch)
          .mock.calls.map(([url]) => String(url))
          .filter((url) => url.includes("/download")),
      ).toEqual([
        "/api/documents/doc-2/download?disposition=inline",
        "/api/documents/doc-2/download?disposition=inline",
      ]);
    });

    it("closes the unsupported-browser source popup on new conversation and ignores its late signed URL", async () => {
      Object.defineProperty(navigator, "pdfViewerEnabled", {
        value: false,
        configurable: true,
      });
      answerWithCitation();
      const answering = globalThis.fetch;
      let releasePopup!: (response: Response) => void;
      const pendingPopup = new Promise<Response>((resolve) => {
        releasePopup = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.includes("/doc-2/download")) return pendingPopup;
          return answering(url, init);
        }),
      );
      const tab = fakeTab();
      const open = vi.fn(() => tab);
      vi.stubGlobal("open", open);
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );
      expect(open).toHaveBeenCalledWith("", "_blank");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.map(([url]) => String(url))
          .filter((url) => url.includes("/download")),
      ).toHaveLength(1);
      expect(tab.location.replace).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole("button", { name: "Cuộc trò chuyện mới" }),
      );

      // Closure must happen while the old URL request is still pending.
      expect.soft(tab.close).toHaveBeenCalled();
      expect(screen.queryByText(citedAnswer.answer)).not.toBeInTheDocument();
      await act(async () => {
        releasePopup(
          Response.json({
            url: "https://storage.example.test/old-source.pdf?token=late",
            expiresIn: 60,
          }),
        );
        await pendingPopup;
      });
      expect(tab.location.replace).not.toHaveBeenCalled();
      delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    });

    it("offers a safe direct link if an unsupported browser blocks the tab", async () => {
      Object.defineProperty(navigator, "pdfViewerEnabled", {
        value: false,
        configurable: true,
      });
      answerWithCitation();
      vi.stubGlobal(
        "open",
        vi.fn(() => null),
      );
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );

      const link = await screen.findByRole("link", {
        name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
      });
      expect(link).toHaveAttribute(
        "href",
        "https://storage.example.test/source.pdf?token=signed#page=3",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    });

    it("closes the empty tab when the source link cannot be fetched", async () => {
      Object.defineProperty(navigator, "pdfViewerEnabled", {
        value: false,
        configurable: true,
      });
      answerWithCitation();
      const answering = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) =>
          url.includes("/download")
            ? Response.json({ message: "Storage is down" }, { status: 503 })
            : answering(url, init),
        ),
      );
      const tab = fakeTab();
      vi.stubGlobal(
        "open",
        vi.fn(() => tab),
      );
      render(<App />);
      await openWithDocument();
      await ask("Chương 2 nói gì?");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
        }),
      );

      expect(
        await screen.findByText(
          /Chưa mở được tài liệu nguồn\. Thử lại giúp mình nhé\./,
        ),
      ).toBeInTheDocument();
      expect(tab.close).toHaveBeenCalled();
      expect(tab.location.replace).not.toHaveBeenCalled();
      delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    });

    it("still opens a tab straight away where the browser cannot show PDFs in a page", async () => {
      Object.defineProperty(navigator, "pdfViewerEnabled", {
        value: false,
        configurable: true,
      });
      try {
        answerWithCitation();
        const tab = fakeTab();
        const open = vi.fn(() => tab);
        vi.stubGlobal("open", open);
        render(<App />);
        await openWithDocument();
        await ask("Chương 2 nói gì?");

        fireEvent.click(
          screen.getByRole("button", {
            name: "Mở nguồn ghi-chu-chung.pdf, tr. 3",
          }),
        );

        // The citation keeps the behaviour it had: a preview that would only
        // show a blank frame is skipped.
        expect(open).toHaveBeenCalledWith("", "_blank");
        expect(
          screen.queryByRole("region", { name: "ghi-chu-chung.pdf" }),
        ).toBeNull();
        await waitFor(() =>
          expect(tab.location.replace).toHaveBeenCalledWith(
            "https://storage.example.test/source.pdf?token=signed#page=3",
          ),
        );
      } finally {
        delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
      }
    });

    it("keeps focus on the toggle and returns it to the launcher on Escape", async () => {
      render(<App />);
      const launcher = screen.getByRole("button", { name: "Open ExaMate AI" });
      fireEvent.click(launcher);
      await waitFor(() =>
        expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveFocus(),
      );

      const toggle = screen.getByRole("button", { name: "Mở rộng ExaMate AI" });
      toggle.focus();
      fireEvent.click(toggle);
      // Same control, new name: resizing does not throw focus somewhere else.
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAccessibleName("Thu nhỏ ExaMate AI");

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(document.getElementById("examate-ai-panel")).not.toBeVisible();

      // The size the student chose is still there when they come back.
      fireEvent.click(launcher);
      expect(
        screen.getByRole("button", { name: "Thu nhỏ ExaMate AI" }),
      ).toBeInTheDocument();
    });

    it("becomes modal when expanded on a tablet and releases the page when collapsed", () => {
      stubScreen(tabletOnly);
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      // Compact on a tablet is the ordinary floating window.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector(".desktop-shell")).not.toHaveAttribute(
        "inert",
      );

      const toggle = screen.getByRole("button", { name: "Mở rộng ExaMate AI" });
      toggle.focus();
      fireEvent.click(toggle);
      const dialog = screen.getByRole("dialog", { name: "ExaMate AI" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveClass("is-window", "is-expanded");
      expect(document.querySelector(".desktop-shell")).toHaveAttribute("inert");
      expect(document.querySelector(".floating-controls")).toHaveAttribute(
        "inert",
      );
      expect(document.body.style.overflow).toBe("hidden");
      const reachable = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, summary",
        ),
      ].filter(
        (element) => !dialog.contains(element) && !element.closest("[inert]"),
      );
      expect(reachable).toEqual([]);
      expect(toggle).toHaveFocus();

      fireEvent.click(toggle);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector(".desktop-shell")).not.toHaveAttribute(
        "inert",
      );
      expect(document.body.style.overflow).toBe("");
      expect(toggle).toHaveFocus();
    });

    it("pulls focus inside when the screen narrows under an open panel", async () => {
      // A matchMedia that can change its answer later, as a resize does.
      let narrow = false;
      const listeners = new Set<() => void>();
      vi.stubGlobal("matchMedia", (query: string) => ({
        get matches() {
          return narrow && query.includes("max-width");
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
      // Focus is back on the page while the non-modal window stays open.
      const pageButton = screen.getByRole("button", { name: "Ask ExaMate" });
      pageButton.focus();

      act(() => {
        narrow = true;
        listeners.forEach((listener) => listener());
      });

      const sheet = screen.getByRole("dialog", { name: "ExaMate AI" });
      // The page is inert now; leaving focus there would strand the keyboard.
      await waitFor(() =>
        expect(sheet).toContainElement(document.activeElement as HTMLElement),
      );
    });

    it("fills the phone screen as a sheet and still closes with Escape", async () => {
      stubScreen((query) => query.includes("max-width"));
      render(<App />);
      const launcher = screen.getByRole("button", { name: "Open ExaMate AI" });
      fireEvent.click(launcher);
      fireEvent.click(
        screen.getByRole("button", { name: "Mở rộng ExaMate AI" }),
      );

      const sheet = screen.getByRole("dialog", { name: "ExaMate AI" });
      expect(sheet).toHaveClass("is-sheet", "is-expanded");
      expect(
        within(sheet).getByRole("button", { name: /Gửi câu hỏi/ }),
      ).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(document.body.style.overflow).toBe("");
    });
  });
  it("persists quick notes in the current browser", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Quick note 1"), {
      target: { value: "Discuss citations" },
    });
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem("examate-notes:test-user:test-workspace")!,
        )[0].text,
      ).toBe("Discuss citations"),
    );
  });
  it("deletes a quick note and drops it from storage", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Quick note 1"), {
      target: { value: "Bỏ tờ này đi" },
    });
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem("examate-notes:test-user:test-workspace")!,
        )[0].text,
      ).toBe("Bỏ tờ này đi"),
    );
    const before = JSON.parse(
      localStorage.getItem("examate-notes:test-user:test-workspace")!,
    ).length;

    fireEvent.click(
      screen.getByRole("button", { name: /Delete note 1: Bỏ tờ này đi/ }),
    );

    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem("examate-notes:test-user:test-workspace")!,
      );
      expect(saved).toHaveLength(before - 1);
      expect(
        saved.some((note: { text: string }) => note.text === "Bỏ tờ này đi"),
      ).toBe(false);
    });
  });
  it("puts a deleted note back when the undo action is used", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Quick note 1"), {
      target: { value: "Đừng mất tôi" },
    });
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem("examate-notes:test-user:test-workspace")!,
        )[0].text,
      ).toBe("Đừng mất tôi"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Delete note 1: Đừng mất tôi/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Hoàn tác/ }));

    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem("examate-notes:test-user:test-workspace")!,
      );
      expect(saved[0].text).toBe("Đừng mất tôi");
    });
  });
  it("keeps notes saved by an earlier build that stored plain strings", async () => {
    localStorage.setItem(
      "examate-notes:test-user:test-workspace",
      JSON.stringify(["Ghi chú kiểu cũ", "Tờ thứ hai"]),
    );
    render(<App />);

    expect(
      await screen.findByDisplayValue("Ghi chú kiểu cũ"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tờ thứ hai")).toBeInTheDocument();
  });
});
