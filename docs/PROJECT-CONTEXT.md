# ExaMate — context hiện tại cho Tài, Thắng và agent

Cập nhật 20/10/2026. Đây là điểm tiếp tục công việc, không phải nhật ký từng lượt.
Git/source và kết quả kiểm mới có ưu tiên hơn checkpoint cũ trong báo cáo.

## Current checkpoint — F04 local implementation (20/10/2026)

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
| F05 | Search/filter/sort/pagination FE–API–DB; Documents trước, scope trước count/pagination, chống stale response               | Pending; chưa có vertical slice được nghiệm thu                                                                                                                  |
| F06 | Dashboard AI cho admin đúng workspace: request/provider calls, token/cost/latency/lỗi/từ chối và filters                   | Pending; đây là yêu cầu usage dashboard, không phải Finances hay billing                                                                                         |
| F07 | N1 lưu bền, mở lại/xóa, retention/quyền; receipt/history/reset/account isolation                                           | Pending persistence; history trong tab/SSE và draft revision đã có, không viết lại                                                                               |
| F08 | N2 Study Coach: structured quiz/flashcards, nguồn, preview/xác nhận lưu, luyện tập/tiến độ cá nhân                         | Pending                                                                                                                                                          |
| F09 | B4: ít nhất 20 case thực thi có expected, cùng corpus/gold trước/sau, human review/guardrails/fallback/latency/cost        | Chưa nghiệm thu semantic/live; live runner còn BLOCKED, principal CLI hay HTTP chưa chốt                                                                         |
| F10 | Chỉ STT của Thắng: hoàn thiện lỗi, bảo mật/dependency, accuracy/latency và nghiệm thu thực tế khi cần                      | Thu hẹp theo Tài ngày 19/10/2026; giữ implementation STT hiện có, không phát triển TTS, không chuyển ownership                                                   |
| F11 | PWA/mobile thật: manifest/install/update/offline shell, Android và giới hạn iOS                                            | Pending; không cache dữ liệu riêng hoặc tự queue write                                                                                                           |
| F12 | Registry/allowlist nhiều model, lựa chọn kiểm soát, benchmark quality–latency–cost                                         | Pending; đổi embedding/re-index cần quyết định riêng                                                                                                             |
| F13 | WASM PoC có profiling/benchmark, cancel/fallback/license; chỉ tích hợp nếu chứng minh lợi ích                              | Nhánh mở rộng, không bắt buộc rubric; tác vụ cụ thể chưa chốt                                                                                                    |
| F14 | Native client tái sử dụng API: OAuth/deep link, secure storage, build/thiết bị                                             | Nhánh mở rộng, không bắt buộc rubric; stack chưa chốt                                                                                                            |
| F15 | Đã bỏ khỏi kế hoạch phát triển: không mở rộng tool-using agent lên 3 tools                                                 | Theo Tài ngày 19/10/2026; chỉ giữ phạm vi 2 tools ban đầu, không tự thêm tool thứ ba hoặc nhận đạt capability B của rubric                                       |
| F16 | Compose E2E/traceability, ít nhất 3 ADR, AI_USAGE, PDF 10–20 trang, slide tối đa 15 trang, video 3–5 phút, live change/Q&A | Pending bộ nộp; hiện có ADR-001, không nhận đã đủ 3 ADR                                                                                                          |

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
