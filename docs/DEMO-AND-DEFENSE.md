# Demo, video dự phòng và chuẩn bị bảo vệ

Tài liệu này thay các checklist rời: kịch bản demo 8 phút, shot list video 3–5 phút, bài sửa nhỏ cho "live change" 10 phút
và câu hỏi Q&A cá nhân 12 phút. Rubric: mục 10 (demo 8 phút, live change 10 phút, Q&A 12 phút; vắng mặt không lý do = 0 phần cá nhân).
**Không ai viết thay phần hiểu bài của người kia**; các ô `ĐIỀN` do chính người đó trả lời.

## 1. Chọn môi trường demo — và nói đúng nó là gì

**Môi trường đang chạy:** `http://127.0.0.1:8080`, Compose project
`examate-final-live-20261023`, Supabase Auth/Storage/DB và Gemini thật.
Google của Tài đã vào Dashboard; cloud managed026. Chưa cần đợi Support.
Lượt evaluation cải tiến trước đây gặp503; đây không phải kiểm trạng thái provider
hiện tại. Kiểm kết quả có kiểm soát khi chuẩn bị quay và giữ phần không-AI sử dụng được; không bấm gửi lặp để săn ảnh đẹp.
So sánh AI chưa đủ20 lượt sau, PDF giữ DRAFT. Xem bàn giao hiện tại để tránh
nói checkpoint synthetic cũ là nghiệm thu live toàn bộ.

| Môi trường                                       | Khi nào                                                                             | Lời phải nói                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml` + `.env` thật (Supabase + Gemini) | **Dùng cho buổi bảo vệ chính thức** khi đã có credential và đã tự kiểm tra từng máy | "Đây là bản chạy trong Docker với dịch vụ thật." Chỉ nói vậy khi đúng vậy.                                                                                 |
| `compose.demo-stack.yaml` (không credential)     | Luyện tập, video dự phòng khi không có credential, kiểm tra UI/quyền/lỗi            | "Đây là stack demo: Auth, Storage và **model là giả lập**. Câu trả lời là câu trích từ PDF, không phải đầu ra Gemini." Không bao giờ gọi nó là live model. |

Dựng stack demo (Docker Desktop đang chạy; cổng 8080 và 3999 trống):

```bash
DEMO_PASSWORD_SEED=<chuỗi bạn chọn> docker compose -p examate-demo -f compose.demo-stack.yaml up -d --build
# mở http://127.0.0.1:8080 — đăng nhập manager@demo.test, member@demo.test, viewer@demo.test, outsider@demo.test
# mật khẩu mỗi tài khoản là "<chuỗi bạn chọn>-<vai trò>", ví dụ ...-manager
# dọn: docker compose -p examate-demo down   (dữ liệu nằm trong tmpfs và mất khi dừng — chủ ý)
```

Stack tự upload và index ba PDF mẫu (`apps/api/test/fixtures/demo-pdfs/`: process/thread/scheduling, database normalization,
và một PDF chứa câu "ignore all previous instructions"). Công tắc lỗi AI (chỉ stack demo):
`curl -X POST http://127.0.0.1:3999/control/scenario -d '{"scenario":"quota"}'` với `quota | unavailable | timeout | malformed | empty | slow | normal`.
Muốn thử ngoài Docker: xem `apps/api/test/demo-stack-server.mjs` (cần PG17 disposable có guard).

## 2. Present và demo 8 phút theo người phụ trách — cập nhật 24/10/2026

Đây là kịch bản bảo vệ trực tiếp 8 phút; video dự phòng vẫn chỉ 3–5 phút.
Đối chiếu Git ở `d72e1df`: 273 commit tài khoản fransico08, 5 commit Thắng.
Không dùng số commit để tính phần trăm công sức hoặc chứng minh tự viết toàn bộ.
Phân công dưới đây dựa cả nội dung commit và module hiện hành; mỗi người phải
xác nhận phần đã thực sự thực hiện và tự giải thích được trước khi nhận là của mình.
Không sửa lịch sử Git, đổi tác giả hay chia lại công lao cho cân số lượng.

### 2.1 Ai làm phần nào — câu trả lời khi thầy hỏi

| Phần                                        | Đóng góp có căn cứ của Tài                                                        | Đóng góp có căn cứ của Thắng                                                                           | Người trả lời chính                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Nền app, backend và Supabase ban đầu        | Phát triển tiếp giao diện/nghiệp vụ và tích hợp bản cuối                          | Commit `b4ce829`: backend, migrations, Storage/Documents, cấu hình, Docker, tests và nhiều thay đổi UI | Thắng giải thích nền ban đầu; Tài giải thích bản tích hợp hiện tại |
| Assistant/Gemini                            | Documents RAG, scope/citation, history, kiểm quyền và tích hợp cuối               | `d2ca5ca`: endpoint Assistant, DTO, Gemini wrapper và tests ban đầu                                    | Thắng: lời gọi model cơ bản; Tài: RAG và trust boundaries          |
| Streaming SSE                               | Tích hợp scope, receipt/history, account isolation và các thay đổi sau merge      | `2249abf`: streaming BE/FE, parser, cancel và tests                                                    | Thắng; Tài bổ sung ràng buộc RAG/history                           |
| Nhập giọng nói STT                          | Tích hợp và chỉnh deadline triển khai ở `4ec44c7`, kiểm pipeline bản cuối         | `917edc7`: Whisper local, media validation, worker, UI/tests; `b988e26`: lựa chọn ngôn ngữ             | Thắng; Tài giải thích thay đổi tích hợp sau đó                     |
| Auth/OAuth, quyền, RLS, runtime DB          | Luồng phiên/Google, principal, capability roles và tích hợp managed deployment    | Có nền Supabase từ giai đoạn đầu; không gán toàn bộ Auth hiện tại cho commit cũ                        | Tài                                                                |
| Documents/RAG, tìm kiếm và quản lý học tập  | Pipeline và tính năng tích hợp cuối, scope, phân trang, deep links                | Có đóng góp Documents/Storage/UI từ backend ban đầu                                                    | Tài; ghi nhận phần nền của Thắng                                   |
| Quiz và Flashcards                          | Generation có nguồn, preview/confirm, lưu cá nhân, practice, progress và recovery | Không suy thành đóng góp hiện thực riêng nếu chưa có bằng chứng bổ sung                                | Tài                                                                |
| Admission, telemetry, dashboard, evaluation | Thiết kế/tích hợp, tests, campaign và phân tích kết quả                           | Hiểu quan hệ với wrapper/SSE; không nhận sở hữu nếu chưa thực hiện                                     | Tài                                                                |

**Tài trả lời mẫu:** “Em phụ trách phần tích hợp sản phẩm cuối: giao diện và nghiệp
vụ học tập, Auth và phân quyền, pipeline RAG có nguồn, Study Coach, usage và evaluation.
Thắng xây phần nền backend/Supabase, tích hợp Gemini ban đầu, rồi STT và streaming.
Những module giao nhau được cả nhóm tích hợp; nhóm có dùng AI hỗ trợ và ghi trong
AI_USAGE. Phần em nhận phụ trách thì em sẽ trình bày thiết kế, code và test tương ứng.”

**Thắng trả lời mẫu:** “Phần em đóng góp được ghi trong Git gồm backend/Supabase
ban đầu, endpoint gọi Gemini, nhập giọng nói Whisper local và phản hồi streaming.
Em trình bày chính hai luồng STT và SSE. Các thay đổi Auth/RAG/history và hardening
của bản cuối được Tài tích hợp tiếp; em không nhận là tự viết toàn bộ backend hiện tại.”

Đây là lời mẫu để học và chỉnh theo sự thật, không phải xác nhận cá nhân đã ký.
Nếu hỏi vì sao ít commit: nêu đúng 5 commit và phạm vi thay đổi lớn của chúng;
chỉ giải thích cách làm việc/squash/pair programming nếu chính Thắng xác nhận có.
Không tự bịa lý do hoặc khẳng định công sức bằng nhau.

### 2.2 Lịch present và thao tác

| Thời gian | Người  | Màn hình và thao tác                                                                                     | Mục đích                                                            |
| --------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0:00–0:35 | Tài    | Slide bài toán và phạm vi                                                                                | ExaMate, A RAG + C structured output; nêu phân công                 |
| 0:35–1:15 | Thắng  | Sơ đồ kiến trúc                                                                                          | React → Nest → Auth/DB/Storage; Gemini và Whisper khác nhau         |
| 1:15–3:05 | Tài    | Đăng nhập sẵn → task/status/reload → PDF Ready → hỏi Round Robin → citation trang 3 → câu ngoài tài liệu | Persistence, RAG, kiểm chứng nguồn, refusal                         |
| 3:05–4:35 | Thắng  | General chat stream/Stop → STT: ghi ngắn, sửa và chèn transcript, chưa gửi                               | Hai module Thắng phụ trách, phân biệt stream và transcription       |
| 4:35–6:20 | Tài    | Quiz 3 câu: preview → confirm → mở → nộp → progress; flashcards đã lưu: flip/self-rating                 | Đầu ra AI được dùng trong logic ứng dụng; không chỉ JSON trong chat |
| 6:20–6:55 | Thắng  | Giải thích một nhánh lỗi/cancel đã có bằng chứng; chỉ vào Tasks không phụ thuộc AI                       | Fallback, không tự retry, giới hạn kiểm thử STT                     |
| 6:55–7:40 | Tài    | Dashboard usage + slide bảng evaluation                                                                  | Ước tính khác billing; kết quả thực và phần chưa đủ                 |
| 7:40–8:00 | Cả hai | Slide kết luận                                                                                           | Tài chốt sản phẩm; Thắng chốt phạm vi mình phụ trách                |

**Quy tắc luyện:** một người nói, người kia thao tác nếu cần; chuyển người bằng
một câu rõ ràng. Không để cả hai cùng điều khiển chuột. Mở sẵn PDF Ready, quiz/deck
đã lưu, dashboard và sơ đồ. Generation mới chỉ chạy khi ngân sách và provider cho
phép; không gửi lặp khi lỗi. Nếu dùng bản lưu trước, nói rõ đang mở bản đã lưu.
Không nhận dòng điểm cố định: đọc đúng số trên màn hình. Không mở `.env` hay tab
console chứa credential khi trình chiếu.

### 2.3 Lời nói theo từng đoạn

**Tài — mở đầu:** “ExaMate giúp sinh viên quản lý việc học và khai thác tài liệu
của workspace. Hai chức năng AI chính là hỏi đáp có nguồn và tạo nội dung ôn tập
có cấu trúc. Em phụ trách tích hợp sản phẩm, RAG và Study Coach; Thắng phụ trách
nền backend ban đầu, Gemini, giọng nói và streaming.”

**Thắng — kiến trúc:** “Frontend React gọi NestJS qua proxy. Backend kiểm phiên
và quyền trước khi truy cập PostgreSQL hoặc file PDF trong private Storage.
Gemini dùng cho embedding và generation. Riêng giọng nói dùng Whisper chạy trên
máy chủ local. Vì vậy STT không gửi audio sang Gemini, nhưng toàn ứng dụng vẫn
cần mạng cho Supabase và các chức năng AI cloud.”

**Tài — task và RAG:** “Em tạo hoặc cập nhật công việc, tải lại trang để kiểm
dữ liệu còn trong database. Với tài liệu đã Ready, câu hỏi được embedding và
truy xuất các đoạn liên quan trong đúng phạm vi được phép. Backend kiểm cấu trúc
và citation trước khi trả câu trả lời. Em mở nguồn để đối chiếu trang PDF.
Nếu không có bằng chứng phù hợp, hệ thống từ chối thay vì lấy kiến thức ngoài
tài liệu để bù. Citation hợp lệ vẫn cần người đọc kiểm nội dung.”

**Câu hỏi demo:** “Theo tài liệu, điều gì xảy ra nếu time quantum của Round Robin
quá nhỏ?” Đối chiếu trang 3 của `os-processes-demo.pdf`; không đọc trước đáp án
nếu output thực tế khác. Câu ngoài phạm vi: “Ai đã vẽ bức Mona Lisa?”

**Thắng — SSE:** “Chế độ general trả nội dung dần bằng SSE, một chiều từ server
về browser. Nút Dừng hủy request và bỏ kết quả muộn. Documents khác general:
chỉ hiện trạng thái xử lý, rồi công bố answer sau khi kiểm citation và quyền;
không stream sớm một câu trả lời chưa được kiểm.”

**Thắng — STT:** “Em dùng Whisper small ONNX local. Người dùng chọn ngôn ngữ,
ghi âm, dừng, xem và sửa transcript rồi chèn vào câu hỏi. Chèn không tự gửi AI.
Backend kiểm media và chuyển về mono 16 kHz trước inference. Có timeout và giới
hạn tài nguyên. Nhóm đã kiểm pipeline bằng mẫu audio; độ chính xác micro, tiếng
Việt thực tế và máy còn lại phải báo theo đúng những gì đã tự thử.”

Nếu chưa thử micro ổn định, trình bày trạng thái model và luồng kỹ thuật; không
đọc bản chép gõ tay rồi nói là vừa nhận dạng thành công.

**Tài — Study Coach:** “AI tạo bản nháp theo schema và evidence của tài liệu.
Backend kiểm lại câu hỏi, lựa chọn và nguồn. Preview chưa phải bộ đã lưu:
người dùng xác nhận riêng. Khi làm quiz, server chấm từ snapshot đã lưu, không
tin điểm client và không gọi AI lại. Flashcards dùng lật thẻ và tự đánh giá;
đó không phải điểm AI hay chứng nhận đã thành thạo. Lượt nộp có key idempotent
để không nhân đôi khi response bị mất.”

**Thắng — lỗi:** “Khi request thất bại, UI có thông báo và hành động phù hợp;
không tự gửi lại AI. Với kết quả ghi chưa rõ, cần đối chiếu thay vì tạo lượt mới.
Các màn hình không phụ thuộc provider như Tasks vẫn dùng được. Dừng ở client
không bảo đảm upstream chưa tính phí cho request đã nhận.”

Không cố tạo lỗi bằng key sai hoặc làm cạn quota. Chỉ nói “đang xảy ra” nếu
vừa quan sát thật; nếu dùng ảnh/log cũ thì ghi là bằng chứng kiểm trước đó.

**Tài — đo lường:** “Dashboard tách logical operation với provider calls, token
đã biết và chi phí ước tính; thiếu metadata không được xem là miễn phí. Baseline
RAG đã chạy 20 case: 15 PASS nghiêm ngặt, 3 FAIL và 2 injection INCONCLUSIVE.
Lượt cấu hình cải tiến mới chạy 3 case, gồm 1 PASS và 2 lỗi provider; 17 case
chưa chạy. Do đó nhóm chưa kết luận cải thiện chất lượng trước/sau hoàn chỉnh.”

**Kết:** Tài: “ExaMate đã kết nối quản lý học tập với hỏi đáp kiểm được nguồn và
luyện tập từ đầu ra có cấu trúc.” Thắng: “Phần em tập trung là backend ban đầu,
streaming và nhập giọng nói. Nhóm sẵn sàng giải thích luồng, test và những giới
hạn còn lại.” Không nói thay giảng viên rằng đã đạt rubric.

## 3. Video dự phòng 3–5 phút — **chưa ghi** (cần người quay, máy có công cụ ghi)

Công cụ ghi video không có trong phiên này nên video **chưa tồn tại**. Quay từ bản chạy Docker; nếu quay từ stack demo, chèn chữ "STACK DEMO — model giả lập"
ở đầu và cuối, và không đặt tên video là "live".

| Cảnh                                             | Thời lượng | Lời dẫn (rút gọn)                                                                            |
| ------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------- |
| 1 Tiêu đề + bài toán                             | 0:20       | "ExaMate giúp nhóm sinh viên hỏi đáp trên chính tài liệu của mình và kiểm chứng được nguồn." |
| 2 Đăng nhập, dashboard, tạo task                 | 0:30       | quyền theo vai trò, dữ liệu bền                                                              |
| 3 Upload + index PDF                             | 0:35       | "Độ phủ 3/3 trang", Stored → Ready                                                           |
| 4 Hỏi + citation mở đúng trang                   | 0:50       | `[S1]` ↔ trang 3                                                                             |
| 5 Câu ngoài tài liệu                             | 0:20       | từ chối, không bịa                                                                           |
| 6 Study Coach: preview → lưu → làm bài → tiến độ | 1:00       | JSON validate, chấm ở server                                                                 |
| 7 Lỗi AI + dashboard                             | 0:40       | thông báo rõ; token/chi phí ước tính                                                         |
| 8 Kết: giới hạn và đóng góp                      | 0:25       | những gì chưa kiểm                                                                           |

Dữ liệu cần chuẩn bị: ba PDF mẫu; tài khoản manager và viewer; scenario `quota`; cửa sổ 1440 px; tắt thông báo hệ thống; không quay `.env`, Dashboard khóa, cookie.

## 4. Live change 10 phút — ba bài sửa nhỏ đã thử (không áp dụng vào repo)

Mỗi bài dưới đây đã được thử trong phiên 23/10/2026 rồi hoàn lại (working tree sạch); kết quả test ghi theo lần thử thật.

| #   | Yêu cầu giả định của giảng viên                                               | Sửa gì                                                                                                                                                   | Test chạy và điều xảy ra                                                                                                                                                                                                                     | Giải thích khi sửa                                                                                                                           |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Đổi một quy tắc prompt" (ví dụ: luôn trả lời bằng ngôn ngữ của câu hỏi)      | Thêm một câu vào `DOCUMENTS_SYSTEM_INSTRUCTION` trong `apps/api/src/assistant/prompt-registry.ts`; bump version (`PROMPT_VERSIONS`/`RAG_PROMPT_VERSION`) | `npx vitest run src/assistant/prompt-registry.spec.ts src/assistant/assistant.service.spec.ts` → **2 test đỏ** (golden payload) — đúng ý: prompt đổi phải cập nhật golden có chủ đích                                                        | Prompt có version để đo trước/sau; golden test ngăn đổi prompt vô tình; version mới làm telemetry/evaluation phân biệt được                  |
| 2   | "Đổi chunk size"                                                              | `TARGET_CHUNK_CHARACTERS` (1.200) trong `apps/api/src/documents/document-chunker.ts`                                                                     | `npx vitest run src/documents/document-chunker.spec.ts` → **vẫn xanh (8/8)**: test không ghim hằng số → phải **thêm** regression khẳng định mọi chunk ≤ `MAX_CHUNK_CHARACTERS` và số chunk đổi như mong đợi; tài liệu đã index phải re-index | Chunk nhỏ → truy xuất chính xác hơn nhưng nhiều vector và ngữ cảnh rời rạc; chunk lớn ngược lại; đổi chunk cần re-index và đo lại evaluation |
| 3   | "Thêm một ràng buộc vào structured output" (ví dụ: giải thích tối đa N ký tự) | `text(item.explanation, 1200)` và `maxLength` trong schema ở `apps/api/src/study-coach/study-quiz-validation.ts`                                         | `npx vitest run src/study-coach/study-quiz-validation.spec.ts` → xanh (9/9); thêm test "từ chối explanation dài hơn N" (RED trước, GREEN sau)                                                                                                | Schema gửi cho model và validator phải cùng ràng buộc; không tin JSON mode của provider; sai thì 422 và không lưu                            |

Quy trình khi bảo vệ: (1) đọc yêu cầu và nói lại; (2) tìm file bằng traceability (story → file); (3) viết test đỏ trước; (4) sửa tối thiểu; (5) chạy test liên quan;
(6) nói rõ tác động (version, re-index, evaluation). Được dùng công cụ AI nhưng phải giải thích từng bước.

## 5. Bộ vấn đáp theo phần thực hiện

### 5.1 Tài — RAG, tích hợp ứng dụng, bảo mật và Study Coach

Trả lời theo thứ tự **mục đích → đường đi dữ liệu → một chỗ trong code → một
trade-off hoặc test**, khoảng 30–60 giây mỗi câu. Không cần đọc tên tất cả file.

| Câu hỏi                                       | Ý trả lời cần nắm                                                                                                                                                                                                                   | Nơi mở code / bằng chứng                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Một câu hỏi PDF đi qua những bước nào?     | Session/principal → scope → admission → embedding → retrieval scoped → prompt/evidence → generation → validator/quyền → UI/citation. Không giữ transaction khi chờ provider.                                                        | `apps/api/src/assistant/assistant.service.ts`, `rag-retrieval.service.ts`             |
| 2. Tại sao RAG không phải huấn luyện model?   | Model không được fine-tune trong luồng này. PDF được lập chỉ mục, truy xuất rồi đưa evidence vào context tại lúc hỏi.                                                                                                               | `apps/api/src/documents/document-ingestion.service.ts`                                |
| 3. Chunk bao nhiêu? Vì sao overlap?           | Target 1200, max 1800, overlap 200 ký tự, page-bounded. Overlap giữ ngữ cảnh nhưng tăng vector/token; thay chunk cần re-index và đo chất lượng.                                                                                     | `apps/api/src/documents/document-chunker.ts`                                          |
| 4. Embedding và generation khác nhau?         | Embedding biểu diễn vector 768 chiều để so sánh; generation tạo câu trả lời. Đổi embedding model có thể phải re-embed; đổi generation cần đánh giá prompt/quality/cost.                                                             | `apps/api/src/assistant/gemini.service.ts`, `rag-retrieval.service.ts`                |
| 5. Tại sao top K 6, threshold 0.55?           | Cấu hình baseline giới hạn context và độ liên quan; không phải bảo đảm tối ưu. Thử 0.50 chưa có đủ kết quả cải tiến để nhận tốt hơn.                                                                                                | `docs/REPORT.md` VI, XI–XII                                                           |
| 6. Citation hợp lệ có chứng minh answer đúng? | Chỉ chứng minh ID/page thuộc evidence và marker hợp lệ. Claim vẫn có thể sai hoặc thiếu; cần đối chiếu nguồn và semantic evaluation.                                                                                                | `apps/api/src/assistant/source-markers.ts`, `assistant.service.ts`                    |
| 7. Không có evidence có gọi AI không?         | Query embedding có thể đã chạy. Không có đoạn đạt yêu cầu thì không gọi answer generation, trả refusal an toàn.                                                                                                                     | `rag-retrieval.service.ts`, `assistant.service.ts`                                    |
| 8. Ngăn đọc dữ liệu tenant khác ở đâu?        | Principal được xác minh server-side; membership hiện hành; scope SQL trước rank/count/page và RLS với runtime non-owner. Không tin workspace/role do client tự khai.                                                                | `apps/api/src/auth/auth.guard.ts`, `apps/api/src/database/database.service.ts`        |
| 9. Vì sao giấu JWT khỏi browser?              | Browser giữ opaque HttpOnly session cookie; backend xử lý token. HttpOnly giảm khả năng đọc token qua JS nhưng không thay CSRF/Origin hay chống mọi XSS.                                                                            | `apps/api/src/auth/auth.service.ts`, `auth-store.ts`                                  |
| 10. Viewer chỉ khóa nút đã đủ chưa?           | Chưa. Backend phải chặn write, DB RLS là lớp tiếp theo. Manager cũng không mặc nhiên đọc quiz/hội thoại cá nhân người khác.                                                                                                         | `docs/FINAL-REQUIREMENTS.md`, runtime/ownership DB tests                              |
| 11. Vì sao Study Coach là capability C?       | Structured output được strict-validate rồi dùng cho preview/persistence/practice. Không phải chỉ in JSON. Unknown fields, sai số câu, nguồn giả bị từ chối.                                                                         | `apps/api/src/study-coach/study-quiz-validation.ts`, `study-flashcards-validation.ts` |
| 12. Ai chấm quiz và flashcards?               | Quiz chấm trên server từ snapshot bất biến; không nhận score client. Flashcards là tự đánh giá remembered/needs_review, không phải AI chấm.                                                                                         | `study-coach.service.ts`, `study-flashcards.service.ts`                               |
| 13. Mất response sau COMMIT thì sao?          | Có thể đã ghi. Giữ key/payload và recovery context. Confirm unknown đối chiếu GET trước write tiếp; attempt/review dùng lại key, server so digest. Không gọi lại AI để cứu lỗi lưu.                                                 | Study Coach services và panels; lifecycle/idempotency tests                           |
| 14. Telemetry có thể dùng làm quota không?    | Không: best-effort, có thể thiếu. Admission ledger bền vững kiểm quyền dispatch/cap trước gọi; dashboard chỉ báo những gì quan sát được.                                                                                            | `ai-usage.service.ts`, `ai-admission.service.ts`                                      |
| 15. 1 operation có 3 calls tính thế nào?      | 1 logical operation, 3 provider calls. Zero khác missing; tiền cộng decimal theo currency/version, không trộn ngoại tệ hoặc coi unknown là 0.                                                                                       | `ai-usage.service.ts`, dashboard contracts                                            |
| 16. Kết quả evaluation và nhược điểm?         | Nêu đủ mẫu số 20: 15 strict PASS, 3 FAIL, 2 INCONCLUSIVE. Semantic-content 18/20 là thước đo khác, không thay strict PASS. Improved 1 PASS/2 provider errors/17 chưa chạy, chưa đủ so sánh.                                         | `docs/evaluation-live-results-20261023.json`, report XII                              |
| 17. Một lỗi AI/code thật đã sửa?              | Ví dụ evaluator từng PASS khi thiếu output vì chỉ kiểm field nếu có. Regression bỏ output nhưng giữ status/calls/evidence làm RED; bắt buộc contract theo scenario làm GREEN. Nêu thêm bug attempt unknown bị đổi key nếu thầy hỏi. | `AI_USAGE.md`, `apps/api/scripts/rag-evaluation-local.mjs`                            |

Tên file không có prefix ở các hàng RAG nằm trong `apps/api/src/assistant/`;
Study Coach nằm trong `apps/api/src/study-coach/`. Mở file và tự chỉ đúng hàm
trước ngày bảo vệ; một bảng đường dẫn không chứng minh đã hiểu implementation.

### 5.2 Thắng — backend ban đầu, Gemini, SSE và STT

| Câu hỏi                                                   | Ý trả lời cần nắm                                                                                                                                                                   | Nơi mở code / bằng chứng                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Em đã làm gì, có gì chứng minh?                        | Nêu 5 commit và phần tương ứng: nền backend/Supabase, Gemini, Whisper local, chọn ngôn ngữ, SSE. Phân biệt code ban đầu với hardening/tích hợp sau đó.                              | `b4ce829`, `d2ca5ca`, `917edc7`, `b988e26`, `2249abf`                                          |
| 2. Vì sao cần Nest khi đã có Supabase?                    | Backend giữ API key, xác minh phiên/quyền, validation, orchestration AI và error contracts. Supabase cung cấp Auth/DB/Storage, không thay mọi logic ứng dụng.                       | `apps/api/src/app.module.ts`, `assistant/gemini.service.ts`                                    |
| 3. SSE khác WebSocket?                                    | SSE là luồng server→client trên HTTP; WebSocket hai chiều. Chat hiện gửi POST một lần rồi đọc response stream; không cần WebSocket cho token streaming.                             | `apps/api/src/assistant/assistant.controller.ts`                                               |
| 4. Sao không dùng EventSource?                            | Luồng hiện tại cần POST body và CSRF header; client dùng fetch + ReadableStream, tự parse SSE. Không phải cứ SSE là phải dùng EventSource.                                          | `apps/web/src/assistant-stream.ts`, `api.ts`                                                   |
| 5. Token/frame bị cắt giữa chừng xử lý sao?               | Một network chunk không bằng một SSE event. Dùng TextDecoder streaming và buffer tới delimiter; chịu UTF-8 nhiều byte, CRLF và giới hạn frame.                                      | `assistant-stream.ts`, `assistant-stream.test.ts`                                              |
| 6. Documents có stream token không?                       | Không công bố answer sớm: stream status rồi final answer đã kiểm schema/citation/quyền. General mới phát text delta; workspace trả SQL không dùng LLM.                              | `assistant.controller.ts`, `structured-answer-stream.ts`                                       |
| 7. Stop và chuyển hội thoại có tác dụng gì?               | Abort request/provider work theo signal; listener cleanup. Epoch/key guard bỏ response cũ. Không cam kết hoàn tiền call đã dispatch.                                                | `apps/web/src/use-assistant.ts`, controller stream tests                                       |
| 8. Vì sao nginx làm stream thành một cục?                 | Proxy buffering có thể gom output. Cấu hình SSE không buffering và header phù hợp; vẫn cần client parser và backpressure.                                                           | `infra/nginx/default.conf`, `assistant.controller.ts`                                          |
| 9. Backpressure là gì?                                    | Client chậm, response.write có thể trả false. Chờ drain có deadline, hủy khi disconnect/timeout; không tiếp tục tích lũy dữ liệu không giới hạn.                                    | `assistant.controller.ts`                                                                      |
| 10. Từ micro đến chữ đi thế nào?                          | MediaRecorder → audio upload → session/Origin/CSRF và giới hạn → ffprobe/FFmpeg kiểm/chuyển → mono 16 kHz → local Whisper → transcript → người dùng sửa/chèn.                       | `use-speech-input.ts`, `speech.controller.ts`, `audio-inspector.ts`, `local-speech-runtime.ts` |
| 11. Vì sao Whisper local, có tự train không?              | Dùng model pretrained, không train/fine-tune. Local tránh gửi audio tới provider speech ngoài nhưng tốn CPU/RAM, phải chuẩn bị weights và timeout. Không có TTS.                    | `apps/api/src/speech/local-inference-worker.ts`, `local-speech-assets.ts`                      |
| 12. ONNX và q8 là gì?                                     | ONNX là định dạng/runtime model; q8 là lượng tử hóa trọng số 8-bit, giảm tài nguyên nhưng có trade-off chất lượng/hiệu năng. Không phải model do nhóm tự huấn luyện.                | worker, `docs/STT-SETUP-VI.md`                                                                 |
| 13. Chọn Việt/Anh khác tự động thế nào?                   | auto không ép language; vi/en map vào allowlist Whisper. Task là transcribe, không translate; server kiểm language, không tin body tùy ý.                                           | `local-inference-options.ts`, `speech.service.ts`                                              |
| 14. Audio dài hơn 30 giây bị cắt không?                   | Cấu hình chunk_length_s 30, stride_length_s 5 để bao phủ audio dài trong giới hạn 60 giây. Đã có regression/mẫu câu ở cuối; không khẳng định không bao giờ bỏ từ.                   | `local-inference-options.ts`, tests và STT readiness                                           |
| 15. Timeout ba tầng bao nhiêu, vì sao?                    | Inference 120s, backend request 150s, frontend/nginx 180s. Tầng ngoài chờ thêm upload/xử lý/trả lỗi. Thay đổi deadline bản cuối là tích hợp sau commit STT gốc.                     | `speech-config.ts`, `speech.controller.ts`, `api.ts`, nginx                                    |
| 16. Model timeout thì làm gì?                             | Không chỉ trả Promise race và để CPU chạy tiếp: abort/terminate worker, chờ nhả tài nguyên, cleanup rồi mới nhận việc phù hợp. Media subprocess cũng có kill deadline.              | `local-speech-runtime.ts`, `audio-inspector.spec.ts`                                           |
| 17. STT có nghĩa offline hoàn toàn và riêng tư tuyệt đối? | Không. Whisper chạy trên API host; browser gửi audio cho host. Audio tạm được dọn. Nếu transcript được gửi hỏi Gemini thì text đi theo chat contract; Supabase/Gemini vẫn cần mạng. | speech service + luồng Assistant                                                               |
| 18. Độ chính xác tiếng Việt bao nhiêu?                    | Chưa có benchmark micro/tiếng Việt đủ mẫu nên không nêu %. Mẫu English synthetic chỉ xác minh pipeline/tail coverage và latency trong môi trường đo đó.                             | `docs/STT-READINESS-20261023.md`                                                               |
| 19. Chỉ một request sai làm hỏng cả app?                  | Error envelope, giới hạn media, concurrency, timeout và cancel bảo vệ luồng. Non-AI không phụ thuộc provider, nhưng không tuyên bố CPU overload không thể ảnh hưởng hệ thống.       | `speech-limiter.ts`, `speech.spec.ts`, `speech-input.test.tsx`                                 |

Tên file speech không có prefix nằm trong `apps/api/src/speech/`, file FE ở
`apps/web/src/`. Phần Thắng cần thực hành: kể lại luồng không nhìn bảng, mở một
test và giải thích vì sao nó bắt được lỗi, tự đổi một tham số trong nhánh luyện
tập nếu giảng viên yêu cầu. Không cần thuộc toàn bộ RLS/ledger để nhận là đã làm.

### 5.3 Hai người đều phải trả lời được

1. **A và C thể hiện ở đâu?** A: truy xuất PDF có scope và citation. C: model
   output có schema, validate rồi dùng để lưu và luyện tập. Không nhận capability
   B có ba LLM-called tools; nút UI hay REST endpoint không phải tool của LLM.
2. **Có dùng AI viết code không?** Có, công khai trong AI_USAGE. Giải thích đúng
   phần mình nhận, cách review/test, hai lỗi do AI viết sai đã được bắt. Không nói
   tự viết tất cả hoặc đổ toàn bộ trách nhiệm cho AI.
3. **Một luồng của bạn cùng nhóm?** Tài giải thích micro → Whisper → sửa/chèn;
   Thắng giải thích query → scoped retrieval → answer + citation. Học được để
   phối hợp, không biến thành tuyên bố sở hữu phần code kia.
4. **Điều gì chưa hoàn tất?** Evaluation cải tiến chưa đủ cohort; semantic review
   Study Coach và kiểm micro/device theo đúng bằng chứng. Không nói Google/cloud
   chưa làm nếu đang trình bày managed026 và Google đã kiểm, cũng không suy mọi
   luồng đã được nghiệm thu từ health check.

### 5.4 Nếu thầy yêu cầu sửa trực tiếp

- **Tài:** thêm giới hạn explanation hoặc một case từ chối nguồn giả trong
  validator Study Coach; test trước, sửa schema và validator nhất quán. Nếu đổi
  prompt phải bump version, không sửa gold để ép PASS.
- **Thắng:** giải thích và sửa một điều kiện ngôn ngữ STT hoặc thêm regression
  parser SSE cho frame/UTF-8 bị chia; giữ API/validator/UI nhất quán. Không đổi
  timeout một tầng rồi bỏ quên nginx hoặc giải phóng worker khi nó còn chạy.
- Dùng branch/file luyện tập riêng nếu thực hành; không tự sửa bản demo đang chạy
  hay production config chỉ để tạo tình huống. Đây là đề luyện, chưa phải lần
  test đã thực thi trong bản cập nhật tài liệu này.

## Checkpoint lịch sử trước managed026 — không phải trạng thái runtime hiện tại

Kịch bản 8 phút và shot list 3–5 phút ở trên sẵn dùng. **Chưa ghi video từ dịch vụ thật**: cloud mới ở016, chưa có LOGIN runtime hợp lệ; không quay synthetic rồi gọi đó là bản dùng Auth/Storage/Gemini thật. Công cụ mở Chrome tương tác đã bị policy từ chối; không dùng profile cá nhân hay đường vòng. Browser headless local riêng vẫn có thể dùng cho kiểm thử synthetic khi stack sẵn, không mở khóa console Google của người dùng.

Trước khi quay chính thức: operator hoàn tất supported rollout017–025, preflight hai LOGIN, khởi động compose thật với CA; đăng nhập bằng file demo-logins.private.json hiện hành (không chụp màn hình mật khẩu), mở bộ dữ liệu sẵn có, chạy lại các bước A/C và kiểm persistence. Chỉ bấm generation theo campaign còn ngân sách. Nếu không có recorder, nhóm có thể dùng công cụ quay trên máy mình theo shot list; không đánh dấu video đã làm.

Phần cá nhân duy nhất còn cần nhóm: xác nhận đóng góp thật/hiểu bài, đăng nhập/2FA/consent Google, thử micro/STT trên máy thực, luyện và tham gia bảo vệ. Agent chịu trách nhiệm kỹ thuật còn lại khi quyền operator/target được mở khóa. Không dùng lỗi AI có chủ động bật trong synthetic stack làm bằng chứng outage thật.
