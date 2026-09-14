# Kết quả kiểm chứng và bàn giao — 13/09/2026

Không commit/push. Thư mục ZIP không có `.git`, vì vậy chưa có diff theo Git, branch hoặc exact commit đại diện bản thay đổi. Review source đã thực hiện bằng đọc lại file và đối chiếu snapshots đọc đầu phiên; không reset/xóa dữ liệu người dùng. File sinh build/dependencies/artifacts được ignore; evidence text được giữ có chủ đích.

## Gates thực tế

| Lệnh | Kết quả | Bằng chứng/giới hạn |
|---|---|---|
| `node --version`, `npm --version` | 22.18.0 / 10.9.3 | Một số dependency yêu cầu Node mới hơn; có EBADENGINE. README hướng dẫn Node24.15+, chưa chạy Node24 ở máy này |
| `npm ci --offline` | PASS, added351/audited354, exit0 | Cài lại bằng lockfile/cache; không thêm/upgrade dependency. EBADENGINE chưa được khắc phục bằng đổi runtime |
| `npm run typecheck` | PASS API + web | [typecheck.txt](evidence/typecheck.txt); chạy lại sau review service vẫn đạt |
| `npm test` / `npm run test` | PASS 1 unit Assistant +29 HTTP/adapter +19 FE ở lượt full suite | [test-output.txt](evidence/test-output.txt) |
| `node --test ...api.test.mjs ...storage.test.mjs ...reliability.test.mjs` | PASS32 backend tests sau review cuối | [backend-final.txt](evidence/backend-final.txt), bổ sung 3 reliability tests. Tổng hiện tại52 =1+32+19 |
| `npm run format:check` | PASS source/API test/scripts/frontend | [format-check.txt](evidence/format-check.txt); kiểm tra lại sau review đạt |
| `npm run build` | PASS API + web,355 modules | [build.txt](evidence/build.txt); backend đã rebuild sau sửa service |
| `node --check apps/api/scripts/migrate.mjs` | PASS syntax | Không phải kiểm chứng SQL/migration thật |
| `npm run test:database` | SKIP1, PASS0 | [database-skip.txt](evidence/database-skip.txt): TEST_DATABASE_URL absent |
| `docker compose --env-file .env.example config --quiet` | PASS exit0 | Kiểm tra static sau sửa env_file optional; không chạy containers |
| `docker compose -f compose.local-db.yaml config --quiet` | PASS exit0 | Cấu hình DB test riêng; không chứng minh DB chạy |
| `docker info` ngoài sandbox, `docker ps` | FAIL môi trường | dockerDesktopLinuxEngine pipe không tồn tại; Docker engine chưa hoạt động |
| `node apps/api/dist/main.js` khi thiếu env | Expected failure exit1 | Log bên dưới báo đúng DATABASE_URL, không fallback/không lộ secret |
| Lockfile dependency declarations | PASS | Script so dependencies/devDependencies của hai workspace với lockfile |
| Source/frontend bundle secret scan | Không tìm thấy credential thật hoặc config DB/Storage trong web bundle | Không phải audit bảo mật toàn diện. Không có .env thật trong workspace |

Tests/build chạy ngoài Windows sandbox khi sandbox báo `spawn EPERM`; sau khi được phép tạo subprocess thì chạy được. EPERM là lỗi môi trường, khác assertion fail. Logs có UTC12/09 buổi tối tương ứng 13/09 Asia/Saigon.

Log startup thực:

```json
{"timestamp":"2026-09-12T19:41:30.521Z","level":"error","event":"startup.failed","message":"Missing configuration: DATABASE_URL. See .env.example"}
```

`scripts/verify.ps1` giúp tái tạo artifacts; các output trong docs/evidence là bản ghi đã chạy (bỏ ANSI nếu có). File backend-final là **trích đoạn** output bổ sung, không giả là full transcript. Không có screenshot/video/runtime-cloud log được tạo trong phiên này.

## Phân biệt mức kiểm chứng

| Mức | Đã xác minh | Chưa thể suy ra |
|---|---|---|
| Unit | Assistant trả disabled/preview | Không có AI chạy |
| HTTP integration | Nest app thật trên localhost, DTO/global pipe/filter/controller/service, status/body/cleanup | DB/Storage mock không là persistence/cloud upload |
| Frontend integration | React load/create/status/upload/error/retry/download/delete + navigation/owner filter | Không phải browser E2E hoặc viewport screenshot |
| Driver failure thật | pg ECONNREFUSED trên cổng local được chọn riêng → Tasks/health503 | Không có connection DB thành công/persistence |
| Database integration | Đã viết migration twice + API restart test, cleanup UUID | Chưa chạy vì thiếu TEST_DATABASE_URL |
| Supabase thật | **Không có phần nào được kiểm chứng thành công** | Migration, TLS/project key/bucket, upload/download/delete/data proof cần cấu hình |
| Docker/deploy | Build frontend/backend và YAML config đạt | Chưa build images/chạy containers/deploy URL |

## File chính và lý do

- `apps/api/src/config/`: load .env root, config validation, verified TLS/timeouts.
- `common/`, `main.ts`, `health/`, `database/`: shared HTTP configuration, request logs/id, sanitized errors, DB pool shutdown/failure.
- `tasks/`: trim-before-validation, date-only/status/null contract, SQL/logs.
- `documents/`: PDF limits/signature, Storage HTTP adapter, metadata, signed download, compensation/deletion retry.
- `apps/api/scripts/migrate.mjs`, `infra/postgres/migrations/002_non_ai_storage.sql`: tracked/checksummed migrations, constraints/index/grants/RLS. Runner bảo vệ bảng initial trước commit, giữ schema AI cũ không triển khai AI.
- `apps/web/src/api.ts`, `use-workspace.ts`, `TasksPanel.tsx`, `DocumentsPanel.tsx`, `DocumentCard.tsx`: dữ liệu API, File retry, loading/error/success, bỏ preview/progress giả và chặn stale load.
- `apps/api/test/`, frontend tests: HTTP/integration/reliability coverage; Vitest controller test vẫn giữ.
- `compose.yaml`, `compose.local-db.yaml`, Dockerfiles/Nginx/ignore/env example: Supabase external, local test DB tách, upload/proxy limits và secret boundary.
- README và docs: đối chiếu4A/4B, setup, code walkthrough,20 câu vấn đáp và kịch bản video. Tài liệu Week3/backlog có banner lịch sử.

## Blockers và công việc người nộp cần làm

1. Dùng Node đáp ứng engines; tạo `.env` root từ example nếu chưa tồn tại, điền credential trong editor local theo SUPABASE-SETUP. Không gửi secret vào chat.
2. Chạy migration, tạo bucket private đúng tên/10MiB/PDF. Xác nhận health, upload/download và quyền Data API trên project thật.
3. Mở Docker Desktop nếu muốn chạy containers/DB test. Main Compose không tự tạo database cloud.
4. Chứng minh Tasks/Documents sau reload và restart API: cùng UUID/record/object, download PDF thật và xóa mẫu đúng kết quả.
5. Quay video theo DEMO-SCRIPT-VI; ghi rõ failure và không lộ key/signed token.
6. Review tại checkout Git đúng. Stage file đã review, commit, lấy exact hash. Bản ZIP hiện chưa có commit; không dùng hash cũ cho code mới.

Chưa có môi trường deploy được phép và chưa có auth/gateway cho endpoint ghi/tải/xóa nên giữ local demo dùng dữ liệu mẫu. Không tự tạo tài nguyên trả phí hay deploy public.
