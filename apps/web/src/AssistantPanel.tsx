import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  BookOpenIcon,
  DocumentMagnifyingGlassIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { AssistantMarkdown } from "./AssistantMarkdown";
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
  return `Open source ${citation.title}${citation.locator ? `, ${citation.locator}` : ""}`;
}

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
  onOpenCitation?: (citation: AssistantCitation) => Promise<string | void>;
  onClose: () => void;
}

const promptsByPage: Record<string, string[]> = {
  dashboard: [
    "What should I focus on today?",
    "Summarize our current project progress.",
  ],
  tasks: [
    "Which tasks still need evidence?",
    "Help us choose the next project task.",
  ],
  documents: [
    "What evidence is required for the final project?",
    "Summarize an approved document.",
  ],
  courses: [
    "Create a review plan for this course.",
    "Which concepts should I revisit first?",
  ],
};

const fallbackPrompts = [
  "Summarize this workspace section.",
  "What should I review next?",
];

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
  onClose,
}: AssistantPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [openingCitation, setOpeningCitation] = useState<string | null>(null);
  const [citationError, setCitationError] = useState("");
  const [blockedSource, setBlockedSource] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const prompts = promptsByPage[pageId] ?? fallbackPrompts;
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
      composer.current?.focus();
  }, [open, modal]);

  async function openCitation(citation: AssistantCitation) {
    if (!onOpenCitation || !citation.documentId || openingCitation) return;
    const key = citation.id ?? citation.documentId;
    setOpeningCitation(key);
    setCitationError("");
    setBlockedSource(null);
    try {
      // Called straight from the click, not after an await: the new tab has
      // to open while the browser still counts this as the student's action.
      const blockedUrl = await onOpenCitation(citation);
      if (blockedUrl)
        setBlockedSource({ label: sourceLabel(citation), url: blockedUrl });
    } catch {
      setCitationError("Chưa mở được tài liệu nguồn. Thử lại giúp mình nhé.");
    } finally {
      setOpeningCitation(null);
    }
  }

  return (
    <aside
      ref={panel}
      id="examate-ai-panel"
      className={`assistant-panel ${sheet ? "is-sheet" : "is-window"}${expanded ? " is-expanded" : ""}`}
      aria-label="ExaMate AI"
      // An aside is complementary content beside the page. Once it covers the
      // page and holds focus — a sheet, or an expanded window on a tablet — it
      // is a modal dialog, and says so.
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      hidden={!open}
    >
      <header className="assistant-panel-header">
        <span className="assistant-mark" aria-hidden="true">
          <SparklesIcon />
        </span>
        <span>
          <strong>ExaMate AI</strong>
          <small>{pageName} context</small>
        </span>
        {/* One button whose name says what it will do next. A pressed state
            on top of a changing name would announce the same thing twice. */}
        <button
          type="button"
          aria-label={expanded ? "Collapse ExaMate AI" : "Expand ExaMate AI"}
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
          aria-label="Close ExaMate AI"
          title="Đóng — bản nháp vẫn được giữ"
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <div className="assistant-body">
        {preview && (
          <section
            className="assistant-intro"
            aria-labelledby="assistant-title"
          >
            <span className="preview-badge">Interface preview</span>
            <h2 id="assistant-title">Ask with your sources in view</h2>
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
              <legend>Chế độ trả lời</legend>
              <label>
                <input
                  type="radio"
                  name="assistant-mode"
                  value="general"
                  checked={assistant.mode === "general"}
                  onChange={() => assistant.setMode("general")}
                />
                Chat thông thường
              </label>
              <label>
                <input
                  type="radio"
                  name="assistant-mode"
                  value="documents"
                  checked={assistant.mode === "documents"}
                  onChange={() => assistant.setMode("documents")}
                />
                Hỏi tài liệu
              </label>
            </fieldset>
            <p className="assistant-capability">
              {assistant.mode === "documents"
                ? "Nội dung trả lời dựa trên tài liệu đã lập chỉ mục; thông tin môn học lấy từ metadata của workspace và được ghi nguồn riêng."
                : "Trả lời bằng kiến thức chung; không đọc hoặc suy đoán dữ liệu riêng trong ứng dụng."}
            </p>
            {open && assistant.mode === "documents" && (
              <label className="assistant-document-picker">
                Tài liệu
                <select
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
                      ? `${selectedDocument.name} · Đã lập chỉ mục theo phiên bản cũ; chưa có thống kê độ phủ. Có thể re-index trong Documents để kiểm tra lại.`
                      : availableDocuments.length
                        ? "Đang tìm trong tất cả tài liệu. Chọn một file để xem trạng thái và dùng thông tin môn học của file đó."
                        : "Chưa có tài liệu sẵn sàng để hỏi."}
              </p>
            )}
          </>
        )}

        {assistant.messages.length > 0 && (
          <ol className="assistant-messages" aria-label="Conversation">
            {assistant.messages.map((message) => (
              <li key={message.id} className={`is-${message.role}`}>
                {/* Never as HTML: a model's output is not trusted markup. A
                    reply's Markdown is rebuilt from React elements alone; what
                    the student typed is shown exactly as typed. */}
                {message.role === "assistant" ? (
                  <AssistantMarkdown text={message.text} />
                ) : (
                  <p>{message.text}</p>
                )}
                {message.citations.length > 0 && (
                  <ul className="assistant-citations" aria-label="Sources">
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
                            onClick={() => void openCitation(citation)}
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
              </li>
            ))}
          </ol>
        )}

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
            <a
              href={blockedSource.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {blockedSource.label}
            </a>
            . Link chỉ dùng được trong thời gian ngắn; nếu hết hạn, bấm lại vào
            nguồn.
          </p>
        )}

        <section
          className="assistant-suggestions"
          aria-labelledby="suggestions-title"
        >
          <h3 id="suggestions-title">Try asking</h3>
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
                <small>Example grounded answer</small>
                <h3 id="answer-preview-title">Evidence stays checkable</h3>
              </span>
            </header>
            <p>
              Homework 3A asks for navigation, essential screens, a validated
              form, visible UI states and a responsive layout.
            </p>
            <footer>
              <BookOpenIcon aria-hidden="true" />
              <span>
                <strong>Week 3 course guide · p. 5</strong>
                <small>Example citation · not retrieved live</small>
              </span>
            </footer>
          </section>
        )}
      </div>

      <form
        className="assistant-composer"
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
          // The picker keeps its choice across a switch to ordinary chat, so it
          // is there on the way back — but only documents mode sends it. The
          // backend refuses a document in general mode.
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
        <label htmlFor="assistant-question">Question for ExaMate</label>
        <textarea
          id="assistant-question"
          ref={composer}
          value={assistant.draft}
          onChange={(event) => {
            assistant.setDraft(event.target.value);
            setSelectionError("");
          }}
          placeholder="Ask about your course or project sources…"
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
            {assistant.status === "sending" ? "Đang gửi câu hỏi…" : ""}
          </p>
        )}
        <button type="submit" disabled={!assistant.canSend}>
          <PaperAirplaneIcon aria-hidden="true" />
          Send question
        </button>
        {assistant.mode === "documents" && (
          <>
            <button
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
    </aside>
  );
}
