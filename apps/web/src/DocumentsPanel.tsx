import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  CircleStackIcon,
  DocumentArrowUpIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { DocumentCard } from "./DocumentCard";
import { useCourses } from "./use-courses";
import {
  api,
  ApiError,
  type DocumentSearchQuery,
  type StoredDocument,
} from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
interface LocalDocument {
  id: string;
  file: File;
  state: "selected" | "uploading" | "failed";
  error?: string;
}
type FocusLookup = {
  key: string;
  status: "loading" | "ready" | "unavailable" | "error";
  document?: StoredDocument;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Operation failed. Please retry.";

export function DocumentsPanel({
  onDocumentsChanged,
  focusId,
}: {
  onDocumentsChanged?: () => void;
  focusId?: string;
}) {
  const principal = useContext(PilotPrincipalContext);
  const canWrite =
    principal?.role === "member" || principal?.role === "manager";
  const canDelete = principal?.role === "manager";
  // Confirm dialogs can outlive a role update. Keep the action boundary tied
  // to the latest verified session, not the role captured by an old click.
  const permissions = useRef({ canWrite, canDelete });
  useEffect(() => {
    permissions.current = { canWrite, canDelete };
  }, [canWrite, canDelete]);
  const courses = useCourses();
  // The subject chosen for the next upload, and the subject the list is
  // filtered by. Deliberately separate: filing a new PDF under Maths should
  // not silently hide every other subject from view.
  const [uploadCourseId, setUploadCourseId] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [storageFilter, setStorageFilter] = useState<
    NonNullable<DocumentSearchQuery["storage_status"]> | ""
  >("");
  const [processingFilter, setProcessingFilter] = useState<
    NonNullable<DocumentSearchQuery["processing_status"]> | ""
  >("");
  const [sort, setSort] = useState<DocumentSearchQuery["sort"]>("created_at");
  const [direction, setDirection] =
    useState<NonNullable<DocumentSearchQuery["direction"]>>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selected, setSelected] = useState<LocalDocument[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const busy = useRef(new Set<string>());
  const revision = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const notifyAssistantAfterRead = useRef(false);
  const lifetime = useRef(0);
  const identity = `${principal?.userId ?? ""}:${principal?.workspaceId ?? ""}`;
  const hasPrincipal = !!principal;
  // Synchronous identity check also covers a response resolving in the batch
  // before an old view's effect cleanup runs. PilotAccess normally remounts it.
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focusKey = focusId ? `${identity}:${focusId}` : "";
  const focusKeyRef = useRef(focusKey);
  focusKeyRef.current = focusKey;
  const focusRevision = useRef(0);
  const focusController = useRef<AbortController | null>(null);
  const searchArgs = useMemo<DocumentSearchQuery>(
    () => ({
      q: searchQuery || undefined,
      course: filterCourseId === "none" ? "unassigned" : filterCourseId,
      storage_status: storageFilter || undefined,
      processing_status: processingFilter || undefined,
      sort,
      direction,
      page,
      pageSize,
    }),
    [
      direction,
      filterCourseId,
      page,
      pageSize,
      processingFilter,
      searchQuery,
      sort,
      storageFilter,
    ],
  );
  const queryKey = JSON.stringify(searchArgs);
  const currentReadKey = `${identity}:${queryKey}`;
  const currentReadKeyRef = useRef(currentReadKey);
  currentReadKeyRef.current = currentReadKey;
  const searchPending = searchInput.trim() !== searchQuery;
  const readPending = loading || searchPending || loadedKey !== currentReadKey;
  const onDocumentsChangedRef = useRef(onDocumentsChanged);
  onDocumentsChangedRef.current = onDocumentsChanged;
  const visibleDocuments = readPending ? [] : documents;
  const visibleTotal = readPending ? 0 : total;
  const visibleTotalPages = readPending ? 0 : totalPages;
  const operations = useRef(new Map<string, number>());
  const unconfirmed = useRef(new Set<string>());
  const [indexReads, setIndexReads] = useState<
    Record<string, { denied: boolean }>
  >({});
  const [indexErrors, setIndexErrors] = useState<Record<string, string>>({});
  const [focusLookup, setFocusLookup] = useState<FocusLookup | null>(null);
  const [focusRetryVersion, setFocusRetryVersion] = useState(0);
  const pageContainsFocus =
    !!focusId && !readPending && documents.some((item) => item.id === focusId);
  useEffect(() => {
    if (!canWrite) {
      setSelected([]);
      setUploadCourseId("");
      setNotice("");
    }
  }, [canWrite]);
  const reload = useCallback((notifyAssistant = false) => {
    if (notifyAssistant) notifyAssistantAfterRead.current = true;
    setLoadedKey("");
    setRefreshVersion((value) => value + 1);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    busy.current.clear();
    operations.current.clear();
    unconfirmed.current.clear();
    setBusyIds([]);
    setIndexReads({});
    setIndexErrors({});
    setDocuments([]);
    setTotal(0);
    setTotalPages(0);
    setError("");
    setListError("");
    setSelected([]);
    setUploadCourseId("");
    readController.current?.abort();
    return () => {
      revision.current++;
      lifetime.current++;
      readController.current?.abort();
    };
  }, [identity]);
  useEffect(() => {
    const current = ++revision.current;
    const owner = identity;
    const key = currentReadKey;
    const controller = new AbortController();
    readController.current?.abort();
    readController.current = controller;
    setLoading(true);
    setListError("");
    void api
      .searchDocuments(searchArgs, controller.signal)
      .then((result) => {
        if (
          current === revision.current &&
          owner === currentIdentity.current &&
          key === currentReadKeyRef.current
        ) {
          setDocuments(result.items);
          setTotal(result.total);
          setTotalPages(result.totalPages);
          setLoadedKey(key);
          if (notifyAssistantAfterRead.current) {
            notifyAssistantAfterRead.current = false;
            onDocumentsChangedRef.current?.();
          }
        }
      })
      .catch((caught: unknown) => {
        if (
          !controller.signal.aborted &&
          current === revision.current &&
          owner === currentIdentity.current &&
          key === currentReadKeyRef.current
        )
          setListError(message(caught));
      })
      .finally(() => {
        if (
          current === revision.current &&
          owner === currentIdentity.current &&
          key === currentReadKeyRef.current
        )
          setLoading(false);
      });
    return () => {
      controller.abort();
      if (readController.current === controller) readController.current = null;
      if (current === revision.current) revision.current++;
    };
  }, [
    currentReadKey,
    direction,
    filterCourseId,
    identity,
    page,
    pageSize,
    processingFilter,
    refreshVersion,
    searchArgs,
    sort,
    storageFilter,
  ]);
  useEffect(() => {
    const revisionAtStart = ++focusRevision.current;
    const key = focusKey;
    const owner = identity;
    focusController.current?.abort();
    focusController.current = null;
    if (!focusId || !hasPrincipal) {
      setFocusLookup(null);
      return;
    }
    if (readPending && !listError) {
      setFocusLookup({ key, status: "loading" });
      return;
    }
    if (!listError && pageContainsFocus) {
      // The active result page already supplies the focus target. Do not
      // duplicate its card or alter the page's count/items.
      setFocusLookup(null);
      return;
    }

    const controller = new AbortController();
    focusController.current = controller;
    setFocusLookup({ key, status: "loading" });
    const isCurrent = () =>
      revisionAtStart === focusRevision.current &&
      owner === currentIdentity.current &&
      key === focusKeyRef.current &&
      !controller.signal.aborted;
    void api
      .getDocument(focusId, controller.signal)
      .then((result) => {
        if (isCurrent())
          setFocusLookup(
            result.id === focusId
              ? { key, status: "ready", document: result }
              : { key, status: "unavailable" },
          );
      })
      .catch((caught: unknown) => {
        if (!isCurrent()) return;
        setFocusLookup({
          key,
          status:
            caught instanceof ApiError &&
            [400, 401, 403, 404].includes(caught.status)
              ? "unavailable"
              : "error",
        });
      });
    return () => {
      controller.abort();
      if (focusController.current === controller)
        focusController.current = null;
      if (revisionAtStart === focusRevision.current) focusRevision.current++;
    };
  }, [
    focusId,
    focusKey,
    focusRetryVersion,
    identity,
    listError,
    pageContainsFocus,
    hasPrincipal,
    readPending,
    refreshVersion,
  ]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!permissions.current.canWrite) {
      event.currentTarget.value = "";
      return;
    }
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setError("");
    setNotice("");
    const invalid = files.find(
      (file) =>
        !/\.pdf$/i.test(file.name) ||
        file.type !== "application/pdf" ||
        file.size > MAX_FILE_SIZE,
    );
    if (invalid) {
      setError(
        `${invalid.name}: Only PDF files are accepted, up to 10 MiB each.`,
      );
      return;
    }
    const seen = new Set(selected.map((item) => item.id));
    const added: LocalDocument[] = [];
    let duplicates = 0;
    for (const file of files) {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (seen.has(id)) {
        duplicates++;
        continue;
      }
      seen.add(id);
      added.push({ id, file, state: "selected" });
    }
    setSelected((current) => [...current, ...added]);
    setNotice(
      !added.length && duplicates
        ? "That PDF is already in the list."
        : `${added.length} PDF selected.${duplicates ? ` ${duplicates} already in the list was skipped.` : ""}`,
    );
  }
  function begin(id: string) {
    if (busy.current.has(id)) return false;
    busy.current.add(id);
    operations.current.set(id, (operations.current.get(id) ?? 0) + 1);
    setBusyIds([...busy.current]);
    readController.current?.abort();
    revision.current++;
    setLoading(false);
    setNotice("");
    setError("");
    return true;
  }
  function finish(id: string) {
    busy.current.delete(id);
    setBusyIds([...busy.current]);
  }
  async function upload(item: LocalDocument) {
    if (!permissions.current.canWrite) return;
    if (!begin(item.id)) return;
    const isCurrent = operationToken(item.id);
    setSelected((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, state: "uploading", error: undefined }
          : row,
      ),
    );
    try {
      const stored = await api.uploadDocument(
        item.file,
        uploadCourseId || undefined,
      );
      if (!isCurrent()) return;
      setSelected((current) => current.filter((row) => row.id !== item.id));
      setNotice(`${stored.name} stored successfully.`);
    } catch (caught) {
      if (!isCurrent()) return;
      setSelected((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, state: "failed", error: message(caught) }
            : row,
        ),
      );
    } finally {
      if (isCurrent()) {
        finish(item.id);
        reload();
        onDocumentsChanged?.();
      }
    }
  }

  async function refile(item: StoredDocument, courseId: string | null) {
    if (!permissions.current.canWrite) return;
    if (!begin(item.id)) return;
    const isCurrent = operationToken(item.id);
    try {
      const updated = await api.setDocumentCourse(item.id, courseId);
      if (!isCurrent()) return;
      setDocuments((current) =>
        current.map((row) => (row.id === item.id ? updated : row)),
      );
      setNotice(
        updated.course_name
          ? `Đã chuyển "${updated.name}" sang ${updated.course_name}.`
          : `Đã gỡ "${updated.name}" khỏi môn học.`,
      );
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Chưa đổi được môn cho tài liệu này.",
      );
    } finally {
      if (isCurrent()) {
        finish(item.id);
        reload();
        onDocumentsChanged?.();
      }
    }
  }

  function operationToken(id: string) {
    const epoch = lifetime.current,
      owner = identity,
      operation = operations.current.get(id);
    return () =>
      epoch === lifetime.current &&
      owner === currentIdentity.current &&
      operation === operations.current.get(id);
  }
  function confirmIndex(id: string) {
    unconfirmed.current.delete(id);
    setIndexReads((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  async function reconcileIndex(
    id: string,
    isCurrent: () => boolean,
    requestError: string,
  ) {
    if (!isCurrent() || !principal) return;
    try {
      const result = await api.getDocument(id);
      if (!isCurrent()) return;
      // Never append: an inaccessible/deleted row cannot be resurrected by GET.
      setDocuments((current) =>
        current.map((row) => (row.id === id ? result : row)),
      );
      updateFocusedDocument(result);
      confirmIndex(id);
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ApiError && cause.status === 404) {
        // The card (and its local error) disappears; keep the rejected POST
        // visible without revealing anything about the inaccessible document.
        setError(requestError);
        setDocuments((current) => current.filter((row) => row.id !== id));
        setFocusLookup((current) =>
          current?.key === focusKey && current.document?.id === id
            ? { key: current.key, status: "unavailable" }
            : current,
        );
        confirmIndex(id);
        return;
      }
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        setFocusLookup((current) =>
          current?.key === focusKey && current.document?.id === id
            ? { key: current.key, status: "unavailable" }
            : current,
        );
      setIndexReads((current) => ({
        ...current,
        [id]: {
          denied:
            cause instanceof ApiError && [401, 403].includes(cause.status),
        },
      }));
    }
  }
  async function checkIndex(id: string) {
    if (!unconfirmed.current.has(id) || indexReads[id]?.denied || !begin(id))
      return;
    const isCurrent = operationToken(id);
    try {
      await reconcileIndex(
        id,
        isCurrent,
        indexErrors[id] ?? "Yêu cầu lập chỉ mục trước đó chưa được xác nhận.",
      );
    } finally {
      if (isCurrent()) {
        finish(id);
        if (processingFilter || sort === "processing_status") reload();
        onDocumentsChanged?.();
      }
    }
  }
  async function process(item: StoredDocument) {
    if (!permissions.current.canWrite) return;
    if (unconfirmed.current.has(item.id)) return;
    if (!begin(item.id)) return;
    const isCurrent = operationToken(item.id);
    setIndexErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setDocuments((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, processing_status: "processing" } : row,
      ),
    );
    try {
      const result = await api.processDocument(item.id);
      if (!isCurrent()) return;
      setDocuments((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                processing_status: result.processing_status,
                index_quality: result.index_quality,
              }
            : row,
        ),
      );
      updateFocusedDocument({
        ...item,
        processing_status: result.processing_status,
        index_quality: result.index_quality,
      });
      setNotice(
        `Đã lập chỉ mục "${item.name}" thành ${result.chunk_count} đoạn để Assistant truy xuất.`,
      );
    } catch (cause) {
      if (!isCurrent()) return;
      unconfirmed.current.add(item.id);
      const denied =
        cause instanceof ApiError && [401, 403].includes(cause.status);
      setIndexReads((current) => ({ ...current, [item.id]: { denied } }));
      const requestError = `Yêu cầu lập chỉ mục trả lỗi: ${message(cause)} Trạng thái được đối chiếu riêng.`;
      setIndexErrors((current) => ({
        ...current,
        [item.id]: requestError,
      }));
      // One safe read only; no replay of an uncertain POST. Auth transport
      // already notifies the pilot gate on session/workspace denial.
      if (!denied) await reconcileIndex(item.id, isCurrent, requestError);
      else
        setFocusLookup((current) =>
          current?.key === focusKey && current.document?.id === item.id
            ? { key: current.key, status: "unavailable" }
            : current,
        );
    } finally {
      if (isCurrent()) {
        finish(item.id);
        if (processingFilter || sort === "processing_status") reload();
        onDocumentsChanged?.();
      }
    }
  }

  async function remove(item: StoredDocument) {
    if (!permissions.current.canDelete) return;
    if (
      !window.confirm(
        `Xoá "${item.name}" khỏi workspace và Storage? Tài liệu này sẽ không còn để xem hay hỏi nữa.`,
      )
    )
      return;
    if (!permissions.current.canDelete) return;
    if (!begin(item.id)) return;
    const wasOnlyVisibleOnPage = visibleDocuments.length === 1;
    const pageAtDelete = page;
    const isCurrent = operationToken(item.id);
    let deleted = false;
    try {
      await api.deleteDocument(item.id);
      if (!isCurrent()) return;
      deleted = true;
      setDocuments((current) => current.filter((row) => row.id !== item.id));
      setFocusLookup((current) =>
        current?.key === focusKey && current.document?.id === item.id
          ? { key: current.key, status: "unavailable" }
          : current,
      );
      setNotice(`${item.name} deleted.`);
    } catch (caught) {
      if (!isCurrent()) return;
      setError(
        `${message(caught)} Refresh the list and retry delete to finish any pending deletion.`,
      );
    } finally {
      if (isCurrent()) {
        finish(item.id);
        if (deleted && wasOnlyVisibleOnPage && pageAtDelete > 1)
          setPage(pageAtDelete - 1);
        else reload();
        onDocumentsChanged?.();
      }
    }
  }
  async function download(item: StoredDocument) {
    if (!begin(item.id)) return;
    const currentLifetime = lifetime.current;
    try {
      const { url } = await api.downloadDocument(item.id);
      // PilotAccess remounts the view when the verified account/workspace
      // changes. A link requested by the old view must not trigger a download
      // after that view has gone away.
      if (currentLifetime !== lifetime.current) return;
      const anchor = document.createElement("a");
      anchor.href = url;
      // The link asks Storage to send the file as an attachment, so the browser
      // saves it and the page stays where it is. No new tab: one opened after
      // an await can be refused by a popup blocker.
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (caught) {
      setError(message(caught));
    } finally {
      finish(item.id);
    }
  }
  function updateFocusedDocument(item: StoredDocument) {
    setFocusLookup((current) =>
      current?.key === focusKey &&
      current.status === "ready" &&
      current.document?.id === item.id
        ? { ...current, document: item }
        : current,
    );
  }
  function renderStoredDocument(item: StoredDocument) {
    return (
      <>
        <DocumentCard
          name={item.name}
          size={item.size_bytes}
          state={item.storage_status}
          busy={busyIds.includes(item.id)}
          processingStatus={item.processing_status ?? "pending"}
          indexQuality={item.index_quality}
          error={indexErrors[item.id]}
          indexUnconfirmed={!!indexReads[item.id]}
          onCheckStatus={
            indexReads[item.id] && !indexReads[item.id].denied
              ? () => void checkIndex(item.id)
              : undefined
          }
          onProcess={canWrite ? () => void process(item) : undefined}
          onCreateQuiz={
            item.storage_status === "stored" &&
            item.processing_status === "ready"
              ? () => {
                  window.location.hash = `#study-coach/${encodeURIComponent(item.id)}`;
                }
              : undefined
          }
          onDownload={() => void download(item)}
          onRemove={canDelete ? () => void remove(item) : undefined}
        />
        <label className="document-course">
          <span className="sr-only">Course for {item.name}</span>
          <select
            value={item.course_id ?? ""}
            disabled={!canWrite || busyIds.includes(item.id)}
            onChange={(event) => void refile(item, event.target.value || null)}
          >
            <option value="">Chưa gắn môn nào</option>
            {courses.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} ({course.code})
              </option>
            ))}
          </select>
        </label>
      </>
    );
  }
  const currentFocusLookup = focusLookup?.key === focusKey ? focusLookup : null;
  return (
    <section
      className="document-layout"
      aria-labelledby="document-library-title"
    >
      <section className="document-library">
        <header className="document-section-heading">
          <span className="document-heading-icon" aria-hidden="true">
            <DocumentTextIcon />
          </span>
          <span>
            <h2 id="document-library-title">Document library</h2>
            <p>Store and manage course and project PDFs.</p>
          </span>
        </header>
        <section className="upload-panel" aria-labelledby="upload-title">
          <DocumentArrowUpIcon aria-hidden="true" />
          <h3 id="upload-title">Add study documents</h3>
          <p id="upload-help">
            Choose PDF files up to 10 MiB each, then upload each selected file.
          </p>
          <label className="file-picker">
            Choose PDF files
            <input
              type="file"
              disabled={!canWrite}
              accept=".pdf,application/pdf"
              multiple
              aria-describedby="upload-help upload-boundary"
              onChange={selectFiles}
            />
          </label>
          <label className="upload-course">
            Save under course
            <select
              value={uploadCourseId}
              disabled={!canWrite}
              onChange={(event) => setUploadCourseId(event.target.value)}
            >
              <option value="">Không thuộc môn nào</option>
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.code})
                </option>
              ))}
            </select>
          </label>
          {!canWrite && (
            <p className="page-note">
              Bạn đang có quyền xem và tải tài liệu. Nhờ thành viên hoặc người
              quản lý tải lên, đổi môn hoặc lập chỉ mục giúp nhé. Chỉ người quản
              lý mới được xoá tài liệu đã lưu.
            </p>
          )}
          <p id="upload-boundary" className="upload-boundary">
            Uploaded PDFs are saved in private Storage with database metadata.
            Shared demo workspace · index documents for grounded answers.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </section>
        {canWrite && selected.length > 0 && (
          <section
            className="selected-documents"
            aria-label="Selected documents"
          >
            <header>
              <h3>Selected documents</h3>
              <span>{selected.length} local</span>
            </header>
            <ul>
              {selected.map((item) => (
                <li key={item.id}>
                  <DocumentCard
                    name={item.file.name}
                    size={item.file.size}
                    state={item.state}
                    error={item.error}
                    busy={busyIds.includes(item.id) || loading}
                    onUpload={() => void upload(item)}
                    onRemove={() =>
                      setSelected((current) =>
                        current.filter((row) => row.id !== item.id),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="selected-documents" aria-label="Stored documents">
          <header>
            <h3>Stored documents</h3>
            <span>
              {readPending || listError ? "…" : `${visibleTotal} results`}
            </span>
            <button
              type="button"
              disabled={
                loading ||
                searchPending ||
                (readPending && !listError) ||
                busyIds.length > 0
              }
              onClick={() => void reload(true)}
            >
              {listError ? "Retry list" : "Refresh list"}
            </button>
          </header>
          <div className="document-search-toolbar">
            <label className="document-search-field">
              Search documents
              <input
                type="search"
                value={searchInput}
                maxLength={120}
                placeholder="Name or course metadata"
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="document-query-field">
              Filter by course
              <select
                value={filterCourseId}
                onChange={(event) => {
                  setFilterCourseId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Tất cả môn</option>
                <option value="none">Chưa gắn môn nào</option>
                {courses.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} ({course.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="document-query-field">
              Filter by storage status
              <select
                value={storageFilter}
                onChange={(event) => {
                  setStorageFilter(event.target.value as typeof storageFilter);
                  setPage(1);
                }}
              >
                <option value="">All storage states</option>
                <option value="stored">Stored</option>
                <option value="deleting">Deletion pending</option>
                <option value="legacy">Legacy metadata</option>
              </select>
            </label>
            <label className="document-query-field">
              Filter by processing status
              <select
                value={processingFilter}
                onChange={(event) => {
                  setProcessingFilter(
                    event.target.value as typeof processingFilter,
                  );
                  setPage(1);
                }}
              >
                <option value="">All processing states</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="document-query-field">
              Sort documents by
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as NonNullable<typeof sort>);
                  setPage(1);
                }}
              >
                <option value="created_at">Date added</option>
                <option value="name">Name</option>
                <option value="course_name">Course</option>
                <option value="storage_status">Storage status</option>
                <option value="processing_status">Processing status</option>
              </select>
            </label>
            <label className="document-query-field">
              Sort direction
              <select
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as typeof direction);
                  setPage(1);
                }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <label className="document-query-field">
              Results per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                setFilterCourseId("all");
                setStorageFilter("");
                setProcessingFilter("");
                setSort("created_at");
                setDirection("desc");
                setPage(1);
                setPageSize(20);
              }}
            >
              Reset filters
            </button>
          </div>
          {listError && (
            <p className="error-message" role="alert">
              Chưa tải được danh sách: {listError}
            </p>
          )}
          {focusId && focusKey && !pageContainsFocus && currentFocusLookup && (
            <section
              className="document-focused"
              aria-labelledby="linked-document-title"
            >
              <h3 id="linked-document-title">Linked document</h3>
              {currentFocusLookup.status === "loading" && (
                <p aria-live="polite">Loading linked document…</p>
              )}
              {currentFocusLookup.status === "unavailable" && (
                <p role="status">
                  This linked document is no longer available in the current
                  workspace.
                </p>
              )}
              {currentFocusLookup.status === "error" && (
                <div>
                  <p className="error-message" role="alert">
                    Could not check this linked document. The list and its
                    filters remain unchanged.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFocusRetryVersion((value) => value + 1)}
                  >
                    Retry document lookup
                  </button>
                </div>
              )}
              {currentFocusLookup.status === "ready" &&
                currentFocusLookup.document && (
                  <>
                    <p>
                      This linked document is outside the current page or
                      filters. It is shown separately; the result count and list
                      below are unchanged.
                    </p>
                    <div
                      className="document-focused-card"
                      data-focus-id={currentFocusLookup.document.id}
                      data-focus-keyboard
                      tabIndex={-1}
                    >
                      {renderStoredDocument(currentFocusLookup.document)}
                    </div>
                  </>
                )}
            </section>
          )}
          {readPending && !listError ? (
            <p aria-live="polite">Loading documents…</p>
          ) : !listError ? (
            <ul>
              {visibleDocuments.map((item) => (
                <li
                  key={item.id}
                  data-focus-id={item.id}
                  data-focus-keyboard
                  tabIndex={-1}
                >
                  <DocumentCard
                    name={item.name}
                    size={item.size_bytes}
                    state={item.storage_status}
                    busy={busyIds.includes(item.id)}
                    processingStatus={item.processing_status ?? "pending"}
                    indexQuality={item.index_quality}
                    error={indexErrors[item.id]}
                    indexUnconfirmed={!!indexReads[item.id]}
                    onCheckStatus={
                      indexReads[item.id] && !indexReads[item.id].denied
                        ? () => void checkIndex(item.id)
                        : undefined
                    }
                    onProcess={canWrite ? () => void process(item) : undefined}
                    onCreateQuiz={
                      item.storage_status === "stored" &&
                      item.processing_status === "ready"
                        ? () => {
                            window.location.hash = `#study-coach/${encodeURIComponent(item.id)}`;
                          }
                        : undefined
                    }
                    onDownload={() => void download(item)}
                    onRemove={canDelete ? () => void remove(item) : undefined}
                  />
                  <label className="document-course">
                    <span className="sr-only">Course for {item.name}</span>
                    <select
                      value={item.course_id ?? ""}
                      disabled={!canWrite || busyIds.includes(item.id)}
                      onChange={(event) =>
                        void refile(item, event.target.value || null)
                      }
                    >
                      <option value="">Chưa gắn môn nào</option>
                      {courses.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} ({course.code})
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {!readPending && !listError && !visibleDocuments.length && (
            <p className="empty-message">
              {visibleTotal > 0
                ? "Không có tài liệu nào trên trang này. Quay lại trang trước để tiếp tục."
                : searchQuery ||
                    filterCourseId !== "all" ||
                    storageFilter ||
                    processingFilter
                  ? "Không tìm thấy tài liệu phù hợp. Hãy đổi hoặc đặt lại bộ lọc."
                  : "Chưa có tài liệu nào. Tải một tệp PDF lên để bắt đầu."}
            </p>
          )}
          {!readPending && !listError && visibleTotalPages > 0 && (
            <nav className="document-pagination" aria-label="Document pages">
              <button
                type="button"
                disabled={page <= 1 || busyIds.length > 0}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span aria-live="polite">
                Page {page} of {visibleTotalPages} · {visibleTotal} results
              </span>
              <button
                type="button"
                disabled={page >= visibleTotalPages || busyIds.length > 0}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </section>
      <aside className="document-roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">Document workflow</h2>
        <ol>
          <li>
            <ShieldCheckIcon aria-hidden="true" />
            <span>
              <strong>Validate and store</strong>
              <small>PDF file and metadata through the backend</small>
            </span>
          </li>
          <li>
            <CircleStackIcon aria-hidden="true" />
            <span>
              <strong>Extract and index</strong>
              <small>Backend PDF processing and Gemini embeddings</small>
            </span>
          </li>
          <li>
            <MagnifyingGlassIcon aria-hidden="true" />
            <span>
              <strong>Retrieve with citations</strong>
              <small>Grounded Assistant with validated sources</small>
            </span>
          </li>
        </ol>
        <p>
          The backend checks size, extension, MIME and PDF signature. This is
          not a full PDF parser or malware scan.
        </p>
      </aside>
    </section>
  );
}
