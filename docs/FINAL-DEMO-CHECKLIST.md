# ExaMate — checklist demo và nộp cuối kỳ

## Source publication verification - 23 October 2026

User authorized committing and pushing all reviewed nonsensitive integration code and documentation. Runtime/database source is committed at `0bddd53`. Fresh local gates: typecheck, npm test, build, format and canonical database all exit 0; application 2324 PASS (API Vitest 460 + Node 1317 + Web 547), canonical PG17 521/521 in 51 invocations; separate restricted managed-profile fixture 1/1. Fail/skip/cancelled: 0. PDF exporter tests: 2/2.

Both databases are new owned disposable clusters. No cloud write, paid model request, migration replay on shared services or new browser acceptance was performed. Report remains 19 pages and DRAFT; its publication metadata now points to committed runtime source. Secrets/backups/private artifacts remain ignored. Logs: `artifacts/publish-sync-20261023/`. Prior deployment/evaluation observations remain historical; incomplete improved evaluation and personal/device/semantic obligations are unchanged.


## Hiện tại - đọc trước các checkpoint lịch sử

- [x] Cloud managed026; Docker thật healthy tại8080; TLS/CA và hai LOGIN runtime.
- [x] Google của Tài callback về Dashboard;45 kiểm HTTP thật/private Storage đạt.
- [x]20 baseline thật và AI review công bố; không cần người ký gold.
- [ ] Improved đủ20: mới3 câu,2 lỗi503; dừng ở budget envelope, không retry.
- [ ] Video, máy Thắng/STT và xác nhận cá nhân do nhóm làm; không suy từ test giả.

Xem [bàn giao mới nhất](RUBRIC-READINESS-HANDOFF.md),
[triển khai](MANAGED-DEPLOYMENT.md) và [kết quả](evaluation-live-results-20261023.json).
Các dòng cloud016/017-blocked bên dưới là lịch sử, không áp dụng để migrate lại.

## Completion candidate — 23/10/2026

- [x] Private backup readable and restore rehearsed on owned PG17; 50 existing non-ledger tables preserved through local migrations 016–025.
- [x] Hosted Auth RLS regression RED→GREEN using non-owner LOGIN and a minimal private verifier; no managed Auth owner/RLS change.
- [x] Independent outsider-login 500 oracle and PDF continuation-fill oracle reproduced then fixed.
- [x] AI-delegated pre-execution technical gold review: v2, 24 definitions, 10 source facts/5 pages. This is neither model semantic review nor runtime provenance.
- [ ] Cloud rollout: stopped after 016; 017 rolled back due to PG17 policy-owner membership/ownership prerequisites. Root runtime configuration unchanged. Maintenance window released; restart requires fresh backup/writer checks.
- [ ] Real `compose.yaml` health/browser matrix, Google OAuth, >=20 live before/after results and real-service fallback video. Do not substitute synthetic stack evidence.
- [ ] Dispatch budget counter/wrapper and verified runtime target proof are still required before paid execution; the pinned batch authorizer alone does not provide them.

New-run evidence/lifecycle is recorded in `artifacts/final-completion-20261023/`; historical counts below are not this candidate's gate results. Final result summary will be appended after the current gate runs.

Đọc [README](../README.md), [hướng dẫn học](FINAL-STUDY-GUIDE-VI.md) và
[context](PROJECT-CONTEXT.md). Checklist này là kế hoạch; ô trống không phải PASS.

Phạm vi chốt 22/10/2026: F10 giữ STT hiện có, không TTS; F11 (PWA) và F13
(WASM PoC) đã bỏ khỏi kế hoạch, không phải tính năng đã hoàn tất. F15 mở rộng
ba tools vẫn đã bỏ; không tự bỏ F14. Theo
[rubric đã đối chiếu](FINAL-REQUIREMENTS.md#phạm-vi-bổ-sung-theo-tài--22102026),
vẫn cần responsive desktop/mobile, streaming/SSE, demo containerized/deployed,
hai capabilities A + C có bằng chứng và ≥20 case chạy trước/sau cải tiến.

## Browser acceptance trên stack demo — 23/10/2026 (không đổi các ô cũ bên dưới)

Các mục "Browser … chưa kiểm" ở F07/F08/F05/F06 phía dưới là lịch sử và **giữ nguyên**. Lần chạy này dùng Chrome nhúng của Claude Desktop trên
stack demo (Auth upstream, Storage, embedding, model **synthetic**; Nest/guards/PDF.js/chunker/retrieval/telemetry/PG17+RLS thật). Kết quả theo mục:

| Mục cũ | Đã chạy trong browser | Còn chưa chạy |
| ------ | --------------------- | ------------- |
| F07 hội thoại | gửi/hoàn tất (hiện "Đã lưu cuộc trò chuyện"), hủy giữa luồng (bản nháp quay lại, không lưu nửa câu), lịch sử riêng theo người dùng (API) | mở lại hội thoại từ "Lịch sử đã lưu", tiếp tục, xóa, đổi hội thoại giữa chừng |
| F08-A quiz | sinh → xem trước → lưu → reload → luyện tập → chấm 2/3 → tiến độ | xóa quiz, keyboard/focus, nhiều trang quiz |
| F08-B flashcards | xem trước → lưu → lật/tự đánh giá → lưu lượt → tiến độ | xóa bộ thẻ, keyboard/focus |
| F06 dashboard | manager xem tổng quan, token (2 mẫu), chi phí ước tính, thiếu = "chưa có dữ liệu" | lọc/phân trang chi tiết, làm mới khi đang mở chi tiết |
| F05 search | Tasks: tìm, lọc trạng thái, sắp xếp mặc định, reload | Documents/Courses/Exams/Plans/Expenses/sidebar |
| Mobile 375 px | 10 trang không tràn ngang; assistant bottom sheet; 375×520 composer cuộn và nút gửi tới được | keyboard/focus, thiết bị thật |
| R10 SSE | general hiện chữ dần; qua nginx 40 ms → 4.266 ms; nút Dừng | documents/workspace mode (chỉ stream trạng thái theo thiết kế) |

Ghi chú quan sát: khi Browser pane bị ẩn/hiện, panel Assistant đóng lại (cửa sổ mất focus → app kiểm tra lại phiên; thử `window.dispatchEvent(new Event("focus"))`
trong khi hiển thị thì panel và bản nháp **vẫn còn**). Chưa xác định chính xác nguyên nhân đóng panel khi pane ẩn; không coi là lỗi sản phẩm đã tái hiện. Artifacts:
`artifacts/rubric-readiness-20261022/` (ảnh `screens/`, `roles-check*.jsonl`, `gates-*.txt`, log) — git-ignored.

## F07 — hội thoại riêng đã lưu (local automated evidence)

- [x] Hội thoại thuộc `(workspace_id,user_id)` đã xác minh; Manager không mặc
      nhiên đọc transcript cá nhân khác. Business/Auth dùng LOGIN riêng và
      non-owner; Auth không có quyền SELECT transcript.
- [x] Chỉ lượt hoàn tất có receipt/hash/scope hợp lệ được lưu; client không
      gửi transcript đáng tin để làm history. JSON và SSE hoàn tất được kiểm;
      cancel không lưu câu trả lời dở.
- [x] Reload/open, tiếp tục, version conflict, delete khi append đang chờ,
      expiry trước cleanup, list/messages pagination, rollback/reapply và
      retention dry-run/apply được kiểm trên PostgreSQL 17 disposable.
- [x] Regression kiểm tạo hội thoại khi mất ACK bằng GET create-key; lượt lưu
      `unknown` đối chiếu GET theo receipt trước, không phát lại AI/POST. Chỉ
      sau khi GET xác nhận chưa lưu mới có thể chọn thử POST lưu receipt.
- [x] Lần chạy cuối trên source F07 ở `cc366bf` + `2d05453`: `npm run typecheck` exit 0;
      `npm test` exit 0 (API Vitest 384/384, API Node 856/856, Web Vitest
      469/469); `npm run build` exit 0; `npm run format:check` exit 0;
      `npm run test:database` trên PG17 disposable exit 0 (472/472, fail 0,
      skip 0, cancelled 0). Fixture migration cũ được giữ ở đúng version;
      migration 001–021 không bị sửa.
- [ ] Browser desktop 1440px/mobile 375px: tạo, reload, mở lại, tiếp tục, xóa,
      đổi tài khoản và cancel khi đổi hội thoại. Browser automation không được
      cấp trong lượt kiểm này; React/HTTP tests không thay bằng chứng browser.

### F07.1 — lỗi mở hội thoại đã lưu

- [x] RED trên baseline: mở một mục sau khi nội dung không còn khả dụng không
      tìm thấy `role="alert"` vì panel đóng danh sách trước khi lỗi được render.
- [x] GREEN: trạng thái mở và lỗi nằm ngoài danh sách có thể đóng; lỗi tạm thời
      có nút GET-only “Thử mở lại”; 404/410 và 401/403 có thông báo an toàn,
      làm mới danh sách hoặc mở cuộc trò chuyện mới. Lỗi đọc danh sách có retry
      riêng; open/retry không gọi chat, create, save hay provider.
- [x] Regression che phủ retry thành công, 404/403/400, lỗi tải danh sách,
      response A đến muộn sau B, reset/principal change, giữ draft và không có
      AI/write side effect. Focused `assistant.test.tsx`: 27/27.
- [ ] Browser desktop 1440px/mobile 375px chưa kiểm được trong lượt này vì
      không có browser automation capability được cấp; không coi React tests
      là browser acceptance.
- [x] Source-final gates cho F07.1: `npm run typecheck` exit 0; `npm test`
      exit 0 (API Vitest 384/384, API Node 856/856, Web Vitest 476/476; fail,
      skip, cancelled đều 0); `npm run build` exit 0; `npm run format:check`
      exit 0. Focused `npm run test --workspace @examate/web --
      src/assistant.test.tsx` exit 0 (27/27). DB gate không chạy vì diff chỉ
      thay đổi web/hook/test/docs, không thay API hay quyền; số DB ở phần F07
      phía trên là kết quả lịch sử, không phải lần chạy F07.1.

Giới hạn: nội dung hết hạn sau 90 ngày kể từ tạo theo DB clock; GET không gia
hạn. Retention không xóa receipt/feedback. Đây là kiểm local synthetic, không
phải nghiệm thu Google live, cloud rollout hay máy Thắng.

### F07.2 — đồng bộ document selection và chặn document actions khi mở history

- [x] RED trên code ban đầu: retry mở transcript thành công nhưng giữ tài liệu
      đang chọn; document actions vẫn gọi create/chat trong lúc GET mở/retry chờ
      hoặc sau lỗi chưa recovery. Các regression mới quan sát đúng các hành vi này.
- [x] GREEN: lần mở đầu và retry dùng chung helper áp dụng summary đã được hook
      chấp nhận; hook chặn `send` trước `syncContext` trong lúc mở/lỗi unresolved.
      Hai nút tóm tắt/tra môn bị disable; reset hoặc mở thành công khôi phục thao tác.
      Course/workspace không tự đổi; draft và flow receipt/save giữ nguyên.
- [x] Focused `npm test --workspace @examate/web -- --run
      src/assistant.test.tsx --reporter=dot`: exit 0, 40/40. Bao gồm retry rồi
      follow-up đúng conversation/version/document, không create/save/provider khi
      mở/retry, direct send guard, scope course khác, reset/principal/unmount và
      response retry cũ sau khi mở hội thoại B.
- [x] Source-final gates: `npm run typecheck` exit 0; `npm test` exit 0
      (API Vitest 384/384, API Node 856/856, Web Vitest 489/489; fail/skip/
      cancelled đều 0); `npm run build` exit 0; `npm run format:check` exit 0.
      Không chạy `npm run test:database`: chỉ đổi web hook/panel/tests/docs,
      không đổi API/SQL/quyền. Không tạo database/container trong lượt này.
- [ ] Browser desktop 1440px/mobile 375px chưa kiểm: phiên không cung cấp
      browser automation tool. React tests không được tính là browser acceptance;
      F07.2 browser acceptance còn pending.

## Chuẩn bị trước buổi báo cáo

### F08-A — Study Coach Quiz

- [x] Generation chỉ nhận document stored/ready có scope hiện hành; model output
      được kiểm strict JSON/schema/câu hỏi/nguồn trước khi thành draft. Preview
      không tự lưu; xác nhận bằng token server-issued mới tạo quiz.
- [x] Quiz/attempts gắn `(workspace_id,user_id)`; manager không đọc quiz cá nhân
      khác. Draft 15 phút, quiz 30–90 ngày (mặc định 90 ngày), theo DB clock;
      GET không gia hạn. Practice được chấm ở server và idempotent; không gọi AI.
- [x] PG17 disposable qua Nest với business/Auth LOGIN riêng non-owner kiểm
      generation wrapper thật, retrieval/embedding thật, F03 call/operation rows,
      F04 reservation, confirm/list/detail/delete/attempt/progress, role/tenant
      isolation, expiry, retention, rollback/reapply và Auth grants.
- [x] Quiz list có hơn một trang; expired draft/quiz bị chặn trước retention.
- [ ] Browser thật desktop 1440px/mobile 375px: tạo preview, xác nhận lưu,
      reload/mở lại, luyện tập, xóa, keyboard/focus/layout. Browser automation
      không được cấp trong phiên này; React/HTTP tests không thay browser PASS.
- [ ] Human review chất lượng câu hỏi trên corpus/gold và đánh giá semantic F09.
- [x] Rollback 023 dry-run/apply dùng đúng disposable guard/checksum/dependency
      và RESTRICT; giữ dữ liệu F03/F04/F07. Nếu đã có `study_quiz` telemetry
      hoặc admission rows, rollback từ chối để không phá ràng buộc cũ.
- [x] Source-final gates (21/10/2026): `npm run typecheck` exit 0;
      `npm test` exit 0 (API Vitest 393/393, API Node 857/857, Web Vitest
      491/491; tổng 1,741); `npm run build` exit 0; `npm run format:check`
      exit 0; guarded PG17 `npm run test:database` exit 0 (42 serial suites,
      474/474, không fail/skip/cancel).
- [x] F08-A focused tests: quiz validator 9/9, Study Coach UI 2/2,
      runtime Nest/PG17 non-owner 1/1, migration/retention lifecycle 1/1.
- [ ] Browser acceptance chưa chạy: phiên không cung cấp browser automation;
      React/HTTP tests không được nhận là browser evidence. Human semantic review
      và F09 evaluation cũng pending.

F08-A riêng lẻ không đồng nghĩa toàn bộ F08. Flashcards có implementation
checkpoint F08-B bên dưới; browser acceptance và human semantic review vẫn
pending, F09 evaluation chưa làm. Quiz/flashcard là evidence-grounded output,
không cam kết bao phủ toàn PDF hoặc bảo đảm semantic correctness. F03 telemetry
vẫn best-effort; save/practice/review không gọi AI và không dùng telemetry làm
admission.

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
- [ ] Theo chốt bổ sung 22/10/2026: không đưa F11/PWA hoặc F13/WASM vào cam kết
      demo; vẫn kiểm mobile web/375px và SSE trên bản containerized/deployed.
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

## F08-A.2 — quiz creation/attempt lifecycle coordination (21/10/2026)

The create/save flow and a prepared, sending, or unresolved practice attempt are
now mutually exclusive. A shared tokenized lifecycle lock guards generate,
confirm/reconcile/cancel, delete, and submit handlers; controls expose the same
blocked state. The lock's identity token prevents a stale completion from
releasing a newer principal's operation. Confirm success preserves an open
practice detail, and attempt retry preserves the original quiz/key/payload and
applies server-returned progress.

The tracked RED run on the pre-fix implementation had 4 failures and 11 passes:
generation and preview confirmation remained enabled during an unknown attempt,
and practice checking remained enabled during pending generation/confirmation.
An initial test setup omitted selecting its source document; it was fixed before
the valid RED result was recorded. Final focused Web verification passed
18/18 StudyCoachPanel tests, covering pre-existing preview plus unknown attempt,
same-key/payload retry, delayed attempts, generation/confirmation races,
duplicate clicks, stale principal response, and unmount cleanup.

New final gates: typecheck, build, and format exit 0; `npm test` passed API
Vitest 393/393, API Node 857/857, and Web Vitest 507/507 (1,757 total), with no
failures, skips, or cancellations. This change is frontend-only; no database
gate or migration was needed. Browser automation was not exposed in the session,
so desktop 1440px/mobile 375px acceptance is `BROWSER_ACCEPTANCE_PENDING`;
React tests are not browser evidence. F08-A browser acceptance and semantic
review, F09, cloud rollout, Google live, and remote-machine acceptance remain
pending. At this historical F08-A.2 checkpoint, F08-B was still pending; see
the separate F08-B checkpoint below.

## F08-A.1 — recovery/search/progress regressions (21/10/2026)

- [x] Attempt submit keeps the original quiz ID, attempt key and answer payload
      after a 503/unknown response; retry does not create another attempt.
- [x] Unknown confirm keeps confirm/cancel writes locked until owner-scoped GET
      reconciliation; confirmed does not POST again, draft enables a separate
      confirm, failed GET remains locked, terminal states show recovery feedback.
- [x] Quiz detail selects title and attempt aggregate; list/detail/progress
      match for no attempts, 100%, zero, and multiple attempts. The open practice
      panel updates from the returned server progress, and list refresh is read-only.
- [x] Debounced document search sends q, resets to page 1, restores the default
      list on clear, retries only GET, and drops old query/principal/unmounted results.
- [x] RED: pre-fix UI regressions exposed missing query wiring and unsafe unknown
      write controls; PG17 Nest detail returned title undefined. GREEN: focused
      StudyCoachPanel 11/11 and real Nest/PG17 Study Coach DB test 1/1.
- [x] New gates: typecheck/build/format exit 0; `npm test` API Vitest 393/393,
      API Node 857/857, Web Vitest 500/500 (1,750 total); guarded PG17
      `npm run test:database` 474/474. No failures/skips/cancellations.
- [ ] Browser acceptance remains pending: this session exposes no browser
      automation tool. These React/API/DB tests are not browser evidence.
- [ ] At the historical F08-A.1 checkpoint, human quiz semantic review,
      flashcards/F08-B and F09 were pending; see the F08-B checkpoint below.

## F08-B — Flashcards preview, personal storage and self-review (21/10/2026)

- [x] Generate from one currently readable stored/ready document only; strict
      `study-flashcards-v1` schema/provenance validation, 3–10 cards (default 5),
      `vi|en`, and explicit preview → confirm. No auto-repair or generation retry.
- [x] Private `(workspace_id,user_id)` drafts, decks and reviews under migration
      024, runtime capability v24, owner RLS and narrow business LOGIN grants;
      Auth cannot read card content. Draft token is hashed and expires in 15
      minutes; saved immutable content expires in 90 days by DB time.
- [x] Flip, self-rate remembered/needs-review, then explicitly submit one exact
      card-ID set. Server enforces idempotent review key/payload and computes
      last-review counts/progress. This is learner self-assessment, not an AI
      grade or evidence of mastery. Reads, confirm/delete/review/progress do not
      invoke AI.
- [x] Real Nest + PG17 integration used separate non-owner/NOBYPASSRLS
      business/Auth LOGINs, live RLS/capability checks, real retrieval and
      Gemini/provider wrappers, F03 telemetry and F04 admission. Only Auth
      upstream and SDK transports were synthetic. It checked tenant/owner/role
      isolation, invalid/forged output, quota denial before dispatch, confirm
      and review replay/lost responses, progress, source availability, retention
      and migration 024 rollback/reapply. Existing F08-A remained isolated.
- [x] RED→GREEN: strict flashcard validator regression failed before the
      validator was implemented; focused validator/dashboard tests now pass
      55/55 and focused Web panel/workspace tests 8/8. A UI test caught an
      overly strict guard dropping an already-resolved list response; the guard
      was corrected to use request revision identity. Migration-024 integration
      suites passed 3/3; final full DB gate passed 477/477 across 44 suites.
- [x] Final automated gates: typecheck 0; `npm test` 0 (API Vitest 405/405,
      API Node 858/858, Web Vitest 515/515; 1,778 total); build 0; format 0;
      guarded `npm run test:database` on disposable PG17 0 (477/477). Build
      emits a Vite advisory that one JS chunk is slightly over 500 kB.
- [ ] Browser acceptance is pending: no browser automation tool was exposed in
      this session. React/API/DB integration tests are not browser evidence.
- [ ] Human semantic review is pending. Synthetic review sample (not a gold
      answer): source excerpt — “During photosynthesis, chlorophyll absorbs
      light energy. The plant uses that energy to convert carbon dioxide and
      water into glucose and oxygen.” Candidate card — front: “What role does
      chlorophyll play in photosynthesis?”; back: “It absorbs light energy used
      to convert carbon dioxide and water into glucose and oxygen.” A reviewer
      should judge usefulness, factuality and whether the cited passage supports
      the answer; schema/provenance validity does not establish this.
- [ ] F09/live evaluation, flashcard browser acceptance, full F08 acceptance,
      cloud rollout, Google live and Thắng's machine remain pending.

## F08-B.1 — visible draft rejection and GET recovery (21/10/2026)

- [x] Confirm/cancel definite errors have an independent `role=alert`, safe
      operation-specific explanation and explicit GET reconciliation. An expired
      or removed preview cannot hide the failure. Access/source/unavailable and
      other definite errors are distinguished from network/408/5xx unknowns.
- [x] GET confirmed accepts the saved result; GET draft enables a separate
      explicit write; expired/cancelled/deleted remains visible without preview.
      Failed GET keeps unknown and only retries the read. No automatic write or
      generation occurs. Previous success notice is cleared before a new action.
- [x] Fresh RED at `c718e62`: managed confirm-409 and cancel-409 regressions both
      failed with `Unable to find role="alert"` (exit 1; 2 failed, 7 filtered).
      GREEN: focused panel/quiz/workspace 55/55, full Web 544/544. Re-run:
      `npm run test --workspace @examate/web -- src/StudyFlashcardsPanel.test.tsx src/StudyCoachPanel.test.tsx src/StudyCoachWorkspace.test.tsx`.
      Coverage includes all reconciliation results, failed GET/retry, stale
      principal/unmount responses, safe error messages and no write/provider replay.
- [x] New source-final gates: `npm run typecheck` exit 0; `npm test` exit 0
      (API Vitest 405, API Node 858, Web Vitest 544: 1,807 passed; fail/skip/
      cancelled 0); `npm run build` exit 0 (existing Vite >500 kB advisory);
      `npm run format:check` exit 0. Status: `F08-B.1_CODE_VERIFIED`.
- [x] No API/SQL/schema/grant changes; no DB fixture or full database gate was
      run for this frontend-only correction. The earlier PG17 counts above are
      historical and are not new evidence for F08-B.1.
- [ ] Browser acceptance pending: this session exposes no browser automation
      tool. Desktop 1440px/mobile 375px confirm rejection, cancel conflict,
      keyboard/focus/layout/console and unknown recovery still require browser
      verification through Nest/PG17 non-owner runtime. React tests use mocked
      API boundaries and do not substitute for that verification.
- [ ] Human semantic review, full F08, F09, pending F05/F06 browser matrices,
      cloud rollout, Google live and Thắng's machine are unchanged.

## F09-B.2B.5.2 — sealing window (22/10/2026)

- [x] Correction: B.2B.5.1 protected the run after sealing, not the await inside sealing; the caller's
      buffer was copied after `await`, so provenance for changed bytes could meet the original plan.
      Fixed by one synchronous snapshot (buffer, plan, mapping, definition, approval, provenance buffer)
      before the first await and a single private buffer used for hash, parse, rebuild, seal and verify.
- [x] RED (oracle 3/4 → 4/4; four new tests failed) then GREEN: executor 26/26, oracles 7/7, 24 snapshot
      and binding mutants killed (2 equivalent), Nest/PG17 8/8. Source `da862cd`: typecheck/build/format
      exit 0, `npm test` 2,310, `test:database` 520/520 in 50 files — new runs.
- [ ] Not live: test-owned authorizer/equivalence, no recorded human approval, no real account.
      `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`, `SEMANTIC_REVIEW_PENDING` unchanged.

## F09-B.2B.5.1 — executor binding fixes (22/10/2026)

- [x] Correction: B.2B.5 did not recompute request hashes (it copied them) and trusted caller-supplied
      provenance bytes; an edited request still dispatched and a v2 plan ran with v1 provenance. Fixed:
      suite bytes re-hashed and re-parsed, request hashes recomputed, plan rebuilt by the canonical
      planner and compared, provenance bytes tied to the approved suite, immutable private copy for the run.
- [x] RED on behaviour (five new tests failed; oracle 1/3) then GREEN: oracle 3/3, executor 20/20, 30
      mutants killed, Nest/PG17 8/8. Source `3a628e6`: typecheck/build/format exit 0, `npm test` 2,304,
      `test:database` 520/520 in 50 files — new runs.
- [ ] Still not live: test-owned authorizer/equivalence, no recorded human approval, no real account.
      `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`, `SEMANTIC_REVIEW_PENDING` unchanged.

## F09-B.2B.5 — one-batch executor (22/10/2026)

- [x] Core executor for exactly one batch: exact approval binding (suite, plan, batch, order,
      requests, target, limits), injected authorizer and target-equivalence, pinned and current
      provenance, existing ledger keyed per batch with the intent before the first POST, one POST
      per case, stop on blocking outcome, unknown outcome never replayed, no next batch.
- [x] CLI `--execute --batch --approval` fail-closed: no authorizer or equivalence in the CLI, so
      refused before credentials; no flag skips a prerequisite (source scan + parser tests).
- [x] Unit 14/14 incl. two real processes (one dispatch) and a runner failure recorded unknown;
      19 mutants killed. Nest/PG17 integration 8/8: positive control over HTTP with counters,
      SDK calls, persisted usage and receipts reconciled; refused batch costs nothing; provider
      outage stops the batch. Source `7a17db3`: typecheck/build/format exit 0, `npm test` 2,298,
      `test:database` 520/520 in 50 files.
- [ ] Not live: test authorizer/equivalence are fixtures, no human approval, no real model or
      account. Needs approved gold, a trusted target-equivalence proof, a quota/budget decision
      and a real audit. `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`,
      `SEMANTIC_REVIEW_PENDING` unchanged.

## F09-B.2B.4 — quality suite v2 draft (22/10/2026)

- [x] `rag-quality-20261022-v2` drafted from the AI review (14 cases reworded or
      relabelled, corpus and gold bindings identical, v1 untouched); prepare tool takes
      `--suite` (default v1). Tests fix the changed-case list and the unchanged bindings.
      Source `d1a95d1`: typecheck/build/format exit 0, `npm test` 2,279. Not executed.
- [ ] Tài–Thắng review/approval of v2 (or of v1) still pending; `GOLD_REVIEW_PENDING`,
      `LIVE_EVALUATION_PENDING`, `SEMANTIC_REVIEW_PENDING` unchanged. Rubric needs ≥20
      cases and before/after pass rates: two real runs, hence a quota/budget decision.

## F09-B.2B.3.1 — blank baseline correction (22/10/2026)

- [x] Correction: the B.2B.3 entry below said no documents existed at setup; the shared
      bootstrap had seeded 12 documents and 12 chunks. The corpus PDFs were still
      uploaded and indexed through the real services; production was not at fault.
- [x] RED on the database (documents 12 / chunks 12), GREEN after the `seedDocuments`
      option (default unchanged). Runtime assertions: 0/0 and no provider call before
      upload; exactly the three API ids after upload; chunks only for them after
      processing. Mutants (option ignored, default flipped) killed. Source scan kept
      as supplementary and no longer claimed to prove the call graph.
- [x] Source `ff44b41`: chain 13/13, oracle PASS, typecheck/build/format exit 0,
      `npm test` 2,273, full `test:database` 512/512 in 49 files — new runs.
- [ ] Blockers by owner: engineering (controlled-execution path on synthetic
      boundaries); team decisions (gold, RQ23, target-equivalence design, live batch
      and budget); real environment (audit of the real project, live run, browser/cloud/
      Google/Thắng-machine). `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`,
      `SEMANTIC_REVIEW_PENDING` unchanged. Not F09 complete.

## F09-B.2B.3 — upload → ingestion → audit → preflight chain (22/10/2026)

- [x] Documents created by the public upload route and indexed by the processing
      endpoint/`DocumentIngestionService` (real Nest, RLS, StorageService, PDF.js,
      chunker, embedding batching, admission, usage); only Auth upstream, remote
      Storage stand-in (keeps and returns the received bytes) and SDK transport are
      synthetic. No direct document/chunk write on the happy path (static scan).
- [x] Persisted chunks/pages equal the production pipeline's output for the stored
      bytes; each vector is the embedding of its own chunk text; embedding calls equal
      the real batch count; no generation, OCR or receipt in the chain.
- [x] Audit OBSERVED_CONSISTENT, verifier BOUND (pinned digest + second audit),
      preflight verified Auth/scopes/course sets/provenance evidence; gold approval,
      target equivalence, corpus provenance (metadata) and admission unverified;
      execution blocked; `--execute` refused with zero fetches.
- [x] Negative: viewer/other-workspace denials make no SDK or Storage call (recorded
      as `rejected` operations, 0 provider calls); wrong/unreadable Storage bytes; a
      failed or unprocessed document is not consistent and recovers by retry; damaged
      chunks caught and replaced by a real re-index without duplicates; drift against an
      older artifact is `MISMATCH`.
- [x] RED→GREEN: real behaviour REDs while building (denied requests do record
      operations; test-side TDZ bug fixed), plus 6 production-service mutants in the
      compiled ingestion/upload services (page, text, index, vector alignment, stale
      chunks, upload bytes) all killed by the chain test.
- [x] Source `acd2b3c`: typecheck, build, format; focused 492/492 (provenance, planner,
      quality-http, quality, evaluation, HTTP, reservation, ingestion); chain 12/12;
      `npm test` 2,273 (unchanged: DB-only slice); full `test:database` 511/511 in 49
      files — new runs, exit 0.
- [x] `F09-B.2B.3_CODE_VERIFIED + LOCAL_INGESTION_AUDIT_PREFLIGHT_VERIFIED +
      EXECUTION_BLOCKED`.
- [ ] Still not proven: real Storage/Auth/Gemini, the real maintenance role, target
      equivalence of any HTTP endpoint with the audited database/Storage. Execution,
      `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`, `SEMANTIC_REVIEW_PENDING`,
      browser/cloud/Google/Thắng-machine and F09-A.1 cleanup pending unchanged.

## F09-B.2B.2 — quality-suite dry-run and preflight (22/10/2026)

- [x] Planner: exact manifest bytes/hash, mapping per course file set, DTO-validated
      request shapes (document / course / intersection question, one-document
      summary), batches ≤ cap (default 5) with dataset 24 ≠ cap, reproducible plan
      hash covering manifest, mapping, scopes, targets, selection, batches, versions.
      23 supported, RQ23 deferred `SUMMARY_REQUIRES_ONE_DOCUMENT`.
- [x] Dry-run: no credential, `.env`, network, Auth, Storage, DB, provider or
      execution record; stdout has no ids or secrets.
- [x] Preflight over the existing session transport: reads and Auth lifecycle only,
      one login, no retry; course sets via the server's read API; provenance artifact
      binding / pinned authenticity / currentness reported separately; gold approval
      and target equivalence unverified; `qualityExecutionReady`/`executionAuthorized`
      constant false; `--execute` refused with `generationRequests=0`.
- [x] RED→GREEN: module-missing RED for planner and orchestrator, extra RED/GREEN for
      shared course ids (validator) and the dry-run env check; planner 17, quality-
      http 16, provenance 40, focused 448/448; PG17 integration 6/6 across manager,
      viewer, foreign, revoked, expired sessions, wrong course sets, forged/drifted
      provenance, execute refusal; only Auth bookkeeping tables changed.
- [x] 26 mutants: 25 killed, one equivalent. Source `1e1dd08`: typecheck, build, format,
      `npm test` 2,273 (457+1,272+544), full `test:database` 499/499 in 48 files —
      new runs, exit 0.
- [x] `F09-B.2B.2_CODE_VERIFIED + LOCAL_PREFLIGHT_VERIFIED + EXECUTION_BLOCKED`.
- [ ] No real target or account used. Index seeded with the production extractor /
      chunker, not through the ingestion service. Execution, trusted target-
      equivalence proof, `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`,
      `SEMANTIC_REVIEW_PENDING`, browser/cloud/Google/Thắng-machine and F09-A.1
      cleanup pending unchanged.

## F09-B.2B.1.1 — document-set completeness fix (22/10/2026)

- [x] Defect reproduced by reviewer oracle (2 RED): a re-hashed artifact with a
      duplicate replacing a mapped document passed, and drift of the omitted
      document went unseen in observation comparison.
- [x] Verifier now requires audited `(file, documentId)` identities one-to-one
      with mapping+scopes for artifact and observation (distinct, equal count,
      subset, exact key sets). Same-file-different-id (policy + copy) stays valid;
      order is irrelevant; malformed observation is never `matches_observation`.
- [x] RED 4 failing → 39/39 unit; oracle 2/2; positive controls (intact, pinned,
      drift, inconsistent audit) kept; mutation: uniqueness, count, membership,
      key-shape and file-only-identity mutants killed, 19 earlier mutants killed
      again; two unreachable defence-in-depth guards are equivalent mutants.
- [x] PG17 integration 14/14 incl. forged duplicate over a real drifted document
      (red under a uniqueness-dropped mutant). Source `6207165`: typecheck,
      build, format, focused 414/414, `npm test` 2,239 (457+1,238+544), full
      `test:database` 493/493 in 47 files — new runs, not history. Exit 0.
- [x] `F09-B.2B.1.1_CODE_VERIFIED`. Verifier still not wired to execute; no real
      target audited; `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`,
      `SEMANTIC_REVIEW_PENDING` and browser/cloud/Google/Thắng-machine/F09-A.1
      pending unchanged.

## F09-B.2B.1 — runtime provenance audit (22/10/2026)

- [x] `apps/api/scripts/rag-evaluation-provenance.mjs`: versioned artifact
      `examate.rag-corpus-provenance` v1 + verifier. Read-only: REPEATABLE READ /
      READ ONLY snapshot before and after two Storage reads; no provider, quota,
      receipt or write import (static test); not connected to execute/runner/ledger.
- [x] Checks real data: Storage bytes SHA-256 and size; index vs the production
      extractor/chunker on those bytes (count, index, page, exact text); facts on
      declared page (`whitespace-collapse-v1`); embedding presence/model/dimension
      + vector hash; exact course sets (two-PDF vs policy-only course); optional
      membership. Foreign/renamed documents are never fetched.
- [x] RED: first run failed on the missing module. Unit 32/32 (incl. missing/extra/
      reordered/wrong-page/wrong-text/whitespace-only chunks, swapped mapping,
      wrong workspace/course, not-ready/deleted, change during audit, timeouts,
      leak-free errors, tampered/forged/mismatched artifacts). PG17 integration
      13/13: real SQL + real Storage HTTP reader (404, public bucket, redirect,
      oversize, hang/abort), every public table byte-identical before/after audit
      (rows+md5), writes refused with SQLSTATE 25006, outbound requests only to
      the loopback Storage stand-in, all Storage requests GET.
- [x] 23 mutants: 22 killed; M8 (ordering flag) is an equivalent mutant because
      exact index/page/text comparison already implies order. Three first survivors
      (M9, M12, M20) led to new tests.
- [x] Source `cd99923` gates exit 0: typecheck, build, format:check; `npm test`
      457 Vitest + 1,231 Node + 544 Web = 2,232 (fail/skip/cancelled 0, was
      2,200); full `test:database` 492/492 in 47 files on a guarded disposable
      PG17 (was 479/46 history; not a new baseline for older work). Build chunk
      advisory unchanged.
- [x] Finding: the production pipeline keeps PDF line breaks; the earlier runtime
      fixture seeds unwrapped page text, which this audit rejects by design.
- [x] `F09-B.2B.1_CODE_VERIFIED + LOCAL_PROVENANCE_AUDIT_VERIFIED` on synthetic
      fixture only. Safe re-run: see evaluation-plan F09-B.2B.1.
- [ ] No real target audited. Needs maintenance DB URL + Storage read credential,
      workspace ID, document IDs (and a separate policy copy for the policy-only
      course) and a pinned digest record. Ingestion-service persistence itself was
      not exercised (seeded with the same production extractor/chunker).
- [ ] `GOLD_REVIEW_PENDING`, `LIVE_EVALUATION_PENDING`, `SEMANTIC_REVIEW_PENDING`,
      missing transport, new-manifest execute and browser/cloud/Google/Thắng-
      machine/F09-A.1 cleanup pending are unchanged.

## F09-B.2A — offline draft quality suite (22/10/2026)

- [x] Separate `docs/evaluation-quality-cases-v1.json`, schema
      `rag-quality-suite-v1`, revision `rag-quality-20261022-v1`, 24 distinct
      authored objectives; unchanged v3 / F09-A / rag-eval-v2 / historical reports.
      Exact manifest SHA-256:
      `97b029588eacdabd593fbc80da0315a8aeef273cbf3e233696b1aaed5e7df7b9`.
- [x] 18 grounded bindings and six reasoned no-evidence oracles; source PDFs,
      correct pages and all ten frozen facts machine-checked via actual local
      PDF extraction. Overlapping coverage: document/course/intersection 16/6/2,
      Vietnamese/injection/summary 18/4/3. Synthetic facts are not lecturer rules;
      Vietnamese questions on ASCII PDFs are not Vietnamese extraction evidence.
- [x] Exported `artifacts/f09b2a-20261022/review-pack/`: catalog with Git/dirty,
      byte hash/revision and NOT_ATTEMPTED cases; PDFs/source pages; gold-review
      template for Tài–Thắng; proposed batches 5/5/4. Ten unsupported cases are
      deferred, none dropped. Fourteen operation-compatible cases are still
      non-executable new IDs. No cap/readiness/execute/ledger change.
- [x] RED logs retained: initial missing new module; first implementation 53/55
      (review error classification, Windows import URL); then three actual
      missing-exception failures for injection label, stale batch binding and
      nonexistent predecessor. Final new suite 58/58; focused evaluation + HTTP
      + reservation 375/375, exit 0; fail/skip/cancelled 0.
- [x] Fresh four gates on source `1860cc8` exit 0: typecheck, npm test, build,
      format. Full tests: 457 API Vitest + 1,199 API Node + 544 Web = 2,200 pass;
      fail/skip/cancelled 0. Build chunk advisory remains. Logs/gate exit codes
      are in `artifacts/f09b2a-20261022/`; counts are new, not B.1.3 history.
- [x] Re-run `npm run eval:f09b2a:prepare -- --output artifacts/my-gold-review --batch-size 5`;
      `node --test apps/api/test/evaluation-quality.test.mjs`. Output must be new.
      Offline CLI guards cover network/secret-file/ledger attempts; it has no
      execution or credential options. No DB/browser gate was needed or claimed
      for this data/script-only slice. No disposable container/DB was created.
- [x] `F09-B.2A_CODE_VERIFIED + GOLD_REVIEW_PENDING` for preparation only.
- [ ] Tài–Thắng must review/approve exact-bound gold, source semantics, objective
      variety and absence oracles. Reviewer/time/decision/notes remain blank;
      DRAFT_REVIEW_REQUIRED, not frozen. No quality cases executed or approved.
- [ ] B.2B provenance attestation, missing transport support and target/batch/quota
      approval before live calls. LIVE_EVALUATION_PENDING and post-response
      SEMANTIC_REVIEW_PENDING remain; prior F05/F06/F08 browser, cloud/Google/
      Thắng-machine and F09-A.1 cleanup pending unchanged. B.2B not started.

## F09-B.1.3 — marker publication (22/10/2026)

- [x] RED on baseline `8512024`: 30 tracked tests fail; reviewer marker-fault
      oracle 0/2. Actual wx succeeded before empty/partial write or sync failed;
      readers incorrectly admitted acknowledged successors by filename alone.
- [x] Fix source `122ca20`: write/sync/close immutable preparation, then exclusive
      hard-link publication. Reader checks JSON fields against reservation plus
      source/public file identity. No overwrite, rename, delete, lease or repair.
- [x] Focused managed suites: 126/126 (41 new tests); external marker/review/
      adapted-release oracles 7/7. Real-file barriers, SIGKILL before/after publish,
      close/sync/link/read errors, collisions, stale finish, successor protection
      and post-publication lost ACK are covered. Body deadline tests stay green.
- [x] Four mutations killed and source restored. Initial ignore-sync survivor
      exposed a test assertion that itself blocked unsafe publication; assertion
      moved outside interceptor. Logs/results, including the survivor, remain in
      `artifacts/f09b13-20261022` (round 2 is 4/4 killed).
- [x] Focused HTTP/Nest/PG17 integration 1/1 at clean `122ca20`; report path
      `artifacts/f09b-http-integration-e9495410-dd06-4c4d-a87b-1bd819e342e3`.
      Two-process race: 2 calls/1 receipt, one dispatch. Both marker EIO cases:
      2 calls/1 receipt each; acknowledged rerun blocked, counters unchanged.
      Runtime LOGINs non-owner/NOBYPASSRLS; only upstream Auth/SDK/Storage are
      synthetic. Initial added fixture failed at LOGIN_RATE_LIMITED before
      dispatch; using its other authorized actor fixed setup without Auth changes.
- [x] Re-run: `node --test apps/api/test/evaluation-http-reservation.test.mjs
      apps/api/test/evaluation-http.test.mjs`; guarded `node --test
      apps/api/test/evaluation-http.database.test.mjs`. Build API and provision
      disposable runtime roles first. No UI changed; no new browser claim.
- [x] Source `122ca20`: typecheck, full `npm test`, build and format all exit 0.
      Fresh application counts: 457 API Vitest + 1,141 API Node + 544 Web = 2,142
      pass, fail/skip/cancelled 0. Vite retains its >500 kB chunk advisory.
      Logs and command/revision/exit records: `artifacts/f09b13-20261022/gates-122ca20`.
- [x] Fresh full `npm run test:database` at `122ca20`: exit 0, 479/479 pass in
      46 serial files, fail/skip/cancelled 0. This is separate from focused 1/1
      HTTP integration; `database-counts.json` records the summed runner counts.
- [x] F09-B.1.3_CODE_VERIFIED / LOCAL_INTEGRATION_VERIFIED for the scoped local
      protocol and synthetic runtime, not live quality or full F09 acceptance.
      Only the marked F09-B.1.3 container/volume were removed after labels and
      exclusive mount were checked; zero remain. Artifacts retained, F09-A.1
      cleanup blocker and SOP resources untouched.
- [ ] Windows/NTFS process-crash evidence only, not power-loss/network-share
      durability. Live/semantic/browser/cloud/Google/Thắng-machine pending and
      F09-A.1 RESOURCE_CLEANUP_BLOCKED unchanged. F09-B.2 not started.

## F09-B.1.2 — append-only plan ledger (22/10/2026)

- [x] Finding from review: a completed run's late `unlink` of `active.json` removed a
      successor's reservation and let a third run reserve. Corrects the incomplete
      "only the owner can release" claim of F09-B.1.1.
- [x] Fix: no shared mutable path. Reservation = exclusively created `lock.<n>.json`,
      ownership passes only by creating record n+1, release/unknown are markers for the
      owner's own record; nothing is deleted, renamed or overwritten.
- [x] RED: reviewer oracle 0/2 and an equivalent barrier oracle 0/2 on the previous
      ledger (2/2 now); tracked interleaving test failed with the reservation lost.
- [x] 30/30 reservation tests (7 new, deterministic barriers on a real filesystem, two
      real processes racing a takeover); 14 mutations killed (one needed a new test).
      Policy of F09-B.1.1 unchanged; faults at every transfer step keep the plan closed.
- [x] Nest/PG17 integration: one dispatch from two processes, 1 embedding + 1
      generation, 2 persisted calls, 1 receipt. Clean report:
      `artifacts/f09b-http-integration-eb4025aa-9fda-4216-9685-bcdfc6e8fb12`.
- [x] Gates at `d09dfbb`: typecheck, build, format exit 0; `npm test` exit 0, 457 +
      1,100 + 544 = 2,101; full `npm run test:database` exit 0, 479/479 in 46 files.
      Own container/volume removed.
- [ ] Local filesystem/host only, Windows exercised only; a live pid is not proof a
      provider stopped. Live evaluation, human review, browser, cloud/Google/
      Thắng-machine and RESOURCE_CLEANUP_BLOCKED (F09-A.1) unchanged; F09-B.2 not
      started.

## F09-B.1.1 — atomic plan reservation and cut-off bodies (22/10/2026)

- [x] Reviewer oracle 0/3 RED then 3/3. New suite RED observed before the fix
      (14 of 15 ledger/concurrency tests failed with a stub, a body read with no
      deadline hung, 5 runner/preflight body tests failed).
- [x] One generation per approved plan across processes: exclusive per-plan
      reservation, history rechecked under it, durable execution intent before the
      first POST. Real Nest/PG17 race of two OS processes: 1 dispatch, 1 embedding +
      1 generation SDK call, 2 persisted calls, 1 receipt, 1 intent.
- [x] Recovery policy: pre-dispatch refusal leaves no history; active holder blocks
      even an acknowledged rerun; completed run releases; crash or unknown outcome
      keeps the reservation until `--rerun-acknowledged` names it (no lease or
      timeout); takeover keeps superseded evidence; ledger I/O errors refuse.
- [x] A body cut after valid headers, or never finished, is `unknown_after_dispatch`
      (`before_response`/`response_body`), stops the run, no retry or re-login, rest
      NOT_ATTEMPTED; complete-but-malformed JSON stays a separate contract FAIL; no
      raw response, cookie or credential in errors or reports.
- [x] 23 new tests, transport suite 55/55; 16 mutations killed (3 first needed new
      tests or a seam). Positive controls: normal run, sequential rerun guard.
- [x] Gates at `7814f7d`: typecheck, build, format exit 0; `npm test` exit 0, 457 +
      1,093 + 544 = 2,094; `npm run test:database` exit 0, 479/479 in 46 files.
      Clean report: `artifacts/f09b-http-integration-cdd7b486-7b4c-437b-b476-3fd8ef68ef6c`.
      Own container/volume removed.
- [ ] Reservation is local to one filesystem/host; Windows only exercised; a live
      pid is not proof a provider stopped. Live evaluation, human review, browser,
      cloud/Google/Thắng-machine and RESOURCE_CLEANUP_BLOCKED (F09-A.1) unchanged;
      F09-B.2 not started.

## F09-B.1 — authenticated HTTP evaluation transport (22/10/2026)

- [x] Separate `--http-evaluation` mode; legacy `--execute`/`--transport http` still
      fail closed (evaluation 191/191 incl. the live fail-closed tests). No principal,
      workspace or role input; unknown or secret-looking flags rejected unechoed.
- [x] Loopback-only target and origin validated before credentials; redirects
      refused; credentials on stdin only (never argv/env/files); no secret or account
      mapping in any report, log or stdout (scanned in unit, CLI and integration).
- [x] Dry run (no secret, no network), read-only preflight, and a separate execute
      needing the exact plan hash. Execute without verified corpus provenance is
      BLOCKED with zero generation; the same plan cannot run twice silently.
- [x] No retry or silent re-login: timeout after dispatch stops the run as
      `unknown_after_dispatch`; 401/429 stop; partial runs keep checkpoints; existing
      report directories are refused.
- [x] Telemetry the HTTP surface cannot show stays `unknown`/`unobserved`; a case is
      at most REVIEW_REQUIRED, `qualityPasses` 0.
- [x] Real Nest/PG17 integration (1/1): manager and viewer preflight; cross-tenant,
      revoked, expired, wrong-Origin and forged-identity cases; verified execute of
      3 cases gives 3 embedding + 2 generation SDK calls = 5 persisted calls and 3
      receipts. Clean report: `artifacts/f09b-http-integration-d0a28420-a813-4119-98ce-4f19b06adeae`.
- [x] RED: suite failed to load (feature absent); HEAD's `runCases` sent a second
      request after an unknown outcome. The first integration run was GREEN (no
      integration RED). 17 unit and 3 integration mutations killed.
- [x] Gates at `6eafdeb`: typecheck, build, format exit 0; `npm test` exit 0, 457 +
      1,070 + 544 = 2,071; `npm run test:database` exit 0, 479/479 in 46 files;
      fail/skip/cancelled 0. Own container/volume removed.
- [ ] `LIVE_EVALUATION_PENDING`: no live model, real account, cloud or Google run.
      Corpus provenance and admission are unverified over HTTP, so a real execute is
      blocked until F09-B.2. `SEMANTIC_REVIEW_PENDING` and browser/cloud/Google/
      Thắng-machine pending are unchanged; RESOURCE_CLEANUP_BLOCKED (F09-A.1) remains.
      The frozen v3 manifest has 9 live cases, fewer than the 20 planned.

## F09-A.3 — one citation contract for runtime and evaluator (22/10/2026)

- [x] RED before the fix: unit spec 5 fail/49, evaluation 22 fail/191, HTTP/SSE
      3 fail/53 (nested marker returned 200 and SSE `done`), integration failed at
      F09A3-R01; reviewer oracle 1 pass/3 RED. Logs: `artifacts/f09a3-20261022/*red*.log`.
- [x] Production: pure `source-markers.ts` judges each source-like text whole
      (nested/grouped/zero/leading-zero/descriptive rejected); both document
      refusal paths reject any source-like text. Evaluator reads the same helper and
      adds `refusalMarkerFree`, `citationIdFormat`, `citationIdsUnique`.
- [x] GREEN at `d97c55d`: evaluation 191/191, assistant spec 49/49, helper 40/40,
      HTTP/SSE 53/53, reviewer oracles 4/4 and 4/4, integration 1/1. 24-row matrix
      over the real parse/validate/refusal path: plain, streamed and evaluator
      verdicts agree on every row. No parity claim beyond the rows listed.
- [x] Runtime evidence: real SDK transport (synthetic) nested marker gives 502
      `AI_UPSTREAM`, no answer, citation, receipt or leaked text; SSE gives only
      status events then `error`, never `delta`/`done`; malformed-marker refusal
      gives 502.
- [x] Nest/PG17 report boundary (one named field mutated): nested and duplicate
      citations on 7 grounded cases 26 PASS/7 FAIL/2 SKIP; refusal markers 32 PASS/
      1 FAIL/2 SKIP; positive controls 33 PASS; measurements identical, 37 SDK = 37
      persisted. Clean report:
      `artifacts/f09a-integration-e3ba65ef-d488-4c91-ac86-592dff2d8371`.
- [x] Gates at `d97c55d`: typecheck, build, format exit 0; `npm test` exit 0, 457 +
      1,015 + 544 = 2,016; guarded `npm run test:database` exit 0, 478/478 in 45
      files, fail/skip/cancelled 0. Seven mutations all killed.
- [x] Intentional behavior change: non-stream refusal with a malformed source-like
      text is now 502 `unanswerable_with_citations` (was a fixed refusal 200),
      matching streaming. Own container/volume removed.
- [ ] RESOURCE_CLEANUP_BLOCKED for F09-A.1 resources remains. No UI/browser,
      live model, human semantic, cloud, Google or Thắng-machine acceptance is
      claimed. F09-B not started; whole F09 incomplete.

## F09-A.2 — grounded RAG marker consistency (22/10/2026)

- [x] RED before the fix: 152 evaluation tests, 20 fail (131 earlier tests stayed
      green); independent oracle 1 pass/3 RED (no markers, `[S999]`, valid plus
      malformed `[S1, S999]`). Logs: `artifacts/f09a2-20261022/*red*.log`.
- [x] GREEN at `c487362`: evaluation self-tests 153/153 (22 new), oracle 4/4. Of
      the 22, 20 were RED, one was a green regression control and one was added to
      kill surviving mutation M5. Production parity test: 14 answers, same verdict
      as compiled `AssistantService.validateCitations`.
- [x] Machine checks `markerSyntax`, `markerPresence`, `markerCitationSet` and
      dimension `markerConsistency` for grounded scenarios; refusals unchanged.
      Broken markers are FAIL, not semantic pending. Positive controls: repeated
      marker, different source order, ordinary brackets.
- [x] Nest/PG17 integration on an owned container: 1/1; normal 33 PASS/2 SKIP;
      answer-only marker mutations of 7 real grounded observations give 26 PASS/
      7 FAIL/2 SKIP (remove markers, `[S999]`, valid plus malformed) or 33 PASS
      (repeat valid marker, ordinary brackets). Measurements identical, 37 SDK =
      37 persisted calls. Clean-tree report:
      `artifacts/f09a-integration-f9bf239b-d105-41e2-b607-78d28dd39e12`.
- [x] Gates on a tree identical to `c487362`: `npm run typecheck`, `npm run build`,
      `npm run format:check` exit 0; `npm test` exit 0, 405 API Vitest + 974 API
      Node + 544 Web = 1,923; guarded `npm run test:database` exit 0, 478/478 in
      45 files. fail/skip/cancelled 0. Records: `artifacts/f09a2-20261022/gates`.
- [x] No production service, prompt, model, ranking, chunking, migration, grant,
      RLS, corpus/gold, manifest or dependency changed. Own container/volume
      removed; F09-A.1 resources and SOP containers untouched.
- [x] Superseded by F09-A.3: the nested `[S[S1]` mismatch, refusal markers and
      duplicate returned citation IDs listed here as open are closed there.
- [ ] RESOURCE_CLEANUP_BLOCKED for F09-A.1 container/volume/credential file remains.
- [ ] No UI/browser acceptance, live model evaluation or human semantic review is
      claimed; cloud, Google and Thắng-machine pending are unchanged. F09-B is
      not started and whole F09 is not complete.

## F09-A.1 — fail-closed required response content (22/10/2026)

- [x] RED before implementation: 78 managed cases ran, 24 pass/54 fail;
      reviewer oracle 3/3 failed. Missing required output yielded false PASS;
      malformed arrays/fields could throw. Real Nest/PG17 negative report
      asserted 3 FAIL but observed 0. Logs: `artifacts/f09a1-20261022/*red.log`.
- [x] GREEN at source `89d7276`: new regressions 78/78, evaluation self-tests
      131/131, independent oracle 3/3, runtime integration 1/1; no skips/cancels.
      A first interim GREEN run had one positive-refusal fixture failure because
      its expected NO_RELEVANT_EVIDENCE reason was absent; the observation was
      completed without changing any assertion, gold or production behavior.
- [x] Normal integration remains 33 contract PASS/2 references SKIP. Removing
      only three required outputs from those observations produces 30 PASS/
      3 FAIL/2 SKIP; all measurement fields, including 37 SDK calls and 37
      persisted calls, remain identical. Focused retained report:
      `artifacts/f09a-integration-893b7004-b90d-41d0-b0a3-9391315728c5`.
- [x] Re-run after API build: `node --test --test-name-pattern=F09-A.1
      apps/api/test/evaluation.test.mjs`; full `node --test
      apps/api/test/evaluation.test.mjs`; guarded `node --test
      apps/api/test/evaluation-runtime.database.test.mjs`.
- [x] Source `89d7276`: `npm run typecheck`, `npm test` and `npm run build`
      each exit 0. Full application tests: API Vitest 405/405 + API Node 952/952
      + Web 544/544 = 1,901 pass, fail/skip/cancelled 0. Build retains the Vite
      >500 kB chunk advisory. Command/revision/exit records and logs:
      `artifacts/f09a1-20261022/gates-89d7276`.
- [x] `npm run format:check` at `89d7276` exit 0; no dependency, production
      source, manifest/corpus/gold, schema, grants or RLS changes.
- [x] Guarded `npm run test:database` at `89d7276` exit 0: 478/478 tests in
      45 serial files, fail/skip/cancelled 0. Its evaluation report is retained
      under `artifacts/f09a-integration-c103dcb5-077f-4ad2-b949-682e1b7df017`,
      including the separate negative-output report. All five final gates
      passed sequentially; these are new F09-A.1 counts, not F09-A history.
- [x] F09-A.1_CODE_VERIFIED for evaluator/runtime contract scope. Final docs-only
      commits preserve the verified source; rerunning the managed runtime test
      on clean HEAD records its exact Git SHA/dirty state in the retained report.
- [x] Clean-tree runtime test at `77419b9`: 1/1, normal 33 PASS/2 reference
      SKIP, negative 30 PASS/3 FAIL/2 SKIP, 37 SDK = 37 persisted calls, secret
      scan PASS. Report/negative report are in
      `artifacts/f09a-integration-eec4c0a3-9410-48a0-8366-ffffc29d26ec`.
- [ ] RESOURCE_CLEANUP_BLOCKED: automatic policy review rejected cleanup before
      execution ("blocked by policy"). Read-only inspection confirms the marked
      F09-A.1 container/volume and ignored disposable credential file remain;
      names/labels are recorded in PROJECT-CONTEXT. No workaround was attempted.
- [ ] No new UI/browser acceptance or human semantic review is claimed.
      LIVE_EVALUATION_BLOCKED, SEMANTIC_REVIEW_PENDING and previous browser/
      cloud/Google/remote-machine pending remain unchanged. F09-B not started.

## F09-A — authenticated evaluation readiness (21–22/10/2026)

- [x] Versioned local-v1/local-v2 manifest, unchanged historical v3/E01–E24 and
      rag-eval-v2 corpus/gold. Run/report/manifest/corpus/output/source-page binding;
      reviewer and semantic decisions are blank. Exact source pinning supports
      Git LF/CRLF conversion without accepting other edits.
- [x] Real Nest HTTP with database-backed sessions/CSRF/membership, separate
      non-owner/NOBYPASSRLS business/Auth LOGINs, production RLS/retrieval,
      wrappers, admission, receipts, Quiz/Flashcards and telemetry. Only Auth
      upstream/SDK/Storage boundaries are synthetic. Maintenance is seed/assertion/
      observer/cleanup only. No public debug endpoint, new grant or migration.
- [x] Clean-source run at `97f8f82`: 33 executable contract cases PASS, 0 FAIL/
      BLOCKED/NOT_ATTEMPTED, 2 reference-only cases SKIP. Run ID
      `396385d1-bc5e-4ba5-8f1d-a15edc3a6cbb`, retained under
      `artifacts/f09a-source-97f8f82`. SDK calls 37 = persisted calls 37;
      declared bounded batches have 10/10/10/3 cases and 9/20/6/2 calls.
      Local contracts do not count toward twenty live quality cases.
- [x] Cases F09A-001–033 (F09A-105 replaces retired F09A-005 in v2) cover scope,
      authentication/owner/role isolation, actual evidence/citation context,
      structured Quiz/Flashcards and malformed/forged output, injection presence,
      provider/admission failures, zero/missing/partial usage, no-AI save/practice,
      idempotency and privacy. F09A-034/035 are unexecuted browser/live references.
- [x] Focused self-tests 53/53 and runtime HTTP/PG17 suite 1/1. RED→GREEN observed
      for missing-target mode (unsupported exit 1 → explicit BLOCKED/3), altered
      human-pack source pages (not rejected → binding rejection), and unchanged
      LF/CRLF source checkout (rejected → accepted, other edits still rejected).
- [x] Additional RED→GREEN: no observed token sample is null rather than false
      zero (`8dc5b06`); injection's actual SDK question matches the frozen codename
      oracle (`6c32842`). The mismatch initially failed and retained its report;
      the corrected focused Nest/PG17 suite passes 1/1 with 33 contract PASS and
      2 reference SKIP. Human readiness output includes the synthetic question,
      while the private sentinel remains excluded.
- [x] Initial failures are preserved: fixture setup rate limit/invalid SQL probes/
      state/parameter/syntax errors; local-v1 last run 32 PASS/1 FAIL/2 SKIP from
      an incorrect HTTP-400 protocol oracle for foreign-document access. V2 uses
      new F09A-105 and the existing source-defined 404; semantic gold unchanged.
      Nothing was regraded or deleted to hide those runs.
- [x] Existing live runner remains blocked before DB/Storage/provider. Explicit
      readiness probe exited 3, LIVE_EVALUATION_AUTH_REQUIRED, one NOT_ATTEMPTED
      and zero provider calls; report at `artifacts/f09a-live-readiness-97f8f82-exit`.
- [x] Re-run commands: `node --test apps/api/test/evaluation.test.mjs`;
      guarded `node --test apps/api/test/evaluation-runtime.database.test.mjs`;
      `npm run eval:f09a:local -- --output artifacts/<new-directory>` after
      disposable PG17/runtime-role preparation. See evaluation-plan for exact
      modes, selection/dependency behavior and report interpretation.
- [x] Final-source application gates at `6c32842`: `npm run typecheck` exit 0;
      `npm test` exit 0, API Vitest 405/405 + API Node 874/874 + Web 544/544 =
      1,823 passed, 0 fail/skip/cancelled. Logs and command/revision/exit records
      are retained in `artifacts/f09a-gates-6c32842`. Earlier gate logs are
      retained too; the `8dc5b06` run stopped at a format failure caused by an
      in-flight test edit, which was formatted before this final run.
- [x] `npm run build` and `npm run format:check` at `6c32842` both exit 0;
      the existing Vite >500 kB chunk advisory remains, without changing build
      limits or dependencies.
- [x] Guarded `npm run test:database` at `6c32842` exit 0: 45 serial files,
      478/478 pass, fail/skip/cancelled 0. This includes the formal F09-A
      integration test (1/1), whose retained report is
      `artifacts/f09a-integration-00a52b36-9495-4a61-ac64-71067dc00cde` with
      33 contract PASS, 0 FAIL/BLOCKED/NOT_ATTEMPTED, 2 references SKIP.
      SDK attempts and persisted telemetry match. Counts/commands/revisions/
      exit codes are in `artifacts/f09a-gates-6c32842/results.json` and
      `database-counts.json`; these are fresh results, not earlier F08 counts.
- [x] `F09-A_CODE_VERIFIED` and `LOCAL_INTEGRATION_VERIFIED` apply to the
      guarded synthetic runtime contract scope above. A final clean-tree rerun
      can be reproduced with `npm run eval:f09a:local -- --output
      artifacts/<new-final-run>`; report metadata records the exact HEAD/dirty
      state. Later documentation-only commits do not change verified source.
- [ ] Eleven synthetic human-readiness templates have output and source pages,
      rubric and exact response binding, but no named reviewer/semantic decision.
      They are not live educational-quality evidence.
- [ ] LIVE_EVALUATION_BLOCKED and SEMANTIC_REVIEW_PENDING. No UI changed and no
      browser automation is exposed; pending whole F05/F06/F08 browser acceptance,
      cloud/Google live/Thắng's machine remain unchanged. F09/F10 not accepted.

## F06.2 — synchronized dashboard refresh

The toolbar refresh uses one generation across overview, the selected cost
breakdown page and an open provider-call detail. It preserves the active
filters and cost view, hides previous-generation data while reads are pending,
and ignores responses that settle late. Breakdown retry remains local to cost;
moving between operations pages does not fetch cost again.

The dashboard regression was red on the previous implementation: after
clicking refresh, overview was requested twice but the cost breakdown only
once; both the new 23-call KPI and the stale 22-call/USD 22 row were asserted.
The fixed suite passes 18/18. It also checks refreshed pricing-version page 2,
late-response rejection, cost-only retry, partial-read error state, principal
switch, open detail refresh and no cost request on ordinary operation-page
navigation.

Fresh gates: `npm run typecheck`, `npm test`, `npm run build`, and
`npm run format:check` exited 0. Application tests passed API Vitest 384/384,
API Node 855/855, Web 461/461 (1,700 total). No database gate was rerun because
this correction changes only frontend request lifecycle, not API/SQL/schema or
permissions. Browser tooling was unavailable; desktop/mobile acceptance stays
`BROWSER_ACCEPTANCE_PENDING`. No browser pass is inferred from component tests.

## F06.1 — dashboard aggregation and boundary corrections

F06.1 begins at `084c308` and leaves migrations 019–021 and all runtime
capabilities unchanged. It adds `GET /api/admin/ai-usage/cost-breakdown`: the
default page groups exact estimated costs by currency across every stored
pricing version; selecting one currency pages its version rows. Each view
returns `totalGroups`, `totalEstimatedCalls`, pagination, and exact decimal
strings. Version detail repeats the full exact currency total across every
page. Currency totals are never combined. The overview retains complete
estimated/unknown call counts and its model table explicitly says top 20 with
omitted model, call, known-token and token-sample coverage.

Provider-call detail accepts the validated overview `model` filter and applies
it in the same scoped CTE for count and items; clearing the overview model still
shows every unexpired call for that operation. Both overview and breakdown
accept only `0001-01-01` through `9999-12-30`. PostgreSQL derives the exclusive
upper date (`to + 1 day`) after validation, avoiding ISO extended-year slicing
and the unsupported year 10000.

RED evidence: new query regressions first failed for unsupported year edges,
the valid model detail query and the missing cost-breakdown parser. The runtime
HTTP test against the pre-change API build returned 500 for year 0000 instead
of 400. GREEN evidence is recorded below after final gates. The PG17 HTTP
fixture uses separate non-owner/NOBYPASSRLS business and Auth LOGINs, real Nest
routes and RLS; only external Auth/provider boundaries are synthetic. It seeds
0/1/20/21/22 pricing groups, zero and unknown costs, multiple currencies,
23 models, a 21-call selected model plus another model, an expired selected
call, and a matching other-tenant cost sentinel. It checks cost totals across
pages, top-20 coverage, filtered/unfiltered detail, malformed query rejection,
and manager/member/viewer/revoked access.

Browser tool inventory in this session exposed no browser/CUA automation, so
desktop/mobile layout and interaction remain `BROWSER_ACCEPTANCE_PENDING`;
React/HTTP tests are not browser evidence. F05 browser acceptance, cloud
rollout, Google live and Thắng's machine keep their previous pending status.
No migration, cloud/provider call, push or deployment occurred.

Fresh F06.1 verification: typecheck, build, format, and guarded PG17 database
gate exited 0; `npm test` exited 0 with API Vitest 384/384 (27 files), API
Node 855/855, and Web 454/454 (29 files), 1,693 total. Database tests passed
470/470 across 39 serial files, with 0 failed, skipped, or cancelled. Focused
query and dashboard tests passed 43/43 and 11/11. The supported-date API
regressions, bounded cost cohorts, top-20 model coverage and filtered detail
were included in those runs. Browser acceptance was unavailable and remains
pending; no browser pass is inferred from these tests.
Re-run with the command block above against a marked disposable PostgreSQL 17
target distinct from runtime/cloud URLs; do not run against Supabase.

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

Cleanup: API fixture/Vite của lượt này đã dừng. Database và ba LOGIN role của
fixture browser bị ngắt được xóa sau khi xác nhận marker, membership, ownership,
thứ tự tạo và không còn session. Compose PG17 được tái sử dụng từ trước, còn chạy.
Catalog còn các database/role có marker test cũ nhưng không thể quy chính xác cho
lượt này; chúng không bị xóa hàng loạt.

## F03.1 token consistency and signed PDF URL review (20/10/2026)

- Token usage RED: a response reporting prompt=10, candidates=100, total=20
  had previously been accepted as complete and priced. The normalizer now rejects
  totals below known components, conflicting complete breakdowns, cached count
  above prompt, and unsafe integer sums. Missing fields remain distinct from zero.
  Tool-use prompt tokens are not priced as generated output; ambiguous breakdowns
  remain partial/unknown. This follows the installed SDK's usage fields and the
  official Gemini usage metadata contract.
- PDF URL RED: the source preview retained a 60-second signed URL for the
  “open in new tab” action. The action now opens a tab synchronously, requests a
  newly authorized URL, then replaces the blank tab. If popup creation is blocked,
  the UI offers the new URL as a short-lived explicit link. Source/session changes
  abort the pending operation. Fake-clock test advances beyond 60 seconds and
  verifies two backend signing requests; the old URL is not reused.
- PG17 integration: real Nest/Auth/session/membership, business and Auth LOGIN
  pools, RLS, usage wrappers/persistence, receipts, and feedback; synthetic
  Auth upstream, PDF/Storage, SDK transport and provider responses. The test
  compares persisted operation/call rows with fixture call counters, verifies
  query-embedding/generation/batched indexing/per-page OCR/summary calls, and
  confirms workspace SQL makes zero provider calls. RAG citation and receipt
  ownership are checked. Controlled HTTP timeout and client abort after the
  first SSE delta each produce their own outcome with one provider attempt.
  Usage/log persistence excludes prompt/document/secret sentinels; telemetry
  failure does not replay providers or alter a known answer.
- Shared-corpus diagnostic: one bounded PG17 run used the same DB, role, physical
  index and corpus over 12 reset/reinsert cycles; 36 positive reads and 24
  lifecycle-negative reads matched the exact eligibility oracle. Historical
  false-empty was not reproduced and remains INCONCLUSIVE; no ANN/ranking/scan
  policy change was made.
- ACL fixture correction: the telemetry-failure test now snapshots table and
  column ACLs, revokes the exact migration-019 INSERT columns, and restores those
  column grants in `finally`. A deliberate table-wide INSERT restore mutation
  failed the ACL snapshot assertion. After restore, the exact ACL snapshot and
  business/Auth capability checks match baseline. Negative capability mutations
  also prove a valid baseline, the specific catalog/visibility mutation, and a
  valid capability after cleanup.
- Latest gates: typecheck exit 0; npm test exit 0 (API Vitest 329, API Node 847,
  web 384; total 1,560); build exit 0; format:check exit 0; test:database exit 0
  on disposable PostgreSQL 17 (448 pass, 30 suites, 0 fail/skip/cancelled).
- Browser: BLOCKED in this session because no browser/CUA automation was exposed
  and the earlier isolated Chrome launch was rejected by tool policy. No HTTP
  test is counted as browser evidence. F03_LOCAL_ACCEPTED is not claimed.
- No cloud writes, external provider calls, push, or deployment occurred. F04/F06
  remain unimplemented; Google live, cloud rollout, Auth extended and Thang's
  machine remain pending.

## F04 durable AI admission — local implementation evidence (20/10/2026)

F03 browser status remains **F03_CODE_VERIFIED + F03_BROWSER_ACCEPTANCE_PENDING**.
The browser acceptance gate is not substituted by the PG17 integration run.

F04 source adds migration `020_ai_admission.sql`, runtime capability contract v20,
`AiAdmissionService`, provider-wrapper permits, and guarded local rollback
`npm run f04:rollback-020`. No cloud migration or provider call occurred.

Policy defaults: 30 logical operations per verified user per database day in
`Asia/Ho_Chi_Minh` (not reset by workspace changes); 2 active operations per user;
5 per workspace; provider-call maxima are 1 general, 2 document question, 17
summary, and 150 document index. Index maximum is derived from 25 OCR pages plus
125 embedding batches for 2,000 chunks at batch size 16. Defaults are finite;
missing values use defaults, zero denies the affected scope, invalid/extreme
values fail startup, and admission cannot be disabled. These are operation,
concurrency and fan-out limits, not a USD cap.

Each operation reserves a daily unit before work; errors, cancellation and unknown
provider outcomes do not refund it. Transactions finish before SDK/Storage/OCR work.
Every SDK attempt checks a persisted permit. A bounded 120-second lease only covers
work that has not dispatched; stale undispatched work can expire. A dispatched
attempt remains concurrency-active as `unknown` unless upstream stop is confirmed;
lease expiry does not release it. This deliberately favors preventing an over-cap
run over automatic recovery and may leave an operation requiring investigation.
F03 telemetry may be missing and is not consulted for admission.

New focused PG17 evidence: `node --test apps/api/test/runtime-rls.database.test.mjs`
passed 14/14 after building. The test launches two Nest API instances with separate
business/Auth LOGIN non-owner pools and shares one disposable database. It holds
five provider calls across instances and verifies the sixth receives 429 before
SSE headers/provider dispatch. SDK counters match persisted operation/call rows;
workspace SQL has zero SDK calls; timeout and client cancellation record one
attempt and keep admission state `unknown`. The Nest/auth/RLS/database services,
admission, usage persistence, and provider wrappers are real. Supabase Auth adapter,
SDK transport/responses, Storage and PDF bytes are synthetic. No browser was run.

Final gates on the source revision under test: `npm run typecheck` exit 0;
`npm test` exit 0 (API Vitest 332, API Node 850, web 384; 1,566 total);
`npm run build` exit 0; `npm run format:check` exit 0; and `npm run test:database`
exit 0 on guarded PostgreSQL 17.11 (462 pass, 0 fail/skip/cancelled). The test
database used `TEST_DATABASE_URL` on a labeled loopback disposable; `DATABASE_URL`
was empty. During final verification, legacy fixtures were corrected to count all
20 source migrations in full-chain tests, use an existing `examate_auth` role for
the SET ROLE denial assertion, and supply the OCR fan-out estimate in ingestion
fakes. The final complete chain passed after those fixture-only corrections.
The final regression also verifies question fan-out is durably planned during
initial reservation before handler work or SSE headers; a zero cap is rejected
before provider dispatch.

F04 code revision `d716c13`: **F04_IMPLEMENTED + AUTOMATED_GATES_PASS + BROWSER_ACCEPTANCE_PENDING**.
The browser/CUA tool inventory for this session was empty; therefore desktop and
375px admission UX remains unverified and this is not F04_LOCAL_ACCEPTED. HTTP/DB
tests are not browser evidence. Run the five commands above in order with the
guarded PG17 disposable to reproduce the automated gates.

## F04.1 permit-wait lifecycle and admission error preservation (20/10/2026)

RED was reproduced before implementation. Five child processes ran with
`--unhandled-rejections=strict`, an 80ms synthetic permit wait, a 10ms deadline
(or 10ms stream abort), and a fake SDK transport. Generation, stream timeout,
stream abort, embedding and OCR each exited 1 from an unhandled timeout rejection
before their caller catch could complete. Four wrapper denial assertions also
failed because `AI_FANOUT_LIMIT`/membership denial was converted into upstream or
OCR provider errors. No Google/provider request was used.

The implementation uses a fulfilled deadline/cancel signal while authorization
is pending and awaits permit completion. A permit granted after timeout/cancel is
discarded before SDK dispatch; it creates no provider-attempt telemetry. A
dispatched SDK promise is immediately settled to a response/error value before
racing the deadline, preventing late rejection from becoming unhandled. Known
admission/auth codes retain safe status/code through generation, stream,
embedding, OCR, retrieval and ingestion; unexpected permit failures are mapped
to `AI_ADMISSION_UNAVAILABLE`. The controller keeps JSON status/body and emits a
terminal SSE error event after headers. F04 quota, daily usage, concurrency,
fan-out and migration 020 were not changed.

New focused GREEN evidence: 131/131 Vitest tests across Gemini generation,
embedding, OCR, AiUsage, AssistantService and AssistantController; five strict
subprocess cases pass with zero SDK calls, one pre-dispatch discard and zero
provider finishes; the real PG17 non-owner admission/usage database suite passed
11/11, including two backend PIDs and lost permit COMMIT acknowledgement; the
HTTP ingestion denial regression passed in the 4/4 role suite. JSON/SSE controller
tests preserve the safe admission code, and telemetry assertions distinguish
operation rejection from provider failure. The new Node regression test is
registered in the normal API test command.

On F04.1 code commit `fed6cd8`, all final automated gates exited 0:
`npm run typecheck`; `npm test` (API Vitest 339/339, API Node 855/855, web
384/384; 1,578 total); `npm run build`; `npm run format:check`; and
`npm run test:database` on guarded PostgreSQL 17 (462/462, 0 failed, skipped or
cancelled). The five strict child-process regressions and focused HTTP/DB denial
coverage are included in these gates; focused results are documented above.

Browser desktop/mobile cancellation and draft UX was not checked because this
session exposed no browser/CUA capability. This remains browser acceptance
pending; no HTTP result is represented as browser evidence. F04.1 code and
automated verification are green, but this is not full F04 local acceptance.
No cloud write, paid provider call, push or deployment occurred.

## F05 Documents search vertical slice — 20/10/2026

The Documents UI now calls the additive `GET /api/documents/search` contract:
`q`, `course=all|unassigned|<UUID>`, `storage_status`,
`processing_status`, `sort`, `direction`, `page`, and `pageSize`. Page defaults
to 1, size to 20, maximum size is 50, and page is bounded to 1,000,000. Invalid,
repeated, oversized and non-allowlisted values receive 400. Search is trimmed,
case/diacritic-insensitive (including Vietnamese without tone and `đ`/`d`), and
punctuation folds to separators; `%`, `_`, quote and backslash do not become SQL
wildcards or query syntax. Metadata search includes document name and course
name/code/slug. A single workspace-authorized SQL statement applies explicit
workspace and filter predicates to both page and count. Out-of-range pages keep
the matching total and stable sorting adds the document ID as a tie-breaker.
Response metadata excludes PDF text, chunks, vectors and storage keys.

The legacy full-array `GET /api/documents` remains for Assistant source loading
and sidebar search. A route deep link outside the active Documents page uses a
scoped `GET /api/documents/:id` and displays a separate focused card; a target
already on the page is not duplicated. Sidebar result links use the same route
behavior. The focused card does not change page items or totals, and the
Documents page is not the Assistant's complete source universe. The sidebar
still loads all document metadata, and search/pagination for other modules is
pending. No migration or AI provider call was added.

RED evidence: before the route existed, the real Nest/PG17 non-owner LOGIN
regression received 400 from the dynamic document-ID route where it expected a
200 search page. After the additive route and DTO/query implementation, the
focused Documents HTTP/DB suite passed 4/4. The disposable contains 225 synthetic
workspace-A documents and 3 workspace-B documents; it checks tenant-scoped
counts/results, metadata-only output, page 2 and out-of-range page totals,
Vietnamese folding, literal punctuation, course metadata, stable ties, combined
filters, malformed/repeated values, foreign-course non-disclosure, membership
revocation and zero provider calls. PostgreSQL accepted an `EXPLAIN (FORMAT JSON)`
for the exact captured parameterized search statement; no `ANALYZE` or claim of
performance improvement is made.

Focused FE regression: `DocumentsSearch.test.tsx`, `DocumentsPermissions.test.tsx`
and `DocumentsReconciliation.test.tsx` passed 48 tests. It covers server query
controls/page reset, debounce, stale query and principal responses, a separate
read-error retry (GET only), empty-library versus filtered no-match, and existing
role/lifecycle permissions. A list read failure is not shown as an empty result;
stale query data is hidden while the new query resolves. Upload/assign/index/
re-index/delete trigger reconciliation without replaying writes. Upload course
selection remains separate from list filtering.

Final source revision: `9981912` (Documents code/tests); the documentation
checkpoint is committed separately. Gates on this revision all exited 0:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; API Vitest 339/339, API Node 855/855, Web 389/389
  (1,583 total; 0 failed, skipped or cancelled).
- `npm run build` — exit 0 (Nest and Vite production build).
- `npm run format:check` — exit 0.
- `npm run test:database` — exit 0 on the labeled loopback PostgreSQL 17
  disposable; 463/463 passed, 0 failed, skipped or cancelled. The new
  Documents HTTP/DB suite is 4/4 on a non-owner business LOGIN. Its `EXPLAIN`
  was structural (`FORMAT JSON`, without `ANALYZE`).

The first full DB attempt caught a fixture arithmetic error: page 99 with 225
rows and page size 2 is still in range. The regression now requests page 114;
the focused Documents suite and the full DB gate then passed. This was a test
expectation correction, not a product defect.

No browser automation capability was exposed in this session. Desktop
1440px/mobile 375px layout, keyboard interaction, network and browser console
remain pending and are not inferred from React/HTTP tests. No cloud write,
provider call, push or deployment occurred. Other modules and bounded sidebar
search remain pending; this is not whole-app F05 acceptance.

## F05.1 — query validation and scoped deep-link focus (20/10/2026)

Finding A was reproduced before the fix through the real Nest/Express HTTP
parser: `GET /api/documents/search?q=first&q=second` returned 500 because the
DTO's conditional validator skipped non-string values and the service called
`trim()`. The validator now skips only the content rule for the contract's
empty string; string, maximum length and content checks remain active, while
arrays and objects fail as 400 before `DocumentsService.search`. PG17/HTTP
regressions cover repeated non-empty and empty keys, bracket array/object
syntax, overlength input, special characters, Vietnamese text, missing/empty/
whitespace input, safe error content, authenticated membership, and a service
spy proving malformed requests make no search call. No search SQL or migration
changed.

Finding B was reproduced before the fix: a route ID outside page one did not
appear until manually paging. `PageSections` now passes the route ID to
`DocumentsPanel`. The panel uses the current page if it already contains the
target; otherwise it issues one abortable, scoped `GET /api/documents/:id` and
renders a separate focused card. This never changes the current page's items or
total and never scans all pages. Direct route and sidebar-link regressions use
40 synthetic documents. FE cases also cover out-of-filter and in-page targets,
A-to-B response ordering, principal change with the same target ID, safe 403/
404, read-only retry, viewer controls, and assign/re-index/delete on the focused
card. Existing Assistant full-array sources and role/lifecycle handlers remain
unchanged.

RED/GREEN evidence: before the DTO correction, the actual HTTP regression
failed with 500 instead of 400; after it, the focused Documents HTTP/PG17 suite
passed 4/4 and the service-call spy stayed at zero for malformed queries.
Before the focus wiring, the direct-route/sidebar integration regressions
failed because no linked document was rendered; after it, the focused
`DocumentsSearch.test.tsx` plus `App.test.tsx` run passed 138/138. These are
automated tests, not browser evidence.

Browser automation was checked in the current tool inventory and is not
available. Therefore actual desktop 1440px/mobile 375px rendering, focus/scroll,
keyboard navigation, browser network/console, and visual confirmation of the
sidebar route remain pending. No browser or cloud acceptance is claimed. The
final gate run on the F05.1 source revision exited 0 throughout:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; API Vitest 339/339, API Node 855/855, Web 403/403
  (1,597 total; 0 failed, skipped or cancelled).
- `npm run build` — exit 0.
- `npm run format:check` — exit 0.
- `npm run test:database` — exit 0 on the labeled PG17 disposable; 463/463
  across 32 serial suite invocations, 0 failed, skipped or cancelled.

Focused new/relevant evidence: `DocumentsSearch.test.tsx` plus `App.test.tsx`
passed 140/140; the Nest/PG17 non-owner Documents HTTP suite passed 4/4,
including the real-parser malformed-query cases. Browser acceptance remains
pending as stated above. These are local regression results; they do not accept
whole-app F05, other-module search, cloud rollout or live provider behavior.

## F05.2 — bounded workspace search in the sidebar (20/10/2026)

The sidebar now calls the typed `GET /api/search` endpoint rather than loading
the six complete legacy lists. Its contract trims `q` (2–120 characters,
including at least one letter or number), accepts `kind=all|course|exam|plan|
document|expense|task`, `sort=kind|label`, `direction=asc|desc`, pages 1–1,000,000,
and page sizes 1–50 (default 12). Invalid, repeated or non-scalar parameters
return 400 before search SQL. The response is `{ items, page, pageSize, total,
totalPages }`; out-of-range pages retain the filtered total.

The Nest service uses the verified principal, rechecks membership in a short
business workspace transaction, and executes one tenant-scoped PostgreSQL
statement for all six kinds, count and page under the same statement snapshot.
Joins retain workspace predicates and the query returns only sidebar metadata;
it does not call AI, Storage or OCR. Search text keeps the existing Vietnamese
case/diacritic/`đ` folding and punctuation-as-separator behavior. The UI uses a
280 ms debounce, server filters, stable sort, paging, a read-only retry and
abort plus revision/key checks for query/principal changes. Routes are built
from the kind allowlist; course routes use validated slugs and other routes use
validated IDs. Documents outside the current Documents page continue through
the F05.1 scoped focus lookup; Assistant source loading remains independent.

RED/GREEN and mutation evidence: the frontend regression first observed the
old hook invoking the six full-list APIs; it now asserts those calls stay at
zero and the paged endpoint receives the selected controls. A tenant-predicate
mutation failed the SQL-scope unit assertion (one branch lost its explicit
workspace condition); restoring the predicate returned the test to green. A
stale-response mutation failed when an older response replaced the latest
result; restoring the revision/abort guard passed it. The HTTP/PG17 test runs
through Nest's real query parser and non-owner business/Auth LOGIN fixture; it
checks repeated and array/object parameters, invalid allowlists, Unicode and
punctuation, six kinds, roles, absent/revoked membership, exact tenant totals,
stable order, metadata-only response, and zero provider calls. A dedicated
test-only mutation of repeated-query validation could not be run because the
environment blocked that mutation-test command; the live-HTTP regression for
repeated keys remains in the standard database runner and passes.

The tested F05.2 source is committed as API `6d21b67` and FE `74a39c8`, based
on `b6cd749`. The new API/FE and quality gates ran as follows:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; API Vitest 340/340, API Node 855/855, Web 409/409
  (1,604 total; 0 failed, skipped or cancelled).
- `npm run build` — exit 0 (Nest and Vite production builds).
- `npm run format:check` — exit 0 after formatting only the changed source and
  test files flagged by the first check.
- `npm run test:database` — exit 0 against the labeled loopback PG17.11
  disposable; the runner completed all serial suites with no failing command.
  The new `/api/search` Nest/PG17 suite also ran separately: 1/1 passed,
  0 failed/skipped/cancelled. The database runner does not emit one aggregate
  test count, so no aggregate count is inferred here.

No browser automation tool was exposed in the current session. Desktop
1440px/mobile 375px, keyboard/menu behavior, visual routing, console/network
and overflow therefore remain `BROWSER_ACCEPTANCE_PENDING`; the React and HTTP
tests are not browser evidence. This verifies the six-kind sidebar code path,
not search/filter/sort/pagination on the other module screens and not whole-app
F05. No cloud writes, external provider calls, push or deployment occurred.
The repeated-query mutation was blocked as noted above; source/gates and its
HTTP regression are verified, but that particular mutation is not claimed.

## F05.2.1 — sidebar pagination reset and unsupported folded query (20/10/2026)

Finding A came from page state living separately from the effective search key:
after page 2, a changed query or principal could request page 2 again. The hook
now scopes page state to the trimmed query plus verified user/workspace/role and
derives page 1 immediately whenever that scope changes. Existing abort and
revision/key guards still discard late responses; filter/sort actions still
reset page, and server out-of-range pages still preserve the true total.

Finding B came from `foldSearchText("你好")` producing an empty needle and the
service constructing a match-all pattern. The service now checks the fold before
opening the business workspace transaction and returns 400 with the stable safe
code `SEARCH_QUERY_UNSUPPORTED`. The sidebar shows a dedicated unsupported-query
status; it does not display a zero-result success or generic network failure.
The Documents query helper/semantics are unchanged. Existing HTTP tests continue
to cover Vietnamese accents, `đ`/`d`, case, filename and punctuation behavior.

RED/GREEN evidence:

- Before the implementation, the new FE regressions failed because changed
  query, cleared/re-entered query and principal switch each reused page 2; the
  out-of-order response case also exposed the old page competing with the new
  query. After the scoped page-state change, all pass. The related filter reset
  test still asserts a request at page 1.
- Before the implementation, the service regression entered the workspace
  transaction for a fold-empty query. Afterward it returns the safe 400 before
  transaction or search SQL. The Nest HTTP/PG17 regression sends Chinese and
  Cyrillic through the real query parser and verifies 400, no reflected query,
  and no new business transaction. Existing repeated/array/object and malformed
  pagination HTTP checks remain in this same fixture.
- Focused FE workspace + Documents search tests: 25/25; service tests: 2/2;
  Nest/PG17 workspace-search HTTP test: 1/1. Mutation testing was not run.

Full gates on the final F05.2.1 source revision:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0: API Vitest 341/341, API Node 855/855, Web 412/412;
  1,608 total, 0 failed/skipped/cancelled.
- `npm run build` — exit 0.
- `npm run format:check` — exit 0 after formatting `Sidebar.tsx` only.
- `npm run test:database` — exit 0 on disposable loopback PostgreSQL 17 with
  the repository guard and standard runtime-role preparer. The command runs
  serial Node suites and does not emit one aggregate test count; the dedicated
  workspace-search HTTP suite passed 1/1, with no database suite failures,
  skips or cancellations.

Browser automation was not exposed in this session, so desktop/mobile query
change, clear/re-enter, filter/sort, keyboard/focus, mobile overflow and
console/network acceptance remain `BROWSER_ACCEPTANCE_PENDING`. React and HTTP
tests are not represented as browser evidence. No cloud writes, external
provider calls, migration changes, push or deployment occurred. F05 remains
PARTIAL because search/filter/sort/pagination for the other module screens is
still outside this vertical slice.

## F05.3 Courses slice — 20/10/2026

The Courses screen now calls `GET /api/courses/search` instead of loading the
unpaged `/api/courses` response for its primary list. The typed contract
supports optional folded metadata search, progress bounds 0–100, allowlisted
name/code/progress sort, direction and page/pageSize. Items and total come from
one tenant-scoped SQL statement snapshot, with stable ID ordering and only
course list metadata. Existing full-list consumers remain explicit: dashboard
course tiles and the independent selectors on Exams, Study plans and Expenses.
Course detail continues to load by scoped slug, independent of the current
search page.

New focused verification on the Courses checkpoint:

- Courses FE search/lookup tests plus the App integration file: 128/128 passed.
- `npm run typecheck` — exit 0.
- `npm run build` — exit 0 (API and Web).
- `npm run format:check` — exit 0.
- `node --test apps/api/test/course-search-http.database.test.mjs` — exit 0,
  1/1 passed against the guarded disposable PG17 fixture and Nest HTTP. The
  fixture checks tenant isolation, 24+ records over multiple pages, filters,
  stable sort, out-of-range total, role/membership behavior, malformed query
  rejection, and scoped lookup. Synthetic Auth/session and external services
  are test boundaries; business SQL uses the real fixture runtime login.

The course API regression was first run before implementation and failed
because the additive search route returned 404; it passed after the route and
query were implemented. Courses UI integration verifies it uses the paged
route, while selector/dashboard consumers retain their existing list calls.
The browser automation capability was not exposed, so visual, keyboard,
desktop/mobile viewport and console acceptance remain `BROWSER_ACCEPTANCE_PENDING`.
Exams, Study plans and Expenses are not implemented by this checkpoint, so this
does not accept whole F05.3. No cloud/provider calls, migration, push or deploy
occurred.

## F05.3 Exams slice — 20/10/2026

The primary Exams page now uses the additive typed `GET /api/exams/search`;
the response contains `items`, `page`, `pageSize`, `total`, and `totalPages`.
Search covers topic, course name/code and room; filters cover course and inclusive
calendar-date bounds; sort is allowlisted to exam date/time, topic or course with
stable ID tie-breaking. Query values are validated at the HTTP boundary, dates
are strict calendar dates, and a reversed range is rejected before SQL. One
workspace-authorized SQL statement produces the page and total from the same
snapshot. Scoped `GET /api/exams/:id` serves deep links outside the page. No
migration or provider call was added.

The legacy `GET /api/exams` remains for the independent compact dashboard next
exam summary, and the full courses list remains for the course selector. The
paged Exams screen does not load the unbounded exam list. Create/edit/delete
permissions are unchanged; a successful mutation triggers a read-only search
refresh. Tests distinguish the all-matching paged list from the dashboard's
upcoming-only presentation.

New focused verification on the Exams checkpoint:

- HTTP/PG17/Nest suite: `node --test apps/api/test/exam-search-http.database.test.mjs` — exit 0, 1/1. The fixture uses a business LOGIN role that is non-owner and `NOBYPASSRLS`; synthetic Auth/session and fake external services remain test boundaries. It covers 24+ rows over three pages, tenant isolation, date/course filters, Vietnamese search, stable sort, page beyond end with correct total, manager/member/viewer/no-membership, scoped ID lookup and zero provider calls.
- Focused Web selection: `npm test --workspace @examate/web -- --run src/App.test.tsx src/ExamsSearch.test.tsx -t "exam|Exam"` — exit 0, 15 passed, 113 filtered by the name selector. It covers the paged route, API request, role controls, mutation refresh behavior, and dashboard's separate summary consumer.
- `npm run typecheck`, `npm run build`, and `npm run format:check` — exit 0 on the module checkpoint.
- RED evidence: before implementation, the real HTTP test failed because `GET /api/exams/search` returned 404. After implementation it passed against the disposable PG17/Nest fixture.

No browser tool was exposed, so desktop/mobile layout, keyboard, focus, visual
mutation, console and network acceptance remain `BROWSER_ACCEPTANCE_PENDING`.
This is code/test evidence, not browser evidence. Study plans and Expenses still
remain for F05.3; cloud rollout, Google live and remote-machine acceptance are
unrelated and remain pending. No cloud/provider call, migration, push or deploy
occurred.

## F05.3 Study Plans slice — 20/10/2026

The primary Study Plans screen now uses `GET /api/study-plans/search` with
optional folded metadata search, course, completion, owner/unassigned and
inclusive due-date filters; sort is allowlisted to due date, title, course or
completion. The bounded page, total, and all-filtered completed/remaining
summary come from one workspace-scoped SQL statement. Scoped
`GET /api/study-plans/:id` supplies a focused deep-link view outside the current
page/filter without changing paged totals. Dates are validated as real calendar
dates, reversed ranges are rejected before the business transaction, and ties
have stable ID ordering. No migration or provider call was added.

The page keeps course grouping within the displayed page. The legacy array
route remains for dashboard/course-group consumers, and the independent full
course selector remains available for create/filter controls. Create, toggle
and delete retain the existing role checks; confirmed writes trigger a read-only
refresh. The page does not load the legacy full plans list.

New focused verification on this checkpoint:

- RED: before implementation, the real HTTP regression received 404 for
  `GET /api/study-plans/search`; after implementation it passed against Nest
  and disposable PostgreSQL 17 using a business LOGIN that is non-owner and
  `NOBYPASSRLS`. The fixture covers two tenants, >2 pages, filters, stable
  sorting, all-filter summary, out-of-range totals, viewer/member/manager and
  inactive/no-membership denials, malformed queries and scoped lookup.
- FE/App selection: `npm test --workspace @examate/web -- --run
src/App.test.tsx src/StudyPlansSearch.test.tsx` — 127/127 passed.
- `npm run typecheck`, `npm run build`, and `npm run format:check` — exit 0 on
  this module checkpoint. Focused database test — 1/1 passed.

No approved browser automation capability was exposed, so desktop/mobile,
keyboard, visual, console and network acceptance remain
`BROWSER_ACCEPTANCE_PENDING`. Expenses remains the final F05.3 module, and
whole F05 remains partial. Cloud rollout, Google live and remote-machine
acceptance remain pending. No cloud/provider call, migration, push or deploy
occurred.

## F05.3 Expenses slice — 20/10/2026

The primary Finances page now requests `GET /api/expenses/search`; the paged
screen no longer loads `/api/expenses` as its list. Search covers description
and joined course metadata; filters cover category, course/unassigned and
explicit inclusive day/week/month/all/custom date ranges. Sort is restricted to
spent date, amount, or description. Scoped `GET /api/expenses/:id` displays a
deep-link target separately from the active page and aggregate. One workspace-
scoped SQL statement returns page, total, largest amount, exact whole-VND sum,
and per-course totals over the full filtered set. Monetary aggregate values are
decimal strings so PostgreSQL `bigint` totals are not rounded in JavaScript.
Legacy list consumers in the course workspace and the independent course
selector remain separate; no migration or AI/provider call was required.

RED/GREEN and focused evidence:

- RED: the new Nest HTTP/PG17 regression initially received 404 for
  `/api/expenses/search`; after implementation it passed 1/1 on PostgreSQL 17
  through a business LOGIN that is non-owner and `NOBYPASSRLS`, with a separate
  synthetic Auth/session fixture. It checks two tenants, multiple pages,
  Vietnamese/accent folding, punctuation, category/course/date filters,
  stable equal-date order, exact filtered aggregates, null-course totals,
  out-of-range page totals, role/membership denial, malformed queries, no SQL
  on invalid input, and scoped foreign-ID denial.
- Focused Expenses/App selection, `npm test --workspace @examate/web -- --run
src/ExpensesSearch.test.tsx src/App.test.tsx`: 127/127 passed. The full app
  suite includes the regression and passed API Vitest 341/341, API Node 855/855
  and Web 434/434 (1,630 total).
- An initial full Web run found an existing Tasks integration fixture omitted
  the paged `summary` field. The test fixture was corrected to model the current
  `/api/tasks/search` contract and confirmed status update; its focused test and
  the full rerun passed.
- Final gates: `npm run typecheck`, `npm test`, `npm run build`,
  `npm run format:check`, and `npm run test:database` on guarded disposable
  PG17 all exited 0. The database script reports each DB file separately; the
  new Expenses file passed 1/1 with 0 failures, skips or cancellations.

No browser automation capability was exposed in this session. Desktop/mobile
visual, keyboard, console, overflow, and mutation-in-browser checks remain
`BROWSER_ACCEPTANCE_PENDING`; React tests are not browser evidence. The five
F05.3 module code slices have automated local coverage, but whole F05 remains
partial pending browser acceptance. Cloud rollout, Google live, and Thắng's
machine remain pending. No cloud writes, external provider calls, migration,
push, or deployment occurred.

## F05.3.1 — focused-record uniqueness and expense chart scaling

Regression RED on the prior implementation: the scoped focused card duplicated
an Exams/Expenses row (`data-focus-id` count 2), and the Expenses chart divided
course totals by the largest individual expense (24,000/10,000 produced 240%).
GREEN: the shared hook masks/invalidate focused state as soon as the record is
listed and starts a fresh scoped lookup if it leaves the current page/filter;
chart percentages use the largest filtered course total while the largest
single expense summary remains unchanged.

New final-source gates: `npm run typecheck`, `npm test`, `npm run build`,
`npm run format:check`, and guarded `npm run test:database` all exited 0.
Application totals: API Vitest 341/341, API Node 855/855, Web 443/443.
The database runner completed 38 serial test files, exit 0 (no aggregate count
is emitted). Browser automation was unavailable, so desktop/mobile reproduction,
focus/overflow/console and visual chart acceptance remain
`BROWSER_ACCEPTANCE_PENDING`; component tests are not browser evidence. No
migration, provider, cloud, or deployment action occurred.

## F06 — Manager AI usage dashboard (local code evidence; browser pending)

Code commits: `6fca9e3` (API/DB/contract) and `341776f` (web UI), based on
starting HEAD `ef0450c` on the integration branch.

Routes: `GET /api/admin/ai-usage` and
`GET /api/admin/ai-usage/operations/:operationId/calls`. Query defaults to the
last seven inclusive `Asia/Ho_Chi_Minh` calendar dates, max 90; page size is 20
and max 50. Repeated/non-scalar/unknown filters, invalid dates, enum/sort values
and out-of-range page values return structured 400 before service. The current
workspace comes from the verified session. Every request rechecks active
membership and manager role inside a short business workspace transaction.

Migration 021 (capability contract v21) was applied, rolled back, and reapplied
on disposable PG17. It adds only manager RLS SELECT policies and column-scoped
business SELECT grants for the dashboard metadata. Auth runtime reads remain
denied. Rollback preserves all F03 telemetry rows and F04 admission state. A
pre-existing PUBLIC policy blocks standard migration preflight before ledger
write. No cloud migration or cloud grant was attempted.

The HTTP/DB fixture uses real Nest controllers, session/membership checks,
business/Auth LOGIN roles that are separate, non-owner and `NOBYPASSRLS`, the
real F03 `AiUsageService`/Gemini wrapper path, and SDK/Auth fixtures only beyond
the external boundaries. It verifies wrapper counters against persisted
operation/call rows, multi-call and zero-call operations, success/error/timeout/
cancelled/unknown/rejected outcome distinctions, complete/partial/missing/
invalid usage, known zero vs null, a token aggregate above JavaScript's safe
integer, multiple currencies/pricing versions, expiry, exact model cohort,
tenant RLS, manager vs member/viewer/revoked access, and summary equality across
pages. Synthetic rows are setup data only; one operation/call is written by the
real service wrapper. Browser UI has not been exercised in this checkpoint.

Final verification from source descended from `ef0450c`: typecheck, application
tests, build, format, and guarded PG17 `test:database` all exited 0. Application
tests passed API Vitest 365/365, API Node 855/855, and Web 448/448 (1,668 total).
The database runner completed 39 serial test files; PG17 passed 470/470 with
0 failed, skipped or cancelled. Focused F06 results:
API query validation 24/24, Web dashboard 5/5, runtime HTTP/RLS 14/14, and
migration lifecycle 1/1. This supports `F06_CODE_VERIFIED`; browser acceptance
remains `BROWSER_ACCEPTANCE_PENDING` because no browser tool was exposed. No
browser result is inferred from API or React tests. This dashboard reports only
persisted telemetry; it is not an invoice, hard monetary budget, complete
request counter or realtime view. F05 browser acceptance, cloud rollout, Google
live and Thắng's machine remain at their existing pending states.

To rerun locally, use a marked disposable PostgreSQL 17 `TEST_DATABASE_URL`
distinct from every runtime URL and run, sequentially:

```text
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
```
