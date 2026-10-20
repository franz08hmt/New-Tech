import { useCallback, useContext } from "react";
import type {
  CourseSearchItem,
  CourseSearchPage,
  CourseSearchQuery,
} from "./api";
import { api } from "./api";
import { CoursesPanel } from "./AcademicPanels";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { usePagedSearch } from "./use-paged-search";

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
        <h2 id="course-search-title">Find a course</h2>
        <div className="paged-search-toolbar course-search-toolbar">
          <label className="paged-search-field">
            Search courses
            <input
              aria-label="Search courses"
              type="search"
              maxLength={120}
              value={search.query.q ?? ""}
              onChange={(event) => search.setQuery({ q: event.target.value })}
              placeholder="Name, code, slug or detail"
            />
          </label>
          <label>
            Minimum progress
            <input
              aria-label="Minimum progress"
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
            Maximum progress
            <input
              aria-label="Maximum progress"
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
            Sort courses by
            <select
              aria-label="Sort courses by"
              value={search.query.sort ?? "name"}
              onChange={(event) =>
                search.setQuery({
                  sort: event.target.value as CourseSearchQuery["sort"],
                })
              }
            >
              <option value="name">Name</option>
              <option value="code">Code</option>
              <option value="progress">Progress</option>
            </select>
          </label>
          <label>
            Direction
            <select
              aria-label="Course sort direction"
              value={search.query.direction ?? "asc"}
              onChange={(event) =>
                search.setQuery({
                  direction: event.target.value as "asc" | "desc",
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <label>
            Page size
            <select
              aria-label="Courses per page"
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
            Reset filters
          </button>
        </div>
        {!identity ? (
          <p role="status" className="page-note">
            Sign in to view courses.
          </p>
        ) : search.tooShort ? (
          <p role="status" className="page-note">
            Enter at least two characters, or clear the field to browse all
            courses.
          </p>
        ) : rangeInvalid ? (
          <p role="alert" className="error-message">
            Minimum progress cannot exceed maximum progress.
          </p>
        ) : search.unsupported ? (
          <p role="status" className="page-note">
            This search text has no supported characters. Try another term.
          </p>
        ) : search.loading ? (
          <p role="status" aria-busy="true" className="empty-message">
            Loading courses…
          </p>
        ) : search.error ? (
          <p role="alert" className="error-message">
            {search.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={search.retry}
            >
              Retry courses
            </button>
          </p>
        ) : search.page?.total === 0 ? (
          <p role="status" className="empty-message">
            No courses match this search.
          </p>
        ) : search.page ? (
          <p role="status" className="page-note">
            {search.page.total} course{search.page.total === 1 ? "" : "s"} ·
            page {search.page.page} of {search.page.totalPages}
          </p>
        ) : null}
      </section>

      {search.page &&
        search.page.total > 0 &&
        !search.error &&
        !rangeInvalid && (
          <>
            {search.items.length ? (
              <CoursesPanel courses={search.items} expanded />
            ) : (
              <section className="panel" aria-label="Course results">
                <p className="empty-message">
                  This page has no courses. The filtered total is{" "}
                  {search.page.total}.
                </p>
              </section>
            )}
            <nav className="paged-search-pagination" aria-label="Course pages">
              <button
                type="button"
                className="secondary-button"
                disabled={search.query.page <= 1 || search.loading}
                onClick={() => search.setPage(search.query.page - 1)}
              >
                Previous
              </button>
              <span>
                Page {search.page.page} of {search.page.totalPages}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  search.query.page >= search.page.totalPages || search.loading
                }
                onClick={() => search.setPage(search.query.page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
    </>
  );
}
