# Đợt 9.1 — N1 hardening: bảo toàn draft khi answer về

Ngày 15/10/2026, Asia/Saigon. Nhánh `feature/tai-rag-integration`, baseline
`83fe713b19786ddf28250890ca141f07fda8248b`. Chỉ vá hook FE, thêm regression
và báo cáo; không push/merge/deploy/cloud hoặc mở lát tiếp theo.

## Nguyên nhân và invariant

Trong `use-assistant.ts`, nhánh success trước đây gọi `setDraft("")` khi
không truyền `options.message`. Question A đã được chụp cho request, nhưng
composer vẫn cho nhập B lúc transport pending; success A xóa cả B.
Đã đối chiếu `git show d15afea:apps/web/src/use-assistant.ts`: nhánh clear
này tồn tại trước N1. Đây là lỗi có sẵn, **không phải regression do Đợt 9**.

Public `setDraft(value)` nay tăng `draftRevision` đồng bộ trước khi enqueue
state. Request hợp lệ chụp revision riêng với request epoch. Sau success,
chỉ clear bằng setter nội bộ khi request dùng draft và revision còn bằng
revision lúc nhận gửi; epoch/abort guard hiện có vẫn phải chấp nhận response.
Clear nội bộ không giả làm một lần chỉnh sửa của người dùng.

Revision biểu diễn lần cập nhật, không so sánh giá trị cuối: A→B→A vẫn đổi
revision, nên giữ A người dùng vừa chỉnh. Vì revision tăng ngay trong setter,
edit B và resolve A cùng một act/batch cũng giữ B trước khi render/effect chạy.
Không khóa textarea, không dùng effect để phát hiện chỉnh sửa, không persist
draft/history. Question, mode, operation, scope và response snapshot của A
không lấy lại từ composer khi answer về.

## RED → GREEN và ma trận

Thêm 22 test vào suite hook hiện có `conversation.test.tsx`, dùng deferred
transport và public setter. Helper cũ `fixture.send()` luôn truyền
`options.message`; các case tái hiện đã gọi `send(context)` từ draft thật.

Lần RED trên source chưa vá: **13 fail, 25 pass, 0 skip / 38 test**.
Trong 25 pass có 16 test cũ và 9 regression mới xanh ngay; không nhận chúng là RED.

| Case                                                                                 | Số test mới | RED trước vá                         | Kết quả sau vá                             |
| ------------------------------------------------------------------------------------ | ----------: | ------------------------------------ | ------------------------------------------ |
| A: General/Documents/Workspace, edit B, answer A và snapshot/receipt đúng A          |           3 | Cả 3 mất B thành chuỗi rỗng          | PASS                                       |
| A-batch bắt buộc: setter B rồi resolve A cùng một act, không await giữa hai thao tác |           1 | B thành chuỗi rỗng                   | PASS                                       |
| B: không chỉnh, có/không whitespace quanh A                                          |           2 | Xanh ngay                            | Clear draft; question trim đúng            |
| C: edit B rồi quay lại đúng A                                                        |           1 | A vừa chỉnh bị xóa                   | PASS                                       |
| D: reject khi đang có draft B                                                        |           1 | Xanh ngay                            | Error, giữ B, không retry/turn giả         |
| E: reset conversation/document/course, B chưa gửi, transport bỏ qua abort            |           3 | Xanh ngay                            | Không append A, giữ B                      |
| E: ba reset × stale success/failure, có request mới pending                          |           6 | Đỏ khi success của request mới xóa B | Giữ B, history mới sạch, lock/status đúng  |
| F: options.message với question/summarize/course_info                                |           3 | Xanh ngay                            | Giữ draft; operation/history semantics cũ  |
| G: response hợp lệ nhưng receipt thiếu/sai dạng                                      |           2 | Mất B                                | Hiện answer, giữ B, không feedback/history |

Ở 6 case E có request mới, các assertion về stale success/error/finally vốn
đã xanh trước vá; lỗi xảy ra ở bước request mới thành công và xóa B.
Không báo N1 epoch/abort là lỗi mới. Case A kiểm đúng một cặp A trước thao tác
gửi tiếp có chủ đích; history chứa receipt và raw response snapshot A, không B
hoặc text renderer. Workspace tiếp tục không gửi history.

Sau vá: focused 5 file hook/receipt/Assistant/source-reset/App **163 pass,
0 fail/skip**. Hook riêng **38 pass, 0 fail/skip**.
Logs: `draft-red.log`, `focused-green.log` trong run artifact bên dưới.

## Mutation đã chạy và restore

Chỉ thay điều kiện `draftRevision.current === requestDraftRevision` bằng
`true`, giữ nguyên epoch/abort và transport:

1. Test A-batch: exit 1, **1 fail / 37 filtered (Vitest hiển thị skipped)**;
   fail vì B nhận chuỗi rỗng. Restore trong finally, hook 38/38 GREEN.
2. Chạy cả A Documents và A-batch: exit 1, **2 fail / 36 filtered** vì mất B.
   Restore source đúng trong finally, hook 38/38 GREEN, 0 skip.

Đây là test filter có chủ đích của mutation, không phải skip trong full gate.
Không nhận compile error hoặc all-filtered là bằng chứng. Diff cuối vẫn có
điều kiện revision thật; không có mutation được stage/commit.

## Browser thật, local và provider giả

Đã chạy **Chrome 141.0.7390.123 headless thật qua CDP loopback**, profile mới
riêng run; không phải jsdom/DOM mock. Viewport desktop 1440×900 và mobile
375×812. Mobile là viewport emulation, chưa kiểm thiết bị/bàn phím ảo vật lý.
UI tại `http://127.0.0.1:5173`, Vite proxy tới fixture API loopback.

Sao chép browser fixture Đợt 9 sang run mới, fake generation chờ **2500ms**,
AuthService DI synthetic + real global guard/service/SQL, embedding/Storage/OCR
giả, PDF một trang tổng hợp. Không thay runtime API hoặc mở bypass production.
Node fixture chặn fetch ngoài loopback; browser page interception chỉ cho HTTP
127.0.0.1. Không gọi Google/Supabase/Storage cloud, không nhập tài khoản thật.

| Phép kiểm trực tiếp                                               | Desktop                                       | 375px                         |
| ----------------------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| Gửi A, nhập B khi pending, nhận đúng một cặp A và B còn nguyên    | PASS                                          | PASS                          |
| Không sửa draft: answer về thì composer rỗng                      | PASS                                          | PASS                          |
| New conversation khi pending, gõ draft mới, chờ response cũ       | PASS: conversation rỗng, draft mới giữ nguyên | PASS                          |
| Textarea vẫn editable khi pending                                 | PASS                                          | PASS                          |
| Không tràn ngang                                                  | scrollWidth 1425 / viewport 1440              | 375 / 375                     |
| Mở citation/page 1 của PDF fixture                                | —                                             | PASS                          |
| Helpful feedback của answer có receipt được lưu, draft giữ nguyên | —                                             | HTTP 201 + acknowledgement UI |

Send dùng textarea → Tab → nút Send → Enter; nhập văn bản bằng CDP
Input.insertText của Chrome, không gán DOM value để né React. New conversation,
source và feedback được focus bằng locator rồi kích hoạt bằng Enter; không
tuyên bố đã đi toàn bộ đường Tab hoặc kiểm bàn phím ảo.

Đã xem ảnh desktop/mobile và PDF: trang 1 hiển thị dòng
“Phase 9 local PDF fixture” cùng nội dung tổng hợp; không chỉ nhìn thấy iframe.
Không coi đó là nghiệm thu PDF thật, extraction/OCR hoặc citation semantics.

Browser final: **0 JS exception, 0 console error, 0 warning, 0 unexpected
network failure**; 2 canceled requests đúng do reset, 0 external requests
đi vào interceptor. Có 5 response chat nhận header receipt, 1 feedback HTTP
201, 1 PDF response 200. Không log header value/cookie/token/signed URL.

Truy vấn trên đúng DB fixture trước cleanup: **7 receipt, 1 feedback,
1 owner/workspace match**. Hai generation bị client abort vẫn tạo receipt
phía server; client không nhận/đưa chúng vào context. Không cam kết transaction
DB và HTTP nguyên tử hoặc tự sửa hợp đồng cancellation/receipt trong bản vá.
Feedback hữu ích vẫn là tín hiệu chưa review, không thành semantic PASS.

Hai lượt driver đầu thất bại vì harness: chọn textarea khi panel còn hidden,
và CDP Enter thiếu text carriage return nên chưa submit. Đã sửa script điều
khiển trong artifact, giữ log/evidence thất bại rồi chạy lại đầy đủ; không
sửa app hoặc nới assertion. Một diagnostic CLI/patch có lỗi quoting PowerShell,
không thực thi được; đã dùng file/script literal và apply_patch. Đây không
phải lỗi app và không được dùng làm RED→GREEN của bản vá.

## Baseline và gates cuối

Node **v24.13.0**, npm **11.6.2**, Docker **29.6.2 Linux**, Engine sẵn sàng.
Không nâng Node theo khuyến nghị README hoặc đổi cấu hình máy.
Các gate và suite import dist chạy **tuần tự**, không chạy build song song
với test/API fixture. Fixture browser đã dừng trước gates cuối.

| Gate root             | Baseline          | Final             |
| --------------------- | ----------------- | ----------------- |
| npm run typecheck     | exit 0            | exit 0            |
| npm test              | exit 0, 1172 pass | exit 0, 1194 pass |
| npm run build         | exit 0            | exit 0            |
| npm run format:check  | exit 0            | exit 0            |
| npm run test:database | exit 0, 207 pass  | exit 0, 207 pass  |

Baseline: API Vitest **231**, API Node **655**, web **286**, fail/skip 0.
Final npm test: API Vitest **231**, API Node **655**, web **308**; thêm đúng 22
regression, fail/skip/cancelled 0. Test DB baseline và final từng suite đều
**13 + 10 + 14 + 23 + 9 + 18 + 65 + 25 + 1 + 29 = 207**, fail/skip/cancelled 0.
Đã đối chiếu log mới của từng gate/suite, không lấy số cũ làm kết quả mới.

Artifact local/ignored: `artifacts/phase9-1-20261015-mv98w3fr/`, gồm baseline/final gate logs,
RED/GREEN/mutation logs, browser driver/fixture, evidence JSON và screenshots.
Không ghi đè artifact Đợt 9, không commit artifact hoặc profile.

## Phạm vi, cleanup và bàn giao

File thuộc commit này:

1. `apps/web/src/use-assistant.ts`: revision nhỏ trong hook và guard clear.
2. `apps/web/src/conversation.test.tsx`: 22 regression hành vi.
3. `docs/PHASE-9-1-DRAFT-HARDENING-REPORT.md`: báo cáo này.

Không sửa AssistantPanel/App/API/contracts/migration/package/lockfile/TTS/STT,
RAG/model/prompt/validator/scoring hoặc snapshot/receipt/history contract.
Không thêm dependency. Không cập nhật roadmap vì đây là hardening nhỏ và báo
cáo riêng đủ để theo dõi; không đánh dấu B1/B2/B3/B4 hoàn tất.

SHA-256 các tài liệu WIP, resume/prompt có trước, AssistantPanel/App, settings
và root package/lock được lưu trước sửa và đối chiếu: không đổi. Không stage
README/HANDOFF/PROJECT-CONTEXT, các prompt/resume untracked có trước hoặc
`.claude/settings.json`. Không reset/stash, đồng bộ Git hoặc đổi attribution.

Browser fixture stop HTTP 200, log có `fixture.final_counts` và
`fixture.stopped`; đã drop đúng DB random do run tạo, không FORCE/glob.
Đã dừng đúng Vite do run khởi động và đóng Chrome riêng. DB stack disposable
down sau suite cuối exit 0, giữ volume, không `-v`; kiểm lại không còn listener
3000/5173/9222/55432. Một lệnh cleanup kết hợp bị automatic approval review
chặn trước thực thi với lý do **blocked by policy**; lệnh đó có bước xóa đệ quy
profile Chrome tạm. Giữ nguyên profile trong artifacts ignored, không thử cách
xóa khác; Docker shutdown độc lập đã chạy thành công. Chi tiết nằm trong
`cleanup-policy-blocked.txt` và `cleanup-docker.log`. Blocker cleanup profile
không được ghi thành lỗi app hoặc browser BLOCKED: browser đã kiểm thật ở trên.

Tài tự thử local bằng bản sao fixture ignored của run này trong directory
mới, DB disposable đúng target guard và fake provider chậm; start fixture
rồi `npm run dev:web`. Trong Assistant mở panel, dùng Hỏi tài liệu:

1. Gõ A → Tab tới Send → Enter → gõ B trước 2,5s: B phải còn sau answer A.
2. Gửi A và không chỉnh: answer về thì composer rỗng.
3. Gửi A → New conversation → gõ B: answer cũ không xuất hiện, B còn.
4. Kiểm citation/PDF và feedback, rồi dừng đúng fixture/Vite/stack do mình tạo;
   không dùng config cloud hoặc ghi đè run evidence cũ.

Code/test hardening hoàn thành; kiểm local fixture không thay Supabase Auth
thật, least-privilege/tenant RLS, budget AI bền vững hay nghiệm thu B4. N1 vẫn
semantic `PENDING_LIVE_B4`; E17 vẫn blocker AI_UNAVAILABLE theo lịch sử, không
suy ra quota/retrieval sai. Không thực hiện deployment bên ngoài.

Commit dự kiến `fix(web): preserve drafts edited while answers are pending`;
hash được báo ở bàn giao và tra bằng Git log của ba file, không tạo commit
thứ hai chỉ để ghi self-hash. Sau commit kiểm lại status, giữ nguyên WIP cũ.
**Không push/merge/deploy; DỪNG chờ Tài review.**
