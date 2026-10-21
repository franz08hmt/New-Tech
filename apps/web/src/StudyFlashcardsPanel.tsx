import { useContext, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type DocumentSearchPage,
  type StoredDocument,
  type StudyFlashcardsDetail,
  type StudyFlashcardsGeneratedDraft,
  type StudyFlashcardsListResponse,
  type StudyFlashcardsReviewRequest,
  type StudyFlashcardsReviewResult,
  type StudyFlashcardsSummary,
} from "./api";
import type { PilotPrincipal } from "@examate/contracts";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const PAGE_SIZE = 20;
type ActionKind =
  "generate" | "confirm" | "reconcile" | "cancel" | "review" | "delete";
type ActionToken = { kind: ActionKind; id: symbol };
type ReviewPending = {
  deckId: string;
  principal: string;
  key: string;
  payload: StudyFlashcardsReviewRequest;
};
const identityOf = (principal: PilotPrincipal | undefined) =>
  `${principal?.userId ?? ""}:${principal?.workspaceId ?? ""}:${principal?.role ?? ""}`;
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Không thể hoàn tất thao tác. Hãy thử lại.";
const isUnknownWrite = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 408 || error.status >= 500;

export function StudyFlashcardsPanel({ focusId }: { focusId?: string }) {
  const principal = useContext(PilotPrincipalContext);
  const identity = identityOf(principal);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const epoch = useRef(0);
  const documentController = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const documentRevision = useRef(0);
  const listRevision = useRef(0);
  const detailRevision = useRef(0);
  const actionRef = useRef<ActionToken | undefined>(undefined);
  const reviewPendingRef = useRef<ReviewPending | undefined>(undefined);

  const [query, setQuery] = useState("");
  const [effectiveQuery, setEffectiveQuery] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [documentRefresh, setDocumentRefresh] = useState(0);
  const [documentResults, setDocumentResults] = useState<DocumentSearchPage>();
  const [documentResultsIdentity, setDocumentResultsIdentity] = useState("");
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentErrorState, setDocumentError] = useState("");
  const [documentErrorIdentity, setDocumentErrorIdentity] = useState("");
  const [selectedDocumentState, setSelectedDocument] =
    useState<StoredDocument>();
  const [selectedDocumentIdentity, setSelectedDocumentIdentity] = useState("");
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [cardCount, setCardCount] = useState(5);
  const [draftState, setDraft] = useState<StudyFlashcardsGeneratedDraft>();
  const [draftIdentity, setDraftIdentity] = useState("");
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | "preview" | "unknown" | "error"
  >("idle");
  const [generationError, setGenerationError] = useState("");
  const [saveState, setSaveState] = useState<
    | "idle"
    | "preview"
    | "saving"
    | "unknown"
    | "reconciling"
    | "confirmed"
    | "terminal"
    | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [listPage, setListPage] = useState(1);
  const [listRefresh, setListRefresh] = useState(0);
  const [listDataState, setListData] = useState<StudyFlashcardsListResponse>();
  const [listDataIdentity, setListDataIdentity] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listErrorState, setListError] = useState("");
  const [listErrorIdentity, setListErrorIdentity] = useState("");
  const [detailState, setDetail] = useState<StudyFlashcardsDetail>();
  const [detailIdentity, setDetailIdentity] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErrorState, setDetailError] = useState("");
  const [detailErrorIdentity, setDetailErrorIdentity] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<
    Record<string, "remembered" | "needs_review">
  >({});
  const [reviewState, setReviewState] = useState<
    "idle" | "sending" | "unknown" | "failed" | "confirmed"
  >("idle");
  const [reviewError, setReviewError] = useState("");
  const [action, setAction] = useState<ActionToken>();
  const [deleteTarget, setDeleteTarget] = useState("");

  const busy = action !== undefined;
  const unresolvedReview =
    reviewState === "sending" || reviewState === "unknown";
  const unresolvedSave = saveState === "unknown" || saveState === "reconciling";
  const visibleDocs =
    documentResultsIdentity === identity ? documentResults : undefined;
  const visibleListData =
    listDataIdentity === identity ? listDataState : undefined;
  const visibleDetail = detailIdentity === identity ? detailState : undefined;
  const visibleSelectedDocument =
    selectedDocumentIdentity === identity ? selectedDocumentState : undefined;
  const liveDraft = draftIdentity === identity ? draftState : undefined;
  const visibleDocumentError =
    documentErrorIdentity === identity ? documentErrorState : "";
  const visibleListError = listErrorIdentity === identity ? listErrorState : "";
  const visibleDetailError =
    detailErrorIdentity === identity ? detailErrorState : "";
  const currentQuery = query.trim();
  const documentQueryPending =
    currentQuery.length >= 2 && effectiveQuery !== currentQuery;

  function acquire(kind: ActionKind): ActionToken | undefined {
    if (actionRef.current) return undefined;
    const token = { kind, id: Symbol(kind) };
    actionRef.current = token;
    setAction(token);
    return token;
  }
  function release(token: ActionToken) {
    if (actionRef.current !== token) return;
    actionRef.current = undefined;
    setAction(undefined);
  }
  function currentFor(capturedIdentity: string, capturedEpoch: number) {
    return (
      identityRef.current === capturedIdentity &&
      epoch.current === capturedEpoch
    );
  }

  useEffect(() => {
    const ownEpoch = ++epoch.current;
    actionRef.current = undefined;
    setAction(undefined);
    documentController.current?.abort();
    listController.current?.abort();
    detailController.current?.abort();
    documentRevision.current++;
    listRevision.current++;
    detailRevision.current++;
    setDocumentResults(undefined);
    setDocumentResultsIdentity("");
    setDocumentErrorIdentity("");
    setSelectedDocument(undefined);
    setSelectedDocumentIdentity("");
    setDraft(undefined);
    setDraftIdentity("");
    setGenerationState("idle");
    setGenerationError("");
    setSaveState("idle");
    setSaveError("");
    setNotice("");
    setListData(undefined);
    setListDataIdentity("");
    setListError("");
    setListErrorIdentity("");
    setDetail(undefined);
    setDetailIdentity("");
    setDetailId("");
    setDetailError("");
    setDetailErrorIdentity("");
    setRatings({});
    setReviewState("idle");
    setReviewError("");
    setDeleteTarget("");
    reviewPendingRef.current = undefined;
    setQuery("");
    setEffectiveQuery("");
    setDocumentPage(1);
    setListPage(1);
    if (!principal) {
      setDocumentLoading(false);
      setListLoading(false);
      return () => {
        if (epoch.current === ownEpoch) epoch.current++;
      };
    }
    setListLoading(true);
    return () => {
      if (epoch.current === ownEpoch) epoch.current++;
      actionRef.current = undefined;
      documentController.current?.abort();
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [identity]);

  useEffect(() => {
    if (!principal || focusId) return;
    const timer = window.setTimeout(() => setEffectiveQuery(query.trim()), 275);
    return () => window.clearTimeout(timer);
  }, [query, identity, focusId, principal]);

  useEffect(() => {
    if (!principal || focusId) return;
    if (query.trim().length === 1 || effectiveQuery !== query.trim()) {
      setDocumentResults(undefined);
      setDocumentLoading(false);
      setDocumentError("");
      setDocumentErrorIdentity("");
      return;
    }
    const controller = new AbortController();
    const revision = ++documentRevision.current;
    const capturedIdentity = identity;
    const capturedEpoch = epoch.current;
    documentController.current?.abort();
    documentController.current = controller;
    setDocumentLoading(true);
    setDocumentError("");
    setDocumentErrorIdentity(capturedIdentity);
    setDocumentResults(undefined);
    setDocumentResultsIdentity(capturedIdentity);
    void api
      .searchDocuments(
        {
          ...(effectiveQuery ? { q: effectiveQuery } : {}),
          storage_status: "stored",
          processing_status: "ready",
          sort: "name",
          direction: "asc",
          page: documentPage,
          pageSize: PAGE_SIZE,
        },
        controller.signal,
      )
      .then((result) => {
        if (
          controller.signal.aborted ||
          !currentFor(capturedIdentity, capturedEpoch) ||
          revision !== documentRevision.current
        )
          return;
        setDocumentResults(result);
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          currentFor(capturedIdentity, capturedEpoch) &&
          revision === documentRevision.current
        ) {
          setDocumentError(errorText(error));
          setDocumentErrorIdentity(capturedIdentity);
        }
      })
      .finally(() => {
        if (
          currentFor(capturedIdentity, capturedEpoch) &&
          revision === documentRevision.current
        )
          setDocumentLoading(false);
      });
    return () => controller.abort();
  }, [
    effectiveQuery,
    query,
    documentPage,
    documentRefresh,
    identity,
    principal,
    focusId,
  ]);

  useEffect(() => {
    if (!principal) return;
    const controller = new AbortController();
    const revision = ++listRevision.current;
    const capturedIdentity = identity;
    const capturedEpoch = epoch.current;
    listController.current?.abort();
    listController.current = controller;
    setListLoading(true);
    setListError("");
    setListErrorIdentity(capturedIdentity);
    setListData(undefined);
    setListDataIdentity(capturedIdentity);
    void api
      .listStudyFlashcards(listPage, PAGE_SIZE, controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          !currentFor(capturedIdentity, capturedEpoch) ||
          revision !== listRevision.current
        )
          return;
        setListData(result);
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          currentFor(capturedIdentity, capturedEpoch) &&
          revision === listRevision.current
        ) {
          setListError(errorText(error));
          setListErrorIdentity(capturedIdentity);
        }
      })
      .finally(() => {
        if (
          currentFor(capturedIdentity, capturedEpoch) &&
          revision === listRevision.current
        )
          setListLoading(false);
      });
    return () => controller.abort();
  }, [identity, listPage, listRefresh, principal]);

  useEffect(() => {
    if (!focusId || !principal) return;
    void openDeck(focusId);
    // Direct focus is a route entry; openDeck owns stale target/principal guards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, identity, principal]);

  async function openDeck(id: string) {
    if (!id || actionRef.current || unresolvedReview || unresolvedSave) return;
    const revision = ++detailRevision.current;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setDetailId(id);
    setDetail(undefined);
    setDetailError("");
    setDetailErrorIdentity("");
    setDetailLoading(true);
    setCardIndex(0);
    setRevealed(false);
    setRatings({});
    setReviewState("idle");
    setReviewError("");
    reviewPendingRef.current = undefined;
    try {
      const result = await api.getStudyFlashcards(id, controller.signal);
      if (
        controller.signal.aborted ||
        !currentFor(capturedIdentity, capturedEpoch) ||
        revision !== detailRevision.current
      )
        return;
      setDetail(result);
      setDetailIdentity(capturedIdentity);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        currentFor(capturedIdentity, capturedEpoch) &&
        revision === detailRevision.current
      ) {
        setDetailError(errorText(error));
        setDetailErrorIdentity(capturedIdentity);
      }
    } finally {
      if (
        currentFor(capturedIdentity, capturedEpoch) &&
        revision === detailRevision.current
      )
        setDetailLoading(false);
    }
  }
  async function generate() {
    if (
      !visibleSelectedDocument ||
      actionRef.current ||
      unresolvedReview ||
      unresolvedSave
    )
      return;
    const token = acquire("generate");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setGenerationState("generating");
    setGenerationError("");
    setSaveError("");
    setNotice("");
    try {
      const result = await api.generateStudyFlashcards({
        documentId: visibleSelectedDocument.id,
        language,
        cardCount,
      });
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setDraft(result);
      setDraftIdentity(capturedIdentity);
      setGenerationState("preview");
      setSaveState("preview");
    } catch (error) {
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setGenerationError(errorText(error));
      setGenerationState(isUnknownWrite(error) ? "unknown" : "error");
    } finally {
      release(token);
    }
  }

  async function confirmDraft() {
    if (
      !liveDraft ||
      actionRef.current ||
      unresolvedReview ||
      saveState === "unknown" ||
      saveState === "reconciling" ||
      (saveState !== "preview" && saveState !== "error")
    )
      return;
    const token = acquire("confirm");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("saving");
    setSaveError("");
    try {
      const saved = await api.confirmStudyFlashcards(liveDraft.draftId, {
        draftToken: liveDraft.draftToken,
      });
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setDraft(undefined);
      setSaveState("confirmed");
      setNotice(`Đã lưu bộ thẻ “${saved.title}”.`);
      setListPage(1);
      setListRefresh((value) => value + 1);
    } catch (error) {
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setSaveError(errorText(error));
      setSaveState(isUnknownWrite(error) ? "unknown" : "error");
    } finally {
      release(token);
    }
  }

  async function reconcileDraft() {
    if (!liveDraft || actionRef.current || saveState !== "unknown") return;
    const token = acquire("reconcile");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("reconciling");
    setSaveError("");
    try {
      const result = await api.reconcileStudyFlashcardsDraft(
        liveDraft.draftId,
        liveDraft.draftToken,
      );
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      if (result.status === "confirmed") {
        setDraft(undefined);
        setSaveState("confirmed");
        setNotice(`Đã xác nhận bộ thẻ “${result.deck.title}” đã được lưu.`);
        setListPage(1);
        setListRefresh((value) => value + 1);
      } else if (result.status === "draft") {
        setDraft((current) =>
          current?.draftId === result.draft.draftId
            ? { ...current, ...result.draft }
            : current,
        );
        setSaveState("preview");
        setNotice(
          "Máy chủ xác nhận bản xem trước chưa được lưu. Bạn có thể xác nhận riêng.",
        );
      } else {
        setDraft(undefined);
        setSaveState("terminal");
        setNotice(
          result.status === "expired"
            ? "Bản xem trước đã hết hạn."
            : result.status === "deleted"
              ? "Bộ thẻ đã bị xóa."
              : "Bản xem trước đã bị hủy.",
        );
      }
    } catch (error) {
      if (
        currentFor(capturedIdentity, capturedEpoch) &&
        actionRef.current === token
      ) {
        setSaveState("unknown");
        setSaveError(`Chưa đối chiếu được trạng thái lưu. ${errorText(error)}`);
      }
    } finally {
      release(token);
    }
  }

  async function cancelDraft() {
    if (
      !liveDraft ||
      actionRef.current ||
      unresolvedReview ||
      unresolvedSave ||
      (saveState !== "preview" && saveState !== "error")
    )
      return;
    const token = acquire("cancel");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await api.cancelStudyFlashcardsDraft(liveDraft.draftId, {
        draftToken: liveDraft.draftToken,
      });
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setDraft(undefined);
      setSaveState("terminal");
      setNotice(
        result.status === "expired"
          ? "Bản xem trước đã hết hạn."
          : "Đã hủy bản xem trước; chưa có bộ thẻ nào được lưu.",
      );
    } catch (error) {
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setSaveError(errorText(error));
      setSaveState(isUnknownWrite(error) ? "unknown" : "error");
    } finally {
      release(token);
    }
  }

  function rateCurrent(rating: "remembered" | "needs_review") {
    if (!visibleDetail || !revealed || busy || unresolvedReview) return;
    const card = visibleDetail.cards[cardIndex];
    if (!card) return;
    setRatings((current) => ({ ...current, [card.id]: rating }));
  }

  async function sendReview(pending: ReviewPending) {
    if (
      actionRef.current ||
      pending.principal !== identityRef.current ||
      unresolvedSave
    )
      return;
    const token = acquire("review");
    if (!token) return;
    const capturedEpoch = epoch.current;
    setReviewState("sending");
    setReviewError("");
    try {
      const result = await api.submitStudyFlashcardsReview(
        pending.deckId,
        pending.payload,
      );
      if (
        !currentFor(pending.principal, capturedEpoch) ||
        actionRef.current !== token ||
        reviewPendingRef.current !== pending
      )
        return;
      applyReviewResult(result, pending.deckId);
    } catch (error) {
      if (
        !currentFor(pending.principal, capturedEpoch) ||
        actionRef.current !== token ||
        reviewPendingRef.current !== pending
      )
        return;
      setReviewError(errorText(error));
      if (isUnknownWrite(error)) setReviewState("unknown");
      else {
        setReviewState("failed");
        reviewPendingRef.current = undefined;
      }
    } finally {
      release(token);
    }
  }

  function applyReviewResult(
    result: StudyFlashcardsReviewResult,
    deckId: string,
  ) {
    reviewPendingRef.current = undefined;
    setReviewState("confirmed");
    setReviewError("");
    setDetail((current) =>
      current?.deck.id === deckId
        ? { ...current, deck: { ...current.deck, progress: result.progress } }
        : current,
    );
    setListData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === deckId
                ? { ...item, progress: result.progress }
                : item,
            ),
          }
        : current,
    );
    setListRefresh((value) => value + 1);
    setNotice(
      "Đã lưu lượt tự đánh giá. Đây là ghi nhận của bạn, không phải điểm AI.",
    );
  }

  async function submitReview() {
    if (
      !visibleDetail ||
      actionRef.current ||
      unresolvedReview ||
      unresolvedSave
    )
      return;
    const canonical = visibleDetail.cards.map((card) => ({
      cardId: card.id,
      rating: ratings[card.id],
    }));
    if (canonical.some((item) => !item.rating)) return;
    const pending: ReviewPending = {
      deckId: visibleDetail.deck.id,
      principal: identityRef.current,
      key: crypto.randomUUID(),
      payload: {
        reviewKey: crypto.randomUUID(),
        ratings: canonical as StudyFlashcardsReviewRequest["ratings"],
      },
    };
    pending.key = pending.payload.reviewKey;
    reviewPendingRef.current = pending;
    await sendReview(pending);
  }

  async function retryReview() {
    const pending = reviewPendingRef.current;
    if (
      !pending ||
      reviewState !== "unknown" ||
      pending.principal !== identityRef.current
    )
      return;
    await sendReview(pending);
  }

  async function removeDeck(deck: StudyFlashcardsSummary) {
    if (actionRef.current || unresolvedReview || unresolvedSave) return;
    if (deleteTarget !== deck.id) {
      setDeleteTarget(deck.id);
      return;
    }
    const token = acquire("delete");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setListError("");
    try {
      await api.deleteStudyFlashcards(deck.id);
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setDeleteTarget("");
      if (detailId === deck.id) {
        detailController.current?.abort();
        detailRevision.current++;
        setDetail(undefined);
        setDetailId("");
      }
      setListRefresh((value) => value + 1);
      setNotice("Đã xóa bộ flashcards và các lượt tự đánh giá của bạn.");
    } catch (error) {
      if (
        currentFor(capturedIdentity, capturedEpoch) &&
        actionRef.current === token
      )
        setListError(
          `Chưa xác nhận được kết quả xóa. Hãy tải lại danh sách để đối chiếu. ${errorText(error)}`,
        );
    } finally {
      release(token);
    }
  }

  const currentCard = visibleDetail?.cards[cardIndex];
  const allRated =
    !!visibleDetail &&
    visibleDetail.cards.every((card) => ratings[card.id] !== undefined);
  const requestListRetry = () => {
    setListError("");
    setListRefresh((value) => value + 1);
  };
  const requestDocumentRetry = () => {
    setDocumentError("");
    setDocumentRefresh((value) => value + 1);
  };

  return (
    <section
      className="study-coach-layout study-flashcards-layout"
      aria-labelledby="study-flashcards-title"
    >
      <header className="study-coach-header">
        <h2 id="study-flashcards-title">Study Coach · Flashcards</h2>
        <p>
          Tạo bộ thẻ từ bằng chứng đã lập chỉ mục trong một tài liệu; tự lật
          thẻ, đánh giá và theo dõi tiến độ cá nhân.
        </p>
      </header>

      <section className="panel" aria-labelledby="flashcards-create-title">
        <h3 id="flashcards-create-title">Tạo bản xem trước</h3>
        {!focusId && (
          <>
            <label htmlFor="flashcards-document-search">
              Tìm tài liệu đã sẵn sàng
            </label>
            <input
              id="flashcards-document-search"
              type="search"
              maxLength={120}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setDocumentPage(1);
              }}
              placeholder="Tên tài liệu hoặc môn học"
            />
            <div
              className="study-quiz-document-picker"
              aria-busy={documentLoading}
            >
              {currentQuery.length === 1 ? (
                <p role="status">Nhập thêm ít nhất một ký tự để tìm.</p>
              ) : documentQueryPending ? (
                <p role="status">Đang chờ tìm kiếm…</p>
              ) : documentLoading ? (
                <p role="status">Đang tìm tài liệu…</p>
              ) : visibleDocumentError ? (
                <div role="alert">
                  <p>{visibleDocumentError}</p>
                  <button type="button" onClick={requestDocumentRetry}>
                    Thử đọc danh sách lại
                  </button>
                </div>
              ) : visibleDocs?.items.length ? (
                <>
                  <label htmlFor="flashcards-document">Tài liệu</label>
                  <select
                    id="flashcards-document"
                    value={visibleSelectedDocument?.id ?? ""}
                    onChange={(event) => {
                      setSelectedDocument(
                        visibleDocs.items.find(
                          (item) => item.id === event.target.value,
                        ),
                      );
                      setSelectedDocumentIdentity(identity);
                    }}
                    disabled={busy || unresolvedReview || unresolvedSave}
                  >
                    <option value="">Chọn tài liệu stored/ready</option>
                    {visibleDocs.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <div className="study-coach-pagination">
                    <span>{visibleDocs.total} tài liệu</span>
                    <button
                      type="button"
                      disabled={documentPage <= 1 || documentLoading}
                      onClick={() =>
                        setDocumentPage((page) => Math.max(1, page - 1))
                      }
                    >
                      Trước
                    </button>
                    <span>
                      Trang {documentPage} / {visibleDocs.totalPages || 1}
                    </span>
                    <button
                      type="button"
                      disabled={
                        documentPage >= visibleDocs.totalPages ||
                        documentLoading
                      }
                      onClick={() => setDocumentPage((page) => page + 1)}
                    >
                      Sau
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  {query.trim().length < 2
                    ? "Nhập ít nhất hai ký tự để tìm, hoặc duyệt tài liệu đã sẵn sàng."
                    : "Không tìm thấy tài liệu đã lập chỉ mục phù hợp."}
                </p>
              )}
            </div>
          </>
        )}
        {focusId && (
          <p>
            {visibleSelectedDocument
              ? `Tài liệu: ${visibleSelectedDocument.name}`
              : "Chọn một tài liệu từ Documents để tạo flashcards."}
          </p>
        )}
        <div className="study-coach-controls">
          <label>
            Ngôn ngữ
            <select
              aria-label="Ngôn ngữ flashcards"
              value={language}
              disabled={busy || unresolvedReview || unresolvedSave}
              onChange={(event) =>
                setLanguage(event.target.value as "vi" | "en")
              }
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Số thẻ
            <select
              aria-label="Số thẻ flashcards"
              value={cardCount}
              disabled={busy || unresolvedReview || unresolvedSave}
              onChange={(event) => setCardCount(Number(event.target.value))}
            >
              {[3, 5, 7, 10].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={
              !visibleSelectedDocument ||
              busy ||
              unresolvedReview ||
              unresolvedSave ||
              generationState === "generating" ||
              saveState === "preview"
            }
            onClick={() => void generate()}
          >
            {generationState === "generating"
              ? "Đang tạo…"
              : "Tạo bản xem trước"}
          </button>
        </div>
        {generationError && (
          <p role="alert">
            {generationError}
            {generationState === "unknown"
              ? " Máy chủ có thể đã tạo bản nháp; không có yêu cầu nào được tự gửi lại."
              : ""}
          </p>
        )}
        {generationState === "unknown" && (
          <p role="status">
            Để tránh tạo lặp, hãy chỉ bắt đầu lần tạo mới khi bạn chủ động chấp
            nhận có thể phát sinh một lượt AI mới.
          </p>
        )}
        {liveDraft &&
          (saveState === "preview" ||
            saveState === "saving" ||
            saveState === "unknown" ||
            saveState === "reconciling") && (
            <div
              className="study-quiz-preview"
              aria-labelledby="flashcards-preview-title"
            >
              <h4 id="flashcards-preview-title">
                Bản xem trước · chưa được lưu
              </h4>
              <p>
                {liveDraft.flashcards.title} ·{" "}
                {liveDraft.flashcards.cards.length} thẻ · hết hạn{" "}
                {new Date(liveDraft.expiresAt).toLocaleString()}
              </p>
              <ol className="study-flashcard-preview-list">
                {liveDraft.flashcards.cards.map((card) => (
                  <li key={card.id}>
                    <strong>Mặt trước:</strong> {card.front}
                    <p>
                      <strong>Mặt sau:</strong> {card.back}
                    </p>
                    <p>
                      Nguồn:{" "}
                      {card.sourceIds
                        .map((sourceId) =>
                          liveDraft.flashcards.sources.find(
                            (source) => source.sourceId === sourceId,
                          ),
                        )
                        .filter(Boolean)
                        .map((source) => (
                          <a
                            key={source!.sourceId}
                            href={`#documents/${encodeURIComponent(source!.documentId)}`}
                          >
                            {source!.title}
                            {source!.page ? ` · trang ${source!.page}` : ""}
                          </a>
                        ))}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="study-coach-controls">
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy || unresolvedReview || saveState !== "preview"}
                  onClick={() => void confirmDraft()}
                >
                  {saveState === "saving" ? "Đang lưu…" : "Xác nhận lưu bộ thẻ"}
                </button>
                <button
                  type="button"
                  disabled={busy || unresolvedReview || saveState !== "preview"}
                  onClick={() => void cancelDraft()}
                >
                  Hủy bản xem trước
                </button>
              </div>
              {saveError && <p role="alert">{saveError}</p>}
              {saveState === "unknown" && (
                <>
                  <p role="status">
                    Kết quả lưu chưa rõ. Chỉ đọc đối chiếu mới được dùng để mở
                    khóa thao tác.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reconcileDraft()}
                  >
                    Đối chiếu trạng thái lưu
                  </button>
                </>
              )}
              {saveState === "reconciling" && (
                <p role="status">Đang đối chiếu bản xem trước…</p>
              )}
            </div>
          )}
        {notice && <p role="status">{notice}</p>}
      </section>

      <section className="panel" aria-labelledby="saved-flashcards-title">
        <header>
          <h3 id="saved-flashcards-title">Flashcards của tôi</h3>
          <span>{listLoading ? "…" : `${visibleListData?.total ?? 0} bộ`}</span>
          <button
            type="button"
            disabled={busy || listLoading}
            onClick={requestListRetry}
          >
            Tải lại danh sách
          </button>
        </header>
        {listLoading ? (
          <p role="status">Đang tải bộ thẻ…</p>
        ) : visibleListError ? (
          <div role="alert">
            <p>{visibleListError}</p>
            <button type="button" onClick={requestListRetry}>
              Thử tải danh sách lại
            </button>
          </div>
        ) : visibleListData?.items.length ? (
          <>
            <ul className="study-coach-quiz-list">
              {visibleListData.items.map((deck) => (
                <li key={deck.id}>
                  <div>
                    <strong>{deck.title}</strong>
                    <p>
                      {deck.documentTitle} · {deck.cardCount} thẻ ·{" "}
                      {deck.progress.reviews} lượt ôn
                    </p>
                    <p>
                      {deck.progress.latestAt
                        ? `Gần nhất ${new Date(deck.progress.latestAt).toLocaleString()}: ${deck.progress.latestRemembered} đã nhớ, ${deck.progress.latestNeedsReview} cần ôn lại`
                        : "Chưa có lượt tự đánh giá"}
                    </p>
                    <p>
                      {deck.sourceAvailable
                        ? "Nguồn hiện còn khả dụng"
                        : "Nguồn không còn sẵn sàng; snapshot flashcards được giữ nguyên."}
                    </p>
                  </div>
                  <div className="study-coach-controls">
                    <button
                      type="button"
                      disabled={busy || unresolvedReview || unresolvedSave}
                      aria-label={`Mở bộ thẻ ${deck.title}`}
                      onClick={() => void openDeck(deck.id)}
                    >
                      Mở để luyện tập
                    </button>
                    <button
                      type="button"
                      disabled={busy || unresolvedReview || unresolvedSave}
                      onClick={() => void removeDeck(deck)}
                    >
                      {deleteTarget === deck.id ? "Xác nhận xóa" : "Xóa bộ thẻ"}
                    </button>
                    {deleteTarget === deck.id && (
                      <button type="button" onClick={() => setDeleteTarget("")}>
                        Giữ lại
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="study-coach-pagination">
              <button
                type="button"
                disabled={listPage <= 1 || listLoading}
                onClick={() => setListPage((page) => Math.max(1, page - 1))}
              >
                Trước
              </button>
              <span>
                Trang {listPage} / {visibleListData.totalPages}
              </span>
              <button
                type="button"
                disabled={listPage >= visibleListData.totalPages || listLoading}
                onClick={() => setListPage((page) => page + 1)}
              >
                Sau
              </button>
            </div>
          </>
        ) : (
          <p>
            Chưa có bộ flashcards đã lưu. Tạo bản xem trước rồi xác nhận lưu để
            bắt đầu.
          </p>
        )}
      </section>

      {(detailLoading || visibleDetailError || visibleDetail) && (
        <section
          className="panel study-quiz-practice"
          aria-labelledby="flashcards-practice-title"
        >
          <h3 id="flashcards-practice-title">Luyện tập flashcards</h3>
          {detailLoading ? (
            <p role="status">Đang mở bộ thẻ…</p>
          ) : visibleDetailError ? (
            <div role="alert">
              <p>{visibleDetailError}</p>
              <button
                type="button"
                onClick={() => detailId && void openDeck(detailId)}
              >
                Thử mở lại
              </button>
            </div>
          ) : (
            visibleDetail && (
              <>
                <h4>{visibleDetail.deck.title}</h4>
                <p>
                  {visibleDetail.deck.progress.reviews} lượt ôn hoàn tất ·{" "}
                  {visibleDetail.deck.progress.latestAt
                    ? `gần nhất ${new Date(visibleDetail.deck.progress.latestAt).toLocaleString()}: ${visibleDetail.deck.progress.latestRemembered} đã nhớ, ${visibleDetail.deck.progress.latestNeedsReview} cần ôn lại`
                    : "chưa có lượt ôn"}
                </p>
                <article className="study-flashcard" aria-live="polite">
                  <p>
                    Thẻ {cardIndex + 1} / {visibleDetail.cards.length}
                  </p>
                  <strong>{currentCard?.front}</strong>
                  {revealed && (
                    <div>
                      <p>{currentCard?.back}</p>
                      <p>
                        Nguồn:{" "}
                        {currentCard?.sourceIds
                          .map((sourceId) =>
                            visibleDetail.sources.find(
                              (source) => source.sourceId === sourceId,
                            ),
                          )
                          .filter(Boolean)
                          .map((source) =>
                            source!.available ? (
                              <a
                                key={source!.sourceId}
                                href={`#documents/${encodeURIComponent(source!.documentId)}`}
                              >
                                {source!.title}
                                {source!.page ? ` · trang ${source!.page}` : ""}
                              </a>
                            ) : (
                              <span key={source!.sourceId}>
                                Nguồn hiện không khả dụng: {source!.title}
                              </span>
                            ),
                          )}
                      </p>
                    </div>
                  )}
                </article>
                <div className="study-coach-controls">
                  <button
                    type="button"
                    disabled={
                      busy || unresolvedReview || unresolvedSave || revealed
                    }
                    onClick={() => setRevealed(true)}
                  >
                    Lật thẻ
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || unresolvedReview || unresolvedSave || !revealed
                    }
                    aria-pressed={
                      currentCard
                        ? ratings[currentCard.id] === "remembered"
                        : false
                    }
                    onClick={() => rateCurrent("remembered")}
                  >
                    Đã nhớ
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || unresolvedReview || unresolvedSave || !revealed
                    }
                    aria-pressed={
                      currentCard
                        ? ratings[currentCard.id] === "needs_review"
                        : false
                    }
                    onClick={() => rateCurrent("needs_review")}
                  >
                    Cần ôn lại
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      unresolvedReview ||
                      unresolvedSave ||
                      cardIndex >= visibleDetail.cards.length - 1 ||
                      !currentCard ||
                      !ratings[currentCard.id]
                    }
                    onClick={() => {
                      setCardIndex((value) => value + 1);
                      setRevealed(false);
                    }}
                  >
                    Thẻ tiếp theo
                  </button>
                </div>
                {allRated && reviewState !== "confirmed" && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy || unresolvedReview || unresolvedSave}
                    onClick={() => void submitReview()}
                  >
                    Lưu lượt tự đánh giá
                  </button>
                )}
                {reviewState === "sending" && (
                  <p role="status">Đang lưu lượt tự đánh giá…</p>
                )}
                {reviewState === "unknown" && (
                  <div role="alert">
                    <p>
                      {reviewError} Kết quả chưa rõ; lượt và khóa vẫn được giữ.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retryReview()}
                    >
                      Thử lại cùng lượt
                    </button>
                  </div>
                )}
                {reviewState === "failed" && <p role="alert">{reviewError}</p>}
                {reviewState === "confirmed" && (
                  <p role="status">
                    Đã lưu: {visibleDetail.deck.progress.latestRemembered} đã
                    nhớ, {visibleDetail.deck.progress.latestNeedsReview} cần ôn
                    lại. Đây là tự đánh giá của bạn, không phải điểm AI.
                  </p>
                )}
                {unresolvedReview && (
                  <p role="status">
                    Đang giữ nguyên bộ thẻ và payload lượt ôn cho đến khi máy
                    chủ xác nhận.
                  </p>
                )}
              </>
            )
          )}
        </section>
      )}
    </section>
  );
}
