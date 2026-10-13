# Đợt 4 — B1a: chuẩn bị nghiệm thu Auth thật

Ngày bàn giao: 2026-10-13 (Asia/Saigon). Repository ExaMate,
`D:\New-Tech\Final-Project`, nhánh `feature/tai-rag-integration`.
HEAD đầu lượt: `776ceba`. **Chuẩn bị B1a, chưa nghiệm thu B1/Supabase Auth thật.**

## Phạm vi đã làm

### Preflight chỉ đọc

- Thêm `apps/api/scripts/pilot-preflight.mjs`, npm root `pilot:preflight`.
  Import config/Auth đã build; không khai báo config Auth thứ hai để thay hành vi.
- Target được suy ra từ direct host hoặc username qualified của pooler,
  đối chiếu SUPABASE_URL cùng project. Từ chối hostname lookalike, query/hash
  override, URL không Supabase. Output chỉ có ref/role che bớt, boolean và tên
  migration; không in URI, key, checksum hoặc UUID user.
- Database query trong `BEGIN READ ONLY ... ROLLBACK`, kể cả đường lỗi.
  Connection preflight còn có default_transaction_read_only=on. Đọc catalogue
  role/quyền và ledger name/checksum; không SELECT nội dung users/sessions.
- SHA-256 source migration dùng cùng chuẩn hóa CRLF → LF như runner.
  Kiểm ledger đọc được, checksum migration đã áp dụng, mọi source đã áp dụng,
  riêng 012/013, USAGE(auth) và SELECT ba cột auth.sessions.
- authConfigValid kiểm bằng authConfig thật; report từng biến chỉ có boolean,
  workspace/key kiểm định dạng. Có kiểm origin dev chính xác và chế độ
  AUTH_SESSION_VERIFICATION=database. Cấu hình Auth thiếu thì không mở socket DB.

### Membership CLI

- Thêm `apps/api/scripts/pilot-membership.mjs`, npm root `pilot:membership`.
  Input UUID/role/workspace env, không có tạo Auth user/đặt password.
- Mặc định dry-run, transaction read-only/rollback. Chỉ apply với cờ rõ ràng
  và ref xác nhận khớp endpoint thực sự; validate trước mở socket/query.
- Grant kiểm user tồn tại bằng SELECT 1; tạo workspace cần --create-workspace.
  Không re-enable workspace inactive. Apply khóa user/workspace và upsert
  membership theo PK: chạy hai lần vẫn một dòng; grant chủ đích đổi role/active.
- List tổng số role/active, không UUID/email. Revoke de-activate đúng membership,
  không xóa user/workspace hay lịch sử. Tất cả UUID/role dùng SQL placeholders.
- Maintenance dùng MIGRATION_DATABASE_URL nếu có, nếu không DATABASE_URL;
  cả hai phải khớp SUPABASE_URL. Preflight chỉ kiểm runtime DATABASE_URL.
- Lỗi được lược nguyên bản pg/cause/detail. Nếu mất phản hồi COMMIT, báo kết
  quả có thể chưa rõ và yêu cầu kiểm privately trước retry, không hứa rollback.
- Root wrapper dùng child npm --silent; runbook yêu cầu outer npm --silent
  nữa, tránh lifecycle echo UUID/ref trong arguments. Định danh vẫn có thể hiện
  trong process arguments tại máy quản trị, không coi CLI là kho bí mật.

### Runbook và khám phá trong README

[PILOT-B1-RUNBOOK.md](PILOT-B1-RUNBOOK.md) theo thứ tự Dashboard users → local
key/workspace → preflight → backup → migrations/verify/rollback → memberships →
browser. Các lệnh ghi/backup là **hướng dẫn Tài tự chạy sau khi duyệt**, không
phải bằng chứng đã thực hiện. README thêm link và giới hạn B1/B2.

Không sửa FE, thuật toán/session/auth runtime, AI/RAG/model/prompt, contracts,
migration 001–013, dependencies/lockfile, .env thật hay .claude/settings.json.
Không tạo attribution Claude; không push/merge/deploy.

## Baseline trước sửa

Đã kiểm git status: tracked sạch; có sẵn untracked
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`, giữ nguyên/không stage.
Host Node `v24.13.0`, Docker `29.6.2 linux`.

DB riêng của lượt này:

```powershell
docker compose -p examate-b1a-20261013 -f compose.local-db.yaml up -d --wait
```

Exit 0, image pgvector/pgvector:pg16, chỉ bind 127.0.0.1:55432. TEST_DATABASE_URL
được truyền trong process test với credentials local-only của Compose, không
load .env vào harness. Target guard từ B0d kiểm loopback/_test/không trùng runtime.

| Lệnh                  | Baseline exit | Pass / skipped                                           |
| --------------------- | ------------: | -------------------------------------------------------- |
| npm run typecheck     |             0 | Không phải test                                          |
| npm test              |             0 | API Vitest 197; API node:test 313; web 178; tổng 688 / 0 |
| npm run build         |             0 | Không phải test                                          |
| npm run format:check  |             0 | API/web matched files sạch                               |
| npm run test:database |             0 | 10 / 0                                                   |

Log ignored: `artifacts/phase4-b1a-20261013/*-baseline.log`, db-up.log.

## RED → GREEN và review

- Test author độc lập viết ba file test trước runtime. Lần chạy unit đầu
  **hai file fail vì module chưa tồn tại** (exit 1); không nói rằng toàn bộ
  từng assertion đã chạy đỏ. SQL đầu cũng exit 1 vì module thiếu.
  Bằng chứng: cli-red.log, cli-database-red.log trong artifacts ignored.
- Sau implementation, 47 unit + 13 SQL pass. Bổ sung availability/parser và
  missing/corrupted ledger là các test tăng coverage, có case xanh ngay lần
  chạy đầu; không gắn nhãn các case đó là RED→GREEN.
- Review runtime độc lập không tìm thấy bypass target/read-only/SQL parameters;
  bắt được thông báo khẳng định rollback sai khi mất ACK COMMIT. Viết riêng
  test `lost COMMIT acknowledgement...`, thấy đỏ đúng message cũ, rồi sửa và
  xanh. Log commit-uncertainty-red.log, cli-unit-green.log.
- Kết quả focused cuối: **57 unit, 14 SQL, fail/skipped 0**.
- Review tài liệu độc lập đã thử nhưng agent không chạy được vì usage limit;
  runbook được main tự review, không tuyên bố đã qua reviewer thứ hai. Không
  chạy lệnh backup/key generation/cloud apply để “kiểm” tài liệu.
- Skill TDD dùng để tách test author và ghi RED; security-and-hardening giữ
  target/transaction/confirmation/privacy; git-workflow giữ commits/phạm vi;
  documentation-and-adrs ghi rõ quyết định và giới hạn thay vì tuyên bố Auth đạt.

### SQL thật, DB disposable

Test mới chạy sau harness B0d (npm script chạy hai file **tuần tự**, không dựa
vào cloud hay race giữa files). Fixture Auth chỉ có shape tối thiểu cho SQL,
không phải Supabase Auth. Cleanup chỉ UUID/table probe của lượt test.

- Trong read-only transaction: INSERT, UPDATE, DELETE, TRUNCATE, ALTER, DROP,
  CREATE, GRANT, REVOKE, COMMENT đều bị từ chối SQLSTATE 25006. Savepoint phục
  hồi từng probe, cuối rollback; connection còn dùng được sau lỗi.
- Audit preflight: mọi query metadata/ledger chạy khi transaction_read_only=on,
  không FROM/JOIN auth.users/auth.sessions; 13 source checksum khớp fixture DB.
  Test giả lập thiếu 001/checksum 012 sai bằng response adapter, **không sửa
  ledger thật**; report không đánh dấu ready.
- Dry-run grant/create/revoke không ghi. Apply hai lần một dòng. Sai project,
  role/user không tồn tại, workspace thiếu cờ/inactive đều bị từ chối.
- List/revoke/reactivate và lỗi giữa insert workspace/membership được kiểm;
  rollback không để lại workspace vừa tạo. Fixture B0d còn kiểm non-owner
  NOBYPASSRLS, refresh row lock, race admission và persistence restart pool.

Không claim đã thử mọi SQL có thể tồn tại: probe chặn write trên đối tượng
thường, không phải cam kết “không physical I/O” hoặc temporary-table policy.

## Kiểm cấu hình local (không mở kết nối cloud)

Chạy thật `npm run pilot:preflight`, exit **1 có chủ đích**:

```text
databaseChecked: false
PUBLIC_ORIGIN: false
SUPABASE_PUBLISHABLE_KEY: false
SUPABASE_ANON_KEY: false
PILOT_WORKSPACE_ID: false
SESSION_ENCRYPTION_KEY: false
authConfigValid: false
publicOriginMatchesDev: false
databaseSessionVerification: true
reason: Auth configuration incomplete; database checks have not run.
```

Output target chỉ ref che bớt; báo cáo không copy ref đầy đủ.
Vì .env Auth chưa đủ, **không query cloud catalogue/ledger/grants**, không biết
trạng thái cloud mới hơn checkpoint lịch sử. Không đọc users/sessions cloud,
không tạo user, không pg_dump, không migrate 012/013 hoặc apply membership cloud.

Smoke CLI qua root npm --silent với UUID/role synthetic sai: exit 1, chỉ error
generic, không echo input, không mở DB socket. Log membership-cli-rejection.log.

## Gate cuối và output thực tế

| Lệnh                  | Exit | Pass / skipped                                               |
| --------------------- | ---: | ------------------------------------------------------------ |
| npm run typecheck     |    0 | Không phải test                                              |
| npm test              |    0 | API Vitest 197; API node:test 370; web 178; tổng **745 / 0** |
| npm run build         |    0 | Không phải test                                              |
| npm run format:check  |    0 | API/web matched files sạch                                   |
| npm run test:database |    0 | B0d **10 / 0** + CLI **14 / 0** = **24 / 0**                 |

Các dòng summary thực tế (không chứa định danh):

```text
API Vitest: Tests 197 passed (197)
API node:test: tests 370; pass 370; fail 0; cancelled 0; skipped 0
Web Vitest: Tests 178 passed (178)
Database B0d: tests 10; pass 10; fail 0; cancelled 0; skipped 0
Database CLI: tests 14; pass 14; fail 0; cancelled 0; skipped 0
All matched files use Prettier code style!
```

Log đầy đủ ignored: typecheck-final.log, tests-final.log, build-final.log,
format-final.log, database-final.log, verification-exits.json. Markdown/manifest
được Prettier kiểm riêng; root format gate không bao gồm docs.

## Giới hạn / bước tiếp theo

- B1a đạt phần chuẩn bị local; **B1 Auth thật chưa PASS**. Tài cần tự làm runbook,
  gõ password và cung cấp bằng chứng UI/status đã lược secrets. Không kiểm
  browser/Auth thật trong đợt này; không suy ra login/refresh/revoke từ fixture.
- Runtime Supabase `postgres`/bypass RLS và viewer ghi được là giới hạn pilot
  trước B2 theo thiết kế/hiện trạng đã ghi; chưa kiểm role cloud lại ở lượt này.
  Chỉ dùng dữ liệu demo. Chưa tenant isolation/role matrix hoặc quota AI B2/B3.
- Backup/restore/grants thực tế chưa chạy; hướng dẫn restore cần chủ project
  duyệt target tương thích và kiểm thử trước. Storage không nằm trong DB dump.
- Host Node 24.13.0 vẫn dưới engine một số tooling; không nâng Node trong B1a.
  Không có runtime/frontend behavior change để lấy screenshot mới ở đây.

## Commit và dọn dẹp

| Commit  | Nội dung                                                  |
| ------- | --------------------------------------------------------- |
| f4ac4de | Read-only preflight + target/privacy helpers + unit tests |
| 1a3b544 | Membership CLI + unit/SQL tests + registration tuần tự    |
| 1ca7246 | Runbook và README discovery/limits                        |

Commit bàn giao chứa báo cáo này; xem git log. Không stage prompt untracked
có trước, không push/merge/deploy. Lệnh dọn đúng project test, không xóa volume:

```powershell
docker compose -p examate-b1a-20261013 -f compose.local-db.yaml down
```

Giữ volume `examate-b1a-20261013_test-postgres-data`; không dọn container/volume
SOP hoặc project khác. Tự chạy lại theo mục cuối runbook, luôn kiểm đúng port
và TEST_DATABASE_URL. Dừng chờ Tài duyệt bước nghiệm thu Auth thật.

Đã chạy lệnh down trên, exit **0**. `compose ps` của project test không còn
container; volume test vẫn tồn tại. Container/network test đã gỡ, dữ liệu DB
trong volume giữ nguyên và có thể dùng lại bằng up. SOP containers không bị
thao tác. Bằng chứng cleanup: db-down.log trong artifacts ignored.
