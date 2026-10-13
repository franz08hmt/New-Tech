# ExaMate — lộ trình pilot nhỏ và điểm nhấn New Technologies

Ngày 13/10/2026. Đây là **đề xuất**, không phải lệnh triển khai tự động.
Nguồn hiện trạng: [review FE/BE](../docs/PROJECT-REVIEW-2026-10-13.md).
Cập nhật B0a/B0b: [báo cáo Đợt 1](../docs/PHASE-1-SESSION-ACCESS-REPORT.md)
ghi nhận sửa session race và gate 320–1440px; login Supabase thật còn chờ provision.
Tài xác nhận: pilot cho nhóm và vài người được mời; thầy không bắt buộc một
công nghệ cụ thể. Hạn final chưa được cung cấp; không ước lượng lịch nộp.

## 1. Sản phẩm final nên chứng minh điều gì?

Một sinh viên đăng nhập, chọn môn/tài liệu, hỏi và hỏi tiếp có ngữ cảnh, kiểm
tra nguồn, luyện tập từ tài liệu; dùng cùng luồng trên điện thoại. Nhóm có
thể giải thích pipeline LLM/RAG, cách bảo vệ dữ liệu và đo chất lượng/chi phí.

Gói final khuyến nghị sau khi sửa nền:

1. Hội thoại có ngữ cảnh, RAG có bằng chứng đánh giá.
2. Một luồng luyện tập có nguồn: tạo bộ câu hỏi ngắn hoặc flashcards.
3. PWA dùng được trên điện thoại, có hành vi mất mạng rõ ràng.
4. TTS để nghe câu trả lời; STT là bước tiếp theo nếu còn thời gian.

Multi-model và WASM là hướng mở rộng sau khi có baseline để so sánh.
Native mobile chưa cần cho pilot này; chỉ cân nhắc khi có nhu cầu thiết bị
mà web/PWA không đáp ứng. Không chọn công nghệ chỉ để tăng số nhãn trong demo.

## 2. Quy tắc cho mọi đợt triển khai

- Từng lát có spec/acceptance, test hành vi, runtime verification, báo cáo và
  commit riêng trên nhánh phát triển đã xác minh; không tự push/merge.
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
- Không sửa migration đã có. Migration kế tiếp hiện là 014, nhưng kiểm lại
  Git/runner/history trước đặt số. Không tự áp vào Supabase dùng chung.
- Không thêm dependency npm trong đợt ổn định. PoC WASM/native/provider mới
  phải nêu package/license/chi phí/phạm vi trước khi được chọn để triển khai.
- Cuối mỗi lát: typecheck/test/build/format; số pass/skipped thật; browser thật
  cho luồng có UI; DB integration cho SQL/permissions. Test mock ghi là mock.
  Test viết trước phải thấy fail đúng lý do; test xanh ngay đầu ghi là regression.
- Dừng sau mỗi đợt và bàn giao. Một đợt hoàn tất có thể nghiệm thu độc lập;
  chưa đạt tiêu chí thì xử lý đợt đó trước mở rộng tiếp.

## 3. Giai đoạn nền — phải hoàn tất trước pilot ngoài nhóm

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
Kiểm origin 5173 local và origin Docker/HTTPS thật; giải quyết IP
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
phương án đã được quản lý lựa chọn và chứng minh revoke/expiry trên deployed Auth.

**Xong khi:** login/reload/refresh/logout/revoke/đổi account/đa tab hoạt động;
no-membership/outage fail closed, draft cùng user giữ đúng, user khác không
thấy notes/chat/draft. Có bằng chứng browser và Supabase thật. **Lát nghiệm thu riêng.**

### B2. Hoàn tất quyền và phạm vi dữ liệu — tiếp tục Chặng 2 pilot

**Giá trị:** thành viên đọc/ghi đúng quyền, không lấy nguồn ngoài workspace.

Chốt role matrix hiện có: viewer read-only; member tạo/sửa theo quyền đã duyệt;
manager thực hiện thao tác quản lý/xóa. Không cần public CRUD membership/admin UI.

Tách thành các lát:

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

### B3. Hạn mức AI và quan sát chi phí — tiếp tục Chặng 3 pilot

**Giá trị:** quota/chi phí có giới hạn ngay cả khi nhiều người gọi cùng lúc.

Thêm module riêng và migration riêng cho reservation/usage per user/workspace.
Đếm mọi provider dispatch: chat, query embedding, indexing batches, OCR từng
trang, các nhóm summary và synthesis. Cap concurrency, token/context, pages,
batches và operation duration. User bị từ chối vẫn xem được dữ liệu/answer cũ.

Thu usage metadata khi provider có trả; khi timeout/unknown commit giữ trạng
thái conservative. Phân biệt local limit và AI_QUOTA upstream; estimate theo
price revision/model, không gọi là hóa đơn chính thức. Mức ngân sách được
Tài/Thắng chọn trước chạy live; quota Google phải kiểm ở project/AI Studio.

**Xong khi:** concurrent requests/restart không vượt reservation; reject không
gọi provider; summary/index không vượt cap thông qua fan-out; có view usage
nhỏ và lỗi tiếng Việt rõ ràng; không log key/token/prompt/PDF. **3 lát M.**

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
giải thích. Android/iOS/375px/desktop, keyboard, download/source và console
có bằng chứng riêng. Không dùng 562 test để thay các kiểm tra này. **Nhiều lát M.**

## 4. Các nâng cấp New Technologies sau nền

### N1. Hội thoại AI nhiều lượt, có ngữ cảnh và nguồn

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
upload/chọn môn, Back/deep links trên Android và iOS; sửa đúng lỗi đo được,
giữ palette/font và layout hiện tại.

**Lát 2 — install:** manifest/name/icons/scope/start_url/standalone, HTTPS,
install guidance theo capability, không ép prompt. Browser không hỗ trợ vẫn
dùng web thường. Không viết lại bằng React Native để có icon trên home screen.

**Lát 3 — lifecycle/offline:** service worker cache **app shell/public assets**
với version/update flow. API/Auth/chat/feedback/signed URLs/PDF private dùng
network; không cache response có quyền thành cache dùng chung. Không tự queue
POST/chat/upload khi offline; báo rõ chưa gửi. Không force reload làm mất draft.
Offline giai đoạn đầu là mở shell và thông báo mất mạng; dữ liệu workspace
offline cần thiết kế quyền/caching/retention riêng nếu sau này chọn làm.

**Xong khi:** cài/mở/reopen/update thật; airplane mode có UI đúng; logout/account
swap không thấy dữ liệu account trước qua cache/Back; HTTPS/deep link ổn.
Chrome Android và Safari iOS được kiểm riêng; không gọi mô phỏng 375px là test
điện thoại thật. **3 lát M; nên chọn làm điểm nhấn final.**

### N4a. TTS — đọc câu trả lời

**Giá trị:** học khi không tiện đọc, hỗ trợ tiếp cận; scope đầu tiên nhỏ.

Dùng adapter browser SpeechSynthesis sau feature detect: chọn voice/ngôn ngữ,
Read aloud/Pause/Resume/Stop; không tự phát. Đọc plain text đã render/verify,
chuyển citation thành nhãn dễ nghe, không đọc markup/URL/token. Chỉ một answer
đọc tại một thời điểm; cancel khi logout/đổi account; giữ trạng thái khi panel
expand nếu phù hợp. voices tải trễ và thiếu voice tiếng Việt phải có fallback
thật, không hứa giọng Việt trên mọi thiết bị.

**Xong khi:** câu dài, voice load muộn, unsupported, pause/stop, bàn phím và
screen reader cùng tồn tại; kiểm Android/iOS/desktop thật. Nếu chuyển cloud TTS,
tạo phase riêng cho provider/budget/privacy, không thêm ngầm. **Cỡ M.**

### N4b. STT — nói để nhập câu hỏi

**Giá trị:** hỏi tài liệu nhanh trên điện thoại; text input vẫn là fallback.

Browser SpeechRecognition là lựa chọn thử capability đầu tiên, không coi là
hỗ trợ đa browser chắc chắn. Mic bắt đầu từ thao tác người dùng, thông báo
audio có thể được browser gửi tới dịch vụ nhận dạng. Hiển thị listening,
interim/final transcript; cho sửa và bấm Send riêng, không tự gửi transcript.
Stop/cancel khi đóng/đổi account; xử lý deny/no-speech/network/unavailable.

Nếu cần STT cross-browser ổn định, làm lát server riêng: bounded duration/
size/type audio, same-origin Auth/CSRF, provider allowlist và usage cap. Mặc
định không lưu audio; quyết định provider/quyền riêng tư trước triển khai.

**Xong khi:** 10 câu Việt đã định nghĩa được đánh giá nhận dạng tên môn/từ
chuyên ngành; microphone denied vẫn gõ được; không gửi câu hỏi ngoài ý muốn;
giải thích rõ browser/provider support. **M browser, L nếu server; sau TTS.**

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
B0 ổn định -> B1 Auth thật -> B2 quyền/scope -> B3 AI cap -> B4 nghiệm thu
                                                           |
                                                           v
                                               N1 hội thoại có ngữ cảnh
                                                           |
                                                           v
                                                 N2 luyện tập có nguồn
                                                           |
                                                           v
                                                N3 PWA -> N4a TTS -> N4b STT

N5 multi-model và N6 WASM: nghiên cứu sau baseline, chỉ chọn khi đủ nguồn lực.
```

Nếu phải thu gọn final, ưu tiên B0–B4, N1 và N3; thêm một lát N2/N4a đã nghiệm
thu. Không dồn toàn bộ roadmap vào một prompt implementation. Có thể tạo một
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
đã tồn tại hay đã được kiểm trên ExaMate. Roadmap chưa triển khai/commit/push.
