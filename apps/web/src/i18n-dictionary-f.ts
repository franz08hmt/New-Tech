import type { DictionaryEntry } from "./i18n-dictionary-a";

/** Page headings and fixed label tables that are defined outside components. */
export const dictionaryF: readonly DictionaryEntry[] = [
  // Page headings
  ["YOUR SPACE TO LEARN & GROW", "KHÔNG GIAN HỌC TẬP & PHÁT TRIỂN CỦA BẠN"],
  ["Dashboard", "Tổng quan"],
  ["Student academic dashboard", "Bảng học tập của sinh viên"],
  [
    "A little structure. A lot of possibility. Make space for your best work.",
    "Một chút nề nếp, thật nhiều khả năng. Dành chỗ cho phần việc tốt nhất của bạn.",
  ],
  ["COURSE GALLERY", "THƯ VIỆN MÔN HỌC"],
  ["Your learning journey", "Hành trình học tập của bạn"],
  [
    "One place for the subjects, ideas and skills you’re exploring.",
    "Một nơi cho các môn học, ý tưởng và kỹ năng bạn đang khám phá.",
  ],
  ["TEAM WORKLOAD", "KHỐI LƯỢNG CÔNG VIỆC NHÓM"],
  ["Tasks", "Công việc", "Công việc"],
  ["Task", "Task"],
  ["Small steps. Real progress.", "Từng bước nhỏ. Tiến bộ thật."],
  [
    "Plan the work, share the load, and keep moving forward together.",
    "Lên kế hoạch, chia sẻ khối lượng và cùng nhau tiến về phía trước.",
  ],
  ["ASSESSMENT SCHEDULE", "LỊCH ĐÁNH GIÁ"],
  ["Exam", "Kỳ thi"],
  ["A little more prepared", "Chuẩn bị tốt hơn một chút"],
  [
    "Keep upcoming assessments in view and give yourself room to prepare.",
    "Theo dõi các bài đánh giá sắp tới và dành cho mình thời gian chuẩn bị.",
  ],
  ["REVISION BOARD", "BẢNG ÔN TẬP"],
  ["One subject at a time", "Mỗi lần một môn"],
  [
    "What each subject still needs from you before its exam, in one list.",
    "Những việc mỗi môn còn cần bạn làm trước kỳ thi, gói trong một danh sách.",
  ],
  ["SOURCE LIBRARY", "THƯ VIỆN TÀI LIỆU"],
  ["Document", "Tài liệu"],
  ["Your trusted study sources", "Nguồn học tập đáng tin của bạn"],
  [
    "Collect the materials ExaMate will use for review and grounded answers.",
    "Gom các tài liệu ExaMate sẽ dùng để ôn tập và trả lời có dẫn nguồn.",
  ],
  ["PERSONAL PRACTICE", "LUYỆN TẬP CÁ NHÂN"],
  ["Practice from your study sources", "Luyện tập từ nguồn học của bạn"],
  [
    "Review evidence-grounded quizzes that you chose to save.",
    "Xem lại các quiz có dẫn chứng mà bạn đã chọn lưu.",
  ],
  ["SEMESTER BUDGET", "NGÂN SÁCH HỌC KỲ"],
  ["Finances", "Tài chính"],
  ["Room in your budget", "Chỗ trống trong ngân sách"],
  [
    "A simple view of the resources behind your academic journey.",
    "Cái nhìn đơn giản về các nguồn lực đứng sau hành trình học tập của bạn.",
  ],
  ["WORKSPACE AI ACTIVITY", "HOẠT ĐỘNG AI CỦA WORKSPACE"],
  ["AI usage", "Sử dụng AI"],
  [
    "View the usage telemetry recorded in the current workspace.",
    "Xem telemetry sử dụng đã ghi nhận trong workspace hiện tại.",
  ],
  ["GROUNDED ANSWERS · PLANNED", "TRẢ LỜI CÓ DẪN NGUỒN · DỰ KIẾN"],
  ["Assistant", "Assistant"],
  ["Meet your study companion", "Làm quen với bạn đồng hành học tập"],
  [
    "ExaMate will connect your questions to the evidence in your documents.",
    "ExaMate sẽ nối câu hỏi của bạn với bằng chứng trong tài liệu.",
  ],

  // Assistant failure banners
  [
    "No relevant evidence was found in the selected documents.",
    "Không tìm thấy bằng chứng phù hợp trong phạm vi tài liệu đã chọn.",
  ],
  [
    "Pick a document before summarising.",
    "Hãy chọn một tài liệu trước khi tóm tắt.",
  ],
  ["The selected document was not found.", "Không tìm thấy tài liệu đã chọn."],
  [
    "The selected document does not belong to the current course.",
    "Tài liệu đã chọn không thuộc môn học hiện tại.",
  ],
  [
    "The document is not ready. Index it and try again.",
    "Tài liệu chưa sẵn sàng. Hãy lập chỉ mục rồi thử lại.",
  ],
  [
    "The document has no usable content; a scanned file may need OCR.",
    "Tài liệu chưa có nội dung đủ dùng; file scan có thể cần OCR.",
  ],
  [
    "The document is over the safe processing limit for this action.",
    "Tài liệu vượt giới hạn xử lý an toàn cho thao tác này.",
  ],
  [
    "AI is not configured on the server.",
    "AI chưa được cấu hình trên máy chủ.",
  ],
  [
    "The AI took too long to answer. Your draft is kept so you can retry.",
    "AI phản hồi quá lâu. Bản nháp vẫn được giữ để thử lại.",
  ],
  [
    "The AI service has run out of quota. Please try again later.",
    "Dịch vụ AI đã hết quota. Hãy thử lại sau.",
  ],
  ["The AI credentials are not valid.", "Thông tin xác thực AI không hợp lệ."],
  [
    "The AI service is unavailable right now. Please try again later.",
    "Dịch vụ AI hiện không khả dụng. Hãy thử lại sau.",
  ],
  [
    "The AI returned invalid data or ran into a temporary problem.",
    "AI trả về dữ liệu không hợp lệ hoặc tạm thời gặp sự cố.",
  ],
  [
    "Could not read workspace data because the database is interrupted. Your draft is kept so you can retry.",
    "Chưa đọc được dữ liệu workspace vì cơ sở dữ liệu đang gián đoạn. Bản nháp vẫn được giữ để thử lại.",
  ],
  [
    "Ask workspace mode only takes questions, not documents or summarise actions.",
    "Chế độ Hỏi workspace chỉ nhận câu hỏi, không nhận tài liệu hay thao tác tóm tắt.",
  ],

  // Usage dashboard filters
  ["Assistant question", "Câu hỏi Assistant"],
  ["Summary", "Tóm tắt"],
  ["Course information", "Thông tin môn học"],
  ["Document indexing", "Lập chỉ mục tài liệu"],
  ["General", "Chung"],

  // Feedback reasons
  ["Wrong source", "Sai nguồn"],
  ["Missing point", "Thiếu ý"],
  ["Document not found", "Không tìm thấy tài liệu"],
  ["Content is not accurate", "Nội dung chưa chính xác"],
  ["Other", "Khác"],

  // Expense categories and periods
  ["Books & materials", "Sách & tài liệu"],
  ["Transport", "Đi lại"],
  ["Food", "Ăn uống"],
  ["Supplies", "Dụng cụ"],
  ["Tuition & fees", "Học phí & lệ phí"],
  ["This week", "Tuần này"],
  ["This month", "Tháng này"],

  // Pagers
  [
    "{total} course · page {page} of {pages}",
    "{total} môn học · trang {page} trên {pages}",
  ],
  [
    "{total} courses · page {page} of {pages}",
    "{total} môn học · trang {page} trên {pages}",
  ],
  [
    "{total} exam · page {page} of {pages}",
    "{total} kỳ thi · trang {page} trên {pages}",
  ],
  [
    "{total} exams · page {page} of {pages}",
    "{total} kỳ thi · trang {page} trên {pages}",
  ],

  // Language switch
  ["Display language", "Ngôn ngữ hiển thị"],
  [
    "Changes the interface language only. Your input and AI answers keep their own language.",
    "Chỉ đổi ngôn ngữ giao diện. Nội dung bạn nhập và câu trả lời của AI giữ nguyên ngôn ngữ của chúng.",
  ],

  // Roles (the Vietnamese side keeps the bilingual label that was always shown)
  ["Manager", "Manager · Người quản lý", "Manager · Người quản lý"],
  ["Member", "Member · Thành viên", "Member · Thành viên"],
  ["Viewer", "Viewer · Chỉ xem", "Viewer · Chỉ xem"],
];
