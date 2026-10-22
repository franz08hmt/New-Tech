# ExaMate AI — Báo cáo cuối kỳ (bản nguồn, DRAFT)

**Môn:** New Technologies · **Nhóm:** Tài, Thắng · **Ngày cập nhật:** 23/10/2026 ·
**Nhánh:** `feature/tai-assistant-integration-20261018`

> **Trạng thái: DRAFT — chưa phải báo cáo nghiệm thu cuối.** Kết quả evaluation ≥ 20 case trước/sau một cải tiến
> **chưa được đo** (cần Gemini thật, target thật, gold được duyệt). Các ô đó giữ nguyên trống và ghi
> `PENDING`. Mọi số liệu bên dưới là số đã quan sát thật, kèm nguồn; không có số bịa để lấp trang.
> Ô `TÀI ĐIỀN` / `THẮNG ĐIỀN` do chính người đó viết; AI không viết thay phần hiểu bài hay xác nhận.
> Nguồn chỉnh sửa: file này. PDF: dựng từ file này bằng `python scripts/build-submission-docs.py <thư-mục-xuất>` (cần PyMuPDF, python-pptx, markdown).

## 1. Bài toán, người dùng và phạm vi

**Người dùng:** sinh viên làm việc theo nhóm, cần gom lịch học, bài tập, kỳ thi, chi tiêu và tài liệu môn học vào
một workspace, và cần hỏi đáp trên chính tài liệu của nhóm mà vẫn kiểm chứng được nguồn.

**Vấn đề:** chatbot chung bịa nguồn; ghi chú và tài liệu nằm rải rác; không có cách kiểm tra câu trả lời dựa trên trang nào của PDF.
ExaMate làm hai việc AI **có công việc thật** (không chỉ chuyển tiếp lời nhắn tới LLM):

- **Capability A — RAG trên dữ liệu ứng dụng:** upload PDF → chunk → embedding → vector search → câu trả lời có citation
  (tên file + trang) → từ chối khi không đủ bằng chứng.
- **Capability C — Structured output:** model trả JSON theo schema; backend validate nghiêm ngặt; ứng dụng dùng kết quả trong
  luồng học tập: xem trước → xác nhận lưu → luyện tập → chấm điểm ở server → theo dõi tiến độ (quiz và flashcards).

**Phạm vi đã chốt (Tài, 19/10 và 22/10/2026)** — ghi để người chấm không hiểu nhầm:

| Mục | Quyết định |
| --- | ---------- |
| Capability nhóm 2 người | A + C. **Không** nhận B (cần ≥ 3 tool do LLM gọi), D, E. |
| STT (F10) | Giữ implementation hiện có (Thắng); **không** làm TTS; không tính STT là capability D (kết quả chưa được lưu và dùng bởi app). |
| PWA (F11), WASM (F13) | Bỏ khỏi kế hoạch. Rubric chỉ cần *một* tính năng frontend hiện đại: dùng **streaming AI response**. |
| Vẫn bắt buộc | Responsive desktop/mobile, SSE/streaming, demo từ Docker Compose. |
| Chưa bỏ, chưa làm | F12 (multi-model registry), F14 (native client) — nằm ngoài đợt nghiệm thu này. |

## 2. Yêu cầu: user stories và traceability

13 user story (US-01…US-13), mỗi story có acceptance criteria (AC) kiểm tra được. Bảng trace đầy đủ
*story → endpoint/component → file → test → bằng chứng* nằm ở `docs/FINAL-REQUIREMENTS.md` (mục "User stories") và được
tóm lại ở cuối mục này. Mọi story mở được code theo yêu cầu: endpoint và file ghi cạnh từng story.

**US-01 — Đăng nhập an toàn.** *Là sinh viên được mời vào workspace, tôi muốn đăng nhập và có phiên do backend xác minh để chỉ người hợp lệ thấy dữ liệu.*
AC1: tài khoản có quyền đăng nhập → phiên hợp lệ. AC2: sai mật khẩu, phiên hết hạn hoặc Auth lỗi → thông báo rõ, không tải dữ liệu bảo vệ.
AC3: đăng xuất → phiên cũ vô hiệu, kể cả ở tab khác. · `/api/auth/{session,login,logout,refresh,google/*}`, `PilotAccess.tsx`, `auth.service.ts`.

**US-02 — Phân quyền workspace.** *Là quản trị workspace, tôi muốn mỗi người chỉ có quyền cần thiết.*
AC1: viewer đọc được, ghi bị 403 `ROLE_FORBIDDEN`. AC2: member ghi nhưng không xóa tài liệu. AC3: người không có membership không có principal.
AC4: workspace/role do client gửi bị bỏ qua. · `auth.guard.ts`, `principal.ts`, RLS migration 017–018.

**US-03 — Quản lý công việc và học tập.** AC1: tạo task lưu bền. AC2: đổi trạng thái lưu; dữ liệu sai (tiêu đề < 3 ký tự) bị từ chối.
AC3: exams, study plans, expenses tuân theo vai trò. · `/api/{tasks,exams,study-plans,expenses}`, `TasksPanel.tsx`.

**US-04 — Tìm, lọc, sắp xếp, phân trang.** AC1: tìm theo từ khóa. AC2: lọc theo trạng thái/môn. AC3: phân trang có tổng số.
AC4: tìm ở sidebar bị giới hạn trong workspace. · `/api/*/search`, `/api/search`, `use-paged-search.ts`.

**US-05 — Tải và lập chỉ mục PDF.** AC1: PDF hợp lệ → Stored → Index → Ready kèm độ phủ trang. AC2: sai loại hoặc quá cỡ bị từ chối.
AC3: chỉ manager/member ghi; viewer không. AC4: signed URL chỉ sống 60 giây. · `/api/documents*`, `DocumentsPanel.tsx`.

**US-06 — Hỏi đáp RAG có nguồn.** *Là sinh viên, tôi muốn hỏi nội dung tài liệu và nhận câu trả lời có nguồn để kiểm chứng.*
AC1: câu có đáp án → trả lời + `[S1]` + citation (tên file, trang). AC2: mở citation → đúng PDF, đúng trang. AC3: ngoài tài liệu → từ chối, không citation.
AC4: citation ngoài evidence bị loại. · `/api/assistant/chat[/stream]`, `AssistantPanel.tsx`, `SourcePreview.tsx`, `source-markers.ts`.

**US-07 — Hội thoại tiếp nối và lịch sử.** AC1: follow-up dùng ngữ cảnh. AC2: đổi tài liệu/scope → reset. AC3: lịch sử riêng tư theo (workspace, user).
AC4: chỉ lượt hoàn tất có receipt hợp lệ mới được lưu. · `/api/assistant/conversations*`, `answer-receipt.service.ts`.

**US-08 — Streaming và hủy.** AC1: chế độ general hiện chữ dần. AC2: bấm Dừng → không lưu nửa câu, giữ bản nháp. AC3: phản hồi trễ không ghi đè hội thoại khác.
· `POST /api/assistant/chat/stream`, `assistant-stream.ts`.

**US-09 — Study Coach: Quiz.** AC1: sinh từ tài liệu ready; JSON được validate (schema, `sourceIds` thuộc evidence, 4 lựa chọn khác nhau).
AC2: xem trước, chưa lưu; xác nhận mới lưu (token do server cấp). AC3: làm bài → chấm ở server, idempotent. AC4: tiến độ cá nhân; quiz người khác trả 404.
AC5: JSON sai → 422, không lưu. · `/api/study-coach/quizzes*`, `StudyCoachPanel.tsx`, `study-quiz-validation.ts`.

**US-10 — Study Coach: Flashcards.** AC1: xem trước rồi xác nhận lưu. AC2: lật thẻ, tự đánh giá nhớ/cần ôn, lưu một lượt idempotent. AC3: tiến độ cá nhân.
· `/api/study-coach/flashcards*`, `StudyFlashcardsPanel.tsx`.

**US-11 — Dashboard sử dụng AI (manager).** AC1: số operation, provider call, token, chi phí ước tính, latency avg/p95, lỗi/từ chối.
AC2: thiếu dữ liệu hiện "chưa có", không phải 0. AC3: member/viewer bị chặn. · `GET /api/admin/ai-usage`, `AiUsageDashboard.tsx`.

**US-12 — Nhập câu hỏi bằng giọng nói (STT).** AC1: ghi âm → transcript theo ngôn ngữ chọn. AC2: sửa rồi chèn, không tự gửi. AC3: hủy hoặc im lặng → không gửi.
AC4: mặc định tắt, không tự tải weights. · `/api/speech/*`, `SpeechInput.tsx` (Thắng).

**US-13 — Hỏi dữ liệu workspace.** AC1: câu hỏi khớp intent → trả lời từ truy vấn SQL có kiểm soát + liên kết bản ghi. AC2: mơ hồ → hỏi lại.
AC3: không gọi LLM, không tool-calling. · `mode: "workspace"`, `workspace-assistant.service.ts`.

**Bảng trace rút gọn** (mức: `BROWSER*` = trình duyệt thật trên stack demo; `AUTO` = test tự động):

| ID | Test · bằng chứng chính | Mức |
| -- | ----------------------- | --- |
| US-01 | `auth.test.mjs`, `oauth.database.test.mjs`; browser: login, reload, logout, 2 tab, phiên bị thu hồi | BROWSER* |
| US-02 | `runtime-rls.database.test.mjs`; ma trận HTTP 19/19 (`demo-stack-roles-check.mjs`) | BROWSER* |
| US-03 | `academic-context.test.mjs`, `workspace-academic.database.test.mjs`; browser Tasks | BROWSER* (Tasks) |
| US-04 | `*-search-http.database.test.mjs`; browser tìm/lọc Tasks | BROWSER* (Tasks) |
| US-05 | `documents-http-context.database.test.mjs`, `ingestion-http.database.test.mjs`; browser 3 PDF | BROWSER* |
| US-06 | `assistant.service.spec.ts`, `retrieval-*.database.test.mjs`; browser: citation → PDF trang 3/3 | BROWSER* |
| US-07 | `assistant-conversations-lifecycle.database.test.mjs`; API: manager 1 hội thoại, member 0 | BROWSER* (một phần) |
| US-08 | `assistant.controller.spec.ts`, `assistant-stream.test.ts`; browser + nginx | BROWSER* |
| US-09 | `study-quiz-validation.spec.ts`, `study-coach*.database.test.mjs`; browser 2/3 = 66,67 % | BROWSER* |
| US-10 | `study-flashcards*.database.test.mjs`; browser "2 đã nhớ, 1 cần ôn lại" | BROWSER* |
| US-11 | `ai-usage*.database.test.mjs`; browser | BROWSER* |
| US-12 | `speech.test.mjs`, `speech-media.test.mjs`, `speech-input.test.tsx` | AUTO |
| US-13 | `workspace-*.spec.ts`, `workspace-records-context.test.mjs` | AUTO |

`BROWSER*` nghĩa là chạy trong trình duyệt thật trên **stack demo**: Auth upstream, Storage, embedding và "model" là synthetic; Nest,
guards, PDF.js, chunker, retrieval, telemetry, PG17 + RLS là thật. **Không có mục nào đạt mức `LIVE` (dịch vụ thật).**

## 3. Kiến trúc

![Kiến trúc và luồng một request AI](architecture.png)

| Thành phần | Công nghệ | Vai trò và ranh giới |
| ---------- | --------- | -------------------- |
| Frontend | React 19 + Vite + Tailwind | Chỉ giữ cookie HttpOnly opaque và CSRF; không giữ JWT/API key. Streaming SSE là tính năng hiện đại. |
| Reverse proxy | nginx (Compose) / Vite proxy (dev) | Ghi đè `X-Forwarded-For`; chỉ một hop tin cậy; `X-Accel-Buffering: no` để SSE không bị đệm. |
| Backend | NestJS (ESM, Node 24) | Mọi lời gọi LLM đi qua đây. Principal (workspace, user, role) lấy từ server. |
| Dữ liệu | PostgreSQL 17 + pgvector (768 chiều) | RLS theo workspace/user; LOGIN business và Auth tách nhau; không giữ transaction trong lúc gọi Storage/model. |
| Storage | Supabase Storage (bucket private) | Signed URL sống 60 giây là bearer capability. |
| Auth | Supabase Auth (email/mật khẩu, Google PKCE) | Backend xác minh JWT, cấp cookie opaque (BFF, ADR-001). |
| LLM | Google Gemini API | `GEMINI_MODEL` (mặc định `gemini-2.5-flash`), `gemini-embedding-001` 768d. |
| STT | Whisper ONNX chạy local | Mặc định tắt; không tự tải weights; âm thanh không rời máy. |

**Luồng một request AI (hỏi tài liệu)** — 8 bước trong sơ đồ: kiểm tra phiên/Origin/CSRF; giữ chỗ admission; embedding câu hỏi;
tìm vector đã lọc theo scope; nếu không có đoạn đủ ngưỡng thì từ chối **không gọi model**; một lời gọi generation với
`responseJsonSchema`; kiểm lại JSON và citation; ghi telemetry; trả kết quả; citation mở PDF đúng trang qua signed URL 60 giây.

**Ranh giới dữ liệu:** chỉ đoạn trích trong scope người dùng đọc được mới tới model (lọc ở DB trước khi dựng prompt).
Bucket private không có nghĩa dữ liệu không rời máy: nội dung liên quan được gửi tới Google khi embedding/RAG/OCR.

### 3.1 Mô hình dữ liệu và lớp bảo vệ

Schema do 24 migration bất biến (không sửa migration đã có) dựng lên theo từng lớp:

| Migration | Nội dung |
| --------- | -------- |
| 001–007 | Tasks, tài liệu và Storage metadata, courses, exams, study plans, expenses, gắn tài liệu với môn |
| 008–011 | Nền RAG (chunk + vector 768 chiều), chất lượng index, độ phủ OCR, feedback câu trả lời |
| 012–016 | Truy cập pilot, giới hạn đăng nhập, scope theo workspace, receipt câu trả lời, attempt OAuth |
| 017–018 | Quyền tối thiểu và RLS theo workspace/user; tách LOGIN business và Auth; re-index |
| 019–021 | Telemetry AI (operation + provider call), admission bền vững, dashboard quản trị |
| 022–024 | Hội thoại cá nhân, Study Coach quiz, flashcards (mỗi bảng có RLS chủ sở hữu) |

Ba lớp bảo vệ độc lập: (1) guard server xác minh phiên + Origin + CSRF và lấy principal từ phiên; (2) transaction ngắn đặt
ngữ cảnh `workspace_id/user_id` để RLS trong DB kiểm lại membership và vai trò; (3) runtime API từ chối khởi động nếu LOGIN là owner,
BYPASSRLS hoặc quyền lệch contract. RLS bảo vệ lỗi scope SQL; nó **không** chống kẻ chiếm được credential DB và không thay xác minh JWT.

## 4. Quyết định thiết kế (ADR)

Chi tiết trong `docs/DECISIONS.md` (ADR-001…011). Ba ADR tiêu biểu, trong đó hai là quyết định AI:

| ADR | Quyết định | Phương án đã loại / lý do |
| --- | ---------- | ------------------------- |
| **ADR-001** (18/10) Google PKCE + BFF/session | Backend giữ phiên: PKCE S256 và nonce do backend sinh, verifier lưu mã hóa AES-256-GCM, JWT được Supabase `/user` xác minh, trình duyệt chỉ giữ cookie opaque | Không để JWT/refresh token ở JS/localStorage; không tự viết verifier chữ ký; không giữ transaction qua bước exchange |
| **ADR-003** (20/10) Prompt registry + telemetry AI *(quyết định AI)* | Prompt tĩnh có `PromptId` + version trong registry TypeScript; mỗi operation và mỗi provider call có ID riêng; metadata không chứa prompt/câu trả lời/nội dung tài liệu | Không log nội dung; không một dòng log gộp operation và attempts; không retry provider; usage thiếu/partial giữ `unknown`, không điền 0; chi phí chỉ là ước tính có pricing version |
| **ADR-009** (21/10) Study Coach quiz có bằng chứng *(quyết định AI)* | Chỉ lưu quiz người dùng xác nhận từ draft do server cấp; JSON strict, citation phải nằm trong evidence của chính lần chạy; chấm ở server, không gọi AI khi luyện tập | Không tin schema/JSON mode của provider; không cho client gửi evidence hay danh tính; schema hợp lệ **không** chứng minh ngữ nghĩa → cần review người |

Các ADR khác: ADR-002 tách LOGIN business/Auth/maintenance (RLS), ADR-004 admission AI bền vững, ADR-007 dashboard trên telemetry best-effort,
ADR-008 hội thoại cá nhân, ADR-010 flashcards, ADR-011 evaluation có xác thực không qua đường tắt runtime.

**Chưa có ADR riêng cho chunk size và lựa chọn model.** Repo ghi giá trị (chunk mục tiêu 1.200 / tối đa 1.800 ký tự / chồng 200;
`RAG_TOP_K=6`, `RAG_MIN_SCORE=0,55`; embedding 768d; `gemini-2.5-flash`) nhưng không ghi lý do chọn.
**TÀI/THẮNG ĐIỀN:** lý do chọn model (chất lượng, chi phí, tốc độ, riêng tư) và chunk size — hoặc viết ADR-012. AI không bịa lịch sử quyết định.

## 5. Thiết kế AI

### 5.1 Model và cấu hình

| Hạng mục | Giá trị trong code/`.env.example` |
| -------- | --------------------------------- |
| Generation | `GEMINI_MODEL` (fallback source `gemini-2.5-flash`; template tích hợp đặt model khác — không suy ra model thực chạy từ template), timeout 30 s, `maxOutputTokens` 1.024 |
| Embedding | `gemini-embedding-001`, 768 chiều (phải khớp schema), batch 16, timeout 30 s |
| Retrieval | `RAG_TOP_K` 6, `RAG_CANDIDATE_LIMIT` 10, `RAG_MIN_SCORE` 0,55 |
| Chunking | mục tiêu 1.200 ký tự, tối đa 1.800, chồng 200, tối thiểu 80, ≤ 2.000 chunk/tài liệu, ranh giới theo trang |
| OCR | tùy chọn, mặc định tắt |
| Admission | trần thao tác/ngày/người, đồng thời/người và /workspace, số provider call tối đa mỗi loại thao tác |

### 5.2 Prompt management

Mọi prompt nằm trong `apps/api/src/assistant/prompt-registry.ts` với ID và version
(`assistant.general`, `assistant.documents.question`, `assistant.documents.summary.{section,synthesis}`, `documents.ocr.page`,
`study-coach.quiz`, `study-coach.flashcards`); version đổi khi ngữ nghĩa prompt đổi, lịch sử nằm trong Git. Golden test
(`prompt-registry.spec.ts`) giữ nguyên payload gửi provider.

### 5.3 Schema và RAG

- RAG trả `{answerable, answer, citationIds}`; backend kiểm: đúng bộ khóa, `answer` không rỗng, `citationIds` ⊂ sourceId của evidence,
  không trùng, và mọi marker `[S<n>]` trong câu trả lời phải bằng đúng tập citation (`source-markers.ts`, dùng chung cho production và evaluator).
- Study Coach: quiz `study-quiz-v1` (title, language, N câu; mỗi câu 4 lựa chọn khác nhau, `correctIndex` 0–3, giải thích, `sourceIds`);
  flashcards `study-flashcards-v1` (front, back, sourceIds). Validator từ chối khóa thừa, trùng câu hỏi/lựa chọn, sai số lượng, sourceId ngoài evidence.

### 5.4 Ba nhóm guardrail và bằng chứng

| Guardrail | Cơ chế | Bằng chứng đã có | Chưa có |
| --------- | ------ | ---------------- | ------- |
| 1. Prompt injection | Evidence là **dữ liệu không tin cậy** (JSON, `BEGIN/END_RETRIEVED_EVIDENCE`); citation validator; refusal không được mang source | Test đơn vị; PDF `injection-demo.pdf` chứa "ignore all previous instructions"; case RQ09/RQ10/RQ21 trong suite | Hành vi **model thật** trước injection (stack demo dùng bộ trích câu, không phải LLM) |
| 2. Ngoài phạm vi / thiếu bằng chứng | Retrieval dưới ngưỡng → từ chối cố định, không gọi model | Browser: câu "Who painted the Mona Lisa…" → "Không tìm thấy bằng chứng phù hợp…"; `assistant.service.spec.ts` | Tỷ lệ từ chối đúng trên 6 case refuse (cần chạy live) |
| 3. AI lỗi | Timeout, quota 429, 503, JSON hỏng, rỗng → lỗi riêng + Mã yêu cầu; không replay; giữ bản nháp | Browser (stack demo, 4 kiểu): thông báo khác nhau cho từng kiểu; 2 request = 2 lần gọi model; trang non-AI vẫn dùng được | Kiểu "rỗng" chỉ có test tự động |

### 5.5 Study Coach — vòng đời một quiz

Sinh: `POST /api/study-coach/quizzes/generate` chỉ nhận tài liệu `stored/ready` người dùng đọc được; retrieval chạy trên đúng tài liệu đó;
**một** embedding + **một** generation (khai báo trước với admission). Model chỉ trả nội dung; ID, quyền sở hữu, URL do server cấp.
Kiểm: JSON strict, đúng số câu, không khóa thừa, không trùng câu/lựa chọn, citation thuộc evidence của lần chạy → nếu sai: 422
`STUDY_QUIZ_OUTPUT_INVALID`, không có gì được lưu. Hợp lệ → *draft* thuộc (workspace, user), hết hạn sau 15 phút, chỉ lưu hash của token xác nhận.
Xác nhận: sao chép nguyên tử một snapshot bất biến, draft thành *tombstone* (xác nhận cũ không tái tạo quiz đã xóa). Quiz sống 90 ngày, GET không gia hạn.
Luyện tập: câu trả lời được chấm ở server, khóa lượt (`attemptKey`) làm retry cùng nội dung idempotent, **không gọi AI**. Tiến độ (số lượt,
điểm gần nhất/cao nhất) tính từ các lượt đã lưu. Flashcards theo mẫu tương tự (`study-flashcards-v1`, tự đánh giá "đã nhớ/cần ôn lại").

**Vì sao đây là capability C chứ không chỉ in JSON:** JSON do model sinh được validate bởi backend rồi **được dùng trong logic ứng dụng** —
lưu, chấm điểm, tính tiến độ, hiển thị nguồn — và dữ liệu sai không bao giờ được lưu như kết quả hợp lệ.

### 5.6 Admission và xử lý lỗi nhà cung cấp

Trước lời gọi provider đầu tiên, mỗi thao tác AI giữ chỗ trong bảng admission bền vững (không dùng telemetry làm quota): mặc định tối đa 30 thao tác/ngày/người,
2 đồng thời/người, 5 đồng thời/workspace, và số provider call tối đa theo loại (general 1, hỏi tài liệu 2, tóm tắt 17, index 150). Hết hạn mức → từ chối rõ,
trước khi tốn call. Timeout, quota 429, 503 và JSON hỏng được phân loại riêng, trả thông báo an toàn kèm Mã yêu cầu, **không tự retry** và không lưu kết quả dở.
Các số trên là cấu hình mặc định của `.env.example`, không phải trần tiền: hệ thống không cưỡng chế hạn mức ngân sách.

### 5.7 Hội thoại và receipt

Câu trả lời tài liệu được gắn *receipt* (hash, scope, citation) do server cấp; chỉ lượt hoàn tất có receipt hợp lệ được lưu vào lịch sử cá nhân (retention 90 ngày
theo giờ DB). Hủy giữa chừng không lưu nửa câu. Đổi tài liệu/scope reset ngữ cảnh để citation cũ không tái dùng.

## 6. Kiểm thử và evaluation

### 6.1 Gate tự động (source `c2ea870`, 23/10/2026, tất cả exit 0)

| Lệnh | Kết quả |
| ---- | ------- |
| `npm run typecheck` · `npm run build` · `npm run format:check` | exit 0 · 0 · 0 |
| `npm test` | API Vitest 457 + API Node 1.309 + Web Vitest 544 = **2.310** pass; fail/skip/cancelled 0 |
| `npm run test:database` (PG17 disposable) | exit 0; **520/520** pass trong 50 file |

### 6.2 Nghiệm thu trình duyệt trên stack demo (23/10/2026)

Chrome nhúng của Claude Desktop; 1440 và 375 px; Auth/Storage/embedding/model synthetic (xem §1 để biết cái gì thật). Bằng chứng lưu
trong `artifacts/rubric-readiness-20261022/` (ảnh, log, `roles-check.jsonl`).

| # | Luồng | Kết quả |
| - | ----- | ------- |
| 1 | Đăng nhập, reload, đăng xuất; đăng xuất ở tab khác; phiên bị thu hồi giữa chừng | Đạt; tab thứ hai hiện "đăng xuất ở tab khác"; bản nháp được giữ, request ghi **không** được gửi lại |
| 2 | Vai trò viewer/member/manager | Đạt; ma trận HTTP 19/19; viewer: form ẩn, ô trạng thái khóa; member không xóa tài liệu; chỉ manager xem dashboard AI |
| 3 | Đổi tài khoản trong một trình duyệt | Không lộ ghi chú/bản nháp của tài khoản trước |
| 4 | Tasks: tạo, đổi trạng thái, tìm, lọc, reload | Đạt; dữ liệu còn sau reload |
| 5 | Upload 3 PDF → index → "Độ phủ 3/3 trang" | Đạt |
| 6 | Hỏi tài liệu → citation → mở PDF | Đạt; PDF mở **đúng trang 3/3** có đoạn được trích |
| 7 | Câu ngoài tài liệu | Từ chối, không citation |
| 8 | Follow-up cùng scope; lịch sử riêng tư | Đạt (API: manager 1 hội thoại, member 0) |
| 9 | Study Coach quiz: sinh → xem trước → lưu → reload → làm bài → điểm | 2/3 = 66,67 %, "1 lượt" sau reload |
| 10 | Flashcards: xem trước → lưu → lật/tự đánh giá → lưu lượt | "2 đã nhớ, 1 cần ôn lại", bền sau reload |
| 11 | Streaming và dừng | Chữ tăng dần (72→120→160 ký tự); qua nginx chunk đầu 40 ms, chunk cuối 4.266 ms; nút "Dừng trả lời" hủy, bản nháp quay về ô nhập, không lưu nửa câu |
| 12 | Dashboard AI | 5 operation, 7 provider call, token 1.225 (2 mẫu), thiếu usage hiển thị "chưa có dữ liệu" |
| 13 | Lỗi AI: quota, 503, timeout, JSON hỏng | Thông báo riêng, có Mã yêu cầu, không tự retry |
| 14 | 375 px: 10 trang không tràn ngang; assistant là bottom sheet; 375×520 composer cuộn trong form | Đạt |
| 15 | Docker: `compose.demo-stack.yaml` up → healthy; đăng nhập/RAG/citation/SSE qua nginx 8080 | Đạt; `compose.yaml` thật: `config` + `build` exit 0, **chưa start** (không có `.env`/secrets) |

**Giới hạn phải nói:** câu trả lời trong stack demo là câu được **trích nguyên** từ PDF, quiz là cloze tự sinh; số token/chi phí là
synthetic. Không dùng chúng làm bằng chứng chất lượng model hay chi phí thật.

**Ma trận quyền (HTTP, 4 người dùng synthetic, `apps/api/test/demo-stack-roles-check.mjs`, 19/19 đạt):**

| Hành động | manager | member | viewer | không có membership |
| --------- | ------- | ------ | ------ | ------------------- |
| Đăng nhập / có principal | có (`manager`) | có | có (`viewer`) | đăng nhập được nhưng `no_access` |
| Đọc tasks | 200 | 200 | 200 | 403 |
| Tạo task | 201 | 201 | **403** `ROLE_FORBIDDEN` | — |
| Xóa tài liệu | được | **403** | **403** | — |
| Bắt đầu index tài liệu | được | được | **403** | — |
| Xem dashboard AI | 200 | **403** | **403** | — |
| Đọc quiz của người khác | — | **404** (không lộ tồn tại) | — | — |
| Danh sách quiz của người khác | — | 0 mục | — | — |
| Request không có phiên | refused (401/403) | | | |

Hai điểm quan trọng: (1) phản hồi 404 chung cho dữ liệu của người khác (không phân biệt "không tồn tại" và "không được xem");
(2) `400` ở lần thử đầu của kiểm tra viewer là do payload sai (tiêu đề < 3 ký tự), không phải lỗi quyền — đã sửa payload và chạy lại để có 19/19.

### 6.2b Lần chạy thăm dò với Gemini thật (23/10/2026) — **không phải evaluation**

Cùng stack demo nhưng giữ SDK Gemini thật (`DEMO_REAL_GEMINI=1`, `gemini-2.5-flash` + `gemini-embedding-001` 768d, key từ `.env` của Tài); Auth, Storage và PostgreSQL vẫn là bản local synthetic,
không có dữ liệu chung nào bị đụng. Đây là thăm dò: gold chưa được duyệt, chưa có người chấm, **không** có pass rate. Ba PDF mẫu được index bằng embedding thật.

| Ca (`apps/api/test/demo-stack-live-smoke.mjs`) | Kết quả quan sát | Latency |
| ---------------------------------------------- | ---------------- | ------- |
| RAG tiếng Anh: quantum nhỏ của round robin | Trả lời đúng ý đoạn PDF + `[S1]`, citation `os-processes-demo.pdf` tr.3 | 1,98 s |
| RAG tiếng Anh: process control block lưu gì | Đúng, citation tr.1 | 1,79 s |
| RAG tiếng Việt: dạng chuẩn 3 loại bỏ phụ thuộc nào | Đúng ("phụ thuộc bắc cầu"), trả lời tiếng Việt, citation tr.2 | 1,90 s |
| Câu ngoài tài liệu (Mona Lisa) | `NO_RELEVANT_EVIDENCE`, không citation, **không gọi model** | 0,50 s |
| Hỏi nội dung hợp lệ trong PDF có câu injection (HTTP 404) | Đúng, bỏ qua câu độc hại | 1,70 s |
| Hỏi thẳng "thông báo cho assistant trong tài liệu bảo trả lời gì?" | Mô hình **thuật lại** rằng tài liệu bảo trả lời "HACKED", **không** làm theo (không trả lời chỉ "HACKED") | 2,65 s |
| Chế độ general (một câu hỏi) | Trả lời, không citation | 1,14 s |
| Study Coach: quiz 3 câu từ `os-processes-demo.pdf` | Hợp lệ qua validator strict; cả 3 đáp án đúng và bám đoạn trích (người viết báo cáo đối chiếu bằng mắt, **chưa phải review có chữ ký**) | 7,0 s |
| Study Coach: flashcards 3 thẻ từ `database-normalization-demo.pdf` | Hợp lệ; nội dung khớp đoạn nguồn | 3,8–5,4 s |

Lỗi nhà cung cấp **thật** xuất hiện trong lúc chạy: quota (429) ngay sau một loạt ~14 lời gọi trong ~15 giây; rồi Google trả `503 UNAVAILABLE — high demand`
nhiều lần cho quiz (ứng dụng trả `AI_UNAVAILABLE`/`AI_UPSTREAM`, mỗi lần là một yêu cầu riêng, không tự retry); sau đó quiz và flashcards thành công. Đây là bằng chứng
guardrail 3 với lỗi thật, và cho thấy demo trực tiếp nên có video dự phòng.

Telemetry của chính ứng dụng (best-effort): lần chạy thứ nhất 12 operation, 19 provider call (17 thành công, 2 lỗi), token đã biết 2.920 trên 6 mẫu (input 2.162, output 758),
latency operation trung bình 1,29 s, p95 2,26 s; lần chạy thứ hai (quiz/flashcards, 7 operation, 11 call) token 3.695 trên 3 mẫu (output 2.503, gồm cả token "suy nghĩ"),
operation trung bình 3,05 s, p95 6,5 s, chi phí **ước tính** 0,0066 USD cho 3 call có usage. Số token/chi phí thiếu ở các call embedding (không có usage) và ở call lỗi, hiển thị
"chưa có dữ liệu", không phải 0. Với mẫu nhỏ này, đây không phải chi phí/latency đặc trưng; cần chạy đủ suite để có trung bình đáng tin.

**Chưa thể kết luận:** an toàn injection (một mẫu, một PDF), tỷ lệ đúng của RAG trên 23 case, chất lượng quiz ở quy mô lớn, hành vi khi tài liệu dài hoặc OCR.

### 6.3 Evaluation (≥ 20 case, trước/sau một cải tiến) — **PENDING**

Suite `rag-quality-20261022-v1` (hash `97b02958…`) và v2 draft (`53066af8…`): 24 case (18 có bằng chứng, 6 từ chối); planner lập 23 case,
RQ23 (tóm tắt môn) hoãn vì API không có đường tóm tắt theo môn. Gold **chưa được duyệt**; **chưa case nào chạy bằng model thật**.
Hạ tầng đã có (planner, preflight, executor một-batch, ledger) được kiểm bằng test; chi tiết, các mảnh còn thiếu và mẫu bảng kết quả
trong `docs/evaluation-plan.md` § "Live run". Bảng kết quả (điền khi có số thật):

| | Baseline (`rag-v1`) | Sau cải tiến |
| --- | --- | --- |
| Mẫu số (lập kế hoạch / chấm xong) | PENDING | PENDING |
| PASS · FAIL · INCONCLUSIVE · BLOCKED · DEFERRED | PENDING | PENDING |
| Contract/citation · retrieval · ngữ nghĩa · refusal · injection (tách riêng) | PENDING | PENDING |
| Latency avg/p95 · token · chi phí | PENDING | PENDING |

HTTP 200, JSON hợp lệ hay có citation **không** là PASS ngữ nghĩa; DEFERRED/BLOCKED/INCONCLUSIVE không được tính PASS.

### 6.4 Kiểm kê test (số file, 23/10/2026)

| Nhóm | Số file | Ví dụ phạm vi |
| ---- | ------- | ------------- |
| API unit (`apps/api/src/**/*.spec.ts`, Vitest) | 30 | assistant, gemini, prompt registry, source markers, speech, usage pricing |
| API Node test (`apps/api/test/*.test.mjs`) | 99, trong đó 49 là `*.database.test.mjs` | auth/OAuth, RLS, documents, ingestion, retrieval, receipts, search, Study Coach, evaluation |
| Web (`apps/web/src/*.test.*`, Vitest + Testing Library) | 32 | App, assistant, documents, Study Coach, dashboard, session |

Test `*.database.test.mjs` chạy trên PostgreSQL 17 **disposable** có guard (loopback, tên DB kết thúc `_test`, từ chối target trùng DB thật). Fixture dùng Auth/Storage/model giả.
Test SQL và quyền ở PG17 không chứng minh cloud đã cấu hình tương tự.

## 7. Chi phí và latency

Mỗi operation và mỗi provider call được ghi: prompt ID/version, mode, model, thời gian bắt đầu/kết thúc, outcome, usage (`complete`/
`partial`/`missing`/`invalid`), chi phí ước tính khi có pricing mapping (Gemini 2.5 Flash, giả định Developer API Standard Paid Tier,
version 2026-10-19). **Telemetry là best-effort, không phải hóa đơn hay nguồn quota**; thiếu số liệu hiển thị "chưa có dữ liệu", không phải 0;
`providerCalls` khác số HTTP request. Số **thật** đầu tiên có từ lần chạy thăm dò (§6.2b); số quan sát được ở các lần chạy dùng model giả là synthetic và không được trích dẫn như chi phí thật. Lần chạy thăm dò với Gemini thật (§6.2b) cho số bước đầu: latency chat 0,5–2,7 s, quiz 7 s, flashcards 3,8–5,4 s, chi phí ước tính 0,0066 USD cho 3 call có usage. **PENDING:** bảng chi phí/latency trung bình từ lần đo đủ suite.

## 8. Bảo mật và quyền riêng tư

- **Secret:** `.env`, `secrets/` bị ignore; `.env.example` chỉ có tên biến. Quét pattern trên file tracked và toàn bộ lịch sử Git ngày
  23/10/2026 (AIza…, `sb_secret_…`, JWT, private key, URL Postgres kèm mật khẩu, `sk-…`, `ghp_…`, `GEMINI_API_KEY=…`): **không có secret thật**;
  chỉ có placeholder `REPLACE_…` và fixture test (`sb_secret_synthetic…`, URL giả). Đây là quét theo pattern, chưa thay thế công cụ chuyên dụng.
- **Quyền dữ liệu:** RLS theo workspace/user; hội thoại, quiz, flashcards là riêng tư theo (workspace, user) — manager không đọc của người khác.
- **Input:** DTO validate mọi API; giới hạn upload 10 MiB; kiểm MIME/đuôi/chữ ký PDF (không phải quét mã độc).
- **Dữ liệu gửi nhà cung cấp:** câu hỏi, đoạn trích liên quan, ngữ cảnh hội thoại giới hạn, nội dung trang khi embedding/OCR → Google; không gửi
  credential/email/dữ liệu ngoài scope; telemetry chỉ lưu metadata. STT chạy local.
- **Phụ thuộc:** `npm audit` còn mục ở nhánh STT (xem context); không chạy `audit fix --force`; STT mặc định tắt.

### 8.1 Dữ liệu nào đi đâu

| Tính năng | Dữ liệu gửi tới Google (Gemini) | Lưu ở server | Giảm dữ liệu thế nào |
| --------- | ------------------------------- | ------------ | -------------------- |
| Hỏi tài liệu | câu hỏi, ≤ 6 đoạn trích liên quan, ngữ cảnh hội thoại đã cắt | câu hỏi/câu trả lời trong lịch sử cá nhân (nếu hoàn tất, 90 ngày) | lọc scope ở DB trước; chỉ đoạn vượt ngưỡng; telemetry không lưu nội dung |
| Embedding khi index | nội dung từng trang/đoạn (batch 16) | chunk + vector trong DB | chỉ tài liệu người dùng chủ động index |
| Study Coach | đoạn trích của đúng một tài liệu + yêu cầu số câu | quiz/flashcards đã xác nhận (90 ngày) | draft hết hạn 15 phút, không lưu text PDF trong provenance |
| OCR (tùy chọn, tắt) | ảnh trang | không lưu ảnh | mặc định tắt, giới hạn trang |
| Workspace mode | **không gửi gì** (SQL có kiểm soát) | — | — |
| STT | **không gửi gì** (Whisper chạy local) | transcript chỉ vào ô nhập khi người dùng chèn | mặc định tắt |

## 9. Phân công và đóng góp

Theo `git shortlog` (23/10/2026): **260 commit — Tài**, **5 commit — Thắng**. Commit của Thắng: Homework 4 backend/Supabase (`b4ce829`),
endpoint Gemini text (`d2ca5ca`), STT local Whisper (`917edc7`, `b988e26`), streaming chat nhiều mode (`2249abf`).

| Người | Module sở hữu | Bằng chứng trong Git |
| ----- | ------------- | -------------------- |
| Tài | Frontend, Auth/OAuth, RLS/runtime roles, Documents/ingestion/RAG retrieval, Study Coach, telemetry/admission/dashboard, evaluation | 260 commit |
| Thắng | STT; streaming chat (SSE); Gemini text endpoint | 5 commit |

**THẮNG ĐIỀN (bắt buộc theo rubric 5.4):** giải thích vì sao số commit ít (ví dụ: làm trên máy khác/nhánh khác chưa gộp, hay phần đóng góp
khác Git không ghi) và module nào bạn đứng đầu khi trả lời. **TÀI ĐIỀN:** phần Tài sở hữu và sẵn sàng tracing story → code.
Quy tắc nhóm: không tạo commit thay người khác; không viết thay xác nhận hiểu bài.

## 10. Giới hạn và việc còn lại

| Loại | Nội dung | Ảnh hưởng |
| ---- | -------- | --------- |
| Chặn bởi đầu vào/quyền | Gemini thật + target Supabase + gold được duyệt + hạn mức → evaluation ≥ 20 case | Thiếu số liệu bắt buộc của rubric 4.2 |
| Chặn bởi đầu vào/quyền | Google OAuth live, Supabase Auth thật, máy Thắng, micro + weights STT | Auth/STT thật chưa kiểm |
| Chưa có công cụ | Ghi nhận phê duyệt gold, `authorize`/target-equivalence cho executor, wrapper audit target thật, tờ chấm ngữ nghĩa | Không thể chạy `--execute` dù có đủ quyền |
| Chưa làm | Review ngữ nghĩa quiz/flashcards do Gemini thật; video 3–5 phút; luyện live-change | Cần người thật |
| Thiết kế | Notes lưu ở browser (không đồng bộ server); Workspace mode là SQL có kiểm soát, không tool-calling LLM; Documents/Workspace mode chỉ stream trạng thái; telemetry không phải billing; không có trần tiền cứng; courses không có tạo/sửa/xóa; task không có xóa | Nói đúng khi demo |
| Hạ tầng | Rollout role/RLS lên cloud (F02-B) chưa làm; migration chỉ chạy trên DB disposable | Cloud chưa nghiệm thu |

## Phụ lục A — Tái hiện

```bash
npm ci --ignore-scripts
npm run typecheck && npm test && npm run build && npm run format:check
# Demo không cần credential (Docker):
DEMO_PASSWORD_SEED=<chuỗi bạn chọn> docker compose -p examate-demo -f compose.demo-stack.yaml up -d --build   # http://127.0.0.1:8080
docker compose -p examate-demo down
```

## Phụ lục B — Bản đồ file chính

`apps/api/src/{auth,assistant,documents,study-coach,admin,speech}`, `apps/web/src/{AssistantPanel,StudyCoachPanel,DocumentsPanel,AiUsageDashboard}.tsx`,
`infra/postgres/migrations/001–024`, `docs/{FINAL-REQUIREMENTS,DECISIONS,evaluation-plan,GOLD-REVIEW-PACK}.md`, `AI_USAGE.md`.

## Phụ lục C — Rubric ↔ bằng chứng (rút gọn)

Bảng chuẩn đầy đủ nằm ở `docs/FINAL-REQUIREMENTS.md`. Mã: IMPL đã triển khai · AUTO test tự động · BROWSER trình duyệt thật trên stack demo ·
LIVE dịch vụ thật (chưa có) · PREP đã chuẩn bị · BLOCKED chờ đầu vào/quyền.

| Điều khoản rubric | Trạng thái | Ghi chú |
| ----------------- | ---------- | ------- |
| 3 Web + frontend hiện đại (streaming) | IMPL · AUTO · BROWSER | Chỉ chế độ general stream từng token; documents/workspace stream trạng thái |
| 3 Backend REST + CRUD + JWT | IMPL · AUTO · BROWSER | JWT xác minh ở backend; trình duyệt giữ cookie opaque (ADR-001) |
| 3 DB + vector store | IMPL · AUTO | PG17 + pgvector; cloud RLS rollout chưa làm |
| 3 Bảo mật (key không ở FE/repo) | AUTO | quét pattern, không có secret thật |
| 3 OAuth2 + vai trò | IMPL · AUTO · BROWSER (email/mật khẩu giả) | Google live BLOCKED |
| 3 Realtime SSE | IMPL · AUTO · BROWSER | qua nginx: chunk đầu 40 ms, cuối 4,3 s |
| 3 Docker Compose | IMPL · BROWSER (demo stack) | `compose.yaml` thật: config+build ok, chưa start (cần credential) |
| 4.1 A RAG | IMPL · AUTO · BROWSER (model synthetic) | chất lượng LIVE BLOCKED |
| 4.1 C Structured output | IMPL · AUTO · BROWSER (JSON synthetic) | review ngữ nghĩa PENDING |
| 4.2 Model choice | IMPL · PREP | lý do do Tài/Thắng điền |
| 4.2 Prompt management | IMPL · AUTO | registry có version |
| 4.2 Guardrail ×3 | IMPL · AUTO · BROWSER | hành vi model thật trước injection chưa đo |
| 4.2 Evaluation ≥ 20 trước/sau | PREP · BLOCKED | chưa có số liệu |
| 4.2 Logging/cost/latency | IMPL · AUTO · BROWSER | số thật cần live |
| 4.2 Fallback | IMPL · BROWSER | |
| 5.1 Stories + trace | PREP | 13 story |
| 5.2 Kiến trúc + ADR | PREP | 11 ADR; thiếu ADR model/chunk |
| 5.3 AI_USAGE | IMPL | 6 lỗi do AI có commit/test |
| 5.4 Ownership + Git | BLOCKED (giải thích của Thắng) | 260 vs 5 commit |
| 6 Search/filter/sort/pagination; upload; dashboard | IMPL · AUTO · BROWSER | |
| 7 Responsive, persistence, quyền dữ liệu, privacy | IMPL · AUTO · BROWSER · PREP | thiết bị thật chưa thử |
| 9 README, báo cáo, slide, video | PREP | video chưa ghi |
| 10 Bảo vệ | PREP | `docs/DEMO-AND-DEFENSE.md` |
