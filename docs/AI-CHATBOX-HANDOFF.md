# Handoff — ExaMate AI chatbox (FE → Thắng)

Ngày cập nhật: 25/09/2026 (Asia/Saigon) · Người làm FE: Tài (có hỗ trợ của Codex) · Người nhận: Thắng

Tài liệu này thay cho mô hình dock/overlay/bottom-sheet trong `docs/ideas/responsive-ai-copilot.md`. Chat đã nối với pipeline RAG: retrieval chỉ dùng PDF `ready`, generation trả JSON có schema và backend kiểm chứng citation trước khi frontend hiển thị.

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
                                          api.askAssistant({ message, pageContext })
                                                        │
                                       POST /api/assistant/chat → Gemini
```

- Màn hình ≥ 768px: cửa sổ nổi **không modal** (`<aside>`), trang phía sau vẫn dùng được, không reflow.
- Màn hình < 768px: bottom sheet **modal** (`role="dialog"`, `aria-modal`), shell/skip link/nút nổi bị `inert`, khóa cuộn `body`, `Escape` đóng và trả focus về nút đã mở (hoặc launcher).

## 2. Cái gì chạy thật, cái gì còn preview

Chạy thật trong app: mở/đóng từ mọi trang, giữ draft khi đổi trang hoặc đóng/mở lại, gợi ý câu hỏi điền vào draft, focus/Escape/inert/khóa cuộn. Khi draft có nội dung và không ở trạng thái gửi, nút _Send question_ bật; gửi kèm page context hiện tại tới API và hiển thị câu trả lời dạng text.

Khi chat đã nối, panel ẩn khối “Example grounded answer” để không nhầm dữ liệu mẫu với phản hồi thật. Panel giải thích câu trả lời chỉ dựa trên tài liệu đã lập chỉ mục và hiển thị citations thật. Lỗi mạng/API hiện trạng thái lỗi và giữ draft để thử lại.

`apps/web/src/App.test.tsx` kiểm tra POST body, page context, hiển thị câu trả lời và disclaimer bằng fixture. `apps/web/src/assistant.test.tsx` kiểm tra hành vi của hook. Đây là kiểm thử tự động với API giả, không chứng minh Gemini thật đã được gọi hoặc có quota.

Backend có `GET /api/assistant/status` và `POST /api/assistant/chat` (`apps/api/src/assistant/assistant.controller.ts`). Status báo cấu hình hiện tại; frontend chưa gọi status tự động. Response chat có `answer`, `answerable`, validated `citations`, `provider`, `model`, `ragEnabled:true` và `promptVersion`.

## 3. Luồng request hiện tại

`App.tsx` truyền transport vào `useAssistant`; transport gọi helper dùng chung trong `api.ts`, rồi chuyển `answer` sang kiểu message của UI. `pageContext` gồm `pageId` và `pageName` hiện tại.

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

Shape HTTP dùng chung được khai báo trong `packages/contracts/index.d.ts`: `AssistantChatRequest`, `AssistantChatResponse`, `AssistantPageContext` và `AssistantStatus`. DTO của API implement shape request này; không khai báo lại kiểu HTTP riêng cho FE/API.

Dữ liệu FE **đang có** ở App: `route.page.id`, `page.name`, `route.courseSlug` và `selectedCourse` (khi ở `#courses/<slug>`), danh sách documents trong workspace (có `course_id`). Context hiện chỉ gửi `pageId`, `pageName`.

Hook lo trạng thái `sending` → `idle`/`error`, chặn gửi trùng và chỉ xóa draft khi thành công. App chuyển citation HTTP thành tên tài liệu và locator trang/đoạn cho panel.

## 4. Giới hạn hiện tại và việc còn lại cho RAG

- Backend gửi câu hỏi cùng page metadata tới Gemini; không truyền nội dung tài liệu, Tasks, database hay lịch sử chat.
- Chưa có authentication; phạm vi hiện là workspace dùng chung. API hỗ trợ `courseId` tùy chọn nhưng frontend chưa tự suy ra môn học từ route.
- Citation ID/marker được kiểm tra cấu trúc và tồn tại trong retrieval set; chưa có bộ đánh giá tự động semantic entailment cho từng mệnh đề.
- Chưa có streaming, lưu lịch sử chat hoặc nút hủy request.

## 5. Ranh giới an toàn

- API key/credential của nhà cung cấp AI chỉ ở BE. Không đưa vào biến `VITE_*`, bundle hay log.
- BE phải tự kiểm tra quyền truy cập tài liệu. `courseId`/`pageId` do FE gửi chỉ là gợi ý phạm vi, không phải bằng chứng quyền.
- Câu trả lời được render dạng text (`<p>{message.text}</p>`), không dùng `dangerouslySetInnerHTML`. Nếu muốn Markdown thì phải có bước sanitize, cần thống nhất trước.
- Không gửi nội dung workspace ra dịch vụ ngoài khi chưa thống nhất nhà cung cấp và phạm vi dữ liệu.

## 6. Trạng thái kiểm tra

- [x] Có transport từ composer tới `POST /api/assistant/chat`; component test kiểm tra payload, context và câu trả lời qua fixture.
- [x] UI không trình bày sample answer như phản hồi chat và hiển thị citation thật khi backend trả về.
- [ ] Gọi Gemini thật bằng cấu hình local và xác minh quyền/quota (request có thể dùng quota/chi phí).
- [ ] Kiểm tra trực tiếp trong browser, responsive và console sau khi chạy API + web.
- [x] Thắng hoàn thành pipeline RAG và citation validation cho workspace dùng chung.
- [ ] Bổ sung authentication/authorization trước khi dùng dữ liệu nhiều người dùng.
- [ ] Human review của Tài và Thắng.

## 7. Chạy và kiểm thử

```bash
npm run dev:api
npm run dev:web
npm test --workspace @examate/web
```

Mở `http://127.0.0.1:5173`, bấm nút tròn góc phải dưới, nhập câu hỏi và gửi. Cần chạy API ở cổng 3000 và web ở cổng 5173; API phải báo `ready` tại `/api/assistant/status`. Đọc trước: `use-assistant.ts` → `api.ts` → `AssistantPanel.tsx` → phần assistant trong `App.tsx` → `App.test.tsx`. Không đưa credential vào browser/frontend.
