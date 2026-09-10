import { useState, type ChangeEvent } from "react";
import {
  CircleStackIcon,
  DocumentArrowUpIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface LocalDocument {
  id: string;
  name: string;
  size: number;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validatePdf(file: File) {
  if (file.type !== "application/pdf") {
    return `${file.name}: Only PDF files are accepted.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name}: File size must not exceed 10 MB.`;
  }
  return null;
}

/**
 * Two picks of the same file on disk produce the same name, size and
 * lastModified, so this doubles as the React list key.
 */
function documentId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function describeSelection(added: number, duplicates: number) {
  if (!added) {
    return duplicates === 1
      ? "That PDF is already in the list."
      : "Those PDFs are already in the list.";
  }
  const selected = `${added} PDF ${added === 1 ? "was" : "were"} selected for local preview.`;
  if (!duplicates) return selected;
  return `${selected} ${duplicates} already in the list ${duplicates === 1 ? "was" : "were"} skipped.`;
}

export function DocumentsPanel() {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const picker = event.currentTarget;
    const files = Array.from(picker.files ?? []);
    const validationError = files.map(validatePdf).find(Boolean);

    setError(validationError ?? "");
    setNotice("");

    if (!files.length || validationError) {
      picker.value = "";
      return;
    }

    // Track ids as we go so one selection cannot add the same file twice.
    const seen = new Set(documents.map((item) => item.id));
    const selected: LocalDocument[] = [];
    let duplicates = 0;

    for (const file of files) {
      const id = documentId(file);
      if (seen.has(id)) {
        duplicates += 1;
        continue;
      }
      seen.add(id);
      selected.push({ id, name: file.name, size: file.size });
    }

    setDocuments((current) => [...current, ...selected]);
    setNotice(describeSelection(selected.length, duplicates));
    picker.value = "";
  }

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
            <p>Prepare trusted course and project sources for future review.</p>
          </span>
        </header>

        <section className="upload-panel" aria-labelledby="upload-title">
          <DocumentArrowUpIcon aria-hidden="true" />
          <h3 id="upload-title">Add study documents</h3>
          <p id="upload-help">
            Choose PDF files up to 10 MB each. This frontend checkpoint keeps
            metadata only for the current page session.
          </p>
          <label className="file-picker">
            Choose PDF files
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              aria-describedby="upload-help upload-boundary"
              onChange={selectFiles}
            />
          </label>
          <p id="upload-boundary" className="upload-boundary">
            No file is uploaded, stored or indexed yet.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </section>

        <section
          className="selected-documents"
          aria-labelledby="selected-title"
        >
          <header>
            <h3 id="selected-title">Selected documents</h3>
            <span>{documents.length} local</span>
          </header>
          {documents.length ? (
            <ul>
              {documents.map((document) => (
                <li key={document.id}>
                  <article className="document-card">
                    <DocumentTextIcon aria-hidden="true" />
                    <span>
                      <strong>{document.name}</strong>
                      <small>{formatFileSize(document.size)} · PDF</small>
                      <small className="local-status">
                        Selected locally · Not uploaded
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${document.name}`}
                      onClick={() =>
                        setDocuments((current) =>
                          current.filter((item) => item.id !== document.id),
                        )
                      }
                    >
                      <TrashIcon aria-hidden="true" />
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-message" role="status">
              No local files selected yet. Your future document collection will
              appear here.
            </p>
          )}
        </section>
      </section>

      <aside className="document-roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">How Assistant will use documents</h2>
        <ol>
          <li>
            <ShieldCheckIcon aria-hidden="true" />
            <span>
              <strong>Validate and store</strong>
              <small>Backend responsibility · not implemented</small>
            </span>
          </li>
          <li>
            <CircleStackIcon aria-hidden="true" />
            <span>
              <strong>Extract and index</strong>
              <small>Text, chunks and source locations</small>
            </span>
          </li>
          <li>
            <MagnifyingGlassIcon aria-hidden="true" />
            <span>
              <strong>Retrieve with citations</strong>
              <small>Assistant searches only ready documents</small>
            </span>
          </li>
        </ol>
        <p>
          Browser validation is for user feedback only. The future API must
          verify size, MIME type and file contents again before storage.
        </p>
      </aside>
    </section>
  );
}
