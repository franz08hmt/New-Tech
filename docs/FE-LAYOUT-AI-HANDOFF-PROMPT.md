# Prompt giao việc: hoàn thiện layout ExaMate và AI chatbox dùng chung

Tài có thể sao chép toàn bộ phần từ **Bắt đầu prompt** đến **Kết thúc prompt** sang agent có quyền đọc repository. File này là yêu cầu triển khai, không phải báo cáo tính năng đã hoàn thành.

Được chuẩn bị ngày 24/09/2026 dựa trên việc đọc source và Git tại `feature/tai`, HEAD `7143487`. Agent phải kiểm tra lại trạng thái mới nhất; không lấy snapshot này thay cho việc đọc code. Chưa chạy kiểm thử hoặc trình duyệt trong lượt soạn prompt này.

---

## Bắt đầu prompt

Bạn là frontend engineer phụ trách cải tiến ExaMate AI cùng tôi, Tài. Hãy thực hiện một đợt nâng cấp UI có kiểm soát trên code hiện có: sửa lỗi layout được kiểm chứng, chuyển điểm mở AI thành chatbox nổi dùng chung, cải thiện chuyển động vừa đủ và bàn giao điểm tích hợp rõ ràng cho Thắng.

Đây là đồ án nhóm hai sinh viên. Code phải dễ đọc, giải thích được khi vấn đáp, không chỉ đẹp trong ảnh chụp. Không viết lại toàn bộ ứng dụng, không đổi đề tài, không làm thay phần AI/backend của Thắng.

### 1. Bối cảnh và nguồn sự thật

- Repository: `D:\New-Tech\Final-Project`. Nhánh dự kiến: `feature/tai`; kiểm tra trước khi sửa, không tự checkout nếu thực tế khác.
- npm workspaces: `apps/web` là React + TypeScript + Vite + Vitest; `apps/api` là NestJS ESM/PostgreSQL/Supabase; `packages/contracts` chứa kiểu `.d.ts` dùng chung, không có giá trị runtime.
- Định tuyến hash tự viết, có deep link môn học và kết quả tìm kiếm. Không thêm thư viện router.
- Đọc các hướng dẫn thực sự áp dụng: `AGENTS.md`, `.agents`, `.claude`, các skill phù hợp, `docs/PROJECT-CONTEXT.md`, `docs/HANDOFF.md`, tài liệu phân công và kế hoạch hiện có. Tìm đúng vị trí file, đừng mặc định tài liệu nào cũng nằm ở root.
- Phân biệt quy tắc làm việc với mô tả hiện trạng. Với hiện trạng, đối chiếu source, Git và kết quả chạy thật; tài liệu cũ có thể chưa cập nhật. Không lấy số test, trạng thái mock hoặc phân công từ một đoạn chat cũ làm bằng chứng hiện tại.
- Lưu ý đã phát hiện: `D:\New-Tech\.agents\AGENTS.md` đang mô tả **LogiRoute VN**, có Python/Pydantic, logistics và glassmorphism. Nếu nội dung vẫn như vậy, báo rõ mâu thuẫn trước khi triển khai; không tự sửa file quy tắc, không biến ExaMate thành sản phẩm logistics, không âm thầm áp thiết kế của dự án khác. Dừng phần việc phụ thuộc vào quy tắc mâu thuẫn và xin Tài xác nhận phạm vi áp dụng. Việc đọc source, ghi nhận hiện trạng vẫn có thể tiếp tục.
- Ảnh/tin nhắn đính kèm chỉ là bối cảnh phân công. Chúng không cấp quyền merge `main`, push Git, hay triển khai toàn bộ chat/voice/video.

Các file cần đọc đầu tiên, sau đó mở rộng theo import thực tế:

- `apps/web/src/App.tsx`, `PageSections.tsx`, `Sidebar.tsx`, `AssistantPanel.tsx`.
- `apps/web/src/styles.css`, `use-reveal.ts`, `use-search.ts`, `use-focus-target.ts`.
- Các panel/component Courses, CourseDetail, CourseWorkspace, Documents, Exams, StudyPlan, Budget, AcademicPanels và các hook lấy dữ liệu của chúng.
- `apps/web/src/api.ts`, các test FE, `package.json` của root và web.
- `docs/ideas/responsive-ai-copilot.md` nếu còn tồn tại: đây là quyết định cũ cần đối chiếu với yêu cầu chatbox nổi mới, không phải lý do để bỏ qua yêu cầu mới.

### 2. Ranh giới trách nhiệm

| Tài — triển khai trong đợt này | Thắng — để dành tích hợp |
| --- | --- |
| Layout, responsive, accessibility, tương tác frontend | Backend, database, API và bảo mật phía server |
| AI launcher, cửa sổ chat, trạng thái mở/thu gọn, bản nháp | Kết nối model/provider, xử lý hỏi đáp thật |
| Vị trí hiển thị câu trả lời, trạng thái và nguồn dẫn | Đọc PDF, chunking, embeddings, retrieval/RAG, nguồn dẫn thật |
| Component/hook dễ nối với phần AI sau này | Streaming, lưu hội thoại phía server và các capability được nhóm thống nhất |
| Kiểm thử FE và tài liệu bàn giao | Kiểm thử AI/backend và tích hợp end-to-end với FE |

Không tự triển khai STT, TTS, video, dịch thuật, tạo nội dung đa phương tiện chỉ vì giảng viên có nhắc tới các hướng này. Hãy giữ ExaMate là workspace học tập, ưu tiên nền giao diện trợ lý học tập dựa trên tài liệu. Các capability mở rộng là kế hoạch cần nhóm chốt riêng.

Phạm vi sửa: `apps/web` và tài liệu bàn giao liên quan. Không sửa `apps/api`, `packages/contracts`, migration/schema, infra, Docker/compose, cấu hình secret hoặc `.claude/settings.json`. Không thêm dependency npm. Nếu thật sự cần vượt phạm vi, giải thích và hỏi trước.

### 3. Kiểm chứng và giữ nguyên chức năng hiện có

Trước khi sửa, lập bảng ngắn: chức năng, nguồn dữ liệu, file phụ trách, cách kiểm tra hồi quy. Xác nhận tối thiểu:

- Courses/gallery, carousel và course detail, deep link, Back và nội dung môn học.
- Tasks, Exams, Study plans, Budget: giữ các thao tác thêm/sửa/xóa/lọc/tổng hợp đang thực sự có, validation và trạng thái lỗi.
- Documents: chọn/upload, phân môn, lọc, đọc danh sách và các thao tác đang có. Không để lộ `storage_key` hoặc credential.
- Workspace search: kết quả vẫn dẫn tới đúng đối tượng, không chỉ dẫn tới trang; giữ focus/highlight hiện tại.
- Quick notes: giữ dữ liệu localStorage, thêm/xóa, xác nhận hoặc hoàn tác hiện có, kéo thả và sắp xếp bằng bàn phím nếu source đang hỗ trợ; không đổi khóa lưu hoặc xóa dữ liệu của người dùng.
- Điều hướng mobile, trạng thái form, thông báo, nhãn dữ liệu minh họa và các lối vào AI.

Không biến dữ liệu API thành mock để làm UI dễ hơn. Không bỏ một chức năng chỉ vì khó bố trí. Không tự chạy lại kế hoạch Giai đoạn 0–6 của các yêu cầu cũ.

### 4. Thiết kế AI launcher và chatbox

Mục tiêu: thay nút chữ **Ask AI trên header** bằng một nút icon AI nổi, hiện xuyên suốt các trang của workspace. Tham khảo cách mở/thu gọn của các trợ lý phổ biến, không sao chép logo, màu thương hiệu hoặc hiệu ứng Meta AI.

#### 4.1. Một điểm mở dùng chung

- Dùng Heroicons `24/outline`, chẳng hạn `SparklesIcon`; nút có accessible name như `Open ExaMate AI`, tooltip dùng được cả hover và focus, vùng chạm tối thiểu 44×44px.
- Đặt ở góc dưới bên phải viewport, có khoảng cách an toàn. Không bị cắt bởi `overflow`, không bị ancestor có `transform` làm sai vị trí, không nằm sau shell hoặc modal.
- Không che nút lưu/xóa, toast, thanh điều hướng, nội dung cuối trang hoặc nút Help hiện có. Sắp lại các control nổi như một nhóm có chủ đích; không xóa Help để giải quyết va chạm.
- Khi mở, nút phản ánh đúng trạng thái bằng `aria-expanded`/`aria-controls`; khi đóng, không có phần tử ẩn còn nhận Tab.
- Chỉ có một instance panel/chat state. Các lối vào còn lại như `Ask ExaMate` và trang `#assistant` phải mở cùng trải nghiệm, không tạo cửa sổ hoặc bản nháp thứ hai. Không xóa route đang có hay làm deep link cũ vô dụng.

#### 4.2. Hành vi theo phiên làm việc

- Chuyển trang hash không làm mất bản nháp và không reset panel một cách bất ngờ. Thu gọn rồi mở lại giữ bản nháp.
- Định nghĩa “phiên” trong nhiệm vụ này là vòng đời ứng dụng đang mở trong tab. Không tự thêm lưu hội thoại vào localStorage, database hoặc đồng bộ đa tab. Không hứa giữ bản nháp sau reload nếu chưa làm và kiểm thử.
- Đưa state cần giữ tới owner ổn định phù hợp, tách state khỏi phần UI có thể unmount. Không dùng thư viện state mới hoặc abstraction lớn.
- Header panel có tên ExaMate, ngữ cảnh trang/môn nếu có, nút thu gọn/đóng rõ ràng. Đổi ngữ cảnh không được ghi đè câu đang gõ hoặc ngầm gửi dữ liệu sang AI.
- Mở/đóng không làm mất dữ liệu form của trang nền, không điều hướng đi nơi khác, không reload ứng dụng và không làm trang bị co giãn như dock cũ.

#### 4.3. Desktop, mobile và accessibility

- Desktop: cửa sổ nổi có kích thước giới hạn, vùng nội dung cuộn riêng và composer dễ tiếp cận; không chiếm toàn màn hình mặc định. Nếu là non-modal, không khóa focus hoặc vô hiệu hóa trang nền.
- Mobile: dùng sheet/panel phù hợp màn hình hẹp, giới hạn chiều cao theo viewport động và safe area. Kiểm tra bàn phím ảo không che composer; nút đóng luôn với tới được.
- Nếu mobile dùng modal thì triển khai đầy đủ dialog semantics, focus trap, ngăn tương tác nền và khôi phục scroll; không chỉ gắn `aria-modal` cho có.
- Escape đóng/thu gọn hợp lý, không đồng thời đóng sai các lớp UI khác. Trả focus về control đã mở panel nếu control còn tồn tại; nếu không, trả về launcher.
- Phối hợp với logic focus khi hashchange/search hiện có. Không để router kéo focus ra khỏi modal đang mở, cũng không phá việc focus tới heading/đối tượng khi điều hướng bình thường.
- Textarea có label; icon trang trí ẩn khỏi screen reader. Thông báo trạng thái dùng live region phù hợp, không đọc lại cả hội thoại mỗi render.

### 5. Trung thực về AI và chuẩn bị cho Thắng

Hãy kiểm tra `AssistantPanel.tsx` thực tế. Ở snapshot dùng để soạn yêu cầu, đây là interface preview: gợi ý điền bản nháp, gửi bị vô hiệu hóa và ví dụ trích dẫn chưa phải truy xuất thật.

- Nếu AI vẫn chưa nối, giữ nhãn dễ hiểu như `Interface preview` và lời giải thích tiếng Việt: “Phần AI đang được Thắng kết nối. Bạn có thể chuẩn bị câu hỏi, nhưng chưa gửi để nhận trả lời được.”
- Không tạo câu trả lời giả để trông như AI hoạt động, không tạo nguồn dẫn giả, không giả loading rồi báo thành công. Ví dụ minh họa nếu giữ lại phải gắn nhãn rõ, tách khỏi hội thoại thật.
- Chỉ chuẩn bị cấu trúc UI/state/callback tối thiểu phục vụ kết nối: composer, vùng messages, trạng thái chưa kết nối/đang gửi/lỗi theo nhu cầu thực tế, vùng nguồn dẫn. Các state chưa có backend có thể kiểm thử bằng fixtures trong test, không trình bày thành khả năng live.
- Tách rendering khỏi nơi gọi AI tương lai theo cách đơn giản, có TypeScript rõ ràng. Tận dụng abstraction đã có; không dựng một framework adapter đa provider hoặc nhiều file rỗng.
- Không đoán endpoint, payload HTTP hay định dạng streaming thành contract chính thức. Nếu contract AI đã tồn tại, đọc và dẫn lại; nếu chưa, ghi đề xuất/câu hỏi trong tài liệu bàn giao để Thắng thống nhất. Không khai báo trùng shape HTTP ở FE hoặc sửa package contracts ngoài phạm vi.
- Không thêm nút microphone/camera/upload AI “bấm được nhưng không làm gì”. Capability chưa hỗ trợ nên nằm trong kế hoạch bàn giao, không thành control gây hiểu nhầm.
- Không gửi tài liệu/nội dung workspace ra dịch vụ bên ngoài trong đợt UI này. Không đưa secret vào biến `VITE_*`, bundle, log hoặc ảnh minh chứng.
- Nếu phát hiện Thắng đã tích hợp AI thật kể từ snapshot, báo khác biệt và giữ nguyên luồng đó; không hạ cấp về preview hoặc tự đổi API.

### 6. Audit và sửa layout có bằng chứng

Chạy ứng dụng, kiểm tra các trang thực tế trước khi quyết định sửa. Với mỗi lỗi, ghi đường dẫn/trang, viewport, bước tái hiện, quan sát và mức ảnh hưởng. Phân biệt lỗi sử dụng với sở thích thẩm mỹ.

Ưu tiên kiểm tra:

- Tràn ngang, tên môn/tên file tiếng Việt dài, breadcrumb, heading và nhãn/nút bị cắt.
- Header/sidebar/content không thẳng hàng; khoảng trống dư; panel/card/form/bảng sai tỷ lệ hoặc thiếu nhất quán.
- Hero/cover bị crop mất nội dung quan trọng: đánh giá theo từng ảnh và breakpoint, chọn aspect ratio/object-position phù hợp, không đổi toàn bộ ảnh sang `contain` một cách máy móc.
- Nút bị che, z-index sai, focus ring bị cắt, scroll lồng khó dùng, layout nhảy khi mở AI hoặc khi dữ liệu tải xong.
- Trạng thái loading/empty/error/success làm bố cục vỡ, thao tác trên mobile quá nhỏ, form bị chật.
- Nhãn, đơn vị, số tiền VND, định dạng ngày và thông báo vẫn đọc được sau chỉnh layout.

Chỉ sửa những điểm xác nhận được hoặc cải tiến có lý do cụ thể. Không nhân tiện thiết kế lại mọi trang, thêm chức năng nghiệp vụ hoặc thay backend.

### 7. Giữ bản sắc và chuyển động vừa đủ

- Giữ ExaMate, Poppins, token màu và ngôn ngữ thiết kế điềm đạm/giáo dục trong `styles.css`. Tái dùng panel/card/button/progress, không phủ một theme khác lên ứng dụng.
- Chỉ Heroicons `24/outline`; không thư viện icon/animation mới. Không lạm dụng gradient, neon, glassmorphism, shadow lớn hoặc background chuyển động liên tục.
- HTML ngữ nghĩa, heading đúng cấp, form có label và liên kết lỗi, không `div soup`. Duy trì title/description theo trang; không quảng cáo khả năng SEO/AEO vượt mức đã kiểm chứng của hash SPA.
- Nhãn UI giữ tiếng Anh; nội dung, thông báo và hướng dẫn viết tiếng Việt tự nhiên. Giữ nhãn dữ liệu ví dụ, `Saved on this browser` và giới hạn AI rõ ràng.
- Dùng motion để giải thích trạng thái: mở/thu gọn chat, hover/focus/press, xuất hiện thông báo. Ưu tiên transition `transform`/`opacity`, khoảng 150–250ms tùy tương tác; không animate layout nặng hoặc dùng `transition: all` diện rộng.
- Tôn trọng `prefers-reduced-motion`; mọi nội dung vẫn hiện và dùng được khi tắt hiệu ứng. Nếu cần scroll reveal, dùng `use-reveal.ts` sẵn có, giữ fallback an toàn. Không tái lập lỗi `animation-fill-mode: both` ghim phần tử ở opacity 0.
- Không vòng lặp animation vô hạn, không listener/timer dư, không cập nhật React state liên tục theo con trỏ/scroll chỉ để trang sinh động. Không hứa 60fps nếu chưa đo.

### 8. Quy trình thực hiện và kiểm thử

1. Đọc quy tắc, kiểm tra branch/status/diff; bảo toàn thay đổi chưa commit của người dùng. Báo mâu thuẫn và thiếu điều kiện thực tế. Không đọc/in secret để chứng minh cấu hình tồn tại.
2. Ghi mốc ban đầu: chạy test, typecheck, build và format; phân biệt lỗi có sẵn với lỗi do mình tạo. Đọc script trước để biết test có dùng DB hay tác dụng phụ không.
3. Báo kế hoạch ngắn: lỗi đã tái hiện, file dự kiến sửa, mô hình state/focus của chatbox, phần để dành cho Thắng. Sau khi xử lý các mâu thuẫn thật sự, triển khai từng lát nhỏ trong phạm vi này; không mở rộng sang roadmap khác.
4. Với logic mới hoặc bug có thể tự động hóa: viết test trước, chạy và nhìn thấy FAIL vì thiếu hành vi hoặc bug đúng mục tiêu, rồi sửa và chạy PASS. Không tính lỗi import/setup là bằng chứng RED hợp lệ.
5. Kiểm tra trình duyệt sau mỗi nhóm thay đổi; review diff cuối để bỏ thay đổi ngoài phạm vi và ghi tài liệu bàn giao.

Test tối thiểu cho AI UI:

- Launcher mở đúng một panel, có tên truy cập và trạng thái mở/đóng đúng.
- Mọi lối vào AI dùng cùng panel; không còn nút Ask AI trên header bị nhân đôi.
- Nhập draft → đổi trang → thu gọn → mở lại: draft còn nguyên; trang nền không mất dữ liệu do thao tác AI.
- Escape, nút đóng và focus restoration; panel đóng không còn phần tử nhận focus.
- Preview chưa nối không phát sinh request AI và không sinh câu trả lời giả.
- Regression cho lỗi layout có logic kiểm thử được; kiểm tra hình ảnh/browser bổ sung cho phần CSS mà jsdom không chứng minh được.

Chạy thật từ root repository sau khi sửa:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
```

Không dùng con số test từ prompt cũ. Báo số file/test của từng workspace từ output thực tế, exit code và lỗi nếu có. Không sửa BE chỉ để làm test xanh, không giảm assertion hay bỏ test để đạt mốc.

Khởi động hoặc dùng server đã chạy sau khi kiểm tra cổng, không kill process của người dùng:

```powershell
# Terminal API tại root, nếu cần và chưa chạy
npm run dev:api

# Terminal web khác tại root, nếu chưa chạy
npm run dev:web
```

Dùng URL terminal thực sự in ra. Giữ nhất quán `localhost` hoặc `127.0.0.1` trong phép kiểm vì storage trình duyệt theo origin; không kết luận mất notes chỉ vì đổi hostname.

Kiểm tra browser thật ít nhất ở 375px, 768px và 1440px:

- Các trang chính, mở/đóng AI, chuyển hash/deep link, reload và Back, giữ bản nháp trong cùng phiên.
- Chỉ bàn phím: Tab/Shift+Tab/Enter/Space/Escape; focus không lạc hoặc bị che. Kiểm tra reduced motion và zoom 200%.
- Tên/nội dung dài, loading/empty/error; kiểm tra Network không có request AI ngoài dự kiến.
- Kiểm tra console, ghi lại lỗi thực tế và nguồn. Không gọi “sạch console” nếu chưa xem.
- Kiểm tra mobile composer khi bàn phím xuất hiện nếu có thiết bị/công cụ hỗ trợ; resize desktop không được báo thành kiểm chứng bàn phím ảo.
- Quan sát animation và layout shift; nếu nghi giật, dùng profiler/trace sẵn có. Phân biệt quan sát với số đo.

Không xóa/sửa dữ liệu thật trên Supabase để test UI. Test tự động dùng mocks/fixtures thích hợp; kiểm tra CRUD có tác dụng phụ chỉ dùng dữ liệu thử được cho phép hoặc môi trường test riêng. Không tự chạy migration cho một nhiệm vụ layout.

Nếu không chạy được browser/API/test do môi trường, ghi rõ bước nào chưa xác minh và vì sao; tiếp tục phần không bị chặn. Không kết luận hoàn thành toàn bộ khi còn tiêu chí chưa kiểm tra.

### 9. Bàn giao để Thắng tiếp tục

Tạo hoặc cập nhật một tài liệu bàn giao ngắn theo convention hiện có, tránh nhiều file trùng nội dung. Tài liệu phải có:

1. Component/hook sở hữu launcher, panel, draft và trạng thái; đường dẫn file và sơ đồ luồng nhỏ nếu có ích.
2. Hành vi đã chạy được, hành vi còn preview; state nào chỉ được kiểm thử bằng mock.
3. Điểm Thắng cần nối: gửi câu hỏi, nhận nội dung/trạng thái/lỗi, cập nhật nguồn dẫn và ngữ cảnh môn/tài liệu. Chỉ rõ dữ liệu hiện có so với dữ liệu cần thống nhất.
4. Contract có sẵn hoặc đề xuất cần thảo luận: request, response, lỗi, citations, streaming nếu nhóm chọn; không gọi đề xuất là API đã tồn tại.
5. Ranh giới an toàn: credentials chỉ ở BE, kiểm tra quyền truy cập tài liệu ở BE, không coi context FE là bằng chứng quyền truy cập, không render HTML AI không được xử lý an toàn.
6. Checklist tích hợp sau này: trả lời thật, lỗi mạng, hủy request nếu hỗ trợ, nguồn dẫn mở đúng tài liệu, không gửi trùng và không làm mất draft khi lỗi. Phần chưa có backend chỉ là tiêu chí tương lai, không phải tuyên bố đã pass.
7. Cách chạy local, kiểm thử và file nào Thắng cần đọc trước. Không hướng dẫn ghi đè thay đổi của nhau hoặc force push.

Cập nhật AI usage log nếu workflow repo yêu cầu. Phân biệt agent verification với human review của Tài/Thắng; không tự ghi rằng con người đã review.

### 10. Báo cáo kết thúc và điều kiện dừng

Báo cáo bằng tiếng Việt, ngắn nhưng có bằng chứng:

- Lỗi nào đã quan sát và sửa; cải tiến nào là lựa chọn thiết kế, vì sao.
- File đã thay đổi, chức năng được giữ, phần dành cho Thắng.
- Test RED → GREEN đã chứng kiến, số test thực tế và output lệnh quan trọng; browser/viewport/scenario nào đã kiểm tra, console có gì.
- Ảnh trước/sau nếu công cụ hỗ trợ, không chụp secret hoặc dữ liệu riêng tư.
- Hạn chế, lỗi tồn tại từ trước, bước bỏ qua/chưa kết luận; không gộp “build pass” với “mọi thứ dùng được”.
- Giải thích ngắn để Tài vấn đáp được: ai giữ state, vì sao draft không mất, modal/non-modal khác nhau thế nào, FE nối BE ở đâu.

Không commit, push, merge main, deploy, đổi branch, cài dependency hay sửa quy tắc nếu chưa có yêu cầu rõ ở lượt làm việc đó. Không thêm co-author attribution, không sửa `.claude/settings.json`.

Hoàn thành trong phạm vi UI này rồi dừng báo cáo. Nếu cần quyết định làm thay đổi trách nhiệm nhóm, contract BE, dữ liệu hoặc quy tắc mâu thuẫn, hỏi một câu cụ thể trước khi làm; không tự đoán.

## Kết thúc prompt
