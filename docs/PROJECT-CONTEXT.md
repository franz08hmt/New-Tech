# ExaMate — context hiện tại cho Tài, Thắng và agent

## Multi-format document upload — local implementation verified, 27/10/2026

Scope: PDF plus DOC/DOCX/UTF-8 MD/TXT. Normalize new formats to a canonical PDF
before private Storage/metadata, retaining PDF citations and the existing RAG and
Study Coach pipeline. Converted names retain the source extension (`notes.md.pdf`);
the download is the generated PDF, not an original-file archive. No schema,
RLS, quota or model change is planned. Markdown is imported as literal text,
not executed HTML. Existing PDFs keep their upload path.

Checklist: boundary/HTTP and UI RED→GREEN; isolated converter with bounded
input/output/time and no credentials/Internet egress; canonical PDF ingestion;
role/tenant and stale-response regressions; disposable PG17 and browser checks;
final app gates. No rollout to the running live demo or cloud in this task.

Status 27/10 (resumed after an interrupted run): converter, API boundary, shared
allowlist and Documents UI are complete. Re-verified on the current tree: typecheck
and format clean; unit suites 1323 API + 467 API-vitest + 595 web pass; real
LibreOffice converter and Nest/PG17 format tests 12/12 (Vietnamese text, scoped
citations, viewer/foreign course/revoked membership refused, no AI call during
conversion); 53 database test files (538 tests) pass. Browser 1440px/375px was
checked by the earlier run. Limits: only the converted PDF is kept (no original
Word/text archive); Word layout can differ. Not rolled out to the cloud project.

## Sửa nhảy trang, ngôn ngữ hiển thị và quản lý thành viên - 26 tháng 10 2026

**Nhảy trang (hai video Firefox).** Hai nguyên nhân: (1) mỗi lần tab lấy lại focus, phiên
được xác minh lại bằng trạng thái `verifying` nên toàn bộ workspace bị ẩn rồi hiện lại;
(2) danh sách/Documents bị thay bằng "Loading…" mỗi lần đọc lại sau khi lưu, làm trang co
rồi giãn. Đã sửa bằng xác minh nền (không đổi UI khi vẫn `authenticated`) và giữ hàng cũ khi
đọc lại cùng bộ lọc. Không đổi API/DB/contract. Chi tiết và đánh đổi: ADR-015. Đã kiểm trên
browser và bằng test mới (`pilot-silent-revalidation`, `use-paged-search`, Documents).

**Ngôn ngữ hiển thị.** Nút VI/EN ở trang đăng nhập và thanh phiên; mặc định tiếng Việt; chỉ
đổi nhãn/nút/gợi ý/thông báo hệ thống. Nội dung nhập, tên tệp, bản ghi và mọi kết quả AI giữ
nguyên (AI chỉ trả lời tiếng Anh khi được yêu cầu). Chi tiết: ADR-016. Kiểm trên 10 trang ở
chế độ EN (không còn chữ Việt ngoài dữ liệu người dùng và tên ngôn ngữ), VI, desktop và 375px.

**Tài khoản và phân quyền.** Trang **Thành viên** (menu mới, mọi vai trò đều xem được): bảng
mỗi vai trò làm được gì (khớp với kiểm tra ở server), phần nào dùng chung và phần nào riêng,
danh sách thành viên. Manager đổi vai trò, tắt/bật quyền, thêm thành viên bằng email, cấp quyền
cho người đã đăng nhập mà chưa có quyền, thu hồi lời mời. Tài liệu tải lên vốn đã dùng chung
cho mọi thành viên đang hoạt động. Phần riêng đã có: hội thoại Assistant, quiz/flashcards.
Lời chào "Welcome back, Tài." không còn gắn cứng tên Tài cho mọi tài khoản.

**Cloud.** Sau khi kiểm trên PG17 dùng-một-lần (canonical và fixture managed), migration 027
đã được áp dụng lên cloud ngày 26/10 theo yêu cầu của chủ dự án (backup `public` trước, ledger
27, digest không đổi; xem MANAGED-DEPLOYMENT). Stack `examate-final-live-20261023` đã build
lại từ code mới. Chưa kiểm bằng tay trên cloud: manager đổi vai trò/mời thật; chưa push.

Kiểm chứng: web (Vitest), API unit và 53 file database trên PG17 dùng-một-lần, test managed
`supabase_admin`, typecheck/format/build sạch. Một số test cũ phải cập nhật vì số migration
(25→26 nguồn; ledger fixture pilot 16 giữ nguyên) và baseline rollback 025 (giờ dựng trên
chuỗi 001–025). Bằng chứng ignored: `artifacts/ui-fix-20261026/`.

## Vietnamese technology deck - 26 October 2026

Guided-step readability update on `88f3c40`: architecture and RAG now display
their active explanation as large dark text, outside the control row; RAG uses
the area beside the screenshot. Both label and content follow step/play/reset
and refusal selection. Notes retain the fixed caveats. The ten-page PDF/PPTX
were regenerated. New checks: 2 regressions RED before the change, then 23 Node
and 4 Python tests PASS; 50 Chrome layout checks, 35 native interactions at
1440/375px, 3 companion checks and note bounds passed, with zero console errors
or external requests. Evidence: `artifacts/technology-explanation-20261026/` and
`artifacts/technology-deck-20261026/93e8d7a6/`. Presentation-only change; no new
application, DB, live-model or semantic acceptance.

Compact revision on `761cf77`: 10 slides now cover all 15 topics by merging
architecture/backend, Auth/database, PDF/RAG, structured output/practice and
SSE/STT. Existing interaction controls and all topic notes are retained; the
knowledge companion still has fifteen full sections. PDF/PPTX and contact sheet
are regenerated at ten pages. No application/runtime change or new acceptance.

Compact-edition checks: 21 Node deck tests, 4 exported-artifact/companion tests,
50 Chrome slide/width checks, 31 native interaction checks and 3 companion checks
passed. Merged speaking-note bounds were checked in overview mode; no overlap.
Two new regressions were RED on the preceding 15-slide edition. Knowledge
content remains unchanged. Evidence: ignored `artifacts/technology-compact-20261026/`.

Earlier interactive revision on `69eab36`: main slides were shortened and recomposed into
15 distinct visual layouts with 14 pinned brand SVGs, bounded scene playback,
manual steps, RAG/role switches, flip-card and SSE/waveform illustrations. All
simulations are offline and labelled; global pause/reduced motion and cleanup on
hidden slide/page are supported. Full original rationale/trade-offs/notes live
in a separate knowledge companion. HTML has interactions; PDF/PPTX have static
readable artwork, with PPTX fade transitions and editable notes. Original English
deck and application code remain unchanged. This supersedes the text-heavy
technology layout below, not any app/live/semantic acceptance status.

Interactive revision verification: 19 Node tests, 4 artifact/companion tests,
75 Chrome layout checks at five widths, 31 native interaction checks across
1440/375 and 3 companion checks passed; zero console errors/external requests.
Full original details are retained in the companion; main copy averages 54 words.
Byte-normalized HTML plus staged-artifact hash checks preserve Git bindings.
No app/DB/provider gate was run for this authoring-only scope. See ignored
`artifacts/technology-motion-20261026/verification-summary.json` for diagnostics.

Separate 15-slide HTML/PDF/PPTX under `docs/submission/ExaMate-Technologies-VI-20261026.*`:
Vietnamese technology choices, rationale, trade-offs and speaker notes, retaining
the reference-style Poppins/Heroicons layout and eleven dated demo screenshots.
RAG ownership remains shared. Original deck/report unchanged. HTML/CSS are the
editable source; PPTX preserves slide artwork and carries editable speaker notes.
Build/verification commands and fixture boundaries are in SLIDES.md. This work
does not rerun application/DB/model acceptance or close semantic/live/device pending.

New edition checks: 12 Node deck tests, 3 exported-artifact tests, 75 Chrome
slide/width layout checks plus controls/notes/offline-file checks passed. Six
new artifact tests were RED while the edition did not yet exist. Existing
English source/HTML/PDF/manifest hashes are unchanged. Format and Git whitespace
checks cover the changed authoring files; no application suite/DB gate was rerun.

## Shared workspace readability - 25 October 2026

Source `a68a400` on `ebb01e8` adds `ui-consistency.css` after the existing stylesheet.
Only this CSS and the main entry import changed: no component DOM, hook, handler,
API/client contract, backend, SQL, permission, migration or dependency change.
Poppins and original sage/warm-paper colors remain. Shared tokens apply 13px
normal control/body text, 12px labels/captions, 44px standard text controls,
8px control corners and a 2px focus outline. Existing hero/gallery layouts,
selected/destructive colors and badge semantics are retained. Calendar cells,
handwritten notes, icon-specific geometry and PDF text/annotation layers are
excluded from generic control sizing. No Course progress semantics changed.

New real-browser evidence: 12 page/views at 1440/375/320 (36 checks), three
Assistant draft/submit-reachability checks including 320x640, and 13 existing
role/task workflow checks rerun with the new styles. All **52 checks passed**.
Before styling, the same independent sizing oracle found 124 control readability
findings at 1440; after styling, no sampled font/height violations or page-wide
overflow. A stronger oracle verifies every non-Assistant page is active, not
inert behind a leftover Assistant modal; full document navigations isolate pages.
Real Chrome/Nest/session/PG17, split non-owner NOBYPASSRLS LOGINs; Auth upstream,
Storage and SDK transport synthetic. Zero uncaught errors/unexpected HTTP/provider
calls. These are scoped UI checks, not a new full AI/PDF/microphone acceptance.

Fresh root typecheck/test/build/format gates passed; full suite 2338 = API Vitest
460 + API Node 1317 + Web 561/32 files, no fail/skip/cancelled. Final CSS refinements
also passed Vite build, source Prettier and browser checks. Existing bundle-size
warning remains. No full DB suite for CSS-only scope; PG17 integration is separate.

Only the real local Compose web service was rebuilt at http://127.0.0.1:8080;
assets and health 200, API ID/image/start unchanged. Rerun commands, asset hashes,
fixture limits and cleanup are in FINAL-DEMO-CHECKLIST and ignored
`artifacts/ui-consistency-20261025/verification-summary.json`. Exact owned PG17 and
anonymous volume removed after ownership checks; fixture and Chrome closed,
profiles/logs retained. SOP, previous blocked resources and oral-study HTML WIP
untouched. No env edit/cloud write/paid call/merge/push; pending items unchanged.

## Workspace role and task badges - 25 October 2026

Source commit `e1173e4`, based on `ee7e9de`: frontend-only role/status display and
scoped readability improvements. The session bar shows the verified role as
Manager / Member / Viewer with Vietnamese meaning and a Heroicon. The badge
remains inside the existing private shell, so revalidation hides it and logout
removes it. No extra session request, client role override or authorization change.

Tasks show icon + text badges for todo/in_progress/done (neutral/warm/sage).
Existing status dropdowns and completion buttons still dispatch the same bounded
API operations. Badge updates follow server reads. Poppins and the workspace
palette are retained; task title/meta text is 13/11px, form/status controls have
clear focus styles, and mobile controls have 44px targets. Styles are scoped to
the session bar and Tasks; Course progress/gallery, Assistant/STT and other modules
are unchanged. No dependency, API, contract, SQL, RLS or migration change.

Eight new regression cases were observed RED, then GREEN; filtered run 9 PASS
includes one existing case (21 intentionally filtered skips). Fresh full gates:
2338 PASS = API Vitest 460 + API Node 1317 + Web 561/32 files; typecheck, build,
test and format exit 0. Final typecheck was also rerun after scoped CSS classes.
Chrome/Nest/PG17 fixture: 13 checks at 1440/375/320px, split non-owner NOBYPASSRLS
LOGINs, synthetic Auth upstream/Storage/provider. Task create/status/reload,
role/account transitions, viewer controls, menu/Escape, font/control sizes and
horizontal overflow were checked; uncaught errors and provider calls zero.
No full DB gate was rerun for this frontend-only change.

The real local Compose web service was rebuilt at http://127.0.0.1:8080; JS
`index-CGNZqmmb.js`, CSS `index-Dyvh58HQ.css`. API ID/image/start time unchanged;
public assets and health 200. No cloud write, real-provider call or env change.
Owned test fixture/browser closed and labelled PG17/anonymous volume removed
only after ownership checks. Profiles remain ignored diagnostic evidence.
SOP and prior cleanup-blocked resources were untouched. Evidence and rerun
commands: FINAL-DEMO-CHECKLIST, ignored `artifacts/workspace-badges-20261025/`.
Unrelated oral-study HTML WIP remains excluded. No branch merge or push was made;
previous Git authentication/push deferment and broader acceptance pending remain.

## Reference-style presentation - 25 October 2026

Source/deliverables commit: `632d945`.

Contribution clarification (25 October): the user confirmed that Thang also
contributed to RAG. The current visual HTML/PDF, speaker notes and preview now
include that shared contribution. Static-deck checks were rerun (6 Node tests,
1 PDF test and 75 browser layout checks); application gates were not rerun for
this copy-only correction. See updated visual-deck-verification.json bindings.

Added a separate 15-slide offline HTML and matching 16:9 PDF under
`docs/submission/ExaMate-Presentation-Visual-20261025.*`; original PPTX/report are
preserved. Black/white/yellow reference styling uses existing local photographs,
embedded Poppins and genuine Heroicons. Eleven retained UI screenshots have
source hashes and fixture/real-service captions in `docs/presentation/assets/`.
Flashcards is an explicitly labelled workflow illustration. English content,
Vietnamese notes, keyboard controls, fullscreen, overview, semantic headings,
reduced-motion handling and no-JS reading/printing are supported. No application
API, Auth, cloud, model, DB/schema or runtime configuration was changed.

Source and rerun commands are in SLIDES.md. Export testing found mobile CSS was
being applied by Chrome print layout, clipping content; a PDF-content regression
was RED (four missing page-content assertions), then GREEN after limiting mobile
rules to screen media. A 320px RAG grid needed shrinkable columns. Retained
measurements remain explicitly dated; incomplete follow-up, semantic/device and
whole-app browser acceptance are not promoted to complete.

New static-deck browser evidence belongs only to this document: isolated Chrome,
15 pages at 1440/1024/768/375/320 px, file:// offline loading, keyboard/overview/notes
and PDF export. No app/provider/DB call was needed. Earlier cleanup-blocked
resources and the unrelated untracked oral-study HTML remain untouched. Final
commands/results are recorded in the 25 October demo-checklist entry.

## Course gallery and session revalidation repair — 24 October 2026

Source `a2e6892` fixes the two reported frontend regressions on baseline
`fd1aa13`. Commit `132c5e2` had replaced the Courses gallery with the paged search
panel. The cinematic photo backdrop, horizontally scrolling thumbnails and
keyboard controls now render from the **current bounded server page**, with photo
cards below. Gallery selection is keyed by course ID, so filtering a long page
to one result or an empty page cannot dereference an old array index. No full
catalog read was added; course details still use the scoped slug lookup.

`PilotAccess` previously rendered the sign-in gate and collapsed the workspace
whenever focus/visibility verification entered `verifying`. Revalidation now uses
a neutral status overlay and keeps the private shell's layout/scroll height.
Private contents remain visibility-hidden, aria-hidden and inert; the existing API
client stays locked until verification succeeds. Same-principal drafts, route,
title and keyboard focus survive. Revocation/outage returns to the access gate;
cross-tab identity invalidation removes the old principal and ignores late reads.
Auth/session transport, server validation, role checks, RLS and contracts unchanged.

Fresh evidence, separate from prior report/publication counts:

- Six new regressions were RED before implementation, then 6/6 GREEN. Focused
  auth/course/App regression run: 156/156. Final full suite: **2330 PASS** = API
  Vitest 460 + API Node 1317 + Web 553; full Web has 32 passing files. Node
  fail/skip/cancelled 0. Typecheck, test, build and format all exit 0.
- First broad Web run hit three ambiguous selectors because restored gallery and
  result cards legitimately repeat course names. Assertions now target the result
  region or exact named link, retaining their original behavior checks. Initial
  typecheck rejected an unsupported Testing Library `exact` option; removed it
  because string role names already match exactly. Failed logs are retained.
- **13 focused integration/browser checks PASS**, Chrome 141 at 1440×900 and
  375×900 responsive emulation. Real Nest/session/authorization, PG17 and split
  LOGIN non-owner/NOBYPASSRLS runtime; Auth upstream, Storage and provider SDK are
  synthetic. Both widths verified photos, keyboard, bounded paging, filtering/
  clearing, scoped detail and deliberately held session GETs preserving scroll,
  hash/title and focus without a login flash. Global cases verified a late read
  after identity invalidation, revoked membership and viewer direct POST 403 with
  zero inserted tasks. Uncaught browser errors 0; only intended HTTP403. AI calls 0.
- Full database suite **not rerun**: no API/SQL/privilege change. The stated
  focused integration used the owned disposable target; it is not historical
  521-test DB evidence. Initial fixture startup required provisioning the repository
  capability groups on that new disposable cluster; no shared grants were changed.

The real local Compose **web service only** was rebuilt/recreated at
`http://127.0.0.1:8080`. Public page/assets/health returned 200; bundle
`index-CQmxCmeE.js` and CSS `index-6ucWZ0B1.css` contain the new UI. API container
ID, image and start time are identical before/after. No API restart, root env edit,
cloud data mutation, paid call or report/PDF change. Reload the browser to load
the new asset hashes. Current Vite large-bundle warning remains.

Rerun source regressions with `npm run test --workspace @examate/web --
src/pilot-access.test.tsx src/pilot-auth.test.tsx src/CoursesSearch.test.tsx
src/App.test.tsx`; full gates are the four normal npm commands. Browser harness,
logs and safe screenshots are retained in ignored
`artifacts/ui-session-repair-20261024/` (private credential/profile files are not
submission artifacts). No whole-app browser/evaluation/semantic/device acceptance
is inferred from this narrow matrix.

**RESOURCE_CLEANUP_BLOCKED:** tool policy rejected the marker-checked command to
remove owned PG17 container `examate-ui-repair-95923b98` and its Chrome profile
directories. The command was not executed; no alternate deletion route was tried.
The fixture was gracefully stopped and browser closed; the loopback-only PG
container and profile files remain. SOP, older blocked resources and the old
checkout were untouched. Unrelated untracked `docs/EXAMATE-ON-TAP-VAN-DAP.html`
is preserved outside the commits. Existing evaluation/semantic/device pending
items are unchanged.

## Defense slide delivery — 24 October 2026

Created a 14-slide, editable 16:9 PowerPoint and matching PowerPoint-exported PDF
in docs/submission/ExaMate-Presentation-20261024.{pptx,pdf}. Twelve main slides and
two hidden Q&A backups; English screen content and Vietnamese speaker notes.
The recommended eight-minute route is 1–3 → 5 → web demo → 10 → 12. Notes identify
Tài/Thắng contributions, real-service captures versus synthetic-provider browser
fixtures, and retained measurements. No Canva/plugin, new provider request, cloud
write, runtime change or application/DB/browser-gate rerun was needed.

Native text, diagrams and outcome bars are editable. DRAFT and incomplete improved
evaluation remain explicit. Sources: docs/SLIDES.md, report-evidence.json and
figure-provenance.json; slides-manifest.json binds source/builder/assets/delivery
hashes. Rebuild: python scripts/build-defense-slides.py output/presentation
(installed Windows PowerPoint and Python authoring libraries required for export).
Generic outline export lost source-relative slide images: one regression failed
before the path fix, then all three document-export tests passed. Final deck QA:
26/26 checks, native PowerPoint text extents zero overflow, all pages render-reviewed.
Raw logs/renders stay in artifacts/presentation-20261024/ and output/presentation/.
Existing untracked docs/EXAMATE-ON-TAP-VAN-DAP.html is preserved outside this work.

## Report visual revision — 24 October 2026

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

## Source publication verification - 23 October 2026

User authorized committing and pushing all reviewed nonsensitive integration code and documentation. Runtime/database source is committed at `0bddd53`. Fresh local gates: typecheck, npm test, build, format and canonical database all exit 0; application 2324 PASS (API Vitest 460 + Node 1317 + Web 547), canonical PG17 521/521 in 51 invocations; separate restricted managed-profile fixture 1/1. Fail/skip/cancelled: 0. PDF exporter tests: 2/2.

Both databases are new owned disposable clusters. No cloud write, paid model request, migration replay on shared services or new browser acceptance was performed. Report remains 19 pages and DRAFT; its publication metadata now points to committed runtime source. Secrets/backups/private artifacts remain ignored. Logs: `artifacts/publish-sync-20261023/`. Prior deployment/evaluation observations remain historical; incomplete improved evaluation and personal/device/semantic obligations are unchanged.


## Điểm tiếp tục mới nhất - managed cloud26, 23/10/2026

**Ưu tiên mục này hơn các checkpoint lịch sử bên dưới.** Cloud đã commit
`supabase-managed001–026`, root env đã chuyển sang hai LOGIN business/Auth
non-owner, non-BYPASSRLS và TLS/CA đúng. API Docker thật healthy tại8080;
Google do Tài tự consent đã callback và mở Dashboard với manager membership
cấp đúng identity.45 kiểm tra HTTP thật đạt, private Storage đọc được. Cửa sổ
bảo trì đã trả lại. Support SU-521037 không còn là blocker của đường này.

Profile017/025 dùng tên/checksum riêng và026 khôi phục CONNECT cho role nền
tảng, không sửa lịch sử canonical hoặc Auth owner/ACL/RLS. Contract managed26
được pin từ restricted fixture độc lập, không từ hash cloud. Xem
[MANAGED-DEPLOYMENT](MANAGED-DEPLOYMENT.md) cho vận hành/recovery.

Campaign01 đã chạy20 câu baseline thật; batchRQ24 bị REFUSED ở Auth preflight,
generationRequests0 do5 login/window15 phút. Không retry/clear throttle.
Improved giữ cùngRQ01–RQ20, model/corpus/prompt, threshold0,55→0,50 khai báo
trước. Mới3 câu (1 đạt,2HTTP503),17 chưa dispatch. Journal carryover đầy đủ,
tổng49 calls, upper used/reserved0,596895USD; reserve câu kế0,252USD vượt stop
0,80USD nên không gọi nữa. Baseline AI review15 strictPASS/3FAIL/2INCONCLUSIVE;
không claim đầy đủ trước/sau hoặc injection resistance. Cấu hình demo đã trả
về threshold0,55/daily30. Máy Thắng/STT, video và xác nhận cá nhân còn riêng.

### Các mục dưới là checkpoint lịch sử, không phải chỉ thị triển khai lại

FallbackFlash-Lite thử trong một bài đo mới, nhận502 ngay câu đầu rồi dừng.
Tổng cập nhật51 AI calls, upper used/reserved0,618895USD, giữ chi phí cũ và
không retry. Model metadataGET200 không chứng minh generation hoạt động.
Không chuyển demo sangLite; không ghép hai model thành một so sánh trước/sau.

## Resume inspection — 23/10/2026, 12:29 Asia/Ho_Chi_Minh

Fresh read-only checks supersede the earlier Google-provider-disabled finding:
Supabase `/auth/v1/settings` returns HTTP200 with `external.google=true`.
The owner supplied a screenshot showing two Google test users; no Google login
or consent has been performed by this resumption. TLS certificate validation is
authorized, Storage bucket is private, and cloud ledger001–016 matches source.
Root env still lacks `AUTH_DATABASE_URL`; app Google flag is not enabled. No
cloud writes or paid provider calls were made; no runtime startup is claimed.

The 017 prerequisite was independently reproduced in an owned disposable PG17
with five assertions (automatic membership, ineffective ordinary revoke,
forbidden bootstrap-grantor revoke, superuser positive control, and forbidden
ownership transfer without membership). This confirms a dependency of the
**current immutable migration path**, not that all alternative architectures are
impossible. Do not repeatedly apply017, edit its bytes, or fake its ledger.
User said Support has not been contacted and requested a draft; the unsent
request and sanitized evidence are under `artifacts/resume-completion-20261023/`.
Preserve the preceding agent's documentation WIP. See `tasks/plan.md` and
`tasks/todo.md` for the ordered resumption; no push was requested in this turn.

Resumption gates: typecheck/build/format exit0; application components
457+1313+544=2314 pass. The first root npm-test run was interrupted by overlapping
builds; the exact Node list was rerun clean, not reported as root exit0. Fresh
DB gate passed521/521 in51 files after fixing one test-only42704 assumption about
optional hosted API roles. PUBLIC EXECUTE denial is unconditional and a local
grant mutation was caught. No product source/migration changed. Owned test
container removed; evidence at `artifacts/resume-completion-20261023/`.

## Completion campaign — 23/10/2026 (current; supersedes older readiness assumptions)

Authority: user explicitly permits private credential use, guarded cloud migration and a sequential Gemini campaign capped at USD 1, stop dispatch at used/reserved USD 0.80, 200 provider calls, 5 logical requests/batch, no automatic retry. No paid call has been dispatched by this campaign yet. Gold may be technically reviewed by AI under delegation; no Tài–Thắng signatures are required. Personal contribution/understanding is still theirs to confirm.

Cloud is **PAUSED at 001–016**, not rolled out: verified TLS to Supavisor endpoint, private DB/Auth/Storage archive plus object-byte backup, successful local PG17 restore and 016–025 rehearsal. All 50 pre-existing non-ledger table counts and row fingerprints survived the stopped rollout. 017 rolled back. PostgreSQL 17 automatically grants role creators an administrative membership; immutable 017 rejects any policy-owner membership and needs an operator able to perform its ownership transition. Hosted `postgres` cannot remove the bootstrap-superuser grant. No guard/checksum/ledger bypass, owner change of managed Auth, or runtime owner fallback is allowed. Root `.env` is unchanged; separate runtime LOGINs have not been created on cloud. Cloud writes stopped; the maintenance window was released explicitly in chat. A later rollout needs fresh writer/backup checks.

Source adds migration 025 and a private, boolean-only Auth-session verifier following Supabase's documented SECURITY DEFINER pattern. Auth runtime loses direct Auth schema/table access; session/user/expiry checks remain. Existing 001–024 bytes stay unchanged. 025 is **local-only** until the cloud blocker is resolved. Capability v25 and guarded local rollback are tested. Legacy rollback fixtures explicitly install test-only verifier infrastructure without fabricating migration entries.

Gold v2 technical review is recorded in `evaluation-quality-gold-review-v2.json` against manifest `53066af8…da6a` and exact case hashes, before any campaign output. PDFs: 10 facts/5 pages verified offline. All 24 definitions reviewed; current planner supports 23 and defers RQ23. The historical offline preparer reports its narrower legacy support matrix (15 document-question cases); it is not the newer planner. Operator-side campaign authorizer pins trusted record bytes and exact batch bindings. This alone is **not** target equivalence, runtime provenance, provider-budget enforcement or permission to dispatch. Live execution remains blocked pending those runtime conditions.

Other fixes: outsider harness now requires HTTP 200 plus `no_access` instead of comparing a failure to itself; PDF exporter removes MuPDF header fills leaking into blank continuation space. Artifacts and RED/GREEN logs: `artifacts/final-completion-20261023/`; backups/credentials stay under its ACL-protected `private/`, never Git. No claim of real-service Docker, Google, full browser acceptance or semantic evaluation follows from these local fixes.

Cập nhật 22/10/2026. Đây là điểm tiếp tục công việc, không phải nhật ký từng lượt.
Git/source và kết quả kiểm mới có ưu tiên hơn checkpoint cũ trong báo cáo.

## Chốt phạm vi theo Tài — 22/10/2026

F10 đã có STT: giữ implementation của Thắng và nghiệm thu khi cần, không thêm
TTS. Bỏ F11 (PWA/install/offline shell) và F13 (WASM PoC) khỏi roadmap triển
khai; không xóa source hiện có hoặc đổi số các đợt. F15 mở rộng ba tools vẫn đã
bỏ; F14 và F12 không bị bỏ bởi quyết định này.

Đã đọc trực tiếp bản đề cuối kỳ 2026–2027 trên Drive ngày 22/10/2026, mục 3,
4.1–4.2, 7, 9 và bảng capabilities/rubric; nguồn tại
[FINAL-REQUIREMENTS](FINAL-REQUIREMENTS.md#phạm-vi-bổ-sung-theo-tài--22102026).
PWA chỉ là một lựa chọn modern frontend; streaming UI là lựa chọn khác. TTS và
WASM không phải yêu cầu bắt buộc. Nhóm hai người vẫn theo A (RAG) + C (schema-
validated output được dùng trong logic Study Coach), không nhận B với hai tools
hoặc tự nhận D vì có STT. Bỏ F11 không bỏ responsive desktop/mobile, kiểm browser
375px, SSE/streaming hoặc demo containerized/deployed. Các nghĩa vụ OAuth/JWT,
phân quyền, CRUD/search, dashboard, privacy, ≥20 case chạy thật trước/sau cải
tiến và bộ nộp cuối kỳ giữ nguyên. Phù hợp về phạm vi không có nghĩa đã đạt rubric.

## Rubric-readiness pass — demo stack, browser acceptance and submission set (23/10/2026)

Scope: make the product demonstrable and defensible without new credentials; no production source changed
(`apps/api/src`, `apps/web/src`, migrations, RLS, grants and the evaluation executor are untouched since `c2ea870`).

Added (all test harness, scripts or docs): `apps/api/test/demo-stack-server.mjs` (+ `-seed`, `-roles-check`, `-stream-check`,
`-wait-db`, `fixtures/demo-pdfs`, `fixtures/make-demo-pdfs.mjs`), `compose.demo-stack.yaml`, `scripts/build-submission-docs.py`,
`docs/{REPORT,SLIDES,DEMO-AND-DEFENSE,GOLD-REVIEW-PACK,RUBRIC-READINESS-HANDOFF}.md`, `docs/architecture.svg`; edited
`docs/FINAL-REQUIREMENTS.md` (one rubric matrix + 13 user stories), `docs/evaluation-plan.md` (live-run runbook, missing mechanisms,
result template), `AI_USAGE.md` (six AI-code defects with commit/test), `README.md`.

The demo stack runs the real Nest app, guards, PDF.js, chunker, ingestion, retrieval, telemetry/admission and RLS on a disposable PG17
with non-owner LOGINs; **Auth upstream, Storage, embedding and the "model" are synthetic** (hashed bag-of-words embeddings; an extractive
responder that copies a sentence and builds cloze quizzes; a loopback Storage that also signs 60-second URLs). Nothing it prints is
Gemini output. Browser results (Chrome in the Claude desktop app, 1440 and 375 px): login/reload/logout/two-tab logout/revoked session
(draft kept, no replay); viewer read-only; account swap without leakage; Tasks create/update/search/filter/reload; three PDFs uploaded and
indexed; RAG answer with citation opening the PDF at page 3 of 3; out-of-scope refusal; follow-up; quiz preview → save → reload → practice
(2/3) → progress; flashcards review saved; general-mode SSE incremental and Stop; AI usage dashboard; quota / 503 / timeout / malformed
errors with one model call per request; 10 pages without horizontal overflow at 375 px. The same stack in Docker (`compose.demo-stack.yaml`
through nginx on 8080) passed login, RAG with citation, SSE (first chunk 40 ms, last 4,266 ms) and the role matrix (16/16 with the data
present). `compose.yaml` itself: `config` and `build` exit 0; **not started** (no `.env`, no secrets, cloud has migrations 001–015 only).

Not done and why: ≥ 20-case evaluation (needs real Gemini, a real target, approved gold, a per-batch approval and four missing pieces
listed in `docs/evaluation-plan.md`); Google OAuth live; máy Thắng; STT accuracy; video. Findings: history scan for secrets found only
placeholders and fixtures; `npm audit --omit=dev` reports 7 (3 high, 4 moderate), all through the STT dependency chain
(`@huggingface/transformers` → sharp/onnxruntime-node/global-agent/roarr/sprintf-js) plus dev-server `vite`/`launch-editor`; no fix applied.

## F09-B.2B.5.2 — the sealing window closed (22/10/2026)

`F09-B.2B.5.2_CODE_VERIFIED`, source `da862cd`. **Correction to F09-B.2B.5.1 below (kept as
written).** That entry said the executor "works only from a private copy" after its checks. It
protected the stage *after* sealing, not sealing itself: `sealPlanned` held a reference to the
caller's suite buffer, hashed and parsed it, **awaited** the canonical rebuild, and only then
copied the buffer. A caller could change the buffer during that await, so provenance made for
the changed bytes could be paired with the plan approved for the original ones: reviewer
oracle — a manifest with its final line feed replaced by a space (same JSON, other hash),
artifacts made for the new bytes, buffer changed right after the call — COMPLETED, sent both
POSTs and reported the old hash.

Now everything the caller owns is copied in one synchronous step before the first await: the
suite buffer (into a buffer only this module holds), the plan, the resolved mapping, the
definition, the planned hash, the approval record and the provenance buffer. After that no
caller object is read. That one private buffer is hashed, parsed by the canonical loader, used
for the canonical rebuild, kept in the sealed copy and given to the provenance verifier, and is
never copied again or handed to a callback. (Freezing a buffer is not what makes it immutable;
owning a copy and never exposing it is.) Under a change made in that window the run uses the
data that existed when it was called, or is refused (an artifact that fits only the changed
bytes is refused as `PROVENANCE_ARTIFACT_FAILED`); it never mixes the two. The canonical
planner, loader and verifier are unchanged, as are the ledger, Auth/RLS, corpus and gold.

Evidence. Reviewer oracles 7/7 (the new seal-window oracle failed before). Executor unit 26/26
(was 20): buffer changed right after the call with artifacts for the changed bytes (refused
before credentials, network and ledger), original provenance with a changed buffer (completes on
the original snapshot, report hash is the original), the provenance manifest buffer copied
before the first await, resolved mapping, plan, definition and approval all changed in the window
(one consistent snapshot, original requests sent), no buffer reachable from any callback or the
report. The order is fixed by running code to the first await, not by sleeping. 24 snapshot and
binding mutants killed (early copy removed or delayed, caller re-read after the rebuild,
references kept); two mutants (using the verified snapshot's plan or definition in place of its
clones) are equivalent because they are already equal after the checks. Nest/PG17 executor
integration 8/8 on a fresh guarded container. Gates at `da862cd`: typecheck/build/format
exit 0, `npm test` 2,310 (457 + 1,309 + 544), full `test:database` 520/520 in 50 files — new
runs. The authorizer and target-equivalence proof remain test-owned; nothing records any
person's approval; `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING` and
`SEMANTIC_REVIEW_PENDING` are unchanged. The gold-approval recording tool is not started.

## F09-B.2B.5.1 — executor bound to the data it really sends (22/10/2026)

`F09-B.2B.5.1_CODE_VERIFIED`, source `3a628e6`. **Correction to the B.2B.5 entry below
(kept as written).** That entry said the approval `binds` "must equal what the executor
recomputes from the plan". What it actually recomputed was the binding *from values stored
in the plan object*: the per-case `requestSha256` was copied, not recomputed from the request.
Two reviewer-reproduced defects followed. (A) After a valid approval, editing
`plan.cases[0].request.body.message` while keeping the old hash still read the credential,
sent the edited request and reported COMPLETED. (B) The provenance verifier ran on the
`manifestBytes` the caller supplied and never compared them with the approved plan, so a v2
plan and approval ran with a v1 artifact and v1 bytes.

What is checked now, before the authorizer, any credential, network call or ledger write
(refusals are returned as REFUSED with a reason): the exact suite bytes are re-hashed and must
equal the suite metadata and the plan (`SUITE_BYTES_MISMATCH`); the suite is re-parsed from
those bytes by the canonical loader and must equal the definition handed in
(`SUITE_DEFINITION_MISMATCH`); every supported case's `requestSha256` is recomputed from its
method/path/body (`PLAN_REQUEST_HASH_MISMATCH`); the canonical plan hash is recomputed
(`PLAN_HASH_MISMATCH`); and the whole plan is rebuilt by the canonical planner
(`assembleQualityPlan`, the same code that built it) from those bytes and the mapping and compared
(`PLAN_BATCH_MISMATCH` / `PLAN_CONTENT_MISMATCH`) — so a plan whose hashes were all recomputed and
whose approval was freshly signed is still refused if it is not what the suite produces. Provenance
bytes, if supplied, must hash to the approved suite (`PROVENANCE_SUITE_MISMATCH`) and the verifier is
always called with the plan's own verified bytes. The target, timeout, batch size and selection are
free parameters of a plan, covered by the plan hash and by the approval, not by the rebuild: a
re-hashed plan that points elsewhere is refused by the approval binding, not by the rebuild.

After the checks the executor works only from a private, deep-frozen copy (plan, definition,
resolved mapping, binding, suite bytes) and copies the provenance strings and acknowledgements it
was given; callbacks receive clones. Changing the caller's plan, definition or approval while an
authorizer, preflight or checkpoint callback is awaited changes nothing that is sent or used for
evaluation; a callback that edits its snapshot cannot alter the run.

Evidence. Reviewer oracle 3/3 (positive control and both negatives, previously 1/3). Executor
unit 20/20 (was 14): edits to message/operation/documentId/courseId/mode/path/method/extra field/
stored hash, fully re-hashed and re-signed forgeries, suite bytes/definition/metadata, v2 plan with v1
provenance and the reverse, v2 with its own provenance still runs, mid-run mutation during the
authorizer and after the first checkpoint, approval not spreading. 30 mutants (19 earlier, 11 new:
each hash check, the rebuild, the definition and the sealed copy) all killed. Nest/PG17 integration
8/8 on a fresh guarded container including an edited request and a foreign-revision provenance
refused at no cost to the real server. Gates at `3a628e6`: typecheck/build/format exit 0,
`npm test` 2,304 (457 + 1,303 + 544), full `test:database` 520/520 in 50 files — new runs.
Not live: the authorizer and target-equivalence proof are still test-owned; no approval of any person
is recorded; `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING` and `SEMANTIC_REVIEW_PENDING`
are unchanged. The next useful step is the tool that records a person's gold approval so that an
authorizer can verify it; it is not started.

## F09-B.2B.5 — one-batch quality executor (22/10/2026)

`F09-B.2B.5_CODE_VERIFIED + LOCAL_SYNTHETIC_EXECUTOR_VERIFIED + LIVE_EXECUTION_BLOCKED`,
source `7a17db3`. `rag-evaluation-quality-executor.mjs` runs **exactly one named batch** of
a quality suite; the live path stays closed because the two things it needs from outside
do not exist yet.

How it works. The approval record (`rag-quality-batch-approval-v1`) must have exactly the
keys `schema`, `binds`, `evidence` and `binds` must equal, field for field, what the executor
recomputes from the plan: suite revision and hash, plan hash, batch id/index/hash, case
ids **and order**, each case's request hash, target base/origin, provenance-target
identity, and the limits (client requests = batch size, the plan's timeout, sequential,
zero retries). Anything else, including a self-declared `approved`/`verified` field, is
refused. Authenticity is **not** decided by the record: an injected `authorize` must
return `goldReview` and `batch` both `verified`, an injected `targetEquivalence` must
return `verified`, and provenance must be bound, digest-pinned by the operator and
current. There is no flag, boolean, environment variable or default that supplies a missing
piece, and a source scan test says so. All of this happens before a credential is read.
Then: ledger `precheck` (before credentials), authenticated reads of access, documents and
the course sets the batch uses (only those), `reserve` — the intent is durable before the
first POST and a ledger that cannot write blocks dispatch — and one POST per case in plan
order, never repeated. A blocking outcome (quota, access, provider outage, transport) ends
the batch and marks the rest NOT_ATTEMPTED; a cut-off or hung body is an unknown outcome,
recorded as such, and is not replayed. The batch is never followed by another one.

Ledger: the existing append-only ledger, keyed per batch by the hash of everything the
approval binds, so an approval, a reservation and a history belong to one batch of one
plan and nothing spreads to another. Recovery rules are the ledger's own and unchanged.

Reporting: request caps and provider calls are separate (`providerCalls: "unknown"`,
`monetaryBudget: "not_enforced"`, no hard budget is claimed); token and cost figures are
`unobserved`, never zero; each case keeps the response hash, request id, receipt flag,
latency and a failure kind (`contract`, `transport`, `access_or_quota`); the evaluator's
machine checks never yield PASS without a human review, so `humanSemanticReview` stays
`pending`. Injection cases stay INCONCLUSIVE over HTTP (no retrieval trace).

CLI: `--execute --batch quality-batch-N --approval <file>` (plus the provenance flags and
`--rerun-acknowledged`) goes through the executor, but the CLI passes no authorizer and no
equivalence proof, so it refuses with `APPROVAL_AUTHORIZER_UNAVAILABLE` or
`TARGET_EQUIVALENCE_UNVERIFIED` before any credential or request. Plain `--execute` is
refused as before.

Evidence (all synthetic). Unit 14/14, including two real processes racing for one batch
(one dispatches), a runner failure mid-batch recorded as unknown, ledger write failure
blocking dispatch, and 19 mutants of the executor/CLI wiring all killed. Nest/PG17
integration 8/8: a refused batch costs the server nothing; a positive control sends batch 1
(five cases: document, course and document∩course questions, one refusal) over HTTP to the
real stack, where the real retrieval, admission, usage and receipt services run and only
Auth upstream, Storage and the SDK transport (a model that answers from the retrieved
evidence) are synthetic. Counters agree: five query embeddings and as many generations as
answered requests; persisted provider calls = the two summed; five operations; receipts =
responses that announced one; documents, chunks and base data unchanged; a second run and
the next batch are refused or untouched; a provider timeout stops the batch after one case.
Gates at `7a17db3`: typecheck/build/format exit 0, `npm test` 2,298 (457 + 1,297 + 544),
full `test:database` 520/520 in 50 files — new runs.

What this is not. The approval authorizer and the target-equivalence proof used in tests are
test-owned (an HMAC check and a constant): they prove the executor honours its dependencies,
not that any human approved anything or that any HTTP endpoint is the audited database. No
real model, account, Storage or cloud was used; the improvement of the evaluator is not
evidence that model quality improved. `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING` and
`SEMANTIC_REVIEW_PENDING` are unchanged.

Missing before any live batch: a human-approved gold (v1 or v2) and a trusted mechanism that
turns that approval into the authorizer's verdict; a trusted target-equivalence proof; a
decision on batch size, quota and budget (no hard monetary cap exists); a real audit with
a maintenance credential and an out-of-band pinned digest; and the real Gemini key. The
action that is truly the user's: approve gold, choose the target-equivalence design, and
decide whether to spend quota.

## F09-B.2B.4 — quality suite v2 draft (22/10/2026)

Revision `rag-quality-20261022-v2` (`docs/evaluation-quality-cases-v2.json`, source
`d1a95d1`) applies the corrections proposed by the AI-assisted gold review. It is an
**AI proposal**: unreviewed by Tài and Thắng, never executed, `GOLD_REVIEW_PENDING`.
v1 (`97b02958…`) is untouched, so everything bound to v1 stays bound to v1 and the v2
hash (`53066af8…`) invalidates nothing old. The frozen corpus, every gold file/page/fact
and every PDF hash are identical; only wording or scope labels change, in 14 cases
(RQ04, RQ05, RQ06, RQ08, RQ09, RQ10, RQ11, RQ12, RQ13, RQ14, RQ16, RQ21, RQ22, RQ24); a
test fixes that exact list. RQ13 becomes a one-document case (its whole answer is in the
policy). RQ23 is unchanged and stays deferred (no API path for a course summary).
`minCitations` stays 1 because the validator pins it; the extra-source requirement is in
the required behaviour for the human reviewers. Known limit kept honest: the PDF still
labels the injection as "never a command" next to it, so RQ09/RQ10 remain a light test
unless the corpus is rebuilt (a team decision; it would change every PDF hash).

`npm run eval:f09b2a:prepare -- --suite docs/evaluation-quality-cases-v2.json --output <new dir>`
exports the pending pack (the default is still v1). The planner already accepts v2
(23 supported, RQ23 deferred). Gates at `d1a95d1`: typecheck/build/format exit 0,
`npm test` 2,279 (457 + 1,278 + 544). No DB suite was needed: no fixture or SQL changed.
The shared final-project rubric (re-read directly via Drive on 22/10/2026; source in
FINAL-REQUIREMENTS) asks for an evaluation set of at least 20 cases (normal, edge, should-refuse) with
pass rates before and after at least one improvement, the first 10 cases at the mid-point
demo, and weights AI Quality & Safety at 10%; it does not itself require a two-person
gold sign-off, which is this project's own process.

## F09-B.2B.3.1 — blank baseline for the chain (22/10/2026)

**Correction to the B.2B.3 checkpoint below (kept as written for history).** For source
`acd2b3c` the chain fixture called `openDocumentsTenantFixture()`, whose bootstrap
seeds twelve sample documents and twelve chunks (four per tenant). So "setup has no
documents or chunks; only users, memberships and courses are seeded" and "setup — no
document" were not true: the database held 12 documents and 12 chunks before the first
upload, inserted by a helper the static source scan could not see. The three corpus
PDFs were still created by the upload route and indexed by the processing endpoint,
and the audited documents were still those three; production ingestion was not at
fault. An independent reviewer reproduced it (oracle FAIL: documents=12, chunks=12).

Fix (test infrastructure only): `openDocumentsTenantFixture` takes
`{ seedDocuments }` (default `true`, unchanged for its 32 other callers); `false`
keeps the schema, migrations, capability roles, workspaces, memberships and courses
and drops only the sample documents/chunks. The chain uses `false` and now asserts on
the database: before upload 0 documents, 0 chunks and zero provider calls, operations
and receipts (with base data present); after upload exactly the three API-returned
ids and 0 chunks; after processing no document or chunk outside those ids and a chunk
total equal to the processing responses. The source scan stays only as a supplementary
check (it is now guarded against matching nothing and requires the blank mode at the
single call site); it is not the proof. A pin test keeps the default 12/12 and shows
blank mode differs only in those rows.

`F09-B.2B.3.1_CODE_VERIFIED`, source `ff44b41`. RED: the new runtime assertion failed
with documents 12 / chunks 12 before the fix; GREEN after. Mutants killed: option
ignored (chain and pin tests), default flipped to false (pin test). Chain 13/13,
reviewer oracle PASS, typecheck/build/format exit 0, `npm test` 2,273
(457 + 1,272 + 544), full `test:database` 512/512 in 49 files — new runs. The
B.2B.3 conclusions otherwise stand (and `F09-B.2B.3_CODE_VERIFIED +
LOCAL_INGESTION_AUDIT_PREFLIGHT_VERIFIED + EXECUTION_BLOCKED` now rests on a blank
baseline). Not F09 complete.

Remaining blockers, by who can act:
- **Engineering agent (local, no real account):** a quality-suite controlled-execution
  code path — ledger-backed, bound to the plan hash, one approved batch at a time,
  provenance and preflight as hard prerequisites, tested against synthetic
  Storage/Auth/SDK so it can be proven to dispatch nothing without approval; a v2 suite
  revision once the decisions below exist; human-review ingestion that cannot self-
  approve.
- **Decisions or approvals only the team can give:** Tài–Thắng gold review and the
  points raised by the AI review (RQ05, RQ09/RQ10, RQ14, RQ21–RQ23, `minCitations`,
  the synthetic-vs-real and language rules, RQ23's fate); whether target equivalence
  becomes a product feature (a trusted attestation the server can give) or a manual
  operator procedure; batch size, quota and budget for any live run; who holds the
  maintenance credential.
- **Needs a real environment or account:** an audit of the real Supabase project with
  a maintenance credential; real Storage/Auth/Gemini behaviour and quota; a live
  batch; human semantic review of real answers; browser, cloud, Google and Thắng-
  machine acceptance; F09-A.1 resource cleanup (blocked by policy).

## F09-B.2B.3 — upload → ingestion → audit → preflight on one runtime (22/10/2026)

Closes the persistence gap left by B.2B.1/B.2B.2, whose fixtures wrote the index
with the production extractor/chunker but not through the ingestion service. New
test-only slice: `test/evaluation-ingestion-chain-fixture.mjs` and
`test/evaluation-ingestion-chain.database.test.mjs` (historic fixtures untouched,
no production change, no endpoint).

Real in the chain: Nest app and guards, Auth/CSRF/Origin, non-owner NOBYPASSRLS
business/Auth LOGINs on PG17 with RLS, the public `POST /documents` upload,
`DocumentsService`, the real `StorageService` (HTTP, private-bucket check), PDF.js
extraction, the chunker, `POST /documents/:id/process` and
`DocumentIngestionService`, `GeminiEmbeddingService` batching, admission and usage
telemetry, the provenance auditor/verifier and the quality preflight. Synthetic:
the Auth upstream; the remote Storage (a loopback server that keeps the bytes it is
sent and returns exactly those bytes per key); the SDK transport under the
embedding/generation/OCR services (OCR is switched off and any OCR or generation
dispatch would throw and be counted). Only users, memberships and the two courses
are seeded. Brief, policy and a separate policy copy for the policy-only course are
uploaded through the API; their ids come from the responses. A static check proves
the fixture and the happy path contain no document/chunk writes; direct SQL appears
only below a marked NEGATIVE-CORRUPTION section, to damage data on purpose.

`F09-B.2B.3_CODE_VERIFIED + LOCAL_INGESTION_AUDIT_PREFLIGHT_VERIFIED +
EXECUTION_BLOCKED`, source `acd2b3c`. Observed by phase: setup — no document, no
operation; upload — three objects in the stand-in, byte-equal to the PDFs, no
provider call, no operation; denied upload (viewer, other workspace) reached no
Storage; processing — chunks and pages equal the production pipeline's output for the
bytes, every stored vector is the embedding of that chunk's own text, embedding
calls = the real per-document batch count with inputs summing to the chunk total,
three `document_index` operations and as many provider-call rows as SDK calls,
no generation, no OCR, no receipt. Denied processing (viewer 403, other workspace
404) made no SDK or Storage call but the usage layer records each as an operation
with outcome `rejected` and zero provider calls (existing behaviour, now
documented). From the post-indexing baseline, two audits and the preflights changed
no table except Auth bookkeeping (`pilot_sessions`, `pilot_auth_limits`) and no
counter. Audit: OBSERVED_CONSISTENT; verifier BOUND with a pinned digest and a
second audit; preflight verifies Auth, scopes, course sets and provenance evidence
while gold approval, target equivalence, metadata-only corpus provenance and
admission stay unverified and execution blocked; `--execute` refused with zero
fetches. Failure paths: wrong or unreadable Storage bytes, an unprocessed/failed
document (retry through the endpoint recovers), damaged chunks (missing, wrong text,
wrong page) caught and replaced by a real re-index without duplicating rows, vector
drift and damaged text against an older artifact (`MISMATCH`).

What this does not prove: the audit alone cannot show that a vector came from its
chunk's text (the test shows it only because the synthetic transport is
deterministic); same-fixture agreement is not equivalence of any other HTTP target
with the audited database/Storage, so `targetEquivalence` stays unverified; real
Storage, real Auth, real Gemini and a real maintenance role were not used. RQ23
remains deferred; gold review, live evaluation, semantic review and browser/cloud/
Google/Thắng-machine items remain pending.

## F09-B.2B.2 — quality-suite dry-run and authenticated preflight (22/10/2026)

Completed checklist: (1) a pure planner for `rag-quality-20261022-v1`
(`rag-evaluation-quality-plan.mjs`): exact manifest bytes, a per-course-file-set
mapping, request shapes validated against the assistant's own DTO, batches and a
reproducible plan hash; (2) a separate quality mode of the evaluator
(`rag-evaluation-quality-http.mjs`, flags `--http-evaluation --quality-suite`):
dry-run, authenticated preflight over the existing cookie/CSRF/Origin transport,
and a refusal of `--execute`; (3) the existing provenance verifier consumed as
separate conditions; (4) unit, Nest/PG17 integration and mutation evidence.
Legacy v3 / F09-A / ten-live-case runner unchanged; no new endpoint.

`F09-B.2B.2_CODE_VERIFIED + LOCAL_PREFLIGHT_VERIFIED + EXECUTION_BLOCKED`, source
`1e1dd08`. Support matrix from what the API accepts: 23 of 24 cases have a valid
request shape (document question, course question, document∩course question, one-
document summary); RQ23 is deferred `SUMMARY_REQUIRES_ONE_DOCUMENT` (the service
summarizes one document and has no course summary), never relabelled as a question.
The manifest's own `transport` metadata is a v1 draft and is not edited; the plan
records the API-derived support. A course holds exactly one file set, so the
two-PDF course and the policy-only course are mapped separately and the latter holds
its own policy copy (same name, different id); mapping onto a shared course id is
rejected (also now in the audit validator).

Preflight reports separately: target, auth/session, membership, document scope and
Assistant configuration (existing), exact course document sets through the server's
own read API (`courses`, `documents/search?course=`), provenance artifact binding,
provenance authenticity (digest pinned by the operator, never read from the
artifact), provenance currentness (a fresh observation from a separate maintenance
boundary), gold approval (always `GOLD_REVIEW_PENDING`), target equivalence (always
unverified: nothing the HTTP surface returns identifies the audited database or
Storage, and two client-declared values are not proof), plus the existing metadata-
only corpus-provenance and admission conditions and the blocked execution path.
`qualityExecutionReady`, `complete` and `executionAuthorized` are constant false;
`generationRequests` is observed (0). The evaluator never holds the maintenance
credential: it only reads artifact files an operator provides.

Verified: planner 17/17, quality-http 16/16, provenance 40/40, focused evaluation /
quality / HTTP / reservation / provenance / planner 448/448; PG17 integration 6/6
(manager, viewer, foreign, revoked, expired sessions; wrong course sets; forged and
drifted provenance; execute refusal with zero requests) with every table unchanged
except Auth session bookkeeping (`pilot_sessions`, `pilot_auth_limits`), SDK and
persisted provider calls and receipts unchanged. 26 mutants over planner,
orchestrator and validator: 25 killed, one equivalent (the generation counter, which no
code path in this mode can increment). typecheck, build, format, `npm test`
(457 + 1,272 + 544 = 2,273) and full `test:database` (499/499, 48 files, own guarded
PG17) exit 0. Limits: the integration index is written with the production
extractor/chunker, not through the ingestion service; no real target, account,
cloud or paid provider; verifier results are point-in-time. Execution, a trusted
target-equivalence proof, gold approval and post-response semantic review remain
open and are not started.

## F09-B.2B.1.1 — document-set completeness fix (22/10/2026)

Defect (found by an independent reviewer, reproduced): `parseArtifact` only
checked that the audited list had the same length as the set implied by the
mapping/scopes and that each entry belonged to it. Expected A/B/C against actual
A/A/C passed. With the self-checksum recomputed the verifier accepted the
artifact, the fresh-observation loop walked only `artifact.documents`, and drift
in the omitted document B was never compared, so it could return `BOUND` and
`matches_observation`.

Invariant now enforced on the artifact **and** on a supplied observation, before
any verdict or fingerprint comparison: the audited identities `(file,
documentId)` are one-to-one with the identities implied by mapping+scopes — no
repeated identity, equal count, every entry expected (so none is missing or
outside). Identity is the pair, so a policy and its separately-courseed copy
(same file, different id) stay valid. Each entry must also have the exact
document and condition key sets; a structurally wrong artifact is `INVALID` even
with a correct recomputed checksum. A malformed observation yields
`MISMATCH` / `OBSERVATION_INVALID`, never `matches_observation`, and the two
identity sets are compared again before per-document comparison. The
unauthenticated/pinned/observation distinctions, bindings and statuses are
unchanged; no digest is newly required and nothing grants readiness.

`F09-B.2B.1.1_CODE_VERIFIED`, source `6207165`. Reviewer oracle 2/2 (RED before,
GREEN after); regression RED 4 failing before the fix, 39/39 provenance unit tests
after; focused evaluation/quality/HTTP/reservation/provenance 414/414; PG17
provenance integration 14/14 (new real-data forgery case; red under a
uniqueness-dropped mutant). typecheck, build, format, `npm test` (457 + 1,238 +
544 = 2,239) and full `test:database` (493/493, 47 files, own guarded PG17)
exit 0. Limits unchanged from B.2B.1: no real target audited; verifier not wired
to execute; gold review, live evaluation, semantic review and the earlier
browser/cloud/Google/Thắng-machine/F09-A.1 pending stay open.

## F09-B.2B.1 — read-only runtime provenance audit (22/10/2026)

Completed checklist: (1) versioned artifact protocol
`examate.rag-corpus-provenance` v1 and a pure verifier; (2) a read-only auditor
over the stored Storage bytes and the PostgreSQL index of a target; (3) RED→GREEN
unit tests plus a PG17 integration with a real SQL path and a real Storage HTTP
reader against a loopback stand-in; (4) mutation checks and four application gates.
Not wired to generation execute, the HTTP runner, the ledger or any new endpoint.

`F09-B.2B.1_CODE_VERIFIED + LOCAL_PROVENANCE_AUDIT_VERIFIED` (synthetic fixture
only; no real project, account or cloud was audited). Module
`apps/api/scripts/rag-evaluation-provenance.mjs`. What one audit observes, at one
point in time: workspace/name/Storage status of each mapped document; exact
Storage bytes (SHA-256 against the frozen corpus, plus size metadata); the stored
index compared chunk by chunk (index, source page, exact text) with the output of
the **production** PDF extractor and chunker applied to those bytes; facts on
their declared page (rule `whitespace-collapse-v1`); embedding presence, declared
model/dimension and a vector hash; exact course document sets from
`documents.course_id` (the two-PDF course and the policy-only course need
separate mappings, and a policy-only course needs its own policy copy because a
document has one course); optional workspace membership. State is read in a
REPEATABLE READ, READ ONLY snapshot before and after the Storage reads (two reads
per object); any difference gives INCONCLUSIVE, never consistent.

Trust boundary: the artifact is self-describing evidence. Its integrity digest is
a checksum, not a signature, so a forger can recompute it. The verifier therefore
reports `authenticity` as `unauthenticated` unless the consumer pins the expected
digest from a record kept outside the artifact, and `currentness` only when a
fresh independent audit agrees. Statuses are `INVALID`, `MISMATCH`,
`NOT_CONSISTENT`, `BOUND`; none grants gold approval, `qualityExecutionReady` or
execution (always `GOLD_REVIEW_PENDING` / false / `NOT_AUTHORIZED`).

Finding: the production pipeline keeps the PDF's line breaks, while the earlier
F09-A/B.1 runtime fixture seeds one unwrapped page text per chunk. An index shaped
like that fails this audit's exact comparison (by design); it was never what
ingestion stores. Not proven: embeddings derived from the chunk text; any state
after the audit; retrieval ranking or answer quality; accented-Vietnamese or OCR
extraction; the real maintenance role's privileges; that a later evaluation calls
the same target. The ingestion service transaction itself was not run: the
integration seeds with the same production extractor/chunker, so it proves the
audit against production output, not the ingestion service's persistence.

Next inputs (nothing is run without them): maintenance DB URL and a Storage read
credential for the target; workspace ID; document IDs for each corpus file (and a
separate policy copy for the policy-only course); a pinned digest record.
Verifier wiring, missing transport and new-manifest execution are not started.

## F09-B.2A — offline quality-suite preparation (22/10/2026)

Completed checklist: (1) separate draft revision with 24 distinct authored quality
objectives and frozen rag-eval-v2 fact/page bindings; (2) RED→GREEN offline
validation, bounded proposed batches and a Tài–Thắng gold-review pack;
(3) evaluation compatibility tests and four application gates, local commits.
No execute wiring, provenance attestation, live calls, DB or ledger changes.
Document-question operation compatibility is separate from executable support:
the current HTTP runner still reads v3, while course/intersection/summary need
transport work. Gold approval before execution is separate from human semantic
review of model responses after execution; both remain pending until evidenced.

`F09-B.2A_CODE_VERIFIED + GOLD_REVIEW_PENDING`: manifest commit `b4b7d21`,
tool/test source `1860cc8`. Revision `rag-quality-20261022-v1`, exact file SHA-256
`97b029588eacdabd593fbc80da0315a8aeef273cbf3e233696b1aaed5e7df7b9`.
Coverage overlaps: grounded 18, no-evidence 6, document 16, course 6,
intersection 2, Vietnamese 18, injection 4, summary 3. Both synthetic PDFs and
all 10 frozen facts survive production local extraction on their bound pages.
No grounded case lacks a structural gold binding; absence oracles and substantive
objective distinctions still need human review. Zero cases executed/approved.

14 document-question operation-compatible cases form **proposed** batches 5/5/4;
10 unsupported cases remain deferred. All new IDs are non-executable because
the HTTP runner still reads v3. Legacy 9-live-case manifest / ten-request cap
remain unchanged. Source `1860cc8`: 58 new tests, focused evaluation/HTTP/ledger
375/375; typecheck, npm test (457 API Vitest + 1,199 API Node + 544 Web = 2,200),
build and format all exit 0, fail/skip/cancelled 0. Build retains the chunk-size
advisory. RED evidence includes three missing-exception failures before added
guards; initial missing-module and two first-implementation failures are retained,
not production defects or live results.

Re-run `npm run eval:f09b2a:prepare -- --output artifacts/my-gold-review --batch-size 5`.
Use a new directory. Current pack/logs: `artifacts/f09b2a-20261022/` (catalog
records source SHA and dirty=true for then-uncommitted docs). No DB/browser run:
offline data/scripts only, no runtime/SQL/UI change. No persistent resources
created; own temporary test directories removed, artifacts retained. Pending
LIVE_EVALUATION, post-response SEMANTIC_REVIEW, prior F05/F06/F08 browser,
cloud/Google/Thắng-machine and F09-A.1 RESOURCE_CLEANUP_BLOCKED are unchanged.
B.2B still needs real gold approval, runtime provenance attestation, missing
transport support and explicit target/batch/quota approval; not implemented here.

## F07 contract and local implementation

## F09-B.1.3 — fail-closed marker publication (22/10/2026)

Base `8512024`, reviewed source `d09dfbb`; fix source `122ca20`. Finding: `wx`
created a public release/unknown marker before write/sync completed. EIO left
an empty/partial public file, and a reader trusted the filename and admitted an
acknowledged successor while the holder was alive. A failed finish return did
not keep the on-disk plan closed. This corrects that claim in B.1.2 below.

Only marker publication changes. Write `.prepare.<runId>/<kind>.<seq>.json`
exclusively, write all JSON, sync and close, then create the public marker by
`fs.link` (same-filesystem exclusive hard link; no replace/rename/delete). The
hard-link addition is the commit point. Immutable preparations, including failed
ones, remain evidence. Readers validate publication protocol `synced-hardlink-v1`,
plan/kind/seq/runId/timestamp against the reservation, and regular-file identity
(same nonzero inode/device and link count >=2) between public/prepared paths.
Unreadable, malformed, conflicting, unlinked-copy or legacy raw markers refuse
with LEDGER_UNAVAILABLE. Old `active.json` stays blocked. No automatic migration
or repair of historical ledger files is provided.

Before publication, a preparation grants no release/unknown status: an unfinished
live holder blocks even acknowledged runs. A crashed unfinished holder still
needs explicit acknowledgement plus same-host proof it is dead. After publication,
a completed run is released (history still requires acknowledgement), and published
finished_unknown follows the existing explicit acknowledgement policy. A lost link
ACK can return released=false despite a valid commit; inspect the published record,
never retry the write or automatically replay a generation. Late finish still only
annotates its own seq; ownership still transfers by exclusive next-record creation.

Observed RED: 30 new tracked tests failed on baseline; reviewer EIO-after-real-wx
oracle 0/2. GREEN: 41 new regressions and existing tests give 126/126 reservation/
HTTP tests; 7 reviewer/adapted oracles pass. Four mutations killed: trust marker
name, ignore publication error, ignore sync error, omit sequence binding. The sync
mutant initially survived because a test interceptor assertion prevented the unsafe
link; move that assertion outside the operation and it is killed. Source restored.
Real process crashes use IPC barriers before/after publication (no sleeps/lease).

Focused Nest/PG17 integration at clean `122ca20` passed 1/1, retained under
`artifacts/f09b-http-integration-e9495410-dd06-4c4d-a87b-1bd819e342e3`:
two processes still dispatch once (2 SDK/persisted calls, 1 receipt); each new
completed/unknown marker EIO case has 1 embedding + 1 generation, 2 persisted
calls, 1 receipt, empty preparation, and acknowledged rerun blocked with no new
work. A first added integration run hit the owner's existing login rate bucket;
it is retained. The new cases use another authorized fixture member, not weakened
Auth. Final gate results are recorded in FINAL-DEMO-CHECKLIST.

Scope: Windows/NTFS on D:, local same-host filesystem only. File sync plus atomic
hard-link visibility is tested, including SIGKILL; directory fsync/power-loss,
network shares and hostile filesystem modification are not certified. Runtime
services, HTTP body deadlines, SQL/migrations/RLS, corpus/gold/model/prompt and
UI remain unchanged. LIVE_EVALUATION_PENDING, SEMANTIC_REVIEW_PENDING, prior
browser/cloud/Google/remote-machine pending and F09-A.1 cleanup blocker remain.
No F09-B.2 work. Raw evidence is kept under `artifacts/f09b13-20261022` and
`artifacts/f09b13-marker-tests`.

F09-B.1.3_CODE_VERIFIED / LOCAL_INTEGRATION_VERIFIED (synthetic runtime only):
five fresh sequential gates at `122ca20` exit 0: typecheck; `npm test` with
457 API Vitest + 1,141 API Node + 544 Web = 2,142 pass; build; format; full
guarded PG17 suite 479/479 in 46 files. Fail/skip/cancelled 0. Build retains
the existing Vite >500 kB advisory. Command/SHA/exit logs and summed DB counts:
`artifacts/f09b13-20261022/gates-122ca20`. Later documentation-only commits do
not change verified source. After checking task/repo/date labels and exclusive
mount, only `examate-f09b13-pg17-20261022` and its volume
`examate-f09b13-data-20261022` were removed; zero owned containers/volumes remain.
No F09-A.1 resource or SOP container was touched. Evidence artifacts remain.

## F09-B.1.2 — append-only plan ledger: a release cannot touch a successor (22/10/2026)

Base `61e74a5` (F09-B.1.1 code `7814f7d`); source commit `d09dfbb`. An independent
review found that F09-B.1.1's claim "only the owner can release, and a superseded
owner's late finish touches nothing" was incomplete, and reproduced it with a
deterministic barrier on a real filesystem.

Root cause: `finish({completed})` checked the owner once, rewrote `active.json` as
`finished` and then unlinked `active.json`. After the `finished` state was published an
acknowledged run B could take over and create its own `active.json`; A's pending unlink
then deleted B's reservation, and a third acknowledged run C could reserve while B was
still active. The same read-then-write-a-shared-path shape also existed in the
rewrite of `active.json` and in giving back a reservation after a pre-dispatch refusal.
Re-reading the run ID just before `unlink` would only shrink the window.

Fix (`rag-evaluation-http-ledger.mjs`, filesystem only): the ledger has no shared
mutable path any more. `<ledger>/<planSha256>/` is append-only: a reservation is the
record `lock.<n>.json`, created exclusively and never changed; `release.<n>.json` and
`unknown.<n>.json` are markers; `<runId>.intent.json` and `.outcome.json` stay.
Invariants: (I1) no operation deletes, renames or overwrites a ledger file; (I2) the
reservation is the highest record and ownership passes only by exclusively creating
record n+1, which one creator can win, so acquisition and takeover are the same atomic
step and the separate `takeover.json` guard is gone; (I3) a marker is addressed to one
record number and written by that record's owner, so a run finishing late can only
annotate its own superseded record; (I4) the latest record is active unless its
`release` marker exists, and a crash leaves no marker so the plan stays closed; (I5) a
listing may be stale only toward refusing, because records and markers are only added.
Policy is unchanged: acknowledgement never overtakes a live holder, an unknown outcome
or crash needs `--rerun-acknowledged` (and a dead holder for a run that never
finished), a refused attempt before dispatch closes only its own record, nothing
expires, intent is written and synced before the first POST, and a read or write
error, an unreadable or half-written record, or a ledger in the former `active.json`
layout refuses the dispatch. A finish whose marker cannot be written leaves the
reservation held. Different plans use different directories and never block each other.
The B.1.1 text below that mentions `active.json`, `takeover.json` and `superseded-*`
describes the previous layout and is superseded by this section.

Evidence: the reviewer's oracle (barrier at the unlink of `active.json`) can no longer
reach its interleaving because that operation does not exist (its tests are cancelled
by timeout), so an equivalent oracle with the same actors and assertions, barriered at
the first write after the outcome file, was kept in `artifacts/f09b12-20261022`: RED
0/2 on the previous ledger and 2/2 now. Tracked tests use deterministic barriers, no
sleeps: a release paused at its last step while a successor takes over (B survives, C
is refused, B releases normally); a live owner still finishing cannot be taken over and
then hands over; two acknowledged takeovers meeting at the exclusive create produce one
owner; a late finish writes only its own marker and leaves the successor's bytes
unchanged; failures of the marker write, the successor create, a record read, a
half-written record and the former layout all keep the plan closed; two independent
OS processes racing an acknowledged takeover of an unknown outcome dispatch once.
RED with the previous ledger (plus a read-only `inspect` shim): the interleaving test
failed with the reservation of B lost, and layout-dependent assertions failed; the
suite is 30/30 now and the three F09-B.1 oracles 3/3. 14 mutations of the protocol (a
marker for the latest record, non-exclusive create, takeover of a live holder, takeover
without acknowledgement, ignored or misused unknown marker, the oldest record as the
reservation, no give-back, no history recheck, former layout ignored, no intent,
failed marker reported as released, unreadable record as free, no retry after losing
the race) were all killed; one survived at first (former layout) and a test was added.
Real Nest/PG17 integration: two OS processes raced one plan, one dispatch (exit 2), the
other blocked (exit 3), 1 embedding + 1 generation SDK call, 2 persisted provider calls,
1 receipt, one intent, `lock.1` + `release.1`; clean tree `d09dfbb` (dirty=false):
`artifacts/f09b-http-integration-eb4025aa-9fda-4216-9685-bcdfc6e8fb12`.

Gates on a tree identical to `d09dfbb` (no file changed after they started): typecheck,
build and format exit 0; `npm test` exit 0 with 457 API Vitest + 1,100 API Node + 544
Web = 2,101 (2,094 before); guarded full `npm run test:database` exit 0, 479/479 in 46
files on an owned PG17. The HTTP/Nest/PG17 integration was also run on its own. Only
`examate-f09b12-pg17-20261022` and its volume were removed; F09-A.1 resources and SOP
containers were untouched.

Limits: the reservation is local to one machine and filesystem (exclusive create on a
network share is not assumed; another host's record is never taken over); only
Windows/NTFS was exercised; no directory fsync on Windows; a crash between creating a
record and writing it leaves an unreadable record that refuses the plan until an
operator repairs it; a live holder pid only prevents two runners, it is not proof that
a provider request stopped; the plan directory grows by a few small files per run and
nothing is pruned. No live model, real account, cloud, browser, human review or F09-B.2
work; `LIVE_EVALUATION_PENDING` and `SEMANTIC_REVIEW_PENDING` remain.

## F09-B.1.1 — atomic plan reservation and cut-off response bodies (22/10/2026)

Base `baab703` (F09-B.1 code `6eafdeb`); source commit `7814f7d`. Two review
findings in the HTTP evaluation adapter, both reproduced first (reviewer oracle
0/3, then my own suite).

Finding A, root cause: the ledger was listed once before Auth/preflight and every
run later wrote its own `<plan>.<runId>.json`, so two runs of one approved plan both
saw an empty ledger and both dispatched; a sequential rerun guard proved nothing
about concurrency. Fix (`rag-evaluation-http-ledger.mjs`, existing filesystem only,
no dependency): `<ledger>/<planSha256>/active.json` is created with exclusive `wx`,
so one run holds a plan across processes; under that reservation the history is read
again and the acknowledgement checked, and `<runId>.intent.json` is written and
synced before the first POST; an outcome file follows. Dry run and preflight never
touch it, and a run blocked before dispatch (provenance, Auth, scope) takes nothing.
Policy: before dispatch a refused or failed attempt removes only its own reservation
and leaves no history; while a run is active its reservation is held and even an
acknowledged rerun is refused while the holder process is alive; a run whose every
response was fully received records `completed` and releases it; a crash or an
outcome unknown after dispatch keeps the reservation (no lease, no timeout, no
clearing) until a rerun names that run with `--rerun-acknowledged`, and a run that
never finished may be taken over only if its holder is provably gone (same host, pid
not alive); the old reservation moves to `superseded-*` and its intent stays. Every
earlier run must be acknowledged for a rerun, so one acknowledgement cannot start two
reruns. Takeovers are serialised by a second exclusive file. Only the owner can
release, and a superseded owner's late finish touches nothing. Any read or write
error refuses the dispatch (only a missing directory means "no history"). Entries
written by F09-B.1 in the flat layout still count as history.

Finding B, root cause: `response.text().catch(() => "")` made a body that was cut,
reset or never finished look like an empty body, so a 200 with a half body carried no
blocking reason and the next generation was sent; the deadline was only the abort
signal passed to fetch. Fix (`rag-evaluation-http-lib.mjs`): one deadline is raced
against both the connection and the whole body (it holds even if the body ignores the
signal); a failure before the response or while reading the body throws
`NETWORK_OR_TIMEOUT` tagged `before_response`/`response_body`; the runner records
`outcome: unknown_after_dispatch` with `transportPhase`, stops, and leaves the rest
NOT_ATTEMPTED with no retry and no re-login; a body that arrived completely but is not
JSON is `bodyStatus: invalid_json`, a contract FAIL on a known answer, and the run
continues. A session cookie sent with login headers is remembered so it is closed even
if the body never arrives; Auth, readiness and logout body failures fail that stage
safely. No raw response, header or cookie enters an error or report. A runner
exception after dispatch is an unknown outcome and keeps the reservation.

Evidence: reviewer oracle 0/3 RED then 3/3. RED of the new suite: with the ledger
module stubbed, 14 of the 15 tests that ran failed (a control for different plans
passed), a body that ignores the abort signal hung until cancelled, and 5 runner and
preflight body tests failed. GREEN: 23/23 new tests (concurrent runs in one process,
two independent processes, a real SIGKILL crash, unknown outcome, owner-only release,
history recheck, ledger faults, loopback servers cutting the body after valid headers
or never finishing it, malformed but complete JSON, Auth-stage body cuts, sequential
reruns and a normal run as positive controls) and the earlier transport suite 55/55.
16 mutations of the ledger and transport were applied: 13 were killed at once, two
survived (history not rechecked under ownership, a runner exception recorded as
completed) and one pattern did not apply; I added a deterministic recheck test and a
`deps.runCases` seam with an exception test, repaired the pattern, and all 16 are now
killed. On the real Nest/PG17 stack two separate OS processes raced one plan: one
dispatch (exit 2), the other blocked (exit 3), exactly 1 embedding + 1 generation SDK
call, 2 persisted provider calls, 1 receipt and 1 execution intent, reservation
released. The earlier F09-B.1 integration steps still pass; clean tree `7814f7d`
(dirty=false): `artifacts/f09b-http-integration-cdd7b486-7b4c-437b-b476-3fd8ef68ef6c`.

Gates on a tree identical to `7814f7d` (no file changed after they started): typecheck,
build, format exit 0; `npm test` exit 0 with 457 API Vitest + 1,093 API Node + 544 Web
= 2,094 (2,071 before); guarded `npm run test:database` exit 0, 479/479 in 46 files on
an owned PG17. Shared runner and F09-A fixture were not changed. Only
`examate-f09b11-pg17-20261022` and its volume were removed; F09-A.1 resources and SOP
containers were untouched.

Limits: the reservation is local to one machine and filesystem (another host's
reservation is never taken over; a network share is not assumed to give exclusive
create); no directory fsync is done on Windows; a live holder pid only prevents two
runners, it is not proof that a provider request stopped; a crash during the short
takeover leaves `takeover.json`, which keeps the plan closed until an operator removes
it. Exclusive-create behaviour was exercised on Windows only. No live model, real
account, cloud, browser, human review or F09-B.2 work; `LIVE_EVALUATION_PENDING` and
`SEMANTIC_REVIEW_PENDING` remain.

## F09-B.1 — authenticated HTTP evaluation transport and readiness (22/10/2026)

Base `7e64f41`; source commit `6eafdeb`. `evaluate-rag.mjs --http-evaluation`
reaches the public API through the existing session, CSRF and Origin contract, so
the server decides principal, workspace and role. It is a separate mode: the legacy
`--execute`/`--transport http` path still ends at `createLiveHarness` with
`LIVE_EVALUATION_AUTH_REQUIRED`, and the new mode rejects `--transport`,
`--max-provider-calls` and `--offline`. No maintenance pool, service key, debug
route or principal override exists; `--user-id`, `--workspace-id`, `--role`,
`--email`, `--password`, `--token`, `--cookie` and any other unknown flag are
rejected without echoing the value. First scope is live document-question RAG of
the frozen v3 manifest: E01, E03, E04, E05, E06, E07, E15, E16. Summary, course and
Study Coach cases are out of scope.

Transport: loopback `127.0.0.1`/`localhost`/`[::1]` only, path `/api`, no userinfo,
query or hash, validated before any credential is read; the Origin sent must equal
the server's configured origin and be loopback. Cookies live in memory and go only
to the validated base; request paths are fixed in code (never taken from a
response); redirects are refused (`redirect: manual`); nothing is retried and a
session is never silently re-established. Credentials are one JSON object on stdin
(`{"email","password"}`, at most 4 KiB, refused on a terminal); no argv, URL,
environment, `.env`, browser cookie or clipboard source. Tests inject the source.

Modes: dry run validates and prints an approvable `planSha256` (no secret, no
network); `--preflight --credentials-stdin` logs in, reads configuration and
`GET /documents/:id`, sends no generation, index or upload, and logs out;
`--execute --credentials-stdin --approve-plan <hash>` is a separate opt-in that
needs that exact hash and `qualityExecutionReady`. A plan that already began
generating is refused unless `--rerun-acknowledged <runId>` names every prior run
(ledger entry written before the first generation). Preflight conditions are
reported separately: target, authSession, membership (role only, no user or
workspace ID), documentScope (name, stored/ready, page count: metadata only),
assistantStatus (configuration only), corpusProvenance and admissionReadiness.
HTTP cannot show PDF bytes, index content or server admission, so the last two are
`unverified`; that makes `qualityExecutionReady=false` and the CLI's execute ends
BLOCKED `CORPUS_PROVENANCE_UNVERIFIED` with zero generation requests. Only an
injected verifier (the test fixture's own maintenance path) can satisfy it.
`transportReady` is not readiness; `complete` also needs admission and stays false.

Execution: one POST per case with CSRF and Origin; every blocking outcome ends the
run (`runCases` gained an optional `stopOn`; its default is unchanged), a timeout is
recorded as `unknown_after_dispatch` and is never resent, 401/403/429 never trigger
a re-login. The client request cap (`maxRequests`, 10) is not a provider cap:
`maxProviderCalls`/`actualProviderBudget` are the string `unknown` and the
`telemetry` block says retrieval trace `unavailable` and provider calls, usage and
cost `unobserved`. Structural/citation checks of F09-A.3 apply; with no trace and
no chunk verification a case is at best REVIEW_REQUIRED, never PASS without a
human review. Reports use schema 3 (`http_dry_run`, `http_preflight`,
`http_execute`), checkpoints per case (`wx`) and refuse an existing directory.

Evidence (this session, not history): the transport suite runs a loopback stand-in
(55 tests), the integration test uses the real Nest guard/session/CSRF, separate
non-owner NOBYPASSRLS business and Auth LOGINs, PG17 RLS, retrieval, admission,
telemetry and receipts, with only Auth upstream, SDK and Storage synthetic. It shows
a manager and a viewer pass preflight; another workspace gets
`DOCUMENT_NOT_FOUND_IN_SCOPE` for every document; a revoked membership gives
`WORKSPACE_ACCESS_DENIED`; an expired session `AUTH_INVALID`; a wrong Origin
`CSRF_INVALID`; forged `workspaceId`/`userId`/`role`/`principal` fields return 400
with no provider call; preflight and blocked execute leave SDK, usage and receipt
counters unchanged; a verified execute of E01/E04/E15 gives three REVIEW_REQUIRED
(exit 2), 3 embedding + 2 generation SDK calls, 5 persisted provider calls and 3
receipts (the server's accounting, which the report does not claim to observe); the
same plan cannot run twice. Clean tree `6eafdeb`, dirty=false:
`artifacts/f09b-http-integration-d0a28420-a813-4119-98ce-4f19b06adeae`.

RED and mutation: the new suite failed to load before the module existed (feature
absent); the shared runner at `HEAD` sent a second request after the first unknown
outcome (2 attempts, 1 expected). The first integration run was already GREEN, so no
integration RED is claimed. 17 mutations of the adapter (non-loopback host,
following redirects, ignoring provenance, no ledger, default stop rule, retrying a
POST, silent re-login, login email in the report, dry-run reading credentials,
preflight generating, unknown budget as zero, page count unchecked, `--role`
accepted, no Origin, membership not required, no plan approval, identity in the
body) were all killed; 3 valid integration mutations (document scope, provenance
gate, ledger) were killed and one badly designed mutant was discarded.

Gates on a tree identical to `6eafdeb` (no file changed after they started):
typecheck, build and format exit 0; `npm test` exit 0 with 457 API Vitest + 1,070
API Node + 544 Web = 2,071 (2,016 before); guarded `npm run test:database` exit 0,
479/479 in 46 files on an owned PG17; legacy evaluation 191/191 including the
fail-closed live tests, and the F09-A integration still 33 PASS/2 SKIP after the
fixture gained `httpTarget` helpers. Only `examate-f09b1-pg17-20261022` and its
volume were removed; F09-A.1 resources and SOP containers were not touched.

Not verified: no live model, real account, cloud, browser or UI; corpus provenance
and admission over real HTTP; human semantic review. The v3 manifest has only 9
live cases, so the planned 20 quality cases need a new frozen manifest (F09-B.2).
`LIVE_EVALUATION_PENDING` and `SEMANTIC_REVIEW_PENDING` stay; F09-B.1 supplies
`F09-B.1_CODE_VERIFIED` and `LOCAL_INTEGRATION_VERIFIED` for the transport only.
Whole F09 is not complete.

## F09-A.3 — one citation contract for runtime and evaluator (22/10/2026)

Base `d614fea` (F09-A.2 code `c487362`); source commit `d97c55d`. Closes the three
P2 findings from the independent F09-A.2 review. The first (refusal) and second
(duplicate returned IDs) were evaluator gaps. The third was a real production
mismatch: `AssistantService.validateCitations` compared the counts of source-like
and valid markers, so `[S[S1]` for source S1 was accepted. Before the fix, public
HTTP returned 200 and SSE ended in `done` with that answer (retained RED log
`artifacts/f09a3-20261022/red-http.log`); this is no longer only a direct call of
a private method. Nothing indicates an Auth or scope bypass.

Final contract, applied by production and evaluator through one pure helper
(`apps/api/src/assistant/source-markers.ts`, which the evaluator imports from
`dist`):

- Grounded (answerable): nonblank text answer; every source-like `[S...]` text is
  judged whole and must be exactly `[S<n>]` (n starts at 1, no leading zero) so
  grouped, empty, zero, leading-zero, descriptive and nested forms fail; at least
  one valid marker; returned source IDs match `S<n>` and are unique, checked on
  the array as returned and not through a Set; the marker ID set equals the
  returned ID set; each citation belongs to the observed evidence. A marker
  repeated in the answer is valid; ordinary brackets such as `(S1)`, `[1]`, `[s1]`
  are not markers.
- Refusal: answerable=false, no citation IDs and no source-like text at all, valid
  or malformed. Both document paths now apply this; before, streaming did and the
  non-stream path rejected only well-formed markers. A refusal that carries one
  is rejected as `unanswerable_with_citations` (HTTP 502/`AI_UPSTREAM`, SSE
  `error`) and a clean refusal stays valid. Intentional behavior change:
  non-stream refusals with a malformed source-like text were previously accepted
  and replaced by the fixed refusal text.
- Machine failures are FAIL, never semantic pending or INCONCLUSIVE; a structurally
  correct citation still says nothing about whether the claim is true.

Evaluator checks added: `refusalMarkerFree`, `citationIdFormat`,
`citationIdsUnique`, dimension `citationIdentity`; `markerConsistency` now also
covers refusals (one F09-A.2 assertion changed from `not_assessed` to `true`
because refusals are now assessed, a stricter contract). The three F09-A.2 marker
checks keep their meaning.

Observed RED: unit spec 5 fail/49; evaluation run 22 fail/191 (two positive
controls failed only because the new checks did not exist yet); HTTP 3 fail/53
(nested marker 200 and SSE `done`; malformed refusal 200); integration failed at
F09A3-R01 against the previous evaluator. The 40-test helper spec is new and had
no prior RED. GREEN: evaluation 191/191, assistant service spec 49/49, helper 40/40,
HTTP/SSE 53/53, both earlier reviewer oracles 4/4, integration 1/1. A 24-row
matrix drives the real parse, validate and refusal path with synthetic provider and
retrieval boundaries for plain and streamed answers, then compares the evaluator on
what production returned (or on what a leak would carry): production, streamed and
evaluator verdicts agree on every row, including nested, duplicate IDs with the
same and with contradictory metadata, and clean, valid-marker, malformed and nested
refusals. Streamed rejections emit only status events. HTTP tests use the real SDK
transport with synthetic responses (502, no answer/citation, no receipt, no leaked
text) plus SSE and malformed-refusal cases. Seven mutations of the helper, service
and evaluator were applied; all were killed (the first P1 attempt did not compile
and was redone).

Report boundary, on real Nest/PG17 observations changing one named field: normal
33 PASS/2 SKIP; nested marker and duplicate returned citations (same or
contradictory metadata) on the 7 grounded observations give 26 PASS/7 FAIL/2 SKIP;
refusal with valid, malformed or nested marker gives 32 PASS/1 FAIL/2 SKIP; the
positive controls (repeated marker, ordinary brackets, clean refusal with brackets)
stay 33 PASS. Each FAIL names the failed machine check; evidence, receipt,
telemetry and measurements are deep-equal and 37 SDK = 37 persisted calls. The
earlier three-output negative stays 30 PASS/3 FAIL/2 SKIP. Clean tree at
`d97c55d` (dirty=false): `artifacts/f09a-integration-e3ba65ef-d488-4c91-ac86-592dff2d8371`,
`citation-contract-mutation-matrix.json` (it extends the F09-A.2 matrix and records
mutation ID, source run ID and field hashes).

Gates (no source file changed after they started; tree clean at commit):
typecheck, build and format exit 0; `npm test` exit 0 with 457 API Vitest + 1,015
API Node + 544 Web = 2,016 (1,923 before); guarded `npm run test:database` exit 0,
478/478 in 45 files on an owned PG17. Logs and exit records:
`artifacts/f09a3-20261022`. Only the owned container
`examate-f09a3-pg17-20261022` and volume `examate-f09a3-data-20261022` were removed
(exit 0); F09-A.1 resources and SOP containers were not touched, so that earlier
RESOURCE_CLEANUP_BLOCKED stays.

Not verified or not changed: no UI/browser acceptance (error text unchanged), live
model evaluation, human semantic review, cloud, Google or Thắng-machine pending.
`conversation-context.ts` and the stream marker filter keep their own source-like
regexes because they sanitize rather than validate. `feedback-validation.ts` caps
IDs at three digits while parsing accepts any `S<n>`; practical source counts are
small and this was not changed. No model, prompt, retrieval, ranking, chunking,
migration, grant, RLS, corpus/gold or dependency changed. F09-B is not started and
whole F09 is not complete.

## F09-A.2 — grounded RAG source-marker consistency (22/10/2026)

Base `704835f`; source commit `c487362`. This fixes an evaluator false PASS, not
a demonstrated production RAG defect. `assessLocalCase` checked a grounded
answer's text, answerability, citation shape and citation membership in
evidence, but never compared the inline `[S<n>]` markers in `answer` with the
returned citations. Independent review changed only the answer of a real
Nest/PG17 observation: no markers, `[S999]` outside the returned set, and a valid
marker beside malformed `[S1, S999]` all still returned PASS.

All seven grounded scenarios now carry three independent machine checks next to
the existing citation-scope check: `markerSyntax` (every source-like `[S...]`
text is exactly `[S<n>]`), `markerPresence` (at least one valid marker) and
`markerCitationSet` (the marker ID set equals the returned citation ID set; not a
count and not only the first marker). Repeated markers, a different order and
ordinary brackets such as `(S1)`, `[1]`, `[s1]` stay valid. Refusals keep their
no-citation contract and get no marker check. A new `markerConsistency` dimension
is true/false/`not_assessed`. A broken marker is a machine FAIL
(`LOCAL_CONTRACT_CHECK_FAILED`), never SEMANTIC_REVIEW_PENDING/INCONCLUSIVE;
whether a cited source supports a claim stays PENDING_HUMAN. Non-text answers
fail safely without throwing. Only `rag-evaluation-local.mjs` changed, plus tests.

Rule source is `AssistantService.validateCitations`. A managed parity test calls
the compiled production method and the evaluator on 14 answers and requires the
same verdict. One deliberate difference was observed by running production:
it compares the counts of source-like and valid markers, so a nested `[S[S1]` is
accepted there, while the evaluator rejects it (stricter, like legacy
`marker_syntax`). Production was not changed; this is an observation for the
team, not a claimed defect fix. Not addressed here: a refusal answer carrying a
marker (production rejects it, the evaluator keeps the F09-A.1 refusal contract)
and duplicate returned citation IDs.

Observed RED before the fix: the 152-test evaluation run had 20 failures (131
existing tests stayed green); negatives failed as `'PASS' !== 'FAIL'`, positives
only because the new dimension did not exist. One new test (non-text answers) was
already green as a regression control. The independent oracle ran 1 pass/3 RED.
Five mutations of the fix were applied: four were caught at once, M5 (counting
malformed text as a referenced marker) survived, so a 22nd test was added and
then killed it. GREEN: 153/153 evaluation tests (131 earlier + 22 new), oracle
4/4. Two first-draft test-helper defects (missing gold fact IDs, page 0 for an
out-of-evidence source) were fixed in the tests, not in assertions or the evaluator.

Runtime evidence on an owned disposable PG17 (`examate-f09a2-pg17-20261022`,
volume `examate-f09a2-data-20261022`, label `examate.owner=f09a2-20261022`):
integration 1/1; normal 33 PASS/2 reference SKIP; the F09-A.1 three-output
negative still 30 PASS/3 FAIL/2 SKIP. A new `marker-mutation-matrix.json` changes
only `reviewOutput.answer` of the 7 real grounded observations: removing all
markers, `[S999]`, and valid-plus-malformed each give 26 PASS/7 FAIL/2 SKIP, while
repeating a valid marker or adding ordinary brackets keep 33 PASS/0 FAIL. Evidence,
receipt, telemetry and measurements are deep-equal to the source run; 37 SDK = 37
persisted calls. With the previous evaluator the same test fails (M01 expects 7
FAIL, observes 0). Clean-tree run at `c487362` (dirty=false):
`artifacts/f09a-integration-f9bf239b-d105-41e2-b607-78d28dd39e12`; the matrix
records mutation ID, source run ID and per-case source/mutated answer hashes.

Gates ran on a working tree whose patch hash equals commit `c487362`: typecheck,
build and format exit 0; `npm test` exit 0 with 405 API Vitest + 974 API Node +
544 Web = 1,923 (1,901 + 22), fail/skip/cancelled 0; guarded `npm run
test:database` exit 0, 478/478 across 45 files on the owned PG17. The 478 count
is the full suite (the focused integration test is one of its files). Logs and
exit records: `artifacts/f09a2-20261022`. Only the owned container and volume were
removed after the run (exit 0); the F09-A.1 container/volume/credential file and
SOP containers were not touched, so the earlier RESOURCE_CLEANUP_BLOCKED stays.
No UI changed and no browser acceptance, live evaluation, human semantic review,
cloud, Google or Thắng-machine pending state moved. F09-B is not started and
whole F09 is not complete.

## F09-A.1 — required-output evaluator fix (22/10/2026)

Source `89d7276` fixes an evaluator false PASS, not a demonstrated production
RAG/Quiz/Flashcards defect. `assessLocalCase` previously selected checks by
fields that happened to exist, so absent output skipped content validation and
HTTP success could stand in for structural correctness. Scenario-owned contracts
now require grounded RAG, explicit no-evidence refusal, Quiz or Flashcards as
appropriate. Expected errors and non-content Auth/capability/admission/workspace/
read-save-practice cases do not acquire a generated-content requirement.

RAG checks typed nonblank answer, answerability, citation shape/scope, receipt
and gold evidence independently. Quiz/Flashcards reuse the pure production
validators on the observed payload (the frozen fixture requests three items in
English); the opposite artifact cannot substitute. Malformed/missing output
returns FAIL / LOCAL_CONTRACT_CHECK_FAILED with false machine checks, retaining
provider/usage observations. Non-content structural dimension is not_assessed,
never HTTP success. Semantic dimensions remain pending human review.

Observed RED: managed regressions 24 pass/54 fail (78 total), independent review
oracle 0/3 pass, and real Nest/PG17 negative report had 0 FAIL instead of 3 after
only three outputs were removed. GREEN: 78/78 new regressions, 131/131 full
evaluation self-tests, review oracle 3/3, runtime integration 1/1. Normal runtime
report stays 33 contract PASS/2 reference SKIP; derived negative report is
30 PASS/3 FAIL/2 SKIP with identical 37 SDK/persisted calls and measurements.
All logs are retained in `artifacts/f09a1-20261022`; final gate results are in
FINAL-DEMO-CHECKLIST. No corpus/gold/manifest, production service, migration,
grant, RLS, model or prompt changed. Previous reports remain historical bytes;
they are not regraded. Live, human semantic and previous browser pending states
remain unchanged; this fix does not start F09-B.

F09-A.1_CODE_VERIFIED: all five gates ran sequentially on `89d7276`, exit 0.
Full application tests passed 405 API Vitest + 952 API Node + 544 Web = 1,901;
PG17 passed 478/478 across 45 files, fail/skip/cancelled 0. Build retains the
existing >500 kB chunk advisory. Logs, command/revision/exit records and summed
DB counts are at `artifacts/f09a1-20261022/gates-89d7276`. No new UI/browser or
semantic acceptance is claimed; later docs-only commits leave this source intact.

Clean-tree integration at `77419b9` is retained in
`artifacts/f09a-integration-eec4c0a3-9410-48a0-8366-ffffc29d26ec` (normal 33
PASS/2 reference SKIP; negative 30 PASS/3 FAIL/2 SKIP; identical 37/37 calls).
Cleanup was rejected before execution by automatic policy review, reason only
"blocked by policy"; no alternate deletion was attempted. Read-only checks
confirm container `examate-f09a1-pg17-20261022`, exclusive volume
`examate-f09a1-data-20261022`, and ignored disposable credential file
`artifacts/f09a1-20261022/runtime-target.json` remain. Labels on container/volume:
task F09-A.1, repo Final-Project-integration-20261018, created 2026-10-22.
RESOURCE_CLEANUP_BLOCKED is separate from code verification; preserve other
stacks and do not infer approval to bypass policy from this checkpoint.

## F09-A — authenticated evaluation foundation (21–22/10/2026)

Source checkpoint `97f8f82` adds `evaluate-rag --local-integration`, reusing the
existing v3 summary/status/corpus machinery and test-owned disposable DB/Auth
patterns. It accepts no principal/workspace/base URL, never loads live runtime
configuration, and retains the old live AUTH_REQUIRED blocker. HTTP uses the
actual Nest guards/session/CSRF, membership, non-owner business/Auth LOGINs,
RLS, retrieval, wrappers, admission, receipts, Study Coach and telemetry. Only
Auth upstream, SDK and Storage boundaries are synthetic. Maintenance seeds
frozen pages and observes/asserts metadata; it does not answer runtime requests.
No runtime endpoint, schema, migration, grant, prompt/model or RAG algorithm
changed. Implementation checklist: provenance/binding → authenticated adapter
→ fixed manifest cases → retained reports/human pack → automated gates/docs.

The original manifest v3/E01–E24 and rag-eval-v2 PDFs/facts are unchanged. New
schema-4 manifests preserve local-v1 and default to local-v2. V1 retained its
protocol-oracle failure: F09A-005 expected 400 for foreign document access;
source already correctly returns 404 DOCUMENT_NOT_FOUND. V2 introduces
F09A-105 and pins its predecessor hash; no semantic facts/expected changed.
All initial failed/blocked reports remain under ignored `artifacts/f09a-*`.
Early fixture defects (shared login-email rate bucket, invalid ACL column,
processing-state setup, one syntax edit and inferred parameter type) are test
infrastructure corrections, not product/semantic findings.

Clean-source run `396385d1-bc5e-4ba5-8f1d-a15edc3a6cbb`, stored at
`artifacts/f09a-source-97f8f82`, executed 33 local contract scenarios: 33 PASS,
0 FAIL/BLOCKED/NOT_ATTEMPTED, 2 references SKIP. Four batches used 9/20/6/2
synthetic SDK calls, matching 37 persisted calls. The live-quality denominator
is zero. Eleven review templates bind output/evidence/source pages to the run,
report, manifest and corpus, with reviewer/decision blank. Local-v1's last run
retains 32 contract PASS/1 FAIL/2 SKIP; it is not regraded as v2. A live-readiness
probe exited 3, one NOT_ATTEMPTED, LIVE_EVALUATION_AUTH_REQUIRED, zero paid work.

RED→GREEN: the missing-target local CLI initially returned unsupported-mode
exit 1 instead of explicit BLOCKED/3; the new guarded mode passes. A source-page
tamper in a review pack initially escaped binding, then was rejected after
binding exact source/evidence/expected fields. Focused evaluation self-tests
pass 53/53 and the separate Nest/PG17 integration test passes 1/1; their counts
are not 54 live quality cases. A further RED→GREEN at `266c41a` fixes source
hash compatibility with Git LF/CRLF checkouts, while preserving exact per-run
report/response binding and rejection of other source changes. A missing token
sample now remains null, while an observed zero remains decimal string "0";
the regression was RED before `8dc5b06`. At `6c32842`, the injection scenario
sends the codename question matching its frozen expected fact and asserts that
exact question in actual SDK input. Its previous question mismatch was observed
RED (including subsequent conservative admission denials), then GREEN through
Nest/PG17. Human templates now include the synthetic question, excluding the
private sentinel. No expected fact/gold changed. Full final gate counts are in
FINAL-DEMO-CHECKLIST.

Final code checkpoint `6c32842` passed all five gates sequentially: typecheck,
test (405 API Vitest + 874 API Node + 544 Web = 1,823), build, format, and PG17
database (478/478 across 45 files), all exit 0, fail/skip/cancelled 0. Logs and
revision/exit records are at `artifacts/f09a-gates-6c32842`; the integrated run
again has 33 contract PASS/2 reference SKIP. Later docs-only commits preserve
this source. The Vite >500 kB chunk advisory remains.

Readiness statuses are distinct: F09-A_CODE_VERIFIED,
LOCAL_INTEGRATION_VERIFIED (synthetic runtime contracts only),
LIVE_EVALUATION_BLOCKED, SEMANTIC_REVIEW_PENDING. No UI changed; no browser tool
is exposed, and pending F05/F06/F08 browser acceptance is not advanced. F09 still
needs authenticated, authorized live-model execution under approved separate
setup, at least twenty quality cases across explicitly bound batches, and named
human review against unchanged gold. See evaluation-plan for commands/limits.

## F08-B — Flashcards implementation checklist and contract

F08-B adds private, evidence-grounded flashcard decks alongside F08-A quizzes;
it does not change quiz contracts. The API namespace is
`/api/study-coach/flashcards`: `POST /generate`, `GET /drafts/:id` for
reconciliation, `POST /drafts/:id/confirm`, `DELETE /drafts/:id`, paginated
`GET /`, `GET /:id`, `DELETE /:id`, `POST /:id/reviews`, and `GET /:id/progress`.
Generation accepts one stored/ready document, language `vi|en`, and 3–10 cards
(default 5); it returns a 15-minute owner-bound preview. Save is an explicit,
idempotent confirm. Reviews use one client-generated UUID key and an exact
card-ID/rating set; same key and payload reconcile to the same server result,
while a changed payload conflicts. Lists use 20 items by default, max 50.
Saved snapshots expire after 90 days by database time; reads do not renew them.

Deck, draft and review ownership is `(verified workspace_id,user_id)` for every
active role allowed to read the source document. Managers do not inherit other
users' private decks. Flashcard content is unavailable to Auth capability.
Source IDs and document/page/chunk metadata are validated and attached by the
server. The learner flips each card, self-rates it as `remembered` or
`needs_review`, and explicitly submits the complete review; counts and progress
are calculated server-side. This is learner self-assessment, not an AI grade or
proof of mastery. Generation is the distinct `study_flashcards` operation with
prompt `study-coach.flashcards` / `flashcards-v1`, at most one retrieval
embedding and one structured generation under existing F04 admission. Reads,
confirm/delete, flips, reviews and progress do not call AI.

Implementation checklist: (1) add migration 024, minimum grants/RLS, versioned
runtime capability, rollback/apply and retention lifecycle; (2) strict
schema/provenance validation, provider-wrapped generation and draft
reconciliation; (3) idempotent explicit save, private list/detail/delete,
flip/self-rating/review/progress; (4) separate Flashcards UI, tests, gates and
evidence. F08-B is a separate local feature; F09 semantic/live evaluation,
browser acceptance where unavailable, cloud rollout and full F08 acceptance
remain separate.

### F08-B local checkpoint — 21/10/2026

Implemented the flashcard flow alongside, not inside, F08-A quiz contracts:
strict generation preview from one authorized stored/ready document, explicit
save with draft-token GET reconciliation, paginated private decks, detail,
delete, flip/self-rating, idempotent review submission and server progress.
Migration 024 is additive; runtime capability is v24, with business-only
column grants and owner/workspace RLS. Draft tokens are hashed at rest and
expire after 15 minutes; immutable saved snapshots expire after 90 days by DB
clock. Bounded retention is explicit maintenance, dry-run by default. The
rollback command is `npm run f08b:rollback-024`; it is dry-run-first, checks
the guarded disposable target, source/ledger/capability/dependencies and uses
`RESTRICT`, while preserving F03/F04 accounting rows.

Generation is operation `study_flashcards`, prompt
`study-coach.flashcards` / `flashcards-v1`, existing retrieval, Gemini
wrappers, telemetry and F04 admission. Its preflight caps work at one retrieval
embedding plus one generation. No review, read, save, delete or progress action
calls AI. Auth upstream and SDK transport were synthetic in tests; Nest,
PostgreSQL 17, business/Auth LOGIN roles, RLS, capability checks, admission,
telemetry and SQL were real. The integration fixture verified owner isolation,
all supported self-ratings, same-key replay/conflict, lost response after
commit, admission denial before provider dispatch, F06 operation recognition,
and migration 024 rollback/reapply/retention.

Source verification: `npm run typecheck` exit 0; `npm test` exit 0 with API
Vitest 405/405, API Node 858/858, Web Vitest 515/515 (1,778 total);
`npm run build` exit 0 (Vite reports a >500 kB chunk advisory);
`npm run format:check` exit 0; guarded PostgreSQL 17 `npm run test:database`
exit 0, 477/477 across 44 serial suites. The test work also updated old migration-count fixtures to
recognize the current 024 chain without changing migrations 001–023.

Status: `F08-B_CODE_VERIFIED`; `BROWSER_ACCEPTANCE_PENDING` because no browser
automation capability was exposed in the implementation session; and
`SEMANTIC_REVIEW_PENDING`. Synthetic schema/provenance checks do not establish
educational correctness. A human reviewer should assess the synthetic sample
in FINAL-DEMO-CHECKLIST before any semantic-quality claim. Flashcards do not
complete all F08, and F09 has not started. Cloud rollout, Google live and
Thắng's machine remain unchanged/pending.

### F08-B.1 — Confirm/cancel rejection recovery (21/10/2026)

On baseline `c718e62`, definite confirm/cancel errors set `saveState=error`
but the only error display was inside the preview, which no longer rendered.
Two new managed regressions reproduced this: both 409 cases failed because no
`role=alert` existed. Error/status/reconciliation now render independently of
preview content and are scoped to the draft principal. Safe messages distinguish
expired/unavailable drafts, changed/not-ready sources, access errors, other
definite rejections and unknown transport outcomes. A previous success notice
is cleared before confirm, cancel or reconciliation.

Definite errors keep their draft identity/token for an explicit GET; writes
remain disabled until that GET returns `draft`, then require a separate click.
Confirmed results are accepted without replay; terminal results remain visible
after preview removal; failed GET retains unknown and locks writes. Creating a
replacement preview is explicit and warns about a possible new AI operation.
Existing action-token, epoch/principal and unknown-review guards remain intact.
No backend, SQL, migration, grants, quota or quiz contract changed. Browser and
semantic-review statuses remain pending; HTTP/React evidence is not browser
acceptance. Verification commands/counts are recorded in FINAL-DEMO-CHECKLIST.
New gates all exit 0: typecheck, `npm test` (API Vitest 405, API Node 858,
Web 544; 1,807 pass, fail/skip/cancelled 0), build and format. Focused tests
pass 55/55; the independent full Web run passes 544/544. Status is
`F08-B.1_CODE_VERIFIED + BROWSER_ACCEPTANCE_PENDING + SEMANTIC_REVIEW_PENDING`.

## F08-A — Study Coach quiz contract and implementation checkpoint

F08-A is limited to one grounded quiz flow from a stored/ready document. It
does not include flashcards, F09 evaluation, automatic re-index/OCR, web search,
or writes to Tasks/Study plans/Exams. The existing F07.2 local review evidence
is historical and remains separate from new F08-A verification.

The additive API is `POST /api/study-coach/quizzes/generate`,
`POST /api/study-coach/quizzes/drafts/:draftId/confirm`,
`GET /api/study-coach/quizzes/drafts/:draftId` for save reconciliation,
`GET /api/study-coach/quizzes`, `GET /api/study-coach/quizzes/:id`,
`DELETE /api/study-coach/quizzes/:id`,
`POST /api/study-coach/quizzes/:id/attempts`, and
`GET /api/study-coach/quizzes/:id/progress`. Lists default to 20 and cap at
50. Generation defaults to five questions and accepts 3–10, with language
`vi` or `en`; a generated preview is never persisted as a quiz until explicit
confirmation. Structured output schema version `study-quiz-v1` requires four
distinct options, a valid answer index, an explanation, and one or more source
IDs from that generation's retrieved evidence. All question IDs and source
metadata are assigned/verified by the server. Quiz creation is grounded in
retrieval for one stored/ready document and does not claim full-PDF coverage.

Draft tokens are server-issued, held only in client memory, bound to the
verified workspace/user and stored as hashes. Drafts expire after 15 minutes
using database time. Confirm is idempotent by draft ID and leaves a tombstone;
after quiz deletion the same confirmation cannot recreate the deleted quiz.
An ambiguous confirm is reconciled by the draft GET before any later write.
Saved quizzes are immutable snapshots, private to their verified
`(workspace_id,user_id)`, and expire 90 days after save without GET renewal.
Current membership and document scope/status are rechecked after generation
and before saving the draft. Source records retain document/page/chunk
provenance, not extracted PDF text; a source that later disappears is marked
unavailable and PDF access still uses the existing authorization and fresh
signed-URL flow. Managers do not inherit access to another user's quiz.

All active workspace roles that may read a document (manager/member/viewer)
may create and use their own quizzes; no role may read another owner's quiz.
Practice submission accepts only question IDs and selected option indexes.
The server grades from the immutable saved snapshot and stores attempts under
the quiz owner. A UUID attempt key makes retries idempotent; the same key with
different answers conflicts. Grading/progress/list/detail/confirm/delete do
not invoke AI or consume an AI operation. No client score is accepted.

Generation is the distinct `study_quiz` operation with prompt
`study-coach.quiz` version `quiz-v1`, F04 admission reservation for at most two
provider attempts (one retrieval embedding and one structured generation),
and the existing usage/provider wrappers. No automatic repair/retry is added.
Missing evidence rejects before generation. Mechanically valid JSON and
citations do not prove semantic correctness; human review is required and F09
quality evaluation remains pending. Quiz content is never copied into
telemetry/logs. The private quiz tables use a new migration and minimum
business-runtime grants/RLS; Auth receives no quiz-content capability. The
rollback dry-run reports quiz/draft/attempt data loss and uses RESTRICT.

Implementation checklist: (1) schema, RLS, runtime capability v23, migration
apply/rollback/reapply; (2) strict structured generation, evidence validation,
F03 telemetry/F04 admission; (3) owner-scoped confirm/list/detail/delete and
idempotent server grading/progress; (4) dedicated UI, regression and local
verification. F08-A source, API/DB integration, automated tests and gates are
verified in this checkpoint; browser acceptance and human semantic-quality
review remain pending. Flashcards have a separate F08-B implementation
checkpoint above; F09 is not implemented and full F08 acceptance remains
pending. See the separate F08-A/F08-B evidence in FINAL-DEMO-CHECKLIST.

Source-final gates on 21/10/2026: typecheck, build and format exited 0;
`npm test` passed 1,741/1,741 (API Vitest 393, API Node 857, Web Vitest 491);
guarded PostgreSQL 17 `test:database` passed 474/474 across 42 serial suites.
The Study Coach HTTP/DB test uses Nest, active-membership checks, RLS and
separate non-owner/NOBYPASSRLS business/Auth LOGIN roles; Auth upstream and
provider SDK transports are synthetic. No browser capability was available,
so these automated results are not browser acceptance. No cloud or live AI
provider was used.

## F08-A.1 — Recovery and progress correction checkpoint (21/10/2026)

The frontend now preserves one attempt identity and its exact answer payload
after an unknown submission outcome. The retry is the same idempotent POST;
the user cannot abandon an unknown attempt, switch quiz, or edit answers to
create a new key until the outcome is resolved. Save-confirmation unknowns
block confirm/cancel handlers and controls until the owner-scoped draft GET
reconciles them. A confirmed result is accepted without another write; a draft
enables a separate explicit confirm; failed GET keeps writes locked; expired,
cancelled, or deleted drafts show an accessible recovery message without
regeneration.

Quiz detail now selects its title and owner-scoped attempt aggregate in SQL.
List, detail, and progress use the same server values, including valid zero
scores. A submitted result carries current progress so the open practice view
updates from the server; the UI also reloads the quiz list. Document search
uses the debounced query, resets to page 1, exposes one-character guidance and
read errors, and aborts/ignores stale query, principal, and unmounted-view
responses. Search and recovery are reads and do not generate a quiz.

RED evidence on the pre-fix code: the focused UI regressions failed for the
unknown attempt/confirm states and the document query never reached the API;
the PG17 HTTP detail regression received an undefined title. GREEN on the final
source: StudyCoachPanel focused tests 11/11 and Study Coach Nest/PG17 database
integration 1/1. The database test uses the real API with separate business and
Auth LOGIN roles (non-owner, NOBYPASSRLS); Auth upstream and provider SDK
transports are synthetic. Its lost-ACK case commits through real Nest/PG17,
discards the acknowledgement in the harness, retries the same key/payload,
and asserts exactly one attempt row. Save, read, retry, grading, and progress
do not add provider calls.

New final gates on 21/10/2026: typecheck, build, and format exit 0; `npm test`
passes API Vitest 393, API Node 857, and Web Vitest 500 (1,750 total), with no
failures, skips, or cancellations; guarded PostgreSQL 17 `npm run
test:database` passes 474/474 with no failures, skips, or cancellations. No
browser automation is exposed in this session, so F08-A.1 browser acceptance
remains pending. At the historical F08-A.1 checkpoint flashcards and F09 were
pending; see the separate F08-B implementation checkpoint above. Semantic
review and all cloud/live acceptance remain pending.

## F08-A.2 — creation/practice lifecycle coordination (21/10/2026)

Quiz generation, confirmation/reconciliation/cancellation, deletion, and attempt
submission now share one tokenized lifecycle lock. Both handlers and controls
block quiz creation/save while an attempt is prepared, sending, or unresolved;
practice submission is also blocked while another lifecycle operation is in
flight. Keeping the prepared attempt in this guard prevents a pre-existing
preview from replacing its quiz/key/answer payload. A late completion can
release only the exact lock token it acquired. Principal/reset/unmount cleanup
invalidates old tokens and the existing epoch guards discard stale responses.
Successful quiz confirmation no longer clears an already open practice detail.
Successful attempt retry still uses the same quiz ID, attempt key and payload,
then applies the server's progress to the open detail and list.

RED on the pre-fix source: the valid focused regression run had 4 failures and
11 passes. The create button and preview-confirm button were still enabled with
an unknown attempt; the practice check action also remained enabled during
pending generation and confirmation. The first draft of these tests omitted
selecting the document; that fixture error was corrected before recording RED.
GREEN on final source: the focused StudyCoachPanel suite passes 18/18, including
existing-preview/unknown-attempt recovery, same-key retry and progress, delayed
generation/confirmation/attempt, duplicate clicks, principal switch and unmount.

Final web-only verification: `npm run typecheck`, `npm test`, `npm run build`,
and `npm run format:check` exit 0. `npm test` passed API Vitest 393, API Node
857, and Web Vitest 507 (1,757 total), with zero failures, skips, or cancellations.
No API/SQL/permission source changed, so the DB gate was not rerun. Browser
automation is not exposed in this session; desktop/mobile F08-A.2 acceptance
remains pending and is not inferred from React tests. At this historical
F08-A.2 checkpoint F08-B was still pending; see the later F08-B checkpoint
above. F09 and cloud/live acceptance remain pending.

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

F07.1 fixes the saved-conversation open failure path in the web client. Open
loading/errors render outside the collapsible history list; transient network,
408/429 and 5xx failures can retry only the scoped transcript GET, while
expired/not-found and authorization failures offer list refresh/new
conversation without exposing server details. List-read retry remains a
separate GET action. Request epochs, abort signals and the captured principal
guard discard stale open results after another target, reset or principal
change. Opening/retrying never sends the draft or invokes AI. See the current
F07.1 test run in FINAL-DEMO-CHECKLIST; browser acceptance remains pending.

F07.1 source verification: `npm run typecheck`, `npm test`, `npm run build`,
and `npm run format:check` all exited 0 on the final code (API Vitest 384/384,
API Node 856/856, Web Vitest 476/476; no failed, skipped or cancelled tests).
The focused Assistant suite passed 27/27. `npm run test:database` was not rerun:
F07.1 changes only web UI/hook/tests/docs and does not touch API, SQL, migration
or permissions, so the prior F07 database evidence remains historical rather
than being presented as a new F07.1 result. Status: code verified; browser
acceptance pending because no browser automation capability was available.

F07.2 fixes two Assistant document-conversation lifecycle gaps. Initial open
and retry now pass their accepted server summary through one selection-apply
helper, so a successful retry restores the saved document without changing
course/workspace scope. A synchronous hook guard blocks every `send` operation
before `syncContext` while an open/retry is in flight or its error remains
unresolved; both document-action buttons also show disabled state. Reset,
principal change, a newer open, list refresh that cancels an in-flight open,
and unmount invalidate the old request; explicit reset or successful open
restores normal actions. Draft text remains untouched. The focused suite was
RED before implementation for the retry selection and action-dispatch cases,
then passed 40/40 after the fix. Final source gates are recorded in
FINAL-DEMO-CHECKLIST. This is frontend-only, so no database gate or DB cleanup
was needed. Browser automation was not exposed in this session; F07.2 browser
acceptance remains pending and React tests are not claimed as browser evidence.

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
- Budget AI (B3) and semantic RAG/live eval qua Auth (B4) remain
  incomplete. F11/PWA was removed from the plan on 22/10/2026, not completed.
  F08-B flashcards have a local code/automated checkpoint, with
  browser and human semantic acceptance pending. `eval:rag` live remains
  BLOCKED before DB/Storage/Gemini.
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
| F07 | N1 lưu bền, mở lại/xóa, retention/quyền; receipt/history/reset/account isolation                                           | Local implementation and automated verification complete; browser acceptance pending. F08-A is a separate partial feature, not part of F07 acceptance             |
| F08 | N2 Study Coach: structured quiz/flashcards, nguồn, preview/xác nhận lưu, luyện tập/tiến độ cá nhân                         | F08-A and F08-B have separate code/automated local checkpoints; browser and human semantic review pending, F09 outstanding, so full F08 remains partial |
| F09 | B4: ít nhất 20 case thực thi có expected, cùng corpus/gold trước/sau, human review/guardrails/fallback/latency/cost        | F09-A has authenticated local runtime contracts and bound readiness reports; live remains AUTH_REQUIRED/BLOCKED and human semantic review pending. Local fixture PASS does not satisfy the live-quality denominator. |
| F10 | Chỉ STT của Thắng: hoàn thiện lỗi, bảo mật/dependency, accuracy/latency và nghiệm thu thực tế khi cần                      | Thu hẹp theo Tài ngày 19/10/2026; giữ implementation STT hiện có, không phát triển TTS, không chuyển ownership                                                   |
| F11 | Đã bỏ khỏi kế hoạch: PWA/install/update/offline shell                                                                      | Tài chốt 22/10/2026; không triển khai mới. Responsive desktop/mobile web và kiểm browser vẫn bắt buộc; không coi F11 đã hoàn thành. |
| F12 | Registry/allowlist nhiều model, lựa chọn kiểm soát, benchmark quality–latency–cost                                         | Pending; đổi embedding/re-index cần quyết định riêng                                                                                                             |
| F13 | Đã bỏ khỏi kế hoạch: WASM PoC                                                                                            | Tài chốt 22/10/2026; không triển khai mới, không coi đã hoàn thành hoặc tự xóa source có sẵn. |
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
