# Đợt 6 — đường áp B1+014 và B2 lát 3

ExaMate, `D:\New-Tech\Final-Project`, `feature/tai-rag-integration`, HEAD đầu
`6586b5c`, ngày 2026-10-14 (Asia/Saigon). Artifacts ignored:
`artifacts/phase6-20261014/`. Không ghi Supabase/Storage/provider thật, không
migrate/rollback cloud, không tạo user và không sửa migration 001–014.

## Baseline

Tracked/index sạch, chỉ prompt untracked có trước
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`, không sửa/stage. Node 24.13.0 (vẫn thấp
hơn khuyến nghị 24.15+), Docker Server29.6.2 linux. Dùng đúng stack test riêng
`examate-phase6-20261014`, port loopback55432, không chạm stack SOP.

```text
TYPECHECK_BASELINE=0
TEST_BASELINE=0 (API Vitest197 + node:test449 + web186 =832)
BUILD_BASELINE=0
FORMAT_BASELINE=0
DB_UP=0
DATABASE_BASELINE=0 (13+10+14+23+9 =69, skipped0)
```

Các lệnh là npm run typecheck/npm test/npm run build/npm run format:check và
npm run test:database từ root. DB có guard loopback/_test/khác DATABASE_URL/.env
trước connection/DDL/cleanup. Logs `*-baseline.log` lưu output thật.

## A. Rollback 014 và runbook hợp nhất — hoàn tất

Scripts mới `pilot-rollback-014.mjs` và helper feature-local
`pilot-rollback-014-catalog.mjs`, npm root/workspace `pilot:rollback-014`.
Dùng lại maintenance connection/resolvePilotProject/error projection/parser
đã có. Mặc định BEGIN READ ONLY/ROLLBACK; --apply cần ref khớp trước source read/
query/socket. Output chỉ tên object/count/FK khôi phục/ref che, không UUID/URI/key.

- Check 014 hiện diện/checksum khớp source, không ledger mới/lạ. Apply khóa
  advisory424204 như migrator, lock_timeout5s, row_security=off, ACCESS EXCLUSIVE
  ledger/workspaces/bảy bảng business và chunks. Không đổi checksum/migration.
- Chỉ cho đúng roots014 (7 column +11 FK +8 index), kiểm UUID/NOT NULL/default/
  inherited/generated/identity, FK keys/endpoints/actions/validation/deferral/
  internal triggers, index keys/table/method/unique/readiness/validity. Walk
  pg_depend có classid/objid/**objsubid**, deduplicating UNION, không whitelist
  mọi auto-dependent. Manual index/check/view/FK/SQL atomic function bị chặn
  trước DDL; RESTRICT vẫn là lớp chặn độc lập.
- Từ chối nhiều workspace dưới locks: xóa workspace_id sẽ mất mapping, chuỗi
  down/up sau đó không thể tự bảo toàn cách gán nhiều nhóm. Không xóa workspace.
- Một transaction bỏ4compositeFK +unique index, khôi phục tên FK gốc đúng004–007:
  exam/plan ON DELETE CASCADE; expense/document SET NULL. Bỏ7FK/index/column
  scope và DELETE **chỉ ledger014**. Không DELETE business, auth._, storage._.
- COMMIT acknowledgement hoặc ROLLBACK acknowledgement không rõ → outcome unknown,
  không hứa đã rollback; không log pg detail/cause/SQL/secret.

### Bằng chứng schema/data và RED→GREEN

Independent test writer: lượt đầu25unit+12DB đỏ vì chưa có module; không coi
import failure là đủ. Thêm scaffold không chức năng, chạy **semantic RED**:
25unit/14DB đều fail vì parser/guards không từ chối/plan rỗng/không rollback.
Không setup/SQLfixture failure. Sau implementation25unit+14DB GREEN; bốn drift
case thêm sau là **regression GREEN**, không nhận là test-first. Suite DB18/18.

Case thật: source001–013 fixture → schema snapshot (visible columns/defaults,
RLS/ACL relation metadata, constraints +pg_get_constraintdef, indexdefs) →014→
rollback014 →snapshot **bằng** trước014. Không so OID hoặc dropped internal attrs
vì PostgreSQL tạo lại FK với OID mới. Toàn bộ business rows/IDs/nullable course/
chunks/feedback và Authfixture giữ nguyên; workspaces/memberships giữ nguyên.
Tiếp tục rollback012/013 thành công, default migrate012–014 hai lần checksum/
timestamp khớp. Đây là PostgreSQL local thật, không phải test mock/schema Supabase.

Case khác: ref sai trướcquery; missing/mismatch014; validknown015+ledger và
unknownledger; externalview/manualindex/manualCHECK/externalcompositeFK/SQL
BEGIN ATOMIC; haiworkspace có row đã gán; wrongrootnullable/deferrable/indexkeys/
disabledtriggers; lỗi DELETE ledger sauDDL rollbackatomic; lostresponse sau
**COMMIT thật** báo unknown, schema/data đã down nhưng không retry mù.

Mutation guard project: **5fail/20pass**, exit1; dependency guard: **5fail/9pass**,
exit1, manualindex/check chứng minh DROP COLUMN RESTRICT một mình chưa đủ.
Phục hồi guards, thêm plan FK khôi phục, chạy root+fullDB có đăng ký suite:

```text
TYPECHECK_A=0
TEST_A=0: API Vitest197 + node:test474 + web186 =857
BUILD_A=0
FORMAT_A=0
DATABASE_A=0: 13+10+14+23+9+18 =87, skipped0
```

Logs `rollback014-semantic-red.log`, `rollback014-database-semantic-red.log`,
`mutation014-confirm.log`, `mutation014-dependencies.log`, `*-A.log`.
Review thiết kế đã hòa giải rủi ro multipleworkspace/catalog granularity/drift/
chunks bằng guards/locks/tests; reviewer test đọc lại runtime không Required.
Theo Tài, không hỏi/gọi cross-model CLI; review sau bàn giao do nhóm thực hiện.

### Runbook và preflight

Một đường đi mới trong [PILOT-B1-RUNBOOK.md](PILOT-B1-RUNBOOK.md):4user→env→
preflight→backup public tên mới→dừngAPI→migrate012→013→014 bootstrapworkspace→
verify ledger/checksum/workspace/counts→3membership→browser→nếu lỗi down014
rồi down012013 hoặc kế hoạch restorepublic được duyệt. Không checkout commit cũ.
Giả định dataSupabase chỉ demo của nhóm, người ngoài/multipleworkspace thìSTOP.
Preflight báo **stage014Applied**, required ở CLI acceptance. Assertion mới
true đỏ trước sửa, sau sửa missing014 cũng false;14pilotCLI DBtests pass.

Giới hạn: pg_depend không thấy mọi PLpgSQL/SQLstring-body/dynamicSQL/app reference;
catalog-tracked dependencies mới được chứng minh. API phải tắt/check thay đổi
thủ công. Dump public không có auth/storage/binary/roles/keys, FKauth vẫn cần
xử lý khi restore; pg_restore--list không chứng minh restore. Chưa backup/
restore/migrate/revoke/login cloud trong đợt này. Sau down014 không bật runtime
scoped (không còn workspacecolumn); remigrate/verify trước, không downgrade app.

Sources: [pg_depend](https://www.postgresql.org/docs/16/catalog-pg-depend.html),
[dependency tracking](https://www.postgresql.org/docs/16/ddl-depend.html),
[ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html),
[transaction client](https://node-postgres.com/features/transactions).

## B. B2 lát 3 — đang thực hiện, chưa nghiệm thu

Chưa sửa runtime/FE phần B ở checkpoint A. Bàn giao toàn đợt/push chỉ sau khi
quyền/scope/DB/mutations/browser và gates cuối phần B đạt. Không gọi A complete
là Documents/RAG/feedback ownership/tenant RLS/pilot hoàn tất.
