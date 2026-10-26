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
import { ExamsSearchPanel } from "./ExamsSearchPanel";
import { StudyPlanPanel } from "./StudyPlanPanel";
import { StudyPlansSearchPanel } from "./StudyPlansSearchPanel";
import { ExpensesSearchPanel } from "./ExpensesSearchPanel";
import { CourseDetail } from "./CourseDetail";
import { CoursesSearchPanel } from "./CoursesSearchPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { AiUsageDashboard } from "./AiUsageDashboard";
import { MembersPanel } from "./MembersPanel";
import { StudyCoachWorkspace } from "./StudyCoachWorkspace";
import type { CoursesState } from "./use-courses";
import type { CourseLookupState } from "./use-course-lookup";
import type { Workspace } from "./use-workspace";
import { useTr } from "./i18n";

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
  courseLookup,
  workspace,
  onOpenAssistant,
  onDocumentsChanged,
  focusId,
}: {
  pageId: string;
  courseSlug?: string;
  /** The one record a link pointed at, so a page can reveal it. */
  focusId?: string;
  coursesState: CoursesState;
  courseLookup: CourseLookupState;
  workspace: Workspace;
  onOpenAssistant: (opener: HTMLElement) => void;
  onDocumentsChanged: () => void;
}) {
  const tr = useTr();
  if (pageId === "dashboard")
    return (
      <DashboardSections workspace={workspace} coursesState={coursesState} />
    );
  if (pageId === "courses" && courseSlug !== undefined) {
    if (courseLookup.loading)
      return (
        <section className="panel" role="status" aria-busy="true">
          <h2>{tr("Loading course")}</h2>
          <p>{tr("Opening this course in the current workspace…")}</p>
        </section>
      );
    if (courseLookup.error)
      return (
        <section className="panel" role="alert">
          <h2>{tr("Course unavailable")}</h2>
          <p>
            {tr(
              "This course could not be loaded in the current workspace. Check your connection and retry.",
            )}
          </p>
          <a className="text-button" href="#courses">
            {tr("Back to course gallery")}
          </a>
          <button
            className="primary-button"
            type="button"
            onClick={courseLookup.retry}
          >
            {tr("Retry course")}
          </button>
        </section>
      );
    if (!courseLookup.course)
      return (
        <section className="panel" role="status">
          <h2>{tr("Course unavailable")}</h2>
          <p>{tr("This course is not available in the current workspace.")}</p>
          <a className="text-button" href="#courses">
            {tr("Back to course gallery")}
          </a>
        </section>
      );
    return (
      <CourseDetail
        course={courseLookup.course ?? undefined}
        onDocumentsChanged={onDocumentsChanged}
      />
    );
  }
  if (pageId === "courses") return <CoursesSearchPanel />;
  if (pageId === "tasks")
    return <TasksPanel workspace={workspace} expanded focusId={focusId} />;
  if (pageId === "exams") {
    return (
      <>
        <ExamsSearchPanel focusId={focusId} />
        <p className="page-note">
          {tr(
            "Lịch thi được lưu trong cơ sở dữ liệu của workspace. Các kỳ thi có sẵn là dữ liệu minh hoạ để bạn thử. Thành viên và người quản lý có thể thêm, sửa kỳ thi; chỉ người quản lý mới có thể xoá.",
          )}
        </p>
      </>
    );
  }
  if (pageId === "study-plan") {
    return (
      <>
        <StudyPlansSearchPanel focusId={focusId} />
        <section className="secondary-panel" aria-label={tr("Quick notes")}>
          <NotesPanel />
        </section>
      </>
    );
  }
  if (pageId === "documents")
    return (
      <DocumentsPanel
        onDocumentsChanged={onDocumentsChanged}
        focusId={focusId}
      />
    );
  if (pageId === "study-coach")
    return <StudyCoachWorkspace focusId={focusId} />;
  if (pageId === "finances") return <ExpensesSearchPanel focusId={focusId} />;
  if (pageId === "ai-usage") return <AiUsageDashboard />;
  if (pageId === "members") return <MembersPanel />;
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
  const tr = useTr();
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
          <h2 id="study-library-title">{tr("Your study library")}</h2>
          <p>
            {tr("Keep course materials together for your next review session.")}
          </p>
        </header>
        <a href="#documents">
          {tr("Browse documents")} <ArrowUpRightIcon aria-hidden="true" />
        </a>
      </section>
      <section className="full-width" aria-label={tr("Courses")}>
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
      <section className="full-width" aria-label={tr("Exams")}>
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
  const tr = useTr();
  if (state === "loading") {
    return (
      <section
        className="panel course-data-state"
        aria-busy="true"
        aria-live="polite"
      >
        <h2>{tr("Loading courses")}</h2>
        <p>{tr("Đang mở danh sách môn học từ workspace…")}</p>
      </section>
    );
  }

  return (
    <section
      className="panel course-data-state"
      {...(state === "error" ? { role: "alert" } : {})}
    >
      <h2>
        {state === "error" ? tr("Courses need a moment") : tr("No courses yet")}
      </h2>
      <p>
        {message ??
          tr(
            "Chưa có môn học nào ở đây. Khi môn học được thêm vào, chúng sẽ hiện ngay tại đây.",
          )}
      </p>
      <button className="primary-button" type="button" onClick={onRetry}>
        {tr("Retry courses")}
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
  const tr = useTr();
  return (
    <Panel title={tr("Ask ExaMate")} icon={<SparklesIcon />}>
      <p className="page-note">
        {tr(
          "ExaMate AI sẽ trả lời dựa trên chính tài liệu môn học bạn đã tải lên, kèm nguồn dẫn để bạn tự kiểm tra lại. Hãy lập chỉ mục tài liệu trước, rồi chọn chế độ phù hợp trong khung Assistant.",
        )}
      </p>
      <button
        type="button"
        className="primary-button"
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <SparklesIcon aria-hidden="true" />
        {tr("Show ExaMate AI panel")}
      </button>
      <p className="page-note">
        {tr(
          "Trong AI Chat, chọn kiến thức chung hoặc tài liệu đã lập chỉ mục. Hỏi workspace tra cứu riêng dữ liệu đã lưu và không thay đổi dữ liệu đó.",
        )}
      </p>
    </Panel>
  );
}
