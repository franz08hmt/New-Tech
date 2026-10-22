# Slides — ExaMate AI (DRAFT, tối đa 15 slide)

Nguồn chỉnh sửa. Dựng PPTX + PDF bằng `python scripts/build-submission-docs.py <thư-mục-xuất>`.
Cú pháp: `## tiêu đề` = một slide; dòng `- ` = gạch đầu dòng; dòng `> ` = ghi chú người nói; `![](architecture.png)` = ảnh.
Slide kết quả evaluation giữ `PENDING` cho đến khi có số thật; không điền số bịa.

## ExaMate AI — workspace học tập có AI kiểm chứng được
- Tài · Thắng · môn New Technologies · bản DRAFT 23/10/2026
- Web app: React/Vite + NestJS + PostgreSQL/pgvector + Supabase + Gemini
- Hai capability AI: **A — RAG có nguồn** và **C — Structured output (Study Coach)**
> Mở bài 20 giây: một câu về vấn đề — chatbot bịa nguồn, tài liệu nhóm nằm rải rác.

## Bài toán và người dùng
- Người dùng: sinh viên làm việc nhóm, cần một nơi cho lịch học, bài tập, kỳ thi, chi tiêu và tài liệu
- Vấn đề: hỏi AI về tài liệu của nhóm nhưng không biết câu trả lời lấy từ trang nào, và AI vẫn trả lời khi không có căn cứ
- Giải pháp: trả lời **chỉ từ tài liệu đã index**, kèm citation mở đúng trang PDF; từ chối khi thiếu bằng chứng
- AI làm việc thật: tìm vector, validate JSON, chấm điểm và theo dõi tiến độ — không chỉ chuyển tiếp lời nhắn

## Phạm vi đã chốt
- Nhóm 2 người → cần 2 capability: **A (RAG)** + **C (structured output)**
- Không nhận B (cần ≥ 3 tool do LLM gọi), D (STT chưa có kết quả được lưu và dùng bởi app), E
- STT giữ nguyên (Thắng), **không** làm TTS; bỏ PWA và WASM
- Frontend hiện đại = **streaming AI response (SSE)**; vẫn responsive desktop/mobile; demo bằng Docker Compose
> Nói rõ để giảng viên không hỏi những thứ nhóm đã chủ động không làm.

## Kiến trúc và luồng một request AI
![](architecture.png)
> Đi theo 8 bước ở khung dưới: phiên → admission → embedding → vector search đã lọc scope → từ chối nếu thiếu bằng chứng → generation có schema → kiểm citation → telemetry.

## Capability A — RAG trên tài liệu của nhóm
- Upload PDF → chunk 1.200 ký tự (chồng 200) → embedding 768d → pgvector, lọc theo workspace/tài liệu/môn
- Top 6 đoạn, bỏ dưới ngưỡng điểm; không đoạn nào đạt → **từ chối, không gọi model**
- Model trả `{answerable, answer, citationIds}`; backend kiểm citation nằm trong evidence và marker `[S1]` khớp
- Nhấp citation → signed URL 60 giây → PDF mở đúng trang (đã thấy mở trang 3/3 trong browser)
> Demo: hỏi một câu có đáp án → mở citation; hỏi một câu ngoài tài liệu → bị từ chối.

## Capability C — Study Coach: JSON được dùng trong logic
- Model sinh quiz/flashcards theo schema; backend validate nghiêm ngặt (khóa, số câu, trùng, sourceIds nằm trong evidence)
- Xem trước → xác nhận lưu (token do server cấp) → luyện tập → **chấm ở server** → tiến độ
- JSON sai → 422, **không lưu**; luyện tập không gọi AI; dữ liệu riêng tư theo người dùng
- Đã thấy trong browser: 3 câu, đúng 2 → 66,67 %, "1 lượt" còn sau reload
> Nhấn mạnh: chỉ in JSON không phải capability C — ở đây JSON đi vào lưu, chấm điểm và tiến độ.

## Ba nhóm guardrail
- **Prompt injection:** evidence là dữ liệu không tin cậy; citation validator; PDF thử có câu "ignore all previous instructions"
- **Ngoài phạm vi:** không đủ bằng chứng → từ chối cố định (đã chạy trong browser)
- **AI lỗi:** timeout, quota, 503, JSON hỏng → thông báo riêng + Mã yêu cầu, không tự retry, giữ bản nháp
- Thăm dò Gemini thật (1 mẫu): model thuật lại lệnh độc hại chứ không làm theo — chưa đủ để kết luận an toàn
> Trung thực: bộ "model" của stack demo là bộ trích câu nên không chứng minh gì về LLM.

## Realtime và responsive
- SSE: chế độ general hiện chữ dần; qua nginx chunk đầu 40 ms, chunk cuối 4,3 s (không bị đệm)
- Nút "Dừng trả lời": hủy giữa chừng, không lưu nửa câu, bản nháp quay về ô nhập
- 375 px: 10 trang không tràn ngang; Assistant là bottom sheet; viewport thấp vẫn gửi được
- Documents/Workspace mode chỉ stream trạng thái, không stream token

## Quyền và bảo mật
- Vai trò manager / member / viewer; principal lấy từ server, không từ client
- RLS trong PostgreSQL; LOGIN business ≠ LOGIN Auth; ma trận quyền HTTP 19/19 đạt
- Dữ liệu cá nhân (hội thoại, quiz, flashcards) riêng theo người dùng; quiz người khác → 404
- Không có secret thật trong file tracked và lịch sử Git (quét theo pattern); key chỉ ở backend

## Logging, chi phí, latency
- Mỗi operation và provider call: prompt id/version, model, token, latency, outcome
- Dashboard cho manager: operation, call, token, chi phí **ước tính**, latency avg/p95, lỗi/từ chối
- Thiếu số liệu hiện "chưa có dữ liệu", không phải 0; telemetry là best-effort, **không phải hóa đơn**
- Thăm dò Gemini thật: chat 0,5–2,7 s, quiz 7 s, chi phí ước tính 0,0066 USD / 3 call — PENDING: số trung bình đủ suite

## Kiểm thử và nghiệm thu
- `npm test`: 2.310 test (API 457 + 1.309, Web 544) — typecheck, build, format đều pass
- 49 file test database trên PostgreSQL 17 disposable (RLS, quyền, migration)
- Trình duyệt thật (desktop + 375 px) trên stack demo: đăng nhập, RAG + citation, quiz, flashcards, SSE + dừng, dashboard, lỗi AI
- Docker: demo stack up → healthy → đăng nhập, RAG, citation, SSE qua nginx

## Evaluation — PENDING
- Suite 24 case (18 có bằng chứng, 6 từ chối); 23 lập kế hoạch được, RQ23 hoãn
- Gold chưa được duyệt; **chưa case nào chạy bằng model thật** — chưa có pass rate
- Kế hoạch: baseline `rag-v1` → chọn **một** cải tiến sau khi xem lỗi → chạy lại cùng suite → báo cả khi không tăng
- Mẫu số rõ ràng: DEFERRED / BLOCKED / INCONCLUSIVE không tính là PASS

## Giới hạn trung thực
- Gemini thật mới chạy thăm dò (~35 lời gọi); chưa kiểm Supabase, Google OAuth, máy Thắng
- Ghi chú lưu ở trình duyệt; Workspace mode là SQL có kiểm soát, không phải tool-calling LLM
- Không có trần tiền cứng; courses không có tạo/sửa/xóa; task không có xóa
- Cloud RLS rollout chưa làm; migration chỉ chạy trên DB disposable

## Đóng góp và nhật ký AI
- Git: 260 commit (Tài), 5 commit (Thắng: STT, streaming chat, Gemini text endpoint, backend bài tập 4)
- Thắng giải thích số commit và module sở hữu (THẮNG ĐIỀN trong báo cáo)
- `AI_USAGE.md`: 6 lỗi do AI viết đã được phát hiện và sửa, có commit và test hồi quy
- Ví dụ: executor sao chép buffer sau một `await` → sửa bằng snapshot đồng bộ (`da862cd`)

## Demo 8 phút
- 0:00 Bài toán, kiến trúc · 0:45 Đăng nhập, tạo task, reload giữ dữ liệu
- 1:45 Upload PDF → index → hỏi → mở citation đúng trang → câu ngoài tài liệu bị từ chối
- 4:30 Study Coach: sinh → xem trước → lưu → làm bài → tiến độ
- 6:00 Guardrail AI lỗi + dashboard AI + quyền viewer
- 7:15 Giới hạn và những gì chưa kiểm
