# B2 lát 6b — thiết kế tiếp theo, chưa triển khai

Đề xuất sau [PoC lát 6a](PHASE-10-B2-CONTEXT-REPORT.md), ngày 15/10/2026.
Cần Tài duyệt phạm vi và người quản lý xác nhận target/role trước mọi cloud DDL.
Không coi tài liệu này là quyền provision, migrate, đổi credential hoặc triển khai.

## Ranh giới và bootstrap

Guard xác minh local session + Supabase Auth, đọc membership/workspace active
rồi mới tạo principal. `requirePrincipal` chỉ kiểm shape. GUC transaction-local
do backend đặt là context, không phải authentication hay biện pháp chống người
đã có credential backend và thực thi SQL tùy ý. Nest permission/scope checks
vẫn giữ trước Storage/provider; không lọc citation sau generation để thay quyền.

AuthStore hiện cần đường **trước principal**:

| Thao tác              | Quyền tối thiểu cần thiết                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap/throttle    | Admission atomic trên `pilot_auth_limits`; tạo/đọc pre-session có expiry                                                        |
| Login/session/logout  | Đọc/tạo/revoke/touch `pilot_sessions` theo cookie hash; thay pre-session trong transaction                                      |
| Refresh               | SELECT FOR UPDATE session, cập nhật token/version/revocation; intent `pilot_refresh_attempts` autocommit độc lập trước provider |
| Cổng membership       | Đọc đúng membership (workspace,user) + workspace active, không cần business context giả                                         |
| Kiểm session upstream | Khi chế độ `database`: USAGE schema auth + SELECT đúng `id,user_id,not_after` trên `auth.sessions`                              |

Refresh đang giữ khóa row trong lúc gọi Auth theo thiết kế đã duyệt; không mở
rộng transaction workspace business sang HTTP/provider/Storage để tái dùng nó.
Intent độc lập cần pool đủ connection; pool max=1 trong PoC chỉ dành kiểm context,
không phải cấu hình refresh production.

Hai phương án bootstrap cần chọn và kiểm riêng:

1. Một runtime role có grants chính xác cho bảng Auth private, thêm policies
   backend-only phù hợp. Không tái dùng grants/policies bootstrap permissive của
   fixture 6a làm kết luận least privilege production.
2. Role/connection bootstrap riêng, hoặc helper SECURITY DEFINER rất hẹp cho
   lookup/atomic operations. Nếu dùng helper: owner không login, fixed search_path,
   schema-qualified objects, revoke PUBLIC EXECUTE, grant từng function, review
   leak/race/recursion. Không helper nhận SQL/role/bảng tùy ý. Chưa thêm helper.

Không cấp được USAGE/SELECT auth.sessions: giữ fail closed ở chế độ `database`.
Phương án `auth_user` hiện có chỉ kiểm Auth `/user` và local revocation/expiry;
không tuyên bố `/user` chứng minh auth.sessions vẫn tồn tại. Người quản lý phải
chọn chế độ và chấp nhận giới hạn revocation/cache TTL (tối đa 30 giây cho
successful verification); outage hết cache vẫn chặn. Không tự đổi config cloud.

## Các module và policies còn lại

Tasks/Courses mới dùng primitive. Exams, study plans, expenses, workspace-records,
Documents/access/ingestion/retrieval/summary/metadata, receipts/feedback và các
CLI/harness còn dùng query/transaction thông thường; phải khảo sát từng path.
Mỗi lát chỉ giữ transaction trong đoạn DB ngắn, không qua provider/storage await.
Giữ predicates workspace dù đã có RLS; các relation course/document cần composite
FK và authorize trước side effects. Không thêm CRUD hoặc thay HTTP contract.

- Business SELECT yêu cầu row.workspace = context + membership/workspace active.
  Writes theo role DB; UPDATE có USING và WITH CHECK, không tin role GUC.
- Documents có cả course nullable; chunks scope qua document được phép. Kiểm
  trước đọc content/index/OCR/embed/generation/sign/delete; nguồn ngoài quyền
  không vào context. Private bucket/TTL 60s giữ nguyên, URL đã cấp không thu hồi
  tức thời khi membership bị gỡ.
- Receipts theo user/workspace/hash, không mở đọc của thành viên khác. Feedback
  tạo từ receipt hợp lệ; viewer được gửi cho chính answer. Replay/conflict phải
  giữ owner/scope; export nội bộ chọn ID có giới hạn + manager context rõ ràng.
- Membership policies không query chính membership theo cách gây recursion.
  Chọn bootstrap/helper được review thay permissive SELECT toàn bảng; policy
  lookup user/workspace cần tránh deadlock/race khi revoke trong transaction.
- Background indexing/harness cần context quản trị/test rõ ràng, không giả đã
  authentication qua HTTP hoặc thêm endpoint bypass. Live runner vẫn BLOCKED
  trước DB/Storage/Gemini cho tới khi thiết kế principal riêng được duyệt.

## Provision, migration và rollback cần chuẩn bị

Tách migration owner khỏi runtime LOGIN NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/
NOCREATEROLE, không owner/schema CREATE, không membership cho phép SET ROLE owner.
Chỉ grants bảng/cột/sequence/function cần dùng, không ALL ON ALL TABLES. Preflight
kiểm effective role, inherited grants, RLS flags/policies, schema USAGE và Auth
bootstrap; kiểm bằng connection runtime thật và SQL thiếu WHERE trên disposable.

Migrations hiện có 001–015 đã ENABLE RLS business tables. Tenant policies/grants
production cần migration mới (số thực tế kiểm lại), giữ checksum/data/IDs/FKs.
Không copy test fixture hoặc sửa 001–015. Lập inventory các policies permissive
cũ để tránh OR mở quyền; kiểm thiếu/empty context default-deny, write mới và
read/update ngoài scope, cả foreign source trước provider. Không switch role
runtime khi module chưa chuyển, nếu không sẽ gây outage do default-deny.

Runbook sau cần maintenance window, backup/counts/integrity baseline, context
coverage checklist, apply bằng runner owner đúng target rồi smoke runtime và
switch credential có phối hợp với Thắng. Rollback giữ app đóng hoặc về binary/
credential scoped an toàn đã duyệt; giữ additive schema/data, không drop/reset/
publicize bucket, không fallback demo vô auth. Chưa chạy các thao tác này.

## Quyết định còn chờ Tài/người quản lý

- Chọn lát/module tiếp và cách tách bootstrap; chưa hứa làm toàn B2 trong 6b.
- Xác nhận DB target, workspace và user UUID được phép, quyền provision role,
  nguồn credential riêng và thời điểm phối hợp Thắng; không suy từ owner_name.
- Xác minh USAGE auth/SELECT auth.sessions có cấp được và chọn chế độ session.
- Duyệt policies/helper/bootstrap và quy trình đổi role/rollback trước cloud.
- B1 Auth thật, B3 budget bền vững và B4 human/live vẫn là nghiệm thu riêng;
  successful PoC local không hoàn thành những mục đó.

Nguồn chính thức đã đối chiếu: [node-postgres transactions](https://node-postgres.com/features/transactions),
[pool release/discard](https://node-postgres.com/apis/pool),
[PostgreSQL 16 RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html),
[transaction-local set_config](https://www.postgresql.org/docs/16/functions-admin.html).
