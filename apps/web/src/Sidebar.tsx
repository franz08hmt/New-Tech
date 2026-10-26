import type { ComponentType, SVGProps } from "react";
import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  KIND_LABELS,
  useWorkspaceSearch,
  workspaceSearchKinds,
} from "./use-search";
import type { WorkspaceSearchKind } from "@examate/contracts";
import { useTr } from "./i18n";

export type NavPage = {
  id: string;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Workspace navigation: brand, page search, primary nav and the semester
 * footer. Extracted from App so the shell file stays about routing and focus.
 */
export function Sidebar({
  pages,
  currentId,
  menuOpen,
  search,
  onSearch,
  onClose,
}: {
  pages: readonly NavPage[];
  currentId: string;
  menuOpen: boolean;
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
}) {
  const tr = useTr();
  const results = useWorkspaceSearch(search);

  return (
    <aside
      id="workspace-navigation"
      className={`sidebar ${menuOpen ? "menu-open" : ""}`}
      aria-label={tr("Workspace navigation")}
    >
      <header className="sidebar-header">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <a className="brand" href="#dashboard">
          <span className="brand-logo">
            {/* A ticked answer box: the mark reads as "checked", which is
                what ExaMate is for. Decorative — the name follows it. */}
            <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <rect width="32" height="32" rx="9" fill="#526750" />
              <rect
                x="7.5"
                y="7.5"
                width="17"
                height="17"
                rx="5"
                fill="none"
                stroke="#eef3ea"
                strokeWidth="1.6"
                opacity="0.45"
              />
              <path
                d="M11 16.3 14.5 19.8 21.4 12.4"
                fill="none"
                stroke="#f4f7f0"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            {tr("ExaMate")}
            <span className="brand-subtitle">{tr("Your academic space")}</span>
          </span>
        </a>
        <button
          className="mobile-close"
          aria-label={tr("Close navigation")}
          onClick={onClose}
        >
          <XMarkIcon />
        </button>
      </header>

      <label className="sidebar-search">
        <MagnifyingGlassIcon />
        {/* Named on the input itself: the label also holds a decorative
            keycap, and its text would otherwise leak into the accessible
            name. */}
        <input
          type="search"
          aria-label={tr("Find an object")}
          placeholder={tr("Find an object…")}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <kbd aria-hidden="true">⌕</kbd>
      </label>

      {results.searching && (
        <section className="sidebar-results" aria-label={tr("Search results")}>
          {results.tooShort && (
            <p role="status" className="search-empty">
              {tr("Nhập ít nhất 2 ký tự có chữ hoặc số.")}
            </p>
          )}
          {results.unsupported && (
            <p role="status" className="search-empty">
              {tr(
                "Từ khóa không có ký tự tìm kiếm phù hợp. Hãy thử chữ tiếng Việt, chữ Latin hoặc chữ số.",
              )}
            </p>
          )}
          {!results.tooShort && (
            <div className="sidebar-search-controls">
              <label>
                {tr("Loại")}
                <select
                  aria-label={tr("Filter search results by type")}
                  value={results.kind}
                  onChange={(event) =>
                    results.setKind(event.target.value as WorkspaceSearchKind)
                  }
                >
                  <option value="all">{tr("Tất cả loại")}</option>
                  {workspaceSearchKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Sắp xếp")}
                <select
                  aria-label={tr("Sort search results")}
                  value={results.sort}
                  onChange={(event) =>
                    results.setSort(event.target.value as "kind" | "label")
                  }
                >
                  <option value="kind">{tr("Loại")}</option>
                  <option value="label">{tr("Tên")}</option>
                </select>
              </label>
              <button
                type="button"
                aria-label={
                  results.direction === "asc"
                    ? tr("Change to descending order")
                    : tr("Change to ascending order")
                }
                onClick={() =>
                  results.setDirection(
                    results.direction === "asc" ? "desc" : "asc",
                  )
                }
              >
                {results.direction === "asc"
                  ? tr("↑ Tăng dần")
                  : tr("↓ Giảm dần")}
              </button>
            </div>
          )}
          {results.loading && (
            <p role="status" className="search-empty">
              {tr("Đang tìm…")}
            </p>
          )}
          {results.error && (
            <div role="alert" className="search-empty">
              <p>{results.error}</p>
              <button type="button" onClick={results.retry}>
                {tr("Thử tìm lại")}
              </button>
            </div>
          )}
          {!results.tooShort &&
            !results.unsupported &&
            !results.loading &&
            !results.error &&
            !results.total && (
              <p className="search-empty">{tr("Không tìm thấy gì khớp.")}</p>
            )}
          {!results.tooShort &&
            !results.unsupported &&
            !results.loading &&
            !results.error && (
              <p className="search-count" role="status">
                {results.total} {tr("kết quả")}
              </p>
            )}
          {results.hits.length > 0 && !results.unsupported && (
            <ul>
              {results.hits.map((hit) => (
                <li key={hit.key}>
                  <a href={hit.href} onClick={() => onSearch("")}>
                    <strong>{hit.label}</strong>
                    <small>
                      {KIND_LABELS[hit.kind]}
                      {hit.detail ? ` · ${hit.detail}` : ""}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {results.totalPages > 1 &&
            !results.unsupported &&
            !results.loading &&
            !results.error && (
              <nav
                className="sidebar-search-pagination"
                aria-label={tr("Search result pages")}
              >
                <button
                  type="button"
                  disabled={results.page <= 1}
                  onClick={results.previousPage}
                >
                  {tr("Trước")}
                </button>
                <span>
                  {results.page} / {results.totalPages}
                </span>
                <button
                  type="button"
                  disabled={results.page >= results.totalPages}
                  onClick={results.nextPage}
                >
                  {tr("Sau")}
                </button>
              </nav>
            )}
        </section>
      )}

      <p className="nav-heading">{tr("WORKSPACE")}</p>
      <nav aria-label={tr("Primary")}>
        <ul>
          {pages.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={currentId === item.id ? "page" : undefined}
              >
                <item.icon aria-hidden="true" />
                {tr(item.name)}
                {item.id === "assistant" && <small>{tr("Soon")}</small>}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="sidebar-footer">
        <p className="semester-label">
          <BookOpenIcon /> {tr("A fresh chapter")}
          <span>{tr("Semester 01 · 2026")}</span>
        </p>
        <span className="profile">
          <span className="profile-avatar">T</span>
          <span>
            {tr("Tài & Thắng")}
            <small>{tr("Student workspace")}</small>
          </span>
        </span>
      </footer>
    </aside>
  );
}
