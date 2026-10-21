import { useContext, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type DocumentSearchPage,
  type StoredDocument,
  type StudyQuizAttemptResult,
  type StudyQuizDetail,
  type StudyQuizGeneratedDraft,
  type StudyQuizSummary,
} from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const PAGE_SIZE = 20;
type QuizAttemptState =
  "idle" | "prepared" | "sending" | "unknown" | "confirmed" | "failed";
type QuizSaveState =
  | "idle"
  | "preview"
  | "saving"
  | "unknown"
  | "reconciling"
  | "reconciled-draft"
  | "confirmed"
  | "failed"
  | "expired"
  | "cancelled"
  | "deleted";
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Không thể hoàn tất thao tác. Hãy thử lại.";
const isUnknownWrite = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 408 || error.status >= 500;

export function StudyCoachPanel({ focusId }: { focusId?: string }) {
  const principal = useContext(PilotPrincipalContext);
  const identity = `${principal?.userId ?? ""}:${principal?.workspaceId ?? ""}:${principal?.role ?? ""}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const lifecycle = useRef(0);
  const docController = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const detailRevision = useRef(0);
  const selectedRevision = useRef(0);
  const selectedDocumentRef = useRef<StoredDocument | undefined>(undefined);
  const actionLock = useRef(false);
  const attemptActionLock = useRef(false);
  const searchPrincipalRef = useRef(identity);
  const [searchPrincipalIdentity, setSearchPrincipalIdentity] =
    useState(identity);
  const searchPrincipalChanged = searchPrincipalIdentity !== identity;

  const [documentInput, setDocumentInput] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [documentRefresh, setDocumentRefresh] = useState(0);
  const [documentResults, setDocumentResults] = useState<DocumentSearchPage>();
  const [selectedDocument, setSelectedDocument] = useState<StoredDocument>();
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [questionCount, setQuestionCount] = useState(5);
  const [draft, setDraft] = useState<StudyQuizGeneratedDraft>();
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | "preview" | "unknown"
  >("idle");
  const [generationError, setGenerationError] = useState("");
  const [saveState, setSaveState] = useState<QuizSaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [quizPage, setQuizPage] = useState(1);
  const [quizRefresh, setQuizRefresh] = useState(0);
  const [quizList, setQuizList] =
    useState<Awaited<ReturnType<typeof api.listStudyQuizzes>>>();
  const [quizListLoading, setQuizListLoading] = useState(true);
  const [quizListError, setQuizListError] = useState("");
  const [detail, setDetail] = useState<StudyQuizDetail>();
  const [detailTarget, setDetailTarget] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [attempt, setAttempt] = useState<StudyQuizAttemptResult>();
  const [attemptError, setAttemptError] = useState("");
  const [attemptState, setAttemptState] = useState<QuizAttemptState>("idle");
  const [attemptPending, setAttemptPending] = useState<{
    quizId: string;
    key: string;
    payload: {
      attemptKey: string;
      answers: { questionId: string; selectedIndex: number }[];
    };
  }>();
  const [quizBusy, setQuizBusy] = useState(false);
  const documentRequestKey = `${identity}:${documentInput.trim()}:${documentQuery}:${documentPage}:${documentRefresh}`;
  const documentRequestKeyRef = useRef(documentRequestKey);
  documentRequestKeyRef.current = documentRequestKey;
  const documentSearchPending =
    documentInput.trim().length !== 1 && documentInput.trim() !== documentQuery;
  const visibleDocumentResults = searchPrincipalChanged
    ? undefined
    : documentResults;
  const visibleSelectedDocument = searchPrincipalChanged
    ? undefined
    : selectedDocument;

  useEffect(() => {
    const principalChanged = searchPrincipalRef.current !== identity;
    searchPrincipalRef.current = identity;
    setSearchPrincipalIdentity(identity);
    const epoch = ++lifecycle.current;
    docController.current?.abort();
    listController.current?.abort();
    detailController.current?.abort();
    detailRevision.current++;
    setDocumentResults(undefined);
    if (principalChanged) {
      setDocumentInput("");
      setDocumentQuery("");
      setDocumentPage(1);
    }
    setSelectedDocument(undefined);
    selectedDocumentRef.current = undefined;
    selectedRevision.current++;
    setDraft(undefined);
    setGenerationState("idle");
    setGenerationError("");
    setSaveState("idle");
    setSaveError("");
    setSavedNotice("");
    setQuizList(undefined);
    setQuizListError("");
    setQuizPage(1);
    setDetail(undefined);
    setDetailTarget("");
    setDetailError("");
    setAnswers({});
    setAttempt(undefined);
    setAttemptState("idle");
    setAttemptPending(undefined);
    setAttemptError("");
    setDocumentError("");
    if (!principal) {
      setQuizListLoading(false);
      return;
    }
    setQuizListLoading(!!principal);
    if (focusId) {
      const focusController = new AbortController();
      docController.current = focusController;
      setDocumentLoading(true);
      void api
        .getDocument(focusId, focusController.signal)
        .then((document) => {
          if (epoch !== lifecycle.current || identity !== identityRef.current)
            return;
          if (
            document.storage_status !== "stored" ||
            document.processing_status !== "ready"
          ) {
            setDocumentError("Tài liệu chưa sẵn sàng để tạo quiz.");
            return;
          }
          setSelectedDocument(document);
          selectedDocumentRef.current = document;
        })
        .catch((error: unknown) => {
          if (!focusController.signal.aborted && epoch === lifecycle.current)
            setDocumentError(errorText(error));
        })
        .finally(() => {
          if (epoch === lifecycle.current) setDocumentLoading(false);
        });
    }
    return () => {
      lifecycle.current++;
      docController.current?.abort();
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [identity, focusId]);

  useEffect(() => {
    if (!principal || focusId || searchPrincipalChanged) return;
    const query = documentInput.trim();
    if (query === documentQuery) return;
    const timer = window.setTimeout(() => {
      setDocumentPage(1);
      setDocumentQuery(query);
    }, 275);
    return () => window.clearTimeout(timer);
  }, [
    documentInput,
    documentQuery,
    focusId,
    identity,
    principal,
    searchPrincipalChanged,
  ]);

  useEffect(() => {
    if (!principal || focusId || searchPrincipalChanged) return;
    const query = documentInput.trim();
    if (query !== documentQuery) {
      docController.current?.abort();
      setDocumentResults(undefined);
      setDocumentLoading(false);
      setDocumentError("");
      return;
    }
    if (query.length === 1) {
      docController.current?.abort();
      setDocumentResults(undefined);
      setDocumentLoading(false);
      return;
    }
    const epoch = lifecycle.current;
    const key = documentRequestKey;
    const controller = new AbortController();
    docController.current?.abort();
    docController.current = controller;
    setDocumentLoading(true);
    setDocumentError("");
    setDocumentResults(undefined);
    void api
      .searchDocuments(
        {
          q: query || undefined,
          storage_status: "stored",
          processing_status: "ready",
          sort: "created_at",
          direction: "desc",
          page: documentPage,
          pageSize: PAGE_SIZE,
        },
        controller.signal,
      )
      .then((value) => {
        if (
          key === documentRequestKeyRef.current &&
          epoch === lifecycle.current &&
          identity === identityRef.current
        )
          setDocumentResults(value);
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          key === documentRequestKeyRef.current &&
          epoch === lifecycle.current &&
          identity === identityRef.current
        )
          setDocumentError(errorText(error));
      })
      .finally(() => {
        if (
          key === documentRequestKeyRef.current &&
          epoch === lifecycle.current &&
          identity === identityRef.current
        )
          setDocumentLoading(false);
      });
    return () => controller.abort();
  }, [
    documentQuery,
    documentPage,
    documentRefresh,
    documentRequestKey,
    focusId,
    identity,
    principal,
    searchPrincipalChanged,
    documentInput,
  ]);

  useEffect(() => {
    if (!principal) return;
    const epoch = lifecycle.current;
    const controller = new AbortController();
    listController.current?.abort();
    listController.current = controller;
    setQuizListLoading(true);
    setQuizListError("");
    void api
      .listStudyQuizzes(quizPage, PAGE_SIZE, controller.signal)
      .then((value) => {
        if (epoch === lifecycle.current && identity === identityRef.current)
          setQuizList(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && epoch === lifecycle.current)
          setQuizListError(errorText(error));
      })
      .finally(() => {
        if (epoch === lifecycle.current) setQuizListLoading(false);
      });
    return () => controller.abort();
  }, [identity, principal, quizPage, quizRefresh]);

  function selectDocument(document: StoredDocument) {
    if (
      searchPrincipalChanged ||
      saveState === "saving" ||
      saveState === "unknown" ||
      saveState === "reconciling"
    )
      return;
    if (
      attemptState === "unknown" ||
      attemptState === "sending" ||
      attemptActionLock.current
    )
      return;
    if (
      document.storage_status !== "stored" ||
      document.processing_status !== "ready"
    )
      return;
    selectedRevision.current++;
    setSelectedDocument(document);
    selectedDocumentRef.current = document;
    setDraft(undefined);
    setGenerationState("idle");
    setGenerationError("");
    setSaveState("idle");
    setSaveError("");
    setSavedNotice("");
    detailController.current?.abort();
    detailRevision.current++;
    setDetail(undefined);
    setDetailTarget("");
    setDetailLoading(false);
    setDetailError("");
    setAnswers({});
    setAttempt(undefined);
    setAttemptState("idle");
    setAttemptPending(undefined);
    setAttemptError("");
    setQuizBusy(false);
  }

  async function generate() {
    if (
      !selectedDocument ||
      actionLock.current ||
      !principal ||
      searchPrincipalChanged ||
      saveState === "unknown" ||
      saveState === "saving" ||
      saveState === "reconciling"
    )
      return;
    actionLock.current = true;
    const epoch = lifecycle.current;
    const sourceEpoch = selectedRevision.current;
    const sourceId = selectedDocument.id;
    const owner = identity;
    setGenerationState("generating");
    setGenerationError("");
    setDraft(undefined);
    setSaveState("idle");
    setSaveError("");
    setSavedNotice("");
    try {
      const value = await api.generateStudyQuiz({
        documentId: sourceId,
        language,
        questionCount,
      });
      if (
        epoch !== lifecycle.current ||
        sourceEpoch !== selectedRevision.current ||
        owner !== identityRef.current
      ) {
        // The bounded server draft expires automatically; never attach an old response to a new principal/source.
        return;
      }
      if (
        value.documentId !== sourceId ||
        selectedDocumentRef.current?.id !== sourceId
      )
        throw new Error("Bản nháp không khớp tài liệu đang chọn.");
      setDraft(value);
      setGenerationState("preview");
      setSaveState("preview");
    } catch (error) {
      if (epoch !== lifecycle.current || owner !== identityRef.current) return;
      setGenerationError(errorText(error));
      setGenerationState(isUnknownWrite(error) ? "unknown" : "idle");
    } finally {
      actionLock.current = false;
    }
  }

  async function confirmDraft() {
    if (
      !draft ||
      actionLock.current ||
      !principal ||
      searchPrincipalChanged ||
      (saveState !== "preview" && saveState !== "reconciled-draft")
    )
      return;
    actionLock.current = true;
    const epoch = lifecycle.current;
    const sourceEpoch = selectedRevision.current;
    const owner = identity;
    setSaveState("saving");
    setSaveError("");
    try {
      const saved = await api.confirmStudyQuiz(draft.draftId, {
        draftToken: draft.draftToken,
      });
      if (
        epoch !== lifecycle.current ||
        sourceEpoch !== selectedRevision.current ||
        owner !== identityRef.current
      )
        return;
      setDraft(undefined);
      setSaveState("confirmed");
      setSavedNotice(`Đã lưu quiz “${saved.title}”.`);
      setQuizPage(1);
      setDetail(undefined);
      setQuizRefresh((value) => value + 1);
    } catch (error) {
      if (
        epoch !== lifecycle.current ||
        sourceEpoch !== selectedRevision.current ||
        owner !== identityRef.current
      )
        return;
      setSaveError(errorText(error));
      setSaveState(isUnknownWrite(error) ? "unknown" : "failed");
    } finally {
      actionLock.current = false;
    }
  }

  async function reconcileDraft() {
    if (
      !draft ||
      actionLock.current ||
      identity !== identityRef.current ||
      saveState !== "unknown"
    )
      return;
    actionLock.current = true;
    setSaveState("reconciling");
    const epoch = lifecycle.current;
    const sourceEpoch = selectedRevision.current;
    try {
      const result = await api.reconcileStudyQuizDraft(
        draft.draftId,
        draft.draftToken,
      );
      if (
        epoch !== lifecycle.current ||
        sourceEpoch !== selectedRevision.current ||
        identity !== identityRef.current
      )
        return;
      if (result.status === "confirmed") {
        setDraft(undefined);
        setSaveState("confirmed");
        setSaveError("");
        setSavedNotice(`Đã lưu quiz “${result.quiz.title}”.`);
        setQuizPage(1);
        setQuizRefresh((value) => value + 1);
      } else if (result.status === "draft") {
        setDraft((current) =>
          current?.draftId === result.draft.draftId
            ? { ...current, ...result.draft }
            : current,
        );
        setSaveState("reconciled-draft");
        setSaveError(
          "Máy chủ xác nhận quiz vẫn là bản nháp. Bạn có thể xác nhận lưu lại bằng thao tác riêng.",
        );
      } else {
        setDraft(undefined);
        setGenerationState("idle");
        setSaveState(result.status);
        setSaveError(
          result.status === "expired"
            ? "Bản nháp đã hết hạn. Hãy chủ động tạo bản xem trước mới."
            : "Bản nháp không còn khả dụng.",
        );
      }
    } catch (error) {
      if (
        epoch === lifecycle.current &&
        sourceEpoch === selectedRevision.current &&
        identity === identityRef.current
      ) {
        setSaveError(errorText(error));
        setSaveState("unknown");
      }
    } finally {
      actionLock.current = false;
    }
  }

  async function cancelDraft() {
    if (
      !draft ||
      actionLock.current ||
      (saveState !== "preview" &&
        saveState !== "reconciled-draft" &&
        saveState !== "failed")
    )
      return;
    actionLock.current = true;
    const epoch = lifecycle.current;
    const sourceEpoch = selectedRevision.current;
    try {
      await api.cancelStudyQuizDraft(draft.draftId, {
        draftToken: draft.draftToken,
      });
      if (
        epoch !== lifecycle.current ||
        sourceEpoch !== selectedRevision.current
      )
        return;
      setDraft(undefined);
      setGenerationState("idle");
      setSaveState("idle");
      setSaveError("");
    } catch (error) {
      if (
        epoch === lifecycle.current &&
        sourceEpoch === selectedRevision.current
      ) {
        setSaveError(errorText(error));
        if (isUnknownWrite(error)) setSaveState("unknown");
      }
    } finally {
      actionLock.current = false;
    }
  }

  async function openQuiz(id: string) {
    if (
      searchPrincipalChanged ||
      attemptActionLock.current ||
      attemptState === "unknown" ||
      attemptState === "sending"
    )
      return;
    const revision = ++detailRevision.current;
    const epoch = lifecycle.current;
    const owner = identity;
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setDetail(undefined);
    setDetailTarget(id);
    setAnswers({});
    setAttempt(undefined);
    setAttemptState("idle");
    setAttemptPending(undefined);
    setAttemptError("");
    setQuizBusy(false);
    setDetailLoading(true);
    setDetailError("");
    try {
      const value = await api.getStudyQuiz(id, controller.signal);
      if (
        revision === detailRevision.current &&
        epoch === lifecycle.current &&
        owner === identityRef.current
      )
        setDetail(value);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        revision === detailRevision.current &&
        epoch === lifecycle.current &&
        owner === identityRef.current
      )
        setDetailError(errorText(error));
    } finally {
      if (revision === detailRevision.current && epoch === lifecycle.current)
        setDetailLoading(false);
    }
  }

  async function deleteQuiz(quiz: StudyQuizSummary) {
    if (
      attemptActionLock.current ||
      attemptState === "unknown" ||
      attemptState === "sending"
    )
      return;
    if (
      !window.confirm(
        `Xóa quiz “${quiz.title}” và lịch sử làm bài của riêng bạn?`,
      )
    )
      return;
    const epoch = lifecycle.current;
    setQuizBusy(true);
    try {
      await api.deleteStudyQuiz(quiz.id);
      if (epoch !== lifecycle.current) return;
      if (detail?.quiz.id === quiz.id || detailTarget === quiz.id) {
        detailRevision.current++;
        detailController.current?.abort();
        setDetail(undefined);
        setDetailTarget("");
        setDetailLoading(false);
        setDetailError("");
        setAnswers({});
        setAttempt(undefined);
        setAttemptState("idle");
        setAttemptPending(undefined);
        setAttemptError("");
      }
      setQuizPage((current) =>
        current > 1 && (quizList?.items.length ?? 0) === 1
          ? current - 1
          : current,
      );
      setQuizRefresh((value) => value + 1);
    } catch (error) {
      if (epoch === lifecycle.current) setQuizListError(errorText(error));
    } finally {
      if (epoch === lifecycle.current) setQuizBusy(false);
    }
  }

  function buildAttempt() {
    if (
      !detail ||
      !!attemptPending ||
      searchPrincipalChanged ||
      attemptActionLock.current ||
      attemptState === "unknown" ||
      attemptState === "sending"
    )
      return;
    const payload = {
      attemptKey: crypto.randomUUID(),
      answers: detail.questions.map((question) => ({
        questionId: question.id,
        selectedIndex: answers[question.id],
      })),
    };
    setAttemptPending({
      quizId: detail.quiz.id,
      key: payload.attemptKey,
      payload,
    });
    setAttemptState("prepared");
  }

  async function submitAttempt() {
    if (
      !detail ||
      !attemptPending ||
      quizBusy ||
      attemptActionLock.current ||
      searchPrincipalChanged ||
      attemptPending.quizId !== detail.quiz.id ||
      attemptPending.key !== attemptPending.payload.attemptKey ||
      (attemptState !== "prepared" && attemptState !== "unknown")
    )
      return;
    attemptActionLock.current = true;
    const epoch = lifecycle.current;
    const revision = detailRevision.current;
    const quizId = detail.quiz.id;
    setQuizBusy(true);
    setAttemptState("sending");
    setAttemptError("");
    try {
      const result = await api.submitStudyQuiz(
        attemptPending.quizId,
        attemptPending.payload,
      );
      if (
        epoch !== lifecycle.current ||
        revision !== detailRevision.current ||
        identity !== identityRef.current
      )
        return;
      setAttempt(result);
      setAttemptState("confirmed");
      setAttemptPending(undefined);
      setDetail((current) =>
        current?.quiz.id === quizId
          ? {
              ...current,
              quiz: { ...current.quiz, progress: result.progress },
            }
          : current,
      );
      setQuizRefresh((value) => value + 1);
    } catch (error) {
      if (
        epoch === lifecycle.current &&
        revision === detailRevision.current &&
        identity === identityRef.current
      ) {
        setAttemptError(errorText(error));
        setAttemptState(isUnknownWrite(error) ? "unknown" : "failed");
      }
    } finally {
      attemptActionLock.current = false;
      if (epoch === lifecycle.current && revision === detailRevision.current)
        setQuizBusy(false);
    }
  }

  function returnToQuestions() {
    if (
      attemptActionLock.current ||
      (attemptState !== "prepared" && attemptState !== "failed")
    )
      return;
    setAttemptPending(undefined);
    setAttemptError("");
    setAttemptState("idle");
  }

  return (
    <section className="study-coach-layout" aria-labelledby="study-coach-title">
      <header className="study-coach-header">
        <h2 id="study-coach-title">Study Coach · Quiz</h2>
        <p>
          Tạo câu hỏi từ bằng chứng đã lập chỉ mục trong tài liệu bạn có thể
          đọc. Quiz không cam kết bao phủ toàn bộ PDF.
        </p>
      </header>

      <section className="panel" aria-labelledby="quiz-create-title">
        <h3 id="quiz-create-title">Tạo quiz từ tài liệu</h3>
        {!focusId && (
          <>
            <label htmlFor="study-quiz-document-search">
              Tìm tài liệu đã sẵn sàng
            </label>
            <input
              id="study-quiz-document-search"
              type="search"
              value={documentInput}
              maxLength={120}
              onChange={(event) => {
                setDocumentInput(event.target.value);
                setDocumentPage(1);
              }}
              placeholder="Tên tài liệu hoặc môn học"
            />
            <div
              className="study-quiz-document-picker"
              aria-busy={documentLoading}
            >
              {documentSearchPending ? (
                <p role="status">Đang cập nhật tìm kiếm tài liệu…</p>
              ) : documentLoading ? (
                <p role="status">Đang tải tài liệu…</p>
              ) : documentError ? (
                <p role="alert">{documentError}</p>
              ) : documentInput.trim().length === 1 ? (
                <p role="status">
                  Nhập ít nhất hai ký tự để tìm tài liệu, hoặc xóa ô tìm kiếm để
                  duyệt.
                </p>
              ) : (
                <>
                  <label htmlFor="study-quiz-document">Tài liệu</label>
                  <select
                    id="study-quiz-document"
                    value={visibleSelectedDocument?.id ?? ""}
                    disabled={
                      saveState === "unknown" ||
                      saveState === "saving" ||
                      saveState === "reconciling" ||
                      attemptState === "unknown" ||
                      attemptState === "sending"
                    }
                    onChange={(event) => {
                      const item = visibleDocumentResults?.items.find(
                        (document) => document.id === event.target.value,
                      );
                      if (item) selectDocument(item);
                    }}
                  >
                    <option value="">Chọn tài liệu đã lập chỉ mục</option>
                    {visibleDocumentResults?.items
                      .filter(
                        (item) =>
                          item.storage_status === "stored" &&
                          item.processing_status === "ready",
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                  {visibleDocumentResults && (
                    <div className="study-coach-pagination">
                      <span>
                        {visibleDocumentResults.total} tài liệu sẵn sàng
                      </span>
                      <button
                        type="button"
                        disabled={documentLoading || documentPage <= 1}
                        onClick={() =>
                          setDocumentPage((page) => Math.max(1, page - 1))
                        }
                      >
                        Trước
                      </button>
                      <span>
                        Trang {documentPage} /{" "}
                        {visibleDocumentResults.totalPages || 1}
                      </span>
                      <button
                        type="button"
                        disabled={
                          documentLoading ||
                          documentPage >= visibleDocumentResults.totalPages
                        }
                        onClick={() => setDocumentPage((page) => page + 1)}
                      >
                        Sau
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
        {focusId && (
          <p aria-live="polite">
            {documentLoading ? (
              "Đang kiểm tra tài liệu…"
            ) : documentError ? (
              <span role="alert">{documentError}</span>
            ) : visibleSelectedDocument ? (
              `Tài liệu: ${visibleSelectedDocument.name}`
            ) : (
              "Chọn một tài liệu đã lập chỉ mục từ Documents."
            )}
          </p>
        )}
        {visibleSelectedDocument && (
          <p className="study-coach-selected-source">
            Nguồn: {visibleSelectedDocument.name} · Chỉ tài liệu stored/ready
            được dùng.
          </p>
        )}
        {documentError && !focusId && (
          <button
            type="button"
            onClick={() => {
              setDocumentError("");
              setDocumentRefresh((value) => value + 1);
            }}
          >
            Thử tải danh sách lại
          </button>
        )}
        <div className="study-coach-controls">
          <label>
            Ngôn ngữ
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as "vi" | "en")
              }
              disabled={generationState === "generating"}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Số câu
            <select
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              disabled={generationState === "generating"}
            >
              {[3, 5, 7, 10].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={
              !visibleSelectedDocument ||
              documentLoading ||
              generationState === "generating" ||
              saveState === "saving" ||
              saveState === "unknown" ||
              saveState === "reconciling"
            }
            onClick={() => void generate()}
          >
            {generationState === "generating"
              ? "Đang tạo bản xem trước…"
              : draft
                ? "Tạo bản xem trước mới"
                : "Tạo bản xem trước"}
          </button>
        </div>
        {generationError && (
          <p role="alert">
            {generationError}
            {generationState === "unknown" &&
              " Yêu cầu có thể đã hoàn tất ở máy chủ; không có lần gọi AI nào được tự gửi lại."}
          </p>
        )}
        {generationState === "unknown" && (
          <button
            type="button"
            onClick={() => {
              setGenerationState("idle");
              setGenerationError("");
            }}
          >
            Đã hiểu — chủ động tạo yêu cầu mới
          </button>
        )}
        {draft && generationState === "preview" && (
          <div
            className="study-quiz-preview"
            aria-labelledby="quiz-preview-title"
          >
            <h4 id="quiz-preview-title">Bản xem trước · chưa được lưu</h4>
            <p>
              {draft.quiz.title} · Hết hạn{" "}
              {new Date(draft.expiresAt).toLocaleString()}
            </p>
            <ol>
              {draft.quiz.questions.map((question, index) => (
                <li key={question.id}>
                  <strong>{question.question}</strong>
                  <ol type="A">
                    {question.options.map((option, optionIndex) => (
                      <li key={`${question.id}-${optionIndex}`}>
                        {option}
                        {optionIndex === question.correctIndex &&
                          " · Đáp án đúng"}
                      </li>
                    ))}
                  </ol>
                  <p>{question.explanation}</p>
                  <p>
                    Nguồn:{" "}
                    {question.sourceIds.map((sourceId) => {
                      const source = draft.quiz.sources.find(
                        (item) => item.sourceId === sourceId,
                      );
                      return source ? (
                        <a
                          key={sourceId}
                          href={`#documents/${encodeURIComponent(source.documentId)}`}
                        >
                          {source.title}
                          {source.page ? ` · trang ${source.page}` : ""}
                        </a>
                      ) : (
                        <span key={sourceId}>Nguồn không khả dụng</span>
                      );
                    })}
                  </p>
                  <span className="sr-only">Câu {index + 1}</span>
                </li>
              ))}
            </ol>
            <div className="study-coach-controls">
              <button
                type="button"
                className="primary-button"
                disabled={
                  saveState !== "preview" && saveState !== "reconciled-draft"
                }
                onClick={() => void confirmDraft()}
              >
                {saveState === "saving" || saveState === "reconciling"
                  ? "Đang kiểm tra/lưu…"
                  : "Xác nhận lưu quiz"}
              </button>
              <button
                type="button"
                disabled={
                  saveState !== "preview" &&
                  saveState !== "reconciled-draft" &&
                  saveState !== "failed"
                }
                onClick={() => void cancelDraft()}
              >
                Hủy bản xem trước
              </button>
            </div>
            {saveError && <p role="alert">{saveError}</p>}
            {saveState === "unknown" && (
              <button type="button" onClick={() => void reconcileDraft()}>
                Kiểm tra trạng thái lưu
              </button>
            )}
            {saveState === "reconciling" && (
              <p role="status">Đang đối chiếu trạng thái bản nháp…</p>
            )}
          </div>
        )}
        {saveError && !draft && <p role="alert">{saveError}</p>}
        {savedNotice && <p role="status">{savedNotice}</p>}
      </section>

      <section className="panel" aria-labelledby="saved-quizzes-title">
        <header>
          <h3 id="saved-quizzes-title">Quiz đã lưu của tôi</h3>
          <span>
            {quizListLoading ? "…" : `${quizList?.total ?? 0} bộ quiz`}
          </span>
          <button
            type="button"
            disabled={quizListLoading}
            onClick={() => {
              setQuizListError("");
              setQuizRefresh((value) => value + 1);
            }}
          >
            Tải lại danh sách
          </button>
        </header>
        {quizListLoading ? (
          <p role="status">Đang tải quiz…</p>
        ) : quizListError ? (
          <div role="alert">
            <p>{quizListError}</p>
            <button
              type="button"
              onClick={() => setQuizRefresh((value) => value + 1)}
            >
              Thử lại danh sách
            </button>
          </div>
        ) : quizList?.items.length ? (
          <>
            <ul className="study-coach-quiz-list">
              {quizList.items.map((quiz) => (
                <li key={quiz.id}>
                  <div>
                    <strong>{quiz.title}</strong>
                    <p>
                      {quiz.documentTitle} · {quiz.questionCount} câu ·{" "}
                      {quiz.progress.attempts} lượt · gần nhất{" "}
                      {quiz.progress.latestScore ?? "—"}% · cao nhất{" "}
                      {quiz.progress.bestScore ?? "—"}%
                    </p>
                    <p>
                      {quiz.sourceAvailable
                        ? "Nguồn hiện còn khả dụng"
                        : "Nguồn không còn khả dụng; nội dung quiz đã lưu vẫn giữ nguyên."}
                    </p>
                  </div>
                  <div className="study-coach-controls">
                    <button
                      type="button"
                      disabled={
                        attemptState === "unknown" ||
                        attemptState === "sending" ||
                        attemptActionLock.current
                      }
                      onClick={() => void openQuiz(quiz.id)}
                    >
                      Mở và luyện tập
                    </button>
                    <button
                      type="button"
                      disabled={
                        quizBusy ||
                        attemptState === "unknown" ||
                        attemptState === "sending"
                      }
                      onClick={() => void deleteQuiz(quiz)}
                    >
                      Xóa quiz
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="study-coach-pagination">
              <button
                type="button"
                disabled={quizPage <= 1 || quizListLoading}
                onClick={() => setQuizPage((page) => Math.max(1, page - 1))}
              >
                Trước
              </button>
              <span>
                Trang {quizPage} / {quizList.totalPages}
              </span>
              <button
                type="button"
                disabled={quizPage >= quizList.totalPages || quizListLoading}
                onClick={() => setQuizPage((page) => page + 1)}
              >
                Sau
              </button>
            </div>
          </>
        ) : (
          <p>
            Chưa có quiz đã lưu. Hãy tạo bản xem trước từ một tài liệu đã lập
            chỉ mục.
          </p>
        )}
      </section>

      {(detailLoading || detailError || detail) && (
        <section
          className="panel study-quiz-practice"
          aria-labelledby="quiz-practice-title"
        >
          <h3 id="quiz-practice-title">Luyện tập</h3>
          {detailLoading ? (
            <p role="status">Đang mở quiz…</p>
          ) : detailError ? (
            <div role="alert">
              <p>{detailError}</p>
              <button
                type="button"
                onClick={() => detailTarget && void openQuiz(detailTarget)}
              >
                Thử mở lại
              </button>
            </div>
          ) : (
            detail && (
              <>
                <h4>{detail.quiz.title}</h4>
                <p>
                  {detail.quiz.questionCount} câu ·{" "}
                  {detail.quiz.progress.attempts} lượt · gần nhất{" "}
                  {detail.quiz.progress.latestScore ?? "—"}% · cao nhất{" "}
                  {detail.quiz.progress.bestScore ?? "—"}%
                </p>
                {!detail.quiz.sourceAvailable && (
                  <p role="status">
                    Tài liệu nguồn hiện không khả dụng. Quiz snapshot vẫn có thể
                    luyện tập; liên kết nguồn cần quyền hiện tại.
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    buildAttempt();
                  }}
                >
                  <ol>
                    {detail.questions.map((question, index) => (
                      <li key={question.id}>
                        <fieldset>
                          <legend>
                            {index + 1}. {question.question}
                          </legend>
                          {question.options.map((option, optionIndex) => (
                            <label key={`${question.id}-${optionIndex}`}>
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={optionIndex}
                                checked={answers[question.id] === optionIndex}
                                onChange={() =>
                                  setAnswers((value) => ({
                                    ...value,
                                    [question.id]: optionIndex,
                                  }))
                                }
                                disabled={
                                  !!attempt || !!attemptPending || quizBusy
                                }
                              />{" "}
                              {option}
                            </label>
                          ))}
                        </fieldset>
                        {question.sourceIds.map((sourceId) => {
                          const source = detail.sources.find(
                            (item) => item.sourceId === sourceId,
                          );
                          return source ? (
                            <p key={sourceId}>
                              Nguồn:{" "}
                              {source.available ? (
                                <a
                                  href={`#documents/${encodeURIComponent(source.documentId)}`}
                                >
                                  {source.title}
                                  {source.page ? ` · trang ${source.page}` : ""}
                                </a>
                              ) : (
                                `${source.title} · nguồn không còn khả dụng`
                              )}
                            </p>
                          ) : null;
                        })}
                      </li>
                    ))}
                  </ol>
                  {!attempt && (
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={
                        quizBusy ||
                        !!attemptPending ||
                        detail.questions.some(
                          (question) => answers[question.id] === undefined,
                        )
                      }
                    >
                      Kiểm tra đáp án
                    </button>
                  )}
                </form>
                {attemptPending && !attempt && (
                  <div role="group" aria-label="Xác nhận nộp bài">
                    {attemptState === "prepared" && (
                      <p>Kiểm tra câu trả lời trước khi nộp.</p>
                    )}
                    {attemptState === "unknown" && (
                      <p role="status">
                        Kết quả lượt này chưa rõ. Quiz, mã lượt và câu trả lời
                        được giữ nguyên; gửi lại chỉ đối chiếu cùng lượt.
                      </p>
                    )}
                    {attemptError && <p role="alert">{attemptError}</p>}
                    {(attemptState === "prepared" ||
                      attemptState === "unknown") && (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={quizBusy}
                        onClick={() => void submitAttempt()}
                      >
                        {quizBusy
                          ? "Đang chấm…"
                          : attemptState === "unknown"
                            ? "Gửi lại cùng lượt"
                            : "Nộp bài"}
                      </button>
                    )}
                    {(attemptState === "prepared" ||
                      attemptState === "failed") && (
                      <button
                        type="button"
                        onClick={returnToQuestions}
                        disabled={quizBusy}
                      >
                        Quay lại câu hỏi
                      </button>
                    )}
                  </div>
                )}
                {attempt && (
                  <section role="status" aria-label="Kết quả lượt làm">
                    <h4>
                      Kết quả: {attempt.correctCount}/{attempt.questionCount} ·{" "}
                      {attempt.scorePercent}%
                    </h4>
                    <ol>
                      {detail.questions.map((question) => {
                        const result = attempt.answers.find(
                          (answer) => answer.questionId === question.id,
                        );
                        return (
                          <li key={question.id}>
                            <strong>{question.question}</strong>
                            <p>
                              Đáp án:{" "}
                              {question.options[result?.correctIndex ?? 0]}
                            </p>
                            <p>
                              {result?.correct
                                ? "Chính xác."
                                : "Chưa chính xác."}{" "}
                              {result?.explanation}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                    <button
                      type="button"
                      onClick={() => {
                        setAttempt(undefined);
                        setAttemptPending(undefined);
                        setAttemptState("idle");
                        setAttemptError("");
                        setAnswers({});
                      }}
                    >
                      Làm lại
                    </button>
                  </section>
                )}
              </>
            )
          )}
        </section>
      )}
    </section>
  );
}
