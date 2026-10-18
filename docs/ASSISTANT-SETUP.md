# Assistant — cấu hình, hội thoại, feedback và lỗi

Đọc [README](../README.md) để chạy app/Auth; phần này không thay runbook quản trị.
Backend cần session, CSRF và principal hợp lệ. Ví dụ HTTP cũ không kèm phiên
không phải lối gọi API bỏ Auth. Không gọi model/cloud chỉ để sửa tài liệu.

## Cấu hình

Chỉnh .env root riêng bằng editor, restart API. Process environment có thể ghi đè.
Không đặt key trong frontend, VITE_* hoặc bài nộp. Các biến quan trọng:

| Biến                            | Ý nghĩa                                              |
| ------------------------------- | ---------------------------------------------------- |
| GEMINI_API_KEY                  | Key backend; thiếu/placeholder thì AI not_configured |
| GEMINI_MODEL                    | Generation model; source fallback gemini-2.5-flash   |
| GEMINI_TIMEOUT_MS               | Mặc định 30000 ms                                    |
| GEMINI_MAX_OUTPUT_TOKENS        | Mặc định 1024; giới hạn output, không phải cost cap  |
| GEMINI_EMBEDDING_MODEL          | Source default gemini-embedding-001                  |
| GEMINI_EMBEDDING_DIMENSIONS     | 768, phải khớp schema/corpus                         |
| RAG_TOP_K / RAG_CANDIDATE_LIMIT | Default 6/10, candidate không nhỏ hơn topK           |
| RAG_MIN_SCORE                   | Default 0.55, không là xác suất đúng                 |
| DOCUMENT_OCR_ENABLED            | Mặc định false, có chi phí/provider riêng nếu bật    |
| ASSISTANT_CONTEXT_MAX_CHARS     | Default 12000; 1000–24000 ký tự ngữ cảnh             |

Template tích hợp chọn model generation gemini-3.5-flash-lite; fallback source
vẫn 2.5-flash. Không suy ra model thực chạy từ template, không tự ghi đè .env cũ.
Kiểm model/config thực chạy và quyền/quota tương ứng; không tuyên bố model
mới nhanh/tốt hơn nếu chưa benchmark. GET /api/assistant/status chỉ phản ánh
cấu hình, không thử generation hoặc billing.

## Ba mode, hai tầng giao diện

- **AI Chat → Kiến thức chung**: mode general, không nhận đã đọc tài liệu/DB.
- **AI Chat → Tài liệu**: mode documents; upload/index PDF xong mới retrieval.
- **Hỏi workspace**: mode workspace, truy vấn intent SQL chỉ đọc, không Gemini.
- Tóm tắt và môn học của tài liệu là operation riêng. course_info là metadata
  DB, không suy ra môn từ text PDF hoặc gắn citation PDF giả.

Question dùng POST /api/assistant/chat/stream; summarize/course_info dùng JSON
POST /api/assistant/chat. Contracts/DTO là nguồn chính xác cho fields và limits.
Documents stream status rồi done **sau** validator/quyền cuối lượt, không phát
raw answer sớm. General có delta; workspace chỉ status rồi SQL result.
Client dừng/abort thì không ghép response cũ sang cuộc hội thoại mới.
SSE HTTP200 không đủ nói request thành công: còn phải có terminal event hợp lệ.

Để tự thử: dùng PDF nhóm đã được phép, chọn đúng tài liệu đã index, hỏi câu có
đáp án/page gold, mở citation rồi hỏi ngoài phạm vi; không biến câu từ chối
thành lỗi UI. Summary có giới hạn coverage; ready không chứng minh trích đủ PDF.
Bucket private/sign60s vẫn có quyền/cost/riêng tư cần kiểm.

## Receipt và history N1

Chat hoàn tất hợp lệ tạo receipt gắn principal/workspace và hash canonical
snapshot. JSON dùng header X-Assistant-Answer-ID; SSE chuyển receipt cùng kết
quả cuối theo contract. Không dùng UUID tự tạo client làm answer identity.

Receipt lỗi 5xx sau answer hợp lệ vẫn hiện answer, không receipt/feedback/
history; lỗi quyền4xx vẫn chặn. Receipt không lưu question/answer text.

General/documents gửi tối đa 6 lượt có receipt; cùng user/workspace/mode/course/
document và hash. Lượt sai bị 400 HISTORY_INVALID trước provider, không bỏ qua
âm thầm. Workspace và operation summarize/course_info không nhận history.
Kết quả hai operation sau có thể làm context cho câu hỏi cùng scope.

Ngữ cảnh dùng response.answer đã xác minh, không DOM/HTML/chữ UI tự thêm.
Nguồn cũ bị trung tính hóa; citation chỉ dùng evidence hiện tại. Cắt lượt cũ
trước theo ngân sách; lượt mới nhất quá dài có nhãn rút gọn, snapshot/hash giữ
nguyên. History request tối đa 64000 ký tự serialized/81920 byte UTF-8.
Đổi scope/New conversation reset; reload mất vì history chỉ nằm trong tab.
Không coi đó là hệ thống lưu hội thoại lâu dài.

## Feedback → candidate → testcase

POST /api/assistant/feedback kiểm receipt thuộc chính user/workspace và hash.
Viewer được gửi cho answer của mình; receipt bịa/khác chủ/hash lệch trả404 chung.
submission_id bảo vệ retry; cùng key/payload trả kết quả cũ, payload xung đột
không ghi đè. Lỗi mạng không nghĩa chưa lưu; giữ nguyên payload/key khi retry.

Hữu ích có reasons rỗng; Chưa đúng cần reason theo whitelist contracts,
other cần note. Comment/snapshot không tin cậy, không render HTML hoặc dùng
làm lệnh. Feedback legacy user/receipt NULL giữ legacy_unattributed.

Export chỉ CLI quản trị local, không public API: cần MIGRATION_DATABASE_URL
riêng, không fallback runtime; --workspace-id khớp PILOT_WORKSPACE_ID.
Build API rồi chọn IDs hoặc rating/limit1–50, output mới trong artifacts:

```powershell
npm run build --workspace @examate/api
# Thay placeholder bằng UUID nhập riêng trên máy:
npm --silent run feedback:export --workspace @examate/api -- --workspace-id <workspace-uuid> --rating unhelpful --limit 10 --output artifacts/feedback-candidates/review-01.json
```

Đây là cú pháp minh họa, không chạy nguyên placeholder. Operator được xác thực
bằng credential DB quản trị, chưa bằng Supabase manager login; không cấp
credential này cho member/viewer. Output chứa snapshot nhạy cảm tiềm tàng:
ignored, ACL private, không in/commit nội dung, không overwrite file.

Review độc lập từng candidate UNREVIEWED:

1. Xác định mode/scope/index lúc hỏi; reason “không tìm thấy” chưa chỉ ra nguyên nhân.
2. Đối chiếu từng claim với PDF/page/revision hoặc record hợp lệ; nguồn đã đổi/
   xóa mà thiếu snapshot tin cậy thì ghi insufficient_evidence.
3. Ghi người review/thời điểm thật, evidence và kết luận confirmed_issue/
   no_issue/insufficient_evidence; phân loại indexing/retrieval/generation/
   citation/metadata/UI/user_expectation.
4. Tạo regression tổng hợp và expected behavior có gold/rubric độc lập, không
   chép comment thành đáp án đúng; review thay đổi manifest/revision riêng.
5. Không tự promote candidate thành gold/PASS/FAIL, sửa threshold/prompt hoặc
   viết lại kết quả run cũ. Xem [evaluation](evaluation-plan.md).

## Xử lý lỗi và kiểm

- Phân biệt AI_QUOTA, AI_UNAVAILABLE, timeout, validation và Auth bằng mã lỗi/
  Request ID; không kết luận mọi503 là quota hoặc thiếu service-role.
- Log metadata an toàn, không prompt/PDF/audio/token; không in exception upstream.
- Không retry provider/write vô hạn; abort local không hứa upstream không tính phí.
- Test fake/offline kiểm contract, không chứng minh semantic Gemini hoặc STT thật.
- Live eval --execute hiện BLOCKED trước DB/Storage/Gemini vì thiếu principal;
  không tạo bypass. B4 sẽ tích hợp Auth/hạn mức riêng.
- Gates/lệnh DB và trạng thái chưa nghiệm thu nằm trong README/context.
