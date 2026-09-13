# ExaMate — Homework 4A & 4B (non-AI)

Workspace học tập dùng React + NestJS + PostgreSQL/Supabase Storage. Hai luồng chính: tạo/đổi trạng thái task và upload/list/download/delete PDF. Giữ giao diện/navigation/responsive hiện có; Assistant chỉ là preview, không có LLM, embeddings, RAG hoặc xử lý PDF.

Code đã có automated HTTP/frontend tests. **Chưa xác minh Supabase thật, persistence thật, Docker runtime hoặc deploy public** vì môi trường không có credential và Docker engine đang tắt. Kết quả chính xác, lệnh và phần skip ở [VERIFICATION.md](docs/VERIFICATION.md); audit trước sửa ở [AUDIT-BASELINE.md](docs/AUDIT-BASELINE.md). Bản ZIP hiện không có `.git`; chưa có commit đại diện cho thay đổi này.

## Kiến trúc và phạm vi

```text
Browser React ── /api JSON hoặc multipart ──> NestJS
                                             ├── pg.Pool ──> Supabase PostgreSQL (records)
                                             └── HTTPS ────> private Supabase Storage (PDF)
```

Tasks/Documents đi qua NestJS. Không có database key trong frontend. Download API cấp signed URL 60 giây sau khi kiểm tra metadata; browser tải binary bằng URL đó. Health chỉ kiểm tra PostgreSQL. Đây là **workspace demo dùng chung, chưa có login/authorization**. Chỉ dùng dữ liệu mẫu; không public API cho dữ liệu thật. Courses/Exams/Research/Finances là dữ liệu minh họa có nhãn; Notes lưu riêng trên browser, không phải DB cho Tasks/Documents.

## Prerequisites

- Node đáp ứng engines trong lockfile: dùng Node **24.15+ thuộc nhánh 24** (Dockerfile dùng node:24-alpine); npm 11.6.2 theo packageManager. Máy triển khai đang là Node 22.18.0/npm 10.9.3: đã chạy gates nhưng có EBADENGINE ở một số dependency. Chưa kiểm chứng runtime Node 24 tại máy này.
- Supabase project do bạn quản lý, connection PostgreSQL và secret key (hoặc legacy service_role JWT) cho Storage.
- Docker Desktop Linux engine + Compose mới nếu chạy containers; có CLI chưa đủ, `docker info` phải thành công.

Không nâng cấp toàn bộ dependencies. `npm ci` dùng package-lock v3; đã cài lại bằng cache offline trong phiên này.

## Chạy development từ đầu (Windows PowerShell)

Tại root repository:

```powershell
npm ci
# Chỉ copy khi chưa có .env; không ghi đè cấu hình đang có.
Copy-Item .env.example .env
```

Chỉnh `.env` bằng editor local theo [SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md): lấy URI đúng project, percent-encode password, cấu hình TLS/CA; điền SUPABASE_SECRET_KEY server-only (hoặc service_role JWT fallback) và tạo bucket private giới hạn PDF 10 MiB. Không paste secrets vào chat, shell history hoặc VITE_*.

```powershell
npm run db:migrate
npm run dev:api
# Terminal thứ hai, cùng root:
npm run dev:web
```

Mở http://localhost:5173/#tasks và http://localhost:5173/#documents. API http://localhost:3000/api. Vite proxy `/api` đến 3000; nếu đổi API PORT phải sửa proxy tương ứng.

```powershell
curl.exe -i http://localhost:3000/api/health
```

200 nghĩa là DB trả SELECT 1; `storage: not_checked`. 503 báo DB không khả dụng. API fail startup nếu thiếu config; không fallback DB local. Logs ở terminal API là JSON timestamp/level/requestId/method/path/status/duration và sự kiện nghiệp vụ. Dừng bằng Ctrl+C; shutdown đóng pg pool.

## Docker với Supabase bên ngoài

```powershell
docker info
docker compose --env-file .env.example config --quiet
docker compose build
# Nếu CA đang là đường dẫn dev, đổi DATABASE_CA_CERT_PATH trong env
# sang /run/secrets/prod-supabase.cer cho runtime Docker.
docker compose run --rm api node apps/api/scripts/migrate.mjs
docker compose up -d
docker compose ps
curl.exe -i http://localhost:8080/api/health
docker compose logs --tail 100 api
docker compose down
```

Mở http://localhost:8080. Main Compose chỉ có web/Nginx + API; database/Storage ở Supabase. Không depends_on DB local hoặc URL hardcode. Host port chỉ bind localhost; API không publish port. `env_file` thiếu vẫn cho phép kiểm tra Compose, nhưng API sẽ fail config khi startup. `--env-file .env.example config --quiet` chỉ kiểm tra YAML, **không** cấp credential để chạy.

Docker không nhúng secrets trong image/build args. `secrets/` mount read-only. Nginx nhận tối đa 11 MiB request (10 MiB PDF + multipart); backend chặn file >10 MiB trước khi giữ toàn bộ file quá lớn. Proxy giữ đúng prefix `/api`; hash navigation và SPA fallback giữ nguyên. Web khởi động kể cả DB chưa sẵn sàng để hiển thị lỗi/retry. `down` không xóa dữ liệu Supabase; không dùng tùy chọn xóa volumes cho demo.

Các lệnh npm/docker tương tự trên Ubuntu; dùng `curl` thay `curl.exe`. Chưa có VM/URL được phép deploy và chưa có lớp bảo vệ endpoint, nên hiện dùng local reproducible setup theo phương án Homework 4B, không tuyên bố đã deploy.

## Tests và kiểm tra chất lượng

```powershell
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:database
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

Script cuối ghi output vào `artifacts/` (ignore Git). Kiểm tra số **skipped**, không chỉ exit code. API test build Nest bằng TypeScript trước rồi test HTTP trên compiled JS để giữ decorator metadata; Vitest giữ unit Assistant riêng. HTTP tests override DB/Storage bằng mock; adapter tests mock fetch. Frontend tests mock HTTP; không chứng minh browser đã gọi Supabase thật.

DB test riêng (Docker engine phải chạy):

```powershell
docker compose -f compose.local-db.yaml up -d
# Chỉ dùng DB test riêng; không reset/truncate database người dùng.
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
$env:DATABASE_SSL = 'false'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_SSL
docker compose -f compose.local-db.yaml down
```

Test migration hai lần, tạo task/document qua HTTP, đóng/mở lại API và kiểm tra record, cleanup đúng UUID đã tạo. Storage của test này vẫn mock. PostgreSQL local **không thay thế Supabase Storage**. CA cloud đang set trong .env không được dùng khi DATABASE_SSL=false.

## API contract

| Method/path | Thành công | Lỗi chính |
|---|---|---|
| GET /api/tasks | 200 array | 503 DB offline |
| POST /api/tasks | 201 task | 400 DTO |
| PATCH /api/tasks/:id/status | 200 task | 400 UUID/status, 404 |
| GET /api/documents | 200 metadata array | 503 DB offline |
| POST /api/documents | 201 metadata | 400 missing/fields, 413 size, 415 type/signature, 503 Storage |
| GET /api/documents/:id/download | 200 {url, expiresIn:60} | 400 UUID, 404, 409 pending/legacy, 503 |
| DELETE /api/documents/:id | 204, idempotent khi đã xóa | 400 UUID, 409 legacy, 503 partial failure |
| GET /api/health | 200 DB connected | 503 DB unavailable |
| GET /api/assistant/status | 200 disabled/preview | Không gọi AI |

Title trim trước check 3–160. status có todo/in_progress/done, bỏ qua thì todo, null là 400. ownerName/dueDate/evidenceType bỏ qua hoặc null được lưu NULL; owner/evidence trống sau trim cũng NULL. dueDate chỉ ngày YYYY-MM-DD thực sự tồn tại, không timestamp. Field lạ bị 400. SQL dùng placeholders. Response lỗi có requestId; chưa phân loại là 500, không tự chuyển mọi lỗi thành 503.

PDF kiểm tra extension + MIME + 5 bytes `%PDF-`; đây không phải parser đầy đủ/malware scan. Metadata và file phải lưu trước response 201. Upload thất bại mơ hồ cần reload/đối chiếu trước retry, tránh duplicate. Delete có trạng thái deleting để retry phần còn lại. Xem giải thích compensation trong hướng dẫn Supabase và study guide.

## Troubleshooting / bằng chứng nộp bài

- Thiếu config: kiểm tra đúng .env root, không đặt secret trong frontend.
- TLS/DNS/28P01/42501/Storage 503: xem bảng chẩn đoán [Supabase setup](docs/SUPABASE-SETUP.md).
- Windows `spawn EPERM`: test runner cần chạy trong terminal cho phép tạo tiến trình; đây khác test assertion fail.
- Docker pipe không tồn tại: mở Docker Desktop, đợi Linux engine.
- Request timeout: server có thể đã ghi; refresh list trước khi gửi lại POST.
- Request mẫu: [requests.http](docs/requests.http), [4A evidence](docs/HOMEWORK-4A-EVIDENCE.md).
- Đối chiếu yêu cầu: [4B evidence](docs/HOMEWORK-4B-EVIDENCE.md).
- Học code và vấn đáp: [study guide tiếng Việt](docs/BACKEND-STUDY-GUIDE-VI.md).
- Quay 5–8 phút, persistence/failure: [demo script](docs/DEMO-SCRIPT-VI.md).

Giới hạn còn lại: chưa test project Supabase thật; chưa authentication; chưa pagination/quota toàn workspace; upload buffer tối đa 10 MiB mỗi request; không transaction phân tán, không resumable upload/idempotency token; schema AI giữ để tương thích nhưng không sử dụng. Bảng chứng cứ không đánh dấu persistence/video/deployment/commit hoàn thành nếu chưa có bằng chứng.
