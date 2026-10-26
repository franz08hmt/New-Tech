import { useCallback, useContext } from "react";
import type {
  CourseSearchItem,
  CourseSearchPage,
  CourseSearchQuery,
} from "./api";
import { api } from "./api";
import { CoursesPanel } from "./AcademicPanels";
import { CourseCarousel } from "./CourseCarousel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { usePagedSearch } from "./use-paged-search";
import { useTr } from "./i18n";

const INITIAL_QUERY: CourseSearchQuery & { page: number; pageSize: number } = {
  q: "",
  progressMin: undefined,
  progressMax: undefined,
  sort: "name",
  direction: "asc",
  page: 1,
  pageSize: 20,
};

function validProgressRange(query: CourseSearchQuery) {
  return (
    query.progressMin === undefined ||
    query.progressMax === undefined ||
    query.progressMin <= query.progressMax
  );
}

export function CoursesSearchPanel() {
  const tr = useTr();
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const load = useCallback(
    (query: CourseSearchQuery, signal: AbortSignal) =>
      api.searchCourses(query, signal),
    [],
  );
  const search = usePagedSearch<
    CourseSearchItem,
    CourseSearchQuery & { page: number; pageSize: number },
    CourseSearchPage
  >(identity, INITIAL_QUERY, load, {
    enabled: (query) => Boolean(identity) && validProgressRange(query),
  });
  const rangeInvalid = !validProgressRange(search.query);

  return (
    <>
      <section className="panel" aria-labelledby="course-search-title">
        <h2 id="course-search-title">{tr("Find a course")}</h2>
        <div className="paged-search-toolbar course-search-toolbar">
          <label className="paged-search-field">
            {tr("Search courses")}
            <input
              aria-label={tr("Search courses")}
              type="search"
              maxLength={120}
              value={search.query.q ?? ""}
              onChange={(event) => search.setQuery({ q: event.target.value })}
              placeholder={tr("Name, code, slug or detail")}
            />
          </label>
          <label>
            {tr("Minimum progress")}
            <input
              aria-label={tr("Minimum progress")}
              type="number"
              min={0}
              max={100}
              value={search.query.progressMin ?? ""}
              onChange={(event) =>
                search.setQuery({
                  progressMin:
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            {tr("Maximum progress")}
            <input
              aria-label={tr("Maximum progress")}
              type="number"
              min={0}
              max={100}
              value={search.query.progressMax ?? ""}
              onChange={(event) =>
                search.setQuery({
                  progressMax:
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            {tr("Sort courses by")}
            <select
              aria-label={tr("Sort courses by")}
              value={search.query.sort ?? "name"}
              onChange={(event) =>
                search.setQuery({
                  sort: event.target.value as CourseSearchQuery["sort"],
                })
              }
            >
              <option value="name">{tr("Name")}</option>
              <option value="code">{tr("Code")}</option>
              <option value="progress">{tr("Progress")}</option>
            </select>
          </label>
          <label>
            {tr("Direction")}
            <select
              aria-label={tr("Course sort direction")}
              value={search.query.direction ?? "asc"}
              onChange={(event) =>
                search.setQuery({
                  direction: event.target.value as "asc" | "desc",
                })
              }
            >
              <option value="asc">{tr("Ascending")}</option>
              <option value="desc">{tr("Descending")}</option>
            </select>
          </label>
          <label>
            {tr("Page size")}
            <select
              aria-label={tr("Courses per page")}
              value={search.query.pageSize}
              onChange={(event) =>
                search.setQuery({ pageSize: Number(event.target.value) })
              }
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => search.setQuery({ ...INITIAL_QUERY })}
          >
            {tr("Reset filters")}
          </button>
        </div>
        {!identity ? (
          <p role="status" className="page-note">
            {tr("Sign in to view courses.")}
          </p>
        ) : search.tooShort ? (
          <p role="status" className="page-note">
            {tr(
              "Enter at least two characters, or clear the field to browse all courses.",
            )}
          </p>
        ) : rangeInvalid ? (
          <p role="alert" className="error-message">
            {tr("Minimum progress cannot exceed maximum progress.")}
          </p>
        ) : search.unsupported ? (
          <p role="status" className="page-note">
            {tr(
              "This search text has no supported characters. Try another term.",
            )}
          </p>
        ) : search.loading && !search.page ? (
          <p role="status" aria-busy="true" className="empty-message">
            {tr("Loading courses…")}
          </p>
        ) : search.error ? (
          <p role="alert" className="error-message">
            {search.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={search.retry}
            >
              {tr("Retry courses")}
            </button>
          </p>
        ) : search.page?.total === 0 ? (
          <p role="status" className="empty-message">
            {tr("No courses match this search.")}
          </p>
        ) : search.page ? (
          <p role="status" className="page-note">
            {tr(
              search.page.total === 1
                ? "{total} course · page {page} of {pages}"
                : "{total} courses · page {page} of {pages}",
              {
                total: search.page.total,
                page: search.page.page,
                pages: search.page.totalPages,
              },
            )}
          </p>
        ) : null}
      </section>

      {search.page &&
        search.page.total > 0 &&
        !search.error &&
        !rangeInvalid && (
          <>
            {search.items.length ? (
              <>
                <CourseCarousel key={identity} courses={search.items} />
                <section aria-label={tr("Course results")}>
                  <CoursesPanel courses={search.items} expanded />
                </section>
              </>
            ) : (
              <section className="panel" aria-label={tr("Course results")}>
                <p className="empty-message">
                  {tr("This page has no courses. The filtered total is")}{" "}
                  {search.page.total}.
                </p>
              </section>
            )}
            <nav
              className="paged-search-pagination"
              aria-label={tr("Course pages")}
            >
              <button
                type="button"
                className="secondary-button"
                disabled={search.query.page <= 1 || search.loading}
                onClick={() => search.setPage(search.query.page - 1)}
              >
                {tr("Previous")}
              </button>
              <span>
                {tr("Page")} {search.page.page} {tr("of")}{" "}
                {search.page.totalPages}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  search.query.page >= search.page.totalPages || search.loading
                }
                onClick={() => search.setPage(search.query.page + 1)}
              >
                {tr("Next")}
              </button>
            </nav>
          </>
        )}
    </>
  );
}
