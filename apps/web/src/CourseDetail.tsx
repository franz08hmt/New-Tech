import {
  AcademicCapIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "./AcademicPanels";
import { courseIconFor } from "./academic-data";
import { CourseWorkspace } from "./CourseWorkspace";
import type { Course } from "./api";
import { useTr } from "./i18n";

export function CourseDetail({
  course,
  onDocumentsChanged,
}: {
  course?: Course;
  onDocumentsChanged?: () => void;
}) {
  const tr = useTr();
  if (!course) {
    return (
      <article className="course-detail-page course-not-found">
        <CourseBreadcrumb />
        <Panel title={tr("Course not found")} icon={<AcademicCapIcon />}>
          <p>
            {tr(
              "Không tìm thấy môn học minh họa này. Đường dẫn có thể chưa đầy đủ hoặc môn học không còn trong gallery.",
            )}
          </p>
          <a className="primary-button" href="#courses">
            {tr("Browse available courses")}
          </a>
        </Panel>
      </article>
    );
  }

  const CourseIcon = courseIconFor(course.slug);

  return (
    <article className="course-detail-page">
      <CourseBreadcrumb current={course.code} />

      <section
        className="course-summary"
        aria-labelledby="course-summary-title"
      >
        <span className={`course-art ${course.tone}`} aria-hidden="true">
          <CourseIcon />
        </span>
        <header className="course-summary-copy">
          <p className="example-label">{tr("Illustrative course guide")}</p>
          <h2 id="course-summary-title">{tr("At a glance")}</h2>
          <p>{course.detail}</p>
          <dl className="course-summary-meta">
            <div>
              <dt>{tr("Course code")}</dt>
              <dd>{course.code}</dd>
            </div>
            <div>
              <dt>{tr("Example progress")}</dt>
              <dd>{course.progress}%</dd>
            </div>
          </dl>
          <progress
            aria-label={tr("{name} example progress: {progress}%", {
              name: course.name,
              progress: course.progress,
            })}
            value={course.progress}
            max={100}
          >
            {course.progress}%
          </progress>
        </header>
      </section>

      <p className="page-note course-disclaimer">
        <strong>{tr("Illustrative, not an official syllabus.")}</strong>{" "}
        {tr(
          "These topics, outcomes, and assessment details are sample content for demonstrating ExaMate's course workspace.",
        )}
      </p>

      <section className="course-detail-grid" aria-label={tr("Course guide")}>
        <Panel title={tr("Course outline")} icon={<BookOpenIcon />}>
          <ol className="course-outline">
            {course.outline.map((topic, index) => (
              <li key={topic.title}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <section>
                  <h3>{topic.title}</h3>
                  <p>{topic.summary}</p>
                </section>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title={tr("Learning outcomes")} icon={<CheckCircleIcon />}>
          <ul className="course-outcomes">
            {course.outcomes.map((outcome) => (
              <li key={outcome}>
                <CheckCircleIcon aria-hidden="true" />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title={tr("Assessment approach")}
          icon={<ClipboardDocumentListIcon />}
        >
          <ul className="course-assessment">
            {course.assessment.map((item) => (
              <li key={item.method}>
                <header>
                  <h3>{item.method}</h3>
                  <strong>{item.weight_percent}%</strong>
                </header>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <CourseWorkspace
        course={course}
        onDocumentsChanged={onDocumentsChanged}
      />
    </article>
  );
}

function CourseBreadcrumb({ current }: { current?: string }) {
  const tr = useTr();
  return (
    <nav className="course-breadcrumbs" aria-label={tr("Course breadcrumbs")}>
      <a href="#courses">
        <ChevronLeftIcon aria-hidden="true" />
        {tr("Back to course gallery")}
      </a>
      {current && <span aria-current="page">{current}</span>}
    </nav>
  );
}
