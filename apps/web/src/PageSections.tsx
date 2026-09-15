import {
  ArrowUpRightIcon,
  DocumentArrowUpIcon,
  SparklesIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import {
  CalendarPanel,
  CoursesPanel,
  NotesPanel,
  Panel,
} from "./AcademicPanels";
import { TasksPanel } from "./TasksPanel";
import { ExamsPanel } from "./ExamsPanel";
import { StudyPlanPanel } from "./StudyPlanPanel";
import { CourseCarousel } from "./CourseCarousel";
import { CourseDetail } from "./CourseDetail";
import { DocumentsPanel } from "./DocumentsPanel";
import type { CoursesState } from "./use-courses";
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
  courseSlug,
  coursesState,
  workspace,
}: {
  pageId: string;
  courseSlug?: string;
  coursesState: CoursesState;
  workspace: Workspace;
}) {
  if (pageId === "dashboard")
    return (
      <DashboardSections workspace={workspace} coursesState={coursesState} />
    );
  if (pageId === "courses" && courseSlug !== undefined) {
    if (coursesState.loading)
      return <CourseDataState state="loading" onRetry={coursesState.retry} />;
    if (coursesState.error)
      return (
        <CourseDataState
          state="error"
          message={coursesState.error}
          onRetry={coursesState.retry}
        />
      );
    return (
      <CourseDetail
        course={coursesState.courses.find(
          (course) => course.slug === courseSlug,
        )}
      />
    );
  }
  if (pageId === "courses") {
    if (coursesState.loading)
      return <CourseDataState state="loading" onRetry={coursesState.retry} />;
    if (coursesState.error)
      return (
        <CourseDataState
          state="error"
          message={coursesState.error}
          onRetry={coursesState.retry}
        />
      );
    if (coursesState.courses.length === 0)
      return <CourseDataState state="empty" onRetry={coursesState.retry} />;
    return (
      <>
        <CourseCarousel courses={coursesState.courses} />
        <CoursesPanel courses={coursesState.courses} expanded />
      </>
    );
  }
  if (pageId === "tasks") return <TasksPanel workspace={workspace} expanded />;
  if (pageId === "exams") {
    return (
      <>
        <ExamsPanel />
        <p className="page-note">
          Lịch thi được lưu trong cơ sở dữ liệu của workspace. Các kỳ thi có sẵn
          là dữ liệu minh hoạ để bạn thử, cứ xoá đi và thêm kỳ thi của riêng
          bạn.
        </p>
      </>
    );
  }
  if (pageId === "study-plan") {
    return (
      <>
        <StudyPlanPanel />
        <section className="secondary-panel" aria-label="Quick notes">
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

function DashboardSections({
  workspace,
  coursesState,
}: {
  workspace: Workspace;
  coursesState: CoursesState;
}) {
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
        {coursesState.loading ? (
          <CourseDataState state="loading" onRetry={coursesState.retry} />
        ) : coursesState.error ? (
          <CourseDataState
            state="error"
            message={coursesState.error}
            onRetry={coursesState.retry}
          />
        ) : coursesState.courses.length ? (
          <CoursesPanel courses={coursesState.courses} />
        ) : (
          <CourseDataState state="empty" onRetry={coursesState.retry} />
        )}
      </section>
      <section className="full-width" aria-label="Exams">
        <ExamsPanel compact />
      </section>
      <StudyPlanPanel compact />
      <NotesPanel />
    </div>
  );
}

function CourseDataState({
  state,
  message,
  onRetry,
}: {
  state: "loading" | "error" | "empty";
  message?: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <section
        className="panel course-data-state"
        aria-busy="true"
        aria-live="polite"
      >
        <h2>Loading courses</h2>
        <p>Đang mở danh sách môn học từ workspace…</p>
      </section>
    );
  }

  return (
    <section
      className="panel course-data-state"
      {...(state === "error" ? { role: "alert" } : {})}
    >
      <h2>{state === "error" ? "Courses need a moment" : "No courses yet"}</h2>
      <p>
        {message ??
          "Chưa có môn học nào ở đây. Khi môn học được thêm vào, chúng sẽ hiện ngay tại đây."}
      </p>
      <button className="primary-button" type="button" onClick={onRetry}>
        Retry courses
      </button>
    </section>
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
