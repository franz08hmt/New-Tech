import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  WalletIcon,
  BookOpenIcon,
  SparklesIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowUpRightIcon,
  QuestionMarkCircleIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";
import {
  CalendarPanel,
  CoursesPanel,
  ExamsPanel,
  NotesPanel,
  Panel,
  ResearchPanel,
} from "./AcademicPanels";
import { TasksPanel } from "./TasksPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { useWorkspace } from "./use-workspace";

const pages = [
  {
    id: "dashboard",
    name: "Dashboard",
    icon: Squares2X2Icon,
    title: "Student academic dashboard",
    description:
      "A little structure. A lot of possibility. Make space for your best work.",
  },
  {
    id: "courses",
    name: "Courses",
    icon: AcademicCapIcon,
    title: "Your learning journey",
    description:
      "One place for the subjects, ideas and skills you’re exploring.",
  },
  {
    id: "tasks",
    name: "Tasks",
    icon: ListBulletIcon,
    title: "Small steps. Real progress.",
    description:
      "Plan the work, share the load, and keep moving forward together.",
  },
  {
    id: "exams",
    name: "Exams",
    icon: ClipboardDocumentListIcon,
    title: "A little more prepared",
    description:
      "Keep upcoming assessments in view and give yourself room to prepare.",
  },
  {
    id: "research",
    name: "Research",
    icon: MagnifyingGlassIcon,
    title: "Follow your curiosity",
    description:
      "Collect ideas, explore the evidence, and build something meaningful.",
  },
  {
    id: "documents",
    name: "Documents",
    icon: DocumentArrowUpIcon,
    title: "Your trusted study sources",
    description:
      "Collect the materials CourseMate will use for review and grounded answers.",
  },
  {
    id: "finances",
    name: "Finances",
    icon: WalletIcon,
    title: "Room in your budget",
    description: "A simple view of the resources behind your academic journey.",
  },
  {
    id: "assistant",
    name: "Assistant",
    icon: SparklesIcon,
    title: "Meet your study companion",
    description:
      "CourseMate will connect your questions to the evidence in your documents.",
  },
];
function currentPage() {
  return (
    pages.find((page) => page.id === window.location.hash.slice(1)) || pages[0]
  );
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const workspace = useWorkspace();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu) {
        setMenu(false);
        menuToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#main-content") {
        document.getElementById("main-content")?.focus();
        return;
      }
      setPage(currentPage());
      setMenu(false);
      setSearch("");
      requestAnimationFrame(() => heading.current?.focus());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = `${page.name} · CourseMate AI`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", page.description);
  }, [page]);
  const navigation = pages.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="desktop-shell">
        <aside
          id="workspace-navigation"
          className={`sidebar ${menu ? "menu-open" : ""}`}
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
                C<span>m</span>
              </span>
              <span>
                CourseMate
                <span className="brand-subtitle">Your academic space</span>
              </span>
            </a>
            <button
              className="mobile-close"
              aria-label="Close navigation"
              onClick={() => {
                setMenu(false);
                menuToggle.current?.focus();
              }}
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
              onChange={(event) => setSearch(event.target.value)}
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
                    aria-current={page.id === item.id ? "page" : undefined}
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
                Tài & Thắng<small>Student workspace</small>
              </span>
            </span>
          </footer>
        </aside>
        <div className="workspace-body">
          <header className="breadcrumb">
            <button
              className="menu-toggle"
              ref={menuToggle}
              aria-controls="workspace-navigation"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Bars3Icon />
            </button>
            <span>
              <AcademicCapIcon /> Workspace{" "}
              <span className="crumb-divider">/</span> {page.name}
            </span>
            <span className="private-label">Personal workspace</span>
          </header>
          <figure className="cover">
            <img
              src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1600&q=85"
              alt="Bright, quiet study space with a desk, books and natural daylight"
              width="1600"
              height="450"
              fetchPriority="high"
            />
            <figcaption className="cover-caption">
              A PLACE TO THINK. A SPACE TO GROW.
            </figcaption>
          </figure>
          <main id="main-content" tabIndex={-1}>
            <header className="page-heading">
              <span className="page-emblem">
                <AcademicCapIcon aria-hidden="true" />
              </span>
              <p className="eyebrow">YOUR SPACE TO MAKE THINGS HAPPEN</p>
              <h1 ref={heading} tabIndex={-1}>
                {page.title}
              </h1>
              <p>{page.description}</p>
            </header>
            {page.id === "dashboard" && (
              <div className="dashboard-grid">
                <CalendarPanel />
                <TasksPanel workspace={workspace} />
                <section className="full-width" aria-label="Courses">
                  <CoursesPanel />
                </section>
                <section className="full-width" aria-label="Exams">
                  <ExamsPanel />
                </section>
                <ResearchPanel />
                <NotesPanel />
              </div>
            )}
            {page.id === "courses" && <CoursesPanel expanded />}
            {page.id === "tasks" && (
              <TasksPanel workspace={workspace} expanded />
            )}
            {page.id === "exams" && (
              <>
                <ExamsPanel />
                <p className="page-note">
                  These dates demonstrate the layout. Course and exam management
                  are planned features.
                </p>
              </>
            )}
            {page.id === "research" && (
              <>
                <ResearchPanel />
                <section
                  className="secondary-panel"
                  aria-label="Research notes"
                >
                  <NotesPanel />
                </section>
              </>
            )}
            {page.id === "documents" && <DocumentsPanel />}
            {page.id === "finances" && (
              <Panel title="Student budget" icon={<WalletIcon />}>
                <p className="view-label">
                  Monthly overview{" "}
                  <span className="example-label">
                    Illustrative budget · VND
                  </span>
                </p>
                <dl className="budget-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <dt>Monthly budget</dt>
                    <dd>3,000,000 ₫</dd>
                  </div>
                  <div>
                    <dt>Planned expenses</dt>
                    <dd>1,500,000 ₫</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>1,500,000 ₫</dd>
                  </div>
                </dl>
                <table className="exam-table">
                  <caption>Example study expenses</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Books & materials</th>
                      <td>500,000 ₫</td>
                    </tr>
                    <tr>
                      <th scope="row">Transport</th>
                      <td>600,000 ₫</td>
                    </tr>
                    <tr>
                      <th scope="row">Project resources</th>
                      <td>400,000 ₫</td>
                    </tr>
                  </tbody>
                </table>
                <p className="page-note">
                  Budget data is illustrative. No financial records are stored
                  or connected.
                </p>
              </Panel>
            )}
            {page.id === "assistant" && (
              <Panel title="Ask CourseMate" icon={<SparklesIcon />}>
                <p className="page-note">
                  Planned feature: answers grounded in your approved project
                  documents, with citations you can check. The AI provider is
                  not configured yet.
                </p>
                <label className="assistant-label">
                  Your question
                  <textarea
                    disabled
                    placeholder="What evidence is required for our final project?"
                  />
                </label>
                <button className="primary-button" disabled>
                  Ask after RAG setup
                </button>
                <p className="page-note">
                  You can continue managing tasks while the assistant is
                  unavailable.
                </p>
              </Panel>
            )}
            <footer className="page-footer">
              <span>Make a little progress, every day.</span>
              <a href="#tasks">
                Your next step <ArrowUpRightIcon />
              </a>
            </footer>
          </main>
        </div>
      </div>
      <details className="help">
        <summary aria-label="About this workspace">
          <QuestionMarkCircleIcon />
        </summary>
        <p>
          CourseMate AI · A student project by Tài & Thắng. Tasks connect to the
          project API. Academic examples are labelled; notes stay in this
          browser.
        </p>
      </details>
    </>
  );
}
