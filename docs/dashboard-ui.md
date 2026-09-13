# Academic dashboard UI — 09/09/2026

## Phạm vi

Cập nhật 11/09/2026: hero chia đôi giữ tỷ lệ ảnh gốc, lời chào và shortcut Documents/AI; nền sage nhẹ, section card 16px, course icon gọn và danh sách kỳ thi trên Dashboard (trang Exams giữ bảng). Tasks đứng trước lịch, có lối vào thư viện tài liệu. Animation CSS ngắn cho hero/panel và tương tác nút; tắt animation khi `prefers-reduced-motion`. Không thêm thư viện animation hoặc đổi backend.

Frontend React hiện có được thiết kế lại theo ảnh dashboard học tập: sidebar sáng, ảnh cover, thanh tiêu đề xanh xám, lịch, course cards, bảng exams, research board và sticky notes. Dùng Heroicons, Poppins đóng gói local và Tailwind qua Vite. Không sửa backend, database hoặc hợp đồng API.

## Các trang và trạng thái nghiệp vụ

| Trang | Đã hoạt động | Giới hạn |
| --- | --- | --- |
| Dashboard | Điều hướng tháng, tổng hợp các panel | Lịch học là dữ liệu minh họa |
| Tasks | Đọc, tạo, lọc và cập nhật trạng thái qua API hiện có; retry khi lỗi | Cần API và database chạy |
| Courses | Gallery, progress và mô tả | Dữ liệu mẫu, chưa CRUD |
| Exams | Bảng kỳ thi | Dữ liệu mẫu, chưa CRUD |
| Research | Kanban minh họa và ghi chú | Chưa kéo thả; ghi chú chỉ lưu localStorage trên trình duyệt này |
| Finances | Bố cục ngân sách | Số liệu minh họa, không có giao dịch thật |
| Documents | Chọn PDF cục bộ và preview Selected, Uploading, Processing, Ready, Failed | Chỉ là CM-203-FE demo; chưa upload, lưu hoặc index thật |
| Assistant | Trang giải thích phạm vi AI; panel ExaMate AI mở từ mọi trang, đổi gợi ý theo context và hiển thị mẫu câu trả lời/citation | Panel được ghi rõ là interface preview; form gửi bị vô hiệu hóa, chưa cấu hình RAG/LLM |

## File để tiếp tục phát triển

- `apps/web/src/App.tsx`: shell, sidebar, điều hướng hash, metadata và nội dung từng trang.
- `apps/web/src/AcademicPanels.tsx`: lịch, môn học, kỳ thi, nghiên cứu, ghi chú.
- `apps/web/src/TasksPanel.tsx`: giao diện quản lý task và form.
- `apps/web/src/DocumentsPanel.tsx`: chọn file, validation trình duyệt và quản lý danh sách cục bộ.
- `apps/web/src/DocumentCard.tsx`: state union và UI preview vòng đời tài liệu của CM-203-FE.
- `apps/web/src/AssistantPanel.tsx`: panel AI theo page context, suggested questions và anatomy mẫu của grounded answer.
- `apps/web/src/use-workspace.ts`: state dữ liệu và xử lý API, loading/error.
- `apps/web/src/academic-data.ts`: dữ liệu minh họa, tách khỏi API thật.
- `apps/web/src/styles.css`: token màu, bố cục và responsive.
- `apps/web/src/App.test.tsx`: kiểm thử UI, API contract, lỗi và ghi chú.

## Accessibility và khả năng tìm kiếm

Dùng landmark, một h1 cho mỗi trang, h2 cho panel, label form, caption/th cho bảng, alt ảnh, skip link, focus hiển thị, thông báo lỗi và điều hướng bàn phím. Menu mobile đóng bằng Escape. Bảng dài cuộn riêng trên màn hình nhỏ.

Title và description thay theo trang. Đây vẫn là SPA dùng hash: chưa có SSR, URL riêng được index cho mỗi trang, hoặc cam kết thứ hạng SEO/AEO. Không thêm structured data giả cho dữ liệu mẫu. Ảnh cover từ Unsplash cần mạng; không phải ảnh gốc trong screenshot.

## Kiểm tra và bước tiếp theo

Chạy từ thư mục `Final-Project`:

```sh
npm run dev:web
npm run build --workspace @examate/web
npm run test --workspace @examate/web
npm run format:check --workspace @examate/web
```

Tài tiếp tục từng tính năng frontend; Thắng bổ sung API theo kế hoạch nhóm. Chỉ thay một nguồn dữ liệu mẫu bằng API thật mỗi bước và bổ sung test tương ứng. Không coi các trang UI mới là nghiệp vụ backend đã hoàn thành.
