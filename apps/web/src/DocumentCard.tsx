import {
  ArrowPathIcon,
  DocumentTextIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { ChangeEvent } from "react";

export type DocumentLifecycle =
  "selected" | "uploading" | "processing" | "ready" | "failed";

interface DocumentCardProps {
  name: string;
  size: number;
  state: DocumentLifecycle;
  onRemove: () => void;
  onStateChange: (state: DocumentLifecycle) => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentState({
  name,
  state,
  onRetry,
}: Pick<DocumentCardProps, "name" | "state"> & { onRetry: () => void }) {
  if (state === "uploading") {
    return (
      <p className="document-state document-state--uploading">
        <span>Uploading · Mock 64%</span>
        <progress
          aria-label={`Upload progress for ${name}`}
          max="100"
          value="64"
        >
          64%
        </progress>
      </p>
    );
  }

  if (state === "processing") {
    return (
      <p className="document-state document-state--processing" aria-busy="true">
        Processing document · Mock state
      </p>
    );
  }

  if (state === "ready") {
    return (
      <p className="document-state document-state--ready">
        Ready · Available to Assistant
      </p>
    );
  }

  if (state === "failed") {
    return (
      <p className="document-state document-state--failed">
        <span>Failed · Example extraction error</span>
        <button type="button" onClick={onRetry}>
          <ArrowPathIcon aria-hidden="true" />
          <span className="sr-only">Retry {name}</span>
        </button>
      </p>
    );
  }

  return (
    <p className="document-state document-state--selected">
      Selected locally · Not uploaded
    </p>
  );
}

export function DocumentCard({
  name,
  size,
  state,
  onRemove,
  onStateChange,
}: DocumentCardProps) {
  function changePreview(event: ChangeEvent<HTMLSelectElement>) {
    onStateChange(event.currentTarget.value as DocumentLifecycle);
  }

  return (
    <article className={`document-card document-card--${state}`}>
      <DocumentTextIcon aria-hidden="true" />
      <section className="document-card-details">
        <h4>{name}</h4>
        <p>{formatFileSize(size)} · PDF</p>
        <DocumentState
          name={name}
          state={state}
          onRetry={() => onStateChange("selected")}
        />
      </section>
      <footer className="document-card-actions">
        <label>
          <span>Preview state</span>
          <select
            aria-label={`Preview state for ${name}`}
            value={state}
            onChange={changePreview}
          >
            <option value="selected">Selected</option>
            <option value="uploading">Uploading</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
          </select>
          <small>Frontend demo only</small>
        </label>
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove}>
          <TrashIcon aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}
