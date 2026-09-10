# Tài — việc cần làm tiếp theo

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
