import type { DictionaryEntry } from "./i18n-dictionary-a";

/** Members page, its roles and the messages the members API answers with. */
export const dictionaryG: readonly DictionaryEntry[] = [
  ["YOUR STUDY GROUP", "NHÓM HỌC TẬP CỦA BẠN"],
  ["Members", "Thành viên"],
  ["Who is in this group", "Ai đang ở trong nhóm này"],
  [
    "See who shares this workspace, what each role can do, and who has access.",
    "Xem ai dùng chung workspace, mỗi vai trò làm được gì và ai đang có quyền truy cập.",
  ],
  ["Welcome back.", "Chào mừng trở lại."],

  ["Your access", "Quyền của bạn"],
  [
    "You can manage members and roles, and you can change or delete shared records.",
    "Bạn quản lý được thành viên và vai trò, đồng thời sửa hoặc xóa được các bản ghi chung.",
  ],
  [
    "You can add and edit shared records and documents. Only a manager can delete them or change roles.",
    "Bạn thêm và sửa được bản ghi, tài liệu chung. Chỉ người quản lý mới xóa được chúng hoặc đổi vai trò.",
  ],
  [
    "You can read everything shared in this workspace. Ask a manager if you need to edit.",
    "Bạn đọc được mọi thứ được chia sẻ trong workspace này. Cần chỉnh sửa thì nhờ người quản lý.",
  ],
  ["Loading members…", "Đang tải danh sách thành viên…"],
  ["What each role can do", "Mỗi vai trò làm được gì"],
  ["Action", "Thao tác"],
  ["Allowed", "Được phép"],
  ["Not allowed", "Không được phép"],
  [
    "See courses, tasks, exams, revision items, expenses and shared documents",
    "Xem môn học, task, kỳ thi, việc cần ôn, khoản chi và tài liệu chung",
  ],
  [
    "Ask the Assistant and use Study Coach",
    "Hỏi Assistant và dùng Study Coach",
  ],
  [
    "Add and edit tasks, exams, revision items and expenses",
    "Thêm và sửa task, kỳ thi, việc cần ôn và khoản chi",
  ],
  [
    "Upload, index and re-assign shared documents",
    "Tải lên, lập chỉ mục và gán lại môn cho tài liệu chung",
  ],
  [
    "Delete exams, revision items, expenses and documents",
    "Xóa kỳ thi, việc cần ôn, khoản chi và tài liệu",
  ],
  ["See AI usage for the workspace", "Xem mức sử dụng AI của workspace"],
  ["Manage members and roles", "Quản lý thành viên và vai trò"],
  ["Shared by the whole group", "Cả nhóm dùng chung"],
  [
    "Courses, tasks, exams, revision plans, expenses and uploaded documents. Every active member sees what the others upload.",
    "Môn học, task, kỳ thi, kế hoạch ôn tập, khoản chi và tài liệu đã tải lên. Mọi thành viên đang hoạt động đều thấy tài liệu của nhau.",
  ],
  ["Private to each person", "Riêng của từng người"],
  [
    "Assistant conversations, Study Coach quizzes and flashcards, and your own quick notes.",
    "Hội thoại với Assistant, quiz và flashcards của Study Coach, cùng ghi chú nhanh của bạn.",
  ],

  ["Group members", "Thành viên trong nhóm"],
  ["Reload members", "Tải lại thành viên"],
  [
    "Member management is not switched on for this server yet. The roles above still apply; ask the person who runs the server to apply the members update.",
    "Quản lý thành viên chưa được bật trên máy chủ này. Các vai trò ở trên vẫn có hiệu lực; hãy nhờ người vận hành máy chủ áp dụng bản cập nhật thành viên.",
  ],
  ["Active", "Đang hoạt động"],
  ["Switched off", "Đã tắt"],
  ["Last seen", "Lần cuối thấy"],
  ["You", "Bạn"],
  ["Member {id}", "Thành viên {id}"],
  ["Role of {name}", "Vai trò của {name}"],
  ["Switch off", "Tắt quyền"],
  ["Switch back on", "Bật lại"],
  ["Signed in and waiting for access", "Đã đăng nhập, đang chờ cấp quyền"],
  ["Role for {name}", "Vai trò cho {name}"],
  ["Give access", "Cấp quyền"],
  ["Add a member", "Thêm thành viên"],
  [
    "Enter the e-mail address they sign in with. They join with the role you pick as soon as they sign in; nothing is sent by e-mail.",
    "Nhập địa chỉ email họ dùng để đăng nhập. Họ vào nhóm với vai trò bạn chọn ngay khi đăng nhập; hệ thống không gửi email.",
  ],
  ["E-mail address", "Địa chỉ email"],
  ["Role", "Vai trò"],
  ["Add member", "Thêm thành viên"],
  ["Invitations waiting", "Lời mời đang chờ"],
  ["Expires", "Hết hạn"],
  ["Revoke invitation for {email}", "Thu hồi lời mời cho {email}"],
  ["Revoke", "Thu hồi"],
  [
    "{email} had already signed in and now has access.",
    "{email} đã đăng nhập trước đó và giờ đã có quyền truy cập.",
  ],
  ["{email} has access again.", "{email} đã được cấp lại quyền truy cập."],
  [
    "Invitation saved for {email}. They join as soon as they sign in with that address.",
    "Đã lưu lời mời cho {email}. Họ vào nhóm ngay khi đăng nhập bằng địa chỉ này.",
  ],
  [
    "Could not complete the action. Please try again.",
    "Không thể hoàn tất thao tác. Hãy thử lại.",
  ],

  // Answers of the members API
  [
    "Only a workspace manager can change members and roles.",
    "Chỉ người quản lý workspace mới thay đổi được thành viên và quyền.",
  ],
  [
    "The workspace must keep at least one active manager.",
    "Workspace phải còn ít nhất một người quản lý đang hoạt động.",
  ],
  [
    "You cannot switch off your own access.",
    "Bạn không thể tự tắt quyền của chính mình.",
  ],
  ["This person is already a member.", "Người này đã là thành viên."],
  [
    "That member or invitation was not found.",
    "Không tìm thấy thành viên hoặc lời mời này.",
  ],
  ["That e-mail address is not valid.", "Địa chỉ email chưa hợp lệ."],
  [
    "There are already 50 invitations waiting. Revoke some before inviting more.",
    "Đã có 50 lời mời đang chờ. Hãy thu hồi bớt trước khi mời thêm.",
  ],
  ["That role is not valid.", "Vai trò không hợp lệ."],
  ["Pick a new role or status.", "Cần chọn vai trò hoặc trạng thái mới."],
  [
    "Member management is not switched on for this server.",
    "Chức năng quản lý thành viên chưa được bật trên máy chủ này.",
  ],
];
