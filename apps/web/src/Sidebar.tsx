import type { ComponentType, SVGProps } from "react";
import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { KIND_LABELS, useWorkspaceSearch } from "./use-search";

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
  const results = useWorkspaceSearch(search);

  return (
    <aside
      id="workspace-navigation"
      className={`sidebar ${menuOpen ? "menu-open" : ""}`}
      aria-label="Workspace navigation"
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
            ExaMate
            <span className="brand-subtitle">Your academic space</span>
          </span>
        </a>
        <button
          className="mobile-close"
          aria-label="Close navigation"
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
          aria-label="Find an object"
          placeholder="Find an object…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <kbd aria-hidden="true">⌕</kbd>
      </label>

      {results.searching && (
        <section className="sidebar-results" aria-label="Search results">
          {results.loading && (
            <p role="status" className="search-empty">
              Đang tìm…
            </p>
          )}
          {results.error && (
            <p role="alert" className="search-empty">
              {results.error}
            </p>
          )}
          {!results.loading && !results.error && !results.total && (
            <p className="search-empty">Không tìm thấy gì khớp.</p>
          )}
          {results.groups.map(([kind, hits]) => (
            <div key={kind}>
              <p className="result-kind">{KIND_LABELS[kind]}</p>
              <ul>
                {hits.map((hit) => (
                  <li key={hit.key}>
                    <a href={hit.href} onClick={() => onSearch("")}>
                      <strong>{hit.label}</strong>
                      <small>{hit.detail}</small>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {results.truncated && (
            <p className="search-empty">Còn nữa — gõ thêm cho hẹp bớt nhé.</p>
          )}
        </section>
      )}

      <p className="nav-heading">WORKSPACE</p>
      <nav aria-label="Primary">
        <ul>
          {pages.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={currentId === item.id ? "page" : undefined}
              >
                <item.icon aria-hidden="true" />
                {item.name}
                {item.id === "assistant" && <small>Soon</small>}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="sidebar-footer">
        <p className="semester-label">
          <BookOpenIcon /> A fresh chapter<span>Semester 01 · 2026</span>
        </p>
        <span className="profile">
          <span className="profile-avatar">T</span>
          <span>
            Tài &amp; Thắng<small>Student workspace</small>
          </span>
        </span>
      </footer>
    </aside>
  );
}
