import { DocumentTextIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { StoredDocument } from "./api";
import { useTr } from "./i18n";

export type DocumentLifecycle =
  "selected" | "uploading" | "stored" | "failed" | "deleting" | "legacy";
interface DocumentCardProps {
  name: string;
  size: number | null;
  state: DocumentLifecycle;
  error?: string;
  busy?: boolean;
  onRemove?: () => void;
  onUpload?: () => void;
  onDownload?: () => void;
  processingStatus?: StoredDocument["processing_status"];
  indexQuality?: StoredDocument["index_quality"];
  onProcess?: () => void;
  indexUnconfirmed?: boolean;
  onCheckStatus?: () => void;
  onCreateQuiz?: () => void;
}
export function DocumentCard({
  name,
  size,
  state,
  error,
  busy,
  onRemove,
  onUpload,
  onDownload,
  processingStatus,
  indexQuality,
  onProcess,
  indexUnconfirmed,
  onCheckStatus,
  onCreateQuiz,
}: DocumentCardProps) {
  const tr = useTr();
  const processLabel =
    processingStatus === "failed"
      ? tr("Retry indexing")
      : processingStatus === "ready"
        ? tr("Re-index")
        : tr("Index");

  return (
    <article className={`document-card document-card--${state}`}>
      <DocumentTextIcon aria-hidden="true" />
      <section className="document-card-details">
        <h4>{name}</h4>
        <p>
          {size === null
            ? tr("Unknown size")
            : tr("{value} MiB", {
                value: (size / 1024 / 1024).toFixed(2),
              })}{" "}
          {tr("· PDF")}
        </p>
        <p
          className={`document-state document-state--${state}`}
          aria-busy={busy}
        >
          {state === "selected" && tr("Selected locally · Not uploaded")}
          {state === "uploading" && (
            <>
              {tr("Uploading…")}
              <progress
                aria-label={tr("Upload progress for {name}", { name })}
              />
            </>
          )}
          {state === "stored" && tr("Stored · File and metadata saved")}
          {state === "failed" && tr("Failed · File kept for retry")}
          {state === "deleting" &&
            tr("Deletion pending · Retry delete to finish")}
          {state === "legacy" && tr("Legacy metadata · Storage not verified")}
        </p>
        {indexUnconfirmed && (
          <p className="document-state" role="status">
            {tr(
              "Chưa xác nhận được trạng thái chỉ mục. Kiểm tra trạng thái trước khi lập chỉ mục lại.",
            )}
          </p>
        )}
        {processingStatus && !indexUnconfirmed && (
          <p
            className={`document-state document-state--${processingStatus}`}
            aria-live="polite"
          >
            {processingStatus === "pending" &&
              tr("AI index · Waiting to be indexed")}
            {processingStatus === "processing" && tr("AI index · Processing…")}
            {processingStatus === "ready" &&
              tr("AI index · Searchable content ready")}
            {processingStatus === "failed" &&
              tr("AI index · Failed, retry available")}
          </p>
        )}
        {!indexUnconfirmed && processingStatus === "ready" && indexQuality && (
          <p className="document-index-quality">
            {tr("Độ phủ: đọc được")} {indexQuality.useful_text_page_count}/
            {indexQuality.total_page_count} {tr("trang ·")}{" "}
            {indexQuality.indexed_chunk_count} {tr("đoạn tìm kiếm")}
            {indexQuality.ocr_page_count > 0 &&
              tr(" · {ocr_page_count} trang được OCR", {
                ocr_page_count: indexQuality.ocr_page_count,
              })}
            {indexQuality.needs_ocr &&
              tr(
                " · Cảnh báo: {low_text_page_count} trang có ít chữ; “sẵn sàng” không có nghĩa đã đọc hết nội dung trong ảnh",
                { low_text_page_count: indexQuality.low_text_page_count },
              )}
          </p>
        )}
        {!indexUnconfirmed && processingStatus === "ready" && !indexQuality && (
          <p className="document-index-quality">
            {tr(
              "Chưa có thống kê độ phủ · Re-index để kiểm tra chất lượng văn bản",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      <footer className="document-card-actions">
        {/* The filename lives in aria-label, not in the visible text. A button
            captioned with a 200-character name made this column as wide as the
            name itself, squeezing the details column down to one letter per
            line. Screen readers still hear which file each button acts on. */}
        {onUpload && (
          <button
            type="button"
            disabled={busy}
            aria-label={
              state === "failed"
                ? tr("Retry {name}", { name })
                : tr("Upload {name}", { name })
            }
            onClick={onUpload}
          >
            {state === "failed" ? tr("Retry") : tr("Upload")}
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            disabled={busy || state !== "stored"}
            aria-label={tr("Download {name}", { name })}
            onClick={onDownload}
          >
            {tr("Download")}
          </button>
        )}
        {onProcess && processingStatus && (
          <button
            type="button"
            disabled={
              busy ||
              indexUnconfirmed ||
              state !== "stored" ||
              processingStatus === "processing"
            }
            aria-label={`${processLabel} ${name}`}
            onClick={onProcess}
          >
            {processingStatus === "processing" ? tr("Indexing…") : processLabel}
          </button>
        )}
        {onCreateQuiz && (
          <button
            type="button"
            disabled={
              busy || state !== "stored" || processingStatus !== "ready"
            }
            aria-label={tr("Create quiz from {name}", { name })}
            onClick={onCreateQuiz}
          >
            {tr("Create quiz")}
          </button>
        )}
        {onCheckStatus && (
          <button
            type="button"
            disabled={busy}
            style={{ minHeight: 44 }}
            aria-label={tr("Check index status {name}", { name })}
            onClick={onCheckStatus}
          >
            {tr("Check index status")}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            disabled={busy || state === "legacy"}
            aria-label={`${onUpload ? tr("Remove") : tr("Delete")} ${name}`}
            onClick={onRemove}
          >
            <TrashIcon aria-hidden="true" />
          </button>
        )}
      </footer>
    </article>
  );
}
