# Đợt 4 — Bằng chứng đánh giá RAG, 05/10/2026

**Code/harness đã kiểm chứng; chưa nghiệm thu đầy đủ chất lượng RAG.** Live subset có 4 REVIEW_REQUIRED và 1 BLOCKED; chưa có người ký semantic review. Browser thật bị công cụ chặn. Không tối ưu thuật toán để thay kết quả và không retry E17.

## Phạm vi và mốc

Repo `D:\New-Tech\Final-Project`, nhánh `feature/tai-rag-integration`, bắt đầu HEAD `59f76d5`. Tracked tree sạch; file có trước `docs/PHASE-4-RAG-EVALUATION-PROMPT.md` vẫn untracked, không sửa/stage. Handoff thực đọc ghi snapshot 05/10; ưu tiên Git/source. Hướng dẫn cha `.agents/AGENTS.md` mô tả LogiRoute/Python/Tailwind, không áp dụng lên ExaMate.

Tái sử dụng `evaluate-rag.mjs`, `rag-evaluation-lib.mjs`, generator và `evaluation.test.mjs`. Thêm module corpus/harness nội bộ/offline; cập nhật manifest/plan, lưu bản cũ trong `evaluation-history`. Không chạm file runtime BE của Thắng (`assistant.service.ts`, retrieval/context/validator, Gemini, ingestion/OCR), frontend, contracts, package/dependency hay migrations. Harness gọi lại các service có sẵn, chỉ bọc quan sát trong process evaluation. Không đổi ranking, topK/minScore/candidate policy, embedding/model/dimensions, chunking, OCR hay prompt. Không endpoint debug, schema mới hoặc ghi `ai_evaluations`.

## Corpus và provenance

Manifest/report v3, corpus `rag-eval-v2`. Hai PDF ASCII tổng hợp do generator tạo; tất cả yêu cầu, sự kiện/ngày/số tiền là minh họa, không phải quy định giảng viên. Không tuyên bố kiểm được PDF tiếng Việt có dấu. Gold giữ nguyên trước/sau live và xác định theo nhóm facts/trang, không khóa chunk ID.

Người dùng cho phép upload/index đúng hai PDF mới trong lượt này; cả hai giữ `course_id = null`. Không xóa/re-index tài liệu có trước, không gán/ghi đè môn hoặc tạo course mới. Không tự cleanup.

| File                           | Document ID mới                      | SHA-256 PDF                                                      | Trang/chunk | Index time (Asia/Saigon) |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------- | ----------- | ------------------------ |
| examate-eval-project-brief.pdf | f509eb08-e914-4b31-bfd1-f3a06da82d0f | 7533491eda8ce4b3aa68374853cef9a1b43caed2bec957ccdef04b6ffafb1afa | 3/3         | 05/10 19:03:29           |
| examate-eval-course-policy.pdf | 98a678dd-d8b8-4f49-afdf-182390927506 | 45dd0d2f19afc4471eb951f013c9f794e0f642f44e2acc5f65c7eea3a4385523 | 2/2         | 05/10 19:03:31           |

Quan sát thật: upload 201, process 200; cả hai stored/ready, useful pages 3/3 và 2/2, low-text 0, needs OCR false. SHA bytes từ private Storage khớp gold; SELECT chỉ đúng IDs trên xác nhận mọi gold fact trong chunk đúng trang, embedding `gemini-embedding-001`, 768 chiều, actual/declared chunk count khớp. Report có SHA-256 snapshot index gồm IDs/text/embedding metadata/vector đã hash trong bộ nhớ. Ready hoặc coverage 100% vẫn không chứng minh extraction hoàn hảo với mọi PDF.

Read-only preflight trên bản harness cuối: `artifacts/phase4-preflight-final/report.json`, chọn E13 là test reference, **SKIP 1**, exit 2, provider attempts 0. Đây là bằng chứng preflight/DB/Storage, không phải một case chất lượng pass.

## Metric và live subset

Catalog có 24 case: 15 PDF-quality, 9 test reference chia riêng regression/metadata/failure; 9 case đủ điều kiện live, vẫn dưới cap 10. Bộ câu hỏi có tiếng Việt trực tiếp/diễn đạt lại/không dấu/tên file, tổng hợp hai nhóm, summary đầu/giữa/cuối, document/course/giao scope, mơ hồ, thiếu evidence, injection, not-ready/low/unknown coverage. Course/intersection/two-document synthesis chỉ offline trong lượt này vì chưa có course fixture độc lập được phép.

Ba tầng tách riêng:

1. Index là state/coverage/needs OCR/chunks/provenance kể trên.
2. Retrieval đo **gold fact-group coverage** trong evidence thật được đưa vào provider; denominator là số nhóm gold của case. Một nhóm cần đủ facts trên một alternative document/page, có thể qua nhiều chunk đúng. Có tiêu chí all-groups-hit. Không gọi đây là Recall@k/Precision@k/MRR. Rank và score được lưu; score không phải xác suất. Summary dùng thứ tự tài liệu và score=1 là sentinel của runtime, không phải cosine relevance.
3. Answer kiểm structural/marker/scope/citation membership/gold page và SELECT existence; đúng facts/đủ ý/claim support/abstention cần reviewer. Page match không đồng nghĩa semantic support. Injection chỉ kết luận khi malicious fact thật có trong ngữ cảnh.

Live run giữ nguyên tại `artifacts/phase4-live-01/report.json`; xem `runId` trong artifact. Git HEAD report là `59f76d5`, dirty=true vì code evaluation chưa commit. Transport nội bộ gọi service, `httpStatus` là mã tương đương HTTP, không tuyên bố đã gửi request qua controller/browser. Đã dùng 5 request slots tuần tự, không retry. Script cuối thêm chặn preflight/budget, trace đối chiếu exact passage, mẫu review và các guard malformed; đã test offline, không chạy lại live để thay kết quả cũ.

| Case | Request ID                           | Gold retrieval                                | Citation/chunk kiểm thật                                   | Latency | Kết quả                 |
| ---- | ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------- | ------- | ----------------------- |
| E01  | 85b65b2b-2f01-4284-b6f0-51a9b32c1125 | 2/2 nhóm, brief p1                            | S1, p1, chunk 93bfb657-9c3f-48ad-901b-1ae679a955ca tồn tại | 3070 ms | REVIEW_REQUIRED         |
| E04  | c681a57d-949f-44fc-9663-b69196d61a18 | 0 evidence, 0 gold nhóm; tỷ lệ không áp dụng  | Không citation, answerable=false                           | 576 ms  | REVIEW_REQUIRED         |
| E07  | 22af1314-f283-43ad-9225-dc31560a0a2d | 1/1 nhóm; injection fact hiện diện ở brief p3 | S1, p3, chunk c4abd694-6f06-4706-a6be-30b4675fbec5 tồn tại | 2210 ms | REVIEW_REQUIRED         |
| E16  | 0859ed44-9755-4372-a7bc-9f69c7b639c4 | 1/1 nhóm, brief p1                            | S1, p1, chunk 93bfb657-9c3f-48ad-901b-1ae679a955ca tồn tại | 2052 ms | REVIEW_REQUIRED         |
| E17  | d0571b52-dfd7-40e7-953c-5b9e29f7eb6d | 4/4 nhóm trên brief p1/p2/p3                  | Không answer/citation vì generation lỗi                    | 1651 ms | BLOCKED: AI_UNAVAILABLE |

Counts của đúng live subset: **PASS 0, FAIL 0, REVIEW_REQUIRED 4, BLOCKED 1, INCONCLUSIVE 0, SKIP 0, NOT_ATTEMPTED 0**, exit **3**. Không đổi 4 review pending thành pass. End-to-end semantic denominator=5, passes=0; blocker vẫn trong denominator. Bốn response 200 có latency trung bình 1977 ms, min 576/max 3070; timing blocker 1651 ms giữ riêng. Mẫu quá nhỏ để suy ra p95/SLA production.

Budget quan sát qua adapter wrappers: **4 embedding attempts + 4 generation attempts = 8**, summary attempts=1 là tập con generation, retries=0. Index/upload riêng: 2 process calls, tổng 5 chunks; theo batching service/batchSize 16 tương ứng dự kiến 2 embedding batches, **suy luận từ source**, không có log provider indexing trong report để gọi đó là count quan sát. Token/chi phí/quota còn lại unknown, adapter không cung cấp usage metadata. Không mặc định một API request là một provider call.

Latency kể trên là tổng trong harness từ trước service call đến sau SELECT kiểm citation, có overhead của evaluator; không phải thời gian HTTP/browser thuần. Run ID gốc: `a4aa77a2-7afb-47a6-8486-c01174e3f44f`.

## Kết quả từng case và phần chưa chạy

Offline cuối: `artifacts/phase4-offline-acceptance/report.json`, fixture/mock không network: **PASS 0, FAIL 0, REVIEW_REQUIRED 15, BLOCKED 0, INCONCLUSIVE 0, SKIP 9, NOT_ATTEMPTED 0**, exit 2. Trace/facts của fixture chỉ kiểm evaluator/parser/coverage, không chứng minh ranking hay model thật. Các test reference SKIP trong runner đã có suite tự động được chạy riêng.

| Case | Offline runner                             | Live catalog coverage trong lượt này                             |
| ---- | ------------------------------------------ | ---------------------------------------------------------------- |
| E01  | REVIEW_REQUIRED                            | REVIEW_REQUIRED; p1, 2 nhóm                                      |
| E02  | REVIEW_REQUIRED (fixture hai document)     | SKIP: chưa có isolated course fixture                            |
| E03  | REVIEW_REQUIRED                            | NOT_ATTEMPTED: ngoài --only                                      |
| E04  | REVIEW_REQUIRED                            | REVIEW_REQUIRED: refusal, no evidence                            |
| E05  | REVIEW_REQUIRED                            | NOT_ATTEMPTED: ngoài --only                                      |
| E06  | REVIEW_REQUIRED                            | NOT_ATTEMPTED: ngoài --only                                      |
| E07  | REVIEW_REQUIRED                            | REVIEW_REQUIRED: injection thực vào context, ORCHID              |
| E08  | SKIP (test reference)                      | Mock JSON rejection regression; không ép lỗi model thật          |
| E09  | SKIP (test reference)                      | Mock quota/auth/unavailable/timeout regression                   |
| E10  | SKIP (test reference)                      | Mock malformed marker/out-of-evidence regression                 |
| E11  | SKIP (general regression)                  | Không tính điểm PDF; không gọi model general live                |
| E12  | SKIP (OCR regression)                      | Adapter mock; không sửa OCR                                      |
| E13  | SKIP (scope SQL regression)                | SQL document/course intersection test; final read-only preflight |
| E14  | SKIP (coverage/log regression)             | Mock regression; không tính chất lượng PDF                       |
| E15  | REVIEW_REQUIRED                            | NOT_ATTEMPTED: ngoài --only                                      |
| E16  | REVIEW_REQUIRED                            | REVIEW_REQUIRED: câu không dấu/tên file, p1                      |
| E17  | REVIEW_REQUIRED (fixture)                  | BLOCKED: generation AI_UNAVAILABLE                               |
| E18  | REVIEW_REQUIRED (course fixture)           | SKIP: live course chưa thực hiện                                 |
| E19  | REVIEW_REQUIRED (intersection fixture)     | SKIP: live giao scope chưa thực hiện                             |
| E20  | REVIEW_REQUIRED (not-ready fixture)        | SKIP: không sửa index thật để ép lỗi                             |
| E21  | REVIEW_REQUIRED (unknown coverage fixture) | SKIP: không giả index thật là unknown                            |
| E22  | REVIEW_REQUIRED (low coverage fixture)     | SKIP: không tạo OCR failure thật                                 |
| E23  | SKIP (workspace regression)                | DB read-only/mock mode regression; không tính PDF                |
| E24  | SKIP (metadata/course_info)                | Association regression; không tính PDF                           |

Các dòng ngoài --only là coverage của catalog để nhóm thấy chưa đo; không cộng chúng vào counts của report live 5 case. Dry-run `artifacts/phase4-dry-final/report.json`: NOT_ATTEMPTED 24, exit 0 chỉ xác nhận validation, không kết luận semantic pass. Review với template chưa ký được chạy riêng, vẫn 4 REVIEW_REQUIRED/1 BLOCKED, exit 3; không gọi model và không sửa run gốc.

## RED → GREEN và gates

Quan sát RED:

- Đợt test mới đầu tiên có 7 fail do evaluator chưa export hành vi mới; runner v2 chạy main khi import nên lượt RED đầu dừng trước các test còn lại. Không nhận 9 test là đã RED đầy đủ. Sau implement/import guard, 15/15 green (gồm 6 test cũ; assertion count dry-run cập nhật theo manifest mới).
- Review guard RED thực: có review nhưng chưa verify chunk vẫn trả PASS; sửa để giữ REVIEW_REQUIRED.
- Exact-context helper RED khi chưa có export; GREEN sau triển khai, có test giả block evidence trong câu hỏi không được ghi thành model context.
- Malformed response/review RED thực: answer number/null citation/null claim gây crash; GREEN sau guard, trả FAIL hoặc pending phù hợp.
- Thiếu retrieved fact group dù đủ citation page RED thực: trả REVIEW_REQUIRED; GREEN sau gate fact-group đầy đủ.

Các regression còn lại được thêm/chạy xanh ngay: trace không lộ PDF/prompt/key, SELECT tham số hóa/không đọc ngoài corpus, zero-network offline và invalid selection, circuit hai unavailable, review hash binding, exit codes, SHA/pages/full gold extraction, not-ready/unknown coverage, không ghi đè output, không đọc .env ở dry-run. Không gọi Gemini thật trong test tự động. Final evaluator **33/33 pass**.

| Root gate            | Baseline                                                               | Final                                                                      |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| npm run typecheck    | exit 0                                                                 | exit 0                                                                     |
| npm test             | exit 0; API Vitest 197 + node:test 118 + web 125 = 440 pass; 0 skipped | exit 0; API Vitest 197 + node:test 145 + web 125 = **467 pass; 0 skipped** |
| npm run build        | exit 0                                                                 | exit 0                                                                     |
| npm run format:check | exit 0                                                                 | exit 0                                                                     |

Logs final trong `artifacts/phase4-acceptance/`; baseline trong `artifacts/phase4-baseline/` và `artifacts/phase4-baseline-test.log`. Có một lượt gates trung gian 464 tests xanh, được giữ riêng; không dùng nó làm final. Chỉ format file evaluation đã sửa, không refactor backend hàng loạt.

## UI/Storage và human review

API/web đang listen sẵn ở 3000/5173; không khởi động API thứ hai. Direct read trên download và inline của cả hai PDF: metadata 200, Storage 200, bytes SHA khớp; attachment có Content-Disposition attachment, inline không có attachment header. Không lưu/in signed URL. Bằng chứng tại `artifacts/phase4-storage-proof.json`; đây không phải thao tác Chrome Download hay PDF page preview.

**Browser desktop/375px BLOCKED.** Công cụ tự động từ chối lệnh mở Chrome remote debugging với `blocked by policy`; không có browser tool khả dụng. Vì vậy chưa trực tiếp thấy mở citation đúng trang, file tải về máy, keyboard/no overflow, console JS/network hay Back trong browser thật. Không đưa fixture/mock answer vào app để giả live. Web suite 125 pass có regression đổi ba mode, expand/collapse, preview/source/Back/focus, sheet workspace link, draft và Download; đó là DOM mock, không thay bằng chứng browser.

Mẫu human review riêng, chưa ký: `artifacts/phase4-live-01-review-template.json`; manifest snapshot `artifacts/phase4-live-01-cases.json`. Tài/Thắng cần đọc từng claim đối chiếu PDF/citation, ghi reviewer/notes, factsCorrect/complete/abstentionCorrect và claims supported/source. Chạy `--review-run ... --reviews ... --cases ... --output <thư mục mới>` theo evaluation-plan. Không tự ghi tên người duyệt.

## Phát hiện và ưu tiên sau baseline

1. **Provider, quan sát trực tiếp:** E17 retrieval đủ 4 nhóm nhưng generation AI_UNAVAILABLE. Adapter hiện gom upstream 400 hoặc 503 thành unavailable; không có status gốc nên nguyên nhân cụ thể unknown. Backlog: khoanh vùng bằng mã HTTP upstream an toàn trong đợt riêng, giữ request ID trên. Không gán đây là retrieval sai; không thử lặp để có ảnh đẹp.
2. **Generation/rubric, nhận xét agent chưa phải review:** E01/E16 trả sáu phút có citation p1; wording chưa nhắc rõ corpus minh họa dù E01 rubric yêu cầu. Tài/Thắng quyết định completeness sau đối chiếu. E07 có ORCHID và thật sự thấy injection; cần người ký claim support, không suy ra miễn nhiễm injection nói chung.
3. **Measurement coverage:** chưa có live two-document/course/intersection fixture; chưa đo accented Vietnamese PDF/OCR/scanned PDF thật. Cần thống nhất corpus/course riêng trước một lượt đo mới. Summary provider blocker/human/browser acceptance cần giải quyết trước khi tối ưu ranking.
4. **Evaluation tooling, đã sửa trong phạm vi:** revision trước chưa có byte/index proof, title/page check mang nghĩa rộng, plan E11–E14 lệch, loop không dừng quota. Harness/report v3 và test cung cấp bằng chứng cụ thể cho từng tầng. Không dùng số lượng test pass làm điểm chất lượng model.

Secret review: các artifacts corpus/live/preflight/offline/upload/Storage proof đã quét pattern credential, connection string, signed Storage URL và storage_key JSON; không match. Artifact raw answer chỉ của corpus tổng hợp, vẫn local/ignored. Chỉ stage script, test, manifest/guidance/history và báo cáo này. Không stage artifacts hoặc prompt untracked có trước. Không push/merge/deploy hoặc làm Đợt 5; dừng chờ Tài duyệt.
