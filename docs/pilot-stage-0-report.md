# Pilot — báo cáo khảo sát Chặng 0

Ngày 06/10/2026, Asia/Saigon. **Hoàn thành khảo sát và tài liệu thiết kế;
chưa triển khai/runtime nghiệm thu pilot.** [Thiết kế để duyệt](pilot-stage-0-design.md).

## Phạm vi, Git và nguồn sự thật

Repo `D:\New-Tech\Final-Project`, nhánh `feature/tai-rag-integration`, HEAD đầu
lượt `6d250604774836fb044f35d2664ab2f6accd7ea7`, upstream cùng revision.
Tracked tree sạch. File `docs/PHASE-4-RAG-EVALUATION-PROMPT.md` untracked có trước
giữ nguyên, không stage. Yêu cầu mới giới hạn chỉ Chặng 0 và không push; không
tiếp tục quyền push của lượt trước. Hash commit tài liệu được báo khi bàn giao.

Đọc README, PROJECT-CONTEXT, ASSISTANT-SETUP, SUPABASE-SETUP, handoff trong repo
và `D:\New-Tech\AGENT_HANDOFF.md`, phase-4/phase-5 reports/review, evaluation
plan/manifest/scripts/tests; đối chiếu bootstrap/config/contracts/controllers,
SQL/services, Storage/ingestion/OCR/embeddings/retrieval/Assistant, FE hook/API/
feedback, migrations/runner. Không có AGENTS.md trong repo. File cha
`D:\New-Tech\.agents\AGENTS.md` mô tả LogiRoute/Python/Pydantic/glassmorphism;
không áp thiết kế đó lên ExaMate, không sửa rule. Skill đang cung cấp không có
skill cần thiết cho khảo sát project này; không viện rule để yêu cầu xác nhận thêm.

Các tài liệu cũ có snapshot hai mode, migrations tới 010, Assistant text-only
hoặc RAG chưa nối; source hiện có ba mode, ba operation, feedback và migration 011. README yêu cầu Node 24.15+; máy đang Node **24.13.0**, npm **11.6.2** và gates
xanh; không gọi môi trường này đáp ứng phiên bản khuyến nghị. Không sửa tài liệu
lịch sử/rules/attribution để làm khớp snapshot. Báo cáo Chặng 0 này là mốc mới.

Chỉ thêm hai file `docs/pilot-stage-0-design.md`, `docs/pilot-stage-0-report.md`.
Không thay runtime BE của Thắng/FE/contracts/package/schema, không apply migration,
Auth config, tạo user/invite/email, feedback, upload/index/delete hoặc gọi Google.
Diagnostic/run/log mới nằm trong artifacts ignored, không ghi đè artifact cũ.

## Endpoint inventory và trạng thái bảo vệ hiện tại

Kiểm decorators của 9 controllers: **26 method/route combinations**, prefix /api.
Không auth/session/membership guard; global DTO validation, request IDs, safe
error/log filter và exact CORS origins hiện có không thay authentication.
CORS credentials=false; server không cấu hình trust proxy/session/CSRF.

| Route hiện có (sau /api)   | Method        | Dữ liệu/tác dụng cần bảo vệ                      | Pilot dự kiến                                |
| -------------------------- | ------------- | ------------------------------------------------ | -------------------------------------------- |
| health                     | GET           | SELECT 1, DB state/latency                       | Public nhưng thu gọn thông tin               |
| tasks                      | GET, POST     | Danh sách/tạo task                               | Read mọi role, create manager/member         |
| tasks/:id/status           | PATCH         | Cập nhật status                                  | manager/member, scope row                    |
| courses, courses/:slug     | GET           | Metadata môn, lookup slug                        | Read workspace, không CRUD mới               |
| exams                      | GET, POST     | Danh sách/tạo kỳ thi và course relation          | Read/create theo role/scope                  |
| exams/:id                  | PATCH, DELETE | Update/delete                                    | Update manager/member, delete manager        |
| study-plans                | GET, POST     | Danh sách/tạo plan và course relation            | Read/create theo role/scope                  |
| study-plans/:id/completion | PATCH         | Hoàn thành plan                                  | manager/member                               |
| study-plans/:id            | DELETE        | Xóa plan                                         | manager                                      |
| expenses                   | GET, POST     | Chi phí, course relation                         | Read/create theo role/scope                  |
| expenses/:id               | DELETE        | Xóa chi phí                                      | manager                                      |
| documents                  | GET, POST     | Metadata tất cả docs/upload object               | Read mọi role, upload manager/member         |
| documents/:id/process      | POST          | Claim/index, Storage bytes, OCR/embedding        | manager/member; scope + AI admission         |
| documents/:id/download     | GET           | Ký attachment/inline URL                         | Read permission trước ký grant               |
| documents/:id/course       | PATCH         | Gán/bỏ course                                    | manager/member, cả doc và course trong scope |
| documents/:id              | DELETE        | Đánh dấu deleting, xóa object/row/chunks         | manager, scope trước object effect           |
| assistant/status           | GET           | Model/config readiness                           | Protected, không chứng minh upstream ready   |
| assistant/chat             | POST          | general/documents/workspace, summary/course_info | Membership/CSRF; quyền nguồn + budget nếu AI |
| assistant/feedback         | POST          | Snapshot/client signals, idempotent row          | Own answer receipt, mọi role                 |

Không có public feedback GET/review/update/delete, docs GET :id/status, course
write hoặc task DELETE. Status index nằm trong GET documents. CRUD service SQL
hiện tham số hóa, nhưng list/read/update/delete chưa có tenant/principal scope.
Workspace Assistant cũng đọc records/counts tổng DB theo giới hạn cố định;
UI source links không phải authorization. Phải scope các đường này Chặng 2.

## DB/Storage thật: chỉ đọc metadata được phép

Read-only diagnostic 06/10/2026 **13:30:47 Asia/Saigon**, kết nối từ config runtime
của source vừa build. Dùng BEGIN READ ONLY rồi ROLLBACK; không runner migrate.
Không in host/project URL/connection string/key hoặc nội dung record/PDF.
Bằng chứng local: `artifacts/pilot-stage-0-diagnostics.json`.

- `current_user=postgres`, rolsuper=false, **rolbypassrls=true**, rolcreaterole=true.
  Cả 10 bảng tasks/courses/exams/study_plans/expenses/documents/document_chunks/
  ai_evaluations/assistant_feedback/schema_migrations owner postgres, RLS=true,
  FORCE RLS=false, policies=0, anon/authenticated không có bất kỳ CRUD privilege
  trong phép kiểm. Runtime owner/bypass không bị các RLS hiện tại giới hạn.
- 001–011 applied; SHA-256 SQL normalize CRLF khớp **11/11** history. Runtime và
  migration URL resolve cùng hostname/database; TLS rejectUnauthorized=true.
  Không tuyên bố đã được quản lý duyệt target cho một migration mới chỉ vì
  diagnostics trùng lịch sử. Workspace/user backfill IDs vẫn chưa được cấp.
- Corpus anchors được cho phép: brief `f509eb08-e914-4b31-bfd1-f3a06da82d0f`
  ready/stored 3 pages/3 indexed chunks; policy
  `98a678dd-d8b8-4f49-afdf-182390927506` ready/stored 2/2. Cả hai course_id null.
  Không đọc chunk content/vector, không tải PDF hoặc kiểm lại bytes trong lượt
  này; SHA/extraction evidence Đợt 4 vẫn là lịch sử, không gọi đó là đo mới.
- SELECT count trên đúng hai feedback smoke IDs Đợt 5 xác nhận **2** còn tồn tại;
  không đọc question/answer/comment hoặc export feedback thật lượt này.
- Runtime hiện có SELECT auth.sessions; catalog có id/user_id/not_after. Role
  `examate_app` đề xuất **chưa tồn tại**. Chưa kiểm grant/policy của role tương
  lai hoặc Auth login bằng user thật; không đọc auth.users/email/session rows.
- HTTP GET metadata private bucket **200**, public=false, limit **10.485.760
  bytes**, allowedMimeTypes=[application/pdf]. Đây là kiểm bucket metadata thật,
  không sign URL/read object/provider. Storage adapter dùng server key apikey
  (legacy service_role thêm Bearer); bucket check trước upload/read/sign,
  prefix delete chỉ exact key. Source DocumentsService lấy key DB và ký URL
  TTL=60 giây, chưa kiểm principal. Không trả storage_key trong metadata public.

Kiểm sự hiện diện cấu hình, không in giá trị: generation/embedding configured;
publishable/anon Auth key và SESSION_ENCRYPTION_KEY **chưa cấu hình** ở máy.
Auth project settings/signup/confirmed users/redirect URLs/tier/quota/price
**unknown**, không kiểm bằng admin endpoint và không suy diễn từ Storage 200.

## Session, feedback và đường AI đang có

Chưa có authentication session ở FE/BE. App sở hữu use-assistant memory trong
cùng tab; reload mất chat theo thiết kế. Snapshot feedback giữ đúng request
mode/operation/question/scope lúc gửi và response/citations/metadataSource/
workspaceSources. Feedback form riêng từng answer, ID UUID ổn định/idempotency;
không gửi toàn hội thoại, PDF bytes, chunk text hoặc URL signed. Notes là dữ
liệu browser tại localStorage key `examate-notes`, chưa gắn principal: cần xử
lý tránh lộ giữa account trên cùng browser khi thêm Auth.

Migration 011 lưu assistant_feedback: UUID server, unique answer/submission,
canonical payload hash, rating/reasons/comment tối đa 1.000, snapshot tối đa
81.920 bytes/question 4.000/answer 32.000 chars/40 sources, client_reported,
UNREVIEWED/time; không source FK và không user identity. API INSERT ON CONFLICT
DO NOTHING + SELECT kiểm hash trả receipt nhỏ/replay hoặc 409, không overwrite.
UUID client không chứng minh “feedback chính lượt của user đã login”; cần receipt
ledger server Chặng 2. Export CLI SELECT chọn IDs hoặc bounded rating/limit<=50,
wx output artifacts mới, zero provider/DB write; không public GET và không tự
thêm case/gold/semantic verdict. Luồng review giữ theo [feedback review](feedback-review.md).

| Entry                 | Đường thực hiện hiện tại                                                                             | Provider calls theo source (không live lần này)                     |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| general/question      | AssistantService → GeminiService.generate                                                            | 1 generation                                                        |
| documents/question    | RagRetrievalService → embedQuery → SQL/context → Gemini                                              | 1 embedding; 0 hoặc 1 generation                                    |
| documents/summarize   | documentForSummary đọc chunks → nhóm 60.000 chars → section/synthesis                                | g generation, thêm 1 nếu g>1; không query embedding                 |
| documents/course_info | documentMetadata đọc DB association                                                                  | 0; không suy ra PDF content                                         |
| workspace/question    | WorkspaceAssistantService → WorkspaceRecordsService SELECT                                           | 0; read-only records                                                |
| documents/:id/process | claim → Storage.downloadBuffer → PDF.js → optional OCR → chunks → embedDocuments → transaction index | ceil(chunks/16) embedding; nếu OCR bật một generation/page thực gửi |

Config quan sát: generation gemini-2.5-flash, output 1.024 tokens; embedding
gemini-embedding-001/768 dims/batchSize16; topK6/candidateLimit10/minScore0,55/
prompt rag-v1. OCR enabled=false/configured=false/maxPages25; khi bật dùng
Gemini page-image transcription, không phải extraction miễn phí. PDF.js hiện
10 MiB/200 pages/2 triệu chars, chunker 2.000 chunks; summary tối đa16 nhóm.
SDK adapters attempts=1 và không auto retry; AbortController timeout không
chứng minh provider chưa xử lý/tính phí. Adapters chưa trả usage token cho
orchestration; token/cost/quota remaining unknown. Chưa durable budgets/concurrency.
Logs nhìn chung safe, nhưng upload uncertain/cleanup paths hiện log storageKey;
đề xuất bỏ field này khi sửa security boundaries, không sửa runtime Chặng 0.

## Evaluation và tồn đọng được giữ nguyên

Default runner internal transport: createLiveHarness khởi tạo DB/Storage/
retrieval/embedding/Gemini/Assistant services trong process, preflight đúng corpus,
observe evidence vào provider; **không qua HTTP Auth/controller**. HTTP transport
vẫn dùng cùng preflight DB/Storage read-only rồi fetch localhost /assistant/chat;
hiện chưa gửi cookie/CSRF, chỉ Content-Type. HTTP retrieval metrics unavailable,
provider calls/config unknown, citation tồn tại kiểm SELECT riêng. Khi bổ sung
Auth phải sửa harness context/transport; không tạo public bypass hoặc giả internal
context đã qua authentication. Dry/offline không load .env/clients/live network.

Run mới `artifacts/pilot-stage-0-dry/`, default dry không --execute:
process/checkpoint-24/final **0/0/0**, validation=successful,
semanticEvaluation=not_executed; PASS/FAIL/REVIEW_REQUIRED/BLOCKED/INCONCLUSIVE/
SKIP đều0, NOT_ATTEMPTED24. Field actualProviderBudget của dry hiện ghi unknown;
không sửa field này Chặng 0. Source path và regression test chứng minh không
dispatch HTTP/provider; không gọi “unknown” là số provider call được đo.
Checkpoint mismatch đã sửa ở 9ed09d5; test vẫn giữ. Candidate-file CLI regression
ở feedback-export.test.mjs reject UNREVIEWED khi đưa làm --cases và bỏ qua
candidate nằm cạnh output; không còn khoảng trống test đã nêu trước review fixes.

Giữ kết quả [Đợt 4](phase-4-evaluation-report.md): E01/E04/E07/E16
**REVIEW_REQUIRED**, semantic PASS=0; E17 **BLOCKED AI_UNAVAILABLE**, nguyên nhân
quota/auth/upstream cụ thể unknown, không quy thành retrieval sai. E01 thiếu
lời nhắc yêu cầu minh họa là completeness thiếu theo rubric, dù có thời lượng/
workflow/citation; đây là nhận xét agent, chưa Tài/Thắng ký. Không sửa response/
gold lịch sử. Corpus ASCII tổng hợp, chưa evidence extraction PDF tiếng Việt
có dấu/scan/OCR thật. Security pilot không giải quyết các kết luận đó.

Browser thật desktop/375px Đợt 4/5 vẫn **chưa nghiệm thu**. Đợt 4 ghi công cụ
launch Chrome remote debugging bị automatic review `blocked by policy`; lượt
này không có browser tool, không thử vòng qua/chạy lại hành động bị từ chối.
Port survey không thấy listener3000/5173/8080, không khởi động server; không
claim login/logout/source/feedback responsive đã kiểm browser thật. Tests DOM
không thay browser. Hậu kiểm Đợt 5 đã sửa UUID HTTP/400–409/target size/artifact
lifecycle; không thực hiện lại các fixes hoặc debug Gemini ở Chặng 0. Cleanup
26 artifact test cũ vẫn policy-blocked theo báo cáo trước, không xóa lần này.

## Gates, acceptance và bàn giao

Baseline thực từ root, Node24.13.0/npm11.6.2; test tự động mock provider/transport.
Chặng 0 chỉ documents: không logic/security fix mới cần RED→GREEN. Regression
cũ chạy GREEN; không ghi chúng là RED quan sát trong lượt này.

| Root gate            | Baseline                                                                                      | Final sau tài liệu                                                 |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| npm run typecheck    | exit 0                                                                                        | exit 0                                                             |
| npm test             | exit 0; API Vitest 197 + node:test 181 + web 144 = **522 pass**; fail 0/skipped 0/cancelled 0 | exit 0; **522 pass**, cùng breakdown; fail 0/skipped 0/cancelled 0 |
| npm run build        | exit 0                                                                                        | exit 0                                                             |
| npm run format:check | exit 0                                                                                        | exit 0                                                             |

Baseline logs `artifacts/pilot-stage-0-baseline/`; final logs trong thư mục
mới `artifacts/pilot-stage-0-final/`. Không thay artifact lịch sử. Runtime/source
không đổi; vẫn chạy lại đầy đủ gates theo yêu cầu trước commit. Prettier check
riêng hai Markdown mới cũng exit 0; root format không bao gồm docs.

Acceptance Chặng 0: survey Git/endpoints/current role/Storage/session/feedback/
AI/evaluation và blockers có bằng chứng; thiết kế có trust/session/CSRF/matrix/
scope/migration/budget/rollback/file/test plan/admin actions; chỉ docs được
commit, giữ unrelated file, không runtime/migration/provider/push. DB target
mới/workspace/user IDs/Auth keys/HTTPS config/test accounts phải được quản lý
cấp trước thao tác phụ thuộc ở chặng sau. Chưa cần các giá trị đó để hoàn thành
thiết kế; không tự tạo danh tính hoặc hỏi upload secrets vào chat.

Tách kết luận: **documents khảo sát hoàn thành**, runtime pilot chưa làm, live
Auth/authorization/budget chưa kiểm, RAG human review chưa hoàn tất, deployment
ngoài chưa thực hiện. Tài duyệt thiết kế rồi mới làm Chặng 1; ưu tiên cấp config/
test identities và xác nhận quyền auth.sessions/least-privilege DB với Thắng.
Review diff/secrets, stage đúng hai docs, commit nhánh hiện tại và DỪNG.
