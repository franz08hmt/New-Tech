import type { DictionaryEntry } from "./i18n-dictionary-a";

/** Messages, status lines and hints that are built in code rather than in markup. */
export const dictionaryD: readonly DictionaryEntry[] = [
  // Calendar and course gallery
  ["Mon", "T2"],
  ["Tue", "T3"],
  ["Wed", "T4"],
  ["Thu", "T5"],
  ["Fri", "T6"],
  ["Sat", "T7"],
  ["Sun", "CN"],
  ["Course overview", "Tổng quan môn học"],
  ["Gallery", "Thư viện"],
  [
    "{name} example progress: {progress}%",
    "Tiến độ minh họa của {name}: {progress}%",
  ],
  [
    "This note is only kept in this tab; it is not saved to your account.",
    "Ghi chú hiện chỉ giữ trong tab; chưa được lưu cho tài khoản.",
  ],
  [
    "Notes will only last until you close this page.",
    "Ghi chú sẽ chỉ còn đến khi bạn đóng trang này thôi.",
  ],
  [
    "Moved {note} to position {position} of {total}.",
    "Đã chuyển {note} sang vị trí {position} trên {total}.",
  ],
  ["empty note", "ghi chú trống"],
  ["Move note {position}", "Di chuyển ghi chú {position}"],
  [
    "Use the arrow keys to change its position.",
    "Dùng phím mũi tên để đổi vị trí.",
  ],
  ["Quick note {value}", "Ghi chú nhanh {value}"],
  ["Delete note {value}: {preview}", "Xóa ghi chú {value}: {preview}"],
  ["Delete empty note {value}", "Xóa ghi chú trống {value}"],

  // AI usage dashboard
  ["No data yet", "Chưa có dữ liệu"],
  [
    "Only a manager with a current membership can view this page.",
    "Chỉ manager có membership hiện tại mới xem được trang này.",
  ],
  [
    "This session no longer has permission to view this page.",
    "Phiên đăng nhập không còn quyền xem trang này.",
  ],
  [
    "The date or filter is not valid. Pick a date from 0001-01-01 to 9999-12-30 and a range of at most 90 days.",
    "Ngày hoặc bộ lọc không hợp lệ. Chọn ngày từ 0001-01-01 đến 9999-12-30 và khoảng tối đa 90 ngày.",
  ],
  [
    "Could not load telemetry. Try reloading; this only reads data.",
    "Chưa tải được telemetry. Hãy thử tải lại; thao tác này chỉ đọc dữ liệu.",
  ],
  ["Success", "Thành công"],
  ["Error", "Lỗi"],
  ["Timed out", "Hết giờ"],
  ["Cancelled", "Đã hủy"],
  ["Rejected", "Bị từ chối"],
  ["Unknown", "Chưa rõ"],
  ["No permission to view", "Không có quyền xem"],
  ["Invalid filter", "Bộ lọc không hợp lệ"],
  ["Could not load telemetry", "Chưa tải được telemetry"],
  [
    " The cohort contains operations with a provider call to model {model}; the provider calls shown only include that model.",
    " Cohort gồm operations có provider call model {model}; provider calls hiển thị chỉ gồm model đó.",
  ],
  [
    " The cohort is picked by the filters; provider calls count every unexpired call of those operations.",
    " Cohort operation được chọn theo bộ lọc; provider calls tính toàn bộ calls chưa hết hàn của các operation đó.",
  ],
  [
    "{operations} operations, {providerCalls} provider calls",
    "{operations} operations, {providerCalls} provider calls",
  ],
  ["Currency ", "Currency "],
  ["; total with full pricing version: ", "; tổng đủ pricing version: "],
  ["loading", "đang tải"],
  [
    "Each row is the total of every pricing version in the cohort.",
    "Mỗi dòng là tổng của toàn bộ pricing version trong cohort.",
  ],
  [" versions", " versions"],
  ["No prompt used", "Không dùng prompt"],
  ["Not estimated", "Chưa ước tính"],

  // Assistant and app shell
  [
    "The question was not sent. Your draft is still here, please try again.",
    "Chưa gửi được câu hỏi. Bản nháp vẫn còn nguyên, thử lại nhé.",
  ],
  ["{friendly} Request ID: {requestId}", "{friendly} Mã yêu cầu: {requestId}"],
  [
    "Note: the summary only covers the readable content; some pages may need OCR.",
    "Lưu ý: bản tóm tắt chỉ bao phủ phần nội dung đọc được; một số trang có thể cần OCR.",
  ],
  ["part {value}", "đoạn {value}"],
  ["p. {page}", "tr. {page}"],
  [
    "Could not reach the ExaMate server to read the workspace. Your draft is kept so you can retry.",
    "Chưa kết nối được máy chủ ExaMate để đọc dữ liệu workspace. Bản nháp vẫn được giữ để thử lại.",
  ],
  ["{code} · ILLUSTRATIVE COURSE", "{code} · MÔN HỌC MINH HỌA"],
  ["COURSE DIRECTORY", "DANH MỤC MÔN HỌC"],
  ["Course details", "Chi tiết môn học"],
  [
    "That address does not match a course in the example gallery.",
    "Địa chỉ này không khớp môn học nào trong thư viện minh họa.",
  ],
  [
    "Loading this course from the ExaMate workspace.",
    "Đang tải môn học này từ workspace ExaMate.",
  ],
  ["{name} · ExaMate AI", "{name} · ExaMate AI"],
  ["Hide ExaMate AI", "Ẩn ExaMate AI"],
  ["Ask ExaMate AI", "Hỏi ExaMate AI"],
  ["answer {number}", "câu trả lời {number}"],
  [
    "Pick at least one reason before sending.",
    "Chọn ít nhất một lý do trước khi gửi.",
  ],
  ["Add a note when you choose Other.", "Thêm ghi chú khi chọn Khác."],
  [
    "The content is over the feedback storage limit. The answer is kept in full; nothing is cut to send it.",
    "Nội dung vượt giới hạn lưu phản hồi. Câu trả lời vẫn được giữ đầy đủ; không cắt nội dung để gửi.",
  ],
  [
    "The browser could not create a feedback submission ID. Your content is still here; check the browser before sending again.",
    "Trình duyệt chưa tạo được mã gửi phản hồi. Nội dung vẫn còn; hãy kiểm tra trình duyệt trước khi gửi lại.",
  ],
  ["Feedback on {name}", "Phản hồi {name}"],
  ["Helpful", "Hữu ích"],
  ["Not right", "Chưa đúng"],
  ["Send feedback on {name}", "Gửi phản hồi {name}"],
  ["Send feedback", "Gửi phản hồi"],
  ["Saving…", "Đang lưu…"],
  ["Open source", "Mở nguồn"],
  [
    "Could not open the source document. Please try again.",
    "Chưa mở được tài liệu nguồn. Thử lại giúp mình nhé.",
  ],
  ["Collapse ExaMate AI", "Thu nhỏ ExaMate AI"],
  ["Expand ExaMate AI", "Mở rộng ExaMate AI"],
  ["Collapse chat panel", "Thu nhỏ khung chat"],
  ["Expand chat panel", "Mở rộng khung chat"],
  ["Close history", "Đóng lịch sử"],
  ["Saved history", "Lịch sử đã lưu"],
  ["Conversation saved", "Đã lưu cuộc trò chuyện"],
  ["Saving the answer…", "Đang lưu câu trả lời…"],
  [
    "Could not confirm the save status. Compare the history before trying to save again.",
    "Chưa xác định được trạng thái lưu. Hãy đối chiếu lịch sử trước khi thử lưu tiếp.",
  ],
  [
    "The answer has not been saved to the conversation.",
    "Câu trả lời chưa được lưu vào hội thoại.",
  ],
  ["Reconcile save status", "Đối chiếu trạng thái lưu"],
  ["Retry save (does not resend to AI)", "Thử lưu lại (không gửi lại AI)"],
  ["Delete {title}", "Xóa {title}"],
  [
    "AI Chat searches the indexed documents and shows verified sources. Course information comes from separate metadata.",
    "AI Chat tìm trong tài liệu đã lập chỉ mục và hiển thị nguồn đã kiểm chứng. Thông tin môn học lấy từ dữ liệu metadata riêng.",
  ],
  [
    "Looks up data saved in the workspace such as courses, tasks, exams, revision plans and expenses. It does not read PDF content or quick notes, and it never changes data.",
    "Tra cứu dữ liệu đã lưu trong workspace như môn học, task, kỳ thi, kế hoạch ôn tập và khoản chi. Không đọc nội dung PDF hoặc ghi chú nhanh, và không thay đổi dữ liệu.",
  ],
  [
    "AI Chat answers from general knowledge; the text appears gradually as the AI writes it. It does not read or guess private data in the app.",
    "AI Chat trả lời bằng kiến thức chung; nội dung sẽ xuất hiện dần khi AI tạo câu trả lời. Không đọc hoặc suy đoán dữ liệu riêng trong ứng dụng.",
  ],
  ["Loading the document list…", "Đang tải danh sách tài liệu…"],
  [
    "Could not confirm the document list. ",
    "Chưa thể xác nhận danh sách tài liệu. ",
  ],
  [
    "{name} · {indexed_chunk_count} indexed parts; {useful_text_page_count}/{total_page_count} pages have usable text.",
    "{name} · {indexed_chunk_count} đoạn đã lập chỉ mục; {useful_text_page_count}/{total_page_count} trang có văn bản dùng được.",
  ],
  [
    "{name} · Indexed with an older version; no coverage statistics yet. Re-index it in Documents to check.",
    "{name} · Đã lập chỉ mục theo phiên bản cũ; chưa có thống kê độ phủ. Hãy lập chỉ mục lại trong mục Tài liệu để kiểm tra.",
  ],
  [
    "Searching all documents. Pick a specific file to see its status, summarise it or look up its course.",
    "Đang tìm trong tất cả tài liệu. Chọn một file cụ thể để xem trạng thái, tóm tắt hoặc tra cứu môn học của tài liệu đó.",
  ],
  ["No document is ready to ask about.", "Chưa có tài liệu sẵn sàng để hỏi."],
  [
    "Looking for evidence in the documents…",
    "Đang tìm bằng chứng trong tài liệu…",
  ],
  ["Writing the answer…", "Đang tạo câu trả lời…"],
  ["Record", "Bản ghi"],
  ["No course linked", "Chưa gắn môn học"],
  ["Looking up workspace data…", "Đang tra cứu dữ liệu workspace…"],
  [
    "Connecting and preparing the answer…",
    "Đang kết nối và chuẩn bị câu trả lời…",
  ],
  [
    "Start a new conversation within the current scope.",
    "Hãy bắt đầu cuộc trò chuyện mới trong phạm vi hiện tại.",
  ],
  [
    "Could not find exactly this PDF in the ready list. Pick the file in Documents or check the name before sending.",
    "Không tìm thấy đúng tài liệu PDF này trong danh sách sẵn sàng. Hãy chọn file trong mục Tài liệu hoặc kiểm tra lại tên trước khi gửi.",
  ],
  ["Processing the question…", "Đang xử lý câu hỏi…"],

  // Expenses
  ["Delete expense: {description}", "Xóa khoản chi: {description}"],
  [
    "The amount must be a positive whole number, in dong.",
    "Số tiền cần là một số nguyên dương, tính bằng đồng.",
  ],
  [
    "Please write briefly what this expense is.",
    "Ghi vắn tắt khoản này là gì giúp mình nhé.",
  ],
  ["Expense recorded.", "Đã ghi khoản chi."],
  ["Select {name} course", "Chọn môn {name}"],

  // Course workspace
  ["removed", "đã được xoá"],
  ['Uploaded "{name}" for this course.', 'Đã tải "{name}" lên cho môn này.'],
  ["Exam added for this course.", "Đã thêm kỳ thi cho môn này."],
  ["Revision item added.", "Đã thêm việc cần ôn."],
  [
    "The amount must be a positive whole number.",
    "Số tiền cần là một số nguyên dương.",
  ],
  ["Expense recorded for this course.", "Đã ghi khoản chi cho môn này."],
  ["{length} upcoming", "{length} sắp tới"],
  ["Delete exam: {topic}", "Xóa kỳ thi: {topic}"],
  ["{planRemaining} items left", "{planRemaining} việc còn lại"],
  ["Mark as not done", "Đánh dấu chưa xong"],
  ["Mark as done", "Đánh dấu đã xong"],
  ["Delete revision item: {title}", "Xóa việc cần ôn: {title}"],
  ["Expense", "Khoản chi"],
  ["{length} files", "{length} tệp"],
  ["Detach document: {name}", "Gỡ tài liệu: {name}"],
  ["detached from this course", "đã được gỡ khỏi môn này"],
  ["Choose a PDF for this course", "Chọn tệp PDF cho môn này"],

  // Documents
  ["Retry indexing", "Thử lập chỉ mục lại"],
  ["Re-index", "Lập chỉ mục lại"],
  ["Index", "Lập chỉ mục"],
  ["Unknown size", "Chưa rõ dung lượng"],
  ["{value} MiB", "{value} MiB"],
  ["Selected locally · Not uploaded", "Đã chọn trên máy · Chưa tải lên"],
  ["Upload progress for {name}", "Tiến trình tải lên của {name}"],
  ["Stored · File and metadata saved", "Đã lưu · Đã lưu tệp và metadata"],
  ["Failed · File kept for retry", "Lỗi · Tệp được giữ để thử lại"],
  [
    "Deletion pending · Retry delete to finish",
    "Đang chờ xóa · Thử xóa lại để hoàn tất",
  ],
  [
    "Legacy metadata · Storage not verified",
    "Metadata cũ · Chưa xác minh nơi lưu",
  ],
  ["AI index · Waiting to be indexed", "Chỉ mục AI · Đang chờ lập chỉ mục"],
  ["AI index · Processing…", "Chỉ mục AI · Đang xử lý…"],
  [
    "AI index · Searchable content ready",
    "Chỉ mục AI · Nội dung đã sẵn sàng để tìm",
  ],
  ["AI index · Failed, retry available", "Chỉ mục AI · Lỗi, có thể thử lại"],
  [
    " · {ocr_page_count} pages read with OCR",
    " · {ocr_page_count} trang được OCR",
  ],
  [
    " · Warning: {low_text_page_count} pages have little text; “ready” does not mean all the content inside images was read",
    " · Cảnh báo: {low_text_page_count} trang có ít chữ; “sẵn sàng” không có nghĩa đã đọc hết nội dung trong ảnh",
  ],
  ["Retry {name}", "Thử lại {name}"],
  ["Upload {name}", "Tải lên {name}"],
  ["Upload", "Tải lên"],
  ["Download {name}", "Tải xuống {name}"],
  ["Indexing…", "Đang lập chỉ mục…"],
  ["Create quiz from {name}", "Tạo quiz từ {name}"],
  ["Check index status {name}", "Kiểm tra trạng thái chỉ mục {name}"],
  ["Remove", "Gỡ"],
  [
    "Operation failed. Please retry.",
    "Thao tác chưa thành công. Vui lòng thử lại.",
  ],
  [
    "{name}: Only PDF files are accepted, up to 10 MiB each.",
    "{name}: Chỉ nhận tệp PDF, tối đa 10 MiB mỗi tệp.",
  ],
  ["That PDF is already in the list.", "Tệp PDF này đã có trong danh sách."],
  ["{count} PDF selected.", "Đã chọn {count} tệp PDF."],
  [
    " {duplicates} already in the list was skipped.",
    " Đã bỏ qua {duplicates} tệp đã có trong danh sách.",
  ],
  ["{name} stored successfully.", "Đã lưu {name} thành công."],
  [
    'Moved "{name}" to {course_name}.',
    'Đã chuyển "{name}" sang {course_name}.',
  ],
  ['Removed "{name}" from its course.', 'Đã gỡ "{name}" khỏi môn học.'],
  [
    "Could not change the course of this document.",
    "Chưa đổi được môn cho tài liệu này.",
  ],
  [
    "The earlier indexing request has not been confirmed.",
    "Yêu cầu lập chỉ mục trước đó chưa được xác nhận.",
  ],
  [
    'Indexed "{name}" into {chunk_count} parts for the Assistant to retrieve.',
    'Đã lập chỉ mục "{name}" thành {chunk_count} đoạn để Assistant truy xuất.',
  ],
  [
    "The indexing request returned an error: {value} The status is reconciled separately.",
    "Yêu cầu lập chỉ mục trả lỗi: {value} Trạng thái được đối chiếu riêng.",
  ],
  ["{name} deleted.", "Đã xóa {name}."],
  [
    "{value} Refresh the list and retry delete to finish any pending deletion.",
    "{value} Hãy làm mới danh sách rồi thử xóa lại để hoàn tất thao tác đang chờ.",
  ],
  ["{visibleTotal} results", "{visibleTotal} kết quả"],
  ["Retry list", "Thử tải lại danh sách"],
  ["Refresh list", "Làm mới danh sách"],
  [
    "There are no documents on this page. Go back to the previous page to continue.",
    "Không có tài liệu nào trên trang này. Quay lại trang trước để tiếp tục.",
  ],
  [
    "No matching documents found. Change or reset the filters.",
    "Không tìm thấy tài liệu phù hợp. Hãy đổi hoặc đặt lại bộ lọc.",
  ],
  [
    "No documents yet. Upload a PDF to get started.",
    "Chưa có tài liệu nào. Tải một tệp PDF lên để bắt đầu.",
  ],
];
