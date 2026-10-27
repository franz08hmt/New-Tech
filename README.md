# ExaMate — AI-powered academic workspace

Workspace học tập cuối kỳ New Technologies của Tài–Thắng: React/Vite,
NestJS ESM, PostgreSQL/pgvector, Supabase Auth và private Storage.

**Upload tài liệu nhiều định dạng (27/10/2026):** Documents nhận PDF, DOC, DOCX,
Markdown (`.md`) và TXT, tối đa 10 MiB mỗi tệp. Các định dạng mới được chuyển
thành PDF trên backend trước khi lưu; chỉ PDF được lưu/tải về, không lưu bản gốc
Word/text riêng. Tên như `notes.docx.pdf` thể hiện nguồn chuyển đổi. Citation theo
trang PDF được tạo, có thể khác trang Word gốc. Markdown/TXT là văn bản UTF-8
nguyên văn (không render HTML hoặc tải ảnh/link ngoài). Upload/chuyển đổi không
gọi AI; bước **lập chỉ mục** sau đó vẫn có embedding theo quota hiện hành.

Main Compose có service `document-converter` dùng LibreOffice Writer và font local:
không credential, không publish cổng host, network riêng `internal`, rootfs read-only,
user non-root, tmpfs giới hạn và một conversion tại một thời điểm. Tệp mã hóa,
DOCM/RTF, tệp giả định dạng, DOCX có macro/embedded objects hoặc external relationships
không được hỗ trợ; ngoại lệ duy nhất là siêu liên kết thường (http, https, mailto), chỉ là
liên kết bấm được trong PDF và không bao giờ được tải khi chuyển đổi. Ảnh, template hoặc
object liên kết ngoài vẫn bị từ chối. Giới hạn 35 giây cho converter, 45 giây phía API; PDF đầu ra
không quá 10 MiB. DOC/DOCX có thể khác bố cục/font so với Microsoft Word; cần mở
PDF để kiểm tra. Đây không phải công cụ loại bỏ mọi mã độc.

Để nạp code mới vào bản Docker local, sau khi kết thúc thao tác đang chạy:

```powershell
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml up -d --build --wait
```

Không cần migration mới. Native API không cấu hình `DOCUMENT_CONVERTER_URL` vẫn
nhận PDF; định dạng khác trả lỗi converter chưa sẵn sàng. URL là cấu hình server,
không nhận từ payload; không trỏ tới dịch vụ chuyển đổi công khai. Main Compose
tự cấu hình URL nội bộ. Không tự publish converter hoặc chuyển credential cho nó.
Kiểm converter thật và HTTP/PG17 trên target dùng-một-lần đã có guard:
`npm run test:documents:formats --workspace @examate/api` với
`TEST_DATABASE_URL` và `TEST_DOCUMENT_CONVERTER_URL` loopback thuộc fixture;
provision test capability bằng `prepare-runtime-roles.mjs` trước. Không dùng cloud.

Phát triển trên **`feature/tai-assistant-integration-20261018`**.
Checkout máy Tài: `D:\New-Tech\Final-Project-integration-20261018`.
Folder `Final-Project` cũ còn WIP riêng; không reset, copy đè hoặc gom vào commit.

## Chỉ cần đọc gì cho cuối kỳ?

1. **README này:** cài đặt, chạy, kiểm tra và giới hạn.
2. **[Học và vấn đáp](docs/FINAL-STUDY-GUIDE-VI.md):** giải thích FE, BE,
   database, AI/RAG, hội thoại, SSE và STT; có đường dẫn mở code.
3. **[Checklist demo cuối kỳ](docs/FINAL-DEMO-CHECKLIST.md):** kịch bản,
   bằng chứng, phân công và những điều không được tuyên bố quá mức.

Bộ nộp và bảo vệ (23/10/2026, bản DRAFT): [ma trận rubric + user stories](docs/FINAL-REQUIREMENTS.md),
[báo cáo](docs/REPORT.md), [slide](docs/SLIDES.md), [demo/video/bảo vệ](docs/DEMO-AND-DEFENSE.md),
[gói duyệt gold](docs/GOLD-REVIEW-PACK.md) và [checklist bàn giao](docs/RUBRIC-READINESS-HANDOFF.md).
PDF/PPTX dựng nhanh bằng `python scripts/build-submission-docs.py <thư-mục-xuất>`.
Bản report tiếng Anh có bìa và mục lục Word hiện hành: [PDF 20 trang](docs/submission/ExaMate-Report-20261023.pdf), [Word chỉnh sửa](docs/submission/ExaMate-Report-20261023.docx).
Bản Word/PDF chính giữ layout theo mẫu; sửa Word, cập nhật mục lục và xuất PDF lại khi đổi nội dung.

**New reference-style visual deck (25 October):**
[Offline HTML](docs/submission/ExaMate-Presentation-Visual-20261025.html) and
[15-page PDF](docs/submission/ExaMate-Presentation-Visual-20261025.pdf).
Poppins + Heroicons, black/white/yellow, eleven retained application screenshots.
Open HTML in Chrome/Edge: arrow keys navigate, Overview reads all, Notes reveals
Vietnamese speaker notes. No Docker/network needed to present; the demo link
requires the app at port 8080. Sources and rebuild commands: [SLIDES.md](docs/SLIDES.md).
The older editable PPTX below is retained as a separate design.

**Bản công nghệ tiếng Việt (26/10):**
[HTML offline](docs/submission/ExaMate-Technologies-VI-20261026.html),
[PDF](docs/submission/ExaMate-Technologies-VI-20261026.pdf) và
[PowerPoint trình chiếu](docs/submission/ExaMate-Technologies-VI-20261026.pptx).
10 slide trực quan (gộp đủ 15 chủ đề) với logo, luồng tương tác, 8 ảnh demo đã lưu có ghi nguồn
và lời nói tiếng Việt cho Tài–Thắng. Lý do chọn/trade-off đầy đủ ở
[sổ tay công nghệ](docs/submission/ExaMate-Technologies-Knowledge-VI-20261026.html).
HTML có hoạt ảnh và tương tác offline; PDF/PPTX là bố cục tĩnh, PPTX có fade và
ghi chú chỉnh được. Chi tiết: [SLIDES.md](docs/SLIDES.md).

Slide present 16:9 (24/10/2026): [PowerPoint chỉnh sửa](docs/submission/ExaMate-Presentation-20261024.pptx)
và [PDF 14 trang](docs/submission/ExaMate-Presentation-20261024.pdf).
12 slide chính + 2 backup vấn đáp (ẩn khi trình chiếu PPT, có trong PDF);
nội dung tiếng Anh, Presenter Notes tiếng Việt cho Tài–Thắng.
Nguồn: [SLIDES.md](docs/SLIDES.md); dựng đúng layout bằng
`python scripts/build-defense-slides.py output/presentation` trên Windows có
PowerPoint và các thư viện authoring Python đang dùng. Mở file có sẵn để trình
chiếu/chỉnh sửa thì không cần Python hay Canva. Report/slide vẫn DRAFT vì lượt
evaluation cải tiến chưa hoàn tất; số kiểm 23/10 là bằng chứng giữ lại.

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

Phạm vi chốt 19/10/2026: chỉ hoàn thiện STT khi cần, không phát triển TTS;
bỏ F15 mở rộng agent lên 3 tools, giữ phạm vi 2 tools ban đầu. Điều này không
đáp ứng capability B (≥3 LLM-called tools); hướng capability là RAG + structured
output/Study Coach, chưa được coi đã nghiệm thu. Xem [roadmap](docs/PROJECT-CONTEXT.md).

Chốt bổ sung 22/10/2026: STT đã có, không triển khai TTS; bỏ F11 (PWA) và
F13 (WASM PoC) khỏi kế hoạch. Giữ responsive mobile web, SSE và demo bằng
Docker Compose hoặc bản deployed. Không tự bỏ F14; xem
[đối chiếu rubric](docs/FINAL-REQUIREMENTS.md#phạm-vi-bổ-sung-theo-tài--22102026).

App phục vụ demo trên loopback8080, dùng Supabase Auth/Storage/DB và Gemini
thật. Cloud đã áp profile **supabase-managed001–026**; runtime business/Auth
tách LOGIN và kiểm contract quyền/TLS. Google của Tài đã vào Dashboard thành
công;45 kiểm tra HTTP thật đạt. Xem [triển khai hiện tại](docs/MANAGED-DEPLOYMENT.md).
Máy Thắng và microphone/STT thật chưa được nghiệm thu. Kết quả AI trước/sau
và phần cá nhân xem checklist bàn giao, không suy từ health check.

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

Cloud hiện có capability groups và hai LOGIN runtime đã kiểm startup; API từ
chối owner/BYPASSRLS hoặc privilege drift. Không dùng chung credential cho hai
URL runtime và không chạy `f02:apply-017` canonical lên managed ledger. Profile
managed dùng tên/checksum riêng, không thay byte migration lịch sử.

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
`MIGRATION_DATABASE_URL` được ép rỗng trong API container. Cloud managed026 và
hai LOGIN đã được kiểm thật; không dùng runtime owner làm fallback. Không đổi
profile hoặc migrate khi chỉ khởi động demo.
Nginx ghi đè XFF; chỉ trust peer cố định `172.30.250.10` trên subnet
`172.30.250.0/24`. Kiểm mạng/route không trùng trước chạy; không tự đổi trust.
Trong Docker CA mount dùng `/run/secrets/prod-ca-2021.crt` qua `compose.ca.yaml`, API bind nội bộ
`0.0.0.0`; không áp bind/trust đó cho dev trực tiếp.

```powershell
docker info
docker compose --env-file .env.example config --no-env-resolution --quiet
# Chỉ chạy với cấu hình/runtime target đã được duyệt:
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml build
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml up -d
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml ps
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml down
```

Không in resolved Compose/env/log chứa credential. `down` không dùng `-v`;
không xóa volume/stack của người khác.

**Completion 23/10/2026:** các lệnh khởi động thật trên chỉ dùng sau preflight.
Cloud đã dùng profile managed026, `.env` đã chuyển sang LOGIN runtime đúng
quyền. Không khởi động bằng postgres/BYPASSRLS. Native CA và mount read-only
đã xác minh. Backup/restore rehearsal, Docker health và Google Dashboard thật
đã kiểm; xem [runbook hiện tại](docs/MANAGED-DEPLOYMENT.md).

**Demo không cần credential (stack demo, 23/10/2026).** `compose.demo-stack.yaml` dựng Nest thật + PG17 disposable + nginx, với
Auth upstream, Storage và "model" giả lập (không `.env`, không Supabase, không Gemini). Dùng để luyện demo, kiểm UI/quyền/lỗi và quay video
dự phòng; **không** phải bằng chứng chất lượng model và không được gọi là "live".

```powershell
$env:DEMO_PASSWORD_SEED = '<chuỗi bạn chọn>'   # mật khẩu mỗi tài khoản: <chuỗi>-manager / -member / -viewer / -outsider
docker compose -p examate-demo -f compose.demo-stack.yaml up -d --build   # http://127.0.0.1:8080, tài khoản manager@demo.test …
docker compose -p examate-demo down                                       # dữ liệu nằm trong tmpfs, mất khi dừng
```

Công tắc lỗi AI và chi tiết: [DEMO-AND-DEFENSE](docs/DEMO-AND-DEFENSE.md). Stack thật vẫn là `compose.yaml` ở trên (cần `.env`/secrets của bạn).

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
