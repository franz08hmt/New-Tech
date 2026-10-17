import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  BookOpenIcon,
  CircleStackIcon,
  DocumentMagnifyingGlassIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { AssistantFeedback } from "./AssistantFeedback";
import { SpeechInput } from "./SpeechInput";
import { SourcePreview, useSourcePreview } from "./SourcePreview";
import { workspaceKindLabel, workspaceSourceHref } from "./workspace-links";
import type { AssistantCitation, AssistantState } from "./use-assistant";
import type { StoredDocument } from "./api";

function documentMentionedIn(
  question: string,
  documents: StoredDocument[],
): StoredDocument | undefined {
  const normalized = question.toLocaleLowerCase("vi");
  const matches = documents.filter((item) =>
    normalized.includes(item.name.toLocaleLowerCase("vi")),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** The accessible name shared by a source's button and its fallback link. */
function sourceLabel(citation: AssistantCitation) {
  return `Mở nguồn ${citation.title}${citation.locator ? `, ${citation.locator}` : ""}`;
}

/**
 * Some browsers — Chrome on Android among them — cannot show a PDF inside a
 * page and say so here. For them a preview would be a blank frame, so a
 * citation keeps opening a tab as it always has. Unknown counts as able.
 */
function inlinePdfUnsupported() {
  return navigator.pdfViewerEnabled === false;
}

const noSource = () => Promise.reject(new Error("No source loader"));

function questionOperation(question: string) {
  if (
    /thuộc\s+(?:khóa học|môn học|môn)\s+nào|(?:which|what)\s+course/iu.test(
      question,
    )
  )
    return "course_info" as const;
  if (
    /có nội dung về gì|nói về (?:điều )?gì|tóm tắt|summari[sz]e|what is .+ about/iu.test(
      question,
    )
  )
    return "summarize" as const;
  return "question" as const;
}

interface AssistantPanelProps {
  open: boolean;
  /** Whether it covers the page and holds focus: a dialog, not an aside. */
  modal: boolean;
  /** Narrow screens show a bottom sheet; wider ones a floating window. */
  sheet: boolean;
  /** Roomier for long answers. Only the styling changes, never the state. */
  expanded: boolean;
  onToggleExpanded: () => void;
  pageId: string;
  pageName: string;
  courseId?: string;
  assistant: AssistantState;
  documents?: StoredDocument[];
  documentsLoading?: boolean;
  /**
   * Opens the cited document in a new tab. Resolves with the source URL when
   * the browser blocked that tab, so it can be offered as a link to click.
   */
  onOpenCitation?: (
    citation: AssistantCitation,
    signal?: AbortSignal,
  ) => Promise<string | void>;
  /** Resolves with a signed inline link to show the cited PDF in the panel. */
  loadSource?: (citation: AssistantCitation) => Promise<string>;
  /**
   * Whether the screen is wide enough to read a source beside the
   * conversation once expanded; otherwise it takes the conversation's place.
   */
  roomForSource?: boolean;
  /** A real course name for the workspace examples, when there is one. */
  workspaceCourse?: string;
  /** A workspace source link was followed; the page is about to change. */
  onFollowWorkspaceSource?: () => void;
  onClose: () => void;
}

const generalPrompts = [
  "Giải thích một khái niệm khó bằng ví dụ đơn giản.",
  "So sánh hai khái niệm và nêu cách áp dụng từng khái niệm.",
];

function documentPrompts(selectedDocument?: StoredDocument) {
  return [
    selectedDocument
      ? "Tóm tắt các ý chính trong tài liệu đã chọn."
      : "Tìm các ý chính liên quan trong tài liệu đã lập chỉ mục.",
    "Giải thích nội dung trong tài liệu bằng ví dụ và dẫn nguồn.",
  ];
}

/**
 * Questions workspace mode can answer, with a real course name when the
 * workspace has one — an example that names no real course would only fail.
 */
function workspacePrompts(course?: string) {
  return [
    "Task nào đã quá hạn?",
    course
      ? `Kỳ thi sắp tới của môn ${course} là khi nào?`
      : "Kỳ thi sắp tới là khi nào?",
    course
      ? `Việc cần ôn nào của môn ${course} đã quá hạn?`
      : "Việc cần ôn nào đã quá hạn?",
  ];
}

/**
 * The ExaMate AI window.
 *
 * Presentational and always mounted: App owns whether it is open and the
 * conversation it shows. Closing sets `hidden`, which takes it out of the tab
 * order and the accessibility tree, instead of unmounting it — so nothing the
 * student typed goes with it.
 */
export function AssistantPanel({
  open,
  modal,
  sheet,
  expanded,
  onToggleExpanded,
  pageId,
  pageName,
  courseId,
  assistant,
  documents = [],
  documentsLoading = false,
  onOpenCitation,
  loadSource,
  roomForSource = false,
  workspaceCourse,
  onFollowWorkspaceSource,
  onClose,
}: AssistantPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [openingCitation, setOpeningCitation] = useState<string | null>(null);
  const sourceEpoch = useRef(0);
  const pendingSource = useRef<AbortController | null>(null);
  const [citationError, setCitationError] = useState("");
  const [blockedSource, setBlockedSource] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [aiSourceMode, setAiSourceMode] = useState<"general" | "documents">(
    assistant.mode === "general" ? "general" : "documents",
  );
  const source = useSourcePreview(loadSource ?? noSource);
  const closeSourceView = source.close;
  const sourceHeading = useRef<HTMLHeadingElement>(null);
  // The citation that opened the source, to hand focus back to on the way out.
  const sourceOpener = useRef<HTMLElement | null>(null);
  const restoreSourceFocus = useRef(false);
  const [sourcePaneDismissed, setSourcePaneDismissed] = useState(false);
  const split = expanded && !sheet && roomForSource;
  const hasOpenableSources =
    Boolean(loadSource) &&
    assistant.messages.some((message) =>
      message.citations.some((citation) => citation.documentId),
    );
  // Beside the conversation, the pane can wait empty for a source to be
  // chosen. Anywhere narrower it appears only for a chosen source, in the
  // conversation's place.
  const showSource =
    source.selection !== null ||
    (split && hasOpenableSources && !sourcePaneDismissed);
  const sourceScreen = source.selection !== null && !split;
  const answerNumbers = new Map<string, number>();
  for (const message of assistant.messages)
    if (message.role === "assistant")
      answerNumbers.set(message.id, answerNumbers.size + 1);
  const preview = assistant.status === "unavailable";
  const availableDocuments = documents.filter(
    (item) =>
      item.storage_status === "stored" &&
      item.processing_status === "ready" &&
      (!courseId || item.course_id === courseId),
  );
  const selectedDocument = availableDocuments.find(
    (item) => item.id === documentId,
  );
  const prompts =
    assistant.mode === "workspace"
      ? workspacePrompts(workspaceCourse)
      : assistant.mode === "documents"
        ? documentPrompts(selectedDocument)
        : generalPrompts;

  useLayoutEffect(() => {
    const field = composer.current;
    if (!field) return;

    const maxHeight = 168;
    field.style.height = "auto";
    const contentHeight = Math.max(field.scrollHeight, 96);
    field.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    field.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [assistant.draft, expanded, open, sourceScreen]);

  useEffect(() => {
    assistant.syncContext({
      courseId,
      ...(assistant.mode === "documents" && documentId ? { documentId } : {}),
    });
  }, [assistant.syncContext, assistant.mode, courseId, documentId]);

  useEffect(() => {
    // A reset removes the source opener along with its answer; do not leave a
    // PDF from the previous scope visible beside the new conversation.
    sourceEpoch.current++;
    pendingSource.current?.abort();
    pendingSource.current = null;
    closeSourceView();
    setBlockedSource(null);
    setCitationError("");
    setOpeningCitation(null);
    sourceOpener.current = null;
    restoreSourceFocus.current = false;
    return () => {
      sourceEpoch.current++;
      pendingSource.current?.abort();
      pendingSource.current = null;
    };
  }, [assistant.conversationVersion, closeSourceView]);

  useEffect(() => {
    if (
      documentId &&
      !availableDocuments.some((item) => item.id === documentId)
    )
      setDocumentId("");
  }, [availableDocuments, documentId]);

  // Opening lands in the composer: typing a question is what the launcher is
  // for. Keyed on `open` alone, so switching page behind an open panel does
  // not steal focus back into it.
  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open]);

  // A panel can turn modal while it is already open: the screen narrows under
  // it, or it is expanded on a tablet. Whatever held focus behind it is inert
  // from then on, so focus moves in rather than being stranded there.
  useEffect(() => {
    if (open && modal && !panel.current?.contains(document.activeElement))
      (sourceScreen ? sourceHeading.current : composer.current)?.focus();
    // Only the switch to modal matters here, not every change of view.
  }, [open, modal]);

  // Reading a source is part of this visit; closing the assistant ends it.
  useEffect(() => {
    if (open) return;
    closeSourceView();
    sourceOpener.current = null;
  }, [open, closeSourceView]);

  // A newly chosen source is announced by moving focus to its title.
  useEffect(() => {
    if (source.selection) sourceHeading.current?.focus();
  }, [source.selection]);

  // Leaving the source puts focus back on the citation that opened it, once
  // that citation is visible again.
  useEffect(() => {
    if (source.selection || !restoreSourceFocus.current) return;
    restoreSourceFocus.current = false;
    const target = sourceOpener.current;
    sourceOpener.current = null;
    (target?.isConnected ? target : composer.current)?.focus();
  }, [source.selection]);

  function showCitation(
    citation: AssistantCitation,
    messageId: string,
    opener: HTMLElement,
  ) {
    if (!loadSource || inlinePdfUnsupported()) {
      void openCitation(citation);
      return;
    }
    sourceOpener.current = opener;
    setSourcePaneDismissed(false);
    setCitationError("");
    setBlockedSource(null);
    // A source needs room; the student can still collapse it again.
    if (!expanded) onToggleExpanded();
    source.show({
      citation,
      messageId,
      answerNumber: answerNumbers.get(messageId) ?? 1,
    });
  }

  function closeSource() {
    restoreSourceFocus.current = true;
    setSourcePaneDismissed(true);
    setCitationError("");
    setBlockedSource(null);
    source.close();
  }

  async function openCitation(citation: AssistantCitation) {
    if (!onOpenCitation || !citation.documentId || openingCitation) return;
    const key = citation.id ?? citation.documentId;
    const openedIn = sourceEpoch.current;
    const controller = new AbortController();
    pendingSource.current = controller;
    setOpeningCitation(key);
    setCitationError("");
    setBlockedSource(null);
    try {
      // Called straight from the click, not after an await: the new tab has
      // to open while the browser still counts this as the student's action.
      const blockedUrl = await onOpenCitation(citation, controller.signal);
      if (openedIn !== sourceEpoch.current) return;
      if (blockedUrl)
        setBlockedSource({ label: sourceLabel(citation), url: blockedUrl });
    } catch {
      if (openedIn !== sourceEpoch.current) return;
      setCitationError("Chưa mở được tài liệu nguồn. Thử lại giúp mình nhé.");
    } finally {
      if (openedIn === sourceEpoch.current) {
        setOpeningCitation(null);
        pendingSource.current = null;
      }
    }
  }

  const tabNotice = (
    <>
      {citationError && (
        <p role="alert" className="assistant-citation-error">
          {citationError}
        </p>
      )}
      {/* The browser blocked the tab even from a click, so the link goes to
          the student: a click on a real link is never treated as a popup. */}
      {blockedSource && (
        <p role="status" className="assistant-blocked-source">
          Trình duyệt đã chặn tab mới.{" "}
          <a href={blockedSource.url} target="_blank" rel="noopener noreferrer">
            {blockedSource.label}
          </a>
          . Link chỉ dùng được trong thời gian ngắn; nếu hết hạn, bấm lại vào
          nguồn.
        </p>
      )}
    </>
  );

  return (
    <aside
      ref={panel}
      id="examate-ai-panel"
      className={`assistant-panel ${sheet ? "is-sheet" : "is-window"}${expanded ? " is-expanded" : ""}${showSource ? (split ? " is-split" : " is-source-screen") : ""}`}
      aria-label="ExaMate AI"
      // An aside is complementary content beside the page. Once it covers the
      // page and holds focus — a sheet, or an expanded window on a tablet — it
      // is a modal dialog, and says so.
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      hidden={!open}
      onKeyDown={(event) => {
        // Escape leaves the source first; the next one closes the assistant.
        if (event.key !== "Escape" || !source.selection) return;
        event.stopPropagation();
        closeSource();
      }}
    >
      <header className="assistant-panel-header">
        <span className="assistant-mark" aria-hidden="true">
          <SparklesIcon />
        </span>
        <span>
          <strong>ExaMate AI</strong>
          <small>Ngữ cảnh: {pageName}</small>
        </span>
        {/* One button whose name says what it will do next. A pressed state
            on top of a changing name would announce the same thing twice. */}
        <button
          type="button"
          aria-label={expanded ? "Thu nhỏ ExaMate AI" : "Mở rộng ExaMate AI"}
          title={expanded ? "Thu nhỏ khung chat" : "Mở rộng khung chat"}
          onClick={onToggleExpanded}
        >
          {expanded ? (
            <ArrowsPointingInIcon aria-hidden="true" />
          ) : (
            <ArrowsPointingOutIcon aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label="Đóng ExaMate AI"
          title="Đóng — bản nháp vẫn được giữ"
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <div className="assistant-body" hidden={sourceScreen}>
        {!preview && (
          <section
            className="assistant-conversation-tools"
            aria-label="Ngữ cảnh hội thoại"
          >
            <button
              type="button"
              onClick={() => {
                assistant.resetConversation();
                composer.current?.focus();
              }}
            >
              Cuộc trò chuyện mới
            </button>
            {assistant.contextNotice && (
              <p role="status">{assistant.contextNotice}</p>
            )}
          </section>
        )}
        {preview && (
          <section
            className="assistant-intro"
            aria-labelledby="assistant-title"
          >
            <span className="preview-badge">Xem trước giao diện</span>
            <h2 id="assistant-title">Hỏi đáp cùng nguồn tài liệu</h2>
            <p>
              Phần AI đang được Thắng kết nối. Bạn có thể chuẩn bị câu hỏi,
              nhưng chưa gửi để nhận trả lời được.
            </p>
          </section>
        )}

        {!preview && (
          <>
            <fieldset
              className="assistant-mode"
              disabled={assistant.status === "sending"}
            >
              <legend>Chế độ</legend>
              <label
                className={
                  assistant.mode !== "workspace" ? "is-selected" : undefined
                }
              >
                <input
                  type="radio"
                  name="assistant-mode"
                  value="ai-chat"
                  checked={assistant.mode !== "workspace"}
                  onChange={() => assistant.setMode(aiSourceMode)}
                />
                AI Chat
              </label>
              <label
                className={
                  assistant.mode === "workspace" ? "is-selected" : undefined
                }
              >
                <input
                  type="radio"
                  name="assistant-mode"
                  value="workspace"
                  checked={assistant.mode === "workspace"}
                  onChange={() => assistant.setMode("workspace")}
                />
                Hỏi workspace
              </label>
            </fieldset>
            {assistant.mode !== "workspace" && (
              <fieldset
                className="assistant-mode assistant-source-mode"
                aria-label="Phạm vi AI Chat"
                disabled={assistant.status === "sending"}
              >
                <legend>Trả lời theo</legend>
                <label
                  className={
                    assistant.mode === "general" ? "is-selected" : undefined
                  }
                >
                  <input
                    type="radio"
                    name="assistant-source-mode"
                    value="general"
                    checked={assistant.mode === "general"}
                    onChange={() => {
                      setAiSourceMode("general");
                      assistant.setMode("general");
                    }}
                  />
                  Kiến thức chung
                </label>
                <label
                  className={
                    assistant.mode === "documents" ? "is-selected" : undefined
                  }
                >
                  <input
                    type="radio"
                    name="assistant-source-mode"
                    value="documents"
                    checked={assistant.mode === "documents"}
                    onChange={() => {
                      setAiSourceMode("documents");
                      assistant.setMode("documents");
                    }}
                  />
                  Tài liệu
                </label>
              </fieldset>
            )}
            <p className="assistant-capability">
              {assistant.mode === "documents"
                ? "AI Chat tìm trong tài liệu đã lập chỉ mục và hiển thị nguồn đã kiểm chứng. Thông tin môn học lấy từ dữ liệu metadata riêng."
                : assistant.mode === "workspace"
                  ? "Tra cứu dữ liệu đã lưu trong workspace như môn học, task, kỳ thi, kế hoạch ôn tập và khoản chi. Không đọc nội dung PDF hoặc ghi chú nhanh, và không thay đổi dữ liệu."
                  : "AI Chat trả lời bằng kiến thức chung; nội dung sẽ xuất hiện dần khi AI tạo câu trả lời. Không đọc hoặc suy đoán dữ liệu riêng trong ứng dụng."}
            </p>
            {open && assistant.mode === "documents" && (
              <label className="assistant-document-picker">
                Tài liệu
                <select
                  aria-label="Chọn tài liệu để tra cứu"
                  value={documentId}
                  disabled={documentsLoading || assistant.status === "sending"}
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    setSelectionError("");
                  }}
                >
                  <option value="">Tất cả tài liệu đã lập chỉ mục</option>
                  {availableDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {open && assistant.mode === "documents" && (
              <p className="assistant-document-status" role="status">
                {documentsLoading
                  ? "Đang tải danh sách tài liệu…"
                  : selectedDocument?.index_quality
                    ? `${selectedDocument.name} · ${selectedDocument.index_quality.indexed_chunk_count} đoạn đã lập chỉ mục; ${selectedDocument.index_quality.useful_text_page_count}/${selectedDocument.index_quality.total_page_count} trang có văn bản dùng được.`
                    : selectedDocument
                      ? `${selectedDocument.name} · Đã lập chỉ mục theo phiên bản cũ; chưa có thống kê độ phủ. Hãy lập chỉ mục lại trong mục Tài liệu để kiểm tra.`
                      : availableDocuments.length
                        ? "Đang tìm trong tất cả tài liệu. Chọn một file cụ thể để xem trạng thái, tóm tắt hoặc tra cứu môn học của tài liệu đó."
                        : "Chưa có tài liệu sẵn sàng để hỏi."}
              </p>
            )}
          </>
        )}

        {assistant.messages.length > 0 && (
          <ol className="assistant-messages" aria-label="Cuộc hội thoại">
            {assistant.messages.map((message, index) => (
              <li
                key={message.id}
                className={`is-${message.role}${source.selection?.messageId === message.id ? " is-source-answer" : ""}`}
              >
                {/* Never as HTML: a model's output is not trusted markup. A
                    reply's Markdown is rebuilt from React elements alone; what
                    the student typed is shown exactly as typed. */}
                {message.role === "assistant" ? (
                  message.text ? (
                    <AssistantMarkdown text={message.text} />
                  ) : null
                ) : (
                  <p>{message.text}</p>
                )}
                {message.streaming && (
                  <p role="status" className="assistant-streaming-status">
                    {assistant.streamStage === "retrieving"
                      ? "Đang tìm bằng chứng trong tài liệu…"
                      : "Đang tạo câu trả lời…"}
                  </p>
                )}
                {message.incomplete && (
                  <p role="status" className="assistant-streaming-status">
                    Câu trả lời chưa hoàn tất; lượt này không được dùng làm ngữ
                    cảnh cho câu hỏi tiếp theo.
                  </p>
                )}
                {message.citations.length > 0 && (
                  <ul
                    className="assistant-citations"
                    aria-label="Nguồn tham khảo"
                  >
                    {message.citations.map((citation) => (
                      <li
                        key={
                          citation.id ??
                          `${citation.title}-${citation.locator ?? ""}`
                        }
                      >
                        <BookOpenIcon aria-hidden="true" />
                        {onOpenCitation && citation.documentId ? (
                          <button
                            type="button"
                            disabled={openingCitation !== null}
                            aria-label={sourceLabel(citation)}
                            aria-current={
                              source.selection?.citation === citation
                                ? "true"
                                : undefined
                            }
                            onClick={(event) =>
                              showCitation(
                                citation,
                                message.id,
                                event.currentTarget,
                              )
                            }
                          >
                            {citation.title}
                            {citation.locator && ` · ${citation.locator}`}
                          </button>
                        ) : (
                          <span>
                            {citation.title}
                            {citation.locator && ` · ${citation.locator}`}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {message.workspaceSources &&
                  message.workspaceSources.length > 0 && (
                    <ul
                      className="assistant-workspace-sources"
                      aria-label="Nguồn workspace"
                    >
                      {message.workspaceSources.map((source) => {
                        const href = workspaceSourceHref(source);
                        const text = `${workspaceKindLabel[source.kind] ?? "Bản ghi"}: ${source.label}`;
                        return (
                          <li key={`${source.kind}-${source.id}`}>
                            <CircleStackIcon aria-hidden="true" />
                            <span>
                              {href ? (
                                <a
                                  href={href}
                                  onClick={onFollowWorkspaceSource}
                                >
                                  {text}
                                </a>
                              ) : (
                                text
                              )}
                              {source.detail && <small>{source.detail}</small>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                {message.metadataSource && (
                  <p className="assistant-metadata-source">
                    Nguồn: thông tin tài liệu trong workspace ·{" "}
                    {message.metadataSource.courseSlug ? (
                      <a href={`#courses/${message.metadataSource.courseSlug}`}>
                        {message.metadataSource.courseName} (
                        {message.metadataSource.courseCode})
                      </a>
                    ) : (
                      "Chưa gắn môn học"
                    )}
                  </p>
                )}
                {message.role === "assistant" && message.feedback && (
                  <AssistantFeedback
                    feedback={message.feedback}
                    number={Math.floor(index / 2) + 1}
                  />
                )}
                {message.role === "assistant" &&
                  message.feedbackUnavailable && (
                    <p role="status">
                      Câu trả lời vẫn được giữ, nhưng chưa nhận được mã xác nhận
                      từ server. Lượt này chưa thể gửi đánh giá và sẽ không dùng
                      làm ngữ cảnh.
                    </p>
                  )}
              </li>
            ))}
          </ol>
        )}

        {assistant.status === "sending" &&
          !assistant.messages.some((message) => message.streaming) && (
            <p role="status" className="assistant-streaming-status">
              {assistant.streamStage === "retrieving"
                ? "Đang tìm bằng chứng trong tài liệu…"
                : assistant.streamStage === "querying_workspace"
                  ? "Đang tra cứu dữ liệu workspace…"
                  : assistant.streamStage === "generating"
                    ? "Đang tạo câu trả lời…"
                    : "Đang kết nối và chuẩn bị câu trả lời…"}
            </p>
          )}

        {!source.selection && tabNotice}

        <section
          className="assistant-suggestions"
          aria-labelledby="suggestions-title"
        >
          <h3 id="suggestions-title">Gợi ý câu hỏi</h3>
          <ul>
            {prompts.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => assistant.setDraft(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {preview && (
          <section
            className="assistant-answer-preview"
            aria-labelledby="answer-preview-title"
          >
            <header>
              <DocumentMagnifyingGlassIcon aria-hidden="true" />
              <span>
                <small>Ví dụ câu trả lời có nguồn</small>
                <h3 id="answer-preview-title">Nguồn luôn có thể kiểm chứng</h3>
              </span>
            </header>
            <p>
              Bài tập 3A yêu cầu điều hướng, các màn hình chính, biểu mẫu có
              kiểm tra dữ liệu, trạng thái giao diện rõ ràng và bố cục đáp ứng.
            </p>
            <footer>
              <BookOpenIcon aria-hidden="true" />
              <span>
                <strong>Tài liệu hướng dẫn tuần 3 · tr. 5</strong>
                <small>Nguồn minh họa · chưa được truy xuất thực tế</small>
              </span>
            </footer>
          </section>
        )}
      </div>

      <form
        className="assistant-composer"
        hidden={sourceScreen}
        onSubmit={(event) => {
          event.preventDefault();
          const mentionsPdf =
            assistant.mode === "documents" && /\.pdf\b/iu.test(assistant.draft);
          const mentionedDocument = mentionsPdf
            ? documentMentionedIn(assistant.draft, availableDocuments)
            : undefined;
          if (mentionsPdf && !mentionedDocument) {
            setSelectionError(
              "Không tìm thấy đúng tài liệu PDF này trong danh sách sẵn sàng. Hãy chọn file trong mục Tài liệu hoặc kiểm tra lại tên trước khi gửi.",
            );
            return;
          }
          setSelectionError("");
          // Keep the picker choice across a switch to general knowledge, but
          // send the document only when the AI Chat scope is set to documents.
          const resolvedDocumentId =
            assistant.mode === "documents"
              ? mentionedDocument?.id || documentId
              : "";
          const operation = resolvedDocumentId
            ? questionOperation(assistant.draft)
            : "question";
          if (mentionedDocument && mentionedDocument.id !== documentId)
            setDocumentId(mentionedDocument.id);
          void assistant.send(
            {
              pageId,
              pageName,
              ...(courseId ? { courseId } : {}),
              ...(resolvedDocumentId ? { documentId: resolvedDocumentId } : {}),
            },
            { operation },
          );
        }}
      >
        <label htmlFor="assistant-question">Câu hỏi cho ExaMate</label>
        <textarea
          id="assistant-question"
          ref={composer}
          rows={3}
          value={assistant.draft}
          onChange={(event) => {
            assistant.setDraft(event.target.value);
            setSelectionError("");
          }}
          placeholder="Nhập câu hỏi của bạn…"
        />
        <SpeechInput
          active={open && !sourceScreen && assistant.status !== "sending"}
          scope={`${pageId}:${courseId ?? ""}:${assistant.mode}:${documentId}`}
          draft={assistant.draft}
          onDraft={(value) => {
            assistant.setDraft(value);
            setSelectionError("");
          }}
        />
        {/* A small status line of its own, announced when it changes. The
            conversation above is not a live region, so a new reply does not
            make a screen reader read the whole history again. */}
        {selectionError ? (
          <p role="alert" className="assistant-status">
            {selectionError}
          </p>
        ) : assistant.status === "error" ? (
          <p role="alert" className="assistant-status">
            {assistant.errorMessage ||
              "Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé."}
          </p>
        ) : (
          <p role="status" className="assistant-status">
            {assistant.status === "sending" ? "Đang xử lý câu hỏi…" : ""}
          </p>
        )}
        <button
          className={`assistant-send${assistant.mode === "documents" && selectedDocument ? " has-document-actions" : ""}`}
          type="submit"
          disabled={!assistant.canSend}
        >
          <PaperAirplaneIcon aria-hidden="true" />
          Gửi câu hỏi
        </button>
        {assistant.status === "sending" && (
          <button
            className="assistant-secondary-action"
            type="button"
            onClick={assistant.cancel}
          >
            Dừng trả lời
          </button>
        )}
        {assistant.mode === "documents" && selectedDocument && (
          <>
            <button
              className="assistant-secondary-action"
              type="button"
              disabled={
                !documentId ||
                assistant.status === "sending" ||
                assistant.status === "unavailable"
              }
              onClick={() =>
                void assistant.send(
                  {
                    pageId,
                    pageName,
                    ...(courseId ? { courseId } : {}),
                    documentId,
                  },
                  {
                    operation: "summarize",
                    message: "Tóm tắt tài liệu đã chọn.",
                  },
                )
              }
            >
              Tóm tắt tài liệu
            </button>
            <button
              className="assistant-secondary-action"
              type="button"
              disabled={
                !documentId ||
                assistant.status === "sending" ||
                assistant.status === "unavailable"
              }
              onClick={() =>
                void assistant.send(
                  {
                    pageId,
                    pageName,
                    ...(courseId ? { courseId } : {}),
                    documentId,
                  },
                  {
                    operation: "course_info",
                    message: "Tài liệu này thuộc môn học nào?",
                  },
                )
              }
            >
              Môn học của tài liệu
            </button>
          </>
        )}
      </form>

      {showSource && (
        <SourcePreview
          selection={source.selection}
          status={source.status}
          layout={split ? "split" : "screen"}
          headingRef={sourceHeading}
          onClose={closeSource}
          onReload={source.reload}
          onOpenInTab={() => {
            if (source.selection) void openCitation(source.selection.citation);
          }}
          openingInTab={openingCitation !== null}
          tabNotice={source.selection ? tabNotice : undefined}
        />
      )}
    </aside>
  );
}
