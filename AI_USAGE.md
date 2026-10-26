# AI Assistance Log

## 2026-10-26 - prominent explanations for guided technology slides

At the user's request, Codex moved the active-step explanation out of the small
muted control row on both guided slides (architecture and RAG). RAG uses the
space beside its retained demo image; architecture has a separate explanation
panel below its controls. Large dark text and a numbered label update through
node selection, Next, Reset, Play and the no-evidence scenario. Static caveats
are retained in speaking notes and the unchanged knowledge companion. PDF/PPTX
were regenerated as static ten-slide exports. Application, API, DB, credentials
and provider configuration were not changed; newer commits through `88f3c40`
were preserved.

Two tracked regressions were observed RED before implementation; the complete
deck checks then passed: 23 Node tests, 4 Python artifact tests, 50 Chrome
slide/width checks, 35 native interactions at 1440/375px, 3 companion checks and
merged-note bounds. Chrome reported zero console errors/external requests.
The initial new browser assertion compared computed RGB against a CSS hex token;
it was corrected to the expected computed color, and the browser run was repeated.
Screenshot capture now waits for finite entrance animations to finish. Raw RED,
GREEN and browser logs remain ignored in
`artifacts/technology-explanation-20261026/`; final browser evidence is
`artifacts/technology-deck-20261026/93e8d7a6/`. These are document checks, not
application, live-model or semantic acceptance. No model call was made.

## 2026-10-26 - page-jump fix, display language and member management

At the user's request, AI (Claude Code) diagnosed two Firefox recordings and fixed
the page jumping at its source: returning to a tab re-verified the session through
a visible `verifying` state that hid the whole workspace, and lists/Documents were
swapped for a loading message on every re-read. Verification is now a background
step (only `401`, no access or expiry lock the screen) and a list keeps its rows
while the same filter is re-read. API, database and contracts are unchanged. The
older tests that asserted "hide while checking" were rewritten for the new
behaviour; the trade-off is recorded as ADR-015. Commit `9c8a18b`.

A VI/EN switch for the interface was added (`aad9b30`, ADR-016). It changes page
names, buttons, hints and system messages only; typed input, file names, saved
records and AI answers are untouched, and the AI answers in English only when the
question asks for it. A dictionary test fails on any wrapped string without an entry.
Strings inside the Assistant panel and speech input were wrapped for display; the
speech/RAG behaviour that belongs to Thắng is unchanged.

For roles and accounts AI added a **Members** page and migration `027` (`4e7f2cc`,
ADR-017): a table of what each role may do, what is shared by the group (including
every member's uploaded documents) versus private to each person, and, for managers,
role changes, switching access off/on, invitations by e-mail and a one-click grant
for people who signed in without access. The migration is additive and leaves the
pinned runtime catalog digest unchanged; a database without it keeps working. It was
first rehearsed on disposable PostgreSQL 17 (canonical and a restricted managed
installer fixture), then applied to the cloud project at the owner's explicit request,
after a fresh `public` backup and a ledger/contract preflight (`docs/MANAGED-DEPLOYMENT.md`).

Checks: web, API and 53 database test files pass on disposable PG17; typecheck,
format and build are clean; desktop and 375px browser checks of the switch and the
Members page. AI also caught its own mistakes along the way (rows 7-9 below). Nothing
was pushed, and no Google or paid provider call was made.

## 2026-10-26 - compact ten-slide technology edition

At the user's request, AI merged related topics from fifteen to ten slides while
retaining all fifteen subject mappings, speaking notes and the full knowledge
companion. Architecture/backend, Auth/database, PDF/RAG, structured output/practice
and SSE/STT are paired. Eight retained screenshots support the shorter visual
route; existing screenshot assets remain preserved. Interactions and font sizes
are retained rather than shrinking everything to fit. Speaker notes now grow
with their content in screen mode; print keeps the intended static 16:9 layout.

Two new compact-edition assertions were RED against the fifteen-page version,
then GREEN after merging. Test expectations explicitly map every original topic
to its new slide instead of dropping coverage. Original English slides and app,
runtime, environment, provider and database are unchanged. No cloud/paid call.

Final authoring checks passed: 21 Node, 4 PDF/PPTX/companion, 50 browser layouts,
31 native interactions and 3 companion checks, with zero console/external requests.
An initial syntax typo in the new note-boundary probe failed that harness; after
correction it verifies merged notes do not overlap the following slide. Logs
are retained. Only owned browser/static servers were closed; no container/DB created.

## 2026-10-26 - visual technology storytelling and offline interactions

At the user's request, AI replaced the repeated text/image composition with
fifteen visual layouts, concise copy, locally embedded technology logos and
labelled offline illustrations. Full reasons, trade-offs and original speaker
notes were preserved from 69eab36 in a separate knowledge companion. Fourteen
Simple Icons SVGs were downloaded at a pinned public source revision, with hashes
and CC0 license material. No logo or application screenshot was fabricated by a model.

Six new visual/interaction checks were RED on the previous edition, then GREEN.
Tests retain rationale assertions against the companion instead of deleting those
requirements. Browser checks cover manual/play/pause, actual keyboard flip, RAG
refusal illustration, role switch, stopped typewriter and reduced motion. A
picture overlapped the identity diagram in print and was corrected into separate
grid rows. An old print oracle targeted the replaced split layout; it now checks
the complete four-node pipeline. A browser race sampled the previous document;
fresh query-bound documents and a navigation marker corrected the harness.
An observer queued during JSDOM close was guarded against detached roots.

PDF/PPTX remain honest static snapshots (PPTX adds fade transitions). No app,
DB/Auth, model, cloud, paid call or acceptance matrix was changed. Raw failures,
screenshots and isolated-browser evidence remain ignored, not erased.

Final document checks: 19 Node tests, 4 PDF/PPTX/companion tests, 75 browser
slide/width checks, 31 native interaction checks and 3 companion checks passed.
Visible slide copy averages 54 words (captions and notes excluded). A separate
LF-byte regression exposed Windows line-ending drift before publication; the
technology builder now normalizes published HTML before hashing. English deck
bytes and app/runtime remain unchanged. Owned browser/static servers closed;
no container/database was created. These are document checks, not app acceptance.

## 2026-10-26 - Vietnamese technology presentation

AI authored a separate fifteen-slide Vietnamese technology edition from the
existing visual layout, source and retained screenshot provenance. Each major
technology includes purpose, selection rationale, trade-offs and Vietnamese
speaker notes. Eleven screenshots keep synthetic/live boundaries; no new AI
output, deployment or educational-quality acceptance is claimed. RAG credit is
shared with Thắng as confirmed by the user.

Existing offline build/Chrome tooling gained a technology-only flag; original
artifacts are preserved and hash-checked. Poppins extended Unicode coverage is
included for Vietnamese. HTML is editable; the additional PPTX intentionally
uses layout-preserving artwork with editable notes, rather than claiming native
editable slide text. Documentation/static-deck tests are separate from app gates.
No credentials, paid provider, cloud, database, runtime or application code changed.

Six new artifact checks were observed RED before the edition existed; after
authoring, all 12 new/original Node deck checks passed. Three exported PDF/PPTX
checks passed, and isolated Chrome checked 75 slide/width combinations plus
controls, notes and standalone use. These are document checks, not app gates.
An initial inspection print hit Windows console encoding after producing the
preview; UTF-8 output was used for subsequent inspection. Original English
source/output hashes remain unchanged. Evidence is ignored under
`artifacts/technology-deck-20261026/`; owned browser/server processes closed.

## 2026-10-26 - source-bound oral-defense study guide

AI reviewed and extended the existing Vietnamese offline study HTML at the
user's request, preserving its 30 original questions and embedded code. The
guide now has 68 questions, a contributor filter, 14 sections, frontend and
request-lifecycle explanations, Study Coach recovery, shared RAG credit for
Thắng, an API/code/test map and separate practice plans for Tài and Thắng.
Contribution statements distinguish Git evidence from the user's clarification;
AI does not certify personal authorship or understanding on either person's behalf.

Source was checked at 51e9634. Historical test/evaluation counts are labelled
as retained evidence; documentation checks are not application, live-model or
semantic acceptance. Local OCR configuration is a dated observation, separate
from source defaults and the evaluation generation model. No application code,
provider, database, runtime, secret or cloud change was needed for this task.

Document verification passed 16 static checks (218 resolved links, 20 source
snapshots, 30 original questions retained) and 47 isolated Chrome checks at
1440/375/320px. Search, contributor filters, keyboard focus, answer toggles and
print-state restoration were exercised. A navigation focus check caught the
native fragment action overriding heading focus; explicit fragment navigation
fixed it. The first keyboard probe also required a proper Enter virtual key code.
Only the offline document was browsed; no application/DB/live-model gate was run.
Ignored artifacts retain the original HTML, diagnostics and screenshots.

## 2026-10-25 - shared workspace control/readability styling

AI added one scoped stylesheet plus its entry import to normalize controls,
labels/captions and focus presentation while retaining Poppins, existing palette,
hero/gallery and special calendar/PDF/notes geometry. No component handler,
state, API, authorization or backend was changed. No new dependency/provider call.

An independent Chrome sizing probe observed 124 desktop findings before styling;
final 36 active-page checks, 3 composer checks and 13 role/task checks passed.
The first mobile probe could wrongly count only an open Assistant's controls;
a new active-page assertion exposed this harness error. It now uses fresh
per-route documents and rejects inert main pages. Initialization/photo/selector
fixture errors and failed logs were retained, not relabelled as app defects.
Full application tests freshly passed 2338; details and limitations are in context
and demo checklist. Only the local real web image was updated; API identity stayed
unchanged. No live/semantic or physical-device acceptance was signed by AI.

## 2026-10-25 - verified role and task status badges

AI implemented display-only badges from the already verified session role and
server task status, using existing Heroicons/Poppins and the sage/neutral/warm
palette. Typography, focus and touch targets changed only in the task/session
areas. No authorization, transport, contract, backend, database or dependency
change; Course progress and gallery remain unchanged.

Eight new UI cases were RED, then passed. Full application suite newly passed
2338 tests, plus 13 real-browser/Nest/PG17 fixture checks with synthetic upstreams.
A login keyboard-event issue and SQL parameter type ambiguity were in the new
browser harness, not application services; both were corrected without weakening
production checks. Only the local real web container was updated, leaving the API
identity unchanged. No paid model call, cloud mutation, env edit or new acceptance
claim for educational quality. See context/checklist for measured limits/cleanup.

## 2026-10-25 - reference-style presentation authoring

AI authored a separate fifteen-slide HTML/PDF design following the user-selected
black/white/yellow reference, using existing Poppins/Heroicons and photographs.
Eleven retained screenshots were resized/re-encoded (one documented viewport
crop), with original/output hashes and fixture boundaries. No application screen
was generated by an image model. The flashcard diagram is labelled illustrative.
Licenses are included in source assets and embedded in the standalone HTML.

AI's first PDF export mistakenly inherited mobile layout rules: four required
content checks failed on the artifact. Limiting the responsive media query to
screen restored desktop print layout and the independent PDF regression passed.
An initial navigation test used an overly broad section selector; it now targets
direct slide sections without weakening the position/focus expectation. Initial
build also caught an unresolved Heroicon name containing a digit. Failed runs
are retained in ignored artifacts. No new model call, semantic review, personal
contribution attestation or cloud operation was performed; measurements on slides
remain explicitly dated.

> Nhật ký provenance theo ngày, không phải hướng dẫn triển khai hiện tại. Các
> path handoff/prompt/plan đã bỏ khi dọn docs ngày 18/10 vẫn có thể xem qua
> `git show e9ac2af:<path>`. Điểm tiếp tục: [context](docs/PROJECT-CONTEXT.md) và
> [README](README.md). Giữ nguyên các ghi nhận review/test lịch sử; những câu
> “chưa có AI/Auth/Git” bên dưới chỉ đúng tại checkpoint được ghi, không phải hiện tại.

## Lỗi code do AI đã phát hiện và sửa (rubric 5.3, tổng hợp 23/10/2026)

Các trường hợp dưới đây là mã do AI viết (Codex / Claude Code) đã **sai thật**, được người
review hoặc test phát hiện, rồi sửa. Hash là commit sửa; file test là regression giữ lại.
Văn bản do AI soạn không thay thế xác nhận của Tài/Thắng rằng họ hiểu từng mục; mỗi
người phải tự giải thích được hai mục đầu khi bảo vệ.

| # | Lỗi (AI viết sai điều gì) | Ai/phát hiện thế nào | Sửa ở | Regression |
| - | ------------------------- | -------------------- | ----- | ---------- |
| 1 | Bộ kiểm chứng provenance chỉ đếm tài liệu, nên tập tài liệu A/A/C (trùng một tài liệu, thiếu một tài liệu) vẫn qua | Reviewer độc lập chạy oracle `document-set` ngoài bộ test của AI; test cũ của AI không bắt được | `6207165` — `apps/api/scripts/rag-evaluation-provenance.mjs` | `apps/api/test/evaluation-provenance.test.mjs`, `evaluation-provenance.database.test.mjs` |
| 2 | Executor tin `requestSha256` đã lưu trong plan thay vì tính lại từ request; plan v2 có thể ghép với provenance của v1 (hash/revision không bị ràng buộc) | Reviewer đổi request nhưng giữ hash → executor vẫn gửi; AI đã tuyên bố "executor recomputes binding" — **tuyên bố sai**, bị đính chính | `3a628e6` — `rag-evaluation-quality-executor.mjs`, `rag-evaluation-quality-plan.mjs` | `evaluation-quality-executor.test.mjs`, `evaluation-quality-executor.database.test.mjs` |
| 3 | Bản sửa số 2 sao chép buffer của caller **sau** một `await`; caller đổi buffer trong lúc đó thì provenance cho bytes mới ghép với plan được duyệt cho bytes cũ (executor chạy hai POST và báo COMPLETED hash cũ) | Reviewer viết oracle đổi buffer ngay sau lời gọi; 4 test mới đỏ trước khi sửa | `da862cd` — snapshot đồng bộ trước `await` đầu tiên | `evaluation-quality-executor.test.mjs` (26 test, không dùng sleep) |
| 4 | Evaluator cho PASS khi phần nội dung bắt buộc của response vắng/sai cấu trúc (HTTP 200 được coi là đúng) | Phát hiện khi review F09-A (chi tiết trong `docs/PROJECT-CONTEXT.md`) | `89d7276` — `rag-evaluation-local.mjs` | `evaluation.test.mjs`, `evaluation-runtime.database.test.mjs` |
| 5 | Evaluator không kiểm marker `[S<n>]` khớp tập citation; refusal có thể mang text giống nguồn | Phát hiện khi review F09-A.2/A.3 (cùng nguồn) | `c487362` và các sửa kế tiếp | `evaluation.test.mjs` (ma trận 24 hàng parity với production `validateCitations`) |
| 6 | Helper của chain test seed 12 tài liệu/12 chunk nên "baseline trống" là sai; quét mã tĩnh không thấy | Reviewer đọc DB sau khi helper chạy | `ff44b41` + `3808a9f` (đính chính tuyên bố cũ) | `evaluation-ingestion-chain.database.test.mjs` (assert DB) |
| 7 | Bản đầu của `usePagedSearch` giữ hàng cũ cho **mọi** lần đổi bộ lọc, nên tổng chi 210.000 của kỳ trước vẫn hiện dưới bộ lọc tuần | Test `App.test` "totals only the expenses inside the chosen period" đỏ khi chạy lại bộ test | `9c8a18b` — chỉ giữ hàng khi cùng khóa truy vấn | `use-paged-search.test.tsx` |
| 8 | Codemod i18n ghép số nhiều bằng cách nối `"s"` vào chuỗi đã dịch ("kỳ thi" + "s" = "kỳ this") | AI duyệt trang Exams ở chế độ VI trong browser | `aad9b30` — chuỗi đầy đủ có số ít/số nhiều | `i18n.test.tsx` (từ điển đủ mọi chuỗi bọc) |
| 9 | Migration 027 làm sai ba test cũ có số migration cứng (profile managed, fixture pilot, rollback 025) mà AI chưa sửa khi viết migration | Chạy toàn bộ `test:database` trên PG17 dùng-một-lần | `4e7f2cc` — cập nhật manifest/baseline, thêm kiểm managed cho 027 | `managed-migration-profile*.test.mjs`, `pilot-cli.database.test.mjs`, `managed-auth-session.database.test.mjs` |

Tuyên bố sai của chính AI cũng được giữ trong lịch sử docs kèm dòng đính chính (ví dụ
B.2B.3 "no documents at setup", B.2B.5 "executor recomputes binding", B.2B.5.1 "works only
from a private copy") — xem `docs/PROJECT-CONTEXT.md`, không xóa lịch sử.

Với stack demo 23/10/2026 (`apps/api/test/demo-stack-server.mjs`), AI cũng viết sai hai chỗ và tự
phát hiện bằng browser: refusal của "model" giả trả `answer: ""` (production yêu cầu `answer`
không rỗng → `answer_shape_invalid`), và câu hỏi lấy nhầm `parts[0]` (page metadata) thay vì phần
`Question:`; cả hai được sửa trong harness, không đổi production.

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

## 2026-10-20 — F05.3 Courses slice (Codex)

AI assistance inspected the existing course service, route ordering, schema,
dashboard/selector consumers, route parser and shared paged-search behavior.
The implementation adds a typed, bounded server-side Courses search route and
screen, a scoped slug lookup for detail routing, and regressions for the page
contract, filters, sorting, tenant isolation, role/membership behavior and
stale frontend reads. No schema or RLS changes were needed. The legacy course
list remains only for dashboard and independent selectors; the Courses list
does not use it. A real disposable PostgreSQL 17/Nest HTTP fixture, Web tests,
typecheck, API/Web build and formatting checks were run; browser automation was
not exposed, so no browser acceptance or independent human review is claimed.

## 2026-10-20 — F05.3 Exams slice (Codex)

Task: add bounded server-side Exams search, filtering, sorting, pagination and
scoped ID lookup while preserving the separate dashboard summary and course
selector. Tools used: local PowerShell, Git, Node/Nest, Vitest and a guarded
disposable PostgreSQL 17 fixture. No external source/data service or AI
provider was used.

Review/correction: the first HTTP regression run against the old source returned
404 for `/api/exams/search`, which established the route-absence RED. During FE
integration, old tests still expected the previous unpaged list markup on the
Exams route. Those checks were separated into dashboard-summary expectations
and paged-screen CRUD/error expectations; the fixture was updated to persist
synthetic mutations so server-refresh behavior is actually exercised. Focused
HTTP/DB and UI tests then passed. Human review has not yet been performed, and
browser acceptance is pending because no approved browser automation capability
was exposed in this session.

## 2026-10-20 — F05.3 Study Plans slice (Codex)

AI assistance inspected Study Plans schema, DTOs, service/route ordering, legacy
dashboard and course-group consumers, course selector needs, and existing
workspace paging patterns. It added a typed paged search contract and scoped
detail lookup, with a primary paginated screen, server summary, filters, stable
sorts, deep-link focus, and refresh after confirmed writes. The legacy list and
course selector remain for independent consumers. No schema migration or
external AI call was used.

Verification used Nest HTTP with disposable PostgreSQL 17 and a real business
LOGIN that is non-owner and `NOBYPASSRLS`; Auth/session and external services
were synthetic test boundaries. The route regression was observed RED as 404
before implementation and GREEN afterward. Focused FE/App tests, API build,
typecheck, format and the focused DB test passed. No approved browser automation
capability was exposed, so no visual/browser acceptance or independent human
review is claimed.

## 2026-10-20 — F05.3 Expenses slice (Codex)

AI assistance inspected the expense schema/types, route ordering, legacy budget
and course-workspace consumers, course selector, date semantics, and existing
workspace paging/search patterns. It added an additive typed Expenses search
route and scoped ID lookup, a server-paged Finances view, full-filter aggregate
summary, and FE/HTTP/PG17 regressions. The SQL is a single workspace-scoped
statement; amounts are whole VND and aggregate values are returned as decimal
strings to avoid precision loss. Existing write endpoints and the separate
course-workspace legacy list remain in place. No migration or external provider
was needed.

Review correction: the focused App integration test initially retained the old
exact chart-heading text; it was updated to assert the new heading that
explicitly identifies the active-filter aggregate. A test DB runner entry was
also corrected to occur once, and the package file's accidental UTF-8 BOM was
removed. New verification: the Nest/PG17 HTTP suite passed 1/1 with a separate
business LOGIN non-owner/`NOBYPASSRLS` and synthetic Auth/session fixtures; the
Expenses FE and App selection passed 127/127; API build and typecheck exited 0.
The route test had first produced the expected RED 404 before implementation.
No approved browser automation capability was exposed, so desktop/mobile visual
acceptance and human review are not claimed. No cloud, provider, migration,
push, or deployment action occurred.

The final full test run passed API Vitest 341/341, API Node 855/855 and Web
434/434 (1,630 total). Typecheck, production build, format check, and the serial
guarded PG17 database gate each exited 0. During the first full run, the older
Tasks integration test fixture returned an array where the current paged
endpoint requires `items` plus `summary`; after correcting that fixture to
reflect the contract and server-confirmed status mutation, its focused test and
the complete application suite passed. The shared test correction does not
change production behavior. No human review or browser acceptance is claimed.

## 2026-10-21 — F05.3.1 focused record and expense chart corrections (Codex)

AI assistance traced the shared scoped-record hook and its Tasks, Study Plans,
Exams, Expenses, and course consumers. It added regressions for duplicate
focused cards, stale lookup/error state, a target entering and leaving the
current page/filter, and principal changes. The observed pre-fix RED was two
matching `data-focus-id` nodes for Exams and Expenses. The hook now masks the
focused state synchronously when the target is listed and keys a later lookup
to a new generation. A separate regression exposed course bars divided by the
largest single expense; they now use the largest per-course total while the
single-expense summary remains unchanged. No API/schema/permission behavior
changed.

Final local verification: typecheck, application tests, build, format check,
and guarded PostgreSQL 17 database gate all exited 0; the application counts
were API Vitest 341/341, API Node 855/855, and Web 443/443. The DB runner
completed 38 serial test files. Browser automation was not available, so no
desktop/mobile visual acceptance or independent human review is claimed. Only
the disposable PG17 fixture was used; no cloud, provider, secrets, or external
data were accessed. These checks do not accept whole F05 or complete pending
browser/cloud/remote-machine work.

## 2026-10-21 — F06 manager AI usage dashboard (Codex)

Implementation commits: `6fca9e3` (API/DB/contract) and `341776f` (web UI),
starting from `ef0450c` on the integration branch.

AI assistance inspected F03 telemetry writes/pricing, F04 admission separation,
migrations 019/020, the runtime capability contract, workspace transaction and
fresh membership authorization patterns, and the current navigation/API
conventions. It implemented the read-only manager API, bounded overview and
provider-call detail contracts, migration 021 column grants/RLS, startup and
migration preflight contract, guarded local rollback, and the responsive
dashboard. It did not change admission limits, provider calls, RAG, prompts,
pricing records, Auth behavior, or cloud configuration.

The first database integration run exposed that the expanded synthetic telemetry
fixture increased raw manager-visible rows, while an older assertion expected a
single row. The assertion was corrected to prove that every raw visible row is
still limited to the active workspace; expiry remains a dashboard query
predicate rather than a raw RLS predicate. The page serializer was also aligned
with the allowlisted selected sort after review. Focused PG17 migration and
Nest/HTTP runs passed after these corrections, including a real
`AiUsageService`/Gemini wrapper write, persisted row/call comparison, a
non-owner business LOGIN, separate Auth LOGIN, manager/member/viewer/revoked
checks, token sums above JavaScript safe integer, unknown/partial usage, stored
pricing/currency separation, expiry, model cohort, and page-independent summary.
Synthetic provider transport and Auth upstream were used; no paid or cloud
provider was called. Browser capability was not exposed in this session, so
F06 browser acceptance remains pending. No independent human review is
claimed.

Final gates on the source derived from `ef0450c` all exited 0: typecheck,
`npm test` (API Vitest 365/365, API Node 855/855, Web 448/448; 1,668 total),
build, format, and guarded PostgreSQL 17 `test:database` (470/470 across 39
serial files, 0 failed/skipped/cancelled). Focused F06 coverage was API query
validation 24/24, Web dashboard 5/5, runtime HTTP/RLS 14/14, and migration
lifecycle 1/1. No browser acceptance or independent human review is claimed.

## 2026-10-21 — F06.1 dashboard review corrections (Codex)

AI assistance inspected the independent review harness as diagnostic input,
then moved the covered cases into repository-owned API, HTTP/PG17, and web
regressions. It added a bounded paginated cost-breakdown contract: currency
groups sum all matching pricing versions per currency, while pricing-version
pages retain the full exact decimal total for the selected currency. It also
made top-20 model coverage explicit, propagated the active model filter into
provider-call detail, and bounded accepted report dates so the exclusive upper
bound stays valid. The existing migration, manager RLS, least-privilege
capability, telemetry semantics, admission ledger, and provider flow were not
changed.

RED evidence included API query failures for the missing cost query contract,
unsupported date boundaries, and missing detail model filter; a request to the
old built API against disposable Nest/PG17 also reproduced `0000-01-01` as an
HTTP 500. GREEN verification added bounded group totals, 0/1/20/21/22
pricing-version cases, multiple currencies, zero and unknown cost, 23 model
coverage, model-filtered and unfiltered detail, expiry, cross-tenant sentinels,
and invalid-then-valid date requests. Provider/Auth external boundaries were
synthetic; DB and Nest HTTP paths remained real. No cloud/provider was used.
No human review or browser visual acceptance is claimed. Browser tools were not
exposed in this session, so desktop/mobile, keyboard, console, and layout
acceptance remain pending.

Final F06.1 verification on the task tree: typecheck, application tests, build,
format, and guarded PG17 database tests exited 0. The fresh application tests
passed API Vitest 384/384, API Node 855/855, and Web 454/454 (1,693 total).
The database runner passed 470/470 across 39 serial files; failed, skipped and
cancelled counts were all zero. Focused API query and web dashboard suites
passed 43/43 and 11/11. This is code/automated verification only; browser
acceptance remains pending.

## 2026-10-21 — F06.2 dashboard refresh lifecycle (Codex)

AI assistance added a dashboard regression that measured displayed KPI and cost
values across refresh, then changed request lifecycle keys so a shared refresh
generation invalidates overview, cost and open provider-call detail together.
The active filters and currency/pricing-version page are preserved; per-cost
retry and operation pagination remain independent. The initial regression run
confirmed the finding: the toolbar caused a second overview call while cost
still had only one request. After correction, focused dashboard tests passed
18/18. They cover changed totals, pricing-version page 2, stale cost response,
partial failure, principal switch, local retry, open detail, and operation
pagination. Full typecheck, application test, build and format gates passed;
F06.2 made no API/database/auth changes, so the DB gate was not rerun. No
browser tool was exposed and no visual acceptance or human review is claimed.

## 2026-10-21 — F07 persisted Assistant conversations

AI assistance reviewed the current F07 implementation and added owner-scoped
create-key reconciliation plus frontend regressions for lost create/save
acknowledgements. When create may have committed, the client first reads the
create-key state; when a completed turn save is `unknown`, it checks bounded
message pages for the server receipt before enabling a deliberate save-only
retry. Errors or principal/conversation changes leave the result unknown or
discard the stale response. The AI transport is never repeated for either
reconciliation path.

The added React tests were mutated to remove both GET reconciliation branches:
the uncertain-create test failed because a second POST was attempted, and the
unknown-save tests failed because a save POST ran before reconciliation. With
the implementation restored, the focused Assistant suite passed 20/20. Nest
HTTP and PostgreSQL 17 disposable tests passed 14/14 for runtime/RLS and cover
create reconciliation states `found`, `absent`, and `deleted`; database and
Auth connections were separate LOGIN roles, and the AI upstream remained
synthetic. Full gates are recorded in the F07 checklist after the source-final
run. The final run passed typecheck, build, and format with exit 0; `npm test`
passed API Vitest 384/384, API Node 856/856, and Web Vitest 469/469; the guarded
PG17 `test:database` passed 472/472 with no fail/skip/cancelled cases. Full
suite execution exposed legacy database fixtures that still assumed 21 source
migrations or unintentionally applied 022 while verifying the exact 021
rollback chain. Those tests were corrected to use the intended versioned
fixture boundary; migrations and their checksums were not changed. No browser
tool was exposed, so visual browser acceptance remains pending; these tests do
not claim browser or cloud acceptance.

## 2026-10-21 — F07.1 saved-conversation open errors

AI assistance converted the reproduced hidden-error case into a permanent
Assistant regression, then separated transcript-open status from history-list
status in the hook and rendered open progress/errors outside the collapsible
history list. The first regression run was RED because no `role="alert"` was
available after the history panel closed. The focused suite then passed 27/27.
Coverage verifies GET-only retry for transient open failures, distinct list
retry, safe expired/authorization/client-error handling, stale-response drops
after opening another conversation/reset/principal change, draft preservation,
and no chat/create/save/provider call during open or retry. Only transient
network, 408/429 and 5xx errors expose “Thử mở lại”; stable 4xx errors direct
the user to refresh the list or start a new conversation. No API, database,
receipt, RLS or Auth implementation changed. Browser automation was not exposed
in this session, so desktop/mobile acceptance remains pending; full source-final
gates are recorded in the F07.1 checklist. New final run: typecheck/build/format
exited 0; `npm test` exited 0 with API Vitest 384/384, API Node 856/856 and Web
Vitest 476/476; the focused Assistant suite passed 27/27. The DB gate was not
rerun because there were no backend, SQL, migration or permission changes.

## 2026-10-21 — F07.2 saved document-conversation retry and action guard

AI assistance added focused regressions before implementation for a successful
history retry leaving the document selector unchanged, and for document actions
that could call context reset/create/transport while transcript GET was pending
or had failed. The first focused RED run exposed the expected behavior failures;
one unrelated test assertion that required the document selector to be absent
for a course-mismatch view was corrected to assert the intended read-only send
boundary instead. After the change, `assistant.test.tsx` passed 40/40.

The implementation uses one panel helper for initial-open and retry success,
and a synchronous hook ref checked before `syncContext` to prevent stale action
callbacks from creating or dispatching work during an unresolved open. It also
invalidates open reads on reset, principal change, replacement open, list-read
cancellation, and unmount. No API, database, migration, receipt, RLS, Auth, or
provider code changed. Source-final gates passed: typecheck, build, format, and
full `npm test` (API Vitest 384/384, API Node 856/856, Web Vitest 489/489; no
failures/skips/cancellations). The database gate was not rerun because the diff
is web-only. Browser automation was not exposed, so desktop/mobile acceptance
remains pending; no React result is claimed as browser evidence.

## 2026-10-21 — F08-A Study Coach quiz

Codex assisted with the quiz contract, additive API and shared types, migration
023/runtime capability v23, strict structured-output validation, private draft
and quiz persistence, server grading/progress, the focused UI, regressions and
the existing project documentation. The design keeps quiz ownership at the
verified workspace/user pair, uses a short-lived server-issued draft token,
requires explicit confirmation, and makes confirmation and answer submission
idempotent. Provider generation is a distinct `study_quiz` operation using the
existing retrieval, Gemini wrapper, F03 telemetry and F04 admission boundary.
Save/list/detail/delete/practice do not call AI. The rollback refuses to discard
F08 accounting rows, and bounded retention is dry-run by default.

Review verification used real Nest routes, PostgreSQL 17, current membership/RLS,
and separate business/Auth LOGIN roles that are non-owner and NOBYPASSRLS. Auth
upstream and Gemini/embedding SDK transports were synthetic; no paid provider,
cloud, STT weights or browser was used. The F08 validator tests passed 9/9, the
web panel tests 2/2, runtime HTTP/DB integration 1/1 and migration/retention
lifecycle 1/1. Final gates passed: typecheck, `npm test` (API Vitest 393/393,
API Node 857/857, Web 491/491; 1,741 total), build, format, and guarded PG17
`test:database` (474/474 across 42 serial suites). The test work also corrected
the F04 admission fixture to provision capability v23 and kept the F07 rollback
test on its intended 001–022 baseline; no historical migration was changed.

No browser automation was exposed in this session, so preview/review/save/reload/
practice/delete keyboard and responsive acceptance remains pending. Structured
validity and citation provenance do not prove question correctness; human review
and F09 evaluation are pending. F08-A is code-verified locally, not full F08;
at that checkpoint flashcards were unimplemented, and F08-B is recorded
separately below. Existing F05 browser, cloud rollout, Google live and the
remote-machine pending status is unchanged.

## 2026-10-21 — F08-A.1 reliability fixes

Codex assisted with reproductions, scoped frontend state changes, the Study Coach
detail/progress SQL mapping, regression tests, and updates to the existing
checkpoint/traceability documents. The owner remains responsible for reviewing
the code and quiz semantics. The test work does not replace human assessment of
question correctness.

RED was observed before implementation: focused UI assertions exposed the
unknown-attempt/unknown-confirm controls and the document query not reaching the
search API; the real Nest/PG17 detail response lacked the title. GREEN on final
source: StudyCoachPanel focused tests 11/11; Study Coach Nest/PG17 database
integration 1/1; typecheck/build/format passed; `npm test` passed API Vitest
393/393, API Node 857/857, Web 500/500 (1,750 total); guarded PG17
`test:database` passed 474/474. DB tests used separate non-owner,
NOBYPASSRLS business/Auth LOGIN roles and synthetic fixture identities. Auth
upstream and Gemini/embedding SDK transports were fakes; tests executed through
real Nest endpoints and the disposable database. No paid provider, cloud,
browser, or STT weights were used. Browser acceptance and human semantic review
remain pending; this is not full F08, F09, or cloud acceptance.

## 2026-10-21 — F08-A.2 quiz lifecycle coordination

AI assistance reviewed the independent cross-flow reproduction, added tracked
RED regressions, and implemented a shared tokenized lock for quiz generation,
save/reconciliation/cancel, delete, and attempt submission. The tests cover
attempt recovery with an existing preview, duplicate clicks, delayed lifecycle
responses, stale principal/unmount responses, and retry identity/progress. The
owner should review the UI copy and lifecycle behavior; no quiz content or
semantic-quality claim was evaluated here.

On the pre-fix source, the valid focused run had 4 failing and 11 passing tests.
After the fix, StudyCoachPanel passed 18/18; `npm test` passed API Vitest 393,
API Node 857, and Web Vitest 507 (1,757 total), plus typecheck, build, and
format. No backend/DB source changed and the database gate was not rerun.
Browser tooling was not exposed; desktop/mobile browser acceptance and semantic
review remain pending. No provider, cloud, STT weights, or migration was used.

## 2026-10-21 — F08-B flashcards

AI assistance helped inspect the current Study Coach, retrieval, structured
generation, admission/telemetry, capability and migration patterns; draft the
strict validator/API/UI regressions; implement the additive flashcard module;
and update existing traceability docs. The owner should review the code,
privacy behavior and sample card semantics. No claim about educational
correctness was made.

Generation uses the existing Gemini and embedding wrappers, retrieval, F03
telemetry and F04 admission through real Nest routes. Tests replaced only the
Auth upstream and SDK transports. PostgreSQL 17, business/Auth LOGIN role
separation, non-owner/NOBYPASSRLS privileges, RLS, migrations, telemetry and
admission were real in the disposable integration fixture. No paid provider,
cloud, STT weights or connected browser was used.

Final local results: validator/dashboard focused tests 55/55; focused Web tests
8/8; flashcard Nest/PG integration 1/1 and lifecycle/retention/migration
2/2. Gates passed: typecheck, `npm test` (API Vitest 405, API Node 858, Web
Vitest 515; 1,778 total), build, format, and guarded PG17 `test:database`
(477/477 across 44 serial suites). Existing migration-count fixtures were
updated for additive migration 024; migrations 001–023 were not edited.

Browser acceptance and human semantic review remain pending. The synthetic
photosynthesis sample in FINAL-DEMO-CHECKLIST is for later human review, not an
evaluation gold set. F09, all-F08 acceptance, cloud rollout, Google live and
Thắng's machine were not advanced by this work.

## 2026-10-21 — F08-B.1 draft rejection recovery

AI assistance inspected the ignored independent review before transferring the
confirm/cancel 409 reproductions into the managed Web suite. Both were observed
RED on `c718e62` because no accessible alert rendered after rejection. The fix
moves error/reconciliation UI outside preview content, uses safe code/status
messages, clears prior notices, and requires an explicit GET before enabling a
later write. It preserves draft identity/token, action-token/epoch guards and
the exact-key review recovery. No backend, migration, grant, quota, model,
prompt, quiz or STT source changed.

Focused tests passed 55/55 and the full Web suite passed 544/544; these use
synthetic API responses, including transport loss and delayed responses, rather
than claiming new Nest/PostgreSQL/browser integration evidence. No DB fixture,
provider call or cloud write was made for this correction. No browser tool is
exposed, so desktop/mobile acceptance is pending. Human semantic review, F09,
full F08 and other cloud/Google/remote-machine acceptance are not advanced.
Fresh final gates all exited 0: typecheck, `npm test` (405 API Vitest + 858
API Node + 544 Web = 1,807 passing, fail/skip/cancelled 0), build and format.
Build retains the Vite >500 kB chunk advisory. Full DB gate was not rerun for
this frontend-only fix; no resource cleanup outside test-process teardown was
needed and SOP containers were untouched.

## 2026-10-21–22 — F09-A authenticated evaluation foundation

AI assistance inspected the existing v3 evaluation/corpus/offline/report/human
binding paths and Auth/runtime/Study Coach integrations. It added a separate
guarded local mode and fixed-case manifest revision, reused the existing corpus
and report status machinery, and wired real session/Nest/PG17/RLS/retrieval/
admission/telemetry with only external Auth/SDK/Storage boundaries synthetic.
No model, prompt, retrieval algorithm, quota, grant, migration or UI was changed.

Observed RED→GREEN includes missing-target mode, altered source-page binding
and LF/CRLF source reproducibility. Focused self-tests pass 53/53, integration
1/1. At clean `97f8f82`, 33 local contract scenarios pass with two references
SKIP; all 37 SDK attempts match persisted telemetry. These are not twenty live
quality cases. Initial fixture failures and local-v1's incorrect 400-vs-existing-
404 protocol oracle were retained, not erased/regraded. V2 replaces its case ID
and pins the predecessor without changing semantic facts/pages/gold.

Further observed RED→GREEN corrections preserve unknown token totals as null
and align the injection scenario's actual question with its unchanged codename
oracle. The real wrapper input is asserted; synthetic questions are included
in the human pack, private sentinel questions are excluded. The corrected
focused Nest/PG17 run again executes 33 PASS plus 2 unexecuted references SKIP.
Initial failures remain in ignored artifacts, including an interrupted gate
whose format check caught a test edit made during that run; the files were
formatted before final verification.

Reports omit credentials/tokens/signed URLs/account mapping/private sentinels.
Eleven synthetic RAG/Quiz/Flashcards review templates include exact output and
source/rubric binding with blank reviewer/decision. The user/human reviewer must
assess their semantic usefulness; AI has not signed a human verdict. Live
readiness remains Auth-blocked before paid work, and browser/semantic/cloud/
Google/remote-machine acceptance is not advanced. Full F08/F09 remains partial.

Final-source `6c32842` verification ran sequentially with all five exits 0:
typecheck, full application suite (405 API Vitest + 874 API Node + 544 Web =
1,823), build, format, and 478/478 PG17 tests across 45 files. No failures,
skips or cancellations in those suites; the local evaluation report separately
has 33 contract PASS and 2 reference SKIP. Logs retain the exact commands and
revision under `artifacts/f09a-gates-6c32842`. Browser tools are not exposed,
so no browser result or human semantic judgment has been signed by AI.

## 2026-10-22 — F09-A.1 evaluator required-output regression

AI assistance read the independent missing-output oracle, added 78 managed
contract regressions and a negative report derived from real Nest/PG17 runtime
observations, then implemented scenario-owned output checks. Quiz/Flashcards
reuse pure production validators; no runtime service, prompt/model, corpus/gold,
manifest, migration or privilege changed. Observed RED: managed 24 pass/54 fail,
review oracle 0/3 pass, integration negative count 0 FAIL vs expected 3. GREEN:
78 new cases, 131 evaluation tests, reviewer oracle 3/3, integration 1/1. The
normal runtime report remains 33 PASS/2 reference SKIP; the negative derivative
has 30 PASS/3 FAIL/2 SKIP with identical 37 SDK/persisted calls and measurements.
An interim positive-refusal fixture omitted its expected reason code; completing
that observation fixed its one failure without changing assertions or gold.
Raw logs/reports are retained. No human reviewer or semantic verdict was
invented, no UI/browser acceptance was performed, and live/cloud/Google/remote
machine pending states are unchanged. Final gates are recorded in the checklist.
At source `89d7276`, fresh sequential typecheck/test/build/format/database gates
all exit 0: 405 API Vitest + 952 API Node + 544 Web = 1,901 application tests;
478 PG17 tests across 45 files; fail/skip/cancelled 0. The Vite chunk advisory
remains. F09-A.1_CODE_VERIFIED applies only to this evaluator contract fix.
The final clean-tree runtime run at `77419b9` also passes. Automatic policy
review blocked cleanup before execution, returning only "blocked by policy".
AI did not retry deletion by another route; read-only checks confirmed owned
container/volume and ignored disposable credentials remain (context records the
exact markers). Code verification and outstanding cleanup are separate.

## 2026-10-22 — F09-A.2 grounded RAG marker consistency

AI assistance reproduced the independent marker oracle (1 pass/3 RED), read
`AssistantService.validateCitations` and the legacy evaluation checks, wrote 22
managed regressions first (20 RED) and then added three machine checks and a
`markerConsistency` dimension to the grounded contract in
`rag-evaluation-local.mjs`. A parity test runs the compiled production method;
running it showed production accepts a nested `[S[S1]`, which the evaluator
rejects, and this was recorded rather than fixed. Five mutations of the fix were
tried; one survived and a further test killed it. Two test-helper mistakes of the
AI's first draft were corrected in the tests. Real Nest/PG17 observations were
mutated in the answer only and kept identical measurements (37 SDK = 37
persisted calls). The 20-failure count includes tests that failed because the
new dimension did not yet exist, not only the three oracle behaviours. Gates on a
tree identical to `c487362`: 1,923 application tests and 478 PG17 tests, all
exit 0. The AI created, used and removed only its own labeled container and
volume, left F09-A.1 and SOP resources untouched, and did not change production
services, prompts, models, migrations, corpus/gold or dependencies. No human
reviewer, browser acceptance or live-model result was produced or invented.

## 2026-10-22 — F09-A.3 shared citation contract

AI assistance reproduced the reviewer contract oracle (1 pass/3 RED), mapped every
production use of marker and refusal handling and found that the stream and
non-stream refusal paths already differed. It wrote the failing tests first (unit,
a 24-row production/stream/evaluator matrix, HTTP and SSE, report-boundary
mutations), observed the RED results, then added a pure `source-markers.ts` helper,
changed `validateCitations` and both refusal branches in the assistant service, and
made the evaluator read the same helper. A tightening of non-stream refusals was
introduced deliberately and documented as a behavior change. One AI-written test
helper defect and one failed mutation attempt were corrected without altering
assertions. Seven mutations were killed. Gates at `d97c55d`: 2,016 application
tests and 478 PG17 tests, exit 0; the owned container and volume were removed and
other task resources were untouched. No model, prompt, retrieval, migration,
corpus/gold or dependency changed, and no human review, browser acceptance or live
model result was produced.

## 2026-10-22 — F09-B.1 authenticated HTTP evaluation transport

AI assistance surveyed the legacy runner and its fail-closed harness, the session,
CSRF and Origin contract and the F09-A fixtures, then designed a separate
`--http-evaluation` mode: loopback-only target validated before any credential,
stdin credentials, a cookie jar in memory, refused redirects, no retries, and
dry-run, preflight and execute as separate opt-ins with an approvable plan hash and
a ledger. It wrote the transport tests first (the suite failed because the module
did not exist), implemented the adapter, extended the F09-A fixture with an HTTP
target and wrote a Nest/PG17 integration test. The first integration run passed, so
no integration RED is claimed. 17 unit and 3 valid integration mutations were killed;
one badly designed mutant was discarded. One AI edit script lost a backslash and was
redone with the editing tool, and one first-draft test of mapping/request-cap
behavior was corrected to match the intended rejection. The AI observed that HTTP
cannot show corpus provenance or server admission and made that block quality
execution instead of assuming it, and noted that the frozen manifest has only 9 live
cases for the planned 20. Gates at `6eafdeb`: 2,071 application tests and 479 PG17
tests, exit 0. The AI created, used and removed only its own labeled container and
volume. No real account, provider, cloud call, human review or browser acceptance
was produced, and no secret was requested or handled.

## 2026-10-22 — F09-B.1.1 plan reservation and response body failures

AI assistance reproduced the reviewer's three failing oracles, traced them to a
check-then-write ledger and to a swallowed body error, and wrote the tests first:
a shared loopback fake API, in-process and two-process races, a real SIGKILL crash,
ledger fault injection, and servers that cut or hang the body after valid headers.
RED was observed with a stub ledger (one hung test had to be cancelled and its run
restarted). It then added an exclusive per-plan reservation with a durable intent and
a recovery policy that never expires by time, and a single deadline over the whole
response. Of 16 mutations 13 were killed at first; two survivors exposed missing
tests (history recheck, runner exception) and were closed with a deterministic test
and a small `deps.runCases` seam, and one inapplicable mutant pattern was repaired. An
AI edit script lost a backslash twice and was redone with the editing tool. The real
two-process race against Nest/PG17 shows one generation. Gates at `7814f7d`: 2,094
application tests and 479 PG17 tests, exit 0. The AI created and removed only its own
container and volume. No live model, real account, cloud call, human review or browser
result was produced, and no secret was handled.

## 2026-10-22 — F09-B.1.2 append-only plan ledger

The AI had claimed in F09-B.1.1 that only the owner could release a reservation; an
independent review showed a late unlink could remove a successor's reservation. AI
assistance reproduced the reviewer's barrier test (0/2), traced the same
read-then-write-a-shared-path pattern to three operations, rejected re-reading the run
ID before the unlink as a mere narrowing, and replaced the single `active.json` with an
append-only record scheme. The reviewer's oracle could no longer reach its interleaving
(it barriers on an operation that no longer exists), so an equivalent oracle was written
and checked against both ledgers. Seven tracked regressions use deterministic barriers
on a real filesystem plus two real processes; RED was observed with a temporary read-only
shim on the previous ledger. Of 14 mutations one survived and led to a new test. Two AI
edits lost a backslash in a regex and were corrected. The final claim rests on the
protocol invariants and on those tests, not on timing. Gates at `d09dfbb`: 2,101
application tests and 479 PG17 tests, exit 0. Only its own container and volume were
removed. No live model, real account, cloud call, human review or browser result was
produced, and no secret was handled.

## 2026-10-22 — F09-B.1.3 fail-closed marker publication

AI assistance reproduced the actual post-wx marker-write fault before editing
source: reviewer oracle 0/2 and 30 tracked RED tests. It kept the append-only
reservation protocol and added synced/closed preparations followed by exclusive
hard-link publication, with reader binding/file-identity validation. No runtime
service, Auth, RLS/grant, migration, prompt/model, retrieval, corpus/gold or body
deadline changed. Managed suites pass 126/126 (41 new); external oracles 7/7.
Four mutants are killed after one ignore-sync survivor exposed a test interceptor
assertion that masked the unsafe write; the assertion now observes after the
operation. Every mutated source was restored and failure logs are retained.
Real child-process SIGKILL barriers cover both sides of publication; that does not
certify physical power-loss durability. Focused Nest/PG17 integration at clean
`122ca20` passes; both actual-server marker EIO cases block rerun without additional
SDK/persisted calls. An initial extra login hit the fixture owner's rate bucket;
new cases use another authorized fixture member without changing Auth limits.
No paid provider, real account, cloud, browser or semantic review was used. Live
evaluation and existing acceptance/cleanup pending states are not advanced.
Fresh final-source gates at `122ca20` all exit 0: typecheck, full application
tests (457 API Vitest + 1,141 API Node + 544 Web = 2,142), build, format and
479/479 PG17 tests in 46 files; fail/skip/cancelled 0. Build retains the chunk
advisory. Source stayed unchanged during verification. Cleanup checked exact
task/repo/date labels and the sole volume consumer, then removed only the newly
created F09-B.1.3 container/volume; none remain. F09-A.1 resources and SOP were
not touched; raw test/mutation/report evidence remains ignored and retained.

## 2026-10-22 — F09-B.2A offline RAG gold preparation

AI assistance inspected the corpus, legacy v3 validation, HTTP eligibility and
human-review/report conventions, then authored a separate 24-objective draft
`rag-quality-20261022-v1`. Gold comes from the unchanged synthetic PDF generator
and frozen fact/page registry, not model answers; actual production local PDF
extraction verifies both PDF hashes and all ten facts. The agent's authorship is
not human gold approval or educational semantic review. Synthetic dates, amounts
and requirements are not a lecturer rubric. Vietnamese questions do not prove
accented Vietnamese PDF extraction.

The first RED was the missing new offline module, not a production defect. The
first implementation run had 53/55 pass: missing-review error classification and
Windows --import file-URL handling were corrected. Three additional assertions
then observed real RED (missing exceptions): an injection objective could lose
its label, a stale batch definition could retain identical IDs, and an absent
legacy predecessor was accepted. Guards/binding were added without weakening
assertions. Focused final verification: 58 new tests and 375 total evaluation /
HTTP / reservation tests pass, exit 0, no fail/skip/cancelled. Raw logs remain in
`artifacts/f09b2a-20261022/`.

The offline command exports source PDFs, catalog, draft copy, proposed batches
and Tài–Thắng gold forms. It has no execute/credential/endpoint option; its CLI
test denies secret-file, network and ledger access. Fourteen new cases share the
HTTP adapter's supported operation shape, ten require transport work, and all
24 remain NOT_ATTEMPTED with zero human approvals. Proposed batches 5/5/4 are
non-executable; no provider-call count, quota or target is approved. Assigned
reviewer names are not signatures; decisions/times/comments are blank. No model
output, provenance attestation, DB, migration, UI or ledger change was made.
Gold review, live evaluation, post-response semantic review, earlier browser /
cloud / Google / Thắng-machine and F09-A.1 resource-cleanup pending remain open.

Fresh gates at source `1860cc8`: typecheck, npm test, build and format all exit 0.
Full test counts: 457 API Vitest, 1,199 API Node and 544 Web (2,200), no
fail/skip/cancelled. Build retains its chunk-size advisory. Data commit `b4b7d21`
and tool/test commit `1860cc8` were local only. No DB/browser gate was run because
only offline data/scripts/tests changed. No persistent test resources were made;
own temporary test directories were removed and raw artifacts retained. Status
is F09-B.2A_CODE_VERIFIED + GOLD_REVIEW_PENDING, not whole-F09 acceptance.

## 2026-10-22 — F09-B.2B.1 runtime provenance audit

AI assistance read the Storage, PDF extraction, chunking and ingestion code, then
wrote the read-only auditor/verifier test-first (RED = missing module) and ran it
against a disposable PG17 with a real Storage HTTP reader and a loopback Storage
stand-in. It compared the stored index with the production pipeline's output for
the stored bytes, which exposed that the earlier runtime fixture seeds unwrapped
page text unlike real ingestion; that is recorded, not hidden. Mutation checks
left one equivalent survivor (ordering flag) and led to three new tests; two
defects were found and fixed during GREEN (errors after a deadline must report
timeout; a corpus differing from the manifest must be a mismatch, not invalid
expectations), plus a design change: documents failing identity are never fetched.

Source cd99923: typecheck, build, format, npm test (2,232) and full test:database
(492/492, 47 files, own guarded PG17 container) exit 0. No provider or model call,
secret read, cloud write, push or deploy; the audit changed no table. The artifact
is point-in-time evidence with a self-checksum, not approval: gold review, live
evaluation and semantic review stay pending, and no real target was audited. The
AI-assisted gold review of the 24 cases (done in chat in the same session) is AI
judgement, not Tài–Thắng approval.

## 2026-10-22 — F09-B.2B.1.1 verifier document-set fix

An independent reviewer showed that the verifier's document-set check (equal
length plus per-entry membership) let a re-hashed artifact repeat one document in
place of another, and that the fresh-observation loop then never compared the
omitted document. AI assistance reproduced the reviewer's oracle (2 RED), wrote
tracked regressions first (4 RED), then replaced the check with a one-to-one
validation on `(file, documentId)` for both artifact and observation. Mutation
runs first showed single-clause mutants surviving because the clauses were
redundant; the check was reduced to three non-redundant clauses and a missing
test for unknown condition keys was added. Two guards no reachable input can hit
are kept and disclosed as equivalent mutants. A PG17 real-data case was added.

Source `6207165`: reviewer oracle 2/2, focused suites 414/414, provenance
integration 14/14, `npm test` 2,239, full `test:database` 493/493 (47 files,
own guarded PG17 container), typecheck/build/format exit 0. No provider or model
call, secret, cloud write, push or deploy. Not wired to execute; gold review,
live evaluation and semantic review remain pending.

## 2026-10-22 — F09-B.2B.2 quality-suite dry-run and preflight

AI assistance read the HTTP evaluation transport, the quality preparation, the
provenance verifier and the assistant DTO/routing, then wrote tests first (RED =
missing modules) for a pure planner and a quality mode of the evaluator, and
implemented them. Details worth recording: the shared validator originally let two
course file sets map onto one course id (fixed with a RED test); the dry-run test
first failed because Node reads ordinary environment variables when it starts git,
so it now watches secret-bearing names only; mutation runs led to a re-hashed
forged-plan test. The AI-assisted gold review of the 24 cases (done in chat in this
session) is AI judgement, not Tài–Thắng approval; the plan carries GOLD_REVIEW_PENDING
and nothing here records an approval.

Source `1e1dd08`: planner 17, quality-http 16, provenance 40, focused 448/448,
PG17 integration 6/6, `npm test` 2,273, full `test:database` 499/499 (48 files, own
guarded container), typecheck/build/format exit 0. No provider or model call, real
account, secret, cloud write, push or deploy. Execution is refused; live evaluation,
semantic review and the earlier browser/cloud/Google/Thắng-machine items stay pending.

## 2026-10-22 — F09-B.2B.3 ingestion-service chain

AI assistance read the upload, Storage, ingestion, embedding and usage code and the
earlier fixtures, then built a new test-only chain fixture and integration test. The
first runs showed real behaviour rather than a missing module: refused processing
requests still record `rejected` usage operations (the test and docs now state it), and
a test-side name clash (a TDZ error) was fixed. Mutating the compiled ingestion and
upload services (six faults) was used to confirm the chain catches persistence bugs;
all six were killed. The audit alone cannot show that a vector came from its chunk's
text; the test shows it only because the synthetic transport is deterministic.

Source `acd2b3c`: chain 12/12, focused 492/492, `npm test` 2,273, full
`test:database` 511/511 (49 files, own guarded PG17 container), typecheck/build/format
exit 0. No production change, provider or model call, real account, secret, cloud
write, push or deploy. Execution stays refused; the AI gold review remains AI judgement
and gold approval, live evaluation and semantic review stay pending.

## 2026-10-22 — F09-B.2B.3.1 blank-baseline correction

An independent review found that the B.2B.3 chain started with twelve sample documents
and twelve chunks inherited from the shared tenant fixture, contradicting my report that
setup held no documents. AI assistance reproduced it first as a failing runtime assertion
on the database, added an explicit `seedDocuments` option (default unchanged), switched
the chain to it and added database assertions for the exact id sets; two mutants of the
helper confirmed the checks bite. While editing, a shell-escaped regex briefly turned the
supplementary source scan into one that matched nothing; a non-vacuity guard now prevents
that. No production code changed.

Source `ff44b41`: chain 13/13, `npm test` 2,273, full `test:database` 512/512 (49 files,
own guarded PG17), typecheck/build/format exit 0. No provider or model call, real account,
secret, cloud write, push or deploy; gold review, live evaluation and semantic review stay
pending and nothing is signed for Tài or Thắng.

## 2026-10-22 — F09-B.2B.4 quality suite v2 draft

At the user's request the AI turned its own gold-review findings into a v2 draft: wording and
scope-label corrections in 14 cases, same corpus and gold bindings, plus a `--suite` option
for the prepare tool. The v2 content is AI-authored and unreviewed; it is a proposal for Tài
and Thắng, not an approval, and carries no reviewer, time or decision. The validator pins
`minCitations` to 1, so the extra-source requirement is stated in the required behaviour
instead; RQ23 stays deferred. The shared final rubric was read through a fetch summary and
should be checked against the original. Source `d1a95d1`: typecheck/build/format exit 0,
`npm test` 2,279. No provider call, secret, cloud write, push or deploy.

## 2026-10-22 — Independent review and scope update

Codex reviewed the blank-baseline fix and quality-suite v2 draft, then recorded
Tài's explicit scope decision: existing STT only, no TTS; remove F11/PWA and
F13/WASM from the development plan, retain responsive mobile web, SSE and the
containerized/deployed demo requirement. F15 remains removed; F12/F14 are not
implicitly removed. The final-project assignment was located and read directly
through the read-only Drive connector; its source and section mapping are in
FINAL-REQUIREMENTS. The eight-week course plan was not substituted for the final
rubric. Documentation-and-ADRs guidance was used to preserve the rationale and
agent handoff rather than claim global persistent memory or rubric acceptance.

Fresh checks on source HEAD b2aad43 before these Markdown-only changes: API build
exit 0; related Node regressions 465/465; guarded disposable PG17 chain plus the
previous independent blank-baseline oracle 14/14 (including chain 13/13). The
previous 12-document/12-chunk failure is now closed. Full 2,279 application tests
and 512 DB tests were not re-run by this reviewer. No production source, suite or
gold was changed, no human approval fabricated, and no real model call, credential
read, cloud write or push performed. The review-owned disposable container was
removed after checking its ownership label; legacy resources were untouched.

## 2026-10-22 — F09-B.2B.5 one-batch executor

AI assistance read the HTTP transport, planner, provenance verifier, evaluator and ledger, then
wrote tests first (RED = missing module) and the executor. Two of my first test expectations were
wrong, not the code (a policy scope the batch does not use cannot block it; a word match on
"enforced"), and one two-process test was timing-dependent until its client deadline was set
above the gate hold; all were corrected in the test. Mutation checks showed a CLI path that would
have supplied a permissive default and a missing "authorizer alone is not enough" test; the
second was added. The Nest/PG17 positive control reconciles request counters, SDK calls,
persisted usage and receipts.

Source `7a17db3`: unit 14/14, integration 8/8, `npm test` 2,298, full `test:database`
520/520 (50 files, own guarded container), typecheck/build/format exit 0. No real model,
account, secret, cloud write, push or deploy. The test authorizer is not a human approval;
gold review, live evaluation and semantic review stay pending.

## 2026-10-22 — F09-B.2B.5.1 executor binding fixes

A reviewer showed that my earlier statement that the executor "recomputes the binding" was wrong: it copied
request hashes stored in the plan and trusted caller-supplied provenance bytes. AI assistance reproduced both
failures first (reviewer oracle 1/3, five new behavioural tests red), refactored the planner so its assembly can
be reused, and added sealing: exact-byte hash, canonical re-parse, request-hash recomputation, plan rebuild and
comparison, provenance-to-suite binding and an immutable private copy. One of my own test expectations was
wrong (a re-hashed plan with a changed target is consistent; only the approval can refuse it) and was corrected in
the test with the reason recorded. 30 mutants were run and killed.

Source `3a628e6`: oracle 3/3, executor 20/20, integration 8/8, `npm test` 2,304, full `test:database` 520/520
(50 files, own guarded container), typecheck/build/format exit 0. No real model, account, secret, cloud write, push
or deploy; no approval is recorded for Tài or Thắng.

## 2026-10-22 — F09-B.2B.5.2 sealing window

A reviewer showed that my "private copy" in the previous fix was taken after an await, so the window inside
sealing was open. AI assistance reproduced it with the reviewer's oracle, wrote deterministic tests that mutate
the caller's data immediately after the call (code runs synchronously to the first await, so no sleeps), then
moved all copying into one synchronous step with a single private suite buffer. A test helper bug of mine
(the planner keeps a reference to the buffer it is given, so my test mutated its own shared fixture) was
fixed in the test. Two mutants became equivalent once the snapshot was complete and are recorded as such.

Source `da862cd`: oracles 7/7, executor 26/26, integration 8/8, `npm test` 2,310, full `test:database`
520/520 (50 files, own guarded container), typecheck/build/format exit 0. No real model, account, secret,
cloud write, push or deploy; no approval recorded for Tài or Thắng.

## 2026-10-23 — rubric-readiness pass (Claude Code)

AI assistance built the demo stack harness, ran the browser acceptance, wrote the rubric matrix, user stories, report, slides,
demo/defense guide and the gold review pack, and generated the PDF/PPTX through `scripts/build-submission-docs.py`. Defects of the AI's
own work caught while doing it: the synthetic model's refusal returned an empty `answer` (production rejects it as
`answer_shape_invalid`); it read `parts[0]` (page metadata) as the question; a first fixture login limit tripped during a long manual
session; a `sed` replace on backticks corrupted two Markdown files (restored from Git / repaired with Node and re-verified by diff);
and an unverified claim that v1 plans 22 cases was corrected after running the planner (both revisions plan 23 and defer RQ23).
Human checks still required: Tài and Thắng must read and own the user stories, the report sections marked `ĐIỀN`, and the
`GOLD_REVIEW_PENDING` decisions. No approval, signature, commit or confirmation was made for either of them; no real credential, paid model call,
cloud write, push or deploy was used.


## 2026-10-23 — authorized completion campaign (Codex)

User explicitly authorized private credential use, guarded cloud rollout, USD1 real-model budget and AI-delegated gold review. AI implemented a boolean-only managed Auth verifier/capability025 with PG17 RLS regression, local rollback/reapply; reproduced outsider-login harness false PASS and MuPDF blank-space table fills before fixing both. It technically reviewed all 24 v2 gold definitions against 10 facts/5 pages before campaign model outputs, labelled the separate record AI rather than signing Tài/Thắng, and added pinned campaign authorizer tests. No new paid call has been made in this campaign.

The first full DB run correctly rejected a reused restore database's Auth-schema marker; a clean owned target was provisioned. A legacy test correctly failed because current AuthStore needs the new private verifier; legacy fixture infrastructure was updated without faking ledger025. One app run failed because concurrent build commands removed `dist` while Node tests imported it; it is retained as invalid build scheduling evidence, then rerun with builds separated. A later DB connection refusal was an exited owned Docker container after restart; its exact labels were checked before restarting it. These failed runs remain artifacts, not replaced by historical counts.

Backup includes public/Auth/Storage SQL plus separate Storage bytes; local restore and 016–025 rehearsal passed. Cloud016 committed, 017 rolled back on a genuine hosted-PG17 role-membership prerequisite. No immutable migration, managed Auth owner/RLS, cloud data or runtime-owner fallback was changed to bypass it; 50 old table fingerprints matched after stopping. Maintenance window released explicitly. Cloud roles/runtime/OAuth/live evaluation remain blocked; report and slides stay DRAFT. No personal contribution or understanding was asserted for either student.

## 2026-10-23 — interrupted-campaign resumption

Fresh read-only inspection confirmed Google provider is now enabled, TLS verifies,
Storage is private, and the cloud ledger remains001–016 with source checksums.
A separate owned PG17 reproduction confirmed the role-creator/bootstrap-grantor
and ownership-transition boundaries. A Support request was drafted at the user's
request, not submitted. No paid calls, cloud writes or fabricated approvals.

The clean full DB gate caught an AI-authored test assumption: the managed Auth
test called `has_function_privilege` with optional hosted role `anon`, which is
absent on pristine PostgreSQL (42704). The test now resolves optional roles via
catalog and unconditionally rejects PUBLIC EXECUTE; focused RED→GREEN passed.
An injected PUBLIC EXECUTE grant in a separate disposable fixture made the fixed
test fail as intended; no migration bytes were mutated. The resuming agent also
scheduled an overlapping build that invalidated initial tests by deleting dist;
those failures remain logged, followed by clean component reruns. This is not
claimed as a product bug or a successful root npm-test run.

Final resumption evidence: application components457+1313+544=2314 pass;
full guarded database521/521 in51 files exit0; build/typecheck/format exit0.
Owned disposable container removed after exact ID/label checks. Other agent
resources and all cloud data were untouched; no commit/push in this resumption.

## Managed completion and real campaign (23/10/2026)

Later work supersedes the stopped-runtime state above: separately checksummed
managed026 installed, private backup preserved, two non-owner TLS LOGINs,
real Docker/Google and45 HTTP checks verified. No human contribution/signature
was invented. Historical SQL and managed Auth catalog were not rewritten.

Two additional AI-authored harness defects were caught:

- Budget envelope map accepted inherited keys like `__proto__`, poisoning totals
  toNaN. Fresh review found it; invalid-kind regression RED→GREEN now requires
  an own-property lookup. Valid real calls always used fixed known kind literals.
- Live wrapper threw after RECEIVINGHTTP503, causing raw executor to classify a
  known provider error as transport-unknown. Saved per-dispatch status/request ID
  and fresh terminal telemetry reconciled it without replay or ledger rewriting.
  Later wrapper returns received errors for correct STOPPED classification.

Baseline20 real cases and partial improved3 retain all errors. AI technical
review labels RQ09/10 injection resistance INCONCLUSIVE without context trace.
RQ11 frozen automatic contract FAIL is retained despite supported extra citation;
no gold edit after observing output. Missing provider usage retained budget, not0.
Source/evidence and remaining obligations are in current handoff/report.


## English report completion - 23 October 2026

At the user's request, the AI assistant completed the interrupted English report using the supplied DBMS document only as a typography/cover reference. Current report content replaces the unrelated course text; instructor, class and second-student cover fields remain blank by instruction. `docs/REPORT.md` is the English text source; screenshots and English diagrams are in `docs/report-assets/`. Editable Word and PDF are in ignored `output/pdf/ExaMate-Report-20261023.{docx,pdf}`.

Installed Word refreshed the native table of contents and exported 18 A4 pages. Render review checked the page images, table layout and references. The export audit passed 18 checks, including all 16 TOC entries, 13 stories, 20 evaluation rows, source test filenames, reference hash preservation and absence of old comments/custom XML or credential patterns. Evidence, the original reference and the pre-edit report copy are retained under ignored `artifacts/report-refresh-20261023/`. The audit initially identified an overly narrow filename-matching expression; it was corrected to validate complete dotted test names against the filesystem.

The report labels retained application/DB/browser evidence as earlier runs, not fresh execution. This documentation work made no provider calls, cloud writes, application changes or new application-gate claims. Baseline 15 PASS / 3 FAIL / 2 INCONCLUSIVE and the partial improved cohort remain unchanged; no semantic human sign-off or personal contribution explanation is fabricated. The report remains DRAFT.


## Reviewed source publication - 23 October 2026

The user explicitly authorized committing and pushing the remaining nonsensitive code, migration profile, tests and documentation. The report-only commit 547ccde had already been pushed; deployment/evaluation source changes had not. This publication reviews that existing work rather than replaying cloud migration, model execution or private bootstrap scripts. Historical task plans retain their earlier instructions with a superseding context note.

The report was extended from 18 to 19 pages with an English module diagram, an eight-step RAG request trace and a responsibilities table. Generic Markdown PDF export had lost source-relative images; a managed regression failed before the archive lookup fix, then both PDF tests passed. The formal Word/PDF bundle and bounded evidence summary are committed under docs/submission; private source artifacts remain ignored. New verification results are recorded in the publication checkpoint, distinct from the earlier deployment and evaluation evidence.

## Source publication verification - 23 October 2026

User authorized committing and pushing all reviewed nonsensitive integration code and documentation. Runtime/database source is committed at `0bddd53`. Fresh local gates: typecheck, npm test, build, format and canonical database all exit 0; application 2324 PASS (API Vitest 460 + Node 1317 + Web 547), canonical PG17 521/521 in 51 invocations; separate restricted managed-profile fixture 1/1. Fail/skip/cancelled: 0. PDF exporter tests: 2/2.

Both databases are new owned disposable clusters. No cloud write, paid model request, migration replay on shared services or new browser acceptance was performed. Report remains 19 pages and DRAFT; its publication metadata now points to committed runtime source. Secrets/backups/private artifacts remain ignored. Logs: `artifacts/publish-sync-20261023/`. Prior deployment/evaluation observations remain historical; incomplete improved evaluation and personal/device/semantic obligations are unchanged.

## Report illustrations and References removal — 24 October 2026

User requested removal of References and more explanatory figures. The English
report is now 20 A4 pages including cover and native Word TOC (18 entries), with
nine numbered figures: component architecture, scoped retrieval, validated Study
Coach lifecycle, flashcard self-rating, actual citation/PDF and quiz result
captures, mobile/dashboard/usage panels, retained evaluation cohort chart and
safe-outcome map. Figure captions and `docs/report-assets/figure-provenance.json`
identify illustration versus historical synthetic-provider or real-service capture.
No fake UI screenshot or new Gemini output was generated.

Document-only checks: 23/23 export checks; PDF exporter regression tests 2/2;
targeted Prettier and Git whitespace checks. Earlier 2324 application / 521 DB
passes remain historical, not rerun here. No browser acceptance was rerun; no
provider calls, cloud writes, containers or DB resources were created. Initial
layout overflow was corrected from 22 to 20 pages; a source-image-path assertion
and whitespace-sensitive caption audit were corrected, with first QA retained.
The report stays DRAFT; improved evaluation, semantic/device/personal obligations
are unchanged. Instructor/class/second-student fields remain blank by instruction.
Editable/PDF bundles: `docs/submission/ExaMate-Report-20261023.{docx,pdf}`;
local copies: ignored `output/pdf/`. Revision artifacts:
`artifacts/report-visual-refresh-20261024/`. Unrelated untracked
`docs/EXAMATE-ON-TAP-VAN-DAP.html` is preserved outside this commit.


## Defense ownership and rehearsal script ? 24 October 2026

At the user request, the assistant inspected Git authorship and the five Thang commits, current STT/SSE source, the report and existing defense guidance. Updated docs/DEMO-AND-DEFENSE.md with an eight-minute two-speaker script, evidence-based ownership including early backend/Gemini contributions, 17 Tai questions and 19 Thang questions with answer outlines and code anchors. Integration fixes remain distinguished from initial authorship; no explanation for commit-count differences or personal understanding was invented. This is rehearsal material, not a signed contribution attestation. Checked referenced filenames, chronology, Markdown format and Git whitespace only; no application/DB/browser/model test or cloud change was made. The unrelated untracked HTML study notes were preserved.


## Defense deck authoring — 24 October 2026

Under the user's request, AI prepared 14 editable PowerPoint slides (12 main, two hidden Q&A backups) and a matching PDF, with English presentation text and Vietnamese speaker notes. Reused retained, labelled screenshots and source evidence; no AI-generated fake UI or new model output. Architecture and evaluation bars are native shapes. Refreshed stale slide counts and wording: baseline 15 PASS/3 FAIL/2 INCONCLUSIVE, partial follow-up 1 PASS/2 provider503/17 not attempted; known cost and coverage keep their denominators. Contribution language distinguishes initial STT/SSE/backend from later integration, without invented signatures or explanations.

A source-relative image regression in the existing outline exporter failed before correction; after fixing image resolution, all three document-export tests passed. Native PowerPoint rendering caught hidden-backup PDF omission until the correct MsoTriState export flag was applied. Layout bounds and retained-evidence bindings were checked; final document QA passed 26 checks. A QA assumption that editable shapes cannot yield raster effects in exported PDF was corrected to inspect the editable PPTX objects; text/chart values remain checked in the PDF. No application/DB/browser test, paid provider call, cloud write, dependency installation or personal-account access occurred. Raw artifacts are ignored; nonsensitive source and deliverables are versioned.


## Course gallery and session UX repair — 24 October 2026

AI traced the removed photo carousel to 132c5e2 and reproduced the focus-verification
login flash. Six tracked regressions failed on baseline before implementation,
then passed after restoring a bounded gallery and a fail-closed neutral verification
overlay. Source `a2e6892` keeps API/server/session/RLS semantics intact. The
carousel now derives selection by ID to avoid an out-of-range crash after filtering;
expanded course cards restore photos. Existing assertions were scoped precisely
to result links when gallery labels introduced valid duplicate text.

Final gates: typecheck/test/build/format exit 0; 2330 app passes (460 API Vitest,
1317 API Node, 553 Web). Focused suite 156 passes. Chrome/Nest/PG17 local checks
passed 13 cases; only Auth/Storage/provider boundaries synthetic, no AI calls.
The browser harness initially lacked capability-group bootstrap and had a selector
escaping error, both corrected only in the ignored test setup; those failures are
retained. No claim that source tests or synthetic providers establish live AI quality.

Only the real local Docker web service was rebuilt; API ID/image/start time stayed
unchanged. Reports, slides, .env, cloud schema/data and SOP were not modified.
Marker-verified disposable cleanup was blocked by tool policy. No workaround was
attempted; fixture/browser stopped but owned PG container/profile files retained.
Evidence and details: current context/checklist, artifacts/ui-session-repair-20261024/.
