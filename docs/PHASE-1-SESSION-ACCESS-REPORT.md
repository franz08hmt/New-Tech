# Đợt 1 — ổn định session và access gate (B0a/B0b)

Ngày 13/10/2026, nhánh `feature/tai-rag-integration`.
Baseline source: `3d96946`; commit session: **`a8cfa02`**.
Commit UI có message `fix(web): make the pilot access gate readable and keyboard safe`;
hash của chính commit đó được ghi trong bàn giao, không tạo commit chỉ để ghi self-hash.
**Chưa push/merge. Đợt này hoàn tất trong phạm vi FE; pilot Supabase thật chưa nghiệm thu.**

## 1. Phạm vi và thay đổi

### Session transport

- `pilot-session-transport.ts` dùng chung GET session còn pending trong cùng
  tab, qua StrictMode, unmount/remount và focus/visibility bursts. Không cache
  identity sau khi request kết thúc, không giữ access/refresh token ở browser.
- Login/logout/refresh được serialize với Auth requests đang chạy. Request
  đọc sau một transition không dùng response từ trước transition. Request
  thất bại giải phóng queue; không tự retry hoặc replay thao tác.
- `use-pilot-session.ts` vô hiệu hóa pending read cũ khi nhận denied hoặc
  logout/session_changed từ tab khác; giữ kiểm epoch/alive để response cũ
  không mở lại workspace. StrictMode cleanup không xóa shared read đang cần
  cho subscriber mới.
- Cơ chế này chỉ serialize trong một tab, không tuyên bố đã giải quyết mọi
  race cookie giữa nhiều browser tabs/instances hoặc concurrency DB thật.
  Auth mutation có thể chờ request trước kết thúc theo timeout hiện có.

### Giao diện và phục hồi

- Gate dùng card nền paper, palette/Poppins hiện có, icon Heroicons outline;
  heading, status và form phân cấp rõ. Không thêm animation/dependency.
- Nhãn English: Sign in, Password, Check session, Sign out, Workspace access.
  Nội dung trợ giúp/error vẫn tiếng Việt. Tiêu đề browser phản ánh trang Sign in,
  và khôi phục tiêu đề workspace khi vào lại.
- Heading được focus khi gate mở hoặc khi workspace bị khóa. Retry giữ nguyên
  DOM và focus qua loading/error; aria-disabled kèm handler guard ngăn thao tác
  đang bị khóa, không chỉ đổi màu control.
- Khi kiểm tra lại session ở nền từ form anonymous, form giữ draft và focus;
  input vẫn soạn được, Submit bị khóa đến khi kiểm tra xong. Login đang gửi
  vẫn khóa input như trước, và password được xóa sau lần gửi.
- AUTH_REQUIRED/SESSION_EXPIRED/SESSION_REFRESH_REQUIRED/CSRF_INVALID khi
  login đưa về trạng thái cần Check session mới; không gửi lại password tự động.
  AUTH_INVALID vẫn là mã BE dùng cho credentials/session không hợp lệ; không
  đổi phân loại backend trong đợt này.
- Session bar của workspace có nền paper, giúp nhãn/nút đọc được trên ảnh nền.

Không sửa `apps/api`, contracts, package/lockfile, migration, RAG/embedding/OCR/
prompt/validator, Auth grants, `.env`, attribution hoặc settings của nhóm.
README và các tài liệu/prompt untracked có trước được giữ ngoài commit này.

## 2. TDD và các kiểm tra đã chạy

Baseline vừa chạy trong review cùng ngày/cùng HEAD, trước mọi thay đổi runtime:
typecheck/test/build/format exit 0; API Vitest 197 + node:test 209 + web 156 =
**562 pass**, skipped 0. Không dùng số test từ chat cũ khác revision.

RED đã quan sát:

1. Test reproduction độc lập: StrictMode duplicate GET, reverse-order cookie/
   CSRF, actual remount, focus bursts: **4 fail**, 3 regression đã xanh ban đầu.
2. API boundary đọc → login/logout → đọc: **2 fail** trước transport queue.
3. Sau coalescing đầu tiên, thêm test Retry ngay khi nhận cross-tab event:
   **2 fail** vì read mới dùng response từ trước revoke. Thêm invalidation và
   kiểm lại GREEN trước commit session.
4. Gate heading/retry/draft/focus/English labels: **5 fail** trước sửa UI.
5. Login với bốn mã stale-session/CSRF: **4 fail** trước sửa recovery.

Các test còn lại là regression; không gán RED cho test xanh ngay. Focused
acceptance cuối **34/34 pass**. Tổng **22 test mới** so với baseline.
Lượt filtered có skipped/deselected vì `-t`, không phải test bị disable trong suite.

| Gate root    | Baseline | Sau session | Acceptance cuối                        |
| ------------ | -------- | ----------- | -------------------------------------- |
| typecheck    | exit 0   | exit 0      | exit 0                                 |
| npm test     | 562 pass | 574 pass    | **584 pass**, fail/skipped/cancelled 0 |
| build        | exit 0   | exit 0      | exit 0                                 |
| format:check | exit 0   | exit 0      | exit 0                                 |

Final test breakdown: **API Vitest 197/14 files**, **API node:test 209**,
**web Vitest 178/9 files**. BE không đổi số test hoặc runtime.
Final build JS 343,96 kB/gzip 99,19 kB; CSS 64,80 kB/gzip 13,80 kB.
Kích thước không phải phép đo FPS/latency/Core Web Vitals.

Một gate trung gian typecheck exit 2 vì test dùng option `exact` mà Testing
Library ByRoleOptions không khai báo. Đã bỏ option, chạy lại typecheck và đủ
gates. Không gọi lỗi khai báo test đó là RED hành vi; log lỗi vẫn giữ.

Logs local/ignored ở `artifacts/project-review-20261013/`:
`phase1-session-red.log`, `phase1-tab-red.log`, `phase1-access-red.log`,
`phase1-expired-login-red.log`, `phase1-focused-acceptance.log`,
`phase1-acceptance-{typecheck,tests,build,format}.log`.

## 3. Browser runtime

Dùng browser tích hợp qua CUA, không có Chrome DevTools MCP trong lượt này.
Không đọc cookie/token bằng JavaScript. Tách hai môi trường kiểm:

### A. Fixture HTTP cô lập

Nest AuthService/guard/CSRF chạy thật, Auth adapter/store/DB/Storage/AI được
override bằng fixture. HTTP cookie do browser xử lý bình thường. Script chỉ
bind loopback, không load `.env`, không gọi provider/DB cloud; không có switch
bypass được đưa vào runtime sản phẩm. Fake credentials chỉ dành cho fixture,
không phải account Supabase.

- Cold page trong StrictMode: stats fixture ghi **1 GET session** trước thao tác;
  login thành công qua cookie/CSRF, logout trở lại form.
- 320×568, 375×812, 768×1024, 1024×768, 1440×900: scrollWidth không vượt viewport,
  buttons trong gate nằm trong bề ngang và cao **44px**.
- 375×420: Tab tới Sign in tự cuộn control vào vùng thấy được; không tràn ngang.
  Đây là viewport thấp giả lập, không phải bàn phím ảo Android/iOS thật.
- Màu computed trên nền card: helper text contrast **5,41:1**, chữ nút primary
  **6,15:1** khi enabled. Font quan sát Poppins. Không tuyên bố đã audit mọi
  pixel/ảnh hoặc toàn app theo WCAG.
- Retry bằng Enter giữ focus Check session khi pending và sau 503.
- Wrong fixture password sau session mới: hiện thông báo credentials rõ,
  password trống và form tiếp tục dùng được.
- No-membership: form ẩn, thông báo thiếu quyền, Check session/Sign out dùng được.
- Auth store outage trước POST task: gate khóa workspace và focus heading.
  Hai lần kiểm thử đều chỉ có POST task **503**, không có replay sau recovery.
- Sau recovery, đọc trực tiếp giá trị input task fixture xác nhận draft
  `Bản nháp giữ nguyên đợt 1` còn nguyên. Khi logout, workspace được dọn.
- Title Sign in → Dashboard/Tasks → Sign in khớp trạng thái quan sát.
- Không ghi nhận JS error/warn trong các log browser đọc. Có các response
  Auth lỗi cố ý; domain DB fixture không mô phỏng đầy đủ SQL Exams/Study plans
  nên không dùng luồng này để nghiệm thu nghiệp vụ của các module đó.

Một lần submit từ form fixture mở lâu chỉ có thông báo chung; không thu được
mã response cũ để kết luận nguyên nhân chính xác. Đã kiểm lại bằng session
mới và kiểm bốn mã stale-session bằng test riêng. Lần đọc draft bằng attribute
value trả null nên chưa kết luận; đã thử lại và kiểm property input trực tiếp,
xác nhận draft preserved. Không lấy kết quả inconclusive làm PASS.

### B. API cấu hình thực tế

Đã dừng fixture, khởi động API compiled với cấu hình máy hiện tại:

```text
AUTH_CONFIG_VALID=false
GET /api/health       -> 200, status=ok
GET /api/auth/session -> 503, AUTH_UNAVAILABLE
GET /api/tasks        -> 401, AUTH_REQUIRED
```

Gate mới hiển thị lỗi thân thiện; Check session giữ focus và không overflow
ở 375px. Không tắt Auth hoặc điền giả config để cho qua. Chưa provision/apply
012/013, không login Supabase thật, không test migration/grants/concurrency
trên DB thật, không gọi Gemini hay Storage thật trong đợt này.
Health có SELECT 1 trên database cấu hình, không có thay đổi schema/record.

Ảnh local/ignored: `phase1-login-mobile.jpg`, `phase1-login-desktop.jpg`,
`phase1-no-access.jpg`, `phase1-outage.jpg`, `phase1-real-api-error.jpg` trong
thư mục artifacts trên. Clone Git không tự có các ảnh/log ignored này.

## 4. Checklist để Tài review/test

Từ `D:\New-Tech\Final-Project`, dùng hai terminal:

```powershell
npm run dev:api
# Terminal thứ hai:
npm run dev:web
```

Mở URL Vite in ra, hiện là `http://127.0.0.1:5173/`. Khi provision Auth ở bước
sau, PUBLIC_ORIGIN phải khớp hostname/port đã chọn. Không chạy db:migrate cho
đợt sửa FE này. Các server kiểm thử của agent đã được dừng để tránh EADDRINUSE.

1. Với config hiện tại: kiểm card/error rõ, Enter vào Check session, focus còn
   trên nút sau khi lỗi trả về; Tab có thứ tự hợp lý, không trắng trang.
2. Xem ở 375px và desktop: chữ không nằm trên ảnh, nút >=44px, không scroll ngang.
3. Sau khi Auth thật được cấp: cold load, login sai/đúng, reload, logout; giữ
   draft khi verify; outage/revoke/account swap. Bước này chưa được agent xác minh
   với Supabase thật, không dùng fake credentials cho API thực tế.
4. Chạy bốn root gates. Có thể chạy riêng tests `pilot-session-race`,
   `pilot-session-transport`, `pilot-access`, `pilot-auth` bằng npm workspace.

## 5. Điểm dừng

Đợt 1 B0a/B0b đã hoàn thành code/test/UI verification trong phạm vi trên;
**chưa phải nghiệm thu toàn bộ pilot**. Việc tiếp theo vẫn là dependency patch/
đường chạy DB-Docker, provision Auth, role/scope và AI budget theo kế hoạch.
Không tự bắt đầu các phần đó hoặc nâng cấp model/PWA/giọng nói trong lượt này.
