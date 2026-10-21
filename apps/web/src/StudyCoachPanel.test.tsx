import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  type DocumentSearchPage,
  type StudyQuizDetail,
  type StudyQuizGeneratedDraft,
  type StudyQuizListResponse,
  type StudyQuizSummary,
} from "./api";
import { StudyCoachPanel } from "./StudyCoachPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};
const documentId = "33333333-3333-4333-8333-333333333333";
const quizId = "44444444-4444-4444-8444-444444444444";
const questionIds = [
  "55555555-5555-4555-8555-555555555551",
  "55555555-5555-4555-8555-555555555552",
  "55555555-5555-4555-8555-555555555553",
];
const summary: StudyQuizSummary = {
  id: quizId,
  title: "Evidence quiz",
  language: "vi",
  documentId,
  documentTitle: "Indexed notes.pdf",
  sourceAvailable: true,
  questionCount: 3,
  createdAt: "2026-10-21T00:00:00.000Z",
  expiresAt: "2027-01-19T00:00:00.000Z",
  progress: { attempts: 0, latestScore: null, bestScore: null },
};
const page: StudyQuizListResponse = {
  items: [summary],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};
const questions = questionIds.map((id, index) => ({
  id,
  question: `Question ${index + 1}?`,
  options: ["A", "B", "C", "D"] as [string, string, string, string],
  sourceIds: ["S1"],
}));
const detail: StudyQuizDetail = {
  quiz: summary,
  schemaVersion: "study-quiz-v1",
  questions,
  sources: [
    {
      sourceId: "S1",
      documentId,
      title: "Indexed notes.pdf",
      page: 2,
      chunkIndex: 4,
      available: true,
    },
  ],
};
const generated: StudyQuizGeneratedDraft = {
  draftId: "66666666-6666-4666-8666-666666666666",
  draftToken: "A".repeat(43),
  expiresAt: "2026-10-21T00:15:00.000Z",
  documentId,
  documentTitle: "Indexed notes.pdf",
  quiz: {
    schemaVersion: "study-quiz-v1",
    title: "Evidence quiz",
    language: "vi",
    questions: questions.map((question, index) => ({
      ...question,
      correctIndex: 1,
      explanation: `Explanation ${index + 1}`,
    })),
    sources: detail.sources.map(
      ({ available: _available, ...source }) => source,
    ),
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <PilotPrincipalContext.Provider value={principal}>
      <StudyCoachPanel />
    </PilotPrincipalContext.Provider>,
  );
}

describe("Study Coach quiz flow", () => {
  it("previews before explicit save, then opens and grades a saved quiz without another AI call", async () => {
    const storedDocument = {
      id: documentId,
      name: "Indexed notes.pdf",
      size_bytes: 512,
      media_type: "application/pdf",
      storage_status: "stored" as const,
      processing_status: "ready" as const,
      index_quality: null,
      course_id: null,
      course_slug: null,
      course_name: null,
      course_code: null,
      created_at: "2026-10-20T00:00:00.000Z",
      updated_at: "2026-10-20T00:00:00.000Z",
    };
    const documentPage: DocumentSearchPage = {
      items: [storedDocument],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    let listCalls = 0;
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
    vi.spyOn(api, "listStudyQuizzes").mockImplementation(async () =>
      ++listCalls === 1
        ? { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }
        : page,
    );
    const generate = vi
      .spyOn(api, "generateStudyQuiz")
      .mockResolvedValue(generated);
    const confirm = vi
      .spyOn(api, "confirmStudyQuiz")
      .mockResolvedValue(summary);
    const getDetail = vi.spyOn(api, "getStudyQuiz").mockResolvedValue(detail);
    const submit = vi.spyOn(api, "submitStudyQuiz").mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      attemptKey: "88888888-8888-4888-8888-888888888888",
      correctCount: 2,
      questionCount: 3,
      scorePercent: 66.67,
      submittedAt: "2026-10-21T00:00:00.000Z",
      answers: questionIds.map((questionId, index) => ({
        questionId,
        selectedIndex: index ? 1 : 0,
        correctIndex: 1,
        correct: index > 0,
        explanation: `Explanation ${index + 1}`,
        sourceIds: ["S1"],
      })),
    });

    mount();
    await screen.findByRole("option", { name: "Indexed notes.pdf" });
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: documentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
    expect(
      await screen.findByText("Bản xem trước · chưa được lưu"),
    ).toBeTruthy();
    expect(generate).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận lưu quiz" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu quiz");
    await screen.findByRole("button", { name: "Mở và luyện tập" });
    fireEvent.click(screen.getByRole("button", { name: "Mở và luyện tập" }));
    expect(await screen.findByText(/Question 1\?/)).toBeTruthy();
    expect(getDetail).toHaveBeenCalledWith(quizId, expect.any(AbortSignal));

    const practice = screen.getByRole("region", { name: "Luyện tập" });
    const choices = within(practice).getAllByRole("radio");
    fireEvent.click(choices[0]);
    fireEvent.click(choices[5]);
    fireEvent.click(choices[9]);
    fireEvent.click(
      within(practice).getByRole("button", { name: "Kiểm tra đáp án" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nộp bài" }));
    expect(await screen.findByText("Kết quả: 2/3 · 66.67%")).toBeTruthy();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][1].answers).toHaveLength(3);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("does not submit or confirm a draft when source changes while generation is pending", async () => {
    const documents: DocumentSearchPage = {
      items: [
        {
          id: documentId,
          name: "First.pdf",
          size_bytes: 20,
          media_type: "application/pdf",
          storage_status: "stored",
          processing_status: "ready",
          index_quality: null,
          course_id: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          created_at: "2026-10-20",
          updated_at: "2026-10-20",
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Second.pdf",
          size_bytes: 20,
          media_type: "application/pdf",
          storage_status: "stored",
          processing_status: "ready",
          index_quality: null,
          course_id: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          created_at: "2026-10-20",
          updated_at: "2026-10-20",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    };
    let resolveGenerate!: (value: StudyQuizGeneratedDraft) => void;
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documents);
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const generate = vi.spyOn(api, "generateStudyQuiz").mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    const confirm = vi.spyOn(api, "confirmStudyQuiz");
    mount();
    await screen.findByRole("option", { name: "First.pdf" });
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: documentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: "99999999-9999-4999-8999-999999999999" },
    });
    resolveGenerate(generated);
    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect(screen.queryByText("Bản xem trước · chưa được lưu")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
});
