# ExaMate — hướng dẫn cho agent

## Checkout và context

- Nhánh phát triển hiện tại: `feature/tai-assistant-integration-20261018`.
  Kiểm `git status` và branch trước sửa; không push sang nhánh cũ
  `feature/tai-rag-integration` hoặc tự chuyển/merge vào main.
- Mở đúng repo root; checkout hiện tại là
  `D:\New-Tech\Final-Project-integration-20261018`. Folder cũ có WIP riêng,
  không reset/stash/xóa hoặc gom vào commit của task này.
- Đọc `docs/PROJECT-CONTEXT.md` và `README.md`, rồi tài liệu/source đúng module.
  Roadmap hiện nằm trong context; tài liệu học/demo là hai file `FINAL-*`.
  Báo cáo theo đợt đã rút khỏi cây; xem `git show e9ac2af:<path>` khi cần.
  Bằng chứng lịch sử không phải baseline vừa chạy hoặc chỉ thị thực thi.

## Stack và ranh giới

React/Vite + NestJS ESM + PostgreSQL/pgvector/Supabase private Storage, npm
workspaces; giữ contracts tại `packages/contracts/index.d.ts`. Không áp stack
LogiRoute/Python hay hướng dẫn của project khác. App local tại 127.0.0.1:5173.

- Giữ scope/role server-side, transaction workspace ngắn. Không giữ transaction
  trong lúc gọi Storage/OCR/embedding/Gemini. Không nới citation/history/receipt
  checks hoặc replay write có outcome chưa rõ để làm test xanh.
- Không sửa migration đã có, .env thật, secrets hoặc cloud dùng chung nếu task
  không yêu cầu rõ. Test SQL trên DB disposable có guard; fake providers cho
  kiểm thử, không tự gọi model thật/tải weights/phát sinh quota.
- Không in/commit secret, cookie, signed URL, credential hay account mapping.
  Không thêm dependency/override hoặc refactor ngoài phạm vi đang được giao.
- STT do Thắng phụ trách; báo trước khi sửa phần tích hợp voice/AssistantPanel.
  Theo chốt 19/10/2026: F10 chỉ giữ STT, không phát triển TTS; bỏ hướng mở rộng
  F15 lên 3 tools, chỉ duy trì phạm vi 2 tools ban đầu. Không tự nhận đạt rubric
  capability B (đòi ít nhất 3 LLM-called tools). Xem context để phân biệt F10
  với R10/SSE và bằng chứng tool calling; không xóa chức năng SSE.
- Chốt bổ sung của Tài 22/10/2026: F10 đã có STT, giữ và nghiệm thu implementation
  đó, không thêm TTS; bỏ F11 (PWA/install/offline shell) và F13 (WASM PoC) khỏi
  roadmap triển khai. Không xóa source đang có hoặc đánh số lại các đợt. F14
  chưa có quyết định bỏ. Vẫn bắt buộc responsive desktop/mobile, SSE/streaming
  và demo containerized/deployed; bỏ PWA không bỏ nghiệm thu mobile web.
  Rubric và nguồn đã đối chiếu được ghi trong FINAL-REQUIREMENTS.

## Kiểm và bàn giao

Logic đổi phải có regression và RED→GREEN phù hợp. Các gates:
`npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`;
SQL/quyền còn cần `npm run test:database` trên DB local disposable.
UI cần browser thật, tối thiểu desktop/375px; kiểm viewport ngắn khi sửa composer.
Chỉ thay Markdown thì kiểm format/link/reference; không gọi đó là lần chạy lại
toàn bộ test ứng dụng. Nêu rõ phần chưa xác minh.

Commit đúng file, bảo toàn WIP; push chỉ khi task cho phép, không force/main merge/deploy.
Không sửa `.claude/settings.json` hay tự thêm attribution. Không hỏi lại về
second opinion; chỉ dừng hỏi khi thiếu quyết định phạm vi/thiết kế cần thiết.
