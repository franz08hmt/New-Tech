# ExaMate — context hiện tại cho Tài, Thắng và agent

Cập nhật 19/10/2026. Đây là điểm tiếp tục công việc, không phải nhật ký từng lượt.
Git/source và kết quả kiểm mới có ưu tiên hơn checkpoint cũ trong báo cáo.

F01.1 đã harden rollback 016 tại `b343737`: shared dependency/schema preflight,
contract pristine/source PG17, apply recheck dưới lock và cleanup client không
chắc sạch. Baseline `0130039` và final đều chạy mới: 1.505 app test; DB 390 →
423 pass, năm gate exit 0, 0 fail/skip/cancelled. **LOCAL_HARDENING_ACCEPTED +
LIVE_ACCEPTANCE_PENDING**; human review patch pending. Xem [checklist](FINAL-DEMO-CHECKLIST.md)
và [bảng readiness/owner steps](PILOT-B1-RUNBOOK.md#readiness-f011--quan-sát-19102026-không-phải-google-live-pass).
Không thay Auth runtime/FE nên không nhận browser/Compose/Google mới. Config
private/target chưa đủ ở checkout này, cloud ledger/provider chưa kiểm được.

F01 đã có Google PKCE backend/FE và migration 016 test-only apply. Gates F01
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

## Roadmap FINAL F01–F16 — đã chốt, chưa cấp quyền triển khai các đợt sau

Bảng do Tài xác nhận trong F01.1 thay thứ tự B/N cũ; các nhãn B/N vẫn là tham
chiếu lịch sử. Không chạy lại phần đã có hoặc biến kế hoạch thành nghiệm thu.

| Đợt | Phạm vi đã chọn                                                                                                            | Trạng thái / điều kiện                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| F01 | Google PKCE, JWT-backed phiên hiện có, membership/role, replay/account race                                                | Local đã triển khai; F01.1 rollback/preflight local hardening accepted. Google live, Thắng và Auth extended pending |
| F02 | Hoàn tất B2: runtime non-owner/NOBYPASSRLS, grants tối thiểu, tenant RLS toàn app, rollout/rollback cloud                  | Chưa triển khai production; workspace transactions/PoC hiện có không thay nghiệm thu toàn app                       |
| F03 | Prompt tập trung/version; metadata request/provider calls, token, latency, outcome, chi phí ước tính                       | Pending; không log prompt/nội dung riêng hoặc coi unknown usage là 0                                                |
| F04 | B3: cap user/ngày, concurrency, fan-out summary/index/OCR; admission nguyên tử và bền vững                                 | Pending; timeout/context cap/Auth throttle không thay budget AI                                                     |
| F05 | Search/filter/sort/pagination FE–API–DB; Documents trước, scope trước count/pagination, chống stale response               | Pending; chưa có vertical slice được nghiệm thu                                                                     |
| F06 | Dashboard AI cho admin đúng workspace: request/provider calls, token/cost/latency/lỗi/từ chối và filters                   | Pending; đây là yêu cầu usage dashboard, không phải Finances hay billing                                            |
| F07 | N1 lưu bền, mở lại/xóa, retention/quyền; receipt/history/reset/account isolation                                           | Pending persistence; history trong tab/SSE và draft revision đã có, không viết lại                                  |
| F08 | N2 Study Coach: structured quiz/flashcards, nguồn, preview/xác nhận lưu, luyện tập/tiến độ cá nhân                         | Pending                                                                                                             |
| F09 | B4: ít nhất 20 case thực thi có expected, cùng corpus/gold trước/sau, human review/guardrails/fallback/latency/cost        | Chưa nghiệm thu semantic/live; live runner còn BLOCKED, principal CLI hay HTTP chưa chốt                            |
| F10 | Voice của Thắng: STT thật, dependency/benchmark, phát triển/nghiệm thu TTS                                                 | STT có implementation và bằng chứng lịch sử; acceptance thật/TTS còn pending, không chuyển ownership                |
| F11 | PWA/mobile thật: manifest/install/update/offline shell, Android và giới hạn iOS                                            | Pending; không cache dữ liệu riêng hoặc tự queue write                                                              |
| F12 | Registry/allowlist nhiều model, lựa chọn kiểm soát, benchmark quality–latency–cost                                         | Pending; đổi embedding/re-index cần quyết định riêng                                                                |
| F13 | WASM PoC có profiling/benchmark, cancel/fallback/license; chỉ tích hợp nếu chứng minh lợi ích                              | Nhánh mở rộng, không bắt buộc rubric; tác vụ cụ thể chưa chốt                                                       |
| F14 | Native client tái sử dụng API: OAuth/deep link, secure storage, build/thiết bị                                             | Nhánh mở rộng, không bắt buộc rubric; stack chưa chốt                                                               |
| F15 | Tool-using agent: ít nhất 3 tools được LLM gọi, quyền/scope/idempotency/logs và xác nhận trước write                       | Nhánh mở rộng, không bắt buộc rubric; không SQL/lệnh tùy ý; thiết kế tools chưa chốt                                |
| F16 | Compose E2E/traceability, ít nhất 3 ADR, AI_USAGE, PDF 10–20 trang, slide tối đa 15 trang, video 3–5 phút, live change/Q&A | Pending bộ nộp; hiện có ADR-001, không nhận đã đủ 3 ADR                                                             |

Tài liệu/traceability cập nhật xuyên suốt, không đợi F16. F01.1 thuộc F01,
không phải đợt lớn thứ 17. Bảng này không cấp quyền cloud writes, push hoặc
thực hiện F02–F16. Lượt F01.1 chỉ rollback/docs/readiness chỉ đọc; app vẫn local.
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

Commit theo lát đã kiểm; push chỉ khi được giao. Phê duyệt push lượt dọn docs
cũ là lịch sử, không áp dụng F01/F01.1; không force-push/merge/deploy/cloud writes.

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
