# Đợt 13 — B1b: bootstrap Auth và đường nghiệm thu hai máy

## Lượt tiếp tục sau 59b0906 — quyền đã cấp, đầu vào đang hoàn tất

Tài đã xác nhận dữ liệu demo của nhóm và duyệt backup public private local,
snapshot, pending 012–015, membership Tài manager/Thắng member/viewer, task demo
và cleanup đúng record, commit/push không force. Không còn chờ duyệt lại các
thao tác đó; vẫn phải kiểm đủ đầu vào và cửa sổ dừng writers trước khi thực hiện.
Không được tự tạo/sửa account/password, đổi runtime role/Auth mode/target,
restore/rollback destructive hoặc mở tính năng AI khác.

Kiểm mới tại `59b0906`: runtime DB/Supabase resolver khớp, PG major 17,
checksum 001–011 khớp, chỉ pending 012–015, pilot tables chưa có. TLS/CA/pool và
quyền auth.sessions đạt; maintenance URL chưa cấu hình nên CLI dùng runtime URL
theo fallback hiện có. Auth vẫn thiếu origin/public key/workspace/session key.
Không có listener API3000/Vite5173 local; writers máy Thắng chưa được xác nhận.

Tài trả lời chưa hoàn tất đầu vào và yêu cầu hướng dẫn từng bước. Đã giao kết
quả hợp lệ/không hợp lệ, mẫu mapping private local và checklist dừng writers hai
máy. Mẫu không email/password, chỉ UUID/role do người quản trị điền từ Dashboard;
ACL đã kiểm: chặn inheritance, chỉ tài khoản Windows hiện tại và SYSTEM. Path
private được giao trực tiếp, không commit UUID/file mapping/keys. Công cụ sinh
giá trị còn thiếu được tạo private để chủ máy chủ động chạy nếu chưa từng có
key/workspace; không tự sửa `.env` hoặc rotate key. Chưa sinh giá trị bằng công cụ.

Chưa backup/snapshot business/migrate/cấp membership/gọi Auth thật: **BLOCKED
do đầu vào và xác nhận maintenance window**, không phải BLOCKED_BY_APPROVAL.
Máy Thắng vẫn REMOTE_MACHINE_NOT_VERIFIED. Bằng chứng local fixtures không thay
Auth thật. Các kết quả và trạng thái PREPARED bên dưới là lịch sử lượt trước.

### Bằng chứng mới của lượt tiếp tục

- Đã review committed range 21 commit từ remote `d15afea` tới `59b0906`, gồm
  các thay đổi N1/9.1/B2 đã review. Các file Assistant trong range là lịch sử,
  không phải sửa FE/voice ở lượt này. Không có private paths/backup/.env thật
  trong range; hit signed URL là fixture tổng hợp example.test ở App tests.
- Đã push không force lên origin/feature/tai-rag-integration và đối chiếu bằng
  `git ls-remote`: remote thực tế bằng `59b0906521c7a0810ead6611fea99d0cc28819ee`.
  Không còn BLOCKED_BY_CODE_DELIVERY cho commit này trên origin. Commit chạy
  trên máy Thắng vẫn chưa xác minh; không đồng nhất hai kết luận.
- Chạy mới năm gate tuần tự: typecheck/test/build/format:check/test:database đều
  exit 0; API Vitest 231 + Node 745 + web 308 = **1.284 pass**; PostgreSQL 17.11
  disposable **301 pass**; tất cả fail/skip/cancelled 0. Không nhận số lịch sử
  là kết quả mới. Không sửa runtime nên không có RED/GREEN mới cần nhận thay
  bằng chứng diagnostic của lượt trước.
- Đã pull image chính thức postgres:17 và kiểm pg_dump/pg_restore 17.11 với
  network none. Chưa dùng các client đó kết nối cloud hoặc thu backup. Public
  backup và snapshot vẫn chưa chạy vì đầu vào/maintenance chưa xác nhận.
- PG17 dùng compose project riêng examate-phase13-execute-pg17, loopback 55433.
  Audit guard trước kết nối: 0 DB con random, 0 role ngoài dự kiến, một role
  fixture nền có marker đúng. Đã down đúng project, không -v; giữ một DB test
  gốc/một role fixture trong volume local. Không còn listener 3000/5173/55433;
  không dừng SOP stack hoặc resource lượt trước. Các container client --rm đã
  kết thúc. Mẫu mapping/công cụ private vẫn giữ để Tài hoàn tất, không cleanup.

| Hạng mục lượt tiếp tục               | Trạng thái/bằng chứng                                            |
| ------------------------------------ | ---------------------------------------------------------------- |
| Code delivery origin                 | PASS: push 59b0906, hash remote đối chiếu thật                   |
| Gates local/PG17                     | PASS: số mới ở trên, không phải Supabase Auth thật               |
| Ownership/authorization              | Đã được Tài xác nhận/cấp quyền trong chỉ thị tiếp tục            |
| Config/mapping/maintenance window    | BLOCKED: Tài xác nhận chưa hoàn tất, đã có hướng dẫn/mẫu private |
| Backup/snapshot/migration/membership | NOT_ATTEMPTED cho tới khi đủ điều kiện; không tự ghi cloud       |
| Auth core máy Tài                    | BLOCKED bởi đầu vào; chưa browser/login thật                     |
| Commit/config/Auth core máy Thắng    | REMOTE_MACHINE_NOT_VERIFIED                                      |
| Refresh/Dashboard sign-out/revoke    | EXTENDED_PENDING; chưa quan sát thật                             |

Đầu ra hiện tại **BLOCKED bởi đầu vào cần chủ máy/Dashboard**, không nhận
TWO_MACHINE_AUTH_CORE_ACCEPTED. Sau khi người quản trị hoàn tất config/mapping
và hai máy xác nhận dừng writers, tiếp tục đúng bootstrap đã được duyệt; không
xin lại quyền backup/migration/membership/push. Không nhận config đúng chỉ từ
việc file tồn tại, và không nhận pass máy Thắng từ kết quả máy Tài. Báo cáo/runbook
được commit/push riêng sau code; hash cuối ở bàn giao Git để tránh tự tham chiếu.

## Lượt chuẩn bị đã commit — bằng chứng lịch sử

Ngày 17/10/2026, Asia/Saigon. Nhánh feature/tai-rag-integration, HEAD đầu lượt
`20f804f`. **PREPARED; chưa TWO_MACHINE_AUTH_ACCEPTED.** Đã sửa diagnostic và kiểm
local/PG17; cloud apply còn BLOCKED_BY_APPROVAL, máy Thắng chưa được xác minh.
Không push/merge/deploy hoặc chuyển repo/bundle sang máy khác.

## Chặng A — review Đợt 12, WIP và baseline

Git đúng checkpoint, local ahead 18 so với tracking ref có sẵn, không fetch để
suy trạng thái GitHub mới. WIP đầu lượt: README, docs/HANDOFF, phần có trước của
docs/PROJECT-CONTEXT; untracked resume/prompt Đợt 4/9.1/12. Lưu inventory/hash/patch
local ignored, không stage chúng. Rule folder cha mô tả LogiRoute/Python/Tailwind
khác project; dùng source/yêu cầu ExaMate, không sửa rule/settings.

Review nguồn và regression Đợt 12: Documents giữ workspaceTransaction cho mọi
business query, fresh authorize cùng tx, helpers bắt buộc tx; Storage ngoài
transaction; probe kiểm lại quyền trước kết luận absence/compensation. SQL/HTTP
disposable hiện vẫn qua gate, không phát hiện regression cần sửa. Không dùng
config/schema cloud chưa đủ để kết luận PoC transaction/RLS local hỏng. Browser
desktop/375 và mutations Đợt 12 là bằng chứng lịch sử trong báo cáo Đợt 12,
**không phải browser run mới của Đợt 13**.

Node 24.13.0/npm 11.6.2/Docker 29.6.2 Linux. Node thực chạy vẫn thấp hơn khuyến
nghị README 24.15+, không tự nâng runtime. PG16 disposable riêng, bind 127.0.0.1:
55432, compose project examate-phase13-pg16. PG17 project/port/volume riêng.

| Baseline từ root, tuần tự                        | Exit/kết quả mới                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| typecheck                                        | 0                                                                                  |
| test                                             | 0: API Vitest 231 + Node 738 + web 308 = 1.277 pass                                |
| build                                            | 0                                                                                  |
| format:check lần đầu                             | 1 vì file test diagnostic mới do agent tạo chưa format trong lúc baseline còn chạy |
| format:check xác minh lại không có file test mới | 0                                                                                  |
| test:database, PG16.15                           | 0: 301 pass                                                                        |

Baseline test fail/skip/cancelled 0. Sai sót trình tự format được giữ log: chỉ tạm
chuyển **file test mới của lượt này** ra ignored artifacts, đo root format rồi
khôi phục trước implement; không reset/stash hoặc đụng WIP. Không nhận lần fail
do mình tạo thành lỗi tồn đọng Đợt 12. Không build song song suite/API dùng dist.

## Chặng B — diagnostic đã sửa và nguyên nhân đã chứng minh

Runtime chỉ sửa `apps/api/src/common/http.ts`:

- ApiExceptionFilter trước đây lấy errorCode(error), thường không thấy mã nằm
  trong HttpException.getResponse(); response AUTH_UNAVAILABLE nhưng request.failed
  có UNCLASSIFIED. Test HTTP đã tái hiện, không suy từ screenshot.
- Chỉ promote 9 mã PilotAuthErrorCode đã biết từ HttpException body do server
  tạo. Unknown body code không được log; không serialize body/nested error/stack.
  Shared common/log.errorCode không sửa, fallback ngoài Auth giữ nguyên.
- Fixed Auth routes session/login/logout/refresh nhận diện đúng ở request.failed
  và request.completed, giữ requestId để tương quan. Unknown path → /unmatched;
  query bỏ, business UUID/slug dùng :id/:slug. Không log email/filename/header/
  body/token, không dùng ID client đưa làm request ID server.
- Không thay status/body/CSRF/Origin/cache/session/refresh/login replay hoặc UI.
  Không thêm log cấu hình từng request, không hiện login form khi bootstrap lỗi.

`auth-diagnostics.test.mjs`: RED trước runtime **6 fail, 1 pass, 0 skip, exit 1**;
GREEN **7 pass, exit 0**. Một control unknown-code xanh ngay là coverage, không
nhận TDD. Có log RED ban đầu 6/6 fail trước thêm control; giữ cả hai lần.
Kiểm 503/code/path, wrong password synthetic 401/message giữ nguyên, nested/header/
body/query secret sentinel không ra log, unknown path và UUID được che, shared
errorCode giữ hành vi. Focused Auth/API/proxy: **96 pass**, không fail/skip.
Gate cuối còn kiểm Origin/CSRF/session race/refresh và FE transport/state machine.

Các test dùng Auth adapter/session store synthetic qua DI. Đây là HTTP thật
loopback, **không Supabase Auth thật**, không tài khoản hay password thật. Không
thay use-pilot-session/PilotAccess/transport/App/Assistant/hook/TTS-STT.

## Chặng C — inventory chỉ đọc từng máy

### Máy Tài: quan sát mới

Target đối chiếu Supabase URL với DB endpoint bằng resolver hiện có; ref chỉ
ghi che bớt **kdt…dct**. TLS có CA/rejectUnauthorized, query kết nối thành công.
Inspection riêng chạy default_transaction_read_only=on và BEGIN READ ONLY/
ROLLBACK, chỉ system catalog/grants/ledger. Không SELECT auth.users/auth.sessions
rows, không nội dung tài liệu/feedback hoặc business rows. Không gọi Google/
Storage/Auth provider, không khởi động API nạp env cloud.

| Hạng mục                         | Kết quả                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Repository/commit                | Đúng root, 20f804f tại inventory đầu                                                                                                  |
| API3000 / Vite5173               | Không listener ở inventory; không có API process để khẳng định effective env đang chạy                                                |
| Vite source proxy                | 127.0.0.1:5173, /api → 127.0.0.1:3000; không Docker origin 8080                                                                       |
| PostgreSQL major                 | 17, đo bằng server_version_num                                                                                                        |
| auth.users / auth.sessions       | Tồn tại, chỉ kiểm catalog                                                                                                             |
| schema_migrations                | Tồn tại, đọc được                                                                                                                     |
| Ledger 001–011                   | Đã áp, checksum source khớp; không unknown/newer ledger                                                                               |
| Pending                          | 012_pilot_access.sql → 013_pilot_auth_limits.sql → 014_workspace_scope.sql → 015_assistant_answer_receipts.sql                        |
| Pilot tables                     | workspaces/memberships/pilot_sessions/auth_limits/refresh_attempts/answer_receipts chưa có                                            |
| Runtime role                     | Không superuser nhưng BYPASSRLS; chưa runtime least privilege toàn app                                                                |
| Auth grants                      | USAGE auth và SELECT id/user_id/not_after auth.sessions đều true                                                                      |
| Auth config                      | PUBLIC_ORIGIN, publishable/anon key, PILOT_WORKSPACE_ID, SESSION_ENCRYPTION_KEY chưa có giá trị hợp lệ                                |
| Các kiểm config còn lại          | pool hợp lệ cho Auth; session verification mặc định database; không thấy server secret trong VITE_*                                   |
| Effective process/file shadowing | Không thấy process override khác file ở các biến Auth/DB được kiểm trong inspector; không phải bằng chứng API process đã nạp đúng env |
| Public/Storage key đúng project  | Chưa xác minh; public key thiếu, key opaque không tự chứng minh project chỉ bằng shape                                                |

`npm --silent run pilot:preflight` thật: **exit 1, databaseChecked:false** vì
Auth config incomplete. Giữ nguyên fail-closed này. Inventory metadata độc lập
tái sử dụng runPilotPreflight/withReadOnly với quyền chỉ đọc được Tài giao, không
sửa CLI để bỏ guard/ép ready và không gọi nó là preflight đạt. Không có .env,
URI, CA private, key hoặc checksum/định danh account trong artifact báo cáo.

Nguyên nhân bootstrap có thể kết luận: config Auth hiện chưa qua validator và
cần schema 012–015. Config là blocker trước tiên theo source/request fixture;
missing tables là điều kiện cần tiếp theo, chưa được thử login cloud sau sửa
config. Không khẳng định đã quan sát một lần login cloud lỗi vì bảng thiếu,
quota, password sai hoặc network. Health 200 không chứng minh Auth sẵn sàng.

Inventory metadata được chạy lại tại `931e641`: config, target, catalog/grants,
ledger và pending khớp lần đầu. Đây là hai lần quan sát chỉ đọc, không phải bảo
đảm không có writer bên ngoài giữa hai lần. Agent không thực hiện cloud writes.

### Máy Thắng

**REMOTE_MACHINE_NOT_VERIFIED.** Không có công cụ/môi trường máy Thắng trong
phiên này; chưa biết commit, env, DB target/grants, processes hoặc browser origin
của máy đó. Không gửi tin cho Thắng, repo/bundle/.env/cookie. Checklist/lệnh nằm
ở runbook để Thắng/agent được phép trên máy đó tự chạy, gửi lại evidence đã lược
secrets và xác nhận trực tiếp. Không dùng máy Tài/fixture thay bằng chứng này.

## Chặng D — tương thích PostgreSQL 17

Thêm compose.auth-pg17-test.yaml **riêng test**, không sửa compose/Dockerfile app.
Image chính thức dự án pgvector: `0.8.7-pg17-bookworm`, pin digest
`sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d`;
đối chiếu [pgvector Docker tags](https://github.com/pgvector/pgvector#docker).
Thực đo PostgreSQL **17.11**, vector available **0.8.7**, Linux/amd64, loopback 55433. Không suy tương thích từ suite PG16 hay Docker Desktop đang chạy.

`npm run test:database` đầy đủ từ root, sequential: **exit 0, 301 pass,
0 fail/skip/cancelled trên PG17**. Dùng đúng các harness hiện có và guard trước
connection/DDL/cleanup; Auth schema chỉ fixture. Không cần sửa migration 001–015,
catalog expectation hoặc rollback để đạt pass.

Đã chạy qua runner thật: migrate 001–015/idempotency/checksum; 014 seed+setting,
sole workspace khớp, từ chối missing/mismatch/multiple workspace; giữ counts/IDs/
business fields/relations/course NULL. Chuỗi rollback 015→014→012/013 rồi migrate
lại được compound SQL test kiểm; schema/dependency/checksum guards vẫn giữ. Đây
là readiness của rollback local, không phải rollback/cloud restore đã được phép.
PG16 regression được ghi riêng trong baseline/final, không nhập nhằng hai major.

## Checkpoint phê duyệt cloud — đề xuất cụ thể, CHƯA THỰC HIỆN

| Quyết định/thao tác cần Tài duyệt | Kế hoạch và tác động                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/target                     | Dùng commit bàn giao cuối đợt (migrations không đổi), đối chiếu target kdt…dct riêng; máy Thắng phải đối chiếu độc lập                                                          |
| Ownership                         | Tài xác nhận dữ liệu hiện hữu đều demo nhóm; nếu chưa rõ/người ngoài, dừng trước snapshot/backfill                                                                              |
| Workspace/account/roles           | Chốt một workspace UUID riêng, accounts Dashboard hiện có; Tài manager, Thắng member, viewer demo, một no-membership. Vai trò chỉ dự kiến, cần Tài xác nhận                     |
| Config                            | Người quản trị điền origin/public key/workspace/session key hợp lệ qua editor/kênh riêng; không agent tạo/đổi/copy key đang dùng. Giữ database verification, pool 2–20          |
| Stop writers                      | Chốt cửa sổ bắt đầu/kết thúc và người chịu trách nhiệm trên cả hai máy; API/jobs/CLI ghi đều dừng, xác nhận trước dump/snapshot/migrate                                         |
| Backup public                     | Đề xuất artifacts/pilot-private-backups, tên timestamp mới, ignored/Windows ACL riêng; pg_dump postgres:17 chính thức, TLS verify-full/CA, direct/session endpoint đã đối chiếu |
| Snapshot                          | Sau duyệt: bảy bảng scoped + chunks; so counts, IDs, trường cũ/relations/course NULL trước/sau, evidence private; report chỉ boolean so sánh                                    |
| Migration                         | Một máy quản trị chạy runner chuẩn, chỉ pending 012→013→014→015; 014 tạo/dùng đúng workspace, backfill không đổi ID/nội dung/quan hệ                                            |
| Membership                        | Dry-run trước; apply confirm-project đúng target sau duyệt; không create-workspace nếu 014 đã tạo, không cấp no-membership, không tự reactivate/đổi role                        |
| Demo writes                       | Tài duyệt riêng task demo tiền tố B1B-DEMO-TAI / B1B-DEMO-THANG, create/update và cleanup manager; chưa có thao tác demo nào chạy cloud                                         |
| Code delivery                     | Phương án Git cần chỉ thị mới; hiện BLOCKED_BY_CODE_DELIVERY cho đến khi có bằng chứng đúng code trên Thắng, không nói pull sẽ đủ                                               |
| Rollback/restore                  | Dry-run/read guard; mỗi apply cần duyệt tác động. Không CASCADE/reset, không restore tự động hoặc đổi runtime role                                                              |

Snapshot đề xuất giữ ở máy quản trị với ACL riêng, không đưa row/UUID thật vào
console/chat. So canonical business values trước/sau, loại riêng workspace_id
mới và receipt_id/user_id attribution mới khi so trường cũ; giữ ID/course_id/
NULL/amount/date/text và chunks không đổi. Không đọc account/session/PDF text để
snapshot B1. Chưa thu snapshot business cloud vì quyền hiện tại chỉ inventory
metadata/config/ledger; dữ liệu ownership và phạm vi backup phải được duyệt trước.

Public custom dump **không chứa auth/storage/roles hoặc object bytes**, không
phải backup toàn Supabase. Archive list phải đọc được và giữ private, không in
detailed list; đọc archive chưa chứng minh restore. Rollback hẹp đã test là
đường lui chính, dump bảo hiểm bổ sung. Chưa backup/restore cloud hoặc chứng minh
restore cloud. Các lệnh trong runbook không phải một-click vượt checkpoint.

Runner transaction **từng file**: 014 fail có thể để 012/013 đã commit. Mất ACK:
giữ API tắt, đọc ledger/schema trước mọi quyết định, không retry mù/chỉnh checksum.
Rollback 015 xóa receipts và attribution mới, không thể lấy lại chỉ bằng migrate
lại; rollback 014 bỏ nhãn scope/khôi phục FK cũ; 012/013 mất pilot session/limits/
membership. Tài phải duyệt mất dữ liệu, app không chạy trên schema đã down. Restore
dump là quyết định quản trị khác có duyệt, không chạy pg_restore --clean để né guard.

Không provision examate_app/production policies/helper Auth mới; giữ runtime
owner/BYPASSRLS cho demo được mời theo phạm vi đã giao. Nest permissions/private
bucket không thay RLS runtime/budget AI bền vững. Không đưa tài liệu người ngoài
hoặc bật public/paid services để nghiệm thu B1.

## Ma trận nghiệm thu thực tế

| Lớp/case                                                                                         | Trạng thái                          | Bằng chứng/giới hạn                                    |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------ |
| Diagnostic HTTP synthetic                                                                        | PASS                                | 7 tests, code/body/path/privacy; focused 96            |
| Session/Origin/CSRF/refresh/race fixtures và FE                                                  | PASS fixtures, số ở dưới            | Mock không phải Auth upstream thật                     |
| Migrate/rollback/backfill PG17                                                                   | PASS                                | 301 SQL tests mới chạy major 17                        |
| Review regression Documents Đợt 12                                                               | PASS phạm vi local suites           | Không đổi Documents/RAG/Storage runtime                |
| Cloud inventory/config/schema/grants                                                             | PASS phép kiểm chỉ đọc              | Kết quả chưa ready, không phải Auth PASS               |
| Cloud backup/migration/membership/config writes                                                  | BLOCKED_BY_APPROVAL                 | Không thao tác ghi nào được duyệt/chạy                 |
| Code trên máy Thắng                                                                              | BLOCKED_BY_CODE_DELIVERY            | Không fetch/push/gửi bundle; cần evidence commit riêng |
| Máy Thắng env/process/DB/browser                                                                 | REMOTE_MACHINE_NOT_VERIFIED         | Chưa nhận confirmation thực tế                         |
| Tài Auth thật: anonymous/sai-đúng password/reload/logout/no-membership/roles/outage/account-swap | BLOCKED_BY_APPROVAL + config/schema | Không chạy browser/API cloud                           |
| Thắng Auth thật, đọc/tạo/sửa task demo, member delete denied                                     | REMOTE_MACHINE_NOT_VERIFIED         | Checklist chờ người ở máy Thắng thực hiện sau duyệt    |
| Refresh thật/Dashboard sign-out/revoke/delay                                                     | PENDING B1 extended                 | Không đổi token/clock/cache để làm PASS                |

Không có browser thật mới trong Đợt 13. FE Vitest/HTTP mock không được gọi browser
pass. Auth thật, B2 toàn app, semantic RAG, TTS/STT và deployment là kết luận riêng.
Live evaluation runner vẫn BLOCKED; không gọi Gemini/OCR/STT trả phí, không gỡ khóa.

## Gates cuối và cleanup

| Gate từ root, tuần tự     | Final                                                                           |
| ------------------------- | ------------------------------------------------------------------------------- |
| typecheck                 | exit 0                                                                          |
| test                      | exit 0: API Vitest 231 + Node 745 + web 308 = 1.284 pass, 0 fail/skip/cancelled |
| build                     | exit 0                                                                          |
| format:check              | exit 0                                                                          |
| test:database, PG16.15    | exit 0: 301 pass / 0 fail/skip/cancelled                                        |
| test:database, PG17 riêng | exit 0: 301 pass / 0 fail/skip/cancelled                                        |

Mỗi DB suite theo thứ tự: 13/10/14/23/9/18/65/25/1/29/19/24/23/6/19/3.
Artifacts riêng ignored: artifacts/phase13-20261017-auth; giữ baseline format fail,
RED/GREEN, focused, metadata/preflight, PG17 và final logs. Không commit raw logs
hoặc runtime identifiers/secrets/backup/profile. Orchestrator npm Windows có
DEP0190 warning cho shell args cố định; không dùng làm lỗi Auth/app.
Audit sau gate: mỗi cluster còn DB test gốc và một role fixture cố định có marker
do suite nền tạo; không còn DB con random hoặc role ngoài dự kiến. Tổng cộng
**hai DB test gốc và hai role fixture** được giữ trong hai volume local. Audit
ban đầu giả định role phải bằng 0; kiểm source/catalog xác nhận fixture nền có
grants/policies còn phụ thuộc. Một lệnh DROP ROLE mặc định RESTRICT trên PG16 bị
từ chối `2BP01`, không xóa thành công; không FORCE/CASCADE hoặc gỡ phụ thuộc để
né kiểm tra. PG17 không thử DROP sau lỗi đó.

Đã down đúng hai compose project examate-phase13-pg16 và examate-phase13-pg17,
exit 0, không `-v`: container/network của run đã xóa, volumes được giữ. Sau down
không có listener 3000/5173/55432/55433; không dừng SOP stack hay process khác.
Không tạo API/Vite/browser/profile mới trong đợt này; không đụng profile Chrome
Đợt 12 bị policy chặn trước đó. Cleanup audit và hash xác nhận README/HANDOFF,
resume/prompt có trước không đổi, WIP PROJECT-CONTEXT còn nguyên ngoài hunk mới.

## File, commit và phần chờ Tài/Thắng

- `a42313e`: common/http diagnostic + 7 tests + đăng ký script test.
- `931e641`: compose PG17 test riêng, version/digest pin; không migration/runtime config.
- Commit docs/checkpoint chứa runbook và báo cáo; hash ở bàn giao Git cuối.

Commit tài liệu chỉ lấy runbook/report, checkpoint roadmap và hunk Đợt 13 của
PROJECT-CONTEXT. README/HANDOFF và phần PROJECT-CONTEXT cũ vẫn unstaged; bốn
resume/prompt untracked có trước vẫn untracked. Ahead so tracking ref là thông
tin local, không xác minh trạng thái remote mới bằng fetch trong đợt này.

Không sửa Auth service/store/guard/adapter/crypto/config semantics, FE, contracts,
Documents pipeline, receipts/history/feedback, draft 9.1, RAG model/prompt/ranking/
embedding/OCR/validator, migration 001–015, npm dependencies/lockfile/.env hoặc
settings/attribution. Chỉ common/http là runtime BE đã chạm, để lấy mã Auth an
toàn và che route, không thay phần thuật toán của Thắng.

Tài review diff diagnostic/privacy, đọc checkpoint phê duyệt trên và chọn target/
ownership/workspace/roles/cửa sổ/backup/delivery qua kênh phù hợp. Người quản trị
tự điền secrets và kiểm Dashboard users, không gửi password/key cho agent. Thắng
chạy inventory/checklist runbook trên chính máy mình sau bàn giao code được duyệt,
trả commit/preflight boolean/case status/requestId đã lược secrets cùng xác nhận
thực hiện. Chưa có các phê duyệt/evidence này thì dừng ở PREPARED, không nhận B1
đã nghiệm thu hai máy và không chuyển lát ingestion tiếp theo.
