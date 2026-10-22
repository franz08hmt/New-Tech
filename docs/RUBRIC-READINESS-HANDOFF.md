# Bàn giao nghiệm thu rubric — 23/10/2026

**Verdict: `PARTIALLY_READY`** — chưa phải `READY_FOR_INDEPENDENT_REVIEW` toàn phần và **không** phải `RUBRIC_PASSED`.
Ứng dụng, stack demo, bộ tài liệu và hạ tầng evaluation đã sẵn để reviewer độc lập kiểm; ba nghĩa vụ của rubric còn thiếu bằng chứng
vì cần người/tài khoản/quyền bên ngoài: (1) evaluation ≥ 20 case trước/sau (cần Gemini thật + gold được duyệt), (2) OAuth2 Google chạy thật,
(3) demo từ bản triển khai dùng dịch vụ thật. Năm trạng thái dưới đây **không** tương đương nhau.

| Trạng thái | Nội dung |
| ---------- | -------- |
| Đã triển khai | A (RAG có citation/từ chối), C (Study Coach quiz + flashcards), SSE, STT (Thắng), dashboard AI, RLS, Docker Compose (thật + demo) |
| Đã kiểm tự động local | gates dưới đây; 49 file test DB trên PG17 disposable |
| Đã kiểm trong trình duyệt thật (**synthetic** Auth/Storage/model) | xem `docs/FINAL-DEMO-CHECKLIST.md` (mục 23/10/2026) và `docs/REPORT.md` §6.2 |
| Đã chuẩn bị, chưa thực hiện | evaluation live, video, slide/báo cáo final, luyện live-change |
| Bị chặn bởi đầu vào/quyền/phê duyệt | xem checklist dưới đây |

## 1. Việc Tài/Thắng cần làm — một checklist, có thứ tự

"Bắt buộc" = rubric hoặc demo thật không thể đạt nếu thiếu. Cung cấp credential **qua kênh riêng**, không dán vào chat/Git.

| # | Ai | Quyết định / đầu vào | Cách cấp an toàn | Mở khóa | Bắt buộc? |
| - | -- | -------------------- | ---------------- | ------- | --------- |
| 1 | Tài + Thắng | Chọn **v1 hay v2** và duyệt gold 24 case (`docs/GOLD-REVIEW-PACK.md`; khuyến nghị v2, có lý do) | Điền bảng/`gold-review-template.json`; tên người duyệt thật | Mọi bước evaluation | **Có** (rubric 4.2) |
| 2 | Thắng | Điền ô `THẮNG ĐIỀN` trong `docs/REPORT.md` §9: vì sao Git chỉ có 5 commit + module sở hữu | Tự viết | Rubric 5.4 | **Có** |
| 3 | Tài + Thắng | Lý do chọn model Gemini và chunk size (ô `ĐIỀN` §4–5, hoặc ADR-012) | Tự viết | Rubric 4.2 "model choice" | Nên |
| 4 | Tài (owner Supabase) | **Chuẩn bị cloud để chạy `compose.yaml` thật**: cloud hiện chỉ có migration 001–015; app cần 001–024 + role business/Auth non-owner (F02-B). Sao lưu, cửa sổ bảo trì, runbook `docs/PILOT-B1-RUNBOOK.md`, kế hoạch rollback | Maintenance credential chỉ trên máy bạn; không để trong `.env` của API | Demo bằng stack thật, Auth thật | **Có** nếu demo bằng stack thật |
| 5 | Tài (owner Supabase/Google) | Bật Google provider + redirect allowlist (`/api/auth/google/callback`) + áp migration 016; `AUTH_GOOGLE_ENABLED=true` | Console Google/Supabase | **OAuth2 Google thật** (rubric 3: login OAuth2) | **Có** |
| 6 | Tài | Tạo `.env` + `secrets/` cho `compose.yaml` (Supabase, `GEMINI_API_KEY`, `SESSION_ENCRYPTION_KEY`…) | Editor riêng; không gửi chat | Chạy `compose.yaml`, AI thật | **Có** |
| 7 | Tài | **Cho phép gọi Gemini thật** + trần: số request/batch (đề xuất ≤ 5), số batch, quota tài khoản, ngân sách | Ghi trong approval record từng batch | Evaluation live, quiz thật | **Có** (4.2) |
| 8 | Dev (agent hoặc người) sau #1 và #7 | Hoàn thiện 4 mảnh còn thiếu của executor: ghi nhận phê duyệt gold, `authorize`, target-equivalence, wrapper audit target thật, tờ chấm ngữ nghĩa (`docs/evaluation-plan.md` § Live run, mục C) | Không cần credential để viết; cần để chạy | `--execute` | Có |
| 9 | Tài + Thắng | Audit provenance (maintenance chỉ đọc) → preflight → từng batch → **chấm ngữ nghĩa bằng người** → baseline → một cải tiến → chạy lại | Credential riêng, stdin | Số liệu 4.2 | **Có** |
| 10 | Thắng | Đăng nhập trên máy Thắng; STT: weights + micro; thử VI/EN/trộn, audio dài; báo kết quả | Máy của Thắng | Nghiệm thu STT (`docs/PILOT-DEMO-HANDOFF.md`, `docs/STT-SETUP-VI.md`) | Nên (đã trình bày STT) |
| 11 | Tài + Thắng | Chấm tay mẫu quiz/flashcards do Gemini thật sinh (đúng sự thật? bám tài liệu?) | Tờ chấm | `SEMANTIC_REVIEW_PENDING` | Nên |
| 12 | Tài + Thắng | Điền kết quả evaluation vào báo cáo/slide; dựng lại PDF/PPTX; bỏ chữ DRAFT | `python scripts/build-submission-docs.py <dir>` | Bộ nộp cuối | **Có** |
| 13 | Tài + Thắng | **Quay video 3–5 phút** từ bản Docker thật (shot list trong `docs/DEMO-AND-DEFENSE.md` §3) | Phần mềm ghi màn hình | Video dự phòng | **Có** |
| 14 | Mỗi người | Luyện live-change 10 phút và Q&A 12 phút (module của mình + một module bạn cùng nhóm) | — | Điểm cá nhân 20 % | **Có** |
| 15 | Tài | Dọn tài nguyên F09-A.1 bị chặn (`RESOURCE_CLEANUP_BLOCKED`, container `examate-f09a1-pg17-20261022` đang Exited) **sau khi xác minh sở hữu** | Tay | Gọn gàng | Không |
| 16 | Tài | Quyết định có nâng `@huggingface/transformers` (npm audit: 3 high, 4 moderate qua chuỗi STT) hay giữ STT tắt khi demo | `npm install` thủ công sau khi xem changelog | Giảm rủi ro | Nên |

Thứ tự khuyến nghị: 1 → 2/3 (song song) → 4–6 → 7 → 8 → 9 → 11 → 12 → 13/14. Không chờ #4–#7 để làm #2, #3, #14.

## 2. Bằng chứng kiểm tra

Candidate: nhánh `feature/tai-assistant-integration-20261018`, source code ứng dụng giữ nguyên so với `c2ea870`; gates chạy trên working tree gồm các file thêm bên dưới (chưa commit lúc chạy); đợt này chỉ thêm
test harness, script, compose demo và tài liệu. Chưa push.

| Lệnh (từ thư mục gốc) | Kết quả mới (23/10/2026) |
| --------------------- | ------------------------ |
| `npm run typecheck` | exit 0 (30 s) |
| `npm test` | exit 0 (382 s): API Vitest 457 + API Node 1.309 + Web Vitest 544 = **2.310** pass; fail/skip/cancelled 0 |
| `npm run build` | exit 0 (37 s) |
| `npm run format:check` | exit 0 (22 s) |
| `npm run test:database` (PG17 disposable, container riêng) | exit 0 (250 s): **520/520** pass trong 50 file; fail/skip/cancelled 0 |
| `docker compose --env-file .env.example config --no-env-resolution --quiet` | exit 0 |
| `docker compose -p examate-rubric20261022 build` (api + web của `compose.yaml`) | exit 0; **chưa start** (không có `.env`/secrets) |
| `docker compose -p … -f compose.demo-stack.yaml up -d --build` | up → api healthy → web 200 → `/api/health` ok qua nginx 8080 |
| Ma trận quyền (`apps/api/test/demo-stack-roles-check.mjs`) | native 19/19; trong container (qua nginx) 16/16 (không có quiz nên 3 kiểm tra quiz bỏ qua) |
| SSE qua nginx (`demo-stack-stream-check.mjs`, scenario `slow`) | 9 chunk, chunk đầu 40 ms, cuối 4.266 ms |
| Quét secret lịch sử Git (pattern) | không có secret thật; chỉ placeholder/fixture |
| `npm audit --omit=dev` | 7 mục (3 high, 4 moderate), đều từ chuỗi STT + `vite` dev-server; không áp fix |

Artifacts (git-ignored): `artifacts/rubric-readiness-20261022/` — `screens/` (ảnh), `roles-check*.jsonl`, `gates-baseline.txt`, `gates-final.txt`,
`final-gate-*.log`, `docker-*.log`, `submission/` (`ExaMate-report-DRAFT.pdf`, `ExaMate-slides-DRAFT.pdf/.pptx`).

Số liệu **không** phải ở đây: chưa có pass rate, chi phí/latency thật, chất lượng model, STT accuracy, Google OAuth live, máy Thắng.

## 3. Handoff cho reviewer độc lập

**File đổi trong đợt này (không có file sản xuất):**

| File | Mục đích |
| ---- | -------- |
| `apps/api/test/demo-stack-server.mjs`, `demo-stack-seed.mjs`, `demo-stack-wait-db.mjs`, `fixtures/demo-pdfs/*`, `fixtures/make-demo-pdfs.mjs` | Stack demo test-only |
| `apps/api/test/demo-stack-roles-check.mjs`, `demo-stack-stream-check.mjs` | Ma trận quyền HTTP; kiểm SSE tăng dần |
| `compose.demo-stack.yaml` | Demo trong Docker, không credential |
| `scripts/build-submission-docs.py` | Dựng PDF báo cáo + PPTX/PDF slide từ Markdown |
| `docs/{REPORT,SLIDES,DEMO-AND-DEFENSE,GOLD-REVIEW-PACK,RUBRIC-READINESS-HANDOFF}.md`, `docs/architecture.svg` | Bộ nộp và bảo vệ |
| `docs/{FINAL-REQUIREMENTS,evaluation-plan,FINAL-DEMO-CHECKLIST,PROJECT-CONTEXT,DECISIONS}.md`, `AI_USAGE.md`, `README.md` | Ma trận rubric, user stories, runbook evaluation, đính chính |

**Lỗi tìm thấy/sửa trong đợt (đều thuộc harness, không đổi sản phẩm):** refusal của model giả trả `answer` rỗng (production từ chối đúng); đọc nhầm `parts[0]`;
giới hạn đăng nhập của fixture; `sed` làm hỏng hai file Markdown (khôi phục + kiểm diff); claim sai "v1 lập 22 case" (thực tế 23 + 1 hoãn).
Regression: không có test mới cho harness (nó là công cụ kiểm, được chạy thật nhiều lần); `compose.demo-stack.yaml` được kiểm bằng up/health/smoke.

**Nên thử phá:**
1. Stack demo: đăng nhập từng vai trò rồi gọi API thẳng (bỏ CSRF/Origin, đổi `workspaceId` trong body, ID tài liệu của người khác) — kỳ vọng 401/403/404.
2. Hủy request giữa lúc stream (scenario `slow`) rồi xem DB: không có hội thoại nửa câu; đếm `ai_usage_provider_calls`.
3. Quiz: sửa JSON trả về của "model" (scenario `malformed`) — không có quiz nào được lưu.
4. Hai tab, đăng xuất ở một tab; phiên hết hạn (`/control/expire`) rồi gửi form — bản nháp còn, request ghi không được gửi lại.
5. 375 px và viewport 375×520: composer có cuộn được không, nút gửi có tới được không.
6. Đọc `docs/FINAL-REQUIREMENTS.md`: mọi chữ `BROWSER` có đúng là chạy trong browser trên stack demo, không phải dịch vụ thật?

**Claim chưa được kiểm chứng (đừng tin):** chất lượng/độ an toàn của Gemini thật; pass rate; chi phí/latency thật; Google OAuth; Supabase thật; STT accuracy;
cloud RLS; `compose.yaml` start thành công (chỉ config + build); thiết bị di động thật; keyboard/focus; mở lại hội thoại từ lịch sử bằng UI; xóa quiz/flashcards bằng UI.

**Giới hạn đã biết:** stack demo mất dữ liệu khi dừng (tmpfs); embedding băm không phản ánh embedding thật (ngưỡng `RAG_MIN_SCORE` được hạ cho harness);
signed URL của stack demo trỏ tới cổng 3999 (không phải Storage thật, không kiểm đường ký của Supabase); panel Assistant đóng khi Browser pane bị ẩn/hiện (chưa rõ nguyên nhân).
