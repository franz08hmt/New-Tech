# ExaMate Assistant — Gemini text-to-text backend

Luồng: `POST /api/assistant/chat → AssistantController → AssistantService → GeminiService → Google Gemini API`.
Controller nhận DTO đã validate và gọi service. AssistantService xây dựng system instruction cố định, tách nội dung user và trả contract. GeminiService dùng SDK chính thức `@google/genai`, chuyển lỗi provider thành loại lỗi an toàn. AssistantExceptionFilter ánh xạ loại lỗi sang HTTP, giữ request ID theo cơ chế hiện có.

Frontend đã kết nối nút gửi với `POST /api/assistant/chat` qua `api.askAssistant()`. Khi API và Gemini key sẵn sàng, câu hỏi sẽ được gửi tới Gemini. Đây hiện chỉ là chat text: RAG chưa kết nối, nên câu trả lời không được tìm trong Tasks, Documents hay tài liệu đã tải lên. Có thể kiểm tra backend bằng PowerShell bên dưới.

## Cấu hình và chạy

1. Mở [Google AI Studio — API keys](https://aistudio.google.com/apikey), đăng nhập, chọn/tạo hoặc import project rồi tạo Gemini API key. Xem [hướng dẫn chính thức](https://ai.google.dev/gemini-api/docs/api-key).
2. Chỉ đặt key trong `.env` tại repository root bằng editor local. Không commit `.env`, không đặt key trong frontend hoặc biến `VITE_*`. `.gitignore` hiện đã loại `.env`, `secrets/`, `node_modules/` và `dist/`.
3. Thêm bốn biến sau; thay placeholder key trong `.env` riêng của bạn, không trong `.env.example`:

```dotenv
GEMINI_API_KEY=REPLACE_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=30000
GEMINI_MAX_OUTPUT_TOKENS=1024
```

`loadEnvironment()` hiện có nạp `.env` root; không có dotenv loader thứ hai. Biến đã có trong môi trường process giữ ưu tiên theo `loadEnvFile`. Khởi động lại API sau khi thay đổi cấu hình.

Chạy trực tiếp NestJS, React và Supabase Cloud không cần Docker. Certificate được resolve từ repository root: `DATABASE_CA_CERT_PATH=secrets/prod-supabase.cer.crt`.

- Key thiếu, rỗng hoặc chứa `REPLACE_`: API vẫn khởi động; status là `not_configured`, chat trả 503.
- Model trim khoảng trắng, rỗng dùng `gemini-2.5-flash`; chỉ nhận ID `gemini-...` (không URL).
- Timeout: số nguyên 1–60000 ms, mặc định 30000.
- Output: số nguyên 1–8192 token, mặc định 1024. Model có thể dừng khi đạt giới hạn.
- Giá trị số ngoài giới hạn làm startup thất bại với tên biến, không in giá trị hay credential.
- Cấu hình PostgreSQL/Supabase đang có vẫn cần hợp lệ để chạy toàn ứng dụng; Assistant không truy cập các dịch vụ đó.

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
  "mode": "llm",
  "model": "gemini-2.5-flash",
  "ragEnabled": false,
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
  "answer": "Nội dung trả lời...",
  "provider": "google",
  "model": "gemini-2.5-flash",
  "ragEnabled": false
}
```

`message` bắt buộc là string, trim trước validation, 1–4000 ký tự. `pageContext` tùy chọn (bỏ qua hoặc null); nếu có object thì `pageId` và `pageName` bắt buộc là string không rỗng sau trim, tối đa 80 và 120 ký tự. Array, sai kiểu và field lạ ở cả hai cấp bị từ chối theo ValidationPipe. Không có field nhận key, URL, file hoặc lịch sử hội thoại. URL trong văn bản người dùng chỉ là văn bản, không được backend truy cập.

| Tình huống                                               | HTTP | Message                                  |
| -------------------------------------------------------- | ---- | ---------------------------------------- |
| Validation lỗi                                           | 400  | ValidationPipe hiện có                   |
| Thiếu key                                                | 503  | AI assistant is not configured.          |
| Timeout                                                  | 504  | AI assistant timed out. Please retry.    |
| Quota/rate limit, authentication, unavailable            | 503  | AI assistant is temporarily unavailable. |
| Response rỗng, output chứa credential, lỗi upstream khác | 502  | AI assistant is temporarily unavailable. |

Lỗi có `statusCode`, `message`, `requestId`; không trả SDK error, headers, prompt hay stack. Logs chỉ có event, model, duration, outcome và loại lỗi đã chuẩn hóa. Timer được dọn sau request; khi hết hạn, AbortController hủy transport và Promise timeout giới hạn thời gian chờ. SDK không retry. Hủy kết nối local không bảo đảm Google dừng generation hoặc không tính phí request đã nhận.

Tham chiếu SDK chính thức: [GenerateContentConfig.abortSignal](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html#abortsignal), [HttpRetryOptions](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html).

## Phạm vi và giới hạn

- **RAG chưa được triển khai. Assistant không đọc Tasks, Documents hoặc PDF**, không tìm trong Supabase Storage, không dùng dữ liệu project làm context.
- Không PDF parsing, embeddings, vector search, Google Search grounding, file search, URL context, tool calling, agent actions, thực thi code, streaming hoặc chat persistence. Không sửa schema.
- Chỉ message và metadata màn hình của request hiện tại được gửi tới Google dưới vai trò user. Không lưu hay gửi lịch sử hội thoại. Nội dung người dùng không ghép vào system instruction.
- System instruction yêu cầu trả lời theo ngôn ngữ người dùng, đưa bước thực hiện, nói rõ chưa có RAG/context dự án, không bịa citation hay tự nhận đã cập nhật dữ liệu hoặc hoàn thành hành động bên ngoài. Đây là chỉ dẫn cho model, không phải bảo đảm mọi câu trả lời đều đúng.
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

### Kết quả xác minh ngày 2026-09-24

Chạy trên Node 22.18.0 / npm 10.9.3 với source Gemini hiện tại:

| Lệnh                                            | Kết quả                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run typecheck --workspace @examate/api`    | PASS                                                                             |
| `npm run build --workspace @examate/api`        | PASS                                                                             |
| `npm test --workspace @examate/api`             | PASS: 37 unit + 89 HTTP/adapter; 0 fail, 0 skip                                  |
| `npm run typecheck`                             | PASS cả API và web                                                               |
| `npm run build`                                 | PASS cả API và web                                                               |
| `npm test`                                      | PASS: 37 API unit + 89 API HTTP/adapter + 19 web; 0 fail, 0 skip                 |
| `npm run format:check --workspace @examate/api` | FAIL ở 19 file có sẵn ngoài thay đổi Gemini; các file Assistant không bị báo lỗi |

Vitest và Vite ban đầu bị sandbox Windows chặn `spawn EPERM`; chạy lại ngoài sandbox đã pass, không cần sửa dependency hay bỏ test. Chưa xác minh runtime Node 24.

Smoke test sau automated tests: copy riêng `apps/api/dist` vào cây thư mục tạm, dùng cấu hình giả, không có `.env`, bỏ Gemini key rồi chạy entrypoint `main.js`. Backend khởi động bằng providers thật trên loopback/cổng tạm; GET status trả 200 `not_configured`, POST chat trả 503 `AI assistant is not configured.`. Không đọc root `.env`, không gọi Gemini/Supabase và đã đóng ứng dụng sau kiểm tra. Kiểm tra này không chứng minh cấu hình Supabase thật hay quyền/quota Gemini thật.

Không chạy bộ integration database thật `npm run test:database`. Các test frontend giả lập endpoint chat; chúng chứng minh request/response được nối đúng, không chứng minh key có quyền/quota hay Gemini trả lời thật. POST chat với key hợp lệ sẽ gọi Google và có thể dùng quota/chi phí. Không lặp request tự động.
