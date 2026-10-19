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
