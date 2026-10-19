# ExaMate — AI-powered academic workspace

Workspace học tập cuối kỳ New Technologies của Tài–Thắng: React/Vite,
NestJS ESM, PostgreSQL/pgvector, Supabase Auth và private Storage.

Phát triển trên **`feature/tai-assistant-integration-20261018`**.
Checkout máy Tài: `D:\New-Tech\Final-Project-integration-20261018`.
Folder `Final-Project` cũ còn WIP riêng; không reset, copy đè hoặc gom vào commit.

## Chỉ cần đọc gì cho cuối kỳ?

1. **README này:** cài đặt, chạy, kiểm tra và giới hạn.
2. **[Học và vấn đáp](docs/FINAL-STUDY-GUIDE-VI.md):** giải thích FE, BE,
   database, AI/RAG, hội thoại, SSE và STT; có đường dẫn mở code.
3. **[Checklist demo cuối kỳ](docs/FINAL-DEMO-CHECKLIST.md):** kịch bản,
   bằng chứng, phân công và những điều không được tuyên bố quá mức.

Chỉ mở khi cần: [đăng nhập máy Thắng](docs/PILOT-DEMO-HANDOFF.md),
[cấu hình Assistant](docs/ASSISTANT-SETUP.md), [STT](docs/STT-SETUP-VI.md),
[đánh giá RAG](docs/evaluation-plan.md), [runbook quản trị](docs/PILOT-B1-RUNBOOK.md).
Agent đọc [AGENTS](AGENTS.md) và [context/roadmap hiện tại](docs/PROJECT-CONTEXT.md).
Giữ [nhật ký sử dụng AI](AI_USAGE.md) và
[nguồn ảnh](apps/web/public/img/CREDITS.md) để minh bạch bài nộp.

Đã gộp các hướng dẫn học cũ, bỏ báo cáo/prompt theo đợt khỏi cây hiện tại.
Lịch sử trước lần rút gọn nằm tại commit `e9ac2af`:
`git show e9ac2af:docs/<tên-file-cũ>.md`.
Không xóa source, migrations, tests, corpus/gold JSON hoặc kết quả evaluation lịch sử.

## Hiện đã có và chưa có

- Tasks/Courses/Exams/Study plans/Expenses/Documents; ghi chú lưu ở browser,
  không phải ghi chú đã đồng bộ server.
- Assistant UI hai tầng: **AI Chat → Kiến thức chung/Tài liệu**, hoặc
  **Hỏi workspace**. Backend vẫn có ba mode riêng.
- PDF upload/index/retrieval/citation/preview; OCR tùy chọn.
- Hội thoại theo receipt server xác minh; feedback thuộc answer của chính user.
- SSE: general phát text dần; documents chỉ status rồi answer đã kiểm citation
  và quyền cuối lượt; workspace status rồi kết quả SQL, không gọi LLM.
- STT Whisper ONNX local: ghi âm → sửa transcript → chèn câu hỏi → tự gửi.
  Mặc định tắt; không tự tải weights.

App chỉ chạy **local**, dùng dữ liệu demo nhóm, không public/deploy.
Auth bootstrap demo ngày 17/10 đã ghi nhận schema cloud 001–015 và membership;
**chưa nghiệm thu đăng nhập thực tế trên máy Thắng** hoặc Auth extended.
Tenant RLS/non-owner đã chứng minh trên DB disposable, chưa rollout runtime
role/grants/policies toàn app lên cloud. B3 budget AI, B4 semantic RAG/live
evaluation có Auth và benchmark microphone/STT thật còn thiếu.

Checkpoint tích hợp `01288ce` đã chạy 5 gates exit 0:
**1.487 test ứng dụng + 379 DB**, browser fixture desktop/375px/320×320,
Docker/native imports và 5 media tests. Đây là bằng chứng lịch sử, không phải
kết quả kiểm mới sau mỗi lần sửa docs; không suy ra chất lượng model thật.

## Chạy development

Cần Node **24.15+ thuộc nhánh 24**, npm 11.6.2; xem engines/lockfile.
Docker build đã kiểm với Node 24.22; host cũ 24.13 thấp hơn khuyến nghị.

Từ repository root, sau khi bảo toàn WIP và chọn đúng nhánh:

```powershell
npm ci --ignore-scripts
# Chỉ copy khi CHƯA có .env:
Copy-Item .env.example .env
```

Dùng `--ignore-scripts` để không chạy lifecycle download CUDA không cần cho STT CPU.
Không thêm dependency/override hoặc dùng `audit fix --force`.
Runtime STT audit tại checkpoint còn **2 high/4 moderate package entries**;
không coi install thành công là audit sạch. Xem [context](docs/PROJECT-CONTEXT.md).

Điền `.env` root bằng editor riêng, không gửi vào chat/Git hoặc `VITE_*`:

| Nhóm        | Cấu hình cần có                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Business DB | `DATABASE_URL` dùng LOGIN non-owner thuộc capability `examate_business`; TLS/CA đúng target; pool mặc định 5                          |
| Auth DB     | `AUTH_DATABASE_URL` là LOGIN riêng thuộc `examate_auth`, cùng endpoint/database nhưng khác role; `AUTH_DATABASE_POOL_MAX` tối thiểu 2 |
| Maintenance | `MIGRATION_DATABASE_URL` chỉ dành cho migrate/operator CLI; để trống trong API process/container, không fallback từ hai runtime URL   |
| Storage     | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` hoặc legacy service-role fallback, bucket private                                               |
| Auth        | `SUPABASE_PUBLISHABLE_KEY`, `PILOT_WORKSPACE_ID`, `SESSION_ENCRYPTION_KEY`, `AUTH_SESSION_VERIFICATION=database`                      |
| AI          | `GEMINI_API_KEY`, model/timeouts theo template; thiếu AI không được bỏ Auth                                                           |
| Dev origin  | Cấu hình công khai dưới đây                                                                                                           |

F02-A local đã thêm capability groups, migration 017 và kiểm tra startup để API
từ chối owner/BYPASSRLS hoặc privilege drift. Đây **không** phải quyền đã được
provision trên Supabase: không dùng chung một owner/service credential cho hai
URL runtime và không chạy `f02:apply-017` lên cloud. Cần chuẩn bị roles/credentials
qua checkpoint riêng F02-B trước khi chuyển môi trường thật.

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://127.0.0.1:5173
ALLOWED_ORIGINS=http://127.0.0.1:5173
TRUSTED_PROXY_IP=
```

Lấy nguyên URI Direct hoặc Session pooler từ Supabase Connect; percent-encode
phần password, không encode cả URL. Không tự suy luận host hoặc dùng transaction
pooler cho migration. CA tương đối tính từ repo root; dùng đúng file thực tế,
không tự thêm đuôi `.crt`. Không tắt TLS verification để vượt lỗi.
Storage bucket phải private, giới hạn PDF 10 MiB; publishable key dùng Auth,
không thay server Storage key. Giữ workspace/session key nhóm ổn định.

**Máy Thắng dùng project đã bootstrap:** làm theo
[handoff](docs/PILOT-DEMO-HANDOFF.md), nhận credential qua kênh riêng, không chạy
migration/tạo user/workspace lại. Git không chứa `.env` hoặc mật khẩu.
DB mới hoặc thay schema cloud cần backup, target, maintenance window và phê duyệt
theo [runbook](docs/PILOT-B1-RUNBOOK.md); không phải bước khởi động hằng ngày.

```powershell
npm run pilot:preflight
# Terminal 1:
npm run dev:api
# Terminal 2:
npm run dev:web
```

Mở **http://127.0.0.1:5173**, không dùng `localhost` hoặc đổi sang 5174.
Vite strictPort, proxy `/api` tới 127.0.0.1:3000. Restart API sau sửa config;
process environment có thể ghi đè `.env`. Docker không bắt buộc cho đường dev này.

Health `GET /api/health` chỉ kiểm DB, không kiểm Auth/Storage/Gemini.
Assistant status chỉ báo cấu hình, không chứng minh key/quota/model hoạt động.

## Docker và kiểm thử

Main Compose dùng Supabase bên ngoài, origin **http://127.0.0.1:8080**,
chỉ publish web trên loopback; API không publish port 3000.
Container API cần cả `DATABASE_URL` business và `AUTH_DATABASE_URL` Auth riêng;
`MIGRATION_DATABASE_URL` được ép rỗng trong API container. Migration 017 và
login roles F02-A chỉ được kiểm trên DB disposable local ở lượt này; cấu hình
runtime owner hiện có không được âm thầm dùng làm fallback.
Nginx ghi đè XFF; chỉ trust peer cố định `172.30.250.10` trên subnet
`172.30.250.0/24`. Kiểm mạng/route không trùng trước chạy; không tự đổi trust.
Trong Docker CA mount dùng `/run/secrets/prod-supabase.cer`, API bind nội bộ
`0.0.0.0`; không áp bind/trust đó cho dev trực tiếp.

```powershell
docker info
docker compose --env-file .env.example config --no-env-resolution --quiet
# Chỉ chạy với cấu hình/runtime target đã được duyệt:
docker compose build
docker compose up -d
docker compose ps
docker compose down
```

Không in resolved Compose/env/log chứa credential. `down` không dùng `-v`;
không xóa volume/stack của người khác.

Bốn gates ứng dụng và gate DB riêng:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
# Chỉ khi TEST_DATABASE_URL là DB disposable:
npm run test:database
```

Ví dụ DB test riêng theo Compose có sẵn; port 55432 phải trống:

```powershell
docker compose -p examate-final-test -f compose.local-db.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-final-test -f compose.local-db.yaml down
```

URL trên chỉ là credential fixture local, không dùng trên cloud.
Harness từ chối target không loopback, DB không kết thúc `_test`, URL query
override hoặc trùng DB thật; thiếu URL phải fail, không skip.
Auth fixture tối thiểu không phải Supabase Auth. Non-owner/RLS fixture không
chứng minh cloud đã cấu hình tương tự. Không dùng payload DoS lên API cloud.

## Lỗi và nguyên tắc an toàn

| Dấu hiệu                 | Kiểm gì                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Login 401 `AUTH_INVALID` | Đúng account/password ExaMate demo và project; status/code/Request ID, không đoán chỉ từ ảnh |
| Session 503              | Preflight, root env/process override, CA, schema/grants và restart API                       |
| 403/CSRF                 | Origin đúng 127.0.0.1:5173, phiên/CSRF đúng; không tắt guard                                 |
| DB 28P01                 | Username, password encoding, đúng loại connection                                            |
| TLS/DNS/42501            | Host/CA/network hoặc grants/RLS; không reset DB/tắt TLS                                      |
| Storage 503              | Đúng project/key, bucket tồn tại và private                                                  |
| Port bận                 | Chỉ dừng process do mình sở hữu; không chạy API thứ hai                                      |
| Ghi/upload/index timeout | GET đối chiếu trước retry; không suy ra write thất bại                                       |
| AI quota/unavailable     | Phân biệt mã lỗi/log an toàn; không retry vô hạn hoặc bịa đáp án                             |

Mọi request nghiệp vụ cần principal verified; workspace/role không lấy từ client.
ID ngoài workspace trả 404 chung, viewer không ghi các route bị cấm.
Storage/provider ngoài transaction SQL; outcome COMMIT chưa rõ phải reconciliation,
không xóa bù object hoặc replay write dựa trên phỏng đoán.
Signed URL TTL 60s là bearer capability, không quay token; không thể thu hồi
URL đã cấp chỉ bằng revoke membership. PDF MIME/magic không phải malware scan.

Model nhận nội dung liên quan khi embedding/RAG/OCR qua API; bucket private
không đồng nghĩa dữ liệu không gửi Google. Chỉ dùng dữ liệu được phép.
Không đưa secrets, audio riêng, backup, account mapping vào bài nộp.

## Google OAuth — F01

`AUTH_GOOGLE_ENABLED=false` mặc định; email/password vẫn hoạt động. Chỉ bật
`true` sau khi owner cấu hình Google provider/redirect allowlist ở Supabase và
duyệt áp migration **016** kèm backup/rollback. F01 code run không áp cloud.
Checkpoint cloud đã bàn giao có 001–015; F01 không kiểm lại hoặc ghi cloud,
không bootstrap lại workspace/accounts.

App callback cố định `/api/auth/google/callback` trên dev origin
`http://127.0.0.1:5173` hoặc Compose `http://127.0.0.1:8080`. Google callback
thuộc **Supabase**, khác callback app. Google secret chỉ ở provider Supabase.
Browser giữ opaque HttpOnly cookie; JWT Supabase được xác minh ở backend.
Không token/verifier trong JS/localStorage. Membership theo verified user ID;
identity Google chưa có quyền nhận no_access, không auto import/merge dữ liệu.

[Runbook/live checkpoint](docs/PILOT-B1-RUNBOOK.md) ·
[ADR-001](docs/DECISIONS.md) · [Stories/traceability](docs/FINAL-REQUIREMENTS.md) ·
[Kết quả F01](docs/FINAL-DEMO-CHECKLIST.md).

Fixture riêng `compose.oauth-test.yaml` không dùng `.env` hoặc cloud. Nó dùng
PG17 disposable và Nest Auth thật với adapter OAuth giả; API 3000 không publish.
Main Compose không bị đổi sang fixture. Không dùng fixture để nhận Google live PASS.
