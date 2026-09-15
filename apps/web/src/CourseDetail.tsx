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

export function CourseDetail({ course }: { course?: Course }) {
  if (!course) {
    return (
      <article className="course-detail-page course-not-found">
        <CourseBreadcrumb />
        <Panel title="Course not found" icon={<AcademicCapIcon />}>
          <p>
            Không tìm thấy môn học minh họa này. Đường dẫn có thể chưa đầy đủ
            hoặc môn học không còn trong gallery.
          </p>
          <a className="primary-button" href="#courses">
            Browse available courses
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
          <p className="example-label">Illustrative course guide</p>
          <h2 id="course-summary-title">At a glance</h2>
          <p>{course.detail}</p>
          <dl className="course-summary-meta">
            <div>
              <dt>Course code</dt>
              <dd>{course.code}</dd>
            </div>
            <div>
              <dt>Example progress</dt>
              <dd>{course.progress}%</dd>
            </div>
          </dl>
          <progress
            aria-label={`${course.name} example progress: ${course.progress}%`}
            value={course.progress}
            max={100}
          >
            {course.progress}%
          </progress>
        </header>
      </section>

      <p className="page-note course-disclaimer">
        <strong>Illustrative, not an official syllabus.</strong> These topics,
        outcomes, and assessment details are sample content for demonstrating
        ExaMate&apos;s course workspace.
      </p>

      <section className="course-detail-grid" aria-label="Course guide">
        <Panel title="Course outline" icon={<BookOpenIcon />}>
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

        <Panel title="Learning outcomes" icon={<CheckCircleIcon />}>
          <ul className="course-outcomes">
            {course.outcomes.map((outcome) => (
              <li key={outcome}>
                <CheckCircleIcon aria-hidden="true" />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Assessment approach" icon={<ClipboardDocumentListIcon />}>
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

      <CourseWorkspace course={course} />
    </article>
  );
}

function CourseBreadcrumb({ current }: { current?: string }) {
  return (
    <nav className="course-breadcrumbs" aria-label="Course breadcrumbs">
      <a href="#courses">
        <ChevronLeftIcon aria-hidden="true" />
        Back to course gallery
      </a>
      {current && <span aria-current="page">{current}</span>}
    </nav>
  );
}
