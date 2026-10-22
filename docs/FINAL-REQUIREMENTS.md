# ExaMate — yêu cầu cuối kỳ và traceability

Local là test/fixture synthetic. Live pending cần project/người dùng thật.
Trạng thái không phải lời hứa production-ready.

F09-B.2A adds draft `rag-quality-20261022-v1`: 24 distinct authored objectives,
18 grounded / 6 explicit no-evidence oracles, frozen synthetic fact/page/hash
bindings and a pre-execution Tài–Thắng review pack. Offline checks and proposed
batches are preparation evidence only. Fourteen cases match the existing HTTP
operation shape; ten need course/intersection/summary transport work; no new case
is connected to execute. Zero quality cases executed or human-approved. Existing
v3/F09-A/gold/reports and live guards are unchanged. Gold review, actual runtime
provenance attestation, target/batch/quota approval and response-bound semantic
review remain required; this does not accept capability A/C or whole F09.

| ID  | Story và acceptance                                                                                                       | Source / test để trace                                                                                                                                                                                                 | Trạng thái                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Email/password, reload/refresh/logout; Origin/CSRF sai bị chặn                                                            | auth.service, auth.test, pilot-session-race                                                                                                                                                                            | Implemented/local regression; HTTP thật máy Tài là lịch sử, extended pending                                                                                                                                                             |
| R02 | Google PKCE backend, verified Supabase JWT, opaque cookie; replay/callback cũ không đổi account                           | auth-store, supabase-auth.adapter, oauth tests/browser                                                                                                                                                                 | F01 implemented/local verification; Google live pending                                                                                                                                                                                  |
| R03 | Manager/member/viewer đúng quyền; no-membership không đọc; principal không từ client                                      | auth.guard, migrations 017–018, runtime-capability-contract, runtime-rls.database.test                                                                                                                                 | F02-A local: browser qua Nest + PG17 LOGIN business/Auth non-owner; synthetic Auth adapter, cloud F02-B pending                                                                                                                          |
| R04 | Records giữ scope, ngày giờ, tiền và quyền ghi/xóa                                                                        | Tasks/Courses/Exams/Plans/Expenses, academic suites                                                                                                                                                                    | Implemented/local regression; không thêm CRUD còn thiếu                                                                                                                                                                                  |
| R05 | PDF private, assign/download/inline/delete; Storage ngoài transaction; uncertain outcome không xóa nhầm object            | documents.service, documents context/HTTP/DB suites                                                                                                                                                                    | Implemented/local; signed URL cũ còn tới TTL                                                                                                                                                                                             |
| R06 | Index claim, network ngoài transaction, persist chunks atomic                                                             | ingestion service/context/DB suites; migration 018 re-index policy                                                                                                                                                     | F02-A local: index/re-index và Documents→Assistant đã chạy cùng browser, Nest, PG17 disposable LOGIN non-owner; providers fake, không phải semantic/live acceptance                                                                      |
| R07 | RAG lọc workspace trước provider; positive corpus có evidence/citation                                                    | retrieval/assistant, retrieval HTTP/shared DB suites                                                                                                                                                                   | Implemented/fixed vectors; false-empty lịch sử INCONCLUSIVE, B4 pending                                                                                                                                                                  |
| R08 | Follow-up receipt/hash/scope đúng người; hội thoại cá nhân lưu bền, mở lại/xóa, retention và reset/account isolation      | receipt/history/conversation API + UI, PG17 runtime capability and HTTP tests                                                                                                                                          | F07 local implementation and automated verification complete; F07.1 adds open-failure/retry and stale-principal regressions; F07.2 adds retry document-selection and guarded document-action regressions. Browser acceptance pending. See FINAL-DEMO-CHECKLIST |
| R09 | Own feedback, retry cùng key một row; maintenance export UNREVIEWED                                                       | feedback service/export, receipt-context/feedback-export suites                                                                                                                                                        | Implemented/local; không tự thành gold                                                                                                                                                                                                   |
| R10 | SSE cancel/stale/error không ghép sai hội thoại                                                                           | stream controller/transport/hook, stream/conversation tests                                                                                                                                                            | Implemented/local regression; model/prompt giữ nguyên                                                                                                                                                                                    |
| R11 | STT local theo ngôn ngữ, không tải model âm thầm                                                                          | speech module/media suites                                                                                                                                                                                             | Implementation của Thắng, lịch sử; ngoài F01                                                                                                                                                                                             |
| R12 | AI limits bền vững và runtime role least privilege toàn app                                                               | F02-A migrations 017–019/runtime capability suites; F04 migration 020, admission/runtime integration/database tests                                                                                                    | F04 counts are historical; F04.1 adds permit-wait/error regressions. Current counts: FINAL-DEMO-CHECKLIST. Browser and cloud F02-B pending; telemetry is not the quota ledger                                                            |
| R13 | Search/filter/sort/pagination FE–API–DB for Documents, workspace sidebar, Tasks, Courses, Exams, Study Plans and Expenses | `GET /api/documents/search`, `GET /api/search`, `GET /api/tasks/search`, `GET /api/courses/search`, `GET /api/exams/search`, `GET /api/study-plans/search`, `GET /api/expenses/search`; related FE and Nest/PG17 tests | F05.3.1 focused-record uniqueness and expense chart scaling have new automated regressions; all five module paths have local automated coverage. Browser acceptance remains pending, so whole F05 is partial                             |
| R14 | Admin AI dashboard theo workspace: request/provider calls, token/cost ước tính/latency/lỗi/từ chối, filters               | F03 prompt registry/ai_usage tables; `GET /api/admin/ai-usage`, bounded `/cost-breakdown`, model-filtered provider-call detail, migration 021, `AiUsageDashboard`                                                      | F06.1 bounds totals/cohorts/dates; F06.2 refreshes overview, active cost view and open detail without stale generations. Automated local code verification only; browser acceptance pending. Telemetry best-effort, not billing or quota |
| F08-A | Evidence-grounded quiz from a ready document: preview, explicit save, ownership, reopen, server grading and personal progress | `StudyCoachService`, `StudyCoachPanel`, migration 023, runtime capability v23, Study Coach HTTP/PG17 tests | F08-A.2 lifecycle review remains its own checkpoint; F08-B current full `npm test` also includes quiz regressions (1,778 total suite-wide). Browser acceptance and semantic-quality review pending. See FINAL-DEMO-CHECKLIST. |
| F08-B | Evidence-grounded private flashcards: explicit preview/save, reopen, flip/self-rating, idempotent review and personal progress | `/api/study-coach/flashcards`, `StudyFlashcardsService`/`StudyFlashcardsPanel`, migration 024, runtime capability v24, F03/F04/F06 operation integration and PG17 suites | F08-B.1 adds visible confirm/cancel rejection and explicit GET recovery, with managed RED→GREEN regressions; see current gate evidence in FINAL-DEMO-CHECKLIST. Original PG17 477/477 is historical, not rerun for this frontend-only fix. Browser acceptance and human semantic review pending; F09 and full F08 remain incomplete. |

F09-A traceability: `evaluate-rag --local-integration`,
`rag-evaluation-local[-lib].mjs`, `evaluation-runtime-fixture.mjs`,
`evaluation-runtime.database.test.mjs` and schema-4 manifest local-v2 provide
33 authenticated local runtime contract scenarios plus two unexecuted
references. Frozen semantic facts/pages and historical v3 cases remain intact.
Reports bind Git/run/manifest/corpus/response/source evidence and distinguish
contract correctness from pending semantic review. This does not fulfill the
twenty live quality cases, human review, browser acceptance or all of F09.
At source `6c32842`, fresh five gates exit 0 (1,823 application tests and
478 PG17 tests); F09-A_CODE_VERIFIED and LOCAL_INTEGRATION_VERIFIED describe
this synthetic runtime scope only. Live evaluation and semantic review remain
blocked/pending respectively.
See evaluation-plan and FINAL-DEMO-CHECKLIST for fresh execution evidence.

F09-A.1 closes evaluator false PASS for absent/malformed required response
content. Scenario contracts, production Quiz/Flashcards validators and explicit
RAG/refusal checks replace output-presence-driven checks; HTTP success is not
structural correctness. Managed evaluation regressions and derived negative
runtime reports cover the failure without altering production services/gold.
This is evaluator verification, not live semantic or browser acceptance.
F09-A.1_CODE_VERIFIED at source `89d7276`: five gates exit 0, 1,901 application
tests and 478 PG17 tests, with new evidence in FINAL-DEMO-CHECKLIST. Live and
human review remain blocked/pending; whole F09 is not accepted.

F09-A.2 closes the grounded-RAG marker gap in the same evaluator: inline
`[S<n>]` markers must be well formed, present, and equal as a set to the returned
citations, in addition to citation scope. Production `validateCitations` is the
rule source (a parity test compares verdicts). Marker failures are machine FAIL;
claim support stays human-reviewed. Evidence: `c487362`, 1,923 application tests
and 478 PG17 tests, answer-only mutations of real Nest/PG17 observations in
FINAL-DEMO-CHECKLIST. Live, human, browser and whole-F09 acceptance unchanged.

F09-A.3 makes that rule one shared contract for production and evaluator (pure
`source-markers.ts`): each source-like text is judged whole (nested `[S[S1]`
rejected in production, not only in the evaluator), returned citation IDs are
well formed and unique, and a refusal carries no source-like text on either
document path. Evidence at `d97c55d`: a 24-row production/streamed/evaluator
matrix, HTTP and SSE rejection tests, answer-only mutations of real Nest/PG17
observations, 2,016 application tests and 478 PG17 tests. Live, human, browser
and whole-F09 acceptance unchanged.

F09-B.1 adds the authenticated HTTP transport that a later live evaluation needs:
Auth, CSRF, Origin and membership are enforced by the server, the runner supplies
no identity, and readiness is reported per condition (corpus provenance and server
admission stay unverified over HTTP, which blocks quality execution). Evidence at
`6eafdeb`: 55 transport tests, a real Nest/PG17 integration, 2,071 application and
479 PG17 tests. This is `F09-B.1_CODE_VERIFIED` / `LOCAL_INTEGRATION_VERIFIED` for
the transport only; live evaluation and semantic review remain pending and whole
F09 is not accepted.

F09-B.1.1 closes two review findings in that transport: an approved plan has one
active generation run across processes (atomic reservation, durable intent, crash
and unknown-outcome evidence kept until an operator acknowledges) and a response whose
body was cut off after the headers is an unknown outcome that stops the run. Evidence
at `7814f7d`: 23 new tests including a real two-process race against Nest/PG17,
2,094 application and 479 PG17 tests. Live evaluation and semantic review remain
pending.

F09-B.1.2 corrects an incomplete claim of that checkpoint: a release could still
delete a successor's reservation. The plan ledger is now append-only (records are only
created, ownership passes by creating the next record, markers are addressed to the
writer's own record). Evidence at `d09dfbb`: deterministic-barrier regressions, a
real two-process race against Nest/PG17 with one generation, 2,101 application and 479
PG17 tests. Live evaluation and semantic review remain pending.

F09-B.1.3 fixes the further marker-publication finding: a raw filename is not
proof of a successful marker write. Synced/closed immutable preparations are
published by exclusive hard link; reader verifies marker binding and file identity.
Tracked real-file/crash/fault tests and Nest/PG17 rerun-denial evidence are in
FINAL-DEMO-CHECKLIST. This changes only the filesystem ledger, not runtime Auth,
RLS, admission, retrieval or corpus/gold. Process-crash evidence is not a power-loss
or network-share durability claim; live and semantic evaluation remain pending.
At source `122ca20`, fresh five gates exit 0: 2,142 application tests and 479
PG17 tests. F09-B.1.3_CODE_VERIFIED / LOCAL_INTEGRATION_VERIFIED is scoped to
this fix; no F09-B.2 or live/human semantic acceptance is implied.

Thành viên đọc được tài liệu của workspace; chưa có PDF riêng từng người trong
cùng workspace. Auth PASS không thay RAG/STT PASS. Máy Thắng cần bằng chứng riêng.

## Phạm vi cập nhật theo Tài — 19/10/2026

- F10 trong roadmap chỉ giữ STT của Thắng: hoàn thiện và nghiệm thu khi cần;
  không phát triển TTS. R10 trong bảng trên là SSE, giữ nguyên.
- Bỏ đợt mở rộng F15; chỉ duy trì phạm vi 2 tools ban đầu, không thêm tool thứ ba.
  Không nhận đã có 2 LLM-called tools nếu chưa đối chiếu implementation;
  mode chat/SQL intent không tự thay bằng chứng tool calling.
- Giữ nguyên yêu cầu gốc của thầy: capability B đòi ít nhất 3 tools do LLM gọi.
  Với giới hạn 2 tools, không nhận B đạt rubric. Nhóm hướng đến A (RAG) +
  C (structured output/Study Coach F08), còn phải nghiệm thu riêng; JSON đơn
  thuần không chứng minh C. Không sửa rubric để làm khớp phạm vi đã giảm.

F09-B.2B.1 adds a read-only runtime provenance audit and artifact verifier
(`rag-evaluation-provenance.mjs`): exact Storage bytes, index-vs-production
pipeline comparison, fact placement, exact course sets and a snapshot-consistency
check, verified on a disposable PG17 with synthetic Storage. It is point-in-time
evidence, not approval: gold review, `qualityExecutionReady`, live evaluation and
post-response semantic review are unchanged and pending, and it is not connected
to execute.

F09-B.2B.2 adds a quality-suite dry-run and authenticated preflight (own flags,
planner and report) that consumes the provenance verifier as separate conditions.
It plans 23 of 24 draft cases (RQ23 has no API path) and refuses to execute; it
grants no gold approval, readiness or authorization, and is not a live evaluation or
semantic review.
