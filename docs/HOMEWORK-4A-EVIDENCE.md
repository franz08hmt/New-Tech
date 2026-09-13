# Homework 4A — Backend vertical slice và bằng chứng

Đối chiếu source với kết quả đã chạy ngày 13/09/2026. “Đạt mock” nghĩa là HTTP application Nest thật với dependency test; không có nghĩa đã kết nối Supabase. Chưa được coi toàn bộ Homework 4A hoàn thành vì còn thiếu persistence cloud/data proof và commit repository.

## Bảng đối chiếu yêu cầu giảng viên

| Yêu cầu | Code | Cách kiểm tra | Bằng chứng / trạng thái |
|---|---|---|---|
| Endpoints cho một workflow hoàn chỉnh | tasks.controller/service, documents.controller/service | create/list/status; upload/list/download/delete qua HTTP | Đạt contract bằng tests; [output](evidence/test-output.txt), [backend bổ sung](evidence/backend-final.txt) |
| Validate input, success/error status | DTO, ParseUUIDPipe, FileInterceptor, common/http.ts | Valid 201; whitespace/UUID/status/date/field 400; missing 404; size 413; type 415; dependency 503 | Đạt automated HTTP tests |
| Store/retrieve persistent data | DatabaseService `pg`, tasks SQL, documents metadata + StorageService | DB test và cùng UUID sau reload/restart | Code có; **chưa kiểm chứng persistence thật**; TEST_DATABASE_URL absent |
| Health endpoint | health.controller.ts | GET /api/health 200/503, storage:not_checked | Đạt HTTP mock; pg connection refusal thật trả 503; chưa có DB healthy thật |
| Useful logs | common/log.ts, common/http.ts và service events | Liên hệ X-Request-ID với status/duration/event | Đạt logs từ HTTP tests, mẫu bên dưới; không phải log cloud |
| Secrets outside repo, .env.example | config.ts, .env.example, ignore files, Docker env_file | Missing config; frontend bundle không có tên biến/secret key; review files | Đạt kiểm tra source/config test; .env thật chưa có |
| API automated valid + invalid | test/api.test.mjs, helpers.mjs | npm test, POST JSON qua localhost HTTP | Đạt, bao phủ nhiều hơn một valid/invalid; build giữ decorator metadata |
| Submission: API repository commit | Repository Git | git status + git rev-parse HEAD sau review/commit | **Thiếu**: bản ZIP không có .git; chưa commit/push |
| Submission: test output | docs/evidence, artifacts | scripts/verify.ps1 | Có output thực, [VERIFICATION](VERIFICATION.md) phân loại pass/skip |
| Submission: request examples | requests.http, requests/*.json | curl.exe bên dưới | Có request tái lập; cloud vẫn chưa chạy |
| Submission: log evidence | request middleware và business logs | Tìm requestId trong output | Có bằng chứng HTTP tests; cần thêm runtime log sau cấu hình |
| Submission: data proof | PostgreSQL rows và Storage objects | SELECT cùng UUID, đối chiếu object | **Thiếu** ảnh/query cloud; checklist bên dưới |

## Endpoint và request mẫu

Tại root, backend đã chạy và cấu hình đúng. PowerShell dùng **curl.exe** để tránh alias curl=Invoke-WebRequest; dùng file JSON để tránh lỗi quote Windows. Ubuntu dùng curl tương tự.

```powershell
curl.exe -i http://localhost:3000/api/health
curl.exe -i -H "Content-Type: application/json" --data-binary "@docs/requests/create-task.json" http://localhost:3000/api/tasks
curl.exe -i -H "Content-Type: application/json" --data-binary "@docs/requests/invalid-task.json" http://localhost:3000/api/tasks
curl.exe -i http://localhost:3000/api/tasks
```

POST hợp lệ kỳ vọng 201 JSON task, title đúng và status todo. POST whitespace kỳ vọng 400 JSON có message array và requestId, không có row mới. Dùng [requests.http](requests.http) thay UUID vừa tạo để PATCH status done; UUID sai 400, UUID đúng nhưng không tồn tại 404. dueDate là YYYY-MM-DD, không phải timestamp. Field lạ bị từ chối; null optional owner/date/evidence→NULL, status null→400.

```powershell
# Thay sample.pdf bằng PDF mẫu có thật, không nhạy cảm.
curl.exe -i -F "file=@sample.pdf;type=application/pdf" http://localhost:3000/api/documents
curl.exe -i http://localhost:3000/api/documents
# Dùng UUID thật từ response upload:
$documentId = 'REPLACE_WITH_UPLOADED_UUID'
$download = Invoke-RestMethod "http://localhost:3000/api/documents/$documentId/download"
# Không in $download.url ra terminal/video vì chứa token.
Invoke-WebRequest -Uri $download.url -OutFile downloaded-demo.pdf
curl.exe -i -X DELETE "http://localhost:3000/api/documents/$documentId"
```

GET download trả 200 `{url,expiresIn:60}`, không binary trực tiếp. DELETE 204 không body; gọi lại cùng UUID khi đã xóa vẫn 204. Upload missing400/type415/size413 đã test; signature `%PDF-` không phải full PDF validation.

## Test và log thực tế

[test-output.txt](evidence/test-output.txt) ghi suite sau `npm ci`: 1 Assistant unit, 29 HTTP/adapter tests và 19 frontend tests. Review sau đó thêm reliability tests; [backend-final.txt](evidence/backend-final.txt) là trích output lần cuối có **32 backend HTTP/adapter/reliability tests đạt**. Tổng số test hiện tại 52 (1+32+19); DB integration riêng **skip 1**, không cộng skip thành pass.

Trích nguyên log từ lần HTTP test đầu (UTC; +07 là ngày 13/09):

```json
{"timestamp":"2026-09-12T19:12:28.176Z","level":"info","event":"request.completed","requestId":"3cc97c15-f8d9-4eeb-a2e1-8fc159e760b0","method":"POST","path":"/api/tasks","status":201,"durationMs":596}
{"timestamp":"2026-09-12T19:12:28.277Z","level":"info","event":"request.completed","requestId":"9994f65d-f069-4ac2-96e8-e79ff29a0350","method":"POST","path":"/api/tasks","status":400,"durationMs":3}
```

UUID/task/document trong log test là fixture. Test Storage mock thành công **không chứng minh object trên Supabase**. Lỗi pg ECONNREFUSED được thử trên cổng localhost riêng không có DB, chỉ chứng minh xử lý unavailable, không persistence.

## Data proof cần bổ sung sau cấu hình

1. Tạo task, lưu UUID, PATCH done. Upload PDF, lưu document UUID, reload browser.
2. Restart API/container, GET lại thấy cùng UUID/status/metadata.
3. SQL Editor SELECT task/document theo hai UUID. Mẫu query an toàn có ở SUPABASE-SETUP; không chụp connection string.
4. Storage UI có object key khớp documents.storage_key, size đúng. Download mở được, so SHA-256 nếu cần.
5. DELETE document mẫu; xác nhận metadata và object biến mất. Không xóa dữ liệu người dùng khác.
6. Lưu ảnh/query output đã loại thông tin nhạy cảm cùng runtime log requestId. Cập nhật trạng thái các dòng “thiếu” sau khi có bằng chứng thật.

## Commit dùng nộp

**Chưa có**. Thư mục không có Git metadata; không thể dùng hash từ README lịch sử làm bằng chứng. Hướng dẫn review/stage/commit/hash nằm cuối [DEMO-SCRIPT-VI](DEMO-SCRIPT-VI.md). Không có thao tác commit/push tự động trong phiên này.
