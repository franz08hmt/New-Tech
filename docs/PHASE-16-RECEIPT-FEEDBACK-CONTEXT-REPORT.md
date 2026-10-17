# Đợt 16 — positive retrieval, shared corpus và receipt/feedback context

Ngày 17/10/2026, Asia/Saigon. Nhánh `feature/tai-rag-integration`, HEAD đầu lượt
`e0f8e14`, khớp checkpoint. Đợt này **triển khai mới**, không lấy số Đợt 15 làm
kết quả kiểm chứng mới. Không fetch/pull/push/merge/deploy hoặc ghi cloud.

## Khởi điểm, baseline mới và phạm vi

Node 24.13.0, npm 11.6.2, Docker 29.6.2 Linux. Bốn port 3000/5173/9222/55433
trống đầu lượt. Project Docker riêng `examate-phase16-pg17`, compose PG17 đã
pin digest, bind 127.0.0.1:55433. Đo thực tế PG17.11, pgvector 0.8.7. Không
nạp .env cloud; guard target loopback/disposable/khác runtime trước kết nối,
DDL và cleanup. Không chạy PG16 trong đợt này.

Kiểm inventory đầu lượt có đúng bảy WIP: README/HANDOFF/PROJECT-CONTEXT tracked;
resume và prompt Đợt 4/9.1/12 untracked. Lưu status/hash/patch riêng ignored,
không reset/stash/checkout hoặc gom chúng vào commit. Roadmap sạch đầu lượt.
Không tìm thấy AGENTS.md trong các folder cha/root hoặc vùng source đã khảo sát;
không áp kiến trúc LogiRoute/Python/Tailwind của project khác. Không có skill
trong catalog phù hợp cần áp dụng cho lát này.

| Baseline mới, tuần tự từ root | Exit | Pass                                                |
| ----------------------------- | ---- | --------------------------------------------------- |
| typecheck                     | 0    | —                                                   |
| test                          | 0    | API Vitest 231 + API Node 805 + web 324 = **1.360** |
| build                         | 0    | —                                                   |
| format:check                  | 0    | —                                                   |
| test:database PG17            | 0    | **357**                                             |

Fail/skip/cancelled 0. Không rebuild dist song song với suite/server đang dùng
nó. Bốn gate đầu hoàn tất trước sửa các file test có sẵn; hai file A mới chưa
đăng ký vào baseline gate nên không thay số test baseline.

## A — positive assertions và điều kiện chuyển sang B

Commit **8254233**. Không sửa retrieval runtime, gold, prompt, threshold hoặc
index. Tăng assertion trong các test có sẵn thay vì chỉ tăng số lượng case:

- Question và summary HTTP: answerable true; reasonCode grounded; answer có
  marker; citation khớp **toàn bộ** source ID, chunk ID, document, title, page,
  chunk index của corpus cố định; đúng số generation call. Tenant B không thể
  thay nguồn A. Fallback không được tính positive PASS.
- Course_info: đúng metadata/course và NULL-course, answerable/reasonCode/citation
  phù hợp operation; generation count không tăng.
- Coverage unit/SQL: bắt buộc evidence/citations đúng, không chỉ quality fields.
- Các positive service/golden question và summary lớn cũng kiểm answer thực trả
  về; prompt đúng chưa đủ nếu response rỗng hoặc fallback.
- Các negative no-evidence/lifecycle giữ riêng, không buộc chúng answerable.

Focused A ban đầu **43/43 pass** (16 unit + 22 isolated DB + 4 HTTP + 1 shared).
Các assertion mới xanh từ đầu là additional coverage, không nhận TDD RED.
Mutation `chunks=[]` build được, HTTP manager **1 fail** đúng assertion
`known evidence must produce an answer`; restore nguyên bytes, build lại,
**43/43 pass**, không skip/cancelled. Không commit mutation hoặc test đỏ.

### Shared-corpus lifecycle

Suite mới `retrieval-shared.database.test.mjs` được đăng ký tuần tự trong gate
DB, giữ các isolated cases của Đợt 15. **Một DB, một LOGIN role, cùng physical
index OIDs và cùng backend PID** trong **12 chu kỳ** reset/reinsert:

- 24 lượt positive scoped/all-documents sau reset, thêm 12 positive sau khôi
  phục lifecycle: **36 retrieval positive** mỗi lần chạy bounded.
- 12 scoped requests bị từ chối khi document processing; 12 all-documents
  retrieval rỗng đúng vì không còn evidence ready: **24 negative lifecycle**.
- Tenant B có 120 chunks điểm cao hơn; evidence A vẫn đúng IDs/order/scores/
  pages/citations của golden không đổi; scan limit **4 → 8**.
- Mỗi vòng kiểm lại index OIDs/backend PID, không dựng DB/index khác mỗi vòng.
  Không retry case đến khi xanh, VACUUM/REINDEX hoặc đổi planner/ANN settings.

Oracle test-only materializes tập eligible trước exact sort; giữ cùng workspace,
document, course, model, dimensions, stored/ready, non-null vector, text length
và score predicates. Không dùng tổng chunk count làm bằng chứng false-empty.
Oracle và nearest dùng cùng tx/client/context; trong suite này không có hook
đổi scope giữa chúng. Không dùng oracle để thay kết quả runtime.

Nếu nearest rỗng trong khi oracle có eligible rows, suite lưu phase/cycle,
SQL và parameters synthetic, context/principal/runtime role, membership,
document state và oracle/nearest ngay trước cleanup. EXPLAIN ANALYZE nếu thu sau
đó được gắn nhãn **execution thứ hai**, không giả là plan của execution lỗi.
Diagnostic giữ local ignored, không in dữ liệu người dùng.

Các bounded runs focused/mutation-restore hiện **không tái hiện runtime false-empty
có exact oracle đối chứng**. Vì vậy đủ điều kiện độc lập chuyển B. Hiện tượng
shared-fixture Đợt 15 vẫn **INCONCLUSIVE**; không tuyên bố đã sửa ANN/recall/churn
hay nghiệm thu semantic RAG. Các lần chạy lại phục vụ assertion mới/mutation và
gate, không chọn bỏ một lần false-empty để lấy kết quả đẹp.

## B — inventory và bản vá runtime

Runtime chỉ đổi **ba lời gọi transaction trong hai file**:

| Method                             | Query/transaction/error path                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AnswerReceiptService.issue         | workspace tx → fresh read authorize chính tx → INSERT receipt → COMMIT được xác nhận mới return UUID                                                                               |
| AnswerReceiptService.verifyHistory | Empty history không SQL; history có dữ liệu: một workspace tx → fresh read authorize → SELECT FOR SHARE từng receipt; kiểm mode/scope/hash/user/workspace                          |
| FeedbackService.create             | workspace tx → fresh read authorize → SELECT receipt FOR SHARE đúng user/workspace/hash → INSERT ON CONFLICT DO NOTHING → scoped idempotency lookup nếu cần → COMMIT rồi log saved |

Mọi business SQL vẫn tx.query, explicit user/workspace predicates giữ nguyên;
không pool fallback, nested transaction, principal từ client, SET ROLE hoặc
role GUC. Không sửa DatabaseService, AuthStore, canonicalJson/hash, DTO/contracts,
controller runtime, response/header shape, N1 rules hoặc migrations 001–015.
Không provider/Storage call bên trong các callback này.

### Ownership, hash và uncertainty

- UUID receipt do server sinh; table chỉ chứa identity/mode/request/hash/time,
  không thêm question/answer/raw model. Hash không chứng minh facts đúng nguồn.
- Controller hiện có chỉ đặt X-Assistant-Answer-ID sau issue thành công.
  Issue 5xx sau validated answer vẫn 200/no header; issue revoke 4xx vẫn chặn
  delivery. Không replay INSERT hoặc suy COMMIT đã rollback khi mất ACK.
- verifyHistory 5xx chặn request trước retrieval/embedding/generation; không
  dùng best-effort của issuance cho verification. Sai user/workspace/mode/
  course/document/hash vẫn HISTORY_INVALID, không silently bỏ turn.
- Viewer/member/manager gửi feedback của chính answer; manager không được giả
  người gửi khác. Receipt bịa/khác người/hash sai trả 404 chung như cũ.
- Cùng submission/payload replay cùng id/rating/createdAt, một row. Answer đã
  dùng submission khác, payload khác hoặc user khác trùng global submission:
  conflict chung, không trả snapshot/receipt feedback của người khác.
- Fault sau COMMIT thật trên disposable: issue báo outage dù row có thể đã
  persist; feedback báo 503 lần đầu, replay thủ công cùng key trả đúng row/time
  đã persist. Không auto retry hoặc ghi đè. Đây là client facade fault sau SQL
  COMMIT thật, **không phải ngắt TCP cloud thật**.
- Legacy receipt/user NULL giữ nguyên, không backfill attribution hoặc nhận
  thành feedback của user hiện tại. Rating/comment không thành gold/verdict.

### Export maintenance

Không sửa/chạy export cloud. CLI giữ credential maintenance riêng, không runtime
fallback, READ ONLY, workspace filter khớp cấu hình, output ignored/không ghi đè,
legacy_unattributed/user_removed và UNREVIEWED. Không thêm HTTP GET toàn feedback
hoặc quyền app đọc feedback người khác. Regression export được chạy trong gate.

## Test mới, RED → GREEN, RLS và concurrency

Unit boundary trước sửa: **3 RED/1 control pass**; RED đúng vì business SQL dùng
ordinary transaction. Sau bản vá: 4/4; thêm control missing/malformed principal
cho cả ba method, kiểm 0 callback/query/authorize, thành **5/5**. Control này xanh
ngay, không nhận RED. Focused unit/HTTP ban đầu **85 pass**; bổ sung HTTP history
storage outage giữ assertion provider/retrieval count 0.

Fixture `receipt-tenant-fixture.mjs` tái sử dụng lifecycle random DB/role/marker,
guard/migration 001–015 và read-only retrieval fixture. Không import *.test.mjs.
Hai workspace active, workspace inactive, nhiều user cùng workspace và ba role;
Auth schema/users là fixture FK, không Supabase Auth thật.

- Kết nối LOGIN non-owner thật, current_user=session_user; NOSUPERUSER,
  NOBYPASSRLS/NOCREATEDB/NOCREATEROLE, 0 role memberships leo quyền.
- Receipt/feedback SELECT/INSERT policy kiểm workspace **và user** từ context,
  DB membership/workspace active. Feedback association phải khớp own receipt.
- Cột grant đúng nhu cầu INSERT/RETURNING/idempotency; runtime không đọc
  comment/snapshot toàn feedback, không UPDATE/DELETE feedback. Receipt chỉ
  UPDATE(id) phục vụ FOR SHARE; policy WITH CHECK(false) chặn cả no-op UPDATE.
  Raw tests kiểm lock thành công và update/delete bị từ chối, snapshot bất biến.
- Membership/workspace SELECT bootstrap và UPDATE key-column lock privilege
  kế thừa fixture-only; protected/no-op UPDATE cũng bị từ chối. Không coi đây là
  Auth bootstrap/grants production đã duyệt.
- Raw no-WHERE SELECT có positive own rows và không thấy user/workspace khác;
  missing/empty context, legacy NULL attribution fail closed. Raw giả owner/
  workspace/receipt association bị từ chối, counts/IDs/data không đổi.

SQL suite đầu **14/14 pass**, additional coverage. Race dùng pool max=2 và barrier
trước INSERT, **hai backend PID runtime khác nhau** cùng tới barrier trước khi
thực thi write. Một lần ghi nhận PID **2041/2042**; hai acknowledgements giống
nhau, admin assert một row. Không dùng Promise.all trên max=1 để nhận race.

Suite riêng kiểm max=1 giữ cùng PID, clear effective user/workspace sau success/
error; đóng/mở pool vẫn replay đúng identity/time. Lost ACK kiểm row persisted
bằng admin assert, đường service không owner probe/fallback. Admin chỉ setup/
assert/cleanup.

HTTP non-owner **5/5 pass**: ba role qua ba mode chat, receipt/hash SQL thật,
N1 history thật và feedback replay; Auth/CSRF/Origin vẫn hoạt động. Upstream
Auth/session storage synthetic; AuthStore.membership/FOR SHARE, receipt/
history/feedback và retrieval dùng SQL/RLS thật, không receipt DI giả. Có case
COMMIT unknown issue 200/no header, history 503/provider 0, phục hồi old history,
revoke 403/no header và no-membership/provider 0.

Lần dựng HTTP harness đầu fail do Nest/fixture đóng pool hai lần và fault
injector thiếu callback overload của pg.Pool.connect; cùng attempt còn ghi
lỗi guard 014 về workspace setting. Không tính là app RED. Sửa riêng ownership của pool wrapper
và overload; dọn **4 DB/role orphan** sau exact marker/owner/0 connection audit,
không FORCE/wildcard, rồi HTTP 5/5 xanh. Log fail giữ riêng.

### Mutation B

| Mutation build được                 | Assertion bắt lỗi                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Receipt workspace tx → ordinary tx  | Positive non-owner issuance không persist được qua RLS                                                        |
| Bỏ user predicate receipt           | Same-workspace other-user history chạy provider trái phép; HTTP memory fixture bắt được dù RLS là lớp độc lập |
| Bỏ snapshot hash check feedback     | Tampered snapshot không còn bị từ chối                                                                        |
| Nuốt verifyHistory lỗi ở controller | Provider spy tăng trái phép thay vì 0                                                                         |
| Bỏ payload hash conflict check      | Changed payload replay được chấp nhận thay vì conflict                                                        |

Đủ năm mutation **mỗi selected test 1 fail → restore 1 pass**, build exit 0,
không skip/cancelled. User/hash mutation giữ bind parameters hợp lệ, không dựa
SQL syntax error để nhận caught. Lần script mutation đầu yêu cầu AssertionError
nhưng positive test ném service exception trực tiếp; đã thêm doesNotReject với
thông điệp positive rõ ràng, rồi chạy lại đủ năm vào output mới. Không nhận lần
script kiểm log thất bại là mutation hoàn chỉnh. Source restore đúng bytes.

## Browser local mới

Chrome 141.0.7390.123 headless/CDP tại 127.0.0.1:5173. Auth/provider/PDF extraction/
OCR/embedding/Storage fake local; external network bị chặn cả server/browser.
Documents/ingestion/retrieval/receipt/history/feedback và fresh authorization
dùng runtime non-owner SQL/RLS thật. Một số module khác vẫn dùng owner **chỉ
trong disposable**, không nhận RLS toàn app hoặc Auth Supabase thật.

Driver thực hiện desktop 1440×900 và mobile 375×812, ba role; keyboard/native
input cho chat/feedback/download. Replay thủ công dùng POST browser cùng payload/
key sau khi đã thấy saved; không sửa payload hoặc auto replay runtime.

**105 case browser mới đạt**, không cộng các case trong nhóm FAIL:

| Role    | Index/reconciliation/download | N1/draft/summary/preview smoke | Receipt/history/feedback/account swap |
| ------- | ----------------------------- | ------------------------------ | ------------------------------------- |
| Manager | 10 (browser2)                 | 13 (browser2)                  | 14 (browser3)                         |
| Member  | 10 (browser3)                 | 13 (browser3)                  | 14 (browser3)                         |
| Viewer  | 4 (browser3)                  | 13 (browser3)                  | 14 (browser4)                         |

Hai viewport có chat → server header → own feedback → replay cùng row, N1
verify receipt thật. Issue fault sau COMMIT: answer còn/no header/không feedback
lượt mới; lượt mới không vào history, hai lượt cũ hợp lệ tiếp tục dùng được.
History fault chặn generation (counter không tăng); draft/hội thoại còn nguyên.
Account swap tách notes/chat/draft/feedback, trở lại account cũ vẫn có note riêng.

0 JS exception/console error/warning/external request trong các nhóm PASS;
không overflow. 22 HTTP 503 chủ ý giữ riêng: 16 indexing/status và 6 history
verification. Issuance fault vẫn chat 200 đúng thiết kế. 12 cancelled requests do
New conversation/navigation được phân loại riêng; viewer direct index 403 qua
driver không tính vào browser network list. AuthService của browser là fixture
synthetic, không phải kiểm Supabase session/password hoặc production AuthService;
HTTP suite 5 case ở trên mới dùng AuthService/CSRF/Origin thật với upstream fake.

Các attempt driver lỗi được giữ: reload thiếu new-document barrier; notes test
chưa điều hướng Dashboard; sentinel note trùng giữa các role trong cùng profile.
Viewer cuối đã chạy bổ sung với sentinel riêng theo role/profile mới, không
xóa note/storage để che kết quả. Sửa driver, không sửa FE/assertion bảo mật.
Manager regression đã PASS ở browser2 được giữ, không chạy lại chỉ để đẹp log.
Không coi attempt FAIL là PASS toàn bộ hoặc dùng ảnh Đợt 15 làm bằng chứng mới.

## Gates cuối, cleanup và commit

Run cuối `final` chạy tuần tự trên cùng source code/test đã kiểm browser, toàn bộ
gate **exit 0**. Không rebuild khi server fixture đang dùng dist:

| Gate/suite cuối    | Exit | Pass | Fail / skip / cancelled |
| ------------------ | ---- | ---- | ----------------------- |
| typecheck          | 0    | —    | —                       |
| test: API Vitest   | 0    | 231  | 0 / 0 / 0               |
| test: API Node     | 0    | 811  | 0 / 0 / 0               |
| test: web Vitest   | 0    | 324  | 0 / 0 / 0               |
| build              | 0    | —    | —                       |
| format:check       | 0    | —    | —                       |
| test:database PG17 | 0    | 377  | 0 / 0 / 0               |

Ứng dụng **1.366 pass** so với baseline mới 1.360; DB **377 pass** so với baseline 357. Không dùng con số lịch sử làm kết quả. Các DB process sau đều exit 0,
fail/skip/cancelled 0:

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
| retrieval-shared            | 1    |
| receipt-context             | 14   |
| receipt-http                | 5    |

Gate cuối có chạy lại shared-corpus 12 chu kỳ, không false-empty có oracle
đối chứng. Một lệnh tổng hợp stdout riêng bị lỗi regex do shell chuyển ký tự
Unicode; đã đọc JSON bằng regex ASCII, không chạy lại gate hoặc tính là app RED.

Audit read-only sau gate: **0 DB con, 0 role con ngoài dự kiến**. Parent disposable
còn một role bootstrap chuẩn của harness. Đã dừng/xóa đúng container và network
`examate-phase16-pg17` bằng compose down, không -v; volume parent test được giữ.
Không đụng SOP containers có trước. Không còn listener 3000/5173/9222/55433.

**PROFILE_CLEANUP_BLOCKED:** công cụ từ chối lệnh xóa bốn Chrome profile theo
policy. Giữ nguyên trong các folder ignored `-browser`, `-browser2`, `-browser3`,
`-browser4`; không tìm cách bypass. Browser đã chạy, đây không phải BROWSER_BLOCKED.
Logs/ảnh, resource markers, diagnostics và bounded-run JSON giữ local riêng dưới
`artifacts/phase16-2026-10-17T21-30-07/` cùng các thư mục suffix, không ghi đè run cũ.

Commit code/test:

- **8254233**: A positive assertions, shared-corpus lifecycle và đăng ký gate.
- **b45afa9**: ba workspace transaction boundaries, tests/fixtures SQL/HTTP,
  compatibility test doubles và đăng ký gate.
- Báo cáo này và hunk checkpoint roadmap commit riêng sau code.

Đã review staged paths/diff/whitespace và mẫu credential: không có .env, backup,
private artifacts, forbidden runtime files hoặc WIP cũ. Hash cuối **7/7 WIP
nguyên bytes**; chúng vẫn modified/untracked ngoài staging. Chỉ commit, không
push/fetch; ahead chỉ so local tracking ref, không xác minh trạng thái GitHub.

## Thay đổi ảnh hưởng RAG cho Thắng

Runtime chỉ receipt/history/feedback transaction boundary, **không đổi RAG
algorithm/model/prompt/validator**. Retrieval assertions và shared lifecycle là
test mới, không thay golden. Giữ chunking/extraction/OCR, vectors/model/dimension/
batching, ranking/topK/minScore/candidateLimit/scan policy, context/prompt, N1
marker sanitization/budget/history rules, FE draft/abort/reset/source/voice.
Không sửa AssistantPanel/App/hooks/TTS-STT, .claude/settings.json hoặc attribution.

Còn mở: production tenant policies/runtime least privilege/Auth bootstrap toàn
app, B3 budget bền vững, B4 semantic/live acceptance, Auth máy Thắng và Auth
extended. Đợt 13 bootstrap/Auth HTTP Tài là lịch sử, không kiểm lại cloud trong
đợt này. Export tiếp tục maintenance boundary, không HTTP principal giả.

## Tài chạy lại

Kiểm port/Docker trước, không load .env cloud hoặc db:migrate cloud:

```powershell
docker compose -p examate-phase16-review -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
Remove-Item Env:TEST_DATABASE_URL
docker compose -p examate-phase16-review -f compose.auth-pg17-test.yaml down
```

Không `-v`, DROP FORCE, cloud credential hoặc bỏ guard. Gate chuẩn đã đăng ký
shared-corpus và receipt SQL/HTTP suites mới, tuần tự. Focused tests dùng API
dist đã build trước; không rebuild khi browser fixture còn chạy. Browser drivers/
ảnh/log nằm riêng ignored theo run; replay cần output/profile mới, kiểm ports
và external network block. Review assertions positive, exact oracle predicates,
ownership/hash/conflict, fixture grants và fault-injection provenance.

Đối chiếu tài liệu chính thức: [node-postgres transactions](https://node-postgres.com/features/transactions),
[PostgreSQL 17 INSERT/ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html),
[PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
Các nguồn giải thích cơ chế; bằng chứng hoạt động của project đến từ các test
SQL/HTTP/browser được phân lớp ở trên.
