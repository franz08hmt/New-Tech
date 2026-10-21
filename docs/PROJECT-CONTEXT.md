# ExaMate — context hiện tại cho Tài, Thắng và agent

Cập nhật 21/10/2026. Đây là điểm tiếp tục công việc, không phải nhật ký từng lượt.
Git/source và kết quả kiểm mới có ưu tiên hơn checkpoint cũ trong báo cáo.

## F07 contract and local implementation

Assistant conversations are private to the verified `(workspace_id,user_id)`.
Migration 022 adds a conversation header, receipt-linked canonical turns, and
minimal create-key tombstones that prevent a delayed create retry from
recreating a deleted transcript;
only a fully completed answer with a matching server-issued receipt may append.
Clients send a conversation ID and optimistic version, never a transcript to
append. The server loads and verifies at most the latest six receipts for a
follow-up. Legacy requests without a conversation ID retain the current
receipt/history contract. Workspace mode may persist its visible turns but
does not send prior turns to the workspace query service.

The additive API is `POST/GET /api/assistant/conversations`,
`GET /api/assistant/conversations/:id/messages`,
`POST /api/assistant/conversations/:id/turns` for receipt-verified save retry,
`GET /api/assistant/conversations/create-keys/:createKey` for create outcome
reconciliation, and `DELETE /api/assistant/conversations/:id`; chat accepts optional
`conversationId`/`conversationVersion`. Lists and messages default to 20 and
cap at 50. A conversation is limited to 100 completed turns and 4 MiB of
canonical snapshots. Its expiry is fixed at creation + 90 days using database
time; reads do not extend it. Delete is a hard delete of conversation text and
turn rows, while receipt/feedback records remain independent. Expired content
is immediately unavailable to runtime queries and is physically purged only
through a bounded, dry-run-first maintenance command. Concurrent appends use an
expected version; a losing answer stays visible as unsaved and is never
replayed. A lost create acknowledgement is reconciled by its owner-scoped
create-key GET before any later create POST. A lost turn-save acknowledgement
is reconciled by paginated message GET using the receipt ID; only a confirmed
absence enables an explicit receipt-verified save POST. Neither path repeats
the AI request.

F07 local implementation and automated verification are complete in
`cc366bf` (schema/API) and `2d05453` (web UI). Browser acceptance was not
available in this session and remains pending. Migration 022 rollback is
dry-run-first and drops all three F07 tables with `RESTRICT`; it reports
transcript and idempotency-key rows
lost while preserving receipts, feedback, Auth, business data and F03/F04
state. Retention purges only expired transcript/header rows in bounded batches
and never removes receipts, feedback or create-key tombstones. Re-run against a
guarded PostgreSQL 17 disposable target: `npm run typecheck`, `npm test`,
`npm run build`, `npm run format:check`, and `npm run test:database`. Automated
success does not imply browser, Google live, cloud rollout or Thang's machine
acceptance. The final new gate run passed: API Vitest 384/384, API Node
856/856, Web Vitest 469/469, and PG17 database tests 472/472; all five gates
exited 0 with no failed, skipped, or cancelled tests. The database harness
distinguishes its historical 021-only fixtures from the current 022 contract;
no migration checksum or runtime grant changed for this fixture correction.

## F06 local checkpoint — code verified, browser pending (21/10/2026)

Implemented in `6fca9e3` (API/DB/contract) and `341776f` (web UI); starting
HEAD was `ef0450c` on `feature/tai-assistant-integration-20261018`.

F06 adds a manager-only read dashboard over the existing F03 telemetry. The
additive read routes are `GET /api/admin/ai-usage` and
`GET /api/admin/ai-usage/operations/:operationId/calls`. Migration 021 grants
only column-scoped SELECT to `examate_business` and installs workspace + fresh
manager-role SELECT policies; the Auth capability receives no telemetry read
grant. Runtime startup verifies capability contract v21 and refuses drift; it
does not repair grants. The migration uses the usual locked source preflight,
and local rollback removes only F06 policies, column grants and ledger 021,
preserving F03 telemetry and F04 admission rows.

The report defaults to seven calendar dates in Asia/Ho_Chi_Minh and permits at
most 90 inclusive dates, queried as UTC half-open `[from, day-after-to)`.
Operations are selected by `started_at`; expired operations and calls are
omitted. Summary, trend, model breakdown, total and requested operation page
are computed in one statement/snapshot. Model filtering selects operations
having a non-expired call for that exact model and counts only that model's
calls in every KPI/chart/table. Without a model filter, it counts all
non-expired calls belonging to matching operations. The operation outcome and
provider-call outcome remain separate; an operation with no provider calls is
valid. Bigint token totals remain decimal strings with sample counts and null
for no known values. Estimated cost is grouped by stored currency and
pricing-version; it is not recomputed, converted or treated as billing. TTFT
is not collected. Telemetry remains best-effort and is not the F04 quota ledger
or a realtime view of all blocked/in-flight requests.

The API integration fixture runs Nest with separate business/Auth LOGIN roles
(`NOBYPASSRLS`, non-owner) on disposable PostgreSQL 17. The F03 usage service
and Gemini wrapper remain real; only Supabase/Auth and SDK transport are
synthetic. It compares a wrapper-created row with persisted operation/call
records and adds synthetic aggregate cases for zero-call operations, multiple
calls, all usage states, large token sums, currencies/pricing versions, model
cohort, expiry and independent pagination summary. A separate migration test
checks manager/member RLS, Auth denial, conflict preflight, rollback preserving
telemetry, and reapply. Browser tools were not exposed in this session, so
F06 browser acceptance is `BROWSER_ACCEPTANCE_PENDING`; API/React tests are not
browser evidence. This does not change F05 browser acceptance, cloud rollout,
Google live or the Thắng machine status.

Final verification on source descended from `ef0450c`: `npm run typecheck`,
`npm test`, `npm run build`, `npm run format:check`, and guarded PG17
`npm run test:database` all exited 0. `npm test` passed API Vitest 365/365,
API Node 855/855, and Web 448/448 (1,668 total). PG17 database tests passed
470/470 across 39 serial files, with 0 failed, skipped or cancelled. Focused
F06 suites passed API query validation 24/24, Web dashboard 5/5, runtime HTTP/RLS
14/14 and migration lifecycle 1/1, also with 0 failed, skipped or cancelled.
Format was rerun after final
test and documentation edits. F06 is `F06_CODE_VERIFIED +
BROWSER_ACCEPTANCE_PENDING`, not full F06 acceptance. No cloud writes, paid
provider call, push or deployment occurred.

### F06.1 contract — bounded complete cost cohorts, model-preserving detail, safe dates

The additive cost detail route is
`GET /api/admin/ai-usage/cost-breakdown`. It pages complete totals by
currency (`group=currency`, default) or exact pricing-version groups for one
validated currency (`group=pricing_version&currency=USD`). Both use the same
date/operation/mode/outcome/model cohort, page default 20/max 50, exact decimal
strings, estimated-call counts, and explicit group/page metadata. Currency rows
sum all matching pricing versions without cross-currency totals. Pricing-version
pages expose the full exact currency total so later pages reconcile to the same
amount. Overview keeps full-cohort estimated/unknown call counts but no longer
returns a silently truncated cost list. Model rows show top 20 and expose total,
omitted model/call, and known-token/sample coverage. Provider-call detail
inherits the active overview model filter; SQL count, items and pagination share
that predicate.

Accepted report dates are `0001-01-01` through `9999-12-30`. The upper date is
exclusive-bound safe: adding one day yields the still-supported PostgreSQL date
`9999-12-31`; year 0000 and `9999-12-31` are rejected before workspace SQL.
Defaults are validated too, and the browser date controls share the bounds.

F06.1 keeps migration 021 and the least-privilege manager/RLS path unchanged;
the added cost endpoint reuses its business LOGIN SELECT capability and performs
fresh manager authorization. The regression fixture also writes a matching
synthetic cost row in the other tenant and confirms it does not affect totals.
Provider-call detail expires calls before both count and page selection. Query
rejections remain structured 400 responses, and the UI distinguishes invalid
date/filter input from a read/network failure. Browser acceptance is still
pending; these statements are API/UI test results only until a browser run is
available.

F06.1 verification on the final source tree: `npm run typecheck`, `npm test`,
`npm run build`, `npm run format:check`, and guarded PG17 `npm run test:database`
all exited 0. The fresh application run passed API Vitest 384/384 (27 files),
API Node 855/855, and Web 454/454 (29 files), 1,693 tests total. The database
runner passed 470/470 tests in 39 serial files with 0 failed, skipped, or
cancelled. Focused F06.1 query and dashboard suites passed 43/43 and 11/11;
new HTTP/RLS regressions are included in the full database run. No browser
automation was exposed, so F06 remains `F06_CODE_VERIFIED +
BROWSER_ACCEPTANCE_PENDING`, not full acceptance. Cloud rollout, Google live,
F05 browser acceptance, and the Thắng machine remain pending. No migration,
cloud write, paid provider call, push, or deployment occurred.

### F06.2 — synchronized dashboard refresh

Manual refresh now advances a shared read generation used independently in
overview, cost-breakdown, and open provider-detail request keys. Old keyed
results become non-current immediately; effects abort prior requests and guard
late responses even if the query is unchanged. The currently selected
currency/pricing-version page and filters stay in place. Cost-only retry still
reloads only that breakdown, and changing the operations page still does not
reload cost. Refresh regression coverage is in
`apps/web/src/AiUsageDashboard.test.tsx` (18/18 focused tests); full application
tests passed API Vitest 384/384, API Node 855/855, Web 461/461 (1,700 total).
Typecheck, build and format passed. Browser is unavailable, so visual/manual
acceptance remains pending. No API, database or migration behavior changed;
the database gate was not rerun for this frontend-only correction.

## F05.3.1 checkpoint — focused records and expense chart denominator

Implementation and regression tests: `b826f80`.

`useScopedRecord` now masks a focused lookup synchronously whenever its target
is already present on the current page. It also invalidates that lookup
generation; if the target later leaves the page/filter, a fresh scoped lookup
runs. This keeps a late response or stale lookup error from rendering beside a
matching row. Tasks, Study Plans, Exams, Expenses, and course lookup consumers
were reviewed; focused targets remain separate from items, totals, and
aggregates. Regression tests observed duplicate `data-focus-id` values (2
instead of 1) for Exams and Expenses before the fix, and verify one row,
fresh lookup on leaving scope, stale response/error masking, and principal
change afterward.

The Expenses course chart now scales each course total against the largest
course total in the active filtered aggregate. For totals 24,000 and 20,000,
bars are 100% and about 83.33%; the separate largest-single-expense card still
reports 10,000. Ratios use bounded integer arithmetic; amount totals remain
decimal strings/BigInt. Paging does not change the chart.

New verification on the final source: `npm run typecheck`, `npm test`,
`npm run build`, `npm run format:check`, and guarded PG17 `npm run test:database`
all exited 0. The application run passed API Vitest 341/341, API Node 855/855,
and Web 443/443 (1,639 total). The database runner completed 38 serial test
files successfully; it does not emit one aggregate test count. Browser tools
were not available in this session, so the requested desktop/mobile flows,
visual focus, overflow, and console checks remain `BROWSER_ACCEPTANCE_PENDING`.
This is code/test verification for F05.3.1, not browser acceptance or whole-F05
acceptance. No schema, API, or provider behavior changed.

## F05.3 checklist — server-side lists for the remaining five modules

Implementation order is Tasks → Courses → Exams → Study plans → Expenses.
Each slice adds an additive typed `/search` endpoint, short authorized
workspace query, page/filter/sort UI, focused regression, and a checkpoint
commit before starting the next slice. Common bounds are page 1–1,000,000,
pageSize default 20/max 50, trimmed optional `q` (blank means browse; nonblank
must be 2–120 characters), and the existing Vietnamese case/diacritic/`đ` and
punctuation fold. Repeated/non-scalar or malformed query values fail at the
HTTP boundary; a nonblank value folding empty returns
`SEARCH_QUERY_UNSUPPORTED` before SQL. All pages return items/page/pageSize/
total/totalPages from one tenant-scoped statement snapshot.

| Slice       | List consumer and separate consumers                                                                | Route/deep link                                       | Filters and sorts                                                           | Acceptance/check                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tasks       | `TasksPanel` full list; dashboard urgent tasks and complete count remain a separate legacy consumer | `#tasks/<id>`; add scoped ID lookup                   | status, owner/unassigned; title/status/due_date/created_at                  | API/DB tenant page/count, role controls/status update, focused target, FE stale query/page, focused + full gates            |
| Courses     | expanded `CoursesPanel`; dashboard gallery, selectors, Assistant context remain separate            | `#courses/<slug>`; use existing scoped slug lookup    | progress range; name/code/progress                                          | page beyond two rows, progress filter/sort, route lookup outside page, selector remains complete, focused + full gates      |
| Exams       | paged `ExamsSearchPanel`; dashboard next-exam summary and course selector remain separate           | `#exams/<id>`; scoped `GET /api/exams/:id`            | course, date range; exam date/time/topic/course                             | valid DATE boundaries, foreign course, stable sort, CRUD refresh, compact dashboard remains aggregate, focused + full gates |
| Study plans | `StudyPlansSearchPanel`; dashboard/course grouping and course selector remain separate consumers    | `#study-plan/<id>`; scoped `GET /api/study-plans/:id` | course, completed, owner/unassigned, due range; due/title/course/completed  | groups retained within page, all-match completion summary, toggle/CRUD refresh, focused + full gates                        |
| Expenses    | `ExpensesSearchPanel` paged list; course-workspace expense section remains separate                 | `#finances/<id>`; scoped ID lookup                    | category, course/unassigned, period date range; spent_on/amount/description | filtered total/count/largest/by-course independent of page, date preservation, CRUD refresh, focused + full gates           |

Selectors, course detail, dashboard summaries and compact course-workspace
sections have independent complete-data needs. Keep their legacy contracts where
still consumed, document them explicitly, and do not use a page as a summary or
selector. The paged primary list itself must not load the full legacy list.
Browser acceptance is required for whole F05.3; if browser automation is not
available, code verification remains distinct from browser acceptance.

### F05.3 Expenses checkpoint

The primary Finances screen now uses `GET /api/expenses/search`. Optional
trimmed metadata `q`, category, course or `unassigned`, inclusive `fromDate` /
`toDate`, allowlisted spent date/amount/description sort, direction, and bounded
page/pageSize are validated before the workspace transaction. Impossible dates
and reversed ranges are rejected. A single statement scopes rows and course
joins by workspace, then returns page items, exact VND totals as decimal strings,
largest amount, matching count, and per-course totals from the same filtered
snapshot. Page changes do not alter aggregates. `GET /api/expenses/:id` is a
scoped deep-link lookup whose focused card does not alter list totals.

The month/week/day/all period controls map to explicit inclusive calendar-date
ranges; custom dates preserve `YYYY-MM-DD` without UTC day shifts. Create and
manager-only delete keep existing write endpoints and trigger read-only search
refresh after confirmed success. The main screen does not load the legacy
unpaged expense list. The independent full course selector and the separate
course-workspace expense consumer retain their legacy list needs.

New focused evidence: real Nest HTTP plus disposable PostgreSQL 17 passed 1/1
using a business LOGIN that is non-owner and `NOBYPASSRLS`, with two workspaces,
more than two pages, Vietnamese/accent folding, punctuation, exact filtered
aggregates, null-course grouping, stable tie ordering, out-of-range totals,
role/membership checks, malformed filters, and scoped foreign-ID denial. The
focused Expenses FE/App selection passed 127/127; the old route was observed
RED as 404 before implementation. Final gates on this source checkpoint all
exited 0: typecheck, full `npm test`, build, format, and the guarded serial
PG17 `test:database`. The full application suite passed API Vitest 341/341,
API Node 855/855, and Web 434/434 (1,630 total). The database runner reports
per-file results; the new Expenses HTTP/PG17 file passed 1/1 with no skip,
failure or cancellation. No migration or provider call was added. No approved
browser automation capability was exposed; desktop/mobile visual acceptance
remains `BROWSER_ACCEPTANCE_PENDING`. This verifies all five F05.3 module code
paths, not browser acceptance or whole-project completion.

Study Plans contract: `GET /api/study-plans/search` accepts optional metadata `q`, course ID,
`completion=all|open|completed`, exact owner or `unassigned`, inclusive valid
`dueFrom`/`dueTo`, allowlisted due-date/title/course/completion sorting, and
bounded page/pageSize. Return the page plus all-filtered `total/completed/
remaining` in one workspace-scoped statement. `StudyPlansSearchPanel` uses the
paged endpoint and scoped `GET /api/study-plans/:id` for a focused deep-link
target outside the current page/filter without changing list totals. Keep the
dashboard/course-group consumers on the legacy list and course choices on the
independent selector. The primary screen preserves course grouping within each
page and role-gated create/toggle/delete. Acceptance includes date validation,
RLS, multi-page stable order, all-match summary, CRUD refresh, stale principal
responses and the focused/full test gates.

### F05.3 Tasks checkpoint

Tasks is the first completed vertical slice. `GET /api/tasks/search` accepts
optional folded `q`, status (`all|todo|in_progress|done`), exact owner or the
`unassigned` sentinel, sort (`title|status|due_date|created_at`), direction,
page (1–1,000,000), and pageSize (20 default, 50 maximum). One
workspace-authorized statement returns page items, total, and matching/done
summary; the existing array `GET /api/tasks` remains for the dashboard-only
urgent list and complete count. The Tasks screen does not load that full list.
`GET /api/tasks/:id` is a scoped deep-link lookup for a task outside the active
page, with a separate focused card that does not alter result totals.

The screen has debounced title/owner search, status and owner filters, sort,
direction, page size, reset, and distinct short/unsupported/loading/error/empty
states. Query and verified principal changes derive page 1 before dispatch;
abort and key/revision checks reject late results. Status/create writes retain
the existing mutation endpoints and then refresh via GET. The dashboard keeps
its distinct legacy summary consumer. Focused FE tests (12, including the
existing permission suite) pass; the disposable PostgreSQL 17 HTTP/runtime fixture
checks >2 pages, filtering, totals, cross-tenant isolation, roles and invalid
query rejection. Focused typecheck, API build, web build, format and database
test passed. Whole-F05 browser acceptance is still pending. Courses, Exams,
Study plans and Expenses remain pending after this Tasks slice.

### F05.3 Courses checkpoint

The Courses screen now uses additive `GET /api/courses/search` with optional
folded metadata `q`, progress minimum/maximum (0–100), sort (`name|code|progress`),
direction and bounded page/pageSize. A single short workspace-authorized SQL
statement applies the workspace and progress/search filters before computing
the total and page rows from the same statement snapshot. Results expose list
metadata only; the existing `GET /api/courses` array is retained for the
dashboard and independent course selectors. Course detail links use the
existing scoped slug lookup, so a target outside the current page remains
reachable without loading every course page or changing list totals.

`CoursesSearchPanel` has debounced server search, progress filters, sort,
direction, page size, reset, pagination, and distinct short/loading/error/empty/
unsupported/range-invalid states. The shared paged-search hook aborts reads and
checks query/principal identity. The Courses page does not request the legacy
full list; selectors on Exams, Study plans and Expenses and dashboard summaries
remain separate consumers. The course detail request is keyed to the verified
principal and slug and is discarded when either changes.

New focused evidence: Courses FE plus App integration tests passed 128/128;
the real Nest/PG17 HTTP fixture passed 1/1 with 24+ tenant-A courses, a duplicate
foreign-tenant name, Vietnamese metadata, pagination, stable sorting, role and
membership checks, safe malformed-query handling, and scoped slug lookup. On
this Courses checkpoint `npm run typecheck`, `npm run build`, and
`npm run format:check` exited 0. Browser acceptance remains pending because no
approved browser automation capability was exposed. Exams, Study plans and
Expenses remain pending; whole-F05.3 is not accepted by this checkpoint.

### F05.3 Exams checkpoint

The primary Exams route now uses `GET /api/exams/search` with optional folded
topic/course/room search, course ID, inclusive `fromDate`/`toDate`, allowlisted
exam date/time, topic, or course sort, and bounded page/pageSize. Strict date
validation rejects impossible dates and the service rejects a reversed range
before opening the business transaction. A single tenant-scoped statement
returns matching metadata and an accurate total from one snapshot; exam dates
remain `YYYY-MM-DD`. `GET /api/exams/:id` is a scoped lookup for deep links and
does not change paged totals. The legacy array route remains for the compact
dashboard next-exam summary; full course choices remain a separate selector
consumer. The paged Exams screen itself does not fetch the legacy exams array.

The page preserves role-gated create/edit/delete actions and refreshes from the
search endpoint after a successful mutation. Date/course filters and sort reset
pagination, request identity is scoped to verified user/workspace/role, and
focused records stay separate from the list. The dashboard retains its distinct
upcoming-exam behavior; the paged list includes past exams when they match the
selected filters.

Focused new evidence: the Exams FE/App selection passed 15 tests (113 were
filtered out by the test name selector); the Nest/PG17 HTTP fixture passed 1/1
with a real non-owner business login and separate synthetic Auth fixture. It
checks 24+ records over three pages, date/course filters, Vietnamese search,
stable ordering, empty out-of-range pages with correct totals, role/membership,
and scoped lookup without provider calls. Before implementation the HTTP test
was RED because `/api/exams/search` returned 404. Typecheck, build and format
passed on this module checkpoint. Browser acceptance is still pending because
no approved browser automation tool is exposed; Study plans and Expenses remain
unfinished and whole-F05.3 is not accepted.

## F05.2.1 checkpoint — sidebar page reset and unsupported folded queries

The sidebar now scopes its pagination state to the trimmed effective query and
verified principal identity. A query or account/workspace change derives page 1
immediately, before an effect can issue a request; filter/sort changes still
reset page intentionally. Abort, revision, and response-key guards remain in
place, and the API still returns an accurate total for an out-of-range page.

Workspace search now folds `q` once before opening the business transaction.
If non-empty input folds to no supported search characters, `GET /api/search`
returns 400 with `SEARCH_QUERY_UNSUPPORTED`; no workspace transaction or search
SQL runs. The sidebar presents that response as an unsupported query rather
than an empty result or generic network error. Documents search semantics and
its shared helper were not changed.

F05.2.1 RED/GREEN evidence and current gate results are in
[FINAL-DEMO-CHECKLIST](FINAL-DEMO-CHECKLIST.md). Browser interaction remains
pending because this session exposed no approved browser automation tool. This
does not accept whole-app F05: search/filter/sort/pagination on the other module
screens is still pending. Current status is
`F05.2.1_CODE_VERIFIED + F05.2.1_BROWSER_ACCEPTANCE_PENDING`; it is not
whole-app F05 acceptance.

## F05.2 contract/checklist — workspace sidebar search

F05.2 thêm `GET /api/search` cho sáu loại course/exam/plan/document/expense/task.
Contract: q được trim, 2–120 ký tự có ít nhất một chữ hoặc số; kind
`all|course|exam|plan|document|expense|task`; sort `kind|label`; direction
`asc|desc`; page 1–1.000.000; pageSize mặc định 12, tối đa 50. Query lặp,
malformed hoặc ngoài allowlist trả 400 trước service. Response metadata là
`{items,page,pageSize,total,totalPages}`. Một câu SQL tenant-scoped tính items
và total cùng statement snapshot sau fresh membership authorization trên
business transaction; không gọi AI/Storage. Sidebar dùng debounce 280 ms,
lọc loại, sort, hướng, paging, retry GET và principal/query revision guard; nó
không còn tải sáu list API. Route chỉ sinh từ allowlist, course dùng slug, các
loại khác dùng UUID. Legacy Documents/Assistant list contract không đổi.

F05.2 source, HTTP/DB và FE regression đã đạt kiểm tự động: `npm test` 1,604
pass (340 API Vitest, 855 API Node, 409 Web); typecheck, build, format và
`test:database` đều exit 0 trên lượt mới. HTTP/PG17 search suite đạt 1/1. Kết
quả đầy đủ, RED→GREEN và giới hạn mutation nằm trong
[FINAL-DEMO-CHECKLIST](FINAL-DEMO-CHECKLIST.md). Trạng thái là
`F05.2_CODE_VERIFIED + F05.2_BROWSER_ACCEPTANCE_PENDING`; browser desktop/mobile
chưa chạy. F05.2 không làm search/pagination cho các màn hình module còn lại,
nên whole-app F05 vẫn PARTIAL.

## F05.1 checkpoint — Documents search validation and deep-link focus (20/10/2026)

F05.1 fixes two reproduced defects without changing the Documents search SQL,
Assistant source contract, RLS or schema. `DocumentSearchQueryDto` now applies
the empty-query exception only to its content rule. Repeated `q`, array and
object values stay non-strings and fail HTTP validation before
`DocumentsService.search`; missing, empty and whitespace queries preserve the
existing contract. Before the fix the real Nest/Express request with repeated
`q` returned 500; the regression now expects 400 and spies that the service is
not called.

`PageSections` forwards the route focus ID to `DocumentsPanel`. If it is not in
the current result page, the panel makes one scoped `GET /api/documents/:id`
and displays a separate focused card; it does not change the paged items/total
or load every page. If the item is already on the page, it is not duplicated.
The lookup is abortable and revision-keyed by principal/workspace and target;
stale responses are ignored, and 400/401/403/404 do not disclose metadata.
Transient lookup errors have an explicit read-only retry. Existing role-gated
actions and Assistant's legacy full-array source loader remain unchanged.

Focused FE regressions cover 40-item route and sidebar links, out-of-page and
out-of-filter targets, A-to-B ordering, principal change, denied/missing IDs,
read retry, viewer controls, and focused assign/re-index/delete. The actual
HTTP/PG17 regression covers repeated/array/object query forms. Browser
acceptance remains pending because this session exposes no browser automation
tool; the current status is `F05.1_CODE_VERIFIED +
F05.1_BROWSER_ACCEPTANCE_PENDING`, not browser acceptance or whole-app F05
acceptance. Latest gates and exact counts
are in [the demo checklist](FINAL-DEMO-CHECKLIST.md).

## F05 Documents search — local vertical slice (20/10/2026)

The Documents screen uses an additive `GET /api/documents/search` endpoint
with query `q`, `course=all|unassigned|<UUID>`, `storage_status`,
`processing_status`, `sort`, `direction`, `page`, and `pageSize`. Defaults are
page 1, 20 rows, `created_at` descending; page size is capped at 50 and page at
1,000,000. The typed response is `{ items, page, pageSize, total, totalPages }`.
Repeated/malformed parameters and values outside the allowlists return 400.

Search trims and folds case/diacritics (`đ` to `d`) and punctuation to spaces,
matching the existing sidebar's Vietnamese typing behavior against document
name and course name/code/slug. Wildcard characters are ordinary separators;
search remains parameterized. Fixed sort expressions use NULLS LAST and an ID
tie-breaker. One SQL statement computes filtered rows, total and page so they
share a PostgreSQL statement snapshot. Membership is re-authorized in the same
workspace transaction before the query; explicit workspace predicates remain.

The API validates repeated/malformed values and allowlists before parameterized
SQL. An exact course ID is validated as UUID and scoped by the verified workspace;
a valid foreign course naturally returns no matching rows. The query runs after
fresh membership authorization in a workspace transaction, with explicit tenant
predicate retained. Items and count are derived by one SQL statement, so they
share one PostgreSQL statement snapshot and an out-of-range page retains the
correct total. No PDF content, chunks, embeddings or storage key is returned.

The Documents screen now has debounced search, course/storage/processing filters,
allowlisted sort/direction, bounded page size, reset and previous/next controls.
Reads use AbortController plus query/principal revision checks. A failed read is
shown as an error with read-only retry, never as an empty library. Mutations
reconcile against the paged endpoint; deletion errors also refresh rather than
assuming the item disappeared. The upload-course selector remains separate from
the list filter.

The existing `GET /api/documents` array remains unpaged for `useDocuments` and
Assistant source loading. The Documents page is
not treated as the Assistant's full source set. For a route focus ID outside
the current page, `DocumentsPanel` now performs a separate scoped
`GET /api/documents/:id` and renders a focused card without changing page items
or totals; sidebar links use the same route behavior. Bounded sidebar search
was added in F05.2; search/pagination on the six module screens remains outside
this vertical slice. No migration, AI provider or semantic search call was
added. Automated API/FE/PG17 evidence and browser acceptance status are
recorded in [the demo checklist](FINAL-DEMO-CHECKLIST.md).

F05 Documents code/tests were committed as `9981912` from starting HEAD
`fe84d1f`. Current automated gates passed: typecheck, test (1,583 total),
build, format and PG17 database (463/463). Browser acceptance is still pending
because this session exposes no browser automation tool; this does not mark
whole-app F05 complete. The focused Documents HTTP/PG17 suite is 4/4.

## Previous checkpoint — F04.1 provider admission fixes (20/10/2026)

Code/test commit: `fed6cd8`.

F04.1 fixes two reproduced defects in provider wrappers. Timeouts and stream
cancellation are now fulfilled lifecycle signals while a durable permit is
pending; the wrapper waits for permit completion, then discards a granted but
undispatched call if its deadline/cancellation already fired. SDK promises are
settled immediately so late rejection remains handled. No SDK call or provider
attempt telemetry is produced before dispatch.

Only allowlisted server-authored admission/auth errors keep their HTTP status and
code through Gemini generation/streaming, embedding, OCR, retrieval and document
ingestion. Unexpected permit/database failures become safe
`AI_ADMISSION_UNAVAILABLE`; raw SDK/database details remain sanitized. JSON
keeps the HTTP error contract, while SSE emits one terminal error event after
headers. No admission limits, quota accounting, migration, RAG algorithm, or
provider retry behavior changed.

RED evidence: five strict-mode subprocesses (generation, streaming timeout,
stream cancellation, embedding, OCR) exited 1 from an unhandled timeout before
the fix; four focused wrapper denial assertions changed to fail because the
admission status/code was normalized. GREEN evidence and final gates are recorded
in the latest F04.1 section of [the demo checklist](FINAL-DEMO-CHECKLIST.md).
Browser acceptance remains pending because no browser/CUA tool was available.

## F04 base implementation checkpoint (historical) — 20/10/2026

F04 implementation revision: `d716c13`.

F03 remains **F03_CODE_VERIFIED + F03_BROWSER_ACCEPTANCE_PENDING**. On this
revision the focused PG17 integration test exercised Nest HTTP through two API
instances, separate business/Auth LOGIN pools, live Auth/session/membership/RLS,
the real `AiUsageService` and provider wrappers, and synthetic SDK transport. It
passed 14/14 cases. Provider counters matched persisted telemetry; workspace SQL
made no provider call; timeout/cancel retained admission state `unknown` while
the upstream stop was unconfirmed. Browser evidence is still required and was
not replaced by this HTTP/DB test.

F04 is implemented locally behind migration `020_ai_admission.sql` and runtime
capability contract v20. Current finite defaults are 30 logical operations per
verified user per Asia/Ho_Chi_Minh DB day (shared across that user's workspaces),
2 active operations per user, 5 per workspace, and provider-call caps of 1 for
general chat, 2 for document questions, 17 for summary (up to 16 sections plus
synthesis), and 150 for indexing (up to 25 OCR pages plus batches for 2,000
chunks at batch size 16). Every provider dispatch requires a durable permit.
Workspace SQL with no provider work consumes no AI operation. Configured zero
denies that limit; missing values use the finite defaults, malformed/unbounded
values fail startup, and admission cannot be disabled.

The DB reservation is atomic across API instances. The daily operation is
consumed at reservation and is not refunded after provider failure, cancel, or
unknown outcome. Provider calls run outside transactions. A 120-second lease
applies only before dispatch; stale undispatched reservations can be terminalized
and do not occupy a slot. Once dispatched, an operation with unconfirmed stop
remains `unknown` and holds concurrency; lease expiry never releases that slot.
This is intentionally conservative and can require operator investigation after
a process/provider failure. Cost is not budgeted; F03 usage remains best-effort
and is not the quota ledger.

Final local gates on this revision: typecheck, application tests, build,
format:check, and the guarded PostgreSQL 17.11 `test:database` all exited 0.
`npm test` passed API Vitest 332/332, API Node 850/850, and web 384/384 (1,566
total); the database chain passed 462/462 with zero failed, skipped, or cancelled.
The full HTTP/DB admission proof passed 14/14 over two Nest instances and real
non-owner business/Auth LOGIN pools, with synthetic upstream SDK/Storage/Auth.
The disposable DB tests also prove concurrent admission across backend PIDs,
quota rollover, fan-out rejection, and conservative lost-ACK/unknown handling.
General-chat and document-question fan-out is persisted in the initial atomic
reservation before handler work and before SSE headers. A zero provider-call cap
is rejected before operation accounting or provider dispatch; the focused
regression passed in the final suite.
The final run found and corrected only stale test fixtures: full-chain migration
counts now include 020, SET ROLE negatives target the provisioned Auth capability,
and OCR fakes implement the new planned-call contract. The earlier 1,560-app /
448-DB figures remain historical F03.1 evidence, not these gate results.

Browser/CUA automation was not available in this session. No browser result is
inferred from HTTP/SQL tests; desktop/mobile denial UX remains pending. No cloud
migration/write, paid provider, push, or deployment is part of this work.

Current status: **F03_CODE_VERIFIED + F03_BROWSER_ACCEPTANCE_PENDING**;
**F04_IMPLEMENTED + AUTOMATED_GATES_PASS + BROWSER_ACCEPTANCE_PENDING**. This is
not F04_LOCAL_ACCEPTED. Cloud rollout, Google live, Auth extended, Thắng's
machine, F06, and semantic/live RAG acceptance remain pending.

## Latest checkpoint - F03.1 review (20/10/2026)

F03.1 addressed the token-usage consistency and expiring signed-PDF-link findings.
The token normalizer now rejects contradictory counts, preserves missing/zero
semantics, and leaves ambiguous tool/cache breakdowns partial without estimating
cost. The contract was checked against the installed Google Gen AI SDK types and
the [official Gemini usage metadata documentation](https://ai.google.dev/api/generate-content).

Opening a source in a new tab now requests a fresh signed URL through the existing
authorized backend route during the click gesture. The old preview URL is not
reused. A blocked popup has an explicit fresh-link fallback; closing the assistant,
changing source, or resetting the conversation aborts stale work.

New PG17 disposable integration evidence runs the real Nest routes, Auth/session
store, business and Auth LOGIN roles, RLS, usage persistence, Gemini/embedding/OCR
wrappers, receipts, and feedback. Only the Supabase Auth adapter, Storage, PDF
bytes, and SDK transport/provider responses are synthetic. No external provider
or cloud service was called. The RAG response citation and receipt are both checked
against the verified synthetic user and workspace. HTTP tests also exercise one
controlled provider timeout and client cancellation after the first SSE chunk;
each records the matching outcome with one provider attempt. A fixed shared-corpus run
completed 12 reset/reinsert cycles (36 positive and 24 lifecycle-negative reads);
the historical false-empty was not reproduced and remains INCONCLUSIVE.

Current gates on F03.1 code: typecheck, application tests, build, format, and the
PG17 database gate pass. Application totals: API Vitest 329, API Node 847, web
384 (1,560 total). Database: 448 pass across 30 serial suites, with zero failures,
skips, or cancellations.

A follow-up fixed the telemetry-failure test fixture: it now snapshots table and
column ACLs, revokes only the migration-019 INSERT columns, and restores those
column grants in `finally`. A deliberate table-wide INSERT restore mutation failed
the ACL snapshot assertion; restored column grants return the capability and ACL
snapshot to baseline. Negative capability tests now assert a valid baseline before
each mutation and a valid capability after restoration. The PG17 database gate was
rerun after this test change: 448/448 across 30 suites, zero fail/skip/cancelled.

The required post-F03.1 desktop/375px browser run is BLOCKED: no browser/CUA
automation tool is available in this session, and the prior isolated Chrome
launch was rejected by tool policy. HTTP/DB tests do not replace that evidence.
Therefore F03_LOCAL_ACCEPTED is not claimed; F03.1 remains PARTIAL pending an
allowed browser run. F04 budget, F06 dashboard, cloud rollout, Google live,
Auth extended, and Thang's machine remain outside this verification.

## Previous checkpoint - F02-A local acceptance and F03 (20/10/2026)

F02-A local acceptance đã được khép: browser Chrome 141 chạy qua Nest API thật,
PG17 disposable và LOGIN business/Auth riêng đã kiểm capability non-owner/
NOBYPASSRLS. Auth provider, Storage, OCR/extractor, embedding và Gemini là fake;
không gọi cloud. 86/86 case trên desktop 1440px và mobile 375px đạt, gồm manager,
member, viewer, no-membership; Documents pending→ready→Assistant không reload,
re-index, course assignment/delete, reconciliation không POST replay, citation,
feedback, account/workspace switch, history/reset/abort, PDF render thực và
download. Tenant B không đổi; không có console issue hoặc outbound external
request. Bằng chứng chi tiết trong [checklist local](FINAL-DEMO-CHECKLIST.md).
Đây chỉ nhận **LOCAL_F02_ACCEPTED**; **CLOUD_ROLLOUT_PENDING**,
**GOOGLE_LIVE_PENDING**, **REMOTE_MACHINE_NOT_VERIFIED** và Auth extended vẫn chờ.

F03 đã triển khai local: prompt registry typed với ID/version ổn định; logical
operation và từng provider call được ghi riêng với principal server-side,
provider/model, latency/outcome, usage có trạng thái missing/partial/invalid,
và cost estimate chỉ khi usage cùng pricing entry phù hợp. Workspace SQL ghi
zero provider calls. Migration mới `019_ai_usage_telemetry.sql` cùng rollback
dry-run/apply chỉ được kiểm trên PG17 disposable; capability contract hiện là
v19 ở source. Không lưu prompt/question/answer/PDF text. Telemetry write chạy
sau provider trong transaction ngắn có authorize; lỗi ghi không replay provider
và không thay response đã xác định. Cost giả định Google Gemini Developer API
Standard Paid Tier và không phải billing thực; cached/unknown usage hoặc model
không có giá được giữ unknown. Retention cleanup chưa có scheduler.

Gate mới trên revision F03: `npm run typecheck`, `npm test`, `npm run build`,
`npm run format:check`, `npm run test:database` đều exit 0. App: API Vitest
321 + API Node 847 + web 383 = 1,551 pass. DB PG17 disposable: 448 pass / 30
serial suites; fail/skip/cancelled đều 0. Một lần full DB run trước đó bắt gặp
false-empty trong suite retrieval sau DELETE/reinsert churn; exact pre-scope
query cũng khi đó trả thiếu hàng, còn focused retrieval chạy lại 25/25 và full
gate sau đó 448/448. Root cause ANN/churn vẫn **INCONCLUSIVE**; không đổi ranking,
index hay scan policy và không tuyên bố semantic RAG đã nghiệm thu.

F03 chưa làm F04 budget/admission hoặc F06 dashboard/public read; telemetry
best-effort không phải budget bền vững. Google live, cloud rollout, Auth extended,
máy Thắng, B4 semantic/live acceptance và các module còn lại tiếp tục pending.
F03 có thay đổi backend runtime nhưng không đổi UI. Browser chạy 86/86 là bằng
chứng F02-A trước instrumentation F03; lần chạy focused browser sau F03 chưa
thực hiện được vì tool policy từ chối khởi chạy Chrome với profile cô lập. Không
dùng profile cá nhân hoặc tìm đường vòng; F03 browser smoke còn pending.
Xem [F02/F03 evidence](FINAL-DEMO-CHECKLIST.md).

## Historical checkpoint — F02-A.2 trước browser integration (19/10/2026)

Finding P2 đã được sửa ở FE: sau upload, course assignment/refile, index/re-index,
GET reconciliation hoặc delete, Documents phát invalidation để `useDocuments`
đọc lại server list trong cùng phiên. Assistant chỉ chọn document `stored/ready`;
scope selection không hợp lệ được xóa mà không reset draft/history còn đúng scope.
List read lỗi được hiển thị riêng và có nút retry chỉ-đọc; Assistant không giả
danh sách rỗng hoặc gửi truy vấn document khi list chưa xác nhận được. Request cũ
không ghi đè list mới/account mới; không có page reload, polling hoặc POST replay.

RED của App regression tái hiện đúng: index POST đã trả ready nhưng Assistant
không có option tài liệu mới. Ba mutation (bỏ invalidation, bỏ stale guard, cho
pending vào sources) đều fail assertion tương ứng rồi được restore-green. 150
focused FE tests và 1.517 app tests pass. Browser Chrome desktop 1440px/375px với
synthetic API/Auth/Storage/provider kiểm role controls, upload → index → Assistant,
re-index, assign/delete, question/citation, PDF render/download, không overflow
và không console warning/error. Browser API là in-memory mock; vì vậy browser
không chứng minh business/Auth SQL chạy bằng LOGIN non-owner. PG17 gate 446/446
pass trên disposable, nhưng browser + non-owner SQL chưa được nối thành một run.
F02-A.2 vì thế **PARTIAL** cho browser acceptance tích hợp; không nhận F02 hoàn tất.

Lượt này chỉ đổi Documents FE lifecycle/metadata; không đổi thuật toán RAG,
retrieval, prompt, model, citation validator hoặc backend. F10 vẫn STT-only của
Thắng; không phát triển TTS. Không thêm tool thứ ba; R10 vẫn SSE và hai tools
không được tính là đạt capability B của rubric. Cloud rollout, Google live,
Auth extended và máy Thắng vẫn pending. Không có cloud writes hoặc push.

Các review/checkpoint cũ bên dưới ghi lại trạng thái trước lần tích hợp browser
này. Bằng chứng hiện tại nằm ở mục trên và [checklist F02/F03](FINAL-DEMO-CHECKLIST.md).

Review độc lập F02-A.1 tại `f8a39ec` ngày 19/10: build API và 67 test DB trọng
tâm chạy mới đạt (0 fail/skip/cancelled). Browser IAB qua CUA có sẵn trong phiên
review, không cần cài Playwright/Puppeteer; smoke member/manager/viewer ở
1440px/375px dùng business/Auth LOGIN non-owner và fake providers đã thực hiện.
Index/re-index, download và feedback receipt hoạt động trong các smoke đã chạy.
Finding P2 còn mở: index xong trong Documents nhưng danh sách Assistant còn cũ,
chỉ thấy tài liệu mới ready sau reload trang. `App` và `DocumentsPanel` giữ hai
bản state documents độc lập; chưa chấp nhận đầy đủ local hoặc chuyển F03.
PDF inline mở được khung nhưng IAB chưa cho bằng chứng render trang; không nhận
preview PASS và không suy ra lỗi production PDF. Xem [review](FINAL-DEMO-CHECKLIST.md#review-độc-lập-f02-a1--19102026).

F01.1 đã harden rollback 016 tại `b343737`: shared dependency/schema preflight,
contract pristine/source PG17, apply recheck dưới lock và cleanup client không
chắc sạch. Baseline `0130039` và final đều chạy mới: 1.505 app test; DB 390 →
423 pass, năm gate exit 0, 0 fail/skip/cancelled. **LOCAL_HARDENING_ACCEPTED +
LIVE_ACCEPTANCE_PENDING**; human review patch pending. Xem [checklist](FINAL-DEMO-CHECKLIST.md)
và [bảng readiness/owner steps](PILOT-B1-RUNBOOK.md#readiness-f011--quan-sát-19102026-không-phải-google-live-pass).
Không thay Auth runtime/FE nên không nhận browser/Compose/Google mới. Config
private/target chưa đủ ở checkout này, cloud ledger/provider chưa kiểm được.

F01 đã có Google PKCE backend/FE và migration 016 test-only apply. Gates F01
ngày 19/10 trên `7112ca4`: 1.505 app test và 390 PG17 DB test, không fail/skip/
cancelled; cả năm gate exit 0. Browser fixture native/Compose có bằng chứng trong
[checklist F01](FINAL-DEMO-CHECKLIST.md). Google live/owner setup và máy Thắng
chưa xác minh; F01 không áp 016 cloud hoặc bắt đầu F02.
Verdict: **CODE_ACCEPTED + LIVE_ACCEPTANCE_PENDING**; human review pending.

## Nhánh và thứ tự đọc

- Từ nay phát triển trên **`feature/tai-assistant-integration-20261018`**.
- Checkout hiện tại: `D:\New-Tech\Final-Project-integration-20261018`.
- Không phát triển hoặc push tiếp vào `feature/tai-rag-integration`; không tự merge main.
- Checkout cũ `D:\New-Tech\Final-Project` có WIP riêng: không reset/stash/xóa hoặc
  mang chúng sang commit của task mới. Không chép .env/secrets vào Git.
- Đọc [README](../README.md), context này và source/test đúng module.
  [Hướng dẫn học](FINAL-STUDY-GUIDE-VI.md) giữ kiến trúc/role matrix;
  [checklist demo](FINAL-DEMO-CHECKLIST.md) giữ việc nghiệm thu cuối kỳ.
  Báo cáo/roadmap theo đợt đã gộp, xem lịch sử bằng
  `git show e9ac2af:docs/<tên-file>.md` hoặc
  `git show e9ac2af:tasks/PROJECT-ROADMAP-2026-10-13.md` khi cần chi tiết.
  Không nạp mọi báo cáo cũ hoặc thực thi prompt cũ như nhiệm vụ mới.

## Sản phẩm và kiến trúc

Nhóm Tài–Thắng làm workspace học tập cho final New Technologies; pilot nhỏ cho
nhóm và người được mời. App chỉ chạy local `http://127.0.0.1:5173`, dùng Supabase
chung; Docker web có origin riêng `http://127.0.0.1:8080`. Không tự mở hosting,
domain/HTTPS, cloud writes hoặc mở rộng phạm vi chỉ vì giao diện đã xong.

React/Vite + NestJS ESM, npm workspaces, PostgreSQL/pgvector và private Storage.
Node 24 phù hợp engines (README yêu cầu 24.15+), npm 11.6.2. Contracts chỉ chứa
kiểu tại `packages/contracts/index.d.ts`. Không đổi framework/stack theo hướng
dẫn của project khác trong folder cha.

## Đã triển khai trong code

- Tasks/Courses/Exams/Study plans/Expenses/Documents, scope workspace và role
  ở API; viewer đọc, member/manager ghi theo matrix, manager mới xóa các mục quy định.
- Documents: PDF upload/private Storage, signing/preview, indexing/OCR tùy chọn,
  reconciliation khi kết quả ghi/COMMIT chưa rõ. Không tự replay POST.
- Workspace transaction ngắn ở domain, ingestion, retrieval/summary/metadata,
  receipt/history/feedback. Storage/OCR/embedding/provider ở ngoài transaction.
- Assistant UI hai tầng: AI Chat → Kiến thức chung/Tài liệu; Hỏi workspace riêng.
  Backend vẫn có ba mode độc lập. General stream text; Documents chỉ status rồi
  answer đã qua citation và quyền cuối lượt; Workspace status rồi kết quả SQL.
- N1 history tối đa 6 lượt receipt đã xác minh user/workspace/mode/scope/hash;
  nguồn cũ không là evidence. Bộ nhớ tab, reload mất; reset/abort không ghép answer
  về trễ sang hội thoại mới. Giữ draft người dùng sửa trong lúc chờ.
- Feedback thuộc receipt của chính người gửi; dữ liệu là candidate cần review,
  không tự thành gold/PASS. Receipt không lưu nội dung hội thoại.
- F02-A tách pool business/Auth và maintenance; `DatabaseService`/`AuthDatabaseService`
  kiểm capability trước listen. Migrations 017–019 là source có version cho local
  grants/RLS/usage; Auth bootstrap không dùng business pool và business không có owner fallback.
- STT Whisper small ONNX local do Thắng phụ trách: auto/Việt/Anh, sửa transcript
  trước khi chèn/gửi; mặc định tắt, không tự tải weights. Có cửa sổ 30s/stride 5s.

## Bằng chứng và phần chưa được nghiệm thu

Merge checkpoint **`01288ce`** giữ hai parent Tài `8b62f1a` và Thắng `2249abf`.
Lượt tích hợp chạy đủ 5 gates exit 0: **1.487 test ứng dụng + 379 DB**, không
fail/skip/cancelled. Browser fixture desktop/375px/320×320, Docker build/native
imports và 5 media tests thật đã kiểm. Đây là kết quả lịch sử tại checkpoint,
không nhận là kết quả chạy mới của task sau.

- Auth đã bootstrap demo theo [handoff đăng nhập](PILOT-DEMO-HANDOFF.md), nhưng
  không suy ra đăng nhập thực tế trên máy Thắng hoặc extended Auth acceptance đã đạt.
- Tenant RLS/grants toàn app chưa rollout cloud; non-owner/RLS proof là DB disposable.
- Budget AI (B3), semantic RAG/live eval qua Auth (B4), PWA/flashcards vẫn theo roadmap,
  chưa coi là hoàn tất. `eval:rag` live đang BLOCKED trước DB/Storage/Gemini.
- STT audit còn 2 high/4 moderate package entries; remediation chưa xong. Không
  thấy đường image decode/format-string tương ứng trong audio path đã review,
  nhưng không gọi audit sạch hoặc chứng minh không thể khai thác.
  Các finding gồm Sharp và chuỗi sprintf/transitive; review lại trước 25/10/2026
  hoặc trước mở pilot, tùy mốc nào sớm hơn. Không tự nâng/override packages.
- Không có nghiệm thu microphone/Whisper accuracy/tốc độ CPU hoặc Gemini thật
  trong lượt tích hợp. Model template 3.5 Flash-Lite không tự đổi .env cũ.

Shared-corpus false-empty từng thấy ở fixture dùng chung còn INCONCLUSIVE:
Đợt 16 thêm positive oracle/lifecycle 12 chu kỳ, chưa tái hiện nguyên nhân.
Không coi tách DB từng case là bằng chứng đã chữa lỗi; giữ regression và theo dõi.

## Roadmap FINAL F01–F16 — đã chốt, chưa cấp quyền triển khai các đợt sau

Bảng do Tài xác nhận trong F01.1 thay thứ tự B/N cũ; các nhãn B/N vẫn là tham
chiếu lịch sử. Không chạy lại phần đã có hoặc biến kế hoạch thành nghiệm thu.

| Đợt | Phạm vi đã chọn                                                                                                            | Trạng thái / điều kiện                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Google PKCE, JWT-backed phiên hiện có, membership/role, replay/account race                                                | Local đã triển khai; F01.1 rollback/preflight local hardening accepted. Google live, Thắng và Auth extended pending                                              |
| F02 | Hoàn tất B2: runtime non-owner/NOBYPASSRLS, grants tối thiểu, tenant RLS toàn app, rollout/rollback cloud                  | F02-A local acceptance đạt qua browser+Nest+PG17 LOGIN business/Auth non-owner; F02-B/cloud runtime provisioning/rollout vẫn pending, không coi B2 toàn app xong |
| F03 | Prompt tập trung/version; metadata request/provider calls, token, latency, outcome, chi phí ước tính                       | Code và tích hợp HTTP/DB PG17 đã kiểm; nghiệm thu browser desktop/375px sau instrumentation còn pending; chưa nhận F03 đầy đủ                                    |
| F04 | B3: cap user/ngày, concurrency, fan-out summary/index/OCR; admission nguyên tử và bền vững                                 | Migration 020/contract v20 triển khai local; automated gates pass, browser acceptance pending; không phải monetary budget hay dashboard F06                      |
| F05 | Search/filter/sort/pagination FE–API–DB; Documents trước, scope trước count/pagination, chống stale response               | Documents, sidebar and all five F05.3 module screens have local automated coverage; browser acceptance pending, so whole F05 remains partial                     |
| F06 | Dashboard AI cho admin đúng workspace: request/provider calls, token/cost/latency/lỗi/từ chối và filters                   | Local code/API/PG17 implementation and automated verification in this checkpoint; browser acceptance pending; not billing or F04 quota ledger                    |
| F07 | N1 lưu bền, mở lại/xóa, retention/quyền; receipt/history/reset/account isolation                                           | Local implementation and automated verification complete; browser acceptance pending. No F08 work is included                                                    |
| F08 | N2 Study Coach: structured quiz/flashcards, nguồn, preview/xác nhận lưu, luyện tập/tiến độ cá nhân                         | Pending                                                                                                                                                          |
| F09 | B4: ít nhất 20 case thực thi có expected, cùng corpus/gold trước/sau, human review/guardrails/fallback/latency/cost        | Chưa nghiệm thu semantic/live; live runner còn BLOCKED, principal CLI hay HTTP chưa chốt                                                                         |
| F10 | Chỉ STT của Thắng: hoàn thiện lỗi, bảo mật/dependency, accuracy/latency và nghiệm thu thực tế khi cần                      | Thu hẹp theo Tài ngày 19/10/2026; giữ implementation STT hiện có, không phát triển TTS, không chuyển ownership                                                   |
| F11 | PWA/mobile thật: manifest/install/update/offline shell, Android và giới hạn iOS                                            | Pending; không cache dữ liệu riêng hoặc tự queue write                                                                                                           |
| F12 | Registry/allowlist nhiều model, lựa chọn kiểm soát, benchmark quality–latency–cost                                         | Pending; đổi embedding/re-index cần quyết định riêng                                                                                                             |
| F13 | WASM PoC có profiling/benchmark, cancel/fallback/license; chỉ tích hợp nếu chứng minh lợi ích                              | Nhánh mở rộng, không bắt buộc rubric; tác vụ cụ thể chưa chốt                                                                                                    |
| F14 | Native client tái sử dụng API: OAuth/deep link, secure storage, build/thiết bị                                             | Nhánh mở rộng, không bắt buộc rubric; stack chưa chốt                                                                                                            |
| F15 | Đã bỏ khỏi kế hoạch phát triển: không mở rộng tool-using agent lên 3 tools                                                 | Theo Tài ngày 19/10/2026; chỉ giữ phạm vi 2 tools ban đầu, không tự thêm tool thứ ba hoặc nhận đạt capability B của rubric                                       |
| F16 | Compose E2E/traceability, ít nhất 3 ADR, AI_USAGE, PDF 10–20 trang, slide tối đa 15 trang, video 3–5 phút, live change/Q&A | Pending bộ nộp; ADR-001–004 đã ghi, không nhận đã hoàn thành đầu ra F16                                                                                          |

### Điều chỉnh phạm vi đã chốt — 19/10/2026

Tài gọi FR10/FR15 trong chat là F10/F15 của roadmap này, không phải R10 (SSE)
trong bảng requirements. Giữ SSE, không xóa hoặc làm yếu chức năng đã có.
F10 chỉ giữ STT; TTS ngoài phạm vi. F15 không còn là đợt cần triển khai; giữ ID
lịch sử, không đánh số lại các đợt sau. Chỉ duy trì/hoàn thiện phạm vi 2 tools
ban đầu, không tự thêm tool thứ ba. Đây là giới hạn phạm vi, không phải bằng
chứng đã có 2 LLM-called tools: cần đối chiếu source trước khi ghi nghiệm thu;
mode chat, nút UI và SQL intent không tự là tool do LLM gọi. Không giới hạn số
REST endpoints cần cho CRUD thông thường bằng giới hạn tools này.

Rubric capability B yêu cầu ít nhất 3 tools do LLM gọi; vì vậy không dùng B để
nhận đủ số capability khi chỉ có 2. Hướng đáp ứng 2 capability của nhóm vẫn là
A (RAG) và C (structured output/Study Coach ở F08), mỗi phần phải có nghiệm thu
riêng; không nhận C đạt chỉ vì model trả JSON. STT là tính năng bổ sung cần kiểm
thật, không tự nhận capability D nếu chưa đủ điều kiện lưu và sử dụng kết quả.

Tài liệu/traceability cập nhật xuyên suốt, không đợi F16. F01.1 thuộc F01,
không phải đợt lớn thứ 17. Bảng này không cấp quyền cloud writes, push hoặc
thực hiện F02-B/F03–F16. F02-A chỉ áp source 017 lên disposable PG17; không đổi
Supabase, runtime credentials, role hay membership. Cloud rollout/rollback cần
F02-B với role provisioning, preflight, maintenance window và đường lui riêng.
Source hiện có migration 016 cho OAuth attempt; F01 chỉ áp trên disposable.
Cloud bootstrap lịch sử đến 015; chưa áp 016 hoặc xác minh lại cloud trong F01.
Đợt tiếp theo phải kiểm source/ledger thực tế trước mọi thao tác schema.

## Quy tắc khi triển khai tiếp

Kiểm Git/branch/WIP và đọc test hiện có trước sửa. TDD cho thay đổi hành vi;
kiểm runtime phù hợp, ghi đúng pass/skip và giới hạn. Không dùng test fake để
tuyên bố cloud/model thật đã đạt. Không sửa migration cũ, không in secrets,
cookie, signed URL hoặc định danh thật; không tự rotate key/tạo lại user/workspace.

Giữ ranh giới của Thắng: chunking/embedding/OCR/retrieval/prompt/validator không
đổi trong task hardening nếu chưa có phạm vi và benchmark. STT do Thắng
phụ trách; sửa tích hợp AssistantPanel/voice phải nêu trước để tránh đụng nhau.
Không hỏi lại về second opinion mỗi đợt; chỉ hỏi khi thiếu quyết định phạm vi
hoặc thiết kế thực sự chặn công việc.

Commit theo lát đã kiểm; push chỉ khi được giao. Phê duyệt push lượt dọn docs
cũ là lịch sử, không áp dụng F01/F01.1; không force-push/merge/deploy/cloud writes.

## F02-A.1 — re-index và runtime contract correction (2026-10-19)

Lượt này bắt đầu tại `9c5ee38`, không sửa 001–017. PostgreSQL 17 disposable
đã tái hiện re-index lần hai thất bại `23505`: chunks cũ không visible khi
document ở trạng thái `processing`, nên DELETE giữ lại rows và INSERT đụng
unique `(document_id, chunk_index)`. Migration nguồn mới `018_runtime_rls_reindex.sql`
cho member/manager đọc chunks cũ chỉ trong lifecycle `stored+processing`; viewer,
failed và workspace khác vẫn bị giới hạn. Re-index/retry được kiểm bằng
`DocumentIngestionService` thật, dependency ngoài là fake hợp lệ; thuật toán RAG
không đổi.

Migration 018 cũng fail-closed cho SELECT/lock workspace và memberships khi
membership thiếu/inactive hoặc workspace inactive; Auth bootstrap trước
principal tiếp tục dùng capability Auth riêng. `f02a1_runtime_database_acl_state`
lưu trạng thái PUBLIC CONNECT để rollback khôi phục ACL trước 018. Apply/rollback
018 dùng dry-run mặc định, target confirmation exact, policy/dependency/checksum
preflight và recheck dưới lock. `db:migrate` kiểm policy conflict trước khi áp
017/018.

Runtime startup/preflight giờ dùng hợp đồng capability/catalog v18 với digest
độc lập sinh từ pristine PG17 áp migrations nguồn; kiểm LOGIN/group inheritance,
ownership, ACL/table-column/schema/database, PUBLIC/inherited grants, RLS/policies,
helper SECURITY DEFINER và quyền Auth. Không tự sửa drift. Đây là kiểm ở startup
và operator boundary, không phát hiện DBA đổi quyền sau khi process đã chạy,
không phát hiện mọi dynamic SQL/reference của ứng dụng và không bảo vệ toàn bộ
server/process đã bị chiếm quyền. Baseline migration 017 không còn đủ để runtime
khởi động: cần apply 018 trước khi chạy capability v18.

RED→GREEN/mutation trên disposable: re-index cũ RED `23505`; policy PUBLIC mở,
RLS tắt, role không membership/inactive và lỗi mất ACK BEGIN đều bị regression
bắt đúng assertion sau sửa. Năm mutation được build/chạy: visibility chunks cũ,
PUBLIC-policy guard, RLS catalog guard, membership scope và BEGIN tracking;
từng mutation fail tại assertion mục tiêu, được khôi phục rồi focused suites
xanh. Apply/rollback/reapply 018 và chuỗi 018→017→016→migrate lại bảo toàn policy,
ACL, ledger và dữ liệu kiểm tra.

**Browser BLOCKED**: các binary Edge/Chrome có trên máy nhưng Playwright,
Puppeteer và driver browser automation không có trong project/global environment;
không cài package theo ràng buộc. Vì vậy HTTP/SQL integration không thay browser
desktop/375px. Trạng thái lượt này là **PARTIAL + BROWSER_BLOCKED +
CLOUD_ROLLOUT_PENDING + GOOGLE_LIVE_PENDING**; F02 toàn app chưa nghiệm thu.
PG17 test không phải cloud readiness. Google live, Auth extended và máy Thắng
vẫn pending.

F02-A.1 final gate mới: typecheck/build/format exit 0; API Vitest 288 + API Node
846 + web 374 = 1.508 app tests; PG17 DB 446 pass/28 serial suites, 0
fail/skip/cancelled. Kết quả DB ban đầu có hai harness regression do fixture
legacy chưa loại 018 và bộ đếm cố định 017; filters/counts được sửa, full gate
chạy lại xanh. Browser vẫn blocked; xem gate/mutation/cleanup ở
[demo checklist](FINAL-DEMO-CHECKLIST.md). Source/test commit local là
`65e24e49b4deaad1f03246caa81321396b646564`; không push hoặc ghi cloud. Cloud rollout, Google live, Auth extended,
máy Thắng, semantic RAG và B2 toàn app vẫn pending.

## F02-A — local capability/RLS checkpoint (2026-10-19, historical 017)

Trên HEAD `9195317` bắt đầu lượt này, F02-A tách business runtime (`DATABASE_URL`),
Auth bootstrap/session (`AUTH_DATABASE_URL`) và maintenance CLI
(`MIGRATION_DATABASE_URL`, không được đưa vào API process). Migration 017 và
`infra/postgres/runtime-roles.sql` là source versioned cho capability grants,
tenant policies và policy helper. API kiểm role capability trước khi mở cổng;
không có owner fallback. LOGIN/password provisioning ở ngoài migration và
chỉ được thử trên disposable. Không có cloud connection/write trong lượt này.
Implementation/test commit: `f850114`.

Lần chạy mới: Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux. Baseline gates
đạt: typecheck/build/format exit 0, 1.505 app tests và 423 PG17 DB tests; final:
typecheck/build/format exit 0, API Vitest 288 + API Node 846 + web 374 = 1.508
app tests; database 430 pass trong 27 suite. Tất cả final suites 0 fail/skip/
cancelled. Format check đầu tiên báo đúng một file test chưa format; file đó
được format bằng Prettier hiện có và gate chạy lại đạt. Final logs nằm trong
ignored `artifacts/f02-a-20261019/`.

Disposable PG17 chứng minh LOGIN runtime riêng non-owner/NOBYPASSRLS, role/group
capability, HTTP paths dùng business/Auth pools khác nhau, tenant policies,
apply/rollback/reapply 017, restore ACL snapshot và guard chống owner capability.
Mutation policies/context/owner/viewer đều bị test hành vi bắt rồi được restore.
Browser/desktop/mobile chưa được kiểm: không có browser automation tooling sẵn
trong môi trường và không cài dependency; vì vậy đây chưa phải nghiệm thu đầy đủ
mọi luồng UI/Compose. Trạng thái là **LOCAL_API_DB_VERIFIED + BROWSER_BLOCKED +
CLOUD_ROLLOUT_PENDING + GOOGLE_LIVE_PENDING**; không gọi toàn B2 hoặc cloud RLS
hoàn tất. Máy Thắng vẫn `REMOTE_MACHINE_NOT_VERIFIED`, Auth extended pending.

Tiếp theo F02-B phải chốt target/role provisioning, credential delivery riêng,
pool budget, backup, maintenance window, source migration rollout/rollback và
preflight trên môi trường thật. Không dùng kết quả PG17 disposable làm cloud
readiness. Các findings/hạn chế và lệnh tái chạy nằm ở [demo checklist](FINAL-DEMO-CHECKLIST.md),
[runbook](PILOT-B1-RUNBOOK.md) và [ADR-002](DECISIONS.md).

# F01 — implementation checkpoint (2026-10-18)

Local implementation in the integration checkout only; Google live acceptance is pending owner setup. No cloud migration or account changes are authorized by this code run.

Design/contract: `GET /api/auth/google/status` returns `{status: enabled|not_configured}`. `POST /api/auth/google/start` takes an empty body and requires the existing prelogin cookie, Origin and CSRF; it returns `{authorizationUrl}`. `GET /api/auth/google/callback?attempt=…&code=…` is the only application callback. Supabase's callback to/from Google is a separate provider URL. No client-selected provider, host or return destination is accepted.

The backend constructs Supabase's PKCE S256 authorize URL without replacing provider state. A random application correlation identifier is carried in the fixed redirect URL, bound in PostgreSQL to the prelogin cookie hash, server origin and Google. A five-minute encrypted verifier uses a separate AES-GCM purpose. Starting again replaces the prior attempt. Claim precedes network exchange and is single use; finishing locks/rechecks the prelogin and attempt after the network call. An old callback cannot rotate a newer session. Exchange uncertainty requires a new flow, never a hidden retry.

Identity trust remains BFF: browser opaque HttpOnly cookie → server encrypted Supabase tokens → authoritative Supabase `/user` verification of the exact access JWT → checked claims/session and DB membership. This is not a browser JWT or Google ID-token login. No auto membership or app account linking is introduced. Manager/member/viewer keep their existing meanings. Migration 016 adds attempts with RLS/revoked public access; only disposable databases were migrated during F01. Production role policies remain F02.

Threat controls: login CSRF is stopped by prelogin/Origin/CSRF plus callback binding and PKCE; replay by atomic claim; fixation by existing session rotation; stale account flows by final prelogin recheck; SSRF/open redirects by server-fixed URLs; disclosure by safe callback logging, clean redirects and no-store/no-referrer. No OAuth SQL transaction spans provider calls. Existing refresh serialization is unchanged. Password login remains available with Google disabled.

Backend `38e2e53`, FE/fixtures `08eb581`, historical rollback oracle `f36607b`,
wall-clock/lock-wait and prelogin expiry hardening `ac033a4`, dev proxy privacy
`7112ca4`. New local tests and
native/Compose browser evidence: [F01 acceptance record](FINAL-DEMO-CHECKLIST.md).
Google live/owner setup and machine Thắng remain pending; no cloud writes/push.
Next checkpoint is owner Google setup/016/identity/consent, then F02 only after
review. F01 does not complete production tenant RLS, AI budget or semantic RAG.
