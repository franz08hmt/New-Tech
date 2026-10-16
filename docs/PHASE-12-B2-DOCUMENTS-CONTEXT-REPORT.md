# Đợt 12 — B2 lát 6b.2a: Documents và ranh giới Storage

Ngày 16/10/2026, local ExaMate, nhánh `feature/tai-rag-integration`.
HEAD đầu phiên `458879c`, khớp checkpoint. Không fetch/pull hoặc đồng bộ Git.
Phạm vi mới chỉ là DB boundary của DocumentsService, không phải hoàn tất B2.
Các ghi nhận tháng 9 và thiết kế Chặng 0 là lịch sử/đề xuất; source/checkpoint
Đợt 10–11 được dùng để đối chiếu hiện trạng.

## Thiết kế và inventory boundary

Runtime sửa đúng `apps/api/src/documents/documents.service.ts`. Giữ constructor,
public signatures, routes/DTO/contracts, SQL predicates/projections/order và
StorageService/DocumentAccessService/AuthStore/DatabaseService hiện có.
Các helpers `find` và `checkCourse` nay bắt buộc nhận DatabaseTransaction,
không fallback sang database/pool. Không có nested transaction.
So sánh AST với `458879c` xác nhận mọi literal SQL/projection giữ nguyên; chỉ
đổi client/context và cách phân đoạn authorization/side effect.

Principal do guard server xác minh. requirePrincipal/requireRecordWrite/
requireManager chỉ kiểm shape/role sớm, không phải authentication. Mỗi business
query nằm trong workspaceTransaction, dùng tx.query; fresh authorize nhận chính
tx đó và AuthStore.membership giữ nguyên FOR SHARE OF m,w. Không role GUC,
SET ROLE, identity từ DTO hoặc owner fallback để probe.

| Đường service/helper | Transaction ngắn và client | Storage và lỗi |
| --- | --- | --- |
| list | 1 callback: authorize read → scoped SELECT/JOIN | Không Storage; public DTO ngoài callback |
| find/get | get authorize read + find(id,workspace,tx) trong 1 callback | Foreign/missing cùng 404; không lộ key |
| checkCourse | SELECT id/course workspace bằng tx bắt buộc của caller | NULL bỏ qua; foreign course giữ COURSE_NOT_FOUND |
| download attachment/inline | Callback đọc/authorize/find/status; callback thứ hai fresh authorize read | Cả hai đã kết thúc rồi signedDownload; TTL 60 giây, không downloadBuffer |
| upload preflight | Callback authorize write trước validation; callback authorize write + course check sau validation | PDF validation cũ; sau preflight mới upload object, không giữ client/lock |
| upload metadata | Callback fresh authorize write + CTE INSERT/JOIN, server workspace trong INSERT | Sau upload; empty projection throw trong callback để rollback; không trả success rỗng |
| upload probe | Callback mới authorize write + find đúng request ID/workspace | Visible committed row → public document; absence xác nhận → compensation đúng object mới |
| setCourse | 1 callback: authorize write, find, checkCourse, CTE UPDATE/JOIN | NULL course hợp lệ; mapping lỗi ngoài transaction, không query sau SQL aborted |
| remove | Callback authorize manager/find/legacy check/mark deleting; callback fresh authorize trước Storage; callback authorize manager + DELETE | Storage remove ở giữa, không lock qua network; failure giữ trạng thái thật để retry |

List/get giữ status/index quality/course metadata và LEFT JOIN course NULL.
Download không ký cho foreign/missing/legacy/deleting hoặc quyền bị revoke tại
fresh check. Signed URL đã cấp có thể dùng tới expiry sau revoke. Check quyền
và network call **không atomic**; không hứa thu hồi tức thời, không giữ lock qua
Storage để tạo lời hứa đó.

Upload giữ PDF extension/MIME/magic/10 MiB, filename Latin-1→UTF-8 có guard,
multipart limits và projection cũ. Chỉ upload/INSERT một lần. Lỗi Storage có
thể đã nhận object: giữ log uncertainty hiện có, không tự replay network.

## Ma trận reconciliation và delete

| Quan sát sau lỗi INSERT/COMMIT | Quyết định |
| --- | --- |
| Probe có fresh quyền write, thấy đúng row committed | Trả public document; không xóa object |
| Probe có fresh quyền, membership/workspace hợp lệ, xác nhận row không có | Remove đúng key do request vừa tự cấp; không key từ client |
| Probe DB lỗi | Giữ object; log document.reconciliation_required; trả lỗi gốc qua mapper hiện có |
| Membership revoked/inactive hoặc downgraded viewer | Authorize fail trước kết luận absence; giữ object, không replay |
| INSERT trả projection rỗng | Throw trong callback, rollback trước probe; không giả success |

Test fault injection chạy INSERT và COMMIT thật qua non-owner rồi ném lỗi mất ACK
ở wrapper sau commit. Sau đó admin fixture revoke membership; raw SELECT non-owner
thực sự không thấy row dưới RLS. Probe có fresh authorize chặn compensation;
metadata/object committed vẫn còn. Đây là mô phỏng mất ACK có kiểm soát sau commit
thật, không phải thử ngắt TCP hoặc gây lỗi cloud.

Mapper 23503 vẫn dựa chính xác documents_workspace_course_fk (404 course),
documents_workspace_fk (403 workspace); constraint khác và 42501 không bị map
nhầm. Bắt/map ngoài callback nên rollback đã hoàn tất. Probe giữ quyền write
(mạnh hơn read) để downgrade sau upload không bị hiểu thành absence an toàn.

Delete giữ mark deleting → Storage remove → DELETE row. Legacy giữ 409.
Downgrade sau mark chặn Storage; Storage lỗi không xóa metadata. Nếu Storage
thành công rồi DB/membership lỗi, row vẫn deleting, không giả vờ rollback object.
Retry manager còn quyền dùng remove idempotent theo lifecycle hiện có. Chunks
CASCADE chỉ đi theo document đã authorize; không cấp quyền chunks cho runtime.

## PostgreSQL non-owner và bẫy FOR SHARE

Fixture riêng `documents-tenant-fixture.mjs`, không mở rộng fixture metadata-only
Đợt 11. Mỗi suite tạo DB/LOGIN role random và marker riêng, migrate 001–015 bằng
runner thật. Guard loopback *_test chạy trước kết nối/DDL/cleanup; không load env
cloud. Admin chỉ setup/seed/catalog/assert/cleanup trong SQL/HTTP suites.

Kết nối thật chứng minh current_user=session_user, non-owner, NOSUPERUSER/
NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT, không membership leo quyền.
Business RLS vốn đã enabled; policies/grants dưới đây **chỉ fixture**, không áp
production/Supabase hoặc sửa migrations.

| Grants/policies fixture | Giới hạn thực kiểm |
| --- | --- |
| Documents SELECT | Nội bộ BE đọc metadata/key; CTE RETURNING * hiện có yêu cầu SELECT toàn row, kể cả indexed/error fields; public DTO vẫn loại key |
| Documents INSERT | id,name,media_type,storage_key,size_bytes,storage_status,course_id,workspace_id |
| Documents UPDATE | Chỉ course_id,storage_status,updated_at; không workspace/indexing/quality |
| Documents DELETE | Policy chỉ manager trong membership DB |
| Documents SELECT policy | Row workspace = context, user membership active, workspace active |
| Documents INSERT/UPDATE policies | DB manager/member; UPDATE USING và WITH CHECK; không tin principal.role |
| Courses SELECT | Scoped tenant policy để check/join môn |
| Bootstrap SELECT workspaces/memberships | Permissive read test-only, không phải least-privilege production đã duyệt |
| FOR SHARE privilege | UPDATE(id) workspaces và UPDATE(user_id) workspace_memberships, không role/active |
| Lock-only UPDATE policies | USING(true), WITH CHECK(false) trên hai bảng bootstrap; row lock được, UPDATE thật kể cả no-op bị 42501 |

Đã kiểm exact column grants, snapshot trước/sau UPDATE(id=id), UPDATE(user_id=user_id),
UPDATE active/role và denied privileges. FOR SHARE chạy qua AuthStore thật.
Trong lúc giữ lock, admin fixture thử UPDATE membership/workspace có lock_timeout
150ms nhận 55P03; sau release mới hết lock. Không dùng sleep đoán race, không bỏ
FOR SHARE hoặc mock authorize để nhận PoC pass. Bootstrap grants/policies này
không được chọn làm phương án Auth production; chưa có SECURITY DEFINER/helper mới.

Không DDL/TEMP/TRUNCATE, quản lý membership/auth.sessions/ledger/receipt/feedback
hoặc đọc/ghi chunks trực tiếp. Test đọc chunks và ghi processing/quality/workspace
bị chặn. GUC là context do backend đặt, không bảo vệ khỏi người có credential
backend cùng quyền thực thi SQL tùy ý.

Đối chiếu [PostgreSQL 16 SELECT/row locking](https://www.postgresql.org/docs/16/sql-select.html),
[RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html),
[node-postgres transactions](https://node-postgres.com/features/transactions).
Kết luận trên đến từ SQL thật của fixture, không chỉ từ tài liệu.

## SQL, orchestration và HTTP

SQL trực tiếp không WHERE chỉ thấy A hoặc B. Missing/empty context, no-membership,
inactive membership/workspace không đọc/ghi business rows. Raw cross INSERT/UPDATE/
DELETE không đổi snapshot documents/chunks. DB member/viewer không DELETE dù
principal khai manager. Positive service upload/assign/unassign/get/sign/delete
dùng DocumentsService/DocumentAccess/AuthStore membership thật, Storage fake.

COMMIT và rollback reuse pool max=1 cùng backend PID không còn user/workspace
context. A/B concurrent dùng hai PID khác nhau, barrier timeout hữu hạn, rows
không lẫn. Ba Storage operation được trì hoãn bằng gate: request khác dùng cùng
pool max=1 vẫn list được trước khi gate mở; spies xác nhận callback DB không mở
khi upload/sign/remove. Rollback sau INSERT không để partial metadata; delete
chỉ cascade chunks của parent được phép, chunks B giữ nguyên.

HTTP qua AppModule và guard/AuthService thật; upstream/session store synthetic.
Membership của AuthStore delegate xuống query **non-owner thật**, gồm FOR SHARE
ở DocumentAccess. Kiểm cả 7 route/variant: list, get, multipart upload, attachment,
inline, setCourse, delete. Index thuộc ingestion chỉ giữ regression cũ, không
claim non-owner pipeline đã xong.

| Role | Read/get/sign | Upload/assign | Delete |
| --- | --- | --- | --- |
| manager | 200 | 201/200 | 204 |
| member | 200 | 201/200 | 403 |
| viewer | 200 | 403 | 403 |
| no session | 401 | 401 | 401 |
| no membership | 403 trước boundary | 403 trước boundary | 403 trước boundary |

CSRF/Origin lỗi chặn trước transaction/Storage. Foreign ID và missing ID cùng
404 nếu role có quyền; foreign course 404 hiện có, không 500. UTF-8 filename,
NULL course, TTL, projection và không lộ key/SQL/constraint/record B được assert.
Generation/retrieval/ingestion counters 0, downloadBuffer 0 trong suite này;
regression Documents scope cũ còn kiểm embedding/OCR/provider bằng mocks.

## RED → GREEN và mutation

| Test mới trước runtime tương ứng | RED quan sát | GREEN |
| --- | --- | --- |
| documents-read-context.test.mjs | 13 fail, 1 pass, exit 1: membership thiếu tx/read bypass | 14 pass |
| documents-write-context.test.mjs | 17 fail, 1 pass, exit 1: write chưa dùng workspace boundary | 18 pass |

Hai control thiếu principal/role xanh ngay là regression coverage. Các suite SQL
fixture xanh ngay là additional coverage, không nhận TDD. Empty INSERT projection
có regression cho rollback/không success rỗng; không nhận là đã quan sát RED
độc lập cho riêng guard projection (lần RED đầu bị chặn ở boundary). Không
xóa/nới assertion cũ; regression Node focused cuối 164 pass, owner Documents/RAG
SQL cũ 25 pass, typecheck/format focused exit 0.

| Mutation, đã restore từng lần | Lỗi test quan sát | Restore xanh |
| --- | --- | --- |
| list dùng transaction không context | 3 positive non-owner fail | Read/catalog DB 6 |
| Bỏ workspace restriction policy | 1 raw SELECT không WHERE fail do leak | DB 6 |
| Cho member DELETE | 1 raw writes test fail do row bị xóa | Write DB 19 |
| Bỏ fresh authorize trước sign | 1 revoke/sign test fail vì signing trái phép | DB 19 |
| Probe bỏ authorize, coi hidden row là absent | 1 lost ACK + revoked test fail vì compensation xóa object | DB 19 |

Tất cả mutated runtime build thành công; test thực chạy exit 1 đúng assertion,
không syntax/import/all-filtered. Restore bằng bytes đã lưu, không checkout/reset.
Outer PowerShell redirect của mutation driver báo NativeCommandError cho warning
DEP0190 (shell npm với args cố định); từng subprocess mutation/restore có exit/count
riêng như bảng. Không dùng exit wrapper đó làm kết quả app hoặc bỏ lần đo.

## Browser local mới và thành phần thật/giả

Chrome 141 headless CDP, desktop 1440×900 và mobile viewport 375×812. App origin
duy nhất http://127.0.0.1:5173. AuthService và provider/Storage DI fixture loopback;
external fetch chặn. DocumentsService override dùng **DB non-owner + DocumentAccess/
AuthStore thật** trên cùng disposable DB. Các module chưa chuyển và receipt/
feedback dùng connection owner riêng trong harness, được tách khỏi bằng chứng RLS.
Không dev:api nạp root .env. Ingestion bị chặn, không fake index success.

| Luồng browser | Bằng chứng |
| --- | --- |
| Manager, 1440/375 | Upload PDF, gán/bỏ môn, reload persist, delete qua confirm; attachment đúng filename/bytes |
| Manager Storage lỗi, 375 | 503 chủ ý, UI báo lỗi, refresh thấy deleting, retry hoàn tất |
| Member, 1440/375 | Upload/assign/unassign/reload; không DELETE controls; attachment đúng fixture |
| Viewer, 1440/375 | List/NULL-course document, Download đúng bytes; upload/assign disabled, không index/delete controls |
| Draft/New conversation/receipt/feedback/PDF inline | Cả ba role đạt ở desktop/375; receipt/feedback/PDF smoke tại 375 |
| N1 | Manager Documents follow-up có đúng 1 history turn được receipt verify; New conversation reset |

Upload dùng DOM.setFileInputFiles (browser input thật, không OS dialog). Course
selection dùng Home/ArrowDown/Enter; send/confirm bằng focus→Enter, text bằng
native Input.insertText/Ctrl+A, radio Space. Không tuyên bố đã audit toàn bộ Tab
path hoặc thiết bị mobile vật lý. Attachment bytes đọc từ download hoàn tất của
Chrome và khớp PDF fixture; SourcePreview iframe hiển thị PDF trang 1 thật.
Đã xem ảnh Documents manager 375 và PDF 375 có dòng Phase 12 local PDF fixture;
không coi seed ready/fake generation là nghiệm thu extraction/RAG.
ScrollWidth desktop 1425/1440 và mobile 375/375. Các driver đạt cuối: JS exceptions,
console errors/warnings, unexpected network failures và external requests đều 0.
Phân loại riêng 503 chủ ý của manager; cancellation do attachment/navigation:
Documents manager 4, member/viewer 2 mỗi role; Assistant smoke 2 mỗi role.
Attachment hoàn tất 2 file mỗi role; mỗi smoke có 5 receipt responses, 1 feedback
201 và 1 PDF inline response. SQL trước cleanup: manager 9 receipts/1 feedback,
member và viewer mỗi DB 7 receipts/1 feedback; bao gồm server receipt của request
client abort. Helpful vẫn UNREVIEWED, không thành semantic PASS.

Các artifact mới trong `artifacts/phase12-20261016-documents/`, ignored. Giữ log
driver lỗi: CSS selector string sai escaping làm syntax error trước chạy browser;
sửa artifact driver, không tính là test app RED. Lệnh npm dev:web ban đầu truyền
thừa host tạo root sai/404; chỉ dừng Vite do run tạo và chạy đúng workspace script,
không sửa FE/config. Không đổi origin hoặc nới bảo mật để vượt harness.

## Gates, cleanup và WIP

Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux. Compose project riêng
`examate-phase12-documents`, loopback 55432 trống trước start; không chạm SOP stack.
Gates chạy tuần tự, không rebuild dist lúc API fixture/browser đang dùng.

| Gate | Baseline mới | Final |
| --- | --- | --- |
| npm run typecheck | exit 0 | exit 0 |
| npm test | exit 0: 231 Vitest API + 706 Node + 308 web = 1.245 | exit 0: 231 Vitest API + 738 Node + 308 web = 1.277 |
| npm run build | exit 0 | exit 0 |
| npm run format:check | exit 0 | exit 0 |
| npm run test:database | exit 0: 273 | exit 0: 301 |

Baseline và final fail/skip/cancelled 0; đây là run mới, không dùng lại số review trước.
Ba suite DB mới đăng ký tuần tự trong gate chuẩn; chỉ sửa scripts package.json,
không dependency/version/lockfile. Theo thứ tự DB gate: 13/10/14/23/9/18/65/25/1/
29/19/24/23/**6/19/3**; hai unit suite mới thêm 14/18, không đặt ngưỡng tổng giả.
Logs baseline/final và focused/mutation/browser riêng, không ghi đè lịch sử.

Cleanup profile Chrome bị công cụ từ chối theo policy trước thực thi Remove-Item;
không có lý do chi tiết ngoài “blocked by policy”. Không thử đường xóa khác.
Profile được giữ ignored tại artifacts/phase12-20261016-documents/chrome-profile;
Chrome đã nhận Browser.close, Vite và ba API fixture do run tạo đã dừng.
Việc giữ profile không phải blocker của phép kiểm browser đã chạy, nhưng cleanup
profile được ghi riêng BLOCKED. Không có hành động cloud/deploy từ fixture.

Audit sau gates: 0 DB/role Documents còn lại, 0 trong ba DB/role browser còn lại;
cả ba manifest stopped=true. Đã down đúng compose project riêng, không down -v;
volume test-postgres-data của project được giữ. Không còn listener 3000/5173/
55432/9222; SOP frontend/backend có trước vẫn chạy. Hash tất cả WIP/prompt có
trước không đổi; PROJECT-CONTEXT bỏ đúng hunk checkpoint mới thì khớp nội dung
WIP ban đầu. Chỉ profile Chrome còn ignored do policy nêu trên, không có server/
DB/role của run còn hoạt động.

WIP đầu phiên: README, docs/HANDOFF, phần có trước PROJECT-CONTEXT và untracked
resume/prompt Đợt 4/9.1/12. Lưu inventory/hash/patch trong artifacts; không stage
chúng. PROJECT-CONTEXT nếu cập nhật chỉ stage hunk checkpoint mới, không gom WIP.
Không stage prompt Đợt 12 có trước. Rule LogiRoute/Python/Tailwind ở folder cha
khác project; giữ stack ExaMate và không sửa rule/settings.

## Thay đổi ảnh hưởng RAG cho Thắng

Chỉ Documents DB boundary: workspace context, fresh permission, phân đoạn Storage
và reconciliation an toàn. Không đổi chunking/embedding/OCR/ranking/topK/minScore/
scan policy/generation prompt/model/citation validator. Ingestion/retrieval/summary,
receipts/feedback/export và Auth bootstrap production **chưa chuyển**. Không sửa
gold/run lịch sử, runtime credential, production policies hoặc migration 001–015.
Không sửa StorageService/DocumentAccessService/AuthStore/DatabaseService hoặc FE/
AssistantPanel/App/hook/voice. Không cloud writes, Google thật hoặc user thật.

B1 Auth cloud, B2 toàn app, B3 budget bền vững và B4 semantic/live vẫn còn thiếu.
E01 completeness về lời nhắc minh họa chờ human review; E17 vẫn BLOCKED
AI_UNAVAILABLE, không suy thành quota hoặc retrieval sai. Runner live vẫn BLOCKED
trước DB/Storage/provider cho tới khi principal được duyệt. N1 character cap không
phải token/cost cap. Deployment bên ngoài không thực hiện.

## Commit và cách Tài kiểm lại

- `da1a2c4`: read/sign boundary, bắt buộc tx cho find/probe, tests/FOR SHARE PoC.
- `96916c6`: write/reconciliation/delete, unit/SQL/HTTP tests.
- Báo cáo/checkpoint: hash ở bàn giao cuối, không tự tham chiếu hash commit.

Working tree sau bàn giao còn đúng WIP ban đầu: README.md, docs/HANDOFF.md,
phần có trước docs/PROJECT-CONTEXT.md; untracked resume và các prompt Đợt 4/9.1/12.
Không stage các phần đó; index checkpoint chỉ có 7 dòng mới của đợt này.

Kiểm Docker/port; dùng compose project riêng và TEST_DATABASE_URL loopback *_test
đã guard, credential test của compose local. Không dùng cloud DATABASE_URL,
db:migrate mặc định hoặc dev:api nạp env thật. Chạy tuần tự từ root:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
```

Review riêng test FOR SHARE lock/update denial, lost ACK + revoked RLS-hidden row,
và deferred Storage max=1; kiểm output từng suite, không nhận skip/all-filtered.
Browser harness/evidence local ignored, cần fixture cô lập nếu chạy lại. Chỉ code/
tests local của lát này được bàn giao; Auth thật/semantic RAG/cloud rollout cần
nghiệm thu riêng. Không push/merge/deploy, dừng chờ Tài review.
