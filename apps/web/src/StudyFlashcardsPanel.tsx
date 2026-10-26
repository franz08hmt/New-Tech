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
import { useTr, tl } from "./i18n";

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
    : tl("Không thể hoàn tất thao tác. Hãy thử lại.");
const isUnknownWrite = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 408 || error.status >= 500;

function draftWriteError(error: unknown, operation: "confirm" | "cancel") {
  const action =
    operation === "confirm"
      ? tl("Không thể xác nhận lưu bộ thẻ.")
      : tl("Không thể hủy bản xem trước.");
  if (isUnknownWrite(error))
    return tl(
      "{action} Kết quả thao tác chưa rõ. Hãy đối chiếu trạng thái trước khi thực hiện thao tác ghi tiếp theo.",
      { action },
    );
  const failure = error as ApiError;
  if (failure.code === "STUDY_FLASHCARDS_ALREADY_CONFIRMED")
    return tl(
      "{action} Bản xem trước đã được lưu, có thể từ tab khác. Hãy đối chiếu để nhận bộ thẻ đã lưu.",
      { action },
    );
  if (failure.status === 401 || failure.status === 403)
    return tl(
      "{action} Phiên hoặc quyền truy cập hiện tại không cho phép thao tác. Hãy kiểm tra đăng nhập và quyền truy cập.",
      { action },
    );
  if (
    [
      "STUDY_FLASHCARDS_SOURCE_CHANGED",
      "DOCUMENT_NOT_READY",
      "DOCUMENT_NOT_AVAILABLE",
    ].includes(failure.code)
  )
    return tl(
      "{action} Tài liệu nguồn đã thay đổi hoặc không còn sẵn sàng. Hãy kiểm tra tài liệu; nếu cần, chủ động tạo bản xem trước mới.",
      { action },
    );
  if (
    failure.status === 404 ||
    ["STUDY_FLASHCARDS_DRAFT_UNAVAILABLE", "STUDY_FLASHCARDS_DELETED"].includes(
      failure.code,
    )
  )
    return tl(
      "{action} Bản xem trước đã hết hạn hoặc không còn khả dụng. Hãy đối chiếu trạng thái; không gửi lại thao tác ghi khi chưa xác nhận.",
      { action },
    );
  return tl(
    "{action} Yêu cầu bị từ chối. Hãy đối chiếu trạng thái bản xem trước trước khi quyết định thao tác tiếp theo.",
    { action },
  );
}

export function StudyFlashcardsPanel({ focusId }: { focusId?: string }) {
  const tr = useTr();
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
  const visibleSaveError = draftIdentity === identity ? saveError : "";
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
      saveState !== "preview"
    )
      return;
    const token = acquire("confirm");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("saving");
    setSaveError("");
    setNotice("");
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
      setNotice(tr("Đã lưu bộ thẻ “{title}”.", { title: saved.title }));
      setListPage(1);
      setListRefresh((value) => value + 1);
    } catch (error) {
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setSaveError(draftWriteError(error, "confirm"));
      setSaveState(isUnknownWrite(error) ? "unknown" : "error");
    } finally {
      release(token);
    }
  }

  async function reconcileDraft() {
    if (
      !liveDraft ||
      actionRef.current ||
      unresolvedReview ||
      (saveState !== "unknown" && saveState !== "error")
    )
      return;
    const token = acquire("reconcile");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("reconciling");
    setSaveError("");
    setNotice("");
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
        setNotice(
          tr("Đã xác nhận bộ thẻ “{title}” đã được lưu.", {
            title: result.deck.title,
          }),
        );
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
          tr(
            "Máy chủ xác nhận bản xem trước chưa được lưu. Bạn có thể xác nhận riêng.",
          ),
        );
      } else {
        setDraft(undefined);
        setSaveState("terminal");
        setSaveError(
          result.status === "expired"
            ? tr("Bản xem trước đã hết hạn. Không thể tiếp tục lưu bản này.")
            : result.status === "deleted"
              ? tr("Bộ thẻ đã bị xóa. Không thể khôi phục bằng xác nhận cũ.")
              : tr("Bản xem trước đã bị hủy. Không thể tiếp tục lưu bản này."),
        );
      }
    } catch (error) {
      if (
        currentFor(capturedIdentity, capturedEpoch) &&
        actionRef.current === token
      ) {
        setSaveState("unknown");
        setSaveError(
          tr(
            "Chưa đối chiếu được trạng thái lưu. Chỉ thử đọc đối chiếu lại; thao tác ghi vẫn bị khóa.",
          ),
        );
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
      saveState !== "preview"
    )
      return;
    const token = acquire("cancel");
    if (!token) return;
    const capturedIdentity = identityRef.current;
    const capturedEpoch = epoch.current;
    setSaveState("saving");
    setSaveError("");
    setNotice("");
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
          ? tr("Bản xem trước đã hết hạn.")
          : tr("Đã hủy bản xem trước; chưa có bộ thẻ nào được lưu."),
      );
    } catch (error) {
      if (
        !currentFor(capturedIdentity, capturedEpoch) ||
        actionRef.current !== token
      )
        return;
      setSaveError(draftWriteError(error, "cancel"));
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
      tr(
        "Đã lưu lượt tự đánh giá. Đây là ghi nhận của bạn, không phải điểm AI.",
      ),
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
      setNotice(tr("Đã xóa bộ flashcards và các lượt tự đánh giá của bạn."));
    } catch (error) {
      if (
        currentFor(capturedIdentity, capturedEpoch) &&
        actionRef.current === token
      )
        setListError(
          tr(
            "Chưa xác nhận được kết quả xóa. Hãy tải lại danh sách để đối chiếu. {value}",
            { value: errorText(error) },
          ),
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
        <h2 id="study-flashcards-title">{tr("Study Coach · Flashcards")}</h2>
        <p>
          {tr(
            "Tạo bộ thẻ từ bằng chứng đã lập chỉ mục trong một tài liệu; tự lật thẻ, đánh giá và theo dõi tiến độ cá nhân.",
          )}
        </p>
      </header>

      <section className="panel" aria-labelledby="flashcards-create-title">
        <h3 id="flashcards-create-title">{tr("Tạo bản xem trước")}</h3>
        {!focusId && (
          <>
            <label htmlFor="flashcards-document-search">
              {tr("Tìm tài liệu đã sẵn sàng")}
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
              placeholder={tr("Tên tài liệu hoặc môn học")}
            />
            <div
              className="study-quiz-document-picker"
              aria-busy={documentLoading}
            >
              {currentQuery.length === 1 ? (
                <p role="status">{tr("Nhập thêm ít nhất một ký tự để tìm.")}</p>
              ) : documentQueryPending ? (
                <p role="status">{tr("Đang chờ tìm kiếm…")}</p>
              ) : documentLoading ? (
                <p role="status">{tr("Đang tìm tài liệu…")}</p>
              ) : visibleDocumentError ? (
                <div role="alert">
                  <p>{visibleDocumentError}</p>
                  <button type="button" onClick={requestDocumentRetry}>
                    {tr("Thử đọc danh sách lại")}
                  </button>
                </div>
              ) : visibleDocs?.items.length ? (
                <>
                  <label htmlFor="flashcards-document">{tr("Tài liệu")}</label>
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
                    <option value="">{tr("Chọn tài liệu stored/ready")}</option>
                    {visibleDocs.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <div className="study-coach-pagination">
                    <span>
                      {visibleDocs.total} {tr("tài liệu")}
                    </span>
                    <button
                      type="button"
                      disabled={documentPage <= 1 || documentLoading}
                      onClick={() =>
                        setDocumentPage((page) => Math.max(1, page - 1))
                      }
                    >
                      {tr("Trước")}
                    </button>
                    <span>
                      {tr("Trang")} {documentPage} /{" "}
                      {visibleDocs.totalPages || 1}
                    </span>
                    <button
                      type="button"
                      disabled={
                        documentPage >= visibleDocs.totalPages ||
                        documentLoading
                      }
                      onClick={() => setDocumentPage((page) => page + 1)}
                    >
                      {tr("Sau")}
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  {query.trim().length < 2
                    ? tr(
                        "Nhập ít nhất hai ký tự để tìm, hoặc duyệt tài liệu đã sẵn sàng.",
                      )
                    : tr("Không tìm thấy tài liệu đã lập chỉ mục phù hợp.")}
                </p>
              )}
            </div>
          </>
        )}
        {focusId && (
          <p>
            {visibleSelectedDocument
              ? tr("Tài liệu: {name}", { name: visibleSelectedDocument.name })
              : tr("Chọn một tài liệu từ Documents để tạo flashcards.")}
          </p>
        )}
        <div className="study-coach-controls">
          <label>
            {tr("Ngôn ngữ")}
            <select
              aria-label={tr("Ngôn ngữ flashcards")}
              value={language}
              disabled={busy || unresolvedReview || unresolvedSave}
              onChange={(event) =>
                setLanguage(event.target.value as "vi" | "en")
              }
            >
              <option value="vi">{tr("Tiếng Việt")}</option>
              <option value="en">{tr("English")}</option>
            </select>
          </label>
          <label>
            {tr("Số thẻ")}
            <select
              aria-label={tr("Số thẻ flashcards")}
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
              ? tr("Đang tạo…")
              : tr("Tạo bản xem trước")}
          </button>
        </div>
        {generationError && (
          <p role="alert">
            {generationError}
            {generationState === "unknown"
              ? tr(
                  " Máy chủ có thể đã tạo bản nháp; không có yêu cầu nào được tự gửi lại.",
                )
              : ""}
          </p>
        )}
        {generationState === "unknown" && (
          <p role="status">
            {tr(
              "Để tránh tạo lặp, hãy chỉ bắt đầu lần tạo mới khi bạn chủ động chấp nhận có thể phát sinh một lượt AI mới.",
            )}
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
                {tr("Bản xem trước · chưa được lưu")}
              </h4>
              <p>
                {liveDraft.flashcards.title} ·{" "}
                {liveDraft.flashcards.cards.length} {tr("thẻ · hết hạn")}{" "}
                {new Date(liveDraft.expiresAt).toLocaleString()}
              </p>
              <ol className="study-flashcard-preview-list">
                {liveDraft.flashcards.cards.map((card) => (
                  <li key={card.id}>
                    <strong>{tr("Mặt trước:")}</strong> {card.front}
                    <p>
                      <strong>{tr("Mặt sau:")}</strong> {card.back}
                    </p>
                    <p>
                      {tr("Nguồn:")}{" "}
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
                            {source!.page
                              ? tr(" · trang {page}", { page: source!.page })
                              : ""}
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
                  {saveState === "saving"
                    ? tr("Đang lưu…")
                    : tr("Xác nhận lưu bộ thẻ")}
                </button>
                <button
                  type="button"
                  disabled={busy || unresolvedReview || saveState !== "preview"}
                  onClick={() => void cancelDraft()}
                >
                  {tr("Hủy bản xem trước")}
                </button>
              </div>
            </div>
          )}
        {visibleSaveError && <p role="alert">{visibleSaveError}</p>}
        {liveDraft && (saveState === "unknown" || saveState === "error") && (
          <>
            {saveState === "unknown" && (
              <p role="status">
                {tr(
                  "Kết quả lưu chưa rõ. Chỉ đọc đối chiếu mới được dùng để mở khóa thao tác.",
                )}
              </p>
            )}
            <button
              type="button"
              disabled={busy || unresolvedReview}
              onClick={() => void reconcileDraft()}
            >
              {tr("Đối chiếu trạng thái lưu")}
            </button>
          </>
        )}
        {liveDraft && saveState === "reconciling" && (
          <p role="status">{tr("Đang đối chiếu bản xem trước…")}</p>
        )}
        {(saveState === "error" || saveState === "terminal") &&
          draftIdentity === identity && (
            <p>
              {tr(
                "Chỉ tạo bản xem trước mới khi bạn chủ động chấp nhận có thể phát sinh một lượt AI mới.",
              )}
            </p>
          )}
        {notice && <p role="status">{notice}</p>}
      </section>

      <section className="panel" aria-labelledby="saved-flashcards-title">
        <header>
          <h3 id="saved-flashcards-title">{tr("Flashcards của tôi")}</h3>
          <span>
            {listLoading
              ? "…"
              : tr("{value} bộ", { value: visibleListData?.total ?? 0 })}
          </span>
          <button
            type="button"
            disabled={busy || listLoading}
            onClick={requestListRetry}
          >
            {tr("Tải lại danh sách")}
          </button>
        </header>
        {listLoading ? (
          <p role="status">{tr("Đang tải bộ thẻ…")}</p>
        ) : visibleListError ? (
          <div role="alert">
            <p>{visibleListError}</p>
            <button type="button" onClick={requestListRetry}>
              {tr("Thử tải danh sách lại")}
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
                      {deck.documentTitle} · {deck.cardCount} {tr("thẻ ·")}{" "}
                      {deck.progress.reviews} {tr("lượt ôn")}
                    </p>
                    <p>
                      {deck.progress.latestAt
                        ? tr(
                            "Gần nhất {value}: {latestRemembered} đã nhớ, {latestNeedsReview} cần ôn lại",
                            {
                              value: new Date(
                                deck.progress.latestAt,
                              ).toLocaleString(),
                              latestRemembered: deck.progress.latestRemembered,
                              latestNeedsReview:
                                deck.progress.latestNeedsReview,
                            },
                          )
                        : tr("Chưa có lượt tự đánh giá")}
                    </p>
                    <p>
                      {deck.sourceAvailable
                        ? tr("Nguồn hiện còn khả dụng")
                        : tr(
                            "Nguồn không còn sẵn sàng; snapshot flashcards được giữ nguyên.",
                          )}
                    </p>
                  </div>
                  <div className="study-coach-controls">
                    <button
                      type="button"
                      disabled={busy || unresolvedReview || unresolvedSave}
                      aria-label={tr("Mở bộ thẻ {title}", {
                        title: deck.title,
                      })}
                      onClick={() => void openDeck(deck.id)}
                    >
                      {tr("Mở để luyện tập")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || unresolvedReview || unresolvedSave}
                      onClick={() => void removeDeck(deck)}
                    >
                      {deleteTarget === deck.id
                        ? tr("Xác nhận xóa")
                        : tr("Xóa bộ thẻ")}
                    </button>
                    {deleteTarget === deck.id && (
                      <button type="button" onClick={() => setDeleteTarget("")}>
                        {tr("Giữ lại")}
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
                {tr("Trước")}
              </button>
              <span>
                {tr("Trang")} {listPage} / {visibleListData.totalPages}
              </span>
              <button
                type="button"
                disabled={listPage >= visibleListData.totalPages || listLoading}
                onClick={() => setListPage((page) => page + 1)}
              >
                {tr("Sau")}
              </button>
            </div>
          </>
        ) : (
          <p>
            {tr(
              "Chưa có bộ flashcards đã lưu. Tạo bản xem trước rồi xác nhận lưu để bắt đầu.",
            )}
          </p>
        )}
      </section>

      {(detailLoading || visibleDetailError || visibleDetail) && (
        <section
          className="panel study-quiz-practice"
          aria-labelledby="flashcards-practice-title"
        >
          <h3 id="flashcards-practice-title">{tr("Luyện tập flashcards")}</h3>
          {detailLoading ? (
            <p role="status">{tr("Đang mở bộ thẻ…")}</p>
          ) : visibleDetailError ? (
            <div role="alert">
              <p>{visibleDetailError}</p>
              <button
                type="button"
                onClick={() => detailId && void openDeck(detailId)}
              >
                {tr("Thử mở lại")}
              </button>
            </div>
          ) : (
            visibleDetail && (
              <>
                <h4>{visibleDetail.deck.title}</h4>
                <p>
                  {visibleDetail.deck.progress.reviews}{" "}
                  {tr("lượt ôn hoàn tất ·")}{" "}
                  {visibleDetail.deck.progress.latestAt
                    ? tr(
                        "gần nhất {value}: {latestRemembered} đã nhớ, {latestNeedsReview} cần ôn lại",
                        {
                          value: new Date(
                            visibleDetail.deck.progress.latestAt,
                          ).toLocaleString(),
                          latestRemembered:
                            visibleDetail.deck.progress.latestRemembered,
                          latestNeedsReview:
                            visibleDetail.deck.progress.latestNeedsReview,
                        },
                      )
                    : tr("chưa có lượt ôn")}
                </p>
                <article className="study-flashcard" aria-live="polite">
                  <p>
                    {tr("Thẻ")} {cardIndex + 1} / {visibleDetail.cards.length}
                  </p>
                  <strong>{currentCard?.front}</strong>
                  {revealed && (
                    <div>
                      <p>{currentCard?.back}</p>
                      <p>
                        {tr("Nguồn:")}{" "}
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
                                {source!.page
                                  ? tr(" · trang {page}", {
                                      page: source!.page,
                                    })
                                  : ""}
                              </a>
                            ) : (
                              <span key={source!.sourceId}>
                                {tr("Nguồn hiện không khả dụng:")}{" "}
                                {source!.title}
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
                    {tr("Lật thẻ")}
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
                    {tr("Đã nhớ")}
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
                    {tr("Cần ôn lại")}
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
                    {tr("Thẻ tiếp theo")}
                  </button>
                </div>
                {allRated && reviewState !== "confirmed" && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy || unresolvedReview || unresolvedSave}
                    onClick={() => void submitReview()}
                  >
                    {tr("Lưu lượt tự đánh giá")}
                  </button>
                )}
                {reviewState === "sending" && (
                  <p role="status">{tr("Đang lưu lượt tự đánh giá…")}</p>
                )}
                {reviewState === "unknown" && (
                  <div role="alert">
                    <p>
                      {reviewError}{" "}
                      {tr("Kết quả chưa rõ; lượt và khóa vẫn được giữ.")}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retryReview()}
                    >
                      {tr("Thử lại cùng lượt")}
                    </button>
                  </div>
                )}
                {reviewState === "failed" && <p role="alert">{reviewError}</p>}
                {reviewState === "confirmed" && (
                  <p role="status">
                    {tr("Đã lưu:")}{" "}
                    {visibleDetail.deck.progress.latestRemembered}{" "}
                    {tr("đã nhớ,")}{" "}
                    {visibleDetail.deck.progress.latestNeedsReview}{" "}
                    {tr(
                      "cần ôn lại. Đây là tự đánh giá của bạn, không phải điểm AI.",
                    )}
                  </p>
                )}
                {unresolvedReview && (
                  <p role="status">
                    {tr(
                      "Đang giữ nguyên bộ thẻ và payload lượt ôn cho đến khi máy chủ xác nhận.",
                    )}
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
