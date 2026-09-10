import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
    vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? { ...task, id: "task-2", title: "Build course page" }
              : [task],
          ),
          {
            status: 200,
          },
        ),
    ),
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
          evidenceType: "milestone",
        }),
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
  it("selects valid PDFs locally without calling a document API", async () => {
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
    expect(fetch).not.toHaveBeenCalledWith("/api/documents", expect.anything());
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
  it("previews the document lifecycle without calling the backend", async () => {
    window.history.replaceState(null, "", "/#documents");
    render(<App />);

    const pdf = new File(["lifecycle demo"], "lifecycle.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose PDF files"), {
      target: { files: [pdf] },
    });

    const statePreview = await screen.findByLabelText(
      "Preview state for lifecycle.pdf",
    );
    fireEvent.change(statePreview, { target: { value: "uploading" } });
    expect(
      screen.getByRole("progressbar", {
        name: "Upload progress for lifecycle.pdf",
      }),
    ).toHaveAttribute("value", "64");

    fireEvent.change(statePreview, { target: { value: "processing" } });
    expect(screen.getByText("Processing document · Mock state")).toBeVisible();

    fireEvent.change(statePreview, { target: { value: "ready" } });
    expect(screen.getByText("Ready · Available to Assistant")).toBeVisible();

    fireEvent.change(statePreview, { target: { value: "failed" } });
    expect(screen.getByText("Failed · Example extraction error")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry lifecycle.pdf" }),
    );
    expect(statePreview).toHaveValue("selected");
    expect(screen.getByText("Selected locally · Not uploaded")).toBeVisible();

    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).startsWith("/api/documents")),
    ).toBe(false);
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
      expect(JSON.parse(localStorage.getItem("coursemate-notes")!)[0]).toBe(
        "Discuss citations",
      ),
    );
  });
});
