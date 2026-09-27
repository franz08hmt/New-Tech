# ExaMate Assistant — grounded Gemini RAG backend

Luồng: `POST /api/assistant/chat → query embedding → pgvector retrieval → structured Gemini generation → citation validation`.
Controller nhận DTO đã validate. AssistantService không gọi generation nếu không có evidence, yêu cầu JSON có schema khi có evidence và chỉ trả citation khớp source ID đã retrieval. GeminiService dùng SDK chính thức `@google/genai`, chuyển lỗi provider thành loại lỗi an toàn. AssistantExceptionFilter ánh xạ loại lỗi sang HTTP, giữ request ID theo cơ chế hiện có.

Frontend kết nối `POST /api/assistant/chat` qua `api.askAssistant()`, cho phép người dùng chủ động index/re-index PDF và mở citation bằng signed URL tại đúng `#page=` khi có metadata trang. Khi hỏi trong trang chi tiết một môn, frontend gửi `courseId` để retrieval không trộn tài liệu môn khác. Chỉ PDF có `processing_status=ready` mới được retrieval.

## Cấu hình và chạy

1. Mở [Google AI Studio — API keys](https://aistudio.google.com/apikey), đăng nhập, chọn/tạo hoặc import project rồi tạo Gemini API key. Xem [hướng dẫn chính thức](https://ai.google.dev/gemini-api/docs/api-key).
2. Chỉ đặt key trong `.env` tại repository root bằng editor local. Không commit `.env`, không đặt key trong frontend hoặc biến `VITE_*`. `.gitignore` hiện đã loại `.env`, `secrets/`, `node_modules/` và `dist/`.
3. Thêm cấu hình generation sau; thay placeholder key trong `.env` riêng của bạn, không trong `.env.example`:

```dotenv
GEMINI_API_KEY=REPLACE_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=30000
GEMINI_MAX_OUTPUT_TOKENS=1024
```

Embedding và retrieval có giá trị mặc định an toàn trong `.env.example`: `gemini-embedding-001`, 768 chiều, batch 16, top-k 6 và ngưỡng ban đầu 0.55. `GEMINI_EMBEDDING_DIMENSIONS` phải giữ đúng 768 để khớp `VECTOR(768)` của migration 008; muốn đổi cần migration mới và re-index toàn bộ corpus.

OCR cho PDF scan là tính năng opt-in vì mỗi trang ít text tạo một request multimodal riêng. Sau khi chạy migration 010, bật trong `.env` nếu chấp nhận sử dụng quota:

```dotenv
DOCUMENT_OCR_ENABLED=true
GEMINI_OCR_MODEL=gemini-2.5-flash
GEMINI_OCR_TIMEOUT_MS=30000
DOCUMENT_OCR_MAX_PAGES=25
```

Khi re-index, backend vẫn ưu tiên text thuần từ PDF. Chỉ các trang không qua bộ kiểm tra chất lượng mới được render thành PNG trong bộ nhớ và gửi OCR; ảnh không được lưu vào database/Storage/log. Mặc định OCR tắt, tối đa 25 trang mỗi tài liệu và giới hạn cấu hình cứng là 50. OCR thành công được ghi bằng `ocr_page_count`/`ocr_page_numbers`; trang không đọc được vẫn nằm trong `skipped_page_numbers` và `needs_ocr=true`. Nếu OCR/provider lỗi, transaction thay chunks chưa bắt đầu nên index cũ được giữ để retry.

`loadEnvironment()` hiện có nạp `.env` root; không có dotenv loader thứ hai. Biến đã có trong môi trường process giữ ưu tiên theo `loadEnvFile`. Khởi động lại API sau khi thay đổi cấu hình.

Chạy trực tiếp NestJS, React và Supabase Cloud không cần Docker. Certificate được resolve từ repository root: `DATABASE_CA_CERT_PATH=secrets/prod-supabase.cer.crt`.

- Key thiếu, rỗng hoặc chứa `REPLACE_`: API vẫn khởi động; status là `not_configured`, chat trả 503.
- Model trim khoảng trắng, rỗng dùng `gemini-2.5-flash`; chỉ nhận ID `gemini-...` (không URL).
- Timeout: số nguyên 1–60000 ms, mặc định 30000.
- Output: số nguyên 1–8192 token, mặc định 1024. Model có thể dừng khi đạt giới hạn.
- Giá trị số ngoài giới hạn làm startup thất bại với tên biến, không in giá trị hay credential.
- PostgreSQL/Supabase phải hợp lệ: indexing đọc PDF từ private Storage và ghi chunks/embeddings vào PostgreSQL; chat đọc pgvector trước khi gọi generation.

Từ root repository:

```powershell
npm ci
npm run dev:api
# Hoặc build rồi chạy:
# npm run build --workspace @examate/api
# npm run start --workspace @examate/api
```

SDK đã được thêm bằng `npm install @google/genai --workspace @examate/api` và ghi trong lockfile. Runtime nên đáp ứng phiên bản Node trong README; không cần key thật để chạy test.

## Status

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/assistant/status
```

HTTP 200 khi đã cấu hình:

```json
{
  "status": "ready",
  "provider": "google",
  "mode": "rag",
  "model": "gemini-2.5-flash",
  "ragEnabled": true,
  "credentialsExposedToClient": false
}
```

Khi thiếu key: cùng các field trên nhưng `status: "not_configured"` và **không có field model**. `ready` chỉ cho biết có key không phải placeholder; status không gọi Google để kiểm tra quyền, quota hoặc model availability. Key bị provider từ chối sẽ cho lỗi an toàn khi gọi chat.

## Chat

```powershell
$body = @{
  message = 'Hãy giúp tôi lập kế hoạch hoàn thành bài tập tuần này'
  pageContext = @{ pageId = 'tasks'; pageName = 'Tasks' }
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/assistant/chat `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

HTTP 200:

```json
{
  "answer": "Nội dung trả lời dựa trên nguồn [S1].",
  "answerable": true,
  "citations": [
    {
      "sourceId": "S1",
      "documentId": "...",
      "chunkId": "...",
      "title": "study.pdf",
      "page": 3,
      "chunkIndex": 0
    }
  ],
  "provider": "google",
  "model": "gemini-2.5-flash",
  "ragEnabled": true,
  "promptVersion": "rag-v1"
}
```

`message` bắt buộc là string, trim trước validation, 1–4000 ký tự. `courseId` tùy chọn để giới hạn retrieval theo môn học và phải là UUID. `pageContext` tùy chọn (bỏ qua hoặc null); nếu có object thì `pageId` và `pageName` bắt buộc là string không rỗng sau trim, tối đa 80 và 120 ký tự. Array, sai kiểu và field lạ ở cả hai cấp bị từ chối theo ValidationPipe. Không có field nhận key, URL, file hoặc lịch sử hội thoại.

| Tình huống                                               | HTTP | Message                                  |
| -------------------------------------------------------- | ---- | ---------------------------------------- |
| Validation lỗi                                           | 400  | ValidationPipe hiện có                   |
| Thiếu key                                                | 503  | AI assistant is not configured.          |
| Timeout                                                  | 504  | AI assistant timed out. Please retry.    |
| Quota/rate limit, authentication, unavailable            | 503  | AI assistant is temporarily unavailable. |
| Response rỗng, output chứa credential, lỗi upstream khác | 502  | AI assistant is temporarily unavailable. |

Lỗi có `statusCode`, `message`, `requestId`; không trả SDK error, headers, prompt hay stack. Logs chỉ có event, model, duration, outcome và loại lỗi đã chuẩn hóa. Timer được dọn sau request; khi hết hạn, AbortController hủy transport và Promise timeout giới hạn thời gian chờ. SDK không retry. Hủy kết nối local không bảo đảm Google dừng generation hoặc không tính phí request đã nhận.

## Luồng kiểm tra trên giao diện

1. Mở **Documents**, upload PDF và chọn môn nếu tài liệu thuộc một môn cụ thể. Upload thành công chỉ có nghĩa file đã lưu; trạng thái AI ban đầu là `pending`.
2. Nhấn **Index**. UI chuyển sang `processing`, khóa thao tác trùng và chỉ chuyển `ready` khi endpoint `/api/documents/:id/process` trả thành công.
3. Nếu extraction/OCR/embedding lỗi, card chuyển `failed` và nút thành **Retry indexing**. `ready` có **Re-index** để cập nhật chunks khi file hoặc chiến lược index thay đổi. Mỗi lần index/re-index thật có thể dùng quota embedding; khi OCR bật còn có thể dùng một request multimodal cho mỗi trang ít text.
4. Mở Assistant ở trang chi tiết môn để request mang `courseId`; ở trang chung request không tự bịa một course scope.
5. Gửi câu hỏi. Citation có `documentId` được hiển thị như nút; khi bấm, web xin signed URL mới rồi mở PDF tại trang được backend kiểm chứng. Citation thiếu `documentId` chỉ là text, không tạo link giả.

Signed URL là dữ liệu tạm thời và không được đưa vào log/evidence. Browser PDF viewer có thể xử lý `#page=` khác nhau; metadata citation vẫn hiển thị độc lập trong panel.

Tham chiếu SDK chính thức: [GenerateContentConfig.abortSignal](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html#abortsignal), [HttpRetryOptions](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html).

## Phạm vi và giới hạn

- PDF parsing, chunking, embeddings, pgvector retrieval, structured answer và citation validation đã có ở backend.
- Không có evidence phù hợp thì backend trả `answerable:false`, `citations:[]` và không gọi generation. Backend kiểm tra source ID/inline marker nhưng không thay thế được đánh giá semantic entailment bằng con người.
- Chưa có Google Search grounding, file search, URL context, tool calling, agent actions, thực thi code, streaming hoặc chat persistence.
- Query embedding gửi câu hỏi hiện tại tới Gemini Embeddings. Khi có evidence, generation gửi câu hỏi, metadata màn hình và các chunks PDF đã retrieval tới Gemini; không gửi toàn bộ file hoặc lịch sử hội thoại. Nội dung người dùng/PDF không được ghép vào system instruction.
- System instruction yêu cầu chỉ dùng evidence, coi nội dung PDF/UI là dữ liệu không đáng tin cậy và trả inline marker `[S1]`. Backend loại output sai schema, source ID giả hoặc marker không khớp.
- MVP local chưa có authentication hoặc rate limiting. Không mở endpoint ra Internet trước khi bổ sung kiểm soát truy cập và quota phù hợp. Các giới hạn hiện tại áp dụng theo request, không phải tổng số request đồng thời.
- Test dùng mock, chưa xác minh Gemini thật, chất lượng câu trả lời, billing hoặc quyền của key. Gọi chat thủ công với key hợp lệ sẽ gọi Google và có thể sử dụng quota/chi phí theo project của bạn.

## Kiểm tra

Từ repository root:

```powershell
npm run typecheck --workspace @examate/api
npm run build --workspace @examate/api
npm test --workspace @examate/api
# Sau khi ba bước backend pass:
npm run typecheck
npm run build
npm test
npm run format:check --workspace @examate/api
```

Unit tests mock SDK/provider. HTTP tests dùng compiled NestJS với ValidationPipe và exception filter thực, mock database/Storage và Gemini transport; không nạp `.env` thật, không gọi internet và không yêu cầu key thật. Bao phủ contract, DI, giới hạn DTO/config, prompt separation, timeout/abort, không retry, response rỗng và chống lộ credential trong lỗi/response/logs. Các test Tasks/Documents/Health cũ vẫn thuộc `npm test`.

### Kết quả xác minh ngày 2026-09-26

Chạy trên Node 22.18.0 / npm 10.9.3 với source Gemini hiện tại:

| Lệnh                                         | Kết quả                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run typecheck --workspace @examate/api` | PASS                                                                   |
| `npm run build --workspace @examate/api`     | PASS                                                                   |
| `npm test --workspace @examate/api`          | PASS: 110 Vitest + 110 Node HTTP/adapter/evaluation; 0 fail, 0 skip    |
| `npm run typecheck`                          | PASS cả API và web                                                     |
| `npm run build`                              | PASS cả API và web                                                     |
| `npm test`                                   | PASS: 110 API Vitest + 110 API Node + 83 web; 303 tổng, 0 fail, 0 skip |
| `npm run format:check`                       | PASS cả API và web                                                     |

Vitest và Vite ban đầu bị sandbox Windows chặn `spawn EPERM`; chạy lại ngoài sandbox đã pass, không cần sửa dependency hay bỏ test. Chưa xác minh runtime Node 24.

Smoke test sau automated tests: copy riêng `apps/api/dist` vào cây thư mục tạm, dùng cấu hình giả, không có `.env`, bỏ Gemini key rồi chạy entrypoint `main.js`. Backend khởi động bằng providers thật trên loopback/cổng tạm; GET status trả 200 `not_configured`, POST chat trả 503 `AI assistant is not configured.`. Không đọc root `.env`, không gọi Gemini/Supabase và đã đóng ứng dụng sau kiểm tra. Kiểm tra này không chứng minh cấu hình Supabase thật hay quyền/quota Gemini thật.

Không chạy bộ integration database thật `npm run test:database`. Các test frontend giả lập endpoint process/chat/download; chúng chứng minh state, course scope và citation viewer được nối đúng, không chứng minh Supabase/Gemini thật, quyền/quota hay chất lượng câu trả lời. POST process/chat với key hợp lệ sẽ gọi Google và có thể dùng quota/chi phí. Không lặp request tự động.

Bộ evaluation cuối nằm ở `docs/evaluation-cases.json` và `docs/evaluation-plan.md`. `npm run eval:rag` đã được xác minh ở chế độ dry-run, không gọi HTTP. Hai PDF corpus tổng hợp đã được generator tạo và production extractor đọc thành công trong test. Bảy case live chưa chạy; cần upload/index corpus thật và quyết định sử dụng Gemini quota trước.
