import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState, type ReactNode, type Ref } from "react";
import type { AssistantCitation } from "./use-assistant";

/** The citation being read, and where in the conversation it came from. */
export interface SourceSelection {
  citation: AssistantCitation;
  messageId: string;
  /** 1-based position of its answer among the assistant's replies. */
  answerNumber: number;
}

export type SourceStatus =
  { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error" };

/**
 * Which cited PDF is open beside the conversation, and its signed link.
 *
 * The link lives in state and nowhere else: never storage, never a log. Each
 * load asks the API for a fresh one — a link lasts a minute, so reusing an old
 * one on retry would retry the thing that just failed. A counter drops any
 * reply that arrives after the student has already moved to another source.
 */
export function useSourcePreview(
  loadSource: (citation: AssistantCitation) => Promise<string>,
) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [status, setStatus] = useState<SourceStatus>({ kind: "loading" });
  const latest = useRef(0);
  const current = useRef<SourceSelection | null>(null);
  current.current = selection;
  const loader = useRef(loadSource);
  loader.current = loadSource;

  const load = useCallback(async (citation: AssistantCitation) => {
    const request = ++latest.current;
    setStatus({ kind: "loading" });
    try {
      const url = await loader.current(citation);
      if (request === latest.current) setStatus({ kind: "ready", url });
    } catch {
      if (request === latest.current) setStatus({ kind: "error" });
    }
  }, []);

  const show = useCallback(
    (next: SourceSelection) => {
      setSelection(next);
      void load(next.citation);
    },
    [load],
  );

  const reload = useCallback(() => {
    if (current.current) void load(current.current.citation);
  }, [load]);

  const close = useCallback(() => {
    latest.current += 1;
    setSelection(null);
  }, []);

  return { selection, status, show, reload, close };
}

/** "Trang 3", or honest about having no page. */
function whereInDocument(citation: AssistantCitation) {
  if (citation.page) return `Trang ${citation.page}`;
  return citation.locator
    ? `Không có số trang · ${citation.locator}`
    : "Không có số trang";
}

interface SourcePreviewProps {
  selection: SourceSelection | null;
  status: SourceStatus;
  /** Beside the conversation, or in its place on a smaller screen. */
  layout: "split" | "screen";
  headingRef: Ref<HTMLHeadingElement>;
  onClose: () => void;
  onReload: () => void;
  onOpenInTab: () => void;
  openingInTab: boolean;
  /** What the new-tab button reported: a blocked tab's link, or its error. */
  tabNotice?: ReactNode;
}

export function SourcePreview({
  selection,
  status,
  layout,
  headingRef,
  onClose,
  onReload,
  onOpenInTab,
  openingInTab,
  tabNotice,
}: SourcePreviewProps) {
  if (!selection)
    return (
      <section
        className="assistant-source is-empty"
        aria-labelledby="assistant-source-title"
      >
        <DocumentTextIcon aria-hidden="true" />
        <h2 id="assistant-source-title" tabIndex={-1} ref={headingRef}>
          Chưa chọn nguồn
        </h2>
        <p>Chọn một nguồn dưới câu trả lời để đọc tài liệu ngay tại đây.</p>
      </section>
    );

  const { citation } = selection;
  const frameTitle = citation.page
    ? `${citation.title}, trang ${citation.page}`
    : citation.title;

  return (
    <section
      className="assistant-source"
      aria-labelledby="assistant-source-title"
    >
      <header className="assistant-source-header">
        {layout === "screen" ? (
          <button
            type="button"
            className="assistant-source-back"
            onClick={onClose}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Quay lại hội thoại
          </button>
        ) : (
          <button
            type="button"
            className="assistant-source-close"
            aria-label="Ẩn vùng nguồn"
            title="Ẩn vùng nguồn"
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        )}
        <div className="assistant-source-title">
          <h2 id="assistant-source-title" tabIndex={-1} ref={headingRef}>
            {citation.title}
          </h2>
          <p>
            {whereInDocument(citation)} · Nguồn của câu trả lời{" "}
            {selection.answerNumber}
          </p>
        </div>
        <div className="assistant-source-actions">
          <button type="button" onClick={onReload}>
            <ArrowPathIcon aria-hidden="true" />
            Tải lại nguồn
          </button>
          <button type="button" onClick={onOpenInTab} disabled={openingInTab}>
            <ArrowTopRightOnSquareIcon aria-hidden="true" />
            Mở trong tab mới
          </button>
        </div>
      </header>
      {tabNotice}
      <div className="assistant-source-body">
        {status.kind === "loading" && (
          <p role="status" className="assistant-source-message">
            Đang mở tài liệu nguồn…
          </p>
        )}
        {status.kind === "error" && (
          <div role="alert" className="assistant-source-message">
            <p>Chưa mở được tài liệu nguồn.</p>
            <button type="button" onClick={onReload}>
              Thử lại
            </button>
          </div>
        )}
        {status.kind === "ready" && (
          <>
            {/* No sandbox: browsers refuse to run their PDF viewer inside a
                sandboxed frame. The PDF comes from Storage's own origin, so
                it cannot reach this page either way. */}
            <iframe
              key={status.url}
              className="assistant-source-frame"
              title={frameTitle}
              src={status.url}
              referrerPolicy="no-referrer"
            />
            <p className="assistant-source-hint">
              Link xem chỉ có hiệu lực khoảng một phút. Nếu khung trống hoặc báo
              hết hạn, bấm “Tải lại nguồn”.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
