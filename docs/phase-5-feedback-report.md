# Đợt 5 — feedback câu trả lời và candidate review

Ngày kiểm chứng: 05/10/2026. Nhánh `feature/tai-rag-integration`.
Code/harness hoàn thành và lưu thật qua API/DB đã được kiểm chứng. Browser
desktop/375px và semantic review Đợt 4 còn chưa nghiệm thu; không tuyên bố RAG
đạt chất lượng chỉ vì feedback/test xanh. Không gọi Gemini trong Đợt 5.

## Checkpoint, phạm vi và nguồn sự thật

Git đầu lượt: HEAD `9c0e34f7a9066ee67d2a55ed50b234d765aca5db`, ahead remote
3 commit, tracked tree sạch. File untracked có trước
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md` được giữ nguyên, không stage.
Repository vẫn npm workspaces React/Vite/Nest/PostgreSQL, contracts chỉ `.d.ts`;
migration thực tế tới `010` trước thay đổi. Không có AGENTS.md trong repo;
`D:\New-Tech\.agents\AGENTS.md` mô tả LogiRoute Python/Tailwind, khác project,
nên yêu cầu ExaMate và source hiện tại được ưu tiên. Không sửa rule hoặc ghi đè
tasks/plan.md. Handoff cũ là lịch sử; kết quả/code Git hiện tại là checkpoint.

Acceptance criteria đã thực hiện: dry-run nhất quán; feedback theo từng answer,
snapshot scope/mode lúc gửi, UUID độc lập `m2/m4`, validation và retry giữ key;
backend lưu idempotent; candidate export read-only và bắt buộc review; gates
và các giới hạn kiểm chứng được báo rõ.

Commits:

- `9ed09d5`: sửa checkpoint/exit dry-run và regression test.
- `dc1e50faabb40eef9ef547f2c3ea06e1f3e6fbbc`: feedback FE/API/contracts/migration,
  candidate CLI/hướng dẫn/test; sửa đường dẫn test để chạy từ npm workspace.
- Báo cáo này được commit riêng sau code; hash commit báo cáo có trong bàn giao
  cuối cùng. Không thêm co-author, không sửa attribution settings.

## Trước/sau và file thay đổi

Dry-run mới `artifacts/phase5-dry-bug`: process 0, checkpoint-24 3, report 0,
24 NOT_ATTEMPTED. Runner trước lưu checkpoint bằng exit semantic rồi mới đổi
exit final. Sau sửa, `save` tính exit 0 theo mode dry-run; validation
`successful`, semanticEvaluation `not_executed` được đặt trước checkpoint.
`artifacts/phase5-dry-fixed`: checkpoint/final/process đều 0, 24 NOT_ATTEMPTED,
0 semantic PASS. Artifact lịch sử không bị sửa/ghi đè.

Trước đây không có feedback dưới answer và không có nơi lưu/export tín hiệu.
Sau thay đổi, mỗi response thành công ở general/documents/workspace (kể cả
answerable=false) có hai nút Hữu ích/Chưa đúng và form inline. Không có feedback
ở user message, đang gửi hoặc HTTP error. Unhelpful chọn nhiều lý do trong
whitelist, cần ít nhất một; Khác cần note. Note optional tối đa 1.000 Unicode
code points. Disclosure trước gửi nêu việc lưu lượt hỏi–đáp và nguồn. Đang gửi
khóa controls/payload, guard ref chống double-click; thất bại giữ nội dung,
retry cùng key/payload; receipt hợp lệ mới hiện đã lưu. Sau lần gửi đầu,
payload được khóa để tránh retry nội dung khác cho row có thể đã được lưu.
Không sửa/xóa feedback đã lưu.

State form thuộc từng answer trong panel vẫn mounted; đóng/mở, route,
expand/collapse và source screen giữ draft trong tab. Feedback không gọi
setDraft, scroll, closeSource hoặc lưu chat vào localStorage. Text/checkbox/form
native, label/fieldset/legend, aria-pressed và status/alert; CSS dùng token hiện
có, controls/label hit area tối thiểu 44px, wrap/grid min-width cho màn hẹp.
Không thêm animation, dependency, icon khác hoặc renderer HTML không an toàn.

Các file chính:

- `apps/api/src/feedback/*`: controller, service, DTO, strict snapshot validation
  và canonical hash, cộng thêm theo pattern Nest hiện có.
- `packages/contracts/index.d.ts`: request/snapshot/rating/reason/receipt dùng
  chung; chỉ type import, không runtime export.
- `infra/postgres/migrations/011_assistant_feedback.sql`: bảng riêng private.
- `apps/web/src/AssistantFeedback.tsx`: form/state theo answer.
- `use-assistant.ts`: UUID/snapshot khi nhận response; `App.tsx`: chuyển response
  gốc qua transport; `AssistantPanel.tsx`: gắn form dưới assistant;
  `api.ts`: POST receipt; `styles.css`: style nhỏ theo tokens.
- `apps/api/scripts/export-assistant-feedback.mjs`, `docs/feedback-review.md`:
  CLI nội bộ và quy trình review, có ví dụ tổng hợp gắn nhãn.
- Tests feedback HTTP/export/web, regression evaluator và migration;
  `apps/api/package.json` thêm test/script CLI, không thêm dependency.

File runtime có sẵn của Thắng đã chạm: **`apps/api/src/app.module.ts`** thêm
controller/service vào registry dùng chung DatabaseService (4 dòng),
**`apps/api/src/common/http.ts`** thêm feedback vào whitelist đường dẫn log an
toàn (1 dòng). Không sửa assistant.service, Gemini, retrieval, ingestion,
chunking, OCR, prompt, topK/minScore/candidate policy hoặc citation validator.
HTTP chat contract, summary/course_info/workspace read-only, signed URL/private
bucket không đổi. Không sửa gold/corpus/evaluation manifest/kết quả lịch sử.

## Schema, snapshot và idempotency

Snapshot chính request/response lúc hỏi: mode/operation/question, courseId/
documentId đã chọn; response answer/answerable/reasonCode cùng metadata
provider/model/promptVersion và citations hoặc metadataSource/workspaceSources
đúng loại. Response gốc được giữ, không đổi nó bằng message dịch trạng thái
của FE. Không dùng selection hiện tại lúc đánh giá hoặc tự tạo metadata bị
thiếu. Fixture transport cũ thiếu response contract không tạo snapshot giả.
Backend kiểm shape, không coi client snapshot là bằng chứng server xác thực.
Provenance cố định **client_reported**, review_status **UNREVIEWED**.

Giới hạn chung FE/DTO/DB: note 1.000, question 4.000, answer 32.000 Unicode
code points; snapshot canonical UTF-8 81.920 bytes, sources tối đa 40. Answer
ceiling lớn hơn RAG validator 8.000 để nhận general/workspace; byte cap giới
hạn storage/HTTP, không cắt answer khi vượt giới hạn. Chi tiết nằm trong
feedback-review.md. Unknown fields cả nested/source bị reject; JSON trong DB
giữ canonical serialization để byte CHECK tương ứng. HTTP comment optional
string, explicit null bị reject; comment không gửi được lưu NULL trong DB.

Server tạo id UUID/time, UNIQUE answer_id và submission_id. SHA-256 do server
tính từ payload canonical. SQL tham số hóa INSERT ON CONFLICT DO NOTHING rồi
SELECT receipt/hash: replay đồng payload trả row cũ, khác payload hoặc key
khác cho answer đã có trả 409, không overwrite. Unique constraints giải quyết
hai request đồng thời. Receipt chỉ id/rating/createdAt; log chỉ IDs/outcome/
safe code và request metadata cũ, không comment/snapshot/key/connection string.
DB lỗi trả 503 thông báo an toàn và FE giữ retry. Không có auth/user identity
giả; một answer UUID không phải “một vote mỗi người”. Không có public GET,
review/update/delete feedback endpoint hoặc ghi rating vào ai_evaluations.

Không có FK tới nguồn: nguồn trong snapshot lịch sử vẫn giữ khi document/course
bị xóa. Đây không phải chứng minh nguồn hiện còn tồn tại. Không có cascade,
schema reset, sửa migration cũ, re-index hoặc thay association.

## RED → GREEN thực quan sát

| Test                                      | RED đã thấy                             | GREEN                                          |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| dry-run checkpoint/final/process          | assertion 3 !== 0                       | 0/0/0; cases NOT_ATTEMPTED                     |
| feedback helpful HTTP persistence/receipt | HTTP 404 !== 201 trước endpoint         | HTTP 201, một row, receipt nhỏ                 |
| FE controls dưới assistant answer         | không tìm thấy nút Hữu ích cho answer 1 | render đúng assistant, không user              |
| explicit null comment                     | HTTP 201 !== 400 với IsOptional         | ValidateIf + string reject 400, zero DB writes |

Các test khác viết trước/để regression và được báo là GREEN, không nhận toàn bộ
suite là RED → GREEN. Test export lần đầu không load được module chưa tồn tại
(ERR_MODULE_NOT_FOUND); đó là failure triển khai thiếu file, **không** phải
RED vì logic đánh giá. Source regression từng fail do fixture thiếu
onOpenCitation; sửa fixture, không quy lỗi cho runtime.

Backend HTTP mocks: helpful, unhelpful nhiều reasons/other, enum/reason/duplicate/
missing reason/note, UUID, unknown nested/source fields, shape theo ba mode và
metadata, giới hạn note/question/answer/byte/source, Unicode 1.000 ký tự, replay/
conflict/concurrency/key order, DB failure không leak response/log.
Migration test kiểm constraint/private pattern; không dùng shared DB để reset
hoặc cleanup automatic tests. Không có TEST_DATABASE_URL disposable được chạy;
CHECK constraints được đọc qua catalog thật, không tuyên bố đã thử toàn bộ
negative INSERT trực tiếp trên DB thật.

Web DOM tests thêm 10 case: controls/snapshot cũ, double-click/pending ack,
reasons/other/error/retry, nhiều answer và draft riêng, hide/expand, HTTP error,
Unicode note/form/focus, malformed receipt, oversize không gửi/cắt, source
preview/Back giữ feedback và question draft. Native semantics được kiểm ở DOM;
chưa thay bằng bằng chứng bàn phím browser thật. Suite cũ vẫn kiểm đổi ba mode,
summary/course_info, workspace source link/sheet, Download, draft/Back/preview.

## Gates mới từ root

| Gate                 | Baseline lượt này                                                          | Final                                             |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| npm run typecheck    | exit 0                                                                     | exit 0                                            |
| npm test             | exit 0: API Vitest 197 + node:test 145 + web 125 = **467 pass**, skipped 0 | exit 0: 197 + 180 + 135 = **512 pass**, skipped 0 |
| npm run build        | exit 0                                                                     | exit 0                                            |
| npm run format:check | exit 0                                                                     | exit 0                                            |

Baseline logs `artifacts/phase5-baseline/`; final logs
`artifacts/phase5-acceptance/`. Lượt trung gian `artifacts/phase5-final/` có
typecheck/build/format 0, test 1 (API node 178/180, web 135): hai test mới đọc
artifact theo cwd apps/api. Sửa URL dựa trên import.meta.url, chạy lại đầy đủ
bốn gates thành final ở trên. Không ghi đè hoặc giấu lượt fail. Không viện lỗi
format cũ; chỉ format file nhiệm vụ.

## Kiểm API/DB thật và dữ liệu smoke

Preflight SELECT xác minh đúng DB runtime qua hai ID corpus Đợt 4, history
migrations tới 010; không in connection string. Migration runner hiện có chạy
từ root, exit 0, chỉ thêm 011; checksum 001–011 khớp file normalized CRLF. Hậu
kiểm xác nhận DATABASE_URL và MIGRATION_DATABASE_URL fallback cùng connection
đã cấu hình, cùng DB identity; không công bố URL/CA. Artifact preflight helper
có một lỗi thiếu await loadMigrations, được sửa trước migration; không có SQL
mutation trong lượt lỗi đó. Proof nằm trong `phase5-db-preflight.json`,
`phase5-migration.log`, `phase5-postcheck.json` dưới artifacts.

Port 3000/5173 trống trước khi mở API local; chỉ mở một API trên 3000. Hai lượt
POST workspace (refusal write_refused và courses_list) trả 200, dùng DB, không
Gemini. Mỗi lượt tạo helpful/unhelpful smoke, hai POST đồng thời + một replay
đều 201 cùng feedback ID; khác comment 409. SELECT xác minh 1 row mỗi answer,
question/answer snapshot khớp response nhận được, provenance/review_status đúng.
Actual feedback IDs:

- `d8c4f52e-5f97-4420-80da-fc844d0d464b` (helpful smoke, refusal).
- `7d267b65-baf4-4bdd-a14a-5ef9ccfe1d74` (unhelpful smoke, other có note).

Giữ lại **đúng hai row thử**, comment ghi rõ AUTOMATED PHASE 5 SMOKE FIXTURE,
không phải feedback người thật/semantic verdict. Không cleanup dữ liệu nhóm.
ID manifest/payload thuộc lượt này lưu local/ignored để nhận diện và xử lý có
quyền về sau. Không commit raw workspace answer hoặc artifact feedback thực.

Catalog SELECT: RLS true, owner postgres, policy_count 0; anon/authenticated
SELECT/INSERT/UPDATE/DELETE đều false. Đọc constraint definitions và checksum
thật; concurrency đã kiểm qua API thực, không chỉ shape/mock.
Proof: `artifacts/phase5-feedback-db-proof.json`,
`phase5-smoke-owned-ids.json`; payload smoke riêng local. Tổng 2 chat requests,
8 feedback POST (4 mỗi sample), 2 row giữ lại; **0 provider calls**, không upload/
embedding/indexing hoặc live RAG retry.

## Candidate export và đường review

CLI thật chọn đúng hai feedback ID trên, exit 0, xuất 2 UNREVIEWED candidates
tới `artifacts/phase5-smoke-candidates.json`. SELECT theo IDs, không ghi DB,
không provider; không in question/answer/comment. Unit fixtures kiểm helpful
không thành PASS, unhelpful không thành FAIL, comment không thành gold,
candidate schema 1 không được evaluator schema 3 chấp nhận, bounded selection,
zero-provider, read-only và wx không overwrite. Có review fields reviewer/time/
conclusion/evidence/errorType/comparedSources/expectedBehavior/test kind, đều
chưa duyệt. Procedure và ví dụ giả lập nằm trong `docs/feedback-review.md`.

Tài/Thắng phải đối chiếu nguồn được phép, ghi reviewer thật, kết luận
confirmed_issue/no_issue/insufficient_evidence và evidence; rồi mới đề xuất
expected behavior/testcase và duyệt thay đổi riêng. Source đã xóa/thay đổi hoặc
thiếu bằng chứng phải được nêu. Không auto-promote candidate vào manifest,
không coi comment là đáp án chuẩn, không sửa kết quả/gold lịch sử.

## Browser và tồn đọng Đợt 4

**Browser desktop/375px: BLOCKED/chưa nghiệm thu trực tiếp.** Không có browser
tool khả dụng trong lượt này. Đợt 4 ghi action launch Chrome remote debugging
bị automatic approval review từ chối `blocked by policy`; không thử đường khác
để vượt policy và không tạo mock thành answer thật trong app. Lượt này không
khẳng định có một rejection mới. Chưa trực tiếp thấy keyboard/no overflow,
SourcePreview đúng PDF/page/Back/Download, helpful/unhelpful/retry nhiều answer
trên Chrome, hoặc browser console/network. API/DB và DOM evidence phía trên
không thay thế browser acceptance. Lỗi offline/503/409 trong test là chủ ý,
không gọi đó là lỗi JS browser đã quan sát.

| Case lịch sử | Trạng thái giữ nguyên   | Hậu kiểm Đợt 5                                                                                                                             |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| E01          | REVIEW_REQUIRED         | đủ thời lượng/workflow/citation brief p1, nhưng thiếu lời nhắc minh họa: thiếu completeness theo rubric; agent ghi nhận, chưa Tài/Thắng ký |
| E04          | REVIEW_REQUIRED         | giữ refusal và lịch sử, chưa semantic review                                                                                               |
| E07          | REVIEW_REQUIRED         | giữ injection/context evidence lịch sử, chưa semantic review                                                                               |
| E16          | REVIEW_REQUIRED         | giữ kết quả thiếu dấu/tên file, chưa semantic review                                                                                       |
| E17          | BLOCKED, AI_UNAVAILABLE | không suy diễn quota/retrieval FAIL, không debug Gemini hoặc retry live                                                                    |

E01 response hash audit
`310bee2f452d217bce8b79da624acf968f6df736251037aac460bb8990dfd620`;
raw/gold không đổi. Dry mới 0 PASS/FAIL/REVIEW_REQUIRED/BLOCKED/INCONCLUSIVE/SKIP,
24 NOT_ATTEMPTED. Offline subset E01/E04/E07/E16/E17 bằng fixture mới: 5
REVIEW_REQUIRED, các status khác 0, exit 2, provider 0; fixture summary không
thay BLOCKED E17 live lịch sử. Không có human signoff hoặc semantic PASS mới.
Corpus vẫn ASCII tổng hợp; chưa chứng minh PDF tiếng Việt có dấu/PDF scan/OCR.

## Điểm dừng

Đã review diff/staged diff và scan credential/connection string/signed URL;
không match secret thật hoặc staged path env/secrets/artifacts. Chỉ stage đường
dẫn thuộc nhiệm vụ. Sau code commit, tracked tree sạch, chỉ còn prompt untracked
có trước; báo cáo này commit riêng. Không push, merge, deploy hoặc bắt đầu Đợt 6.
Ưu tiên nghiệm thu tiếp là browser thật và human review Đợt 4/candidate, không
đổi model/prompt/thuật toán để cải thiện số liệu trong lượt này. Dừng chờ Tài duyệt.
