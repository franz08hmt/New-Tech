import {
  useCallback,
  useEffect,
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
import { api, type StoredDocument } from "./api";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
interface LocalDocument {
  id: string;
  file: File;
  state: "selected" | "uploading" | "failed";
  error?: string;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Operation failed. Please retry.";

export function DocumentsPanel() {
  const [selected, setSelected] = useState<LocalDocument[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const busy = useRef(new Set<string>());
  const revision = useRef(0);
  const reload = useCallback(async () => {
    if (busy.current.size) return;
    const current = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.listDocuments();
      if (current === revision.current) setDocuments(result);
    } catch (caught) {
      if (current === revision.current) setError(message(caught));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => {
      revision.current++;
    };
  }, [reload]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
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
    setBusyIds([...busy.current]);
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
    if (!begin(item.id)) return;
    setSelected((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, state: "uploading", error: undefined }
          : row,
      ),
    );
    try {
      const stored = await api.uploadDocument(item.file);
      setDocuments((current) => [
        stored,
        ...current.filter((row) => row.id !== stored.id),
      ]);
      setSelected((current) => current.filter((row) => row.id !== item.id));
      setNotice(`${stored.name} stored successfully.`);
    } catch (caught) {
      setSelected((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, state: "failed", error: message(caught) }
            : row,
        ),
      );
    } finally {
      finish(item.id);
    }
  }
  async function remove(item: StoredDocument) {
    if (
      !window.confirm(
        `Delete ${item.name} from the shared workspace and Storage?`,
      )
    )
      return;
    if (!begin(item.id)) return;
    try {
      await api.deleteDocument(item.id);
      setDocuments((current) => current.filter((row) => row.id !== item.id));
      setNotice(`${item.name} deleted.`);
    } catch (caught) {
      setError(
        `${message(caught)} Refresh the list and retry delete to finish any pending deletion.`,
      );
    } finally {
      finish(item.id);
    }
  }
  async function download(item: StoredDocument) {
    if (!begin(item.id)) return;
    try {
      const { url } = await api.downloadDocument(item.id);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      anchor.click();
    } catch (caught) {
      setError(message(caught));
    } finally {
      finish(item.id);
    }
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
              accept=".pdf,application/pdf"
              multiple
              aria-describedby="upload-help upload-boundary"
              onChange={selectFiles}
            />
          </label>
          <p id="upload-boundary" className="upload-boundary">
            Uploaded PDFs are saved in private Storage with database metadata.
            Shared demo workspace · no login or AI processing.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </section>
        {selected.length > 0 && (
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
              {loading
                ? "…"
                : documents.filter((item) => item.storage_status === "stored")
                    .length}{" "}
              stored
            </span>
            <button
              type="button"
              disabled={loading || busyIds.length > 0}
              onClick={() => void reload()}
            >
              {error ? "Retry list" : "Refresh list"}
            </button>
          </header>
          {loading ? (
            <p aria-live="polite">Loading documents…</p>
          ) : (
            <ul>
              {documents.map((item) => (
                <li key={item.id}>
                  <DocumentCard
                    name={item.name}
                    size={item.size_bytes}
                    state={item.storage_status}
                    busy={busyIds.includes(item.id)}
                    onDownload={() => void download(item)}
                    onRemove={() => void remove(item)}
                  />
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && !documents.length && (
            <p className="empty-message">
              No stored documents yet. Upload a PDF to begin.
            </p>
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
              <small>Future plan · not implemented</small>
            </span>
          </li>
          <li>
            <MagnifyingGlassIcon aria-hidden="true" />
            <span>
              <strong>Retrieve with citations</strong>
              <small>Future plan · Assistant preview only</small>
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
