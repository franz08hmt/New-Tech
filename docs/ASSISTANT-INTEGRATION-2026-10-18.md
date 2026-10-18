# Tích hợp Tài + Thắng — 18/10/2026

## Kết luận và checkout tiếp tục

Đây là checkpoint tích hợp local, không phải nghiệm thu toàn app hoặc release.
Phát triển tiếp trên `feature/tai-assistant-integration-20261018`, tại
`D:\New-Tech\Final-Project-integration-20261018`. Không pull/merge bản remote
đè lên checkout cũ đang có WIP. Chưa push, không merge main hoặc deploy.

Git thực tế phân kỳ từ `ff25255`, không phải Thắng xóa lịch sử của Tài:

| Phía         | HEAD đầu lượt | Commit riêng được giữ                                                                                               |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tài local    | `8b62f1a`     | 10 commit Đợt 14–16: ingestion, reconciliation, retrieval và receipt/feedback context, positive/shared-corpus tests |
| Thắng remote | `2249abf`     | `917edc7` STT local; `b988e26` chọn ngôn ngữ; `2249abf` SSE/UI                                                      |

Merge giữ cả hai parent, không squash/cherry-pick để làm mất quan hệ lịch sử.
Conflict văn bản duy nhất là `apps/api/package.json`, ở danh sách test. Đã giữ
toàn bộ test Tài, thêm test/lệnh STT và concurrency 2 của Thắng; không bỏ DB suites.
Nhưng merge văn bản sạch **không** đồng nghĩa tương thích hành vi.

## Quyết định tích hợp

- Giữ UI hai tầng: AI Chat → Kiến thức chung/Tài liệu; Hỏi workspace riêng.
  Backend vẫn có đúng ba mode `general`, `documents`, `workspace`. Không gộp RAG
  vào kiến thức chung hoặc đưa dữ liệu workspace cho model.
- Giữ SSE thật cho general, có Dừng trả lời. Documents giữ kết nối SSE nhưng chỉ
  gửi status rồi `done` sau khi **toàn bộ citation validator và quyền cuối lượt**
  đã qua; không phát claim tài liệu chưa xác minh. Workspace gửi status rồi kết quả
  SQL, không mô phỏng token. Summary/course_info giữ JSON như trước.
- Giữ N1: receipt/history đã xác minh, loại marker nguồn cũ, ngân sách ngữ cảnh,
  draft revision, epoch/abort/reset và feedback ownership của Tài.
- Giữ Whisper small local, ngôn ngữ tự động/Việt/Anh, xem/sửa transcript rồi mới
  chèn câu hỏi. Không tự gửi transcript, không gọi cloud STT hoặc tải weights.
- Không sửa migration, thuật toán retrieval/chunking/embedding/OCR, score/topK,
  scan policy, prompt hoặc citation validator của Tài/Thắng. Golden hiện có vẫn là
  ranh giới regression; thay đổi dưới đây nằm ở transport/authorization/STT.

## Lỗi được tìm thấy và sửa

| Vấn đề                                                                      | Tích hợp an toàn                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Streaming gọi membership trực tiếp ngoài workspace transaction              | Dùng lại helper authorize ngắn của Tài; provider vẫn ngoài transaction                                    |
| Text RAG có thể lộ trước khi citation bị từ chối hoặc membership bị thu hồi | Buffer document answer; chỉ controller phát done sau receipt authorization; test DB revoke giữa các chunk |
| Marker bị chia ngay sau `[` lọt qua filter                                  | Giữ suffix `[` ở filter; kiểm mọi vị trí chia marker; filter không được dùng thay validator               |
| Early return từ generator để upstream tiếp tục chạy                         | Abort provider trước cleanup; xử lý cleanup reject mà không chờ vô hạn                                    |
| Client ngừng đọc SSE nhưng không đóng socket                                | Drain deadline 15 giây; abort/destroy, dọn listener/timer                                                 |
| Omitted mode được controller hiểu documents nhưng service từ chối           | Chuẩn hóa mode trước dispatch                                                                             |
| No-evidence SSE với history mất context accounting                          | Giữ contextTurnsUsed/contextTruncated/promptVersion; không gọi provider                                   |
| SSE error mất request ID                                                    | FE giữ X-Request-ID để đối chiếu log                                                                      |
| Frame đủ delimiter vượt giới hạn lọt qua parser                             | Kiểm byte UTF-8 của cả frame hoàn chỉnh và pending; giữ exact-limit LF/CRLF                               |
| Inline textarea 96px thắng CSS short-screen 56px                            | Theo computed CSS min/max, cập nhật khi resize; composer có scroll/cap riêng                              |
| FFmpeg/ffprobe bỏ qua SIGTERM có thể giữ admission vô hạn                   | Escalate SIGKILL sau 250ms, không gia hạn timer khi nhận lỗi lặp                                          |
| Fake worker test tưởng model_error đồng nghĩa process đã close              | Kiểm hai trạng thái tách biệt bằng close event điều khiển được; không sửa runtime đúng hoặc thêm retry    |
| BroadcastChannel native xuyên các Vitest threads                            | Cô lập channel trong pilot-access fixture; vẫn kiểm thông báo đổi phiên làm khóa gate                     |
| Test polling chuyển fake timer sau khi đã tạo real timer                    | Giữ timer clock từ trước retry; kiểm loading ở 999ms và ready ở 1000ms, không kéo dài timeout/retry       |
| Upload âm thanh tới 60 giây nhưng Whisper mặc định cắt sau 30 giây          | Truyền chunk_length_s=30, stride_length_s=5; regression 31/60 giây và cả ba lựa chọn ngôn ngữ             |

TDD đã quan sát RED cho các regression có lỗi; test bổ sung xanh từ đầu không
được gọi là RED. Review độc lập BE/FE/STT đã kiểm cả bản ban đầu và bản vá.
Không dùng số test hay ảnh lịch sử Đợt 16 làm kết quả mới.

## Kiểm chứng của lượt này

Kết quả dưới đây từ lệnh chạy mới trên chính checkout này. Artifacts/log không
commit, không chứa .env thật. Không lấy số đã chạy trước làm một lần chạy mới.

| Kiểm tra                                          | Kết quả                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| npm ci --ignore-scripts --no-audit --no-fund      | Exit 0; lockfile tái lập, không sửa tay                                                                                           |
| typecheck / test / build / format:check           | Cả bốn exit 0; API Vitest 288 + Node 829 + web 370 = **1.487 pass**, không fail/skip/cancelled                                    |
| PostgreSQL 17 disposable, toàn bộ test:database   | Exit 0; **379/379 pass**, 23 suite, không fail/skip/cancelled                                                                     |
| DB HTTP SSE tập trung                             | 7/7 pass; runtime non-owner/NOBYPASSRLS, hai tenant/user; receipt/hash/history/feedback ownership; revoke không text/done/receipt |
| Docker API build                                  | Exit 0, Node 24.22.0; scripts-disabled install/prune, không copy .env/secrets/artifacts                                           |
| Native imports trong container --network none     | ONNX/Sharp/Transformers import thành công; không tạo inference session/model                                                      |
| Media thật trong container --network none         | 5/5: WAV, WebM, MP4/AAC, duration/silence/truncated, cancel                                                                       |
| Browser thật qua IAB, Auth/provider fixture local | General SSE, Dừng, draft giữ, New conversation, feedback lưu; 1440px/375px và 320×320                                             |

Browser: 375px không tràn ngang. 320×320 textarea theo CSS 56px, composer cuộn
được, Gửi/Dừng vẫn thao tác được. Viewport ngắn chỉ mô phỏng hạn chế chiều cao,
không phải thử bàn phím trên điện thoại thật. Console inspection cuối không có
warn/error được ghi nhận. Harness browser dùng Auth/DB/provider giả trong bộ nhớ;
các panel nghiệp vụ ngoài Assistant không phải đối tượng nghiệm thu ở harness
này. Chứng minh non-owner/RLS thuộc DB tests riêng, không lấy browser fixture
làm bằng chứng RLS. Không thử microphone/Whisper weights, PDF browser mới hoặc
semantic Gemini thật trong lượt này.

Artifacts chính: `artifacts/integration-20261018/` (harness/ảnh desktop,375,320),
các `integration-*.log` và audit JSON trong artifacts sau bàn giao. Các test mới
có trong source, có thể chạy lại không cần artifact cũ.

Lệnh kiểm DB (DB dùng-xong-bỏ, không .env cloud):

```powershell
docker compose -p examate-integration-20261018 -f compose.auth-pg17-test.yaml up -d --wait
$env:TEST_DATABASE_URL='postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test'
npm run typecheck
npm run test
npm run build
npm run format:check
npm run test:database
docker compose -p examate-integration-20261018 -f compose.auth-pg17-test.yaml down
```

DB suite giữ guard loopback/disposable; fixtures tạo rồi dọn đúng database/role
của mình. Không chạy migration/rollback lên Supabase dùng chung.

Cleanup cuối: API/Vite fixture và tab browser đã dừng/đóng; port 3000/5173 không
còn listener của lượt này. Catalog của container test chỉ còn `examate_test` và
`postgres` (ngoài template), không còn database riêng của test case. Đã chạy
compose down đúng project `examate-integration-20261018`, không dùng `-v`; giữ
volume disposable và image/cache build local để tái kiểm, không xóa dữ liệu khác.

## Dependency/model: còn giới hạn, không gọi là đã an toàn hoàn toàn

`npm audit --omit=dev --json` ngày 18/10 báo **6 package entries: 2 high,
4 moderate**, không phải sáu lỗ hổng độc lập: có hai leaf bị advisory
(`sharp`, `sprintf-js`) và các parent bị lan truyền (`transformers`, ONNX,
global-agent, roarr). Audit chưa sạch.

- Sharp được Transformers import/load, nhưng đường Whisper hiện nhận WAV chuẩn
  → Float32Array → feature extractor số học; review không tìm thấy image decode
  ở request path đó. Đây là bằng chứng reachability có giới hạn, không chứng
  minh không thể khai thác.
- Chuỗi global-agent/roarr/sprintf được ONNX dùng trong install script đã kiểm,
  không thấy ở runtime entry. Cài/prune với `--ignore-scripts` để không chạy
  nhánh này hoặc tự tải CUDA không dùng. Giữ optional CPU binaries, ffmpeg,
  libgomp1; đã kiểm native imports trên Windows và Linux image.
- npm đề nghị nâng major Transformers 4.3.1. Không tự nâng major, thêm override,
  hoặc audit fix --force trong merge. Giữ STT mặc định tắt. Thắng/Tài cần một
  lát dependency remediation riêng, kiểm lại trước khi bật STT cho pilot/mở
  image input; ngày review lại chậm nhất **25/10/2026**.
- Host test Node 24.13.0/npm11.6.2 có EBADENGINE với một số tooling; gates chạy
  được không đồng nghĩa phiên bản host được các package hỗ trợ. Nên đồng bộ
  Node24 phù hợp engines (README yêu cầu24.15+); không sửa Node máy người dùng.

`gemini-3.5-flash-lite` là model code hợp lệ trong
[tài liệu Google](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
Giữ thay đổi template của Thắng, không tự sửa .env thật. Fallback code khi thiếu
GEMINI_MODEL vẫn như Tài trước merge (2.5); template và .env cũ không tự đồng bộ.
Không tuyên bố nhanh/chính xác hơn trên corpus nhóm khi chưa chạy live evaluation.
Giữ prompt/validator, không dùng đổi model để bỏ qua semantic RAG acceptance.

## WIP, Git và cách tiếp tục

Checkout cũ `D:\New-Tech\Final-Project` vẫn trên `feature/tai-rag-integration`,
HEAD `8b62f1a`. Bảy WIP cũ không đưa vào nhánh mới hoặc commit. Có một lần merge
đầu bị Git từ chối ở checkout cũ do README đang sửa; merge thành công chỉ làm
ở worktree mới. Lần bị từ chối đã chuẩn hóa EOL của README/HANDOFF sang CRLF;
đã xác minh nội dung LF khớp SHA-256 ban đầu rồi phục hồi đúng bytes gốc. Trước
bàn giao kiểm lại HEAD/index/status và cả bảy SHA-256; không stash/reset WIP.

Nhánh tích hợp có checkpoint docs riêng; không sao chép/ghi đè bản README hoặc
handoff đang sửa ở folder cũ. Không có .env thật, secrets, private account
mapping, credentials hoặc weights trong checkout mới. Khi chuyển IDE, mở đúng
folder mới; cấu hình .env qua kênh/file private, dùng lại giá trị nhóm đã chốt,
không tự tạo lại workspace/session key/user, không paste secrets vào chat/Git.

Tiếp tục theo roadmap, không đánh dấu hoàn tất B1/B2/B3/B4 chỉ vì merge/test
xanh: Auth máy Thắng, production grants/RLS toàn app, budget AI, live RAG/eval
runner Auth và chất lượng STT thật vẫn cần bằng chứng riêng. Lát hợp lý kế tiếp:
dependency STT/acceptance audio thật, rồi phần B2 còn lại và budget theo roadmap;
không mở tính năng mới để che thiếu nghiệm thu.
