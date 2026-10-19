# ExaMate — context hiện tại cho Tài, Thắng và agent

Cập nhật 19/10/2026. Đây là điểm tiếp tục công việc, không phải nhật ký từng lượt.
Git/source và kết quả kiểm mới có ưu tiên hơn checkpoint cũ trong báo cáo.

F01 đã có Google PKCE backend/FE và migration 016 test-only apply. Gates mới
ngày 19/10 trên `7112ca4`: 1.505 app test và 390 PG17 DB test, không fail/skip/
cancelled; cả năm gate exit 0. Browser fixture native/Compose có bằng chứng trong
[checklist F01](FINAL-DEMO-CHECKLIST.md). Google live/owner setup và máy Thắng
chưa xác minh; F01 không áp 016 cloud hoặc bắt đầu F02.
Verdict: **CODE_ACCEPTED + LIVE_ACCEPTANCE_PENDING**; human review pending.

## Nhánh và thứ tự đọc

- Từ nay phát triển trên **`feature/tai-assistant-integration-20261018`**.
- Checkout hiện tại: `D:\New-Tech\Final-Project-integration-20261018`.
- Không phát triển hoặc push tiếp vào `feature/tai-rag-integration`; không tự merge main.
- Checkout cũ `D:\New-Tech\Final-Project` có WIP riêng: không reset/stash/xóa hoặc
  mang chúng sang commit của task mới. Không chép .env/secrets vào Git.
- Đọc [README](../README.md), context này và source/test đúng module.
  [Hướng dẫn học](FINAL-STUDY-GUIDE-VI.md) giữ kiến trúc/role matrix;
  [checklist demo](FINAL-DEMO-CHECKLIST.md) giữ việc nghiệm thu cuối kỳ.
  Báo cáo/roadmap theo đợt đã gộp, xem lịch sử bằng
  `git show e9ac2af:docs/<tên-file>.md` hoặc
  `git show e9ac2af:tasks/PROJECT-ROADMAP-2026-10-13.md` khi cần chi tiết.
  Không nạp mọi báo cáo cũ hoặc thực thi prompt cũ như nhiệm vụ mới.

## Sản phẩm và kiến trúc

Nhóm Tài–Thắng làm workspace học tập cho final New Technologies; pilot nhỏ cho
nhóm và người được mời. App chỉ chạy local `http://127.0.0.1:5173`, dùng Supabase
chung; Docker web có origin riêng `http://127.0.0.1:8080`. Không tự mở hosting,
domain/HTTPS, cloud writes hoặc mở rộng phạm vi chỉ vì giao diện đã xong.

React/Vite + NestJS ESM, npm workspaces, PostgreSQL/pgvector và private Storage.
Node 24 phù hợp engines (README yêu cầu 24.15+), npm 11.6.2. Contracts chỉ chứa
kiểu tại `packages/contracts/index.d.ts`. Không đổi framework/stack theo hướng
dẫn của project khác trong folder cha.

## Đã triển khai trong code

- Tasks/Courses/Exams/Study plans/Expenses/Documents, scope workspace và role
  ở API; viewer đọc, member/manager ghi theo matrix, manager mới xóa các mục quy định.
- Documents: PDF upload/private Storage, signing/preview, indexing/OCR tùy chọn,
  reconciliation khi kết quả ghi/COMMIT chưa rõ. Không tự replay POST.
- Workspace transaction ngắn ở domain, ingestion, retrieval/summary/metadata,
  receipt/history/feedback. Storage/OCR/embedding/provider ở ngoài transaction.
- Assistant UI hai tầng: AI Chat → Kiến thức chung/Tài liệu; Hỏi workspace riêng.
  Backend vẫn có ba mode độc lập. General stream text; Documents chỉ status rồi
  answer đã qua citation và quyền cuối lượt; Workspace status rồi kết quả SQL.
- N1 history tối đa 6 lượt receipt đã xác minh user/workspace/mode/scope/hash;
  nguồn cũ không là evidence. Bộ nhớ tab, reload mất; reset/abort không ghép answer
  về trễ sang hội thoại mới. Giữ draft người dùng sửa trong lúc chờ.
- Feedback thuộc receipt của chính người gửi; dữ liệu là candidate cần review,
  không tự thành gold/PASS. Receipt không lưu nội dung hội thoại.
- STT Whisper small ONNX local do Thắng phụ trách: auto/Việt/Anh, sửa transcript
  trước khi chèn/gửi; mặc định tắt, không tự tải weights. Có cửa sổ 30s/stride 5s.

## Bằng chứng và phần chưa được nghiệm thu

Merge checkpoint **`01288ce`** giữ hai parent Tài `8b62f1a` và Thắng `2249abf`.
Lượt tích hợp chạy đủ 5 gates exit 0: **1.487 test ứng dụng + 379 DB**, không
fail/skip/cancelled. Browser fixture desktop/375px/320×320, Docker build/native
imports và 5 media tests thật đã kiểm. Đây là kết quả lịch sử tại checkpoint,
không nhận là kết quả chạy mới của task sau.

- Auth đã bootstrap demo theo [handoff đăng nhập](PILOT-DEMO-HANDOFF.md), nhưng
  không suy ra đăng nhập thực tế trên máy Thắng hoặc extended Auth acceptance đã đạt.
- Tenant RLS/grants toàn app chưa rollout cloud; non-owner/RLS proof là DB disposable.
- Budget AI (B3), semantic RAG/live eval qua Auth (B4), PWA/flashcards vẫn theo roadmap,
  chưa coi là hoàn tất. `eval:rag` live đang BLOCKED trước DB/Storage/Gemini.
- STT audit còn 2 high/4 moderate package entries; remediation chưa xong. Không
  thấy đường image decode/format-string tương ứng trong audio path đã review,
  nhưng không gọi audit sạch hoặc chứng minh không thể khai thác.
  Các finding gồm Sharp và chuỗi sprintf/transitive; review lại trước 25/10/2026
  hoặc trước mở pilot, tùy mốc nào sớm hơn. Không tự nâng/override packages.
- Không có nghiệm thu microphone/Whisper accuracy/tốc độ CPU hoặc Gemini thật
  trong lượt tích hợp. Model template 3.5 Flash-Lite không tự đổi .env cũ.

Shared-corpus false-empty từng thấy ở fixture dùng chung còn INCONCLUSIVE:
Đợt 16 thêm positive oracle/lifecycle 12 chu kỳ, chưa tái hiện nguyên nhân.
Không coi tách DB từng case là bằng chứng đã chữa lỗi; giữ regression và theo dõi.

## Roadmap còn lại — không triển khai tất cả trong một lượt

Thứ tự đã chọn: B1 → B2 → B3 → B4 → N1 → N3 → N2 → N5; N6 tùy chọn.
N1 lát 1/SSE đã có code, không phải quay lại làm mới; cần nghiệm thu và hardening.

1. **Ổn định tích hợp:** xử lý dependency STT có kiểm soát; benchmark mic/CPU;
   tiếp tục theo dõi shared-corpus oracle, không đổi thuật toán để né test.
2. **B1:** Thắng tự login trên máy thật, extended refresh/revoke/account swap/
   2 tab/API offline; không thay bằng kết quả HTTP máy Tài. Bootstrap không lặp lại.
3. **B2:** inventory mọi đường DB và Auth bootstrap/export; thiết kế/duyệt role
   runtime NOBYPASSRLS không owner, grants tối thiểu và tenant policies toàn app.
   Thiếu context deny, context transaction-local không rò pool, non-owner tests.
   Chưa tự rollout cloud/đổi credential chung; cần target/backup/maintenance/rollback.
4. **B3, 1–2 lát:** cap lượt AI/user/ngày và cap fan-out summary/index; admission
   nguyên tử trước provider, concurrency không vượt cap, từ chối gọi provider 0 lần.
   Không dựng dashboard billing. Context/token/timeout hiện tại không phải cost cap.
5. **B4:** nối live runner bằng principal đã chọn và hạn mức (chưa chọn service
   principal CLI hay account test HTTP); không thêm bypass. Đánh giá PDF Việt có
   dấu/scan/bảng/thiếu evidence/scope, từng claim có human review độc lập; giữ
   corpus/gold/run lịch sử. Chỉ chạy Gemini/cloud khi task được giao rõ quyền/chi phí.
6. **N1 phần sau:** hội thoại persistence/retention có thiết kế riêng, không nhét
   text vào receipt; giữ receipt ownership và chất lượng follow-up qua B4.
7. **N3:** PWA localhost, chỉ cache app shell/public assets; không cache API/Auth/
   PDF/signed URL, xóa dữ liệu account khi logout. Android dự kiến adb reverse
   tcp:5173 tcp:5173; kiểm thật riêng, iOS không có đường adb tương đương.
8. **N2/N5:** quiz/flashcards có nguồn và review; rồi benchmark nhiều model theo
   quality/latency/cost trên cùng corpus, không chọn theo tên mới hơn.
9. **N4:** TTS/STT của Thắng, chỉ tích hợp text đã verify/transcript có user duyệt.
   **N6 WASM** chỉ PoC sau profiling có mục tiêu CPU cụ thể, không cam kết làm.

Ưu tiên final: nền B1–B4, N1 đã có và demo đủ chắc; PWA/flashcards chỉ sau khi
nền đạt. Không hosting/domain/HTTPS/deploy hoặc native mobile ngoài phạm vi local.
Source hiện có migration 016 cho OAuth attempt; F01 chỉ áp trên disposable.
Cloud bootstrap lịch sử đến 015; chưa áp 016 hoặc xác minh lại cloud trong F01.
Đợt tiếp theo phải kiểm source/ledger thực tế trước mọi thao tác schema.

## Quy tắc khi triển khai tiếp

Kiểm Git/branch/WIP và đọc test hiện có trước sửa. TDD cho thay đổi hành vi;
kiểm runtime phù hợp, ghi đúng pass/skip và giới hạn. Không dùng test fake để
tuyên bố cloud/model thật đã đạt. Không sửa migration cũ, không in secrets,
cookie, signed URL hoặc định danh thật; không tự rotate key/tạo lại user/workspace.

Giữ ranh giới của Thắng: chunking/embedding/OCR/retrieval/prompt/validator không
đổi trong task hardening nếu chưa có phạm vi và benchmark. TTS/STT do Thắng
phụ trách; sửa tích hợp AssistantPanel/voice phải nêu trước để tránh đụng nhau.
Không hỏi lại về second opinion mỗi đợt; chỉ hỏi khi thiếu quyết định phạm vi
hoặc thiết kế thực sự chặn công việc.

Commit theo lát đã kiểm; push chỉ khi được giao. Tài đã cho phép push nhánh mới
trong lượt dọn docs này; không hiểu đó là quyền force-push/merge/deploy hoặc
cloud writes trong các task sau.

# F01 — implementation checkpoint (2026-10-18)

Local implementation in the integration checkout only; Google live acceptance is pending owner setup. No cloud migration or account changes are authorized by this code run.

Design/contract: `GET /api/auth/google/status` returns `{status: enabled|not_configured}`. `POST /api/auth/google/start` takes an empty body and requires the existing prelogin cookie, Origin and CSRF; it returns `{authorizationUrl}`. `GET /api/auth/google/callback?attempt=…&code=…` is the only application callback. Supabase's callback to/from Google is a separate provider URL. No client-selected provider, host or return destination is accepted.

The backend constructs Supabase's PKCE S256 authorize URL without replacing provider state. A random application correlation identifier is carried in the fixed redirect URL, bound in PostgreSQL to the prelogin cookie hash, server origin and Google. A five-minute encrypted verifier uses a separate AES-GCM purpose. Starting again replaces the prior attempt. Claim precedes network exchange and is single use; finishing locks/rechecks the prelogin and attempt after the network call. An old callback cannot rotate a newer session. Exchange uncertainty requires a new flow, never a hidden retry.

Identity trust remains BFF: browser opaque HttpOnly cookie → server encrypted Supabase tokens → authoritative Supabase `/user` verification of the exact access JWT → checked claims/session and DB membership. This is not a browser JWT or Google ID-token login. No auto membership or app account linking is introduced. Manager/member/viewer keep their existing meanings. Migration 016 adds attempts with RLS/revoked public access; only disposable databases were migrated during F01. Production role policies remain F02.

Threat controls: login CSRF is stopped by prelogin/Origin/CSRF plus callback binding and PKCE; replay by atomic claim; fixation by existing session rotation; stale account flows by final prelogin recheck; SSRF/open redirects by server-fixed URLs; disclosure by safe callback logging, clean redirects and no-store/no-referrer. No OAuth SQL transaction spans provider calls. Existing refresh serialization is unchanged. Password login remains available with Google disabled.

Backend `38e2e53`, FE/fixtures `08eb581`, historical rollback oracle `f36607b`,
wall-clock/lock-wait and prelogin expiry hardening `ac033a4`, dev proxy privacy
`7112ca4`. New local tests and
native/Compose browser evidence: [F01 acceptance record](FINAL-DEMO-CHECKLIST.md).
Google live/owner setup and machine Thắng remain pending; no cloud writes/push.
Next checkpoint is owner Google setup/016/identity/consent, then F02 only after
review. F01 does not complete production tenant RLS, AI budget or semantic RAG.
