# Đợt 7 — Documents, Storage và ranh giới RAG

Ngày kiểm: 14/10/2026. Nhánh `feature/tai-rag-integration`, baseline `f7081eb`.
Chỉ chạy local và DB disposable; không áp migration hay ghi Supabase/Storage
cloud, không gọi Gemini thật. Đây là bằng chứng triển khai/service, không phải
nghiệm thu Auth Supabase thật hoặc tenant RLS.

## Kết quả và phạm vi

- Documents list/GET metadata/download mặc định và inline/upload/gán môn/index/
  DELETE đều lấy workspace từ principal do guard verify. Không dùng identity
  trong DTO/header/query hoặc Storage key client.
- Member/manager upload, gán môn, index; chỉ manager DELETE. Cả ba role đọc,
  tải và preview. Viewer write trả `403 ROLE_FORBIDDEN`; không membership bị
  guard từ chối trước domain/provider. ID tài liệu/môn không có hoặc ngoài
  workspace trả 404 chung, không lộ tên hay đường dẫn object.
- Thêm `GET /api/documents/:id`, dùng shape `StoredDocument` hiện có trong
  contracts, không trả `storage_key`/workspace nội bộ. Không đổi HTTP response
  shape download hoặc citation; TTL 60 giây và kiểm bucket private giữ nguyên.
- `DocumentAccessService` dùng canonical `AuthStore.membership`, kiểm membership/
  role hiện tại trước Storage/provider. Mọi mutation DB của Documents và
  ingestion authorize trong transaction ngắn. Membership/workspace đọc với
  `FOR SHARE OF m, w` trong transaction, serialize revoke/pause với lần ghi.
  Không giữ transaction/row lock trong khi gọi Storage, OCR hoặc Gemini.
- Ingestion claim và state update scoped; transaction thay chunks khóa parent
  document đã authorize bằng `FOR UPDATE`, kiểm workspace/state trước DELETE/
  INSERT chunks. Chunk scope kế thừa document, không thêm cột/schema.
- Upload kiểm course trước Storage; lỗi FK được phân biệt bằng tên constraint:
  `documents_workspace_course_fk` → 404 `COURSE_NOT_FOUND`,
  `documents_workspace_fk` → 403 `WORKSPACE_ACCESS_DENIED`; FK lạ không bị giả
  thành lỗi môn học. DTO sai UUID vẫn 400. Giữ bù trừ object mới của request và
  reconciliation khi phản hồi INSERT/COMMIT không rõ; không xóa object đã commit.
- DELETE document không tồn tại nay 404, thay idempotent 204 cũ, để missing và
  outside-workspace không phân biệt được. Retry xóa sau thành công cần refresh.
- DocumentsPanel và phần Documents trong CourseWorkspace khóa write cho viewer,
  chỉ manager có nút DELETE. Detach khỏi môn là UPDATE, member vẫn làm được.
  Xóa kiểm lại quyền sau confirm; mất quyền ghi xóa draft PDF; đổi account/
  workspace remount view. Link download đến muộn sau unmount không kích hoạt.
- Mobile: vùng bấm document buttons/select/file picker tối thiểu 44px; không
  đổi token màu, Poppins hoặc bố cục desktop. Không sửa AssistantPanel/TTS/STT.

Không cần migration 015: nền/FK/index của 014 đủ. Không sửa 001–014,
`packages/contracts`, dependency/lockfile, `.claude/settings.json` hoặc gold/
artifact/run lịch sử. Các fixture Auth/provider chỉ có trong test/harness local.

## Thay đổi ảnh hưởng RAG — dành cho Thắng review

Các file runtime: `document-ingestion.service.ts`, `rag-retrieval.service.ts`,
`assistant.service.ts`, `assistant.controller.ts`, policy mới
`documents/document-access.service.ts` và membership lookup canonical.

1. Principal được truyền từ guard tới retrieval/summary/metadata/Assistant.
   Kiểm course/document cùng workspace trước `embedQuery`. Recheck membership
   sau embedding, trước mỗi lượt scan và trước từng `Gemini.generate` của
   question/summary/synthesis; general chat cũng dùng ranh giới membership.
2. `d.workspace_id = $8::uuid` nằm **trong CTE nearest, trước ORDER BY/LIMIT**.
   Các bind 1–7, score/topK/minScore, thứ tự, scan expansion/cap giữ nguyên.
   All-documents không nhìn tài liệu workspace khác, kể cả chunk kia gần hơn
   hoặc chiếm hơn 100 kết quả gần nhất. Summary/metadata/join course scoped.
3. Không đổi chunking, embedding/model/dimensions, OCR, quality filter, scan
   policy, prompt, JSON schema, validator, citation marker hoặc grouping summary.
   Golden một workspace so trên cùng dữ liệu/vector: chunk ID, thứ tự và score
   khớp **chính xác** nearest SQL baseline `f7081eb`, cả trước và sau sửa.
4. Theo quyết định bổ sung của Tài, live evaluation khóa ở **đầu
   `createLiveHarness` trong `scripts/rag-evaluation-harness.mjs`**, trước
   runtime imports/config/DB/Storage/Gemini. `--execute` internal và HTTP báo
   `BLOCKED`, reason `LIVE_EVALUATION_AUTH_REQUIRED`, exit 3; message:
   “Chưa có principal workspace cho runner live; chờ đợt tích hợp Auth.”
   Case không attempted, provider budget 0; không giả PASS/semantic FAIL.
   Không có cờ/env bypass hay principal giả cho live.
5. Offline fixture được nối với Auth fixture synthetic chỉ trong offline,
   không mở runtime bypass. Evaluation suite cũ vẫn pass: manifest 24 case,
   dry-run exit 0/không semantic PASS; offline selection 7 case vẫn
   `REVIEW_REQUIRED`, exit 2, zero network. Không sửa gold/run Đợt 4.

Hai phương án **chưa chọn, chưa triển khai** cho đợt tích hợp live runner:

- (a) Service principal gắn `PILOT_WORKSPACE_ID`, chỉ dùng CLI local, có hạn mức;
  cần thiết kế authority/scope và kiểm mọi đọc corpus/signing/provider trước khi
  mở lại runner, không chỉ bỏ guard.
- (b) Account test đăng nhập qua HTTP, giữ cookie/CSRF an toàn và verify session/
  membership như app; không chuyển cookie/key vào artifact hay log.

Code live runner cũ còn dormant dưới guard để review/tích hợp sau, chưa được
coi là đã thích nghi Auth. Không dùng runner này để né scope bằng DB trực tiếp.

## RED → GREEN và mutation

Test mới được chạy trên dist baseline trước sửa runtime, không fail vì thiếu
dependency/setup. Test xanh ngay lần đầu được gọi rõ là regression.

| Bộ kiểm                                 | RED quan sát được                      | GREEN cuối                           |
| --------------------------------------- | -------------------------------------- | ------------------------------------ |
| HTTP Documents/Auth/provider            | 65 case: 40 fail, 25 pass              | 66/66; thêm 1 regression transaction |
| DB hai workspace/RAG                    | 19 case: 14 fail, 5 pass               | 25/25                                |
| UI Documents/course controls            | 27 case: 14 fail, 13 pass              | 28/28                                |
| Download completion sau unmount         | 1 fail trước lifecycle guard           | Pass trong UI suite                  |
| Foreign/missing course phải 404         | Focused 83 case: 6 fail, đều 400 ≠ 404 | Pass sau sửa mapping/preflight       |
| Revoke giữa embedding, direct retrieval | 1 fail trước recheck                   | Pass, không trả evidence sau revoke  |
| Transaction authority ở document write  | 1 fail trước transactional write       | Pass với DB lock waiter thật         |
| Live evaluation Auth boundary           | 3 fail trước guard                     | 3/3; toàn evaluation 37/37           |

Golden và các case đường hợp lệ là regression GREEN trước/sau, không nhận là
RED. Một số case revocation/transaction bổ sung xanh lần đầu; cũng không nhận
đã RED. Vitest 4 file RAG/Assistant/ingestion focused: 65/65 pass.

Mutation đã chạy và khôi phục đầy đủ:

- Bỏ predicate workspace trong nearest (giữ bind bằng typed no-op): foreign
  crowding test đỏ vì lọt nguồn workspace khác, không phải SQL thiếu bind.
- Ký URL từ server row trước authorize: 6/6 test đỏ, Storage spy thấy call sớm.
- Cho member DELETE: 1/1 đỏ (204 thay 403).
- Bỏ check trước Gemini sau nearest: 1/1 đỏ khi membership bị revoke.
- Bỏ `FOR SHARE`: DB test đỏ, revoke không bị chặn. Bản đúng quan sát
  `pg_stat_activity.wait_event_type = Lock` và `pg_blocking_pids` trước commit,
  không chỉ dựa vào sleep/timing.
- FE cho member xóa: 2 case đỏ; bỏ check sau confirm: 1 case đỏ.

Mutation API chỉ trên dist tạm, đã restore. Kiểm hậu restore 7/7 Documents và
5/5 RAG/lock/golden xanh; build/gates cuối tạo lại dist từ source thật.

## Lệnh và số liệu thực chạy

Node 24.13.0, Docker Server 29.6.2/Linux. Node vẫn thấp hơn khuyến nghị 24.15+
trong README; không đổi Node/dependency trong đợt này.

Chạy từ `D:\New-Tech\Final-Project`:

| Lệnh                                              | Baseline exit | Exit cuối |
| ------------------------------------------------- | ------------: | --------: |
| `npm run typecheck`                               |             0 |         0 |
| `npm test`                                        |             0 |         0 |
| `npm run build`                                   |             0 |         0 |
| `npm run format:check`                            |             0 |         0 |
| `npm run test:database` (TEST_DATABASE_URL local) |             0 |         0 |

| Suite            | Baseline pass |     Cuối pass | Fail / skipped cuối |
| ---------------- | ------------: | ------------: | ------------------: |
| API Vitest       |           197 | 198 (14 file) |               0 / 0 |
| API node:test    |           527 |           596 |               0 / 0 |
| Web Vitest       |           230 | 258 (12 file) |               0 / 0 |
| Tổng test thường |           954 |         1.052 |               0 / 0 |
| DB disposable    |           152 |           177 |               0 / 0 |

Output rút gọn thực tế:

```text
TYPECHECK_VERIFIED=0
TEST_VERIFIED=0
BUILD_VERIFIED=0
FORMAT_VERIFIED=0
DATABASE_VERIFIED=0
API Vitest: Tests 198 passed (198)
API node:test: tests 596; pass 596; fail 0; skipped 0
Web: Tests 258 passed (258)
DB: pass 13 + 10 + 14 + 23 + 9 + 18 + 65 + 25 = 177; fail 0; skipped 0
```

Lần full suite đầu sau sửa có **1 fail**: offline evaluation fixture thiếu
principal/access constructor mới. Đã giữ log, sửa fixture explicit offline Auth,
focused regression xanh rồi chạy lại đủ năm lệnh trên. Không giấu lần fail.
Session receipt baseline DB đầu bị mất; chạy lại để thu exit 0, vẫn 152 pass.

Logs RED/GREEN/mutations/gates trong `artifacts/phase7-20261014/` (ignored,
không commit). DB target chỉ loopback 55432; từng suite tạo đúng DB random
`_test` riêng, Auth fixture tối thiểu, kiểm guard/ownership rồi cleanup.
Không dùng Supabase Auth thật; suite mới dùng owner để kiểm SQL service scope,
không chứng minh grants/RLS của role `examate_app` tương lai.

## Browser thực tế và giới hạn quan sát

Codex In-app Browser, web 5173 và API fixture 3000; real PilotAuthGuard/service/
SQL trên DB disposable, Auth synthetic cùng fake Storage/Gemini/OCR/embedding.
Không sửa AssistantPanel để kiểm. Các trạng thái sau được quan sát:

- Viewer: desktop/mobile 375px, upload/gán môn/index bị khóa, không DELETE;
  đọc/lọc/download được. Download event hoàn tất. Enter mở Assistant, hỏi tài
  liệu fake có citation, Enter mở source, focus vào heading; ở 375px quay lại
  hội thoại trả focus citation.
- Member: desktop/375px, upload/gán môn/index được, không DELETE stored;
  upload PDF local, đổi môn, re-index đều qua API thành công. Reload còn 2
  documents. Courses → chi tiết → Back làm được bằng bàn phím; detach có confirm
  inline, PATCH 200 và phần môn từ 1 tệp thành 0 (file không bị xóa).
- Manager: desktop/375px, thấy upload/index/DELETE; download event hoàn tất;
  upload/index qua API thật của fixture. Nút DELETE bằng Enter gặp timeout điều
  khiển modal native trong browser tích hợp. Sau đó **log HTTP DELETE 204** và
  tab mới/reload hiện **0 stored**, xác nhận thao tác đã tới API và xóa thành
  công; không khẳng định đã quan sát/điều khiển trọn hộp confirm native.
- Không overflow ngang: ở 375px scrollWidth 360/375 tùy scrollbar; desktop
  1440px scrollWidth 1425. Nút icon DELETE đo ban đầu 38px; sau CSS sửa đo
  **44×44px**, Download/Index cao 44px, document selects thấp nhất 44px.
- Console các lần kiểm không có lỗi JavaScript (0). Lỗi CDP/selector ở trên là
  lỗi điều khiển browser, không được giấu hoặc gọi thành console app error.

**PDF chưa xác nhận lại nội dung trang bằng mắt:** citation tạo iframe đúng
title `Phase7-preview.pdf, trang 1`, request inline thành công, focus/layout
đúng, download thực sự hoàn tất. Nhưng native PDF surface trong ảnh của browser
tích hợp chỉ hiện vùng tối, không đọc được nội dung trang. Không có browser Chrome
extension trong inventory nên không tuyên bố đã xem trang thật trên Chrome.
Rendering/source-preview code không thay đổi trong đợt này; vẫn nên thử lại trên
Chrome thật và điện thoại vật lý khi nghiệm thu B1. Không sửa renderer để né hạn
chế công cụ. Ảnh UI mobile ở `artifacts/phase7-20261014/browser-manager-mobile.jpg`.

Harness startup lần đầu fail 23514 vì document ready thiếu `indexed_at`; sửa
fixture và dọn đúng DB harness bỏ lại, không sửa constraint/DB nghiệp vụ.
Sau gián đoạn lượt làm việc cũng dọn đúng fixture của lượt trước khi tiếp tục.

## Review, cleanup và phần chưa làm

Review độc lập phát hiện hai lỗi đã sửa: course ngoài scope 400 thay 404, và
authority check chưa atomic với DB mutation. Follow-up review không thấy lỗi
runtime actionable mới; cũng review guard live evaluation/CSS mới. Không hỏi
hay gọi second opinion/model ngoài theo quyết định của Tài.

Giới hạn phải giữ khi triển khai tiếp:

- Revoke giữa indexing: không commit chunks mới, chunks cũ giữ nguyên; không ghi
  failure state khi đã mất quyền. Document có thể còn `processing` và cần
  reconciliation quản trị. Không có automatic stale-claim recovery; không đổi
  claim/scan policy của Thắng. Không tự reset job để bypass quyền.
- Calls đã dispatch không thu hồi được; signed URL đã cấp vẫn dùng đến expiry
  (60s). Không cam kết revoke ngay binary/provider đã nhận.
- Chưa làm answer receipt/feedback ownership (lát 5), `examate_app`/tenant RLS
  (lát 6), budget AI (B3). Lát 6 phải kiểm quyền row-lock của membership/workspace,
  không suy rằng grants SELECT-only đủ cho `FOR SHARE`.
- Không nghiệm thu Gemini semantic quality, Supabase Auth/grants thật, load lớn,
  mạng chậm/PDF lớn hoặc điện thoại thật. Chỉ dùng dữ liệu demo/local.

Cleanup: ba Auth/browser fixtures đã tắt, log có `fixture.stopped`; DB riêng
được drop. Vite của lượt kiểm cũng đã dừng. Chạy:

```powershell
docker compose -p examate-phase7-20261014 -f compose.local-db.yaml down
```

Exit 0; chỉ gỡ container/network stack test này, **không `-v`**, giữ volume và
không đụng stack SOP hoặc database/Supabase dùng chung.

## Commit và bàn giao

1. `d8438e1` — API Documents/Storage/index, shared access và transactional role.
2. `d290832` — RAG boundary, principal propagation, HTTP/DB matrix và golden.
3. `8546eac` — live evaluation fail closed theo quyết định bổ sung của Tài.
4. `fcea933` — FE Documents capability, stale download guard, mobile touch target.
5. Commit docs chứa báo cáo này, README/roadmap/plan/todo; xem hash ở bàn giao cuối.

Push không force cùng nhánh sau commit docs/gates/tracked tree sạch, không merge
main. Giữ nguyên `docs/PHASE-4-RAG-EVALUATION-PROMPT.md` untracked có trước;
không stage artifact, secret, migration cũ hoặc attribution Claude.

### Kết quả push của lượt này

Sau commit docs `136c15b`, fetch xác nhận remote không diverge (0 behind,
5 ahead), tracked tree sạch. `git push origin feature/tai-rag-integration`
không trả kết quả, Git Credential Manager còn chờ. Đã hỏi Tài tự hoàn tất đăng
nhập, không xin/đọc token hoặc password. Khi chưa có phản hồi, hủy lệnh đang
chờ (exit 1), **không tuyên bố push thành công**. `git ls-remote` sau hủy xác
nhận remote vẫn `f7081eb`, chưa nhận commit Đợt 7. Commit docs bổ sung ghi lại
giới hạn này; cần Tài hoàn tất Auth GitHub rồi push tiếp, không force/merge.
