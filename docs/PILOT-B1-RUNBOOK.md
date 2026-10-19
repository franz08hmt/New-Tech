# B1 + 015 — bootstrap và nghiệm thu Auth trên hai máy

**Demo đã bootstrap ngày 17/10/2026:** schema cloud `001`–`015`, bốn account demo
và ba membership đã tạo theo lựa chọn của Tài; HTTP Auth thật trên máy Tài đã đạt.
Thắng chỉ làm theo [hướng dẫn chạy sau bootstrap](PILOT-DEMO-HANDOFF.md), không
tạo account/workspace hoặc migrate lại. Các checkpoint thiếu đầu vào/PREPARED
bên dưới là lịch sử; browser/máy Thắng và Auth extended vẫn chưa nghiệm thu.

Nhật ký PREPARED/bootstrap xem bằng
`git show e9ac2af:docs/PHASE-13-B1-TWO-MACHINE-AUTH-REPORT.md`. Không dùng phê duyệt
được ghi cho một lượt cũ làm quyền ghi cloud của task mới. App đang có schema/
membership demo theo checkpoint trên; không lặp lại bootstrap để chữa lỗi login.
Thay đổi cloud tiếp theo phải được giao rõ target, tác động và đường lui.

F01 Google OAuth dùng [checkpoint riêng](#f01--google-setup-và-checkpoint-live)
ở cuối runbook. Source có 016 nhưng code run chỉ áp disposable; không coi
bootstrap demo cũ là quyền bật provider, migrate hoặc link identity Google.

## Hai đường đi và checkpoint phê duyệt

| Bước              | Tài/người quản trị                                                                                | Thắng trên chính máy mình                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Inventory         | Commit, ports, config effective, project khớp, ledger/grants chỉ đọc                              | Làm riêng, không lấy kết quả máy Tài thay mình                             |
| Chốt kế hoạch     | Ownership dữ liệu demo, target, workspace/accounts/roles, backup private, giờ dừng cả hai writers | Xác nhận đúng target qua kênh riêng; dừng writers đúng cửa sổ              |
| Schema/membership | Chỉ sau Tài duyệt rõ: backup → snapshot → 012/013/014/015 → verify → dry-run/apply membership     | Không tự migrate hoặc tạo workspace thứ hai                                |
| Code delivery     | Xin chỉ thị push/bàn giao commit đã review nếu cần; không tự gửi repo/bundle                      | Giữ WIP rồi cập nhật theo phương án được duyệt; không reset --hard         |
| Local setup       | Điền config qua editor/kênh an toàn; giữ key ổn định                                              | Điền `.env` riêng, cùng project/workspace đã chốt, không copy cookie       |
| Acceptance        | Tài tự nhập password, kiểm từng case và ghi bằng chứng đã lược secrets                            | Thắng tự nhập password, tự kiểm checklist, xác nhận thực hiện tại máy mình |

Trước backup/migration/grants/membership/user changes/code delivery, Tài phải
duyệt **target riêng, pending chính xác, tác động, backup/đường lui, cửa sổ dừng
writers hai máy và giới hạn còn lại**. Thiếu quyết định thì BLOCKED_BY_APPROVAL,
không chạy lệnh ghi. Giả định demo của nhóm chưa được xác nhận thì dừng trước
snapshot/backfill, không gán dữ liệu người ngoài vào một workspace.

### Inventory mỗi máy, không đọc account/session rows

Từ root đúng repository, chỉ đọc:

```powershell
git status --short --branch
git rev-parse HEAD
node -v
npm -v
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3000,5173 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
npm --silent run pilot:preflight
```

Không tự kill PID. Chỉ dừng đúng process được chủ máy cho phép. Kiểm source proxy
Vite `/api` → `127.0.0.1:3000`, browser `http://127.0.0.1:5173`, một API và một
Vite; origin Docker 8080 không phải dev 5173. Có bảng migrations trong source
không có nghĩa DB đã áp; có `.env` đúng không chứng minh API đang chạy đã nạp nó.
Ghi commit của FE/API process; thay config cần restart đúng API được phép.

`loadEnvironment` nạp `.env` root, **process environment có sẵn thắng giá trị
file**. Chủ máy kiểm shadowing bằng boolean/so sánh trong công cụ local, không
in toàn bộ env hoặc command line có secret. Không tạo key mới mỗi lần restart.

| Config cần đối chiếu riêng                    | Điều kiện                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PUBLIC_ORIGIN                                 | Chính xác http://127.0.0.1:5173                                                                       |
| SUPABASE_URL / Auth publishable hoặc anon key | Cùng project; key không phải Storage secret/service-role, không placeholder                           |
| DATABASE_URL / CA / Storage config            | Đúng project; TLS verify-full/CA khớp kết nối; key opaque không được coi đã kiểm project chỉ từ shape |
| PILOT_WORKSPACE_ID                            | UUID hợp lệ, đúng workspace nhóm đã chốt/backfill                                                     |
| SESSION_ENCRYPTION_KEY                        | 32 byte, Base64 canonical; ổn định, không tự rotate key đang dùng                                     |
| DATABASE_POOL_MAX                             | 2–20 theo validator Auth; không dùng pool=1 của PoC refresh cần connection độc lập                    |
| AUTH_SESSION_VERIFICATION                     | Giữ database; không auth_user để né grants                                                            |
| VITE_*                                        | Không chứa server secrets                                                                             |

Preflight thiếu config trả databaseChecked:false/exit 1 là đúng; **không điền
key giả để ép DB check**. Khi config hợp lệ mới chạy lại preflight chuẩn. Kiểm
metadata độc lập nếu được Tài giao phải BEGIN READ ONLY, chỉ catalog/ledger/grants,
không SELECT account/session rows; không coi nó là preflight đã ready. Target
máy Thắng khác thì dừng, đối chiếu riêng; không copy credential qua chat.

### Code delivery là checkpoint riêng

Không suy trạng thái GitHub mới từ local tracking ref. Không fetch/push tự động.
Nếu chưa có bằng chứng commit cần dùng đã được bàn giao, ghi
BLOCKED_BY_CODE_DELIVERY; không bảo Thắng “pull là xong”. Tài duyệt phương án
delivery trước. Nếu sau này có chỉ thị push: review committed range được duyệt,
giữ WIP unstaged, không force/merge main, xác minh remote hash; hai máy ghi cùng
commit khi nghiệm thu. Không gửi zip/bundle/history/secrets để né checkpoint.

### Chẩn đoán bootstrap 503

| Quan sát an toàn                                       | Diễn giải/hành động                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| /api/auth/session 503 AUTH_UNAVAILABLE                 | Chưa xác minh session; UI giữ khóa, chưa hiện login form. Kiểm preflight/config rồi DB/network/quyền; mã này không tự chứng minh nguyên nhân cụ thể |
| Preflight authConfigValid:false, databaseChecked:false | Sửa config qua người quản trị; chưa query DB trong lần preflight đó                                                                                 |
| Ledger 001–011 đúng, 012–015 pending                   | Schema mới chưa bootstrap; chuẩn bị kế hoạch rồi xin duyệt, không retry login để thay migration                                                     |
| Auth login 401 AUTH_INVALID                            | Sai/chưa xác nhận credential hoặc phiên không hợp lệ; không mở workspace; chủ tài khoản tự kiểm Dashboard/password                                  |
| 403 CSRF_INVALID / session-race                        | Check session trước khi người dùng gửi lại; không tự replay login/POST                                                                              |
| Login thành công nhưng no_access                       | Chưa membership, không phải lỗi password; quản trị duyệt role/workspace riêng                                                                       |
| 503 khi cấu hình và schema đúng                        | Có thể Auth/DB/TLS/network/permission; dùng requestId + safe code/path và preflight, không suy từ screenshot hoặc chỉ health 200                    |

Log HTTP chỉ fixed Auth routes, business UUID/slug đã che, status/code/requestId;
unknown path → /unmatched, query bị bỏ. Không log body/getResponse/stack/header/
email/password/token. AUTH_UNAVAILABLE không đồng nghĩa quota/RAG lỗi. Không xóa
toàn localStorage/cookies để thử; xử lý riêng cookie app cần người dùng đồng ý.
GET auth/session có thể tạo pre-session row, nên **nghiệm thu trên DB thật vẫn là
cloud write**, phải qua phê duyệt; không gọi nó như kiểm metadata chỉ đọc.

### Phiếu nghiệm thu hai máy

Ghi cho mỗi case: máy, commit FE/API, preflight boolean, status/code/requestId đã
lược secrets, verdict và người trực tiếp thực hiện. Không HAR, payload login,
cookie/Set-Cookie/token hoặc ảnh chứa định danh thật. Không sao chép phiên giữa máy.

| Case                                                               | Tài              | Thắng                       |
| ------------------------------------------------------------------ | ---------------- | --------------------------- |
| Health 200; session anonymous → hiện login form                    | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Tự nhập sai password → 401; đúng password → đúng role              | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Reload đúng account; logout/reload khóa protected UI/API           | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Tasks/Courses read; tạo/sửa task demo được duyệt                   | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Viewer write/member delete bị BE từ chối; manager đúng quyền       | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| No-membership không thấy workspace                                 | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| API outage → khóa; Check session phục hồi, không replay POST       | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Hai tab/account swap không lộ notes/chat/draft cũ                  | PENDING          | REMOTE_MACHINE_NOT_VERIFIED |
| Refresh thật, Dashboard sign-out, membership revoke và delay/cache | PENDING extended | PENDING extended            |

Auth verify-success cache tối đa 30s theo cấu hình hiện có; local session expiry/
revocation và lookup auth.sessions/membership vẫn được kiểm theo source. Ghi delay
thực, không hứa thu hồi tức thời hoặc sửa clock/token/TTL để đạt PASS. Không gọi
Google/OCR/STT/AI thật trong nghiệm thu Auth. Dữ liệu test chỉ tiền tố đã duyệt,
manager cleanup khi được duyệt; không nâng Thắng thành manager để dọn.
Chưa nhận evidence Thắng thì giữ REMOTE_MACHINE_NOT_VERIFIED. Chỉ chốt
TWO_MACHINE_AUTH_ACCEPTED khi case cốt lõi Auth thật hai máy có bằng chứng; extended
chưa thấy vẫn PENDING. B1 không thay B2 toàn app/B3 budget/B4 semantic RAG/TTS-STT.

Phần quản trị chi tiết bên dưới là hướng dẫn **Tài thực hiện sau khi duyệt**,
không phải thao tác cloud agent đã chạy. Lịch sử Đợt 6 kiểm scripts/rollback
disposable PG16; Đợt 13 đã kiểm lại toàn DB suite trên PG17. Không cần
checkout commit cũ: runner hiện có đủ 012→013→014→015, 014 nhận PILOT_WORKSPACE_ID
hợp lệ để tạo workspace/backfill. App chỉ http://127.0.0.1:5173, không hosting,
domain/HTTPS cho app; TLS tới Supabase vẫn phải verify. TTS/STT do Thắng phụ trách.

## Đường đi nhanh

1. Xác nhận đúng project/quyền quản trị, dữ liệu chỉ là demo của nhóm.
2. Người quản trị kiểm account có sẵn ở Dashboard; dùng lại đúng demo account.
   Chỉ tự tạo account thiếu sau khi được duyệt, tự cất password/UUID riêng.
3. Điền .env server (session key/workspace/origin/TLS); không in secrets.
4. Chạy npm run pilot:preflight; thiếu 012–015 là dự kiến, lỗi khác phải xử lý.
5. Dừng writes; backup public tên mới bằng pg_dump đúng major/TLS, kiểm archive list.
6. Dừng API; được duyệt mới npm run db:migrate (012→013→014→015).
7. Verify ledger/checksum 001–015, đúng 1 workspace khớp env, rows/counts/IDs/quan hệ.
8. Dry-run rồi cấp membership 3 user; no-membership để trống.
9. Chạy API/web local; Tài tự nhập password, nghiệm thu checklist browser.
10. Nếu lỗi: giữ API tắt; dry-run rollback 015 → 014 → 012/013, chỉ apply sau
    Tài duyệt tác động/mất dữ liệu của từng bước, không tự panic restore.
11. Guard từ chối/COMMIT không rõ: dừng, quản trị viên xác minh/duyệt phục hồi dump.

**Giả định bắt buộc:** toàn bộ dữ liệu Supabase hiện có là demo của nhóm, thuộc
một workspace. Nếu có dữ liệu người ngoài nhóm, nhiều workspace hoặc chưa rõ
quyền sở hữu → **DỪNG**, không gom dữ liệu để migrate/rollback. Không suy luận
principal từ owner_name/nickname. Không public hoặc đưa tài liệu thật vào:
Documents/RAG/signing/feedback ownership, runtime role/tenant RLS và budget AI
chưa hoàn tất. Runtime cloud vẫn postgres/bypass RLS cho tới lát role riêng.

## 0. Chuẩn bị và điều kiện dừng

```powershell
Set-Location D:\New-Tech\Final-Project-integration-20261018
git status --short
node -v
docker info --format '{{.ServerVersion}} {{.OSType}}'
```

Giữ WIP/untracked. README khuyến nghị Node 24.15+ thuộc nhánh 24; host kiểm Đợt 6
vẫn 24.13.0. Docker chỉ cần cho backup/test container, không phải điều kiện chạy
React/Nest với Supabase. Không sửa AssistantPanel khi chưa phối hợp Thắng.

Dừng nếu target/checksum/TLS/grants không đúng, dump không đọc được hoặc dữ liệu
không xác nhận là nhóm demo. Không nới Auth/Origin/CSRF/RLS, không sửa 001–015/
ledger. Không gửi key/URI/password/token/UUID thật/full project ref vào chat/log/
ảnh; tắt transcript khi nhập định danh. File ignored là plaintext: bảo vệ ACL.
Không dùng VITE_* cho secrets server.

## 1. Tài kiểm/dùng lại account; chỉ tự tạo account còn thiếu sau duyệt

Trong đúng Supabase Dashboard: **Authentication → Users → Add user**,
kiểm user demo hiện có trước, không tạo trùng. Nếu thiếu và được duyệt, tạo/auto-confirm
account demo có chủ đích. Tài tự nhập/cất password và UUID
trong password manager; agent không đọc password/login payload. Không có CLI
tạo user/đặt password. Auto-confirm không thay xác minh email cho app public.
[Supabase Admin user](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## 2. Điền .env, tạo session key/workspace tại máy

Có key/workspace được duyệt thì **dùng lại**, không tạo mới khi restart. Chỉ
tạo một lần nếu chưa có **và Tài đã duyệt kế hoạch**; không mỗi máy tự chạy.
Quản trị viên chốt key/version cho hai API dùng chung pilot DB và cấp qua kênh
bảo mật được duyệt, không chat/Git hoặc sao chép cookie. Ghi vào ignored file
bằng wx, không in giá trị:

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

Copy bằng editor local/password manager vào .env root. 0o600 không thay Windows
ACL; cất key độc lập backup. Mất/đổi key làm session cũ không giải mã được, phải
có kế hoạch đăng xuất/khôi phục. Bổ sung cấu hình:

```dotenv
PUBLIC_ORIGIN=http://127.0.0.1:5173
SUPABASE_PUBLISHABLE_KEY=REPLACE_FROM_THE_SAME_PROJECT
AUTH_SESSION_VERIFICATION=database
# PILOT_WORKSPACE_ID + SESSION_ENCRYPTION_KEY: điền editor, không in terminal.
```

SUPABASE_URL, DATABASE_URL, Storage secret và CA phải cùng project. Maintenance
URL nếu có cũng cùng project; preflight kiểm DATABASE_URL runtime, CLI ghi dùng
maintenance nếu có. Không dùng service-role thay publishable key Auth/không tắt
TLS. Docker origin 8080 khác dev 5173, không dùng lẫn.

## 3. Preflight CHỈ ĐỌC

```powershell
npm run pilot:preflight
```

Auth config thiếu → databaseChecked:false, exit 1, chưa mở cloud connection.
Đủ config → default read-only + BEGIN READ ONLY/ROLLBACK, chỉ catalogue/grants/
ledger, không đọc dòng auth.users/auth.sessions. Output boolean/tên migration/
role/ref đã che, không checksum/URI/key. authConfigValid/publicOriginMatchesDev
phải true; AUTH_SESSION_VERIFICATION=database, USAGE(auth) và SELECT ba cột
id,user_id,not_after của auth.sessions. Grants thiếu do quản trị viên duyệt
riêng; agent không tự GRANT/SELECT* để kiểm.

Trước migrate, thiếu 012–015/bốn stage flags false là dự kiến **chỉ nếu** ledger
đọc được, checksum những migration đã áp khớp, config/quyền khác đạt.
allSourceMigrationsApplied:false không phải bằng chứng Auth hỏng. Pending/source
ngoài 012–015 hoặc mới >015 → dừng review phạm vi trước lệnh. Sau migrate:
checksumsMatch/allSourceMigrationsApplied/stage012Applied/stage013Applied/
**stage014Applied/stage015Applied** đều true. Exit 0 chưa chứng minh B1 browser đạt.
[PostgreSQL read-only](https://www.postgresql.org/docs/16/sql-set-transaction.html).

## 4. Backup public tên mới — Tài chạy sau duyệt

Dừng mọi writers trong cửa sổ bảo trì. Tài kiểm PostgreSQL major trên Dashboard
bằng metadata query: SELECT current_setting('server_version_num')::int / 10000;
image postgres chính thức cùng major. Sau khi Tài duyệt đích lưu, quản trị viên
tạo thư mục artifacts/pilot-private-backups, kiểm quyền riêng/Windows ACL và tạo
artifacts/pilot-private-backups/pg-client.env bằng editor (không agent tạo/copy secrets):
PGHOST/PGPORT/PGDATABASE=postgres/PGUSER/PGPASSWORD, PGSSLMODE=verify-full,
PGSSLROOTCERT=/certs/prod-supabase.cer. Không in env. Dùng direct/session endpoint
đã xác minh, không transaction pooler; mount CA đúng file, không bỏ TLS.

```powershell
$pilotPgMajor = Read-Host 'PostgreSQL major đã kiểm ở Dashboard'
if ($pilotPgMajor -notmatch '^[0-9]{2}$') { throw 'Chưa có major hợp lệ' }
$pilotPgImage = "postgres:$pilotPgMajor"
$pilotBackupDir = Join-Path (Get-Location).Path 'artifacts/pilot-private-backups'
if (-not (Test-Path -LiteralPath $pilotBackupDir -PathType Container)) { throw 'Chưa duyệt/tạo đích backup private và kiểm ACL; không dump' }
$pilotCertDir = Join-Path (Get-Location).Path 'secrets'
$pilotBackupName = 'pilot-before-012-015-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
$pilotArchiveListName = $pilotBackupName + '.list'
if (Test-Path (Join-Path $pilotBackupDir $pilotBackupName)) { throw 'Backup đã tồn tại; chọn tên mới, không ghi đè' }
if (Test-Path (Join-Path $pilotBackupDir $pilotArchiveListName)) { throw 'Archive list đã tồn tại; chọn tên mới' }
docker run --rm --env-file artifacts/pilot-private-backups/pg-client.env --mount "type=bind,source=$pilotBackupDir,target=/backup" --mount "type=bind,source=$pilotCertDir,target=/certs,readonly" $pilotPgImage pg_dump --schema=public --format=custom "--file=/backup/$pilotBackupName"
if ($LASTEXITCODE -ne 0) { throw 'Backup chưa đạt; không migrate' }
docker run --rm --mount "type=bind,source=$pilotBackupDir,target=/backup,readonly" $pilotPgImage pg_restore --list "/backup/$pilotBackupName" > (Join-Path $pilotBackupDir $pilotArchiveListName)
if ($LASTEXITCODE -ne 0) { throw 'Archive chưa đọc được; không migrate' }
```

Không --verbose/in archive list vào báo cáo public. --schema=public gồm data,
không phải --schema-only; không dump auth/storage/roles/file Storage. Archive
có dữ liệu nhạy cảm/session encrypted, phải ignored/bảo vệ. FK public→auth nghĩa
là đây **không phải backup Supabase đầy đủ/tự restore độc lập**. Archive đọc được
chưa chứng minh restore; rollback hẹp đã test là đường lui chính.
[pg_dump PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgdump.html).

## 5. Migrate 012→013→014→015 và verify

Ghi counts, IDs/quan hệ/course NULL của bảy bảng trước lệnh bằng read-only query
trong môi trường quản trị riêng. Không đưa UUID thật/snapshot row vào chat;
evidence riêng trong artifacts không commit. **Dừng API**.

```powershell
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration chưa đạt; giữ API tắt' }
npm run pilot:preflight
```

Runner áp mọi pending, **mỗi file** một transaction. 014 nhận UUID hợp lệ qua
bind set_config(...,true): 0 workspace + demo data → tạo workspace/backfill;
đúng 1 workspace → dùng lại và khớp setting; >=2/mismatch/setting thiếu khi cần
→ từ chối. Không seed membership. Nếu 014 lỗi, 012/013 có thể đã commit: đọc ledger,
không retry mù/sửa checksum.

Verify riêng:

- Đúng ledger 001–015, checksum source khớp, không tên/source lạ.
- **Đúng 1 workspace**, ID khớp PILOT_WORKSPACE_ID kiểm riêng, không in giá trị.
- Mọi row tasks/courses/exams/study_plans/expenses/documents/assistant_feedback
  có workspace đó; counts/IDs/quan hệ/tất cả trường cũ giữ nguyên. Expense/
  document course NULL vẫn NULL, chunks/Storage không đổi.
- FK/index/NOT NULL tồn tại; đối chiếu snapshot/backup trước, không chỉ health
  SELECT 1. Migrate lại already applied, không đổi data.
- Preflight exit 0; config/grants chưa đạt thì giữ API tắt, xử lý có duyệt.

Chỉ sau verify mới cấp membership/bật binary tương thích 014. Workspace-records
lọc document metadata không đồng nghĩa Documents/RAG đã secure toàn bộ.

## 6. Cấp ba membership — dry-run trước

Workspace đã tạo bởi 014; **không cần --create-workspace** ở đường đi này.
Dùng biến local + npm --silent tránh echo UUID/ref. Process args vẫn có định
danh, chỉ máy quản trị tin cậy; no-membership không cấp row.

```powershell
$pilotProjectRef = Read-Host 'Project ref đã đối chiếu riêng'
$pilotUserId = Read-Host 'UUID manager từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=manager
# Chỉ Tài apply sau duyệt:
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=manager --apply "--confirm-project=$pilotProjectRef"
$pilotUserId = Read-Host 'UUID member từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=member
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=member --apply "--confirm-project=$pilotProjectRef"
$pilotUserId = Read-Host 'UUID viewer từ Dashboard'
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=viewer
npm --silent run pilot:membership -- grant "--user=$pilotUserId" --role=viewer --apply "--confirm-project=$pilotProjectRef"
npm --silent run pilot:membership -- list
Remove-Variable pilotUserId,pilotProjectRef
```

List chỉ tổng role/active, không UUID/email. Grant idempotent nhưng có thể đổi
role/reactivate chủ đích; workspace inactive không tự bật. COMMIT không rõ phải
kiểm riêng trước retry. Revoke CLI cũng dry-run/default, apply cần ref khớp;
khác Dashboard Sign out user.

## 7. Browser nghiệm thu — Tài tự nhập password

Hai terminal root: npm run dev:api và npm run dev:web, URL 127.0.0.1:5173.
Không mở thêm API khi cổng 3000 bận. Agent chỉ quan sát state/status/path/
requestId, không đọc cookie/Set-Cookie/Authorization/password/login payload/
token/storage nhạy cảm hoặc lưu HAR chứa credentials. Desktop/375px và bàn phím.

| Case                 | Thao tác của Tài                                   | Điều kiện đạt                                                        |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Sai/đúng password    | Tự đăng nhập từng account demo                     | Sai 401 tử tế; đúng principal/role, không lộ account khác            |
| Reload               | Reload sau đăng nhập                               | Đúng session/account, không flash dữ liệu khác                       |
| Refresh              | Đợi refresh thật                                   | Có refresh thành công và UI dùng được; chưa thấy thì chưa PASS       |
| Logout               | Logout rồi reload                                  | Gate chặn protected route                                            |
| Dashboard signout    | Signout demo, đợi cache                            | Protected bị từ chối; ghi delay thật, không hứa revoke JWT tức thì   |
| No-membership        | Account thứ tư                                     | No access/403 trước dữ liệu                                          |
| Hai tab              | Logout/đổi account ở một tab, dùng tab kia         | Principal/gate cập nhật trước đọc/ghi                                |
| Đổi account          | Note/chat/draft ở A rồi login B                    | B không thấy A; quay lại A kiểm namespace/state                      |
| Revoke membership    | Tài revoke demo, đợi cache                         | Bị từ chối, không tự cấp lại                                         |
| API outage           | Tắt đúng API rồi bật lại                           | Lỗi rõ, không trắng trang/replay POST mù                             |
| Role matrix B2 lát 3 | Viewer/member/manager ở Tasks/Exams/Plans/Finances | Viewer không ghi; member không DELETE; manager được xóa, BE vẫn chặn |

Auth session khác vòng đời JWT/cache: kiểm thật, không sửa token/clock cho đẹp.
[Supabase sessions](https://supabase.com/docs/guides/auth/sessions).
Ghi PASS/FAIL/BLOCKED riêng từng case/viewport; fixture không phải Supabase Auth
đã nghiệm thu. Giữ giới hạn Documents/RAG/feedback/RLS.

## 8. Đường lui — API vẫn tắt

**Rollback 015 làm mất mọi receipt và attribution mới** (receipt_id/user_id
của feedback), nhưng giữ feedback rows/snapshot và dữ liệu nghiệp vụ cũ.
Migrate lại chỉ tạo bảng receipt rỗng/cột NULL; không khôi phục ownership hay
quyền retry feedback của lượt cũ. Tài phải duyệt mất dữ liệu này, giữ backup
public mới nhất trước apply nếu cần phục hồi. Không chạy app trên schema đã down.
015 dry-run chỉ đọc, in số receipt/feedback attribution và đúng ba object gốc.
Guard kiểm checksum, migration mới hơn, schema/index/default drift và phụ thuộc
ngoài (kể cả index/check tự bị DROP COLUMN xóa); không dùng CASCADE/bypass.

```powershell
npm --silent run pilot:rollback-015
# Đọc kế hoạch/mức mất attribution; chỉ sau Tài duyệt:
$pilotProjectRef = Read-Host 'Project ref đã đối chiếu riêng'
npm --silent run pilot:rollback-015 -- --apply "--confirm-project=$pilotProjectRef"
Remove-Variable pilotProjectRef
```

Verify 015 ledger/table receipt/cột ownership mất, số feedback rows và business
IDs giữ nguyên. COMMIT mất phản hồi → outcome unknown; giữ API tắt, kiểm riêng
trước thao tác tiếp. Sau đó mới rollback 014 rồi 012/013 như dưới đây. Để bật
runtime lại cần migrate/verify đủ 012–015.

Rollback 014 giữ business rows/IDs/workspaces, xóa nhãn workspace và khôi phục
FK gốc, **kể cả CASCADE course→exam/plan cũ**, SET NULL expense/document. Không
chạy app trên schema đã down; chỉ sau remigrate/verify 012–015 mới bật runtime.
Rollback 012/013 tiếp theo xóa năm bảng pilot/login/membership/session/limits,
không xóa Auth provider users/Storage/business data; cần đăng nhập/cấp quyền lại.

```powershell
npm --silent run pilot:rollback-014
# Đọc objects/counts/FK khôi phục; Tài duyệt mới apply:
$pilotProjectRef = Read-Host 'Project ref đã đối chiếu riêng'
npm --silent run pilot:rollback-014 -- --apply "--confirm-project=$pilotProjectRef"
# Verify 014 ledger mất, schema gốc/counts/IDs giữ nguyên; workspaces còn.
# Chỉ nếu muốn bỏ cả nền pilot và không có guard lỗi:
npm --silent run pilot:rollback-012-013
npm --silent run pilot:rollback-012-013 -- --apply "--confirm-project=$pilotProjectRef"
Remove-Variable pilotProjectRef
```

Default read-only/ROLLBACK; exact ref trước query, advisory 424204/lock_timeout,
một transaction mỗi CLI. 014 từ chối checksum thiếu/lệch, ledger lạ/mới, root
schema drift, nhiều workspace/phụ thuộc ngoài 014 (kể cả auto-index/check mà
DROP COLUMN sẽ xóa). 012/013 từ chối nếu 014 còn. Không force/CASCADE/drop
dependency/xóa ledger để vượt guard.

pg_depend chỉ biết catalogue: SQL string-body/PLpgSQL/dynamic SQL/code app có
thể tham chiếu workspace_id mà không được ghi ở đó. Không hứa guard tìm mọi
function/app reference; dừng API, kiểm thay đổi thủ công, phối hợp Thắng. SQL
BEGIN ATOMIC/view/FK/index dependencies đã kiểm local.
[Dependency tracking](https://www.postgresql.org/docs/16/ddl-depend.html).

**Outcome unknown**: không retry/restore/migrate mù. Quản trị viên kiểm ledger/
cột/constraint/index: 014 còn + scope schema còn chưa chứng minh down commit;
014 mất + schema gốc thì down đã xảy ra. Trạng thái lẫn lộn phải dừng. Sau down
012/013, ledger 001–011 và không năm bảng pilot là trạng thái dự kiến.

**Restore dump public là phương án quản trị riêng**, không pg_restore --clean
mù: duyệt target/backup/FK auth/checksum, bảo quản writes sau dump (có thể mất
khi restore), xác nhận phạm vi public/quyền. Storage/auth/roles/key giữ riêng.
Không gọi đây là restore toàn Supabase. Guard từ chối/archive chưa đủ kiểm
chứng restore cần thiết → giữ API đóng, lập kế hoạch phục hồi cùng nhóm trước làm.

## 9. Kiểm code/SQL local

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
docker compose -p examate-phase6-20261014 -f compose.local-db.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-phase6-20261014 -f compose.local-db.yaml down
```

Kiểm port đúng stack trước up. Guard loopback/_test/khác DATABASE_URL và .env
trước Pool/cleanup; fixture riêng kiểm owner/exact name trước DROP. Auth fixture
không phải Supabase Auth/tenant RLS. Down giữ volume, không -v. Số liệu thật và
giới hạn ở báo cáo từng đợt. Không tự push/merge/deploy ngoài yêu cầu Tài.

### PostgreSQL 17 compatibility trước cloud apply

Đợt 13 kiểm trên Linux/amd64, PostgreSQL 17.11 và image pgvector 0.8.7 được pin
digest trong compose.auth-pg17-test.yaml. Tag/digest đã đối chiếu
[repository chính thức pgvector](https://github.com/pgvector/pgvector#docker).
Không thay compose/Dockerfile của app. Đây là compatibility local, không phải
Supabase Auth thật hoặc đã áp migration cloud. Kiểm port 55433 trống, tên project
thuộc run của mình trước các lệnh sau:

```powershell
docker compose -p examate-b1b-pg17-local -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-b1b-pg17-local -f compose.auth-pg17-test.yaml down
```

Suite chuẩn chạy tuần tự cả migrate/idempotency/checksum, backfill 014 và rollback
015→014→012/013. Không thêm cờ bỏ guard, không chạy db:migrate cloud để “kiểm PG17”.
Không nhận skip/all-filtered. Với image/architecture khác, ghi lại major/digest và
test thật trước kết luận; không suy từ Docker Desktop đang chạy rằng Auth đã sẵn.
Down đúng project, không -v hoặc dọn stack/DB của người khác.

## F01 — Google setup và checkpoint live

Chưa thực hiện setup/live trong code run. Không bootstrap lại 001–015. Owner cần:

1. Xác nhận đúng project (report che ref), ledger/checksum và pending chỉ 016;
   duyệt backup private, dừng writers và đường lui trước apply.
2. Google OAuth client loại Web, audience/test users/scopes đúng tài khoản
   owner cho phép. Client secret chỉ nhập ở provider Supabase qua Dashboard riêng.
3. Google authorized redirect URI là callback **Supabase** trên Dashboard.
   Supabase redirect allowlist chứa app `/api/auth/google/callback` cho đúng
   origin dev/Compose, với query attempt do server sinh. Không wildcard domain,
   client-selected provider/returnTo hoặc Host dùng làm URL đích.
4. Kiểm chính sách identity linking của platform và verified Supabase user ID
   sau Google. Demo email không nhận thư không tự thành account Google thật.
   Không cấp quyền theo email/name hoặc tự merge dữ liệu account.
5. Cấp membership cho Google ID qua workflow quản trị được duyệt riêng;
   chưa có membership phải no_access. Không gửi email/UUID/password/key vào chat/Git.
6. Sau đó bật `AUTH_GOOGLE_ENABLED=true` ở cấu hình private; giữ session key
   ổn định và Auth verification=database. Không copy Google secret vào app.

Status `enabled` nghĩa là app đã yêu cầu Google và adapter có hỗ trợ; không
chứng minh Dashboard/schema/provider đã sẵn sàng. Thiếu 016 khi bật Google sẽ
fail closed; password login không truy cập bảng attempt.

Contract: GET `/api/auth/google/status`; POST `/api/auth/google/start` body `{}`,
prelogin/Origin/CSRF; GET `/api/auth/google/callback` với attempt và code hoặc
provider error. Callback dùng PKCE/binding, không đòi CSRF header POST. Kết quả
redirect sạch `/?oauth=success|cancelled|restart_required|unavailable`; FE xóa
query và đọc session transport hiện có. Không lưu HAR thật hoặc log callback query.

016 bật RLS/revoke public/anon/authenticated; không provision runtime role F02.
Rollback CLI `npm run pilot:rollback-016 --` dùng flags như các CLI rollback
hiện có: mặc định dry-run, apply cần exact target confirmation. Mất attempts
đang chờ/claimed; không xóa sessions/users/dữ liệu nhóm. Guard checksum/later
migration/dependencies/column drift phải giữ. Không tự rollback cloud.
Các rollback 015/014/012–013 vẫn từ chối khi 016 còn applied.

Live: chủ account tự consent/MFA/login; kiểm role/no_access, reload, API đúng
quyền, logout/revoke. Tài/Thắng chạy trên máy riêng. Không có evidence Thắng
thì REMOTE_MACHINE_NOT_VERIFIED. Refresh/revocation chưa quan sát là PENDING.
