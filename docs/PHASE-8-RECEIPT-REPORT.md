# Đợt 8 — server answer receipt và feedback ownership

Đang triển khai ngày 14/10/2026 trên `feature/tai-rag-integration`, baseline
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

## Còn phải làm trước nghiệm thu

- Receipt HTTP sau validated answer, feedback ownership/hash/idempotency.
- Transport header server, export workspace/legacy và browser local.
- Tests DB hai workspace/user, mutations API, full gates và review cuối.

HTTP RED độc lập đã chạy baseline: 17 test, 12 fail đúng hành vi, 5 regression
pass; chưa gọi đó là GREEN. Không push hoặc tuyên bố Đợt 8 đã hoàn tất.
