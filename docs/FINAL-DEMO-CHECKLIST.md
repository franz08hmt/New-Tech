# ExaMate — checklist demo và nộp cuối kỳ

Đọc [README](../README.md), [hướng dẫn học](FINAL-STUDY-GUIDE-VI.md) và
[context](PROJECT-CONTEXT.md). Checklist này là kế hoạch; ô trống không phải PASS.

## Chuẩn bị trước buổi báo cáo

- [ ] Chốt revision/nhánh và phân công Tài–Thắng; bảo toàn WIP trước pull.
- [ ] Cài đúng Node/npm, giữ .env/credential riêng; mở đúng 127.0.0.1:5173.
- [ ] Xác nhận login trên **từng máy**, reload/logout; không lấy máy Tài thay máy Thắng.
- [ ] Dùng PDF demo có quyền sử dụng, đã index; chuẩn bị câu hỏi + trang gold.
- [ ] Chạy gates và lưu command/exit/pass/skip/time/revision; DB chỉ disposable.
- [ ] Thử desktop/375px/keyboard; ghi riêng thiết bị thật đã/chưa thử.
- [ ] Nếu demo STT: weights/runtime sẵn, mic được phép, audio có đồng ý,
      test Việt/Anh/trộn và cuối bản ghi dài; không tải weights giữa buổi.
- [ ] Theo phạm vi chốt 19/10/2026: không hứa TTS hoặc agent 3 tools; chỉ giữ
      STT và phạm vi 2 tools ban đầu. Không nhận capability B của rubric đạt;
      A (RAG) và C (Study Coach/structured output F08) cần bằng chứng riêng.
- [ ] Kiểm key/quota/model ở backend và mạng; không quay Dashboard keys/.env.
- [ ] Có video dự phòng gắn ngày/revision, nói rõ là bản ghi, không giả live.

## Kịch bản 5–8 phút

| Thời gian | Nội dung                                        | Bằng chứng nên thấy                                                       |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| 0:00–0:45 | Bài toán, nhóm, stack, sơ đồ                    | Vì sao AI hỗ trợ học, phạm vi local                                       |
| 0:45–1:45 | Login, task/academic record                     | Tạo/sửa record demo, reload giữ dữ liệu                                   |
| 1:45–3:45 | AI Chat → Tài liệu                              | Hỏi có đáp án, mở citation đúng PDF/trang; hỏi ngoài tài liệu thì từ chối |
| 3:45–4:45 | Hỏi tiếp cùng scope, đổi scope/New conversation | History hợp lệ; reset không lẫn nguồn cũ                                  |
| 4:45–5:30 | General SSE + Hỏi workspace                     | General delta; workspace nguồn record/SQL, không giả token LLM            |
| 5:30–6:30 | Feedback + STT nếu đã kiểm thật                 | Candidate cần review; transcript được sửa và chủ động gửi                 |
| 6:30–8:00 | Test, giới hạn, đóng góp                        | Mở test/source; không tuyên bố tính năng chưa nghiệm thu                  |

Dùng record do nhóm tạo cho demo; không xóa dữ liệu có sẵn, re-index hàng loạt,
bootstrap/migrate/rollback cloud hoặc mở endpoint công khai trong buổi demo.
Lỗi live: nêu status/code/Request ID không secrets, chuyển video/test phù hợp,
không gọi fake provider là Gemini thật.

## Mười tình huống tự nghiệm thu

1. Đúng/sai password, no-membership; status/code không lộ credential.
2. Viewer đọc được nhưng ghi bị chặn; member không xóa mục manager.
3. Account swap/2 tab không lộ notes/draft/chat cũ.
4. Record persistence sau reload và restart API; giữ cùng ID.
5. RAG câu có nguồn đúng file/trang; claim thực sự được PDF hỗ trợ.
6. Không đủ evidence hoặc PDF chứa lệnh độc hại: không bịa/không theo lệnh.
7. Hỏi tiếp sau summary; đổi tài liệu thì reset; citation cũ không tái dùng.
8. Sửa draft lúc request chờ; dừng/reset; response trễ không xóa/chèn sai.
9. Lỗi timeout/quota/API tắt: giữ input, không replay write hoặc dùng lượt
   chưa xác minh làm history/feedback.
10. STT hủy/silence/Việt–Anh/31–60s; không tự gửi; đo latency/quality thật.

Mỗi case ghi: revision, môi trường, bước, expected/actual, PASS/FAIL/BLOCKED/
INCONCLUSIVE, bằng chứng lược secrets. Không tự đánh đạt các case chưa chạy.

## Bằng chứng và giới hạn phải nói đúng

Tại checkpoint tích hợp 01288ce: 1.487 app + 379 DB test, 5 gates xanh;
browser fixture desktop/375px/320×320, native/media đã kiểm. Đây là lịch sử,
không phải test mới hoặc semantic/model benchmark.
Auth máy Thắng, Auth extended, cloud tenant RLS/least privilege, budget AI,
semantic RAG/live runner Auth và STT accuracy vẫn theo trạng thái trong context.
Tắt STT nếu không đủ điều kiện; không giấu dependency finding.

## Bộ nộp gọn

- Link Git + commit thực demo, README và hai file học/demo này.
- Slide/video theo yêu cầu giảng viên, sơ đồ và đóng góp từng thành viên.
- Bảng test/evaluation thật có ngày/revision/giới hạn, không chụp số PASS bịa.
- [Nhật ký AI hỗ trợ](../AI_USAGE.md) và
  [nguồn ảnh](../apps/web/public/img/CREDITS.md).
- Không nộp .env, account mapping, cookie, backup/dump, model weights,
  signed URL/token hoặc audio cá nhân. Không claim PWA/WASM/TTS đã hoàn tất
  nếu chưa có implementation và nghiệm thu riêng.

## F01 — bằng chứng mới 18–19/10/2026

Source bắt đầu `23baf20`, checkout integration sạch, không có WIP trong checkout
này. Checkout cũ không được sửa. Backend `38e2e53`; FE/fixtures `08eb581`;
oracle rollback lịch sử `f36607b`; hardening expiry/prelogin `ac033a4`.
Đây là kết quả run mới, tách các con số lịch sử bên trên.

Verdict F01: **CODE_ACCEPTED + LIVE_ACCEPTANCE_PENDING**. Đây là kiểm chứng của
agent; human review chưa có, không nhận toàn bộ Auth hoặc Google live đã nghiệm thu.

| Kiểm                 | Baseline sạch | Cuối F01         |
| -------------------- | ------------- | ---------------- |
| Typecheck            | exit 0        | exit 0           |
| API Vitest           | 288 pass      | 288 pass         |
| API Node             | 829 pass      | 843 pass         |
| Web                  | 370 pass      | 374 pass         |
| Tổng ứng dụng        | 1.487 pass    | 1.505 pass       |
| Build / format:check | exit 0 / 0    | exit 0 / 0       |
| PG17 database        | 379 pass      | 390 pass; exit 0 |

Ứng dụng và DB đều 0 fail/skip/cancelled; DB gồm 24 suite tuần tự. Năm gate cuối
đều exit 0. Baseline sạch được chạy lại vì lần đầu đã
bị lẫn một build sớm khi đang triển khai; log lỗi đó được giữ, không nhận là
baseline. Thời gian run/log/artifacts nằm trong `artifacts/f01-20261018/` ignored.
Run cuối dùng host Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux và PG17.
README khuyến nghị Node 24.15+; không tự nâng runtime để làm test xanh. Các
run `final-verified-*`/`final-ttl-*` là checkpoint trước privacy fix; kết quả
source cuối `7112ca4` nằm trong `final-security-*`, không trộn số giữa các run.

RED quan sát: route start 404 thay vì 200; thiếu nút Google/callback result trên
FE; issuer/audience sai chưa bị từ chối sau mock authoritative verification.
PKCE formula và encryption purpose có assertion độc lập. Controls cũ được giữ.

Bốn mutation build được, fail assertion rồi restore-green: bỏ SQL prelogin
binding; bỏ atomic claim; bỏ authoritative /user verification; bỏ final attempt
check. Mutation binding ban đầu vẫn bị AAD chặn: bổ sung assertion tại store,
không nới lớp bảo vệ. Một mutation compile lỗi không được tính; đã sửa mutation
và chạy lại đúng. OAuth DB suite có 11 test, non-owner/NOBYPASSRLS thật, hai PID,
overlap qua deferred provider, pool max=1, restart, SQL rollback, lost ACK sau
COMMIT thật và rollback/reapply 016. Không phải ngắt TCP cloud.

Auth bootstrap fixture có quyền tối thiểu trên sessions/limits/attempts và policy
test-only permissive trước principal. Membership/auth.sessions dùng SQL thật;
không cấp quyền sửa role/active hoặc đọc auth.users. Non-owner ở đây chứng minh
flow chạy bằng role thật không BYPASSRLS; không phải production Auth RLS đã duyệt.

| Ma trận security                                                  | Bằng chứng mới                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Start/prelogin/Origin/CSRF/config/password fallback/forged Host   | HTTP `oauth.test.mjs`, reject trước dispatch                                            |
| Verified identity/issuer/audience/sub/session/expiry/timeout/size | `oauth-adapter.test.mjs`, authoritative mock response, không signature verifier tự viết |
| Binding/expiry/replay/single-use/new-start/concurrent callback    | HTTP + `oauth.database.test.mjs`; 2 runtime PID, deferred overlap                       |
| Late callback sau logout/password login/new attempt               | HTTP, DB thật và browser native; không ghi đè cookie account mới                        |
| Cancel/malformed/duplicate/oversize/returnTo/provider             | HTTP allowlist, clean redirect, không phản chiếu provider error                         |
| DB/provider outage/COMMIT uncertainty/restart/rollback 016        | DB + adapter/HTTP; không retry code hoặc phát cookie chưa xác nhận                      |
| Own role/no_access/revoke/refresh/logout/2-tab                    | DB OAuth role/revoke và regression Auth/FE cũ; extended live vẫn pending                |
| Callback/query/header/secret logging                              | HTTP diagnostic sentinel, Nginx log scan, Vite outage regression                        |

Hardening ngày 19/10 quan sát RED: attempt hết hạn trong khi chờ row lock nhưng
vẫn exchange 1 lần (expected 0). Sau sửa, start/claim/issuance kiểm lại wall clock
sau lock wait. Test start-expiry mới là control xanh, không nhận là RED.
Một lần mutation không hợp lệ do prelogin CHECK bị lỗi 1 ms: test clock tăng
từng lần đọc đã RED, rồi GREEN khi dùng cùng instant cho hai expiry. Bốn mutation
cuối đều compile và fail assertion: binding, atomic claim, authoritative verify,
stale callback; restore-green. Lần constraint failure không được tính mutation.

Gate DB đầu tiên sau migration 016 từng fail vì oracle rollback 015 so checksum
với cả 016 dù fixture cố ý chỉ áp qua 015. `f36607b` giới hạn oracle cùng chain
001–015, giữ guard từ chối later migration; không sửa migration/runtime để né lỗi.

| Browser/integration mới                 | Kết quả / giới hạn                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Chrome 1440px và 375px           | PASS: success/cancel/error, no-access, ba role, reload/logout, keyboard/focus/44px/no-overflow, console 0                                         |
| Account race native                     | PASS: callback A chậm sau password B không đổi account; note/draft trước không lộ cho account sau                                                 |
| Compose/Nginx origin 8080, hai viewport | PASS: success/cancel/error, reload/logout, CSRF và protected read; API không publish 3000; console 0                                              |
| Compose role/account race               | Không nhận là đã lặp đầy đủ; bằng chứng native và HTTP/DB riêng                                                                                   |
| Thành phần thật/giả                     | Nest Auth/guard/crypto/session/membership/attempt và PG17 non-owner thật; Supabase adapter/provider và business lists giả; external fetch bị chặn |
| Proxy/API log privacy                   | Không có synthetic code/token/verifier/callback query trong log kiểm; không lưu HAR thật                                                          |
| Google/Supabase live                    | NOT_VERIFIED / LIVE_ACCEPTANCE_PENDING; chưa có checkpoint owner setup/identity/016/consent                                                       |
| Máy Thắng                               | REMOTE_MACHINE_NOT_VERIFIED trong F01                                                                                                             |
| Auth extended                           | PENDING live refresh/Dashboard sign-out/revoke; mock không thay live                                                                              |

Browser native cuối sau `ac033a4`: `artifacts/f01-browser-1792389148897/`,
1440px/375px đều PASS, console 0, không tràn ngang. Artifacts ignored chỉ có
fixture synthetic. Compose sau hardening: `artifacts/f01-browser-1792389214026/`,
cả hai viewport PASS. Credential-pattern scan log proxy/API: 0 match.

Review cuối phát hiện Vite dev proxy có thể log query callback khi upstream lỗi.
Test dùng upstream loopback tự đóng socket đã RED vì sentinel code lọt stderr;
logger callback riêng trả thông báo cố định, test GREEN và được đưa vào npm test.
Status 502 giữ nguyên. Browser native bổ sung API-outage callback và assert log
không lộ code; đây là diagnostic regression, không phải Google live.
Native cuối với privacy regression: `artifacts/f01-browser-1792389657498/`,
cả hai viewport và callback API-outage PASS, code sentinel không vào log.
Compose rebuilt từ `7112ca4`: `artifacts/f01-browser-1792390159394/`, hai viewport
PASS; API không publish, log credential-pattern matches 0. Role/account-race
vẫn dựa vào native/HTTP/DB, không nhận Compose đã chạy đầy đủ hai ma trận đó.

Các lỗi harness đã sửa và giữ log: Vite path sai/cleanup chờ child đã thoát;
image production đã prune Nest testing nên có image test riêng; fake business
lists thiếu dẫn tới 500; Response.clone trong mock gây tee cancellation treo;
Node BroadcastChannel giao thoa worker; chuỗi tiếng Việt bị encoding shell.
Không sửa app business/Auth policy để làm fixture xanh. Một lệnh shell ghi docs
bị policy chặn; docs được cập nhật bằng patch tệp trực tiếp, không chạy lại lệnh.

Chạy lại từ root với Node/dependencies hiện có, Docker Linux engine, port trống:

```powershell
$env:TEST_DATABASE_URL='postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
docker compose --env-file infra/test/compose-empty.env -p examate-f01-db-review -f compose.auth-pg17-test.yaml up -d --wait
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
```

Browser tool Playwright phải có sẵn ngoài dependencies app; đặt PLAYWRIGHT_MODULE
trỏ module đã cài (không chứa credential), không tự npm install package Auth.

```powershell
node apps/web/test/oauth.browser.mjs
docker compose --env-file infra/test/compose-empty.env -p examate-f01-review -f compose.oauth-test.yaml up -d --build --wait
node apps/web/test/oauth.browser.mjs --compose
docker compose --env-file infra/test/compose-empty.env -p examate-f01-review -f compose.oauth-test.yaml stop -t 25 api
# Kiểm cleanup DB/role của fixture khi db vẫn chạy, rồi down đúng project.
docker compose --env-file infra/test/compose-empty.env -p examate-f01-review -f compose.oauth-test.yaml down
```

Không dùng main Compose/.env thật để chạy fixture. Compose fixture chỉ có env
synthetic cố định; explicit empty env file ngăn auto-discovery root .env khi chạy
lại. Nếu port đang có app khác, phối hợp trước. Tài đã cho phép dừng Tomcat 8080
trong run F01; IDE giữ nguyên, server đó không được tự khởi động lại.

Cleanup cuối 19/10: đóng native API/Vite/browser; stop API Compose trước DB,
audit random DB/role 0/0, down đúng project `examate-f01-browser-20261018`.
PG17 project `examate-f01-20261018` không còn random DB; audit ban đầu gặp một
role bootstrap cố định của harness B0d, đã đối chiếu đúng marker/source. Role đó
được dọn cùng volume disposable riêng sau khi kiểm project label và không còn
container tham chiếu. Không DROP OWNED/FORCE, down -v hay xóa stack khác.
Lệnh đọc label đầu tiên lỗi quoting PowerShell và dừng trước cleanup; đọc JSON
có kiểm ownership đã thực hiện thành công. Các cổng 3000/5173/8080/55433 trống;
không còn container/DB/role/volume/server của run. Giữ ignored artifacts và hai
image test/build cache local để review; không có backup hoặc credential cloud.

Xem [runbook live](PILOT-B1-RUNBOOK.md), [ADR-001](DECISIONS.md),
[stories](FINAL-REQUIREMENTS.md), [AI_USAGE](../AI_USAGE.md). Không đổi RAG/model/
prompt/validator/voice. F02 runtime least privilege/production policies, B3 AI
budget và B4 semantic acceptance còn mở. Không push, merge, deploy hay cloud writes.

## F01.1 — rollback hardening, run mới 19/10/2026

HEAD đầu `0130039`, integration checkout sạch (0 WIP/untracked), checkout cũ
không sửa. Commit code `b343737`; thay rollback CLI/helper/contract JSON, thêm
suite DB và đăng ký gate. Không Auth runtime/FE/dependency/lockfile/migration
001–016 changes. Chưa có phê duyệt hay thao tác cloud write.

| Kiểm                        | Baseline mới tại 0130039 | Final F01.1          |
| --------------------------- | ------------------------ | -------------------- |
| typecheck                   | exit 0                   | exit 0               |
| API Vitest / API Node / web | 288 / 843 / 374 pass     | 288 / 843 / 374 pass |
| Tổng app                    | 1.505 pass               | 1.505 pass           |
| build / format:check        | exit 0 / 0               | exit 0 / 0           |
| PG17 database               | 390 pass                 | 423 pass; exit 0     |

Baseline không fail/skip/cancelled; host Node 24.13.0/npm 11.6.2, Docker 29.6.2
Linux. Log mới trong `artifacts/f011-20261019/` ignored, không dùng lại số F01.
Final gồm 25 DB suite tuần tự; toàn bộ app/DB 0 fail/skip/cancelled. Verdict:
**LOCAL_HARDENING_ACCEPTED + LIVE_ACCEPTANCE_PENDING**. Human review patch pending.

RED thực trước sửa: view phụ thuộc và expires_at text đều báo Missing expected
rejection khi dry-run cũ thành công. GREEN sau shared preflight. Structural
review thêm RED tên FK trigger bị đổi mà vẫn được nhận; normalized generated
names/validity nay từ chối. Mutation dependency/schema đều node --check + build
exit 0, test fail assertion exit 1, restore test exit 0. Không nhận fixture/import/
all-filtered làm RED. Một privacy assertion ban đầu match nhầm từ an toàn
“privately”; đã kiểm sentinel cụ thể, không nhận lỗi test đó là bug/RED runtime.

Focused mới: 33 rollback DB tests và 11 OAuth DB regressions pass, không skip.
Đây là security/maintenance regression, không phải 20 AI evaluation cases F09.
Test fixture dùng maintenance owner trên disposable, không gọi là Auth thật
hoặc tenant RLS acceptance. Snapshot contract từ DB random pristine migrate
001–016 qua runner; 7 cột, 8 constraints, 3 indexes, 4 FK triggers, types/TOAST/
RLS flags/policies. Không lấy schema drift của target làm expected. Test-only
bootstrap policy được bỏ rõ ràng trước legacy maintenance case; dedicated
suite chứng minh extra policy bị từ chối, không nới production permission.

Dry-run trace chỉ BEGIN READ ONLY/SET LOCAL/SELECT/ROLLBACK, plan và attemptsLost
đúng. View/column-view/materialized-view/rule/FK/row-type function, extra check/
index/policy đều chặn trước destructive SQL ở cả hai mode. Type/nullability/
default/order/constraint/FK/index/RLS/trigger/storage drift bị từ chối. Count và
fingerprint rows/schema/ledger không đổi sau refusal; sessions/users/membership/
business/chunks giữ nguyên sau apply. Migrate lại 016 hai lần checksum đúng.

Apply lấy advisory + ACCESS EXCLUSIVE trước recheck; dry-run thành công rồi
thêm view vẫn bị apply từ chối. Sai confirm-project phát 0 SQL. 017 giả có
source/ledger checksum hợp lệ được inject chỉ trong test, không tạo migration
production. Guard later migration và oracle 015 theo chain cũ f36607b giữ nguyên.

Fault injection disposable: BEGIN đã chạy mất ACK; DELETE ledger lỗi sau DROP
được rollback nguyên tử và reuse cùng PID. ROLLBACK lỗi hoặc COMMIT thật xong
mất ACK phải discard, lần acquire sau khác PID. COMMIT unknown chỉ DROP/COMMIT
một lần, không tự replay; protected data giữ nguyên. Không ngắt TCP cloud thật.

F01.1 không chạy lại browser/Compose/Google vì chỉ đổi maintenance script/tests/
docs. Bằng chứng browser F01 bên trên là lịch sử. Readiness chỉ đọc: config/target
chưa hợp lệ tại checkout này; databaseChecked/providerChecked false. Không suy
schema/provider cloud thiếu hoặc đã đạt từ lịch sử/fixture. Xem bảng và từng
bước owner trong [runbook readiness](PILOT-B1-RUNBOOK.md#readiness-f011--quan-sát-19102026-không-phải-google-live-pass).

Chạy lại (kiểm port 55433 trống trước, project riêng):

```powershell
docker compose --env-file infra/test/compose-empty.env -p examate-f011-review -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL='postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
# Focused sau khi build, không chạy song song gate dùng dist:
node --test apps/api/test/pilot-rollback-016.database.test.mjs
```

Không chạy db:migrate/rollback trên cloud để kiểm các case này. Dọn đúng marker/
ownership/project sau test, không down -v hoặc stack khác. Roadmap FINAL F01–F16
và 14 stories đã đồng bộ kế hoạch; search/pagination/dashboard AI vẫn pending,
không triển khai F02 hoặc giả semantic/human review PASS.

Cleanup đã kiểm: random DB còn 0, random role còn 0; role bootstrap B0d duy
nhất có đúng marker/source được dọn cùng volume parent của run. Đã down đúng
`examate-f011-20261019`, kiểm label/no container references rồi remove exact
volume `examate-f011-20261019_auth-pg17-test-data`. Không còn DB/container/role/
volume/server do F01.1 giữ; artifacts ignored được giữ để review. Hai container
SOP có trước không bị dừng/xóa. Không push, cloud writes, .env/key changes.

## F02-A — least-privilege runtime / tenant RLS local (2026-10-19)

Kết quả chỉ trên PostgreSQL 17 disposable: business và Auth là LOGIN riêng,
non-owner/NOBYPASSRLS; maintenance URL chỉ thuộc operator CLI. Migration 017
version hóa group grants, RLS và policy helper; runtime startup kiểm capability
và từ chối quyền thừa/fallback owner. Apply, rollback, snapshot ACL/policies,
reapply và HTTP integration qua hai runtime capability được kiểm. Không có
Supabase/cloud writes, đổi credentials, role hoặc membership.
Regression nối chuỗi cũng đã chạy trên PG17 disposable: rollback 017 khôi phục
baseline 016, rollback 016 giữ sessions/workspace/receipts và session data,
sau đó runner chuẩn áp lại 001–017. Đây là mở rộng assertion trong test hiện có;
tổng số test không đổi.
Implementation/test commit: `f850114`.

| Gate                        | Baseline mới    | Final mới                                                   |
| --------------------------- | --------------- | ----------------------------------------------------------- |
| `npm run typecheck`         | exit 0          | exit 0                                                      |
| API Vitest / API Node / web | 288 / 843 / 374 | 288 / 846 / 374 pass                                        |
| Tổng app                    | 1.505 pass      | 1.508 pass                                                  |
| `npm run build`             | exit 0          | exit 0                                                      |
| `npm run format:check`      | exit 0          | lần đầu fail đúng 1 file format; sau format chạy lại exit 0 |
| `npm run test:database`     | 423 pass        | 430 pass, 27 suite, PG17                                    |

Final gates: 0 fail, skip, cancelled; all exit 0. Format failure được sửa chỉ
bằng formatter hiện có, không nới assertion. API/Node tests dùng synthetic
Auth/provider và disposable PG17; các DB login test kết nối bằng role LOGIN
thật, không `SET ROLE` từ owner. App integration kiểm capability startup,
Auth bootstrap/session và HTTP business paths. Browser/desktop/375px và Compose
UI chưa chạy do browser automation tooling không được cài sẵn; không nhận SQL/
HTTP integration thay bằng chứng browser. Đây là giới hạn nghiệm thu local.

RED/GREEN: thiếu phục hồi ACL legacy cho `ai_evaluations` và
`schema_migrations` làm rollback regression đỏ; snapshot/restore 017 được sửa,
focused migration suite xanh. Viewer INSERT mutation và owner capability guard
mutation đều build được nhưng thất bại ở assertion quyền; policy/context
mutations trước đó bắt được bởi cross-workspace, WITH CHECK và pool-reuse tests.
Mọi mutation được khôi phục và focused suites xanh lại. Gate cuối ghi nhận 430
DB tests và 1.508 app tests, không dùng số lịch sử.

Disposable run dùng project `examate-f02a-20261019` và loopback DB target
`examate_test:55433`; final database suite hoàn tất với 430 pass trong 27 file
suite, không fail/skip/cancelled. Sau khi đối chiếu compose project labels và
không còn container tham chiếu, container/network cùng volume
`examate-f02a-20261019_auth-pg17-test-data` do lượt này tạo đã được dọn.
Không còn container/volume thuộc project; ignored logs trong
`artifacts/f02-a-20261019/` được giữ để review. Cloud readiness, Google
live, Auth extended, máy Thắng, browser UI, production RLS/runtime least
privilege và B2 toàn app chưa được nghiệm thu.

Chạy lại theo [F02-A runbook](PILOT-B1-RUNBOOK.md#f02-a--local-runtime-capability-v%C3%A0-tenant-rls-kh%C3%B4ng-ph%E1%BA%A3i-cloud-rollout).
Final log files: `artifacts/f02-a-20261019/final-typecheck.log`,
`final-test.log`, `final-build.log`, `final-format.log`, `final-database.log`.
Logs là local ignored artifacts, không thuộc commit.

## F02-A.1 — re-index và capability/RLS hardening (2026-10-19)

Điểm bắt đầu `9c5ee38`. WIP trước task không có; source changes chỉ thuộc lượt
này. Tái hiện trên PostgreSQL 17 disposable bằng LOGIN `examate_business`
non-owner/NOBYPASSRLS và `DocumentIngestionService` thật, với Storage/extractor/
OCR/embedding fake hợp lệ (page `{page:1,text}`, model `gemini-fixture-v1`, vector
768 chiều): index pending thành công, re-index lần hai đỏ `23505` vì policy SELECT
không cho đọc/xóa chunks cũ khi document `processing`. Test cũng tái hiện business
SELECT `workspaces` khi thiếu membership; capability guard chấp nhận TRUNCATE,
tắt RLS và Auth SELECT business; policy `PUBLIC USING(true)` mở đọc nhiều tenant;
apply 017 chấp nhận policy mở; BEGIN đã chạy nhưng ACK mất làm CLI không cleanup.

Migration nguồn 018 cập nhật workspace/membership read+lock policy fail-closed và
chỉ cho manager/member thấy chunks cũ của document `stored+processing` để re-index
atomic. Viewer/failed/other tenant không được mở scope; không grant DELETE trên
documents cho member. Re-index hai lần và retry sau lỗi rollback được test với
content/order/vector/quality ổn định, không duplicate chunks, tenant B không đổi.
Migration cũng snapshot/thu hồi PUBLIC CONNECT và rollback khôi phục ACL cũ.

Capability contract v18 lấy expected catalog digest từ pristine PG17 + source
migrations, không học từ target. Startup kiểm LOGIN/capability inheritance,
ownership/attributes, grants trên database/schema/table/column, PUBLIC và inherited
grants, RLS/policies, helper definition/owner/config/EXECUTE ACL và auth.sessions.
Policy không thuộc bundle có thể tác động runtime bị từ chối trước apply `db:migrate`
017/018 hoặc startup; API không tự grant/repair. Hạn chế: guard là startup-time,
không ngăn DBA đổi ACL sau đó; không tìm được mọi dynamic SQL trong app; không
chống được toàn bộ server/process đã chiếm quyền.

Mutation: 1) bỏ chunk processing visibility → re-index lỗi unique assertion; 2) bỏ PUBLIC conflict check → dry-run không reject; 3) bỏ RLS catalog check → disabled-RLS guard không reject; 4) bỏ membership scope ở 018 → no-membership workspace query trả row; 5) set transaction tracking chỉ sau ACK BEGIN → BEGIN lost-ACK tests không thấy
ROLLBACK. Từng mutation được khôi phục chính xác; migration 017/018 và runtime RLS
focused suites sau restore đều pass. Mất ACK BEGIN được phân biệt với COMMIT unknown;
COMMIT unknown discard connection và không replay.

| Gate/suite                                           | Kết quả lượt F02-A.1                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline typecheck / app / build / format / database | typecheck 0; API Vitest 288 + API Node 846 + web 374 = 1,508 pass; build 0; format 0; PG17 DB 430 pass/27 suites; fail/skip/cancelled 0; tất cả exit 0. Raw logs: `artifacts/f02-a1-20261019/baseline-*.log`. |
| Final typecheck / API Vitest / API Node / web        | exit 0; 288 / 846 / 374 = 1,508 pass                                                                                                                                                                          |
| Final build / format                                 | exit 0 / exit 0; format check ban đầu thấy 8 file code/test thuộc lượt cần Prettier, đã format đúng các file đó và chạy lại xanh                                                                              |
| Final database (PG17)                                | exit 0; 446 pass/28 serial suites; fail/skip/cancelled 0                                                                                                                                                      |
| Browser desktop / 375px                              | BROWSER_BLOCKED: Edge/Chrome binaries có sẵn, nhưng Playwright/Puppeteer/driver automation không có trong project/global; không cài package. SQL/HTTP suite không được tính browser.                          |

DB gate đầu tiên phát hiện stale fixture filter: legacy `database.test.mjs` loại
017 nhưng quên loại 018. Gate kế tiếp phát hiện hard-coded source/ledger count 017
trong `pilot-cli.database.test.mjs` và fixture đếm schema mới. Đây là harness
compatibility failures do version mới; giữ logs fail riêng, sửa filter/counts
đúng phạm vi, rồi chạy toàn bộ gate lại thành công. Không bỏ suite hoặc đổi guard.

Apply/rollback 018, rollback 017→016, rollback 016, rồi standard migration reapply
được kiểm trên disposable. Snapshot policies/ACL/catalog/ledger/business/Auth
session fixture giữ nguyên qua rollback/reapply. F02 baseline 017 sau rollback 018
không đủ contract v18: dừng API trước rollback và không khởi động lại tới khi 018
được apply, preflight/startup đạt. Đây không phải migration/role provisioning
hoặc policy rollout trên Supabase. Code/test commit: `65e24e49b4deaad1f03246caa81321396b646564`.

Artifacts/logs mới: `artifacts/f02-a1-20261019/` (ignored, local only). Chạy lại theo
[F02-A runbook](PILOT-B1-RUNBOOK.md#f02-a--local-runtime-capability-v%C3%A0-tenant-rls-kh%C3%B4ng-ph%E1%BA%A3i-cloud-rollout),
gồm `npm run f02:apply-018`/`npm run f02:rollback-018` với guard disposable.
Google live, Auth extended, máy Thắng và cloud rollout vẫn pending. Không push,
không cloud writes. Cleanup đã dừng/xóa container và network thuộc compose
project `examate-f02a1-20261019`, xác minh không còn container tham chiếu rồi xóa
đúng volume có label project đó. Không còn DB/role/container/volume của lượt chạy;
giữ artifacts ignored cho review và không đụng các SOP containers.

## Review độc lập F02-A.1 — 19/10/2026

Review tại source `f8a39ec`, không sửa business/Auth source hoặc migrations.
Build API exit 0; chạy mới 67 test DB qua năm file: runtime-migration-017,
runtime-migration-018, runtime-rls, oauth và pilot-rollback-016; 67 pass,
0 fail/skip/cancelled. Không coi 1.508/446 trong lượt trước là full gate chạy mới
của review này.

Browser automation IAB/CUA có sẵn trong phiên review. Harness ignored
`artifacts/f02a1-review-20261019/browser-fixture.mjs` dùng business/Auth LOGIN
non-owner, policy nguồn 018, fake Auth/Storage/AI; không phải cloud acceptance.
Ba role được kiểm qua membership DB của một identity synthetic, đăng xuất/đăng
nhập giữa các role; không nhận là ba account thật hoặc phiên máy Thắng.

- Member: desktop index → ready → re-index → ready; 375px re-index bằng Enter,
  download PDF thành công. Sau reload, RAG citation và own feedback receipt lưu
  được; không gọi Gemini thật.
- Viewer desktop/375px: upload/index disabled, không có control xóa.
- Manager: desktop index/re-index; 375px có control xóa và index hợp lệ.
- Console smoke đã kiểm không có error/warn. Đây chưa là full browser matrix,
  không nhận upload/delete/abort/reset hoặc mọi viewport/role path đều PASS.
- Inline mở khung nguồn nhưng IAB chưa chứng minh render trang PDF; chưa nhận
  preview PASS, chưa kết luận đó là lỗi code. Download fixture đã hoàn tất.

**Finding P2 còn mở:** Documents báo ready sau index nhưng Assistant dùng danh
sách cũ của `App.useDocuments()`, báo chưa có nguồn ready hoặc bỏ thiếu tài liệu
mới. Tái hiện với member ở 375px và manager index tài liệu thứ hai; reload trang
thì nguồn xuất hiện. Hai state riêng ở `App` và `DocumentsPanel` chưa được
invalidate/refresh đồng bộ. Không dùng reload thủ công làm fix; cần regression
Documents → Assistant và bảo vệ stale response/account/workspace reset.

Ảnh synthetic/fixture trong `artifacts/f02a1-review-20261019/` là local ignored
evidence, không commit credential hoặc signed URL. Review giữ verdict PARTIAL:
DB fixes đã có bằng chứng, cần sửa finding FE và hoàn tất browser acceptance;
cloud/Google/máy Thắng vẫn pending, chưa chuyển F03.

Typecheck, format source và format bảy file Markdown sửa trong review đều exit 0.
Fixture server/web đã dừng; DB/ba LOGIN roles tổng hợp được dọn sau khi kiểm
marker và không còn connection. Container/network/volume riêng của compose
project `examate-f02a1-review-20261019` đã được dọn sau khi kiểm labels; không
đụng dữ liệu thật hoặc SOP containers. Harness/ảnh ignored giữ để đối chiếu.

## F02-A.2 — Documents → Assistant lifecycle (19/10/2026)

Fix FE đồng bộ danh sách Assistant sau mutation Documents/Course bằng callback
invalidation có scope; `useDocuments` đọc lại từ server. Danh sách lỗi không bị
coi là rỗng hợp lệ, nút retry chỉ chạy GET. Chỉ document `stored/ready` được
chọn. Selection bị xóa khi tài liệu rời scope hoặc bị xóa; draft/history còn
hợp lệ không bị reset. Tác vụ/response thuộc view cũ bị bỏ khi request generation
không còn hiện hành. Không thêm endpoint, schema, dependency, polling hay POST
replay.

RED→GREEN: regression `shows a newly indexed document in Assistant without
reloading the app` ban đầu fail vì source option không xuất hiện sau index
ready. Sau sửa, suite Documents/Assistant/useDocuments chạy 150/150 pass.
Mutation bỏ callback invalidation, bỏ stale guard và cho pending vào source list
đều build/test được và fail đúng assertion; từng mutation được restore rồi suite
chạy xanh. Regression kiểm thêm upload→index, re-index, POST lỗi nhưng GET
reconciliation xác nhận ready, lỗi list read/retry chỉ-đọc, course refiling,
delete và account/workspace stale response.

Baseline đầu lượt: typecheck/build/format exit 0; `npm test` 1.508 pass
(API Vitest 288, API Node 846, web 374); `test:database` 446 pass/28 serial
suites trên PG17 disposable. Không fail/skip/cancelled.

Gates cuối lượt, chạy tuần tự trên source hiện tại: `npm run typecheck` exit 0;
`npm test` exit 0 (API Vitest 288, API Node 846, web 383; tổng 1.517 pass);
`npm run build` exit 0; `npm run format:check` exit 0; `npm run test:database`
exit 0 (PG17 disposable, 28 suites, 446 pass, 0 fail/skip/cancelled).
Browser run dùng Chrome headless native qua CDP với profile riêng, viewport
1440px và 375px. Index/re-index, upload/assign/delete manager, quyền member/viewer,
Assistant source/citation, synthetic PDF render/download và keyboard smoke đạt;
console error/warning bằng 0, mobile scrollWidth 375.

Giới hạn bằng chứng browser: API/Auth/Storage/provider là fixture in-memory; HTTPS
bị chặn. Run kiểm chứng FE lifecycle thật trong browser nhưng business/Auth SQL
không chạy qua LOGIN non-owner trong chính browser này. DB gate PG17 dùng role
LOGIN capability/RLS thật và pass độc lập; chưa nối browser UI với API/runtime
non-owner thành một acceptance run. Do đó browser tích hợp strict còn PARTIAL;
không dùng fixture này làm bằng chứng cloud/RLS rollout. PDF là synthetic local;
không gọi Gemini, Storage, Google hoặc Supabase thật. Run browser này không bao
gồm đầy đủ general/workspace chat, history/feedback/reset/abort và mọi HTTP role
denial; các phần đó chỉ có regression suite/API evidence hiện có, không được
nhận là browser acceptance mới.

Thay đổi chỉ ảnh hưởng Documents lifecycle/metadata FE; thuật toán RAG, model,
prompt, retrieval/ranking, citation validator, receipts/history và voice không
đổi. F10 vẫn STT-only của Thắng, không phát triển TTS; không thêm tool thứ ba;
R10 vẫn SSE. Hai tools không được nhận là đạt capability B của rubric. Cloud
rollout, Google live, Auth extended và máy Thắng tiếp tục pending.

Lệnh tái chạy regression:
`npm run test --workspace @examate/web -- src/App.test.tsx src/use-documents.test.tsx src/DocumentsPermissions.test.tsx`.
Gate DB: `npm run test:database` với `TEST_DATABASE_URL` trỏ đúng PG17 disposable
loopback đã qua target guard; không dùng `DATABASE_URL` cloud.

## F02-A local acceptance và F03 — 20/10/2026

F02-A đã đóng phần local acceptance còn thiếu bằng run browser nối thật với
Nest API và PostgreSQL 17 disposable. Browser Chrome 141 chạy 86/86 case ở
1440px và 375px; runtime business và Auth dùng LOGIN riêng, không owner/
NOBYPASSRLS, membership/role và dữ liệu hai tenant được seed tổng hợp. Auth
adapter/upstream, Storage, OCR/extractor, embedding và Gemini là fake; mọi request
external đều bị chặn. Tenant B giữ nguyên. Browser ghi nhận zero console issues,
zero external requests, PDF page thực sự render và attachment download hoàn tất.
Artifacts tổng hợp, PDF synthetic và log chỉ nằm trong ignored folder
`artifacts/f02a-acceptance-20261019-f49dc01b/`.

Ma trận quan trọng đã chạy: pending không thành nguồn; upload/index ready xuất
hiện trong Assistant cùng phiên; re-index không duplicate chunks và giữ draft;
assign/refile/delete đồng bộ selection/history scope; lỗi POST chỉ GET đối chiếu,
không replay; lỗi list không thành empty success; RAG citation, summary,
course_info, feedback; General/Workspace chat; abort stream thật với provider
được giữ chờ; account/workspace switch; manager/member/viewer/no-membership và
denial trước side-effect. PDF render được quan sát tại fixture browser, không chỉ
iframe/HTTP 200. Đây là **LOCAL_F02_ACCEPTED**; không phải Google/Supabase/live
acceptance hoặc cloud RLS rollout.

F03 source hiện có prompt registry typed và usage telemetry qua migration 019.
Prompt registry dùng ID/version ổn định cho general, RAG question, summary
section/synthesis và OCR; test golden giữ nguyên system instruction, thứ tự
parts, schema/context, retrieval IDs/order/scores, summary grouping và citations.
Metadata tách logical operation khỏi provider calls; ghi correlation/operation/
call IDs, verified workspace/user, mode, prompt reference, provider/model,
start/end/duration, outcome, usage status/counts và cost estimate nếu xác định
được. DB non-owner tests kiểm hai tenant, RLS, insert-only và context trên pool;
workspace SQL có 0 provider calls. Provider SDK v2.24.0 trả usage hợp lệ mới
được dùng; thiếu/partial/invalid/cached không biến thành zero hoặc cost chắc chắn.
Giá chỉ có cho model đã map với pricing version và giả định Standard Paid Tier;
đây là estimate, không phải billing. Không ghi prompt/câu hỏi/câu trả lời/PDF text,
raw SDK error hay credential.

Telemetry được ghi sau provider trong workspace transaction ngắn với authorize;
provider luôn ngoài DB transaction. DB/log failure có timeout/bounded signal,
không retry provider hoặc write, không thay kết quả nghiệp vụ đã xác định. Nếu
ghi không xác nhận được, metadata có thể thiếu. Bảng có `expires_at` 90 ngày và
index; cleanup job/scheduler chưa triển khai. Migration 019 chỉ apply/rollback
trên disposable PG17; capability contract v19 là source, không phải cloud-ready
role provisioning. F04 admission/budget và F06 admin dashboard/filter chưa làm.

RED/GREEN mới: assertions trước registry ban đầu đỏ khi metadata prompt ID/version
được thêm vào provider abstraction; test được giữ độc lập bằng golden payload cũ
và assertion riêng cho reference, chứng minh payload gửi provider giữ nguyên.
Các regression về stream outcome, OCR timeout, logger failure, actual modelVersion
và cached-token pricing đều được chạy targeted rồi xanh. Full DB suite một lượt
trước đó bắt gặp false-empty trong fixture retrieval có DELETE/reinsert; frozen
pre-scope query cũng trả 0 thay vì topK tại lần đó. Fresh focused retrieval 25/25
và full DB rerun 448/448 sau đó xanh. Root cause của false-empty/churn vẫn
INCONCLUSIVE; không sửa ANN, ranking, vector index hoặc scan policy.

Gates mới, chạy tuần tự trên PG17 disposable:

| Lệnh                    | Exit | Kết quả                                                                     |
| ----------------------- | ---: | --------------------------------------------------------------------------- |
| `npm run typecheck`     |    0 | pass                                                                        |
| `npm test`              |    0 | API Vitest 321 + API Node 847 + web 383 = 1,551 pass; 0 fail/skip/cancelled |
| `npm run build`         |    0 | pass                                                                        |
| `npm run format:check`  |    0 | pass                                                                        |
| `npm run test:database` |    0 | 448 pass / 30 suites; 0 fail/skip/cancelled                                 |

Tái chạy gates: dùng Node/npm theo root README, Docker PostgreSQL 17 disposable
loopback; đặt `TEST_DATABASE_URL` riêng để qua `apps/api/scripts/test-database-target.mjs`,
rồi chạy năm lệnh trên. Không nạp `.env`, không dùng `DATABASE_URL` cloud. Rollback
chỉ cho đúng DB `_test`, dry-run mặc định: `npm run f03:rollback-019`.
Apply cần `--apply --confirm-database=<exact-test-db>` và xóa riêng hai usage
table cùng ledger 019. Không chạy rollback trên cloud.

Cloud rollout, Google live, Auth extended, máy Thắng và B4 semantic/live vẫn
pending. F10 tiếp tục STT-only của Thắng; không phát triển TTS. Không thêm tool
thứ ba, R10 vẫn là SSE; hai tools không được nhận là capability B đạt rubric.

F03 backend instrumentation thay đổi sau lần browser F02-A. Một browser smoke
riêng sau F03 chưa chạy được: công cụ thực thi từ chối khởi chạy Chrome với
profile cô lập theo policy. Profile cá nhân không được dùng và không thử workaround;
vì vậy 86/86 là bằng chứng F02-A trước F03, không phải browser acceptance F03.
