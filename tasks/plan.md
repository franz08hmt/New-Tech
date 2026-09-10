# Implementation Plan: Tài tiếp quản Homework 3A

## Overview

Mục tiêu trước mắt là để Tài tự chạy, kiểm tra và giải thích được React UI skeleton hiện tại. Chưa mở rộng AI/RAG trong checkpoint này.

## Architecture Decisions

- Dùng ba màn hình Dashboard, Tasks và Courses làm phạm vi demo Homework 3A.
- Dùng PostgreSQL container, NestJS chạy local và Vite chạy local để quan sát rõ từng tầng.
- Sau khi tiếp quản baseline, Tài tự triển khai một thay đổi frontend nhỏ thay vì nhận thêm một feature lớn.

## Task List

### Phase 1: Chạy baseline

- [ ] Task 1: Chạy database, API và frontend trên local.
- [ ] Task 2: Kiểm tra health endpoint, tạo task và cập nhật status.

### Checkpoint: Baseline

- [ ] Tài truy cập được `http://localhost:5173/#dashboard`.
- [ ] `http://localhost:3000/api/health` báo API/database hoạt động.

### Phase 2: Làm chủ Homework 3A

- [ ] Task 3: Trình diễn Dashboard, Tasks và Courses.
- [ ] Task 4: Tái hiện validation cùng loading, empty, success và error states.
- [ ] Task 5: Hoàn thành human-review checklist trong `docs/HOMEWORK-3A-REACT-STUDY-GUIDE.md`.

### Checkpoint: Homework 3A

- [ ] Frontend tests và build pass trên máy Tài.
- [ ] Tài trả lời được ít nhất 8/10 câu tự kiểm tra mà không đọc đáp án.
- [ ] Có screen recording và validation evidence.

### Phase 3: Increment để Tài review và tiếp quản

- [x] Task 6: Thêm bộ lọc owner `All / Tài / Thắng` cho trang Tasks bằng AI assistance.
- [x] Task 7: Thêm automated test cho bộ lọc owner.
- [ ] Task 8: Tài walkthrough code, tự thay đổi nhỏ nếu cần và nhờ Thắng review.

### Checkpoint: Ownership

- [x] Filter hoạt động cùng status filter hiện có.
- [x] Empty state đúng khi không có task phù hợp.
- [x] Test, typecheck và build pass trong phiên AI verification.
- [ ] Tài giải thích được state, event và phép lọc dữ liệu vừa thêm.

### Phase 4: CM-203-FE — document lifecycle preview

- [x] Task 9: Mô hình hóa các trạng thái `selected`, `uploading`, `processing`, `ready` và `failed` chỉ trên frontend.
- [x] Task 10: Hiển thị progress, lỗi mẫu, Retry và trạng thái sẵn sàng cho Assistant.
- [x] Task 11: Khóa luồng chuyển trạng thái bằng automated test và xác nhận không gọi `/api/documents`.
- [ ] Task 12: Tài walkthrough state union, immutable update và tự chạy demo trước khi nhờ Thắng review.

### Checkpoint: CM-203-FE

- [x] Mock lifecycle hoạt động độc lập với backend.
- [x] Test mới đã được chứng minh đỏ trước khi code và xanh sau implementation.
- [ ] Chưa tích hợp upload thật; bước này chờ contract của CM-101/CM-201 từ Thắng.

## Risks and Mitigations

| Risk                                | Impact                        | Mitigation                                             |
| ----------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Docker Desktop chưa chạy            | Không khởi động được database | Mở Docker Desktop và chờ engine sẵn sàng               |
| Port 3000, 5173 hoặc 55432 bị chiếm | Service không bind được       | Kiểm tra service cũ và dừng đúng process/container     |
| Chỉ xem code mà chưa tự thao tác    | Khó vấn đáp                   | Tự chạy demo, cố tình tạo validation/error và đọc test |
| Mở rộng project quá sớm             | Không hoàn tất bằng chứng 3A  | Hoàn thành checkpoint Homework 3A trước Task 6         |

## Open Questions

- Giảng viên yêu cầu nộp link GitHub, file nén hay LMS text?
- Screen recording có giới hạn thời lượng hoặc định dạng không?
