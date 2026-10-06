# Pilot — Chặng 1b: refresh, throttling và trạng thái theo principal

Ngày 06/10/2026; nhánh `feature/tai-rag-integration`. Chặng 0 `7e7978b` được
Tài duyệt, 1a đã kiểm chứng/commit `8cb4710`; xem [báo cáo 1a](pilot-stage-1a-report.md).
Commit 1b có message `feat(auth): refresh pilot sessions and isolate account state`;
hash cuối được báo khi bàn giao, không thêm commit thứ ba để ghi self-hash.

## Kết quả code

POST `/api/auth/refresh` dùng cookie/CSRF và `SELECT ... FOR UPDATE` trên session.
Sau khi lấy khóa, kiểm lại revoke/idle/absolute expiry; request chờ nhìn thấy
token đã xoay thì không gọi refresh lần hai. Native Auth REST refresh grant
và `/user` xác minh principal/session_id; token mới mã hóa AES-256-GCM, version
tăng, COMMIT trước khi dùng. Không đổi cookie/CSRF lúc refresh để các tab không
cạnh tranh cookie. Không gia hạn idle bởi background refresh; absolute vẫn 8h.

Một durable intent `(cookie_hash,version)` được INSERT/autocommit **trước**
dispatch Auth, trong lúc transaction chính giữ khóa dòng. Intent không chứa
token, câu hỏi hay email và không FK session: FK có thể chờ chính row lock đang
giữ. Nếu provider/verify lỗi, commit local revocation và trả AUTH_UNAVAILABLE.
Nếu process chết hoặc COMMIT không rõ kết quả, intent vẫn tồn tại: lần refresh
sau cùng version không gọi lại token cũ, revoke local và yêu cầu login lại.
Không tự retry provider hoặc giả recovery chắc chắn. Test mô phỏng COMMIT lỗi
chứng minh old refresh token chỉ dispatch một lần.

Cần pool ít nhất 2 connection cho intent độc lập, default hiện 5; config pool
1 bị từ chối ở auth. Bão refresh có thể làm pool/row-lock timeout: fail closed,
không dùng token mới trước COMMIT; đây là giới hạn còn cần kiểm disposable DB.
Provider timeout từng Auth call 5s, không retry. Row lock có thể giữ qua refresh
và verify; query timeout DB hiện 5s nên waiter có thể trả 503 khi provider chậm.
Không tuyên bố multi-instance race hoặc recovery đã được chứng minh trên DB thật.

FE bootstrap expiry → CSRF POST refresh; timer trước access expiry một phút và
focus/visibility xác minh lại session. Lỗi giữ workspace hidden/inert và bản
nháp của cùng principal; không tự replay chat/upload/write/feedback đang gửi.
Epoch bỏ response cũ khi logout/session thay đổi, logout dọn principal và state
workspace. BroadcastChannel chỉ gửi `logout`/`session_changed`, không token,
identity hay source. Nếu không có/không tạo được channel, storage event chỉ
chứa type + nonce rồi xóa ngay; không lưu session/chat. Nếu cả hai không dùng
được, focus/visibility và backend guard vẫn kiểm session; không hứa revoke tức
thì mọi tab. Tab nhận sự kiện khóa và bỏ principal, cần kiểm lại bằng backend.

Notes dùng key `examate-notes:<workspace UUID>:<verified user UUID>` và remount
workspace khi principal đổi. Cùng principal reload đọc lại notes, principal
khác không thấy notes đó. Legacy key giữ nguyên/ẩn và thông báo tiếng Việt;
không migrate/gán chủ sở hữu. Notes vẫn localStorage như thiết kế cũ: namespace
là cách tách UI, **không phải encryption hoặc bảo mật trước XSS/devtools trên
cùng browser**. Không thêm persistence cho hội thoại hoặc feedback draft.

## Throttle và migration

Migration mới `013_pilot_auth_limits.sql`, chưa chạy thật: `pilot_auth_limits`
và `pilot_refresh_attempts`, RLS bật, revoke PUBLIC/anon/authenticated; không
seed, FK cascade, backfill hoặc thay bảng evaluation/feedback/nghiệp vụ.
012 đã commit giữ nguyên. Chặng 2 phải chọn số migration kế tiếp thực tế,
không lấy số 013 giả định của thiết kế snapshot.

| Admission                  | Default / window 900 giây |
| -------------------------- | ------------------------- |
| Login theo email chuẩn hóa | 5                         |
| Login theo IP socket       | 20                        |
| Login toàn API pilot       | 100                       |
| Tạo pre-session theo IP    | 60                        |

Config trong `.env.example`, không có giá trị bật vô hạn/tắt guard. Counter
PostgreSQL fixed-window theo clock DB/epoch UTC; default ranh :00/:15/:30/:45.
Email/IP chỉ thành HMAC-SHA256 có domain prefix với server key, không lưu hoặc
log raw identifier/password. X-Forwarded-For không được tin, Express không
bật trust proxy. Sau reverse proxy mọi client có thể chung IP proxy; cần chốt
deployment/proxy và đo trước rollout, chưa cấu hình tin proxy tùy ý.

Mỗi admission dùng transaction, key lock order ổn định, INSERT ON CONFLICT
UPDATE có điều kiện `hits < limit`; nếu một cap hết thì rollback cả admission,
không read-then-write và không phụ thuộc RAM service. Attempts đã admitted,
kể cả sai password/Auth lỗi, vẫn tính. Request bị từ chối không gọi Auth.
429 LOGIN_RATE_LIMITED trả retryAt từ DB; FE hiển thị giờ tiếng Việt. Bootstrap
bị cap không tạo thêm session row. Các cap này là **Auth admission**, không
phải AI budget/usage/billing của Chặng 3.

Không tự cleanup DB ở lượt này. Quản lý cần lập retention: giữ intent của các
version/session còn có thể refresh; chỉ purge theo session đã hết hạn/revoked
sau grace được duyệt. Không xóa intent hiện hành để thử lại token cũ. Counters
window cũ/session hết hạn có thể cần maintenance có giới hạn; chưa có job chạy
vô quyền. Dữ liệu nhóm, PDF/chunks/course association và historical runs giữ nguyên.

Auth REST body được đọc streaming tối đa 64.000 byte và cancel khi vượt;
provider errors không trả/log payload. Envelope decrypt limit thống nhất với
DB 65.536 byte, nhận được hai Auth token tối đa 16.000 ký tự; tamper/AAD/key
version sai fail closed. Không tự viết JWT verifier/password hash/dependency.

## Kiểm chứng

| Gate root    | Trước lượt này   | Sau 1a           | Sau 1b           |
| ------------ | ---------------- | ---------------- | ---------------- |
| typecheck    | exit 0           | exit 0           | exit 0           |
| npm test     | exit 0, 522 pass | exit 0, 542 pass | exit 0, 562 pass |
| build        | exit 0           | exit 0           | exit 0           |
| format:check | exit 0           | exit 0           | exit 0           |

Final 1b: API Vitest **197**, API node:test **209**, web **156**; fail/skipped/
cancelled **0**. Root logs `artifacts/pilot-stage-1b-final-*` (local/ignored).
Format Markdown riêng cũng được kiểm. Test code/mock thực chạy; không lấy số
test của chat cũ làm kết quả. 1a gates là baseline mới cho lát 1b.

RED → GREEN 1b thực: refresh 404→200; uncertain refresh 404→503 và revoke;
throttle 401→429 trước Auth; notes chưa có namespace; bootstrap expiry chưa
refresh; thiếu logout channel; thiếu fallback storage; body oversized chưa
cancel; hai token max-length seal được nhưng decrypt từ chối. Logs RED riêng
`pilot-stage-1b-red-{api,web,storage-fallback,auth-body-limit,token-envelope}`.
Các test bổ sung về COMMIT uncertainty, concurrent admission/recreated service,
SQL-bound locks/counters, schema privacy, cached Auth + DB permission denied,
HTTPS cookie/duplicate/absolute expiry, log redaction, 25 protected business
routes, notes reload/đổi principal, malformed session và focus revoke xanh ngay;
không nhận là RED. Typecheck lỗi useRef ban đầu đã sửa, giữ log, không gọi đó là
test RED hành vi. Existing evaluation/feedback/source/chat regression vẫn xanh.

Đã thực hiện HTTP thật tới Nest loopback/random port với Auth/store/provider
**mock**, không HTTP Auth Supabase thật. DB concurrency test dùng memory store
và SQL/transaction spies, không giả làm PostgreSQL integration. Auth page mock
8 requests: không cache 8 `/user`, cache 30s 1; run cuối 198ms/34ms với injected
20ms delay, không p95/SLA. Real page/Auth latency/count vẫn **BLOCKED** chờ config.
Cache chỉ thành công tối đa 30s; revocation chỉ được Auth biết có thể trễ tối đa
TTL, local session/membership/auth.sessions vẫn đọc DB từng protected request.

**DB/migration/Auth thật BLOCKED**: user cấm áp migration thật và chưa cấp
account, publishable/anon key, encryption key, workspace UUID. Không truy cập
DB thật để tạo identity/grant/policy hoặc thử constraints, không gọi Google.
**Browser thật chưa kiểm** desktop/375px/keyboard/pixel/source/feedback; session
này không có browser automation tool, lần launch Chrome trước bị policy chặn,
không vượt policy. DOM fixtures và CSS min-height 44px không thay browser evidence.

## Bàn giao và điểm dừng

Quản lý phối hợp Thắng kiểm target/backup/migration role và quyền REFERENCES
auth.users; cấp workspace/user UUID, private key qua cấu hình server, test
accounts không mạo danh. Chỉ apply 012/013 bằng runner checksum khi được yêu cầu
riêng. Runtime non-owner cần grants/policies private cho bảng auth app; thiết kế
Chặng 2 mới chốt role/scope/RLS nghiệp vụ. Không cấp mọi authenticated user.

Default database verification cần **USAGE schema auth + SELECT(id,user_id,
not_after) ON auth.sessions**; grantability role mới chưa xác minh. Không có
automatic fallback khi permission denied. Phương án `auth_user` đã có code
opt-in nhưng **quản lý phải quyết định sau kiểm deployed /user revocation/
expiry**; source upstream kiểm tồn tại session không chứng minh version/semantics
project thật. Nếu thiếu bằng chứng giữ default và BLOCKED; chi tiết/source ở 1a.

1b chỉ sửa các file auth mới của 1a, shared contracts, FE pilot/api, fixture và
migration mới; không chạm thêm runtime Assistant/RAG/Storage của Thắng. Hai
commit tổng thể sửa BE cũ `app.module.ts`, `main.ts`, Health controller đúng
lý do ở 1a. Không đổi model/dimensions/prompt/ranking/chunking/OCR/citation
validator/gold/history. Không làm role matrix, data scope, own-answer receipt,
AI counters, signup, admin UI hay deployment.

RAG vẫn E01/E04/E07/E16 REVIEW_REQUIRED, E17 BLOCKED AI_UNAVAILABLE; E01 thiếu
qualifier minh họa, chưa Tài/Thắng ký semantic PASS. Browser Đợt 4/5 vẫn thiếu
nghiệm thu trực tiếp, corpus ASCII chưa chứng minh accented/scan extraction.
Dry-run checkpoint mismatch đã được sửa trước Chặng 1, regression/candidate
guard giữ nguyên, không sửa artifact/gold để đổi verdict.

Code/tests Chặng 1 hoàn thành bằng mock; luồng pilot thật, RAG human review và
deployment là ba kết luận chưa hoàn thành riêng. Rollback giữ proxy đóng và
schema/dữ liệu, không quay demo vô auth ra mạng. Review/stage đúng scope,
không `.env`, artifacts, prompt untracked cũ hoặc `.claude/settings.json`.
Sau commit tracked tree sạch, chỉ prompt untracked có trước; hash/status được
đối chiếu lúc bàn giao. Không push/merge/deploy, không migration thật/Google.
**DỪNG sau 1b chờ Tài; Chặng 2 chỉ bắt đầu khi có yêu cầu tiếp.**
