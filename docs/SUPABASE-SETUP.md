# Supabase cho Homework 4A/4B

Chưa có credential trong phiên triển khai ngày 13/09/2026. Hướng dẫn dưới đây là quy trình cần thực hiện, không phải xác nhận đã kết nối. Không gửi password/key vào chat hoặc chụp màn hình trang API Keys.

## 1. Project và connection string

1. Tạo/chọn Supabase project do bạn quản lý. Không cần mua add-on cho bài demo.
2. Mở **Connect**. Backend này là Node server sống lâu, dùng `pg.Pool` tối đa 5 connection. Chọn **Direct connection** nếu máy/container có IPv6 tới endpoint; nếu mạng chỉ có IPv4, lấy **Session pooler**, cổng 5432. Không dùng transaction pooler 6543 cho migration có session advisory lock.
3. Sao chép nguyên hostname, username, database từ dashboard. Không suy luận hostname theo vùng. Session username thường khác direct username.
4. Điền database password trong `.env` root. Percent-encode **phần password**, không encode toàn URL: ví dụ password minh họa `p@ss:demo` thành `p%40ss%3Ademo`. Không dán secret vào lệnh shell/history để encode.
5. Trong PowerShell: `Copy-Item .env.example .env` **chỉ khi chưa có `.env`**. Chỉnh bằng editor local. File đã được ignore. Không overwrite `.env` đang có.

Nguồn chính thức: [kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [pool và IPv4](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits). Lựa chọn endpoint còn phụ thuộc mạng thực tế; chưa đo được kết nối project của bạn.

## 2. Biến môi trường

| Biến | Ý nghĩa / cấu hình |
|---|---|
| `DATABASE_URL` | URI runtime, bắt buộc; không có fallback localhost |
| `MIGRATION_DATABASE_URL` | URI owner chạy DDL; để trống dùng `DATABASE_URL` |
| `DATABASE_SSL` | `true` cho cloud. `false` chỉ chấp nhận localhost/127.0.0.1/::1/db |
| `DATABASE_CA_CERT_PATH` | CA tải từ project. Dev: `secrets/prod-supabase.cer`; Docker: `/run/secrets/prod-supabase.cer`. Trống dùng trust store hệ điều hành |
| `DATABASE_POOL_MAX` | Mặc định 5, từ 1 đến 20; tổng pool tăng theo số API instance |
| `DATABASE_TIMEOUT_MS` | 5000; giới hạn kết nối, query, statement; tối đa 30000 |
| `SUPABASE_URL` | HTTPS origin của project, không thêm `/storage/v1` |
| `SUPABASE_SECRET_KEY` | Server key `sb_secret_...`, ưu tiên khi có giá trị hợp lệ; chỉ gửi qua header `apikey` |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy service_role JWT fallback khi secret key trống/placeholder. Có thể giữ `REPLACE_SERVICE_ROLE_JWT` khi secret key hợp lệ |
| `SUPABASE_STORAGE_BUCKET` | Tên private bucket, mặc định ví dụ `study-documents`; chữ thường/số/dấu `-` |
| `STORAGE_TIMEOUT_MS` | 15000 cho mỗi HTTP request tới Storage, tối đa 30000 |
| `NODE_ENV` | development/test/production |
| `PORT` | 3000, Compose luôn đặt 3000 để proxy đúng |
| `ALLOWED_ORIGINS` | Danh sách origin chính xác, cách nhau bằng dấu phẩy; không phải auth |
| `TEST_DATABASE_URL` | Database test riêng có tên kết thúc `_test`; không dùng production |

`config.ts` tính root từ `import.meta.url`, nên `npm run dev:api` tại root và lệnh workspace đều load cùng `.env`. Environment do Docker/CI cấp có ưu tiên hơn file. Docker dùng `env_file`, không COPY secrets vào image; mount `secrets/` chỉ đọc. Trong `.env` Docker cần đổi CA path sang `/run/secrets/...`; có thể dùng đường dẫn này qua environment override khi chạy Docker để giữ file dev.

Không thêm database/key vào bất kỳ `VITE_*` nào. Frontend chỉ gọi `/api`. Storage adapter dùng native `fetch`, giới hạn thời gian, gửi server key qua header apikey (thêm Bearer chỉ với legacy JWT); không thêm SDK/ORM vì chỉ cần bốn thao tác nhỏ.

## 3. TLS

Tải certificate CA từ Database Settings/Connect theo dashboard project; tạo thư mục `secrets` local nếu cần. `pg` dùng `rejectUnauthorized: true` và CA nếu đã cung cấp, xác minh cả chain lẫn hostname. Không dùng `rejectUnauthorized:false` hoặc `NODE_TLS_REJECT_UNAUTHORIZED=0` để sửa lỗi.

Không thêm `sslmode`, `sslrootcert`… vào `DATABASE_URL` của implementation này: parser `pg` có thể ghi đè `ssl` object; config chủ động từ chối để chỉ có một nguồn cấu hình. [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) giải thích verify-full/certificate; code dùng cấu hình tương đương của driver.

## 4. Migration

Từ root, sau `npm ci`:

```powershell
npm run db:migrate
npm run db:migrate
```

Lần đầu áp dụng `infra/postgres/init/001_init.sql`, sau đó `migrations/002_non_ai_storage.sql`. Lần sau báo `Migration already applied`. Runner có advisory lock, SHA-256 checksum và transaction cho từng migration; không tự drop/reset/truncate. Không sửa file migration đã áp dụng: thêm file thứ tự tiếp theo.

`001_init.sql` được kế thừa nguyên bản, `CREATE ... IF NOT EXISTS` tương thích schema cũ và seed ba task **minh họa** chỉ khi bảng tasks rỗng. Seed không nhân bản khi chạy lại. Giữ `vector` và `pgcrypto` vì script cũ có `embedding VECTOR`; đó là dependency schema, không phải pipeline AI. Supabase phải cho phép bật hai extension; nếu có sẵn trong `extensions`, runner đặt search_path `public, extensions`. Không xóa document_chunks/ai_evaluations.

`002` bổ sung size, storage_status, constraints/index và khóa truy cập Data API. Metadata cũ được đánh dấu `legacy`, không tự nhận là PDF đã tồn tại trong Storage; chỉ tài liệu upload mới có trạng thái `stored`. Constraint title thêm `NOT VALID`: vẫn kiểm tra mọi ghi mới, nhưng không làm migration phá dữ liệu title cũ. Kiểm tra hàng cũ trước khi validate constraint sau này.

Nếu không có quyền DDL/extension, dùng connection migration owner đúng project. Migration chưa chạy trên Supabase thật trong phiên này. Đọc lỗi theo mã, không gửi URI; runner không in SQL/password. Backup/snapshot theo quy trình project trước khi áp dụng lên dữ liệu quan trọng.

## 5. Private bucket

1. Storage → New bucket → tên khớp `SUPABASE_STORAGE_BUCKET`.
2. Tắt **Public bucket**. Giới hạn file `10485760` bytes và MIME `application/pdf`.
3. Không thêm policy cho anon upload/download. Server secret key hoặc legacy service_role key bypass Storage RLS; giữ key ở backend.
4. Backend kiểm tra bucket private khi upload hoặc tạo signed URL. Health **không** kiểm tra Storage. Nếu bucket thiếu/public/key sai, Documents trả 503, không hiển thị Stored giả.
5. Upload PDF mẫu từ Documents; mở Storage kiểm tra key `documents/<UUID>.pdf`. Tên gốc chỉ là metadata. Tải URL qua API có hạn 60 giây, ai sở hữu URL trong thời hạn có thể tải; không quay query token.

Nguồn: [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Storage HTTP API](https://supabase.com/docs/reference/self-hosting-storage). Adapter triển khai HTTP API này trên `/storage/v1`; tests adapter mock HTTP không xác nhận tương thích project thật.

## 6. Quyền PostgreSQL và phạm vi demo

Migration ENABLE RLS và REVOKE ALL cho PUBLIC, anon, authenticated trên bốn bảng nghiệp vụ và schema_migrations. Không tạo policy mở Data API. Nếu trước đây project có custom grants/role membership, cần kiểm tra chúng riêng; migration không sửa toàn bộ role hệ thống.

Connection owner `postgres` được dùng trong demo đơn giản và có thể bypass RLS. RLS **không** tự cách ly người dùng khi truy vấn bằng owner/bypass role. Khi có runtime credential riêng, cấp đúng quyền cho role đó: SELECT/INSERT/UPDATE tasks, SELECT/INSERT/UPDATE/DELETE documents; không DDL, không quyền bảng AI. Nếu role không bypass RLS, owner cần tạo policy `TO <runtime_role>` cho các thao tác tương ứng, `USING (true)`/`WITH CHECK (true)` chỉ cho role backend của workspace dùng chung. Không áp dụng policy đó cho anon/authenticated. Tạo role/password qua cơ chế secrets quản trị, không ghi password trong SQL version control.

Ứng dụng hiện chưa login: mọi người truy cập API đều dùng workspace chung và có thể ghi/tải/xóa. Bucket private không bảo vệ NestJS endpoint. Dev API và Compose web chỉ bind localhost; Vite đã được giới hạn localhost. Chưa deploy public vì chưa có quyền/môi trường deploy và lớp bảo vệ truy cập. Dùng PDF giả lập vô hại, không dùng tài liệu cá nhân. Muốn public cần auth tại ứng dụng hoặc gateway có kiểm soát truy cập trước cả web/API; đó là công việc ngoài bản demo này.

## 7. Kiểm tra và bằng chứng

SQL Editor (không hiện key):

```sql
SELECT name, applied_at FROM schema_migrations ORDER BY name;
SELECT id, title, status, due_date, created_at, updated_at FROM tasks ORDER BY created_at DESC;
SELECT id, name, size_bytes, storage_key, storage_status FROM documents ORDER BY created_at DESC;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('tasks','documents','document_chunks','ai_evaluations','schema_migrations');
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
 AND table_name IN ('tasks','documents','document_chunks','ai_evaluations','schema_migrations');
```

Query grants cuối phải không có grant trực tiếp trên các bảng nêu trên; kiểm tra thêm policy/custom role membership nếu project dùng chung hệ thống khác. Kiểm tra Storage UI, reload trình duyệt, restart API rồi so sánh cùng UUID. `curl.exe -i http://localhost:3000/api/health` phải 200, database connected; không suy ra Storage khỏe từ kết quả này.

## 8. Troubleshooting và lỗi một phần

| Dấu hiệu | Kiểm tra |
|---|---|
| ENOTFOUND/EAI_AGAIN | Host copy đúng từ Connect; DNS/network/project còn hoạt động |
| ENETUNREACH/IPv6 | Dùng session pooler IPv4; không bịa hostname |
| 28P01 | Password/URL encoding/username đúng loại connection |
| Certificate verify failed | CA đúng project, path tồn tại trong runtime, hostname đúng, clock máy đúng |
| 42P01/type vector missing | Migration/extension/search_path; không chữa bằng reset DB |
| 42501 | Quyền connection runtime, grants và policy RLS |
| Storage 503 | Bucket tồn tại/private, secret key hoặc legacy service_role JWT, project/network |
| 413 | File >10 MiB; Nginx 11 MiB tổng request để có multipart overhead |
| Docker unavailable | Mở Docker Desktop, chờ engine Linux; `docker info` |

`document.cleanup_failed`: Storage đã lưu nhưng DB xác nhận không có metadata, xóa bù thất bại. `document.reconciliation_required`: chưa xác định INSERT có commit không. `document.upload_uncertain`: Storage request lỗi/timeout nên chưa rõ có object. Dùng UUID/key từ log đối chiếu DB và Storage sau khi mạng phục hồi. Chỉ xóa object cụ thể đã xác nhận mồ côi, không xóa bucket hàng loạt. Không auto-retry POST upload khi chưa reload đối chiếu vì phản hồi bị mất có thể đã lưu.

Delete đánh dấu `deleting` → xóa Storage → xóa metadata. Lỗi giữ metadata/key để retry; download trả 409 cho deleting. DELETE lại cùng UUID trả 204 nếu đã xóa xong. Đây là compensation, không phải transaction phân tán. Signed URL đã cấp trước delete có thể thất bại khi object biến mất; UI không thể thu hồi URL khỏi người đã nhận.

## Portable CA path và chẩn đoán migration

```env
DATABASE_SSL=true
DATABASE_CA_CERT_PATH=secrets/prod-supabase.cer
```

Đường dẫn tương đối luôn tính từ repository root, kể cả khi npm workspace chạy trong `apps/api`; không dùng `../../secrets/...`. File phải đúng tên `prod-supabase.cer` (không phải `.cer.crt`), đọc được và có định dạng PEM X.509. Docker có thể override bằng `DATABASE_CA_CERT_PATH=/run/secrets/prod-supabase.cer`. TLS luôn xác minh certificate (`rejectUnauthorized: true`).

Runner kiểm tra toàn bộ file SQL trước khi kết nối; lỗi CA nêu `DATABASE_CA_CERT_PATH`, lỗi file SQL nêu migration input và mã lỗi. Không in URI/key/password hoặc nội dung lỗi từ provider. `MIGRATION_DATABASE_URL` trống hoặc chỉ có khoảng trắng sẽ dùng `DATABASE_URL`.

Secret key dùng header `apikey`, legacy JWT dùng thêm `Authorization: Bearer`: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys). Unit tests config/migration dùng CA fixture và database mock, không dùng production hay `TEST_DATABASE_URL`.
