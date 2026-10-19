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
