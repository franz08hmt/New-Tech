# Đăng nhập demo ExaMate — Tài và Thắng

Checkpoint bootstrap ngày 17/10/2026. App chỉ chạy local tại
`http://127.0.0.1:5173`, dùng Supabase chung. Đây là hướng dẫn chạy **sau bootstrap**;
không cần tạo account, tự tạo workspace, chạy migration hoặc thao tác Dashboard.

## Đã làm trên máy quản trị

- Backup schema/data `public` bằng postgres:17, TLS verify-full; archive đọc được.
  Backup không gồm Auth, Storage, roles hay nội dung file PDF trong bucket.
- Áp 012–015 qua runner có sẵn; ledger `001`–`015` và checksum đã verify.
- So sánh count và fingerprint toàn bộ trường cũ của 9 bảng nghiệp vụ: không đổi.
  Workspace/attribution mới được loại riêng khi so; mọi row scoped thuộc workspace nhóm.
- Tạo **4 account demo riêng**, không phải xác minh danh tính/email cá nhân:
  Tài `manager`, Thắng `member`, `viewer` và `no-membership`.
- Cấp đúng ba membership; account no-membership không có membership.
- Auth config local hợp lệ. Workspace/session key tạo một lần, giữ ổn định.
- Kiểm HTTP thật qua Vite → Nest → Supabase Auth: đăng nhập/sai password,
  principal/role/workspace, reload session, quyền đọc/ghi/xóa, Origin và logout.
- Kiểm form đăng nhập qua browser tích hợp ở desktop và 375px: form hiện, không
  tràn ngang, console không lỗi/cảnh báo. Chưa kiểm browser login bằng password
  hoặc máy Thắng thật; không dùng kết quả HTTP thay hai kết luận đó.

Không sửa thuật toán RAG, FE/BE runtime, model, dependencies hoặc migration SQL.
Runtime DB vẫn BYPASSRLS; tenant RLS/least privilege, budget AI, Auth extended và
semantic RAG không được nghiệm thu chỉ nhờ bootstrap này. Chỉ dùng dữ liệu demo.
Credential đã từng được gửi vào chat vẫn có rủi ro; Tài yêu cầu chưa rotate.

## Bàn giao private — không đưa vào Git/README

Trên **máy Tài**, operator đã tạo các file trong thư mục ignored:
`D:\New-Tech\Final-Project\artifacts\pilot-private-bootstrap-20261017-013714\`.
Đây là vị trí ở checkout cũ, không tự được sao chép sang worktree mới.

Chỉ chuyển cho Thắng qua kênh riêng được nhóm cho phép:

1. `login-thang.private.json`: email và mật khẩu của **account member** dành cho Thắng.
2. `thang-auth.private.env`: năm biến Auth dùng cùng project/workspace/session key.

Không gửi `demo-credentials.json` hoặc `login-tai.private.json` cho người dùng
member/viewer. Không gửi cookie, backup DB hoặc cả `.env` của máy Tài. Các file
không có trên Git; `git pull` không lấy được chúng. Bảo vệ quyền truy cập file
trên máy nhận, không đồng bộ công khai hoặc chụp ảnh giá trị.

Account demo dùng địa chỉ không nhận thư, mật khẩu ngẫu nhiên. Không dùng chức
năng email recovery cho các account này. Nếu mất file, liên hệ quản trị viên;
không tự tạo user trùng hoặc reset password khi chưa xác định đúng account.

## Thắng chạy trên máy của mình

1. Mở đúng repository, dùng nhánh **`feature/tai-assistant-integration-20261018`**
   đã được push sau tích hợp. Kiểm `git status` trước cập nhật; bảo toàn WIP,
   không `reset --hard` hoặc pull đè nhánh đang phân kỳ. Nếu checkout cũ đang có
   WIP, dùng worktree/checkout riêng. Trên máy Tài, folder phát triển mới là
   `D:\New-Tech\Final-Project-integration-20261018`; máy Thắng dùng root clone của
   mình trên đúng nhánh. Xem [context hiện tại](PROJECT-CONTEXT.md).
2. Giữ `.env` riêng đang có cho DB/Storage/Gemini và CA đúng máy. Gộp năm biến
   từ `thang-auth.private.env` vào `.env` **root repository**, mỗi biến một dòng;
   không copy đè cả file, không để biến trùng, không tạo lại session/workspace key.
3. Dùng đúng cấu hình công khai sau. Không mở web bằng `localhost` hoặc cổng 8080
   cho đường chạy dev trực tiếp này.

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://127.0.0.1:5173
ALLOWED_ORIGINS=http://127.0.0.1:5173
AUTH_SESSION_VERIFICATION=database
TRUSTED_PROXY_IP=
```

4. Nếu chưa có dependencies, chạy `npm ci --ignore-scripts`. Node khuyến nghị 24.15+ thuộc nhánh
   24 theo README; máy kiểm lần này dùng 24.13.0. Không tự đổi dependency/lockfile.
5. Chạy từ root, preflight phải exit 0:

```powershell
npm run pilot:preflight
```

6. Chạy hai terminal từ cùng root; chỉ một API và một Vite:

```powershell
# Terminal 1
npm run dev:api
# Terminal 2
npm run dev:web
```

7. Mở `http://127.0.0.1:5173`, nhập email/password trong
   `login-thang.private.json`. Đây là account ExaMate demo, **không phải** tài
   khoản quản trị Supabase Dashboard hoặc mật khẩu database.

Docker không bắt buộc cho React/Nest kết nối Supabase cloud. Không chạy
`db:migrate` hoặc cấp membership lại trên máy Thắng; schema/membership đã có.

## Checklist xác nhận trên máy Thắng

- Ghi commit thực chạy; preflight exit 0, stage012–015/checksum/config/grants đạt.
- Form có Email/Password, không còn trạng thái “chưa xác minh được phiên”.
- Đúng password vào workspace; sai password bị từ chối, không thử liên tục.
- Reload vẫn đăng nhập; Tasks/Courses/Documents đọc được.
- Member tạo/sửa task demo được; thao tác xóa chỉ dành manager bị chặn.
- Logout quay về gate; không truy cập được workspace khi đã logout.
- Kiểm desktop/375px nếu có thể; không gửi password/cookie/network payload.

Tasks API hiện không có DELETE route: phép kiểm member-delete thực tế dùng Exams,
không diễn giải 404 của route không tồn tại thành bằng chứng phân quyền 403.
Các task/exam thử do operator tạo trong bootstrap đã được cleanup đúng record;
không xóa dữ liệu có sẵn để tự kiểm lại.

Chưa có bằng chứng từ máy Thắng thì trạng thái vẫn
`REMOTE_MACHINE_NOT_VERIFIED`, dù HTTP Auth thật trên máy Tài đã đạt. Refresh
token hết hạn thật, Dashboard sign-out/revoke, account-swap/2-tab UI và lỗi API
giữa chừng vẫn là checklist Auth mở rộng, không nhận PASS từ unit test.

## Nếu vẫn lỗi

- `EADDRINUSE`: có API đang chiếm cổng, kiểm đúng process; không chạy thêm API.
- Session 503: chạy preflight; kiểm đúng root `.env`, process env ghi đè, CA,
  DB/project và restart API sau sửa config. Không tắt guard/CSRF/TLS để vượt lỗi.
- `AUTH_INVALID`: dùng đúng account demo/password, không dùng DB password.
- `no_access`: đối chiếu account và membership bằng quản trị viên; không tự GRANT.
- Gửi lại status/code/Request ID và commit, không gửi `.env` hoặc ảnh chứa key.

Nguồn API quản trị: [Supabase createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
Nhật ký cũ: `git show e9ac2af:docs/PHASE-13-B1-TWO-MACHINE-AUTH-REPORT.md`.

## F01 — Google không thay account demo cũ

Google qua Supabase PKCE và server session hiện có; email/password là fallback.
Không copy cookie/token/Google secret giữa hai máy. Google identity phải được
owner kiểm bằng Supabase user ID và cấp membership sau duyệt; không match
nickname/email để thừa kế quyền. Xem [runbook F01](PILOT-B1-RUNBOOK.md).
016 chưa được code run áp cloud; đừng bootstrap lại. Fixture local không thay
Google live hoặc nghiệm thu trên máy Thắng.
