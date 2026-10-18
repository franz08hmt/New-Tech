# ExaMate — học code và vấn đáp cuối kỳ

Checkpoint 18/10/2026. Đây là bản gộp FE/BE/AI thay cho các hướng dẫn Homework cũ.
Đọc cùng source; cấu hình thực chạy có thể khác default/template.
[Trạng thái và việc còn lại](PROJECT-CONTEXT.md) · [Kịch bản demo](FINAL-DEMO-CHECKLIST.md).

## 1. Giải thích sản phẩm trong 45 giây

ExaMate là workspace học tập của nhóm: task, môn học, lịch thi, kế hoạch học,
chi tiêu và PDF. Điểm New Tech là RAG có nguồn, hội thoại có lịch sử được server
xác minh, SSE và STT Whisper ONNX local. Nhóm không train/fine-tune model.
AI Chat có kiến thức chung hoặc tài liệu; Hỏi workspace dùng SQL chỉ đọc,
không để LLM tự viết/chạy SQL. App local, chưa phải sản phẩm public an toàn.

## 2. Kiến trúc và đường đi dữ liệu

```text
React/Vite → /api → NestJS: Auth/CSRF/DTO + workspace/role
                     ├─ PostgreSQL: records, receipts, chunks + pgvector
                     ├─ private Storage: PDF bytes
                     ├─ Gemini: generation/embedding/OCR tùy chọn
                     └─ STT worker local: FFmpeg → Whisper ONNX CPU
```

Frontend hiển thị và kiểm tra nhanh; backend mới là ranh giới quyền.
DB giữ record/quan hệ/vector, Storage giữ PDF bytes; Notes ở browser không
tương đương dữ liệu đã sync. Không đưa server key vào frontend.

### File nên mở khi thầy hỏi

| Nội dung                    | Điểm mở source                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Layout, điều hướng, state   | `apps/web/src/App.tsx`, `TasksPanel.tsx`, `use-workspace.ts`                                         |
| Chat, race, draft           | `apps/web/src/use-assistant.ts`, `conversation.test.tsx`                                             |
| API helper/transport        | `apps/web/src/api.ts`; tìm transport/SSE trong `apps/web/src`                                        |
| DTO, service và controllers | `apps/api/src/tasks`, `documents`, `assistant`                                                       |
| DB/context                  | `apps/api/src/database`                                                                              |
| RAG                         | `document-ingestion.service.ts`, `document-chunker.ts`, `rag-retrieval.service.ts`, `rag-context.ts` |
| Contract                    | `packages/contracts/index.d.ts`                                                                      |
| Migration                   | `infra/postgres/init`, `infra/postgres/migrations`                                                   |
| Voice                       | `apps/api/src/speech`, `apps/api/scripts`; tìm `whisper\|chunk_length_s`                             |

Các tên rút gọn thuộc thư mục FE/BE tương ứng. Dùng tìm kiếm symbol; không học
thuộc số dòng vì số dòng đổi khi tích hợp.

## 3. Frontend: cần tự giải thích được

- **Component/props/state:** JSX chia màn hình; props truyền dữ liệu/hành động;
  state đổi làm render lại. Custom hook tách lifecycle/data logic khỏi giao diện.
- **Form controlled/uncontrolled:** label đúng input, trim/check sớm để hỗ trợ
  người dùng; backend vẫn validate độc lập. Không reset draft nếu gửi thất bại.
- **Effect và cleanup:** đồng bộ network/listener; abort/dọn tài nguyên khi đổi
  scope/unmount. State không phải persistence.
- **Race:** request A đang chờ, người dùng sửa thành B thì completion A không
  được xóa B; epoch/ownership chặn answer cũ về sau reset hoặc account swap.
  Không chỉ kiểm text bằng nhau; người dùng có thể sửa rồi quay lại cùng text.
- **UI theo role:** viewer ẩn/khóa ghi, member không có nút delete manager.
  Người dùng sửa DOM vẫn phải bị backend chặn.
- **Responsive/accessibility:** desktop/375px/viewport ngắn, focus/Tab/Escape,
  label, trạng thái lỗi, vùng cuộn và composer không bị keyboard che.
  Test emulated không thay nghiệm thu điện thoại vật lý.

Một thao tác task đi qua form → hook → API → Nest guard/DTO → service →
SQL parameterized → record thật → cập nhật state. Timeout không chứng minh
INSERT chưa commit; phải reload/đối chiếu trước gửi lại.

## 4. Backend và database

Controller xử lý HTTP; DTO kiểm kiểu/giới hạn/field lạ; service thực thi nghiệp vụ;
DI giúp thay provider/Storage/DB trong test. Nest ESM dùng import `.js` khi
compile NodeNext; HTTP tests chạy compiled JS để giữ decorator metadata.

SQL placeholder tách dữ liệu khỏi câu SQL, không ghép chuỗi client.
FK/composite FK giữ quan hệ course cùng workspace; transaction giữ các bước
DB nhất quán nhưng không tạo transaction phân tán với Storage/Google.

Workspace transaction dùng cùng connection, context transaction-local;
không dùng pooled SET tồn tại sang request sau. Kiểm membership/quyền lại ở
ranh giới cần thiết, giữ transaction ngắn; external calls ở ngoài.
COMMIT mất ACK có thể đã thành công: không đánh failed/xóa bù/retry mù;
probe phải authorize lại, unknown thì giữ dữ liệu và báo reconciliation.

Migration có thứ tự/checksum/advisory lock/transaction từng file. Không sửa
001–015 đã áp; thêm migration mới. Rollback không phải khôi phục dữ liệu mất;
backup public không gồm Auth/Storage/roles. Xem runbook trước tác vụ quản trị.

## 5. Auth, workspace và quyền

Supabase Auth giữ user trong `auth.users`, không cần tự tạo bảng account lưu
password. App dùng membership để gắn user với workspace và role; nickname/
ownerName không là danh tính. Session/CSRF/Origin được server kiểm tra.
401 không đủ tự kết luận thiếu Storage key: cần route, mã lỗi, Request ID,
account và project thực chạy, không thu thập mật khẩu/cookie.

| Hành động hiện có                           | manager | member | viewer |
| ------------------------------------------- | ------- | ------ | ------ |
| Đọc, preview/download, hỏi/summary/metadata | Có      | Có     | Có     |
| Tạo/sửa task, exam, plan, expense           | Có      | Có     | Không  |
| Upload/gán môn/index PDF                    | Có      | Có     | Không  |
| Xóa exam/plan/expense/document              | Có      | Không  | Không  |
| Feedback answer của chính mình              | Có      | Có     | Có     |

Courses chỉ GET; Tasks chưa DELETE: route không tồn tại không chứng minh 403.
No-membership không được vào workspace. ID khác workspace trả 404 chung.
RLS là lớp phòng vệ DB; role owner/BYPASSRLS có thể bỏ qua RLS.
Bằng chứng non-owner local **không** nghĩa runtime cloud đã least privilege.

Storage ký URL từ document đã authorize, không từ key client. Signed URL
60 giây có thể vẫn dùng sau revoke tới khi hết hạn. Bucket private không thay
Auth ở endpoint. SQL scope trong CTE nearest phải trước ORDER BY/LIMIT,
nếu lọc sau LIMIT thì workspace khác có thể chiếm hết ứng viên.

## 6. RAG khác chat thường và Hỏi workspace thế nào?

| Luồng       | Nguồn                            | Có gọi model?                                | Cách kiểm                           |
| ----------- | -------------------------------- | -------------------------------------------- | ----------------------------------- |
| General     | Kiến thức model + lịch sử hợp lệ | Generation                                   | Không nhận đã đọc PDF/workspace     |
| Documents   | Chunks PDF cùng workspace        | Query embedding + generation khi có evidence | Citation từ evidence lượt hiện tại  |
| Workspace   | Records/aggregate SQL scoped     | Không                                        | Intent giới hạn, nguồn record       |
| Course info | Metadata document-course         | Không generation                             | Phân biệt metadata với nội dung PDF |

**Lập chỉ mục:** authorize → claim → tải PDF → trích text từng trang →
đánh chất lượng/OCR tùy chọn → chunk có overlap → embedding →
ghi chunks/vector/trạng thái bằng transaction ngắn.

**Hỏi:** verify principal/history/scope → embedding query → nearest scoped →
lọc/scan giới hạn → dựng prompt với evidence → generation →
validate cấu trúc/marker/citation → quyền cuối lượt/receipt → trả UI.
Thiếu evidence thì từ chối, không đoán. File `ready` không bảo đảm mọi trang
đọc đúng hoặc mọi câu hỏi có đáp án.

Embedding mã hóa ngữ nghĩa thành vector, không tự sinh câu trả lời.
Schema hiện vector 768 chiều; cosine score không là xác suất đúng.
TopK/ngưỡng/scan/chunk overlap là heuristic cần đánh giá, không phải accuracy.
Đổi generation model cần test lại prompt/citation/quality/cost; đổi embedding
model thường phải re-embed corpus và kiểm dimension/không gian vector.

Citation hợp lệ về ID/page chỉ chứng minh nguồn có trong evidence, không
chứng minh từng claim được nguồn hỗ trợ. PDF/prompt injection là input không
tin cậy; prompt/validator giảm rủi ro, không bảo đảm miễn nhiễm.

## 7. SSE, hội thoại và feedback

SSE truyền một chiều từ server qua response HTTP; client dùng fetch vì route
POST có session/CSRF. Parser phải chịu frame bị chia, UTF-8 nhiều byte và hủy.
General phát delta; documents **không phát answer text trước validator/quyền**;
workspace chỉ trạng thái rồi SQL result. Stream mượt không chứng minh nhanh
hơn về tổng thời gian hoặc chất lượng model. Hủy local không bảo đảm upstream
ngừng tính phí request đã nhận.

Receipt server gắn user/workspace/request/hash snapshot, không lưu text chat.
N1 gửi tối đa 6 lượt gần nhất có receipt; server kiểm user/workspace/mode/
course/document/hash trước provider. Câu trả lời cũ chỉ là ngữ cảnh, marker
nguồn cũ được trung tính hóa; citation chỉ trỏ evidence mới.
History ở bộ nhớ tab, reload mất; đổi scope/New conversation reset.
Summary/course_info không nhận history nhưng receipt kết quả có thể làm
ngữ cảnh hỏi tiếp trong cùng phạm vi.

Receipt lỗi 5xx sau answer hợp lệ: vẫn hiện answer, không receipt/history/
feedback; lỗi quyền 4xx vẫn chặn. Feedback kiểm ownership/hash/idempotency,
viewer được phản hồi answer của mình. “Hữu ích/Chưa đúng” tạo candidate
**UNREVIEWED**, không tự thành đáp án đúng, gold hoặc semantic PASS.

## 8. STT và điểm New Tech

Whisper small ONNX đa ngôn ngữ chạy local CPU/q8 trong worker Node.
FFmpeg kiểm/chuyển media về WAV mono16k; giới hạn bytes/duration/concurrency.
Bản ghi 31–60 giây dùng cửa sổ 30 giây overlap5 để không bỏ phần cuối.
Không tự gửi transcript, người dùng sửa/chèn/gửi chủ động.
Audio tạm được dọn; không ghi transcript/audio vào DB/Storage/browser storage.

Local STT không đồng nghĩa cả app offline: Supabase/Gemini vẫn cần network.
Không train Whisper; chưa benchmark microphone/accuracy/latency thực.
STT default off, audit còn finding; hướng dẫn kỹ thuật:
[STT setup](STT-SETUP-VI.md). TTS không được coi đã nghiệm thu chỉ vì có STT.
PWA/WASM/mobile app riêng là hướng tiếp theo, chưa gắn nhãn đã triển khai.

## 9. Tester sẽ hỏi gì?

- Unit/mock chứng minh logic; HTTP test chứng minh pipeline; DB disposable
  chứng minh SQL/RLS/constraint; browser fixture chứng minh UI.
  Không lớp nào tự thay chứng cứ Auth/model/cloud trên máy Thắng.
- RED phải fail đúng bug trước sửa; mutation bỏ guard phải làm test đỏ rồi
  restore xanh. Test đếm nhiều không bảo đảm không còn bug.
- Chất lượng RAG cần case/corpus cố định, fact/page gold và human review từng
  claim. Offline exit0 không phải semantic PASS; live runner đang BLOCKED
  vì chưa có principal. Xem [evaluation](evaluation-plan.md).
- Không nói miễn phí/vô hạn, giá/model tối ưu, đã deploy hoặc chính xác100%.
  Giá/quota/model availability kiểm nguồn chính thức sát ngày báo cáo,
  không học thuộc con số cũ. API key chỉ backend; không mở .env khi trình bày.

## 10. Tự kiểm trước vấn đáp

Mỗi người tự lần theo một request thật, giải thích một test bắt bug và một
trade-off; ghi rõ phần mình làm, phần tích hợp và AI hỗ trợ.
Chuẩn bị trả lời: vì sao cần Nest khi có Supabase; RAG không phải training;
SSE khác WebSocket; receipt hash không bảo chứng fact; DB owner bỏ qua RLS;
COMMIT unknown vì sao không retry mù; STT local khác toàn app offline.
Không dùng bảng số test lịch sử thay lần chạy mới.
