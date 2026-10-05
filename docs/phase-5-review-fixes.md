# Hậu kiểm Đợt 5 — các sửa sau review

Ngày 06/10/2026, nhánh `feature/tai-rag-integration`, HEAD đầu lượt `d6ff533`.
Tracked tree sạch trước sửa; giữ nguyên prompt untracked có trước. Hướng dẫn
LogiRoute ở thư mục cha khác project, tiếp tục ưu tiên yêu cầu ExaMate, không
sửa rule. Không thêm dependency, migration, DB feedback, provider call hoặc
thay đổi RAG/model/prompt/gold. Báo cáo Đợt 4 và báo cáo nghiệm thu Đợt 5 trước
được giữ làm checkpoint lịch sử.

## 1. UUID và câu trả lời trên HTTP

RED trước sửa: test mô phỏng crypto có getRandomValues nhưng thiếu randomUUID;
general/documents/workspace đều nhận answer hợp lệ rồi trả messages=[] thay vì
2 message. Test nguồn random lỗi cũng fail cùng nguyên nhân. Test gửi/retry
feedback trên môi trường đó không tìm được controls vì answer đã bị mất.
Đây là lỗi trực tiếp trong use-assistant.ts gọi UUID bên trong nhánh success.

`apps/web/src/create-uuid.ts` dùng native randomUUID nếu có; khi thiếu hoặc
native implementation throw, tạo UUID v4 bằng 16 byte getRandomValues, đặt
version/variant đúng. Dùng chung cho answerId và submissionId, không Math.random.
Nếu không có nguồn random hoạt động, helper trả undefined: hook vẫn thêm hai
messages và status idle, panel báo feedback chưa có mã. Khi tạo submission ID
lỗi, form giữ note, không gửi API và không throw khỏi handler.

GREEN: ba mode giữ answer, UUID hợp lệ; submission UUID khác answer UUID và
retry 503 giữ cùng payload/key, không sinh mã mới. Có regression cho native
UUID throw, random source throw và giữ note khi không tạo được submission ID.
Tất cả là fixture/DOM, chưa phải browser thật qua HTTP IP máy chủ.

## 2. Vùng bấm

Source đã có min-height 44px trước lượt này. Panel có starting-scale 0,97 trên
desktop và 0,98 trên sheet; 44 × 0,97 = 42,68px, 44 × 0,98 = 43,12px. Điều này
khớp phép đo 43px của reviewer nếu transition bị giữ ở điểm đầu, là suy luận
từ source, không phải đo browser mới. Nâng min-height các nút feedback và label
checkbox lên 46px: nhỏ nhất 46 × 0,97 = 44,62px. Không đổi animation/prompt/layout
chung. Browser desktop/375px vẫn chưa được nghiệm thu trực tiếp do không có
browser tool khả dụng; không tuyên bố đã đo lại bounding box.

## 3. Lỗi feedback

RED cho 400/409: UI vẫn đưa retry chung. Sau sửa, 400 và 409 có state/message
riêng, giữ note/reasons nhưng không hiện nút gửi lại cùng payload. 400 báo dữ
liệu không hợp lệ cần nhóm kiểm tra. 409 báo server đã có row/key với nội dung
khác, không nhận bản đang gửi đã lưu, không ghi đè. 503/network vẫn retry cùng
key, và malformed receipt vẫn chưa được coi đã lưu. Không render chi tiết lỗi
backend vào thông báo mới. Không đổi API/contract hoặc idempotency DB.

## 4. Artifact test

`apps/api/test/test-artifacts.mjs` cấp thư mục mkdtemp riêng dưới artifacts,
đăng ký t.after ngay khi tạo. Cleanup chỉ target do test đó cấp, kiểm boundary
absolute path trước recursive removal; hook chạy cả khi assertion fail.
Evaluation offline/dry CLI/checkpoint và feedback export/candidate CLI đều dùng
helper. Dry CLI không còn tự tạo run vô danh ở artifacts/rag-evaluation.
Unit/CLI subset 40 tests pass; sau subset và toàn suite, không còn thư mục mới
evaluation-test-<6 ký tự> và không tăng số artifact cũ thuộc các test này.
Test candidate từng fail vì --import Windows path cần file URL; sửa fixture,
cleanup vẫn chạy, không gọi đó là RED vì bug evaluator.

Đã kiểm nội dung/tên và lập manifest local cho 26 artifact test cũ: 14 offline
fixture directories, 6 dry fixture directories và 6 synthetic export files.
Lệnh PowerShell Remove-Item dùng LiteralPath và boundary check bị automatic
approval review từ chối `blocked by policy`, **không xóa được** 26 target đó.
Không thử công cụ khác để thực hiện lại việc xóa bị từ chối. Artifact lịch sử
không xác định được nguồn gốc test, các run Đợt 4/5 và feedback smoke vẫn giữ.
Manifest local: artifacts/phase5-review-cleanup-manifest.json. Cleanup cũ còn
BLOCKED; sửa vòng đời artifact các test về sau đã kiểm chứng.

## 5. Candidate qua CLI thật

Thêm integration test ghi file candidate schema 1 UNREVIEWED từ fixture export.
Chạy subprocess runner `--execute --cases <candidate>` với fetch guard: exit 1
Unsupported evaluation schema/revision, không tạo run/report hoặc network marker.
Sau đó chạy dry-run E01 với file candidate nằm cạnh output: chỉ E01 NOT_ATTEMPTED,
0 PASS, không có candidates trong report hoặc network marker. Đây là bảo vệ
đường CLI thật; không chỉ gọi validateDefinition trực tiếp. Runner runtime không
cần sửa, gold/manifest/corpus không bị đổi; candidate chưa review vẫn không là
case chính thức. Test mới GREEN với behavior hiện có, không nhận là RED→GREEN.

## Gates và điểm dừng

Baseline mới từ root: bốn gates exit 0, API Vitest 197 + API node:test 180 + web
135 = 512 pass, skipped 0. Logs artifacts/phase5-review-baseline/.

Final từ root: typecheck/test/build/format:check exit 0; API Vitest 197 + node:test
181 + web 144 = **522 pass**, skipped 0. Logs artifacts/phase5-review-acceptance/.
RED fixture run: 7 fail, 10 deselected/skipped; GREEN feedback suite: 19 pass.
Các test regression bổ sung không được gán RED giả.

Lượt gates trung gian artifacts/phase5-review-final/ có typecheck exit 2 vì type
fixture Uint8Array<ArrayBufferLike> và response union mode/ragEnabled, test 522
pass; sau chỉnh annotation/discriminator của test, build/format 0. Chạy lại đủ
bốn gates riêng làm final, không che hoặc ghi đè log lỗi trung gian.

Phạm vi runtime: create-uuid.ts, use-assistant.ts, AssistantFeedback.tsx,
AssistantPanel.tsx, styles.css. API chỉ thay test/helper, không runtime của Thắng.
Guide feedback được cập nhật riêng; không làm Đợt 6, push/merge/deploy. Giữ tồn
đọng semantic review E01/E04/E07/E16, E17 BLOCKED/AI_UNAVAILABLE và browser thật.
Review staged diff/secrets, commit trên nhánh hiện tại; hash commit được báo
trong bàn giao cuối. Tracked tree sau commit sạch, prompt untracked có trước giữ
nguyên. Dừng chờ Tài duyệt.
