# Đợt 5 — B2 lát 1–2: workspace foundation và Tasks/Courses

ExaMate, `D:\New-Tech\Final-Project`, nhánh `feature/tai-rag-integration`.
Checkpoint đầu `68ccd9f`; bắt đầu kiểm 2026-10-13, tiếp tục và bàn giao
2026-10-14 (Asia/Saigon). Artifacts dùng tên thư mục của ngày bắt đầu:
`artifacts/phase5-b2-20261013/` (ignored, không commit).

## Kết luận trong phạm vi

Đã làm nền schema 014, principal context và quyền/scope của **API Tasks/Courses**.
Viewer đọc được, không tạo/cập nhật task; manager/member được ghi task trong
workspace. UUID/slug ngoài workspace trả 404 như bản ghi không tồn tại.
FE lấy role từ session principal, ẩn form và khóa controls ghi của viewer.

**Chưa hoàn tất B2 toàn ứng dụng, chưa nghiệm thu B1 cloud.** Không áp 014,
migrate, cấp user/membership/grants hay ghi bất cứ dữ liệu nào lên Supabase
trong đợt này. Không gọi provider AI/Storage thật. Chỉ thử local disposable và
Auth/Storage fixture; không public/pilot tài liệu thật.

## Baseline và kết quả cuối

Trước sửa: tracked/index sạch, chỉ prompt untracked có trước
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`; không sửa/stage file đó.
Node host `24.13.0`; Docker Server `29.6.2`, OSType `linux`.
Node vẫn thấp hơn khuyến nghị 24.15+ trong README; không nâng Node/dependency.

| Lệnh từ root            | Baseline                                                       | Cuối đợt                                                                   |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run typecheck`     | exit 0                                                         | exit 0                                                                     |
| `npm test`              | exit 0: API Vitest 197 + API node:test 405 + web 178 = **780** | exit 0: API Vitest **197** + API node:test **449** + web **186** = **832** |
| `npm run build`         | exit 0                                                         | exit 0                                                                     |
| `npm run format:check`  | exit 0                                                         | exit 0                                                                     |
| `npm run test:database` | exit 0: rollback 13 + database 10 + pilot CLI 14 = **37**      | exit 0: **13 + 10 + 14 + 23 + 9 = 69**, skipped **0**                      |

Không skip/todo test để làm xanh. Test DB chạy riêng, không cộng lẫn vào 832.
Output thật được rút gọn:

```text
TYPECHECK_EXIT=0
TEST_EXIT=0
BUILD_EXIT=0
FORMAT_EXIT=0
API Vitest: Tests 197 passed (197)
API node:test: tests 449; pass 449; fail 0; skipped 0
web: Test Files 10 passed (10); Tests 186 passed (186)
DATABASE_FIXED_EXIT=0
DB suites: tests/pass 13, 10, 14, 23, 9; fail 0; skipped 0 (mỗi suite)
```

Log: `baseline-exits.json`, `*-baseline.log`, `*-resume-final.log`,
`database-fixed-final.log`. `database-final.log`/`database-resume-final.log`
không phải bằng chứng DB đạt: các lượt đó chưa hoàn tất.

### Hai lỗi khi kiểm cuối, đã xử lý

- Root test lượt đầu: API 197/449 pass, web **185 pass + 1 fail**. Test integration
  cũ render WorkspaceApp trực tiếp không có principal, nên controls ghi bị khóa
  đúng fail-closed. Reproduce riêng exit 1; bổ sung **member fixture** vào đúng
  test writer, giữ assertion cập nhật bằng response server và lỗi POST. Focused
  integration + permission **12 pass**, rồi full root 832 pass. Không thêm
  fallback quyền member vào sản phẩm hoặc nới viewer assertions.
- Test DB mới kiểm rollback thật giữ connection duy nhất (`max:1`) rồi gọi lại
  pool để đọc snapshot, dẫn tới chờ vô hạn. Quan sát log dừng sau hai case 014
  và PostgreSQL connection idle; dừng đúng process test, sửa snapshot dùng
  connection đang giữ. Chạy lại toàn bộ DB suite **69/69**. Đây là sửa harness,
  không sửa runtime/rollback guard. Lượt treo bị dừng có exit -1, không tính PASS.
- Khi tiếp tục, Docker engine đang tắt. Khởi động Docker Desktop và đúng stack
  DB test, không reset cloud; các container SOP không thuộc ExaMate không sửa.

## 0. Regression rollback — commit riêng

Commit `9ef4095`: fixture source có migration 014 SQL hợp lệ, ledger cũng có
014 với checksum khớp. Test xác nhận source fixture thực sự được dùng; rollback
012/013 từ chối **vì migration >13**, không phải vì tên migration lạ.
`runPilotRollback` có seam loadSource chỉ ở hàm nội bộ cho test; CLI không thêm
cờ chọn/bỏ migration. RED trước seam, GREEN sau; mutation bỏ guard `>13` làm
test đỏ `Missing expected rejection`, phục hồi guard rồi rollback unit 36 pass.
Thêm kiểm DB với **014 thật đã áp**, snapshot/ledger/schema không đổi sau reject.

## 1. Migration 014 và runner

File mới `infra/postgres/migrations/014_workspace_scope.sql`, không sửa 001–013.
Runner giữ SHA-256/chuẩn hóa CRLF và bọc **mỗi file** trong BEGIN/COMMIT; không
bọc toàn bộ lịch sử trong một transaction. Trong transaction pending, chỉ env
UUID hợp lệ được bind bằng `set_config('examate.pilot_workspace_id',$1,true)`.
Không interpolate/in UUID; missing/invalid không đặt setting. Hint lỗi chỉ
allowlist bốn thông báo cố định 014, không echo pg detail/SQL/secret.

- Khóa workspaces + bảy bảng trong backfill; thêm workspace_id UUID, gán legacy
  rows rồi NOT NULL, FK tới workspaces **ON DELETE RESTRICT**, index từng bảng.
- Có một workspace: dùng lại, setting khác ID đó thì RAISE. Có >=2 workspace:
  RAISE, không tự đoán mapping. Không workspace + dữ liệu seed: setting hợp lệ
  tạo workspace rồi backfill; thiếu setting thì RAISE với hướng dẫn cấu hình.
  Bảy bảng thật sự trống và không workspace không cần setting/tạo workspace.
- Bảo toàn counts/ID/toàn bộ trường cũ, course associations, chunks; document
  và expense course_id NULL vẫn NULL. Không gán user từ owner_name/nickname.
- Unique target courses(workspace_id,id), composite course FK cho exams,
  study_plans, expenses, documents; RESTRICT thay course→exams/plans CASCADE.
  Giữ document_chunks→documents CASCADE; không thêm tenant policy/runtime role.
- Nếu 014 fail, chính 014 rollback, ledger/data của 001–013 đã commit vẫn còn.
  Sau 014, rollback 012/013 từ chối; không có down 014 trong đợt này.

DB suite 23 case: empty; seed + setting qua runner; missing/invalid setting;
one-workspace có/không setting; mismatch/two-workspace fail và snapshot không
đổi; data chỉ trong từng bảng độc lập; indexed NOT NULL/FK; composite foreign
course reject; hai nhánh course RESTRICT; chunk CASCADE; migrations hai lần,
checksum/timestamp; rollback 012/013 sau 014. Các bảng exams/plans có course FK
NOT NULL nên không thể làm fixture chỉ một bảng đó mà không có courses.

Old rollback-positive suite dùng **DB riêng với source 001–013 fixture** để
không xóa workspace của root test DB đã có 014. Seam fixture không khả dụng
qua CLI production. Auth.users/Auth.sessions tối thiểu chỉ trong test harness,
không phải Supabase Auth.

## 2. Principal, Tasks/Courses và INSERT tương thích

Controllers chỉ truyền `req.principal` do PilotAuthGuard authenticate gán;
không lấy workspace/role/user từ body/header/query. Helper kiểm shape là
fail-closed cho internal callers, **không phải một cơ chế authenticate mới**.
Tasks/Courses đều dùng bind parameters; thiếu/malformed principal 401 trước SQL.

| Principal      | Task/course reads của workspace | Create/update task              | Foreign task update/course detail              |
| -------------- | ------------------------------- | ------------------------------- | ---------------------------------------------- |
| manager/member | 200                             | 201/200                         | 404 chung, không đổi row ngoại                 |
| viewer         | 200                             | 403 `ROLE_FORBIDDEN`, trước SQL | Ghi vẫn 403 trước lookup; đọc course ngoại 404 |
| no-membership  | Guard 403                       | Guard 403                       | Guard từ chối trước service                    |

Không thêm Course CRUD hoặc Task DELETE. ROLE_FORBIDDEN ở contracts `.d.ts`
dùng cùng FE/BE; response tiếng Việt, không làm client logout nhầm như session
denial. UI chỉ là gợi ý capability, backend mới là ranh giới quyền.

Theo bổ sung Tài duyệt: Exams/Plans/Expenses/Documents/Feedback chỉ thêm workspace
trong **cùng INSERT**, lấy từ verified principal. Không mở rộng reads/role/thuật
toán ở năm module này. Audit source runtime thấy đúng sáu service INSERT business
tables (Tasks và năm module đó); Courses chỉ seed. Admin membership/migration
tạo workspace là đường khác đã có/chủ đích, không phải business INSERT bỏ sót.

Documents xác định principal trước Storage upload. INSERT lỗi FK course ngoại
map 400 COURSE_NOT_FOUND như FK course không tồn tại; xác nhận row không tồn tại
rồi remove object, giữ reconcile khi response mất nhưng row đã commit, giữ object
khi lookup không xác định. Không lộ storage_key trong StoredDocument. Feedback
viewer vẫn được gửi; chưa có server answer receipt/ownership.

### RED → GREEN và mutation

| Nhóm                   | RED thực sự quan sát                                                                                                                  | GREEN cuối                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| HTTP scope             | 15 fail + 5 regression pass trước sửa                                                                                                 | 20 pass                                            |
| INSERT compatibility   | 16 fail + 2 reconciliation regression pass                                                                                            | 18 pass                                            |
| Migration foundation   | Lượt đầu 16 fail + 1 chunk regression pass; bổ sung 5 setting cases fail trước sửa                                                    | 23 pass (gồm case rollback thật bổ sung sau)       |
| Real SQL hai workspace | Có sửa lỗi cleanup fixture riêng; không có artifact chứng minh cả 9 case đã RED vì thiếu tính năng, nên ghi là integration/regression | 9 pass                                             |
| Viewer FE              | Suite đỏ vì module principal context chưa tồn tại; không gọi đó là đủ bằng chứng permission                                           | 8 pass; HTTP mutations/DB tests kiểm quyền độc lập |
| Runner safe hint       | Test hint 014 đỏ trước allowlist                                                                                                      | 22 migration unit pass tổng cộng                   |

Setting unit có bốn case: UUID hợp lệ bind transaction-local và không log giá
trị; thiếu/invalid/nil không đặt setting. Một assertion thử tìm chuỗi GUC ở mọi
SQL vô tình bắt cả source 014, đã thu hẹp vào câu set_config; không sửa sản phẩm
để đáp ứng assertion sai. Case rollback thật mới thêm là regression GREEN sau
nền 014; không tuyên bố tất cả test đều đỏ vì tính năng thiếu.

Mutation task list bỏ predicate workspace nhưng giữ SQL/parameter hợp lệ:
HTTP **7 fail/13 pass**, thấy row B rò vào A. Mutation bỏ viewer write check:
**2 fail/18 pass**, thấy 200 thay vì 403. Phục hồi cả hai, rebuild API rồi
scope + compatibility **38/38** pass. Không gọi cloud hoặc chạy mutation lên
API nối DB thật. Các guard đều còn trong source cuối.

## Browser thật — local Auth fixture, không Supabase

Dùng Chromium in-app browser, web Vite loopback và Nest AppModule thật với
Auth/DB/Storage/provider fake do server kiểm soát trong artifacts. Fixture chặn
fetch ra host ngoài loopback, không load .env. Không đọc cookie/password/token
hay gọi Assistant/TTS/STT. DevTools MCP không có, dùng browser automation khả
dụng; không gọi fixture là login Supabase thật.

- Desktop 1440×1000: không form Add task, status/complete disabled, filters hoạt
  động; clientWidth/scrollWidth 1425/1425, không tràn ngang.
- 375×812: clientWidth/scrollWidth 360/360 (scrollbar), không tràn ngang; thông
  báo quyền xem rõ, controls ghi khóa, nút/view links nằm trong viewport.
- Bàn phím đổi Status filter Done/All tasks, Owner filter; Tab bỏ controls
  disabled và tới View tasks. Reload vẫn viewer, không hiện form writer.
- Console error/warning rỗng. Không thử điện thoại vật lý/keyboard ảo trong đợt.

Ảnh local ignored: `viewer-desktop.png`, `viewer-375.png` trong artifacts cùng
thư mục log. Member/manager create/update và lỗi POST kiểm bằng Testing Library
và HTTP/real-SQL tests, không tuyên bố đã browser-login ba account thật.

## Chưa scope — phải làm lát tiếp trước dữ liệu thật

- Exams/Study plans/Expenses: list/read/update/delete và role matrix chưa scope;
  INSERT mới có workspace + composite course FK, không phải isolation đầy đủ.
- Documents: list/lookup/download/preview/course reassignment/delete/index vẫn
  chưa scope/role. Composite FK chống gán course chéo, không authorize tài liệu.
- RAG/retrieval/summary/course-info/indexing/chunks/citation và workspace-records
  chưa scope. Workspace-records có thể đọc task/course qua SQL riêng, nên dù API
  Tasks/Courses đã đạt, **không bảo đảm task/course kín qua mọi surface**.
- Feedback idempotency lookup/global answer/submission IDs, export và ownership
  chưa scope; viewer feedback là quyền chủ đích, chưa answer receipt server.
- Chưa examate_app/NOBYPASSRLS/tenant policies; owner-domain test cố ý tránh RLS
  che mất lỗi predicate. Old non-owner session/admission fixtures vẫn pass,
  không phải nghiệm thu tenant defense-in-depth.
- Không sửa thuật toán/model/prompt/chunking/OCR/validator, không thêm npm
  dependency, không sửa AssistantPanel/TTS/STT, .claude/settings.json hay migration cũ.

## Tự chạy lại và cloud sau B1

```powershell
Set-Location D:\New-Tech\Final-Project
docker info --format '{{.ServerVersion}} {{.OSType}}'
# Kiểm port 55432 đúng stack của mình trước khi up.
docker compose -p examate-b2-20261013 -f compose.local-db.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-b2-20261013 -f compose.local-db.yaml down
```

Guard URL chạy trước mọi connection/write/cleanup; chỉ loopback, tên `_test`,
không trùng DATABASE_URL/.env. Local test role cần CREATE DATABASE, fixture
kiểm owner của exact random target trước DROP; không reset root DB hay cloud.
`down` giữ volume, không `-v`. DB test có schema/Auth data demo tái tạo được,
không dùng credentials cloud trong lệnh mẫu.

Cleanup đã chạy: dừng đúng process DB test treo, kiểm owner/target rồi DROP đúng
hai DB ngẫu nhiên từ hai lượt treo/interrupted của suite 014. Không xóa root
`examate_test`; đây chỉ là fixture seed (14 ledger, không membership/tài liệu/
feedback), tái tạo bằng test được. Metadata cuối báo còn **0** DB ngẫu nhiên B2.
`docker compose -p examate-b2-20261013 -f compose.local-db.yaml down` exit **0**,
giữ volume. API/web fixture của lượt browser đã kết thúc khi tiếp tục; kiểm cuối
không còn listener 3000/5173. Không dừng stack SOP hay Docker Desktop của người dùng.

Cloud **chưa chạy ở đây**: hoàn tất B1 đã review, đúng một workspace có ID khớp
PILOT_WORKSPACE_ID, xác nhận mapping/counts/target/checksum, backup public mới,
dừng writes rồi quản trị viên duyệt áp 014. Runner hiện chạy mọi pending;
checkpoint B1-only source<=013 là `68ccd9f`, không chạy nhánh mới như “chỉ12/13”.
Xem [runbook](PILOT-B1-RUNBOOK.md#014-sau-b1--chỉ-khi-quản-trị-viên-duyệt-cửa-sổ-thay-đổi-riêng).
Nếu lỗi giữ API đóng, không dùng rollback012/013/drop ledger/binary cũ unscoped;
forward-fix/restore phải có kế hoạch quản trị riêng.

Nguồn thiết kế SQL: [PostgreSQL FK/RESTRICT/NULL](https://www.postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-FK),
[set_config transaction-local](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADMIN-SET),
[@Req controller boundary](https://docs.nestjs.com/controllers).

Review độc lập chỉ đọc implementation/tests/runbook: approve trong phạm vi,
không Critical/Required code findings; yêu cầu thêm báo cáo thật đã đáp ứng ở đây.
Reviewer không chạy tests/DB, bằng chứng runtime là các lượt parent ghi ở trên.

## Commit bàn giao

| Commit    | Nội dung                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| `9ef4095` | Regression rollback với source/ledger 014 hợp lệ và mutation guard >13        |
| `a2ca92e` | Nền 014, runner, trusted principal, scope Tasks/Courses và INSERT tương thích |
| `71e396e` | DB backfill/FK/rollback và service SQL hai workspace                          |
| `e0e10a0` | HTTP scope/role/spoofing, INSERT/reconciliation và đăng ký suites             |
| `ea2f39d` | Context session principal và Task UI read-only của viewer                     |

Migration và các INSERT runtime tương thích được lưu cùng commit để tránh một
checkpoint schema NOT NULL nhưng INSERT còn thiếu workspace. Bộ test mới tách
DB/HTTP để dễ review; FE và tài liệu bàn giao là các commit riêng. Các checkpoint
trung gian không phải phiên bản cloud được phép áp; nghiệm thu trên trạng thái
toàn đợt. Commit tài liệu cuối: `docs: record verified B2 workspace scope and cloud handoff`.
Được Tài duyệt push không force lên đúng nhánh phát triển sau khi gates xanh và
tracked tree sạch; không merge main/deploy. Prompt untracked có trước vẫn giữ nguyên.
