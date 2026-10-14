# Đợt 6 — đường áp B1+014 và B2 lát 3

ExaMate, `D:\New-Tech\Final-Project`, nhánh `feature/tai-rag-integration`,
HEAD đầu `6586b5c`, ngày 2026-10-14 (Asia/Saigon).

**Kết luận:** hoàn tất phạm vi A và B của Đợt 6 trên môi trường local.
Không có migration mới; không sửa migration 001–014, AssistantPanel, TTS/STT,
model, prompt, thuật toán RAG, contracts hay dependency npm. Không kết nối ghi
Supabase, không migrate/rollback cloud, không tạo user thật. Đây **không phải**
nghiệm thu Auth Supabase thật hoặc toàn bộ pilot.

## 1. Baseline và gates cuối

Tracked/index sạch lúc bắt đầu, chỉ có prompt untracked từ trước
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`; không sửa hoặc stage file đó.
Node 24.13.0 (thấp hơn khuyến nghị 24.15+), Docker Server 29.6.2, Linux engine.
DB dùng stack riêng `examate-phase6-20261014`, loopback port 55432.

| Lệnh từ root            | Baseline         | Cuối Đợt 6           |
| ----------------------- | ---------------- | -------------------- |
| `npm run typecheck`     | exit 0           | exit 0               |
| `npm test`              | exit 0: 832 pass | exit 0: **954 pass** |
| `npm run build`         | exit 0           | exit 0               |
| `npm run format:check`  | exit 0           | exit 0               |
| `npm run test:database` | exit 0: 69 pass  | exit 0: **152 pass** |

Không cộng test DB vào số `npm test`. Phân tách suite thật:

- API Vitest: **197/197**, 14 file; API node:test: **527/527**.
- Web Vitest: **230/230**, 11 file.
- DB: rollback 012/013 **13**, legacy DB **10**, pilot CLI **14**, workspace
  migration **23**, Tasks/Courses domain **9**, rollback 014 **18**, academic
  scope **65** = **152**. Tất cả suite DB skipped **0**.
- Không thêm skip, không giảm assertion/quyền để làm test xanh.

Output đã lưu ở thư mục ignored `artifacts/phase6-20261014/`:
`*-baseline.log`, `typecheck-final-verified.log`, `test-final-verified.log`,
`build-final-verified.log`, `format-pre-report.log` và
`database-final-verified.log`. Kết quả format cuối tài liệu ghi thêm trong
`format-final-verified.log`.

### Những lượt kiểm không đạt, không che giấu

- Lượt `test-final.log`: API Vitest 197 pass, node:test **495 pass / 32 fail**,
  web 230 pass. Các lỗi ở fixture startup của bind/proxy/multipart khi hai lệnh
  build API đang chạy chồng nhau. Không lưu được thông điệp nội bộ đủ để khẳng
  định chính xác lỗi import; không gọi đó là lỗi sản phẩm hoặc lỗi cổng 3000.
  Sau khi dừng build chồng nhau, nhóm này chạy riêng **60/60** xanh, không sửa code
  (`runtime-diagnostic.log`).
- Lượt `test-final-serial.log`: một test PDF cũ timeout 5 giây khi môi trường
  đang khởi động Docker; API Vitest **196 pass / 1 fail**, API node:test không
  chạy, web 230 pass. Đây là tình huống tải máy quan sát được, không bằng chứng
  chắc chắn về nguyên nhân timeout. Chạy riêng PDF **6/6** xanh trong 2 giây.
- Lượt cuối chạy lại tuần tự với Docker ổn định: 954 pass, exit 0. Không sửa
  timeout, không retry provider hay nới test. Những log lỗi ban đầu được giữ.
- Docker đã dừng giữa các lượt làm việc; khởi động lại bằng
  `docker desktop start --detach`, kiểm lại `docker info`, rồi chỉ mở lại stack
  test của đợt này.

## 2. A — rollback 014 và runbook một đường đi

CLI mới `pilot:rollback-014`, scripts `pilot-rollback-014.mjs` và helper
`pilot-rollback-014-catalog.mjs`. Tái dùng maintenance connection,
resolvePilotProject, parser và error projection hiện có.

- Mặc định BEGIN READ ONLY / ROLLBACK. Apply cần `--apply` và
  `--confirm-project` khớp target trước khi đọc source/query/kết nối CLI.
  Không in URI, secret, ref đầy đủ hoặc UUID user.
- Kiểm ledger 014/checksum source, từ chối migration mới/lạ. Apply dùng advisory
  lock **424204**, lock_timeout **5 giây**, ACCESS EXCLUSIVE trên ledger,
  workspaces, bảy bảng nghiệp vụ và document_chunks.
- Kiểm đúng object roots của 014: bảy cột, 11 FK, tám index; UUID/NOT NULL,
  defaults, inherited/generated/identity, FK endpoint/action/validation/deferral,
  internal triggers và index keys/readiness/validity.
- Duyệt pg_depend có classid/objid/objsubid; không mặc định chấp nhận mọi
  auto-dependency. External view/index/CHECK/FK/SQL BEGIN ATOMIC bị chặn trước DDL.
  DROP RESTRICT vẫn là lớp bảo vệ độc lập.
- Từ chối nhiều workspace: xóa cột scope sẽ làm mất mapping không thể tự dựng
  lại an toàn khi migrate. Không xóa row workspaces.
- Một transaction bỏ bốn composite FK và unique target; khôi phục **đúng tên và
  định nghĩa** FK gốc 004–007: exam/plan CASCADE, expense/document SET NULL.
  Bỏ bảy FK/index/cột workspace_id và chỉ xóa dòng ledger 014.
- COMMIT/ROLLBACK acknowledgement không rõ thì báo **outcome unknown**, không
  cam đoan đã rollback, không tự gửi lại và không log pg detail/cause nhạy cảm.

### Schema, dữ liệu và test-first

Test writer độc lập viết trước. Lượt thiếu module không được coi là đủ:
sau scaffold không chức năng, **25 unit / 14 DB đều fail đúng hành vi**
(parser/guards/plan/rollback), rồi GREEN sau implementation.
Bốn case catalog drift thêm sau là **regression GREEN**, không nhận test-first.
Suite cuối: 25 unit, 18 DB.

DB PostgreSQL local thật: snapshot trước 014 (columns/defaults, constraints kèm
định nghĩa, indexes, RLS/ACL relation metadata) → migrate 014 → rollback 014 →
snapshot **bằng** trước 014. Không so OID/dropped internal attributes vì FK tạo
lại có OID mới. Counts, IDs, quan hệ course, course NULL, chunks, feedback,
workspace/membership và Auth fixture giữ nguyên.

Tiếp tục rollback 012/013 thành công, migrate lại 012–014 hai lần; ledger/checksum
và timestamp đúng. Có case 015 hợp lệ đã áp, ledger lạ, thiếu/checksum sai 014,
sai project, phụ thuộc ngoài, hai workspace, catalog drift, lỗi ledger sau DDL
rollback nguyên transaction và mất phản hồi sau **COMMIT thật**.

Mutation guard confirm-project: **5 fail / 20 pass**; guard dependency:
**5 fail / 9 pass**, cùng exit 1. Khôi phục guards trước gates xanh.
Logs: `rollback014-semantic-red.log`, `rollback014-database-semantic-red.log`,
`mutation014-confirm.log`, `mutation014-dependencies.log`, `*-A.log`.

### Runbook và preflight

[PILOT-B1-RUNBOOK.md](PILOT-B1-RUNBOOK.md) chỉ có một đường:
tạo bốn user → env → preflight → backup public tên mới → dừng API →
migrate 012→013→014 → verify ledger/checksum/workspace/counts →
cấp ba membership → Tài tự đăng nhập → khi lỗi down 014 rồi down 012/013,
hoặc kế hoạch restore public được duyệt. Không checkout commit cũ.

Preflight có `stage014Applied` và coi 014 là bắt buộc cho acceptance B1.
Đã thấy assertion mới đỏ trước sửa; DB kiểm cả có và thiếu 014.
Giả định toàn bộ dữ liệu cloud là demo của nhóm thuộc một workspace;
dữ liệu người ngoài hoặc mapping chưa rõ thì **dừng**.

Giới hạn: pg_depend không thấy mọi PLpgSQL/SQL string-body/dynamic SQL/app
reference. API phải tắt và rà thay đổi thủ công. Dump public không có
auth/storage/binary/roles/keys; `pg_restore --list` không chứng minh restore.
Chưa chạy backup/restore/cloud migration thật. Sau down 014 không bật runtime
scoped cho tới khi remigrate và verify; FK CASCADE cũ đã được khôi phục có chủ đích.

## 3. B — quyền và scope các module học tập

Principal chỉ từ PilotAuthGuard vào req.principal; service kiểm fail-closed.
Không lấy workspace/role từ body/header/query. Context truyền theo từng call,
không lưu principal vào singleton hoặc ambient global.

| Route hiện có                      | manager            | member             | viewer             |
| ---------------------------------- | ------------------ | ------------------ | ------------------ |
| GET exams/study-plans/expenses     | 200, own workspace | 200, own workspace | 200, own workspace |
| POST ba module                     | 201                | 201                | 403 ROLE_FORBIDDEN |
| PATCH exam / completion study plan | 200                | 200                | 403 ROLE_FORBIDDEN |
| DELETE ba module                   | 204                | 403 ROLE_FORBIDDEN | 403 ROLE_FORBIDDEN |
| Hỏi workspace, chỉ đọc             | Own sources/counts | Own sources/counts | Own sources/counts |

No-membership bị Auth từ chối trước SQL nghiệp vụ. Không thêm GET:id, PATCH
expense hay CRUD mà API trước đó không có. ID ngoài workspace và ID không tồn tại
đi cùng đường 404, response chung. Viewer/member không được xóa thì luôn 403
trước lookup, không dùng existence để quyết định quyền.

Mọi SELECT/UPDATE/DELETE của ba service lọc workspace; JOIN course kiểm cả
course ID và workspace. INSERT gán workspace trong cùng statement từ principal.
Course khác workspace vi phạm composite FK → 400 COURSE_NOT_FOUND, không 500.
Expense không gắn môn vẫn đọc được. Tổng theo kỳ/theo môn trên FE dựa trên
danh sách đã scope; tổng/count của Hỏi workspace cũng scope.

Workspace-records scope cả courses, tasks, upcoming/latest-past exams,
study-plan status/deadline, expense rows, unassigned count và document metadata.
Predicate chạy **trước** ORDER/LIMIT/+1, giữ ngưỡng 200/201/1000, ngày giờ Việt Nam,
intent/format, source kind+id và general/RAG dispatch như cũ.
Document metadata ở đường Hỏi workspace đã scope; **DocumentService/RAG chưa scope**.

### RED→GREEN, DB thật và mutation

- HTTP: **53 ca**, trước sửa **41 fail / 12 pass**, sau sửa **53 pass**.
  Dùng AuthService/PilotAuthGuard thật với Auth adapter/store fixture và fake SQL
  hai workspace nhạy với predicates; không gọi Supabase.
- DB: **64 ca** trước implementation, **53 fail / 11 pass** đúng scope/quyền;
  sau sửa 64 pass. Đường FK giữ NULL/course và manager delete đã xanh từ đầu,
  ghi là regression. Lần fixture đầu sai cover đã sửa trước khi ghi log semantic RED.
- Thêm một regression sau implementation: sáu lời hỏi A/B xen kẽ qua cùng
  singleton, Promise.all, bốn vòng, sources thuộc đúng workspace;
  **xanh ngay lần đầu**, không tuyên bố RED-first. Suite cuối **65/65**.
- Test DB chạy bằng table owner để app predicate không bị tenant RLS che mất
  lỗi; không dùng kết quả này để khẳng định non-owner RLS đã hoàn tất.
- Có foreign/missing mutation 404 giữ toàn bộ row, forbidden trước SQL,
  missing/malformed principal, mỗi intent/sources, >200 foreign rows không
  chiếm LIMIT và >200 own rows có truncation trung thực, tổng/unassigned riêng.

Bốn mutation, đều semantic assertion đỏ, không lỗi bind parameter:

| Mutation cố ý                                                | Fail / pass (suite 64) |
| ------------------------------------------------------------ | ---------------------- |
| Bỏ workspace predicate của exam list, giữ placeholder hợp lệ | 5 / 59                 |
| Bỏ workspace predicate của exam delete                       | 1 / 63                 |
| Bỏ workspace predicate của tasks intent                      | 9 / 55                 |
| Cho member đi qua manager-only delete guard                  | 3 / 61                 |

Phục hồi source, rebuild rồi chạy gates cuối. Logs: `academic-http-red.log`,
`academic-database-red.log`, `academic-*-green.log`, `mutation-list.log`,
`mutation-delete.log`, `mutation-intent.log`, `mutation-member-delete.log`.
Một assertion ban đầu so message create với delete quá chặt: sửa để so delete
với delete trên own/foreign/missing IDs, giữ status/code và kiểm không gọi SQL.

## 4. FE và browser thực tế

ExamsPanel, StudyPlanPanel, BudgetPanel và ba vùng học tập trong CourseWorkspace:
member/manager tạo, sửa, completion; chỉ manager xóa. Viewer hoặc chưa có
principal ẩn form/control ghi, completion disabled; handler vẫn kiểm quyền
trước khi gọi hook. Role loss unmount form/edit/confirmation; quyền trở lại có
draft trắng. Documents upload/detach giữ nguyên để lát 4.

Thông báo quyền tiếng Việt; compact viewer link là View, không mời Add.
PageSections không còn mời mọi role “cứ xóa” kỳ thi. Giữ tokens/font/icons/layout,
không sửa CSS, AssistantPanel, payload chat, citation hay animation.

UI test **44 ca**: **30 fail / 14 pass** trước sửa, **44 pass** sau sửa.
Có forced submit/click với control disabled, downgrade role giữa draft/edit/
confirmation, course detail, filter/retry/navigation và ROLE_FORBIDDEN không
làm logout. App.test full-CRUD fixture đổi từ member thành manager;
member/viewer được kiểm riêng, không đổi default quyền production.

Browser dùng Codex in-app browser thật, Vite và API Nest thật với Auth fixture
synthetic, DB disposable thật; Storage/Gemini/OCR/retrieval override local,
không dotenv/cloud/cookie/password thật. Đây **không phải** đăng nhập Supabase.

- Manager desktop: thêm exam → reload còn data → sửa → confirm-delete bằng
  Enter; thêm plan → completion → confirm-delete; thêm khoản 25.000 ₫ thấy tổng
  môn đúng → confirm-delete, tổng trở lại dữ liệu seed.
- Member desktop: sửa exam/mark plan bằng Enter; filter Finances còn dùng được,
  không có nút xóa. Course form được kiểm ở 375px.
- Manager/viewer: bốn trang Exams/Study plan/Finances/course detail ở **1440×900**
  và **375×812**. Member: ba trang riêng desktop, bốn trang ở 375px.
- Viewer không có add/edit/delete học tập; completion disabled, filter còn dùng,
  breadcrumb Enter đưa về gallery với focus H1; Back và reload ra đúng course.
- Không tràn ngang: documentWidth **1425 ≤1440**, **360 ≤375**. Manager có delete
  buttons, member/viewer không; không dùng Quick notes/Documents để suy diễn
  quyền của các module chưa triển khai.
- Console các lượt nghiệm thu: **0 error / 0 warning**.
  Ảnh ignored: `manager-course-375.png`, `member-course-375.png`,
  `viewer-course-375.png`, `viewer-exams-375.png`.
- Browser tab/viewport override và API/Vite do agent tạo đã đóng.
  Harness từng lỗi SSL local do chưa đặt DATABASE_SSL=false trước migrate:
  chỉ sửa harness ignored; lượt browser nghiệm thu chạy lại sau khi sửa.

Review API độc lập nội bộ không thấy finding runtime: predicate/join,
authorization before SQL, per-call context và dispatch giữ đúng phạm vi.
Không hỏi/gọi cross-model CLI theo quyết định của Tài; nhóm review sau bàn giao.

## 5. Phần còn lại và cách kiểm lại

**Chưa làm:** Documents/signing/indexing/RAG/summary (lát 4), server answer receipt
và feedback ownership (lát 5), role examate_app/NOBYPASSRLS và tenant RLS,
quota/cost AI, Auth Supabase/grants/login thật, điện thoại vật lý, Node 24.15+.
Không coi local fixture hay metadata scope là cách ly toàn ứng dụng.

Cloud sau B1: Tài/Thắng tự làm theo runbook mới, xác nhận dữ liệu demo một
workspace, target/env/backup/API-off rồi migrate/verify 012–014.
Không chạy source scoped trên cloud chưa có 014.

Kiểm lại local, không thay .env hoặc dùng Supabase làm TEST_DATABASE_URL:

1. `docker info`, rồi `docker compose -p examate-phase6-20261014 -f compose.local-db.yaml up -d --wait`.
2. Đặt TEST_DATABASE_URL theo credential/cổng của compose local, tên DB kết thúc
   _test; guard từ chối cloud/non-loopback/trùng DATABASE_URL trong .env.
3. Chạy tuần tự `npm run typecheck`, `npm test`, `npm run build`,
   `npm run format:check`, `npm run test:database`.
   **Không chạy hai npm build API cùng lúc** vì chúng dùng cùng thư mục dist.
4. `docker compose -p examate-phase6-20261014 -f compose.local-db.yaml down`.
   Không `-v`, không xóa volume/stack khác.

Cleanup đã chạy thật: zero academic/browser temporary databases còn lại;
năm DB browser của riêng đợt này được xóa có kiểm tên/owner/không active connection.
Dữ liệu đó là fixture dùng-xong-bỏ, có thể tạo lại, không phải dữ liệu thật.
Compose down exit 0, container/network test removed, volume giữ nguyên.

## 6. Commits và bàn giao

- `d176688` — API rollback 014/catalog và preflight stage 014.
- `cef86ab` — DB snapshot/recovery chain, guards và mutation.
- `735af68` — runbook B1 bootstrap/rollback một đường.
- `e98e791` — scope/quyền API academic và workspace answers.
- `2241a78` — capability UI học tập và tests.
- Commit docs cuối chứa báo cáo này, README và tiến độ roadmap/plan/todo;
  tra hash bằng git log để không tự tham chiếu hash của chính commit.

Chỉ push không force lên origin/feature/tai-rag-integration sau khi gates
đạt và tracked tree sạch; không push prompt untracked, không merge main/deploy.
Kết quả push và exact HEAD được báo trong bàn giao cuối.

Nguồn kỹ thuật đã đối chiếu:
[Nest request object](https://docs.nestjs.com/controllers#request-object),
[React useContext](https://react.dev/reference/react/useContext),
[PostgreSQL LIMIT](https://www.postgresql.org/docs/16/queries-limit.html),
[pg_depend](https://www.postgresql.org/docs/16/catalog-pg-depend.html),
[dependency tracking](https://www.postgresql.org/docs/16/ddl-depend.html),
[ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html),
[node-postgres transaction](https://node-postgres.com/features/transactions).
