# Phản hồi Assistant → candidate → testcase

Feedback là tín hiệu cần đối chiếu nguồn. `helpful` không phải semantic PASS;
`unhelpful` không phải semantic FAIL. Comment không phải gold. Workspace demo
dùng chung chưa có authentication, vì vậy UUID chống gửi trùng theo answer/key,
không chứng minh danh tính hoặc “mỗi người một vote”.

## Lưu và giới hạn

`POST /api/assistant/feedback` nhận contract `CreateAssistantFeedbackRequest`.
Mỗi answer thành công, kể cả từ chối `answerable=false`, có UUID riêng. FE giữ
snapshot request/response lúc nhận answer, không lấy scope/mode đang chọn khi
bấm feedback. Response gốc có thể khác lời giải thích trạng thái được FE hiển
thị; snapshot giữ response gốc đầy đủ, không thay nội dung để làm gold.
Provider/model/promptVersion được sao chép từ response hiện có, không suy đoán.
Fixture transport cũ không cung cấp response contract không tạo snapshot giả.

Snapshot `client_reported` chỉ bao gồm lượt hỏi–đáp này và nguồn theo contract,
không có history, PDF/chunk text, URL nguồn, storage key hoặc system prompt.
Backend kiểm shape/giới hạn, không xác thực sự đúng đắn hoặc sự tồn tại của
nguồn chỉ vì client gửi dữ liệu hợp lệ. Comment và nội dung câu trả lời là dữ
liệu không tin cậy, không được render như HTML hoặc dùng để thực thi lệnh.
Người gửi nhìn thấy thông báo lưu câu hỏi, câu trả lời và nguồn trước khi gửi.

Giới hạn chung: ghi chú 1.000 Unicode code points, câu hỏi 4.000, câu trả lời
32.000, tối đa 40 citations/workspace sources, snapshot canonical JSON UTF-8
tối đa 81.920 bytes. Mức answer lớn hơn validator RAG 8.000 ký tự để tiếp nhận
general/workspace mà không cắt câu trả lời; byte cap bảo vệ request/storage.
Snapshot + note tối đa khoảng 86 KB, dưới JSON body limit mặc định 100 KiB của
Nest/Express. Các label/title tối đa 1.000, detail 2.000, model 200 và
promptVersion 120. Nội dung vượt giới hạn bị từ chối rõ ràng, không lưu một
bản rút gọn rồi gọi là đầy đủ. FE giới hạn note theo code points; DTO và DB
cùng ceiling 1.000. DB lưu JSON nguyên canonical serialization để kiểm byte
count nhất quán, có CHECK riêng cho các giới hạn chính.

Helpful gửi reasons rỗng. Unhelpful cần 1–5 reason không trùng trong whitelist;
`other` cần note không trắng. Người dùng sửa trước lần gửi đầu tiên. Sau lần
gửi, payload/key được giữ nguyên cho retry, controls khóa; response xác nhận
hợp lệ mới hiện “Đã lưu”. Đây là chủ ý để retry sau mất mạng không đổi payload
của bản ghi có thể đã được server lưu. Không sửa/xóa sau lưu trong Đợt 5.
State thuộc từng component answer trong panel luôn được giữ mounted; đóng/mở,
đổi trang, expand/collapse và source view giữ draft trong tab. Reload vẫn mất
hội thoại theo thiết kế cũ, không có localStorage chat mới.

UUID dùng native randomUUID nếu có, hoặc UUID v4 từ getRandomValues khi mở app
bằng HTTP thường. Nếu nguồn random không dùng được, câu trả lời chat vẫn giữ;
feedback thông báo chưa thể tạo mã, không dùng Math.random làm UUID database.
Lỗi HTTP 400/409 giữ nội dung và hiện hướng dẫn riêng, không có nút thử lại cùng
payload. 400 cần nhóm kiểm tra dữ liệu; 409 báo xung đột mà không tự nhận bản
đang gửi đã được lưu. Lỗi 503/mất mạng vẫn thử lại cùng key/payload.

UNIQUE `submission_id` và `answer_id`, INSERT `ON CONFLICT DO NOTHING` rồi SELECT
tham số hóa bảo vệ concurrency. Hash SHA-256 server tính trên payload canonical
(object keys sắp xếp, thứ tự array được giữ): cùng key/payload trả receipt cũ;
khác payload hoặc key khác cho answer đã lưu trả 409, không ghi đè. Receipt chỉ
có id/rating/createdAt. Không có public GET/export/review/update/delete API.

Migration `011_assistant_feedback.sql` là cộng thêm. RLS bật, không có policy
client; REVOKE PUBLIC/anon/authenticated theo mẫu backend private hiện có.
Không có FK: UUID nguồn nằm trong snapshot lịch sử; xóa course/document không
xóa feedback. Citation lịch sử không chứng minh nguồn hiện còn tồn tại.
Không ghi vào `ai_evaluations`, không sửa migration cũ.

## Export nội bộ, read-only

Từ root, build API trước. Chọn ID cụ thể (tối đa 50):

```powershell
npm run build --workspace @examate/api
npm run feedback:export --workspace @examate/api -- --ids <feedback-uuid>,<feedback-uuid> --output artifacts/feedback-candidates/review-01.json
```

Hoặc bộ lọc rating với limit bắt buộc 1–50:

```powershell
npm run feedback:export --workspace @examate/api -- --rating unhelpful --limit 10 --output artifacts/feedback-candidates/review-02.json
```

Không chọn gì thì reject trước DB. SELECT chỉ cột cần thiết, SQL tham số hóa,
không UPDATE/INSERT/DELETE, không Google/Gemini/embedding/upload/indexing.
Output chỉ trong artifacts, dùng `wx`, không ghi đè. Console chỉ in số lượng,
đường dẫn và trạng thái; không in question/answer/comment/connection string.
File thực chứa nội dung nhạy cảm tiềm tàng: giữ local/ignored, kiểm rò rỉ và
được phép chia sẻ trước khi gửi cho người khác; không commit artifact thực.
`notFoundIds` ghi ID đã chọn nhưng không còn tồn tại, không âm thầm đổi sang
export toàn bảng. Không export secrets/URL nguồn riêng để làm bằng chứng.

## Review và chuyển thành testcase

1. Tài/Thắng chọn candidate `UNREVIEWED`; ghi reviewer và thời điểm thật vào
   bản review local. Helpful vẫn phải review như unhelpful.
2. Kiểm mode, operation và scope lúc hỏi. “Không tìm thấy tài liệu” có thể do
   scope, index chưa ready, nguồn đã bị xóa, nguồn không tồn tại hoặc ngoài phạm
   vi. Không kết luận retrieval sai từ một reason người dùng chọn.
3. Đối chiếu nguồn được phép: ID, trang, hash/revision nếu biết, trạng thái
   index và bằng chứng hỗ trợ từng claim. Điền `review.comparedSources` bằng
   `{documentId, page, sha256, evidenceRef}`; field thiếu bằng chứng là null/
   unknown. `evidenceRef` trỏ bản đối chiếu private được phép, không signed URL.
   Với workspace, đối chiếu bản ghi/date/scope và thay đổi dữ liệu kể từ lúc hỏi.
4. Chọn `review.conclusion`: `confirmed_issue`, `no_issue`, hoặc
   `insufficient_evidence`. Ghi giải thích có dẫn chứng. Chọn `errorType` trong
   indexing/retrieval/generation/citation/metadata/UI/user_expectation. Nguồn
   thay đổi hoặc bị xóa mà không có snapshot đáng tin cậy có thể dẫn tới
   insufficient_evidence; không lấp phần thiếu bằng comment người dùng.
5. Chỉ sau đối chiếu mới đề xuất expected behavior và test kind (unit, HTTP
   integration, frontend, live evaluation). Không tự tạo expected answer từ
   comment; cần gold/rubric độc lập. Dùng fixture tổng hợp để tái hiện, tránh
   đưa feedback/private source nguyên văn vào repository.
6. Tài/Thắng duyệt đề xuất trong một thay đổi riêng được review. Sau đó mới thêm
   test hoặc case vào manifest chính thức và revision phù hợp. CLI này không
   promote candidate, không sửa gold/threshold/prompt/model hoặc kết quả run cũ.

Artifact candidate có `schemaVersion:1`, kind `assistant_feedback_candidates`;
runner RAG chỉ nhận manifest schema 3 với corpus/gold đóng băng. Candidate chưa
review không phải input evaluation hợp lệ, không có semantic verdict hoặc gold.

## Ví dụ giả lập, chưa có reviewer

Đây là cấu trúc minh họa, không phải feedback hay chữ ký của người thật. Snapshot
dùng dữ liệu tổng hợp và response workspace đầy đủ, không gọi model.

```json
{
  "schemaVersion": 1,
  "kind": "assistant_feedback_candidates",
  "candidates": [
    {
      "feedbackId": "11111111-1111-4111-8111-111111111111",
      "rating": "unhelpful",
      "reasons": ["missing_detail"],
      "comment": "VÍ DỤ GIẢ LẬP: cần đối chiếu cách diễn giải phạm vi.",
      "provenance": "client_reported",
      "status": "UNREVIEWED",
      "snapshot": {
        "schemaVersion": 1,
        "request": {
          "mode": "workspace",
          "operation": "question",
          "question": "Câu hỏi ngoài phạm vi minh họa?"
        },
        "response": {
          "mode": "workspace",
          "provider": "workspace",
          "model": "database",
          "promptVersion": "workspace-v1",
          "answer": "Câu hỏi minh họa này nằm ngoài phạm vi workspace hỗ trợ.",
          "answerable": false,
          "reasonCode": "WORKSPACE_UNSUPPORTED",
          "ragEnabled": false,
          "citations": [],
          "workspaceSources": [],
          "workspaceIntent": "unsupported",
          "asOf": "2026-10-05"
        }
      },
      "review": {
        "reviewer": null,
        "reviewedAt": null,
        "conclusion": null,
        "evidenceExplanation": null,
        "errorType": null,
        "comparedSources": [],
        "expectedBehavior": null,
        "proposedTestKind": null
      }
    }
  ]
}
```
