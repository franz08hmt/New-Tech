// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  type DocumentSearchPage,
  type StudyFlashcardsDetail,
  type StudyFlashcardsGeneratedDraft,
  type StudyFlashcardsListResponse,
  type StudyFlashcardsSummary,
} from "./api";
import { StudyFlashcardsPanel } from "./StudyFlashcardsPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};
const docId = "33333333-3333-4333-8333-333333333333";
const deckId = "44444444-4444-4444-8444-444444444444";
const cardIds = [
  "55555555-5555-4555-8555-555555555551",
  "55555555-5555-4555-8555-555555555552",
  "55555555-5555-4555-8555-555555555553",
];
const documentPage: DocumentSearchPage = {
  items: [
    {
      id: docId,
      name: "Indexed notes.pdf",
      media_type: "application/pdf",
      size_bytes: 100,
      storage_status: "stored",
      processing_status: "ready",
      index_quality: null,
      course_id: null,
      course_slug: null,
      course_name: null,
      course_code: null,
      created_at: "2026-10-21T00:00:00.000Z",
      updated_at: "2026-10-21T00:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};
const summary: StudyFlashcardsSummary = {
  id: deckId,
  title: "Evidence cards",
  language: "vi",
  documentId: docId,
  documentTitle: "Indexed notes.pdf",
  sourceAvailable: true,
  cardCount: 3,
  createdAt: "2026-10-21T00:00:00.000Z",
  expiresAt: "2027-01-19T00:00:00.000Z",
  progress: {
    reviews: 0,
    latestAt: null,
    latestRemembered: null,
    latestNeedsReview: null,
  },
};
const list: StudyFlashcardsListResponse = {
  items: [summary],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};
const generated: StudyFlashcardsGeneratedDraft = {
  draftId: "66666666-6666-4666-8666-666666666666",
  draftToken: "A".repeat(43),
  expiresAt: "2026-10-21T00:15:00.000Z",
  documentId: docId,
  documentTitle: "Indexed notes.pdf",
  flashcards: {
    schemaVersion: "study-flashcards-v1",
    title: "Evidence cards",
    language: "vi",
    cards: cardIds.map((id, index) => ({
      id,
      front: `Front ${index + 1}`,
      back: `Back ${index + 1}`,
      sourceIds: ["S1"],
    })),
    sources: [
      {
        sourceId: "S1",
        documentId: docId,
        title: "Indexed notes.pdf",
        page: 2,
        chunkIndex: 1,
      },
    ],
  },
};
const detail: StudyFlashcardsDetail = {
  deck: summary,
  schemaVersion: "study-flashcards-v1",
  cards: generated.flashcards.cards,
  sources: generated.flashcards.sources.map((source) => ({
    ...source,
    available: true,
  })),
};

function renderPanel(who = principal) {
  return render(
    <PilotPrincipalContext.Provider value={who}>
      <StudyFlashcardsPanel />
    </PilotPrincipalContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Study Flashcards flow", () => {
  it("previews generated content and saves only after explicit confirmation", async () => {
    const search = vi
      .spyOn(api, "searchDocuments")
      .mockResolvedValue(documentPage);
    const listCall = vi.spyOn(api, "listStudyFlashcards").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const generate = vi
      .spyOn(api, "generateStudyFlashcards")
      .mockResolvedValue(generated);
    const confirm = vi
      .spyOn(api, "confirmStudyFlashcards")
      .mockResolvedValue(summary);
    renderPanel();
    await screen.findByText("Indexed notes.pdf");
    expect(search).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: docId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
    expect(
      await screen.findByText("Bản xem trước · chưa được lưu"),
    ).toBeTruthy();
    expect(generate).toHaveBeenCalledWith({
      documentId: docId,
      language: "vi",
      cardCount: 5,
    });
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận lưu bộ thẻ" }),
    );
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(generated.draftId, {
        draftToken: generated.draftToken,
      }),
    );
    expect(listCall).toHaveBeenCalled();
  });

  it("debounces the selected document query, resets to page one, and never generates from search", async () => {
    const search = vi
      .spyOn(api, "searchDocuments")
      .mockResolvedValue(documentPage);
    const generate = vi
      .spyOn(api, "generateStudyFlashcards")
      .mockResolvedValue(generated);
    vi.spyOn(api, "listStudyFlashcards").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    renderPanel();
    await screen.findByLabelText("Tài liệu");
    fireEvent.change(screen.getByLabelText("Tìm tài liệu đã sẵn sàng"), {
      target: { value: "Biology" },
    });
    await waitFor(
      () =>
        expect(search).toHaveBeenCalledWith(
          expect.objectContaining({ q: "Biology", page: 1 }),
          expect.any(AbortSignal),
        ),
      { timeout: 1500 },
    );
    expect(generate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tìm tài liệu đã sẵn sàng"), {
      target: { value: "B" },
    });
    expect(
      await screen.findByText("Nhập thêm ít nhất một ký tự để tìm."),
    ).toBeTruthy();
    const callsBeforeClear = search.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Tìm tài liệu đã sẵn sàng"), {
      target: { value: "" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenCalledTimes(callsBeforeClear + 1),
    );
    expect(search.mock.calls.at(-1)?.[0]).not.toHaveProperty("q");
    expect(search.mock.calls.at(-1)?.[0]).toMatchObject({
      page: 1,
      storage_status: "stored",
      processing_status: "ready",
    });
  });

  it("keeps confirm locked after an unknown outcome until GET reconciliation confirms the draft state", async () => {
    vi.spyOn(api, "searchDocuments").mockResolvedValue(documentPage);
    vi.spyOn(api, "listStudyFlashcards").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const generate = vi
      .spyOn(api, "generateStudyFlashcards")
      .mockResolvedValue(generated);
    const confirm = vi
      .spyOn(api, "confirmStudyFlashcards")
      .mockRejectedValue(new Error("lost response"));
    const reconcile = vi
      .spyOn(api, "reconcileStudyFlashcardsDraft")
      .mockResolvedValue({
        status: "draft",
        draft: {
          draftId: generated.draftId,
          expiresAt: generated.expiresAt,
          documentId: docId,
          documentTitle: generated.documentTitle,
          flashcards: generated.flashcards,
        },
      });
    renderPanel();
    await screen.findByLabelText("Tài liệu");
    fireEvent.change(screen.getByLabelText("Tài liệu"), {
      target: { value: docId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước" }));
    await screen.findByText("Bản xem trước · chưa được lưu");
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận lưu bộ thẻ" }),
    );
    expect(await screen.findByText(/Kết quả lưu chưa rõ/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Xác nhận lưu bộ thẻ" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Hủy bản xem trước" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Đối chiếu trạng thái lưu" }),
    );
    await waitFor(() =>
      expect(reconcile).toHaveBeenCalledWith(
        generated.draftId,
        generated.draftToken,
      ),
    );
    expect(await screen.findByText(/Bạn có thể xác nhận riêng/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Xác nhận lưu bộ thẻ" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("opens a saved deck, flips cards, requires every self-rating and derives progress from the server", async () => {
    const listCall = vi
      .spyOn(api, "listStudyFlashcards")
      .mockResolvedValue(list);
    vi.spyOn(api, "getStudyFlashcards").mockResolvedValue(detail);
    const submit = vi
      .spyOn(api, "submitStudyFlashcardsReview")
      .mockResolvedValue({
        id: "77777777-7777-4777-8777-777777777777",
        reviewKey: "88888888-8888-4888-8888-888888888888",
        completedAt: "2026-10-21T01:00:00.000Z",
        rememberedCount: 2,
        needsReviewCount: 1,
        progress: {
          reviews: 1,
          latestAt: "2026-10-21T01:00:00.000Z",
          latestRemembered: 2,
          latestNeedsReview: 1,
        },
      });
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mở bộ thẻ Evidence cards" }),
    );
    expect(await screen.findByText("Front 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(await screen.findByText("Back 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đã nhớ" }));
    fireEvent.click(screen.getByRole("button", { name: "Thẻ tiếp theo" }));
    for (let index = 1; index < 3; index++) {
      fireEvent.click(screen.getByRole("button", { name: "Lật thẻ" }));
      fireEvent.click(
        screen.getByRole("button", {
          name: index === 1 ? "Cần ôn lại" : "Đã nhớ",
        }),
      );
      if (index < 2)
        fireEvent.click(screen.getByRole("button", { name: "Thẻ tiếp theo" }));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Lưu lượt tự đánh giá" }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        deckId,
        expect.objectContaining({
          ratings: expect.arrayContaining([
            { cardId: cardIds[0], rating: "remembered" },
            { cardId: cardIds[1], rating: "needs_review" },
            { cardId: cardIds[2], rating: "remembered" },
          ]),
        }),
      ),
    );
    expect(await screen.findByText(/1 lượt ôn/)).toBeTruthy();
    expect(listCall).toHaveBeenCalled();
  });

  it("preserves an unknown review key and payload and retries the same write", async () => {
    vi.spyOn(api, "listStudyFlashcards").mockResolvedValue(list);
    vi.spyOn(api, "getStudyFlashcards").mockResolvedValue(detail);
    const submit = vi
      .spyOn(api, "submitStudyFlashcardsReview")
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({
        id: "77777777-7777-4777-8777-777777777777",
        reviewKey: "88888888-8888-4888-8888-888888888888",
        completedAt: "2026-10-21T01:00:00.000Z",
        rememberedCount: 3,
        needsReviewCount: 0,
        progress: {
          reviews: 1,
          latestAt: "2026-10-21T01:00:00.000Z",
          latestRemembered: 3,
          latestNeedsReview: 0,
        },
      });
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mở bộ thẻ Evidence cards" }),
    );
    expect(await screen.findByText("Front 1")).toBeTruthy();
    for (let index = 0; index < 3; index++) {
      if (index > 0)
        fireEvent.click(screen.getByRole("button", { name: "Thẻ tiếp theo" }));
      fireEvent.click(screen.getByRole("button", { name: "Lật thẻ" }));
      fireEvent.click(screen.getByRole("button", { name: "Đã nhớ" }));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Lưu lượt tự đánh giá" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại cùng lượt" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
  });

  it("does not restore a delayed list from a previous principal", async () => {
    let resolveOld!: (value: StudyFlashcardsListResponse) => void;
    const listCall = vi
      .spyOn(api, "listStudyFlashcards")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
    const view = renderPanel();
    view.rerender(
      <PilotPrincipalContext.Provider
        value={{ ...principal, userId: "99999999-9999-4999-8999-999999999999" }}
      >
        <StudyFlashcardsPanel />
      </PilotPrincipalContext.Provider>,
    );
    await act(async () => resolveOld(list));
    await waitFor(() =>
      expect(screen.queryByText("Evidence cards")).toBeNull(),
    );
    expect(listCall).toHaveBeenCalledTimes(2);
  });

  it("drops a delayed document search result when the principal changes", async () => {
    let resolvePrevious!: (value: DocumentSearchPage) => void;
    const oldPage: DocumentSearchPage = {
      ...documentPage,
      items: [
        {
          ...documentPage.items[0],
          name: "Previous principal private source.pdf",
        },
      ],
    };
    const nextPage: DocumentSearchPage = {
      ...documentPage,
      items: [
        {
          ...documentPage.items[0],
          id: "99999999-9999-4999-8999-999999999999",
          name: "Current principal source.pdf",
        },
      ],
    };
    const search = vi
      .spyOn(api, "searchDocuments")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePrevious = resolve;
          }),
      )
      .mockResolvedValue(nextPage);
    vi.spyOn(api, "listStudyFlashcards").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const view = renderPanel();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    view.rerender(
      <PilotPrincipalContext.Provider
        value={{ ...principal, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }}
      >
        <StudyFlashcardsPanel />
      </PilotPrincipalContext.Provider>,
    );
    await screen.findByText("Current principal source.pdf");
    await act(async () => resolvePrevious(oldPage));
    await waitFor(() =>
      expect(
        screen.queryByText("Previous principal private source.pdf"),
      ).toBeNull(),
    );
    expect(search).toHaveBeenCalledTimes(2);
  });
});
