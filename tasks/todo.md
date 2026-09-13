# Tài — việc cần làm tiếp theo

## Homework 4 checkpoint — 13/09/2026

- [x] Audit source, giữ stack và giao diện, không commit/push.
- [x] Tasks validation, Documents API/Storage adapter, migration và frontend integration.
- [x] HTTP/mock/frontend tests, typecheck, format, build; output trong docs/evidence.
- [x] Setup Supabase, hồ sơ 4A/4B, study guide và kịch bản demo tiếng Việt.
- [ ] Cấu hình .env riêng và chạy migration/Supabase thật.
- [ ] Chứng minh persistence/restart/download/delete bằng record và object thật.
- [ ] Docker runtime smoke khi Docker Desktop engine hoạt động.
- [ ] Quay video, review code rồi commit tại checkout Git hợp lệ và lấy exact hash.

Trạng thái chính xác: docs/VERIFICATION.md. Các mục bên dưới là backlog/lịch sử Homework 3; preview Documents đã được thay bằng tích hợp API ở checkpoint mới.

## Hôm nay: chạy local

- [ ] Đứng tại `D:\New-Tech\Final-Project` trên nhánh `feature/tai`.
- [ ] Chạy `npm install` nếu dependency chưa được cài.
- [ ] Mở Docker Desktop.
- [ ] Chạy `docker compose up -d db`.
- [ ] Mở terminal 1 và chạy `npm run dev:api`.
- [ ] Mở terminal 2 và chạy `npm run dev:web`.
- [ ] Mở `http://localhost:5173/#dashboard`.
- [ ] Kiểm tra `http://localhost:3000/api/health`.
- [ ] Tạo một task có title hợp lệ và đổi status.

## Sau khi chạy được

- [ ] Thử submit title ngắn hơn 3 ký tự.
- [ ] Tắt API và quan sát error/Retry; sau đó bật lại API.
- [ ] Trình bày ba màn hình Dashboard, Tasks và Courses.
- [ ] Chạy frontend test, typecheck và build.
- [ ] Hoàn thành checklist trong `docs/HOMEWORK-3A-REACT-STUDY-GUIDE.md`.
- [ ] Quay screen recording và lưu validation evidence.

## Task code kế tiếp

- [x] Bộ lọc owner cho Tasks đã được triển khai bằng AI assistance.
- [x] Automated test cho bộ lọc đã được thêm và chạy pass.
- [ ] Tự giải thích test và viết lại phép lọc bằng lời của Tài.
- [ ] Tự đổi một chi tiết nhỏ, ví dụ nhãn hoặc thứ tự option, rồi chạy test lại.
- [ ] Nhờ Thắng review trước khi merge.

## CM-203-FE — việc Tài cần tiếp quản

- [x] Có UI preview cho Selected, Uploading, Processing, Ready và Failed.
- [x] Có progress mẫu, thông báo lỗi và nút Retry.
- [x] Không gọi API document và không thay đổi backend.
- [ ] Mở Documents, chọn một PDF rồi chuyển qua đủ năm trạng thái.
- [ ] Giải thích `DocumentLifecycle`, callback `onStateChange` và immutable `map` update.
- [ ] Chạy lại 12 frontend tests, typecheck và production build trên máy Tài.
- [ ] Nhờ Thắng review trước khi tích hợp contract upload thật.

## Responsive AI Copilot layout

- [x] Viết test đỏ cho open/close, focus và page context.
- [x] Tạo `AssistantPanel.tsx` và giữ state mở/đóng tại `App.tsx`.
- [x] Thêm sample answer/citation với nhãn “Interface preview”.
- [x] Thêm responsive dock ≥1440, overlay laptop và bottom sheet mobile.
- [x] Xác minh không có AI/document request mới.
- [x] Chạy 14 tests, typecheck, format và production build.
- [ ] Tài tự kiểm tra Dashboard, Tasks và Documents khi panel mở/đóng.
