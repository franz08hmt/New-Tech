# Đợt 15 — index reconciliation và B2 lát 6b.3

Ngày 17/10/2026, Asia/Saigon. Nhánh `feature/tai-rag-integration`, HEAD đầu lượt
`3da17c77da24ec048abfec264e8ab8f9db994c91`, khớp checkpoint. Chỉ local
127.0.0.1:5173. Không fetch/pull/push/merge/deploy hoặc thao tác cloud.

## Baseline và bảo toàn WIP

Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux sẵn sàng. Các port
3000/5173/9222/55433 trống trước khởi động. Dùng project riêng
`examate-phase15-pg17`, compose.auth-pg17-test.yaml đã pin PG17/pgvector,
bind loopback 55433. Không load .env cloud; DB guard phân biệt runtime/loopback
và *_test trước connect/DDL/cleanup. Không đổi compose, dependencies, lockfile,
credentials hoặc migration 001–015.

Bảy WIP đầu lượt: README, HANDOFF, PROJECT-CONTEXT tracked; resume và prompt
Đợt 4/9.1/12 untracked. Hash/patch lưu riêng trong artifacts ignored. Không
stage các file đó hoặc sửa .claude/settings.json. Rule cha LogiRoute/Python/
Tailwind không thay kiến trúc ExaMate. Roadmap vốn sạch đầu lượt.

| Baseline mới, chạy tuần tự | Exit | Kết quả                                          |
| -------------------------- | ---- | ------------------------------------------------ |
| typecheck                  | 0    | Đạt                                              |
| test                       | 0    | API Vitest 231 + Node 789 + web 308 = 1.328 pass |
| build                      | 0    | Đạt                                              |
| format:check               | 0    | Đạt                                              |
| test:database PG17         | 0    | 331 pass                                         |

Fail/skip/cancelled đều 0. Bốn gate ứng dụng đã hoàn tất trước sửa runtime FE;
suite DB tiếp tục trên source backend gốc trong lúc thêm focused FE tests.
Không rebuild dist đồng thời với suite/server đang dùng nó.

## A — request lỗi không phải trạng thái DB

Lỗi gốc: DocumentsPanel.process catch luôn gán failed và bật retry. Lỗi POST
không chứng minh DB rollback/failed, đặc biệt persist ready đã commit mất ACK.

Đã thêm state FE riêng theo document, không thêm DB status/contracts:

| POST lỗi / đối chiếu     | Hành vi                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| View/session còn phù hợp | Tối đa một GET document; không gọi reload vốn bị busy guard chặn                                   |
| ready                    | Dùng row/quality server, giữ lỗi request riêng, không giả POST đã thành công                       |
| processing               | Theo trạng thái server, chặn index tiếp                                                            |
| failed                   | Retry thủ công nếu role cho phép                                                                   |
| pending                  | Theo server, không tự POST lại                                                                     |
| legacy/deleting          | Theo lifecycle server, controls giữ giới hạn cũ                                                    |
| GET 404                  | Bỏ riêng row, không append hoặc hồi sinh                                                           |
| POST/GET 401/403         | Transport Auth/quyền cũ vẫn hoạt động, không mở write retry; không đọc tiếp sau POST đã bị từ chối |
| GET network/5xx          | “Chưa xác nhận”, khóa indexing, có Check index status chỉ GET                                      |

Lỗi POST được giữ tại card kể cả GET ready, không đổi thành notice success giả.
Manual check không replay POST. Busy ref chặn double-click; token operation +
lifetime + user/workspace identity chặn stale success/error/finally. Kiểm identity
đồng bộ khi render; account change/unmount không bắt đầu GET cũ. GET chỉ map row
mục tiêu, không thay toàn list. Account change reset view state; PilotAccess vẫn
remount theo principal như trước. Không sửa App/AssistantPanel/hooks/voice.

FE tests trước sửa: **13 fail, 2 control pass**, exit 1. Sau sửa 15/15; thêm
transport control GET qua request helper, không network thật. Focused Documents
permissions + reconciliation + transport **44 pass**, typecheck 0 trước commit A.
Assertion cũ đòi retry sau rejected write được thay bằng denied/no-GET/no-retry,
giữ nguyên role checks. Mutation khôi phục catch “mọi lỗi → failed”: selected
ready test đỏ; restore cả 15 case xanh. Commit A: **e1725ab**.

Review sau A phát hiện 404 xóa card cũng làm mất lỗi POST. Bổ sung assertion
ngay trong case 404: RED vì không còn alert; truyền lỗi request vào read helper
để chuyển thông báo lên panel khi bỏ row → 44 focused tests xanh lại. Commit
bổ sung A **93d222f** cũng format lại riêng DocumentTransport.test.ts theo gate.
Không tăng số case hoặc sửa assertion quyền để che lỗi. Số 16/control 3 trong
cập nhật chat ban đầu đã được đối chiếu và sửa theo log gốc 15/control 2.

Hai assertion bổ sung trong các case GET 401/403 đã RED khi Refresh list vô
tình mở write retry. Commit A **9b617f8** không cho list refresh xóa cờ chưa xác
nhận/denied; targeted GET hoặc account view mới mới giải phóng state tương ứng.
44 focused tests xanh; không tăng số case và không đổi cơ chế Auth.

## B — inventory transaction và provider boundaries

Runtime backend chỉ sửa RagRetrievalService và AssistantService. Primitive,
DocumentAccessService/AuthStore, ingestion/DocumentsService, routes/DTO/contracts,
receipts/feedback giữ nguyên. Principal từ guard; requirePrincipal chỉ shape
validation, không chứng minh authentication. Helpers DB bắt buộc nhận tx.

| Đường                               | Boundary mới                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| retrieve preflight                  | Workspace tx: fresh authorize với chính tx → course check → document scope/state check                               |
| embedQuery                          | Ngoài transaction/client/lock                                                                                        |
| Mỗi vòng nearest scan               | Workspace tx mới: authorize → course/document scope/state hiện tại → candidates bằng tx.query                        |
| Coverage/context                    | Coverage từ document được kiểm lại trong vòng scan cuối; dựng context ngoài tx                                       |
| documentForSummary                  | Một workspace tx: authorize → course/document scope → ordered chunks, giới hạn cũ; material dựng trong callback ngắn |
| documentMetadata                    | Một workspace tx: authorize → course/document scope/LEFT JOIN, không chunk/provider                                  |
| Assistant initial/pre-generation    | Workspace wrapper ngắn, authorize bằng chính tx, kết thúc trước provider                                             |
| Mỗi summary section/final synthesis | Wrapper authorize ngắn riêng, generation ngoài callback                                                              |

SQL scope workspace vẫn ở bên trong CTE nearest trước ORDER/LIMIT. Summary
query có thêm predicate selected course (nullable) trong cùng SELECT chunks,
giữ workspace/document/stored/ready filters; không chỉ dựa metadata chụp trước.
Không nested transactions, pool fallback, SET ROLE, role GUC hoặc global principal.
AssistantService thêm DatabaseService DI để wrapper ngắn; general chỉ thay
authorization boundary tương thích, workspace mode không sửa.

Sau embedding, refile/delete/not-ready/deleting/revoke bị chặn trước candidates.
Mỗi scan mở rộng kiểm lại scope/membership, không trả candidates giữ từ vòng cũ
khi check mới fail. Revoke giữa section chặn section kế và synthesis; unit có
case revoke ngay trước synthesis. Không hứa hủy provider call đã bắt đầu.

Không thay isolation level hoặc hứa snapshot toàn request: READ COMMITTED có
thể thấy thay đổi giữa SELECT/transaction ngắn. Check quyền và provider không
atomic; nguồn có thể đổi sau boundary đã hoàn tất. Tham chiếu đã đối chiếu:
[cùng client node-postgres](https://node-postgres.com/features/transactions),
[PostgreSQL 17 isolation](https://www.postgresql.org/docs/17/transaction-iso.html),
[RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## Golden, RED → GREEN và mutation B

Trước sửa backend, chụp golden trên corpus synthetic bằng source cũ/owner
**chỉ làm baseline**, sau đó khóa SHA-256 tại artifacts/golden-before.json.
`retrieval-context-golden.json` giữ nguyên hash sau thay đổi:
`4b759f0dbd79e1828bee5239d425ad0275791b99b20f3f70cafd93040cb0d7ab`.
Không lấy output mới sửa expected. So sánh non-owner: IDs/order/scores/pages,
metadata/course NULL, coverage, context, question generation input và toàn bộ
ba summary prompts (hai sections + synthesis), source offsets. Các no-history/
N1 prompt goldens hiện có vẫn giữ nguyên.

Unit B trước sửa: **11 fail, 5 control pass**; sau sửa **16/16**. RED bắt context,
stale scope/state/coverage và boundary generation; control đã xanh không nhận
TDD. SQL fixture xanh ngay là additional coverage.

| Mutation build được                | Test bắt lỗi, rồi restore xanh                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Workspace tx → transaction thường  | Positive non-owner không lấy được document                                       |
| Bỏ workspace predicate nearest     | Unit kiểm scope bên trong CTE trước ranking/LIMIT đỏ; RLS raw SQL vẫn kiểm riêng |
| Bỏ document scope recheck          | Refile trong embedding không bị từ chối                                          |
| Bỏ authorize giữa summary sections | Provider call count vượt mức sau revoke                                          |
| Embed trong transaction            | Deferred embedding test thấy client bị giữ, assertion active callback đỏ         |

Mỗi mutation selected 1 fail/0 pass → restore 1 pass/0 fail, 0 skip/cancelled.
Lần viết mutation scope đầu bị TypeScript narrow null thành never nên compile
fail, **không tính caught**; đã restore, sửa mutation build được và chạy đủ năm
lại. Không reset/checkout WIP. Bản source xanh restore đúng bytes.

## Non-owner SQL/HTTP và test fixture

Fixture riêng tái sử dụng lifecycle DB/role random có marker Đợt 12, migrate
001–015 thật; không import *.test.mjs. Read-only extension không dùng grants
ingestion write. LOGIN non-owner NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE,
current_user=session_user, 0 role memberships leo quyền.

REVOKE cả table và column write grants của Documents fixture gốc; chỉ SELECT
đúng cột metadata/course/chunk/vector cần retrieval. Không SELECT storage_key,
không INSERT/UPDATE/DELETE Documents/chunks, không auth.users/receipt/feedback
grants cho runtime. Admin chỉ setup/reset/catalog/assert/cleanup.

Membership/workspace bootstrap SELECT là fixture-only. UPDATE(id/user_id) tối
thiểu để FOR SHARE thực chạy, WITH CHECK(false) từ chối raw no-op UPDATE;
snapshot trước/sau bằng nhau, không quyền sửa role/active. Không coi đây là
Auth bootstrap production đã duyệt. Business policies scope context qua parent
document và DB membership/workspace active; không USING(true) cho business rows.

Hai tenant: B có 120 vectors điểm cao hơn A; A vẫn topK 3, scan 4→8 do ba chunk
low-information, đúng golden. Raw SELECT thiếu predicate, missing/empty context,
inactive/no-membership, foreign document/course đều fail closed. Có SQL tests
refile/delete/state/revoke trong deferred embedding, scope/revoke giữa scan,
coverage mới; pool max=1 còn dùng được khi embedding/generation/summary chờ.
Cùng backend PID sau success/error không còn effective context.

HTTP manager/member/viewer/no-membership: Nest route/CSRF/Origin/real retrieval/
summary/metadata và AuthStore.membership/FOR SHARE/RLS non-owner. Upstream Auth
adapter/session store synthetic; receipt issue/verify DI fixture rõ ràng vì
receipt context ngoài lát, không cấp rộng DB để controller chạy. Không gọi
Storage/generation khi request bị từ chối trước provider.

Các lỗi dựng fixture được giữ log, không nhận app RED: thiếu quality fields,
smallint/integer inference, model name không hợp CHECK; reset chưa dựng lại
parent sau test DELETE; HTTP chưa override Storage nên thiếu SUPABASE_URL.
Đã sửa fixture đúng constraints/DI, không nới guard/schema/policy.

Full API run phát hiện offline evaluation fixture thiếu DB DI mới (804 pass,
1 fail; expected exit 2, actual 3). Chỉ bổ sung workspace callback synthetic
và query trap trong offline fixture, không DB/network/secrets. Regression
zero-network xanh lại; live runner vẫn BLOCKED trước config/DB/provider, không
truyền principal giả hoặc mở khóa live. Không sửa manifest/gold/run lịch sử.

Gate cuối lần đầu: ứng dụng 1.360 pass, format exit 1 ở test transport mới;
DB dừng sau 177 case (176 pass/1 fail) vì spy cũ hook database.query không còn
quan sát nearest khi query đã chuyển tx.query. Đã chuyển hai spy sang workspace
callback/client và revoke sau COMMIT giải phóng FOR SHARE; giữ nguyên 403 và
generation count 0. Đây là cập nhật test boundary cần thiết, không bỏ test hoặc
nới quyền/runtime. Log lần fail được giữ riêng trước run xác nhận.

Run kế tiếp thực hiện 353 DB case: 351 pass/2 fail, HTTP suite cuối chưa chạy.
Hai case scan tiếp theo thấy 0 candidates ngay vòng đầu nên không tới boundary
recheck. Bốn diagnostic runs riêng (mỗi run 22 case) và probe 24 lần reset không
tái hiện được; không thu được EXPLAIN của lần 0 rows, **chưa đủ bằng chứng kết
luận nguyên nhân là HNSW/Auth/RLS**. Không đổi threshold/scan/index settings,
không tắt RLS hoặc xóa assertion để bỏ qua.

Suite mới nay cấp DB/role/corpus/index vật lý mới **cho từng case**, tránh phụ
thuộc DELETE/reinsert/index state từ case trước; các test cùng-pool/reuse vẫn
thực hiện trên một pool trong chính case. Focused 22/22 đạt sau thay đổi này.
Ghi nhận shared-fixture 0 rows vẫn **INCONCLUSIVE**, có log và snapshot suite cũ
ở artifacts để điều tra riêng. Không tuyên bố đã sửa một lỗi ANN production;
bằng chứng PoC giới hạn ở fixture độc lập, không phải nghiệm thu recall/churn.

## Browser, gates cuối và cleanup

Browser Chrome **141.0.7390.123** headless/CDP thật tại app 127.0.0.1:5173;
manager/member/viewer, mỗi role 1440×900 và 375×812. **63 case chính đạt**: manager/
member mỗi role 10 indexing/reconciliation + 13 Assistant smoke; viewer 4 + 13.
AuthService synthetic (không nhập password/cookie), Storage/PDF extractor/OCR/
embedding/generation local fixture, external fetch bị chặn ở server và browser.
Documents/ingestion/retrieval/Assistant authorization thật dùng non-owner context/
SQL/RLS. Các module còn lại, đặc biệt receipt/feedback, dùng owner **chỉ trong
DB disposable**; không coi browser là RLS toàn app hay Supabase Auth thật.

| Browser mới             | Kết quả trực tiếp                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Manager/member indexing | Processing quan sát ở explicit provider barrier → release → ready; reload còn ready                                 |
| Known provider failure  | 503 → GET xác nhận failed, reload còn failed                                                                        |
| POST lỗi sau persist    | Wrapper ném 503 sau service persist/COMMIT thật; GET thấy ready/quality, không POST replay                          |
| GET reconciliation lỗi  | Chưa xác nhận, index disabled; phục hồi read và keyboard Check index status → ready; provider/POST count không tăng |
| Viewer                  | Không index control dùng được; direct POST 403 trước embedding                                                      |
| Summary/course_info     | Chọn document → summary grounded fixture và đúng course metadata, cả hai viewport                                   |
| N1/9.1                  | Follow-up có một lượt context đã verify; draft B giữ, untouched clear; New conversation chặn response cũ            |
| Preview/download        | PDF bytes local đúng fixture; source mở trang 1; course NULL còn hiển thị                                           |
| Feedback/receipt        | Mỗi role một feedback lưu DB local; draft giữ; receipt boundary riêng owner fixture                                 |
| Accessibility/layout    | Keyboard hoạt động; scrollWidth ≤ viewport; 0 JS exception/console error/warning/external request                   |

16 HTTP 503 chủ ý được giữ riêng (12 POST process, 4 GET status); không gọi là
JS error hoặc âm thầm loại. Viewer direct 403 do driver gọi qua Node không tính
vào network list trong browser. Response fault là test wrapper sau COMMIT thật,
không giả ngắt TCP/cloud. DB suite Đợt 14 vẫn kiểm lost ACK ở real client facade.
Không dùng fake embedding/PDF ASCII để nhận OCR/semantic quality.

Sau vá bổ sung 404, chạy thêm **2 case browser manager ở 1440/375px**: POST lỗi,
GET 404, bỏ riêng row nhưng alert còn lỗi POST, không replay, không overflow.
Hai case này dùng DOM click trong browser thật; keyboard đã kiểm trong 63 case
chính, không gán DOM click thành keyboard evidence. Tổng **65 case browser**.
Giữ các attempt driver lỗi: native activation chưa phát POST; lần kế đã thấy
POST 503/GET 404 nhưng thiếu navigation barrier giữa viewport gây stale DOM;
thêm about:blank barrier rồi cả hai case đạt. Không sửa app/assertion để né.

Artifacts mới dưới `artifacts/phase15-2026-10-17T08-35-26-287Z/` và thư mục
`-browser` tương ứng: gate logs, RED/mutation, golden hash, JSON từng role và ảnh.
API của cả ba role đã cleanup DB/role qua marker, server/Vite/Chrome đã dừng.

Lần xác nhận cuối `final-current` chạy tuần tự trên source đã commit A và B:

| Gate cuối                               | Exit | Pass | Fail / skip / cancelled |
| --------------------------------------- | ---- | ---- | ----------------------- |
| typecheck                               | 0    | —    | —                       |
| test: API Vitest                        | 0    | 231  | 0 / 0 / 0               |
| test: API Node                          | 0    | 805  | 0 / 0 / 0               |
| test: web Vitest                        | 0    | 324  | 0 / 0 / 0               |
| build                                   | 0    | —    | —                       |
| format:check                            | 0    | —    | —                       |
| test:database, PG17.11 / pgvector 0.8.7 | 0    | 357  | 0 / 0 / 0               |

Tổng ứng dụng **1.360 pass**, DB **357 pass**, cả năm gate exit 0. Đây là output
mới của lượt cuối, không lấy baseline hoặc các lần fail trước làm kết quả.
Chi tiết các tiến trình Node trong gate DB (đều exit 0, fail/skip/cancelled 0):

| Suite `*.database.test.mjs` | Pass |
| --------------------------- | ---- |
| pilot-rollback              | 13   |
| database.test.mjs           | 10   |
| pilot-cli                   | 14   |
| workspace-migration         | 23   |
| workspace-domain            | 9    |
| pilot-rollback-014          | 18   |
| workspace-academic          | 65   |
| workspace-documents-rag     | 25   |
| answer-receipt              | 1    |
| receipt-ownership           | 29   |
| workspace-context           | 19   |
| academic-context            | 24   |
| workspace-records-context   | 23   |
| documents-context           | 6    |
| documents-write-context     | 19   |
| documents-http-context      | 3    |
| ingestion-context           | 26   |
| ingestion-http              | 4    |
| retrieval-context           | 22   |
| retrieval-http              | 4    |

Audit read-only sau gate: **0 DB con, 0 role con ngoài dự kiến**. Một role
bootstrap của harness chuẩn còn trong parent DB disposable; volume local
`examate-phase15-pg17_auth-pg17-test-data` được giữ, không xóa volume. Đã
`compose down` đúng project riêng, không `-v`; không đụng SOP containers có
trước. Không còn listener của lượt này ở 3000/5173/9222/55433.

Công cụ từ chối lệnh xóa bốn Chrome profile mới theo policy. Giữ nguyên cả
bốn trong các thư mục ignored `-browser`, `-browser404`, `-browser404b`,
`-browser404c`; không thử công cụ/cách khác để vượt policy. Log/ảnh và snapshot
diagnostic giữ local. Hash cuối xác nhận **7/7 WIP đầu lượt nguyên bytes**.

## Commit và phạm vi nghiệm thu

- `e1725ab`: FE reconciliation và tests.
- `93d222f`: giữ lỗi request khi GET 404 bỏ row, regression tương ứng.
- `9b617f8`: list refresh không mở lại write đang chưa xác nhận/bị từ chối.
- `84548ce`: retrieval/summary/metadata context, generation boundaries,
  fixture compatibility, golden và unit/SQL/HTTP tests.
- Báo cáo này và checkpoint B2 roadmap được commit riêng sau các commit code.

Staged diff đã kiểm đúng paths, whitespace và mẫu credential; không stage
README/HANDOFF/PROJECT-CONTEXT hoặc bốn prompt/resume untracked có trước.
Không push/fetch hoặc xác minh lại GitHub; ahead chỉ so với tracking ref local.

Code và local regression đã qua gate; browser local **65 case đạt** với các
lớp fake/owner đã nêu. Shared-fixture scan 0 rows vẫn **INCONCLUSIVE**, không
nhận là đã sửa hay đã chứng minh ANN ổn khi corpus/index churn. Tenant policies
cloud/runtime least privilege, Supabase Auth hai máy và semantic RAG không
được nghiệm thu bởi các kết quả fixture này.

## Thay đổi ảnh hưởng RAG cho Thắng

Chỉ DB transaction/authorization/scope recheck, và FE hiển thị outcome chưa rõ.
Không đổi chunking/extraction/OCR, embedding model/dimensions, distance/score/
topK/minScore/candidateLimit/MAX_CANDIDATE_SCAN/tie-break/useful-text/truncation;
summary batching/section limits/source offsets, prompt/system/version, N1
history/hash/marker sanitization, citation parser/validator/fallback hoặc
response shape. Fake vectors/provider không chứng minh semantic RAG.

Còn lại theo lát được giao riêng: receipts/feedback/export context; tenant
policies/runtime least privilege toàn app và Auth bootstrap; B3 budget bền vững;
B4 live/semantic review. Không làm các phần đó. B1 cloud bootstrap/Auth HTTP Tài
là checkpoint lịch sử đã thực hiện; máy Thắng vẫn REMOTE_MACHINE_NOT_VERIFIED,
B1 extended/semantic RAG chưa được đợt này nghiệm thu.

## Tài tự chạy lại

Từ root, kiểm Docker/port trước, dùng target disposable guard; không chạy
dev:api nạp .env cloud hoặc db:migrate cloud:

```powershell
docker compose -p examate-phase15-review -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-phase15-review -f compose.auth-pg17-test.yaml down
```

Gate chuẩn đăng ký unit B và hai DB suites mới, chạy tuần tự; không -v hoặc
DROP FORCE. Browser drivers/logs/screenshots fixture local ignored theo run;
replay phải tạo output/profile mới, kiểm port trống và external network block.
Tự thử A: index fixture với response fault sau persist → GET ready; chặn GET →
chưa xác nhận/khóa POST; phục hồi GET rồi Check index status, POST count không tăng.
