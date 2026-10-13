# B1a-fix — push, roadmap local và rollback hẹp 012/013

Ngày 2026-10-13 (Asia/Saigon), ExaMate tại `D:\New-Tech\Final-Project`, nhánh
`feature/tai-rag-integration`. HEAD đầu lượt `4819992`.

## 0. Push checkpoint đã review

Trước sửa: tracked tree/index sạch; chỉ có prompt untracked có trước
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`, không stage/đụng vào.
Fetch đúng nhánh, đối chiếu log: 20 commit chưa push thuộc Đợt 1–4 đã review,
không có WIP chưa commit được đưa vào push.

```text
git fetch origin feature/tai-rag-integration
git log --oneline origin/feature/tai-rag-integration..HEAD
git push origin feature/tai-rag-integration
To https://github.com/franz08hmt/New-Tech.git
   3d96946..4819992  feature/tai-rag-integration -> feature/tai-rag-integration
```

Exit 0. Không force, không merge main. Các commit mới của B1a-fix được push
sau gate/bàn giao, không dùng push đầu làm bằng chứng cho code chưa kiểm.

## 1. Roadmap theo quyết định Tài

- App chỉ local `http://127.0.0.1:5173` + Supabase chung. Không hosting,
  public deployment, domain hay HTTPS cho app; vẫn giữ TLS Supabase.
- TTS/STT N4a/N4b do Thắng phụ trách, Tài chỉ giữ điểm tích hợp text câu trả
  lời đã verify; phải báo trước khi sửa AssistantPanel.
- B3 còn 1–2 lát: cap thao tác AI/user/ngày và cap fan-out summary/index.
  Có định nghĩa lượt/ngày/concurrency, không dựng billing hoặc hứa cap bằng hóa đơn.
- N3 PWA loopback, Android qua adb reverse cổng 5173 và URL 127.0.0.1 để giữ
  origin; không tự mở LAN/tunnel. iOS ghi giới hạn chưa nghiệm thu local Windows,
  không coi giả lập 375px là thiết bị thật.
- Thứ tự: B1 → B2 → B3 → B4 → N1 → N3 → N2 → N5; N6 tùy chọn.

Đây là kế hoạch, không phải N3/ADB đã thử trên điện thoại trong B1a-fix.
Commit docs riêng `efff6c9`.

## 2. Rollback 012/013 có guard

Thêm `apps/api/scripts/pilot-rollback-012-013.mjs`, npm root/workspace
`pilot:rollback-012-013`. Giữ preflight/membership và migration nguyên trạng.

- Dùng lại pilotConnection maintenance/resolvePilotProject, TLS verified.
  Input CLI chỉ nhận --apply/--confirm-project, từ chối flags lạ/duplicate.
  Mặc định dry-run, BEGIN READ ONLY/ROLLBACK. Không có SQL/target tùy ý.
- Plan in đúng năm tên bảng public, count từng bảng (string giữ bigint chính
  xác), hai tên ledger. Ref che bớt; không đọc/in nội dung Auth/session/key/UUID.
- Validate exact project trước query/socket. Kiểm ledger 012/013 có checksum
  SHA-256 source khớp, không migration >013 hoặc không nhận ra, đủ năm bảng
  ordinary; không sửa source hay checksum để vượt guard.
- Dependency guard đi ngược pg_depend qua cả row/array type, chặn external
  FK/view/function và đối tượng ngoài nhóm. Allow component thuộc bảng như
  index/constraint/TOAST/type/policy, không tự xoá object ngoài bằng CASCADE.
- Apply một transaction: advisory xact lock 424204 cùng migration runner,
  ACCESS EXCLUSIVE tables/ledger trước kiểm, DROP đúng năm bảng RESTRICT một
  câu lệnh rồi DELETE đúng hai dòng ledger. Count dùng row_security=off để
  fail thay vì báo count bị RLS lọc; lock timeout 5s, không chờ vô hạn.
- Lỗi COMMIT/rollback acknowledgement báo **outcome unknown**, không hứa
  đã rollback. Người quản trị phải đối chiếu trạng thái riêng trước retry.
  Lỗi source/query được sanitize, không đính kèm pg detail/cause.

### Chi tiết PostgreSQL cần hiểu

012 tạo FK từ membership/session tới auth.users. FK có trigger RI nội bộ
trên bảng cha Auth; chúng là component của chính FK mới. Khi DROP bảng pilot,
PostgreSQL tự gỡ các trigger đó, **không xoá bảng/user/session provider Auth**.
Guard chỉ allow trigger trên bảng ngoài khi tgisinternal và constraint của
nó thuộc nhóm năm bảng. Không hứa rằng mọi dòng catalogue Auth bất biến.
Test đối chiếu Auth counts/columns/ACL/RLS; dữ liệu/shape Auth giữ nguyên.

Guard catalogue không thể thấy mọi tham chiếu nằm trong SQL string/app code;
vì vậy runbook yêu cầu dừng API/phối hợp nhóm trước rollback. RESTRICT vẫn là
ranh giới cuối nếu phát sinh phụ thuộc trong khoảng đua. Đây không phải hệ
thống rollback mọi migration hay restore toàn Supabase.

## 3. RED → GREEN, mutation và SQL thật

Theo TDD, test author độc lập viết hai file trước runtime, ghi RED exit 1 do
ERR_MODULE_NOT_FOUND trước khi mở DB. Không nói rằng mọi assertion đã đỏ riêng.
Review/runtime SQL còn phát hiện guard đang chặn trigger FK nội bộ Auth; đã
khoanh đúng object qua catalogue local, sửa điều kiện ownership rồi roundtrip xanh.

Một assertion privacy parser bị false positive: keyword `rollback` vốn có
trong filename/stack. Test author sửa riêng assertion keyword đó; vẫn kiểm
reject và tất cả giá trị unique/ref/UUID/cause. Không nới guard để test xanh.

Focused cuối: **35 unit pass, 13 SQL pass, fail/skipped 0**. Hai SQL case thêm
cuối (wrong ref thật và real COMMIT mất ACK) là tăng coverage xanh lần đầu,
không tự nhận chúng là RED→GREEN.

Mutation chạy **unit stub, không DB/cloud**, khôi phục bằng patch ngay sau:

| Mutation                 | Quan sát                                                |
| ------------------------ | ------------------------------------------------------- |
| Bỏ guard confirm project | Exit 1; 4 test fail; có thể lọt tới query nếu guard mất |
| Bỏ guard dependencies    | Exit 1; 1 test fail, yêu cầu từ chối trước DROP         |

SHA-256 runtime trước/sau khôi phục giống nhau:
`0D0C1125A199FAFD66A3A18E5A0E66603C1237D8F426D3701CBCF1A9129E4166`.
Unit sau khôi phục 35/35, không commit mutation.

### DB disposable, không Supabase

Docker `29.6.2 linux`, Node host `v24.13.0`; project riêng
`examate-b1afix-20261013`, image pgvector/pgvector:pg16, loopback 55432.
Guard TEST_DATABASE_URL chạy trước pool/fixture/migration; không load .env.
Baseline DB trước runtime mới: B0d 10 + CLI 14 = **24 pass, skipped 0**.

SQL tests chứng minh:

- Migrate đủ, ledger thiếu/sai checksum/later/unknown → reject trước DROP.
- FK từ bảng ngoài, view, function trả row type pilot → reject trước DROP.
  Unit mutation kiểm guard thật, không chỉ dựa vào PostgreSQL RESTRICT.
- Sai ref → không query. Dry-run có count và mọi query trong read-only, không đổi dữ liệu.
- Apply xoá năm bảng, ledger còn 001–011; count tất cả bảng app cũ và sentinel
  task giữ nguyên; Auth users/sessions counts và metadata columns/ACL/RLS giữ nguyên.
- Lỗi DELETE ledger sau DROP → rollback cả tables/ledger.
- Migrate lại hai lần: checksum source khớp, timestamps lần hai không đổi;
  năm bảng được tạo lại rỗng, không giả vờ khôi phục membership/session cũ.
- Wrapper gọi COMMIT **thành công thật** rồi mô phỏng mất ACK: lỗi outcome
  unknown dù tables đã mất/ledger còn 11; cleanup migrate lại đúng DB test.
- Suite test:database chạy rollback SQL trước, rồi B0d SQL và CLI SQL tuần tự:
  **13 + 10 + 14 = 37 pass, skipped 0** sau rollback/remigrate.

Role/policies/Auth fixture chỉ trong test, không phải Supabase Auth hay B2.
Tests chỉ xoá own fixtures; destructive roundtrip từ chối nếu có pilot rows
không thuộc lượt test. Không cleanup/reset DB khác.

## 4. Runbook đã đơn giản hoá

[PILOT-B1-RUNBOOK.md](PILOT-B1-RUNBOOK.md) có “Đường đi nhanh” 10 dòng đánh số.
Backup đổi sang `pg_dump --schema=public --format=custom`, image cùng major,
TLS verify-full và kiểm pg_restore --list. Bỏ yêu cầu restore thử toàn Supabase;
rollback chính là CLI hẹp đã test, public dump là bảo hiểm dữ liệu app thêm.

Ghi rõ public dump không chứa schema auth/storage, roles/global objects hay
Storage files; có thể vẫn chứa app data và session ciphertext trong public,
nên vẫn nhạy cảm. Không tự restore độc lập vì FK có thể trỏ auth. Migration
012/013 không đụng Storage. Runbook không phải bằng chứng đã pg_dump thật.

## 5. Gate cuối và review

| Lệnh                  | Exit | Pass / skipped                                         |
| --------------------- | ---: | ------------------------------------------------------ |
| npm run typecheck     |    0 | Không phải test                                        |
| npm test              |    0 | API Vitest 197 + node:test 405 + web 178 = **780 / 0** |
| npm run build         |    0 | Không phải test                                        |
| npm run format:check  |    0 | API/web matched files sạch                             |
| npm run test:database |    0 | Rollback 13 + B0d 10 + CLI 14 = **37 / 0**             |

```text
Tests 197 passed (197)
node:test: tests 405; pass 405; fail 0; cancelled 0; skipped 0
Tests 178 passed (178)
database: tests/pass 13, 10, 14; fail/cancelled/skipped 0 ở cả ba file
All matched files use Prettier code style!
```

Markdown/manifests được prettier --check riêng (root format gate không check
docs), exit 0; git diff --check sạch. Smoke root CLI `--cascade`: exit 1 đúng,
chỉ error generic, reject trước load .env/kết nối cloud. Không chạy CLI rollback
mặc định/cloud hay --apply cloud để smoke.

Reviewer độc lập không còn actionable blocker ở runtime, runbook, roadmap.
Đã sửa góp ý loadMigrations vào catch trước BEGIN để error projection nhất quán.
Skills git-workflow/TDD/security giữ push phạm vi, test author độc lập, fail-closed
guards; source-driven đối chiếu catalogue/RESTRICT; tài liệu ghi giới hạn thật.
Reference definition-of-done của skill không có trên máy; dùng acceptance/gates
Tài đã chỉ định làm bar nghiệm thu, không bỏ kiểm tra.

Logs ignored tại `artifacts/phase4-b1afix-20261013/`: rollback-red.log,
rollback-unit-green.log, rollback-database-green.log, mutation-confirm-project.log,
mutation-dependencies.log, database-baseline.log, database-final.log,
typecheck-final.log, tests-final.log, build-final.log, format-final.log,
gate-exits.json, rollback-cli-rejection.log, db-up.log, db-down.log.

## 6. Dọn dẹp, commit và giới hạn

Đã chạy exit 0:

```powershell
docker compose -p examate-b1afix-20261013 -f compose.local-db.yaml down
```

Project test không còn container; giữ volume
`examate-b1afix-20261013_test-postgres-data`, có thể up lại. Không xoá volume
hay container SOP/project khác. Đã xoá dữ liệu pilot **fixture local** qua
roundtrip; bảng đã migrate lại rỗng, không ảnh hưởng dữ liệu Supabase.

| Commit  | Phần                                                          |
| ------- | ------------------------------------------------------------- |
| efff6c9 | Roadmap local-only, B3 gọn và voice ownership của Thắng       |
| 6f618ec | Rollback CLI, unit/SQL tests, npm registration                |
| 9ac81a0 | Quick path + public backup + verified narrow rollback runbook |

Commit tiếp theo chứa báo cáo này. Push cuối chỉ các commit đã kiểm trên nhánh
feature/tai-rag-integration, không force/merge main. Hash push cuối ghi ở bàn giao
chat/git log (không tự tham chiếu hash commit chứa chính file này).

Không sửa preflight/membership, FE/AssistantPanel/TTS/STT, auth runtime/RAG,
contracts, migrations 001–013, dependencies/lockfile, .env hay settings Claude.
Không ghi/cloud rollback/migrate/pg_dump hoặc tạo user/membership cloud, không
chạy preflight cloud trong lượt fix này. **B1 Auth thật vẫn chưa nghiệm thu.**
App local vẫn chỉ dùng demo, viewer và isolation đợi B2; localhost không thay
thế phân quyền dữ liệu trên Supabase chung. Dừng chờ Tài duyệt bước B1 thật.

## Nguồn kỹ thuật

- [PostgreSQL pg_depend](https://www.postgresql.org/docs/16/catalog-pg-depend.html): dependency direction, normal/auto/internal; guard không chỉ đếm FK trực tiếp.
- [PostgreSQL DROP TABLE](https://www.postgresql.org/docs/16/sql-droptable.html): intrinsic components và RESTRICT không tự xoá phụ thuộc ngoài.
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html): chọn schema khác schema-only, selected schema không tự mang mọi phụ thuộc.
- [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts), [PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable): loopback context, capability/install yêu cầu thực tế.
- [Chrome local server forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server): hướng dẫn thiết bị/local forwarding; chưa là bằng chứng Android của ExaMate đã được thử.
