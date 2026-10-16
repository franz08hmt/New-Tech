# Đợt 10 — B2 lát 6a: workspace transaction và tenant RLS PoC

Khảo sát/kiểm chứng 15/10/2026; hoàn tất bàn giao 16/10/2026 (Asia/Saigon),
nhánh `feature/tai-rag-integration`.
Baseline HEAD `31dfba5248055e1c231d4fa83b8110ef681fb40d`; không fetch/đồng bộ
Git. Ahead 8 so với tracking ref local khi bắt đầu, không suy thành GitHub mới.
Chỉ Tasks/Courses + lifecycle DB chung tối thiểu; không hoàn tất B2 toàn app.

## Thiết kế và trust boundary

`workspaceTransaction(principal, work)` kiểm shape principal trước acquire,
chụp user/workspace ID rồi dùng **lifecycle transaction hiện có**. Một PoolClient
thực hiện BEGIN, SELECT set_config hai setting tên cố định `examate.user_id` /
`examate.workspace_id` bằng `$1/$2`, `is_local=true`, callback `tx.query`, COMMIT.
Không dùng pool.query cho business SQL trong callback. Không role GUC/SET ROLE,
global principal, AsyncLocalStorage tenant hoặc HTTP/provider/Storage await.

Principal phải đến từ guard server. `requirePrincipal` chỉ là shape validation,
không biến object đúng UUID thành authentication. Role DB trong membership mới
quyết định write tại policies; role Nest và workspace predicates vẫn giữ.
GUC là context do backend tin cậy đặt, không chống người đã có credential backend
và khả năng thực thi SQL tùy ý. Chưa đổi role/credential runtime cloud.

| Đường kết thúc             | Xử lý                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Callback thành công        | COMMIT, release client sạch                                                                                |
| Callback/context setup lỗi | ROLLBACK; giữ lỗi gốc, không partial write                                                                 |
| Acquire lỗi                | Không callback/release client chưa acquire                                                                 |
| BEGIN lỗi                  | Không callback; discard client                                                                             |
| ROLLBACK lỗi               | Log code an toàn, giữ lỗi callback; discard client                                                         |
| COMMIT lỗi                 | Log `database.commit_unknown`, discard; không retry và không coi ROLLBACK sau đó là bằng chứng chưa commit |

`query` và `transaction` không tenant còn nguyên cho Auth bootstrap và module
chưa chuyển. AuthStore không phụ thuộc primitive mới, không có circular DI.
Refresh/row locking/intent/admission không bị yêu cầu principal giả. Lifecycle
discard dùng `client.release(true)` khi không biết connection có sạch hay không;
không thêm hai bộ BEGIN/COMMIT/ROLLBACK tương tự nhau.

Tasks list/create/updateStatus và Courses list/getBySlug nay bọc query trong
primitive; giữ SQL workspace WHERE, INSERT workspace cùng câu lệnh, role check
trước write, thứ tự, projection và TASK_NOT_FOUND/COURSE_NOT_FOUND/ROLE_FORBIDDEN.
Không trả user/workspace debug fields, không đổi HTTP/contracts hay thêm CRUD.

## PostgreSQL thật và policies chỉ trong test

`workspace-context.database.test.mjs` chạy bằng gate chuẩn `test:database`, sau
các suite cũ, không chạy build song song suite import dist. Target guard thực
hiện trước mọi connection/DDL/cleanup; không load `.env` cloud. Mỗi run tạo DB
random riêng, auth schema fixture tối thiểu, migrate **001–015 qua runner thật**.
Không sửa migration cũ/thêm migration production hoặc tạo role trên Supabase.

Admin chỉ setup/seed/catalog/assert/cleanup. Pool ứng dụng kết nối **LOGIN role
random thật**, current_user=session_user, NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/
NOCREATEROLE/NOINHERIT; không owner Tasks/Courses, không role memberships hoặc
quyền SET ROLE owner. Business tables vốn đã ENABLE RLS; thứ còn thiếu ở runtime
là tenant policies/grants/role phù hợp, không phải “project chưa bật RLS”.

| Object                                     | Grants PoC                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Database/schema                            | CONNECT, public USAGE; không CREATE schema/table/TEMP                                          |
| Tasks                                      | SELECT; INSERT đúng title/owner/status/due/evidence/workspace; UPDATE chỉ status,updated_at    |
| Courses                                    | SELECT                                                                                         |
| Workspaces/memberships                     | SELECT + policies bootstrap fixture nội bộ; **không phải thiết kế least privilege production** |
| auth.users/auth.sessions/schema_migrations | Không đọc Auth; không sửa ledger                                                               |

Không GRANT ALL, DELETE/TRUNCATE, course write hay quyền sửa membership. Catalog
assert grants/cột, flags/owner/membership và bốn business policies; các thao tác
ngoài quyền thật trả 42501. INSERT không nhận ID từ client (DB default UUID).

Test-only business policies yêu cầu row.workspace bằng context workspace và
EXISTS membership có user context, membership active + workspace active. Task
INSERT/UPDATE thêm role DB manager/member; UPDATE có USING và WITH CHECK.
NULLIF(setting,'') xử lý cả thiếu context và chuỗi rỗng sau trả connection.
Không dùng business USING(true), không SECURITY DEFINER helper production.
Quyền UPDATE(workspace_id) cũng không được cấp; thử chuyển workspace bị từ chối
ở grants, độc lập với WITH CHECK. Membership/workspace fixture không recursion,
nhưng quyền đọc rộng này chưa được duyệt cho runtime production.

## Ma trận kiểm chứng

| Phép kiểm                                    | Bằng chứng                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principal thiếu/null/sai UUID/role           | Unit: 0 acquire/callback/business query                                                                                                                                                      |
| Cùng client và parameterized context         | Unit kiểm toàn chuỗi BEGIN → context → business → COMMIT, cấm pool.query                                                                                                                     |
| COMMIT không rò                              | Pool max=1: PID A = PID raw no-context = PID B; context rỗng/NULL, raw tasks 0 rows                                                                                                          |
| ROLLBACK                                     | Insert/update rồi throw: admin rows y hệt trước; reuse cùng PID, identity sạch rồi đọc B                                                                                                     |
| Concurrent                                   | Pool max=2, barrier timeout 3s: hai PID khác nhau giữ đồng thời A/B, context/rows đúng; checkout lại cả hai PID đều sạch                                                                     |
| SQL thiếu WHERE                              | Manager/member/viewer SELECT Tasks/Courses trực tiếp chỉ thấy A hoặc B theo context, so IDs với admin gold                                                                                   |
| Thiếu/empty context                          | SELECT 0 rows, UPDATE 0 rows, INSERT denied                                                                                                                                                  |
| No membership/inactive membership/workspace  | SELECT/UPDATE 0, INSERT denied; inactive workspace có seeded rows để tránh empty-fixture false positive                                                                                      |
| Principal giả role manager/member, DB viewer | INSERT denied, UPDATE 0; toàn bộ rows/IDs/counts giữ nguyên                                                                                                                                  |
| Cross-workspace                              | INSERT B trong A denied; UPDATE B trong A 0; reassign bị cấm, rows không đổi                                                                                                                 |
| Service positive                             | Manager/member đọc/tạo/status thật non-owner; course detail và foreign task/slug 404; viewer read và write chặn trước transaction                                                            |
| HTTP thật trên SQL/RLS                       | Ba role, AuthService/guard thật nhưng adapter/session store synthetic; membership bootstrap fixture SELECT admin rõ ràng; CSRF/missing session/no membership chặn trước business transaction |
| Auth/bootstrap + 9.1                         | Các regression Auth/refresh, hook/history/receipt trong gates còn chạy; không sửa hook hoặc Auth runtime                                                                                     |

Không gọi fixture Auth là Supabase Auth thật. Browser dùng DB owner để các module
chưa chuyển tiếp tục hoạt động; không dùng browser đó để chứng minh RLS non-owner.

## RED → GREEN, mutation và lỗi harness

Test mới viết trước: `workspace-transaction.test.mjs` lần đầu **17 test: 15 fail,
2 pass, 0 skip**, exit 1. Bảy fail vì thiếu primitive/validation/context, năm fail
vì service còn pool query, ba fail vì client không discard khi lifecycle lỗi.
Hai control callback rollback/acquire error xanh ngay. Sau implement 17/17 xanh;
thêm context-setup-error và Auth bootstrap regression xanh ngay: **19/19**, không
nhận hai test này là RED. Focused unit/HTTP/Auth đầu **65/65**.

SQL PoC/HTTP suite **19/19** là additional coverage, không nhận fixture xanh là
TDD. Lần setup đầu có lỗi course code/cover checks; khi thêm inactive course còn
vướng unique slug/code. Đã sửa dữ liệu tổng hợp đúng schema, không nới constraints
hoặc sửa migration; giữ log các lần lỗi. Một chỉnh sửa wrapper ban đầu thiếu
dấu đóng ngoặc do CRLF; build fail compile, đã sửa, **không tính làm RED hợp lệ**.

| Mutation (restore sau từng phép)              | Kết quả thật                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| is_local true → false                         | Exit 1, 1 test fail vì raw reuse vẫn còn identity A        |
| Bỏ workspace-context restriction trong policy | Exit 1, 3 test fail vì SQL thiếu WHERE thấy workspace khác |
| Tasks/Courses dùng transaction không context  | Exit 1, 2 test fail vì positive non-owner list mất rows    |

Các mutation không fail syntax/compile; restore build + toàn suite PoC **19/19**
sau mỗi phép. Node báo các subset lần lượt tests 1/3/2, skipped 0; không gọi đó
là full suite. Lượt driver mutation đầu bị quoting Windows khiến all-filtered
chỉ báo file-level 1 pass; đã loại khỏi bằng chứng, giữ log, dùng argv trực tiếp
và xác nhận test tên cụ thể thực sự fail. Không để mutation trong commit.

## Browser thật local

Chrome **141.0.7390.123 headless qua CDP loopback**, không jsdom. UI duy nhất
`http://127.0.0.1:5173`, viewport 1440×900 / 375×812; mobile emulation, chưa kiểm
keyboard ảo/thiết bị vật lý. AuthService DI synthetic + guard thật, SQL thật trên
DB random owner, generation giả chậm 2500ms, embedding/OCR/Storage giả. Native
fetch fixture và interceptor browser chỉ cho loopback; không Google/Supabase.

| Luồng                                                               | Desktop | 375px |
| ------------------------------------------------------------------- | ------- | ----- |
| Manager tạo task → status Done → reload còn Done                    | PASS    | PASS  |
| Member tạo task → status Done → reload còn Done                     | PASS    | PASS  |
| Viewer đọc, không form ghi; check/status disabled; keyboard filter  | PASS    | PASS  |
| Cả ba role gallery → detail bằng Enter → reload → browser Back      | PASS    | PASS  |
| Assistant gửi A, gõ B khi pending; B còn sau answer                 | PASS    | PASS  |
| Không edit draft thì clear; New conversation không nhận response cũ | PASS    | PASS  |
| Receipt/feedback và PDF preview trang 1 tổng hợp                    | —       | PASS  |

Tạo task/status dùng native input/keys; focus theo locator rồi Enter, không tuyên
bố đã Tab qua toàn bộ app. Assistant dùng textarea → Tab → Send → Enter. Đã xem
ảnh task/viewer/PDF thực: PDF hiển thị “Phase 10 local PDF fixture” ở trang 1.
Không tràn ngang: desktop scrollWidth 1425/viewport 1440, mobile 375/375.
Các lượt thành công: **0 JS exceptions, 0 console error/warning, 0 unexpected
network failure, 0 external request**. Cancellation do navigate/reset giữ riêng
(Assistant 2; viewer 2; member verified 14), không gọi là lỗi app.

Harness lần đầu chọn Add task khi form/loading chưa sẵn; đổi role trên cùng SPA
còn giữ principal FE cũ; fresh navigation còn cần chờ document complete để native
typing nhận focus. Các lượt đó không dùng nghiệm thu member/viewer. Đã giữ logs/
failed evidence, làm mới document, chờ load complete và assert text nhập thật,
chạy lại member/viewer, không sửa FE hoặc nới assertion. Một diagnostic PowerShell
quoting và một lần kết nối CDP trước Chrome sẵn sàng lỗi, đều là harness.

SQL fixture manager trước cleanup: **7 receipts, 1 feedback, 1 owner match**.
Hai request bị client abort vẫn có receipt server như contract hiện có, không
đưa stale answer vào hội thoại. Helpful vẫn UNREVIEWED, không semantic PASS.

## Gates và artifact

Node v24.13.0, npm 11.6.2, Docker 29.6.2 Linux. Không nâng runtime/dependency.
Gates baseline/final chạy tuần tự từ root, không build khi suite/browser dùng dist.

| Gate                  | Baseline          | Final             |
| --------------------- | ----------------- | ----------------- |
| npm run typecheck     | exit 0            | exit 0            |
| npm test              | exit 0: 1194 pass | exit 0: 1213 pass |
| npm run build         | exit 0            | exit 0            |
| npm run format:check  | exit 0            | exit 0            |
| npm run test:database | exit 0: 207 pass  | exit 0: 226 pass  |

Baseline npm test: API Vitest 231 + API Node 655 + web 308; 0 fail/skip/cancelled.
DB baseline: 13+10+14+23+9+18+65+25+1+29 = 207; 0 fail/skip/cancelled.
Final npm test: API Vitest **231**, API Node **674**, web **308** = **1213**;
0 fail/skip/cancelled. Final DB từng suite **13+10+14+23+9+18+65+25+1+29+19 = 226**;
0 fail/skip/cancelled. Unit mới +19, DB PoC mới +19. Không dùng số lịch sử làm kết
quả mới; đã đối chiếu baseline-results.json/final-results.json và output từng suite.

Artifact run riêng ignored `artifacts/phase10-20261015-context/`: baseline/final
logs/results JSON, RED/GREEN, mutations2, browser scripts/evidence/screenshots,
before-WIP/hash snapshots và patch chỉ stage checkpoint mới. Không ghi đè run cũ.
Logs/profile/feedback local không commit.

## Phạm vi file, WIP và bàn giao

Runtime BE của Thắng chỉ chạm:

1. `database/database.service.ts`: primitive cộng thêm + discard lifecycle dùng chung.
2. `tasks/tasks.service.ts`: bọc 3 DB operations, giữ SQL/role/shape.
3. `courses/courses.service.ts`: bọc 2 reads, giữ SQL/shape/not-found.

Test thêm workspace-transaction/workspace-context.database; sửa test doubles
helpers/workspace-scope, đổi spy workspace-domain sang boundary transaction mới.
`apps/api/package.json` **chỉ scripts**: đăng ký unit và DB suite tuần tự. Không
dependency/version/lockfile, FE/App/AssistantPanel/TTS-STT, Auth runtime, contracts,
.env, 001–015, RAG/chunking/model/prompt/validator/scoring hoặc gold thay đổi.

Rule thư mục cha `D:\New-Tech\.agents\AGENTS.md` mô tả LogiRoute/Python/Pydantic/
Tailwind; áp yêu cầu ExaMate hiện tại, không đổi rule hoặc áp thiết kế project đó.

PROJECT-CONTEXT checkpoint mới được stage riêng bằng patch against index; giữ
toàn bộ WIP cũ ngoài index. Resume untracked có trước được sửa thông tin 9.1 tại
working tree nhưng **không stage toàn file**. README/HANDOFF và prompt 4/9.1 cũ
giữ nguyên hash; không sửa/stage prompt 4, không sửa settings/attribution.
Roadmap chỉ thêm checkpoint 9.1/6a, không đánh dấu B1–B4 hoàn tất.

[Thiết kế B2 lát 6b](PHASE-10-B2-6B-DESIGN.md) chỉ là đề xuất bootstrap/policies/
runtime-role/migration/runbook và quyết định cần quản lý. Chưa triển khai lát 6b.
Auth cloud B1 chưa nghiệm thu, RLS runtime toàn app B2 chưa xong, B3 chưa có budget
bền vững. B4/live runner còn BLOCKED trước DB/Storage/Gemini; semantic E01 cần
review completeness minh họa, E17 vẫn AI_UNAVAILABLE (không suy quota/retrieval).
N1 deterministic/character cap không phải semantic acceptance hoặc cost cap.
Không deployment bên ngoài. Code/tests, browser local, human review RAG và deploy
là bốn kết luận riêng.

Cleanup: bốn browser fixture đã stop, DB random của từng fixture đã drop; Vite/
Chrome do run tạo đã dừng, không còn listener 3000/5173/9222/55432. Suite PoC
đối chiếu exact DB/role sau cleanup. Audit bổ sung phát hiện một DB PoC sót:
không có business tables, chỉ auth.users/auth.sessions fixture rỗng. Chưa khẳng
định nguyên nhân thuộc lần harness nào. Đã ghi exact name vào artifact, xác minh
container/volume riêng của run, owner và marker schema fixture, không session
khác/data, rồi DROP đúng DB đó (không FORCE hoặc wildcard). Assertion cleanup
đầu tưởng không có bảng nào đã dừng; kiểm lại xác nhận hai bảng fixture rỗng,
không nới điều kiện để xóa DB có dữ liệu. Audit cuối: **0 browser DB, 0 PoC DB,
0 PoC role còn lại**, mọi manifest browser stopped=true.

Stack `examate-phase10-context` đã down, giữ volume test, không `-v`; SOP của
người khác không bị dừng. Giữ profiles/evidence trong artifacts ignored, không
xóa đệ quy profile. Một lệnh docker inspect bị lỗi quoting template, đã dùng
JSON metadata để kiểm ownership; không coi đó là lỗi ứng dụng. Không policy
blocker mới cho kiểm browser/DB; không có cloud calls hoặc credential changes.

| Commit                  | Phần                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `c81f660`               | Checkpoint 9.1/6a, chỉ hunk mới PROJECT-CONTEXT và roadmap        |
| `136b439`               | Primitive + Tasks/Courses, unit/HTTP/SQL RLS PoC và scripts gates |
| Commit chứa báo cáo này | Báo cáo và thiết kế 6b; xem Git log                               |

Commit báo cáo cuối tra bằng `git log -1 -- docs/PHASE-10-B2-CONTEXT-REPORT.md`
và thông báo bàn giao, không tạo thêm commit chỉ để ghi self-hash. Working tree còn WIP có
trước: README, HANDOFF, PROJECT-CONTEXT (phần không stage), resume/prompt 4/9.1
untracked; sửa resume để đồng bộ 9.1 vẫn để unstaged. Không push/merge/deploy.

Tài tự chạy lại bằng Docker local project riêng, kiểm port 55432 rồi up
`compose.local-db.yaml`; chỉ đặt TEST_DATABASE_URL loopback tới DB `*_test`
disposable của mình, không load cloud .env. Chạy tuần tự typecheck → npm test →
build → format:check → test:database từ root. PoC suite đã nằm trong gate chuẩn;
focused `node --test apps/api/test/workspace-transaction.test.mjs` dùng dist từ
build, DB focused dùng `workspace-context.database.test.mjs` với guarded target.
Browser fixture/driver và ảnh nằm trong artifact run; nếu chạy lại hãy sao chép
sang directory mới, kiểm role/fresh document + document complete trước native
typing, không ghi đè evidence cũ. Chỉ cleanup exact resources của lần tự chạy.

**B2 lát 6a code/tests và kiểm local đã hoàn thành; tenant RLS/runtime toàn app,
Supabase Auth thật, semantic RAG và deployment chưa được nghiệm thu. DỪNG chờ
Tài review, không triển khai 6b.**

Nguồn chính thức đã đối chiếu cho thiết kế: [node-postgres transactions](https://node-postgres.com/features/transactions)
(cùng client), [pool release](https://node-postgres.com/apis/pool) (discard),
[PostgreSQL 16 config](https://www.postgresql.org/docs/16/functions-admin.html)
(is_local) và [RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
(owner/BYPASSRLS, default-deny, USING/WITH CHECK).
