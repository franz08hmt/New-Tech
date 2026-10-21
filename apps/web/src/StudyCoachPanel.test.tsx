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
  ApiError,
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

type DraftReconciliation = Awaited<
  ReturnType<typeof api.reconcileStudyQuizDraft>
>;

async function prepareUnknownSave(
  responses: Array<DraftReconciliation | Error>,
) {
  const documentPage: DocumentSearchPage = {
    items: [
      {
        id: documentId,
        name: "Indexed notes.pdf",
        size_bytes: 512,
        media_type: "application/pdf",
        storage_status: "stored",
        processing_status: "ready",
        index_quality: null,
        course_id: null,
        course_slug: null,
        course_name: null,
        course_code: null,
        created_at: "2026-10-20T00:00:00.000Z",
        updated_at: "2026-10-20T00:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  };
  vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
  vi.spyOn(api, "listStudyQuizzes").mockResolvedValue(page);
  const generate = vi
    .spyOn(api, "generateStudyQuiz")
    .mockResolvedValue(generated);
  const confirm = vi
    .spyOn(api, "confirmStudyQuiz")
    .mockRejectedValue(
      new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
    );
  let responseIndex = 0;
  const reconcile = vi
    .spyOn(api, "reconcileStudyQuizDraft")
    .mockImplementation(async () => {
      const response =
        responses[Math.min(responseIndex++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    });
  const cancel = vi.spyOn(api, "cancelStudyQuizDraft");

  mount();
  await screen.findByRole("option", { name: "Indexed notes.pdf" });
  fireEvent.change(screen.getByLabelText("Tài liệu"), {
    target: { value: documentId },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
  await screen.findByText(/Bản xem trước/);
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận lưu quiz" }));
  await screen.findByText("Temporary failure");
  return { cancel, confirm, generate, reconcile };
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
    const updatedPage: StudyQuizListResponse = {
      ...page,
      items: [
        {
          ...summary,
          progress: { attempts: 1, latestScore: 66.67, bestScore: 66.67 },
        },
      ],
    };
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
    vi.spyOn(api, "listStudyQuizzes").mockImplementation(async () =>
      ++listCalls === 1
        ? { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }
        : listCalls >= 3
          ? updatedPage
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
      progress: { attempts: 1, latestScore: 66.67, bestScore: 66.67 },
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
    expect(await screen.findByText(/Đã lưu quiz/)).toBeTruthy();
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
    expect(
      within(practice).getByText(
        /3 câu · 1 lượt · gần nhất 66.67% · cao nhất 66.67%/,
      ),
    ).toBeTruthy();
    expect(submit).toHaveBeenCalledOnce();
    const savedQuizPanel = screen.getByRole("region", {
      name: /Quiz đã lưu/,
    });
    await waitFor(() => {
      expect(savedQuizPanel).toHaveTextContent(/1 lượt/);
      expect(savedQuizPanel).toHaveTextContent(/66\.67%/);
    });
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

  it("keeps an unknown attempt key and payload after the server committed but the response was lost", async () => {
    const documentPage: DocumentSearchPage = {
      items: [
        {
          id: documentId,
          name: "Indexed notes.pdf",
          size_bytes: 512,
          media_type: "application/pdf",
          storage_status: "stored",
          processing_status: "ready",
          index_quality: null,
          course_id: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          created_at: "2026-10-20T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue(page);
    vi.spyOn(api, "getStudyQuiz").mockResolvedValue(detail);
    const submitted: Array<{ key: string; payload: unknown }> = [];
    let persisted: Awaited<ReturnType<typeof api.submitStudyQuiz>> | undefined;
    const submit = vi
      .spyOn(api, "submitStudyQuiz")
      .mockImplementation(async (_id, payload) => {
        submitted.push({ key: payload.attemptKey, payload });
        if (!persisted) {
          persisted = {
            id: "77777777-7777-4777-8777-777777777777",
            attemptKey: payload.attemptKey,
            correctCount: 3,
            questionCount: 3,
            scorePercent: 100,
            submittedAt: "2026-10-21T00:00:00.000Z",
            progress: { attempts: 1, latestScore: 100, bestScore: 100 },
            answers: questionIds.map((questionId) => ({
              questionId,
              selectedIndex: 1,
              correctIndex: 1,
              correct: true,
              explanation: "Fixture explanation",
              sourceIds: ["S1"],
            })),
          };
          // Simulate COMMIT succeeding while the caller receives a transport failure.
          throw new ApiError("Temporary failure", "INTERNAL_ERROR", 503);
        }
        return persisted;
      });

    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mở và luyện tập" }),
    );
    await screen.findByText(/Question 1\?/);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]);
    fireEvent.click(radios[5]);
    fireEvent.click(radios[9]);
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra đáp án" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nộp bài" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary failure",
    );
    expect(
      screen.queryByRole("button", { name: "Quay lại câu hỏi" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Gửi lại cùng lượt" }));
    expect(await screen.findByText("Kết quả: 3/3 · 100%")).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submitted[1].key).toBe(submitted[0].key);
    expect(submitted[1].payload).toEqual(submitted[0].payload);
  });

  it("requires draft reconciliation before confirming or cancelling an unknown save", async () => {
    const documentPage: DocumentSearchPage = {
      items: [
        {
          id: documentId,
          name: "Indexed notes.pdf",
          size_bytes: 512,
          media_type: "application/pdf",
          storage_status: "stored",
          processing_status: "ready",
          index_quality: null,
          course_id: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          created_at: "2026-10-20T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue(page);
    vi.spyOn(api, "generateStudyQuiz").mockResolvedValue(generated);
    const confirm = vi
      .spyOn(api, "confirmStudyQuiz")
      .mockRejectedValueOnce(
        new ApiError("Temporary failure", "INTERNAL_ERROR", 503),
      )
      .mockResolvedValue(summary);
    const reconcile = vi
      .spyOn(api, "reconcileStudyQuizDraft")
      .mockResolvedValue({
        status: "draft",
        draft: generated,
      });
    const cancel = vi.spyOn(api, "cancelStudyQuizDraft");

    mount();
    await screen.findByRole("option", { name: "Indexed notes.pdf" });
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: documentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Xác nhận lưu quiz" }),
    );
    await screen.findByText("Temporary failure");

    expect(
      screen.getByRole("button", { name: "Xác nhận lưu quiz" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Hủy bản xem trước" }),
    ).toBeDisabled();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái lưu" }),
    );
    await screen.findByText(/Máy chủ xác nhận quiz vẫn là bản nháp/);
    expect(reconcile).toHaveBeenCalledWith(
      generated.draftId,
      generated.draftToken,
    );
    expect(
      screen.getByRole("button", { name: "Xác nhận lưu quiz" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận lưu quiz" }));
    await screen.findByText(/Đã lưu quiz/);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("accepts a reconciled confirmation without posting confirm again", async () => {
    const { cancel, confirm, generate, reconcile } = await prepareUnknownSave([
      { status: "confirmed", quiz: summary },
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái lưu" }),
    );
    expect(await screen.findByText(/Đã lưu quiz/)).toBeTruthy();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledOnce();
  });

  it.each(["cancelled", "expired", "deleted"] as const)(
    "does not write or regenerate after reconciliation reports %s",
    async (status) => {
      const { cancel, confirm, generate, reconcile } = await prepareUnknownSave(
        [{ status }],
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Kiểm tra trạng thái lưu" }),
      );
      await screen.findByRole("alert");
      expect(confirm).toHaveBeenCalledOnce();
      expect(cancel).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledOnce();
      expect(reconcile).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("button", { name: "Xác nhận lưu quiz" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Kiểm tra trạng thái lưu" }),
      ).toBeNull();
    },
  );

  it("keeps unknown save locked after a failed reconciliation GET and retries only the GET", async () => {
    const { cancel, confirm, generate, reconcile } = await prepareUnknownSave([
      new ApiError("Read failed", "INTERNAL_ERROR", 503),
      { status: "expired" },
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái lưu" }),
    );
    expect(await screen.findByText("Read failed")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Xác nhận lưu quiz" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Hủy bản xem trước" }),
    ).toBeDisabled();
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái lưu" }),
    );
    expect(await screen.findByText(/đã hết hạn/i)).toBeTruthy();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("debounces document search, starts each effective query at page one, and drops stale results", async () => {
    const makeDocument = (id: string, name: string) => ({
      id,
      name,
      size_bytes: 512,
      media_type: "application/pdf" as const,
      storage_status: "stored" as const,
      processing_status: "ready" as const,
      index_quality: null,
      course_id: null,
      course_slug: null,
      course_name: null,
      course_code: null,
      created_at: "2026-10-20T00:00:00.000Z",
      updated_at: "2026-10-20T00:00:00.000Z",
    });
    const defaultPage: DocumentSearchPage = {
      items: [makeDocument(documentId, "Default.pdf")],
      page: 1,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    };
    const alphaPage: DocumentSearchPage = {
      items: [
        makeDocument("99999999-9999-4999-8999-999999999999", "Alpha.pdf"),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    const betaPage: DocumentSearchPage = {
      items: [makeDocument("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Beta.pdf")],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    let resolveAlpha!: (value: DocumentSearchPage) => void;
    let failSearchOnce = true;
    const search = vi
      .spyOn(api, "searchDocuments")
      .mockImplementation((query) => {
        if (query?.q === "alpha")
          return new Promise((resolve) => {
            resolveAlpha = resolve;
          });
        if (query?.q === "beta") return Promise.resolve(betaPage);
        if (query?.q === "alpha edited") return Promise.resolve(alphaPage);
        if (query?.q === "failure" && failSearchOnce) {
          failSearchOnce = false;
          return Promise.reject(new Error("Search read failed"));
        }
        if (query?.q === "failure") return Promise.resolve(alphaPage);
        return Promise.resolve(defaultPage);
      });
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const generate = vi.spyOn(api, "generateStudyQuiz");
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    mount();
    await screen.findByRole("option", { name: "Default.pdf" });
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: documentId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, q: undefined }),
        expect.any(AbortSignal),
      ),
    );

    const input = screen.getByRole("searchbox", {
      name: "Tìm tài liệu đã sẵn sàng",
    });
    fireEvent.change(input, { target: { value: "alpha" } });
    await sleep(320);
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, q: "alpha" }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(input, { target: { value: "beta" } });
    await sleep(320);
    await screen.findByRole("option", { name: "Beta.pdf" });
    resolveAlpha(alphaPage);
    await sleep(0);
    expect(screen.getByRole("option", { name: "Beta.pdf" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Alpha.pdf" })).toBeNull();
    expect(screen.getByText(/Nguồn: Default\.pdf/)).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    await sleep(320);
    await screen.findByRole("option", { name: "Default.pdf" });
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, q: undefined }),
      expect.any(AbortSignal),
    );
    fireEvent.change(input, { target: { value: "failure" } });
    await sleep(320);
    expect(await screen.findByText("Search read failed")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Thử tải danh sách lại" }),
    );
    await screen.findByRole("option", { name: "Alpha.pdf" });
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, q: "failure" }),
      expect.any(AbortSignal),
    );
    fireEvent.change(input, { target: { value: "x" } });
    expect(await screen.findByText(/Nhập ít nhất hai ký tự/)).toBeTruthy();
    await sleep(320);
    expect(search.mock.calls.some(([query]) => query?.q === "x")).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("drops pending document search results and selection when principal changes or the view unmounts", async () => {
    const otherPrincipal = {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      role: "member" as const,
    };
    const makePage = (name: string): DocumentSearchPage => ({
      items: [
        {
          id: documentId,
          name,
          size_bytes: 512,
          media_type: "application/pdf",
          storage_status: "stored",
          processing_status: "ready",
          index_quality: null,
          course_id: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          created_at: "2026-10-20T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const originalPage = makePage("Original principal.pdf");
    const switchedPage = makePage("New principal.pdf");
    let resolveOldSearch!: (value: DocumentSearchPage) => void;
    let defaultCalls = 0;
    const search = vi
      .spyOn(api, "searchDocuments")
      .mockImplementation((query) => {
        if (query?.q === "pending")
          return new Promise((resolve) => {
            resolveOldSearch = resolve;
          });
        if (!query?.q) {
          defaultCalls++;
          return Promise.resolve(
            defaultCalls === 1 ? originalPage : switchedPage,
          );
        }
        return Promise.resolve(makePage("Unexpected query.pdf"));
      });
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const tree = (current: typeof principal) => (
      <PilotPrincipalContext.Provider value={current}>
        <StudyCoachPanel />
      </PilotPrincipalContext.Provider>
    );
    const view = render(tree(principal));
    await screen.findByRole("option", { name: "Original principal.pdf" });
    const input = screen.getByRole("searchbox", {
      name: "Tìm tài liệu đã sẵn sàng",
    });
    fireEvent.change(input, { target: { value: "pending" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "pending", page: 1 }),
        expect.any(AbortSignal),
      ),
    );

    view.rerender(tree(otherPrincipal));
    expect(
      screen.queryByRole("option", { name: "Original principal.pdf" }),
    ).toBeNull();
    resolveOldSearch(makePage("Stale principal.pdf"));
    await screen.findByRole("option", { name: "New principal.pdf" });
    expect(
      screen.queryByRole("option", { name: "Stale principal.pdf" }),
    ).toBeNull();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: undefined, page: 1 }),
      expect.any(AbortSignal),
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Tìm tài liệu đã sẵn sàng" }),
      { target: { value: "pending" } },
    );
    await new Promise((resolve) => setTimeout(resolve, 320));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(4));
    view.unmount();
    resolveOldSearch(makePage("Unmounted stale result.pdf"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      screen.queryByRole("option", { name: "Unmounted stale result.pdf" }),
    ).toBeNull();
  });
});
