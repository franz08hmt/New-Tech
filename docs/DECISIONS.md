# Quyết định kiến trúc ExaMate

## ADR-019 — Attach content to sources before server-side citation rendering

27/10/2026. Live local logs showed a successfully indexed Word document followed
by rejected model JSON and mismatched inline/list citations. Requiring the model
to independently repeat citation identities in prose and in `citationIds`
creates avoidable inconsistency. The new internal grounded wire format is
`{answerable,blocks:[{text,sourceIds}]}`; source IDs are enumerated from the actual
evidence. Strict server validation bounds 1–12 blocks, text to 600 characters
each, 5 sources per block and the existing final answer/citation limits. Every
answerable block needs evidence; a refusal is one block with no sources. The
server derives markers/unique IDs from that same association, then applies the
existing validator. Unknown sources, inline source-like text, duplicate IDs in
one block and extra fields are rejected. Legacy output is still checked strictly;
no mismatching marker or ID is silently removed or reconciled.

Use separate versioned question/conversation/summary prompts, while preserving
the public answer/receipt/history contract and immutable evaluation history.
Grounded output is capped at 4096 tokens; compatible 2.5 Flash calls get a bounded
256-token thinking budget. Other model families receive no incompatible thinking
configuration. Shared SDK transport honors per-call limits on JSON and SSE,
records observed usage and rejects explicit truncated/blocked structured finishes.
It adds no repair call or automatic retry, and changes no admission call cap,
RLS, ingestion, model selection or global output default.

Trade-off: this reduces redundant formatting work; attached source IDs still do
not prove that each claim is semantically entailed. Long-document requests remain
bounded, not lossless full transcription. Deterministic SDK/PG/browser fixtures
verify mechanics, not real-model quality. Google's
[thinking guidance](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
and [finish reasons](https://ai.google.dev/api/generate-content) describe the
provider controls; supported behavior remains subject to integration verification.

## ADR-018 — Normalize Word/text uploads to PDF in an isolated local converter

27/10/2026. The requested formats are PDF, DOC, DOCX, UTF-8 Markdown and TXT,
not arbitrary file types. Keep the existing PDF metadata, Storage, extraction,
page citations, retrieval and Study Coach contracts. Convert before the Storage
write, outside a DB transaction, then check membership/course scope again.
Only canonical PDF bytes are persisted; `source.docx.pdf` preserves the source
extension visibly. Original Word/text bytes are not archived. Generated PDF
pages are the citation authority, not original Word pagination. Markdown/text
are escaped literal text; no HTML execution or remote image fetching.

Use LibreOffice Writer in a separate non-root Compose service: no credentials
or host data mounts, read-only root filesystem, bounded tmpfs/CPU/RAM/PIDs,
capabilities dropped, and only an internal Docker network (no host publication).
Macros are disabled in a fresh per-job profile. DOCX central-directory expansion
limits and relationship checks reject external references/embedded active objects.
The worker uses fixed filenames, no shell, one active conversion and a bounded
deadline; cancellation kills its process group and cleans its exact owned temp
directory. Output is bounded to 10 MiB. No provider call or new AI operation.

Trade-offs: a larger OS image/dependency and conversion latency; Word layout/fonts
can differ. Reject encrypted/unsupported/active content rather than claim full
Office fidelity. This is isolation, not a proof that LibreOffice sanitizes all
malicious documents. A missing worker fails safely for new formats; existing PDF
uploads remain available. Do not execute Office conversion inside the credentialed
API process. No new npm dependency, migration, grants, RLS or production AI change.
LibreOffice's documented [PDF CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html)
and [macro configuration](https://github.com/LibreOffice/core/blob/master/dbaccess/qa/complex/dbaccess/DatabaseDocument.java)
inform the invocation; source constraints and real-converter tests define this
feature's supported boundary.

## Điều chỉnh phạm vi theo Tài — 22/10/2026

Tài xác nhận F10 đã có STT và không triển khai TTS, bỏ F11/PWA và F13/WASM
khỏi roadmap để tập trung vào luồng AI và nghiệm thu cuối kỳ. Giữ ID lịch sử,
không xóa source có sẵn hoặc tự bỏ F12/F14. F15 mở rộng ba tools vẫn đã bỏ.

Đã đọc trực tiếp [đề cuối kỳ 2026–2027](https://docs.google.com/document/d/1zxaqjKBBGjibOYuhw5xW6hEU1NbUayrr/edit)
ngày 22/10/2026: PWA là ví dụ modern frontend, có thể dùng streaming UI thay
thế; TTS/WASM không bắt buộc. Với nhóm hai người, hướng A + C giữ đủ số
capabilities về phạm vi nhưng cần nghiệm thu thực tế. Không tự nhận B với hai
tools hoặc D chỉ vì có STT. Responsive mobile web, OAuth/JWT, role isolation,
streaming, demo containerized/deployed, ≥20 evaluation case có kết quả trước/sau
và bộ nộp vẫn giữ nguyên. Đối chiếu đầy đủ tại FINAL-REQUIREMENTS; đây là quyết
định giảm roadmap nội bộ, không sửa rubric của giảng viên.

## ADR-001 — Google PKCE và JWT-backed BFF/session

Ngày 18/10/2026. Quyết định code F01; cloud setup/live acceptance chưa thực hiện.
Chưa có ADR-002/003 được nghiệm thu.

App đã có Supabase password Auth, opaque HttpOnly cookie, mã hóa token server,
CSRF, membership và refresh serialization. Google dùng cùng ranh giới này.

POST start yêu cầu prelogin/Origin/CSRF. Backend sinh PKCE S256 và correlation
nonce bằng node:crypto. Correlation nằm trong redirect_to; không thay state của
Supabase/Google. Callback của Google thuộc Supabase; callback nhận code của app
là Nest. Native REST được đối chiếu với [OpenAPI Auth](https://github.com/supabase/auth/blob/master/openapi.yaml)
và [SDK chính thức](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts).

Migration 016 lưu một attempt/prelogin, hash nonce, provider/origin cố định và
verifier mã hóa AES-256-GCM với AAD purpose riêng, khác session tokens. TTL tối
đa 5 phút. Claim nguyên tử xóa ciphertext; start mới thay attempt cũ. Cleanup
tối đa 1.000 expired rows/start và cap 10.000 rows dưới advisory transaction
lock. Admission dùng bucket Google chung, IP/global limits hiện có; không phải
budget AI. Public/anon/authenticated không được quyền bảng attempt.

| Boundary          | DB / external work                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Start             | Admission; transaction khóa prelogin, cleanup/cap, thay attempt; commit trước trả authorization URL             |
| Claim             | Transaction khóa prelogin/attempt, consume và xóa verifier đã mã hóa; commit trước exchange                     |
| Exchange / verify | Supabase target cố định, timeout/response cap; không giữ client hoặc row lock                                   |
| Complete          | Kiểm auth.sessions; transaction recheck attempt/prelogin, revoke prelogin và insert session; cookie chỉ sau ACK |

Không thêm principal giả vào bootstrap, không ép prelogin qua workspace context.
Các policy permissive của Auth fixture chỉ tồn tại trong disposable; F01 không
chọn thiết kế quyền bootstrap production thay F02.

Luồng OAuth không giữ transaction qua exchange/verify. Sau exchange, Supabase /user xác
minh chính access JWT, rồi mới kiểm sub/session_id/expiry/issuer/audience.
Đây là authoritative verification, không phải decode hay tự viết signature
verifier. DB auth.sessions và membership vẫn được kiểm như trước; successful
JWT cache tối đa 30 giây không bỏ hai bước đó.

Final transition khóa/recheck prelogin và attempt đã claim, dùng chung routine
cấp phiên với password login: revoke prelogin, insert session mã hóa, rotate
cookie/CSRF. Browser vẫn chỉ gửi opaque cookie. Manager/member/viewer giữ nguyên.

Hardening 19/10: thời hạn được kiểm lại bằng clock_timestamp sau khi chờ khóa,
không dựa riêng vào NOW() cố định từ BEGIN. Hết hạn khi đang chờ phải chặn
dispatch/claim/issuance tại boundary tiếp theo; không kéo dài TTL bởi lock wait.

Exchange/COMMIT mất ACK không được retry mù hoặc suy là rollback. Không phát
cookie chưa xác nhận; user bắt đầu flow mới. Callback redirect sạch về origin
server, result allowlist, no-store/no-referrer. HTTP logger che query; Nginx
không log callback và dùng allowlisted paths cho request khác. Raw proxy error
log bị tắt; chẩn đoán dựa vào API status/requestId.
Vite dev proxy cũng che riêng callback error/query bằng thông báo cố định khi
upstream lỗi; giữ 502, không chuyển code/stack từ proxy vào log.

App không gọi linking API, không match email/name để cấp quyền hay merge dữ
liệu. Membership theo verified Supabase user ID. Chính sách identity linking
của platform cần owner kiểm trước live; không hứa Google luôn tạo ID mới.
Account demo email không nhận thư không tự trở thành account Google.

Nguồn: [Google qua Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[exchangeCodeForSession](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession).
Consent/MFA thuộc chủ account; Google client secret chỉ ở provider Supabase.

Kiểm chứng và giới hạn: [demo checklist](FINAL-DEMO-CHECKLIST.md),
[context](PROJECT-CONTEXT.md). Production tenant policies/runtime role là F02.

### Hệ quả rollback 016 — F01.1, 19/10/2026

Hai finding của reviewer là đúng: guard cũ chỉ so tên cột; dry-run chưa kiểm
dependency. Preflight mới dùng chung cho hai mode, recursive pg_depend và
contract catalog checked-in từ pristine disposable/source 016 PG17. Expected
không được học từ target đang kiểm. Gắn checksum source; không sửa 001–016.
So cấu trúc cột/constraints/FK/index/trigger/TOAST/types/RLS/inheritance; kể cả
object auto-dropped ngoài thiết kế phải từ chối. Tên nội bộ phụ thuộc OID được
chuẩn hóa và kiểm quan hệ tên tự sinh, không ghi OID target vào contract.

Dry-run BEGIN READ ONLY, chỉ đọc/SET LOCAL/ROLLBACK; không thử DROP. Apply
advisory lock, ACCESS EXCLUSIVE và recheck trong transaction; DROP RESTRICT vẫn
chặn cuối. Chỉ DROP attempt table và DELETE ledger 016, giữ rows sessions/users/
memberships/business; mất attempts đang chạy, không tự replay khi migrate lại.
COMMIT mất ACK không chứng minh rollback; báo outcome unknown, discard client
không chắc sạch, không tự retry. Known rollback có test reuse cùng backend.

Contract được kiểm PG17; khác major/deparser có thể bị từ chối an toàn, không
tự cập nhật expected từ target. Owner/ACL không thuộc snapshot cấu trúc. Catalog
inspection không chứng minh phát hiện dynamic SQL hoặc mọi application reference.
F02 thêm policy/structural objects phải đánh giá đường lui riêng, không âm thầm
xóa chúng bằng rollback 016 cũ. Đây là bổ sung ADR-001, chưa phải đủ ba ADR.

Nguồn: [pg_depend](https://www.postgresql.org/docs/17/catalog-pg-depend.html),
[pg_constraint](https://www.postgresql.org/docs/17/catalog-pg-constraint.html).

## ADR-002 — Tách runtime business, Auth và maintenance DB

Ngày 19/10/2026. Quyết định F02-A local; không phải phê duyệt provision hoặc
rollout trên Supabase. F02-B phải chốt và kiểm riêng thông tin role/credential
thực tế trước cloud.

### Quyết định

- Business API dùng `DATABASE_URL` qua `DatabaseService`, một LOGIN thuộc đúng
  capability group `examate_business`. Auth/bootstrap dùng `AUTH_DATABASE_URL`
  qua `AuthDatabaseService`, một LOGIN khác chỉ thuộc `examate_auth`.
- Migration/operator dùng `MIGRATION_DATABASE_URL` chỉ ở CLI maintenance;
  API process từ chối biến này nếu khác rỗng và không có fallback từ runtime URL.
- Migration 017 chỉ tạo quyền/policy cho các capability group có version.
  LOGIN/password được provision riêng. `examate_policy_owner` là NOLOGIN,
  không được cấp cho login; chỉ sở hữu helper kiểm membership để tránh policy
  recursion, với `search_path=pg_catalog` và quyền EXECUTE riêng cho business.
- GUC user/workspace được transaction-local ghi bởi backend sau principal
  verified. Policy kiểm membership/workspace active và role trong DB; GUC là
  scope context, không phải xác minh JWT. Process/credential DB bị chiếm có thể
  giả context tùy ý; thiết kế này không hứa chống attacker thực thi SQL tự do.

### Quyền tối thiểu trong migration 017

Business: scoped CRUD theo bảng trên Tasks/Courses/Exams/Plans/Expenses,
Documents/chunks, receipt/feedback; SELECT/lock membership/workspace cần cho
authorize; helper role để policy đọc membership không đệ quy. Policies kiểm
workspace và role; receipt/feedback giữ user ownership; chunks đi qua parent
Document. Không có Auth tables, ledger, evaluation/export, DDL, TEMP hay TRUNCATE.

Auth: pilot sessions, admission limits, OAuth attempts, INSERT-only refresh
intent, `auth.sessions(id,user_id,not_after)` và membership/workspace read dưới
context. Không có Auth users, migration ledger, business records, feedback/export
hoặc chunks. Membership chưa có principal vẫn chỉ được xác minh sau verified
provider identity; không ép bootstrap dùng workspace giả. Role context không
được lấy từ request client.

Maintenance: migration/rollback dùng credential riêng; feedback export tiếp tục
là CLI read-only có workspace filter và credential bảo trì riêng. Không có
maintenance credential trong API. Recovery/operator không được chạy qua
business/Auth pool.

### Inventory caller → principal → DB capability

| Bảng/function                                                                           | Caller                                                                                                                                | Trước → sau F02-A                                                                                                           | Thao tác, scope/role và capability                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`, `courses`, `exams`, `study_plans`, `expenses`                                  | Domain services                                                                                                                       | Một runtime connection chung → verified workspace principal qua business LOGIN                                              | Table/column grants theo CRUD đang có; RLS dựa membership active + workspace GUC; viewer đọc, manager/member ghi theo từng module; `examate_business`.                                                                                                               |
| `documents`, `document_chunks`                                                          | `DocumentsService`, `DocumentIngestionService`                                                                                        | Cùng runtime connection → business LOGIN sau principal guard                                                                | Metadata/file lifecycle và chunk operations theo grants cột; document/chunk RLS cùng workspace qua parent; manager/member write theo service rules; `examate_business`. Storage/provider vẫn ngoài DB transaction.                                                   |
| Workspace records và RAG reads (`documents`/`document_chunks` cùng bảng domain)         | `WorkspaceRecordsService`, `RagRetrievalService`, `AssistantService`                                                                  | Cùng runtime → business LOGIN với principal đã xác minh                                                                     | SELECT chỉ trong workspace active; viewer cũng đọc được. Retrieval giữ workspace predicate trong nearest CTE; `examate_business`, provider ngoài transaction.                                                                                                        |
| `assistant_answer_receipts`, `assistant_feedback`                                       | Receipt/history/feedback services                                                                                                     | Cùng runtime → business LOGIN với user + workspace                                                                          | Receipt INSERT/ownership verification; feedback SELECT/INSERT và idempotency; RLS buộc user/workspace; không có UPDATE/DELETE service grant; `examate_business`. Viewer được receipt/feedback của chính mình.                                                        |
| `workspaces`, `workspace_memberships`, `examate_workspace_role(uuid)`                   | `DocumentAccessService`, `AuthStore`, RLS policies                                                                                    | Cùng DB identity → business LOGIN cho service scope; Auth LOGIN riêng sau verified provider identity; policy helper NOLOGIN | Business đọc và lock hàng active trong transaction; column UPDATE chỉ phục vụ `FOR SHARE`, policy `WITH CHECK(false)` chặn sửa. Auth chỉ SELECT membership/workspace sau khi đã biết user; helper owner chỉ đọc để tránh policy recursion; không tin role từ client. |
| `pilot_sessions`, `pilot_auth_limits`, `pilot_refresh_attempts`, `pilot_oauth_attempts` | `AuthStore`/`AuthService` trước principal                                                                                             | Shared runtime → Auth LOGIN thuộc riêng `examate_auth`                                                                      | Session/admission/OAuth operations theo grants cụ thể; Auth-only RLS dùng `USING(true)` vì chưa có principal/workspace, service truy cập bằng opaque cookie/attempt hashes; Auth credential có thể đọc server-side Auth state, còn business không có quyền.          |
| `auth.sessions`; `auth.users`                                                           | `AuthStore.authSessionActive`; provider adapter xác minh user qua HTTPS                                                               | Shared DB login → Auth LOGIN chỉ có `SELECT(id,user_id,not_after)`; không SQL vào `auth.users`                              | Kiểm session revocation/expiry trong Auth boundary; không đọc session token cột khác, không đọc `auth.users`; business/Auth capability assertions fail nếu quyền rộng hơn.                                                                                           |
| `schema_migrations`, migration 001–018, `f02_runtime_*`/`f02a1_runtime_*` snapshots     | `migrate.mjs`, pilot preflight/apply/rollback CLI                                                                                     | Runtime connection/fallback → maintenance-only `MIGRATION_DATABASE_URL`                                                     | DDL/ledger/snapshot chỉ operator; 017/018 apply/rollback chỉ hỗ trợ local disposable qua target guard; cloud chưa áp.                                                                                                                                                |
| `ai_evaluations`, legacy/evaluation artifacts và `assistant_feedback` export            | Không có business API caller trực tiếp cho `ai_evaluations`; evaluation runner gọi HTTP và lưu report local; feedback exporter là CLI | Runtime grants rộng/không tách → business/Auth không đọc; export chỉ maintenance read-only                                  | `ai_evaluations` bị thu hồi quyền runtime; export lọc workspace rõ ràng, candidate `UNREVIEWED`, credential maintenance riêng và output private. Không cấp quyền export cho manager/member app.                                                                      |

Connection roles không có quyền `SET ROLE` sang capability khác; migration/operator
không được cấu hình trong API process. Runtime role grants là membership của
LOGIN vào capability group, không phải role do request chọn.

### Phương án loại trừ và hệ quả

Từ chối một owner/shared pool vì nó làm mọi API query bypass RLS. Từ chối `SET
ROLE` hoặc client-selected role vì request không được quyền chọn capability.
Từ chối cấp Auth pool quyền business để tiện bootstrap; `AuthStore` hiện chỉ
cần membership/workspace và Auth/session state. Không dùng role GUC làm căn cứ
policy.

Hai pool là cộng dồn: tổng trần xấp xỉ số API replica nhân
`(DATABASE_POOL_MAX + AUTH_DATABASE_POOL_MAX)`; Auth pool tối thiểu 2 vì refresh
giữ session lock trong khi refresh intent dùng kết nối Auth độc lập. DB capacity
cần để chỗ cho migration/maintenance và operator connection. Không giảm Auth
pool xuống 1 để tiết kiệm mà gây deadlock.

Local PG17 disposable đã kiểm capability, login thật non-owner/NOBYPASSRLS,
HTTP flows, RLS, apply/rollback và ACL snapshot. F02-B còn phải quyết định/cấp
LOGIN role/password qua kênh quản trị, mapping grants, pool budget, target/project,
backup, maintenance window, rollback và preflight trên môi trường thật. F02-A
không thay credentials, roles, policies, grants hoặc cloud data.

### F02-A.1 — contract v18 và policy correction

Migration 018 là source versioned sửa đúng năm policy đã snapshot trong 017:
workspace/membership visibility và lock checks yêu cầu membership/workspace
active; chunk SELECT cho phép manager/member đọc old chunks chỉ khi parent đang
`stored+processing` để re-index atomic có thể xóa/thay chunks. Viewer, failed
documents và tenant khác không được mở rộng. `f02a1_runtime_database_acl_state`
ghi trạng thái PUBLIC CONNECT trước 018 để rollback khôi phục database ACL cùng
policy snapshot; nó không lưu business rows.

Startup contract v18 so catalog digest với hằng số được tạo độc lập từ pristine
PG17 + migration source; không tự học target state. Nó bao gồm membership/role
inheritance, owner/role attributes, table/column/schema/database ACLs, protected
table RLS/policies và helper function definition/owner/config/EXECUTE ACL, cộng
quyền `auth.sessions`. Startup từ chối khi catalog lệch và không tự sửa. Apply
017/018 qua runner chuẩn khóa các relation được quản lý và từ chối policy ngoài
bundle có thể ảnh hưởng PUBLIC/business/Auth trước khi ghi. Policy cho role không
liên quan không bị xóa. Catalog guard không phát hiện mọi dynamic SQL/reference
trong ứng dụng, và startup không ngăn DBA đổi ACL sau khi process chạy.

Migration 018 được kiểm apply/rollback/reapply và rollback chain 018→017→016 trên
PG17 disposable. Baseline 017 có thể còn trong ledger nhưng không đáp ứng contract
v18; phải dừng runtime business/Auth cho tới khi 018 được áp và startup guard đạt.
Rollback 018 trả về lịch sử 017 và khôi phục ACL/policies; runtime contract v18
sẽ tiếp tục từ chối baseline đó, do vậy phải dừng API trước rollback và không coi
rollback là trạng thái có thể chạy.

## ADR-003 — Prompt registry và metadata telemetry AI (F03)

### Trạng thái

Accepted cho local implementation; migration 019, contract v19, apply/rollback
được kiểm trên PostgreSQL 17 disposable. Đây không phải phê duyệt rollout cloud,
F04 budget/admission hoặc F06 dashboard.

### Quyết định

Prompt tĩnh do ứng dụng sở hữu được đặt trong một registry TypeScript có `PromptId`
và version rõ. Version phản ánh prompt semantics; telemetry-only thay đổi không
tự tăng version. Registry chỉ chứa static instructions. Golden tests giữ nguyên
nội dung, thứ tự/context/schema gửi provider, summary grouping và citation behavior;
prompt reference đi riêng thành metadata nội bộ, không thêm field lạ vào SDK request.

Mỗi HTTP AI operation có một logical operation ID và mỗi lần gọi provider có call
ID riêng. Migration `019_ai_usage_telemetry.sql` tạo hai bảng metadata không lưu
prompt, câu hỏi/câu trả lời, document text, transcript hoặc raw provider errors.
Principal/workspace lấy từ guard server; business LOGIN chỉ có INSERT trên các
cột usage cho phép, tenant RLS kiểm transaction context, Auth LOGIN không đọc usage.
Workspace SQL ghi operation với zero provider calls; không ước tính token hoặc cost
cho SQL.

Provider, embedding batch, OCR page và generation ghi outcome/latency riêng. SDK
usage chỉ được chấp nhận khi field hiện có trong phiên bản đã cài hợp lệ; stream
usage lặp là snapshot tích lũy mới nhất, không cộng dồn. Thiếu/partial/invalid/
cached usage giữ unknown/partial. Giá được ước tính chỉ khi có pricing mapping
chính xác; mapping hiện có là Gemini 2.5 Flash với giả định Google Gemini Developer
API Standard Paid Tier, versioned 2026-10-19. Đây không phải invoice/billing thực;
model chưa map, cached breakdown hoặc không rõ tier thì cost unknown.

Telemetry được persist sau network/provider trong workspace transaction ngắn với
fresh `DocumentAccessService.authorize(..., tx)`. Provider không chạy trong DB
transaction. Persist có statement timeout và caller deadline. Failure/timeout
ghi mã an toàn, không retry provider/INSERT, không đổi response nghiệp vụ đã xác
định; do đó có thể thiếu metadata và đây không phải primitive admission cho F04.
Bảng có expiry 90 ngày/index; deletion scheduler chưa có và phải được giải quyết
trước khi coi retention vận hành hoàn chỉnh.

### Phương án loại trừ và giới hạn

Không lưu nội dung/prompt trong DB hoặc logs; không dùng một log line gộp cho
operation và provider attempts; không thêm public endpoint hoặc dashboard trước
F06; không thêm queue/retry; không cho Auth capability xem dữ liệu usage. Startup
capability contract v19 so source/catalog đã quản lý, nhưng local PG17 pass không
chứng minh cloud role provisioning. RLS bảo vệ lỗi scope SQL theo context đã xác
thực, không xác minh JWT từ custom GUC và không chống toàn bộ process/server takeover.

## ADR-004 — Durable AI operation admission (F04)

Local decision on 20/10/2026. Migration 020 and runtime capability contract v20
are source-only until a separately authorized cloud rollout. The final five
automated gates pass on disposable PG17; browser denial UX remains to be verified
before local acceptance.

### Decision and policy

Admission uses a dedicated PostgreSQL ledger, not F03 best-effort telemetry or an
in-process semaphore. One logical operation is reserved before provider work;
provider attempts are separately permitted and counted before dispatch. Identity
comes from the guard-verified principal. Daily quota is per verified user across
their workspaces, using the DB calendar date in `Asia/Ho_Chi_Minh`.

Finite defaults are 30 logical operations/user/day, 2 concurrent operations/user,
5 concurrent operations/workspace, and provider-attempt caps of 1 general chat,
2 document question, 17 summary (16 sections plus synthesis), and 150 indexing
(25 OCR pages plus 125 embedding batches at batch size 16 for a 2,000-chunk cap).
The 120-second lease covers only undispatched reservations. Missing config selects
these defaults; zero denies that dimension; malformed, extreme, or explicit
disable/fail-open config prevents startup. These are operation and fan-out caps,
not monetary limits. Unknown token/cost usage remains unknown.

Reserve takes short transaction-scoped advisory locks in fixed order (user,
workspace), locks the user's daily row, counts active reservations visible for
that verified user/workspace, then inserts the operation and charges the daily
unit atomically. Each dispatch takes a fresh short transaction, checks current
membership/role, locks the operation and requires a remaining planned permit.
SDK, embedding, OCR, and streaming work run outside transactions. Workspace SQL
without provider work is not admitted as AI.

### State and recovery

`reserved` is undispatched and lease-bounded. On a later request, expired
undispatched rows are terminalized; their daily unit is not refunded. Before each
provider attempt, a committed permit moves the operation to `running` and
increments its attempt count. Confirmed completion/failure/cancel terminalizes
the operation. If provider stop or finalization is uncertain after dispatch, the
state stays `unknown` and holds user/workspace concurrency indefinitely until
operator verification; lease expiry never proves the remote call stopped. This
can reduce availability after a crash but avoids silently exceeding concurrency.
Lost reserve/permit acknowledgements reconcile only by the same server operation
ID and never replay provider work. Telemetry failure cannot bypass admission or
change an already-determined business response.

### Capability and limits

Migration 020 grants the business capability only the required columns for its
own daily/operation rows, protected by RLS. Business still has no table ownership,
superuser, `BYPASSRLS`, DDL, `TRUNCATE`, or maintenance capability. Auth has no
admission/business access; maintenance migration/rollback remains a separate CLI
credential. The rollback runner defaults to dry-run, requires exact disposable
target confirmation for apply, checks checksum/later migrations/dependencies,
locks and rechecks before a `DROP RESTRICT`, and never uses `CASCADE`.

RLS transaction GUCs scope SQL but do not independently verify the principal. A
compromised API process with the business credential could forge its own context;
startup catalog checks also cannot prevent a DBA changing grants after startup.
Unknown dispatched rows are intentionally not auto-reconciled because the app
cannot prove an upstream provider stopped. The DB ledger bounds active admission
by configured concurrency, but terminal rows are pruned in bounded batches during
later reservations; there is no background scheduler in this phase. Local PG17
tests do not establish Supabase grants, capacity, or cloud rollout readiness.

## ADR-004 verification note

Focused disposable PG17 evidence: migration/rollback tests 4/4, admission DB tests
10/10, and Nest HTTP integration 14/14 on this worktree. The latter used two API
instances, separate real non-owner Auth/business LOGIN pools, real sessions,
membership, RLS, admission, usage persistence and provider wrappers; only external
Auth/SDK/Storage/PDF boundaries were synthetic. Final gates passed: API Vitest
332, API Node 850, web 384 (1,566 application tests total), plus 462/462 PG17
database tests, all with zero failures/skips/cancellations. The full test chain
also exercised runtime RLS, ingestion, OAuth, and migration rollback.

No browser/CUA automation was exposed in the session. Browser success/denial UX
remains pending, so this is not F04 local acceptance. The disposable database and
synthetic provider do not establish Supabase/cloud readiness or a monetary budget.

Known general-chat and document-question provider-call fan-out is stored with
the initial reservation before handler work begins. This rejects a zero fan-out
cap before SSE headers or provider dispatch. A separate database regression
checks that the planned count is already durable at reservation time.

### F04.1 lifecycle/error clarification

Permit acquisition is awaited to completion; a timeout/cancel that fires while
it is pending is recorded as a fulfilled signal, not a detached rejecting promise.
After permit confirmation the wrapper checks that signal before dispatch and
closes the call intent if no SDK work began. SDK promises are converted to
fulfilled response/error values before they race a deadline, so late provider
rejections remain handled. Once SDK dispatch has begun, timeout/cancel remains
conservative and holds the operation slot until provider stop is confirmed.

The provider boundary preserves only known admission/auth error codes with safe
server messages. Unexpected permit/database errors map to
`AI_ADMISSION_UNAVAILABLE`; provider SDK errors continue through their existing
sanitizers. Admission denial is an operation rejection, not a provider attempt,
and is not written as provider-failure telemetry. This does not change the F04
quota, concurrency or fan-out policy.

## ADR-005 — Additive Documents search and pagination

F05 Documents vertical slice, 20/10/2026. The existing full-array
`GET /api/documents` remains intact for Assistant source loading and the legacy
sidebar. The Documents UI uses `GET /api/documents/search` with validated
metadata filters and bounded page/pageSize. This avoids silently changing
legacy consumers to page one while keeping server-side filtering and pagination
for the library screen.

The API freshly authorizes workspace membership in a business workspace
transaction and applies the same explicit workspace/filter predicates to a
single SQL statement that computes total and page rows. Fixed SQL sort
expressions, NULLS LAST and an ID tie-breaker provide deterministic ordering.
Search folds case/diacritics (including Vietnamese `đ`) and punctuation into
space-separated metadata; user wildcard characters do not act as SQL wildcards.
No PDF/chunk content, storage key, AI call or schema migration is involved.

The page is not the Assistant's source universe. Assistant loading remains on
the legacy scoped list. A route focus ID not present on the active result page
uses one scoped `GET /api/documents/:id` and appears in a separate focused card;
it does not alter the paged items or total, and an ID already on the page is
not duplicated. The lookup is aborted/revision-checked across target and
principal changes. F05.2 moves sidebar search to a separately paged endpoint
while the legacy Documents and Assistant list APIs remain unchanged.
Search/pagination on other module screens is explicitly pending.
One-statement consistency is per PostgreSQL statement, not a multi-request
snapshot.

F05.3 begins converting the remaining module screens with additive per-module
search routes instead of changing the legacy list response shape. The Courses
page is the second completed list slice and uses `GET /api/courses/search`;
dashboard tiles and selectors keep the full legacy course list because they
need a complete choice/summary set. Course detail remains a scoped slug lookup,
not a search-page lookup. Items and total share one tenant-scoped SQL statement
snapshot. This decision does not imply that the Exams, Study plans or Expenses
screens are paginated; those remain pending until their slices are implemented.

## ADR-006 — Bounded tenant-scoped workspace sidebar search

F05.2 adds read-only `GET /api/search` for course, exam, study plan, document,
expense and task metadata. The sidebar must not fetch six full lists and filter
them in the browser. Its validated query has a minimum useful trimmed string,
allowlisted type/sort/direction, and bounded page/pageSize; the response returns
the current page and a separately accurate total.

The service obtains workspace/user from the verified principal, re-authorizes
read membership on the same short business workspace transaction, and performs
all six tenant-qualified branches, joins, search filtering, count, sort and
pagination in one parameterized SQL statement. Thus page/count use one database
statement snapshot. A fixed SQL map selects sort expressions; tie-breaks are
stable. The metadata projection excludes document content, chunks, storage
keys, credentials and provider data. Case/diacritic/punctuation folding is
shared with Documents search to preserve its existing Vietnamese search
behavior. Assistant source loading continues using its own legacy source
contract; one sidebar page is never treated as the Assistant's full corpus.

The client debounces requests, aborts superseded reads and also checks a
principal/query/control revision before rendering. Internal routes are formed
only from the result kind and validated route identifier. This ADR does not
add whole-screen search/pagination to the six modules, semantic search,
provider calls or schema migration. Browser interaction and visual acceptance
remain pending until an approved browser automation capability is available.

F05.2.1 preserves the endpoint contract when a query changes: client page state
is scoped to the trimmed query and verified principal, so the new request starts
at page 1 without changing the server's out-of-range-page semantics. If the
existing Vietnamese-friendly fold removes every character from a non-empty
query, the service returns safe 400 `SEARCH_QUERY_UNSUPPORTED` before opening a
workspace transaction. The client displays that condition explicitly. This
does not introduce multilingual search or change the shared Documents folding
behavior.

F05.3 continues the additive paged-list pattern for Tasks, Courses, Exams,
Study plans and Expenses. Legacy array routes remain for separately scoped
dashboard summaries, complete course selectors, or course-workspace sections;
the primary paged screens do not load those arrays to build their lists. In
Expenses, one tenant-scoped SQL statement applies search/date/course/category
filters before page, count, and summary. Exact whole-VND aggregate values are
serialized as decimal strings so totals do not lose precision in JavaScript.
This adds no schema or capability changes. Browser acceptance remains pending;
the decision records a local API/DB/UI contract, not whole-project F05
acceptance.

F05.3.1 clarifies two presentation rules without changing the search/API
contract: a scoped focused card is rendered only while the target is absent
from the current page, and its old lookup state is synchronously masked when
the target becomes listed. If the target later leaves the page/filter, lookup
must be performed again under the current principal. Expense course bars are
normalized against the largest per-course total in the active filtered result;
the “largest expense” summary continues to mean the largest individual row.

## ADR-007 — Manager AI usage dashboard over best-effort telemetry

F06, 21/10/2026. Keep F03 telemetry as the source for the dashboard, but expose
it only through dedicated read-only manager endpoints. Migration 021 grants
column-scoped SELECT to `examate_business` and adds SELECT policies requiring
the transaction-local workspace plus the current manager membership. The
Auth capability receives no telemetry reads. `AiUsageDashboardService`
reauthorizes membership and role in each short workspace transaction; the
business connection remains LOGIN/non-owner/`NOBYPASSRLS`. No elevated or
maintenance connection participates in requests.

The overview uses a single SQL statement for operations, provider attempts,
exact totals, trend, model breakdown and one bounded operation page. The report
range is inclusive calendar dates in `Asia/Ho_Chi_Minh`, translated to UTC
`[from, day-after-to)`, max 90 days; operations cohort on `started_at`, then
expiry filters apply to operations and calls. An exact model filter selects
operations with a matching unexpired call and counts only that model's calls;
without it, all unexpired calls belonging to matching operations are included.
Provider-call drill-down is separately scoped to the current workspace and
bounded to 50 rows per page. Query values and sort fields use strict allowlists.

Tokens and counts that can exceed JavaScript safe integers are serialized as
decimal strings. Null plus sample counts means unknown/missing; zero remains a
known value. Costs use only stored estimates and remain separated by currency
and pricing version. No historical repricing, conversion, prompt content or
user email is exposed. TTFT is explicitly not collected. Summary and totals do
not depend on the current page.

Rejected alternatives: using F04 admission rows would conflate quota state and
usage telemetry; using broad table SELECT would expose request IDs and
unneeded columns; fetching full telemetry into Node would violate bounded
response/snapshot behavior; joining calls directly to operations for the
operation count would multiply operations with fan-out. The UI therefore says
the view is best-effort, incomplete, not a bill and not a quota source. It
cannot represent every pre-telemetry rejection or guarantee live in-flight
counts. Startup capability checks detect drift at process start but do not
prevent an authorized DBA from changing grants afterward. Disposable PG17
evidence does not imply cloud rollout readiness.

### F06.1 — bounded breakdown, cohort fidelity and date domain

The overview no longer carries a `LIMIT 20` cost breakdown. A read-only
`/cost-breakdown` route returns complete totals grouped by currency, with a
separate bounded pricing-version view for one currency. Decimal amounts stay
strings from PostgreSQL `NUMERIC`; each response includes group count, page
metadata and estimated-call coverage, while the pricing-version view includes
the exact all-version total for that currency. It never sums unlike
currencies. Model display is explicitly top 20 with total and omitted
model/call/token coverage. Provider-call detail accepts the already validated
model filter so detail count and items stay in the same selected cohort.

Report dates are restricted to `0001-01-01`…`9999-12-30`. SQL derives the
exclusive upper bound from the PostgreSQL date (`to + 1 day`) only after API
validation; `9999-12-31` is therefore representable as the boundary without
attempting year 10000. Invalid dates fail before workspace/report SQL. This
does not change F03 telemetry, migration 021, RLS/grants, or F04 admission.

## ADR-008 — Private persisted Assistant conversations

F07, 21/10/2026. Persist each completed visible turn in a workspace-and-user
owned conversation, with the canonical feedback snapshot and a foreign key to
the server-issued answer receipt. A single short transaction issues the
receipt and appends the turn, so no client-authored transcript can become
trusted history. When a persistent conversation ID is supplied, the server
rejects a parallel client history and derives follow-up context from the latest
six turns only after validating snapshot shape, receipt owner/workspace/mode,
and canonical hash. Legacy callers without a conversation ID retain existing
receipt verification. Workspace mode may store its displayed exchange but
still does not send prior exchanges to the workspace records query.

Migration 022 gives the business LOGIN capability only the column/table
operations needed for per-owner CRUD; conversation and turn rows require current transaction
workspace/user context and active membership RLS. Auth receives no transcript
grant. The API rechecks membership in each short workspace transaction and
never holds one during AI or other external work. Conversation scope is
immutable. Version compare-and-increment permits only one append from a given
version; a concurrent loser is not persisted and does not trigger a second AI
request. Delete hard-removes transcript rows but leaves receipts and feedback
untouched. A minimal per-user create-key tombstone remains, so a retry after an
ambiguous create or delete cannot recreate the transcript. Retention also
keeps those tombstones. Rolling back migration 022 removes the transcript and
tombstone tables, and the dry-run reports both affected row counts; it does
not remove receipts or feedback.

The client reconciles an uncertain conversation create with an owner-scoped
GET by create key before issuing another create POST. An uncertain turn append
is checked through bounded, paginated message GETs by receipt ID; an explicit
save retry is offered only after the receipt is absent. A failed reconciliation
stays unknown, and neither action repeats the provider request. Switching
principal, opening another conversation, reset, or unmount aborts or invalidates
the reconciliation response.

Content is bounded to 100 turns and 4 MiB of canonical snapshots per
conversation. Expiry is fixed at 90 days after creation in database time and
is not renewed by reads or appends. Expired rows are hidden from runtime even
before cleanup; a bounded, dry-run-first local maintenance command purges them.
Rollback 022 necessarily removes F07 conversation content and therefore needs
an operator-owned disposable target/backup decision; it must not drop or
modify receipts, feedback, documents, Auth or F04/F03 data.

Rejected alternatives: trust client-supplied transcript snapshots; copy the
receipt table into a second mutable history source without hash checks; hold a
row lock over provider work; soft-delete while leaving transcript readable;
or extend expiry on every GET. These weaken the existing receipt boundary,
create a write race, or make deletion/retention semantics ambiguous. Database
RLS protects against missing or incorrect tenant predicates but does not
authenticate custom GUC values against a fully compromised application
process. Disposable PG17 evidence does not imply cloud migration/readiness.

## ADR-009 — Private, evidence-grounded Study Coach quizzes (F08-A)

F08-A stores only quizzes that a user explicitly confirms from a server-issued
draft. Generation uses the existing document retrieval path and structured
Gemini wrapper under a distinct `study_quiz` F03 usage operation and F04
reservation; the planned fan-out is one query embedding and one generation.
Generation takes no browser-authored evidence or model-authored identity,
ownership, URL, or storage metadata. The server rejects malformed/truncated
JSON, unknown fields, duplicate questions/options, incorrect question count,
and citations outside the exact retrieval evidence for that run. A valid
schema/citation is a provenance check, not semantic proof; human review and
the later F09 evaluation remain necessary.

Drafts are owner/workspace bound, store only a hash of the server-issued
confirmation token, and expire after 15 minutes in database time. Confirmation
atomically copies a validated immutable snapshot and changes the draft to a
confirmed tombstone. The draft ID is the idempotency identity; after ambiguous
commit the client performs the token-protected draft GET before any retry. A
deleted quiz leaves its tombstone, so an old confirmation cannot recreate it.
Quiz expiry is fixed at 90 days from save and GET does not renew it. Quiz source
provenance stores document/chunk/page references and a title snapshot, not PDF
text. Missing/deleted sources are displayed as unavailable; opening a PDF must
still pass through current document authorization and fresh URL signing.

The business runtime may create, read, confirm, delete and practice only its
own `(workspace_id,user_id)` quizzes while current active membership RLS is
satisfied. Any active role that can read the source may manage its own quiz;
manager status grants no cross-user transcript/quiz access. The Auth role gets
no table privileges. Attempts contain a server-verified answer map, a digest,
and a server-computed score; the unique per-quiz attempt key makes same-payload
retry idempotent and rejects key reuse with different answers. Practice never
calls AI or admission.

Migration 023 is additive after the immutable 001–022 chain. It introduces
quiz/draft/attempt tables with RLS and narrow grants, and extends the operation
constraints for F03 telemetry/F04 admission without changing their accounting
semantics. Runtime capability v23 fails startup on missing/drifted quiz ACL or
policy; it never repairs grants. Local rollback is dry-run-first, checks
checksums/later migrations/external dependencies under an advisory lock, uses
`RESTRICT`, and reports quiz content/attempts that would be lost. It preserves
all F03/F04/F07 rows. Because the older operation constraints cannot represent
`study_quiz`, rollback refuses once F08 usage/admission rows exist rather than
deleting or rewriting that accounting. Disposable PG17 success does not
establish cloud readiness.

The bounded maintenance command is `npm run f08:retention -- --batch-size=100`
with `TEST_DATABASE_URL` targeting a guarded disposable database. It is dry-run
by default; `--apply --confirm-database=<exact-disposable-name>` is required to
write. It removes only expired quiz/attempt/draft content in bounded batches.
It does not delete receipts, feedback, F03 usage or F04 admission rows. No
cloud scheduler or cleanup was added.

Source-final local verification on 21/10/2026 passed typecheck, all application
tests (1,741), build, format and guarded PG17 database tests (474 tests across
42 serial suites). Runtime integration uses separate business/Auth LOGIN roles
that are non-owner and NOBYPASSRLS; only Auth upstream and provider SDK
transports are synthetic. Browser acceptance and semantic-quality review remain
pending; these local results do not establish cloud readiness or F09 quality.

F08-A.1 verification note (21/10/2026): no schema or migration change was
needed. The web holds an unknown attempt's quiz ID, key, and immutable payload;
only a definite failure followed by an explicit return permits a new attempt.
An unknown draft confirmation keeps confirm/cancel disabled until the owner GET
reconciles it. The GET result is represented as typed state, not inferred from
localized text. Confirmed, draft, and terminal reconciliation outcomes have
distinct UI transitions; terminal recovery remains visible after the preview is
removed. The server detail query now selects title and a tenant/user-scoped
attempt aggregate. Attempt responses include server progress so the open quiz
updates without resubmitting; list refresh remains a separate read. Document
search uses the same bounded server endpoint and rejects stale principal/query
responses. No change was made to quiz ownership, retention, migration 023,
admission, or provider-call accounting.

## ADR-010 — Private evidence-grounded flashcards (F08-B)

F08-B is additive to quiz F08-A. Flashcards use a separate typed API and
contract, `study-flashcards-v1` strict validation, dedicated preview/draft
reconciliation, immutable saved snapshots and learner-authored reviews. Only a
currently authorized stored/ready document may ground generation. Source IDs
must belong to that retrieval run; document/page/chunk metadata is attached by
the server. A schema/provenance pass is not a semantic-quality guarantee.

Drafts, decks and reviews are private to `(verified workspace_id,user_id)`;
manager does not gain another user's flashcards. Migration 024 adds owner RLS,
minimum business column grants and no Auth content access. The F03 operation is
`study_flashcards`, prompt `study-coach.flashcards` / `flashcards-v1`, with at
most one retrieval embedding plus one generation under existing F04 admission.
No retry loop was added. Reads, confirmation, deletion, flip/self-rating and
progress do not call AI. F06 recognizes the operation in its existing usage
dashboard; telemetry remains best-effort and is not billing or the quota
ledger.

Draft tokens are server-issued, stored only as hashes, and expire after 15
minutes by database time. Explicit confirmation is idempotent and leaves a
tombstone preventing stale confirm from recreating deleted content. Saved
snapshots expire after 90 days; reads do not extend retention. Review
submission binds a UUID key to the canonical complete card-ID/rating set; the
server rejects changed payload under the same key, deduplicates concurrent or
replayed submissions, and computes progress. No review scheduling or mastery
score is inferred.

Rollback `npm run f08b:rollback-024` is dry-run-first, disposable-target-only,
checks source checksum/later migrations/capability/dependencies under a lock,
uses `RESTRICT` and warns that flashcard content will be lost. It refuses when
F08-B usage/admission accounting exists, preserving the newer operation
constraints. Bounded retention uses `npm run f08b:retention` and is dry-run by
default; no scheduler was added. Local PG17 integration verified apply,
rollback/reapply, retention, real business/Auth LOGIN separation, RLS,
admission, telemetry and idempotency. Browser acceptance and human semantic
review remain pending; this ADR does not complete all F08 or start F09.

F08-B.1 correction: preview visibility does not own rejection/recovery UI.
Definite confirm/cancel rejection exposes an independent accessible alert and
an explicit draft GET, rather than retrying a write. Only a `draft` read enables
a later explicit confirm/cancel; confirmed/terminal states are accepted as read,
and a failed read keeps unknown-outcome writes locked. Messages use safe
code/status categories, not raw exceptions. This is a frontend lifecycle fix;
ownership, idempotency, retention, schema and admission are unchanged.

## ADR-011 — Authenticated local evaluation without a runtime bypass

F09-A adds a test-owned local adapter to the existing evaluation CLI. Its only
target is guarded disposable PG17; it creates synthetic identities then uses
real password/session HTTP verification and the normal Nest application.
Principals are never accepted from CLI/body/header as verified identities.
Business/Auth LOGINs are separate, non-owner/NOBYPASSRLS, capability checked;
maintenance is limited to seed/observer/assertion/cleanup. Providers are replaced
at SDK transport and Auth upstream boundaries, with external requests blocked.
Production services, authorization, retrieval, admission and telemetry remain
real. No debug endpoint, new grant, migration or live execution unlock is added.

Report schema 4 is additive; historical v3/corpus/gold remain readable and
unchanged. Manifests/runs pin hashes and distinguish executed local contracts,
references, blockers and unattempted cases. A source-backed protocol correction
has its own manifest revision and replacement ID; failed earlier runs are kept.
Local batches stay bounded (10 scenarios/20 synthetic calls), retries are zero,
and the old live caps are unchanged. SDK counters are reconciled with persisted
telemetry, but missing records stay unknown rather than proving free work.
Decimal estimates remain grouped by stored currency/pricing version.

Human packs bind exact run/report/manifest/corpus/output/expected/source pages,
retain blank human reviewer/decision fields and are explicitly synthetic
readiness evidence. Structural/citation/evidence checks cannot establish factual
or pedagogical correctness. Live quality evaluation remains blocked until its
own verified runtime Auth adapter/operational approval exists; F09-A does not
authorize paid calls, cloud writes, human signatures or F10 work.

F09-A.1 clarification: required response contracts are chosen by scenario, not
by optional observed fields. Pure production artifact validators are reused for
the projected Quiz/Flashcards payload, with explicit RAG/refusal checks. Missing
or malformed required output is a machine FAIL; structural correctness cannot
fall back to HTTP status. Non-content/error scenarios remain distinct, and
semantic correctness still requires human review. Negative reports mutate only
copied observations and preserve original telemetry/accounting and run linkage.

F09-A.2 clarification: grounded RAG assessment compares inline source markers
with returned citations, following `AssistantService.validateCitations` rather
than a new rule: every source-like `[S...]` text must be exactly `[S<n>]`, at
least one marker must exist, and the marker ID set must equal the returned
citation ID set; citations still have to belong to observed evidence. These are
machine checks and a failure is FAIL, never semantic-pending; support of a claim
by its source remains human review. Refusals keep their no-citation contract.
Decision: the evaluator is stricter than production on one observed edge (nested
`[S[S1]` passes production's count comparison); production was left unchanged
because this task fixes the evaluator only. Marker mutations change only the
answer text of copied real observations and keep evidence, receipt, telemetry and
accounting identical.

F09-A.3 decision (supersedes the F09-A.2 choice to leave production unchanged):
one citation contract, implemented once in a pure helper that the assistant
service and the evaluator both read. Source-like text is judged whole, so nested,
grouped, zero, leading-zero and descriptive forms are malformed in production too.
A grounded answer needs at least one marker, returned IDs that match `S<n>` and are
unique (the array is checked as returned, never through a Set), and marker IDs equal
to the returned IDs. A refusal carries no citation IDs and no source-like text at
all, well formed or not, on both document paths; the evaluator checks the same.
This tightens the non-stream refusal path to match streaming (it previously
accepted a malformed source-like text and substituted the fixed refusal). Rejected
output is HTTP 502/SSE `error`, never partial content. Sanitizing helpers (history
marker stripping, stream marker filter) are not validators and keep their regexes.
Machine contract failures stay FAIL; claim support stays human review.

F09-B.1 decision: live evaluation goes through the public HTTP API as an
authenticated client, never through the maintenance runner. The legacy
`--execute`/`--transport http` path stays fail-closed; `--http-evaluation` is a
separate mode so a flag cannot silently switch between them. The session, CSRF and
Origin contract of the app is reused unchanged: the runner never supplies a
principal, workspace or role, and no debug route or privilege is added. Credentials
are one JSON object on stdin, read only after the target is validated and only in
preflight/execute. Dry run, preflight and execute are separate opt-ins, and execute
needs the exact plan hash and every quality-execution condition. Corpus provenance
and server admission cannot be observed through permitted HTTP calls, so they are
reported `unverified`, which blocks quality execution instead of being assumed; no
endpoint exposing chunk text was added. The client request cap is not a provider
cap and everything HTTP cannot show stays `unknown`/`unobserved`, never zero.
Generation is one POST per case with no retry and no silent re-login; an outcome
unknown after dispatch ends the run, and a plan that began generating cannot run
again without naming its prior runs. `runCases` gained an optional stop rule whose
default is the historical one.

F09-B.1.1 decision: "an approved plan runs once" is enforced by an atomic,
cross-process reservation, not by reading a ledger. The reservation is an exclusive
file on the existing filesystem (no database, no lock service, no dependency); the
history and the acknowledgement are checked again under it, and the execution intent
is written and synced before the first generation POST. Nothing expires by time: a
crash or an outcome unknown after dispatch keeps the reservation until an operator
names that run, because a lease running out is not evidence that a provider stopped;
only a run that never finished and whose holder is provably gone on this host can be
taken over, and the superseded record is kept. A ledger that cannot be read or written
refuses the dispatch. A response is complete only when its body has been read to the
end under the same deadline as the request: a cut or unfinished body is an unknown
outcome after dispatch that stops the run and is never retried, and it is kept apart
from a fully received body that is not valid JSON, which is a contract failure of a
known answer.

F09-B.1.2 decision (supersedes the single-file reservation of F09-B.1.1): an ownership
protocol must not release or transfer through a shared mutable name. The plan ledger
is append-only: a reservation is an exclusively created record `lock.<n>.json`,
ownership passes only by exclusively creating record n+1, and a finishing run writes a
release or unknown marker addressed to its own record number. Checking the owner just
before an unlink was rejected because it only narrows the window between the read and
the delete. Nothing is deleted, renamed or overwritten, so history, outcomes and
superseded records are kept, a late finish cannot affect a successor, and a crash or a
failed marker write keeps the plan closed. Stale listings can only cause a refusal.
Policy (no lease, acknowledgement for unknown or crashed runs, a live holder is never
taken over, ledger errors refuse) is unchanged.

F09-B.1.3 correction: append-only does not make a partially written marker valid.
Creating a final marker with wx before its write/sync finishes exposed an unsafe
reader decision. Keep reservations unchanged and publish markers in two phases:
an exclusively created preparation is fully written, synced and closed; fs.link
then adds the public name atomically without replacing anything. Both names stay
immutable. Validation binds protocol/plan/kind/seq/runId/timestamp to the record
and checks regular-file identity (nonzero inode/device and link count >=2).
Parsing JSON alone would neither prove publication nor handle sync failures.

The hard-link addition is the commit point, not the writer's return value. Before
it, failures/preparations grant no release/unknown status; after it, a valid marker
can be observed even if the process crashes or loses the link ACK. Never retry a
write of uncertain outcome. Existing history acknowledgements/dead-process rules
remain; unpublished files are not leases and are not auto-deleted. Legacy raw
markers/corrupt public markers require investigation, not silent fallback. NTFS
same-volume hard links were chosen over rename (replacement semantics) or copy
(partial-file visibility). No directory fsync/power-loss, hostile-local-writer or
network-share durability is certified. No schema/service/dependency is added.

F09-B.2A decision: keep draft quality-suite authoring separate from legacy run
definitions. `rag-quality-suite-v1` pins the unchanged synthetic corpus and uses
existing fact-group alternatives, with explicit scope and transport support.
The offline tool reuses the PDF generator/extractor and HTTP eligibility helper,
but cannot execute requests, read credentials or publish ledger records. A suite
may exceed ten cases; each proposed batch remains <=10 requests, and unsupported
cases remain deferred. The current HTTP runner still reads v3, so new IDs have
zero executable support until a later separately approved adaptation.

Gold approval is a pre-execution human decision bound to exact draft/corpus
hashes, separate from model-response semantic review. The tool exports pending
Tài–Thắng forms only; it does not ingest decisions, freeze a suite, attest runtime
provenance or grant execution permission. An unchanged pending template can be
validated; filled forms need maintainer verification in the later approval step.
Machine source/page/hash checks do not certify educational correctness or convert
synthetic examples into real lecturer requirements. No model/gold tuning based on
observed model output took place; B.2A produces no model output.

F09-B.2B.1 decision: runtime provenance is an observation, not a credential. The
auditor compares what is actually stored (Storage bytes by SHA-256, index rows by
chunk) with the output of the production extractor and chunker on those same bytes,
instead of with expected data it generates itself; the earlier local fixture's
unwrapped one-chunk-per-page index is therefore not accepted as production-shaped.
Facts use one versioned rule (`whitespace-collapse-v1`) and nothing else is
normalised, so a text change or a whitespace-only change is still caught by the
exact chunk comparison.

State is read in a REPEATABLE READ, READ ONLY snapshot before and after the Storage
reads, never inside a transaction held during the download, and any difference or
read failure is INCONCLUSIVE. The reader and Storage boundary are explicit
parameters so a maintenance credential never enters the API process; no migration,
grant or RLS was loosened, and the auditor has no provider, quota or write import.
Documents that fail identity are not fetched.

The artifact carries its own limits and fixed non-approvals. Its digest is a
checksum, so the verifier reports `unauthenticated` unless the consumer pins the
digest independently, and `currentness` only against a fresh audit. No boolean or
force flag turns an artifact into readiness. Embeddings are bound by presence,
declared model/dimension and a vector hash only; derivation from the chunk text
is explicitly not claimed. Wiring into the HTTP runner, new-manifest execution and
missing transport are separate, later and unstarted.

F09-B.2B.1.1 decision: a set check that compares only a length and per-entry
membership does not prove coverage, so the verifier validates the audited list as
a one-to-one mapping on the identity `(file, documentId)` (distinct, equal
count, subset), before trusting a verdict or comparing fingerprints, and does so
for both the artifact and the observation. File name alone is not an identity: a
policy and a separately-courseed copy are valid. The check was reduced to three
non-redundant clauses so each is individually load-bearing under mutation; two
guards that no reachable input can exercise (expected-id uniqueness inside an
already-bound mapping, the second identity-set comparison) are kept as
defence-in-depth and documented as equivalent mutants. The fix is not allowed to
require a pinned digest for every artifact or to reject unauthenticated ones: the
checksum, pinned-digest and observation levels stay distinct, and nothing here
grants gold approval or execution.

F09-B.2B.2 decision: the draft quality suite gets its own planner and strict flag
set instead of widening the legacy runner, so the ten-live-case validator and the
legacy defaults are untouched. Request shapes are checked against the assistant's
own DTO and routing rules, and support is derived from what the API accepts, not
from the manifest's draft transport metadata (not edited). A course summary has no
API path and is deferred, never turned into a question. Course scopes are mapped per
file set and checked through the server's own read API, so a policy-only course
holds its own policy copy and cannot share a course id with the two-PDF course.

The evaluator consumes the existing verifier and keeps its answers apart: a bound
artifact, an operator-pinned digest, a fresh observation from a separate
maintenance boundary, gold approval and target equivalence are different facts.
The artifact's own digest is never the pin. Target equivalence stays unverified
because nothing the HTTP surface returns identifies the audited database/Storage,
and two matching declared values prove nothing. Quality mode can plan and preflight
only: execute is refused before any credential, request or record, readiness and
authorization are constants, and generation is counted from the wire rather than
asserted. No maintenance credential enters the evaluator or API process.

F09-B.2B.3 decision: the persistence claim is tested with the real services, not
asserted. A new chain fixture keeps the historic runtime fixtures unchanged and
replaces only what lives outside the process: the Auth upstream, the remote Storage
(a stand-in that stores and returns the exact bytes per key, so a wrong object is
visible), and the SDK transport, whose embedding calls are counted by batch and whose
generation and OCR paths fail loudly. Documents are created by the upload route and
indexed by the processing endpoint; the test source is scanned so that direct writes
to documents or chunks exist only in a marked negative section. Side effects are
accounted per phase from a post-indexing baseline, so upload and processing keep their
legitimate effects and the audit and preflight are shown to add none beyond Auth
bookkeeping. Call counts are derived from the real chunk and batch sizes. The refused
requests that the usage layer records as `rejected` operations are reported as they
are rather than hidden. Same-fixture agreement is not treated as target equivalence,
and no production code was changed to make the chain run.

F09-B.2B.3.1 decision: a claim about initial state is proven on the database, not read
off the source. The chain fixture reused a bootstrap that silently seeded sample rows;
the fix adds an explicit `seedDocuments` option to the shared helper (default unchanged,
so its other callers and their evidence are untouched) instead of seeding and deleting or
cloning the bootstrap. The chain asserts counts before upload, the exact id set after
upload and the chunk owners after processing, so a regression of the same kind fails at
runtime. The source scan is demoted to a supplementary check and guarded against being
vacuous, because it cannot see SQL in a helper. The earlier B.2B.3 text is corrected by a
dated note and left in place.

F09-B.2B.5 decision: separate "may this batch run" from "run this batch". The executor core
only runs a batch whose approval record equals what it recomputes from the plan, and it
delegates authenticity and target equivalence to injected dependencies, because no trust
mechanism exists and a boolean in a file or on the command line proves nothing. The CLI
injects nothing, so it stays closed. The existing ledger is reused unchanged and keyed per
batch, so approval, reservation and history cannot spread across batches or plans. A request
cap is not a provider-call cap and neither is a money cap; the report says so and does not
turn unobserved usage into zero. A well-formed response is never a semantic pass. Synthetic
fixtures exercise the code paths and are labelled as such; they are not approval or
equivalence evidence.

F09-B.2B.5.1 decision: an approval is only as good as the data it is compared with, so the executor
verifies the data first and compares the approval to the verified data, never to values the plan merely
stores. Verification reuses the canonical code (the suite loader and the planner's own assembly) instead of
a second validator that could drift. After verification the run reads only a deep-frozen private copy and
passes clones to callbacks, so a caller changing its objects mid-run cannot change what is sent. Provenance
is tied to the approved suite by hash and verified with the plan's own bytes. Free plan parameters (target,
timeout, batch size, selection) are not derivable from the suite; they are covered by the plan hash and the
approval, and the B.2B.5 wording is corrected to say exactly that.

F09-B.2B.5.2 decision: a snapshot is only a snapshot if it is complete before anything can interleave.
The executor therefore copies every caller-owned input synchronously, before its first await, into
objects and a buffer only it holds, and verifies and uses that one buffer end to end. Freezing is not
used as a claim about buffers. Mutation inside the window is answered by running on the data as it was
at the call or refusing, never by combining the two, and the tests fix the order by running code to the
first await rather than by timing. The B.2B.5.1 wording is corrected to say which stage it protected.

Rubric-readiness decision (23/10/2026): browser acceptance without credentials uses a test-only demo stack
(`apps/api/test/demo-stack-server.mjs`, `compose.demo-stack.yaml`) instead of a flag, a mock mode or a second product path. It runs the
real application and replaces only the four things that need an account — Auth upstream, Storage, embedding and the model — with
synthetic stand-ins that live in test code and are never imported by the application. Rejected: a "demo mode" switch in production code (it
would be a bypass), editing `compose.yaml` (it must stay the real stack), and presenting synthetic answers as model output. The cost is that
this stack proves UI, permission, error-handling and layout behaviour but nothing about model quality or cost; every document that reports
its results says so. Chunk size and model choice still have no recorded rationale and no ADR; the report leaves them for the owners to
write rather than inventing a history.


## ADR-012 — Preserve the existing model/chunk baseline; document rationale (23/10/2026)

Decision: keep `gemini-2.5-flash` generation and `gemini-embedding-001` at existing 768 dimensions for the completion campaign; do not change model to match an example environment file. Flash structured-output support fits strict quiz/flashcard schemas and bounded document answers; official standard text prices checked for the campaign are USD0.30/M input, USD2.50/M output including thinking, and embedding001 USD0.15/M input. Price is an estimate, not a billing cap. Before any paid dispatch, bound actual input/output/thinking and retain conservative reservations when outcome/usage is unknown.

Keep target chunk 1200 characters, max1800, overlap200, page boundaries, default topK6/minScore0.55. Rationale reconstructed from current constraints: page-specific citations need page-preserving chunks; overlap reduces lost boundary context; bounded chunk/context size limits latency/cost. These are starting trade-offs, not measured optimums. No ablation/live baseline has established superiority. Larger context, changed models/dimensions, ANN/ranking changes are rejected in this baseline because they would confound before/after comparison and require re-indexing. This is a present technical rationale drafted by AI, not invented recollection or personal confirmation from Tài/Thắng.

Sources: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [embedding001 announcement](https://developers.googleblog.com/en/gemini-embedding-available-gemini-api/). Code: `document-chunker.ts`, `config.ts`, prompt registry. A later actual comparison must keep corpus/gold/model/config pinned and vary only the declared improvement.

## ADR-013 — Hosted Auth verifier and stop rather than bypass migration ownership (23/10/2026)

Use migration025 to expose only `auth_session_active(uuid,uuid)` in controlled `examate_private`, SECURITY DEFINER with fixed `pg_catalog` search_path and qualified Auth table. Auth LOGIN has USAGE/EXECUTE only and loses raw Auth grants. It returns session/user/expiry validity, no email/token/session row. Supabase-managed Auth ownership and RLS are unchanged; operator credential never enters runtime. Capability v25 pins private function/ACL and detects drift; rollback is local guarded, dry-run-first and RESTRICT.

Hosted `postgres` lacks grant authority over managed Auth schema. Supported reference: [Supabase private-function pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema). On restored PG17 the bridge fixes valid-session rejection under Auth RLS. Local/source catalog ACL ordering uses column name in v25 so physical restored column order cannot change an otherwise identical ACL fingerprint; earlier digests remain untouched.

Cloud017 has another prerequisite: no policy-owner members, followed by function ownership transfer. PG17 creates a bootstrap-superuser ADMIN membership for a non-superuser creator, which that creator cannot revoke ([PG17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html)). Do not edit immutable017, forge its checksum/ledger, suppress RLS or use owner runtime. Stop, preserve backup/fingerprints, remove only our temporary access grant and request supported operator assistance. 016 committed; 017 rolled back; 025 not applied to cloud.

## Completion review authority (23/10/2026)

The user's campaign authorization supersedes internal two-signature gold policy. A separate AI-labelled, hash-bound pre-execution record is accepted for technical gold review. It is not a human signature, target provenance, runtime equivalence or semantic outcome. A pinned operator campaign authorizer covers exact batches but does not replace dispatch accounting, expiry, provenance, target proof or append-only ledger. Historical manifests/gold/results are immutable; no expected result is edited after outputs.

## ADR-014: Separate hosted-PG17 migration profile (23/10/2026)

Use the explicitly named/checksummed `supabase-managed` profile rather than
editing canonical017 or waiting for unsupported bootstrap-grant revocation.
Preserve app table grants/RLS, Auth catalog ownership/ACL/RLS and distinct
non-owner/non-BYPASSRLS LOGINs. Pin managed26 independently from the restricted
installer fixture. Exactly identified postgres bootstrap ADMIN/noINHERIT/noSET
memberships remain a trusted maintenance capability, not runtime inheritance.
Reject other membership options/dual capability paths/effective raw Auth access.

Managed025 supplies private boolean session verification without managed Auth
grant changes. Managed026 restores CONNECT for pre-existing platform roles after
PUBLIC CONNECT revocation in018, so Supavisor/Auth/Storage can open new sessions.
No PUBLIC/anon database access is introduced. Ledger prefix/checksums, atomic
pending install and before-commit hook remain fail-closed. Trade-off: explicit
profile means canonical rollback must not be applied to this cloud history;
future schema changes need deliberate profile review, not silent auto-upgrade.

Cloud26, separate TLS LOGINs, real Docker and Google were verified after backup
and restore rehearsal. Operational recovery and limits: MANAGED-DEPLOYMENT.

## ADR-015 — Phiên làm việc không còn "chớp" khi quay lại tab (26/10/2026)

Quyết định: xác minh lại phiên khi tab lấy lại focus là **việc nền**. Nếu người dùng
đang `authenticated` thì UI không đổi sang `verifying`, không ẩn workspace, không mất vị
trí cuộn. Chỉ `401`, `no_access` hoặc phiên hết hạn mới khóa. Lỗi tạm thời (mất mạng,
5xx) giữ nguyên màn hình và thử lại ở lần kiểm tra sau; `principal` chỉ đổi khi
userId/workspaceId/role đổi thật. Danh sách phân trang giữ hàng cũ khi cùng bộ lọc được
đọc lại (stale-while-revalidate); đổi bộ lọc thì không mượn dữ liệu của bộ lọc khác.

Đánh đổi: bản trước khóa UI ngay khi dịch vụ xác thực gián đoạn (fail-closed ở lớp
giao diện). Lớp bảo vệ thật vẫn ở server (cookie, CSRF, RLS, vai trò): mọi yêu cầu ghi
tiếp theo vẫn bị từ chối khi phiên không còn hợp lệ, và `401` khóa UI ngay. Test cũ khẳng
định "ẩn khi đang kiểm tra" đã được viết lại theo ngữ nghĩa mới. Hai video Firefox của
trang Tasks và Kinh tế vi mô là bằng chứng lỗi; nguyên nhân và regression nằm ở
`use-pilot-session.ts`, `use-paged-search.ts`, `DocumentsPanel.tsx` và các test đi kèm.

## ADR-016 — Ngôn ngữ hiển thị là lựa chọn riêng, không chạm dữ liệu và AI (26/10/2026)

Quyết định: nút VI/EN chỉ đổi **chrome của giao diện** (tên trang, nút, nhãn, gợi ý, thông
báo hệ thống). Mặc định `vi`, lưu ở `localStorage` (`examate-ui-language`), nằm ở trang
đăng nhập và thanh phiên. Không gửi lên server, không đổi nội dung người dùng nhập, tên
tệp, bản ghi đã lưu, câu trả lời AI hay tùy chọn `language` của Study Coach/Whisper. AI
chỉ trả lời tiếng Anh khi người dùng yêu cầu trong câu hỏi, như trước.

Cách làm: từ điển hai chiều khớp nguyên văn (`i18n-dictionary-*.ts`), `useTr()` trong
component và `tl()` cho hook/hàm; bảng nhãn cố định dùng `lazyLabels`. Không có provider
(các test đơn vị) thì mọi chuỗi giữ nguyên như viết trong code, nên các test cũ không đổi.
Một test quét mã và fail khi có chuỗi bọc `tr()/tl()` chưa có trong từ điển. Câu hỏi gợi ý
của Assistant được giữ nguyên vì chúng là nội dung gửi cho AI. Không thêm thư viện.

Lưu ý phạm vi: các chuỗi hiển thị trong `AssistantPanel.tsx`, `SpeechInput.tsx` (phần của
Thắng theo AGENTS) được bọc `tr()`; chỉ là lớp hiển thị, không đổi hành vi giọng nói/RAG.
Thông báo lỗi của `use-speech-input.ts` được dịch tại nơi hiển thị, hook giữ nguyên.

## ADR-017 — Quản lý thành viên bằng migration 027 cộng thêm (26/10/2026)

Nhu cầu: manager thấy và cấp quyền trong ứng dụng; thêm nhiều thành viên cho một nhóm học.
Hiện trạng dữ liệu: workspace **là** nhóm học; mọi thành viên đang hoạt động đọc được môn
học, task, kỳ thi, kế hoạch, khoản chi và **tài liệu do nhau tải lên** (chính sách RLS đã
có từ 017). Riêng từng người: hội thoại Assistant, quiz/flashcards Study Coach (chính sách
owner). Vì vậy không thêm "khu vực riêng" mới.

Quyết định: migration `027_workspace_members.sql` chỉ **thêm** hai bảng
(`workspace_member_profiles`, `workspace_invitations`, RLS bật, không quyền trực tiếp cho
runtime) và 11 hàm `SECURITY DEFINER` (`SET search_path = pg_catalog`). Mỗi hàm tự lấy người
gọi từ `examate.user_id/workspace_id`, kiểm lại membership còn hoạt động, rồi áp luật vai
trò: chỉ manager đổi vai trò/bật tắt/mời/thu hồi; không tự tắt mình; không hạ hay tắt manager
cuối cùng (khóa `FOR UPDATE`, kiểm lại sau khóa); email chỉ manager thấy. Đường đăng nhập
(`examate_auth`) ghi hồ sơ và nhận lời mời theo **email đã xác nhận** từ Supabase `/user`.

Không động tới contract đã pin: các hàm/bảng mới không nằm trong danh mục băm, test
`assertRuntimeCatalogContract` và digest managed `395cff…596c` không đổi (đã chạy trên PG17
canonical và fixture managed `supabase_admin`). Profile managed chấp nhận migration cộng
thêm từ 027 sau 026; 001–026 giữ nguyên checksum. API nhận biết tính năng (`to_regprocedure`,
cache 30s/5 phút): DB cũ trả `available:false`, các thao tác ghi trả 503
`MEMBERS_UNAVAILABLE`, đăng nhập không đổi. Rollback: `infra/postgres/rollback/027_*.sql`
(có test). **Đã áp dụng lên cloud ngày 26/10/2026 theo yêu cầu của chủ dự án** (preflight
ledger 26 → backup `public` → profile managed → ledger 27, digest vẫn `395cff…596c`,
dòng dữ liệu nghiệp vụ không đổi, ACL kiểm lại); stack `examate-final-live-20261023` được
build lại từ code mới.

Đánh đổi: `session()` gọi thêm một giao dịch ngắn sau khi xác minh (có throttle 10 phút/user
và bỏ qua khi chưa có 027); mọi lỗi ở bước này bị nuốt để không bao giờ làm hỏng đăng nhập.
Lời mời không gửi email (không thêm nhà cung cấp mail); manager nhập đúng email người đó dùng
để đăng nhập. Người đăng nhập mà chưa có quyền hiện trong "đang chờ cấp quyền" để manager
cấp bằng một nút. CLI `pilot:membership` vẫn là đường dự phòng của người vận hành.
