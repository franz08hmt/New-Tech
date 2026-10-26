# ExaMate — defense presentation

## Vietnamese technology edition - 26 October 2026

**Compact interactive revision:** the same 15 topics are now grouped into **10 slides**, using logo-led diagrams,
guided pipelines, role/RAG scenario switches, a flip card, typewriter and waveform
illustrations. Main-slide copy is concise (at most 115 visible words in the
automated budget, excluding captions/notes). Full selection rationale, trade-offs
and original speaking notes are preserved in the separate
[technology knowledge companion](submission/ExaMate-Technologies-Knowledge-VI-20261026.html),
from `docs/presentation/technology-knowledge.json` at source `69eab36`.

[Offline HTML](submission/ExaMate-Technologies-VI-20261026.html),
[PDF](submission/ExaMate-Technologies-VI-20261026.pdf),
[PowerPoint](submission/ExaMate-Technologies-VI-20261026.pptx) and
[contact sheet](submission/ExaMate-Technologies-VI-20261026-preview.jpg).

A separate **10-slide Vietnamese** explanation of technology choices, following
the existing black/white/yellow design, embedded Poppins and Heroicons. Eight selected
retained demo screenshots keep their original provenance and synthetic/live
boundaries. No new application or model result is claimed. The original English
visual edition and 24 October editable PPTX are unchanged.

Slides: 1 cover; 2 architecture + NestJS/backend/contracts;
3 React/TypeScript/Vite/Tailwind; 4 Auth/session + PostgreSQL/pgvector/RLS;
5 PDF ingestion + RAG; 6 structured output + Study Coach practice;
7 SSE/cancel/history + Whisper/ONNX/FFmpeg STT;
8 admission/telemetry; 9 Docker/nginx/TLS; 10 testing/evaluation and ownership.
The companion retains all fifteen original topic sections and their full detail.
Slide illustrations explain the flow; detailed reasons, limitations and source
anchors stay in the companion and Vietnamese speaker notes. RAG credit is shared
by Tài and Thắng. Fourteen pinned Simple Icons SVGs have local provenance and
CC0 license material under `docs/presentation/assets/logos/`; trademarks remain
with their owners and no endorsement is claimed.

HTML: open directly, use arrows, **Tổng quan**, **Lời nói** and **Dừng hoạt ảnh**.
Architecture and RAG show the current step in a large, dark explanation panel,
separate from the controls. In RAG it occupies the space beside the demo image;
on mobile it stacks below. Clicking a node, Next, Reset or Play updates both the
step label and explanation. The former fixed RAG caveats remain in speaker notes
and the companion rather than competing with the active step.
Use **Chạy luồng / Bước tiếp**, RAG evidence switches, role buttons, flip card and
stream Stop to illustrate the implementation. These never call the application,
AI, microphone or provider; they are explicitly labelled simulations. Reduced
motion and hidden-slide/page cleanup are supported. Overview reveals slides on
scroll. For a short defense,
choose the relevant pages rather than reading every technical page. Suggested
route: **1 → 2 → 5 → 6 → 7 → 8 → 10**, then web demo as time permits.
The PowerPoint is deliberately **layout-preserving slide artwork** with editable
speaker notes, not editable slide text. PPTX has fade slide transitions; the rich
within-slide interactions are HTML-only. PDF and PPTX use readable static states.
Edit `technology.html`, `technology-visual.css` and `technology-motion.js` under
`docs/presentation/`, then rebuild; the original editable PPTX is a different edition.

```powershell
node scripts/build-visual-presentation.mjs --technology
node --test scripts/technology-explanation.test.mjs scripts/technology-compact.test.mjs scripts/technology-motion.test.mjs scripts/technology-presentation.test.mjs scripts/visual-presentation.test.mjs
node scripts/verify-visual-presentation.mjs --technology
python scripts/build-technology-pptx.py
python -m unittest discover -s scripts -p test_technology_presentation.py
```

The technology flag writes only the new edition's HTML/PDF/manifest and uses
existing screenshot bindings. The browser verifier uses an isolated Chrome and
loopback static server, five widths and an offline-file check; no app, provider,
Auth or database is accessed. Raw evidence: ignored
`artifacts/technology-deck-20261026/`. Screenshot and educational-quality limits
remain explicit; evaluation follow-up and semantic acceptance are not completed
by authoring these slides.

Large-explanation revision: 2 new regressions were RED on the preceding layout,
then all 23 Node deck tests and 4 Python artifact tests passed. Chrome checked
10 slides at five widths, 35 native interactions at 1440/375px, 3 companion checks
and note bounds; zero console errors or external requests. Evidence is retained
in `artifacts/technology-explanation-20261026/` and
`artifacts/technology-deck-20261026/93e8d7a6/`. This verifies only the offline
presentation, not application or live-model acceptance.

<a id="technology-present-script"></a>

## Kịch bản thuyết trình công nghệ — 10 slide hiện hành

Đây là **phần 1: nói theo slide**, độc lập với kịch bản thao tác web ở cuối
[sổ tay ôn vấn đáp](EXAMATE-ON-TAP-VAN-DAP.html#demo-script).
Danh sách code chuẩn bị nằm riêng trong [tài liệu bảo vệ](DEMO-AND-DEFENSE.md#code-prep-tai).
Mốc dưới đây là nhịp tập khoảng **5 phút 45 giây**, không phải kết quả đo.
Không cộng nguyên kịch bản này với demo 8 phút nếu buổi bảo vệ chỉ dành 8 phút
cho toàn phần trình bày. Khi đó, dùng slide 1 → 2 → 5 → 6 trong khoảng 90 giây,
rồi dành phần còn lại cho các luồng web chính; slide khác để trả lời câu hỏi.

Số trang dưới đây là **1–10 trên thanh điều hướng**, không phải nhãn chủ đề
00–09 in trong slide. Bấm **Bước tiếp** để lời nói khớp vùng giải thích lớn;
không cần vừa đọc vừa chờ chế độ tự chạy. Tương tác trên slide là minh họa
offline, không phải request thật của ứng dụng. Tài có thể dẫn toàn bài; ở chỗ
ghi Thắng, chuyển lời để người phụ trách giải thích phần mình làm.

### Slide 1 · ExaMate — 0:00–0:15 · Tài

**Màn hình / thao tác:** mở trang bìa, chưa chuyển sang web.

**Lời nói:** “Nhóm em xây dựng ExaMate để quản lý việc học và sử dụng tài liệu
cho hai luồng AI chính: hỏi đáp có nguồn và tạo bài luyện tập có cấu trúc.
Phần này giới thiệu công nghệ đứng sau các thao tác đó.”

**Chuyển:** “Đầu tiên là đường đi của một yêu cầu.”

### Slide 2 · Kiến trúc + backend — 0:15–0:45 · Thắng, Tài bổ sung

**Màn hình / thao tác:** lần lượt bấm bốn ô **Giao diện → API → Dữ liệu → AI**.
Chỉ vào phần giải thích đen lớn đang đổi theo từng ô.

**Lời nói:** “React phụ trách giao diện; NestJS nhận request, kiểm dữ liệu đầu
vào và quyền truy cập. PostgreSQL lưu dữ liệu quan hệ và vector; Storage giữ PDF.
Supabase Auth xác minh đăng nhập, còn Gemini phục vụ embedding và generation.
Nhóm tách controller, service và lớp truy cập dữ liệu để dễ kiểm thử và bảo trì.
Không giữ transaction database trong lúc chờ provider.”

**Tài bổ sung nếu cần:** “Frontend không cầm khóa server hoặc tự quyết định quyền.”

### Slide 3 · Frontend — 0:45–1:20 · Tài

**Màn hình / thao tác:** chỉ vào ảnh giao diện và các logo React, TypeScript,
Vite, Tailwind; không mở IDE ở giữa bài nói.

**Lời nói:** “Phần frontend em dùng React để tách các màn hình thành component,
hook quản lý state và request; TypeScript giúp thống nhất kiểu với backend.
Vite phục vụ phát triển và build. Tailwind kết hợp CSS riêng để giữ hệ thống
giao diện responsive. Tìm kiếm và phân trang đọc từ server, không tải toàn bộ
rồi cắt ở trình duyệt. Khi đổi từ khóa hoặc tài khoản, request cũ được hủy và
kết quả đến muộn bị bỏ qua. Các trạng thái loading, lỗi và thử lại được hiển thị rõ.”

**Chuyển:** “Giao diện hỗ trợ thao tác, nhưng quyền phải được kiểm ở server.”

### Slide 4 · Danh tính + database — 1:20–2:00 · Tài

**Màn hình / thao tác:** chọn Viewer rồi Manager trong minh họa vai trò;
nói rõ đây là sơ đồ, demo quyền thật thực hiện riêng trên web.

**Lời nói:** “Authentication xác định người dùng; authorization xác định người đó
được làm gì trong workspace. Browser dùng cookie phiên opaque HttpOnly, không
lưu JWT trong localStorage. Server lấy principal đã xác minh, kiểm membership
và dùng transaction có scope. PostgreSQL có RLS, còn business và Auth dùng
LOGIN riêng không bypass RLS. Viewer chỉ đọc dữ liệu nghiệp vụ dùng chung;
manager cũng không mặc nhiên đọc hội thoại hay bộ luyện tập riêng của người khác.
pgvector giúp tìm các đoạn gần câu hỏi trong đúng phạm vi tài liệu.”

### Slide 5 · PDF → RAG — 2:00–2:55 · Tài + Thắng

**Màn hình / thao tác:** chỉ dải ingestion; chọn **Có bằng chứng**, bấm lần lượt
bốn bước; sau đó chọn **Không đủ bằng chứng**. Chỉ vào ảnh citation, không gọi
ảnh lưu sẵn là kết quả vừa chạy.

**Lời nói:** “PDF được trích theo trang, chia đoạn và tạo embedding. Khi hỏi,
hệ thống tạo embedding câu hỏi, truy xuất evidence trong đúng workspace và
scope rồi mới yêu cầu Gemini trả lời. Không có đoạn đạt điều kiện thì từ chối,
không gọi answer generation để lấy kiến thức ngoài bù vào. Nguồn được server
ánh xạ về tài liệu và trang; người dùng mở PDF để kiểm chứng. Nội dung PDF là
dữ liệu không tin cậy, không được coi là chỉ dẫn hệ thống. RAG không phải fine-tuning,
và citation hợp lệ chưa tự chứng minh mọi nhận định đều đúng.”

**Phân công:** Thắng trình bày phần RAG mình thực sự đóng góp; Tài nối phần scope,
hiển thị nguồn và tích hợp. Không gán toàn bộ RAG riêng cho một người.

### Slide 6 · Structured output + luyện tập — 2:55–3:45 · Tài

**Màn hình / thao tác:** chỉ luồng preview → xác nhận → luyện tập; lật thẻ minh họa
một lần. Không gọi thao tác này là đang lưu hoặc chấm trên server thật.

**Lời nói:** “Study Coach dùng structured output của Gemini cho quiz và flashcards.
Backend vẫn kiểm schema, số câu hoặc thẻ, nội dung trùng và nguồn có thuộc evidence
hay không. Preview chưa tự lưu; người dùng phải xác nhận riêng. Quiz được server
chấm từ snapshot đã lưu, không tin điểm client; flashcards là tự đánh giá nhớ
hoặc cần ôn lại. Luyện tập không gọi AI thêm. Nếu mất phản hồi sau khi ghi,
UI giữ identity và payload để khôi phục, tránh tạo hai lượt cho cùng một lần nộp.
Đúng cấu trúc vẫn chưa đồng nghĩa đúng hoàn toàn về kiến thức.”

### Slide 7 · SSE + STT + history — 3:45–4:25 · Thắng, Tài bổ sung history

**Màn hình / thao tác:** bấm chạy chữ rồi **Dừng**; chỉ waveform minh họa.

**Thắng nói:** “Chế độ kiến thức chung dùng SSE để hiện phản hồi dần và có thể dừng.
Client dùng fetch với POST body và đọc stream; parser xử lý cả event bị chia qua
nhiều network chunk. RAG giữ nội dung trả lời tới khi kiểm citation xong.
STT dùng Whisper ONNX trên máy chạy API: ghi âm, nhận bản chép, sửa rồi tự gửi.
Đây không phải TTS và cũng không làm toàn bộ ứng dụng chạy offline.”

**Tài nối:** “Hội thoại hoàn tất đủ điều kiện được lưu riêng theo user/workspace;
mở lại chỉ đọc, không tự gọi AI. Receipt xác minh snapshot, không chấm độ đúng của đáp án.”

### Slide 8 · Admission + telemetry — 4:25–4:55 · Tài

**Màn hình / thao tác:** chỉ thứ tự admission trước provider và ảnh dashboard usage.

**Lời nói:** “Admission giữ chỗ quota và concurrency trước khi gọi provider;
telemetry ghi lại operation và từng provider call. Một câu hỏi có thể gồm cả
embedding lẫn generation nên không thể chỉ đếm số HTTP request. Dashboard cho
manager xem số liệu đã ghi nhận, token, độ trễ và chi phí ước tính đã biết.
Thiếu usage khác số không. Telemetry là best-effort, không phải hóa đơn và cũng
không phải nguồn quyết định quota.”

### Slide 9 · Docker + nginx + TLS — 4:55–5:15 · Tài

**Màn hình / thao tác:** chỉ ranh giới container và dịch vụ ngoài.

**Lời nói:** “Docker đóng gói frontend và API; nginx chuyển request API và giữ
stream không bị buffer. DB và Storage mới là nơi dữ liệu lưu bền. Supabase và
Gemini vẫn cần mạng; Whisper chạy local trên API host. Kết nối database giữ
xác minh TLS và CA, không tắt bảo mật để demo.”

### Slide 10 · Bằng chứng + phân công — 5:15–5:45 · Cả hai

**Màn hình / thao tác:** chỉ mẫu số 20 case và hàng kết quả lượt sau; không suy ra
kết quả lượt cải tiến từ một mẫu thành công. Chốt phân công đang hiển thị.

**Lời nói:** “Nhóm tách test logic, integration với Nest/PostgreSQL và thao tác
browser khỏi đánh giá ngữ nghĩa của model. Bằng chứng baseline lịch sử trên slide
là 15 PASS, 3 FAIL và 2 chưa kết luận trên 20 case; lượt sau mới có 1 PASS,
2 lỗi provider và 17 case chưa chạy. Vì vậy nhóm chưa nhận hoàn tất so sánh
trước/sau. Em phụ trách frontend và tích hợp, Study Coach và kiểm soát AI;
Thắng đóng góp backend nền, SSE/STT; cả hai có đóng góp RAG. Sau đây nhóm chuyển
sang thao tác sản phẩm.”

### Câu nối khi bị hỏi giữa bài

- **“Vì sao chọn công nghệ này?”** Trả lời bằng nhu cầu của tính năng, một lợi ích
  và một đánh đổi; chi tiết nằm trong sổ tay công nghệ, không đọc cả bảng trên slide.
- **“Em làm phần nào?”** Nêu phần trực tiếp thực hiện/tích hợp và mở symbol tương ứng;
  phân biệt phần Thắng làm và phần cùng làm, không dựa chỉ vào người đứng tên commit.
- **Provider chậm khi chuyển demo:** “Request đang chờ dịch vụ ngoài. Nhóm không
  tự gửi lặp; em chuyển sang dữ liệu đã lưu và chức năng không-AI trước.”
- **Chưa có bằng chứng:** “Phần đó chưa đủ bằng chứng để khẳng định; kết quả hiện có
  chỉ chứng minh phạm vi đang trình bày.”

## Recommended visual edition - 25 October 2026

[Offline HTML](submission/ExaMate-Presentation-Visual-20261025.html) and
[15-page PDF](submission/ExaMate-Presentation-Visual-20261025.pdf) follow the selected
black/white/yellow reference: grayscale local photographs, yellow frames, diagonal
contents, numbered steps, alternating panels, a circular guardrail motif and
outcome bars. Poppins and genuine Heroicons are embedded with their licenses;
there are no CDN, API, credential, analytics or storage dependencies.

The ownership slide and its notes also credit Thắng's RAG contributions, as
clarified by Tài on 25 October; RAG is not attributed exclusively to one person.

This edition has **15 slides**, English content and Vietnamese notes. Eleven
retained screenshots cover Dashboard, Courses, Expenses, Documents/mobile,
Assistant/citations/history, Study Coach/quiz, STT readiness and AI Usage. Captions
distinguish real-service captures from synthetic-provider integration fixtures.
The flashcard page is explicitly an implementation illustration. The editable
24 October PPTX below remains available; it uses the older design.

Open HTML directly in Chrome/Edge. Arrow keys/Page Up/Page Down navigate; Home/End
jump to the ends. Overview shows every page; Notes shows Vietnamese speaker notes.
Fullscreen requires a user click. Narrow screens use a readable vertical layout;
the PDF always retains 16:9. With JavaScript disabled all slides remain readable.

Recommended eight-minute route: **1 -> 3 -> 5 -> 15 -> web demo -> 13 -> 14**.
Do not narrate all fifteen pages. Do not claim a complete improved evaluation:
baseline remains 15 PASS/3 FAIL/2 INCONCLUSIVE, follow-up 1 PASS/2 provider
errors/17 NOT ATTEMPTED. Evidence on slide 12 is explicitly dated; no application
measurement is inferred from a slide export.

Editable source: `docs/presentation/deck.html`, `deck.css`, `deck.js` and
`assets/provenance.json`. Rebuild with existing installed dependencies:

```powershell
node scripts/build-visual-presentation.mjs
node --test scripts/visual-presentation.test.mjs
node scripts/verify-visual-presentation.mjs
python scripts/test_visual_presentation_pdf.py
python -m unittest discover -s scripts -p test_submission_docs.py
```

The verification command uses installed Windows Chrome in a new isolated
profile and a loopback static server, exports PDF, checks all slides at five widths
and saves evidence under ignored `artifacts/presentation-visual-20261025/`.
It does not log into or exercise the application. Profile artifacts are retained;
browser/server processes created by the command are closed.

## Retained 24 October PPTX outline

English slide content; Vietnamese speaker notes. Visual revision: 24 October 2026.
Technical measurements are retained from 23 October; no new application/model run.
DRAFT: improved evaluation and personal confirmations remain incomplete.
14 slides including 2 Q&A backups; rubric limit 15. Slides 13–14 are hidden by
default in the PowerPoint slide show and remain visible in the PDF.

Editable PPTX and PDF: `docs/submission/ExaMate-Presentation-20261024.{pptx,pdf}`.
Build: `python scripts/build-defense-slides.py output/presentation`.
The dedicated command creates the designed deck; the older generic exporter only
provides a basic outline. Notes are embedded in PowerPoint. Evidence bindings:
`submission/report-evidence.json` and `report-assets/figure-provenance.json`.

Eight-minute route: slides 1–3 briefly → slide 5 → real web demo → slides 10 and 12.
Other slides support explanations; 13–14 are optional Q&A backups. Do not read every
slide during the eight minutes. No backup video is claimed or embedded.

## ExaMate

- AI academic workspace
- Study from your sources. Verify what AI says.
- Tài + Thắng
- New Technologies in Software Engineering · 2026–2027
- A · Grounded document Q&A
- C · Structured study practice

> TÀI · 15 giây. “ExaMate giúp sinh viên quản lý việc học, hỏi đáp trên tài liệu có dẫn nguồn và luyện tập từ nội dung có cấu trúc. Hai capability nhóm trình bày là A và C.” Không nhận B có ba LLM-called tools. Không tự nói đã đạt rubric.
> Tuyến 8 phút: 1–3 → 5 → demo web → 10 → 12. Các trang khác để minh họa hoặc vấn đáp. DRAFT vì so sánh evaluation chưa đủ và còn xác nhận cá nhân.

## From scattered files to a study loop

- Organize | Tasks, courses, exams, plans, expenses and documents.
- Verify | Ask within an authorized source; inspect the cited PDF page.
- Practise | Preview, explicitly save, then review personal progress.
- One workspace. A traceable learning loop.
  ![Real-service dashboard](report-assets/dashboard.jpg)

> TÀI · 10–15 giây. Tài liệu rải rác, câu trả lời khó kiểm nguồn, đầu ra AI chưa có chỗ luyện tập: nhóm nối thành một luồng. Ảnh là bản dùng Supabase thật đã chụp trước đó, không phải output Gemini mới. Courses hiện đọc, Tasks chưa có xóa; không nói mọi module đầy đủ CRUD.

## Architecture with explicit trust boundaries

- Browser | React + TypeScript · Vite · responsive UI
- API | NestJS · verified session · membership · validation
- Database | PostgreSQL + pgvector · scoped queries + RLS
- Identity + files | Supabase Auth / Google · private Storage
- AI services | Gemini embedding + generation · local Whisper STT
- Business and Auth use separate non-owner runtime LOGINs.

> THẮNG · 25–30 giây. React gọi Nest qua proxy; backend giữ key, xác minh quyền trước SQL/file/AI. Supabase không thay toàn bộ business logic. Gemini phục vụ embedding/generation; Whisper chạy trên API host local, không phải browser. Không giữ DB transaction lúc chờ provider. Tài bổ sung Auth/RLS hiện tại nếu hỏi sâu.
> Thắng có phần nền backend/Supabase và Gemini ban đầu; Tài phát triển/tích hợp tiếp Auth/RLS, RAG và managed deployment. Không gán toàn bộ backend hiện tại cho một commit cũ.

## Capability A: answer from authorized evidence

- 01 · Ingest | Ready PDF → page-bounded chunks → 768-dimensional vectors.
- 02 · Retrieve | Scope first; keep up to six qualifying evidence chunks.
- 03 · Validate | Answer shape, source IDs and inline markers must agree.
- 04 · Inspect | Open the cited PDF page with fresh scoped access.
- No qualifying evidence → refusal, without answer generation.
- Query embedding may already have run. Valid citations do not prove every claim.
  ![Historical citation preview](report-assets/rag-citation-page3.jpg)

> TÀI · Trang hỗ trợ giải thích. Chunk target 1200, max 1800, overlap 200 ký tự, page-bounded. Embedding không tạo answer. Tài liệu Ready không bảo đảm mọi trang trích xuất tốt. Citation hợp lệ về ID/page không chứng minh claim được nguồn hỗ trợ.
> Ảnh integration lịch sử: Nest/PDF.js/retrieval/PG17 thật; Auth upstream, Storage và provider tổng hợp. Minh họa PDF trang 3, không chứng minh chất lượng Gemini. Xem figure-provenance.json.

## Live demo: verify one answer

- 1 · Persist | Update a task, reload and confirm the stored change.
- 2 · Ask | Select the ready operating-systems PDF and ask the question below.
- 3 · Verify | Open page 3; then ask an out-of-document question.
- 4 · Practise | Quiz preview → confirm → submit → progress; flip a saved card.
- What happens when the Round Robin time quantum is very small?
- http://127.0.0.1:8080

> TÀI → THẮNG → TÀI · Chuyển sang web. Tài task/RAG, Thắng SSE/STT, Tài Study Coach. Kịch bản chi tiết trong DEMO-AND-DEFENSE.md. Chọn os-processes-demo.pdf Ready; đối chiếu trang 3. Câu ngoài tài liệu: “Ai đã vẽ bức Mona Lisa?”. Không đọc đáp án soạn trước nếu output thực tế khác.
> Generation chỉ khi ngân sách/provider cho phép, không bấm lại khi lỗi. Nếu mở quiz đã lưu, nói rõ là bản lưu. Không mở .env, cookie hoặc credential. Trong 8 phút không cần chiếu hết 14 trang; slide này giữ làm điểm chuyển sang browser.

## Capability C: preview becomes usable practice

- Preview | Ready document · count/language · evidence-bound JSON.
- Confirm | Explicit save of a server-issued draft; private immutable snapshot.
- Quiz | Server grades stored answers; attempts and progress persist.
- Flashcards | Flip → self-rate → explicitly save a completed review.
- Practice and progress do not call AI.
- Flashcard ratings are self-assessment, not an AI grade or proof of mastery.
  ![Historical graded quiz result](report-assets/quiz-result.png)

> TÀI · Preview chưa là bộ được xác nhận; draft server đã validate có token, hết hạn 15 phút. Nguồn phải thuộc evidence. Khi nộp quiz, server chấm từ snapshot, không tin score client. Flashcards remembered/needs_review là tự đánh giá. Confirm/attempt/review có idempotency và recovery; không gọi lại AI để cứu lỗi lưu.
> Ảnh 3/3 là integration dùng provider tổng hợp, server/DB thật; không phải benchmark chất lượng Gemini ra đề. Demo nội dung thực tế, không đọc điểm cố định.

## Streaming and local voice, under user control

- SSE | General chat streams text; Stop aborts and ignores late output.
- Document policy | Stream status; publish the answer after source checks.
- Local STT | Record → inspect → Whisper → edit → insert → send yourself.
- Runtime limits | 60 s audio · 120 s inference · 150 s request · 180 s outer wait.
- Speech input does not make the whole application offline.
- Physical microphone and Vietnamese accuracy still need acceptance.

> THẮNG · Cho thấy general phát dần, Stop; STT ghi ngắn, sửa/chèn, không tự gửi. Luồng MediaRecorder → API → ffprobe/FFmpeg → mono 16 kHz → Whisper small ONNX CPU/q8. Window 30 giây, stride 5 giây để bao phủ audio dài trong giới hạn. Audio tới API host local, không gửi Gemini trong STT; nếu sau đó gửi transcript hỏi AI thì text đi theo chat contract.
> SSE dùng fetch POST/ReadableStream, parser chịu frame và UTF-8 bị chia, nginx không buffering, có backpressure/cancel. Stop không bảo đảm upstream chưa tính phí. Deadline bản cuối là chỉnh sửa tích hợp sau code STT gốc. Chỉ demo micro sau khi tự thử ổn; English fixture/readiness không chứng minh accuracy tiếng Việt thực tế.

## Guardrails protect access and uncertain outcomes

- Scope | Server principal + current membership + RLS; never trust a client role.
- Evidence | Treat document text as untrusted; refuse unsupported answers.
- Validation | Reject malformed structure or invented sources; no silent repair loop.
- Recovery | Keep submission identity after uncertain writes; reconcile safely.
- AI failure is visible; independent non-AI screens remain usable.
- Injection resistance is inconclusive without the exact model context.

> TÀI / THẮNG · Không chỉ ẩn nút viewer; backend kiểm quyền, manager không đọc quiz/hội thoại cá nhân người khác. COMMIT có thể xong nhưng mất response: giữ key/payload, confirm unknown GET trước write tiếp, attempt/review retry cùng key. Không tự tạo lượt mới hoặc gọi AI lại.
> Injection là dữ liệu không tin cậy; prompt/citation giảm rủi ro, không bảo đảm miễn nhiễm. Hai case thiếu trace giữ INCONCLUSIVE. Không đổi key sai hoặc cố hết quota để dựng lỗi. Chỉ nói lỗi đang xảy ra khi quan sát thật; ảnh/log cũ phải ghi là bằng chứng trước đó.

## Verification: identify what each layer proves

- Application | 2,324 passes: API Vitest 460 + API Node 1,317 + Web 547.
- Database | PG17 canonical 521/521; managed fixture 1/1 reported separately.
- Real services | Docker + managed026 + Google login; 45 retained HTTP checks.
- Browser fixtures | Real Nest/PG17; synthetic upstreams for selected workflows.
- These are 23 October records, not fresh execution for this export.
- Unit or fixture passes do not establish semantic model quality.

> TÀI · 2324/521 là publication trước, không phải chạy lại khi tạo slide. Phân biệt browser synthetic với cloud real. Backend/PG thật không biến synthetic model thành Gemini. Google/Docker/HTTP thật có evidence riêng; chưa nghiệm thu toàn bộ browser matrix. Nguồn report-evidence.json.

## Live evaluation: baseline and incomplete follow-up

- Baseline | 20 cases: 15 strict PASS · 3 FAIL · 2 injection INCONCLUSIVE.
- Follow-up | 1 PASS · 2 provider HTTP503 errors · 17 NOT ATTEMPTED.
- Controlled change | Retrieval threshold 0.55 → 0.50; same model, corpus and prompt.
- Review | Frozen expected facts; AI-assisted technical review under delegation.
- A complete before/after quality claim is not yet supported.
- Semantic content 18/20 is separate, not a replacement for strict results.

> TÀI · 25 giây cuối demo. Giữ mẫu số 20 và phân biệt provider error với semantic FAIL. Chưa đủ mẫu sau để kết luận cải thiện. Không sửa gold sau output. Baseline 15 strict PASS/3 FAIL/2 INCONCLUSIVE; semantic-content 18/20 là thước đo khác.
> Corpus synthetic ASCII minh họa, không phải rubric hay quy định thật. Injection thiếu exact context vẫn INCONCLUSIVE. Reviewer AI theo ủy quyền, không giả human review/chữ ký Tài–Thắng. Chart lấy số từ report-evidence.json, không thay đổi gold.

## Cost and latency: known values, stated limits

- Mean operation | 4.58 s across 20 baseline operations.
- Sample p95 | 5.06 s across the same 20; not a production SLA.
- Known generation estimate | USD 0.0128272 across 20 generations with usage.
- Coverage | 20 of 40 baseline provider calls had missing usage; missing is not zero.
- Campaign upper used/reserved | USD 0.618895 across 51 calls, including a separate probe.
- Estimates are not invoices. One successful follow-up sample is not comparable.

> TÀI · Dùng nếu thầy hỏi số liệu. Operation latency khác provider latency/TTFT. Mẫu 20 không chứng minh SLA. Known cost chỉ generation có usage; không cộng embedding/error thiếu usage thành 0. Campaign upper used/reserved là dự trù bảo thủ, không phải hóa đơn hay Google hard cap. Probe model khác không ghép denominator đánh giá chất lượng.
> Nguồn report-evidence.json. Không đọc số dashboard tổng hiện tại thành baseline. Không gọi mới model chỉ để cập nhật slide.

## Two contributors, one integrated product

- Tài | Final integration, frontend/business screens, Auth/RLS, RAG, Study Coach, AI controls and evaluation.
- Thắng | Early backend/Supabase, initial Gemini integration, local STT and SSE.
- Shared integration | Assistant and deployment evolved; AI assistance is disclosed.
- Delivered | Source-verifiable Q&A and persistent personal study workflows.
- Still open | Full follow-up evaluation, broader semantic/device checks and personal confirmations.
- Thank you. We can trace a request from the UI to its source and saved result.

> CẢ HAI · 15–20 giây kết. Tài chốt RAG/Study Coach; Thắng chốt backend ban đầu/SSE/STT. Ownership theo nội dung Git, không tính phần trăm công sức bằng số commit. Thắng có b4ce829, d2ca5ca, 917edc7, b988e26, 2249abf; deadline/hardening có tích hợp sau. Chỉ nhận phần thực sự làm và hiểu, không bịa lý do commit ít.
> Không tự kết luận rubric passed hoặc full F08/F09 accepted; không TTS/third LLM tool. Xác nhận cá nhân do chính người đó nói. Sẵn sàng mở code, không mở credential.

## Backup: frontend request lifecycle

- UI | Components render views; hooks own state/effects; api.ts centralizes requests.
- Identity | Principal/context query keys prevent old private data flashing back.
- Request | Debounce → bounded GET → server page/count and scoped lookup.
- Race guard | Abort + revision/key checks reject late responses.
- Contract | Shared .d.ts catches compile-time drift, not runtime invalid data.
- Code anchors | use-paged-search.ts · use-assistant.ts · api.ts · packages/contracts/index.d.ts

> TÀI · Chỉ mở nếu hỏi FE. State ảnh hưởng render; ref giữ revision mà không tự render; effect cleanup hủy request/listener. A về sau B không đè B. Query mới page 1 từ request đầu, không tải full list rồi slice. UI gating không thay backend authorization. Dùng hash navigation, không nói React Router. Chỉ một test stale-response hoặc attempt unknown để giải thích cụ thể.

## Backup: code and decisions to defend

- RAG | document-chunker.ts → rag-retrieval.service.ts → assistant.service.ts
- Study Coach | study-quiz-validation.ts · study-coach.service.ts · study-flashcards.service.ts
- Voice + SSE | audio-inspector.ts · local-speech-runtime.ts · assistant-stream.ts
- Auth + AI controls | auth.guard.ts · ai-admission.service.ts · ai-usage.service.ts
- Trade-offs | Hosted Auth; bounded context vs coverage; CPU speech vs cloud dependence.
- One honest answer | Show a function, explain one regression and name one remaining limit.

> CẢ HAI · Backup vấn đáp. Tài mở RAG/Study Coach/Auth/controls; Thắng mở STT/SSE. Code trong apps/api/src/{documents,assistant,study-coach,speech,auth} và apps/web/src. Xem DEMO-AND-DEFENSE.md: 17 câu Tài, 19 câu Thắng, có ý trả lời.
> Chọn lỗi AI mình hiểu: evaluator PASS khi thiếu output hoặc executor tin binding mutable. Giải thích oracle RED→GREEN; không nhận test cũ là vừa chạy. Hai slide backup không phải phần cần đọc trong 8 phút.
