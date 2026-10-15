# Đợt 8 — server answer receipt và feedback ownership

Triển khai/kiểm ngày 14–15/10/2026 trên `feature/tai-rag-integration`, baseline
`4958317`. Quyết định mới nhất của Tài: **commit, không push**. Chỉ DB disposable
loopback; không cloud/Gemini thật, không sửa AssistantPanel/TTS/STT.

## Baseline thực chạy

Bốn gate và `npm run test:database` đều exit 0. API Vitest 198, node:test 596,
web 258: tổng 1052; DB 177. Fail/skip 0. Docker 29.6.2 linux; Node 24.13.0,
vẫn dưới README khuyến nghị 24.15+. Logs ignored: `artifacts/phase8-20261014/`.

## Lát nền — 015 và rollback

015 thêm ledger receipt không text và nullable receipt_id/user_id vào feedback.
Legacy không được gán owner. RLS/revoke PUBLIC; workspace FK RESTRICT, user FK
SET NULL. Không thay file 001–014. Preflight có stage015Applied; runbook lên
012–015 và rollback chain 015→014→012/013. Scripts mặc định read-only dry-run,
apply confirm đúng project, advisory 424204, lock_timeout, checksum/later/schema/
dependency guards và transaction duy nhất. Mất COMMIT acknowledgement phải
báo outcome unknown; không retry tự động.

Test nền đã thấy RED vì migration chưa tồn tại, rồi GREEN: snapshot catalog
trước 015 bằng sau rollback, task IDs giữ nguyên, migrate hai lần checksum,
chain down/up đúng. Review phát hiện guard chỉ tin tên index/default; test
thay index cùng tên đã RED (Missing expected rejection), sau xác minh định
nghĩa/index/default mới GREEN. Mutation tắt confirm-project hoặc dependency
guard đều exit 1; đã restore. Một compound DB test, không phóng đại thành
nhiều test riêng. Gate nền cuối đều exit 0: test thường vẫn 1052, DB 178
(177 regression + 1 compound test), skip 0. Lần format đầu exit 1 do file
test DB mới chưa format; đã Prettier rồi chạy lại exit 0, không giấu lần fail.

Rollback mất receipt/attribution mới, remigrate không lấy lại được; runbook
ghi rõ cần backup/duyệt trước apply. pg_depend không bắt được mọi dynamic SQL
hoặc reference trong code app; không hứa phát hiện toàn bộ.

## API và quyền sở hữu — đã kiểm local

- Controller đợi service trả answer đã qua validator, sau đó persist đúng một
  receipt rồi trả `X-Assistant-Answer-ID`; JSON answer giữ nguyên. General,
  documents (kể cả refusal không bằng chứng) và workspace đều có receipt.
- Header được khai báo type-only trong contracts và expose qua CORS đã có;
  không thêm origin, không đổi CSRF/cookie. Request ID lấy từ middleware server,
  không tin các header giả user/workspace/answer ID của client.
- Snapshot hash SHA-256 dùng canonicalJson trên schemaVersion/request chuẩn hóa
  và **public response**, không dùng text renderer/Markdown/model raw output.
  Receipt không lưu question/answer. Không biến giới hạn feedback thành giới
  hạn chat mới: answer dài vẫn theo luồng chat cũ.
- Receipt issue và feedback write recheck membership trong transaction ngắn;
  dùng shared access policy với khóa membership hiện có. Không giữ DB lock qua
  Gemini. Receipt sai user/workspace/hash/ID bịa → 404 chung, không thay DB.
- Feedback nhận user_id/workspace_id từ principal; viewer gửi được own feedback.
  Retry cùng submission_id giữ idempotency. Legacy receipt_id/user_id vẫn NULL;
  không nhận lại legacy client UUID làm chứng cứ ownership.
- Provider/validator/Auth/CSRF/DTO lỗi → không receipt/header. Lỗi lưu receipt →
  503 `ANSWER_RECEIPT_UNAVAILABLE`, không trả success không có receipt. Provider
  có thể đã tốn lượt trước lỗi DB; budget là B3, chưa có auto retry LLM.
  Mất acknowledgement COMMIT/network có thể để receipt mồ côi dù client nhận
  lỗi/không nhận answer; không hứa atomic giữa PostgreSQL và HTTP hoặc tự xóa
  receipt có outcome chưa rõ. Reconciliation/retention là việc quản trị kế tiếp.
- `feedback.saved` chỉ log sau xác nhận COMMIT; test mất acknowledgement trả
  503, không log success, retry cùng submission_id không trùng row. Không log
  câu hỏi/answer/hash/credential. Không cam kết Exactly Once qua mạng.

HTTP RED độc lập đã chạy baseline: 17 test, 12 fail đúng hành vi, 5 regression
pass. Sau sửa 18/18 GREEN (thêm 1 regression receipt-storage outage). DB receipt/
ownership/export 12/12 trên SQL thật, hai workspace/hai user và viewer. Bộ DB này
là kiểm chứng integration, không nhận mọi case là RED riêng. Test log COMMIT mới
đã RED 1 trước sửa, sau đó 29/29 feedback regression GREEN.

Mutation trên dist tạm, sau đó rebuild source thật:

- Bỏ user predicate nhưng giữ bind hợp lệ → 1/18 fail vì foreign-user receipt
  được nhận; không phải lỗi SQL/bind.
- Cố tạo receipt cho lỗi provider/validator → 2/18 fail, gồm citation bị từ chối.
- Đã restore/rebuild; 18/18 post-mutation GREEN. Không sửa validator của Thắng.

## Frontend và export

Transport đọc header server; useAssistant không tạo answer UUID nữa.
createUuid chỉ còn phục vụ submission_id. Thiếu/sai header vẫn giữ answer,
không cho gửi feedback. App chuyển ID vào hook, **không sửa AssistantPanel**.
Feedback 404 giữ selection/note, không gợi retry vô ích; hướng dẫn hỏi lượt mới.
Payload snapshot vẫn dùng response gốc, không dùng text đã dịch/format hiển thị.

6 test FE mới đã fail đúng lý do trước sửa, rồi GREEN. Lần RED transport đầu
thiếu cấu hình Auth fixture nên không tính là bằng chứng; đã sửa fixture và
chạy lại cả 6 fail vì header/client UUID. Thêm test 404 RED→GREEN. Focused cuối
26/26 pass. Các test UUID cũ cập nhật để kiểm server answer ID và randomness chỉ
cho submission_id, không giả vờ client answer UUID còn hợp lệ.

Export bắt buộc đúng một workspace, lọc SQL trước ORDER/LIMIT cho cả IDs/rating.
CLI yêu cầu --workspace-id khớp PILOT_WORKSPACE_ID và credential maintenance
riêng MIGRATION_DATABASE_URL, **không fallback DATABASE_URL runtime**. Kết nối
maintenance được verify project/TLS theo helper và query trong BEGIN READ ONLY.
Đây là CLI local do quản trị viên vận hành, không phải endpoint hoặc phiên Auth
manager giả từ một UUID. Chưa xác thực operator bằng Supabase Auth manager; cần
cất riêng credential quản trị, không đưa cho member/viewer.

Candidate vẫn provenance client_reported/status UNREVIEWED, không gold/verdict.
Attribution: legacy_unattributed nếu không có receipt, receipt_linked nếu còn
owner, user_removed nếu user đã bị xóa. Hash khớp không chứng minh facts đúng.
5 test export mới đã RED trước sửa, 6 test cũ + 6 scoped/maintenance test cuối
pass; maintenance guard bổ sung là regression, không nhận RED. Real DB test
chứng minh IDs/rating không xuất feedback workspace khác. Artifact private,
không overwrite; mode 0600 không thay Windows ACL. Không sửa gold/run cũ.

## Browser đã thao tác thật

Codex In-app Browser với Auth synthetic local (real PilotAuthGuard + service/
SQL, không Supabase Auth thật), viewer; dùng lại harness ignored Đợt 7 trên một
DB random riêng chạy 015, fake Gemini/Storage/OCR/embedding, chặn cloud fetch.

- Desktop: general answer → Hữu ích → note → Gửi phản hồi bằng Enter → UI
  “Đã lưu phản hồi”. Expand không mất trạng thái. Mode workspace tại 1440×900
  trả sáu môn, feedback own answer cũng lưu được.
- 375×812: reload giữ fixture session, hội thoại cũ trống đúng thiết kế memory.
  Hỏi tài liệu → citation → Chưa đúng → Thiếu ý bằng Space → note → Enter gửi.
  UI xác nhận đã lưu. Không sửa cơ chế preview hoặc thuật toán retrieval.
- Sau reload tiếp, query read-only trên đúng DB harness xác nhận: receipts
  general/documents/workspace mỗi mode 1; feedback saved=3, ownerMatches=3.
  Chat không được coi là đã persistence; feedback DB có, UI không có history N1.
- Mobile scrollWidth=375/viewport=375; hai rating buttons cao 46px. Desktop
  scrollWidth=1425/viewport=1440. Đã nhìn ảnh, không tràn ngang; dùng Enter/Space/
  Tab trên các control (không tuyên bố mọi hành động chỉ dùng bàn phím vì có fill).
- Console error/warn = 0 trong các lần kiểm. Không đọc cookie/token hoặc UUID
  thật. Screenshots ignored: browser-desktop-feedback.jpg,
  browser-desktop-workspace.jpg, browser-mobile-feedback.jpg trong thư mục log.

Đã đóng tab và reset viewport; stop endpoint harness trả 200, log fixture.stopped;
DB riêng được drop. Vite của lượt kiểm đã dừng. Không dừng process của người khác.

## Gates cuối thực chạy

Chạy từ root, serial để không chồng Nest build với process test:

| Lệnh                  | Baseline exit |                      Cuối exit |
| --------------------- | ------------: | -----------------------------: |
| npm run typecheck     |             0 |                              0 |
| npm test              |             0 |                              0 |
| npm run build         |             0 |                              0 |
| npm run format:check  |             0 | 0 (sau Prettier file test mới) |
| npm run test:database |             0 |                              0 |

| Suite         | Baseline pass |      Cuối pass | Fail/skip cuối |
| ------------- | ------------: | -------------: | -------------: |
| API Vitest    |           198 |  198 (14 file) |            0/0 |
| API node:test |           596 |            621 |            0/0 |
| Web Vitest    |           258 |  265 (13 file) |            0/0 |
| Tổng thường   |          1052 |           1084 |            0/0 |
| DB disposable |           177 | 190 (10 suite) |            0/0 |

Output thật rút gọn: Tests 198 passed; tests 621/pass 621/fail 0/skipped 0;
Tests 265 passed. DB: 13+10+14+23+9+18+65+25+1+12=190.

Các lần fail không giấu: build đầu lỗi annotation Row|undefined (đã sửa);
full test lần đầu sau API có 2 fail do INSERT compatibility fixture chưa truyền
policy/receipt mới (đã sửa fixture, không nới runtime); format cuối đầu exit 1
do answer-receipt.test.tsx chưa format sau sửa fixture. Logs giữ nguyên.

## N1 sẽ dùng receipt thế nào

Receipt ID là khóa ổn định của một lượt **đã được server cấp**, scope theo owner
và workspace; không phải lịch sử hoặc context memory. N1 sẽ thêm bảng
conversation/turn riêng có giới hạn/retention, liên kết receipt khi phù hợp.
Không nhét question/answer text hoặc previous-turn do client bịa vào receipt.
Receipt không chứng minh nội dung đúng và không được dùng để tự promote feedback.

## Giới hạn và phối hợp Thắng

- Không thay chunking/embedding/OCR/model/score/topK/minScore/scan policy/prompt/
  validator hoặc AssistantPanel/TTS/STT. Thay đổi ảnh hưởng integration của Thắng:
  controller chỉ thêm bước persist receipt sau answer đã validate; DB lỗi ở bước
  này có thể trả 503 dù Gemini thành công. Response body/citation không đổi.
- Type-only contracts khai báo header/error codes; không có runtime export.
  Không thêm dependency/đổi lockfile hoặc migration 001–014/settings attribution.
- Copy có sẵn trong AssistantPanel cho feedbackUnavailable vẫn nói “trình duyệt
  chưa tạo mã”, chưa chính xác khi server header thiếu; không sửa vì Tài cấm
  chạm file TTS/STT của Thắng. Đây là nợ copy ở nhánh lỗi, không có client UUID
  fallback. Cần phối hợp Thắng chỉnh câu chữ ở lượt riêng nếu muốn.
- Chưa áp 012–015/cloud, chưa gọi Gemini thật, chưa nghiệm thu Supabase Auth/
  manager CLI login, role examate_app/tenant RLS, AI budget/retention hoặc mobile
  vật lý. Live eval vẫn BLOCKED; không semantic PASS mới. Chỉ dữ liệu demo/local.
- Docker đã tắt khi tiếp tục sáng 15/10; đã báo Tài bật rồi mới kiểm DB/browser.
  Rule thư mục cha LogiRoute không áp vào ExaMate theo scope người dùng. Dùng
  TDD/incremental/security/source-driven/review để giữ ranh giới và bằng chứng.

Nguồn pattern: [Nest Res passthrough](https://docs.nestjs.com/controllers#library-specific-approach)
để đặt header mà không tự gửi JSON; [PostgreSQL pg_depend](https://www.postgresql.org/docs/16/catalog-pg-depend.html)
cho guard dependency và [ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html)
cho DROP RESTRICT/FK. Không suy rằng pg_depend thấy dynamic SQL của app.

## Commit/cleanup

Commit nền: 3ffee46; API/ownership/export: 0d235b7; FE transport/feedback: 5590cf0.
Commit docs cuối ghi báo cáo này, README/runbook/roadmap/plan/todo.
Không push theo quyết định mới nhất của Tài; không merge/deploy. Giữ nguyên
docs/PHASE-4-RAG-EVALUATION-PROMPT.md untracked. Artifacts/harness không commit.

Review độc lập phát hiện thiếu đăng ký hai suite receipt trong npm scripts và
maintenance export có thể fallback runtime URL; cả hai đã sửa. Follow-up FE
không thấy lỗi actionable mới; copy nhánh thiếu header ghi giới hạn ở trên.

Cleanup thật:

```powershell
docker compose -p examate-phase8-20261014 -f compose.local-db.yaml down
```

Exit 0; đã gỡ đúng container/network của stack test, **giữ volume**, không -v
và không đụng stack khác/Supabase. API/Web của harness đã tắt; tab test đóng.
Đợt 8 hoàn tất trong phạm vi local và dừng chờ Tài review, không mở lát 6/N1.
