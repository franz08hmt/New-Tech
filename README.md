# ExaMate — AI-powered academic workspace

Workspace học tập dùng React + NestJS + PostgreSQL/Supabase Storage. Hiện có các luồng Tasks, Courses, Exams, study plans, chi tiêu, ghi chú trên trình duyệt và tài liệu PDF. Assistant có ba chế độ: chat thường qua Gemini, hỏi tài liệu đã lập chỉ mục (RAG) qua Gemini, và hỏi dữ liệu workspace bằng truy vấn có kiểm soát (không gọi LLM). PDF được trích xuất, chia đoạn và embedding phía API; OCR là tùy chọn và mặc định tắt.

**Trạng thái nhánh phát triển (`feature/tai-rag-integration`):** RAG/OCR, bộ đánh giá và phản hồi câu trả lời đã có trong code. Các chặng đăng nhập/session pilot 1a–1b cũng đã được commit và push; xem [báo cáo 1a](docs/pilot-stage-1a-report.md), [báo cáo 1b](docs/pilot-stage-1b-report.md) và [thiết kế pilot](docs/pilot-stage-0-design.md). Đây là trạng thái code, **không đồng nghĩa pilot đã sẵn sàng cho dữ liệu thật hoặc truy cập công khai**.

**Trạng thái Supabase và giới hạn an toàn:** lần kiểm tra chỉ đọc được ghi trong
[báo cáo khảo sát pilot](docs/pilot-stage-0-report.md) xác nhận migration
`001`–`011` trên project đã kiểm tra. Migration `012` (workspace/session) và
`013` (giới hạn thử đăng nhập/refresh) và `014` (nền workspace nghiệp vụ) hiện mới có trong repository, **chưa áp
dụng thật**. Không chạy migration trên project dùng chung cho tới khi Thắng/Tài
xác nhận đúng target, quyền DB và kế hoạch cấp workspace/user. Đăng nhập trong
code chưa thay thế phân quyền theo từng workspace/bản ghi: phase triển khai
membership/scope dữ liệu và hạn mức sử dụng AI chưa hoàn tất. Auth, database
grants và đăng nhập Supabase thật chưa được nghiệm thu. Gate đã kiểm trên browser
ở 320–1440px; luồng workspace sau đăng nhập Supabase thật vẫn chưa nghiệm thu.
Xem [báo cáo Đợt 1 — session và access gate](docs/PHASE-1-SESSION-ACCESS-REPORT.md).
Chuẩn bị nghiệm thu Auth thật: [runbook B1](docs/PILOT-B1-RUNBOOK.md) và
[báo cáo B1a](docs/PHASE-4-B1A-REPORT.md). Có CLI `pilot:preflight` chỉ đọc và
`pilot:membership` mặc định dry-run; khi cấp quyền dùng `npm --silent` để npm
không echo UUID/project ref trong arguments. B1a chưa tạo user, backup,
migrate hay ghi membership cloud. B2 lát 1–4 đã scope API Tasks/Courses,
Exams/Study plans/Expenses và các truy vấn chỉ đọc của chế độ Hỏi workspace.
Viewer chỉ đọc các mục này; member/manager tạo và cập nhật, chỉ manager xóa
exam/study plan/expense/document. Documents, signing, indexing, retrieval,
summary và metadata đã scope theo principal; member/manager upload/gán môn/index,
viewer chỉ xem/tải. Answer receipt/ownership feedback vẫn chưa hoàn tất.
Runtime `postgres`/bypass RLS chưa được
thay bằng role B2: chỉ dùng dữ liệu demo. Xem [báo cáo B2 lát 1–2](docs/PHASE-5-B2-SCOPE-REPORT.md)
và [Đợt 6 — lát 3, runbook và rollback 014](docs/PHASE-6-REPORT.md),
[Đợt 7 — Documents/RAG boundary](docs/PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md).
Vì vậy chỉ thử với dữ liệu demo, không public ứng dụng hoặc đưa dữ
liệu/API key thật cho người dùng khác.

Khi tài liệu khác nhau, ưu tiên báo cáo pilot mới nhất cho trạng thái Auth và
quyền truy cập; [SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) là hướng dẫn nền
cho cấu hình ban đầu, không tự cấp membership hay grants cho pilot. Xem thêm
[hướng dẫn Assistant](docs/ASSISTANT-SETUP.md),
[kế hoạch đánh giá](docs/evaluation-plan.md),
[báo cáo đánh giá Đợt 4](docs/phase-4-evaluation-report.md) và
[báo cáo phản hồi Đợt 5](docs/phase-5-feedback-report.md).

Hướng dẫn Assistant và contract mới: [Gemini Assistant setup](docs/ASSISTANT-SETUP.md). Các tài liệu Homework 4A/4B bên dưới ghi nhận checkpoint non-AI trước khi bổ sung Assistant.

Code có automated HTTP/frontend tests. [VERIFICATION.md](docs/VERIFICATION.md) và [AUDIT-BASELINE.md](docs/AUDIT-BASELINE.md) ghi nhận kiểm tra của checkpoint trước, không chứng minh thay đổi Gemini hiện tại đã pass. Phạm vi và cách kiểm tra Assistant nằm trong [ASSISTANT-SETUP.md](docs/ASSISTANT-SETUP.md).

## Kiến trúc và phạm vi

```text
Browser React ── /api JSON hoặc multipart ──> NestJS
                                             ├── pg.Pool ──> Supabase PostgreSQL (records + chunks + vectors)
                                             ├── HTTPS ────> private Supabase Storage (PDF)
                                             └── HTTPS ────> Gemini (chat + embeddings; OCR nếu bật)
```

Tasks/Documents/Assistant đi qua NestJS. Không có database hay Gemini key trong
frontend. Download API cấp signed URL 60 giây sau khi kiểm tra metadata; browser
tải binary bằng URL đó. Health chỉ kiểm tra PostgreSQL. Code hiện có login/session
gate, CSRF và giới hạn admission cho các lần đăng nhập. Tasks/Courses,
Exams/Study plans/Expenses và Hỏi workspace đã lọc theo workspace của principal
đã verify, không lấy workspace/role từ body/header/query. **Scope toàn ứng dụng
và giới hạn ngân sách/lượt gọi AI chưa hoàn tất**: Documents/signing/indexing và
RAG/summary đã có ranh giới workspace ở Nest, nhưng answer receipt/feedback còn
lát 5 và least-privilege role/tenant RLS còn lát 6. Không coi login hay các test
SQL bằng owner là bằng chứng cách ly toàn bộ ứng dụng. Chỉ dùng
dữ liệu mẫu, không public API cho dữ liệu thật. Courses/Exams/study plans/Finances
có dữ liệu minh họa; Notes lưu trên browser theo namespace principal nhưng
không được mã hóa.

## Prerequisites

- Node đáp ứng engines trong lockfile: dùng Node **24.15+ thuộc nhánh 24** (Dockerfile dùng node:24-alpine); npm 11.6.2 theo packageManager. Mốc môi trường ghi trong báo cáo gần nhất là Node 24.13.0/npm 11.6.2: đã chạy gates nhưng Node vẫn thấp hơn mức khuyến nghị; chưa kiểm chứng runtime Node 24.15+.
- Supabase project do nhóm quản lý, connection PostgreSQL và secret key (hoặc legacy service_role JWT) cho Storage.
- Pilot Auth cần thêm `PUBLIC_ORIGIN`, `SUPABASE_PUBLISHABLE_KEY`, `PILOT_WORKSPACE_ID` và `SESSION_ENCRYPTION_KEY` trong `.env` server-side; không dùng Storage secret làm Auth key, không commit `.env`, không gửi secrets qua chat. Tạo user, cấp membership và quyền DB là bước quản trị riêng, không có màn hình đăng ký/quản trị. Migration 014 có thể tạo workspace cho seed trên DB local mới khi có `PILOT_WORKSPACE_ID` hợp lệ; đây không phải cấp membership hay bật Auth tự động.
- Docker Desktop Linux engine + Compose mới nếu chạy containers; có CLI chưa đủ, `docker info` phải thành công.

Không nâng cấp toàn bộ dependencies. `npm ci` dùng package-lock v3.

## Chạy development từ đầu (Windows PowerShell)

Tại root repository:

```powershell
npm ci
# Chỉ copy khi chưa có .env; không ghi đè cấu hình đang có.
Copy-Item .env.example .env
```

Chỉnh `.env` bằng editor local theo [SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md): lấy URI đúng project, percent-encode password, cấu hình TLS/CA; điền SUPABASE_SECRET_KEY server-only (hoặc service_role JWT fallback) và tạo bucket private giới hạn PDF 10 MiB. Bổ sung cấu hình Auth pilot từ `.env.example` theo checklist phía trên. Không paste secrets vào chat, shell history hoặc `VITE_*`.

**Trước khi migrate:** xác nhận lại Supabase URL/database đích và lịch sử trong
`schema_migrations`. Trạng thái gần nhất được ghi nhận là `001`–`011`; `012`–`014`
chưa chạy thật và cần quyền/grants cùng workspace/user đã được nhóm duyệt. Chỉ
chạy migration khi người quản lý project đồng ý và đã chuẩn bị các điều kiện đó.
Không dùng project production/dùng chung để thử migration hoặc tự tạo/grant quyền.

Runner trên nhánh này chạy **mọi migration pending, gồm 014**. Đường đi đã hợp
nhất 012→013→014 trong [runbook B1](docs/PILOT-B1-RUNBOOK.md): tạo user/cấu hình,
preflight, backup, dừng API, migrate/verify rồi cấp membership và nghiệm thu.
Chỉ khi quản trị viên duyệt dữ liệu demo của đúng một nhóm mới áp cloud; 014
tạo workspace từ UUID cấu hình nếu chưa có, hoặc dùng lại đúng một workspace
khớp `PILOT_WORKSPACE_ID`. Lệch ID/nhiều workspace thì dừng, không checkout bản cũ.
DB local mới đã có seed ở 001/003–006 nên cần UUID workspace hợp lệ trước migrate:
runner truyền bằng tham số `set_config(..., true)` trong transaction, không đổi
checksum SQL. Không có workspace/setting thì 014 từ chối và rollback chính 014,
không rollback những migration trước đã commit. DB nghiệp vụ thực sự trống thì
không cần workspace. Nếu cần đường lui: dry-run/apply `pilot:rollback-014` trước,
rồi `pilot:rollback-012-013`; giữ API tắt tới khi remigrate/verify. Không chạy các
lệnh cloud đó trong lượt phát triển; guards có thể từ chối để bảo vệ dữ liệu.

Khi chạy trực tiếp React, NestJS và Supabase Cloud, không cần Docker. Đường dẫn CA được resolve từ repository root: `DATABASE_CA_CERT_PATH=secrets/prod-supabase.cer.crt`.

```powershell
npm run db:migrate
npm run dev:api
# Terminal thứ hai, cùng root:
npm run dev:web
```

Origin dev Tài chọn là **http://127.0.0.1:5173**. Nếu đã có `.env`, chỉnh các
giá trị công khai sau bằng editor; không copy đè cả file hoặc đổi secrets:

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://127.0.0.1:5173
ALLOWED_ORIGINS=http://127.0.0.1:5173
TRUSTED_PROXY_IP=
```

Khởi động lại API sau khi chỉnh. Template/default không tự ghi đè `.env` cũ.
Vite cố định host 127.0.0.1, port 5173 và `strictPort`: nếu port bận sẽ lỗi,
không tự đổi origin sang 5174. `HOST` chỉ nhận IP literal, mặc định loopback
trong cả dev/production; không suy ra địa chỉ bind từ `PUBLIC_ORIGIN` hoặc
cookie Secure. Muốn nghe mọi interface phải đặt `HOST=0.0.0.0` tường minh và
tự kiểm soát network/firewall; không dùng cấu hình đó cho dev trực tiếp.

Mở http://127.0.0.1:5173. Sau khi Auth pilot được cấu hình và workspace có membership hợp lệ, đăng nhập rồi dùng các trang `#tasks`, `#documents` hoặc `#assistant`. API http://127.0.0.1:3000/api. Vite proxy `/api` đến 127.0.0.1:3000; nếu đổi API PORT phải sửa proxy tương ứng. Không mở web bằng hostname `localhost` vì đó là origin khác. Để hỏi tài liệu: upload PDF, bấm **Index** trên tài liệu, đợi trạng thái **Searchable content ready**, rồi mở Assistant và chọn **Hỏi tài liệu**. Chỉ tài liệu đã lập chỉ mục được truy xuất; nếu không có bằng chứng phù hợp, Assistant cần báo không tìm thấy thay vì đoán. Nếu thiếu migration/config/grants hoặc membership, API phải fail closed; không tắt Auth để “cho chạy”.

```powershell
curl.exe -i http://127.0.0.1:3000/api/health
```

200 trả `{ "status": "ok" }`, nghĩa là DB trả SELECT 1; không kiểm Storage hoặc Gemini. 503 báo DB không khả dụng. API fail startup nếu thiếu config; không fallback DB local. Logs ở terminal API là JSON timestamp/level/requestId/method/path/status/duration và sự kiện nghiệp vụ. Dừng bằng Ctrl+C; shutdown đóng pg pool.

## Docker với Supabase bên ngoài

Xem [báo cáo B0d 3a/3b](docs/PHASE-3-RUNTIME-DB-REPORT.md)
để phân biệt kiểm HTTP/process local với nghiệm thu Docker/DB thật.

**B0d 3b đã kiểm trên DB disposable ngày 13/10/2026:** build/up Nginx/API,
proxy XFF, cổng API và SQL integration đã pass; không phải nghiệm thu Supabase
Auth/Storage thật. Main Compose bên dưới dùng cấu hình Supabase của `.env`;
muốn kiểm mà không nối cloud, dùng test-stack ở mục kế tiếp. Không chạy
migration 012/013 lên cloud để thử Docker.
Compose dùng origin riêng `DOCKER_PUBLIC_ORIGIN=http://127.0.0.1:8080`; nó
ghi đè PUBLIC_ORIGIN/ALLOWED_ORIGINS của container API, không đổi origin Vite.

```powershell
docker info
docker compose --env-file .env.example config --no-env-resolution --quiet
docker compose build
# Nếu CA đang là đường dẫn dev, đổi DATABASE_CA_CERT_PATH trong env
# sang /run/secrets/prod-supabase.cer cho runtime Docker.
docker compose up -d
docker compose ps
curl.exe -i http://127.0.0.1:8080/api/health
curl.exe -i http://127.0.0.1:8080/api/auth/session
docker compose logs --tail 100 api
docker compose down
```

Mở http://127.0.0.1:8080. Main Compose chỉ có web/Nginx + API; database/Storage ở Supabase. Host port chỉ bind loopback; API không publish port. API dùng HOST=0.0.0.0 trong network container. `env_file` thiếu vẫn cho phép kiểm tra Compose, nhưng API sẽ fail config khi startup. Lệnh config chỉ kiểm tra cấu hình Compose, **không** cấp credential hoặc chứng minh Nginx kết nối API. Khi DB/Storage đã cấu hình mà Auth chưa có đủ config, health có thể 200 và auth/session phải 503 AUTH_UNAVAILABLE; không điền key giả hoặc tắt Auth.

Docker không nhúng secrets trong image/build args. `secrets/` mount read-only. Nginx nhận tối đa 11 MiB request (10 MiB PDF + multipart); backend chặn file >10 MiB trước khi giữ toàn bộ file quá lớn. Proxy giữ đúng prefix `/api`; hash navigation và SPA fallback giữ nguyên. Web khởi động kể cả DB chưa sẵn sàng để hiển thị lỗi/retry. `down` không xóa dữ liệu Supabase; không dùng tùy chọn xóa volumes cho demo.

**Proxy trust:** chạy dev trực tiếp/Vite thì để TRUSTED_PROXY_IP trống. Compose
đặt Nginx/web tại 172.30.250.10, API tại 172.30.250.20 trên bridge
172.30.250.0/24; chỉ socket peer Nginx tại hop gần nhất được tin. Nginx ghi đè
X-Forwarded-For bằng remote_addr, không nối header client. IP được validate và
chuẩn hoá trước khi tạo admission bucket; header sai dùng bucket socket. Cookie
Secure và Origin/CSRF vẫn dựa trên PUBLIC_ORIGIN, không theo forwarded headers.
Một IP chỉ nhận diện network peer, không chứng minh đó là process Nginx: phải
giữ quyền sở hữu network/address, không bật real_ip rewriting tuỳ tiện hoặc
publish API ra host. Không dùng CIDR, `true`, số hop hay IP wildcard làm trust.
Đã kiểm Docker/NAT thật trên máy Tài: req.ip là gateway, socket peer đúng .10,
header giả 1.2.3.4 bị thay. Trước mỗi máy/lần chạy, kiểm `docker network ls`,
IPAM subnet và route/ipconfig. Nếu 172.30.250.0/24 trùng mạng hiện có, dừng báo
lại; không tự đổi subnet hoặc mở rộng trust.

### Stack kiểm B0d không nối cloud

Chạy DB test bên dưới trước để tạo runtime role fixture. Bản override
`compose.test-stack.yaml` nối API vào DB disposable, giữ API chỉ trên network
internal, tắt Auth/Gemini config. Web/DB có ingress để publish cổng loopback;
API không có ingress hoặc published port. Storage config có sẵn trong `.env`
chỉ dùng để validate startup, không bị gọi và không được in ra; không dùng key giả.

```powershell
docker compose --env-file .env.example -p examate-b0d-20261013 -f compose.yaml -f compose.local-db.yaml -f compose.test-stack.yaml build
docker compose --env-file .env.example -p examate-b0d-20261013 -f compose.yaml -f compose.local-db.yaml -f compose.test-stack.yaml up -d --wait
docker compose -p examate-b0d-20261013 -f compose.yaml -f compose.local-db.yaml -f compose.test-stack.yaml ps
curl.exe -i http://127.0.0.1:8080/api/health
curl.exe -i http://127.0.0.1:8080/api/auth/session
# Phải không kết nối được cổng API trực tiếp:
curl.exe --max-time 3 http://127.0.0.1:3000/api/health
docker compose -p examate-b0d-20261013 -f compose.yaml -f compose.local-db.yaml -f compose.test-stack.yaml down
docker compose -p examate-b0d-20261013 -f compose.local-db.yaml down
```

Kết quả đúng: health 200, session 503 AUTH_UNAVAILABLE; API chỉ có 3000/tcp
internal. Không gọi upload/AI để “test cloud” từ stack này. Test credentials và
policy fixture không đem sang Supabase/production. `down` không dùng `-v`, giữ
volume disposable của project riêng; không xóa volume/stack khác.

Các lệnh npm/docker tương tự trên Ubuntu; dùng `curl` thay `curl.exe`. Chưa có VM/URL được phép deploy; Auth gate không thay thế phân quyền/scope/budget pilot, nên không tuyên bố đã deploy hoặc public được dữ liệu thật.

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

Số lượng và kết quả đầy đủ mới nhất ở [báo cáo Đợt 7](docs/PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md).
Harness tạo auth.users/auth.sessions tối thiểu
chỉ cho FK/SQL; không phải Supabase Auth. Guard phải pass trước mọi Pool,
migration/grant/cleanup: chỉ localhost hoặc 127.0.0.1, tên DB kết thúc `_test`,
không URL query override và khác DATABASE_URL cả process env lẫn `.env`.
Thiếu TEST_DATABASE_URL thì fail, không skip. Không dùng DB nhóm làm test target.

```powershell
docker compose -p examate-b0d-20261013 -f compose.local-db.yaml up -d --wait
# Chỉ dùng DB test riêng; không reset/truncate database người dùng.
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
# Nếu tiếp tục kiểm full test-stack, để DB chạy; down khi đã xong:
docker compose -p examate-b0d-20261013 -f compose.local-db.yaml down
```

Harness tự dùng TLS=false cho target local, không load `.env` vào process và
restore biến env sau test. Kiểm migrations hai lần/checksum, role LOGIN
NOBYPASSRLS không owner, quyền bị từ chối/RLS default-deny, session/refresh lock,
admission song song và restart pool. Case HTTP Tasks/Documents dùng owner
chỉ để kiểm persistence; Auth/Storage vẫn mocked, không phải bằng chứng quyền
runtime nghiệp vụ. Cleanup chỉ đúng UUID/hash của lượt chạy. Fixture backend
policies chỉ cấp cho role test, không phải policy tenant của B2.
Các suite workspace mới tạo/drop đúng DB `_test` riêng bằng tên ngẫu nhiên,
kiểm backfill 014, composite FK và service SQL với hai workspace. Harness tự cấp
setting seed fixture, không cần đọc UUID/password từ `.env`; role local cần quyền
CREATE DATABASE cho các fixture này. Không gọi owner-domain tests là tenant RLS.

## API contract

| Method/path                     | Thành công                                   | Lỗi chính                                                          |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| GET /api/tasks                  | 200 array                                    | 503 DB offline                                                     |
| POST /api/tasks                 | 201 task                                     | 400 DTO                                                            |
| PATCH /api/tasks/:id/status     | 200 task                                     | 400 UUID/status, 404                                               |
| GET /api/documents              | 200 metadata array                           | 503 DB offline                                                     |
| POST /api/documents             | 201 metadata                                 | 400 missing/fields, 413 size, 415 type/signature, 503 Storage      |
| GET /api/documents/:id/download | 200 {url, expiresIn:60}                      | 400 UUID, 404, 409 pending/legacy, 503                             |
| DELETE /api/documents/:id       | 204, idempotent khi đã xóa                   | 400 UUID, 409 legacy, 503 partial failure                          |
| GET /api/health                 | 200 DB connected                             | 503 DB unavailable                                                 |
| GET /api/auth/session           | 200 trạng thái session/pre-session + CSRF    | 401/403/429/503 theo trạng thái Auth, CSRF, admission              |
| POST /api/auth/login            | 200 session pilot                            | 400/401/403/429/503                                                |
| POST /api/auth/refresh, /logout | 200 trạng thái session                       | 401/403/429/503                                                    |
| GET /api/assistant/status       | 200 modes general/documents; ragEnabled true | Route có Auth; chỉ báo cấu hình, không chứng minh upstream/quota   |
| POST /api/assistant/chat        | 200 theo mode general/documents/workspace    | 400 DTO, lỗi AI/RAG, 401/403 Auth; xem contract và Assistant setup |
| POST /api/assistant/feedback    | 201 receipt/idempotent result                | 400 input; 401/403 Auth; feedback không phải nhãn chuẩn            |

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

Giới hạn còn lại: login/session đã kiểm bằng test và browser với dependency mock;
gate đã kiểm ở 320–1440px; UI ba role đã thử với fixture local ở desktop/375px.
Migration `012`–`014`, Auth/DB grants, membership thật
và luồng workspace sau đăng nhập Supabase thật chưa nghiệm thu; chưa thử trên
điện thoại vật lý. Documents/RAG đã scope ở service và kiểm role; chưa hoàn thành
answer receipt/feedback ownership, tenant RLS hoặc quota/usage budget AI.
`eval:rag --execute` hiện **BLOCKED**, exit 3: runner live chưa có principal
workspace và bị chặn trước config/DB/Storage/Gemini; chờ đợt tích hợp Auth.
Offline/dry-run vẫn chạy, không chứng minh chất lượng Gemini thật. Thu hồi quyền
giữa index có thể để job ở `processing` và cần reconciliation; không tự bỏ
guard để re-index. Bộ đánh giá RAG và feedback là công cụ hỗ trợ
review: feedback người dùng không tự biến thành đáp án chuẩn hay verdict PASS.
Upload buffer tối đa 10 MiB mỗi request; không transaction phân tán, không
resumable upload/idempotency token. Schema AI/evaluation được giữ cho tương
thích và đánh giá, không phải mọi bảng đều là dữ liệu người dùng đã được cách
ly. Không deploy hoặc dùng dữ liệu thật cho tới khi các giới hạn pilot được xử
lý và kiểm chứng. Bảng chứng cứ không đánh dấu persistence/video/deployment/commit
hoàn thành nếu chưa có bằng chứng.
