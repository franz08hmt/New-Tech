# Mục lục tài liệu ExaMate

## Tiếp tục phát triển

1. [Context hiện tại](PROJECT-CONTEXT.md): nhánh, trạng thái code, phần còn thiếu.
2. [README chạy project](../README.md): cài đặt, local/Docker, commands/API.
3. [Checkpoint tích hợp Tài + Thắng](ASSISTANT-INTEGRATION-2026-10-18.md).
4. [Roadmap pilot/New Technologies](../tasks/PROJECT-ROADMAP-2026-10-13.md):
   chỉ chọn lát tiếp theo sau khi kiểm các giới hạn/điều kiện nghiệm thu.

Nhánh làm việc: **`feature/tai-assistant-integration-20261018`**. Báo cáo dưới đây
ghi kết quả tại thời điểm phát triển, không phải bằng chứng vừa chạy trên máy mới.

## Học code, vấn đáp và trình bày

- [React/frontend](HOMEWORK-3A-REACT-STUDY-GUIDE.md).
- [Đọc backend theo request](BACKEND-STUDY-GUIDE-VI.md).
- [Vấn đáp LLM, embedding, RAG](AI-LLM-RAG-VAN-DAP-VI.md).
- [Kiến trúc nền](architecture.md), [thiết kế UI nền](dashboard-ui.md).
- [User stories](USER-STORIES-FINAL-PROJECT-VI.md), [script demo](DEMO-SCRIPT-VI.md).
- [Kế hoạch/yêu cầu môn học ban đầu](project-plan.md), [milestone tuần đầu](week-01.md),
  [bằng chứng Homework 4A](HOMEWORK-4A-EVIDENCE.md), [4B](HOMEWORK-4B-EVIDENCE.md).
- [Nhật ký AI assistance](ai-usage-log.md): giữ provenance, không biến ghi nhận
  agent thành xác nhận human review.

Các tài liệu môn học ban đầu giữ nguyên mốc lịch sử; không dùng trạng thái
“chưa có RAG/Auth” hoặc kế hoạch VM cũ làm quyết định triển khai hiện tại.

## Chạy, cấu hình và kiểm thử

- [Đăng nhập demo trên máy teammate](PILOT-DEMO-HANDOFF.md).
- [Runbook B1/backup/migration/rollback](PILOT-B1-RUNBOOK.md): không phải quyền
  chạy lại cloud; giữ đúng phê duyệt, target và maintenance window.
- [Cấu hình Supabase nền](SUPABASE-SETUP.md), [Gemini/RAG](ASSISTANT-SETUP.md).
- [STT local](STT-SETUP-VI.md), [giới hạn nghiệm thu STT](STT-VERIFICATION-VI.md).
- [Evaluation](evaluation-plan.md), [feedback → candidate → testcase](feedback-review.md).
- [Verification Homework 4 lịch sử](VERIFICATION.md), [thư mục evidence](evidence/README.md).

## Thiết kế và bằng chứng cần giữ khi sửa module

- Quyền/role/session: [pilot design](pilot-stage-0-design.md),
  [khảo sát](pilot-stage-0-report.md), [1a](pilot-stage-1a-report.md),
  [1b](pilot-stage-1b-report.md), [B2 thiết kế còn lại](PHASE-10-B2-6B-DESIGN.md).
- Nền runtime: [Đợt 1 session](PHASE-1-SESSION-ACCESS-REPORT.md),
  [2 dependencies](PHASE-2-DEPENDENCY-REPORT.md), [3 Docker/DB](PHASE-3-RUNTIME-DB-REPORT.md),
  [4 B1a](PHASE-4-B1A-REPORT.md), [B1a fix](PHASE-4-B1A-FIX-REPORT.md).
- Scope nghiệp vụ: [5 Tasks/Courses](PHASE-5-B2-SCOPE-REPORT.md),
  [6 academic/rollback](PHASE-6-REPORT.md), [7 Documents/RAG](PHASE-7-DOCUMENTS-RAG-SCOPE-REPORT.md).
- Hội thoại/feedback: [8 receipt](PHASE-8-RECEIPT-REPORT.md),
  [9 N1](PHASE-9-N1-CONVERSATION-REPORT.md), [9.1 draft](PHASE-9-1-DRAFT-HARDENING-REPORT.md).
- Non-owner/transaction: [10 primitive](PHASE-10-B2-CONTEXT-REPORT.md),
  [11 academic](PHASE-11-B2-ACADEMIC-CONTEXT-REPORT.md),
  [12 Documents/Storage](PHASE-12-B2-DOCUMENTS-CONTEXT-REPORT.md),
  [13 Auth hai máy](PHASE-13-B1-TWO-MACHINE-AUTH-REPORT.md),
  [14 ingestion](PHASE-14-B2-INGESTION-CONTEXT-REPORT.md),
  [15 retrieval/reconciliation](PHASE-15-RETRIEVAL-CONTEXT-REPORT.md),
  [16 receipt/feedback/shared-corpus](PHASE-16-RECEIPT-FEEDBACK-CONTEXT-REPORT.md).
- Provenance evaluation/feedback: [evaluation Đợt 4](phase-4-evaluation-report.md),
  [feedback Đợt 5](phase-5-feedback-report.md), [review fixes](phase-5-review-fixes.md),
  [plan đóng băng trước Đợt 4](evaluation-history/plan-before-phase4.md).
- [Review nền 13/10](PROJECT-REVIEW-2026-10-13.md) giữ căn cứ cho các mục roadmap;
  kết quả cũ không thay kiểm chứng mới.

## Dọn tài liệu 18/10/2026

Đã bỏ 8 file trùng/hết hiệu lực: handoff non-AI, handoff chatbox, prompt layout,
proposal responsive cũ, audit baseline cũ, guide/backlog cũ, `tasks/plan.md` và
`tasks/todo.md`. Context được rút gọn, roadmap là kế hoạch tiếp tục duy nhất.
Không xóa hướng dẫn học, credits/license, evidence môn học, frozen evaluation
history hay báo cáo giữ invariant/test/rollback quan trọng. Bản trước khi dọn
có tại Git revision **`01288ce`**; khôi phục từng file từ revision đó nếu cần.

Kiểm sau dọn: 57 file Markdown, 252 link nội bộ không có target bị thiếu;
typecheck và format pass, web 370/370 pass. Chỉ sửa docs và một đường dẫn trong
comment Tasks (JavaScript biên dịch không đổi). Không chạy lại API/DB/model/cloud
trong lượt dọn docs này; không nhận số test của checkpoint tích hợp là lần chạy mới.
