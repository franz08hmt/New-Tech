# Homework 3A — React UI Skeleton

> Tài liệu ôn tập và chuẩn bị
> Project: CourseMate AI
> Framework được chọn: React + TypeScript + Vite

## 1. Kết luận ngắn

CourseMate AI hiện đã có đủ nền tảng để dùng làm bài Homework 3A. Khi trình bày, chỉ nên chọn ba màn hình chính:

1. **Dashboard** — tổng quan lịch học, task, môn học và các trạng thái.
2. **Tasks** — danh sách task, bộ lọc và form tạo task có validation.
3. **Courses** — ví dụ về component tái sử dụng, props và mock data.

Các trang Exams, Research, Finances và Assistant là phần mở rộng của skeleton. Không cần cố giải thích toàn bộ trong bài 3A. Assistant hiện chỉ là giao diện dự kiến và chưa có AI/RAG thật.

## 2. Đối chiếu trực tiếp với yêu cầu 3A

| Yêu cầu của giảng viên                    | CourseMate AI đáp ứng ở đâu                                                 | Bằng chứng nên trình bày                           |
| ----------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| Main navigation và 2–3 màn hình thiết yếu | Sidebar và hash routing trong `apps/web/src/App.tsx`                        | Chuyển lần lượt Dashboard, Tasks, Courses          |
| Một form hoạt động và có validation       | Form tạo task trong `apps/web/src/TasksPanel.tsx`                           | Thử title 1–2 ký tự, sau đó tạo task hợp lệ        |
| Mock data                                 | `apps/web/src/academic-data.ts`                                             | Course cards, exam schedule và research cards      |
| Loading state                             | `loading` trong `apps/web/src/use-workspace.ts` và `Loading project tasks…` | Giải thích hoặc quay khi API phản hồi chậm         |
| Empty state                               | Nhánh `tasks.length === 0` trong `TasksPanel.tsx`                           | Database chưa có task hoặc filter không có kết quả |
| Success state                             | `Task added successfully.` sau khi POST thành công                          | Tạo một task hợp lệ                                |
| Error state                               | `role="alert"`, thông báo lỗi và nút Retry                                  | Tắt API rồi tải lại trang                          |
| Responsive layout                         | Media query trong `apps/web/src/styles.css`                                 | DevTools ở khoảng 320 px, 768 px và desktop        |
| Ghi nhận code do AI tạo và human review   | `docs/ai-usage-log.md` và mục 12 của tài liệu này                           | Tài hoàn thành checklist trước khi nộp             |

### Đánh giá hiện tại

- **Đã có trong code:** navigation, 3 màn hình, form, validation, mock data, loading/empty/success/error, responsive và automated tests.
- **Đã có bằng chứng kỹ thuật:** production build thành công và 7 frontend tests pass sau khi thêm owner filter.
- **Tài còn phải tự làm:** đọc code, chạy lại project, quay screen recording, chụp validation evidence và hoàn thành human review checklist.

Không ghi trong báo cáo rằng mọi trang đã có backend. Hiện chỉ chức năng Tasks kết nối API; course, exam và research là mock data; Assistant chưa hoạt động.

## 3. Vì sao chọn React?

Câu trả lời đề xuất:

> Em chọn React vì project hiện đã dùng TypeScript và Vite, React phù hợp với UI được chia thành component, có cơ chế state và event rõ ràng, đồng thời em có thể kiểm thử hành vi bằng React Testing Library. Em không chọn React chỉ vì phổ biến; em chọn vì em có thể lần theo được dữ liệu từ component, form, API đến trạng thái hiển thị và tự sửa khi có lỗi.

Các khái niệm cần hiểu:

- **Component:** hàm TypeScript trả về JSX, ví dụ `TasksPanel`, `CoursesPanel`.
- **Props:** dữ liệu component cha truyền xuống component con, ví dụ `workspace` và `expanded`.
- **State:** dữ liệu thay đổi làm UI render lại, ví dụ `filter`, `notice`, `tasks`, `loading`.
- **Event:** hành động người dùng, ví dụ `onSubmit`, `onChange`, `onClick`.
- **Effect:** đồng bộ component với tác động bên ngoài, ví dụ gọi API khi `useWorkspace` được mount.
- **Conditional rendering:** chọn UI loading, list, empty hoặc error theo state.

## 4. Kiến trúc frontend cần nhớ

```text
main.tsx
  └─ render <App />
       ├─ điều hướng và chọn page
       ├─ gọi useWorkspace()
       │    └─ api.ts gọi REST API
       ├─ TasksPanel nhận workspace qua props
       └─ AcademicPanels dùng mock data
            └─ academic-data.ts
```

Vai trò từng file:

| File                              | Trách nhiệm                                   | Cách giải thích ngắn                       |
| --------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `apps/web/src/main.tsx`           | Điểm khởi động React và import font/style     | Gắn toàn bộ ứng dụng vào phần tử `#root`   |
| `apps/web/src/App.tsx`            | Layout, navigation, page state và metadata    | Component cha điều phối các màn hình       |
| `apps/web/src/TasksPanel.tsx`     | Danh sách, filter, form, validation và event  | Component nghiệp vụ chính của 3A           |
| `apps/web/src/use-workspace.ts`   | Task state, loading/error/busy và API actions | Custom hook tách data logic khỏi JSX       |
| `apps/web/src/api.ts`             | Chuẩn hóa `fetch`, JSON và lỗi HTTP           | Ranh giới giữa frontend và backend         |
| `apps/web/src/AcademicPanels.tsx` | Các panel học vụ tái sử dụng                  | UI component nhận dữ liệu và props         |
| `apps/web/src/academic-data.ts`   | Mock courses, exams và research               | Tách dữ liệu mẫu khỏi component            |
| `apps/web/src/styles.css`         | Token giao diện, layout và responsive         | CSS/Tailwind điều khiển cách hiển thị      |
| `apps/web/src/App.test.tsx`       | Kiểm thử hành vi chính                        | Chứng minh form, lỗi và lưu note hoạt động |

## 5. Giải thích navigation

Ứng dụng dùng hash routing nhẹ để phù hợp với skeleton, chưa cần thêm React Router.

```ts
function currentPage() {
  return (
    pages.find((page) => page.id === window.location.hash.slice(1)) || pages[0]
  );
}
```

Cách nói:

1. Sidebar đặt link dạng `#dashboard`, `#tasks`, `#courses`.
2. `window.location.hash` chứa page hiện tại.
3. `currentPage()` tìm cấu hình page tương ứng.
4. Nếu hash không hợp lệ, chương trình quay về Dashboard.
5. Event `hashchange` cập nhật React state và đưa focus tới heading mới để hỗ trợ bàn phím/screen reader.

Trade-off cần biết: cách này đơn giản cho bài skeleton nhưng không có route data loading, nested routes hoặc URL server-side như React Router.

## 6. Giải thích form và validation

Form task dùng các phần tử HTML có ngữ nghĩa: `form`, `label`, `input`, `button`.

### Luồng submit

```text
Người dùng submit
  → preventDefault()
  → đọc FormData
  → trim title
  → kiểm tra title ít nhất 3 ký tự
  → workspace.create(...)
  → api.createTask(...) gửi POST /api/tasks
  → thành công: thêm task vào state + reset form + hiện success
  → thất bại: giữ dữ liệu hiện tại + hiện error
```

Hai lớp validation frontend:

- Thuộc tính HTML: `required`, `minLength={3}`, `maxLength={160}`.
- Kiểm tra trong `submit()`: sau khi `trim()`, title phải có ít nhất 3 ký tự.

Vì sao cần kiểm tra sau `trim()`? Chuỗi chỉ có khoảng trắng có thể có độ dài lớn hơn 3 nhưng không phải tiêu đề hợp lệ.

Frontend validation giúp phản hồi nhanh, nhưng không thay thế backend validation. Client có thể bị bỏ qua hoặc request có thể được gửi bằng công cụ khác, nên backend vẫn phải kiểm tra DTO.

## 7. Giải thích state và API

`useWorkspace()` gom các state liên quan đến task:

- `tasks`: danh sách task hiện tại.
- `loading`: đang tải lần đầu hoặc reload.
- `error`: thông báo lỗi để UI hiển thị.
- `busy`: đang create/update, dùng để khóa nút tránh gửi lặp.

Khi component được mount, `useEffect` gọi `reload()`. `reload()` đặt loading, gọi `api.listTasks()`, cập nhật task nếu thành công, lưu error nếu thất bại và luôn tắt loading trong `finally`.

Khi đổi trạng thái thất bại, code không cập nhật task trước rồi mới rollback. Nó chờ API thành công mới thay task trong state. Vì vậy giao diện giữ trạng thái cũ và báo: `Your previous status has been kept.` Đây là **pessimistic update**, dễ hiểu và an toàn cho skeleton.

## 8. Mock data và bốn UI state

### Mock data

`academic-data.ts` chứa các object mẫu cho courses, exams và research. Tách mock data khỏi JSX có ba lợi ích:

1. Component dễ đọc hơn.
2. Có thể thay mock bằng API sau này mà không viết lại toàn bộ giao diện.
3. Tránh lặp markup; component dùng `map()` để render theo dữ liệu.

### Bốn trạng thái Tasks

| State   | Điều kiện                                        | UI                                                |
| ------- | ------------------------------------------------ | ------------------------------------------------- |
| Loading | `workspace.loading === true`                     | `Loading project tasks…` với `role="status"`      |
| Empty   | Không loading, không error, `tasks.length === 0` | Thông báo chưa có task                            |
| Success | POST trả về task hợp lệ                          | Task mới được thêm và thông báo success xuất hiện |
| Error   | Fetch/HTTP thất bại                              | Thông báo `role="alert"` và nút Retry             |

Sự khác nhau giữa mock và API trong bài này:

- Mock data chứng minh UI có thể render từ dữ liệu có cấu trúc mà chưa cần backend cho mọi module.
- Tasks chứng minh form và frontend có thể kết nối API thật.
- Frontend tests mock `fetch` để tái tạo success/error ổn định, không phụ thuộc network hoặc database khi test.

## 9. Responsive và accessibility

Điểm responsive cần trình bày:

- Desktop từ 900 px: sidebar hiển thị cố định và nội dung có hai cột.
- Dưới 900 px: sidebar thành menu mở/đóng.
- Dưới 600 px: dashboard về một cột, khoảng cách nhỏ hơn, bảng dài có vùng cuộn.
- Nút quan trọng trên mobile có kích thước chạm tối thiểu 44 px.

Điểm accessibility cần trình bày:

- Chỉ một `h1` cho mỗi page; các panel dùng `h2`, card dùng `h3/h4`.
- Có `main`, `nav`, `aside`, `header`, `footer`, `section`, `article`, `form`, `table`.
- Form có label; icon trang trí dùng `aria-hidden`; lỗi dùng `role="alert"`.
- Có skip link và focus outline cho người dùng bàn phím.
- Bảng có `caption`, `th` và `scope`; ảnh cover có `alt`, `width`, `height`.
- Menu mobile có `aria-expanded`, `aria-controls` và đóng được bằng phím Escape.

## 10. Bảy test hiện có nói lên điều gì?

`apps/web/src/App.test.tsx` kiểm tra:

1. Dashboard có heading, navigation, task và nhãn mock data.
2. Điều hướng tới Tasks, nhập form, submit và gửi đúng API contract.
3. Owner filter lọc đúng và hiển thị empty state khi không có kết quả.
4. PATCH thất bại thì giữ nguyên status cũ và hiện alert.
5. Backend unavailable thì có error và Retry.
6. Assistant vẫn disabled khi RAG chưa được cấu hình.
7. Quick notes được lưu vào `localStorage`.

Test không thay thế việc xem giao diện thật. Nó bảo vệ các hành vi quan trọng khi code thay đổi.

## 11. Kịch bản demo Homework 3A trong 5–7 phút

### Phần 1 — giới thiệu, 30 giây

> CourseMate AI là workspace học tập của nhóm hai người. Trong Homework 3A, em tập trung vào frontend skeleton bằng React: navigation, ba màn hình, form task, mock data, các UI state và responsive.

### Phần 2 — ba màn hình, 1 phút

- Mở Dashboard và chỉ layout tổng quan.
- Chuyển Tasks, giải thích đây là màn hình có nghiệp vụ thật.
- Chuyển Courses, chỉ cách một component render nhiều card từ mock data.

### Phần 3 — form và state, 2 phút

- Submit title quá ngắn để thấy validation.
- Nhập title hợp lệ, owner và due date rồi tạo task.
- Lọc theo To do/In progress/Done.
- Nói rõ `useState → event → API → setState → React render lại`.

### Phần 4 — loading/empty/error, 1 phút

- Nêu điều kiện của bốn state trong `TasksPanel`.
- Tắt API hoặc dùng network offline để cho thấy error và Retry.
- Có thể dùng test output làm bằng chứng ổn định cho success/error.

### Phần 5 — responsive và review AI, 1–2 phút

- Mở DevTools, thử 320 px rồi desktop.
- Nêu những điểm đã review: semantic HTML, mobile overflow, API failure, không giả vờ Assistant đã hoạt động.
- Kết luận AI giúp tạo bản nháp nhanh, nhưng kỹ sư vẫn phải hiểu state, data flow, validation, failure mode, accessibility và kiểm tra bằng test/build.

## 12. AI usage và human review

### Phần được AI hỗ trợ

- Tạo cấu trúc dashboard, các React components và responsive styles.
- Tạo custom hook quản lý task state và error handling.
- Tạo frontend tests và tài liệu giải thích.
- Gợi ý semantic HTML, accessibility và cách chia mock data.

### Các chỉnh sửa đã thực hiện sau kiểm tra kỹ thuật

- Sửa lưới mobile bị cắt ở viewport 320 px.
- Đảm bảo API update lỗi không làm mất trạng thái task trước đó.
- Gắn nhãn rõ cho dữ liệu minh họa.
- Giữ Assistant ở trạng thái disabled vì RAG/LLM chưa được triển khai.
- Thêm Escape, focus return và `aria-controls` cho menu mobile.

### Human review checklist — Tài tự hoàn thành

Không đánh dấu nếu chưa tự kiểm tra.

- [ ] Tôi tự chạy được project và biết URL frontend/API.
- [ ] Tôi chỉ được component cha, component con và props trong source.
- [ ] Tôi giải thích được `useState`, `useEffect` và custom hook.
- [ ] Tôi lần được luồng submit từ `TasksPanel` tới `api.ts`.
- [ ] Tôi giải thích được validation HTML và validation sau `trim()`.
- [ ] Tôi tự tái hiện được loading, empty, success và error.
- [ ] Tôi kiểm tra được giao diện mobile và desktop.
- [ ] Tôi chạy được frontend tests và đọc được kết quả.
- [ ] Tôi xác nhận mock data không phải dữ liệu backend thật.
- [ ] Tôi đã ghi ít nhất một lỗi hoặc điểm chưa hiểu và cách tôi xử lý.

Sau khi hoàn thành, thêm dòng sau vào bài nộp:

> Human review performed : traced the task creation flow, reproduced validation and failure states, checked responsive layouts, ran tests/build, and confirmed which modules use mock data. Corrections or questions found: [Tài điền].

## 13. Câu hỏi vấn đáp và câu trả lời ngắn

### React render lại khi nào?

Khi state hoặc props liên quan thay đổi. Ví dụ `setTasks()` tạo danh sách mới, React chạy lại component và cập nhật phần DOM cần thiết.

### Vì sao không sửa trực tiếp mảng `tasks`?

React dựa vào thay đổi reference để nhận biết state mới. `map()` hoặc `[task, ...current]` tạo mảng mới, rõ ràng và ít gây lỗi hơn mutation.

### `useEffect` dùng để làm gì ở đây?

Để gọi API lấy task sau khi custom hook được mount. Việc gọi API là side effect vì nó tương tác với hệ thống bên ngoài quá trình render.

### Vì sao dùng custom hook?

Để tách data state và API actions khỏi markup. `TasksPanel` tập trung vào UI; `useWorkspace` tập trung vào tải, tạo, cập nhật và xử lý lỗi.

### Vì sao có cả `loading` và `busy`?

`loading` mô tả tải danh sách; `busy` mô tả thao tác create/update. Tách hai state giúp hiển thị đúng thông báo và khóa đúng control.

### Mock data khác hard-coded JSX như thế nào?

Mock data là dữ liệu có cấu trúc tách riêng. JSX dùng `map()` để render. Khi có API thật, có thể thay nguồn dữ liệu mà giữ component.

### Vì sao form vẫn cần backend validation?

Frontend có thể bị bỏ qua. Backend là ranh giới tin cậy cuối cùng trước khi lưu database.

### Error từ API được xử lý ở đâu?

`api.ts` kiểm tra `response.ok` và throw Error. `useWorkspace` catch lỗi, lưu message vào state; `TasksPanel` render alert và Retry.

### Tại sao chưa dùng React Router?

Homework 3A chỉ cần navigation cho skeleton. Hash routing đủ nhỏ và không thêm dependency. Khi cần nested routes, route parameters hoặc data routing, nhóm có thể chuyển sang React Router.

### AI tạo giao diện thì kỹ sư vẫn phải làm gì?

Kỹ sư phải xác minh yêu cầu, hiểu component/state/event/data flow, kiểm tra validation và error path, review accessibility/responsive, chạy test/build và chịu trách nhiệm cho code được chấp nhận.

## 14. Lệnh chạy và bằng chứng cần nộp

Từ thư mục `Final-Project`:

```powershell
npm install
npm run dev:api
npm run dev:web
```

Kiểm tra trước khi nộp:

```powershell
npm run format:check --workspace @coursemate/web
npm run typecheck --workspace @coursemate/web
npm run test --workspace @coursemate/web
npm run build --workspace @coursemate/web
```

Submission evidence cần chuẩn bị:

- Link hoặc commit chạy được: `f1f0e00` trên nhánh `feature/tai` là baseline UI hiện tại.
- Screen recording theo kịch bản mục 11.
- Ảnh hoặc video validation title ngắn và title hợp lệ.
- Terminal cho thấy test/build pass ở máy Tài.
- `docs/ai-usage-log.md` đã cập nhật.
- Human review checklist có ghi chú thật của Tài.

## 15. Bài tập ôn nhanh

Không nhìn tài liệu, hãy tự trả lời và chỉ vào code:

1. Page hiện tại được xác định từ đâu?
2. `workspace` chứa những state và action nào?
3. Khi title là ba khoảng trắng, đoạn nào chặn submit?
4. Khi POST thành công, vì sao task xuất hiện ngay?
5. Khi PATCH thất bại, vì sao status cũ vẫn còn?
6. Mock courses nằm ở đâu và render bằng cách nào?
7. Dưới 600 px, layout thay đổi những gì?
8. Test nào chứng minh error state có Retry?
9. Phần nào của Assistant chưa làm?
10. Nếu bỏ backend, phần nào của UI vẫn chạy được?
