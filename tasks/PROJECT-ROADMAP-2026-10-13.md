# ExaMate — lộ trình pilot nhỏ và điểm nhấn New Technologies

Ngày 13/10/2026. Đây là **đề xuất**, không phải lệnh triển khai tự động.
Nguồn hiện trạng: [review FE/BE](../docs/PROJECT-REVIEW-2026-10-13.md).
Cập nhật B0a/B0b: [báo cáo Đợt 1](../docs/PHASE-1-SESSION-ACCESS-REPORT.md)
ghi nhận sửa session race và gate 320–1440px; login Supabase thật còn chờ provision.
Tài xác nhận: pilot cho nhóm và vài người được mời; thầy không bắt buộc một
công nghệ cụ thể. Hạn final chưa được cung cấp; không ước lượng lịch nộp.

**Phạm vi Tài chốt từ B1a-fix:** app chỉ chạy local tại
`http://127.0.0.1:5173`, dùng Supabase chung; không hosting, triển khai công
khai, domain hay thiết lập HTTPS cho app. Giữ TLS cho kết nối Supabase.
N4a/N4b do Thắng phụ trách; Tài không sửa TTS/STT hoặc AssistantPanel khi chưa
báo trước. B1a đã review đạt phần chuẩn bị (745 test, DB 24/24); Auth thật B1
vẫn chờ nghiệm thu theo [runbook](../docs/PILOT-B1-RUNBOOK.md).

## 1. Sản phẩm final nên chứng minh điều gì?

Một sinh viên đăng nhập, chọn môn/tài liệu, hỏi và hỏi tiếp có ngữ cảnh, kiểm
tra nguồn, luyện tập từ tài liệu; dùng cùng luồng trên điện thoại. Nhóm có
thể giải thích pipeline LLM/RAG, cách bảo vệ dữ liệu và đo chất lượng/chi phí.

Gói final khuyến nghị sau khi sửa nền:

1. Hội thoại có ngữ cảnh, RAG có bằng chứng đánh giá.
2. Một luồng luyện tập có nguồn: tạo bộ câu hỏi ngắn hoặc flashcards.
3. PWA dùng được trên điện thoại, có hành vi mất mạng rõ ràng.
4. TTS/STT do Thắng phụ trách, tích hợp qua text câu trả lời đã verify.

Multi-model và WASM là hướng mở rộng sau khi có baseline để so sánh.
Native mobile chưa cần cho pilot này; chỉ cân nhắc khi có nhu cầu thiết bị
mà web/PWA không đáp ứng. Không chọn công nghệ chỉ để tăng số nhãn trong demo.

## 2. Quy tắc cho mọi đợt triển khai

- Từng lát có spec/acceptance, test hành vi, runtime verification, báo cáo và
  commit riêng trên nhánh phát triển đã xác minh. Được push không force lên
  origin/feature/tai-rag-integration khi Tài giao; không merge main.
- Kiểm working tree trước làm; giữ README/prompt/WIP của người khác, stage
  đúng file của lát đó. Không thêm attribution Claude, không sửa settings.
- Giữ React/Vite/Nest/npm workspaces, hash routing, contracts `.d.ts` chỉ chứa
  kiểu. Shape HTTP mới khai báo một lần trong contracts và dùng ở FE/BE.
- Không đổi màu tokens, Poppins, ngôn ngữ layout; Heroicons 24/outline, semantic
  HTML, focus/keyboard, hit area >=44px, 375px. Reveal dùng hook hiện có.
- Label UI English; nội dung/empty/error/confirmation bằng tiếng Việt. Giữ
  nhãn minh họa nơi dữ liệu mẫu; không gọi generated answer là sự thật đã xác minh.
- Giữ baseline của Thắng: retrieval/chunking/embedding/OCR/validator. Bổ sung
  scope/admission ở boundary; mỗi thay đổi thuật toán/model/prompt phải được
  benchmark riêng, có version và lý do. Không bỏ citation check để test xanh.
- Không sửa migration đã có. B2 đã bổ sung 014 và receipt 015; migration kế tiếp hiện là 016, nhưng kiểm lại
  Git/runner/history trước đặt số. Không tự áp vào Supabase dùng chung.
- Không thêm dependency npm trong đợt ổn định. PoC WASM/native/provider mới
  phải nêu package/license/chi phí/phạm vi trước khi được chọn để triển khai.
- Cuối mỗi lát: typecheck/test/build/format; số pass/skipped thật; browser thật
  cho luồng có UI; DB integration cho SQL/permissions. Test mock ghi là mock.
  Test viết trước phải thấy fail đúng lý do; test xanh ngay đầu ghi là regression.
- Dừng sau mỗi đợt và bàn giao. Một đợt hoàn tất có thể nghiệm thu độc lập;
  chưa đạt tiêu chí thì xử lý đợt đó trước mở rộng tiếp.

## 3. Giai đoạn nền — cho pilot local với người được mời

### B0a. Sửa race khởi tạo session

**Giá trị:** đăng nhập đáng tin cậy khi StrictMode, mạng chậm hoặc focus nhiều lần.

**Phạm vi:** use-pilot-session, HTTP request helper nếu cần, test FE. Không đổi
cơ chế Supabase Auth, opaque cookie hoặc bỏ CSRF. Tái dùng diagnostic đã đỏ
trong artifacts của review; đưa regression vào suite chính khi triển khai fix.

**Các bước:** thiết kế shared HTTP promise/coalescing; mỗi subscriber apply
theo lifecycle/epoch hiện tại; giải phóng in-flight trong finally; khóa kết quả
cũ khi logout/account đổi. Xử lý CSRF stale bằng kiểm lại phiên, tránh replay
tự động password/write/chat. Không dùng cờ busy đơn giản khiến StrictMode kẹt.

**Xong khi:** reverse-order và remount vẫn login được; focus liên tiếp không
tạo các bootstrap cạnh tranh; logout/account swap không bị response cũ mở lại.
Kiểm cold login thật trên browser khi B1 provision xong. **Cỡ M.**

### B0b. Hoàn thiện gate và focus

**Giá trị:** màn hình đầu tiên dễ đọc, thao tác bằng bàn phím rõ ràng.

**Phạm vi:** PilotAccess, CSS bổ sung, test; dùng panel tokens hiện có.
Tạo card background, heading hierarchy, loading/error/no-access; giữ hoặc
khôi phục focus sau retry. Không tăng animation trên form Auth.

**Xong khi:** mọi trạng thái có thông báo dễ hiểu; retry bằng Enter trả focus
hợp lý; 375px/desktop không overflow, contrast được đo trên nền thật, vùng bấm
tối thiểu 44px. Test bàn phím ảo khi có thiết bị; nếu chưa có, ghi giới hạn. **Cỡ M.**

### B0c. Vá dependency có kiểm soát

**Giá trị:** giảm rủi ro runtime upload và chuỗi build trước dùng thử.

**Các bước:** review advisory/release notes; chọn bản Nest adapter/transitive
Multer tương thích; xử lý Express/proxy-addr riêng; build tooling xử lý riêng.
Update qua npm với lockfile, không hand-edit lock hay audit fix --force.
Kiểm lại upload valid/oversize/malformed/aborted ở process test cô lập;
so sánh cookie/Origin/proxy và gates trước/sau. Không chạy DoS payload vào API
đang nối DB dùng chung.

**Xong khi:** audit không còn findings high/critical chưa có mitigation được
review trên đường sử dụng; các mục defer ghi reachability/review date. Không
coi severity registry là bằng chứng app đã bị khai thác. **Nhiều lát S/M.**

### B0d. Làm đường chạy và test DB tái lập được

**Giá trị:** Tài/Thắng và người chấm có cùng cách khởi động/kiểm chứng.

Tách bind address container khỏi secure-cookie origin; giữ proxy FE/API cùng
origin. Chốt localhost hoặc 127.0.0.1 cho dev, PUBLIC_ORIGIN khớp URL thật.
Kiểm origin 5173 local và origin Docker 8080 riêng; giải quyết IP
throttle sau proxy bằng thiết kế trust rõ ràng, không tin mọi X-Forwarded-For.

Chuẩn bị DB disposable cho toàn bộ migrations; schema Auth fixture chỉ dùng
cho FK/SQL không được gọi là Auth provider integration. Kiểm non-owner role,
refresh row lock/intent, race admission, COMMIT uncertainty và migration hai lần.
Đặt Node/npm phù hợp trong dev/CI/Docker và đồng bộ README sau kiểm chạy thật.

**Xong khi:** proxy kết nối API, health/session qua cùng origin đúng; DB test
có pass thực, không skipped; không sửa/drop dữ liệu dùng chung. **Tách 2–3 lát M.**

### B1. Provision và nghiệm thu Auth thật

**Phụ thuộc:** B0a/B0b; target, account và authority quản trị project đã xác nhận.

Quản lý cấp workspace UUID, accounts manager/member/viewer/no-membership,
publishable key, encryption key qua cấu hình local an toàn; target/backup,
migration role và grants được xác nhận. Áp 012/013 qua runner khi được giao
riêng; không xin gửi password/key vào chat. Kiểm auth.sessions grants hoặc
phương án đã được quản lý lựa chọn và chứng minh revoke/expiry trên Supabase
Auth thật trong app local. Không triển khai hosting để nghiệm thu B1.

**Xong khi:** login/reload/refresh/logout/revoke/đổi account/đa tab hoạt động;
no-membership/outage fail closed, draft cùng user giữ đúng, user khác không
thấy notes/chat/draft. Có bằng chứng browser và Supabase thật. **Lát nghiệm thu riêng.**

### B2. Hoàn tất quyền và phạm vi dữ liệu — tiếp tục Chặng 2 pilot

**Giá trị:** thành viên đọc/ghi đúng quyền, không lấy nguồn ngoài workspace.

Chốt role matrix hiện có: viewer read-only; member tạo/sửa theo quyền đã duyệt;
manager thực hiện thao tác quản lý/xóa. Không cần public CRUD membership/admin UI.

Tách thành các lát:

**Checkpoint Đợt 8:** nền 015, Tasks/Courses và lát 3 Exams/Study plans/Expenses
cùng workspace-records đã triển khai; xem [báo cáo Đợt 5](../docs/PHASE-5-B2-SCOPE-REPORT.md)
và [báo cáo Đợt 6](../docs/PHASE-6-REPORT.md). Lát 4 Documents/signing/indexing/
RAG/summary/metadata đã scope và kiểm role ở service; xem
[báo cáo Đợt 7](../docs/PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md).
Lát 5 receipt/feedback ownership đã triển khai và kiểm local; xem
[báo cáo Đợt 8](../docs/PHASE-8-RECEIPT-REPORT.md). Chưa áp cloud, chưa tạo
`examate_app`/tenant RLS; B1 thật và hạn mức AI còn thiếu, chưa cách ly toàn app.
Runner live evaluation bị khóa trước mọi kết nối vì chưa có principal workspace;
offline/dry-run giữ nguyên, tích hợp Auth cho runner là đợt riêng chưa chọn thiết kế.
Runbook bootstrap 012→015 và rollback 015→014→012/013 đã
kiểm trên DB disposable, chưa chạy cloud.

1. Migration foundation/scope/backfill đã được duyệt, FK/indexes và role ít
   quyền; preserve/null-course/dữ liệu hiện có. Kiểm integrity/count/backup.
2. Tasks/Courses: principal context và scoped SQL; viewer write bị 403.
3. Exams/Study plans/Expenses và workspace aggregates: scope cả record lẫn
   course association; không tổng hợp từ bản ghi ngoài quyền.
4. Documents/signing/indexing/RAG/summary: check trước Storage/provider; scope
   chunks và mọi citation, kể cả chọn all documents.
5. Server answer receipt và feedback ownership; client UUID/snapshot không
   chứng minh câu trả lời thuộc account. FE ẩn/khóa controls theo capability
   nhưng backend vẫn là ranh giới quyền.

**Xong khi:** manager/member/viewer/no-access và outside-scope UUID/slug được
kiểm trực tiếp qua HTTP; không provider/Storage call sau reject; DB non-owner
thực enforce quyền; pooled context không rò giữa requests. Phần chưa scoped
không được mở ra ngoài trong lúc làm dở. **L, bắt buộc chia lát M.**

### B3. Giới hạn lượt AI và fan-out cho pilot local

**Giá trị:** quota/chi phí có giới hạn ngay cả khi nhiều người gọi cùng lúc.

1. Cap lượt thao tác AI/user/ngày, lưu admission/counter bền trên PostgreSQL,
   kiểm đồng thời/restart và reset ngày có timezone xác định. Chốt cách tính
   một lượt và ngưỡng với Tài/Thắng trước live; reject trước provider, không
   tự retry/replay request khi kết quả chưa rõ. Phân biệt local limit với
   AI_QUOTA upstream; user vẫn đọc được dữ liệu/câu trả lời cũ.
2. Cap fan-out summary/index: giới hạn trang/chunk/batch/provider dispatch
   và duration cho mỗi thao tác, gồm OCR nếu bật. Không lách cap user bằng
   một request tạo nhiều lời gọi. Ghi usage metadata tối thiểu nếu có, không
   log key/token/prompt/PDF. Không dựng billing/dashboard tài chính trong B3.

**Xong khi:** concurrency không vượt cap lượt; summary/index không vượt cap
fan-out; reject không gọi provider, lỗi tiếng Việt rõ. **1–2 lát M**, có thể
gộp nếu vẫn review/kiểm chứng độc lập được. Không gọi cap là hóa đơn hay bảo
đảm hết mọi chi phí; quota provider vẫn kiểm ở project/AI Studio.

### B4. Nghiệm thu FE/BE xuyên suốt và chất lượng RAG

**Phụ thuộc:** B1/B2/B3 và fixes B0. Không mở nhiều feature mới trong lát này.

Review artifact lịch sử E01/E04/E07/E16 trước, giữ E17 blocker. Thêm corpus
được phép: PDF tiếng Việt có dấu, scan, bảng và case thiếu evidence/scope.
Định nghĩa gold fact groups và reviewer; version dữ liệu mới, không sửa run
lịch sử để đổi verdict. Chạy subset live có cap, không retry đến khi có ảnh đẹp.

Đo riêng retrieval recall/fact coverage, claim support, citation id/page,
refusal, completeness, latency/provider usage. Nếu retrieval yếu, thử một
ứng viên như lexical+vector hoặc rerank sau baseline; nếu generation lỗi,
quan sát upstream status/rejection và thử output/prompt có version. Hiện đã
có structured output; không bỏ validator hoặc gộp general/documents/workspace.

Kiểm restart giữa indexing: thiết kế lease/job ownership và retry có giới hạn
nếu tái hiện record processing bị bỏ lại. Kiểm file lớn/mạng chậm theo cap đã
chọn; nếu sync request không đủ, tách job/status trên PostgreSQL, không buộc Redis.

**Xong khi:** demo login→CRUD→upload→index→RAG→nguồn/PDF→feedback→reload→logout
qua API thật; các critical acceptance case có review và không blocker chưa
giải thích. Android qua adb reverse/375px/desktop, keyboard, download/source và console
có bằng chứng riêng. Không dùng 562 test để thay các kiểm tra này. **Nhiều lát M.**

## 4. Các nâng cấp New Technologies sau nền

### N1. Hội thoại AI nhiều lượt, có ngữ cảnh và nguồn

**Checkpoint Đợt 9 — lát 1:** general/documents dùng history tối đa 6 receipt đã
verify user/workspace/mode/course/document/hash. FE memory-tab có reset/abort;
workspace và hai thao tác summary/course info vẫn một lượt. Character/byte cap
đã có, **chưa phải token/cost cap**. Có 10 case deterministic offline, semantic
chờ B4 live; chưa persistence/retention/streaming. Xem
[báo cáo Đợt 9](../docs/PHASE-9-N1-CONVERSATION-REPORT.md).

**Giá trị:** hỏi "giải thích ý thứ hai", "so sánh với phần trước" có nghĩa;
đây là phần AI cần nâng cấp hơn việc chỉ đổi model.

**Lát 1:** chốt bounded context theo user/workspace/mode/document scope.
Lưu hoặc xác minh previous turns bằng server receipt; không coi nội dung bot
do client gửi là evidence. Chỉ đưa context hợp lệ vào prompt, có token cap.
Đổi document/mode phải reset hoặc xin chọn lại ngữ cảnh, không mang nguồn
tài liệu trước sang câu mới âm thầm.

**Lát 2:** connect FE conversation/turn types; stale response/Abort giữ state
đúng. Thêm lỗi, retry có kiểm soát, empty context và source-deleted state.
Nếu làm persistence, bảng conversations/messages gắn user/workspace, có retention
và delete đúng quyền; notes vẫn theo thiết kế localStorage hiện tại.

**Lát 3:** đánh giá câu hỏi tiếp nối, pronouns, đổi scope/account, reload và
quota. Progress retrieval/generation/validation giúp người dùng hiểu đang chờ.
Streaming có thể thử ở general trước; document output chỉ được nhận là câu
trả lời đã kiểm sau validator, không render citation chưa xác minh như nguồn thật.

**Xong khi:** follow-up có source đúng; token/turn cap enforced; không rò history
giữa account/scope; không giảm metric B4. **L, 3 lát M; ưu tiên cao.**

### N2. Study coach: câu hỏi luyện tập và flashcards có nguồn

**Giá trị:** chuyển từ hỏi đáp chung thành công cụ ôn tập sử dụng được.

**Lát 1:** chọn một môn/tài liệu ready; tạo 5 câu hỏi có expected answer và
source ids/page đã verify. Structured response validate ở BE; không đủ evidence
thì giảm số hoặc báo rõ. Nhãn "AI-generated" và liên kết kiểm nguồn.

**Lát 2:** người dùng xem/sửa/xác nhận lưu. Module/bảng study items mới gắn
course/workspace/user, không đổi pipeline RAG cũ; tạo/xóa/cập nhật đúng role,
read-only viewer. Không tự ghi study plan hoặc lịch thi từ lời model.

**Lát 3:** practice/reveal đáp án và ghi tiến độ cá nhân; có thể thêm spaced
review sau. Đánh giá câu hỏi đúng nguồn, độ rõ, answerability và coverage;
điểm luyện tập là hỗ trợ học, không điểm thi chính thức. Không tự xem mọi
đáp án do model tạo là gold, không dùng feedback làm chuẩn tự động.

**Xong khi:** bộ 5 câu có thể kiểm từng nguồn; lưu/reload/xóa được; unsupported
claim bị từ chối; offline/provider error giữ form; usage được tính. **L, 3 lát M.**

### N3. PWA và trải nghiệm mobile

**Giá trị:** tái sử dụng FE/BE hiện có, cài từ browser, trình bày rõ công nghệ
web hiện đại. PWA và WASM giải quyết hai vấn đề khác nhau: install/lifecycle
so với thực thi module tính toán. PWA không làm Gemini trở thành AI offline.

**Lát 1 — mobile:** kiểm form, bottom sheet, PDF fallback, keyboard/safe-area,
upload/chọn môn, Back/deep links trên Android thật; sửa đúng lỗi đo được,
giữ palette/font và layout hiện tại.

**Lát 2 — install local:** manifest/name/icons/scope/start_url/standalone trên
loopback (secure context), hướng dẫn cài theo capability, không ép prompt.
Không thêm hosting/domain/HTTPS cho app. Android kết nối USB, Tài tự bật USB
debugging và duyệt thiết bị: `adb reverse tcp:5173 tcp:5173`, mở
`http://127.0.0.1:5173` trên Chrome Android để origin vẫn khớp PUBLIC_ORIGIN.
Kết thúc kiểm: `adb reverse --remove tcp:5173`. Chỉ loopback trên điện thoại
được forward, không đổi Vite bind thành 0.0.0.0 hay mở cổng LAN để tiện thử.
Browser không hỗ trợ vẫn
dùng web thường. Không viết lại bằng React Native để có icon trên home screen.

**Lát 3 — lifecycle/offline:** service worker cache **app shell/public assets**
với version/update flow. API/Auth/chat/feedback/signed URLs/PDF private dùng
network; không cache response có quyền thành cache dùng chung. Không tự queue
POST/chat/upload khi offline; báo rõ chưa gửi. Không force reload làm mất draft.
Offline giai đoạn đầu là mở shell và thông báo mất mạng; dữ liệu workspace
offline cần thiết kế quyền/caching/retention riêng nếu sau này chọn làm.

**Xong khi:** cài/mở/reopen/update thật; airplane mode có UI đúng; logout/account
swap không thấy dữ liệu account trước qua cache/Back; loopback/deep link ổn.
Desktop và Chrome Android được kiểm riêng; không gọi mô phỏng 375px là test
điện thoại thật. **iOS:** adb reverse không áp dụng; 127.0.0.1 trên iPhone không
trỏ máy Windows. Trong phạm vi local-only này chưa cam kết nghiệm thu PWA/Safari
iOS thật, không tự mở tunnel/HTTPS/hosting để vượt giới hạn. **3 lát M.**

### N4a. TTS — do Thắng phụ trách

Tài không triển khai/sửa file TTS. Điểm tích hợp duy nhất: cung cấp plain text
câu trả lời đã qua validator/verify, không đọc token/URL/markup hoặc citation
chưa xác minh. Muốn thay AssistantPanel phải báo trước và phối hợp với Thắng;
không đổi pipeline RAG để phục vụ TTS. Thắng chịu trách nhiệm spec/kiểm thử giọng.

### N4b. STT — do Thắng phụ trách

Tài không triển khai/sửa file STT. Giữ text input và luồng gửi câu hỏi hiện có;
Thắng bàn giao transcript để người dùng kiểm/sửa rồi Send chủ đích. Output
Assistant để tích hợp vẫn là text câu trả lời đã verify, không bypass Auth,
CSRF, scope, quota hay validator. Phối hợp trước khi sửa AssistantPanel.

### N5. So sánh và hỗ trợ nhiều model có kiểm soát

**Giá trị:** câu chuyện New Tech về quality/latency/cost dựa trên benchmark.

Bắt đầu hai generation models trong cùng provider để giảm độ phức tạp.
Registry server allowlist/capability/output limits; FE chọn từ danh sách đã
kiểm. Tái dùng AssistantProvider; lưu model/prompt/usage trong answer/report.
So trên cùng corpus/questions/scope/rubric, budget từng model; chọn default
bằng kết quả, không theo tên mới hơn. Không fallback silently đổi ngữ nghĩa
document mode hoặc làm mất citation để trả một câu general.

Embedding là quyết định khác: chỉ đổi generation không cần re-index; đổi
embedding model/dimensions cần kế hoạch index/version/data migration riêng.
Giữ invariant vector 768 hiện có; không trộn vectors khác model dù cùng chiều.

**Xong khi:** unsupported model bị từ chối trước provider; hai model giữ validator;
quality/latency/token/cost có bảng so sánh thật; provider down không tự fan-out
qua nhiều model/quota. **2–3 lát M; không prerequisite cho PWA/TTS.**

### N6. WASM — PoC có câu hỏi nghiên cứu rõ ràng

**Giá trị khi phù hợp:** xử lý CPU nặng phía client, giảm block UI hoặc thử
tiền xử lý trang scan cục bộ. WASM không tự giảm độ trễ mạng/provider.

Chọn **một** tác vụ sau profiling, ví dụ tiền xử lý ảnh scan trước OCR hoặc
OCR cục bộ một trang. Đo JS/main-thread và JS/worker trước, rồi WASM/worker;
đo cold load, tốc độ, memory, chất lượng text và trên điện thoại. Không thay
PDF/indexing/embedding authoritative của BE ngay trong PoC.

Nếu lựa chọn OCR WASM/library mới, cần review package/license/model download,
size/memory, tiếng Việt và CSP. Chạy module trong worker, có cancel/cap/page,
fallback khi không hỗ trợ. Không gọi đây là LLM offline nếu chỉ làm OCR.

**Xong khi:** có benchmark lặp được trên cùng dữ liệu và thiết bị; đáp ứng mục
tiêu số liệu đã chốt trước thử. Nếu không có lợi ích đủ bù cold-load/memory,
giữ là kết quả nghiên cứu và không thêm vào production. **PoC M/L, ưu tiên sau.**

### N7. Native mobile hoặc AI thực hiện thao tác — tùy nhu cầu mới

Native chỉ lên kế hoạch riêng nếu cần tính năng thiết bị không đạt bằng PWA.
Đánh giá wrapper/native stack, hệ thống build/signing/store, web auth và deep
links; không mặc định duy trì React web lẫn React Native với nhóm hai người.

AI tạo study-plan/exam là feature riêng: model chỉ tạo draft/intent allowlist;
người dùng preview và xác nhận, DTO/role/course scope/idempotency kiểm phía
server. Không để model tạo SQL, tool arbitrary hoặc vòng lặp không giới hạn.
Kiểm hủy, double-submit, scope đổi và quota; chỉ một thao tác được chọn cho
lát đầu. Đây là mở rộng từ workspace read-only, không sửa ngầm luồng cũ.

## 5. Trình tự và điều kiện đi tiếp

```text
B0 đã ổn định -> B1 -> B2 -> B3 -> B4 -> N1 -> N3 -> N2 -> N5
N6 WASM: tùy chọn, chỉ chọn sau profiling/baseline và đủ nguồn lực.
N4a/N4b: Thắng phụ trách, phối hợp điểm tích hợp riêng; không phải lát của Tài.
```

Nếu phải thu gọn final, ưu tiên B0–B4, N1 và N3; thêm một lát N2/N4a đã nghiệm
thu (N4a do Thắng phụ trách). Không dồn toàn bộ roadmap vào một prompt implementation. Có thể tạo một
prompt nền/rules rồi giao từng lát riêng theo kết quả đợt trước.

Mỗi đợt có output: commit phạm vi rõ, test/gates, bằng chứng UI/DB/provider tương
ứng, giới hạn và hướng dẫn chạy. Demo nên thể hiện login, hỏi/nguồn, mobile,
viewer bị chặn write, local AI cap và bảng đánh giá; không chỉ quay chat đẹp.

## 6. Nguồn kỹ thuật chính thức đã đối chiếu

- [MDN — PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable): manifest và môi trường phục vụ phù hợp cho cài đặt; hành vi tùy browser.
- [web.dev — service workers](https://web.dev/learn/pwa/service-workers): lifecycle và cache; app phải chạy được cả khi worker chưa kiểm soát.
- [MDN — SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis): browser TTS và voices.
- [MDN — SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition): limited availability; một số browser dùng recognition server.
- [MDN — WebAssembly concepts](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts): module tính toán và phối hợp JavaScript/worker.
- [Gemini — structured outputs](https://ai.google.dev/gemini-api/docs/structured-output): schema giúp ràng buộc output; semantic/citation vẫn cần kiểm.
- [Gemini — rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): quota theo project/model, kiểm active limits trước live evaluation.
- [Gemini — pricing](https://ai.google.dev/gemini-api/docs/pricing): giá/tier thay đổi; lưu revision và kiểm tại thời điểm chọn model, không hứa mọi tính năng AI miễn phí.

Các nguồn trên giải thích khả năng công nghệ, không phải bằng chứng tính năng
đã tồn tại hay đã được kiểm trên ExaMate. Roadmap đã cập nhật phạm vi local-only;
trạng thái từng lát lấy từ báo cáo thực tế, không xem kế hoạch là tính năng đã có.
