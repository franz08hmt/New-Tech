# ExaMate — review FE/BE và mức sẵn sàng pilot

Ngày: 13/10/2026, Asia/Saigon. Nhánh `feature/tai-rag-integration`,
HEAD kiểm tra `3d96946483c5fdc375f06163274fd2591a46dda4`.
Đã fetch origin trong lượt review: HEAD và remote nhánh này không lệch commit
(`git rev-list --left-right --count` trả `0 0`); không merge/pull thay working tree.

## 1. Kết luận và mục tiêu đã xác nhận

**Chưa nghiệm thu một pilot hoàn chỉnh.** Nền code có kiểm thử tốt, nhưng máy
hiện tại chưa đăng nhập được; phân quyền dữ liệu, hạn mức AI và một số kiểm
chứng thực tế còn thiếu. Không nên bắt đầu đồng thời nhiều công nghệ mới.

Tài xác nhận trong lượt review: thầy không bắt buộc một công nghệ cụ thể;
muốn có điểm nhấn New Technologies; đối tượng là nhóm và vài người được mời.
Chưa có hạn nộp/demo cụ thể, nên lộ trình theo thứ tự và tiêu chí hoàn thành,
không phải cam kết thời gian. Không cần mở signup công khai hoặc xây SaaS
nhiều tổ chức trong đợt đầu.

Lượt này review, chạy kiểm tra và tạo tài liệu/diagnostic; không sửa runtime,
áp migration, tạo user/grants, upload/index/xóa tài liệu, gọi Gemini, commit,
push hoặc deploy. README đã sửa và prompt untracked từ trước được giữ nguyên.

Kế hoạch chi tiết: [roadmap đề xuất](../tasks/PROJECT-ROADMAP-2026-10-13.md).

## 2. Kiểm tra đã chạy thật

Môi trường quan sát: Node `v24.13.0`, npm `11.6.2`. Node vẫn thấp hơn mức
`24.15+` khuyến nghị trong README; chưa kiểm lại bằng runtime khuyến nghị.

| Kiểm tra từ root                                        | Kết quả                   | Ý nghĩa và giới hạn                                                                        |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                     | exit 0                    | API `tsc --noEmit`, web `tsc -b`                                                           |
| `npm test`                                              | exit 0, 562 pass          | API Vitest 197/14 file; API node:test 209; web Vitest 156/6 file; skipped/cancelled/fail 0 |
| `npm run build`                                         | exit 0                    | Nest build và Vite production build thành công                                             |
| `npm run format:check`                                  | exit 0                    | Kiểm các glob source/test/script mà workspace đã cấu hình; không phải toàn bộ Markdown/SQL |
| `npm run test:database`                                 | exit 0, pass 0, skipped 1 | `TEST_DATABASE_URL is absent; no real DB evidence`                                         |
| `npm audit --json`                                      | exit 1                    | 6 package findings: critical 1, high 4, moderate 1                                         |
| `npm audit --omit=dev --json`                           | exit 1                    | critical 1, high 3; không đồng nghĩa cả bốn đều khai thác được trong app                   |
| `docker compose --env-file .env.example config --quiet` | exit 0                    | Chỉ xác nhận cấu trúc Compose; không xác nhận container chạy                               |
| `docker info`                                           | không kết nối engine      | Thiếu pipe `dockerDesktopLinuxEngine`; chưa chạy Docker build/up/integration               |

Build web: JS chính 342,29 kB (gzip 98,68 kB), CSS 62,72 kB
(gzip 13,40 kB), 379 modules. Đây là kích thước build, không phải đo tốc độ
điện thoại hoặc Core Web Vitals. Chưa có bằng chứng cần viết lại giao diện vì
kích thước bundle này.

Các test nghiệp vụ có mock DB/Storage/Auth/provider; pass không chứng minh
Supabase Auth, SQL concurrency, quyền runtime non-owner hay Gemini thực tế.
Kiểm DB riêng đã bị skip, phải ghi rõ khi trình bày.

### HTTP và database thực tế

Khởi động API từ build hiện tại bằng `npm run start --workspace @examate/api`.

```text
GET /api/health       -> 200, status=ok
GET /api/auth/session -> 503, code=AUTH_UNAVAILABLE
GET /api/tasks        -> 401, code=AUTH_REQUIRED
```

Chỉ kiểm sự hiện diện cấu hình, không in giá trị: `PUBLIC_ORIGIN`, Auth
publishable/anon key, `PILOT_WORKSPACE_ID`, `SESSION_ENCRYPTION_KEY` đều chưa
được cấu hình hợp lệ. `authConfig()` không hợp lệ. Health chỉ trả `{status:
"ok"}` sau SELECT 1; không chứng minh Auth hoặc AI sẵn sàng.

Diagnostic DB dùng **BEGIN READ ONLY → SELECT catalog/history → ROLLBACK**:

```text
Migration đã áp dụng: 001–011
Checksum source khớp history: 11/11
workspaces / pilot_sessions / pilot_auth_limits: chưa tồn tại
Runtime role rolbypassrls: true
Bảng nghiệp vụ có cột workspace_id trong tập kiểm tra: không có
```

Không đọc nội dung record, PDF, vector, auth.users hoặc session thực tế;
không ghi thay đổi vào Supabase. Script:
`artifacts/project-review-20261013/db-read-only.mjs` (ignored, chỉ trên máy).

### Trình duyệt thực tế

Chrome DevTools MCP không có trong lượt này; dùng browser tích hợp qua CUA.
Web được mở từ Vite hiện tại, API thật đang chạy, không bơm session mock vào UI.

- 1440×900 và 375×812: trang khóa phiên hiển thị thông báo và nút retry.
- `document.documentElement.scrollWidth` bằng viewport 1440/375; nút retry
  đo 140,04×44px. Chỉ xác nhận màn hình này, không xác nhận toàn workspace.
- Retry qua click và Enter vẫn quay về trạng thái không xác minh được phiên.
- Sau retry, `document.activeElement` là BODY: focus của control đã bị mất.
- Ở 375px, chữ nằm trực tiếp trên ảnh nền, không có nền card. Đã quan sát ảnh
  thật; không đo tỷ lệ tương phản WCAG từng pixel, không tuyên bố ratio fail.
- Không ghi nhận JS error/warn trong log browser được đọc ở màn hình gate.
  API trả 503 Auth như trên; không thể kết luận console của toàn app sạch.
- Screenshot ban đầu trắng khi pane bị ẩn; bật pane lên cho thấy UI và ảnh
  nền. Không coi ảnh trắng đó là bằng chứng app bị trắng trang.

Chưa kiểm được sau đăng nhập: CRUD, chọn/index tài liệu, hỏi RAG, citations,
preview/download, feedback, Back/deep link, logout/refresh đa tab. Chưa test
Android/iOS thật, bàn phím ảo, screen reader hoặc performance trace.

## 3. Những điểm cần xử lý

P1: cần xử lý trước khi mời người dùng pilot. P2: cần hoàn tất trước nghiệm
thu các luồng tương ứng. P3: cải thiện có thể xếp sau khi lõi dùng ổn.

### R01 — P1: Auth có code nhưng pilot trên máy chưa dùng được

Bằng chứng HTTP/config/DB ở trên xác nhận trực tiếp. Migration 012/013 trong
repository chưa được áp dụng, cũng chưa có workspace/membership thực tế.

Hướng giải quyết: quản lý project xác nhận target/backup, account thử và
workspace; provision cấu hình qua kênh an toàn; áp migration bằng runner
checksum; kiểm grants/runtime role. Không dùng switch tắt guard để demo.
Kiểm login, refresh, logout, revoke, API outage bằng account test thực tế.

### R02 — P1: membership gate chưa áp quyền role và scope nghiệp vụ

`apps/api/src/auth/auth.guard.ts` gắn principal đã verify, nhưng TasksService
không sử dụng principal: SELECT toàn bảng, UPDATE theo id. Bảng nghiệp vụ và
retrieval chưa có workspace scope. Đây là công việc Chặng 2 đã được ghi nhận
chưa hoàn tất; không phải tuyên bố chặng 1 đã làm sai spec của chính nó.

Diagnostic HTTP cô lập dùng **AuthService/guard thật + store/adapter/DB mock**:

```json
{
  "fixtureOnly": true,
  "liveCloudCalls": 0,
  "role": "viewer",
  "loginStatus": 200,
  "taskCreateStatus": 201,
  "taskUpdateStatus": 200
}
```

Viewer phải bị từ chối ghi theo role matrix pilot đề xuất, nhưng hiện tạo/sửa
được. Không ghi task trên DB thật. Script ở
`artifacts/project-review-20261013/viewer-write.mjs`.

Hướng giải quyết: hoàn tất role matrix và scope cho CRUD, association,
download signing, ingestion, RAG/summary, workspace aggregates, feedback.
Authorize trước Storage/provider/write; không chỉ ẩn nút FE. Runtime hiện
bypass RLS: RLS bật tự nó không giới hạn role này. Tạo role ít quyền theo
thiết kế đã duyệt, kiểm bằng chính role đó. Pilot một workspace vẫn cần các
test nguồn/bản ghi ngoài scope; chưa cần UI nhiều workspace.

### R03 — P1 cho release: dependency audit có findings cần triage/patch

Đã lưu audit ở `artifacts/project-review-20261013/npm-audit.json`.

| Package trong lock/install                           | Advisory và khả năng ảnh hưởng                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `multer@2.2.0` qua `@nestjs/platform-express@12.0.1` | Nằm trên đường upload thật; nhiều advisory high. App có Auth, giới hạn 1 text field/1 file, không async fileFilter; một số điều kiện khai thác đã được hạn chế. Chưa chạy exploit và chưa chứng minh toàn bộ mitigation. Ưu tiên cập nhật đường dependency, regression multipart trong process cô lập. |
| `proxy-addr@2.0.7` qua Express                       | Critical theo audit. Advisory đòi cấu hình trust subnet sai. App chưa bật trust proxy, Auth dùng socket.remoteAddress: chưa thấy điều kiện bypass trực tiếp này trong source. Cập nhật trước cấu hình proxy pilot; không gọi đây là bằng chứng app đã bị bypass.                                       |
| `source-map-js@1.2.1`                                | Qua Tailwind/Vite/PostCSS và jsdom; build/test path là chính, không tự chạy trên server phục vụ web static. Đối chiếu input source-map và cập nhật riêng.                                                                                                                                              |
| `brace-expansion@5.0.9`                              | Qua Nest CLI/minimatch; build tooling. Hiện không thấy người dùng app điều khiển glob của CLI.                                                                                                                                                                                                         |
| `fast-uri`                                           | Moderate, chỉ xuất hiện ở audit toàn bộ. Không phải blocker runtime đã được chứng minh trong lượt này.                                                                                                                                                                                                 |

Advisory chính thức:
[Multer field parsing](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm),
[Multer oversized index](https://github.com/advisories/GHSA-535w-7cp7-47q4),
[Multer diskStorage](https://github.com/advisories/GHSA-3pph-fpjx-jg34),
[proxy-addr trust subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
Multer 2.3.0 sửa các advisory field parsing; 2.4.0 còn sửa diskStorage.
App hiện dùng storage mặc định trong interceptor, chưa thấy cấu hình diskStorage.
proxy-addr có bản vá 2.0.8. Chọn dependency update tương thích theo release notes,
không tự thêm override hoặc chạy audit fix --force. Số package findings không
phải số exploit đã chứng minh; platform-express bị ảnh hưởng qua Multer.

### R04 — P2: bootstrap session có race dẫn tới login CSRF lỗi

`apps/web/src/main.tsx` render StrictMode. `use-pilot-session.ts:141` tạo verify
mới nhưng không coalesce các verify đang chạy. Backend GET session chưa có
cookie tạo pre-session/cookie/CSRF mới cho mỗi request. Epoch bỏ JSON cũ,
không ngăn browser áp Set-Cookie của HTTP response cũ.

Test chẩn đoán dùng hook/PilotAccess thật trong StrictMode, mock hai response
về ngược thứ tự và mô phỏng cookie do response cuối đặt:

```text
bootstrapRequests=2; login matchesCookie=false
UI: "Phiên gửi yêu cầu đã đổi. Kiểm tra lại trạng thái đăng nhập."
Tests 1 failed (1), exit 1
```

Đã chạy test và nhìn thấy fail. Đây là **fixture tái hiện**, chưa phải login
Supabase/bằng chứng cookie của browser thật; cần kiểm thêm khi R01 xong.
Fixture/log giữ ngoài suite chính tại `artifacts/project-review-20261013/`.
Source test tạm trong apps/web/src đã được chuyển ra artifacts, nên không đưa
test đỏ vào working tree source hay làm thay đổi kết luận baseline 562 test.

Lệnh tái hiện:

```powershell
npm exec -- vitest run --config artifacts/project-review-20261013/bootstrap-race.vitest.config.ts
```

Hướng sửa: single-flight cho HTTP bootstrap/verify và áp kết quả cho subscriber
đang sống/epoch hiện tại. Không đơn giản đặt running=true rồi bỏ verify thứ
hai: StrictMode cleanup có thể làm response duy nhất bị bỏ và gate kẹt mãi.
Kiểm reverse-order, cleanup/remount, focus liên tiếp, logout/login đổi account,
đa tab và CSRF mismatch recovery. Không bỏ CSRF hoặc tự replay request ghi.

### R05 — P2: giao diện gate còn thô và mất focus sau retry

`PilotAccess.tsx:26` tháo controls khi verifying; khi trả lỗi, controls được
tạo lại nhưng không trả focus. Browser thực tế xác nhận BODY sau Enter.
`.pilot-access` ở `styles.css:3544` chỉ có width/margin/padding, chưa có card
background/type hierarchy; màn hình mobile đọc chữ trực tiếp trên ảnh.

Hướng sửa: dùng nền panel/tokens và typography Poppins hiện có; không đổi
design system. Giữ control hoặc quản lý focus về retry/heading theo kết quả,
live status rõ ràng. Nghiệm thu desktop/375px, keyboard, contrast thực tế,
error/expired/no-access/anonymous và virtual keyboard khi có account.

### R06 — P2: đường Docker local và DB integration cần cập nhật theo Auth

`main.ts:16–23` bind 127.0.0.1 khi PUBLIC_ORIGIN là HTTP. Trong container,
Nginx ở container web gọi api:3000; API chỉ nghe loopback riêng container sẽ
không nhận kết nối đó. Đây là suy luận trực tiếp từ network bind/Compose,
**chưa tái hiện bằng Docker chạy thật vì engine đang tắt**. HTTPS production
origin có nhánh bind khác, không kết luận mọi cấu hình Docker đều hỏng.

Origin mẫu 5173 cũng phải đổi cho đúng origin FE Docker/HTTPS triển khai.
`dev:web` in URL 127.0.0.1 còn `.env.example` dùng PUBLIC_ORIGIN localhost:
chọn một origin chuẩn để mở web và cấu hình Auth; hai hostname không phải
cùng origin, dù có thể nối cùng DB. Hiện config còn thiếu nên chưa thử được
nhánh lỗi này qua login thật.
Đề xuất tách bind address khỏi logic chọn secure cookie; bind container phù
hợp mạng nội bộ, giữ host publish/firewall theo môi trường. Kiểm proxy/Origin/
CSRF/cookie qua đúng origin, không nới kiểm Origin để sửa kết nối.

`compose.local-db.yaml` dùng PostgreSQL/pgvector thuần. `database.test.mjs`
chạy toàn bộ migrations; 012 tham chiếu auth.users nhưng stack local chưa
chuẩn bị schema này. Đây là thiếu fixture nhìn từ code, **chưa đo lỗi SQL
thực tế**. Chuẩn bị schema Auth tối thiểu chỉ trong test, hoặc Supabase local
đúng chuẩn; fixture tối thiểu không chứng minh Auth provider thật.
Thêm integration dùng runtime non-owner, lock/refresh/admission và persistence.

### R07 — P1 cho AI pilot: chưa có admission/budget cho các lời gọi AI

Giới hạn login hiện có không giới hạn generation, embeddings, OCR và summary.
Một request summary/index có thể tạo nhiều provider calls. Chặng 3 của thiết
kế pilot chưa được triển khai. Trước dùng thử ngoài nhóm, cần reservation/counter
bền vững per user/workspace và cap token/batch/page/time, đo usage ở provider
boundary. Phân biệt hạn mức local, AI_QUOTA upstream và chi phí ước tính.
Không giả hoàn tiền khi timeout hoặc dispatch đã xảy ra.

### R08 — P2: chất lượng RAG chưa có kết luận nghiệm thu

[Báo cáo Đợt 4](phase-4-evaluation-report.md) ghi 24 case/15 PDF-quality.
Live subset lịch sử: E01/E04/E07/E16 REVIEW_REQUIRED; E17 BLOCKED
AI_UNAVAILABLE, semantic PASS=0 vì chưa có human review. Không suy ra độ chính
xác 0%, không biến số test pass thành số câu trả lời đúng.

Chưa chạy lại Gemini trong review này. Cần review những artifact đã có trước,
bổ sung PDF tiếng Việt có dấu/scan và scope fixture độc lập, rồi thực hiện live
subset với cap rõ ràng sau R01/R02/R07. Citation có đúng id/page vẫn phải được
đối chiếu support của từng claim. Feedback không tự trở thành gold.

`gemini.service.ts:99` vẫn gom HTTP 400/503 thành unavailable; log chỉ giữ
errorType. `assistant.service.ts:478` vẫn từ chối source_marker_malformed.
Hướng sửa trước: thêm mã upstream HTTP an toàn, giữ rejection codes; dùng
evaluation để quyết định điều chỉnh output/prompt. Đã có structured JSON
output hiện tại, không đề xuất thêm lại như thể tính năng này chưa tồn tại.

### R09 — P2: indexing thiếu đường recovery sau process chết

Source `document-ingestion.service.ts:180` chỉ claim pending/failed/ready.
Khi process chết sau claim, catch trong process không chạy; record có thể giữ
processing và lần re-index trả 409 mã DOCUMENT_PROCESSING. Không thấy lease,
heartbeat hoặc stale-job recovery trong source đã kiểm. **Chưa kill process
để thử trên DB thật**. FE/proxy timeout 60s cũng chưa chứng minh đủ cho PDF lớn.

Đề xuất test restart trên DB disposable và recovery có job owner/lease; giữ
atomic claim và chống hai worker cùng commit. Nếu cần job queue, bắt đầu từ
PostgreSQL hiện có; không bắt buộc thêm Redis/dependency. Tính provider usage
và trạng thái uncertain, không auto retry AI vô hạn.

### R10 — P3: giới hạn sản phẩm và khả năng mở rộng

- Nhiều list/search tải toàn bộ record; chưa có pagination. Dashboard/mock
  inventory có nhiều lượt courses trùng. Đo trước khi tối ưu cho pilot nhỏ.
- Courses chỉ GET theo thiết kế hiện tại, Tasks chưa có sửa/xóa đầy đủ. Đây là
  phạm vi sản phẩm chưa mở rộng, không tự gắn nhãn lỗi so với spec cũ.
- UI giữ lịch sử hội thoại trong tab; request/model hiện không nhận lịch sử
  chat nhiều lượt. Câu hỏi tiếp nối là hướng nâng cấp thực sự, không chỉ đổi
  model hoặc tăng kích thước panel.
- Chưa thấy manifest/service worker, TTS/STT hoặc module WASM tự triển khai.
  Một dependency có thể sử dụng WASM nội bộ; điều đó không chứng minh nhóm đã
  xây dựng và đánh giá tính năng WASM riêng.
- README/Supabase/Assistant/handoff có snapshot cũ: cần đồng bộ hướng dẫn Auth,
  Docker origin, health response, thao tác HTTP có cookie/CSRF sau nghiệm thu.
- Chưa có thư mục CI .github trong repository đã kiểm; thêm CI gates/DB
  disposable, tránh gọi Gemini tự động bằng key thật trong mọi pull request.

## 4. Phạm vi kết luận

Cập nhật sau snapshot review: [Đợt 1](PHASE-1-SESSION-ACCESS-REPORT.md) đã sửa
session race và gate, kiểm browser 320–1440px với adapter giả lập, và ghi nhận
584 test pass. Các số liệu và finding phía trên giữ nguyên như bằng chứng lịch
sử; không coi chúng là trạng thái sau fix. Login Supabase thật, scope dữ liệu
và hạn mức AI vẫn chưa nghiệm thu.

Có thể xác nhận nền code build được, 562 test đã pass và fail-closed gate đang
chặn truy cập không login. Chưa thể xác nhận toàn bộ FE/BE dùng tốt xuyên suốt
trên môi trường hiện tại, quyền viewer an toàn, DB concurrency hoặc RAG semantic
đạt chuẩn. Chưa thực hiện penetration test tổng thể hay chứng minh không có
lỗ hổng khác. Các kiến nghị cần làm theo roadmap, từng lát có nghiệm thu riêng.

Review dùng skill code-review-and-quality để phân biệt correctness/security/
performance; browser-testing-with-devtools định hướng kiểm runtime và công
bố giới hạn công cụ; security-and-hardening định hướng triage audit theo đường
sử dụng; planning-and-task-breakdown định hướng các lát nhỏ với acceptance.
Không thay hoặc ghi đè tasks/plan.md, tasks/todo.md có sẵn.
