# Audit source và baseline — 13/09/2026

Thư mục làm việc là bản giải nén `New-Tech-feature-tai/New-Tech-feature-tai`. `git status --short` trả `fatal: not a git repository`; không có `.git`, không tạo repo/commit/push. Không tìm thấy AGENTS.md ở source và các thư mục cha đã kiểm tra. Không có `.env`, DATABASE_URL, TEST_DATABASE_URL hoặc SUPABASE credentials trong môi trường ban đầu.

Đã đọc package/lockfile, API main/module/database/tasks/health/assistant, App/api/use-workspace/TasksPanel/DocumentsPanel/DocumentCard/AssistantPanel/AcademicPanels/academic-data, frontend tests, Vite config, SQL init, Nginx, Dockerfiles, Compose, ignore/env example, README, PROJECT-CONTEXT, architecture, GUIDE và backlog tasks/project-plan.

| Phần | Source trước sửa | Quyết định |
|---|---|---|
| npm workspaces | React 19, Vite 8, Nest 12, pg 8; ESM NodeNext, `.js` backend imports | Giữ versions/stack, không thêm ORM/SDK |
| Tasks | GET/POST/PATCH đã gọi từ frontend | Trim trước validation, date-only, giữ contract |
| Validation | MinLength kiểm tra trước trim, optional status chấp nhận null | Sửa để whitespace/null status trả 400 |
| Documents | File metadata trong React state; Mock 64%, preview selected/processing/ready | Thay bằng API thật, giữ layout/classes |
| DB | Fallback localhost, pool connect timeout, chưa query timeout | Config bắt buộc, TLS verified, timeout/shutdown |
| Schema | tasks/documents/chunks/evaluations; VECTOR/pgcrypto; seed mẫu | Kế thừa init + migration theo dõi checksum |
| Health | SELECT 1; chưa kiểm tra Storage | Giữ DB-only, khai báo storage not_checked |
| Tests | 1 AssistantController unit; 15 FE tests | Giữ unit, nâng preview test, thêm HTTP integration compiled JS |
| Compose | API bắt buộc DB local, URL hardcode | Main Compose dùng Supabase ngoài; DB test tách file |
| Assistant | Env có thể tuyên bố configured dù chưa có AI | Luôn disabled/preview; không thêm AI |
| Tài liệu | Week 3, có tuyên bố container verified từ phiên trước | Giữ lịch sử, đánh dấu cũ, bằng chứng mới chỉ theo lần chạy này |

## Lệnh trước thay đổi

| Lệnh | Kết quả thực tế |
|---|---|
| `node --version` / `npm --version` | v22.18.0 / 10.9.3; root packageManager ghi npm 11.6.2 |
| `npm run typecheck` | PASS cả API/web |
| `npm test` trong sandbox | Không chạy suite được: Vite `spawn EPERM` |
| `npm test` ngoài sandbox | PASS 1 backend unit + 15 frontend |
| `npm run format:check` | Đã gọi; xác minh tổng kết mới ở VERIFICATION.md |
| `npm run build` ngoài sandbox | PASS API/web, web 355 modules |
| `docker compose config --quiet` cũ | Không báo lỗi cấu hình trong lần gọi baseline |
| `docker info` ngoài sandbox / `docker ps` | FAIL: pipe dockerDesktopLinuxEngine không tồn tại; engine chưa chạy |
| Kết nối Supabase/runtime persistence | CHƯA CHẠY: thiếu credentials và DB test |

Phân biệt lỗi source với môi trường: EPERM là sandbox Windows, Docker pipe là engine không hoạt động. Không tuyên bố backend cũ đã đạt HTTP validation chỉ từ controller unit. Với Node 22.18 một số dependency trong lockfile phát EBADENGINE (jsdom/Angular tooling/undici); các gates đã chạy không thay thế yêu cầu engines. Xem kết quả cuối tại [VERIFICATION.md](VERIFICATION.md).
