# AI Assistance Log

> Nhật ký provenance theo ngày, không phải hướng dẫn triển khai hiện tại. Các
> path handoff/prompt/plan đã bỏ khi dọn docs ngày 18/10 vẫn có thể xem qua
> `git show e9ac2af:<path>`. Điểm tiếp tục: [context](docs/PROJECT-CONTEXT.md) và
> [README](README.md). Giữ nguyên các ghi nhận review/test lịch sử; những câu
> “chưa có AI/Auth/Git” bên dưới chỉ đúng tại checkpoint được ghi, không phải hiện tại.

## 2026-09-13 — Homework 4 non-AI implementation

Codex assisted with repository audit, Tasks validation/config/logs, Documents API and Supabase Storage adapter, tracked migrations, React integration, HTTP/frontend tests and Vietnamese study/evidence/demo documentation. No AI feature was added to the product. Human review is still pending. See docs/VERIFICATION.md for actual test results and unverified Supabase/Docker/persistence; the ZIP has no .git and no commit/push was performed. Students must review and explain the code before submission.

This log records substantial AI-assisted work. The team remains responsible for understanding, testing, correcting, and presenting every accepted change. The Week 3 baseline is a scaffold and learning reference; it is not evidence that the future AI/RAG feature has already been completed.

| Date       | Task                                                                 | Tool or model               | Files generated or modified                                                                                                                                                                                                        | Human review                                                                                                                                                                                                                                                                                           | Corrections                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | Define project scope and initial architecture                        | Codex                       | `docs/project-plan.md`, `docs/architecture.md`                                                                                                                                                                                     | Team confirmation required before the scope freeze                                                                                                                                                                                                                                                     | Reframed a generic chatbot as a document-grounded project assistant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-04 | Scaffold the first frontend-backend-data slice                       | Codex                       | Initial application, infrastructure, tests, and documentation                                                                                                                                                                      | Type checking, automated tests, production builds, container health checks, valid CRUD, and invalid-input behavior were verified                                                                                                                                                                       | Replaced pnpm with npm workspaces after Windows linking failed; changed the host database port to 55432 because port 5432 was already used locally; updated NestJS 12 to an ESM-compatible build and test configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-05 | Reconcile documentation with the Week 3 checkpoint                   | Codex                       | `README.md`, `docs/*.md`                                                                                                                                                                                                           | Team must verify the progress description, ownership, and open decisions before the next feature milestone                                                                                                                                                                                             | Clarified that AI/RAG, VM deployment, evaluation execution, and presentation evidence remain pending; kept the application structure unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-09-09 | Build the React academic dashboard and map it to Homework 3A         | Codex                       | `apps/web/src/*`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/package.json`, `package-lock.json`, `docs/dashboard-ui.md`, `docs/HOMEWORK-3A-REACT-STUDY-GUIDE.md`                                                  | Tài selected React, the reference layout, Heroicons, Poppins, semantic HTML, accessibility and responsive constraints. Tài must still complete the line-by-line walkthrough and human-review checklist before submission.                                                                              | Fixed 320 px overflow; preserved task state after failed updates; labelled mock data; kept the unimplemented Assistant disabled; added mobile keyboard behavior; verified build, formatting and six frontend tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-10 | Add an owner filter as Tài's next frontend increment                 | Codex                       | `apps/web/src/TasksPanel.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`, `tasks/*.md`, `docs/HOMEWORK-3A-REACT-STUDY-GUIDE.md`                                                                                       | Tài requested the next implementation step. Tài still needs to walk through the state/filter logic, reproduce the behavior locally and obtain Thắng's review before merge.                                                                                                                             | Used a failing test first; disambiguated the filter and form owner labels; verified empty state, 320 px layout, console output, seven frontend tests, typecheck, formatting and production build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-09-10 | Finish the Documents page: frontend regression pass and defect fixes | Claude Opus 5 (Claude Code) | `apps/web/src/DocumentsPanel.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`                                                                                                                                          | Tài asked to complete the interrupted frontend increment. Tài still needs to reproduce the duplicate-selection case locally and obtain Thắng's review before merge.                                                                                                                                    | Fixed three defects found during verification: the same file picked twice in one selection created two cards with an identical React key (the remove button then deleted both); the status message claimed a file was added when it had been skipped as a duplicate; the native file input rendered unstyled inside the label. Locked the first two with tests confirmed to fail against the previous logic. Verified 11 frontend tests, typecheck, formatting, production build, all eight routes at 320/375/1440 px, zero console errors, and that no `/api/documents` request is ever sent.                                                                                                                                                                                                                                                                                                                |
| 2026-09-10 | Build CM-203-FE document lifecycle preview                           | Codex                       | `apps/web/src/DocumentCard.tsx`, `apps/web/src/DocumentsPanel.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`, planning documents                                                                                     | Tài requested the frontend-only task after the previous snapshot was pushed. Tài must still demonstrate all states and explain the state transition code before review.                                                                                                                                | Added deterministic Selected, Uploading, Processing, Ready and Failed previews with progress and Retry. A full regression exposed an extra implicit `status` role from `<output>`; changed it to semantic status text so existing live-region behavior remained unambiguous. Verified 12 tests, typecheck, formatting and production build; the app browser connector blocked localhost runtime inspection. No document API or backend code was added.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-10 | Build the responsive contextual ExaMate AI panel                     | Codex                       | `apps/web/src/AssistantPanel.tsx`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`, `docs/ideas/responsive-ai-copilot.md`, planning documents                                                       | Tài chose the AI-first layout while requiring every existing page and function to remain available. Tài still needs to inspect the three responsive modes locally, explain the UI/RAG boundary and obtain Thắng's review before merge.                                                                 | Wrote failing tests before implementation, then added contextual prompts, keyboard close/focus return and an explicitly labelled sample answer/citation. Fixed focus restoration after the first green run and prevented the overlay from being clipped by the shell. Verified 14 tests, typecheck, formatting and production build; after `localhost` was blocked, runtime inspection succeeded through `127.0.0.1` on the Documents page using the accessibility tree and a browser screenshot. No Assistant/document API or backend code was changed.                                                                                                                                                                                                                                                                                                                                                      |
| 2026-09-11 | Visual pass: local photography, course covers and scroll reveal      | Claude Opus 5 (Claude Code) | `apps/web/public/img/*`, `apps/web/public/favicon.svg`, `apps/web/src/use-reveal.ts`, `apps/web/src/AcademicPanels.tsx`, `apps/web/src/academic-data.ts`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/index.html` | Tài asked for a more engaging interface while keeping every function, the layout order, Poppins and the sage-green academic tone. Tài must still explain the reveal hook and its safety timer, and confirm the four course photographs suit the subjects, before Thắng reviews.                        | Replaced the hot-linked Unsplash hero with five local WebP files (480 KB total) so the interface still renders during an offline or VM demo; recorded provenance in `img/CREDITS.md`. Gave course cards real covers with a legibility scrim, measured at 13.4–15.2:1 contrast against white. Dropped `IntersectionObserver` for a scroll listener plus safety timer after the observer proved unreliable, and rewrote the reveal from a CSS animation to a transition because `animation-fill-mode: both` outranks normal declarations and pinned cards at opacity 0 whenever motion was frozen. Traded one background gradient for a faint dot texture. Added the missing favicon that was causing a 404. Verified 14 tests, typecheck, formatting, production build, all eight routes at 320/375/1440 px, zero cards hidden with motion disabled, and zero console errors. No backend, infra or API change. |
| 2026-09-11 | Replace course cards with a cinematic course carousel                | Claude Opus 5 (Claude Code) | `apps/web/src/CourseCarousel.tsx`, `apps/web/src/AcademicPanels.tsx`, `apps/web/src/academic-data.ts`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`, `apps/web/public/img/*`                     | Tài rejected the static image cards and asked for a slide gallery like the reference video, choosing a dark contained block, per-course backdrops and a horizontal track. Tài must still add `study-sunset.jpg`, confirm the two new subjects, and explain the scroll safety net before Thắng reviews. | Reverted the Dashboard course list to icon tiles and moved the photographs into a Courses-page carousel with six subjects. Measured the target scroll position instead of using `scrollIntoView`, which would also scroll the page. Added a safety timer after proving that smooth scrolling, like CSS animation and IntersectionObserver before it, is silently suppressed in some renderers and left the selected card off screen. Hero now points at the team photo with an automatic fallback so nothing breaks before the file is added. Verified 15 tests including a carousel case confirmed to fail against broken wrap-around, plus typecheck, formatting, build, 320/375/1440 px, keyboard arrows, reduced motion, backdrop contrast of 13.8–18.4:1, and zero console errors. No backend change.                                                                                                    |

| 2026-09-11 | Rebrand CourseMate to ExaMate across the repository | Claude Opus 5 (Claude Code) | Every file naming the product: UI, `README.md`, all `docs/*`, `compose.yaml`, `.env.example`, workspace and package names, Dockerfiles, the API health payload, the `localStorage` key, plus a new brand mark in `App.tsx` and `favicon.svg` | Tài asked for the rename and a new logo. Tài must confirm the mark and tell Thắng that the database identifiers changed before Thắng next runs the stack. | Replaced 96 occurrences in two casings, including the Postgres database, user and password and the Compose project name, so nothing kept the old identity. Because the Compose project name changed, a fresh volume is created and the init script re-seeds, so no `down -v` is needed; the old `coursemate-ai` container and volume are simply orphaned. Verified against a real renamed database rather than by inspection: `examate` created and owned by `examate`, four tables, three seeded tasks, `/api/health` reporting `connected`, and the workspace listing tasks in the browser. Also added `*.tsbuildinfo` to `.gitignore`, which had been letting a build cache into `git status`. All workspaces pass typecheck, tests (15 web, 1 api), formatting, build and `docker compose config`. |
| 2026-09-24 | Shared floating ExaMate AI launcher and chatbox; layout audit | Claude Opus 5.5 (Claude Code) | `apps/web/src/App.tsx`, `apps/web/src/AssistantPanel.tsx`, `apps/web/src/use-assistant.ts`, `apps/web/src/PageSections.tsx`, `apps/web/src/styles.css`, `apps/web/src/App.test.tsx`, `apps/web/src/assistant.test.tsx`, `docs/AI-CHATBOX-HANDOFF.md`, `docs/HANDOFF.md`, `docs/ideas/responsive-ai-copilot.md` | Agent verification only; no human review yet. Tài asked for the change through `docs/FE-LAYOUT-AI-HANDOFF-PROMPT.md` and must still try the panel at phone and desktop width, explain who owns the draft and why it survives, and get Thắng's agreement on the proposed (not existing) ask contract before merge. | Replaced the header Ask AI button and the reflowing dock with one floating launcher and one always-mounted panel: a non-modal window from 768 px, a modal sheet below it with inert background, scroll lock, Escape and focus return. Moved the draft into App via `useAssistant` so closing or changing page keeps it; the assistant page no longer has its own disabled composer. Sending stays disabled because no transport is passed; the reply, sources, sending and error states are tested only with fixtures. Found during verification: the skip link stayed reachable behind the modal sheet; the mobile close button was 40 px because a touch override lost to a later rule; the floating controls covered the footer link on 8 of 9 pages; a slide-in entrance pushed Send off-screen when the transition stalled (replaced by scale about the anchored edge). Also fixed two pre-existing unhandled test errors (POST mocks for exams and expenses) that had made the web suite exit 1 while earlier reports only read the pass count. Tests were written to fail first and mutation-checked. Virtual keyboard and emulated reduced motion were not verified. |
| 2026-09-25 | Connect ExaMate chatbox to Thắng's Gemini text endpoint | Codex | `apps/web/src/App.tsx`, `apps/web/src/AssistantPanel.tsx`, `apps/web/src/api.ts`, `apps/web/src/styles.css`, `apps/web/src/App.test.tsx`, `apps/api/src/assistant/assistant-chat.dto.ts`, `apps/api/src/assistant/assistant.types.ts`, `packages/contracts/index.d.ts`, `docs/ASSISTANT-SETUP.md`, `docs/AI-CHATBOX-HANDOFF.md`, `docs/HANDOFF.md`, `docs/ai-usage-log.md` | Agent verification only; Tài/Thắng review still required. Tests mock the HTTP endpoint; no live Gemini request was made in this change. | Wrote an integration regression test first and observed it fail specifically because Send was disabled without a transport, then connected `useAssistant` to `POST /api/assistant/chat` through the shared API helper and added shared HTTP types. The panel now states that RAG is not connected and hides the example grounded answer; failures retain the draft through existing hook behavior. This connects text chat only; no document retrieval or citations were added. Verified typecheck, tests (37 API unit + 98 API HTTP/adapter + 79 web), and build. Web Prettier and all touched-file formatting pass; root `npm run format:check` still fails because 33 API files outside this change are unformatted. Local `GET /api/assistant/status` returned `ready` for `gemini-2.5-flash`, but no quota-consuming Gemini request or browser interaction was performed. |

## Review rule for the team

### 2026-09-11 — Study Workspace visual refresh (Codex)

Tài approved the split hero, sage background, modern cards and lightweight motion. Updated `App.tsx`, `AcademicPanels.tsx` and `styles.css`; preserved existing task/document logic and the full Exams table. Added a document-library shortcut, compact dashboard exams and reduced-motion support. All 14 frontend tests and the production build (including TypeScript) passed after the final code changes; modified source was formatted with Prettier. Browser screenshot verified the new hero keeps the original image framing. Tài/Thắng human review and multi-viewport verification remain pending.

Before merging any AI-assisted change, a team member should be able to:

- describe why the change is needed;
- explain the important code path and data flow;
- run the relevant test or verification command;
- identify one possible failure mode; and
- state what was changed after review.

Add one row for every later substantial AI-assisted task. Record the task, generated or changed files, how a team member reviewed the work, and the corrections made after that review.

## 2026-10-18 — F01 Google OAuth / JWT-backed BFF (Codex)

Task: implement Google login through Supabase PKCE while retaining the opaque
HttpOnly session, CSRF, database session verification and membership gates.
Tools used: local PowerShell/Node/Python, Git, Docker disposable PostgreSQL 17,
Vitest/Node tests, and official Supabase documentation/source through web tools.
No source or user data was sent to a third-party coding CLI.

Key instructions applied: separate provider state from app correlation; encrypt
server-only verifier with distinct purpose; atomically claim and recheck the
prelogin after exchange; never trust decoded JWT or client role; do not apply
migration 016 or configure live OAuth without a separate owner checkpoint.

Observed corrections: initial test RED proved the Google route/button absent;
JWT contract test rejected the old adapter's missing issuer/audience check.
An early build overlapped the first baseline run and was invalid evidence;
that run is retained and a clean source baseline is measured separately.
A scripted edit also produced duplicate methods before compilation; it was
corrected locally and is not counted as behavioral RED. Verification outcomes
are recorded in the final context/demo checklist. Human review remains pending;
no fabricated human corrections or fabricated examples of AI mistakes are claimed.

Historical entries below/above describe their original dates and paths; retired
reports can be inspected in Git history. This root file is the single maintained
AI usage log, replacing docs/ai-usage-log.md without discarding its history.

F01 verification update: real Chrome native and Compose/Nginx fixtures passed
at 1440px/375px; native additionally exercised roles, no-access, account race,
notes/draft separation. Auth SQL used a real disposable non-owner; provider and
business lists were synthetic. Four security mutations were caught and restored.
Final measured gates and cleanup are recorded in docs/FINAL-DEMO-CHECKLIST.md.
Corrections also included UTF-8 shell output, a cloned mock stream cancellation
hang, missing dev dependencies in the production image and isolated broadcast
channels for test workers. These are observed agent/harness errors, not invented
human review. Google live, machine Thắng and human approval remain pending.

2026-10-19 hardening: a deterministic row-lock regression observed one exchange
after the attempt expired while waiting (expected zero). Rechecked wall-clock
expiry after lock acquisition for start, claim and issuance. A fixture initially
assigned absolute/idle expiry with two clock_timestamp calls and violated its
ordering CHECK; using one statement timestamp fixed the fixture, not the policy.
This expiry RED is distinct from the additional start-expiry control added green.

The final mutation run also exposed an existing prelogin creation race: two
Date.now reads could put idle expiry one millisecond after absolute expiry.
A deterministic ticking-clock test was observed RED, then GREEN after sharing
one expiry instant. This constraint failure was not counted as a caught security
mutation; the stale-callback mutation was rerun and failed its behavioral assertion.

Final privacy review reproduced another real gap: Vite's upstream-error logger
included callback query parameters. A loopback failing-upstream test observed RED
on the synthetic code sentinel; a callback-specific fixed-message logger made it
GREEN. The regression joins npm test and the native browser fixture also checks
callback privacy with the API stopped. API status and Auth trust rules did not change.

Final measured run on 2026-10-19: all five gates exit zero; 288 API Vitest,
843 API Node, 374 web and 390 PG17 database tests pass, no fail/skip/cancelled.
Native and rebuilt Compose fixtures pass at both viewports. Cleanup initially
flagged the standard B0d cluster fixture role and a PowerShell label-quoting error;
marker/ownership checks resolved both before deleting only the run-owned volume.
Ignored synthetic evidence/images remain local; no cloud writes or push occurred.

## 2026-10-19 — F01.1 rollback 016 hardening (Codex)

The reviewer reproduced two actual gaps: dry-run ignored external dependencies
and the schema check only compared column names. Both new PostgreSQL regressions
were observed RED as missing expected rejection before the implementation changed.
Shared read-only/apply preflight now compares a checked-in pristine/source catalog
contract and traverses pg_depend; RESTRICT remains the last barrier. No migration
or Auth/session runtime was changed. An additional renamed-FK-trigger regression
observed RED during review and is now guarded without persisting target OIDs.

Tools: local Git/PowerShell/Node/Python, existing test runners, guarded disposable
PG17/Docker and primary PostgreSQL/Supabase/Google docs. No external coding CLI,
no source/data upload, no cloud payload or new package. Dependency/schema guard
mutations built and failed assertions; restored tests passed. A test regex first
matched the safe word “privately” instead of just the injected private sentinel;
the matcher was corrected, not counted as a product RED or caught mutation.

The owner supplied the actual FINAL F01–F16 roadmap during this task; it replaces
the obsolete ordering without executing later phases. Search/pagination and AI
dashboard stories are explicitly pending. Private config is not effective in
this checkout, so cloud preflight/provider inspection have not run. Owner receives
specific setup/readiness steps, not a fabricated Google live or Thắng verdict.
Human review of the patch remains pending; final gate/cleanup outcomes live in
the existing FINAL-DEMO-CHECKLIST. AI_USAGE historical content stays intact.

Final F01.1 measured gates all exit zero: API Vitest 288, API Node 843, web 374
(1,505 app), PG17 DB 423 across 25 serial suites, no fail/skip/cancelled. Only
maintenance script/tests/docs changed: no new browser/Compose/Google acceptance
is claimed. Final read-only readiness still has invalid/missing effective Auth
and target config, so no cloud/provider connection was opened. Owned disposable
DB/roles/container/volume were cleaned after marker/project checks; unrelated
SOP containers remain. No push, cloud write, key rotation or migration edit.

## 2026-10-19 — F02-A runtime capability and tenant RLS (Codex)

Tools: local Git/PowerShell/Node, existing npm/Prettier/test tooling, guarded
disposable PostgreSQL 17/Docker. No source or private data was sent to an
external coding service; no cloud, Google, Gemini or Storage calls were made.
No dependency, lockfile or prior migration changed.

The implementation split business and Auth connections, added startup capability
checks, and added source migration 017 plus local apply/rollback tooling. Review
found that rollback did not restore legacy ACL rows for `ai_evaluations` and
`schema_migrations`; a PostgreSQL regression went RED on those exact ACLs, then
GREEN after the existing migration snapshot mechanism was extended. Additional
viewer-write and owner-role mutations built successfully and failed on behavioral
assertions, then were restored and rerun green. Policy scope, WITH CHECK and
transaction-local context mutations were also tested against the disposable DB.
The implementation/test commit is `f850114`.

Final gates: typecheck/build/format exit 0; app 288 API Vitest + 846 API Node +
374 web = 1,508 pass; PG17 database 430 pass across 27 serial suites; no
fail/skip/cancelled. The initial format check identified one formatting-only
issue in an existing test file; Prettier fixed it and the gate passed on rerun.
No claim of browser UI acceptance is made because browser automation was not
available without adding a dependency. The local HTTP/SQL integration is not
Google live, cloud rollout, machine Thắng, or semantic RAG acceptance.

## 2026-10-19 — F02-A.1 re-index and capability contract correction (Codex)

Tools: local Git/PowerShell/Node, existing npm/Prettier, Docker PostgreSQL 17
disposable with real LOGIN capability roles. No source was sent to an external
coding service; no cloud, Gemini, Storage, credential or user data was accessed.
No dependency or lockfile was added/changed.

The task regressions first reproduced: re-index reached PostgreSQL unique
constraint `23505` because old chunks were hidden while the document was
`processing`; an unmapped business session could read workspace rows; capability
startup accepted TRUNCATE/disabled RLS and Auth access to business data; a PUBLIC
open policy passed apply/startup; and a lost BEGIN acknowledgement left the
transaction open. Migration 018 now limits old-chunk visibility to authorized
manager/member processing of a stored document, tightens workspace membership
policies, snapshots/restores pre-018 PUBLIC CONNECT, and uses capability catalog
contract v18. Apply/preflight rejects effective unmanaged policy; runtime checks
catalog state on startup without auto-repair. CLI transaction tracking begins
before sending BEGIN.

Five isolated mutations were built and failed on their intended assertions:
chunk visibility, PUBLIC-policy detection, RLS catalog check, membership scope,
and BEGIN lifecycle tracking. Each mutation was restored and focused suites rerun.

The capability digest was verified stable across two independently prepared
pristine PG17 disposable databases; it is a source constant, not target-derived.
Browser automation remains blocked because no Playwright/Puppeteer/driver is
installed; no dependency was fetched and no browser PASS is claimed. Final gates
were rerun sequentially: 1,508 app tests and 446 PG17 tests/28 suites, no
fail/skip/cancelled. The code/test commit is `65e24e49b4deaad1f03246caa81321396b646564`;
details are in the existing demo checklist. Cloud writes/push are outside this task.

### Independent review and scope update — 2026-10-19

Codex reviewed F02-A.1 and ran 67 focused PostgreSQL tests plus an isolated
IAB/CUA browser smoke with real non-owner business/Auth logins and fake providers.
The user requested STT-only F10 and removal of F15's three-tool expansion; the
remaining roadmap/requirements now record that limit without changing the
lecturer's three-tool threshold for capability B. No production code was changed.
Browser review found a stale Documents → Assistant list after indexing despite
green database regressions; it was reproduced before/after reload and recorded
as an open P2, not accepted as fixed. Inline PDF rendering remains unverified.

## 2026-10-19 — F02-A.2 Documents lifecycle synchronization (Codex)

Tools: local Git/PowerShell/Node, existing npm/Vitest/Prettier tooling, guarded
disposable PostgreSQL 17, and isolated headless Chrome through its local CDP
endpoint. Browser requests used a synthetic in-memory API/Auth/Storage/provider;
outbound HTTPS was blocked. No cloud, account data, credentials, Gemini, Google,
Supabase, or external coding service was used. No dependency or migration changed.

The P2 RED regression opened Assistant after Documents confirmed `ready`; the
new document option was absent until a full page reload. App now invalidates the
shared `useDocuments` read after settled document mutations and reconciliations.
Assistant uses only stored/ready sources, preserves valid draft/history when the
list refreshes, and shows a read error with read-only retry instead of presenting
an unconfirmed empty list. Stale list and operation results are ignored after a
newer request or view/session change.

Three built mutations failed their intended assertions and were restored:
missing post-index invalidation, missing stale-response guard, and allowing a
pending document into available sources. One early browser harness selector
matched the Download action rather than the citation; the harness was corrected
to follow the citation's accessible name and validate the actual inline PDF
surface. The browser showed the synthetic PDF page and completed a separate
download. This is local UI evidence, not proof that browser requests used the
real non-owner API/DB. PG17 DB gate independently passed 446/446 across 28 serial
suites; final application total was 1,517 pass (API Vitest 288, API Node 846, web
383), all five gates exit 0. The strict browser + non-owner SQL path remains
PARTIAL; cloud rollout, Google live, Auth extended, and Thắng's machine remain
pending. No push or cloud writes occurred.

## 2026-10-20 — F02-A local browser acceptance and F03 prompt/usage foundation (Codex)

Tools: Codex in the local workspace, Git/PowerShell, existing Node/npm/Prettier
tooling, the repository's guarded PostgreSQL 17 disposable fixture, and isolated
Chrome 141 browser automation already available in the environment. No package
was installed. Browser API traffic went through the local Nest process and local
database; Auth upstream, Storage, OCR/extractor, embedding, and Gemini were faked.
External network requests were blocked. No cloud credentials, account records,
prompt content, document content, or source files were sent to an external coding
service. The [official Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing)
was consulted only to validate an explicit paid-tier estimate mapping; no
application data was sent.

AI assistance contributed to the typed prompt registry, usage/pricing normalizers,
bounded persistence service, migration 019 and local rollback, provider/controller
instrumentation, and regression/database tests. Prompt text and model behavior were
kept unchanged. A golden test initially went red because its provider-abstraction
snapshot lacked the intentional prompt ID/version metadata. The correction keeps
the original snapshot independent, strips only that metadata when comparing the
provider payload, and separately asserts the exact prompt reference. The actual SDK
request shape remains unchanged.

Targeted RED/GREEN caught and corrected: a successful response's SDK `modelVersion`
was not replacing the configured model in telemetry; stream iterator errors could
be classified as cancellation; OCR timeout was mapped to the wrong outcome; a
throwing telemetry logger could replace an already determined business result;
and cached token usage could have been treated as fully priced. Tests now assert
actual-model metadata, `error` versus `cancelled`, OCR timeout mapping, logging
failure isolation, unknown cached pricing, provider-call multiplicity, and tenant
isolation. Adding migration 019 also exposed hard-coded migration-count expectations
in older 016/018/CLI database fixtures; those fixtures were corrected to preserve
their intended source boundary, not to weaken migration checks.

One full database run observed false-empty retrieval in the existing pgvector
DELETE/reinsert fixture, including a zero-row frozen pre-scope nearest query. The
focused retrieval suite then passed 25/25 and the final complete PG17 suite passed
448/448 across 30 suites. The cause remains inconclusive; no ranking, ANN, index,
or scan-policy change was made. Final local gates: typecheck/build/format exit 0;
application 1,551 pass (API Vitest 321, API Node 847, web 383); database 448 pass,
with zero fail/skip/cancelled. F02-A browser acceptance was 86/86 at 1440px/375px,
including actual synthetic PDF render/download, with zero console issues and zero
external requests. No human review is claimed by this entry.

F03 metadata/pricing is a foundation, not an AI budget, billing record, dashboard,
semantic evaluation, or cloud rollout. Cost estimates assume the documented
Standard Paid Tier; unknown usage/model/tier remains unknown. Expiry cleanup is
not yet scheduled. Google live, cloud F02-B, Auth extended, and Thắng's machine
remain unverified.

The F02-A browser matrix above predates the F03 backend instrumentation. A
focused post-F03 browser smoke was not completed: the execution tool rejected
launching Chrome with a fresh isolated profile under its policy. I did not use a
personal browser profile or try an alternate launch path. The F03 browser smoke
therefore remains pending; the current F03 runtime evidence is from the unit,
HTTP/integration, and PostgreSQL disposable suites only.

The API fixture and Vite server were stopped. The interrupted browser fixture's
exact marked database and three LOGIN roles were removed after ownership,
membership, creation-order, and zero-active-session checks. The PG17 Compose
service was reused and left running. Other marked test databases/roles remained
in the disposable cluster without reliable attribution to this run, so they were
not bulk-cleaned.

## 2026-10-20 — F04 durable AI admission implementation (Codex)

AI assistance implemented a durable admission ledger and provider-call gate for
F04, plus PG17 migration/rollback and two-instance HTTP integration tests. The
daily ledger is separate from F03 telemetry. Operations are charged at reservation
time by verified user, with the DB's `Asia/Ho_Chi_Minh` date; provider attempts
are independently counted before SDK dispatch. Conservative unknown outcomes keep
their concurrency slot until upstream stop is confirmed. No USD budget is claimed.

The first focused migration run exposed that teardown tried to snapshot tables
after migration rollback had removed them; the fixture now compares only the
objects expected in each state. The first admission test exposed a missing
column-level SELECT grant for `started_at`; the migration grant and source-derived
capability digest were corrected, then the pristine-apply and rollback tests were
rerun. A later RLS test was corrected to use a different same-workspace user so it
tests actual user isolation rather than a globally scoped verified user's own
cross-workspace admission metadata. Focused migration tests passed 4/4 and focused
admission tests passed 9/9. The runtime HTTP/DB integration passed 14/14 after a
new assertion verified timeout and cancellation retain `unknown` reservations.

Verification used local Git/PowerShell, installed Node/npm/TypeScript/Vitest and
PostgreSQL 17 disposable with synthetic Auth/SDK/Storage/PDF fixtures. Nest,
Auth/session/membership/RLS, business/Auth LOGIN pools, `AiUsageService`,
`AiAdmissionService`, Gemini/embedding/OCR wrappers and PostgreSQL persistence
were real in the focused HTTP/DB run. Browser/CUA was unavailable and was not
replaced by HTTP evidence. At the time of this focused run, the full five-gate
rerun was still pending; its final result is recorded in the later F04 entry
below. No cloud write, paid provider, dependency installation, push or deployment
was performed.

## 2026-10-20 - F03.1 review corrections (Codex)

AI assistance reviewed and corrected Gemini usage normalization and the signed-PDF
open-in-new-tab flow, added focused unit/web regressions, and expanded the
disposable PG17 HTTP integration proof, including a controlled timeout and a
client-cancelled SSE request with outcome and single-attempt assertions. The
token-count correction was checked
against the installed Google Gen AI SDK declarations and the official Gemini API
usage metadata documentation. The PDF flow signs again through the existing
authorized API after the click gesture rather than persisting/reusing a signed URL.

Verification used local Git/PowerShell/Node/npm, installed Vitest/Prettier,
the guarded PostgreSQL 17 disposable fixture, and the existing Nest application.
Auth adapter, Storage/PDF bytes, SDK transport and AI provider responses were
synthetic; Gemini, Google OAuth, Supabase, cloud Storage and external AI services
were not called. The required browser acceptance could not be run because no
browser/CUA tool was exposed in this session and tool policy had rejected the
previous isolated Chrome launch. No human review is claimed here.

New gates: typecheck/build/format exit 0; API Vitest 329, API Node 847, web 384
(1,560 total); PG17 database 448/448 across 30 suites, zero fail/skip/cancelled.
The shared-corpus run was bounded to 12 cycles and did not reproduce the historic
false-empty; that finding remains inconclusive. F03_LOCAL_ACCEPTED is not claimed
until the required browser run is completed.

Follow-up verification corrected the telemetry-failure DB fixture's ACL cleanup.
It now snapshots table/column grants, revokes and restores the INSERT columns
from migration 019, and asserts the catalog snapshot plus both runtime capability
checks return to baseline in `finally`. A table-wide INSERT cleanup mutation
produced the expected RED ACL assertion; the column-scoped implementation is
GREEN. The full disposable PG17 gate was rerun: 448 pass in 30 suites, no
fail/skip/cancelled. The application gate was rerun: API Vitest 329, API Node 847,
web 384; 1,560 total. Browser acceptance remains blocked by tool availability;
no browser result or human review is claimed.

## 2026-10-20 - F04 final local implementation and verification (Codex)

Implementation commit: `d716c13`.

The final full test run exposed stale compatibility fixtures, not a runtime
admission failure: the shared ingestion fake lacked the OCR fan-out planning
method; the pre-F02 CLI fixture counted only through migration 016 despite source
020; full-chain academic/workspace fixtures expected 19 ledger rows instead of
20; and privilege tests attempted `SET ROLE` to a nonexistent legacy role. I
corrected only fixtures and expectations: OCR fakes report zero planned external
calls, full-chain counts include 020 while rollback-019/016 fixtures keep their
explicit migration limits, and SET ROLE denial targets the real provisioned
`examate_auth` capability. Focused ingestion 44/44, DB ingestion 26/26, CLI 14/14,
academic/documents 30/30, workspace context 19/19, and OAuth 11/11 passed. The
final complete PG17 database gate passed 462/462 with no failure, skip, or
cancellation. The application gate passed API Vitest 332, API Node 850, and web
384 (1,566 total); typecheck/build/format also exited 0. The final regression
also proves question fan-out is recorded in the initial reservation before
handler work/SSE headers; a zero cap rejects before operation accounting or
provider dispatch. A mutation that removed the persisted planned count failed
the expected assertion and passed after restoration.

No browser/CUA tool was exposed, so F03/F04 browser acceptance remains pending.
No browser result is inferred from HTTP tests, and no cloud writes or paid
provider calls occurred. F03 remains `F03_CODE_VERIFIED +
F03_BROWSER_ACCEPTANCE_PENDING`; F04 is `F04_IMPLEMENTED + AUTOMATED_GATES_PASS +
BROWSER_ACCEPTANCE_PENDING`, not local acceptance. No independent human review is
claimed in this entry.

## 2026-10-20 - F04.1 provider admission lifecycle correction (Codex)

AI assistance reviewed the reproduced timeout/abort lifecycle and admission
error-mapping defects, added strict subprocess and wrapper regressions, and
implemented non-rejecting deadline signals, immediate provider-promise
settlement, pre-dispatch cleanup, and safe admission error preservation. The
review also checked that rejected admission is not persisted as a provider
failure and that JSON/SSE preserve the safe status/code contract.

Verification used the installed Node/npm/Nest/Vitest toolchain and a labeled
PostgreSQL 17 disposable with separate non-owner LOGIN roles. Provider SDK
transport, Auth upstream and OCR/image inputs were synthetic; no Google or paid
provider was called. Strict-mode child processes reproduced the original crash
before the fix and completed safely after it. Final gates on code commit
`fed6cd8` passed: API Vitest 339, API Node 855, web 384 (1,578 total), and
PG17 database 462/462; typecheck, build and format also exited 0. Browser
automation was unavailable in this session, so cancellation/draft UX remains
pending; no human review is claimed. No cloud writes, credential changes, push
or deployment occurred.

## 2026-10-20 - F05 Documents search and pagination (Codex)

AI assistance inspected the existing Documents consumers and implemented an
additive paged API, shared contract/validation, workspace-scoped SQL, UI query
controls and stale-response guards. It added synthetic PG17/Nest and FE
regressions, including a failing pre-route assertion, then corrected issues
found by typecheck and focused tests. The old complete-list API remains for
Assistant/sidebar consumers; the paged Documents response is not treated as the
Assistant source universe.

Verification uses only synthetic document/course/workspace data and the local
PG17 disposable with the existing non-owner runtime fixture. No cloud, Storage,
AI provider or user data was used. The current session exposes no browser
automation tool, so browser acceptance is explicitly pending. Test counts and
final commands on code commit `9981912` are: typecheck/build/format exit 0;
`npm test` 1,583 passed (API Vitest 339, API Node 855, Web 389); and guarded
`npm run test:database` 463/463 passed on PG17. The Documents HTTP/DB suite is
4/4. Its initial full run exposed an out-of-range fixture mistake (page 99 was
still within 113 pages); the fixture was corrected to page 114, then both the
focused and full DB suites passed. This was not a production defect. No
independent human review is claimed. No cloud write, paid provider call, push
or deployment occurred.

## 2026-10-20 - F05.1 Documents validation and deep-link correction (Codex)

AI assistance reproduced the repeated-query failure through the running Nest
HTTP parser, added the PG17-backed validation regression, and changed the DTO
condition so non-string values are rejected before the search service. It also
connected the route focus ID to a separate, scoped document lookup and focused
card. The FE regressions cover page/sidebar navigation, out-of-filter targets,
stale request and principal changes, non-disclosure, permissions and lifecycle
actions. The existing paged response and Assistant's legacy complete source
list were left intact.

Verification uses synthetic tenant/document data, the local PostgreSQL 17
disposable and the existing non-owner business/Auth LOGIN fixture. No cloud,
real account, Storage or AI provider was used. The HTTP regression failed with
500 before the fix and expects 400 with zero search-service calls afterward;
the route/sidebar FE integration cases failed before the focus wiring and pass
after it. On the final pre-commit source, typecheck, test, build, format and
database gates all exited 0. `npm test` passed API Vitest 339/339, API Node
855/855 and Web 403/403 (1,597 total); guarded PG17 database tests passed
463/463 across 32 serial suites. Focused Documents/App tests passed 140/140 and
the Documents HTTP/PG17 suite passed 4/4. Exact commands and browser limits are
recorded in the F05.1 section of FINAL-DEMO-CHECKLIST. Browser automation was
not exposed, so desktop/mobile UI acceptance remains pending. No human review
is claimed; no cloud writes, push or deployment occurred.

## 2026-10-20 — F05.2 workspace sidebar search (Codex)

AI assistance inspected the six sidebar search consumers and implemented the
typed paged API, tenant-scoped SQL, Vietnamese text-folding reuse, and sidebar
debounce/filter/sort/pagination with stale-principal guards. It added FE and
Nest/PG17 HTTP regressions; the database fixture uses synthetic records and
separate business/Auth LOGIN roles, while provider calls are asserted absent.
The implementation preserves the Documents page and Assistant source-list
contracts and constructs only allowlisted internal routes.

New verification on the local source: typecheck, test, build, format and guarded
PG17 database gates exited 0. `npm test` passed 340 API Vitest, 855 API Node
and 409 Web tests (1,604 total); the new `/api/search` HTTP/PG17 test passed
1/1 separately. A tenant-scope mutation and a stale-response mutation each
failed their targeted assertions and passed after restoration. The dedicated
repeated-query validation mutation was blocked by the environment's command
policy and is not claimed; repeated-key rejection itself is covered through
the real HTTP parser in the standard database suite. Browser automation was
not exposed, so desktop/mobile, keyboard, layout and console acceptance remain
pending. No independent human review, cloud write, external AI call, push or
deployment is claimed.

## 2026-10-20 — F05.2.1 workspace-search corrections (Codex)

AI assistance reviewed the current sidebar pagination hook, the workspace
search service and its DTO/parser boundary, then added regressions before
changing implementation. On the baseline, the FE tests observed that a new
query, cleared-and-reentered query, or principal switch reused page 2; a late
page-2 response could also compete with the new query. The service test observed
that a query whose current fold becomes empty proceeded into the business
transaction. The corrected tests pass with query/principal-scoped page state,
immediate derived page 1, and a server 400 before transaction/SQL. The UI maps
only the stable `SEARCH_QUERY_UNSUPPORTED` code to a specific status message;
other failures retain the retryable read-error state.

New verification on this source: focused sidebar and Documents search tests
passed 25/25, the service tests passed 2/2, and Nest/PG17 HTTP search passed
1/1. That HTTP fixture used a real PostgreSQL business LOGIN non-owner with RLS
and a synthetic Auth/session fixture; it did not use an Auth LOGIN database
connection for that route test. The full serial database gate separately
exercised the runtime Auth/business LOGIN capability suite. The complete
application tests passed API Vitest 341/341, API Node 855/855, and Web 412/412.
Typecheck, build, formatting and the guarded PostgreSQL 17 database gate are
recorded in the F05.2.1 checklist entry. Browser automation was not exposed in
this session, so no visual/browser acceptance is claimed. No model/provider,
cloud, credential or migration change was made; no human review or mutation run
is claimed.
