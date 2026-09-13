# Script demo và quay video 5–8 phút

Đây là **kịch bản**, chưa có video được quay trong phiên triển khai. Chỉ nói “đã lưu trên Supabase” sau khi làm đúng phần đối chiếu. Nếu chưa cấu hình cloud, trình bày test mock và nói rõ giới hạn, không dựng dữ liệu giả thành bằng chứng cloud.

## Chuẩn bị trước quay

1. Làm theo README/SUPABASE-SETUP, chạy migration, tạo private bucket và kiểm tra health. Dùng một PDF mẫu vô hại đọc được trong PDF viewer, không chỉ chuỗi `%PDF-` của test.
2. Mở ba cửa sổ: browser app; editor code; terminal logs/test. Supabase chỉ mở Table Editor/SQL và Storage, đóng Settings/API Keys/Connect. Tắt terminal scrollback có secret, đóng `.env` và không quay inspector response signed URL.
3. Chạy `powershell -ExecutionPolicy Bypass -File scripts/verify.ps1`. Giữ output pass/skip, không gọi skip là pass.
4. Ghi revision vào thông tin submission sau khi commit; nếu chưa commit nói bản đang review, không dùng hash cũ. Có thể chụp `git status --short`, `git rev-parse HEAD` sau commit.
5. Kiểm tra UI ở 320, 768, 1024, 1440px: navigation, task form, document actions không overflow; mở/đóng Assistant bằng Escape, focus quay lại trigger. Tests tương tác không thay thế viewport thật.

## Nội dung nói và thao tác

| Thời gian | Lời nói gợi ý | Thao tác/màn hình và bằng chứng |
|---|---|---|
| 0:00–0:40 | “Đây là phần non-AI của ExaMate, hỗ trợ nhóm quản lý công việc và tài liệu. Định hướng sau này là tổng hợp nội dung có trích dẫn; Homework 4 chưa triển khai AI.” | Dashboard rồi Assistant preview; cho thấy nút hỏi disabled, dữ liệu học thuật có nhãn Example |
| 0:40–1:40 | “Tasks lấy record từ NestJS. Em tạo task, gán người làm và đổi trạng thái. Frontend chỉ nhận thành công khi API trả record.” | Tasks → tạo `HW4 demo <thời gian>` → owner Tài → date → tạo → đổi done → thử owner filter → ghi UUID từ Network response (không secret) |
| 1:40–2:50 | “PDF đi qua kiểm tra backend, bytes vào private Storage và metadata vào PostgreSQL. Stored không có nghĩa Indexed hay Ready for AI.” | Documents → chọn PDF → Selected → Uploading → Stored → Download → mở file đã tải. Không quay token signed URL |
| 2:50–3:40 | “Reload hoặc restart API không xóa dữ liệu ở PostgreSQL và Storage.” | Reload browser; restart chỉ API: `docker compose restart api` hoặc Ctrl+C rồi `npm run dev:api`; refresh list, đối chiếu cùng task UUID/status và document |
| 3:40–4:35 | “Em chứng minh hai nơi lưu khác nhau.” | Supabase SQL SELECT tasks/documents theo UUID; Table Editor status/size/key; Storage object đúng key; không mở API Keys |
| 4:35–5:35 | “Backend validate cả khi client không dùng giao diện. Lỗi được trả đúng status và có requestId để đọc log.” | Request whitespace bằng requests.http hoặc curl →400; đối chiếu X-Request-ID với log. Chọn .txt trong UI → thông báo file không hợp lệ. Không làm hỏng project cloud để giả lỗi |
| 5:35–6:40 | “Controller nhận HTTP, DTO validate, service query có parameters. DB transaction không bao phủ Storage nên có compensation và trạng thái deleting.” | Mở create-task.dto.ts, tasks.service.ts, documents.service.ts; chỉ vào `$1`, INSERT catch/find/cleanup và remove |
| 6:40–7:30 | “Tests HTTP chạy Nest app thật với dependency mock; test DB riêng khác kiểm chứng Supabase. App demo dùng chung, chưa có auth nên chỉ mở localhost.” | Terminal output tests, chỉ số skip; mở api.test.mjs/database.test.mjs. Kết thúc bằng Delete tài liệu demo, xác nhận mất metadata và object |

Nếu giới hạn đúng 5 phút: rút phần code còn 40 giây, chạy sẵn output test, không bỏ persistence/validation hoặc ranh giới mock-cloud.

## Demo network failure an toàn (tùy chọn thay phần 4:35)

1. Đã có task/document lưu thật. Chỉ dừng API demo: `docker compose stop api` (không dừng/xóa Supabase).
2. Tại Documents nhấn Refresh list hoặc thử thao tác task. UI báo service/network unavailable, không tạo success mới và không xóa record khỏi DB. Vì request không tới backend nên không có log request API; Nginx có thể trả HTML 502 và client vẫn hiển thị thông báo dễ hiểu.
3. `docker compose start api`, chờ health. Retry list và đối chiếu record cũ. Không bấm upload POST lặp ngay khi kết quả chưa rõ; reload trước.
4. Lỗi Storage/metadata giữa chừng chứng minh trong tests riêng: `HTTP Documents ... failure`, `cleanup`, `retry`; không sửa key thật/bucket thật để tạo lỗi.

## Checklist bằng chứng cloud cần tự ghi

| Thao tác | Kỳ vọng | Trạng thái trong phiên triển khai |
|---|---|---|
| Health thật | 200 database connected | Chưa kiểm chứng |
| Task create/update/reload/restart | Cùng UUID, status done trong PostgreSQL | Chưa kiểm chứng |
| Upload/list/reload/restart | Metadata stored và object đúng key | Chưa kiểm chứng |
| Download | PDF đã lưu mở được; có thể so SHA-256 file gốc/tải | Chưa kiểm chứng |
| Delete | 204, metadata/object không còn | Chưa kiểm chứng |
| Validation/failure | Thông báo đúng, không success giả, retry được | Automated mock đã kiểm tra; video chưa có |
| Video/URL/exact hash | File video hoặc link nộp thực, hash của code đã review | Chưa có |

PowerShell so checksum file PDF vô hại: `Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\demo\sample.pdf'` và tương tự file đã tải. Không đưa nội dung cá nhân lên video; che project/key/token nếu vô tình xuất hiện, quay lại phần đó trước khi nộp.

## Commit sau khi review

Thư mục hiện tại là ZIP không có `.git`. Dùng checkout của repository gốc, đối chiếu/copy **chỉ file thay đổi đã review**; không overwrite công việc chưa commit. Nếu chủ ý nộp một repository mới, tự `git init` sau khi quyết định; phiên triển khai không tự tạo lịch sử.

Tại checkout hợp lệ:

```powershell
git status --short
git diff
# Stage thay đổi đã review; thêm riêng file mới cần nộp.
git add -p
# Hoặc git add <danh sách đường dẫn đã review> bằng tên thật, không nhập dấu <>.
git diff --cached --check
git diff --cached
git commit -m "Complete Homework 4 non-AI tasks and documents integration"
git rev-parse HEAD
git status --short
```

Đưa output hash vào trường revision của bài nộp/video manifest sau commit, không cố nhét hash của chính commit vào nội dung trước commit. Nếu có thay đổi code sau đó, lấy hash mới. Không tự push trong yêu cầu này.
