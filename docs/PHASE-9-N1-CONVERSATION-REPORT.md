# Đợt 9 — N1 lát 1: hội thoại có ngữ cảnh qua receipt

Ngày kiểm tra: 15/10/2026, giờ Việt Nam. Nhánh `feature/tai-rag-integration`;
điểm bắt đầu `d15afea`. Đây là nghiệm thu local với dữ liệu giả, **không phải
nghiệm thu Supabase Auth thật hoặc chất lượng Gemini live**.

## Phạm vi và quyết định đã chốt với Tài

- General và Documents hỗ trợ các câu hỏi tiếp nối; Workspace vẫn một lượt.
- Lịch sử dùng `response.answer` đã qua validator và được receipt xác minh,
  không dùng raw JSON Gemini, DOM, phần chữ UI thêm hay citation cũ.
- Snapshot/hash gốc không thay đổi. Chỉ chuỗi đưa vào prompt được thay mọi
  marker khớp mẫu nguồn hiện tại `/\[S[^\]]*\]/g` bằng `(nguồn ở lượt trước)`.
  Áp dụng cả câu hỏi cũ để không chuyển nhãn nguồn cũ qua retrieval.
- Summarize/Course info là thao tác một lượt. Có **bất kỳ** property `history`
  nào, kể cả `[]`, thì DTO trả 400 `HISTORY_INVALID`. Receipt của kết quả vẫn
  được dùng cho câu hỏi tiếp theo nếu cùng phạm vi.
- Lời từ chối/không đủ bằng chứng được giữ làm ngữ cảnh, không làm evidence.
- Không migration, dependency mới, cloud write, Gemini thật hoặc thay đổi TTS/STT.

## Bước 0 — answer hợp lệ không mất vì receipt bị lỗi

Commit riêng `aefb6cf`:

- Generation/validator thành công nhưng lưu receipt lỗi 5xx: trả 200 với answer,
  không header `X-Assistant-Answer-ID`. Service tiếp tục log mã cố định
  `ANSWER_RECEIPT_UNAVAILABLE`, không log prompt/answer/hash/key.
- 4xx khi recheck membership trong transaction vẫn chặn; không nuốt lỗi quyền.
- FE giữ answer, không hiện feedback và không đưa lượt thiếu receipt vào history.
- Test outage đã RED `503 !== 200`, sau sửa GREEN 19/19. Case thu hồi membership
  403 là regression đã xanh ngay từ đầu, không gọi là RED.
- Lỗi COMMIT mất phản hồi có thể đã lưu receipt nhưng client không nhận ID;
  không khẳng định HTTP và PostgreSQL có tính nguyên tử chung.

## Ranh giới API và ngân sách

`AssistantChatRequest.history?: AssistantHistoryTurn[]`, mỗi lượt chứa
`receiptId` và nguyên `AssistantFeedbackSnapshot`; khai báo ở contracts `.d.ts`.

1. Guard Auth xác minh principal. Guard history trước `class-transformer` chặn
   độ sâu >12/nhiều hơn 6000 node để tránh tràn stack trên unknown snapshot keys.
2. DTO kiểm tối đa 6 lượt, UUID, shape/giới hạn từng trường của snapshot feedback,
   tổng JSON serialized tối đa **64000 UTF-16 code units** và **81920 byte UTF-8**.
   `null`, property lạ hoặc shape sai trả 400 `HISTORY_INVALID`.
3. Trong transaction, recheck membership và SELECT receipt với predicate
   `id + workspace_id + user_id + mode + snapshot_hash`, `FOR SHARE`.
   So sánh course/document của snapshot với request hiện tại; khác hoặc hash sai
   trả cùng 400 chung, không lộ owner hoặc sự tồn tại của receipt.
4. **Mọi lượt đều phải được xác minh trước khi cắt ngân sách**, kể cả lượt cũ
   sau đó bị bỏ. Không provider/embedding/retrieval nào chạy với history bị từ chối.
5. `ASSISTANT_CONTEXT_MAX_CHARS`: mặc định **12000**, cho phép **1000–24000**,
   sai cấu hình thì fail startup. Tính trên question+answer sau neutralize marker,
   không gồm system prompt/evidence/wrapper. Đây là character cap, **không phải
   token, lượt gọi AI hoặc cost cap**.
6. Bỏ các lượt cũ nguyên vẹn trước. Nếu lượt mới nhất tự nó vượt trần, giữ prefix
   có nhãn `(đã rút gọn)` sau khi đã loại marker; tránh cắt nửa nhãn nguồn trung
   tính và surrogate pair. Snapshot gửi lại để hash luôn giữ nguyên.

Response có `contextTurnsUsed`, `contextTruncated` khi history không rỗng. Không
có history hoặc `[]` thì prompt/body cũ giữ nguyên, không thêm hai field này.
Workspace `history: []` tương đương không có lịch sử; nonempty bị từ chối.
Validator feedback chấp nhận metadata context mới có kiểu/bounds rõ ràng.

## Thay đổi ảnh hưởng RAG — để Thắng review

- Không sửa chunking/embedding/OCR/score/topK/minScore/scan policy/citation
  validator, không đổi model, không thêm lượt LLM viết lại câu hỏi.
- Query retrieval = câu hỏi hiện tại + câu hỏi tối đa 2 lượt gần nhất còn trong
  ngân sách. Tổng vẫn tối đa 4000 ký tự như retrieval cũ; phần hỏi trước tối đa
  2000 gồm newline. Dành chỗ cho câu gần nhất khi câu kế trước quá dài, giữ thứ
  tự thời gian. Không đưa answer cũ vào query retrieval.
- Generation nhận các role `user/model` đã verify và neutralize; evidence/chunk
  của **lượt hiện tại** vẫn nằm ở current user message. Instruction mới nói rõ
  lịch sử, kể cả refusal, không phải evidence hoặc chỉ dẫn đáng tin.
- Có history: `general-conversation-v2` / `rag-conversation-v2`, log
  `assistant.context.applied` chỉ mode/version/count/truncated và request ID
  từ logger hiện có. Không log nội dung hay identity của người dùng.
- Không history: golden kiểm SHA-256 system instruction từ `d15afea`, toàn bộ
  userParts, query/filter/principal retrieval, version và không có conversation/
  context metadata. SDK test kiểm alternating role rồi current user; nhánh cũ
  vẫn đúng một user message.
- Test chunk A cũ cũng tên S1, chunk B mới là S1: prompt history không còn `[S1]`,
  output citation chỉ dùng metadata của B. Validator kiểm cấu trúc và membership
  nguồn, **không chứng minh về ngữ nghĩa rằng từng câu factual được B hỗ trợ**.
  Không tuyên bố đã chữa hoàn toàn hallucination/citation semantics.
- Runner live evaluation cũ tiếp tục BLOCKED theo Đợt 7; không mở bypass Auth.

## FE và trải nghiệm

- Hook ở App giữ memory-tab; tối đa 6 lượt có server receipt. Transport gửi history
  cho question general/documents; không gửi property này với workspace/summary/
  course_info. Trước HTTP bỏ lượt cũ nếu JSON vượt character/byte cap, không sửa
  snapshot để làm khớp hash.
- Đổi mode/course/document hoặc New conversation xóa hội thoại/ngữ cảnh và thông
  báo tiếng Việt. Chỉ đổi tên trang/pageId cùng phạm vi không làm mất context.
  Document selection và draft giữ được khi đổi mode; nội dung hội thoại reset.
- AbortController + epoch chặn stale success/failure/finally, không để response
  cũ append hoặc mở khóa request mới. Reload mất lịch sử là giới hạn đã chấp nhận.
- AssistantPanel chỉ thay tối thiểu, commit riêng: nút New conversation, thông
  báo reset/missing receipt, sync scope và dọn preview/link nguồn cũ sau reset.
  Không đổi token màu, Poppins, animation, layout language hay chức năng voice.

## RED → GREEN và review

| Nhóm                          | RED đã quan sát                                | Kết quả tập trung sau sửa                   |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------- |
| Receipt outage                | 503 thay vì 200                                | 19/19                                       |
| HTTP history                  | 32 test mới fail trên DTO cũ; 19 test cũ xanh  | 51/51 trước guard sâu                       |
| Payload sâu 3000 cấp          | HTTP 500 thay vì 400                           | Được chặn trước transform; HTTP tổng 52     |
| Context helper                | Chưa có module                                 | 6 test ban đầu xanh sau thêm helper         |
| Query quá dài từ câu kế trước | Thiếu câu gần nhất                             | Test xanh sau chia ngân sách                |
| FE history/reset              | 16/16 fail trước thay hook                     | 22/22 cùng receipt transport cũ             |
| UI/transport                  | Chưa có New conversation; signal không truyền  | Xanh sau nối UI/transport                   |
| Link nguồn dự phòng           | 2/2 fail khi reset                             | Xanh sau source epoch/clear                 |
| Popup đã được browser cho mở  | Tab chưa đóng, URL cũ vẫn điều hướng sau reset | Xanh sau truyền signal và đóng tab đang chờ |

SQL ownership mới, boundary config/bytes, SDK mapping và offline cases có test
xanh ngay lần đầu trên implementation; đây là regression/additional coverage,
không nhận là TDD RED. Review dùng fresh-context agent trong session, không CLI/
model dịch vụ ngoài và không hỏi lại second opinion theo quyết định của Tài.

Mutation đã chạy thật, mỗi lần restore production code sau khi chứng minh đỏ:

- Bỏ predicate user receipt: HTTP foreign-user bị nhận 200, test đỏ.
- Bỏ kiểm document scope: HTTP khác document bị nhận 200, test đỏ.
- Bỏ neutralize marker: context helper đỏ vì còn marker cũ.
- Trả citation từ snapshot cũ thay current chunks: test metadata/chunk ID đỏ.

Lần chạy toàn bộ đầu tiên có fixture controller thiếu `verifyHistory` và các
assertion cũ đòi giữ hội thoại sau đổi mode. Đã cập nhật theo contract N1, không
nới kiểm tra quyền. Test unknown field cũ dùng `history: []`; nay đổi thành
`clientHistory: []` để tiếp tục kiểm whitelist đúng ý nghĩa.

## 10 tình huống offline

Corpus mới `apps/api/evaluation/conversation-cases.json`, phiên bản
`n1-offline-v1`; không sửa artifact/gold/run lịch sử Đợt 4.

| ID    | Tình huống                   | Phần xác định được                                              | Kết quả            |
| ----- | ---------------------------- | --------------------------------------------------------------- | ------------------ |
| N1-01 | Giải thích ý thứ hai         | Context question/answer hợp lệ, query đúng                      | PASS deterministic |
| N1-02 | So sánh phần trước           | Ghép tối đa 2 câu hỏi, không lấy answer làm query               | PASS deterministic |
| N1-03 | Còn môn đó                   | Receipt cùng course/document                                    | PASS deterministic |
| N1-04 | Sửa answer trong history     | Hash sai bị từ chối                                             | PASS deterministic |
| N1-05 | Dùng answer người khác       | Owner sai bị từ chối                                            | PASS deterministic |
| N1-06 | Nhớ bảy lượt                 | Vượt 6 bị từ chối                                               | PASS deterministic |
| N1-07 | Chỉ nhớ phần gần nhất        | Bỏ lượt cũ theo ngân sách                                       | PASS deterministic |
| N1-08 | Summary dài rồi hỏi tiếp     | Neutralize trước rút gọn có nhãn                                | PASS deterministic |
| N1-09 | Summary → hỏi ý thứ ba       | Receipt summary làm context trong cùng scope                    | PASS deterministic |
| N1-10 | Summary A → đổi B → hỏi tiếp | Carry history A bị chặn, context mới rỗng; hook test kiểm reset | PASS deterministic |

**Cả 10 semantic verdict đều PENDING_LIVE_B4**. Fake provider/offline tests không
được nâng thành semantic PASS hoặc gold. Không gọi Gemini thật.

## Baseline, gate cuối và bằng chứng

Baseline trước sửa: typecheck/test/build/format đều exit 0; API Vitest **198**,
API node:test **621**, web **265** = **1084**; DB **190**, skipped **0**.
Docker lúc baseline: **29.6.2 linux**; Node **v24.13.0** (chưa nâng runtime).

| Lệnh từ root            | Exit | Số liệu cuối                                                                      |
| ----------------------- | ---- | --------------------------------------------------------------------------------- |
| `npm run typecheck`     | 0    | API + web sạch                                                                    |
| `npm test`              | 0    | API Vitest 231/17 file, Node 655; web 286/15 file; tổng **1172**, fail/skip **0** |
| `npm run build`         | 0    | API Nest + web Vite thành công                                                    |
| `npm run format:check`  | 0    | Cả hai workspace sạch                                                             |
| `npm run test:database` | 0    | **207/207**, 10 suite tuần tự, skipped **0**                                      |

DB từng suite: **13 + 10 + 14 + 23 + 9 + 18 + 65 + 25 + 1 + 29 = 207**.
Log cuối ở `artifacts/phase9-20261015/final-{typecheck,test,build,format,database}.log`.
Output lược trích, không thay bằng số liệu dự đoán:

```text
API Vitest: Test Files 17 passed; Tests 231 passed
API node:test: tests 655; pass 655; fail 0; skipped 0
Web Vitest: Test Files 15 passed; Tests 286 passed
Last DB suite: tests 29; pass 29; fail 0; skipped 0
TYPECHECK=0  TEST=0  BUILD=0  FORMAT=0  DATABASE=0
```

Một lượt focused test popup dùng sai pattern nên lọc hết test (exit 0 nhưng
không có test chạy); **không tính là bằng chứng GREEN**. Đã chạy lại đúng tên:
1 pass/110 filtered, rồi toàn bộ web 286 pass, và root `npm test` 1172 pass,
không skip. Không bỏ qua suite nào trong gate cuối.

### Browser đã thao tác thật

Auth fixture local + DB riêng dùng-xong-bỏ + provider/embedding/Storage giả;
global fetch harness chặn mọi non-loopback destination. Không nhập password
Supabase hoặc đọc cookie/token. In-app browser dùng thay Chrome DevTools MCP
(không được cấu hình trong phiên này).

- Desktop **1440×900**: hỏi 3 lượt Documents, answer/fake-provider log nhận context
  **0 → 1 → 2**, tất cả `neutral: true`; expand không mất hội thoại.
- Đổi A sang B: hội thoại cũ biến mất, có thông báo reset. Bấm summary (không có
  history), hỏi tiếp ý thứ ba: lượt mới dùng 1 receipt summary cùng B.
- New conversation bằng Enter: conversation cũ biến mất. Reload: count conversation
  bằng 0; không tự phục hồi history từ storage.
- **375×812**: 3 lượt Documents dùng 0 → 1 → 2, Tab từ textarea tới Send, Enter
  gửi được; scrollWidth = viewport = **375px**, nút New conversation cao **46px**.
- General sau reload: lượt 0 → 1; feedback của lượt có context được nhận 201,
  UI hiện “Đã lưu phản hồi. Nhóm sẽ đối chiếu với nguồn trước khi cập nhật bộ
  kiểm thử.” Console đọc qua browser dev logs: **[]** ở warn/error.
- Một lần chờ locator acknowledgement dùng sai nguyên văn nên timeout; đọc lại
  DOM đã xác nhận đúng acknowledgement thực tế ở trên. Không gọi đó là lỗi app.
- Ảnh `artifacts/phase9-20261015/browser-desktop.png`, `browser-mobile.png`.
  Ảnh/log/harness ignored, không commit. Không kiểm điện thoại vật lý hoặc live Gemini.

Sau review cuối, chạy lại browser trên code đã commit: 3 lượt ở desktop và
375px đều 0→1→2; mở vùng PDF rồi New conversation làm cả conversation/source
region về count 0; đổi document ở mobile cũng reset. Console warn/error `[]`.
Ảnh bản cuối: `browser-final-desktop.png`, `browser-final-mobile.png` trong cùng
thư mục artifact. PDF region/iframe được quan sát; không nhận phép này là kiểm
ngữ nghĩa nội dung PDF hoặc thử mạng chậm/link hết hạn như Đợt 2.

### Cleanup đã thực hiện

Docker Engine tắt giữa các lượt tiếp tục, nên đã nhờ Tài bật lại và kiểm
`docker info`: `29.6.2 linux`. Chạy lại `test:database` thật, exit 0 như bảng trên.

- Server fixture mới: gọi stop endpoint loopback, HTTP 200, process exit 0;
  harness tự drop DB random của chính nó.
- Một DB browser fixture cũ còn lại sau lượt bị gián đoạn: chỉ chọn tên khớp
  `examate_phase9_browser_[a-f0-9]{32}_test`, xác minh current user sở hữu và
  không có connection, rồi `DROP DATABASE` không FORCE. Output
  `orphanedPhase9FixturesRemoved: 1`, exit 0. Chỉ mất dữ liệu giả; có thể tái tạo
  từ harness, không có dữ liệu thật và không chạm DB khác.
- Dừng Vite do agent khởi động; đóng tab test, reset viewport override.
- `docker compose -p examate-phase9-20261015 -f compose.local-db.yaml down`
  exit 0, đã xóa container/network của đúng stack. Không dùng `-v`, không xóa
  volume; không còn listener trên 3000/5173/55432, chỉ có socket TIME_WAIT.

Cleanup logs: `cleanup-database.log`, `cleanup-docker.log` (ignored).

## Commit và trạng thái bàn giao

Đợt 8 đã push tới `d15afea` trước baseline theo yêu cầu. Commit Đợt 9:

| Hash      | Phần                                                   |
| --------- | ------------------------------------------------------ |
| `aefb6cf` | Step 0: receipt outage không làm mất valid answer      |
| `1fc5ac7` | API/contracts/context budget, quyền và prompt boundary |
| `a4c72c1` | Regression HTTP và SQL ownership thật                  |
| `72aa5a9` | 10 case follow-up offline, semantic pending            |
| `3b2eae6` | Hook/transport/receipt-only memory và reset isolation  |
| `f86a7d8` | AssistantPanel/UI riêng, dọn source và hủy popup cũ    |

Commit tài liệu chứa chính báo cáo này đứng sau các commit trên. Không sửa hoặc
stage `docs/PHASE-4-RAG-EVALUATION-PROMPT.md` untracked có từ trước. Không thêm
attribution, không sửa `.claude/settings.json`, không push/merge main/deploy.
Push chỉ tới `origin/feature/tai-rag-integration` sau khi gate xanh và tracked
tree sạch; hash push cuối được báo ở lời bàn giao, không tự nhét hash của commit
tài liệu vào chính nội dung commit đó.

### Tái chạy

Từ repository root, không cần/cấm tự điền `.env` cloud cho các test này:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
docker compose -p examate-phase9-20261015 -f compose.local-db.yaml up -d --wait
$env:TEST_DATABASE_URL='postgresql://examate_test:local-test-only@127.0.0.1:55432/examate_test'
npm run test:database
docker compose -p examate-phase9-20261015 -f compose.local-db.yaml down
```

DB guard/harness chỉ dùng localhost/127.0.0.1 và test DB không trùng runtime;
auth schema là fixture, không phải Supabase Auth. Không xóa volume hoặc stack khác.

## Giới hạn và bước tiếp theo

- Receipt không lưu text và không có conversation chain: xác minh ownership/hash/
  scope của lượt đã trả, không chứng minh chronology hoặc quan hệ hội thoại.
  Tối đa 6 SELECT có chỉ mục, trong transaction; không truy vấn unbounded.
- Chưa persistence/retention/delete conversation, streaming, token/cost cap,
  least-privilege runtime role/RLS hoặc nghiệm thu Auth cloud. B3/B4 còn nguyên.
- Dữ liệu cũ không còn được truy xuất bởi retrieval ở scope mới, nhưng lịch sử đã
  trả trước đây vẫn là dữ liệu user từng được phép xem. Thu hồi/xóa document sau
  một answer không xóa nội dung đã tới browser; chưa làm quyền tái xác minh nội
  dung từng chunk cũ như một hệ thống DLP.
- Citation validator giữ nguyên giới hạn cấu trúc, không tự đánh giá factual
  entailment. B4 cần live follow-up đối chiếu từng câu/nguồn trước nghiệm thu chất lượng.
- TTS/STT do Thắng phụ trách; không sửa file voice hoặc tự triển khai thêm.

Nguồn kỹ thuật đã đối chiếu cho SDK/DTO/effect:
[Google GenAI Models](https://googleapis.github.io/js-genai/release_docs/classes/models.Models.html),
[Nest ValidationPipe](https://docs.nestjs.com/techniques/validation),
[React useEffect cleanup](https://react.dev/reference/react/useEffect).
