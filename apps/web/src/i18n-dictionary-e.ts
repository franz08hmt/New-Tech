import type { DictionaryEntry } from "./i18n-dictionary-a";

/** Messages produced by forms, panels and data hooks. */
export const dictionaryE: readonly DictionaryEntry[] = [
  // Exams
  ["Edit exam: {topic}", "Sửa kỳ thi: {topic}"],
  ["Save changes", "Lưu thay đổi"],
  [
    "Please choose the course for this exam.",
    "Chọn giúp mình môn học của kỳ thi này nhé.",
  ],
  [
    "The exam name needs at least three characters.",
    "Tên kỳ thi cần ít nhất ba ký tự.",
  ],
  ["Exam added to the schedule.", "Đã thêm kỳ thi vào lịch."],
  ["Changes to the exam saved.", "Đã lưu thay đổi cho kỳ thi."],
  ["Exam removed from the schedule.", "Đã xoá kỳ thi khỏi lịch."],
  ["Add or view exams", "Thêm hoặc xem kỳ thi"],
  ["View exams", "Xem kỳ thi"],
  [
    "Exam added. The list was refreshed from the server.",
    "Đã thêm kỳ thi. Danh sách được đọc lại từ máy chủ.",
  ],
  [
    "Exam updated. The list was refreshed from the server.",
    "Đã cập nhật kỳ thi. Danh sách được đọc lại từ máy chủ.",
  ],
  [
    "Exam deleted. The list was refreshed from the server.",
    "Đã xoá kỳ thi. Danh sách được đọc lại từ máy chủ.",
  ],

  // Expenses
  [
    "Expense recorded. The list and totals were read again.",
    "Đã ghi khoản chi. Danh sách và tổng đã được đọc lại.",
  ],
  [
    "Expense deleted. The list and totals were read again.",
    "Đã xoá khoản chi. Danh sách và tổng đã được đọc lại.",
  ],
  [" (custom range)", " (khoảng tùy chỉnh)"],
  ["No expenses match this filter.", "Không có khoản chi khớp bộ lọc này."],
  [
    "No expenses recorded yet. Record the first one below.",
    "Chưa ghi khoản chi nào. Ghi khoản đầu tiên bên dưới nhé.",
  ],

  // Courses
  ["Courses need a moment", "Môn học cần thêm chút thời gian"],
  ["No courses yet", "Chưa có môn học nào"],
  [
    "There are no courses here yet. Once courses are added they will show up right here.",
    "Chưa có môn học nào ở đây. Khi môn học được thêm vào, chúng sẽ hiện ngay tại đây.",
  ],

  // Session and sign-in
  ["The request destination is not valid.", "Đích gửi yêu cầu không hợp lệ."],
  [
    "The workspace session is locked. Sign in to continue.",
    "Phiên workspace đang khóa. Đăng nhập để tiếp tục.",
  ],
  [
    "Could not verify the session for sending requests. Reload the sign-in status.",
    "Chưa xác minh được phiên gửi yêu cầu. Tải lại trạng thái đăng nhập.",
  ],
  [
    "You cancelled Google sign-in. You can try again or use email and password.",
    "Bạn đã hủy đăng nhập Google. Có thể thử lại hoặc dùng email và mật khẩu.",
  ],
  [
    "Google sign-in did not finish. Start again; the earlier request is not resent automatically.",
    "Chưa hoàn tất đăng nhập Google. Hãy bắt đầu lại; yêu cầu cũ không được gửi lại tự động.",
  ],
  [
    "Google sign-in is not ready. You can use email and password.",
    "Đăng nhập Google chưa sẵn sàng. Bạn có thể dùng email và mật khẩu.",
  ],
  ["Sign in · ExaMate AI", "Đăng nhập · ExaMate AI"],
  ["Verifying the session…", "Đang xác minh phiên…"],
  [
    "Sign in to keep studying and working with your group.",
    "Đăng nhập để tiếp tục học và làm việc cùng nhóm nhé.",
  ],
  ["Signing in…", "Đang đăng nhập…"],
  ["Sign in", "Đăng nhập"],
  ["Checking Google sign-in…", "Đang kiểm tra đăng nhập Google…"],
  [
    "Google is not enabled. You can still sign in with email and password.",
    "Google chưa được bật. Bạn vẫn có thể đăng nhập bằng email và mật khẩu.",
  ],
  [
    "Only accounts that have been granted workspace access can reach the data.",
    "Chỉ tài khoản đã được cấp quyền workspace mới truy cập được dữ liệu.",
  ],

  // Sidebar and sources
  ["Change to descending order", "Đổi sang thứ tự giảm dần"],
  ["Change to ascending order", "Đổi sang thứ tự tăng dần"],
  ["↑ Ascending", "↑ Tăng dần"],
  ["↓ Descending", "↓ Giảm dần"],
  ["Page {page}", "Trang {page}"],
  ["No page number · {locator}", "Không có số trang · {locator}"],
  ["No page number", "Không có số trang"],
  ["{title}, page {page}", "{title}, trang {page}"],
  ["Opening…", "Đang mở…"],

  // Speech input (Whisper messages are translated where they are shown)
  ["Waiting for microphone permission…", "Đang chờ quyền microphone…"],
  ["Recording: {value} s", "Đang ghi âm: {value} giây"],
  ["Finishing the recording…", "Đang hoàn tất bản ghi…"],
  ["Turning speech into text…", "Đang chuyển giọng nói thành chữ…"],
  [
    "The transcript is ready. Check and edit it before inserting it into the question.",
    "Bản chép sẵn sàng. Kiểm tra và sửa trước khi chèn vào câu hỏi.",
  ],
  [
    "Whisper detects the language of the recording by itself.",
    "Whisper tự nhận diện ngôn ngữ trong bản ghi.",
  ],
  [
    "Whisper prefers recognising Vietnamese.",
    "Whisper ưu tiên nhận dạng tiếng Việt.",
  ],
  [
    "Whisper prefers recognising English.",
    "Whisper ưu tiên nhận dạng tiếng Anh.",
  ],
  [
    "A question can have at most 4000 characters. Shorten the transcript or the question before inserting.",
    "Câu hỏi tối đa 4000 ký tự. Hãy rút gọn bản chép hoặc câu hỏi trước khi chèn.",
  ],
  [
    "This browser cannot record on this page. You can still type your question.",
    "Trình duyệt chưa hỗ trợ ghi âm ở trang này. Bạn vẫn có thể nhập câu hỏi bằng bàn phím.",
  ],
  ["Checking voice input…", "Đang kiểm tra nhập bằng giọng nói…"],
  [
    "The local Whisper model is ready. Check the transcript before sending the question.",
    "Model Whisper local đã sẵn sàng. Bạn kiểm tra bản chép trước khi gửi câu hỏi.",
  ],
  [
    "Loading the local Whisper model. You only wait this long the first time…",
    "Đang nạp model Whisper local. Quá trình này chỉ cần chờ lần đầu…",
  ],
  [
    "The Whisper model file is missing. Prepare the local model before recording.",
    "Chưa có file model Whisper. Hãy chuẩn bị model local trước khi ghi âm.",
  ],
  [
    "The local Whisper model could not be loaded. Check the setup and try again.",
    "Không nạp được model Whisper local. Kiểm tra cài đặt rồi thử kiểm tra lại.",
  ],
  [
    "ffmpeg or ffprobe is missing for audio processing on the server.",
    "Thiếu ffmpeg hoặc ffprobe để xử lý audio trên máy chủ.",
  ],
  ["Voice input is not enabled.", "Nhập bằng giọng nói chưa được bật."],
  [
    "Could not reach the recording service. You can still type your question.",
    "Chưa kết nối được dịch vụ ghi âm. Bạn vẫn có thể nhập câu hỏi bằng bàn phím.",
  ],
  [
    "The recording did not finish. Please try again.",
    "Chưa hoàn tất bản ghi. Hãy thử lại.",
  ],
  [
    "Could not stop the recording. Please try again.",
    "Không dừng được bản ghi. Hãy thử lại.",
  ],
  [
    "Microphone permission was not granted. Check the browser permissions and try again.",
    "Chưa nhận được quyền microphone. Hãy kiểm tra quyền của trình duyệt và thử lại.",
  ],
  [
    "The browser has no suitable recording format. You can type instead.",
    "Trình duyệt không có định dạng ghi âm phù hợp. Bạn có thể nhập bằng bàn phím.",
  ],
  [
    "The recording is too large. Record something shorter.",
    "Bản ghi quá lớn. Hãy ghi âm ngắn hơn.",
  ],
  [
    "The microphone had an error. Check the device and try again.",
    "Microphone gặp lỗi. Hãy kiểm tra thiết bị và thử lại.",
  ],
  [
    "The recording was interrupted. Please try again.",
    "Ghi âm bị gián đoạn. Hãy thử lại.",
  ],
  [
    "The recording is empty. Speak and record again.",
    "Bản ghi rỗng. Hãy nói và ghi âm lại.",
  ],
  [
    "Did not receive a valid transcript. Please try again.",
    "Chưa nhận được bản chép hợp lệ. Hãy thử lại.",
  ],
  [
    "Could not turn the audio into text. Please try again.",
    "Chưa chuyển được audio thành chữ. Hãy thử lại.",
  ],
  [
    "Microphone permission was denied. Allow it in the browser to record.",
    "Quyền microphone bị từ chối. Hãy cấp quyền trong trình duyệt để ghi âm.",
  ],
  [
    "No microphone found. Check the device.",
    "Không tìm thấy microphone. Hãy kiểm tra thiết bị.",
  ],
  [
    "The microphone is busy or cannot be accessed.",
    "Microphone đang bận hoặc không truy cập được.",
  ],
  [
    "Could not start recording. Please try again.",
    "Không bắt đầu được ghi âm. Hãy thử lại.",
  ],

  // Streaming errors
  [
    "The streamed reply is over the allowed size.",
    "Phản hồi streaming vượt giới hạn cho phép.",
  ],
  [
    "The server sent invalid streaming data.",
    "Máy chủ gửi dữ liệu streaming không hợp lệ.",
  ],
  [
    "The server returned an invalid streaming result.",
    "Máy chủ trả về kết quả streaming không hợp lệ.",
  ],
  [
    "The server sent an unsupported kind of streaming data.",
    "Máy chủ gửi loại dữ liệu streaming không được hỗ trợ.",
  ],

  // Study Coach
  [
    "The action could not be completed. Please try again.",
    "Không thể hoàn tất thao tác. Hãy thử lại.",
  ],
  [
    "The document is not ready for creating a quiz.",
    "Tài liệu chưa sẵn sàng để tạo quiz.",
  ],
  [
    "The draft does not match the selected document.",
    "Bản nháp không khớp tài liệu đang chọn.",
  ],
  ["Saved quiz “{title}”.", "Đã lưu quiz “{title}”."],
  [
    "The server says the quiz is still a draft. You can confirm the save again with a separate action.",
    "Máy chủ xác nhận quiz vẫn là bản nháp. Bạn có thể xác nhận lưu lại bằng thao tác riêng.",
  ],
  [
    "The draft has expired. Create a new preview yourself.",
    "Bản nháp đã hết hạn. Hãy chủ động tạo bản xem trước mới.",
  ],
  ["The draft is no longer available.", "Bản nháp không còn khả dụng."],
  ["Checking the document…", "Đang kiểm tra tài liệu…"],
  ["Document: {name}", "Tài liệu: {name}"],
  [
    "Pick an indexed document from Documents.",
    "Chọn một tài liệu đã lập chỉ mục từ Documents.",
  ],
  ["Creating the preview…", "Đang tạo bản xem trước…"],
  ["Create a new preview", "Tạo bản xem trước mới"],
  [
    " The request may have finished on the server; no AI call is resent automatically.",
    " Yêu cầu có thể đã hoàn tất ở máy chủ; không có lần gọi AI nào được tự gửi lại.",
  ],
  [" · Correct answer", " · Đáp án đúng"],
  [" · page {page}", " · trang {page}"],
  ["Checking/saving…", "Đang kiểm tra/lưu…"],
  ["Confirm saving the quiz", "Xác nhận lưu quiz"],
  ["{value} quizzes", "{value} bộ quiz"],
  ["The source is still available", "Nguồn hiện còn khả dụng"],
  [
    "The source is no longer available; the saved quiz content is kept as it is.",
    "Nguồn không còn khả dụng; nội dung quiz đã lưu vẫn giữ nguyên.",
  ],
  [
    "{title} · source no longer available",
    "{title} · nguồn không còn khả dụng",
  ],
  ["Grading…", "Đang chấm…"],
  ["Resubmit the same attempt", "Gửi lại cùng lượt"],
  ["Submit", "Nộp bài"],
  ["Correct.", "Chính xác."],
  ["Not correct.", "Chưa chính xác."],

  // Flashcards
  ["Could not confirm saving the deck.", "Không thể xác nhận lưu bộ thẻ."],
  ["Could not cancel the preview.", "Không thể hủy bản xem trước."],
  [
    "{action} The outcome of the action is unclear. Reconcile the status before the next write.",
    "{action} Kết quả thao tác chưa rõ. Hãy đối chiếu trạng thái trước khi thực hiện thao tác ghi tiếp theo.",
  ],
  [
    "{action} The preview was saved, possibly from another tab. Reconcile to pick up the saved deck.",
    "{action} Bản xem trước đã được lưu, có thể từ tab khác. Hãy đối chiếu để nhận bộ thẻ đã lưu.",
  ],
  [
    "{action} The current session or access does not allow this action. Check your sign-in and access.",
    "{action} Phiên hoặc quyền truy cập hiện tại không cho phép thao tác. Hãy kiểm tra đăng nhập và quyền truy cập.",
  ],
  [
    "{action} The source document changed or is no longer ready. Check the document; if needed, create a new preview yourself.",
    "{action} Tài liệu nguồn đã thay đổi hoặc không còn sẵn sàng. Hãy kiểm tra tài liệu; nếu cần, chủ động tạo bản xem trước mới.",
  ],
  [
    "{action} The preview has expired or is no longer available. Reconcile the status; do not resend the write before it is confirmed.",
    "{action} Bản xem trước đã hết hạn hoặc không còn khả dụng. Hãy đối chiếu trạng thái; không gửi lại thao tác ghi khi chưa xác nhận.",
  ],
  [
    "{action} The request was rejected. Reconcile the preview status before deciding the next action.",
    "{action} Yêu cầu bị từ chối. Hãy đối chiếu trạng thái bản xem trước trước khi quyết định thao tác tiếp theo.",
  ],
  ["Saved deck “{title}”.", "Đã lưu bộ thẻ “{title}”."],
  [
    "Confirmed that deck “{title}” was saved.",
    "Đã xác nhận bộ thẻ “{title}” đã được lưu.",
  ],
  [
    "The server says the preview was not saved. You can confirm separately.",
    "Máy chủ xác nhận bản xem trước chưa được lưu. Bạn có thể xác nhận riêng.",
  ],
  [
    "The preview has expired. This one can no longer be saved.",
    "Bản xem trước đã hết hạn. Không thể tiếp tục lưu bản này.",
  ],
  [
    "The deck was deleted. It cannot be restored with an old confirmation.",
    "Bộ thẻ đã bị xóa. Không thể khôi phục bằng xác nhận cũ.",
  ],
  [
    "The preview was cancelled. This one can no longer be saved.",
    "Bản xem trước đã bị hủy. Không thể tiếp tục lưu bản này.",
  ],
  [
    "Could not reconcile the save status. Only reading again is allowed; writes stay locked.",
    "Chưa đối chiếu được trạng thái lưu. Chỉ thử đọc đối chiếu lại; thao tác ghi vẫn bị khóa.",
  ],
  ["The preview has expired.", "Bản xem trước đã hết hạn."],
  [
    "Preview cancelled; no deck was saved.",
    "Đã hủy bản xem trước; chưa có bộ thẻ nào được lưu.",
  ],
  [
    "Self-assessment saved. This is your own record, not an AI score.",
    "Đã lưu lượt tự đánh giá. Đây là ghi nhận của bạn, không phải điểm AI.",
  ],
  [
    "Deleted the flashcard deck and your self-assessments.",
    "Đã xóa bộ flashcards và các lượt tự đánh giá của bạn.",
  ],
  [
    "Could not confirm the deletion. Reload the list to reconcile. {value}",
    "Chưa xác nhận được kết quả xóa. Hãy tải lại danh sách để đối chiếu. {value}",
  ],
  [
    "Type at least two characters to search, or browse the ready documents.",
    "Nhập ít nhất hai ký tự để tìm, hoặc duyệt tài liệu đã sẵn sàng.",
  ],
  [
    "No matching indexed document found.",
    "Không tìm thấy tài liệu đã lập chỉ mục phù hợp.",
  ],
  [
    "Pick a document from Documents to create flashcards.",
    "Chọn một tài liệu từ Documents để tạo flashcards.",
  ],
  ["Creating…", "Đang tạo…"],
  [
    " The server may have created a draft; no request is resent automatically.",
    " Máy chủ có thể đã tạo bản nháp; không có yêu cầu nào được tự gửi lại.",
  ],
  ["Confirm saving the deck", "Xác nhận lưu bộ thẻ"],
  ["{value} decks", "{value} bộ"],
  [
    "Latest {value}: {latestRemembered} remembered, {latestNeedsReview} to review again",
    "Gần nhất {value}: {latestRemembered} đã nhớ, {latestNeedsReview} cần ôn lại",
  ],
  ["No self-assessment yet", "Chưa có lượt tự đánh giá"],
  [
    "The source is no longer ready; the flashcard snapshot is kept as it is.",
    "Nguồn không còn sẵn sàng; snapshot flashcards được giữ nguyên.",
  ],
  ["Open deck {title}", "Mở bộ thẻ {title}"],
  ["Confirm delete", "Xác nhận xóa"],
  ["Delete deck", "Xóa bộ thẻ"],
  [
    "latest {value}: {latestRemembered} remembered, {latestNeedsReview} to review again",
    "gần nhất {value}: {latestRemembered} đã nhớ, {latestNeedsReview} cần ôn lại",
  ],
  ["no review yet", "chưa có lượt ôn"],

  // Study plan
  [
    "Please choose the course for this item.",
    "Chọn giúp mình môn học của việc này nhé.",
  ],
  [
    "The item name needs at least three characters.",
    "Tên việc cần ít nhất ba ký tự.",
  ],
  ["Added to the revision plan.", "Đã thêm vào kế hoạch ôn tập."],
  ["{remaining} items left", "{remaining} việc còn lại"],
  ["All done", "Đã xong hết"],
  ["Add or view revision items", "Thêm hoặc xem việc cần ôn"],
  ["View revision items", "Xem việc cần ôn"],
  [
    "Added to the revision plan; the list was read again from the server.",
    "Đã thêm vào kế hoạch ôn tập; danh sách được đọc lại từ máy chủ.",
  ],
  ["The status was updated.", "Trạng thái đã được cập nhật."],
  [
    "The revision item was deleted; the list was read again from the server.",
    "Việc ôn tập đã được xoá; danh sách được đọc lại từ máy chủ.",
  ],
  [
    "No revision items match this filter.",
    "Không có việc ôn tập khớp bộ lọc này.",
  ],
  ["Add revision item", "Thêm việc ôn tập"],

  // Tasks
  ["Task status updated.", "Đã cập nhật trạng thái task."],
  [
    "Task title must contain at least three characters.",
    "Tiêu đề task cần có ít nhất ba ký tự.",
  ],
  ["Task added successfully.", "Đã thêm task thành công."],
  ["No tasks on this page.", "Không có task nào trên trang này."],
  ["No tasks match this search.", "Không có task nào khớp tìm kiếm này."],
  [
    "Page {page} of {totalPages} · {total} {noun}",
    "Trang {page}/{totalPages} · {total} {noun}",
  ],
  ["task", "task"],
  ["tasks", "task"],
  ["0 tasks", "0 task"],
  ["Add task", "Thêm task"],
  ["Reopen", "Mở lại"],
  ["Complete", "Hoàn thành"],
  ["Status for {title}", "Trạng thái của {title}"],

  // Assistant conversation state
  [
    "A new conversation was opened. The old context is not sent on.",
    "Đã mở cuộc hội thoại mới. Ngữ cảnh cũ không được gửi tiếp.",
  ],
  [
    "The session or workspace changed. The old conversation data was cleared from the screen.",
    "Phiên hoặc workspace đã đổi. Dữ liệu hội thoại cũ đã được xóa khỏi màn hình.",
  ],
  [
    "You just changed the course or document. A fresh context starts so the sources do not mix.",
    "Bạn vừa đổi môn hoặc tài liệu. Mình bắt đầu ngữ cảnh mới để không lẫn nguồn nhé.",
  ],
  [
    "The context is long, so only the latest turns are sent; the visible conversation is untouched.",
    "Ngữ cảnh dài nên chỉ gửi các lượt gần nhất; hội thoại hiển thị vẫn còn nguyên.",
  ],
  [
    "The context is long, so the server dropped old turns or shortened long parts. Citations still come from the current turn.",
    "Ngữ cảnh dài nên server đã bỏ lượt cũ hoặc rút gọn phần dài. Nguồn trích dẫn vẫn lấy ở lượt hiện tại.",
  ],
  [
    "Could not load the history. Try reading it again.",
    "Chưa tải được lịch sử. Hãy thử đọc lại.",
  ],
  [
    "This conversation is no longer available or has expired. Refresh the history or start a new conversation.",
    "Cuộc trò chuyện này không còn khả dụng hoặc đã hết hạn. Hãy làm mới lịch sử hoặc bắt đầu cuộc trò chuyện mới.",
  ],
  [
    "Could not open the conversation. Check your session or access, then refresh the history.",
    "Không thể mở cuộc trò chuyện. Hãy kiểm tra phiên đăng nhập hoặc quyền truy cập rồi làm mới lịch sử.",
  ],
  [
    "Could not load the conversation content. You can try opening it again or refresh the history.",
    "Chưa tải được nội dung cuộc trò chuyện. Bạn có thể thử mở lại hoặc làm mới lịch sử.",
  ],
  [
    "Could not open the conversation content. Refresh the history or start a new conversation.",
    "Không thể mở nội dung cuộc trò chuyện. Hãy làm mới lịch sử hoặc bắt đầu cuộc trò chuyện mới.",
  ],
  [
    "{message} The history is being reconciled again.",
    "{message} Lịch sử đang được đối chiếu lại.",
  ],
  [
    "Could not confirm the delete. The history is being reconciled again.",
    "Chưa xác nhận được thao tác xóa. Lịch sử đang được đối chiếu lại.",
  ],
  [
    "Could not reconcile the saved turn within the safe limit. Reload the conversation from the history list.",
    "Chưa đối chiếu được lượt lưu trong giới hạn an toàn. Hãy tải lại hội thoại từ danh sách lịch sử.",
  ],
  [
    "This turn is not in the conversation yet. You can try saving it again; ExaMate will not resend the question to the AI.",
    "Lượt này chưa có trong hội thoại. Bạn có thể chủ động thử lưu lại; ExaMate sẽ không gửi lại câu hỏi cho AI.",
  ],
  [
    "Could not determine the save result. Open the history to compare before trying again.",
    "Chưa xác định được kết quả lưu. Hãy mở lịch sử để đối chiếu trước khi thử lại.",
  ],
  [
    "Could not determine the write result. Compare the history before trying to save again.",
    "Chưa xác định được kết quả ghi. Hãy đối chiếu lịch sử trước khi thử lưu tiếp.",
  ],
  [
    "You just changed the mode. A fresh context starts.",
    "Bạn vừa đổi chế độ. Mình bắt đầu ngữ cảnh mới nhé.",
  ],

  // Data hooks
  [
    "Courses could not be loaded. Check your connection and retry.",
    "Chưa tải được môn học. Kiểm tra kết nối rồi thử lại.",
  ],
  [
    "Could not load the documents. The connection may be flaky, please try again.",
    "Chưa xem được tài liệu. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
  ],
  [
    "Could not change the course of this document. Please try once more.",
    "Chưa đổi được môn cho tài liệu này. Thử lại một lần nữa nhé.",
  ],
  [
    "Could not upload the file. Please try once more.",
    "Chưa tải được tệp lên. Thử lại một lần nữa nhé.",
  ],
  [
    "Could not load the exam schedule. The connection may be flaky, please try again.",
    "Chưa xem được lịch thi. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
  ],
  [
    "Could not save this exam. Check the details and try again.",
    "Chưa lưu được kỳ thi này. Xem lại thông tin rồi thử lại nhé.",
  ],
  [
    "Could not save the changes. Check the details and try again.",
    "Chưa lưu được thay đổi. Xem lại thông tin rồi thử lại nhé.",
  ],
  [
    "Could not delete this exam. Please try once more.",
    "Chưa xoá được kỳ thi này. Thử lại một lần nữa nhé.",
  ],
  ["Tomorrow", "Ngày mai"],
  ["Yesterday", "Hôm qua"],
  ["{days} days left", "Còn {days} ngày"],
  ["{value} days ago", "{value} ngày trước"],
  [
    "Could not load the expenses. The connection may be flaky, please try again.",
    "Chưa xem được các khoản chi. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
  ],
  [
    "Could not save the expense. Check the details and try again.",
    "Chưa lưu được khoản chi. Xem lại thông tin rồi thử lại nhé.",
  ],
  [
    "Could not delete the expense. Please try once more.",
    "Chưa xoá được khoản chi. Thử lại một lần nữa nhé.",
  ],
  [
    "Could not load this list. Check your connection and retry.",
    "Chưa tải được danh sách này. Kiểm tra kết nối rồi thử lại.",
  ],
  [
    "You have not been granted workspace access. Contact the group to get access.",
    "Bạn chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền.",
  ],
  [
    "The authentication service is interrupted. The workspace is locked; try checking again.",
    "Dịch vụ xác thực đang gián đoạn. Workspace đã khóa; thử kiểm tra lại nhé.",
  ],
  [
    "The session is no longer valid. Drafts in this tab are kept; check the session to continue.",
    "Phiên không còn hợp lệ. Bản nháp trong tab vẫn được giữ; kiểm tra lại phiên để tiếp tục.",
  ],
  [
    "You are signed in but have not been granted workspace access. Contact the group to get access.",
    "Bạn đã đăng nhập nhưng chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền.",
  ],
  [
    "The session needs to be refreshed. Drafts in this tab are kept.",
    "Phiên cần được làm mới. Bản nháp trong tab vẫn được giữ.",
  ],
  [
    "Could not confirm the session refresh. The workspace is locked; check again to sign in. A request in flight is not resent automatically.",
    "Chưa xác nhận được làm mới phiên. Workspace đã khóa; kiểm tra lại để đăng nhập. Yêu cầu đang gửi không được tự động gửi lại.",
  ],
  [
    "The session has expired. Check again to open the sign-in screen.",
    "Phiên đã hết hạn. Kiểm tra lại để mở màn hình đăng nhập.",
  ],
  [
    "Could not verify the session. The workspace is locked; try checking again.",
    "Chưa xác minh được phiên. Workspace đang khóa; thử kiểm tra lại nhé.",
  ],
  [
    "The session was signed out in another tab. Check again to sign in.",
    "Phiên đã đăng xuất ở tab khác. Kiểm tra lại để đăng nhập.",
  ],
  [
    "The session changed in another tab. Check again before continuing.",
    "Phiên đã đổi ở tab khác. Kiểm tra lại trước khi tiếp tục.",
  ],
  [
    "The session used to send requests changed. Press Check session to verify again, then sign in.",
    "Phiên gửi yêu cầu đã đổi. Bấm Check session để xác minh lại, rồi đăng nhập nhé.",
  ],
  [
    "The sign-in session has expired. Press Check session to verify again, then try signing in.",
    "Phiên đăng nhập đã hết hạn. Bấm Check session để xác minh lại, rồi thử đăng nhập nhé.",
  ],
  [
    "Incorrect email or password, or the account has not been confirmed.",
    "Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa được xác nhận.",
  ],
  ["There have been many sign-in attempts.", "Đã có nhiều lần thử đăng nhập."],
  ["You can try again after {time}.", "Có thể thử lại sau {time}."],
  ["Wait a moment and try again.", "Chờ một lúc rồi thử lại."],
  [
    "Could not sign in. The authentication service or database may be interrupted.",
    "Chưa đăng nhập được. Dịch vụ xác thực hoặc cơ sở dữ liệu có thể đang gián đoạn.",
  ],
  [
    "Google sign-in is not enabled. You can still use email and password.",
    "Đăng nhập Google chưa được bật. Bạn vẫn có thể dùng email và mật khẩu.",
  ],
  [
    "Could not start Google sign-in. Check the session and start Google sign-in again; the request is not resent automatically.",
    "Chưa bắt đầu được đăng nhập Google. Hãy kiểm tra phiên rồi bắt đầu lại đăng nhập Google; yêu cầu không được tự gửi lại.",
  ],
  ["Signed out.", "Đã đăng xuất."],
  [
    "The session was locked at ExaMate; revoking it at the Auth service is not confirmed.",
    "Đã khóa phiên tại ExaMate; chưa xác nhận thu hồi phiên ở dịch vụ Auth.",
  ],
  [
    "Could not confirm the sign-out. The workspace is locked; try again to revoke the session.",
    "Chưa xác nhận được đăng xuất. Workspace đã khóa; thử lại để thu hồi phiên.",
  ],
  [
    "This item is not available in the current workspace.",
    "Mục này không có trong workspace hiện tại.",
  ],
  [
    "Could not search right now. Check the connection and try again.",
    "Chưa tìm được lúc này. Kiểm tra kết nối rồi thử lại nhé.",
  ],
  [
    "Could not load the revision plan. The connection may be flaky, please try again.",
    "Chưa xem được kế hoạch ôn tập. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
  ],
  [
    "Could not save this item. Check the details and try again.",
    "Chưa lưu được việc này. Xem lại thông tin rồi thử lại nhé.",
  ],
  [
    "Could not change the status. Please try once more.",
    "Chưa đổi được trạng thái. Thử lại một lần nữa nhé.",
  ],
  [
    "Could not delete this item. Please try once more.",
    "Chưa xoá được việc này. Thử lại một lần nữa nhé.",
  ],
  ["Tasks are unavailable.", "Chưa xem được task."],
  ["Please retry.", "Vui lòng thử lại."],
  ["Could not save task.", "Chưa lưu được task."],
  [
    "Could not update task. Your previous status has been kept.",
    "Chưa cập nhật được task. Trạng thái trước đó được giữ nguyên.",
  ],
];
