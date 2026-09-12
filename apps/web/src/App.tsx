import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  WalletIcon,
  SparklesIcon,
  Bars3Icon,
  ArrowUpRightIcon,
  QuestionMarkCircleIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";
import { AssistantPanel } from "./AssistantPanel";
import { PageSections } from "./PageSections";
import { Sidebar } from "./Sidebar";
import { useWorkspace } from "./use-workspace";

const pages = [
  {
    id: "dashboard",
    eyebrow: "YOUR SPACE TO LEARN & GROW",
    name: "Dashboard",
    icon: Squares2X2Icon,
    title: "Student academic dashboard",
    description:
      "A little structure. A lot of possibility. Make space for your best work.",
  },
  {
    id: "courses",
    eyebrow: "COURSE GALLERY",
    name: "Courses",
    icon: AcademicCapIcon,
    title: "Your learning journey",
    description:
      "One place for the subjects, ideas and skills you’re exploring.",
  },
  {
    id: "tasks",
    eyebrow: "TEAM WORKLOAD",
    name: "Tasks",
    icon: ListBulletIcon,
    title: "Small steps. Real progress.",
    description:
      "Plan the work, share the load, and keep moving forward together.",
  },
  {
    id: "exams",
    eyebrow: "ASSESSMENT SCHEDULE",
    name: "Exams",
    icon: ClipboardDocumentListIcon,
    title: "A little more prepared",
    description:
      "Keep upcoming assessments in view and give yourself room to prepare.",
  },
  {
    id: "research",
    eyebrow: "PROJECT BOARD",
    name: "Research",
    icon: MagnifyingGlassIcon,
    title: "Follow your curiosity",
    description:
      "Collect ideas, explore the evidence, and build something meaningful.",
  },
  {
    id: "documents",
    eyebrow: "SOURCE LIBRARY",
    name: "Documents",
    icon: DocumentArrowUpIcon,
    title: "Your trusted study sources",
    description:
      "Collect the materials ExaMate will use for review and grounded answers.",
  },
  {
    id: "finances",
    eyebrow: "SEMESTER BUDGET",
    name: "Finances",
    icon: WalletIcon,
    title: "Room in your budget",
    description: "A simple view of the resources behind your academic journey.",
  },
  {
    id: "assistant",
    eyebrow: "GROUNDED ANSWERS · PLANNED",
    name: "Assistant",
    icon: SparklesIcon,
    title: "Meet your study companion",
    description:
      "ExaMate will connect your questions to the evidence in your documents.",
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const assistantToggle = useRef<HTMLButtonElement>(null);
  const workspace = useWorkspace();

  function closeAssistant() {
    setAssistantOpen(false);
    assistantToggle.current?.focus();
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && assistantOpen) {
        closeAssistant();
        return;
      }
      if (event.key === "Escape" && menu) {
        setMenu(false);
        menuToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assistantOpen, menu]);
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
    document.title = `${page.name} · ExaMate AI`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", page.description);
  }, [page]);
  const isDashboard = page.id === "dashboard";
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className={`desktop-shell ${assistantOpen ? "assistant-open" : ""}`}>
        <Sidebar
          pages={pages}
          currentId={page.id}
          menuOpen={menu}
          search={search}
          onSearch={setSearch}
          onClose={() => {
            setMenu(false);
            menuToggle.current?.focus();
          }}
        />
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
            <span className="workspace-actions">
              <span className="private-label">Personal workspace</span>
              <button
                ref={assistantToggle}
                type="button"
                className="assistant-toggle"
                aria-label="Open ExaMate AI"
                aria-controls="examate-ai-panel"
                aria-expanded={assistantOpen}
                onClick={() => setAssistantOpen(true)}
              >
                <SparklesIcon aria-hidden="true" />
                <span>Ask AI</span>
              </button>
            </span>
          </header>
          <main id="main-content" tabIndex={-1}>
            {/* The full hero belongs to the dashboard only. On working pages a
                repeated photograph and a repeated shortcut row cost 38-42% of
                the page while saying nothing about the page you are on. */}
            <header
              className={`study-hero ${isDashboard ? "" : "study-hero--compact"}`}
            >
              <section className="page-heading" aria-label="Page introduction">
                <p className="eyebrow">{page.eyebrow}</p>
                {isDashboard && (
                  <p className="hero-greeting">Welcome back, Tài.</p>
                )}
                <h1 ref={heading} tabIndex={-1}>
                  {page.title}
                </h1>
                <p className="hero-description">{page.description}</p>
                {isDashboard && (
                  <nav className="hero-actions" aria-label="Study shortcuts">
                    <a className="primary-button" href="#documents">
                      <DocumentArrowUpIcon aria-hidden="true" />
                      Open documents
                    </a>
                    <button
                      className="hero-ai-button"
                      onClick={() => setAssistantOpen(true)}
                    >
                      <SparklesIcon aria-hidden="true" />
                      Ask ExaMate
                    </button>
                  </nav>
                )}
              </section>
              {isDashboard && (
                <figure className="study-photo">
                  <img
                    src="/img/hero-study.webp"
                    alt="Bright, quiet study space with a desk, books and natural daylight"
                    width="1200"
                    height="800"
                    fetchPriority="high"
                    decoding="async"
                  />
                  <figcaption>A place to think. A space to grow.</figcaption>
                </figure>
              )}
            </header>
            <PageSections pageId={page.id} workspace={workspace} />
            <footer className="page-footer">
              <span>Make a little progress, every day.</span>
              <a href="#tasks">
                Your next step <ArrowUpRightIcon />
              </a>
            </footer>
          </main>
        </div>
        {assistantOpen && (
          <AssistantPanel
            pageId={page.id}
            pageName={page.name}
            onClose={closeAssistant}
          />
        )}
      </div>
      <details className="help">
        <summary aria-label="About this workspace">
          <QuestionMarkCircleIcon />
        </summary>
        <p>
          ExaMate AI · A student project by Tài & Thắng. Tasks connect to the
          project API. Academic examples are labelled; notes stay in this
          browser.
        </p>
      </details>
    </>
  );
}
