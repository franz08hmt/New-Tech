# Homework 4B — Integrated, reproducible, non-AI

Phạm vi: hai workflow Tasks/Documents. Assistant chỉ preview; Courses/Exams/Research/Finances còn minh họa, Notes lưu browser riêng. Chưa đủ bằng chứng để đánh dấu toàn bộ 4B hoàn thành: còn thiếu chạy Supabase thật, video và exact commit.

## Bảng đối chiếu giảng viên

| Yêu cầu | Implementation / tài liệu | Kiểm tra và bằng chứng | Trạng thái |
|---|---|---|---|
| FE → backend thật → persistent data | api.ts, use-workspace.ts, DocumentsPanel, pg/Storage services | FE tests + HTTP app tests; cần demo cloud | Đạt contract/mock; persistence thật chưa kiểm chứng |
| Docker hoặc setup tái lập | Dockerfiles, compose.yaml, README, lockfile | npm ci --offline thành công; build/Compose config đạt | Có setup và static build; container runtime chưa chạy |
| Deploy khi khả thi hoặc lý do local | README/SUPABASE-SETUP | Không có môi trường/quyền deploy; chưa auth/gateway; localhost binding | Đã ghi lý do local, không có deployment URL |
| Env/setup/start/stop/test commands | README và SUPABASE-SETUP | Làm theo checklist PowerShell; verify.ps1 tạo output | Tài liệu có; phần cloud chờ credential |
| Một handled failure | API/FE error handling, api.test, integration.test, reliability.test | Invalid input400; Storage503 mock + retry; pg refusal503 thật local | Có automated evidence; video failure chưa quay |
| Non-AI | AssistantController trả disabled/preview; UI disabled | Assistant unit + FE tests, không thêm AI SDK/calls | Đạt phạm vi source/tests |
| Submission: reproducible setup/deployment | README, Compose, lockfile | Các command và gates có log | Setup có; Docker/Supabase end-to-end chưa kiểm chứng |
| Submission: main-workflow video | DEMO-SCRIPT-VI.md | Thao tác 5–8 phút, màn hình/kỳ vọng/secret checklist | **Chỉ có kịch bản; chưa có video** |
| Submission: README | README.md | Kiến trúc, runtime, startup/shutdown/tests/troubleshooting/limits | Đã cập nhật |
| Submission: tests | docs/evidence, VERIFICATION.md | 52 test pass theo các lần chạy cuối; DB test skip | Có bằng chứng mock/local failure, chưa cloud |
| Submission: exact commit hash | Git sau review | git rev-parse HEAD + status | **Chưa có**: bản ZIP thiếu .git, không commit/push |

## Luồng A — Tasks acceptance

| Bước | Kiểm chứng đã có | Cần bổ sung |
|---|---|---|
| Mở Tasks/load API | FE render/nav + list mock, HTTP GET thật tới Nest test app | Browser nối runtime cloud |
| Tạo hợp lệ | HTTP201 với normalized title, FE success | Record thật trên Supabase |
| Đổi status | HTTP200, FE dùng response server; giữ owner filter | Đối chiếu DB |
| Reload | FE load lại API; DB test đã viết | Chưa chạy persistence thật |
| Restart API | Database integration test đóng/mở app đã viết | Test đang skip, cần chạy |
| Record/status còn | Chưa có DB proof | Cùng UUID sau restart + SQL |
| Input sai | Whitespace/type/date/status/UUID/field lạ 400, not found404 | Quay validation + requestId |

## Luồng B — Documents acceptance

| Bước | Kiểm chứng đã có | Cần bổ sung |
|---|---|---|
| Chọn PDF/giữ File | FE selection/dedup; upload/retry dùng cùng File | Thử PDF có nội dung vô hại thật |
| Multipart upload backend | HTTP201, missing/type/size/field/count được test | Upload project cloud |
| Storage + metadata | Service/adapter mock và test compensation | Object private bucket + DB record thật |
| List/reload | FE remount load API mock, HTTP GET metadata | Reload browser runtime |
| Download | HTTP JSON signed URL + FE gọi URL | PDF tải thực mở được/hash khớp |
| Delete | HTTP204, giữ metadata khi failure, retry hoàn tất | DB/object thực không còn |
| Sai type/size/Storage lỗi | HTTP415/413/503, FE lỗi/retry; không progress giả | Quay failure; không phá cấu hình cloud |

## Failure demo và persistence

Phương án an toàn nhất để nộp: request title whitespace →400 → chỉnh title hợp lệ →201, log cùng requestId. Với lỗi network: dừng **API demo local**, refresh danh sách báo unavailable, bật lại và Retry. Không xóa database/bucket hoặc đổi key thật. Khi request không tới Nest không có application log — ghi đúng ranh giới đó.

Để chứng minh không mất dữ liệu cần có task/document thật trước khi dừng API, sau đó đối chiếu cùng UUID trên DB/Storage. Mock maps và FE state không đủ chứng minh điều này. Kịch bản chi tiết và thứ tự màn hình nằm tại [DEMO-SCRIPT-VI.md](DEMO-SCRIPT-VI.md).

## Trạng thái deployment và Git

Web/API chạy local khi đã cấu hình; PostgreSQL/Storage dự kiến ở Supabase cloud. Main Compose không có DB local. DB test tách riêng, không thay Storage. Docker engine chưa chạy trong phiên này nên chưa có container smoke hoặc health qua Nginx thật. Không tạo tài nguyên trả phí/deploy externally.

Working tree hiện chứa code mới chưa commit; chính xác hơn đây là thư mục ZIP **không có working tree Git để lấy diff/hash**. Không tạo .git, không đổi lịch sử. Sau khi đưa file đã review vào checkout đúng và commit, lấy `git rev-parse HEAD`, kiểm tra `git status --short`; nếu còn sửa code ngoài commit, hash đó chưa đại diện toàn bộ bản nộp. Chưa có hash để điền ở đây.
