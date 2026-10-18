# ExaMate Assistant — Gemini, RAG và xử lý PDF

> **Cập nhật 18/10/2026:** giao diện có hai lựa chọn chính: **AI Chat** và **Hỏi workspace**. Trong AI Chat, người dùng chọn phạm vi **Kiến thức chung** hoặc **Tài liệu**; backend vẫn phân biệt `general` và `documents` để áp dụng đúng prompt, retrieval và kiểm chứng citation. Cả ba luồng câu hỏi đều dùng SSE qua `POST /api/assistant/chat/stream`. Hỏi workspace gửi trạng thái tra cứu rồi trả kết quả hoàn chỉnh từ truy vấn chỉ đọc, không giả lập token AI. Tóm tắt và metadata tài liệu vẫn dùng endpoint JSON. Một số ví dụ cũ bên dưới có thể phản ánh checkpoint trước; trạng thái Auth/migration mới nhất xem README và các báo cáo pilot.

Để thử streaming: khởi động API và web, mở Assistant, chọn **AI Chat** rồi thử cả **Kiến thức chung** và **Tài liệu**. Kiến thức chung hiện dần và có thể bấm **Dừng trả lời**. Phạm vi tài liệu chỉ hiện trạng thái trong lúc xử lý; toàn bộ answer được giữ ở server tới khi citation validator và kiểm quyền cuối lượt đã qua. Vào Documents, upload PDF, bấm **Index**, chờ **Searchable content ready**. **Hỏi workspace** hiển thị trạng thái tra cứu trước khi trả lời từ database. GET `/api/assistant/status` chỉ xác nhận cấu hình, không chứng minh Google key/quota hay truy xuất database hoạt động.

Luồng JSON: `POST /api/assistant/chat → AssistantController → AssistantService → GeminiService → Google Gemini API`. AI Chat dùng `POST /api/assistant/chat/stream`; general nhận SSE delta, còn documents nhận status rồi `done` sau xác minh toàn bộ answer/citation và quyền cuối lượt. Bỏ marker khỏi text không đủ làm một phát biểu chưa xác minh trở nên an toàn. Hỏi workspace phát `status: querying_workspace` rồi response cuối từ query read-only. AssistantService giữ lịch sử đã xác minh, timeout và logging. SSE không đưa reasoning nội bộ của model về trình duyệt.

Frontend gọi `/api/assistant/chat/stream` cho câu hỏi trong AI Chat và Hỏi workspace. Tóm tắt tài liệu và tra metadata tài liệu tiếp tục dùng `/api/assistant/chat`. Tất cả yêu cầu đi qua API và dùng session/CSRF hiện có. Gemini key chỉ nằm phía server.

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
- Cấu hình PostgreSQL/Supabase vẫn cần hợp lệ cho toàn ứng dụng và các chế độ RAG/workspace; Chat thông thường không truy vấn DB.

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
  "modes": ["general", "documents"],
  "model": "gemini-2.5-flash",
  "ragEnabled": true,
  "credentialsExposedToClient": false
}
```

Khi thiếu key: `status` là `not_configured`, không có `model`; `ready` chỉ cho biết có key không phải placeholder, không xác minh quyền, quota hay model availability.

## Chat

```powershell
$body = @{
  message = 'Hãy giúp tôi lập kế hoạch hoàn thành bài tập tuần này'
  mode = 'general'
  pageContext = @{ pageId = 'tasks'; pageName = 'Tasks' }
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/assistant/chat `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

## Streaming realtime

Trong giao diện chọn **AI Chat**. Backend dùng `generateContentStream()` của SDK Gemini và gửi SSE `start`, các `status`, nhiều `delta` chứa phần văn bản mới, rồi `done` với response cuối cùng và answer receipt nếu đã lưu được. Frontend đọc bằng `fetch`/`ReadableStream`, cập nhật câu trả lời theo từng delta và hỗ trợ hủy request. Endpoint yêu cầu session/CSRF như các API `POST` khác.

`POST /api/assistant/chat/stream` nhận `mode: "general" | "documents" | "workspace"` cho `operation: "question"`. Với `documents`, backend báo `retrieving`, truy xuất bằng chứng, báo `generating`, rồi stream answer text; marker citation được lọc khỏi delta. Backend chỉ gửi `done` sau khi parse toàn bộ JSON, xác minh marker và đối chiếu citation với evidence. Nếu bước xác minh thất bại sau một phần delta, client đánh dấu câu trả lời đó chưa hoàn tất và không dùng nó làm lịch sử. Khi không có bằng chứng, endpoint trả kết quả không khả đáp mà không gọi model. Với `workspace`, backend gửi trạng thái tra cứu rồi response JSON hoàn chỉnh; dữ liệu vẫn được tính trực tiếp và không qua LLM. `summarize` và `course_info` tiếp tục dùng `POST /api/assistant/chat`.

HTTP 200:

```json
{
  "answer": "Nội dung trả lời...",
  "provider": "google",
  "model": "gemini-2.5-flash",
  "ragEnabled": false
}
```

`message` bắt buộc là string, trim trước validation, 1–4000 ký tự. `pageContext` tùy chọn (bỏ qua hoặc null); nếu có object thì `pageId` và `pageName` bắt buộc là string không rỗng sau trim, tối đa 80 và 120 ký tự. `mode`, `operation` và lịch sử đã xác minh là các field contract hợp lệ; field lạ hoặc sai kiểu bị từ chối theo ValidationPipe. Không có field nhận key, URL hay file. URL trong văn bản người dùng chỉ là văn bản, backend không truy cập URL đó.

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

- AI Chat ở phạm vi Tài liệu dùng PDF đã lập chỉ mục, retrieval vector và citation validation phía backend. Nếu thiếu bằng chứng, hệ thống từ chối thay vì đoán. OCR là tùy chọn.
- Hỏi workspace dùng truy vấn chỉ đọc trên dữ liệu đã scope theo principal; không gọi LLM. Không tuyên bố đây là streaming AI.
- AI Chat và Hỏi workspace đều dùng SSE cho câu hỏi. Nếu dừng giữa chừng hoặc lỗi sau khi đã nhận một phần văn bản, UI đánh dấu lượt đó chưa hoàn tất; lượt chưa hoàn tất không nhận feedback receipt và không đi vào history đã xác minh. Trạng thái workspace biểu thị truy vấn database, không phải token sinh bởi model.
- Nội dung AI Chat được gửi tới Google Gemini qua backend. Không gửi Gemini key xuống trình duyệt. Không chia sẻ câu hỏi nhạy cảm nếu không muốn gửi tới provider.
- Code/test hiện không chứng minh chất lượng câu trả lời, quota/billing thực tế hay cấu hình Auth/DB cloud trên máy của người dùng. Chỉ demo với dữ liệu được phép; xem README và báo cáo pilot cho giới hạn Auth hiện tại.

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

Unit tests mock SDK/provider. HTTP tests dùng compiled NestJS với ValidationPipe và exception filter thực, mock database/Storage và Gemini transport; không nạp `.env` thật, không gọi internet và không yêu cầu key thật. Bao phủ contract, DI, giới hạn DTO/config, prompt separation, timeout/abort, stream SSE, parser chia chunk và hủy luồng, không retry, response rỗng và chống lộ credential trong lỗi/response/logs. Các test Tasks/Documents/Health cũ vẫn thuộc `npm test`.

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

Không chạy bộ integration database thật `npm run test:database`. Automated tests dùng mock; chúng chứng minh request/response và event stream được nối đúng, không chứng minh key có quyền/quota hay Gemini trả lời thật. Chat với key hợp lệ sẽ gọi Google và có thể dùng quota/chi phí. Không lặp request tự động.

### Kiểm tra streaming ngày 2026-10-18

`npm run build --workspace @examate/api`, `npm run typecheck --workspace @examate/web` và `npm run build --workspace @examate/web` đều pass. 66 unit test cho controller/service/Gemini, 76 HTTP test cho assistant/auth, và toàn bộ 337 web test đều pass.

Full API suite có 260 test pass và một test ngoài phần thay đổi bị fail: `local-speech-runtime.spec.ts` kỳ vọng `metrics().pid` đã được xóa ngay sau khi worker bị kill, nhưng nhận lại PID `4581`. Chạy riêng test này cũng tái hiện lỗi; file speech runtime và test của nó không thuộc thay đổi streaming. Vì vitest dừng ở đây, các Node integration test khác không được chạy theo lệnh full suite. Không gọi Gemini thật; test chỉ xác minh luồng với SDK/provider giả lập, không xác minh key/quota hoặc chi phí thực tế.
