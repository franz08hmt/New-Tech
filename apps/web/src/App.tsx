import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  WalletIcon,
  SparklesIcon,
  Bars3Icon,
  ArrowUpRightIcon,
  QuestionMarkCircleIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";
import { AssistantPanel } from "./AssistantPanel";
import { api } from "./api";
import { PageSections } from "./PageSections";
import { Sidebar } from "./Sidebar";
import { useFocusTarget } from "./use-focus-target";
import { useAssistant } from "./use-assistant";
import { useCourses } from "./use-courses";
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
    id: "study-plan",
    eyebrow: "REVISION BOARD",
    name: "Study plan",
    icon: ClipboardDocumentCheckIcon,
    title: "One subject at a time",
    description:
      "What each subject still needs from you before its exam, in one list.",
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
type Page = (typeof pages)[number];

interface AppRoute {
  page: Page;
  courseSlug?: string;
  /** An object on that page to scroll to, set by a search result. */
  focusId?: string;
}

function currentRoute(): AppRoute {
  const hashRoute = window.location.hash.slice(1);
  const coursePage = pages.find((page) => page.id === "courses")!;

  if (hashRoute.startsWith("courses/")) {
    const courseSlug = hashRoute.slice("courses/".length);
    return {
      page: coursePage,
      courseSlug,
    };
  }

  // Every other page may carry one id after a slash, the same shape a course
  // slug already uses: "#exams/<exam id>". A page with no suffix is unchanged,
  // so existing links keep working.
  const [pageId, focusId] = hashRoute.split("/");
  return {
    page: pages.find((page) => page.id === pageId) || pages[0],
    focusId: focusId || undefined,
  };
}

/** Below this width the assistant becomes a modal bottom sheet. */
const NARROW_SCREEN = "(max-width: 767px)";

/**
 * Whether the viewport is phone-sized, kept current as it changes.
 *
 * Guarded because matchMedia is absent in some environments — jsdom among
 * them — and treating that as "wide" gives the non-modal window, the safer of
 * the two layouts to fall back to.
 */
function useNarrowScreen() {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_SCREEN).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(NARROW_SCREEN);
    const update = () => setNarrow(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, []);
  return narrow;
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  useFocusTarget(route.focusId);
  const [menu, setMenu] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // The conversation lives here, above the panel, so hiding the panel or
  // changing page never takes the draft with it.
  const assistant = useAssistant(async (question, pageContext) => {
    const response = await api.askAssistant({ message: question, pageContext });
    return { text: response.answer, citations: [] };
  });
  const narrow = useNarrowScreen();
  const modal = assistantOpen && narrow;
  const modalOpen = useRef(false);
  modalOpen.current = modal;
  const launcher = useRef<HTMLButtonElement>(null);
  // Whichever control opened the panel, so closing can hand focus back to it.
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const workspace = useWorkspace();
  const coursesState = useCourses();
  const selectedCourse = route.courseSlug
    ? coursesState.courses.find((course) => course.slug === route.courseSlug)
    : undefined;
  const courseResolved = !coursesState.loading && !coursesState.error;
  const page =
    route.courseSlug !== undefined
      ? {
          ...route.page,
          eyebrow: selectedCourse
            ? `${selectedCourse.code} · ILLUSTRATIVE COURSE`
            : "COURSE DIRECTORY",
          name:
            selectedCourse?.name ??
            (courseResolved ? "Course not found" : "Course details"),
          title:
            selectedCourse?.name ??
            (courseResolved ? "Course not found" : "Course details"),
          description:
            selectedCourse?.detail ??
            (courseResolved
              ? "That address does not match a course in the example gallery."
              : "Loading this course from the ExaMate workspace."),
        }
      : route.page;

  function openAssistant(from: HTMLElement | null) {
    opener.current = from;
    setAssistantOpen(true);
  }

  function closeAssistant() {
    restoreFocus.current = true;
    setAssistantOpen(false);
  }

  // Focus goes back once the panel has actually closed, not in the same breath
  // as closing it: while a modal sheet is still up the page behind is inert,
  // and focusing something inert simply fails.
  useEffect(() => {
    if (assistantOpen || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = opener.current?.isConnected
      ? opener.current
      : launcher.current;
    target?.focus();
  }, [assistantOpen]);

  // The assistant page is a way in to the same panel, not a second one:
  // arriving there opens it. Keyed on the page, so closing it while on that
  // page does not immediately reopen it.
  useEffect(() => {
    if (route.page.id === "assistant") openAssistant(null);
  }, [route.page.id]);

  // A modal sheet stops the page behind it from scrolling, and gives the
  // scroll back exactly as it found it.
  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modal]);

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
      const next = currentRoute();
      setRoute(next);
      setMenu(false);
      setSearch("");
      if (modalOpen.current || next.page.id === "assistant") return;
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
      {/* Outside the shell, so it needs its own inert: leave it reachable and
          Tab escapes a modal sheet through it. */}
      <a href="#main-content" className="skip-link" inert={modal}>
        Skip to main content
      </a>
      <div className="desktop-shell" inert={modal}>
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
                      onClick={(event) => openAssistant(event.currentTarget)}
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
            <PageSections
              pageId={page.id}
              courseSlug={route.courseSlug}
              coursesState={coursesState}
              workspace={workspace}
              onOpenAssistant={openAssistant}
            />
            <footer className="page-footer">
              <span>Make a little progress, every day.</span>
              <a href="#tasks">
                Your next step <ArrowUpRightIcon />
              </a>
            </footer>
          </main>
        </div>
      </div>
      <AssistantPanel
        open={assistantOpen}
        modal={modal}
        pageId={page.id}
        pageName={page.name}
        assistant={assistant}
        onClose={closeAssistant}
      />
      {/* Help and the AI launcher share one corner as a single stack, so
          neither can land on top of the other. */}
      <div className="floating-controls" inert={modal}>
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
        <button
          ref={launcher}
          type="button"
          className="ai-launcher"
          aria-label="Open ExaMate AI"
          aria-controls="examate-ai-panel"
          aria-expanded={assistantOpen}
          onClick={(event) =>
            assistantOpen
              ? closeAssistant()
              : openAssistant(event.currentTarget)
          }
        >
          <SparklesIcon aria-hidden="true" />
          <span className="ai-launcher-tip" aria-hidden="true">
            {assistantOpen ? "Hide ExaMate AI" : "Ask ExaMate AI"}
          </span>
        </button>
      </div>
    </>
  );
}
