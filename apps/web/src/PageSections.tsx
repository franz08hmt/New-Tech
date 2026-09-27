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
import { BudgetPanel } from "./BudgetPanel";
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
  onOpenAssistant,
}: {
  pageId: string;
  courseSlug?: string;
  coursesState: CoursesState;
  workspace: Workspace;
  onOpenAssistant: (opener: HTMLElement) => void;
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
  if (pageId === "finances") return <BudgetPanel />;
  if (pageId === "assistant")
    return <AssistantSection onOpen={onOpenAssistant} />;
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

/**
 * The assistant page. It used to carry its own disabled textarea — a second
 * draft that could never be sent either. Now it explains what the assistant
 * will do and opens the one shared panel, which arriving here also does.
 */
function AssistantSection({
  onOpen,
}: {
  onOpen: (opener: HTMLElement) => void;
}) {
  return (
    <Panel title="Ask ExaMate" icon={<SparklesIcon />}>
      <p className="page-note">
        ExaMate AI sẽ trả lời dựa trên chính tài liệu môn học bạn đã tải lên,
        kèm nguồn dẫn để bạn tự kiểm tra lại. Phần AI đang được Thắng kết nối,
        nên hiện bạn mới chuẩn bị được câu hỏi.
      </p>
      <button
        type="button"
        className="primary-button"
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <SparklesIcon aria-hidden="true" />
        Show ExaMate AI panel
      </button>
      <p className="page-note">
        Bạn vẫn quản lý công việc, lịch thi và tài liệu bình thường trong lúc
        chờ.
      </p>
    </Panel>
  );
}
