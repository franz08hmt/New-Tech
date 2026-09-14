import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

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
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/documents") {
        return new Response(JSON.stringify([]), { status: 200 });
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
  cleanup();
  vi.unstubAllGlobals();
});

describe("Academic workspace", () => {
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
    expect(screen.getByText("Dashboard context")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close ExaMate AI" }),
      ).toHaveFocus(),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("complementary", { name: "ExaMate AI" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("shows document-aware AI prompts without calling an Assistant API", () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open ExaMate AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "What evidence is required for the final project?",
      }),
    );

    expect(screen.getByText("Documents context")).toBeVisible();
    expect(screen.getByLabelText("Question for ExaMate")).toHaveValue(
      "What evidence is required for the final project?",
    );
    expect(screen.getByText("Interface preview")).toBeVisible();
    expect(screen.getByText("Week 3 course guide · p. 5")).toBeVisible();
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
  it("moves the course gallery between subjects and announces the change", () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    const gallery = screen.getByRole("region", { name: "Course gallery" });
    expect(
      screen.getByRole("heading", { level: 2, name: "Computer Science" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next course" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Mathematics" }),
    ).toBeInTheDocument();
    expect(gallery).toHaveTextContent("Course 2 of 6: Mathematics");

    // Wrapping backwards from the first subject lands on the last one.
    fireEvent.click(screen.getByRole("button", { name: "Previous course" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous course" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Literature" }),
    ).toBeInTheDocument();
    expect(gallery).toHaveTextContent("Course 6 of 6: Literature");
  });
  it("opens the matching course detail from a course overview card", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    const overview = screen
      .getByRole("heading", { level: 2, name: "Course overview" })
      .closest("section")!;
    fireEvent.click(
      within(overview).getByRole("link", { name: /Computer Science/ }),
    );

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Computer Science",
    });
    expect(window.location.hash).toBe("#courses/cs-201");
    await waitFor(() => expect(heading).toHaveFocus());
  });
  it("keeps carousel thumbnails for selection and offers a separate detail link", async () => {
    window.history.replaceState(null, "", "/#courses");
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Select Mathematics course" }),
    );
    expect(window.location.hash).toBe("#courses");

    fireEvent.click(
      screen.getByRole("link", { name: "Explore Mathematics course" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Mathematics" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#courses/ma-210");
  });
  it("renders meaningful course content from a direct deep link", () => {
    window.history.replaceState(null, "", "/#courses/hi-204");
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "History" }),
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
  it("shows a friendly fallback for an unknown course code", () => {
    window.history.replaceState(null, "", "/#courses/not-a-course");
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Course not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/could not find that example course/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to course gallery" }),
    ).toHaveAttribute("href", "#courses");
  });
  it("returns from a course detail to the gallery with a visible back link", async () => {
    window.history.replaceState(null, "", "/#courses/lt-101");
    render(<App />);

    fireEvent.click(
      screen.getByRole("link", { name: "Back to course gallery" }),
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/documents" && init?.method === "POST") {
          attempts++;
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tasks are unavailable",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("keeps the AI boundary disabled on the assistant page", () => {
    window.history.replaceState(null, "", "/#assistant");
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Ask after RAG setup" }),
    ).toBeDisabled();
  });
  it("persists quick notes in the current browser", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Quick note 1"), {
      target: { value: "Discuss citations" },
    });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("examate-notes")!)[0]).toBe(
        "Discuss citations",
      ),
    );
  });
});
