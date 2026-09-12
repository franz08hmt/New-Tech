import {
  ArrowUpRightIcon,
  DocumentArrowUpIcon,
  SparklesIcon,
  WalletIcon,
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
import { CourseCarousel } from "./CourseCarousel";
import { DocumentsPanel } from "./DocumentsPanel";
import type { Workspace } from "./use-workspace";

/**
 * The body of each route.
 *
 * Split out of App so that App is only the shell — navigation, routing, focus
 * management and the assistant panel. Each page is a small function here, which
 * is also how we explain the app: one place for "where am I", one for "what is
 * on this page".
 */
export function PageSections({
  pageId,
  workspace,
}: {
  pageId: string;
  workspace: Workspace;
}) {
  if (pageId === "dashboard")
    return <DashboardSections workspace={workspace} />;
  if (pageId === "courses") {
    return (
      <>
        <CourseCarousel />
        <CoursesPanel expanded />
      </>
    );
  }
  if (pageId === "tasks") return <TasksPanel workspace={workspace} expanded />;
  if (pageId === "exams") {
    return (
      <>
        <ExamsPanel />
        <p className="page-note">
          These dates demonstrate the layout. Course and exam management are
          planned features.
        </p>
      </>
    );
  }
  if (pageId === "research") {
    return (
      <>
        <ResearchPanel />
        <section className="secondary-panel" aria-label="Research notes">
          <NotesPanel />
        </section>
      </>
    );
  }
  if (pageId === "documents") return <DocumentsPanel />;
  if (pageId === "finances") return <FinancesSection />;
  if (pageId === "assistant") return <AssistantSection />;
  return null;
}

function DashboardSections({ workspace }: { workspace: Workspace }) {
  return (
    <div className="dashboard-grid">
      <TasksPanel workspace={workspace} />
      <CalendarPanel />
      <section
        className="study-library full-width"
        aria-labelledby="study-library-title"
      >
        <DocumentArrowUpIcon aria-hidden="true" />
        <header>
          <h2 id="study-library-title">Your study library</h2>
          <p>Keep course materials together for your next review session.</p>
        </header>
        <a href="#documents">
          Browse documents <ArrowUpRightIcon aria-hidden="true" />
        </a>
      </section>
      <section className="full-width" aria-label="Courses">
        <CoursesPanel />
      </section>
      <section className="full-width" aria-label="Exams">
        <ExamsPanel compact />
      </section>
      <ResearchPanel />
      <NotesPanel />
    </div>
  );
}

const BUDGET_CATEGORIES = [
  { name: "Books & materials", planned: 500_000, spent: 380_000 },
  { name: "Transport", planned: 600_000, spent: 545_000 },
  { name: "Project resources", planned: 400_000, spent: 120_000 },
];

const MONTHLY_BUDGET = 3_000_000;

const money = new Intl.NumberFormat("vi-VN");

function FinancesSection() {
  const planned = BUDGET_CATEGORIES.reduce((sum, row) => sum + row.planned, 0);
  const spent = BUDGET_CATEGORIES.reduce((sum, row) => sum + row.spent, 0);

  return (
    <Panel title="Student budget" icon={<WalletIcon />}>
      <p className="view-label">
        Monthly overview{" "}
        <span className="example-label">Illustrative budget · VND</span>
      </p>
      <dl className="budget-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <dt>Monthly budget</dt>
          <dd>{money.format(MONTHLY_BUDGET)} ₫</dd>
        </div>
        <div>
          <dt>Planned expenses</dt>
          <dd>{money.format(planned)} ₫</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{money.format(MONTHLY_BUDGET - spent)} ₫</dd>
        </div>
      </dl>

      <ul className="budget-bars">
        {BUDGET_CATEGORIES.map((row) => {
          const used = Math.round((row.spent / row.planned) * 100);
          return (
            <li key={row.name}>
              <label htmlFor={`budget-${row.name}`}>
                {row.name}
                <span>
                  {money.format(row.spent)} / {money.format(row.planned)} ₫
                </span>
              </label>
              <progress
                id={`budget-${row.name}`}
                value={row.spent}
                max={row.planned}
              >
                {used}%
              </progress>
            </li>
          );
        })}
      </ul>

      <p className="page-note">
        Budget data is illustrative. No financial records are stored or
        connected.
      </p>
    </Panel>
  );
}

function AssistantSection() {
  return (
    <Panel title="Ask ExaMate" icon={<SparklesIcon />}>
      <p className="page-note">
        Planned feature: answers grounded in your approved project documents,
        with citations you can check. The AI provider is not configured yet.
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
        You can continue managing tasks while the assistant is unavailable.
      </p>
    </Panel>
  );
}
