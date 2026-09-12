# Homework 3A — React UI Skeleton

> Tài liệu ôn tập và chuẩn bị
> Project: ExaMate AI
> Framework được chọn: React 19 + TypeScript + Vite
> Cập nhật theo commit `b83733c` trên nhánh `feature/tai`

---

## 0. Đọc mục này trước

Tài liệu này **không phải để học thuộc**. Giảng viên sẽ chỉ vào code và hỏi "chỗ này làm gì". Cách dùng đúng:

1. Mở song song tài liệu và source code.
2. Mỗi khi tài liệu nhắc một file, mở file đó ra xem thật.
3. Chỗ nào đọc mà không hiểu, ghi lại — mục 12 yêu cầu bạn nộp ít nhất một chỗ như vậy.

Một cảnh báo trung thực: phần lớn code này được viết với sự hỗ trợ của AI. Điều đó **không sao**, miễn là bạn giải thích được. Điều bị trừ điểm là trình bày một thứ như thể mình tự nghĩ ra mà không lần được luồng dữ liệu.

---

## 1. Kết luận ngắn

ExaMate AI đã vượt yêu cầu tối thiểu của Homework 3A. Vì vậy **rủi ro lớn nhất là nói quá nhiều**. Chọn đúng ba màn hình chính:

1. **Dashboard** — tổng quan lịch học, task, môn học và các trạng thái.
2. **Tasks** — danh sách, hai bộ lọc và form tạo task có validation. Đây là màn hình duy nhất nối API thật.
3. **Courses** — course gallery: state, sự kiện, bàn phím và mock data.

Nếu còn thời gian mới nói tới **Documents** (chọn file PDF phía trình duyệt) và **Assistant** (khung giao diện AI, chưa có AI thật).

App có 8 trang: Dashboard, Courses, Tasks, Exams, Research, Documents, Finances, Assistant. Exams, Research, Finances là phần mở rộng skeleton — không cần giải thích sâu.

**Câu phải nói rõ khi trình bày:** chỉ Tasks nối API thật. Courses, Exams, Research là mock data. Documents chỉ đọc metadata file trong trình duyệt, **chưa upload lên server**. Assistant chưa có AI/RAG.

---

## 2. Đối chiếu trực tiếp với yêu cầu 3A

| Yêu cầu của giảng viên | ExaMate AI đáp ứng ở đâu | Bằng chứng nên trình bày |
| --- | --- | --- |
| Main navigation và 2–3 màn hình thiết yếu | Sidebar và hash routing trong `App.tsx` | Chuyển lần lượt Dashboard, Tasks, Courses |
| Một form hoạt động và có validation | Form tạo task trong `TasksPanel.tsx` | Thử title 1–2 ký tự, rồi tạo task hợp lệ |
| Mock data | `academic-data.ts` | 6 course, 3 exam, 3 research card |
| Loading state | `loading` trong `use-workspace.ts` | `Loading project tasks…` khi API chậm |
| Empty state | `tasks.length === 0` trong `TasksPanel.tsx` | Lọc theo owner không có kết quả |
| Success state | `Task added successfully.` sau POST | Tạo một task hợp lệ |
| Error state | `role="alert"` + nút Retry | Tắt API rồi tải lại trang |
| Responsive layout | Media query trong `styles.css` | DevTools ở 320 px, 375 px, 768 px, 1440 px |
| Component tái sử dụng + props | `Panel`, `DocumentCard`, `CoursesPanel({ expanded })` | Cùng một component, hai ngữ cảnh khác nhau |
| Ghi nhận code do AI tạo và human review | `docs/ai-usage-log.md` và mục 12 | Checklist tự làm trước khi nộp |

### Trạng thái thật hiện tại

- **Đã có trong code:** navigation 8 trang, form + validation hai lớp, mock data, loading/empty/success/error, responsive, accessibility, animation có kiểm soát.
- **Bằng chứng kỹ thuật:** **15 frontend tests + 1 backend test** pass; typecheck, format, production build đều xanh; `docker compose config` hợp lệ.
- **Bạn còn phải tự làm:** đọc code, chạy lại project, quay màn hình, chụp bằng chứng validation, hoàn thành checklist mục 12.

---

## 3. Vì sao chọn React?

Câu trả lời đề xuất:

> Em chọn React vì project đã dùng TypeScript và Vite, React chia UI thành component với cơ chế state và event rõ ràng, và em kiểm thử được hành vi bằng React Testing Library. Em không chọn vì nó phổ biến; em chọn vì em lần được dữ liệu từ component → form → API → trạng thái hiển thị, và tự sửa được khi lỗi.

Sáu khái niệm phải hiểu, kèm ví dụ có thật trong project:

| Khái niệm | Định nghĩa ngắn | Ví dụ trong code |
| --- | --- | --- |
| **Component** | Hàm TypeScript trả về JSX | `TasksPanel`, `CourseCarousel`, `DocumentCard` |
| **Props** | Dữ liệu cha truyền xuống con | `workspace`, `expanded`, `compact`, `onStateChange` |
| **State** | Dữ liệu đổi thì UI render lại | `filter`, `ownerFilter`, `active`, `documents` |
| **Event** | Hành động người dùng | `onSubmit`, `onChange`, `onClick`, `onKeyDown` |
| **Effect** | Đồng bộ với thế giới bên ngoài render | `useEffect` gọi API trong `use-workspace.ts` |
| **Conditional rendering** | Chọn UI theo state | loading / list / empty / error trong `TasksPanel` |

---

## 4. Kiến trúc frontend cần nhớ

```text
main.tsx
  └─ render <App />
       ├─ hash routing → chọn page trong mảng `pages`
       ├─ useWorkspace()  ─────────→ api.ts ──→ REST API (chỉ Tasks)
       ├─ TasksPanel      ← props: workspace
       ├─ CourseCarousel  ← academic-data.ts (mock)
       ├─ AcademicPanels  ← academic-data.ts (mock)
       ├─ DocumentsPanel  → DocumentCard (state cục bộ, không gọi API)
       └─ AssistantPanel  (khung giao diện, không gọi API)
```

| File | Trách nhiệm | Cách giải thích ngắn |
| --- | --- | --- |
| `main.tsx` | Khởi động React, bật `StrictMode`, import font/style | Gắn ứng dụng vào `#root` |
| `App.tsx` | Layout, sidebar, routing, page state, metadata | Component cha điều phối mọi màn hình |
| `TasksPanel.tsx` | Danh sách, 2 filter, form, validation | Component nghiệp vụ chính của 3A |
| `use-workspace.ts` | Task state + loading/error/busy + API actions | Custom hook tách data logic khỏi JSX |
| `api.ts` | Chuẩn hoá `fetch`, JSON, lỗi HTTP | Ranh giới frontend ↔ backend |
| `CourseCarousel.tsx` | Gallery môn học có state và bàn phím | Component tương tác phức tạp nhất |
| `AcademicPanels.tsx` | `Panel`, Calendar, Courses, Exams, Research, Notes | Nhiều UI component tái sử dụng |
| `academic-data.ts` | Mock courses/exams/research | Tách dữ liệu mẫu khỏi component |
| `DocumentsPanel.tsx` | Chọn PDF, validation, khử trùng lặp | Form phía trình duyệt, không đụng server |
| `DocumentCard.tsx` | 5 trạng thái vòng đời tài liệu | Component nhận props + callback |
| `AssistantPanel.tsx` | Khung AI theo ngữ cảnh trang | Giao diện dự kiến, gắn nhãn rõ |
| `use-reveal.ts` | Hiện dần card khi cuộn tới | Custom hook thứ hai, có lưới an toàn |
| `styles.css` | Token, layout, responsive, animation | Tailwind v4 + CSS thuần |
| `App.test.tsx` | 15 test hành vi | Bảo vệ các luồng quan trọng |

**Hai custom hook** là điểm cộng khi trình bày: `useWorkspace` (dữ liệu) và `useReveal` (giao diện). Chúng cho thấy bạn hiểu hook không chỉ để gọi API.

---

## 5. Giải thích navigation

Ứng dụng dùng hash routing nhẹ, chưa cần React Router.

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
3. `currentPage()` tìm cấu hình page tương ứng trong mảng `pages`.
4. Hash không hợp lệ → quay về Dashboard (`|| pages[0]`).
5. Event `hashchange` cập nhật state, đóng menu mobile, xoá ô tìm kiếm và **đưa focus tới heading mới** để hỗ trợ bàn phím/screen reader.
6. `useEffect` cập nhật `document.title` và thẻ `meta description` theo từng trang.

**Trade-off phải biết:** đơn giản, không thêm dependency, nhưng không có route data loading, nested routes hay URL phía server như React Router.

---

## 6. Giải thích form và validation

Form task dùng phần tử HTML có ngữ nghĩa: `form`, `label`, `input`, `select`, `button`.

### Luồng submit

```text
Người dùng submit
  → preventDefault()
  → đọc FormData
  → trim() title
  → chặn nếu title < 3 ký tự
  → workspace.create(...)
  → api.createTask(...) gửi POST /api/tasks
  → thành công: thêm task vào đầu danh sách + reset form + hiện success
  → thất bại: giữ nguyên dữ liệu + hiện error
```

### Hai lớp validation ở frontend

- **Thuộc tính HTML:** `required`, `minLength={3}`, `maxLength={160}`.
- **Kiểm tra trong `submit()`:** sau `trim()`, title phải có ít nhất 3 ký tự.

**Vì sao cần kiểm tra sau `trim()`?** Chuỗi ba dấu cách có `length === 3` nên qua được `minLength`, nhưng không phải tiêu đề hợp lệ.

### Vì sao vẫn cần backend validation

Frontend có thể bị bỏ qua hoàn toàn — gọi thẳng API bằng `curl` là xong. Backend là ranh giới tin cậy cuối cùng: `CreateTaskDto` có `@MinLength(3)` nên vẫn trả `400`.

> **Câu chốt khi bị hỏi:** "Validation ở trình duyệt là để người dùng biết ngay. Validation ở backend là để dữ liệu không hỏng. Bỏ cái nào cũng được, nhưng bỏ cái thứ hai thì mất dữ liệu."

---

## 7. Giải thích state và API

`useWorkspace()` gom bốn state liên quan đến task:

| State | Ý nghĩa |
| --- | --- |
| `tasks` | Danh sách task hiện tại |
| `loading` | Đang tải danh sách lần đầu hoặc reload |
| `error` | Thông báo lỗi để UI hiển thị |
| `busy` | Đang create/update — dùng để khoá nút, tránh gửi lặp |

Khi hook được mount, `useEffect` gọi `reload()`. `reload()` bật loading, gọi `api.listTasks()`, cập nhật task nếu thành công, lưu error nếu thất bại, và **luôn** tắt loading trong `finally`.

### Pessimistic update — điểm dễ bị hỏi

Trong `update()`, code **chờ API trả về thành công rồi mới sửa state**:

```ts
const updated = await api.updateTaskStatus(id, status);
setTasks((current) => current.map((t) => (t.id === id ? updated : t)));
```

Nếu API lỗi, state không hề bị đụng tới, và UI báo `Your previous status has been kept.`

Đây là **pessimistic update**. Ngược lại là *optimistic update*: sửa UI ngay rồi rollback nếu lỗi — nhanh hơn nhưng phải tự viết logic hoàn tác.

> ⚠️ **Lưu ý:** `docs/PROJECT-CONTEXT.md` hiện mô tả sai chỗ này ("optimistic status update và rollback"). Code thật là pessimistic. Nếu giảng viên đọc tài liệu đó và hỏi, hãy chỉ thẳng vào `use-workspace.ts` — **code là nguồn sự thật**. Nên sửa lại PROJECT-CONTEXT.

### Vì sao tách `loading` và `busy`?

`loading` mô tả việc tải danh sách (hiện skeleton/thông báo). `busy` mô tả thao tác ghi (khoá nút submit). Gộp làm một thì tạo task sẽ làm cả danh sách biến thành trạng thái loading — sai trải nghiệm.

---

## 8. Mock data và các UI state

### Mock data

`academic-data.ts` chứa 6 course, 3 exam, 3 research card. Tách mock data khỏi JSX có ba lợi ích:

1. Component dễ đọc.
2. Sau này thay bằng API mà không viết lại giao diện.
3. Không lặp markup — component dùng `map()` để render.

Mỗi mục mock đều được gắn nhãn trên giao diện (`Example courses`, `Example dates`, `Planning examples`) để không ai nhầm là dữ liệu thật.

### Bốn trạng thái của Tasks

| State | Điều kiện | UI |
| --- | --- | --- |
| Loading | `workspace.loading === true` | `Loading project tasks…`, `role="status"` |
| Empty | Không loading, không error, `tasks.length === 0` | `No tasks match these filters.` |
| Success | POST trả task hợp lệ | Task mới ở đầu danh sách + thông báo success |
| Error | Fetch/HTTP thất bại | Thông báo `role="alert"` + nút Retry |

### Năm trạng thái của Documents (`DocumentCard.tsx`)

`selected → uploading → processing → ready → failed`

Đây là **bản xem trước giao diện**, đổi bằng ô `select` chứ chưa phải luồng thật — vì backend chưa có endpoint upload. Trạng thái `failed` có nút **Retry** đưa về `selected`.

> **Phải nói rõ:** "Đây là preview của các trạng thái, để khi Thắng làm xong API upload thì giao diện đã sẵn sàng. Hiện chưa có file nào rời khỏi trình duyệt."

---

## 9. Responsive và accessibility

### Breakpoint thật trong `styles.css`

| Breakpoint | Thay đổi |
| --- | --- |
| `min-width: 900px` | Sidebar cố định, shell hai cột |
| `max-width: 899px` | Sidebar thành menu mở/đóng; carousel xếp dọc |
| `max-width: 600px` | Dashboard một cột, khoảng cách nhỏ hơn, bảng dài có vùng cuộn |
| `min-width: 1440px` | Nới rộng khoảng cách nội dung |
| `prefers-reduced-motion` | Tắt toàn bộ animation và transition |

Vùng chạm trên mobile tối thiểu 44 px cho các nút quan trọng.

### Accessibility

- Mỗi trang đúng **một `h1`**; panel dùng `h2`; card dùng `h3/h4`.
- Dùng `main`, `nav`, `aside`, `header`, `footer`, `section`, `article`, `form`, `table`, `figure`.
- Form có `label`; icon trang trí có `aria-hidden`; lỗi dùng `role="alert"`; thông báo dùng `role="status"`.
- Có **skip link** và focus outline rõ cho người dùng bàn phím.
- Bảng có `caption`, `th` và `scope`.
- Ảnh có `alt` mô tả, `width`, `height` (tránh nhảy layout khi tải).
- Menu mobile có `aria-expanded`, `aria-controls`, đóng bằng Escape và **trả focus** về nút mở.
- Carousel có `aria-roledescription="carousel"`, `aria-current` trên thumbnail đang chọn, phím **mũi tên trái/phải**, và vùng `aria-live="polite"` đọc "Course 3 of 6: Economics…".

---

## 10. 15 test hiện có nói lên điều gì?

`apps/web/src/App.test.tsx` — chạy `npm test --workspace @examate/web`:

| # | Test | Bảo vệ điều gì |
| --- | --- | --- |
| 1 | Dashboard có heading, navigation, task, nhãn mock | Cấu trúc ngữ nghĩa cơ bản |
| 2 | Mở/đóng panel AI mà không thay trang | Focus quay lại đúng nút, Escape hoạt động |
| 3 | Prompt AI theo ngữ cảnh, không gọi API | Ranh giới AI chưa triển khai |
| 4 | Routing + tạo task + đúng API contract | Luồng chính của 3A |
| 5 | Lọc theo owner + empty state | Filter và trạng thái rỗng |
| 6 | Carousel đổi môn và thông báo cho screen reader | State + accessibility của gallery |
| 7 | Chọn PDF hợp lệ, không gọi API tài liệu | Documents thuần frontend |
| 8 | Chọn cùng file 2 lần trong 1 lượt → 1 card | Khử trùng lặp |
| 9 | Chọn lại file đã có → báo đúng, không thêm | Thông báo không nói sai sự thật |
| 10 | Xem trước vòng đời tài liệu, không gọi backend | 5 trạng thái |
| 11 | Từ chối file không phải PDF | Validation loại file |
| 12 | PATCH thất bại → giữ nguyên status cũ | Pessimistic update |
| 13 | Backend chết → có error và Retry | Error state |
| 14 | Assistant vẫn disabled khi chưa cấu hình AI | Không khoe tính năng chưa có |
| 15 | Quick notes lưu vào `localStorage` | Lưu trạng thái phía trình duyệt |

Backend có thêm **1 test**: `AssistantController` báo đúng fallback khi AI bị tắt.

**Test không thay thế việc xem giao diện thật.** Nó giữ cho các hành vi quan trọng không vỡ khi code đổi.

---

## 11. Kịch bản demo 5–7 phút

### Phần 1 — giới thiệu, 30 giây

> ExaMate AI là workspace học tập của nhóm hai người. Ở Homework 3A em tập trung vào frontend skeleton bằng React: navigation, ba màn hình chính, form có validation, mock data, các UI state và responsive.

### Phần 2 — ba màn hình, 1 phút

- **Dashboard:** chỉ layout tổng quan và các panel.
- **Tasks:** "đây là màn hình duy nhất nối API thật".
- **Courses:** bấm next vài lần cho thấy ảnh nền và tiêu đề đổi theo môn.

### Phần 3 — form và state, 2 phút

- Submit title 2 ký tự → validation chặn.
- Nhập title hợp lệ + owner + due date → tạo task.
- Lọc theo Status và Owner.
- Nói rõ: `useState → event → API → setState → React render lại`.

### Phần 4 — loading/empty/error, 1 phút

- Nêu điều kiện của bốn state trong `TasksPanel`.
- Tắt API (hoặc DevTools → Network → Offline) → thấy error + Retry.
- Có thể chiếu kết quả test làm bằng chứng ổn định.

### Phần 5 — responsive và human review, 1–2 phút

- DevTools: 320 px → 768 px → desktop.
- Bật `prefers-reduced-motion` → animation tắt, **nội dung vẫn hiện đủ**.
- Nêu vài điểm đã tự review (xem mục 12).
- Kết: AI dựng nháp nhanh, nhưng kỹ sư vẫn phải hiểu state, data flow, validation, failure mode và accessibility.

---

## 12. AI usage và human review

### Phần được AI hỗ trợ

- Cấu trúc dashboard, các React component, responsive styles.
- Hai custom hook (`useWorkspace`, `useReveal`).
- Course carousel, Documents panel, Assistant panel.
- Frontend tests và tài liệu.

### Lỗi thật đã tìm ra và sửa sau khi kiểm tra

Đây là phần **giá trị nhất khi vấn đáp** — nó chứng minh có người thật review chứ không phải nhận code AI rồi nộp:

| Lỗi | Vì sao nguy hiểm | Đã sửa thế nào |
| --- | --- | --- |
| Chọn cùng 1 file 2 lần trong một lượt tạo 2 card **trùng React `key`** | Nút xoá sẽ xoá cả hai cùng lúc | Khử trùng lặp ngay trong vòng lặp, khoá bằng test |
| Thông báo báo "đã thêm 1 PDF" dù thực tế bị bỏ qua vì trùng | Nói sai sự thật với người dùng | Đếm số thật sự thêm, không đếm số file chọn |
| `animation-fill-mode: both` **ghim card ở `opacity: 0`** khi chuyển động bị tắt | Người bật giảm chuyển động sẽ thấy trang trống | Đổi từ animation sang transition, trạng thái cuối là khai báo thuần |
| `IntersectionObserver` im lặng không chạy trong một số môi trường | Card không bao giờ hiện | Đổi sang scroll listener + lưới an toàn theo thời gian |
| `scrollIntoView` với `behavior: "smooth"` bị đóng băng | Bấm next nhưng thumbnail nằm ngoài màn hình | Tự tính vị trí đích + lưới an toàn 600 ms |
| Lưới mobile bị cắt ở 320 px | Vỡ layout trên máy nhỏ | Sửa media query |
| Ảnh hero hotlink từ Unsplash | Demo mất mạng là vỡ giao diện | Tải về `public/img`, dùng file local |

**Bài học chung của ba lỗi giữa:** đừng để một hiệu ứng trang trí là thứ duy nhất quyết định nội dung có hiện hay không. Trạng thái cuối phải là khai báo, hiệu ứng chỉ là đường đi tới đó.

Nếu chỉ nhớ được một điều để nói khi vấn đáp, hãy nhớ câu này.

### Human review checklist — tự làm, không đánh dấu bừa

- [ ] Tôi tự chạy được project và biết URL frontend/API.
- [ ] Tôi chỉ được component cha, component con và props trong source.
- [ ] Tôi giải thích được `useState`, `useEffect` và custom hook.
- [ ] Tôi lần được luồng submit từ `TasksPanel` → `use-workspace.ts` → `api.ts`.
- [ ] Tôi giải thích được validation HTML và validation sau `trim()`.
- [ ] Tôi tự tái hiện được loading, empty, success và error.
- [ ] Tôi mở được carousel và giải thích `active` state đổi thế nào.
- [ ] Tôi bật `prefers-reduced-motion` và xác nhận nội dung vẫn hiện đủ.
- [ ] Tôi kiểm tra giao diện ở 320 px và desktop.
- [ ] Tôi chạy được 15 frontend tests và đọc được kết quả.
- [ ] Tôi xác nhận Courses/Exams/Research là mock, Documents chưa upload, Assistant chưa có AI.
- [ ] Tôi ghi lại ít nhất một lỗi hoặc điểm chưa hiểu và cách xử lý.

Sau khi xong, thêm dòng này vào bài nộp:

> Human review performed: traced the task creation flow, reproduced validation and failure states, checked responsive layouts and reduced motion, ran tests and build, and confirmed which modules use mock data. Corrections or questions found: [Tài điền].

---

## 13. Câu hỏi vấn đáp và câu trả lời ngắn

### Nhóm cơ bản

**React render lại khi nào?**
Khi state hoặc props liên quan thay đổi. `setTasks()` tạo mảng mới → React chạy lại component và chỉ cập nhật phần DOM cần thiết.

**Vì sao không sửa trực tiếp mảng `tasks`?**
React so sánh reference để biết state đã đổi. `map()` hoặc `[task, ...current]` tạo mảng mới. Mutation trực tiếp có thể không kích hoạt render.

**`useEffect` dùng để làm gì ở đây?**
Gọi API lấy task sau khi hook mount. Gọi API là side effect vì nó tương tác với bên ngoài quá trình render.

**Vì sao dùng custom hook?**
Tách data state và API actions khỏi markup. `TasksPanel` lo UI, `useWorkspace` lo tải/tạo/cập nhật/lỗi.

**Vì sao có cả `loading` và `busy`?**
`loading` cho việc tải danh sách, `busy` cho thao tác ghi. Gộp lại thì tạo task sẽ làm cả danh sách chớp sang trạng thái loading.

**Mock data khác hard-coded JSX thế nào?**
Mock data là dữ liệu có cấu trúc tách riêng, JSX dùng `map()` render. Đổi sang API thật chỉ cần đổi nguồn dữ liệu, giữ nguyên component.

**Error từ API xử lý ở đâu?**
`api.ts` kiểm tra `response.ok` và throw. `useWorkspace` catch, lưu message vào state. `TasksPanel` render alert + Retry.

**Tại sao chưa dùng React Router?**
3A chỉ cần navigation cho skeleton. Hash routing đủ và không thêm dependency. Khi cần nested routes hoặc route params thì chuyển.

**`StrictMode` trong `main.tsx` là gì? Vì sao effect chạy hai lần lúc dev?**
`StrictMode` là chế độ kiểm tra của React ở môi trường development. Nó cố ý mount → unmount → mount lại component và gọi effect hai lần để lộ ra effect nào thiếu hàm dọn dẹp. **Bản production chỉ chạy một lần.** Đây là lý do mọi `useEffect` trong project đều trả về hàm cleanup — ví dụ `useReveal` gỡ scroll listener và `clearTimeout`, `App.tsx` gỡ listener `keydown`/`hashchange`.

**Font lấy từ đâu?**
Poppins cài qua gói `@fontsource`, import ngay trong `main.tsx` nên font nằm trong bundle. Không gọi Google Fonts — cùng lý do với ảnh: demo không có mạng vẫn hiển thị đúng.

### Nhóm về phần mới — dễ bị hỏi "có thật là em viết không"

**Carousel lưu state gì?**
Đúng một state: `active` (chỉ số môn đang chọn). Ảnh nền, tiêu đề, tiến độ, thumbnail nổi lên — tất cả đều tính ra từ `active`. Một nguồn sự thật, không đồng bộ thủ công.

**Vì sao ảnh nền xếp chồng cả 6 ảnh thay vì đổi `src`?**
Đổi `src` sẽ có khoảng trắng trong lúc tải ảnh mới. Xếp chồng rồi đổi `opacity` cho phép chuyển mượt, và ảnh đã tải sẵn.

**Vì sao bỏ `IntersectionObserver`?**
Vì đo thực tế thấy nó không phát tín hiệu trong một số môi trường, làm card không bao giờ hiện. Đổi sang scroll listener + `getBoundingClientRect`, kèm hẹn giờ an toàn: xấu nhất là card hiện ra không có hiệu ứng, không bao giờ là card không hiện.

**Vì sao dùng transition mà không dùng animation cho hiệu ứng hiện dần?**
Vì animation có `fill-mode` nằm **trên** khai báo thường trong cascade. Khi chuyển động bị tắt, animation đứng ở frame đầu và ghim `opacity: 0` — nội dung biến mất. Với transition, trạng thái cuối là khai báo thuần, tắt chuyển động thì nó hiện ngay.

**Ô `select` trạng thái tài liệu là controlled hay uncontrolled?**
Controlled — `value` lấy từ state của component cha, `onChange` gọi `onStateChange` để cha cập nhật. React giữ quyền quyết định giá trị hiển thị.

**Documents có gửi file lên server không?**
Không. Chỉ đọc `name`, `size`, `lastModified` từ đối tượng `File` trong trình duyệt. Không đọc nội dung, không lưu `localStorage`, không gọi `/api/documents`. Có test khoá điều này.

**Vì sao giới hạn 10 MB và chỉ PDF ở frontend?**
Để phản hồi nhanh cho người dùng. Nhưng đây **chỉ là UX** — khi có API thật, backend vẫn phải kiểm tra lại loại file, kích thước và nội dung, vì file upload là dữ liệu không đáng tin.

**AI tạo giao diện thì kỹ sư còn phải làm gì?**
Xác minh yêu cầu, hiểu component/state/event/data flow, kiểm tra validation và đường lỗi, review accessibility và responsive, chạy test/build, và **chịu trách nhiệm** cho code đã nhận. Bằng chứng cụ thể: bảng lỗi ở mục 12.

---

## 14. Lệnh chạy và bằng chứng cần nộp

Từ thư mục `Final-Project`:

```bash
npm install
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Kiểm tra trước khi nộp:

```bash
npm run format:check --workspace @examate/web
```

```bash
npm run typecheck --workspace @examate/web
```

```bash
npm run test --workspace @examate/web
```

```bash
npm run build --workspace @examate/web
```

> **Lưu ý:** tên workspace đã đổi từ `@coursemate/*` sang `@examate/*` sau khi đổi tên sản phẩm. Lệnh cũ sẽ báo không tìm thấy workspace.

### Submission evidence cần chuẩn bị

- Commit chạy được: **`b83733c`** trên nhánh `feature/tai`.
- Screen recording theo kịch bản mục 11.
- Ảnh/video validation title ngắn và title hợp lệ.
- Terminal cho thấy **15 test + build pass** trên máy bạn.
- `docs/ai-usage-log.md` đã cập nhật.
- Human review checklist có ghi chú thật.

---

## 15. Bài tập ôn nhanh

Không nhìn tài liệu, tự trả lời và **chỉ vào code**:

1. Page hiện tại được xác định từ đâu?
2. `workspace` chứa những state và action nào?
3. Khi title là ba dấu cách, đoạn nào chặn submit? Vì sao `minLength={3}` không chặn được?
4. Khi POST thành công, vì sao task xuất hiện ngay ở đầu danh sách?
5. Khi PATCH thất bại, vì sao status cũ vẫn còn? Tên gọi của cách làm này là gì?
6. Mock courses nằm ở đâu và render bằng cách nào?
7. Dưới 600 px layout đổi những gì?
8. Test nào chứng minh error state có Retry?
9. Carousel giữ bao nhiêu state? Bấm next thì những gì đổi theo?
10. Nếu tắt chuyển động, vì sao card vẫn hiện? Trả lời bằng CSS.
11. Documents đã upload file lên server chưa? Chứng minh bằng test nào?
12. Phần nào của Assistant chưa làm?
13. Nếu tắt hẳn backend, phần nào của UI vẫn chạy được?

Trả lời trôi chảy 13 câu này là đủ tự tin cho buổi vấn đáp.
