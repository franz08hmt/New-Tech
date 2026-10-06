# Pilot — Chặng 1a: cổng đăng nhập và session

Ngày 06/10/2026, nhánh `feature/tai-rag-integration`, bắt đầu tại `7e7978b`.
Tài duyệt Chặng 0 và yêu cầu hai commit 1a/1b. Đây là báo cáo 1a; refresh,
throttling, đồng bộ tab và lưu notes theo principal được bàn giao ở 1b.

## Hành vi và phạm vi

API dùng Supabase Auth REST qua adapter DI, không thêm dependency, không tự
verify chữ ký JWT hoặc băm mật khẩu. GET `/api/auth/session` tạo pre-session
10 phút và synchronizer CSRF. POST login kiểm Origin/CSRF trước Auth, xác minh
`/user`, đổi cookie/CSRF và lưu token bằng AES-256-GCM chuẩn Node: IV 12 byte
random, tag 16 byte, AAD gồm cookie hash/key version. DB chỉ giữ SHA-256 opaque
cookie; password không được lưu. Session absolute 8 giờ, idle 30 phút; chỉ
request thay đổi dữ liệu hợp lệ cập nhật idle, không polling.

Cookie HTTPS `__Host-examate_session; Path=/; HttpOnly; Secure; SameSite=Lax`,
không Domain. HTTP dev chỉ localhost/loopback, tên cookie riêng và API bind
loopback kể cả NODE_ENV production. HTTP IP LAN không phải cấu hình pilot.
Không có switch tắt auth. FE dùng same-origin fetch, không giữ token trong
localStorage, URL hoặc bundle. CORS hiện không cho cross-origin credentials;
deployment phải proxy FE/API cùng origin. Không tin header X-Forwarded-For.

Global guard kiểm local session, verified identity và membership active của
workspace cấu hình server. Principal/role không lấy từ client. Chỉ Health và
Auth controller được miễn guard; Auth routes có kiểm riêng. Public health chỉ
trả readiness, không diagnostic DB/config. Mọi controller nghiệp vụ, Assistant,
feedback và Storage-signing phải qua guard; CSRF áp dụng write/AI POST và GET
ký URL. GET same-origin có thể thiếu Origin, khi đó chỉ route ký URL được dùng
Referer có origin khớp, vẫn bắt buộc CSRF token và kiểm Sec-Fetch-Site.

401: AUTH_REQUIRED/AUTH_INVALID/SESSION_EXPIRED/SESSION_REFRESH_REQUIRED;
403: CSRF_INVALID/WORKSPACE_ACCESS_DENIED; 503: AUTH_UNAVAILABLE, gồm lỗi DB
trong ranh giới auth. Auth/DB/config lỗi fail closed. Logout revoke local DB
trước khi gọi upstream; lỗi upstream báo `upstreamRevoked=false`, không nói
đã logout mọi thiết bị. DB revocation lỗi không xác nhận logout.

FE khóa trước khi có session và membership, có form email/password, trạng thái
xác minh/thiếu quyền/hết hạn/gián đoạn, retry/logout. Workspace đang dùng được
ẩn và inert khi session lỗi để giữ bản nháp trong tab; đổi principal remount,
logout dọn state. Sai mật khẩu giữ form dùng được. Ghi chú legacy `examate-notes`
không được đọc/gán cho user; có thông báo tiếng Việt. 1a notes mới chỉ trong tab;
1b mới bổ sung namespace principal. Inputs/buttons mới tối thiểu 44px, label,
status/alert/focus-visible và Heroicons outline. Chưa có bằng chứng kích thước
pixel hoặc keyboard trên browser thật.

**Chặng 1 chỉ là authentication + membership gate**: thành viên được cấp vẫn
có quyền demo hiện tại. Chưa áp role matrix, scope từng record/RAG, ownership
feedback hoặc hạn mức AI. Chưa được dùng kết quả này để công khai pilot.

## Cache, đo lường và quyền auth.sessions

DOM fixture của default App ghi nhận một tải Dashboard gồm 8 request:
session, exams, courses, study-plans, courses, tasks, documents, courses.
Các lượt courses lặp do hook hiện có; không refactor chúng trong Chặng 1.
Harness API mô phỏng cùng 8 request tuần tự, Auth delay 20ms: không cache gọi
`/user` 8 lần, cache 30s gọi 1 lần; duration thực của mock được lưu trong
`artifacts/pilot-stage-1-auth-mock-measurement.json`. Đây **không phải latency
Supabase hoặc browser thật**; real page/Auth measurement BLOCKED chờ config.

Default `AUTH_VERIFY_CACHE_SECONDS=30`, cho phép 0–30, chỉ cache verify thành
công, có giới hạn 1.000 entries và coalescing request đồng thời. Không cache
lỗi, membership hay DB/local session. Cache hết hạn + Auth lỗi => 503. Cache
không kéo dài quá token expiry. Thu hồi trạng thái chỉ được Auth biết có thể
trễ tối đa TTL 30s; nhiều instance có cache riêng. Local revoke/membership và
`auth.sessions` vẫn SELECT mỗi request nên không đợi cache trong các trường
hợp đã được DB phản ánh. Cần đo lại bằng tài khoản thật trước nghiệm thu pilot.

Mặc định `AUTH_SESSION_VERIFICATION=database`: runtime role cần **USAGE schema
auth** và **SELECT(id,user_id,not_after) ON auth.sessions**, ngoài quyền private
app tables. Chưa xác minh quản lý Supabase có cấp được cho role mới. Không tự
GRANT trên DB dùng chung và không tự chuyển phương án khi permission denied.

Phương án dự phòng đã chuẩn bị: `AUTH_SESSION_VERIFICATION=auth_user`, vẫn
kiểm `/user`, local session và membership; không SELECT auth.sessions. Source
Auth upstream hiện kiểm session tồn tại tại middleware authentication trước
`/user`, cũng kiểm user bị banned. Đây là quan sát **upstream master**, không
xác nhận version deployed hoặc `not_after` semantics của project thật.
[Source Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/auth.go),
[Auth sessions](https://supabase.com/docs/guides/auth/sessions),
[getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
**Quản lý phải quyết định** và kiểm token thật sau revoke/expiry trên project
trước chọn `auth_user`; nếu không chứng minh được, giữ database/fail closed và
BLOCKED. Không nhận decode JWT độc lập là verified session.

## Migration và file của Thắng

Migration mới `012_pilot_access.sql`, không sửa 001–011, chưa áp dụng thật:
workspaces, workspace_memberships, pilot_sessions; không seed user/workspace
hoặc backfill dữ liệu nghiệp vụ. RLS bật, revoke PUBLIC/anon/authenticated.
Workspace/membership FK RESTRICT để không cascade dữ liệu nhóm; session user
SET NULL và guard từ chối principal thiếu. Runtime role non-owner cần grants
và policy backend private được quản lý duyệt; RLS bật không tự cấp quyền hoặc
thay guard. Owner/BYPASSRLS cũ không thành least privilege nhờ migration này.

Runtime BE cũ chạm tối thiểu: `app.module.ts` đăng ký auth/guard; `main.ts`
ràng buộc loopback HTTP; `health/health.controller.ts` bỏ diagnostics public.
Không sửa service Assistant, Gemini, retrieval, OCR, Storage hoặc validator.
Contracts chỉ `.d.ts`; FE App/api/AcademicPanels nối gate và cách đọc notes.
Test helper override AuthService qua DI chỉ trong test regression nghiệp vụ;
test auth dùng AuthService/guard thật với mock Auth/store. Không bypass runtime.

## Bằng chứng và gates

Baseline root: typecheck/test/build/format đều exit 0; **522 pass** = API Vitest
197 + node:test 181 + web 144; fail/skipped/cancelled 0. Logs riêng
`artifacts/pilot-stage-1-baseline/`.

RED thực: missing-session 200→401; missing-CSRF login 404→403; FE không có login
gate; Auth login outage 500→503; logout trường thừa 200→400; same-origin ký URL
GET có CSRF/Referer 403→404 của missing document; invalid-password làm biến mất
form; public health lộ diagnostic; privileged Auth key chưa bị từ chối. Các
test này đã GREEN. AES tampering, provider spoofing, scope header spoofing,
cache, SQL-bound parameters và schema static checks thêm và xanh ngay; không
nhận chúng là RED. Mock adapter test ban đầu restore fetch sai gây thêm lỗi
fixture và tiến trình chờ; đã sửa, dừng tiến trình cũ, không nhận đó là RED code.
Node import trong test FE gây typecheck lỗi; bỏ filesystem import, giữ assertion
inventory và chạy lại. Giữ logs thất bại, không ghi đè artifact lịch sử.

Final root: `npm run typecheck`, `npm test`, `npm run build`,
`npm run format:check` đều exit 0; **542 pass** = API Vitest 197 + node:test 196

- web 149; fail/skipped/cancelled 0. Logs `artifacts/pilot-stage-1a-complete-*`.
  Mock page benchmark của run cuối: 224ms/8 lượt `/user` với TTL 0, 20ms/1 lượt
  với TTL 30s; mẫu nhỏ và giả lập, không phải p95/SLA hoặc Auth thật.
  Format helpers từng lỗi sau lần format root; format đúng workspace API rồi
  gate cuối xanh. Không viện lỗi format cũ hoặc sửa hàng loạt ngoài phạm vi.

Commit này có message `feat(auth): gate pilot access with encrypted sessions`;
hash được liệt kê trong báo cáo 1b vì commit không tự chứa hash của chính nó.

Không có DB/schema integration thật, Auth HTTP thật hoặc browser thật: **BLOCKED**
do chưa được cấp account, Auth publishable/anon key, encryption key, workspace
UUID; user cấm migration thật/Google. Không có browser tool phù hợp; Chrome
launch đã bị policy chặn ở đợt trước, không thử vượt. HTTP tests dùng Nest listen
loopback random port và mock dependencies, không phải Supabase/live pilot.

RAG vẫn E01/E04/E07/E16 REVIEW_REQUIRED, E17 BLOCKED AI_UNAVAILABLE (không suy
ra quota/retrieval); E01 thiếu qualifier minh họa theo rubric, chưa human ký.
Corpus ASCII chưa chứng minh PDF tiếng Việt có dấu/scan. Browser Đợt 4/5 còn
chưa nghiệm thu trực tiếp. Không đổi model/prompt/ranking/chunking/gold/history.
Không deploy/push/merge hoặc gọi Google. File untracked prompt cũ và
`.claude/settings.json` được giữ nguyên.

Rollback: giữ dịch vụ khóa tại proxy, rollback binary về bản auth còn an toàn;
giữ additive schema và dữ liệu, không drop/reset hoặc quay demo vô auth ra mạng.
Sau commit 1a tiếp tục đúng 1b đã được yêu cầu; không bắt đầu Chặng 2.
