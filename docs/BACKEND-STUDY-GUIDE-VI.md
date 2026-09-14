# Đọc và giải thích backend — Homework 4 non-AI

Đọc theo đường đi của một request. Mở source song song; các tên hàm/đoạn SQL dưới đây là implementation hiện tại. Không học thuộc rằng “đã chạy Supabase”: phiên triển khai chỉ xác minh bằng mock, DB test đang skip. Kết quả cập nhật ở [VERIFICATION.md](VERIFICATION.md).

## 1. Bốn thành phần chịu trách nhiệm gì?

React nhận thao tác, hiển thị loading/error/success, gửi HTTP. NestJS là cửa vào nghiệp vụ: kiểm tra DTO/file/UUID, gọi database và Storage, trả status code. PostgreSQL lưu **record**: title/status/due_date hoặc tên/kích thước/key PDF. Storage giữ **bytes** PDF. Không nhét binary vào bảng documents và không dùng React state/localStorage làm persistence cho hai luồng chính.

Supabase cung cấp PostgreSQL và Storage được quản lý. NestJS vẫn cần để giảng viên thấy vertical slice và để một nơi thực thi validation, secret, log, quy tắc lỗi một phần. Browser không được dùng service_role key. Assistant không nằm trong luồng này.

## 2. Click “Add task” đi đâu?

```text
TasksPanel.submit → useWorkspace.create → api.createTask
  → POST /api/tasks → ValidationPipe → TasksController.create
  → TasksService.create → DatabaseService.query → pg.Pool → PostgreSQL
  ← record đã INSERT ← 201 JSON ← React thêm record vào state
```

Trong `apps/web/src/TasksPanel.tsx`, `event.preventDefault()` chặn submit HTML reload trang. `new FormData(form)` lấy giá trị input. Title được trim và kiểm tra nhanh trước gửi. `await workspace.create(...)` chờ API. Chỉ khi hàm trả true mới `form.reset()` và thông báo thành công. Form lỗi giữ nội dung để sửa; lần submit mới xóa notice cũ.

Trong `use-workspace.ts`, `setBusy(true)` làm UI disabled khi mutation. `mutating.current` là chốt đồng bộ ngay lập tức để click liên tiếp không tạo hai mutation trước lần render sau. `version.current` tăng khi reload/mutation; response reload chỉ được setTasks khi version vẫn khớp. Nhờ vậy một GET cũ không ghi đè task vừa tạo. Khi API lỗi, catch đặt error và không thay task/status bằng kết quả đoán. Reload bị chặn khi mutation đang chạy.

Trong `api.ts`, `request<T>` dùng generic để TypeScript biết kiểu kết quả, nhưng generic **không** kiểm tra runtime JSON. Timer gọi AbortController sau 60 giây; `finally` luôn dọn timer. Với JSON mới thêm Content-Type; FormData để browser tự sinh boundary. 204 trả undefined, tránh parse JSON rỗng. Body lỗi HTML bị bỏ qua và đổi thành thông báo service unavailable; requestId lấy từ header/body để tìm log. Nếu timeout, kết quả ghi có thể đã xảy ra ở server: người dùng phải reload đối chiếu trước retry POST.

## 3. Main, module và dependency injection

Mở `apps/api/src/main.ts`:

- Imports `.js` trỏ đến tên file sau compile ESM; TypeScript NodeNext hiểu file `.ts` tương ứng khi build. Không đổi tùy tiện về import không extension.
- `loadEnvironment()` đọc .env root qua đường dẫn của module; không lệ thuộc terminal đang ở root hay apps/api.
- `appConfig()` chạy trước tạo Nest app, phát hiện thiếu cấu hình bằng tên biến. Không thử localhost khi thiếu database URL.
- `NestFactory.create(AppModule)` dựng đồ thị controller/service.
- `configureApp(app, config.origins)` dùng chung cho runtime và HTTP tests.
- `listen` bind loopback ở dev, `0.0.0.0` trong production/container. Compose chỉ publish web trên loopback.
- Catch startup chỉ log thông báo cấu hình đã kiểm soát hoặc thông báo chung; không in toàn bộ exception có thể chứa URI.

`app.module.ts` đăng ký HealthController, TasksController, AssistantController, DocumentsController và DatabaseService/TasksService/DocumentsService/StorageService. Repository nhỏ nên chưa cần thêm nhiều module con. `@Injectable()` cho Nest quản lý service. Constructor `private readonly database: DatabaseService` vừa khai báo field vừa yêu cầu Nest inject instance. Controller điều phối HTTP; service chứa quy tắc và query; DTO mô tả input cùng validation.

TypeScript `emitDecoratorMetadata` ghi thông tin loại constructor và `@Body()`. Vì test transformer có thể không giữ metadata như tsc, HTTP tests chạy trên `dist` đã build bằng Nest/TypeScript. Không gọi controller trực tiếp rồi gọi đó là API test.

## 4. Validation từng cụm dòng

Mở `tasks/create-task.dto.ts`:

```ts
@Transform(({ value }) =>
  typeof value === "string" ? value.trim() : value,
)
@IsString()
@MinLength(3)
@MaxLength(160)
title!: string;
```

Transform chỉ trim string, không biến số 123 thành chuỗi hợp lệ. Dấu `!` nói với TypeScript rằng field được gán lúc deserialize; nó không tự validate. `IsString` kiểm tra kiểu, MinLength/MaxLength kiểm tra **sau trim**. Title toàn khoảng trắng trở thành chuỗi rỗng và bị 400 trước SQL. Vì vậy không phụ thuộc frontend, curl vẫn bị kiểm tra.

`ownerName`/`evidenceType` dùng `@IsOptional`: undefined và null bỏ qua validator, service chuyển thành SQL NULL. String dài quá 80 bị 400; chuỗi trống sau trim thành NULL. `status` dùng `ValidateIf(... value !== undefined)` nên undefined được mặc định todo, nhưng null vẫn đi qua IsIn và bị từ chối. `dueDate` optional, Matches giới hạn đúng YYYY-MM-DD (không năm 0000), `IsDateString({ strict: true })` bắt ngày không tồn tại, như 2026-02-30. PostgreSQL lưu DATE, không timezone. Timestamps created_at/updated_at dùng TIMESTAMPTZ.

`tasks/update-task-status.dto.ts`: `@IsIn(taskStatuses)` chỉ nhận todo/in_progress/done, không optional. `tasks.controller.ts`: `@Param("id", new ParseUUIDPipe())` chặn UUID sai trước gọi service. UUID đúng nhưng SELECT/UPDATE không có record là tình huống khác: trả 404.

`common/http.ts` dùng `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})`: nhận biết DTO, transform, và từ chối field không khai báo. Không lặng lẽ nhận `admin:true` hay bỏ field lạ.

## 5. Query và persistence

`tasks.service.ts`, `create`:

```sql
INSERT INTO tasks (title, owner_name, status, due_date, evidence_type)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, title, owner_name, status, due_date, evidence_type, created_at, updated_at
```

Mảng values theo đúng thứ tự `$1..$5`. Driver gửi dữ liệu tách khỏi câu SQL, nên title chứa dấu nháy không trở thành SQL chạy thêm. Không nối `"WHERE id = " + userInput`. `RETURNING` lấy record PostgreSQL thực sự lưu, kể cả UUID/default timestamp, thay vì FE tự đoán.

`list` SELECT rồi ORDER BY in_progress, todo, done; due_date NULLS LAST; mới tạo trước trong nhóm phù hợp. `updateStatus` UPDATE theo UUID, đặt updated_at=NOW(), RETURNING. `result.rows[0]` rỗng thì ném NotFoundException. Log chỉ UUID/status, không title/request body.

`database/database.service.ts`:

- `types.setTypeParser(1082, value => value)` giữ PostgreSQL DATE thành YYYY-MM-DD; tránh Date object chuyển timezone làm lệch ngày.
- `new Pool(databaseConfig())` tái sử dụng connection, giới hạn 5 thay vì mở một connection mới cho mỗi query. Timeout gồm kết nối/query/statement; không chờ DB vô hạn.
- `pool.on("error", ...)` xử lý lỗi idle connection, tránh event error không được nghe làm crash; log mã an toàn.
- `query` catch mã mạng/connection/timeout và chuyển thành 503. Constraint hoặc lỗi query chưa phân loại vẫn là 500 để không che bug thành dependency failure. SQL/password không gửi client.
- `ping()` đo SELECT 1. `onModuleDestroy()` chờ `pool.end()`. `enableShutdownHooks()` giúp Nest gọi lifecycle khi process nhận tín hiệu dừng.

Restart API làm mất React/server RAM nhưng không xóa DB hoặc Storage. Đây là lý do phải chứng minh cùng UUID sau reload/restart, không chỉ nói “dùng PostgreSQL nên chắc chắn persistent”.

## 6. Cấu hình và migration

`config/config.ts`: `required` báo tên biến thiếu/placeholder, `integer` từ chối NaN/số ngoài giới hạn. databaseConfig parse URL để kiểm tra protocol, không cho `ssl*` URL parameters ghi đè cấu hình TLS, và chỉ cho SSL=false với host local. `rejectUnauthorized:true` xác minh certificate; CA tùy chọn đọc từ file. Không tắt xác minh khi lỗi certificate.

`appConfig` kiểm tra HTTPS origin, tên bucket, origin CORS và loại legacy JWT có role service_role. Đọc payload JWT ở đây chỉ nhằm bắt nhầm key, **không phải xác minh chữ ký JWT**; Supabase vẫn xác thực key khi request. Không đưa decoded payload ra log.

`scripts/migrate.mjs`:

1. Tạo pool từ MIGRATION_DATABASE_URL nếu có, lấy một client riêng; mọi transaction/lock dùng cùng client.
2. Search path public/extensions để thấy type vector đã cài trong Supabase.
3. Session advisory lock giúp hai lệnh migration không áp dụng cùng lúc. Vì là session lock, dùng direct hoặc session pooler.
4. Tạo bảng schema_migrations, khóa quyền Data API; đọc script init và các migration có thứ tự.
5. Chuẩn hóa newline khi tính SHA-256, nên Windows CRLF không làm thay checksum nội dung logic.
6. Nếu tên đã có, checksum phải khớp rồi skip. Nếu chưa, BEGIN → SQL → ghi migration → COMMIT. Lỗi ROLLBACK cả file, không đánh dấu đã áp dụng.
7. Finally unlock, release client và end pool. Không drop/reset DB.

`001_init.sql` giữ schema cũ và seed demo; vector extension cần cho cột VECTOR dù AI chưa dùng. `002_non_ai_storage.sql` thêm size/storage_status/index, giữ rows cũ là legacy. RLS và REVOKE chặn Data API roles. Owner/bypass connection vẫn không bị RLS cách ly, nên không được tuyên bố có user isolation.

## 7. PDF từ browser đến Storage

`DocumentsPanel.tsx` giữ hai danh sách: selected có **File**, state và lỗi; documents là metadata lấy từ API. Chọn file chỉ thêm selected, không tự nhận là uploaded. `upload(item)` set uploading trước await, gọi `api.uploadDocument(item.file)`; chỉ khi có 201 mới thêm stored và bỏ selected. Catch giữ File cho Retry. Không có phần trăm giả: progress không có value là loading không xác định.

`DocumentCard.tsx` chỉ render props và gọi callback; không tự quyết định thành công. Selected có Remove (bỏ File chưa lưu khỏi UI), stored có Delete (API xóa thật, có confirm ở parent). Deleting có thể retry delete, không download. Legacy không được giả định có object.

`documents/documents.controller.ts`: FileInterceptor nhận đúng field `file`, tối đa một file, không field text, size 10*1024*1024. Giới hạn nằm ở multipart parser trước khi buffer file quá lớn. Sau đó service vẫn kiểm tra size để bảo vệ nếu được gọi từ đường khác. Không cần dependency multer trực tiếp vì Nest platform-express đã cung cấp interceptor.

`DocumentsService.upload` từng cụm:

1. Không có file → 400. Size vượt 10 MiB → 413.
2. Extension `.pdf`, MIME application/pdf và `buffer.subarray(0, 5).toString("ascii") === "%PDF-"` đều phải đạt → nếu sai 415. Chữ ký chỉ là dấu hiệu đầu file; không xác minh toàn PDF hoặc chống malware.
3. Tên display bỏ path/control chars, trim, giới hạn 5–255 ký tự. Object key không dùng tên người dùng: `documents/${id}.pdf`, với id=randomUUID().
4. `await storage.upload(key, file.buffer)` phải xong mới INSERT metadata. Storage timeout có thể đã tạo object: log document.upload_uncertain kèm key, không báo thành công.
5. INSERT chỉ ghi id/name/media_type/storage_key/size/storage_status, không binary. `RETURNING *` cho record đã lưu; response bỏ storage_key nội bộ.
6. INSERT lỗi: query lại id để phân biệt “chưa insert” với “đã commit nhưng mất response”. Nếu record tồn tại, trả metadata; không xóa file đã có record.
7. Nếu query xác nhận không có record, thử storage.remove để compensation. Cleanup lỗi log document.cleanup_failed. Nếu query cũng lỗi, giữ file và log reconciliation_required, không xóa bừa object có thể thuộc record đã commit.

Đây không phải atomic transaction giữa hai hệ thống. PostgreSQL rollback không thể tự gọi Supabase Storage để hoàn tác file. Phải có nhánh compensation và đối chiếu thủ công cho lỗi mơ hồ.

## 8. Storage adapter, signed download và delete

`StorageService.request` nối origin đã validate + `/storage/v1` + path nội bộ. Gửi apikey/Authorization chỉ từ backend. `redirect:"error"` tránh gửi theo redirect không dự kiến. `AbortSignal.timeout` giới hạn mỗi request, kể cả đọc JSON. HTTP không 2xx log status rồi hủy body, không trả body nhà cung cấp chứa chi tiết nội bộ; ném ServiceUnavailableException. Không log key/URL có token.

`assertPrivateBucket` đọc thuộc tính public; phải bằng false. Upload dùng POST object với Content-Type application/pdf và x-upsert:false. Không ghi đè file cũ. Remove dùng DELETE object/bucket với `{prefixes:[key]}`; API xóa nhiều object được dùng cho đúng một key và cho phép retry khi object đã không còn.

`signedDownload` kiểm tra bucket rồi POST object/sign với expiresIn=60. Response phải là relative signedURL thuộc `/object/sign/`; code ghép lại origin và thêm download filename qua URLSearchParams. URL ngắn hạn là bearer credential; người có URL có thể tải trong hạn. React dùng anchor để mở URL; việc API cấp URL thành công chưa tự chứng minh file đã được tải đủ bytes — cần kiểm tra file thực tế khi demo.

`DocumentsService.remove`: find metadata → nếu đã không còn trả 204 (idempotent); legacy trả 409. UPDATE storage_status=deleting trước xóa. Storage remove xong mới DELETE metadata. Lỗi Storage giữ record+key để retry. Storage xóa xong nhưng DB DELETE lỗi cũng giữ record deleting; retry remove với object đã vắng rồi DELETE record. Không báo 204 nếu bước bắt buộc đang lỗi.

## 9. Health, logs, status code

`HealthController.check` gọi ping; thành công trả connected/latency/timestamp/storage:not_checked. Catch trả 503 degraded với DATABASE_UNAVAILABLE. Health không chứng minh migration đã đầy đủ hoặc Storage/key hợp lệ.

`common/http.ts` middleware sinh requestId mới từ server, đặt X-Request-ID và Cache-Control:no-store. AsyncLocalStorage giữ request context cho service log dù nhiều request đồng thời. Chỉ route shape đã biết vào log; không query string, filename, header auth/body. Khi response finish, log status và duration. Filter dùng status của HttpException; exception khác trả 500 generic. 400/404 vẫn giữ nguyên, không biến thành 503.

| Code | Cách giải thích bằng ví dụ trong app |
|---|---|
| 200 / 201 / 204 | GET/cập nhật; tạo task/document; delete không body |
| 400 | title/UUID/status/ngày/field lạ hoặc thiếu file |
| 404 | UUID hợp lệ nhưng task/download document không tồn tại |
| 409 | document đang deleting hoặc metadata legacy chưa có Storage xác minh |
| 413 / 415 | file quá lớn / không đạt kiểm tra PDF |
| 503 | dependency mạng/DB/Storage không khả dụng theo phân loại |
| 500 | lỗi nội bộ/SQL chưa phân loại; không lộ stack hoặc SQL |

Khi FE hiện Request ID, tìm cùng chuỗi trong log API. Request không tới backend (API tắt, Nginx lỗi) không có log ứng dụng; không bịa một requestId backend cho lỗi mạng.

## 10. Docker/Nginx và tests

API Dockerfile build ở stage riêng, npm ci theo lockfile, prune dev dependency, chạy dưới user node. Web build tĩnh rồi Nginx phục vụ. Nginx `/api/` proxy sang API với cùng prefix, còn đường khác fallback index.html. client_max_body_size=11m là tổng multipart; Nest vẫn chỉ cho 10 MiB file. Compose không tạo Supabase hoặc DB cloud: chỉ kết nối qua env; local DB test ở compose.local-db.yaml.

`apps/api/test/helpers.mjs` dùng Test.createTestingModule, override **dependency** DB/Storage, giữ controller/service/validation/filter thật. app.listen(0) chọn cổng local riêng. `api.test.mjs` gửi fetch thật qua HTTP, kiểm tra status/body và cả kết quả cleanup trong fake objects map. Map này không phải database persistence! Unit Assistant chỉ test trạng thái preview. storage.test.mjs mock HTTP provider để kiểm tra headers/path/body/timeout.

`database.test.mjs` chỉ chạy khi TEST_DATABASE_URL riêng, migrate hai lần, gửi HTTP, đóng/mở app, kiểm tra query rồi cleanup đúng UUID. Storage vẫn mock. Test skip là chưa kiểm chứng, không phải pass integration. Frontend App/integration tests render React với HTTP mock; giữ navigation/filter/Assistant boundary, thêm upload/retry/delete/error. Chúng không đo kích thước thực tế trên browser 320px; viewport thủ công nằm trong demo checklist.

## 11. 20 câu vấn đáp ngắn

1. **Supabase rồi vì sao còn NestJS?** Để tập trung nghiệp vụ/validation/logs/secret và điều phối DB với Storage; FE gọi Nest cho hai luồng.
2. **Controller khác service?** Controller ánh xạ HTTP/param/DTO, service xử lý nghiệp vụ và query; DI cấp dependency.
3. **FE validate rồi BE có cần không?** Có, curl/client tùy ý bỏ qua FE; BE là kiểm tra bắt buộc.
4. **Title toàn khoảng trắng bị gì?** Transform trim thành rỗng rồi MinLength fail 400 trước INSERT.
5. **due_date có timezone không?** Không, SQL DATE YYYY-MM-DD; pg parser giữ chuỗi, timestamps khác dùng TIMESTAMPTZ.
6. **Optional null ra sao?** owner/date/evidence null→SQL NULL; status undefined→todo, status null→400.
7. **SQL injection tránh thế nào?** Placeholders `$1..$5` và values tách SQL; không nối input vào query.
8. **Metadata khác file?** Record documents lưu tên/size/key/status; bytes PDF nằm trong Storage.
9. **Private bucket có cách ly user không?** Không; app hiện workspace chung không auth. Cần bảo vệ API trước public deploy.
10. **Signed URL có bí mật không?** Có, là quyền tải tạm 60 giây, không log/quay token và không lưu lâu dài.
11. **service_role khác anon?** service_role là server key có quyền cao/bypass Storage RLS; anon không dùng trong adapter này.
12. **RLS có chặn owner pg connection không?** Không mặc định; owner/bypass role có thể vượt RLS. REVOKE bảo vệ Data API không thay auth NestJS.
13. **Storage xong DB fail thì sao?** Xác nhận record chưa tồn tại rồi xóa bù object; lỗi không xác định giữ key cho reconciliation.
14. **Vì sao query lại khi INSERT timeout?** Timeout có thể xảy ra sau commit; xóa object ngay sẽ làm hỏng record đã lưu.
15. **Delete lỗi nửa chừng?** Giữ metadata deleting/key, chặn download, retry xóa Storage rồi DB; không báo thành công giả.
16. **Signature PDF có đủ an toàn?** Không, chỉ kiểm tra dấu `%PDF-` cùng MIME/extension/size; chưa parser/virus scanner.
17. **503 khác 500?** 503 cho dependency unavailable đã nhận diện, 500 cho lỗi nội bộ chưa phân loại; validation là 400.
18. **Health có kiểm tra Storage?** Không, response nói not_checked; cần upload/download thật để kiểm chứng Storage.
19. **Mock HTTP test chứng minh gì?** Chứng minh routing/validation/service/error contract; không chứng minh pg persistence hoặc Supabase upload thật.
20. **Mất kết nối phục hồi thế nào?** UI giữ trạng thái cũ/File, báo lỗi có requestId nếu tới API; pool thử kết nối lại ở request sau. Khôi phục service, reload đối chiếu rồi retry, không reset dữ liệu.
