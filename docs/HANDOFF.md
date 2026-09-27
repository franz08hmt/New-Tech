# Handoff — ExaMate với grounded RAG

Ngày cập nhật: 26/09/2026 (Asia/Saigon)

Phần Homework 4 non-AI bên dưới được giữ làm lịch sử. Trạng thái hiện tại đã có PDF extraction/chunking, Gemini embeddings, pgvector retrieval, grounded generation, citation validation và UI index/citation; chưa có kiểm chứng Supabase/Gemini thật, commit hoặc push.

## Đã làm

- Tasks API GET/POST/PATCH; trim title, validation 3–160, status/UUID/date/field lạ/null optional/not-found.
- Documents API upload PDF tối đa 10 MiB, kiểm tra extension/MIME/signature `%PDF-`, list metadata, signed download 60 giây và delete.
- Supabase Storage adapter server-side: private bucket check, timeout, cleanup khi metadata insert lỗi và trạng thái `deleting` để retry.
- PostgreSQL `pg.Pool`, parameterized SQL, timeout, verified TLS configuration, shutdown và migration tracking/checksum.
- Global validation, request ID, JSON logs, sanitized errors và health check database-only.
- Frontend Tasks/Documents gọi API thật, có loading/error/retry; giữ File để retry; bỏ mock progress/preview state giả.
- Assistant đã có RAG hoàn chỉnh ở mức code: xử lý PDF chủ động, embedding 768 chiều, retrieval có thể giới hạn theo môn, structured output và citation được backend đối chiếu. UI hiển thị processing/retry/re-index và mở nguồn bằng signed URL.
- Compose/Nginx/Docker đã tách Supabase bên ngoài; PostgreSQL local chỉ ở `compose.local-db.yaml` cho test riêng.
- Đã thêm README, Supabase setup, evidence, study guide và demo script tiếng Việt.

## File chính

- Backend: `apps/api/src/config/config.ts`, `common/http.ts`, `common/log.ts`, `main.ts`, `database/database.service.ts`, `tasks/*`, `documents/*`, `health/health.controller.ts`, `app.module.ts`.
- Migration/runtime: `apps/api/scripts/migrate.mjs`, `infra/postgres/migrations/002_non_ai_storage.sql`, `.env.example`, `compose.yaml`, `compose.local-db.yaml`, Dockerfiles, `infra/nginx/default.conf`.
- Frontend: `apps/web/src/api.ts`, `use-workspace.ts`, `TasksPanel.tsx`, `DocumentsPanel.tsx`, `DocumentCard.tsx`, `App.test.tsx`, `integration.test.tsx`.
- Tests/evidence: `apps/api/test/*`, `docs/evidence/*`.
- Tài liệu: `README.md`, `docs/VERIFICATION.md`, `docs/AUDIT-BASELINE.md`, `docs/HOMEWORK-4A-EVIDENCE.md`, `docs/HOMEWORK-4B-EVIDENCE.md`, `docs/SUPABASE-SETUP.md`, `docs/BACKEND-STUDY-GUIDE-VI.md`, `docs/DEMO-SCRIPT-VI.md`.

## Tests và quality gates đã có

Các quality gate chính đã được chạy lại ngày 26/09 sau khi hoàn thiện UI RAG; các kiểm tra cloud/database thật vẫn giữ trạng thái chưa xác minh.

| Lệnh/kiểm tra                                | Kết quả                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --offline`                           | PASS; dùng lockfile. Node hiện tại 22.18.0/npm 10.9.3 có cảnh báo EBADENGINE; README yêu cầu runtime phù hợp engines, dự kiến Node 24.15+ |
| `npm run typecheck`                          | PASS API + web                                                                                                                            |
| `npm test`                                   | PASS: 110 API Vitest + 104 API Node + 83 web; 0 fail, 0 skip                                                                              |
| `npm run format:check`                       | PASS                                                                                                                                      |
| `npm run build`                              | PASS API + web; web build 370 modules                                                                                                     |
| `node --check apps/api/scripts/migrate.mjs`  | PASS syntax                                                                                                                               |
| Hai lệnh `docker compose ... config --quiet` | PASS                                                                                                                                      |
| `npm run test:database`                      | SKIP 1 vì thiếu `TEST_DATABASE_URL`; chưa có persistence DB evidence                                                                      |
| `docker info`/`docker ps`                    | FAIL môi trường: Docker Desktop Linux engine chưa chạy                                                                                    |
| API khi thiếu env                            | Expected exit 1, báo thiếu `DATABASE_URL`, không fallback localhost                                                                       |
| pg connection refusal test                   | PASS: trả 503 có request ID, không lộ connection string                                                                                   |

Chi tiết: `docs/VERIFICATION.md`, `docs/evidence/backend-final.txt`, `docs/evidence/test-output.txt`, `docs/evidence/database-skip.txt`. HTTP/Storage integration dùng mock dependency; đây không phải bằng chứng Supabase thật.

## Trạng thái Supabase thật

Chưa kết nối hoặc kiểm chứng Supabase thật trong workspace này.

- Không có `.env` thật, `DATABASE_URL`, `TEST_DATABASE_URL`, `SUPABASE_URL` hoặc server key trong môi trường audit.
- Chưa chạy migration cloud; chưa tạo/kiểm tra private bucket.
- Chưa xác minh TLS, endpoint direct/session pooler, upload/download/delete thật.
- Chưa chứng minh record PostgreSQL và object Storage sau reload/restart.
- Chưa có cloud log, deployment URL hoặc video.

Không dùng mock test, local schema hoặc hash cũ để tuyên bố Supabase đã hoạt động.

## Cấu hình còn thiếu

Qua editor local, không gửi secret vào chat:

1. Tạo `.env` từ `.env.example` nếu chưa có.
2. Điền URI thật từ Supabase Connect vào `DATABASE_URL`; URL-encode password và chọn direct/session pooler theo IPv4/IPv6.
3. Cấu hình `DATABASE_SSL=true`, CA path nếu cần, pool/timeout.
4. Điền `SUPABASE_URL`, legacy server-side `service_role` key và tên bucket private.
5. Tạo bucket private với MIME `application/pdf`, giới hạn 10 MiB.
6. Với Docker, dùng CA path trong container và secrets mount read-only.
7. Với DB integration, dùng database test riêng có tên kết thúc `_test` qua `TEST_DATABASE_URL`.
8. Bật Docker Desktop Linux engine nếu cần chạy container.

Chi tiết quyền/RLS, TLS, migration và troubleshooting ở `docs/SUPABASE-SETUP.md`.

## Bước tiếp theo và lệnh

Sau khi review code, từ repository root:

```powershell
npm ci
Copy-Item .env.example .env   # chỉ nếu .env chưa tồn tại
# điền .env bằng editor local, không in secret
npm run db:migrate
npm run dev:api
```

Terminal thứ hai:

```powershell
npm run dev:web
curl.exe -i http://localhost:3000/api/health
```

Sau đó tạo task, đổi status, upload PDF vô hại, reload, restart API, download/delete và đối chiếu cùng UUID trong PostgreSQL cùng object key trong Storage. Failure demo có thể dùng validation sai hoặc dừng API local; không phá bucket/database thật.

Docker sau khi engine hoạt động:

```powershell
docker info
docker compose --env-file .env.example config --quiet
docker compose build
docker compose run --rm api node apps/api/scripts/migrate.mjs
docker compose up -d
curl.exe -i http://localhost:8080/api/health
docker compose logs --tail 100 api
docker compose down
```

DB integration local riêng:

```powershell
docker compose -f compose.local-db.yaml up -d
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
$env:DATABASE_SSL = 'false'
npm run test:database
docker compose -f compose.local-db.yaml down
```

Tiếp theo cần cập nhật `docs/VERIFICATION.md` và evidence sau khi có cloud proof, quay video theo `docs/DEMO-SCRIPT-VI.md`, rồi đưa thay đổi vào checkout Git hợp lệ để review/stage/commit và lấy `git rev-parse HEAD`.

## Git và an toàn bàn giao

Thư mục hiện tại không có `.git`; `git status`/`git rev-parse HEAD` không cung cấp trạng thái hoặc commit. Không reset, xóa dữ liệu, tạo lịch sử, commit hay push. Khi chuyển sang checkout Git thật, kiểm tra `git status --short`, review diff và không dùng hash cũ làm bằng chứng cho code mới.

Handoff này không chứa secrets. Không lưu database URL, key, signed URL hoặc request body nhạy cảm.

## Cập nhật đối chiếu tiếp theo — 13/09/2026

Đã đọc lại handoff, evidence Homework 4A/4B, Supabase setup, verification, migration, configuration, Compose và source liên quan. Kết quả khớp handoff cũ: thư mục không có `.git`, không có `.env`/Supabase variables, và Docker Desktop Linux engine vẫn không hoạt động. Không chạy lại toàn bộ tests trong chặng này.

Rà soát bổ sung xác nhận migration script có advisory lock, checksum và transaction; `config.ts` fail-closed khi thiếu URI/key, không fallback PostgreSQL localhost; Compose không tạo DB local cho runtime; các giá trị placeholder không được xem là cấu hình thật. Blocker ưu tiên cao nhất hiện là cần người nộp điền credential qua `.env` local để chạy `npm run db:migrate`, health và persistence proof. Không có phần cloud nào được đánh dấu hoàn thành từ lần rà soát này.

## ExaMate AI chatbox — 24/09/2026

Phần giao diện AI (launcher nổi và panel dùng chung) có tài liệu riêng: `docs/AI-CHATBOX-HANDOFF.md`. Tại thời điểm ghi chú 24/09, chưa có API hỏi-đáp; xem cập nhật 25/09 bên dưới để biết trạng thái mới.

## ExaMate AI — cập nhật 26/09/2026

Frontend nối composer tới `POST /api/assistant/chat`. Kiểu request/response dùng chung nằm trong `packages/contracts/index.d.ts`; test FE xác nhận payload, page context, course scope, câu trả lời và nguồn bằng fixture. Khối ví dụ không còn được trình bày như một phản hồi thật.

RAG đã đọc PDF từ private Storage, chunk theo đoạn/trang, tạo embedding, tìm chunks `ready` trong pgvector rồi sinh câu trả lời có source marker. Không có evidence thì không gọi generation. Trang Documents có Index/Retry/Re-index; citation đã kiểm chứng mở signed URL tại trang tương ứng. Automated tests không gọi Gemini/Supabase thật. Để dùng local, chạy migration 008, cấu hình `.env`, khởi động lại API/web rồi kiểm tra `/api/assistant/status`; `ready` chỉ xác nhận key có cấu hình chứ không xác minh quyền hoặc quota. Xem `docs/ASSISTANT-SETUP.md`.

Quality gates ngày 26/09: typecheck, format và production build toàn workspace pass; test pass 110 API Vitest + 110 API Node + 83 web (303 tổng, 0 fail/skip). Database integration thật vẫn chưa chạy vì thiếu `TEST_DATABASE_URL` riêng.

Prompt cuối bổ sung evaluation harness: hai PDF tổng hợp có generator, 10 case cố định, bảy case live chạy tuần tự không retry và ba case fault-injection nối với automated tests. Runner mặc định dry-run, giới hạn tối đa 10 live case, buộc corpus revision khớp manifest, chỉ ghi create-only trong `artifacts/` và không tự xem structural pass là semantic pass. Chưa chạy case live để tránh tự ý dùng quota; hướng dẫn ở `docs/evaluation-plan.md`.
