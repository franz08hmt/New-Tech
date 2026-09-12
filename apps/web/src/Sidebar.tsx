import type { ComponentType, SVGProps } from "react";
import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

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
  const navigation = pages.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );

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
        <span className="sr-only">Find a page</span>
        <input
          type="search"
          placeholder="Find a page…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <kbd aria-hidden="true">⌕</kbd>
      </label>

      <p className="nav-heading">WORKSPACE</p>
      <nav aria-label="Primary">
        <ul>
          {navigation.map((item) => (
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
        {!navigation.length && (
          <p className="search-empty">No matching pages.</p>
        )}
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
