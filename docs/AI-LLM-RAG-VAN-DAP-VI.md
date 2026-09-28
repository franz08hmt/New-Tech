# ExaMate AI — script vấn đáp LLM, embedding và RAG

> Bản ôn tập cho Tài và Thắng, đối chiếu **source local ngày 28/09/2026** trên `feature/tai-rag-integration`. Một số thay đổi RAG/metadata trên máy Tài **chưa commit/push**; trước khi present phải so lại với revision thật sẽ nộp. File này giải thích code và cách kiểm chứng, không thay thế kết quả chạy demo. Không mở `.env` hoặc API key khi chia sẻ màn hình.

## Mở đầu 40–60 giây

> “ExaMate là workspace học tập có hai chế độ AI. Chat thường dùng Gemini để trả lời kiến thức chung nhưng không nhận là đã đọc dữ liệu riêng. Chế độ hỏi tài liệu dùng RAG: PDF được trích văn bản, chia đoạn, biến thành vector và lưu trong PostgreSQL/pgvector. Khi em hỏi, hệ thống tìm các đoạn liên quan, đưa chúng vào lời nhắc cho Gemini, rồi kiểm tra mã nguồn trích dẫn trước khi hiện câu trả lời. Nhóm **không huấn luyện lại Gemini**; dữ liệu của nhóm nằm trong Storage/DB, không nằm trong trọng số model. Nếu không có bằng chứng phù hợp, ứng dụng phải nói không đủ bằng chứng.”

**Sơ đồ nói miệng:** Upload PDF → private Storage → trích văn bản / OCR tùy chọn → lọc trang yếu → chunk → embedding → `document_chunks` trong PostgreSQL → câu hỏi được embedding → tìm vector gần → Gemini sinh câu trả lời dựa trên đoạn tìm được → backend kiểm tra citation → giao diện hiển thị.

Hai thao tác không phải RAG: `general` gọi LLM không truy xuất PDF; `course_info` đọc quan hệ môn học từ database, không suy đoán từ nội dung PDF. Mở `apps/api/src/assistant/assistant.service.ts:90–107` để chỉ ba đường xử lý.

**Mở source nhanh:** [nơi gọi LLM](../apps/api/src/assistant/gemini.service.ts) · [nơi gọi embedding](../apps/api/src/assistant/gemini-embedding.service.ts) · [pipeline lập chỉ mục](../apps/api/src/documents/document-ingestion.service.ts) · [truy xuất vector](../apps/api/src/assistant/rag-retrieval.service.ts) · [điều phối và kiểm citation](../apps/api/src/assistant/assistant.service.ts) · [UI Assistant](../apps/web/src/AssistantPanel.tsx) · [schema vector](../infra/postgres/migrations/008_rag_foundation.sql).

## 1. “Đoạn code nào dùng LLM, đoạn nào trích xuất?”

**Trả lời 30 giây:**

> “Lệnh gọi model sinh văn bản tập trung ở `GeminiService.generate()` — nó dùng SDK `@google/genai`, gọi `models.generateContent`. `AssistantService` quyết định khi nào cần gọi: chat thường, hỏi tài liệu hoặc tóm tắt. Trích chữ gốc từ PDF lại là `PdfTextExtractorService`, không phải LLM. Chỉ khi bật OCR, trang thiếu chữ mới được render thành ảnh và gửi model đọc lại. Embedding là lệnh gọi khác, `models.embedContent`, không sinh câu trả lời.”

**Mở code:** `apps/api/src/assistant/gemini.service.ts:38–73`; `apps/api/src/assistant/assistant.service.ts:119–210`; `apps/api/src/documents/document-ingestion.service.ts:62–71`; `apps/api/src/documents/document-ocr.service.ts:32–45,126–150`; `apps/api/src/assistant/gemini-embedding.service.ts:116–135`.

**Nếu thầy hỏi sâu:** OCR đang mặc định **tắt** (`DOCUMENT_OCR_ENABLED=false`); không được nói mọi PDF đều qua AI OCR. Frontend không giữ Gemini key; key được đọc ở backend từ `GEMINI_API_KEY`. Xem `.env.example` và `apps/api/src/config/config.ts:19–59`.

## 2. “Embedding dùng model nào? LLM dùng model nào?”

**Trả lời 25 giây:**

> “Theo cấu hình mặc định trong source, model sinh câu trả lời là `gemini-2.5-flash`, còn model embedding là `gemini-embedding-001`, lấy vector **768 chiều**. Trên máy hiện tại `.env` không ghi đè ba biến model/dimension này; tuy vậy khi demo vẫn phải xem `GET /api/assistant/status` và cấu hình process đang chạy, không chỉ đoán từ file mẫu. Model embedding biến đoạn văn và câu hỏi thành dãy số để so độ gần về nghĩa; nó không tự trả lời.”

**Mở code:** `apps/api/src/config/config.ts:19–59`; `apps/api/src/assistant/gemini-embedding.service.ts:35–43,116–125`; `infra/postgres/migrations/008_rag_foundation.sql:27–45`. Tài liệu Google mô tả `gemini-embedding-001` là model text embedding, hỗ trợ cấu hình 768 chiều: [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings).

**Phân biệt:** LLM = sinh ngôn ngữ từ prompt; embedding model = mã hóa văn bản thành vector. Hai model có hai API và hai nhiệm vụ; gọi cả hai là “LLM trả lời” là sai.

## 3. “Nó hoạt động như thế nào? Vì sao gọi là RAG?”

**Trả lời 45 giây:**

> “RAG là _Retrieval-Augmented Generation_: truy xuất thông tin trước, rồi mới sinh câu trả lời. Ở pha lập chỉ mục, backend tải PDF từ Storage, trích văn bản theo trang, bỏ trang ít thông tin, chia đoạn khoảng 1.200 ký tự với phần chồng 200 ký tự, tạo embedding và lưu đoạn cùng vector, số trang, model vào PostgreSQL. Ở pha hỏi, cùng embedding model biến câu hỏi thành vector; pgvector so cosine distance và lấy các đoạn gần nhất, lọc theo ngưỡng điểm và phạm vi môn/tài liệu. Chỉ các đoạn được chọn mới vào prompt Gemini. Backend đối chiếu mã `[S1]` trong câu trả lời với nguồn đã lấy, rồi UI mới hiển thị nguồn.”

**Mở code theo đúng thứ tự:** `apps/api/src/documents/document-ingestion.service.ts:60–109` → `apps/api/src/documents/document-chunker.ts:8–12,136–173` → `apps/api/src/assistant/gemini-embedding.service.ts:35–43` → `apps/api/src/assistant/rag-retrieval.service.ts:100–174` → `apps/api/src/assistant/rag-context.ts:45–83` → `apps/api/src/assistant/assistant.service.ts:147–210,463–483`. Khái niệm RAG có thể dẫn [bài nghiên cứu gốc của Lewis và cộng sự](https://arxiv.org/abs/2005.11401), nhưng phần triển khai cụ thể phải dẫn code nhóm.

**Nếu thầy hỏi “top K là gì?”** Mặc định giữ tối đa 6 đoạn, `RAG_MIN_SCORE=0.55`; khi các kết quả gần nhất là chữ rác, code local có thể mở rộng số ứng viên theo các bước có giới hạn đến 100, không lấy vô hạn. Đây là **heuristic của nhóm**, không bảo đảm câu trả lời đúng. Xem `apps/api/src/config/config.ts:68–79` và `rag-retrieval.service.ts:104–170`.

## 4. “Model này free hay có phí? Tại sao chọn?”

**Trả lời 35 giây:**

> “Không thể nói ‘Gemini miễn phí hoàn toàn’. Bảng giá Google ngày 28/09/2026 ghi `gemini-2.5-flash` có Free Tier trong giới hạn; nếu project ở Paid Tier, giá Standard cho text là **0,30 USD / 1 triệu input tokens** và **2,50 USD / 1 triệu output tokens**. Hạn mức thật phụ thuộc project, model và tier, phải xem AI Studio. Nhóm chọn Flash vì cân bằng khả năng trả lời, độ trễ và chi phí cho demo hai người; code cũng đặt timeout và giới hạn output để giảm rủi ro. Giá và hạn mức có thể đổi, nên chúng em kiểm tra trang chính thức trước ngày báo cáo.”

**Dẫn nguồn ngoài:** [Google Gemini API pricing — Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). **Dẫn code:** `apps/api/src/config/config.ts:19–34`; `apps/api/src/assistant/gemini.service.ts:38–84`.

**Không khẳng định giá của `gemini-embedding-001` theo trí nhớ:** trang giá hiện hành không nêu rõ model này trong bảng đang xem. Khi thầy hỏi tổng chi phí, nói “còn chi phí embedding và hạ tầng; em xem billing của project và bảng giá cập nhật, chưa có số đo chi phí demo để khẳng định”. Free Tier không đồng nghĩa vô hạn; Google giới hạn RPM/TPM/RPD theo project.

## 5. “Thay model khác được không? Đổi 3.1 Flash có tốt hơn không?”

**Trả lời 40 giây:**

> “Có thể thay **model sinh câu trả lời** bằng cách đổi `GEMINI_MODEL` nếu model ID được Google hỗ trợ và SDK/JSON output tương thích; sau đó chạy lại test, kiểm tra citation, chất lượng tiếng Việt, latency và chi phí. Không nên đổi chỉ vì tên phiên bản mới hơn. Nếu đổi **embedding model**, không thể chỉ sửa một biến: vector mới có thể khác không gian nghĩa. Phải tạo lại embedding cho toàn bộ tài liệu, giữ cùng model cho document/query, kiểm tra dimension 768 và schema/index, rồi đánh giá lại truy xuất. Đổi sang provider khác còn cần viết adapter backend, không chỉ sửa `.env`.”

**Mở code:** `apps/api/src/config/config.ts:22,48–56`; `apps/api/src/assistant/gemini-embedding.service.ts:35–43,116–155`; `apps/api/src/assistant/rag-retrieval.service.ts:121–132`; `infra/postgres/migrations/008_rag_foundation.sql:23–45`. Google xác nhận hai không gian vector `gemini-embedding-001` và `gemini-embedding-2` **không so trực tiếp được**, nên phải re-embed: [hướng dẫn migration embedding](https://ai.google.dev/gemini-api/docs/embeddings#migration-from-gemini-embedding-001).

**Câu bẫy “3.1 Flash”:** hỏi lại **model ID cụ thể** — tên gọi chung có thể nhầm giữa Flash-Lite, Live hoặc preview. Google hiện vẫn phục vụ `gemini-2.5-flash` cho luồng cũ nhưng giới hạn quyền truy cập mới; không nên quảng bá lựa chọn này là tối ưu vĩnh viễn. [Danh sách model chính thức](https://ai.google.dev/gemini-api/docs/models).

## 6. “Các em train kiểu gì? Muốn dùng RAG phải train không?”

**Trả lời 30 giây:**

> “Nhóm **không train và không fine-tune** Gemini. Model đã được Google huấn luyện trước; nhóm gọi API để inference. Khi upload tài liệu, chúng em tạo embedding và xây index tìm kiếm — đó là **lập chỉ mục dữ liệu**, không cập nhật trọng số của model. RAG không bắt buộc train lại LLM: khi nội dung PDF thay đổi, re-index tài liệu và truy xuất nguồn mới. Fine-tuning là hướng khác, phải chuẩn bị dữ liệu huấn luyện và đánh giá riêng; project này chưa làm.”

**Mở code:** `apps/api/src/documents/document-ingestion.service.ts:65–109`; `infra/postgres/migrations/008_rag_foundation.sql:40–45`. Lưu ý: HNSW index trong database cũng không phải quá trình train Gemini. Trang Google mô tả embedding là chuyển input thành biểu diễn số, không phải sinh nội dung: [Embeddings](https://ai.google.dev/gemini-api/docs/embeddings).

## 7. “Tại sao một PDF đã index mà AI nói không tìm thấy?”

**Trả lời 35 giây:**

> “`ready` chỉ nghĩa pipeline đã ghi index, không bảo đảm câu hỏi có đoạn phù hợp. Trang PDF scan có thể trích ít chữ; chunk gần nhất có thể là mục lục, số trang hoặc tiêu đề; query có thể quá chung; ngưỡng điểm và phạm vi chọn tài liệu cũng ảnh hưởng. Bản local lọc đoạn ít thông tin, mở rộng truy xuất có giới hạn cho index cũ và hiển thị thống kê độ phủ nếu có. Chúng em không cho LLM tự bịa khi không tìm thấy chứng cứ. Nếu PDF cần OCR thì bật tính năng có chủ đích và re-index sau khi kiểm tra chi phí, không tự động tuyên bố đã đọc hết file.”

**Mở code:** `apps/api/src/documents/document-text-quality.ts:37–108`; `apps/api/src/assistant/rag-retrieval.service.ts:104–170`; `apps/api/src/assistant/assistant.service.ts:161–175`; `apps/web/src/AssistantPanel.tsx:237–253`; `apps/api/src/documents/document-ocr.service.ts:32–51`. Tài liệu cũ có thể thiếu số liệu `index_quality`; “không có thống kê” không có nghĩa là 0 trang hữu ích.

## 8. “Citation có bảo đảm model nói đúng sự thật không?”

**Trả lời 30 giây:**

> “Không. Backend kiểm tra model chỉ dùng source ID thực sự có trong các đoạn đã truy xuất; ID bịa hoặc output sai cấu trúc bị từ chối. Nhưng citation **hợp lệ về ID** chưa chứng minh từng mệnh đề được nguồn đó hỗ trợ. Vì vậy nhóm còn cần bộ câu hỏi đánh giá và người đọc đối chiếu câu trả lời với trang PDF. Đây là giới hạn phải nói rõ, không gọi citation là ‘bảo chứng tuyệt đối’.”

**Mở code:** `apps/api/src/assistant/assistant.service.ts:429–483`; `apps/api/src/assistant/rag-context.ts:45–83`; `docs/evaluation-plan.md`. Khi không có evidence, code trả `NO_RELEVANT_EVIDENCE` và không gọi generation cho câu hỏi tài liệu.

## Câu hỏi thầy có thể hỏi tiếp — đáp gọn, có điểm mở code

| Câu hỏi                                                | Đáp đúng ý                                                                                                                                                                                                               | Chỉ vào đâu                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| RAG khác chat thường thế nào?                          | Chat thường dựa kiến thức chung và không được nhận đã xem workspace. RAG truy xuất tài liệu trước, giới hạn nguồn và kiểm citation.                                                                                      | `assistant.service.ts:119–210`                                                                           |
| Hỏi “task của tôi còn gì” thì AI có biết không?        | Chưa. Chat thường không đọc Tasks; RAG chỉ tìm trong PDF đã index. Đừng gọi khả năng xem task là tính năng hiện có.                                                                                                      | `assistant.service.ts:119–210`, `rag-retrieval.service.ts:107–139`                                       |
| Hiện là tìm từ khóa, vector hay hybrid?                | Luồng RAG hiện tìm **vector/cosine**, chưa có bộ tìm full-text/hybrid hoặc reranker riêng. Vì thế phải đánh giá các câu hỏi tên riêng, mã môn và thuật ngữ chính xác.                                                    | `rag-retrieval.service.ts:107–139`                                                                       |
| Vì sao lưu PDF trong Storage, vector trong PostgreSQL? | PDF bytes và metadata/index phục vụ hai mục đích khác nhau; DB giữ quan hệ tài liệu–môn–chunk, Storage giữ file private.                                                                                                 | `document-ingestion.service.ts:62–109`, `008_rag_foundation.sql`                                         |
| 768 là token hay số trang?                             | Không; đó là **số chiều của một vector**. Chọn 768 để khớp schema `VECTOR(768)` và giảm lưu trữ/tính toán so với 3072.                                                                                                   | `config.ts:46–59`, `008_rag_foundation.sql:23–45`                                                        |
| Vì sao dùng cosine/HNSW?                               | Tìm vector gần theo hướng/ngữ nghĩa, HNSW giúp truy xuất gần đúng khi corpus lớn dần. Không phải bảo đảm chất lượng ngữ nghĩa.                                                                                           | `008_rag_foundation.sql:40–45`, `rag-retrieval.service.ts:107–139`                                       |
| Vì sao chia chunk có overlap?                          | Để nội dung ở ranh giới hai đoạn ít bị mất; vẫn giữ `source_page` để truy nguồn. Overlap tăng số chunk và chi phí embedding.                                                                                             | `document-chunker.ts:8–12,136–159`                                                                       |
| PDF ảnh/scan thì sao?                                  | Trích chữ trực tiếp có thể thất bại; OCR Gemini chỉ chạy nếu được bật và chỉ với trang bị đánh giá thiếu chữ, có giới hạn số trang.                                                                                      | `document-ocr.service.ts:32–51`, `config.ts:80–90`                                                       |
| “File này thuộc môn nào” có phải RAG?                  | Không. Đây là metadata `documents.course_id` JOIN `courses`, trả nguồn workspace; không trích PDF và không gọi Gemini.                                                                                                   | `rag-retrieval.service.ts:271–298`, `assistant.service.ts:227–268`                                       |
| Khi model timeout/quota?                               | Backend có timeout/abort và mã lỗi an toàn; phần Tasks/Documents không phụ thuộc kết quả LLM. Nhưng upload/index có thể cần embedding provider nên bước index vẫn lỗi khi provider hỏng.                                 | `gemini.service.ts:38–108`, `document-ingestion.service.ts:69–74`                                        |
| Chống prompt injection trong PDF?                      | Xem text PDF là dữ liệu không tin cậy; prompt nói không làm theo lệnh trong file, output bị parse/kiểm nguồn. Đây là giảm rủi ro, không chứng minh miễn nhiễm hoàn toàn.                                                 | `rag-context.ts:45–83`, `assistant.service.ts:19–25,429–483`                                             |
| API key nằm đâu?                                       | Chỉ backend đọc `GEMINI_API_KEY`; không đặt trong `VITE_*`, không quay/chụp `.env`.                                                                                                                                      | `.env.example`, `config.ts:19–34`, `gemini.service.ts:38–50`                                             |
| Assistant có phải agent tự làm việc không?             | Chưa. Đây là request–response assistant; không có tool tự ý sửa task, xóa tài liệu hay thực thi hành động. Không gọi nó là autonomous agent.                                                                             | `assistant.controller.ts`, `assistant.service.ts`                                                        |
| Câu trả lời được đánh giá ra sao?                      | Có tập case về câu đúng, không đủ chứng cứ, prompt injection, timeout, citation bịa; ghi model/prompt/corpus/latency và cần human review. Có test tự động, nhưng không được nói toàn bộ case live đã pass nếu chưa chạy. | `docs/evaluation-plan.md`, `docs/evaluation-cases.json`, `apps/api/scripts/evaluate-rag.mjs`             |
| Dữ liệu trong PDF có riêng tư không?                   | Private Storage không đồng nghĩa model không nhận nội dung: lúc embedding, RAG hoặc OCR, text/ảnh liên quan được gửi qua API Google. Chỉ dùng tài liệu có quyền sử dụng và tránh PII khi demo.                           | `document-ingestion.service.ts:62–74`, `assistant.service.ts:178–186`, `document-ocr.service.ts:126–150` |
| Đã sẵn sàng cho nhiều người dùng trên Internet chưa?   | Chưa nên khẳng định: project hiện là workspace demo dùng chung, chưa có xác thực/phân quyền theo từng sinh viên. Private bucket chỉ bảo vệ truy cập trực tiếp vào file, không thay auth của API.                         | `docs/architecture.md` (checkpoint non-AI), kiểm lại cấu hình deploy hiện hành                           |

## Mini-demo 3 phút để chỉ dẫn chứng trước mặt giảng viên

1. **Mở `apps/api/src/config/config.ts`**: chỉ hai model ID mặc định, dimension 768 và top K/ngưỡng. Không mở `.env`.
2. **Mở `apps/api/src/documents/document-ingestion.service.ts`**: chỉ chuỗi extract → quality/chunk → embedding → transaction ghi chunk và trạng thái `ready`.
3. **Mở `apps/api/src/assistant/rag-retrieval.service.ts`**: chỉ query embedding, lọc model/dimension, toán tử cosine `<=>`, giới hạn ứng viên và top K.
4. **Mở `apps/api/src/assistant/assistant.service.ts`**: chỉ sự khác biệt `general`/`documents`/`course_info`, nhánh không có bằng chứng và hàm kiểm citation.
5. **Trên web**, chọn một PDF đã index, hỏi một câu có thể tìm thấy trong nó; mở nguồn. Sau đó hỏi một câu ngoài phạm vi và nhận `NO_RELEVANT_EVIDENCE`. Nếu demo không ra đúng, nói trạng thái thật và mở test/log thay vì giả vờ thành công.

**Trước buổi báo cáo:** chốt revision đã push, chạy lại `npm test`, `npm run typecheck`, `npm run build`; chạy tập evaluation live trên PDF demo đã được phép dùng và ghi kết quả thật. `docs/evaluation-plan.md` là **kế hoạch**; sự tồn tại của file test hoặc code không phải bằng chứng mọi ca live đã qua. Đừng chạy re-index hàng loạt hay gửi tài liệu cá nhân chỉ để tạo ảnh demo.

## Nguồn ngoài nên lưu để trả lời câu giá/model

- [Google — Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing): giá thay đổi theo model và tier, kiểm lại sát ngày present.
- [Google — rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): giới hạn theo project và tier.
- [Google — Gemini models](https://ai.google.dev/gemini-api/docs/models): model ID, trạng thái phục vụ/thay thế.
- [Google — Embeddings](https://ai.google.dev/gemini-api/docs/embeddings): task type, output dimension, normalization và quy tắc re-embed khi đổi model.
- [Lewis et al., 2020 — RAG](https://arxiv.org/abs/2005.11401): nền tảng thuật ngữ, **không** phải bằng chứng ExaMate chạy đúng.
