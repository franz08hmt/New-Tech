# Quyết định kiến trúc ExaMate

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
