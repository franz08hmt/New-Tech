# Demo, video dự phòng và chuẩn bị bảo vệ

Tài liệu này thay các checklist rời: kịch bản demo 8 phút, shot list video 3–5 phút, bài sửa nhỏ cho "live change" 10 phút
và câu hỏi Q&A cá nhân 12 phút. Rubric: mục 10 (demo 8 phút, live change 10 phút, Q&A 12 phút; vắng mặt không lý do = 0 phần cá nhân).
**Không ai viết thay phần hiểu bài của người kia**; các ô `ĐIỀN` do chính người đó trả lời.

## 1. Chọn môi trường demo — và nói đúng nó là gì

| Môi trường | Khi nào | Lời phải nói |
| ---------- | ------- | ------------ |
| `compose.yaml` + `.env` thật (Supabase + Gemini) | **Dùng cho buổi bảo vệ chính thức** khi đã có credential và đã tự kiểm tra từng máy | "Đây là bản chạy trong Docker với dịch vụ thật." Chỉ nói vậy khi đúng vậy. |
| `compose.demo-stack.yaml` (không credential) | Luyện tập, video dự phòng khi không có credential, kiểm tra UI/quyền/lỗi | "Đây là stack demo: Auth, Storage và **model là giả lập**. Câu trả lời là câu trích từ PDF, không phải đầu ra Gemini." Không bao giờ gọi nó là live model. |

Dựng stack demo (Docker Desktop đang chạy; cổng 8080 và 3999 trống):

```bash
DEMO_PASSWORD_SEED=<chuỗi bạn chọn> docker compose -p examate-demo -f compose.demo-stack.yaml up -d --build
# mở http://127.0.0.1:8080 — đăng nhập manager@demo.test, member@demo.test, viewer@demo.test, outsider@demo.test
# mật khẩu mỗi tài khoản là "<chuỗi bạn chọn>-<vai trò>", ví dụ ...-manager
# dọn: docker compose -p examate-demo down   (dữ liệu nằm trong tmpfs và mất khi dừng — chủ ý)
```

Stack tự upload và index ba PDF mẫu (`apps/api/test/fixtures/demo-pdfs/`: process/thread/scheduling, database normalization,
và một PDF chứa câu "ignore all previous instructions"). Công tắc lỗi AI (chỉ stack demo):
`curl -X POST http://127.0.0.1:3999/control/scenario -d '{"scenario":"quota"}'` với `quota | unavailable | timeout | malformed | empty | slow | normal`.
Muốn thử ngoài Docker: xem `apps/api/test/demo-stack-server.mjs` (cần PG17 disposable có guard).

## 2. Kịch bản demo 8 phút (có A, C, một guardrail, một bằng chứng quyền/persistence)

| Giờ | Việc làm | Điều phải thấy / nói |
| --- | -------- | -------------------- |
| 0:00–0:40 | Bài toán và sơ đồ kiến trúc (slide 2–4) | Hai capability A + C; không nhận B/D; STT có nhưng không tính |
| 0:40–1:30 | Đăng nhập **manager**; tạo task; reload | Dữ liệu còn sau reload (persistence) |
| 1:30–3:30 | **A — RAG:** Documents → các PDF đã *Ready* (độ phủ trang) → Assistant → hỏi "What happens when the round robin time quantum is very small?" → mở citation | Câu trả lời có `[S1]` và nguồn; PDF mở **đúng trang 3**; nêu "câu này trích từ PDF" nếu đang ở stack demo |
| 3:30–4:15 | Hỏi câu ngoài tài liệu ("Who painted the Mona Lisa?") | **Guardrail 2:** từ chối cố định, không citation |
| 4:15–6:00 | **C — Study Coach:** chọn tài liệu → tạo bản xem trước (chưa lưu) → xác nhận lưu → mở → làm bài → nộp | Điểm do server chấm; tiến độ ("1 lượt, 66,67 %") còn sau reload; JSON sai không bao giờ được lưu |
| 6:00–6:40 | **Guardrail 3:** đặt scenario `quota` rồi hỏi | Thông báo "Dịch vụ AI đã hết quota" + Mã yêu cầu; trang Tasks vẫn dùng được; không tự gửi lại |
| 6:40–7:20 | Đăng xuất → đăng nhập **viewer**: Tasks không có form tạo, ô trạng thái khóa; manager mở "Sử dụng AI" | Quyền theo vai trò; dashboard: số operation, token, chi phí **ước tính**, "chưa có dữ liệu" khi thiếu |
| 7:20–8:00 | Giới hạn thật: chưa đo evaluation, chưa live Gemini; Workspace mode không phải tool-calling | Không tuyên bố tính năng chưa nghiệm thu |

Guardrail 1 (injection) cần model thật mới có ý nghĩa. Nếu đang ở stack demo, **không** dùng PDF injection như bằng chứng LLM an toàn; chỉ nói
cơ chế (evidence là dữ liệu không tin cậy, citation validator) và rằng hành vi model thật chưa được đo.

## 3. Video dự phòng 3–5 phút — **chưa ghi** (cần người quay, máy có công cụ ghi)

Công cụ ghi video không có trong phiên này nên video **chưa tồn tại**. Quay từ bản chạy Docker; nếu quay từ stack demo, chèn chữ "STACK DEMO — model giả lập"
ở đầu và cuối, và không đặt tên video là "live".

| Cảnh | Thời lượng | Lời dẫn (rút gọn) |
| ---- | ---------- | ----------------- |
| 1 Tiêu đề + bài toán | 0:20 | "ExaMate giúp nhóm sinh viên hỏi đáp trên chính tài liệu của mình và kiểm chứng được nguồn." |
| 2 Đăng nhập, dashboard, tạo task | 0:30 | quyền theo vai trò, dữ liệu bền |
| 3 Upload + index PDF | 0:35 | "Độ phủ 3/3 trang", Stored → Ready |
| 4 Hỏi + citation mở đúng trang | 0:50 | `[S1]` ↔ trang 3 |
| 5 Câu ngoài tài liệu | 0:20 | từ chối, không bịa |
| 6 Study Coach: preview → lưu → làm bài → tiến độ | 1:00 | JSON validate, chấm ở server |
| 7 Lỗi AI + dashboard | 0:40 | thông báo rõ; token/chi phí ước tính |
| 8 Kết: giới hạn và đóng góp | 0:25 | những gì chưa kiểm |

Dữ liệu cần chuẩn bị: ba PDF mẫu; tài khoản manager và viewer; scenario `quota`; cửa sổ 1440 px; tắt thông báo hệ thống; không quay `.env`, Dashboard khóa, cookie.

## 4. Live change 10 phút — ba bài sửa nhỏ đã thử (không áp dụng vào repo)

Mỗi bài dưới đây đã được thử trong phiên 23/10/2026 rồi hoàn lại (working tree sạch); kết quả test ghi theo lần thử thật.

| # | Yêu cầu giả định của giảng viên | Sửa gì | Test chạy và điều xảy ra | Giải thích khi sửa |
| - | ------------------------------- | ------ | ------------------------ | ------------------ |
| 1 | "Đổi một quy tắc prompt" (ví dụ: luôn trả lời bằng ngôn ngữ của câu hỏi) | Thêm một câu vào `DOCUMENTS_SYSTEM_INSTRUCTION` trong `apps/api/src/assistant/prompt-registry.ts`; bump version (`PROMPT_VERSIONS`/`RAG_PROMPT_VERSION`) | `npx vitest run src/assistant/prompt-registry.spec.ts src/assistant/assistant.service.spec.ts` → **2 test đỏ** (golden payload) — đúng ý: prompt đổi phải cập nhật golden có chủ đích | Prompt có version để đo trước/sau; golden test ngăn đổi prompt vô tình; version mới làm telemetry/evaluation phân biệt được |
| 2 | "Đổi chunk size" | `TARGET_CHUNK_CHARACTERS` (1.200) trong `apps/api/src/documents/document-chunker.ts` | `npx vitest run src/documents/document-chunker.spec.ts` → **vẫn xanh (8/8)**: test không ghim hằng số → phải **thêm** regression khẳng định mọi chunk ≤ `MAX_CHUNK_CHARACTERS` và số chunk đổi như mong đợi; tài liệu đã index phải re-index | Chunk nhỏ → truy xuất chính xác hơn nhưng nhiều vector và ngữ cảnh rời rạc; chunk lớn ngược lại; đổi chunk cần re-index và đo lại evaluation |
| 3 | "Thêm một ràng buộc vào structured output" (ví dụ: giải thích tối đa N ký tự) | `text(item.explanation, 1200)` và `maxLength` trong schema ở `apps/api/src/study-coach/study-quiz-validation.ts` | `npx vitest run src/study-coach/study-quiz-validation.spec.ts` → xanh (9/9); thêm test "từ chối explanation dài hơn N" (RED trước, GREEN sau) | Schema gửi cho model và validator phải cùng ràng buộc; không tin JSON mode của provider; sai thì 422 và không lưu |

Quy trình khi bảo vệ: (1) đọc yêu cầu và nói lại; (2) tìm file bằng traceability (story → file); (3) viết test đỏ trước; (4) sửa tối thiểu; (5) chạy test liên quan;
(6) nói rõ tác động (version, re-index, evaluation). Được dùng công cụ AI nhưng phải giải thích từng bước.

## 5. Q&A cá nhân 12 phút — module sở hữu và một module của bạn cùng nhóm

Mỗi người trả lời module của mình trước, rồi một phần do giảng viên chọn. Nguồn sự thật: Git history (23/10/2026: 260 commit Tài, 5 commit Thắng) và `docs/FINAL-REQUIREMENTS.md`.

| Module | Người đứng đầu theo Git | Câu hỏi thường gặp và nơi mở code |
| ------ | ----------------------- | --------------------------------- |
| Auth/OAuth/RLS | Tài | Vì sao cookie opaque chứ không để JWT ở browser (ADR-001)? RLS bảo vệ gì và không bảo vệ gì? → `auth.service.ts`, migration 017 |
| Documents + ingestion + RAG retrieval | Tài | Chunk bao nhiêu và vì sao? Điều gì xảy ra khi không có đoạn đạt ngưỡng? Citation được kiểm thế nào? → `document-chunker.ts`, `rag-retrieval.service.ts`, `source-markers.ts` |
| Study Coach (capability C) | Tài | Vì sao đây là structured output chứ không chỉ JSON? JSON sai thì sao? → `study-quiz-validation.ts`, ADR-009 |
| Telemetry, admission, dashboard | Tài | Vì sao telemetry không phải quota? → ADR-003, ADR-004, `ai-usage.service.ts` |
| Evaluation | Tài | Vì sao HTTP 200 không phải PASS? Một case injection không có retrieval trace nói được gì? → `docs/evaluation-plan.md` |
| STT | Thắng | Tại sao mặc định tắt và không tự tải weights? Độ trễ và độ chính xác thực tế? → `apps/api/src/speech/*`, `docs/STT-SETUP-VI.md` |
| Streaming chat (SSE) | Thắng | Vì sao documents mode chỉ stream trạng thái? `X-Accel-Buffering`? Hủy giữa chừng? → `assistant.controller.ts`, `use-assistant.ts` |

**THẮNG ĐIỀN:** giải thích số commit trong Git và mô tả luồng dữ liệu STT/streaming bằng lời của bạn. **TÀI ĐIỀN:** mô tả luồng RAG và Study Coach bằng lời của bạn.
Giảng viên có thể hỏi truy vết: "story US-06 nằm ở đâu?" → `FINAL-REQUIREMENTS.md` bảng User stories; hoặc "giải thích một case evaluation đang đỏ" → chưa có case chạy,
hãy nói thẳng và mở `docs/GOLD-REVIEW-PACK.md`.
