# Handoff — ExaMate AI chatbox (FE → Thắng)

Ngày cập nhật: 24/09/2026 (Asia/Saigon) · Người làm FE: Tài (có hỗ trợ của Claude Code) · Người nhận: Thắng

Tài liệu này thay cho mô hình dock/overlay/bottom-sheet trong `docs/ideas/responsive-ai-copilot.md`. Nó chỉ mô tả phần giao diện. **Chưa có API hỏi-đáp nào tồn tại**; mọi shape request/response bên dưới là đề xuất để hai bên thống nhất, không phải contract.

## 1. Ai giữ cái gì

| Phần                                           | File                                                                                                            | Trách nhiệm                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Trạng thái mở/đóng, modal hay không, trả focus | `apps/web/src/App.tsx` (`assistantOpen`, `useNarrowScreen`, `openAssistant`, `closeAssistant`)                  | App là chủ duy nhất. Nút launcher nổi, nút hero và trang `#assistant` đều gọi `openAssistant`. |
| Hội thoại: draft, messages, status, `send`     | `apps/web/src/use-assistant.ts` (`useAssistant`)                                                                | Gọi một lần trong App, nên draft sống suốt phiên tab. Không ghi `localStorage`; reload là mất. |
| Hiển thị                                       | `apps/web/src/AssistantPanel.tsx`                                                                               | Thuần hiển thị, luôn được mount; đóng chỉ đặt `hidden`, không unmount.                         |
| Kiểu dáng                                      | `apps/web/src/styles.css` (`.assistant-panel`, `.is-window`, `.is-sheet`, `.floating-controls`, `.ai-launcher`) |                                                                                                |

```
Launcher / nút hero / #assistant ──openAssistant()──▶ App (assistantOpen, modal)
                                                        │
                                   useAssistant(transport?) ── draft, messages, status
                                                        │
                                               <AssistantPanel hidden={!open}>
                                                        │ submit
                                          assistant.send({ pageId, pageName })
                                                        │
                                               transport(question, context)  ◀── Thắng nối ở đây
```

- Màn hình ≥ 768px: cửa sổ nổi **không modal** (`<aside>`), trang phía sau vẫn dùng được, không reflow.
- Màn hình < 768px: bottom sheet **modal** (`role="dialog"`, `aria-modal`), shell/skip link/nút nổi bị `inert`, khóa cuộn `body`, `Escape` đóng và trả focus về nút đã mở (hoặc launcher).

## 2. Cái gì chạy thật, cái gì còn preview

Chạy thật trong app: mở/đóng từ mọi trang, giữ draft khi đổi trang hoặc đóng/mở lại, gợi ý câu hỏi điền vào draft, focus/Escape/inert/khóa cuộn, layout 375/768/1440.

Còn preview: App gọi `useAssistant()` **không có transport**, nên `status = "unavailable"`, nút _Send question_ luôn disabled, panel hiện nhãn _Interface preview_ và câu “Phần AI đang được Thắng kết nối…”. Khối “Example grounded answer” là ví dụ có gắn nhãn, không phải hội thoại.

Chỉ được kiểm thử bằng fixture (`apps/web/src/assistant.test.tsx`), **chưa từng chạy với backend**: hiển thị câu trả lời + nguồn, trạng thái đang gửi, lỗi giữ nguyên draft, chặn gửi trùng khi đang chờ.

Backend hiện có: chỉ `GET /api/assistant/status` (`apps/api/src/assistant/assistant.controller.ts`) trả `status: "not_configured"`. FE chưa gọi endpoint này.

## 3. Điểm cần nối

Chỉ một chỗ: viết một hàm `AskTransport` và truyền vào `useAssistant(transport)` ở `App.tsx`.

```ts
// apps/web/src/use-assistant.ts — kiểu view của FE, không phải HTTP contract
type AskTransport = (
  question: string,
  context: { pageId: string; pageName: string },
) => Promise<{
  text: string;
  citations: { title: string; locator?: string }[];
}>;
```

Hàm này nên dùng `request()` trong `apps/web/src/api.ts` (đã có timeout 60s, thông báo lỗi và Request ID) và dịch response của BE sang kiểu trên. Hook lo phần còn lại: status `sending` → `idle`/`error`, chặn gửi trùng bằng ref, chỉ xóa draft khi thành công.

Dữ liệu FE **đang có** ở App: `route.page.id`, `page.name`, `route.courseSlug` và `selectedCourse` (khi ở `#courses/<slug>`), danh sách documents trong workspace (có `course_id`). Context hiện chỉ gửi `pageId`, `pageName`.

Dữ liệu **cần thống nhất**: có gửi `courseId`/`documentIds` không; citation cần `documentId` để mở đúng tài liệu; hiển thị lỗi chung hay lỗi chi tiết của BE (hiện panel chỉ hiện câu chung tiếng Việt, bỏ qua message của `request()`).

## 4. Đề xuất contract (chưa tồn tại — cần Thắng quyết)

Nếu thống nhất, khai báo ở `packages/contracts/index.d.ts`, không khai báo trùng trong FE.

- Request: `POST /api/assistant/ask` với `{ question: string; courseId?: string; pageId?: string }`.
- Response: `{ answer: string; citations: { documentId: string; title: string; page?: number; snippet?: string }[] }`.
- Lỗi: dùng format lỗi chung hiện có (`message`, `requestId`); phân biệt “chưa cấu hình AI” (503?), “không tìm thấy nguồn phù hợp” (200 với `citations: []` và câu trả lời nói rõ), và lỗi validation (400).
- Streaming: chưa làm. Nếu chọn SSE, `AskTransport` phải đổi thành dạng nhận từng phần; nên chốt trước khi FE làm.
- Câu hỏi mở: giới hạn độ dài câu hỏi; có lưu lịch sử hội thoại ở BE không; hủy request (FE chưa có nút hủy).

## 5. Ranh giới an toàn

- API key/credential của nhà cung cấp AI chỉ ở BE. Không đưa vào biến `VITE_*`, bundle hay log.
- BE phải tự kiểm tra quyền truy cập tài liệu. `courseId`/`pageId` do FE gửi chỉ là gợi ý phạm vi, không phải bằng chứng quyền.
- Câu trả lời được render dạng text (`<p>{message.text}</p>`), không dùng `dangerouslySetInnerHTML`. Nếu muốn Markdown thì phải có bước sanitize, cần thống nhất trước.
- Không gửi nội dung workspace ra dịch vụ ngoài khi chưa thống nhất nhà cung cấp và phạm vi dữ liệu.

## 6. Checklist khi tích hợp (tiêu chí tương lai, chưa pass)

- [ ] Câu hỏi thật trả về câu trả lời thật, nhãn _Interface preview_ và khối ví dụ biến mất.
- [ ] Mất mạng/timeout: hiện thông báo lỗi, draft còn nguyên, gửi lại được.
- [ ] Bấm gửi hai lần nhanh: BE chỉ nhận một request.
- [ ] Nguồn dẫn mở đúng tài liệu/trang.
- [ ] Hủy request (nếu hỗ trợ) không làm mất draft.
- [ ] Không có credential nào xuất hiện trong network tab hay bundle.
- [ ] Test trong `assistant.test.tsx` vẫn xanh; thêm test cho transport thật bằng mock `fetch`.

## 7. Chạy và kiểm thử

```bash
npm run dev:api
npm run dev:web
npm test --workspace @examate/web
```

Mở `http://127.0.0.1:5173`, bấm nút tròn góc phải dưới. Đọc trước: `use-assistant.ts` → `AssistantPanel.tsx` → phần assistant trong `App.tsx` → `assistant.test.tsx`. Làm trên nhánh riêng và mở PR; không ghi đè thay đổi của nhau, không force push.
