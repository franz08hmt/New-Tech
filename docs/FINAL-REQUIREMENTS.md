# ExaMate — yêu cầu cuối kỳ và traceability

## Completion traceability update — 23/10/2026

US-01/session verification: migration 025, `AuthStore`/refresh verifier and capability v25; managed Auth remains owned and protected by Supabase. Runtime receives only private function EXECUTE, not raw Auth rows. Real PG17 regression: `managed-auth-session.database.test.mjs`; valid/wrong-user/expired/missing/pool-reuse, direct SELECT denial, dry-run/rollback/reapply.

Permission acceptance harness: `demo-stack-roles.test.mjs` independently makes outsider login fail 500; harness must fail rather than treating actual status as expected. Print export: `scripts/test_submission_docs.py` checks real report rendering/page count/blank-area fills.

Current real acceptance: cloud managed026, real-service Docker healthy, Google
callback/manager Dashboard and45 HTTP/private Storage checks passed. RAG v2 gold
has AI technical review under delegation; baseline20 real cases reviewed with
15 strict final-answer PASS,3 FAIL,2 injection INCONCLUSIVE. Improved attempted3
(1 PASS,2 provider503),17 not attempted due failure/budget envelope. Full >=20
before/after remains incomplete. Target proof/provenance/budget wrapper were
integrated, not merely planned. See current handoff/results for exact bounds.
F10 STT only; F12/F14 remain out of this campaign, not silently cancelled; no B claim.

Local là test/fixture synthetic. Live pending cần project/người dùng thật.
Trạng thái không phải lời hứa production-ready.

## Ma trận nghiệm thu rubric — một bảng chuẩn (23/10/2026)

Nguồn rubric: Final Project Assignment 2026–2027 (Google Docs, đọc lại 23/10/2026;
mục 3–11). Đây là bảng **duy nhất** để đối chiếu rubric ↔ code ↔ bằng chứng; các bảng
R01–R14/F08 bên dưới là trace chi tiết theo đợt và không bị thay thế.

Năm trạng thái **không** tương đương nhau:

| Mã         | Nghĩa                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `IMPL`     | Đã triển khai trong code.                                                                              |
| `AUTO`     | Đã kiểm tự động local (test/gate; DB là PG17 disposable, Auth/Storage/model là fixture).               |
| `BROWSER`  | Đã chạy trong trình duyệt thật trên stack demo local (23/10/2026). Auth upstream, Storage, model **synthetic**. |
| `LIVE`     | Đã chạy với dịch vụ thật (Supabase/Gemini/Google). Google/Docker/HTTP và baseline20 có evidence mới; không chuyển mọi test UI cũ thành LIVE. |
| `PREP`     | Đã chuẩn bị (tài liệu/mẫu/lệnh), chưa thực hiện.                                                       |
| `BLOCKED`  | Cần đầu vào/quyền/người duyệt từ bên ngoài (xem checklist trong `docs/RUBRIC-READINESS-HANDOFF.md`).  |

Stack demo (`apps/api/test/demo-stack-server.mjs`, `compose.demo-stack.yaml`): Nest + guards,
PDF.js, chunker, ingestion, retrieval, telemetry và admission là **thật**; PG17 disposable với
LOGIN non-owner; **synthetic**: Auth upstream, Storage (loopback), embedding (bag-of-words băm) và
"model" (trích câu từ PDF, cloze quiz). Câu trả lời trong stack này **không phải đầu ra Gemini**
và không chứng minh chất lượng model; dùng nó cho luồng UI, quyền, lỗi và bố cục.

| Điều khoản rubric | Tính năng / luồng | File · endpoint · component | Test / bằng chứng | Trạng thái | Phụ trách | Còn thiếu |
| ----------------- | ----------------- | --------------------------- | ----------------- | ---------- | --------- | --------- |
| 3 Platform + UI hiện đại | Web React/Vite; streaming AI response (general) | `apps/web/src/*`, `assistant-stream.ts`, `use-assistant.ts`, `POST /api/assistant/chat/stream` | `assistant-stream.test.ts`, `assistant.test.tsx`; browser: delta tăng dần 72→120→160 ký tự; qua nginx 40 ms → 4.266 ms (`demo-stack-stream-check.mjs`) | IMPL · AUTO · BROWSER | Tài (UI), Thắng (stream BE/FE theo Git `2249abf`) | Documents/Workspace mode chỉ stream status, không stream token — nói đúng khi demo |
| 3 Backend REST + CRUD | NestJS; tasks (tạo/đọc/đổi trạng thái), exams, study plans, expenses (tạo/đọc/xóa), documents (upload/đọc/gắn môn/xóa), courses (đọc) | `apps/api/src/{tasks,exams,study-plans,expenses,documents,courses}/*.controller.ts` | `academic-context.test.mjs`, `workspace-academic.database.test.mjs`, `documents-http-context.database.test.mjs`; browser: tạo 3 task → đổi status → reload còn nguyên | IMPL · AUTO · BROWSER | Tài | Courses không có tạo/sửa/xóa; task không có xóa — ghi trong limitations |
| 3 JWT | Backend xác minh JWT Supabase (`verify`), trình duyệt chỉ giữ cookie opaque HttpOnly + CSRF/Origin | `auth.service.ts`, `supabase-auth.adapter.ts`, `session-crypto.ts`; ADR-001 | 45 HTTP real-service checks; Google callback/manager Dashboard trên máy Tài | IMPL · AUTO · BROWSER · LIVE | Tài | BFF giữ JWT ở backend; máy Thắng chưa kiểm |
| 3 Data + vector store | PostgreSQL 17 + pgvector (768 chiều), RLS theo workspace | `infra/postgres/migrations/001–024`, `rag-retrieval.service.ts` | PG17 restricted fixture + cloud managed026; runtime contract/TLS/CA; 3 index thật | IMPL · AUTO · LIVE | Tài | Không chạy canonical rollback trên managed ledger; xem MANAGED-DEPLOYMENT |
| 3 Security | Mọi lời gọi LLM qua backend; key không ở frontend/repo | `gemini.service.ts`, `storage.service.ts`; `.env.example` chỉ có tên biến | Quét pattern bí mật trên file tracked và lịch sử Git 23/10/2026: **không có secret thật** (chỉ placeholder `REPLACE_…`, fixture `sb_secret_synthetic…`, URL giả); quét theo pattern, không thay credential scanner đầy đủ | AUTO | Tài | Chưa dùng công cụ quét chuyên dụng (gitleaks…) |
| 3 Login OAuth2 + role | Google PKCE (backend) + email/mật khẩu; vai trò `manager`/`member`/`viewer` (admin≈manager, user≈member) | `auth.controller.ts`, `auth-store.ts`, migration 016–018 | Google PKCE do Tài tự consent, callback/Dashboard; 45 HTTP checks trên Supabase thật | IMPL · AUTO · BROWSER · LIVE | Tài | Máy Thắng chưa nghiệm thu; không auto-membership mọi Google user |
| 3 Realtime | SSE `POST /api/assistant/chat/stream`, hủy/ stale | `assistant.controller.ts` (`X-Accel-Buffering: no`) | `assistant.controller.spec.ts`, `use-assistant`; browser: nút "Dừng trả lời" hủy giữa luồng, bản nháp được giữ, không lưu nửa câu | IMPL · AUTO · BROWSER | Thắng/Tài | — |
| 3 Deployment | Docker Compose: `compose.yaml` (Supabase+Gemini thật), `compose.demo-stack.yaml` (không cần credential) | `compose*.yaml`, `apps/*/Dockerfile`, `infra/nginx/default.conf` | Real Compose project examate-final-live-20261023 healthy tại8080; 45 HTTP checks qua nginx | IMPL · BROWSER · LIVE | Tài | Loopback demo, không public Internet; Gemini generation đang lỗi upstream |
| 4.1 A RAG | Upload PDF → chunk (1.200/1.800/200 ký tự) → embedding 768d → vector search → trả lời + citation → từ chối khi thiếu bằng chứng | `document-chunker.ts`, `ingestion`, `rag-retrieval.service.ts`, `assistant.service.ts`, `source-markers.ts` | 3 PDF index thật, baseline20:15 strictPASS/3FAIL/2INCONCLUSIVE; citation chunk/page tồn tại SQL | IMPL · AUTO · BROWSER · LIVE (partial) | Tài | Improved chỉ3/20 rồi503; chưa có so sánh đủ mẫu hoặc recall/MRR |
| 4.1 C Structured output | Quiz và Flashcards: model trả JSON → `parseStudyQuizOutput`/validator strict → xem trước → xác nhận lưu → luyện tập → chấm ở server → tiến độ | `study-coach/*`, `StudyCoachPanel.tsx`, `StudyFlashcardsPanel.tsx`, migration 023–024 | `study-quiz-validation.spec.ts`, `study-coach*.database.test.mjs`; browser: sinh → preview → lưu → reload còn → làm bài 2/3 = 66,67 % → tiến độ lưu; flashcards 2 nhớ/1 cần ôn lưu | IMPL · AUTO · BROWSER (JSON synthetic) | Tài | Ngữ nghĩa câu hỏi do Gemini thật chưa review (`SEMANTIC_REVIEW_PENDING`) |
| 4.1 B / D / E | Không nhận. Tool calling < 3 (F15 bỏ); STT **không** được tính là D vì chưa có kết quả lưu và dùng bởi app | — | — | không áp dụng | — | Nhóm 2 người cần 2 capability: A + C |
| 4.2 Model choice | Generation `GEMINI_MODEL` (mặc định `gemini-2.5-flash`), embedding `gemini-embedding-001` 768d; STT local Whisper | `config.ts`, `.env.example`, `ASSISTANT-SETUP.md` | ADR-012 model/chunk rationale; Flash baseline20; Flash-Lite probe502, không ghép kết quả | IMPL · PREP · LIVE (observed) | Tài/Thắng | Không chứng minh một model tốt hơn từ probe nhỏ; người học phải hiểu rationale |
| 4.2 Prompt management | Prompt có ID + version trong registry, golden test giữ payload | `apps/api/src/assistant/prompt-registry.ts`, ADR-003 | `prompt-registry.spec.ts`; dashboard hiện prompt id/version | IMPL · AUTO · BROWSER | Tài | — |
| 4.2 Guardrail 1 — injection | Evidence là dữ liệu không tin cậy (JSON, BEGIN/END), citation validator, refusal không mang source | `rag-context.ts`, `source-markers.ts`, `assistant.service.ts` | RQ09/RQ10 trả đúngORCHID/phân loại nội dung; không có exact model-context trace | IMPL · AUTO · LIVE (output only) | Tài | Injection resistance INCONCLUSIVE, không gọi là đã an toàn |
| 4.2 Guardrail 2 — ngoài phạm vi | Retrieval dưới ngưỡng/không có evidence → từ chối cố định, không gọi model | `assistant.service.ts` (`NO_RELEVANT_EVIDENCE`) | `assistant.service.spec.ts`; browser: "Who painted the Mona Lisa…" → "Không tìm thấy bằng chứng phù hợp…" | IMPL · AUTO · BROWSER | Tài | — |
| 4.2 Guardrail 3 — AI lỗi | timeout / quota 429 / 503 / JSON hỏng / rỗng → lỗi rõ + Mã yêu cầu, không replay, giữ bản nháp | `assistant-exception.filter.ts`, `gemini.service.ts`, `provider-lifecycle.ts` | Real503 (Flash) và502 (Lite), safe error/request metadata; không retry; giữ reserve thiếu usage | IMPL · AUTO · BROWSER · LIVE | Tài | Bộ UI lỗi đầy đủ là browser synthetic cũ, không nhận đã quay lại tất cả trên cloud |
| 4.2 Evaluation ≥ 20 case, trước/sau | Suite `rag-quality-20261022-v1` (hash 97b02958…) 24 case, v2 draft (53066af8…); planner, preflight, executor một-batch, ledger | `docs/evaluation-quality-cases-v{1,2}.json`, `scripts/rag-evaluation-quality-*.mjs`, `docs/evaluation-plan.md` | Baseline20 đã AI review; improved3 (1 đạt/2 lỗi503),17 chưa chạy; frozen gold giữ nguyên | LIVE baseline20 · BLOCKED comparison | Agent (theo ủy quyền) | Provider ổn định và ngân sách/envelope hợp lệ trước dispatch tiếp; không cần chữ ký gold |
| 4.2 Logging/cost/latency | Mỗi operation + provider call có prompt id/version, token, latency, outcome, ước tính chi phí (best-effort) | migration 019/021, `ai-usage.service.ts`, `AiUsageDashboard.tsx` | Baseline20:13732 token có usage, operation mean4.583s/p95mẫu5.056s; embedding/error usage thiếu | IMPL · AUTO · BROWSER · LIVE | Tài | Không phải hóa đơn; toàn chiến dịch51 AI calls, upperused/reserved0.618895USD |
| 4.2 Fallback | AI lỗi → các trang non-AI vẫn dùng được, banner rõ | `PilotAccess.tsx`, `use-assistant.ts` | browser: trong lúc quota/timeout, trang Tasks/Documents/Study Coach vẫn dùng được | IMPL · BROWSER | Tài | — |
| 5.1 User stories + traceability | 13 story bên dưới, mỗi story có AC và bảng trace | mục "User stories" | story → endpoint/component → file → test | PREP (tài liệu) | Tài | Thắng đọc/duyệt story của STT và streaming |
| 5.2 Kiến trúc + ADR | Sơ đồ FE/BE/Auth/DB/vector/Storage/LLM/STT + luồng một request AI; ADR-001…011 | `docs/REPORT.md` §3, `docs/DECISIONS.md` | ADR-001/003/009/012/013/014; model/chunk/hosted Auth/managed-profile rationale | PREP | Tài | Không tự xác nhận mỗi thành viên hiểu bài |
| 5.3 AI_USAGE | Nhật ký AI + lỗi do AI | `AI_USAGE.md` (mục "Lỗi code do AI đã phát hiện và sửa") | ≥ 2 lỗi có commit/test: `6207165`, `3a628e6`, `da862cd` | IMPL | Tài | Phần của Thắng (STT/stream) do Thắng bổ sung |
| 5.4 Ownership + Git | Mỗi người sở hữu một module | `git shortlog` | 23/10/2026: 260 commit (Tài) / 5 (Thắng: Homework 4 backend `b4ce829`, Gemini text endpoint `d2ca5ca`, STT `917edc7` + `b988e26`, stream chat `2249abf`) | **BLOCKED (giải thích)** | Thắng | Rubric: người ít commit phải **tự giải thích trong báo cáo** — `docs/REPORT.md` để ô trống cho Thắng |
| 6 CRUD · search/filter/sort/pagination | 6 module có search server-side | `GET /api/{documents,tasks,courses,exams,study-plans,expenses}/search`, `GET /api/search` | `*-search-http.database.test.mjs`; browser: tìm "quiz" → 1 kết quả; lọc trạng thái | IMPL · AUTO · BROWSER (Tasks) | Tài | Các module khác chỉ AUTO |
| 6 File upload làm đầu vào AI | PDF private Storage → index | `documents.controller.ts` | 3 synthetic-corpus PDF uploaded/indexed qua real private Storage/API; signed object download200 | IMPL · AUTO · BROWSER · LIVE | Tài | Corpus là minh họa ASCII; không chứng minh OCR hoặc PDF tiếng Việt có dấu |
| 6 Admin dashboard AI | Manager xem request, token, chi phí, latency, lỗi/từ chối | `GET /api/admin/ai-usage`, `AiUsageDashboard.tsx` | matrix: manager 200, member/viewer 403; browser: bảng như trên | IMPL · AUTO · BROWSER | Tài | — |
| 7 Responsive | Desktop và 375 px | `styles.css`, `AssistantPanel.tsx` | browser 375×812: 10 trang không tràn ngang; assistant là bottom sheet; 375×520: composer cuộn trong form và nút gửi tới được | IMPL · BROWSER | Tài | Thiết bị thật chưa thử |
| 7 Persistence | Dữ liệu bền trong PG | migrations, DB tests | browser: reload giữ task/quiz/flashcards/hội thoại; DB tests | AUTO · BROWSER | Tài | Restart API/DB **của stack demo** xóa dữ liệu (tmpfs, thiết kế); persistence qua restart chỉ có ở DB thật |
| 7 Security: chỉ thấy dữ liệu của mình, kể cả RAG | RLS + principal server-side; quiz/hội thoại cá nhân | `runtime-rls.database.test.mjs`, `receipt-ownership.database.test.mjs` | matrix: viewer 403 ghi, member không xóa document, quiz người khác 404, hội thoại member = 0; browser: đổi tài khoản không lộ note/draft; 2 tab logout đồng bộ | AUTO · BROWSER | Tài | Hai workspace trong browser: chỉ AUTO |
| 7 Privacy | Dữ liệu gửi Google khi embedding/RAG/OCR; STT local | README § "Lỗi và nguyên tắc an toàn" | Văn bản; telemetry không lưu prompt/câu trả lời/PDF text | PREP | Tài | Đưa vào báo cáo §8 |
| 7 Testing | Unit/integration/evaluation | `npm test`, `npm run test:database` | Xem "Bằng chứng kiểm" cuối đợt | AUTO | Tài | Evaluation set: `BLOCKED` |
| 9 README / báo cáo / slides / video | README chạy Docker + biến môi trường + tài khoản demo; báo cáo PDF 10–20 trang; ≤ 15 slide; video 3–5 phút | `README.md`, `docs/REPORT.md` (+PDF), `docs/SLIDES.md` (+PPTX/PDF), `docs/DEMO-AND-DEFENSE.md` | Báo cáo/slide: bản DRAFT; **video chưa ghi** | PREP | Tài + Thắng | Điền kết quả evaluation + phần Thắng; quay video từ stack **thật** (không dùng stack demo giả live) |
| 10 Bảo vệ | Demo 8 phút; live change 10 phút; Q&A cá nhân 12 phút | `docs/DEMO-AND-DEFENSE.md` | Kịch bản, 3 bài sửa nhỏ có test, câu hỏi theo module | PREP | Tài + Thắng | Mỗi người tự luyện; không ai viết thay phần hiểu bài của người kia |

**Cập nhật 23/10/2026 (sau khi Tài cấp `.env`):** đã có **một lần chạy thăm dò với Gemini thật** (model thật; Auth/Storage/PostgreSQL vẫn local synthetic) — xem `docs/REPORT.md` §6.2b.
Với A (RAG), C (Study Coach), guardrail 1–3 và logging/cost/latency, trạng thái thêm `LIVE-MODEL (thăm dò)`: RAG tiếng Anh/Việt đúng và có citation, câu ngoài tài liệu bị từ chối không gọi model,
một câu hỏi thẳng vào đoạn injection được model thuật lại chứ không làm theo, quiz và flashcards qua validator strict, lỗi quota và 503 thật từ Google được xử lý đúng. Đây **không** phải evaluation:
chưa có gold được duyệt, chưa có chấm có chữ ký, chưa có pass rate; mức `LIVE` đầy đủ (Supabase thật, Google OAuth) vẫn chưa đạt.

## User stories (13) — acceptance criteria và traceability

Cơ sở: rubric 5.1 (8–15 story); cập nhật từ `docs/USER-STORIES-FINAL-PROJECT-VI.md` (Thắng, 18/10/2026,
commit `2249abf`, đã rút khỏi cây ở `e9ac2af`) theo code hiện tại. Cột "Mức" là trạng thái cao nhất đã đạt,
theo bảng mã ở trên; có màn hình **không** đồng nghĩa story đạt.

| ID | Story và acceptance criteria | Endpoint / component | Source | Test · bằng chứng | Mức |
| -- | ---------------------------- | -------------------- | ------ | ----------------- | --- |
| US-01 | **Đăng nhập an toàn.** AC1: tài khoản có quyền đăng nhập → phiên hợp lệ. AC2: sai mật khẩu/phiên hết hạn/Auth lỗi → thông báo rõ, không tải dữ liệu bảo vệ. AC3: đăng xuất → phiên cũ vô hiệu (kể cả tab khác). | `/api/auth/{session,login,logout,refresh,google/*}`; `PilotAccess.tsx`, `use-pilot-session.ts` | `auth.service.ts`, `auth-store.ts` | `auth.test.mjs`, `oauth.database.test.mjs`; browser: login, reload, logout, tab thứ hai nhận "đăng xuất ở tab khác", phiên bị thu hồi → "Phiên không còn hợp lệ", bản nháp còn, không replay | BROWSER (Auth synthetic); Google LIVE `BLOCKED` |
| US-02 | **Phân quyền workspace.** AC1: viewer đọc được, không ghi (403 `ROLE_FORBIDDEN`). AC2: member ghi nhưng không xóa tài liệu. AC3: người không có membership không có principal. AC4: workspace/role do client gửi bị bỏ qua. | `auth.guard.ts`, `principal.ts`; UI ẩn form với viewer | `workspace-context`, RLS | `runtime-rls.database.test.mjs`, `demo-stack-roles-check.mjs` 19/19; browser viewer: form ẩn, select khóa | BROWSER |
| US-03 | **Quản lý công việc & học tập.** AC1: tạo task lưu bền. AC2: đổi trạng thái lưu; dữ liệu sai bị từ chối (title ≥ 3 ký tự). AC3: exams/study plans/expenses theo quyền. | `/api/{tasks,exams,study-plans,expenses}`; `TasksPanel.tsx`, `ExamsPanel.tsx`… | controllers + services | `academic-context.test.mjs`, `workspace-academic.database.test.mjs`; browser (Tasks) | BROWSER (Tasks); còn lại AUTO |
| US-04 | **Tìm, lọc, sắp xếp, phân trang.** AC1: tìm theo từ khóa. AC2: lọc trạng thái/môn. AC3: phân trang có tổng. AC4: sidebar tìm bounded theo workspace. | `/api/*/search`, `/api/search`; `use-paged-search.ts` | search services | `*-search-http.database.test.mjs`; browser: tìm "quiz", lọc `done`/`in_progress` | BROWSER (Tasks) |
| US-05 | **Tải và lập chỉ mục PDF.** AC1: PDF hợp lệ → Stored → Index → Ready kèm độ phủ trang. AC2: sai loại/quá cỡ bị từ chối. AC3: chỉ manager/member ghi; viewer không. AC4: signed URL 60 s. | `/api/documents*`; `DocumentsPanel.tsx` | `documents.service.ts`, `ingestion` | `documents-http-context.database.test.mjs`, `ingestion-http.database.test.mjs`; browser: 3 PDF → "Độ phủ 3/3 trang" | BROWSER |
| US-06 | **Hỏi đáp RAG có nguồn.** AC1: câu có đáp án → trả lời + `[S1]` + citation tên file/trang. AC2: mở citation → đúng PDF, đúng trang. AC3: ngoài tài liệu → từ chối, không citation. AC4: citation ngoài evidence bị loại. | `/api/assistant/chat`, `/chat/stream`; `AssistantPanel.tsx`, `SourcePreview.tsx` | `assistant.service.ts`, `source-markers.ts` | `assistant.service.spec.ts`, `retrieval-*.database.test.mjs`; browser: citation → PDF trang 3/3 đúng đoạn; Mona Lisa → từ chối | BROWSER (model synthetic); chất lượng LIVE `BLOCKED` |
| US-07 | **Hội thoại tiếp nối và lịch sử.** AC1: follow-up dùng ngữ cảnh. AC2: đổi tài liệu/scope → reset. AC3: lịch sử là riêng tư theo (workspace,user). AC4: lưu lượt cần receipt hợp lệ. | `/api/assistant/conversations*`; `use-assistant.ts` | `assistant-conversation.service.ts`, `answer-receipt.service.ts` | `assistant-conversations-lifecycle.database.test.mjs`, `answer-receipt*.test.mjs`; browser: follow-up cùng scope; API: manager 1 hội thoại, member 0 | BROWSER (một phần) |
| US-08 | **Streaming và hủy.** AC1: general mode hiện chữ dần. AC2: bấm Dừng → không lưu nửa câu, giữ bản nháp. AC3: phản hồi trễ không ghi đè hội thoại khác. | `POST /api/assistant/chat/stream`; `assistant-stream.ts` | `assistant.controller.ts` | `assistant.controller.spec.ts`, `assistant-stream.test.ts`; browser + nginx | BROWSER |
| US-09 | **Study Coach — Quiz.** AC1: sinh từ tài liệu ready → JSON được validate (schema, sourceIds ⊂ evidence, 4 lựa chọn khác nhau). AC2: xem trước, chưa lưu; xác nhận mới lưu (token server cấp). AC3: làm bài → chấm ở server, idempotent. AC4: tiến độ cá nhân; quiz của người khác 404. AC5: JSON sai → 422, không lưu. | `/api/study-coach/quizzes*`; `StudyCoachPanel.tsx` | `study-coach.service.ts`, `study-quiz-validation.ts` | `study-quiz-validation.spec.ts`, `study-coach*.database.test.mjs`; browser: 3 câu, 2/3 = 66,67 %, "1 lượt" sau reload | BROWSER (JSON synthetic) |
| US-10 | **Study Coach — Flashcards.** AC1: preview → xác nhận lưu. AC2: lật thẻ, tự đánh giá nhớ/cần ôn, lưu một lượt idempotent. AC3: tiến độ cá nhân. | `/api/study-coach/flashcards*`; `StudyFlashcardsPanel.tsx` | `study-flashcards.service.ts` | `study-flashcards*.database.test.mjs`; browser: "2 đã nhớ, 1 cần ôn lại" | BROWSER (JSON synthetic) |
| US-11 | **Dashboard sử dụng AI (manager).** AC1: số operation/provider call, token, chi phí ước tính, latency avg/p95, lỗi/từ chối. AC2: thiếu dữ liệu hiện "chưa có", không 0. AC3: member/viewer bị chặn. | `GET /api/admin/ai-usage`, `/cost-breakdown`; `AiUsageDashboard.tsx` | migration 019/021 | `ai-usage*.database.test.mjs`; browser | BROWSER |
| US-12 | **Nhập câu hỏi bằng giọng nói (STT).** AC1: ghi âm → transcript theo ngôn ngữ chọn. AC2: sửa rồi chèn, không tự gửi. AC3: hủy/silence → không gửi. AC4: mặc định tắt, không tự tải weights. | `/api/speech/*`; `SpeechInput.tsx` | `apps/api/src/speech/*` (Thắng) | `speech.test.mjs`, `speech-media.test.mjs`, `speech-input.test.tsx` | AUTO; độ chính xác thực/VI-EN/âm dài `BLOCKED` (máy Thắng + micro + weights) |
| US-13 | **Hỏi dữ liệu workspace.** AC1: câu hỏi khớp intent → trả lời từ truy vấn SQL có kiểm soát + liên kết bản ghi. AC2: mơ hồ → hỏi lại. AC3: không gọi LLM, không tool-calling. | `mode: "workspace"`; `workspace-assistant.service.ts` | `workspace-intent.ts`, `workspace-records.service.ts` | `workspace-*.spec.ts`, `workspace-records-context.test.mjs` | AUTO |

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

## Phạm vi bổ sung theo Tài — 22/10/2026

Nguồn đối chiếu trực tiếp ngày 22/10/2026:
[Final Project Assignment 2026–2027](https://docs.google.com/document/d/1zxaqjKBBGjibOYuhw5xW6hEU1NbUayrr/edit).
Đây là đề cuối kỳ, không dùng kế hoạch môn học tám tuần hoặc corpus giả lập
để thay thế. Đã đọc mục 3, 4.1–4.2, 7, 9 và bảng capabilities/rubric.

- F10 đã có STT: giữ và nghiệm thu implementation của Thắng; không triển khai TTS.
- Bỏ F11 (PWA/install/offline shell) và F13 (WASM PoC) khỏi kế hoạch phát triển;
  giữ ID lịch sử, không coi đã hoàn thành, không tự xóa code có sẵn. F14/F12
  không bị bỏ theo quyết định này; F15 mở rộng ba tools vẫn đã bỏ.
- Mục 3 cho phép web hoặc mobile và ít nhất một modern frontend feature:
  streaming UI là lựa chọn thay PWA. TTS và WASM không phải yêu cầu bắt buộc.
- Mục 7 vẫn yêu cầu responsive desktop/mobile. Mục 3 vẫn yêu cầu OAuth2/JWT,
  role-based access, realtime/streaming và demo từ bản deployed hoặc containerized;
  bỏ F11 không loại các nghĩa vụ đó.
- Nhóm Tài–Thắng hai người cần ít nhất hai capabilities: hướng A (RAG) + C
  (LLM JSON được validate schema và dùng trong logic ứng dụng) vẫn phù hợp về
  phạm vi. Cần nghiệm thu cả hai; hai tools không đạt B (≥3 LLM-called tools).
  Có STT không tự chứng minh D, vốn còn đòi kết quả được lưu và dùng bởi app.
- Mục 4.2 đòi ≥20 case có expected, được chạy và báo pass rate trước/sau ít nhất
  một cải tiến; số case đã soạn hoặc các test fixture xanh không thay nghĩa vụ
  này. Guardrails, logging/cost/latency, fallback và bộ nộp giữ nguyên.
- Đề không bắt buộc hai chữ ký gold của Tài/Thắng; đó là quy trình nội bộ hiện
  hành, không được agent tự giả phê duyệt hoặc âm thầm bỏ gate.

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
