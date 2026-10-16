# Đợt 11 — B2 lát 6b.1: academic và workspace records context

Thực hiện local ngày 16/10/2026 (Asia/Saigon), nhánh
`feature/tai-rag-integration`, HEAD đầu phiên `7176246`. Không fetch hoặc đồng bộ
Git. B2 lát 6a đã được review đạt; đợt này tiếp nối primitive có sẵn, không hoàn
tất B2 toàn app.

Code và kiểm thử local đã hoàn thành cho Exams/Study plans/Expenses và Workspace
Records. Có bằng chứng SQL/HTTP non-owner trên PostgreSQL disposable và browser
Chrome thật với fixture local. Runtime cloud, Auth thật, tenant policies production,
semantic RAG và deployment bên ngoài chưa được nghiệm thu bởi đợt này.

## Phạm vi và invariant

Principal đến từ guard/server; `requirePrincipal` chỉ kiểm shape, không xác thực
object do client tự khai. Mỗi public method bên dưới dùng đúng một
`workspaceTransaction(principal, work)` và mọi business query trong callback dùng
`tx.query`. Giữ predicate workspace và role checks của ứng dụng dù có RLS.
Không giữ transaction qua provider/HTTP/Storage.

| Service | Public methods đã chuyển | Số query trong mỗi callback |
| --- | --- | --- |
| ExamsService | list, create, update, remove | 1 mỗi method |
| StudyPlansService | list, create, setCompletion, remove | 1 mỗi method |
| ExpensesService | list, create, remove | 1 mỗi method |
| WorkspaceRecordsService | courses, tasks, studyPlans, courseExpenses, unassignedExpenseCount, documents | 1 mỗi method |
| WorkspaceRecordsService | exams | 2 SELECT upcoming/latestPast cùng callback/client |

Không thêm route hoặc shape HTTP. INSERT/UPDATE CTE và SELECT/JOIN kết quả vẫn
là một query. Các create bắt lỗi FK **bên ngoài** lời gọi workspace transaction:
rollback hoàn tất rồi mới map `23503` thành `COURSE_NOT_FOUND`; không map `42501`,
không tiếp tục query trong transaction aborted, không retry write. Giữ `to_char`
DATE/TIME, tiền VND, LEFT JOIN expense course NULL, completed_at và thứ tự cũ.

Primitive/lifecycle Đợt 10 không sửa: một PoolClient, BEGIN → `set_config` với
`is_local=true` → callback → COMMIT/ROLLBACK; discard khi không bảo đảm sạch hoặc
COMMIT không rõ kết quả. Không role GUC/SET ROLE hoặc global principal. Các test
lifecycle, max=1 reuse, concurrency và Auth bootstrap/refresh cũ vẫn chạy qua gate.

`exams()` được đo thật bằng backend PID, transaction ID và workspace context trước
cả hai SELECT: giống nhau. Đây là cùng transaction/client, **không phải** cam kết
snapshot bất biến dưới READ COMMITTED. Thiết kế đối chiếu
[node-postgres transactions](https://node-postgres.com/features/transactions),
[PostgreSQL RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html) và
[transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html).

## PostgreSQL disposable và trust boundary

Helper test-only `academic-context-fixture.mjs` tạo DB và LOGIN role random riêng
cho mỗi suite; migrate 001–015 bằng runner thật. Target guard chạy trước kết nối,
migration, grants và cleanup. Không load `.env` vào harness; guard hiện có chỉ đọc
DATABASE_URL để loại trừ endpoint runtime, không in giá trị. PostgreSQL chạy bằng
compose project riêng `examate-phase11-academic`, bind loopback 55432.

Catalog và kết nối thực chứng minh `current_user=session_user`, không owner,
NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT, không role membership
để kế thừa quyền cao. Không chỉ dùng admin rồi gán nhãn non-owner. Migrations đã
ENABLE RLS; phần mới là policies/grants **chỉ trong fixture**, không phải bật RLS
lần đầu cho project.

Fixture gồm workspace A/B/inactive, manager/member/viewer/no-membership và
membership inactive; cả A/B có course/task/exam/plan/expense/document phân biệt.
Expense và document có course NULL. B có thêm 205 task/exam/plan/document và 1.001
expense để kiểm giới hạn không làm A bị crowd/truncated giả.

| Quyền test-only | Phạm vi |
| --- | --- |
| SELECT | courses/tasks/exams/study_plans/expenses; tenant policy kiểm workspace context, user membership active và workspace active |
| INSERT | Các cột create hiện dùng của exams/study_plans/expenses, WITH CHECK manager/member trong membership DB |
| UPDATE | Các cột update Exam và completion Plan hiện dùng; USING/WITH CHECK manager/member, không cấp UPDATE Expense hoặc workspace_id |
| DELETE | Exams/Study plans/Expenses, policy chỉ DB manager |
| Documents metadata SELECT | Đúng 6 cột: id, name, processing_status, course_id, storage_status, workspace_id |
| Bootstrap fixture | SELECT workspaces/memberships có policy riêng test-only; membership lookup HTTP dùng connection non-owner trước principal |

Bootstrap SELECT permissive trong fixture không phải phương án least-privilege
Auth production được duyệt. Admin chỉ setup/seed/catalog/assert/cleanup; Auth
upstream/session store của HTTP academic là synthetic. Không chọn phương án cấp
quyền Auth production trong đợt này.

Không cấp GRANT ALL, DDL/TEMP/TRUNCATE, auth.users, sửa membership/schema_migrations,
receipt/feedback/chunks hoặc Documents write/sign/index. Test cố đọc `storage_key`,
`SELECT *` Documents, chunk content, receipt/feedback và ghi Documents đều bị
`42501`. Policies academic UPDATE tồn tại theo ma trận, nhưng grants vẫn giới hạn
đúng routes hiện có, không mở UPDATE Expense.

GUC do backend tin cậy đặt là context, không phải authentication và không chống
attacker đã có credential backend cùng quyền thực thi SQL tùy ý. RLS non-owner
được chứng minh độc lập bằng SELECT **không WHERE**; scoped SQL ứng dụng vẫn giữ.

## Ma trận SQL và HTTP

| Hành vi | Kết quả thực kiểm |
| --- | --- |
| SELECT không WHERE từng bảng academic, courses/tasks/documents metadata | Chỉ rows A hoặc B theo context, khớp owner SELECT có predicate dùng để assert |
| Không context/rỗng/no-membership/inactive | Không đọc được business rows; INSERT bị chặn; DELETE không đổi rows |
| Principal khai manager nhưng DB membership member/viewer | DELETE trả 0 rows, IDs/counts/nội dung giữ nguyên |
| Cross-workspace INSERT/UPDATE/DELETE | INSERT bị 42501; UPDATE/DELETE không đổi dữ liệu |
| Đúng scope/member hoặc manager | List/create/update đúng route; manager delete được; member delete bị role check |
| Callback throw sau UPDATE + INSERT | Rollback cả hai write; cùng backend PID reuse không còn user/workspace context |
| Expense course NULL | List/create giữ LEFT JOIN, course_name NULL, amount number |

HTTP academic kiểm **mọi route thực sự có**: GET/POST/DELETE của ba domain,
PATCH Exam và PATCH Plan completion. Không thêm update Expense hay endpoint detail.
Guard và AuthService thật; upstream Auth/session store synthetic, membership SQL
thật bằng non-owner, business SQL/RLS thật.

| Principal | Read | Create/update có sẵn | DELETE |
| --- | --- | --- | --- |
| manager | 200 | 201/200 | 204 |
| member | 200 | 201/200 | 403 ROLE_FORBIDDEN |
| viewer | 200 | 403 ROLE_FORBIDDEN | 403 ROLE_FORBIDDEN |
| thiếu session | 401 | 401 | 401 |
| membership thu hồi | 403 trước business boundary | 403 trước business boundary | 403 trước business boundary |

CSRF thiếu bị 403 trước transaction. Foreign course manager/member nhận 400
COURSE_NOT_FOUND (viewer vẫn 403); foreign IDs nhận 404 như ID không tồn tại nếu
role được phép thao tác. Invalid ngày/giờ/tiền bị 400; không lộ SQL/constraint/tên
record B; snapshot counts/IDs giữ nguyên sau request bị từ chối. Số tiền 2 tỷ VND
và ngày nhuận 2028-02-29 giữ giá trị qua SQL thật.

## Workspace Records: giữ kết quả một workspace

Gold mới là **fixture tổng hợp**, không phải thay gold RAG lịch sử. Đã chụp bằng
implementation Records **trước sửa** tại `7176246`, clock cố định
`2026-09-28T17:30:00Z` (Việt Nam 29/09 00:30), IDs synthetic cố định. Hash source
trước sửa: `1c0b76b9be329f920f74af11366cf2d31791bcaf00521739667a66f23b099f11`.
Đối chiếu hash/source Git và assert độc lập IDs/order/counts/amounts trước chuyển
boundary; không sinh lại expected từ câu trả lời mới để đạt pass.

`fixtures/workspace-records-context-gold.json` giữ rows của cả 7 methods/filters
và câu trả lời đầy đủ của 11 intent. Non-owner sau sửa phải deepEqual gold: intent,
asOf, reasonCode, text, source kind+id, dates/time/order/truncated đều giữ nguyên.
Các literal SQL của cả 4 runtime files được so AST trước/sau, chỉ chuẩn hóa
CRLF; không đổi query/ranking/threshold/classifier/renderer.

Các bằng chứng cụ thể:

- Upcoming 00:30 và latestPast 00:15 đúng scope và ranh giới clock Việt Nam.
- Task open/done/overdue và due_date NULL; Plan open/completed/overdue giữ kết quả.
- Hai expense gắn course A tổng 200.000 VND; unassigned count A là 1, không tính B.
- Document course NULL vẫn có; document đang deleting bị loại ở records SQL;
  không xuất storage_key hoặc extracted text.
- ROW_LIMIT 199/200/201: trả tối đa 200, truncated false/false/true cho
  tasks/exams/plans/documents. Courses là array LIMIT 200, không tự thêm truncated.
- EXPENSE_LIMIT 999/1000/1001: đọc tối đa 1.000; giữ cách từ chối tổng thận trọng
  cũ tại **>=1.000**, không tự đổi thành tính được tổng đầy đủ khi đúng 1.000.

HTTP workspace chạy 11 intent qua AppModule/Records/non-owner thật; AuthService
DI synthetic principal, **AnswerReceiptService boundary mock** được ghi nhãn rõ.
11 lần issue receipt mock; bảng receipt A vẫn 0. Generation/embedding/OCR/Storage
call counters đều 0. Không cấp rộng receipt để làm controller chạy. Đây không
phải E2E Auth/receipt/RLS toàn app. Regression receipt thật cũ vẫn qua gate.
WorkspaceRecords chỉ đọc nghiệp vụ; HTTP chat thực tế vẫn có thể ghi server
answer receipt, không tuyên bố toàn request là read-only.

## RED → GREEN và mutation

| Bộ test | Trước implementation | Sau implementation |
| --- | --- | --- |
| academic-context.test.mjs | 17 fail / 6 pass / 0 skip, exit 1; bypass boundary bị bắt | 23 pass, exit 0 |
| workspace-records-context.test.mjs | 8 fail / 1 pass / 0 skip, exit 1; gồm exams chưa chung callback | 9 pass, exit 0 |

Các control principal/role xanh ngay chỉ là regression coverage. SQL fixture
24 academic + 23 records xanh lần đầu là additional coverage, không nhận là RED.
Test doubles cũ được bổ sung primitive, giữ assertion quyền/scopes và chuyển spy
forbidden write sang boundary mới. Không xóa/nới assertion Auth/CSRF/receipt.

| Mutation tạm, đã restore từng lần | Test bắt lỗi | Chạy lại sau restore |
| --- | --- | --- |
| Exams bỏ context, gọi transaction thường | 2 positive non-owner fail vì không có rows | Academic DB 24 pass |
| DELETE policy cho DB member | 3 test fail vì row thực bị xóa | Academic DB 24 pass |
| Bỏ workspace restriction policy | 3 SELECT không WHERE fail vì lộ rows workspace khác | Academic DB 24 pass |
| Records.courses bỏ context | 1 positive/gold fail vì thiếu rows | Records DB 23 pass |

Mỗi mutation build được (nếu có runtime change), test có chạy thật, exit 1 đúng
assertion; không dùng syntax/compile/all-filtered để nhận RED. Source được restore
bằng nội dung đã lưu, không reset/checkout; mutation không nằm trong commit.

## Gates baseline và cuối đợt

Node 24.13.0, npm 11.6.2; Docker server 29.6.2, Linux. Chạy tuần tự từ root,
không build song song suite dùng dist hoặc API fixture. Logs local ignored tại
`artifacts/phase11-20261016-academic/`, prefix baseline/final/final-verified;
không ghi đè run cũ. Final-verified chạy lại sau tinh chỉnh membership lookup
test-only từ admin sang non-owner; không thay Auth runtime.

| Gate | Baseline | Final-verified |
| --- | --- | --- |
| npm run typecheck | exit 0 | exit 0 |
| npm test | exit 0: API Vitest 231 + Node 674 + web 308 = 1.213 | exit 0: API Vitest 231 + Node 706 + web 308 = 1.245 |
| npm run build | exit 0 | exit 0 |
| npm run format:check | exit 0 | exit 0 |
| npm run test:database | exit 0: 226 | exit 0: 273 |

Baseline và final-verified fail/skip/cancelled đều 0. Run final trước final-verified cũng exit 0 cả
5 gate: ứng dụng 231 + 706 + 308 = 1.245; DB 273; fail/skip/cancelled 0.
DB baseline theo thứ tự suite: 13/10/14/23/9/18/65/25/1/29/19. Hai suite mới
được đăng ký tuần tự trong gate chuẩn, thêm 24/23, không đặt ngưỡng tổng giả định.

Các focused checks khác: academic unit 23; academic HTTP/compat 94; academic
owner SQL regression 65; records unit 9; records/receipt/documents-scope Node
127 và Records/Assistant Vitest 37 đều pass. Gate đầy đủ vẫn là bằng chứng cuối.

## Browser thật và giới hạn fixture

Chrome 141 headless qua CDP, browser engine thật: desktop 1440×900 và viewport
375×812 (emulation, không phải máy điện thoại vật lý). Origin duy nhất của app
`http://127.0.0.1:5173`. AuthService/Google/embedding/OCR/Storage được thay DI
fixture, tài khoản synthetic; fetch ngoài loopback bị chặn. Nest services,
guard, DB và receipt/feedback flow thực chạy trên **owner connection** trong DB
disposable của từng browser run. Browser không dùng để chứng minh non-owner RLS.

| Role/luồng | Quan sát thực |
| --- | --- |
| manager, desktop + 375 | Tạo Exam/Plan/Expense, sửa Exam, completion true→false→true; reload còn dữ liệu; xác nhận xóa cả ba |
| member, desktop + 375 | Tạo/sửa đúng route, completion, reload; không có controls DELETE |
| viewer, desktop + 375 | Đọc dữ liệu; không có create/delete forms, completion disabled |
| Cả ba role | Expense course NULL còn trong Finances sau reload; gallery → detail → browser Back; hỏi workspace exam/plan/expense/documents đúng fixture source/intent |
| Draft 9.1 | Gửi A/gõ B trước answer: B còn; không sửa thì draft xóa; New conversation không ghép response cũ |
| N1/receipt | Documents follow-up chuyển đúng 1 verified history turn cho fake provider; New conversation reset; answer có receipt |
| PDF/feedback | PDF fixture page 1 mở được ở 375; helpful HTTP 201 và row lưu thật, không mất draft |

Workspace chats trong browser: manager/member/viewer mỗi role 8 receipt responses
được assert (4 intent × 2 viewport), không gọi provider. Kiểm SQL trước cleanup:
manager DB có 19 receipt rows và 1 feedback với ownership khớp receipt; member
8 receipts/0 feedback; viewer 8/0. Manager 19 bao gồm các lượt harness thất bại
trước đó và server receipt của request đã cancel, không dùng để suy số success
UI. Feedback vẫn UNREVIEWED, không phải semantic PASS.

Keyboard dùng text input/Ctrl+A, focus→Enter cho send/submit/confirm, Space cho
radio; DATE/TIME fixture điền bằng native DOM value + input/change event trong
browser. Không nhận là đã nhập mọi calendar bằng phím hoặc audit mọi Tab path.
ScrollWidth không vượt viewport: desktop 1425/1440, mobile 375/375. Các driver
đạt cuối không ghi nhận JS exception, console error/warning, network lỗi bất ngờ
hoặc request external. Abort kỳ vọng được phân loại riêng: manager assistant 2,
manager academic 6; member/viewer academic 0.

Ảnh/evidence local nằm trong thư mục manager/member/viewer của run; đã trực tiếp
xem ảnh academic manager 375, viewer course intro 375 và PDF 375. Không dùng ảnh
course intro để khẳng định đã nhìn thấy read-only controls; kiểm controls là
assert DOM trên Chrome thật. PDF/provider là fixture, không phải bằng chứng
extraction/OCR/RAG live. Browser không BLOCKED trong phiên này.

## Lỗi harness, cleanup và bảo toàn WIP

Giữ cả log thất bại: driver cũ thao tác trước auth/loading ready; driver academic
hai lần đầu truy cập children của message list NULL khi reset/pending. Sửa wait
và query trong **artifact driver**, không sửa app/guard/SQL assertion để pass.
Các record thử của lượt thất bại chỉ nằm trong DB do run tạo, được xóa cùng DB.
Một lệnh focused chạy sai cwd/redirect và một lần node -e lỗi quoting không chạy
test; rerun đúng được ghi riêng, không nhận chúng là RED app. Orchestrator npm
Windows có DEP0190 warning do shell:true với arguments cố định; không chứa dữ
liệu client hoặc secret, không thay cấu hình runtime để né warning.

Cleanup fixture kiểm exact random DB owner/COMMENT marker và role marker trước
DROP; không FORCE/wildcard cleanup. Ba browser harness đã trả stop 200 và ghi
stopped=true, chỉ đóng Chrome/Vite do run tạo. Audit sau gate cuối xác nhận 0 DB
academic, 0 role academic và 0 trong ba DB browser còn lại. Compose down đúng
project `examate-phase11-academic`, không down -v; giữ volume
`examate-phase11-academic_test-postgres-data` để tránh xóa volume ngoài phạm vi.
Không còn listener 3000/5173/55432/9222. Hai container SOP có trước còn chạy,
không bị đụng tới. Hash README/HANDOFF/resume/prompt có trước đều không đổi;
PROJECT-CONTEXT sau bỏ đúng checkpoint mới khớp toàn bộ nội dung WIP ban đầu.

WIP đầu phiên được lưu patch/hash local: README, docs/HANDOFF, phần có trước của
docs/PROJECT-CONTEXT và ba untracked resume/prompt. Không stage chúng. Riêng
PROJECT-CONTEXT chỉ stage checkpoint mới bằng patch index; roadmap chỉ thêm
checkpoint 6b.1, không đánh dấu B1/B2/B3/B4 hoàn tất. Không sửa/stage
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`. Hướng dẫn LogiRoute/Python/Tailwind ở
folder cha khác project; áp source và yêu cầu ExaMate, không sửa rule/settings.

## File, commit và phần chưa nghiệm thu

Runtime của Thắng buộc sửa đúng 4 file, chỉ DB boundary:

- `apps/api/src/exams/exams.service.ts`
- `apps/api/src/study-plans/study-plans.service.ts`
- `apps/api/src/expenses/expenses.service.ts`
- `apps/api/src/assistant/workspace-records.service.ts`

Các file khác là test/helper/gold synthetic, chỉnh mock/spy liên quan, scripts
API đăng ký test tuần tự và tài liệu. Không sửa DatabaseService, Auth runtime,
contracts, migrations 001–015, package-lock/dependencies, FE/App/AssistantPanel/
hook/TTS-STT hoặc settings. Không đổi thuật toán RAG, OCR/chunking/embedding,
ranking/topK/minScore/model/prompt/citation validator hoặc gold RAG lịch sử.

Commit theo phần:

- `22ae75e` — academic boundary + unit/SQL/HTTP test và PoC helper.
- `060b775` — workspace records boundary + frozen gold/metadata PoC/tests.
- `25dc55e` — bootstrap membership của HTTP fixture dùng non-owner, không dùng admin.
- Báo cáo/checkpoint: hash trong bàn giao Git cuối (không tự tham chiếu hash commit).

Git cuối đợt chỉ còn WIP có trước: README, docs/HANDOFF, phần lịch sử/WIP của
docs/PROJECT-CONTEXT; untracked AGENT-RESUME-2026-10-15 và hai prompt cũ Đợt 4/9.1.
Các phần này không nằm trong commit đợt này. Không push/merge/deploy hoặc cloud call.

Chưa chuyển Documents upload/sign/delete/index/retrieval/summary, receipts,
feedback/export và Auth bootstrap production. Không đổi credential/role runtime,
không thêm production migration/policy hoặc cloud writes. B1 Auth thật, B2
least-privilege toàn app, B3 ngân sách AI bền vững, B4 live/semantic evaluation còn
nguyên. E01 có thiếu completeness về lời nhắc minh họa, vẫn chờ người review;
E17 BLOCKED AI_UNAVAILABLE, không suy thành quota/retrieval sai. Không chạy live
evaluation hoặc gỡ blocker DB/Storage/Google của runner trong đợt này. N1 character
cap không phải token/cost cap.

Kết luận tách riêng: code/tests local đạt phạm vi 6b.1; browser fixture local có
bằng chứng; chất lượng RAG chưa được human review nghiệm thu; deployment bên
ngoài không thực hiện. Dừng chờ Tài review, không làm lát sau.

## Tài tự chạy lại

Kiểm Node/Docker/ports trước. Dùng compose project riêng và target loopback
`*_test` đã guard, không dùng `.env` cloud hoặc db:migrate mặc định. Đặt
TEST_DATABASE_URL bằng credential test của compose local, không copy credential
runtime. Chạy tuần tự từ root:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:database
```

DB gate tự tạo/migrate/cleanup DB và role riêng; kiểm output từng suite, không
coi thiếu target hoặc all-filtered là PASS. Browser evidence/driver nằm local
ignored, không phải runner production; cần fixture Auth/provider cô lập nếu
chạy lại. Không dùng dev:api nạp cloud env để thay fixture.
