# Đợt 14 — B2 lát 6b.2b: ingestion workspace context

Ngày 17/10/2026, Asia/Saigon. Nhánh `feature/tai-rag-integration`, HEAD đầu lượt
`ff252559065399e1a84e304aeee5c5573b87e162`, khớp checkpoint. Chỉ local; không
fetch/pull/push/merge/deploy hoặc gọi Supabase/Storage/Gemini/OCR thật.

## Checkpoint, baseline và WIP

Nguồn hiện trạng B1 là phần đầu báo cáo Đợt 13 và PILOT-DEMO-HANDOFF: bootstrap
001–015/workspace/account demo đã thực hiện, Auth HTTP local thật đã kiểm.
Không chạy lại bootstrap hoặc đọc credentials private để tạo fixture. Máy
Thắng vẫn REMOTE_MACHINE_NOT_VERIFIED theo checkpoint, B1 extended chưa đủ.
Các ghi chú PREPARED/chưa migrate trong roadmap/context là lịch sử.

WIP đầu lượt: README/HANDOFF/PROJECT-CONTEXT tracked; resume và prompt Đợt
4/9.1/12 untracked. Đã lưu inventory/hash/patch trong artifacts ignored; không
stage chúng. Rule ở thư mục cha mô tả LogiRoute/Python/Tailwind, không áp sang
ExaMate; không sửa rule/settings. Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux.
Đầu lượt không listener 3000/5173/55432/55433; không dừng stack SOP của người khác.

Docker Linux engine ban đầu chưa chạy. Đã tiếp tục baseline local, unit/TDD;
khởi động bản Docker Desktop đã cài, không cài mới/đổi config; Tài cũng xác nhận
đã bật. Compose project mới `examate-phase14-pg17`, bind 127.0.0.1:55433, image
pgvector PG17 đã pin ở compose.auth-pg17-test.yaml. Thực đo PostgreSQL **17.11**,
pgvector **0.8.7**. DB guard loopback/_test/phân biệt runtime chạy trước connect/
DDL/cleanup; không load .env cloud. Guard chỉ đọc DATABASE_URL nội bộ để so đích.

| Baseline mới        | Exit và kết quả                                     |
| ------------------- | --------------------------------------------------- |
| typecheck           | 0                                                   |
| test                | 0: API Vitest 231 + Node 745 + web 308 = 1.284 pass |
| build               | 0                                                   |
| format:check        | 0                                                   |
| test:database, PG17 | 0: 301 pass                                         |

Fail/skip/cancelled baseline đều 0. DB baseline bị trễ vì Docker: tạm khôi phục
**đúng file ingestion do lượt này sửa** từ snapshot HEAD, build rồi chạy gate
DB cũ tuần tự, sau đó finally trả lại bản vá/build xanh. Không reset/stash,
không chạm WIP. Không dùng test trên source đã đổi làm baseline source gốc.
Hai lỗi script inventory/regex ban đầu là lỗi harness trước khi chạy, không TDD.

## Inventory DB và external boundaries trước/sau

Runtime chỉ sửa `apps/api/src/documents/document-ingestion.service.ts`.
DatabaseService, AuthStore, DocumentAccessService, DocumentsService, controllers,
DTO/contracts/migrations và FE/voice giữ nguyên. `requireRecordWrite` chỉ kiểm
shape/role sớm; authentication vẫn thuộc guard server. Principal không lấy từ
DTO/header/query. Quyền hiện tại luôn đọc DB bằng DocumentAccess với chính tx.

| Bước                      | Trước                                                           | Sau và side effect                                                                                                       |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Kiểm đầu vào/quyền        | authorize ngoài context                                         | requireRecordWrite sớm; fresh authorize trong claim workspace tx                                                         |
| Claim                     | transaction thường: authorize → UPDATE scoped → fallback SELECT | workspaceTransaction; SQL/predicate/lifecycle cũ; COMMIT xong mới download                                               |
| Trước download            | authorize ngoài context                                         | workspace tx ngắn chỉ authorize; kết thúc rồi Storage.downloadBuffer                                                     |
| Trước extraction          | authorize ngoài context                                         | workspace tx ngắn rồi extractor.extract ngoài DB                                                                         |
| Trước OCR                 | authorize ngoài context                                         | workspace tx ngắn rồi ocr.recover ngoài DB                                                                               |
| Chuẩn bị chunks/embedding | prepareDocumentPages + authorize ngoài context                  | cùng prepare/thứ tự; workspace tx ngắn trước embedDocuments ngoài DB                                                     |
| Persist                   | transaction thường                                              | workspace tx: authorize → parent FOR UPDATE/scoped stored+processing → DELETE chunks → INSERT batches 50 → quality/ready |
| Failed bookkeeping        | transaction thường, không kiểm số row                           | workspace tx fresh authorize + UPDATE scoped stored+processing RETURNING id; 0 row không nhận đã ghi failed              |

Mỗi callback dùng tx.query, không pool fallback/nested transaction, SET ROLE,
role GUC hoặc global principal. Happy path sáu workspace transaction ngắn: claim,
bốn boundary external, persist. SQL scope workspace vẫn giữ dù test có RLS.
Storage/PDF/OCR/embedding không giữ connection/row lock. Quyền và network call
không atomic: một call đã bắt đầu không được hứa hủy ngay khi membership revoke.

Tham chiếu đã đối chiếu: transaction phải dùng cùng client theo
[node-postgres](https://node-postgres.com/features/transactions); row locking cần
UPDATE privilege trên ít nhất một cột theo
[PostgreSQL 17 SELECT](https://www.postgresql.org/docs/17/sql-select.html).
Không lấy tài liệu thay kết quả SQL thật.

## Lifecycle, lỗi và COMMIT không rõ kết quả

Đã tái hiện lỗi có sẵn: persist commit ready/mất ACK → request khác claim ready
→ catch cũ UPDATE failed trên processing của request mới. Bản vá dùng cờ local
cho biết callback persist đã hoàn tất trước khi primitive thực hiện COMMIT.
Nếu outcome COMMIT chưa rõ, **không chạy failed UPDATE/probe/retry**. Giữ ready
hoặc processing của lần claim mới, log mã cố định PERSIST_OUTCOME_UNKNOWN.
Claim có cờ tương tự để log CLAIM_OUTCOME_UNKNOWN; lỗi claim ở ngoài catch xử lý
external nên không download hoặc tự reset processing.

Không cần sửa primitive/schema hoặc tạo job token. Với lifecycle hiện có,
processing không thể được request khác claim; cửa sổ sau persist ready là nơi
request cũ phải tuyệt đối không ghi failed. Không đưa bảo đảm này thành cơ chế
chống admin SQL reset trạng thái ngoài pipeline hoặc recovery scheduler mới.

| Trường hợp                                         | Hành vi kiểm chứng                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Manager/member hợp lệ                              | Claim → external → atomic ready, result/quality như cũ                                                              |
| Viewer/shape sai/no-membership/inactive            | Fail closed, không claim/dependency                                                                                 |
| Foreign/missing                                    | 404 chung, không tên/key/provider call                                                                              |
| Legacy/deleting/đã processing                      | Giữ 409 DOCUMENT_NOT_PROCESSABLE/DOCUMENT_PROCESSING                                                                |
| Revoke/downgrade sau claim hoặc từng external step | Fresh authorize chặn bước kế/ready; giữ chunks cũ, không owner cleanup                                              |
| PDF/OCR/embedding lỗi đã biết, còn quyền           | Fresh workspace tx ghi failed, giữ public mapping 422/502/503/504 cũ                                                |
| INSERT batch thứ hai lỗi                           | Primitive rollback DELETE/INSERT/quality, chunks cũ nguyên; failed bookkeeping riêng, không replay INSERT/embedding |
| Parent/state không còn đúng ở persist              | Reconciliation, không failed write theo suy đoán                                                                    |
| Callback persist hoàn tất, COMMIT lỗi              | Giữ outcome có thể đã commit; request lỗi, không giả success hoặc rollback                                          |
| Failed update 0 row                                | Reconciliation + lỗi server, không coi provider error là đã ghi failed                                              |
| Failed SQL/COMMIT hoặc mất quyền khi cleanup       | Request lỗi; không retry cleanup hoặc dùng owner; trạng thái có thể cần operator xem xét                            |

Chỉ lỗi 0-row bookkeeping đổi cách trả lỗi: trước đây báo lỗi provider dù failed
transition không xảy ra; nay generic server error/reconciliation. Không thêm mã
HTTP/contract mới. Các mapping provider, batch/vector validation và private
processingCode/publicError helpers giữ nguyên từng byte sau chuẩn hóa line ending.
Không tự hồi phục job processing không rõ outcome, không thêm queue/scheduler.

## RED → GREEN, test và mutation

Test trước runtime: **30 case: 4 fail, 26 control pass**, exit 1. Bốn RED đúng
lý do: transaction thiếu workspace context; failed bookkeeping thiếu context;
persist mất ACK ghi đè claim mới; 0-row failed update được coi là đã xử lý.
Sau bản vá **30/30**, exit 0. Những role/lifecycle/provider mapping đã xanh ban
đầu là control/regression. Các test bổ sung batch 51 trang và boundary trước
download là additional coverage, không tự nhận TDD.

| Mutation build thành công                         | Test thật bắt lỗi                                                   | Khôi phục       |
| ------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| workspaceTransaction → transaction thường         | Positive non-owner member không index được vì thiếu context         | selected 1 pass |
| Bỏ authorize ngay trước embedding                 | Revoke sau OCR vẫn gọi embedding trái kỳ vọng                       | selected 1 pass |
| Cho viewer claim (bỏ role gate sớm + claim read)  | Document chuyển processing thay vì giữ pending                      | selected 1 pass |
| Failed bookkeeping dùng transaction không context | Provider-failure integration không ghi failed theo RLS              | selected 1 pass |
| Download chậm nằm trong transaction               | Callback/client vẫn bị giữ tại deferred barrier, pool max=1 test đỏ | selected 1 pass |

Mỗi mutation selected 1 fail/0 pass, restore 1 pass/0 fail; 0 skip/cancelled,
không syntax/import/all-filtered. Runner ban đầu kiểm quá hẹp chỉ chấp nhận tên
AssertionError; đã thêm assertion rõ cho positive integration và active-client
barrier rồi chạy lại. Giữ cả log lần đầu, không nhận lỗi runner là mutation pass.
Source được restore đúng bytes, build xanh sau từng lần, không checkout/reset.

Đã kiểm batch 50/1, 51 trang theo thứ tự text/title, model/dimensions 768,
chunk_index/source_page/content và quality độc lập. Không đổi chunker/text
quality/extraction/OCR/embedding implementation. Fake vector không chứng minh
semantic RAG hoặc extraction scan/PDF tiếng Việt có dấu.

## PostgreSQL non-owner và HTTP

Fixture riêng mở rộng một DB disposable do helper Đợt 12 tạo, migrate 001–015
qua runner thật. Không import *.test.mjs, không sửa helper metadata-only Đợt 11.
Role LOGIN random thật, current_user=session_user, non-owner, NOSUPERUSER/
NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT, không role membership leo quyền.
Admin chỉ seed/catalog/đối chiếu/fault fixture/cleanup; service dùng runtime role.

Documents giữ SELECT/INSERT/DELETE và UPDATE cột upload/delete của fixture Đợt
12; extension chỉ cấp thêm UPDATE các cột processing/index/quality cần ingestion.
Không UPDATE workspace_id. Chunks chỉ SELECT/DELETE và INSERT bảy cột dữ liệu
pipeline; không UPDATE/TRUNCATE/DDL/TEMP, auth.users/session/ledger/receipt/
feedback grants. Child policies scope qua parent document + context + membership/
workspace active; write cần manager/member và parent stored+processing. Không
USING(true) cho Documents/chunks. RLS business tables đã ENABLE từ migrations;
không tuyên bố mới bật RLS hoặc đã áp policies production.

FOR SHARE thật giữ cơ chế fixture Đợt 12: UPDATE(id) workspaces và UPDATE(user_id)
memberships để lock, UPDATE policy WITH CHECK(false). Raw no-op UPDATE vẫn bị
từ chối; không cấp quyền sửa role/active. Bootstrap SELECT/USING(true) trên hai
bảng quản trị **chỉ fixture**, không least-privilege production đã duyệt.
[Giới hạn owner/BYPASSRLS và policy](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
vẫn áp dụng: GUC backend tin cậy không thay authentication và không chống người
đã có quyền SQL tùy ý bằng credential backend.

SQL suite kiểm SELECT thiếu WHERE ở cả Documents/chunks; cross-tenant/viewer
claim/INSERT/DELETE; missing/empty context; active/absent membership; concurrent
A/B; claim tranh chấp; batch rollback; pool max=1/query khác chạy khi Storage
deferred; cùng backend PID sạch context sau error/success. COMMIT fault được
inject ở client facade **sau PostgreSQL COMMIT thật**, rồi throw ECONNRESET:
primitive map DATABASE_UNAVAILABLE và discard client. Đây không ngắt TCP cloud.
Có case ready vẫn ready, và case request khác đã claim lại vẫn processing.

HTTP kiểm Nest route/guard/Origin/CSRF và actual ingestion. Một suite mock SQL
cho orchestration; suite DB khác dùng membership/FOR SHARE/service/RLS non-owner
thật. Auth adapter/session store upstream là fixture DI, không Auth Supabase.
Đã giữ regression receipt/Auth bootstrap/refresh qua gate chung, không cấp rộng
receipt/feedback để ingestion HTTP suite chạy.

Lỗi lúc dựng harness được giữ log, không TDD: catalog privilege probe bằng tên
auth.users bị schema USAGE chặn (sửa probe dùng catalog OID, không thêm grant);
claim giả thiếu indexed_at=NULL bị CHECK chặn (thay bằng claim SQL đúng lifecycle);
Nest đóng pool shared giữa role HTTP (facade giữ ownership suite). Không nới
policy/constraint/assertion để làm runtime xanh.

## Browser thật, lớp thật/giả và giới hạn

Chrome **141.0.7390.123** headless qua CDP, app 127.0.0.1:5173. Manager/member/
viewer, mỗi role ở **1440×900 và 375×812**. AuthService/Storage/OCR/embedding/
generation là local fixture; external fetch bị chặn ở harness và CDP. Pipeline
ingestion và DocumentsService thật dùng non-owner/context/RLS; các module ngoài
lát (retrieval/receipt/feedback/workspace data) dùng owner **chỉ trong DB test**.
Không dùng browser đó làm bằng chứng tenant RLS toàn app/Auth thật/semantic RAG.

| Browser case           | Bằng chứng mới                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Manager/member index   | Keyboard → processing; explicit embedding barrier; release → ready; reload còn ready từ SQL |
| Provider quota fixture | 503 đúng; failed và thông báo thật, reload vẫn failed; không ready giả                      |
| Viewer                 | Không control index; direct POST 403 và embedding count 0                                   |
| Download/NULL course   | File bytes PDF đúng fixture, NULL-course document còn hiển thị                              |
| Preview                | Assistant source mở PDF thật trang 1 từ Storage local fixture                               |
| Draft/New conversation | Draft B còn sau answer A; draft không chỉnh được clear; response cũ không append sau reset  |
| Receipt/feedback smoke | Mỗi role lưu một feedback thật vào DB local, draft còn nguyên                               |
| Console/layout         | 0 JS exception/console error/warning/external requests; scrollWidth không vượt viewport     |

Mỗi role 8 smoke case; ingestion manager/member 6 case mỗi role, viewer 4 case:
tổng **40 case browser**. Bốn HTTP 503 chủ ý (hai role write × hai viewport)
được ghi riêng, không coi là JS lỗi hoặc âm thầm bỏ. Không đọc cookie/password,
không real account/cloud key. PDF fixture ASCII nhỏ và extractor giả không
chứng minh OCR/extraction thật.

Giữ ba attempt riêng: lần đầu driver cố serialize DOM element gây CDP error
(sửa predicate trả boolean); lần hai manager UI pass nhưng API teardown còn HTTP
connection (đóng đúng connections của server thuộc harness); lần ba cả ba role
pass và cleanup API xong. Không sửa UI/app hoặc nới assertion theo screenshot.

Quan sát source ngoài phạm vi: DocumentsPanel hiện optimistic failed cho mọi
process error. SQL có thể ready khi mất ACK; cần reload/đối chiếu server trong
thay đổi FE được review riêng. Không sửa DocumentsPanel/AssistantPanel/App/hooks
trong đợt này, không nhận browser đã kiểm fault COMMIT bằng UI.

## Gates cuối, cleanup và commit

Năm gate cuối chạy tuần tự sau browser/mutation, không server dùng dist trong
lúc build. Log riêng dưới `artifacts/phase14-2026-10-17T07-44-24-344Z/`, ignored.

| Gate cuối                                | Exit | Pass / fail / skip / cancelled |
| ---------------------------------------- | ---- | ------------------------------ |
| npm run typecheck                        | 0    | Không suite test               |
| npm test — API Vitest                    | 0    | 231 / 0 / 0 / 0                |
| npm test — API Node                      | 0    | 789 / 0 / 0 / 0                |
| npm test — web Vitest                    | 0    | 308 / 0 / 0 / 0                |
| npm run build                            | 0    | Không suite test               |
| npm run format:check                     | 0    | Đạt                            |
| npm run test:database — PostgreSQL 17.11 | 0    | 331 / 0 / 0 / 0                |

Tổng ứng dụng **1.328 pass** (baseline 1.284); DB **331 pass** (baseline 301).
Các suite DB theo thứ tự script: pilot-rollback 13, database 10, pilot-cli 14,
workspace-migration 23, workspace-domain 9, rollback-014 18, workspace-academic
65, documents-rag 25, answer-receipt 1, receipt-ownership 29, workspace-context
19, academic-context 24, workspace-records-context 23, documents-context 6,
documents-write-context 19, documents-http-context 3, **ingestion-context 26**,
**ingestion-http 4**. Suite mới ứng dụng: ingestion-context 33, ingestion-http 11.
PG16 không chạy lại trong đợt này; không dùng số lịch sử làm PG16 run mới.

Cleanup sau gate: phát hiện đúng hai DB/role con còn từ lỗi teardown harness;
kiểm nonce/name/owner/comment marker, ba policy riêng Đợt 14 và 0 active
connections trước DROP exact tên, không FORCE/CASCADE/wildcard. Audit còn
**0 DB con, 0 role lạ**; parent test DB và một role fixture B0d của gate cũ giữ
trong volume riêng. Đã `down` đúng project examate-phase14-pg17, **không -v**;
volume riêng được giữ, không đụng containers SOP có trước. API/Vite/Chrome do
run tạo đã dừng; audit không listener 3000/5173/9222/55433.

Lệnh xóa ba Chrome profile mới trong artifacts, có kiểm path workspace dự kiến,
bị công cụ từ chối trước thực thi: **blocked by policy**. Không thử đường vòng; ba profile
giữ ignored (không dùng real account/cookie), cùng logs/screenshots fixture.
Không xóa profile lịch sử hoặc tài nguyên của người khác. Bảy file WIP có trước
đã đối chiếu SHA-256 cuối lượt, **byte-identical**, không stage.

Functional commit **54d51a4** gồm đúng chín file: ingestion service/spec,
apps/api/package.json (chỉ scripts), ingestion-context-fixture, ingestion-context
unit/DB suites, ingestion-http unit/DB suites và ingestion-tenant-fixture.
Checkpoint docs là commit kế tiếp, chỉ report này và roadmap vốn sạch đầu lượt;
tra `git log -2 --oneline` để lấy cả hai hash. Staged diff đã review paths,
whitespace, payload synthetic và secret patterns; không private identifiers,
backup, signed URL hoặc WIP cũ. Working tree còn đúng bảy WIP ban đầu; không
push hoặc ghi cloud.

Kết luận riêng: **LOCAL_INGESTION_CONTEXT_VERIFIED** (code/tests/non-owner
SQL/HTTP/browser fixture). Cloud runtime/policies không đổi; Auth hai máy,
B1 extended, B2 toàn app và semantic RAG không được nghiệm thu bằng lượt này.

## Thay đổi ảnh hưởng RAG cho Thắng

Chỉ transaction/authorization/error reconciliation trong DocumentIngestionService.
Không đổi extraction/chunking/text quality/OCR policy, embedding model/dimensions/
batching, retrieval/ranking/topK/minScore/scan policy, generation/system prompt,
N1 history/hash/receipt/citation validator/feedback ownership. Không migration,
dependency/version/lockfile, Auth config/key hoặc TTS/STT/UI change. Helpers
insertBatch/processingCode/publicError byte-equal sau chuẩn hóa line ending.

Module tiếp theo theo phạm vi được giao riêng: retrieval/summary → receipts/
feedback/export → tenant policies và runtime least privilege toàn app (kèm Auth
bootstrap) → B3 budget bền vững → B4 live/semantic acceptance. Không thực hiện
những lát đó. B1 cloud/bootstrap và HTTP thật là checkpoint lịch sử Đợt 13;
máy Thắng/B1 extended/semantic RAG chưa được lát local này nghiệm thu.

## Chạy lại

Từ root, kiểm Docker/port, dùng compose project riêng và target disposable đã
qua guard; không chạy dev:api nạp .env cloud hoặc db:migrate cloud:

```powershell
docker compose -p examate-phase14-review -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-phase14-review -f compose.auth-pg17-test.yaml down
```

Không -v/DROP FORCE hoặc tắt stack khác. Chạy build tuần tự khi fixture đang
dùng dist. Focused Node suites nằm trong gate chuẩn; browser driver/log/screenshot/
mutation artifacts local ignored theo run, không commit response/private data.
Để xem trực tiếp bằng chứng browser: summary và JSON từng role tại
`artifacts/phase14-2026-10-17T07-44-24-344Z-browser3/`; logs/ảnh là fixture mới
của lượt này. Driver/harness local được giữ ở đó và run gốc, chỉ dùng với DB
disposable, thư mục output mới và các port trống; không chạy lại vào output
cũ hoặc thay bằng dev:api/cloud. Không có browser test được giả làm Supabase
Auth/Storage thật.
