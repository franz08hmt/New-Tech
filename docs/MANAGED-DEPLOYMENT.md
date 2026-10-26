# Triển khai Supabase managed - 23/10/2026

## Trạng thái đã quan sát

Cloud project `kdttaumvsosrfziyydct` đã commit **26 migration** của profile
`supabase-managed`. Stack `examate-final-live-20261023` chạy tại
`http://127.0.0.1:8080`, API healthy, DB TLS/CA xác minh thành công.
Supabase Auth, private Storage và DB là dịch vụ thật. Google PKCE đã hoàn tất
consent do chính người dùng bấm, callback về ứng dụng và mở Dashboard của Tài.
Không còn phải chờ Support ticket SU-521037 để khởi động bản demo này.

45 kiểm tra HTTP qua nginx đạt: đăng nhập/đăng xuất bốn tài khoản, đúng vai trò,
outsider `no_access` và403, viewer bị chặn ghi, dashboard AI chỉ cho manager,
đọc các module, cấp signed URL và đọc object từ private Storage. Đây là ma trận
đã thực hiện, không đồng nghĩa mọi hành động UI đều đã được quay lại trên cloud.
Browser375px: Documents đã tải xong và không tràn ngang; đo layout10 route
không tràn, nhưng không coi phép đo nhanh đó là nghiệm thu mọi dữ liệu đã tải.

## Profile và ranh giới

Immutable017 yêu cầu policy-owner không có membership. Hosted PG17 tự cấp
bootstrap ADMIN/noINHERIT/noSET từ `supabase_admin` cho role creator postgres;
postgres không thể tự gỡ grant này. Profile riêng ghi **tên và checksum thật**,
không sửa lịch sử001-025 và không giả đã chạy canonical017.

- `017_managed_runtime_rls.sql`: giữ quyền/policy ứng dụng, chấp nhận đúng
  bootstrap grant có grantor/option đã pin, chuyển helper bằng quyền tạm rồi gỡ.
- `025_managed_auth_verifier.sql`: private boolean verifier, giữ nguyên owner,
  RLS và ACL của Auth do Supabase quản lý; runtime không đọc trực tiếp Auth.
- `026_managed_platform_connect.sql`: khôi phục CONNECT cho danh sách role
  nền tảng có sẵn sau018, giữ PUBLIC CONNECT bị thu hồi. Supavisor/Auth/Storage
  cần quyền này để mở kết nối mới.

Runtime kiểm contract canonical25 hoặc managed26 độc lập. Digest managed sinh
từ fixture restricted installer trước khi đối chiếu cloud:
`395cff54443a0ff075db33991150c5648b40f16d79c834b6c8699625877c596e`.
Không lấy hash cloud làm expected và không có biến tắt kiểm tra.

## Vận hành hằng ngày

Root `.env` đã trỏ tới LOGIN business/Auth riêng, non-owner, non-superuser,
non-BYPASSRLS. `MIGRATION_DATABASE_URL` để trống trong root env/runtime API.
CA native ở `secrets/prod-ca-2021.crt`, container mount read-only cùng chứng chỉ.
Không gửi env, mật khẩu, account mapping hoặc signed URL vào chat/Git/bài nộp.

```powershell
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml up -d
docker compose -p examate-final-live-20261023 -f compose.yaml -f compose.ca.yaml ps
```

Không migrate/seed mỗi lần mở app. Không chạy canonical rollback017-025 trên
managed ledger. Khi nâng cấp, chọn profile rõ bằng
`node apps/api/scripts/migrate.mjs --profile=supabase-managed` trong process
operator riêng với maintenance URL, sau backup/rehearsal/writer check mới.
CLI validate toàn ledger là prefix của profile trước khi ghi; pending managed
migrations và hook kiểm trước commit nằm trong cùng transaction.

## Khôi phục và bằng chứng

Backup trước rollout gồm dump SQL/Auth/Storage metadata, catalog quyền và byte
11 Storage object (20.837.763 byte). Restore/rehearsal016-025 local đạt;
restricted fixture016-026 và cloud026 đạt. App row fingerprints giữ nguyên tại
commit025; Auth owner/ACL/RLS không đổi. Sau đó có membership Google được cấp
có chủ đích và corpus evaluation mới, không mô tả cloud là chưa đổi dữ liệu.

Backup016 là mốc lịch sử, **không** khôi phục đè khi nhóm đang dùng app. Cần
cửa sổ bảo trì, backup hiện thời và kế hoạch phục hồi trước thao tác khôi phục.
Outcome COMMIT/request không rõ phải đối chiếu ledger/DB, không replay script
rollout, tạo role, membership hoặc provider request.

Bằng chứng private/git-ignored ở `artifacts/managed-completion-20261023/`:
`cloud-schema.json`, `restore-rehearsal-v2.json`, `http-acceptance.json`,
`google-dashboard.jpg`, `mobile-layout.json`, `managed26-final.log`.
Không đưa thư mục `private/` vào bộ nộp. Kết quả AI và chấm ngữ nghĩa ghi riêng.

## Migration 027 - thành viên (26/10/2026, CHƯA áp dụng lên cloud)

`027_workspace_members.sql` thêm hai bảng và 11 hàm cho trang **Thành viên**; không đổi
bảng/chính sách/quyền hiện có và không đổi digest contract (v25/managed26 vẫn
`395cff54…596c`). Profile managed nhận các migration cộng thêm từ 027 sau 026, nên cloud
đang ở 26 chỉ cần "staged" đúng một migration mới. Cho tới khi áp dụng, API vẫn chạy và trang
Thành viên báo chưa bật (`available:false`, ghi trả 503).

Trước khi áp dụng (cần Tài duyệt, như các lần trước): backup SQL/Auth/Storage metadata hiện
thời; rehearsal restore; dừng writer; kiểm `schema_migrations` là prefix 001–026 của profile.
Chạy trong process operator riêng, không đặt `MIGRATION_DATABASE_URL` vào runtime:

```powershell
node apps/api/scripts/migrate.mjs --profile=supabase-managed
```

Sau đó xác minh: ledger có 27 dòng; `to_regprocedure('public.examate_members_list()')` không
null; hai bảng mới có RLS và **không** quyền cho `anon`/`authenticated`/`examate_*`; hàm
`public.examate_member_*` chỉ `EXECUTE` cho `examate_business`, hai hàm `examate_private.*`
chỉ cho `examate_auth`; API khởi động (kiểm contract) và đăng nhập manager thấy trang Thành
viên. Hosted Supabase có thể cấp mặc định cho API role; migration đã thu hồi tường minh và test
managed kiểm lại. Rollback: `infra/postgres/rollback/027_workspace_members_rollback.sql`
(giữ các membership đã cấp, mất profile và lời mời đang chờ). Không dùng rollback canonical
017–025 trên ledger managed.
