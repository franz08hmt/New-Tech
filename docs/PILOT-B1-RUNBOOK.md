# B1 — nghiệm thu Supabase Auth thật (Tài thực hiện)

Đây là runbook cho bước tiếp theo, **không phải các thao tác đã chạy ở B1a**.
B1a chỉ chuẩn bị CLI, kiểm trên DB disposable và đọc cấu hình local. Không tạo
user, migrate, backup hay cấp membership trên Supabase trong đợt chuẩn bị.

## Đường đi nhanh — Tài tự làm, không giao agent ghi cloud

1. App chỉ local `http://127.0.0.1:5173`; xác nhận đúng Supabase và quyền quản trị.
2. Dashboard tạo 4 user demo (auto-confirm), cất password/UUID trong password manager.
3. Tạo key/workspace vào file ignored (mục ii), điền `.env` bằng editor local.
4. Chạy `npm run pilot:preflight`; thiếu 012/013 trước migrate là dự kiến, lỗi khác phải dừng.
5. Backup public bằng image đúng major + TLS verify-full (iv); `pg_restore --list` phải đọc được.
6. Chỉ khi được duyệt: dừng API, chạy `npm run db:migrate`, preflight lại phải exit 0.
7. Dry-run rồi apply membership 3 user (vi); account no-membership để trống.
8. Khởi động API/web, Tài tự gõ password và chạy checklist browser (vii).
9. Nếu cần rollback: dừng API, dùng CLI dry-run trước, apply chỉ với ref khớp (v).
10. Rollback xoá dữ liệu pilot/login; app data cũ giữ nguyên, Storage không bị xoá.

Không hosting/domain/HTTPS cho app; giữ TLS cho Supabase. TTS/STT do Thắng
phụ trách, không sửa AssistantPanel khi chưa phối hợp.

## Giới hạn và điều kiện dừng

- Chỉ dùng dữ liệu demo. B1 chưa cách ly dữ liệu theo người dùng/workspace.
  Runtime Supabase hiện vẫn dùng `postgres`/bypass RLS cho tới B2; preflight sẽ
  báo role thực tế, không tự đổi role. **Viewer vẫn có thể ghi cho tới B2**.
- Không public API/web, không mời người dùng đưa tài liệu thật vào. Auth thành
  công không có nghĩa role matrix, tenant RLS hay ngân sách AI đã hoàn tất.
- Tài cần quyền quản trị đúng project, được nhóm duyệt cửa sổ thay đổi và có
  quyền DB phù hợp. Agent không tự thực hiện các bước ghi bên dưới.
- Dừng nếu target khác project đã duyệt, checksum lệch, ledger không đọc được,
  TLS không xác minh được, dump không đọc được hoặc grants không đủ.
  Không nới Origin/CSRF/RLS, không sửa migration đã chạy để vượt kiểm tra.
- Không gửi password, key, connection URI, UUID user thật hay project ref đầy
  đủ vào chat/log/ảnh. Tắt transcript/terminal recording khi nhập định danh.
  File ignored vẫn là plaintext: bảo vệ quyền truy cập máy và thư mục backup.

## 0. Chuẩn bị tại máy

```powershell
Set-Location D:\New-Tech\Final-Project
git status --short
node -v
docker info --format '{{.ServerVersion}} {{.OSType}}'
```

Giữ nguyên file untracked có trước. Dùng Node 24 theo repository (mốc host đã
kiểm là 24.13.0; một số tooling cảnh báo yêu cầu 24.15+). `.env` nằm ở root,
không copy secret vào frontend, không dùng biến `VITE_*` cho key server.
Origin dev là `http://127.0.0.1:5173`; origin Docker `http://127.0.0.1:8080`
là cấu hình riêng, không dùng lẫn trong lần nghiệm thu dev này.

## i. Tài tự tạo bốn user

Trong đúng Supabase project: **Authentication → Users → Add user**. Tạo bốn
account demo: manager, member, viewer, no-membership. Chọn auto-confirm theo
UI Dashboard. Tài tự nhập password và lưu trong password manager. Không đặt
password trong script hoặc để agent đọc ô nhập. Ghi UUID từng user trong ghi
chú riêng của password manager, không trong repo/báo cáo.

Không có CLI tạo user/đổi password trong project. Auto-confirm chỉ dành cho
account demo do quản trị viên tạo có chủ đích; không thay thế xác minh email
trong sản phẩm công khai. [Supabase Admin create user](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## ii. Tạo key và workspace UUID tại máy, không in giá trị

Tài chạy một lần; lệnh ghi vào file ignored, `wx` từ chối ghi đè file đã có:

```powershell
$pilotGenerateScript = @'
import {randomBytes,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/pilot-local-secrets.env",
  "SESSION_ENCRYPTION_KEY="+randomBytes(32).toString("base64")+
  "\nPILOT_WORKSPACE_ID="+randomUUID()+"\n",{flag:"wx",mode:0o600});
'@
$pilotGenerateScript | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw 'Chưa tạo file; không điền key đoán vào .env' }
Remove-Variable pilotGenerateScript
git check-ignore artifacts/pilot-local-secrets.env
```

Mở file bằng editor local, copy hai giá trị vào `.env` root rồi cất key trong
password manager. Quyền `0o600` không thay thế Windows ACL; Tài tự bảo vệ file.
Không tạo key mới mỗi lần restart: đổi key tùy tiện làm session cũ không giải
mã được. Nếu lỡ mất key, dừng và lên kế hoạch đăng xuất/khôi phục, không đoán key.

Điền thêm trong `.env` (placeholder không phải giá trị chạy được):

```dotenv
PUBLIC_ORIGIN=http://127.0.0.1:5173
SUPABASE_PUBLISHABLE_KEY=REPLACE_FROM_THE_SAME_PROJECT
AUTH_SESSION_VERIFICATION=database
```

Giữ `SUPABASE_URL`, `DATABASE_URL` và CA/TLS đúng project. Nếu có
`MIGRATION_DATABASE_URL`, nó chỉ dành cho maintenance, cũng phải cùng project.
Preflight luôn kiểm **DATABASE_URL runtime**. Membership dùng maintenance URL
nếu có, nếu không dùng runtime URL. Không dùng service-role key thay publishable
key cho Auth client; không bỏ xác minh TLS.

## iii. Preflight chỉ đọc

```powershell
npm run pilot:preflight
```

CLI chỉ in boolean, tên file migration, role/ref đã che; không in checksum,
key, URI, user/session content. Bốn tên biến báo có/không; workspace/key còn
kiểm định dạng. `authConfigValid` kiểm cấu hình tổng thể bằng chính authConfig
của ứng dụng (bao gồm fallback anon và các giới hạn). `publicOriginMatchesDev`
phải true. Cấu hình Auth chưa đủ → `databaseChecked:false`, exit 1, **không mở
kết nối cloud**. Không diễn giải phần chưa kiểm là migration đã thiếu.

Khi đủ cấu hình, tất cả query DB nằm trong `BEGIN READ ONLY ... ROLLBACK`;
connection cũng bật default read-only. Chỉ đọc catalogue/quyền và ledger
`schema_migrations(name,checksum)`, không đọc dòng `auth.users`/`auth.sessions`.
`migrationLedgerReadable:false` → các kết luận applied không dùng làm bằng
chứng; cần sửa quyền/kiểm tra riêng trước khi tiếp tục.

Trước migrate, exit 1 do 012/013 chưa có là dự kiến **nếu** DB đã kiểm được,
checksum các migration đang có khớp và không có lỗi cấu hình/quyền khác.
Sau migrate, `allSourceMigrationsApplied`, `checksumsMatch`, `stage012Applied`,
`stage013Applied`, `role.authUsage`, ba quyền SELECT cột session đều phải true.
Nếu chỉ thiếu grants, người quản trị duyệt và cấp đúng quyền tối thiểu riêng;
agent không tự GRANT trên cloud. Không dùng SELECT * để “kiểm thử”.

PostgreSQL read-only chặn DML/DDL/quyền trên đối tượng thường, không có nghĩa
không phát sinh I/O vật lý hay bảo đảm mọi thao tác trên temporary tables bị
chặn. CLI không nhận SQL tùy ý/không dùng temporary tables.
[PostgreSQL transaction modes](https://www.postgresql.org/docs/16/sql-set-transaction.html).

## iv. Backup trước thay đổi — Tài chạy sau khi duyệt

**Không chạy trong B1a.** Dừng traffic ghi của ứng dụng trong cửa sổ bảo trì.
Tài kiểm version bằng query metadata chỉ đọc trên Dashboard:
`SELECT current_setting('server_version_num')::int / 10000 AS postgres_major;`.
Chọn image Docker chính thức `postgres:<major>` cùng phiên bản major đó.

Tạo riêng `artifacts/pilot-backup.env` bằng editor/password manager, không in
nội dung: `PGHOST`, `PGPORT`, `PGDATABASE=postgres`, `PGUSER`, `PGPASSWORD`,
`PGSSLMODE=verify-full`, `PGSSLROOTCERT=/certs/prod-supabase.cer`.
Dùng direct/session endpoint đã xác minh; không transaction pooler cho công
cụ maintenance. CA ở `secrets/prod-supabase.cer` (ignored) cần đúng project.
Nếu dự án dùng tên CA khác, sửa mount/path **tại máy** cho khớp, không tắt TLS.

```powershell
$pilotPgMajor = Read-Host 'PostgreSQL major đã kiểm ở Dashboard'
if ($pilotPgMajor -notmatch '^[0-9]{2}$') { throw 'Chưa có major hợp lệ' }
$pilotPgImage = "postgres:$pilotPgMajor"
$pilotBackupDir = Join-Path (Get-Location).Path 'artifacts'
$pilotCertDir = Join-Path (Get-Location).Path 'secrets'
$pilotBackupName = 'pilot-before-012-013.dump'
if (Test-Path (Join-Path $pilotBackupDir $pilotBackupName)) { throw 'Backup đã tồn tại; chọn tên mới, không ghi đè' }
docker run --rm --env-file artifacts/pilot-backup.env --mount "type=bind,source=$pilotBackupDir,target=/backup" --mount "type=bind,source=$pilotCertDir,target=/certs,readonly" $pilotPgImage pg_dump --schema=public --format=custom "--file=/backup/$pilotBackupName"
if ($LASTEXITCODE -ne 0) { throw 'Backup chưa đạt; không migrate' }
docker run --rm --mount "type=bind,source=$pilotBackupDir,target=/backup,readonly" $pilotPgImage pg_restore --list "/backup/$pilotBackupName"
if ($LASTEXITCODE -ne 0) { throw 'Archive chưa đọc được; không migrate' }
```

Không `--verbose` hoặc in archive list vào báo cáo công khai vì có tên object.
`pg_restore --list` chỉ kiểm archive đọc được, không phải nghiệm thu restore.
**Không yêu cầu restore thử toàn bộ Supabase nữa:** rollback cho 012/013 dùng
script mục v đã kiểm DB disposable; dump public là bảo hiểm thêm cho dữ liệu app.
`--schema=public` gồm schema và dữ liệu public, không phải `--schema-only`.
Không dump schema auth/storage, roles/global objects hoặc binary **Storage**.
Public vẫn có dữ liệu app và token session đã mã hoá nếu pilot đã chạy; dump
vẫn nhạy cảm, không commit/chia sẻ cho agent. Public có FK tới auth nên không
gọi dump này là backup Supabase đầy đủ/tự restore độc lập được.
Migration 012/013 không tạo/sửa Storage. Nếu cần bảo vệ file Storage riêng,
đó là kế hoạch khác; cất encryption key độc lập với dump.
[PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).

## v. Migration 012/013 và verify — Tài chạy sau backup đạt

```powershell
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration chưa đạt; dừng trước membership' }
npm run pilot:preflight
```

Runner chạy **toàn bộ file còn pending**, không nhận lựa chọn “chỉ 012/013”.
Trước lệnh, đối chiếu danh sách source/ledger: trong B1 chỉ cho phép 012/013
pending. Nếu còn file khác, dừng và duyệt phạm vi lại. Không sửa 001–013 hay
ledger để chữa checksum. Chạy lại runner phải báo already applied và không
thay đổi dữ liệu. Preflight sau đó phải đạt các điều kiện ở mục iii, exit 0.

### Rollback hẹp 012/013 — Tài chỉ chạy khi được duyệt

Dừng API trước. Đây là **xoá dữ liệu pilot**: workspaces, memberships, sessions,
login limits và refresh intents. Không phục hồi session/membership sau rollback;
các user Dashboard và dữ liệu app 001–011 được giữ nguyên. Nếu đã có dữ liệu
pilot cần giữ, dừng và quyết định bảo quản riêng trước `--apply`.

```powershell
npm --silent run pilot:rollback-012-013
# Đọc đủ 5 object và rowCount. Chỉ Tài apply khi đúng kế hoạch:
$pilotProjectRef = Read-Host 'Project ref đích đã đối chiếu riêng'
npm --silent run pilot:rollback-012-013 -- --apply "--confirm-project=$pilotProjectRef"
Remove-Variable pilotProjectRef
```

CLI mặc định chỉ đọc/rollback transaction, output đúng 5 tên public và số dòng
(string để giữ chính xác count lớn), hai tên ledger; ref che bớt. Dùng maintenance
URL như membership, không dùng một URL do người gọi tự đặt để xác nhận project.
Apply kiểm checksum 012/013, không có migration sau 013/không nhận ra, đủ 5
bảng, không FK/view/function hoặc phụ thuộc catalogue bên ngoài. Có phụ thuộc
thì dừng, **không tự xoá phụ thuộc/CASCADE để vượt guard**.

Một transaction khoá cùng migration runner, khoá tables/ledger, `DROP` 5 bảng
không CASCADE rồi DELETE đúng hai dòng ledger. Index/constraint/row type và
trigger FK nội bộ thuộc các bảng đó được PostgreSQL tự gỡ (kể cả trigger FK
nội bộ trên auth.users), không xoá Auth table/user/session provider hay Storage.
Guard không phát hiện mọi SQL string trong function/app ngoài catalogue;
vì vậy phải dừng API và phối hợp Thắng trước rollback.

Nếu script báo **outcome unknown**: không retry/migrate mù. Giữ API tắt, người
quản trị kiểm riêng ledger và sự tồn tại 5 bảng. Nếu còn đủ 012/013 + 5 bảng,
transaction chưa có bằng chứng commit; nếu ledger còn 001–011 và 5 bảng mất,
rollback đã hoàn tất. Trạng thái lẫn lộn/guard fail → dừng và review cùng nhóm.
Sau rollback thành công, preflight phải exit 1 do 012/013 thiếu (không phải lỗi
Auth mới). Muốn quay lại B1: được duyệt mới `npm run db:migrate`, preflight exit
0, cấp lại membership; tất cả người dùng đăng nhập lại. Ledger/checksum source
giữ nguyên, không sửa migration hay UPDATE checksum. Dump public là phương án
bảo hiểm app-data riêng khi thật sự cần, không tự `pg_restore --clean` cloud.

## vi. Cấp ba membership — mặc định dry-run

Tài nhập UUID/project ref qua biến local, không paste giá trị vào chat. Dùng
`npm --silent`: npm thông thường có thể echo arguments (UUID/ref) dù CLI đã
che output. Shell history chỉ giữ lệnh có biến; process arguments trên máy
vẫn có thể chứa định danh, nên chỉ chạy trên máy quản trị tin cậy.

```powershell
$pilotProjectRef = Read-Host 'Project ref đích đã đối chiếu riêng'
$pilotUserId = Read-Host 'UUID manager từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=manager --create-workspace
# Chỉ Tài chạy --apply sau khi dry-run đúng và thay đổi đã được duyệt:
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=manager --create-workspace --apply "--confirm-project=$pilotProjectRef"
```

`--create-workspace` là quyết định riêng, chỉ cần cho lần tạo workspace đầu.
Workspace inactive không tự re-enable. Tiếp theo đổi `$pilotUserId` qua UUID
member/viewer và chạy dry-run rồi apply tương ứng:

```powershell
$pilotUserId = Read-Host 'UUID member từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=member
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=member --apply "--confirm-project=$pilotProjectRef"
$pilotUserId = Read-Host 'UUID viewer từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=viewer
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=viewer --apply "--confirm-project=$pilotProjectRef"
npm --silent run pilot:membership -- list
```

List chỉ trả tổng số theo role/active trong workspace; không liệt kê UUID/email.
No-membership **không được cấp dòng nào**. Apply lại cùng user/role không thêm
bản sao; grant chủ đích có thể đổi role và re-activate membership đã revoke.
Khi lỗi COMMIT/network, kết quả có thể chưa rõ: người quản trị kiểm đúng cặp
UUID privately trong Dashboard trước retry; tổng list không xác minh một user.

Revoke thử trên account demo sau phần browser (không xóa Auth user):

```powershell
$pilotUserId = Read-Host 'UUID demo muốn revoke'
npm --silent run pilot:membership -- revoke "--user=$pilotUserId"
npm --silent run pilot:membership -- revoke "--user=$pilotUserId" --apply "--confirm-project=$pilotProjectRef"
Remove-Variable pilotUserId,pilotProjectRef
```

Revoke membership khác với Dashboard **Sign out user**. Không thêm tính năng
tạo user/password vào CLI để tiện demo. CLI dùng transaction và SQL placeholders;
ref xác nhận phải khớp endpoint thực sự, không khớp một URL tùy ý do người gọi đặt.

## vii. Browser acceptance — password do Tài tự gõ

Chỉ bắt đầu sau iii–vi. Hai terminal tại root: `npm run dev:api` và
`npm run dev:web`, mở `http://127.0.0.1:5173`. Kiểm API đã có process chưa,
không mở thêm process cùng cổng. Dùng account demo, desktop và 375px, bàn phím.
Agent chỉ quan sát status/requestId/UI/network path; **không đọc cookie,
Set-Cookie, Authorization, password, login payload, token hay localStorage
nhạy cảm**, không lưu HAR chứa credentials.

| Case              | Thao tác của Tài                                                                                               | Bằng chứng cần ghi (không secrets)                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sai password      | Tự nhập sai một lần                                                                                            | Thông báo dễ hiểu; 401 dự kiến, không tạo session đăng nhập                                                 |
| Đúng password     | Tự đăng nhập manager/member/viewer                                                                             | UI workspace; status thành công, nhận đúng role; không coi viewer read-only là đã có                        |
| Reload            | Tải lại tab đã đăng nhập                                                                                       | Giữ đúng account/session, không nháy dữ liệu account khác                                                   |
| Refresh tự động   | Đợi mốc refresh thật theo session ứng dụng, không sửa token/DB/đồng hồ                                         | Quan sát `/api/auth/refresh` và UI vẫn dùng được; chưa thấy request thì chưa đánh dấu đạt                   |
| Logout            | Logout rồi reload                                                                                              | Trở về gate, route protected không truy cập được                                                            |
| Dashboard signout | Tài Sign out user account demo, đợi qua cache xác minh (tối đa 30s cấu hình hiện tại), gọi route protected lại | Session bị từ chối; ghi thời điểm thực tế, không hứa access JWT tự vô hiệu ngay                             |
| No-membership     | Tự đăng nhập account thứ tư                                                                                    | 403/no access theo API hiện có; không xuất dữ liệu demo phía sau gate                                       |
| Hai tab           | Đăng nhập, mở tab thứ hai; logout/đổi account ở một tab rồi tương tác tab kia                                  | Tab kia cập nhật đúng principal/gate trước khi đọc/ghi; nếu lệch ghi bug, không coi SQL fixture là PASS     |
| Đổi account       | Tạo note/chat/draft demo account A, logout, nhập B                                                             | Không thấy note/chat/draft A ở B; quay lại A kiểm đúng namespace/đời sống bộ nhớ, không đọc storage secrets |
| Membership revoke | Revoke đúng user demo, đợi qua cache rồi gọi protected route                                                   | Bị từ chối, không tự cấp lại quyền                                                                          |
| API outage        | Tắt đúng process API, tương tác, bật lại                                                                       | Hiện lỗi tử tế; không trắng trang/đẩy lại POST mù, không lộ state account khác                              |

Auth session và access JWT không cùng vòng đời; việc revoke cần kiểm trên
luồng thật và cache đã cấu hình. [Supabase sessions](https://supabase.com/docs/guides/auth/sessions).
Ghi PASS/FAIL/BLOCKED riêng từng case và viewport, console lỗi JS so với lỗi
mạng cố ý, thời điểm và requestId đã lược định danh. Không tự đánh dấu toàn bộ
B1 đạt nếu chưa có refresh/signout/account-isolation thực tế.

## Kiểm lại kỹ thuật và bàn giao

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
# DB test local riêng, không Supabase. Harness cũ chuẩn bị fixture/migrations trước CLI tests.
docker compose -p examate-b1a-20261013 -f compose.local-db.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-b1a-20261013 -f compose.local-db.yaml down
```

Port 55432 phải rảnh/đúng container test của mình trước khi up. Target guard
từ chối host ngoài loopback, DB không phải `_test` hoặc trùng DATABASE_URL/root
`.env`. Không reset/cleanup Supabase. Fixture Auth/role/policies chỉ kiểm SQL,
**không phải Supabase Auth, không phải tenant policies B2**. `down` giữ volume,
không dùng `-v` với volume không thuộc lượt test đã xác minh.

Liên quan: [thiết kế stage 0](pilot-stage-0-design.md),
[stage 1a](pilot-stage-1a-report.md), [stage 1b](pilot-stage-1b-report.md),
[B1a report](PHASE-4-B1A-REPORT.md). Không tự push/merge/deploy sau nghiệm thu.
