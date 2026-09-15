import { DocumentTextIcon, TrashIcon } from "@heroicons/react/24/outline";

export type DocumentLifecycle =
  "selected" | "uploading" | "stored" | "failed" | "deleting" | "legacy";
interface DocumentCardProps {
  name: string;
  size: number | null;
  state: DocumentLifecycle;
  error?: string;
  busy?: boolean;
  onRemove: () => void;
  onUpload?: () => void;
  onDownload?: () => void;
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
}: DocumentCardProps) {
  return (
    <article className={`document-card document-card--${state}`}>
      <DocumentTextIcon aria-hidden="true" />
      <section className="document-card-details">
        <h4>{name}</h4>
        <p>
          {size === null
            ? "Unknown size"
            : `${(size / 1024 / 1024).toFixed(2)} MiB`}{" "}
          · PDF
        </p>
        <p
          className={`document-state document-state--${state}`}
          aria-busy={busy}
        >
          {state === "selected" && "Selected locally · Not uploaded"}
          {state === "uploading" && (
            <>
              Uploading…
              <progress aria-label={`Upload progress for ${name}`} />
            </>
          )}
          {state === "stored" && "Stored · File and metadata saved"}
          {state === "failed" && "Failed · File kept for retry"}
          {state === "deleting" && "Deletion pending · Retry delete to finish"}
          {state === "legacy" && "Legacy metadata · Storage not verified"}
        </p>
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
            aria-label={state === "failed" ? `Retry ${name}` : `Upload ${name}`}
            onClick={onUpload}
          >
            {state === "failed" ? "Retry" : "Upload"}
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            disabled={busy || state !== "stored"}
            aria-label={`Download ${name}`}
            onClick={onDownload}
          >
            Download
          </button>
        )}
        <button
          type="button"
          disabled={busy || state === "legacy"}
          aria-label={`${onUpload ? "Remove" : "Delete"} ${name}`}
          onClick={onRemove}
        >
          <TrashIcon aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}
