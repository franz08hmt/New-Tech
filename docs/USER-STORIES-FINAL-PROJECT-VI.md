# User Stories - ExaMate AI

**Cơ sở:** yêu cầu Final Project Assignment 2026-2027 và checkpoint code tại ngày
18/10/2026. Nhánh phát triển hiện tại là `feature/tai-assistant-integration-20261018`;
đối chiếu [context](PROJECT-CONTEXT.md) và [báo cáo tích hợp](ASSISTANT-INTEGRATION-2026-10-18.md).
Tài liệu ghi cả tiêu chí sản phẩm cần đạt lẫn trạng thái triển khai; có code không
đồng nghĩa đã nghiệm thu trên môi trường demo.

## 1. Người dùng và vấn đề

ExaMate AI hướng tới sinh viên cần gom lịch học, bài cần làm, kỳ thi và tài liệu môn học vào một workspace. Khi sinh viên hỏi về tài liệu, trợ lý cần tìm câu trả lời trong tài liệu nhóm đã tải lên, đưa nguồn để kiểm chứng và từ chối khi không đủ bằng chứng. Sinh viên cũng có thể hỏi về dữ liệu lịch học của workspace và nhập câu hỏi bằng giọng nói.

Các vai trò hiện có trong code là `manager`, `member` và `viewer`. Trong tài liệu yêu cầu cuối kỳ, có thể trình bày `manager` tương ứng vai trò admin của workspace, `member` tương ứng user có quyền ghi, còn `viewer` là vai trò chỉ đọc bổ sung. Cần phân biệt admin theo workspace với quản trị viên toàn hệ thống.

## 2. Cách đọc trạng thái

- **Có trong code:** luồng và kiểm thử tương ứng có trong repo; vẫn cần chạy lại trên bản demo cuối.
- **Một phần:** có luồng cơ bản nhưng chưa đủ toàn bộ tiêu chí chấp nhận hoặc yêu cầu của thầy.
- **Chưa có:** chưa tìm thấy endpoint/UI/test triển khai trong repo.
- Acceptance criteria bên dưới là tiêu chí đích để nghiệm thu; trạng thái hiện tại không làm giảm yêu cầu đó.

## 3. User stories và acceptance criteria

### US-01 - Đăng nhập an toàn

**Là** sinh viên đã được mời vào workspace, **tôi muốn** đăng nhập bằng OAuth2 và có phiên được backend xác minh, **để** chỉ người dùng hợp lệ mới xem được dữ liệu học tập.

- **AC-01.1:** Given tài khoản được cấp quyền, when tôi đăng nhập qua nhà cung cấp OAuth2 được chọn, then backend xác minh danh tính và tạo phiên hợp lệ.
- **AC-01.2:** Given thông tin đăng nhập sai, phiên hết hạn hoặc Auth không khả dụng, when tôi đăng nhập hoặc mở workspace, then ứng dụng báo trạng thái dễ hiểu và không tải dữ liệu được bảo vệ.
- **AC-01.3:** Given tôi đăng xuất, when yêu cầu đăng xuất hoàn tất, then phiên cũ không còn được dùng để gọi API bảo vệ.
- **Hiện trạng:** **Một phần.** Có Supabase Auth đăng nhập email/mật khẩu, session cookie do backend quản lý, refresh/logout và CSRF. Chưa có luồng OAuth2 Google/GitHub/Facebook; API dùng cookie phiên opaque thay vì JWT bearer flow ở ứng dụng. Cần thống nhất với yêu cầu OAuth2 + JWT của thầy.

### US-02 - Quản lý người dùng và phân quyền workspace

**Là** admin của workspace, **tôi muốn** cấp, thu hồi và thay đổi vai trò thành viên, **để** mỗi người chỉ có quyền cần thiết.

- **AC-02.1:** Given tôi là admin, when tôi mời hoặc thu hồi một thành viên, then quyền có hiệu lực ở các yêu cầu tiếp theo.
- **AC-02.2:** Given một người dùng là member hoặc viewer, when người đó tự gửi workspace/role khác trong body, header hoặc query, then backend bỏ qua dữ liệu tự khai và chỉ dùng principal đã xác minh.
- **AC-02.3:** Given viewer, member hoặc admin, when họ đọc/ghi/xóa dữ liệu, then quyền tuân theo vai trò; người ngoài workspace không thể đọc hoặc sửa bản ghi.
- **Hiện trạng:** **Một phần.** Các API nghiệp vụ có scope theo principal và có kiểm thử quyền; vai trò hiện tại là manager/member/viewer. Chưa thấy giao diện/API quản lý thành viên cho admin. Tài liệu dự án cũng ghi cơ chế DB least-privilege/RLS và xác minh Auth production chưa hoàn tất; chỉ dùng dữ liệu demo cho tới khi nghiệm thu.

### US-03 - Xem môn học

**Là** sinh viên, **tôi muốn** xem danh sách môn và thông tin từng môn, **để** liên kết kỳ thi, kế hoạch ôn và tài liệu với đúng môn.

- **AC-03.1:** Given workspace có môn học, when tôi mở trang Courses, then tôi thấy danh sách môn với mã và thông tin tóm tắt.
- **AC-03.2:** Given tôi chọn một môn, when trang chi tiết mở, then các mục liên quan được hiển thị trong đúng ngữ cảnh môn.
- **AC-03.3:** Given môn không tồn tại hoặc không thuộc workspace, when tôi mở môn đó, then API trả trạng thái không tìm thấy an toàn.
- **Hiện trạng:** **Có trong code cho đọc danh sách/chi tiết.** Course catalog hiện không có endpoint tạo, sửa hoặc xóa môn.

### US-04 - Quản lý công việc học tập

**Là** sinh viên, **tôi muốn** tạo, xem, cập nhật và hoàn tất công việc kèm hạn chót, **để** theo dõi việc cần làm của nhóm.

- **AC-04.1:** Given dữ liệu task hợp lệ, when tôi tạo task, then task được lưu bền vững và xuất hiện trong danh sách workspace.
- **AC-04.2:** Given task tồn tại, when tôi đổi trạng thái, then trạng thái mới được lưu; dữ liệu không hợp lệ bị từ chối.
- **AC-04.3:** Given tôi không có quyền ghi hoặc task thuộc workspace khác, when tôi cập nhật/xóa task, then thao tác bị từ chối mà không tiết lộ dữ liệu ngoài phạm vi.
- **AC-04.4:** Given tôi có quyền quản lý task, when tôi sửa hoặc xóa task, then thay đổi được phản ánh sau khi tải lại.
- **Hiện trạng:** **Một phần.** Có tạo/list task và cập nhật trạng thái; chưa thấy API sửa toàn bộ trường task hoặc xóa task.

### US-05 - Theo dõi kỳ thi và kế hoạch ôn tập

**Là** sinh viên, **tôi muốn** quản lý kỳ thi và các mục cần ôn theo môn, **để** biết nội dung nào cần chuẩn bị và tiến độ của mình.

- **AC-05.1:** Given môn học hợp lệ, when tôi tạo hoặc cập nhật kỳ thi, then ngày, chủ đề và thông tin liên quan được lưu và hiển thị trong lịch/danh sách.
- **AC-05.2:** Given kỳ thi hoặc kế hoạch ôn đã tồn tại, when tôi đánh dấu mục ôn hoàn tất hoặc xóa mục theo quyền, then tiến độ được lưu đúng.
- **AC-05.3:** Given viewer, when tôi thử tạo/sửa/xóa, then backend từ chối theo vai trò.
- **AC-05.4:** Given trợ lý đưa ra gợi ý ôn tập, when gợi ý chưa được tôi xác nhận, then ứng dụng không tự ý ghi hoặc thay đổi kế hoạch.
- **Hiện trạng:** **Có trong code cho các thao tác đã hỗ trợ.** Exams có tạo, đọc, sửa và xóa; study plans có tạo, đọc, đánh dấu completion và xóa. Chưa thấy trợ lý tự tạo kế hoạch ôn bằng AI.

### US-06 - Ghi nhận chi phí học tập

**Là** sinh viên, **tôi muốn** ghi và xem các khoản chi theo danh mục/môn, **để** theo dõi ngân sách học tập.

- **AC-06.1:** Given khoản chi hợp lệ, when tôi thêm khoản chi, then số tiền, mô tả, danh mục và ngày được lưu.
- **AC-06.2:** Given các khoản chi đã lưu, when tôi mở trang tài chính, then tổng quan và danh sách phản ánh dữ liệu hiện có.
- **AC-06.3:** Given quyền phù hợp, when tôi xóa một khoản chi, then khoản chi bị xóa; viewer hoặc người khác workspace không thể thực hiện.
- **AC-06.4:** Given tôi cần sửa một khoản chi, when tôi cập nhật trường của khoản chi, then hệ thống lưu thay đổi và hiển thị dữ liệu mới.
- **Hiện trạng:** **Một phần.** Có tạo/list/xóa và giao diện ngân sách; chưa thấy endpoint sửa khoản chi, cũng chưa đủ tìm kiếm/lọc/sắp xếp/phân trang theo yêu cầu chung.

### US-07 - Tải và lập chỉ mục tài liệu môn học

**Là** sinh viên có quyền ghi, **tôi muốn** tải PDF, gắn tài liệu với môn và lập chỉ mục, **để** trợ lý có thể tìm câu trả lời trong tài liệu của nhóm.

- **AC-07.1:** Given tệp PDF hợp lệ, when tôi tải lên và chọn môn (nếu có), then metadata/tệp được lưu và trạng thái xử lý được hiển thị.
- **AC-07.2:** Given tài liệu chưa lập chỉ mục hoặc xử lý thất bại, when tôi yêu cầu xử lý lại, then ứng dụng báo trạng thái thật và không giả vờ tài liệu đã sẵn sàng.
- **AC-07.3:** Given tôi là viewer, when tôi xem hoặc tải tài liệu, then thao tác chỉ đọc được phép; tải lên, gắn môn, lập chỉ mục và xóa tuân theo quyền.
- **AC-07.4:** Given tệp sai loại, vượt giới hạn hoặc không thuộc workspace, when tôi tải lên, then API từ chối an toàn trước khi ghi dữ liệu ngoài phạm vi.
- **Hiện trạng:** **Có trong code.** Có upload PDF, xử lý nội dung/chunks/embeddings, gắn môn, trạng thái, tải xuống có kiểm tra quyền và xóa theo vai trò. OCR là tùy chọn và mặc định tắt.

### US-08 - Hỏi đáp RAG có dẫn nguồn

**Là** sinh viên, **tôi muốn** hỏi nội dung bài giảng và nhận câu trả lời có nguồn, **để** kiểm chứng được câu trả lời thay vì nhận nội dung AI không có căn cứ.

- **AC-08.1:** Given tài liệu đã lập chỉ mục trong phạm vi được phép, when tôi hỏi câu có đáp án trong tài liệu, then hệ thống truy xuất bằng chứng và trả lời kèm nguồn/trang tương ứng.
- **AC-08.2:** Given không có đủ bằng chứng, when tôi hỏi, then trợ lý nói chưa đủ dữ liệu và không bịa câu trả lời hoặc citation.
- **AC-08.3:** Given model trả citation không thuộc bằng chứng truy xuất, when backend kiểm tra response, then citation đó bị loại/từ chối.
- **AC-08.4:** Given tài liệu hoặc môn ngoài quyền của tôi, when câu hỏi được xử lý, then nội dung ngoài phạm vi không được đưa vào retrieval.
- **Hiện trạng:** **Có trong code; chất lượng cuối kỳ chưa được nghiệm thu.** Có chunking, embeddings, vector retrieval, kiểm chứng citation và từ chối khi retrieval rỗng. Báo cáo evaluation hiện có 24 case, nhưng live subset gần nhất có 4 case `REVIEW_REQUIRED`, 1 `BLOCKED`, chưa có người ký semantic review; chưa thể báo pass rate cuối cùng.

### US-09 - Hỏi dữ liệu trong workspace

**Là** sinh viên, **tôi muốn** hỏi về task, kỳ thi, kế hoạch ôn và các bản ghi của nhóm bằng ngôn ngữ tự nhiên, **để** tìm thông tin nhanh mà không mở từng trang.

- **AC-09.1:** Given câu hỏi khớp một loại dữ liệu được hỗ trợ, when tôi hỏi Assistant ở chế độ Workspace, then ứng dụng trả lời từ truy vấn có kiểm soát trên dữ liệu workspace và liên kết tới bản ghi liên quan.
- **AC-09.2:** Given câu hỏi mơ hồ hoặc tên môn không khớp, when tôi hỏi, then hệ thống yêu cầu làm rõ hoặc báo không tìm thấy thay vì đoán.
- **AC-09.3:** Given dữ liệu bản ghi chứa nội dung không đáng tin, when câu hỏi được xử lý, then nội dung đó không thể biến thành chỉ thị để thay đổi dữ liệu.
- **Hiện trạng:** **Có trong code dưới dạng truy vấn đọc xác định.** Workspace Assistant không gọi LLM hoặc gọi tool từ LLM; nó phân loại intent và đọc dữ liệu bằng code. Không nên trình bày tính năng này như một tool-using agent.

### US-10 - Nhập câu hỏi bằng giọng nói

**Là** sinh viên, **tôi muốn** đọc câu hỏi bằng tiếng Việt hoặc tiếng Anh và chọn Auto/ Tiếng Việt/ English, **để** nhập câu hỏi nhanh mà vẫn kiểm tra được bản chép.

- **AC-10.1:** Given tôi cấp quyền microphone, when tôi ghi âm rồi dừng, then ứng dụng chuyển audio thành bản chép theo ngôn ngữ đã chọn.
- **AC-10.2:** Given bản chép xuất hiện, when tôi xem/sửa và bấm chèn, then nội dung vào ô câu hỏi; ứng dụng không tự gửi câu hỏi.
- **AC-10.3:** Given tôi hủy ghi âm, model chưa sẵn sàng hoặc audio không hợp lệ, when thao tác kết thúc, then không gửi transcript dở dang và hiển thị trạng thái/lỗi dễ hiểu.
- **Hiện trạng:** **Có trong code.** STT chạy local bằng Whisper small ONNX CPU q8; có Auto, Tiếng Việt và English; transcript có thể sửa trước khi chèn. Transcript không được lưu như một bản ghi độc lập; khi người dùng gửi câu hỏi, nội dung được dùng trong luồng Assistant.

### US-11 - Tìm kiếm, lọc, sắp xếp và phân trang

**Là** sinh viên, **tôi muốn** tìm và lọc task, môn, kỳ thi, kế hoạch, tài liệu và khoản chi, **để** đến đúng dữ liệu nhanh khi workspace lớn dần.

- **AC-11.1:** Given dữ liệu ở nhiều loại bản ghi, when tôi tìm theo từ khóa, then kết quả khớp tên hoặc thông tin liên quan và dẫn tới đúng bản ghi.
- **AC-11.2:** Given nhiều kết quả, when tôi lọc theo loại, môn, trạng thái hoặc khoảng ngày, then chỉ các bản ghi thỏa điều kiện được hiển thị.
- **AC-11.3:** Given nhiều kết quả, when tôi chọn trường/thứ tự sắp xếp hoặc trang, then kết quả ổn định và không bỏ sót/nhân đôi bản ghi.
- **AC-11.4:** Given workspace của tôi, when tôi tìm kiếm, then kết quả chỉ chứa bản ghi mà principal hiện tại được phép đọc.
- **Hiện trạng:** **Một phần.** Có global keyword search phía frontend, bỏ dấu tiếng Việt, nhóm kết quả và giới hạn 12 kết quả; chưa thấy filter đầy đủ, sort tùy chọn, phân trang hoặc API search có phân trang.

### US-12 - Nhận câu trả lời theo thời gian thực

**Là** sinh viên, **tôi muốn** thấy câu trả lời AI xuất hiện dần khi đang được tạo, **để** biết hệ thống còn hoạt động và đọc kết quả sớm hơn.

- **AC-12.1:** Given câu hỏi hợp lệ, when model tạo câu trả lời, then giao diện nhận nội dung theo luồng (SSE/WebSocket hoặc cơ chế tương đương) và hiển thị tiến độ.
- **AC-12.2:** Given tôi hủy hoặc kết nối lỗi, when stream dừng, then giao diện giữ trạng thái rõ ràng và không hiển thị câu trả lời hoàn chỉnh giả.
- **AC-12.3:** Given câu trả lời hoàn tất, when backend xác thực nội dung/nguồn, then giao diện hiển thị cùng các citations đã kiểm tra.
- **Hiện trạng:** **Chưa có streaming chat.** `POST /api/assistant/chat` trả JSON sau khi xử lý xong. STT microphone là một tính năng thiết bị hiện đại, nhưng không thay thế yêu cầu chức năng real-time/streaming trong phần Functional Requirements.

### US-13 - An toàn AI và xử lý lỗi

**Là** sinh viên, **tôi muốn** trợ lý xử lý an toàn nội dung độc hại, câu hỏi ngoài phạm vi và lỗi model, **để** không bị dẫn dắt bởi prompt injection hoặc nhận kết quả sai mà không biết.

- **AC-13.1:** Given tài liệu có câu lệnh prompt injection, when tôi hỏi nội dung liên quan, then model chỉ dùng tài liệu làm dữ liệu và không làm theo chỉ thị nhúng trong đó.
- **AC-13.2:** Given câu hỏi ngoài phạm vi hoặc không có bằng chứng, when tôi hỏi, then hệ thống từ chối/giải thích giới hạn mà không bịa facts/citations.
- **AC-13.3:** Given timeout, quota/provider outage, câu trả lời rỗng hoặc JSON sai, when request thất bại, then API trả lỗi đã chuẩn hóa, giao diện hiện hướng dẫn dễ hiểu và các chức năng CRUD không dùng AI vẫn hoạt động.
- **AC-13.4:** Given demo cuối kỳ, when nhóm trình bày, then nhóm chạy được riêng từng case injection, out-of-scope và failed/invalid response.
- **Hiện trạng:** **Một phần.** Có guard cho no-evidence, citation ngoài retrieval, timeout và response lỗi; có case injection trong evaluation corpus. Kết quả injection và chất lượng câu trả lời vẫn cần người review; chưa có bằng chứng hoàn tất demo cả ba nhóm guardrail theo đề.

### US-14 - Dashboard usage AI cho admin

**Là** admin workspace, **tôi muốn** xem số lượt AI, chi phí/token, độ trễ trung bình và lượt lỗi/từ chối, **để** kiểm soát chất lượng và giới hạn sử dụng.

- **AC-14.1:** Given có yêu cầu AI, when tôi mở dashboard theo khoảng thời gian, then hệ thống hiển thị số lượt, token/chi phí và latency trung bình dựa trên dữ liệu thực.
- **AC-14.2:** Given các lượt lỗi hoặc bị từ chối, when dashboard tổng hợp, then chúng được đếm riêng và không bị tính thành thành công.
- **AC-14.3:** Given tôi không phải admin, when tôi gọi dashboard, then API từ chối; dashboard không hiển thị prompt, nội dung tài liệu hoặc secrets.
- **Hiện trạng:** **Chưa thấy dashboard/API quản trị usage trong repo.** Logs và evaluation report hiện chưa thay thế dashboard có usage metrics theo yêu cầu.

### US-15 - Gửi phản hồi về câu trả lời

**Là** sinh viên, **tôi muốn** đánh dấu câu trả lời hữu ích hoặc chưa hữu ích và nêu lý do, **để** nhóm nhận biết vấn đề và cải thiện trợ lý.

- **AC-15.1:** Given câu trả lời đã hoàn tất và có receipt hợp lệ, when tôi gửi rating/lý do, then phản hồi được lưu gắn với đúng câu trả lời và người gửi.
- **AC-15.2:** Given receipt không thuộc tôi, payload sai hoặc tôi gửi lặp, when API xử lý, then dữ liệu không bị gắn nhầm và phản hồi lặp được xử lý an toàn.
- **AC-15.3:** Given lưu phản hồi thất bại, when giao diện nhận lỗi, then không báo thành công giả.
- **Hiện trạng:** **Có trong code** với receipt sở hữu câu trả lời, feedback helpful/unhelpful và kiểm tra idempotency.

## 4. Bảng truy vết User Story -> API/UI -> source -> test

Đường dẫn trong bảng tính từ thư mục gốc repo. Với các story chưa triển khai, `Chưa có` nghĩa là chưa tìm thấy endpoint/UI/test tương ứng, không phải nhóm được miễn acceptance criteria.

| ID    | API endpoint hoặc component                                                                                                                                     | Source chính                                                                                                                                                                                                                                                                                                                                                                                                             | Test/evidence hiện có                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Coverage hiện tại                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| US-01 | `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`; `PilotAccess`                                               | [auth.controller.ts](../apps/api/src/auth/auth.controller.ts), [auth.service.ts](../apps/api/src/auth/auth.service.ts), [supabase-auth.adapter.ts](../apps/api/src/auth/supabase-auth.adapter.ts), [PilotAccess.tsx](../apps/web/src/PilotAccess.tsx), [use-pilot-session.ts](../apps/web/src/use-pilot-session.ts)                                                                                                      | [auth.test.mjs](../apps/api/test/auth.test.mjs): login/session/cookie/CSRF; [pilot-auth.test.tsx](../apps/web/src/pilot-auth.test.tsx)                                                                                                                                                                                                                                                                                                                                                        | Một phần: chưa OAuth2                                          |
| US-02 | Protected API routes; role checks; member management chưa có                                                                                                    | [auth.guard.ts](../apps/api/src/auth/auth.guard.ts), [principal.ts](../apps/api/src/auth/principal.ts), các `*.service.ts` của tasks/academics/documents                                                                                                                                                                                                                                                                 | [workspace-scope.test.mjs](../apps/api/test/workspace-scope.test.mjs), [workspace-academic-scope.test.mjs](../apps/api/test/workspace-academic-scope.test.mjs), [workspace-documents-scope.test.mjs](../apps/api/test/workspace-documents-scope.test.mjs), [TaskPermissions.test.tsx](../apps/web/src/TaskPermissions.test.tsx), [AcademicPermissions.test.tsx](../apps/web/src/AcademicPermissions.test.tsx), [DocumentsPermissions.test.tsx](../apps/web/src/DocumentsPermissions.test.tsx) | Một phần: thiếu quản lý thành viên/UI và DB production signoff |
| US-03 | `GET /api/courses`, `GET /api/courses/:slug`; `CourseCarousel`, `CourseDetail`                                                                                  | [courses.controller.ts](../apps/api/src/courses/courses.controller.ts), [courses.service.ts](../apps/api/src/courses/courses.service.ts), [CourseDetail.tsx](../apps/web/src/CourseDetail.tsx), [CourseCarousel.tsx](../apps/web/src/CourseCarousel.tsx)                                                                                                                                                                 | [api.test.mjs](../apps/api/test/api.test.mjs): `HTTP Courses: lists seeded course guides and reads one by slug`                                                                                                                                                                                                                                                                                                                                                                               | Có trong code cho read-only catalog                            |
| US-04 | `GET/POST /api/tasks`, `PATCH /api/tasks/:id/status`; `TasksPanel`                                                                                              | [tasks.controller.ts](../apps/api/src/tasks/tasks.controller.ts), [tasks.service.ts](../apps/api/src/tasks/tasks.service.ts), [TasksPanel.tsx](../apps/web/src/TasksPanel.tsx), [use-workspace.ts](../apps/web/src/use-workspace.ts)                                                                                                                                                                                     | [api.test.mjs](../apps/api/test/api.test.mjs): `HTTP Tasks: create normalized task, list and change status`; [workspace-scope.test.mjs](../apps/api/test/workspace-scope.test.mjs)                                                                                                                                                                                                                                                                                                            | Một phần: chưa có full update/delete                           |
| US-05 | Exams: `GET/POST/PATCH/DELETE /api/exams`; study plans: `GET/POST/PATCH completion/DELETE /api/study-plans`                                                     | [exams.controller.ts](../apps/api/src/exams/exams.controller.ts), [study-plans.controller.ts](../apps/api/src/study-plans/study-plans.controller.ts), [AcademicPanels.tsx](../apps/web/src/AcademicPanels.tsx), [StudyPlanPanel.tsx](../apps/web/src/StudyPlanPanel.tsx)                                                                                                                                                 | [workspace-academic-scope.test.mjs](../apps/api/test/workspace-academic-scope.test.mjs), [AcademicPermissions.test.tsx](../apps/web/src/AcademicPermissions.test.tsx)                                                                                                                                                                                                                                                                                                                         | Có các luồng CRUD/tiến độ đã hỗ trợ; chưa AI-generate plan     |
| US-06 | `GET/POST/DELETE /api/expenses`; `BudgetPanel`                                                                                                                  | [expenses.controller.ts](../apps/api/src/expenses/expenses.controller.ts), [expenses.service.ts](../apps/api/src/expenses/expenses.service.ts), [BudgetPanel.tsx](../apps/web/src/BudgetPanel.tsx), [use-expenses.ts](../apps/web/src/use-expenses.ts)                                                                                                                                                                   | [workspace-academic-scope.test.mjs](../apps/api/test/workspace-academic-scope.test.mjs), [AcademicPermissions.test.tsx](../apps/web/src/AcademicPermissions.test.tsx)                                                                                                                                                                                                                                                                                                                         | Một phần: chưa có update/filter/pagination đầy đủ              |
| US-07 | `GET/POST /api/documents`, `POST /api/documents/:id/process`, `GET /api/documents/:id/download`, `PATCH /api/documents/:id/course`, `DELETE /api/documents/:id` | [documents.controller.ts](../apps/api/src/documents/documents.controller.ts), [document-ingestion.service.ts](../apps/api/src/documents/document-ingestion.service.ts), [DocumentsPanel.tsx](../apps/web/src/DocumentsPanel.tsx), [DocumentCard.tsx](../apps/web/src/DocumentCard.tsx)                                                                                                                                   | [api.test.mjs](../apps/api/test/api.test.mjs): HTTP Documents upload/process/download/delete; [workspace-documents-scope.test.mjs](../apps/api/test/workspace-documents-scope.test.mjs); [documents-context.database.test.mjs](../apps/api/test/documents-context.database.test.mjs)                                                                                                                                                                                                          | Có trong code; dùng dữ liệu demo theo README                   |
| US-08 | `POST /api/assistant/chat` với mode documents; `AssistantPanel`, citations, source preview                                                                      | [assistant.controller.ts](../apps/api/src/assistant/assistant.controller.ts), [assistant.service.ts](../apps/api/src/assistant/assistant.service.ts), [rag-retrieval.service.ts](../apps/api/src/assistant/rag-retrieval.service.ts), [rag-context.ts](../apps/api/src/assistant/rag-context.ts), [GeminiService](../apps/api/src/assistant/gemini.service.ts), [AssistantPanel.tsx](../apps/web/src/AssistantPanel.tsx) | [assistant.test.mjs](../apps/api/test/assistant.test.mjs): empty retrieval/citation/timeout; [rag-retrieval.service.spec.ts](../apps/api/src/assistant/rag-retrieval.service.spec.ts); [phase-4-evaluation-report.md](phase-4-evaluation-report.md)                                                                                                                                                                                                                                           | Có code; semantic review/evaluation còn pending                |
| US-09 | `POST /api/assistant/chat` với mode workspace; read-only workspace queries                                                                                      | [workspace-assistant.service.ts](../apps/api/src/assistant/workspace-assistant.service.ts), [workspace-records.service.ts](../apps/api/src/assistant/workspace-records.service.ts), [workspace-intent.ts](../apps/api/src/assistant/workspace-intent.ts), [AssistantPanel.tsx](../apps/web/src/AssistantPanel.tsx)                                                                                                       | [workspace-assistant.service.spec.ts](../apps/api/src/assistant/workspace-assistant.service.spec.ts), [workspace-records.service.spec.ts](../apps/api/src/assistant/workspace-records.service.spec.ts), [workspace-records-context.test.mjs](../apps/api/test/workspace-records-context.test.mjs)                                                                                                                                                                                             | Có trong code; không phải LLM tool agent                       |
| US-10 | `GET /api/speech/status`, `POST /api/speech/transcriptions`; `SpeechInput`                                                                                      | [speech.controller.ts](../apps/api/src/speech/speech.controller.ts), [speech.service.ts](../apps/api/src/speech/speech.service.ts), [local-speech.provider.ts](../apps/api/src/speech/local-speech.provider.ts), [SpeechInput.tsx](../apps/web/src/SpeechInput.tsx), [use-speech-input.ts](../apps/web/src/use-speech-input.ts)                                                                                          | [speech.test.mjs](../apps/api/test/speech.test.mjs): language forwarding/permission/cancel; [speech-media.test.mjs](../apps/api/test/speech-media.test.mjs); [speech-input.test.tsx](../apps/web/src/speech-input.test.tsx)                                                                                                                                                                                                                                                                   | Có trong code; transcript là input tạm thời                    |
| US-11 | `Sidebar` global search; hiện gọi các list API, chưa có API search phân trang                                                                                   | [use-search.ts](../apps/web/src/use-search.ts), [Sidebar.tsx](../apps/web/src/Sidebar.tsx), [api.ts](../apps/web/src/api.ts)                                                                                                                                                                                                                                                                                             | [App.test.tsx](../apps/web/src/App.test.tsx) là integration coverage; chưa thấy suite riêng cho filter/sort/pagination                                                                                                                                                                                                                                                                                                                                                                        | Một phần                                                       |
| US-12 | `POST /api/assistant/chat`; stream endpoint chưa có                                                                                                             | [assistant.controller.ts](../apps/api/src/assistant/assistant.controller.ts), [use-assistant.ts](../apps/web/src/use-assistant.ts), [AssistantPanel.tsx](../apps/web/src/AssistantPanel.tsx)                                                                                                                                                                                                                             | Chưa có test SSE/WebSocket/streaming                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Chưa có streaming                                              |
| US-13 | `POST /api/assistant/chat`; refusal/provider error handling                                                                                                     | [assistant.service.ts](../apps/api/src/assistant/assistant.service.ts), [assistant-exception.filter.ts](../apps/api/src/assistant/assistant-exception.filter.ts), [gemini.service.ts](../apps/api/src/assistant/gemini.service.ts), [rag-evaluation-corpus.mjs](../apps/api/scripts/rag-evaluation-corpus.mjs)                                                                                                           | [assistant.test.mjs](../apps/api/test/assistant.test.mjs): unanswerable/invalid citation/timeout/empty provider; E07 injection trong [phase-4-evaluation-report.md](phase-4-evaluation-report.md) còn `REVIEW_REQUIRED`                                                                                                                                                                                                                                                                       | Một phần: cần demo và review đủ 3 risk                         |
| US-14 | Admin AI usage dashboard/API chưa có                                                                                                                            | Chưa có component hoặc endpoint tương ứng                                                                                                                                                                                                                                                                                                                                                                                | Chưa có test usage dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Chưa có                                                        |
| US-15 | `POST /api/assistant/feedback`; `AssistantFeedback`                                                                                                             | [feedback.controller.ts](../apps/api/src/feedback/feedback.controller.ts), [feedback.service.ts](../apps/api/src/feedback/feedback.service.ts), [AssistantFeedback.tsx](../apps/web/src/AssistantFeedback.tsx), [answer-receipt.service.ts](../apps/api/src/assistant/answer-receipt.service.ts)                                                                                                                         | [feedback.test.mjs](../apps/api/test/feedback.test.mjs), [feedback.test.tsx](../apps/web/src/feedback.test.tsx)                                                                                                                                                                                                                                                                                                                                                                               | Có trong code                                                  |

## 5. AI capability và mức độ phù hợp

| Nhóm trong đề                | Bằng chứng trong repo                                                                                                | Ghi chú nghiệm thu                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. RAG trên dữ liệu ứng dụng | PDF ingestion, chunking, Gemini embeddings, pgvector retrieval, citations và refusal khi thiếu bằng chứng            | Có code. Cần hoàn tất semantic review và báo cáo kết quả ít nhất 20 evaluation cases trước/sau một cải tiến.                                        |
| B. Tool-using agent          | Workspace Assistant chạy intent/query cố định trong code                                                             | Không nên tính là agent: LLM không gọi tool; các query hiện read-only.                                                                              |
| C. Structured output         | Gemini nhận JSON schema cho `answerable`, `answer`, `citationIds`; backend kiểm tra response/citations trước khi trả | Có bằng chứng code/test. Khi bảo vệ, giải thích schema, validation và cách app dùng các trường này.                                                 |
| D. Multimodal input          | PDF được trích xuất/index để dùng trong RAG; STT local chuyển voice thành câu hỏi có thể sửa/chèn                    | Có luồng. Với tiêu chí “kết quả được lưu và sử dụng”, hãy demo dữ liệu chunks của PDF đã lưu và truy xuất; transcript voice hiện không lưu độc lập. |
| E. Multi-agent               | Chưa thấy workflow nhiều agent có hand-off/log                                                                       | Chưa có.                                                                                                                                            |

Đề yêu cầu tối thiểu hai AI capabilities; nhóm ba người cần tối thiểu ba. Repo có bằng chứng khả dĩ cho A/C/D, nhưng nhóm cần chuẩn bị demo/tài liệu cho từng capability, đặc biệt việc lưu và sử dụng kết quả ở D. Không mô tả workspace query như B hoặc E.

## 6. Việc còn thiếu ưu tiên cho final

1. **Auth theo đúng đề:** quyết định và triển khai OAuth2; thống nhất cách đáp ứng JWT. Hoàn thiện quản lý thành viên/role admin-user và nghiệm thu phân quyền trên môi trường được phép dùng.
2. **Phân quyền và dữ liệu:** hoàn tất boundary theo user/workspace cho mọi API/RAG; production least-privilege/RLS và Auth chưa được xác nhận trong README. Chỉ dùng fixture/demo cho tới khi có nghiệm thu.
3. **Real-time:** bổ sung stream response hoặc cập nhật real-time; hiện Assistant trả một JSON hoàn chỉnh sau khi xử lý.
4. **Tìm kiếm:** bổ sung filter/sort/pagination, ưu tiên xử lý phía backend cho tập dữ liệu lớn; hiện search chỉ lấy tối đa 12 kết quả từ các list đã tải.
5. **Admin AI usage:** lưu/tổng hợp số request, tokens/cost, latency, lỗi và refusal; tạo dashboard có kiểm tra quyền admin.
6. **AI evaluation:** corpus có 24 case nhưng báo cáo live gần nhất chỉ chọn 5: 4 `REVIEW_REQUIRED`, 1 `BLOCKED`, chưa có `PASS` được người review ký. Chạy và báo cáo tối thiểu 20 case, xử lý blocker, review kết quả và so sánh pass rate trước/sau một thay đổi.
7. **Prompt/guardrail evidence:** prompt hiện có version labels và system instructions trong source; chuẩn hóa prompts vào file/config dễ review, lưu Git history, rồi demo rõ injection, out-of-scope và lỗi/response không hợp lệ.
8. **Tài liệu bắt buộc:** đề yêu cầu ít nhất 3 ADR, architecture diagram và `AI_USAGE.md` có prompt chính, phần AI tạo, cách nhóm kiểm tra/sửa và ít nhất 2 ví dụ AI code sai. Repo hiện có `docs/architecture.md` và `docs/ai-usage-log.md`; tạo/đối chiếu đúng file `AI_USAGE.md` và nội dung bắt buộc, không mặc định hai file hiện có tự động đáp ứng.
9. **Bằng chứng final:** project report PDF 10-20 trang, slide tối đa 15 trang, video dự phòng 3-5 phút, demo chạy từ container/deployed version, test accounts và commit Git có đóng góp từng thành viên.
10. **Model/privacy/cost:** báo cáo lựa chọn Gemini `gemini-2.5-flash` cho chat/grounded answers, `gemini-embedding-001` cho embeddings, Whisper small ONNX local cho STT; nêu chất lượng/tốc độ/chi phí/quyền riêng tư và chính xác dữ liệu nào được gửi Gemini (câu hỏi, đoạn tài liệu dùng cho embedding/retrieval). Không đưa secrets vào frontend hoặc Git.

## 7. Nguồn trong repo

- [README.md](../README.md) - phạm vi hiện tại, ranh giới bảo mật và hạn chế pilot.
- [PROJECT-CONTEXT.md](PROJECT-CONTEXT.md) - checkpoint và bối cảnh triển khai mới nhất.
- [ASSISTANT-SETUP.md](ASSISTANT-SETUP.md) - Gemini, RAG, PDF và cấu hình backend.
- [STT-SETUP-VI.md](STT-SETUP-VI.md) - Whisper local và lựa chọn Auto/Tiếng Việt/English.
- [phase-4-evaluation-report.md](phase-4-evaluation-report.md) - tình trạng evaluation và phần semantic review còn thiếu.
- [PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md](PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md), [PHASE-8-RECEIPT-REPORT.md](PHASE-8-RECEIPT-REPORT.md) - ranh giới Documents/RAG/feedback.
- Final Project Assignment 2026-2027, Sections 1-11 - nguồn yêu cầu chính thức được đối chiếu cho tài liệu này.
