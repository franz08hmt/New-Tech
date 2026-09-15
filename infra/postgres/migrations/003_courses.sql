CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE
    CONSTRAINT courses_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name VARCHAR(120) NOT NULL
    CONSTRAINT courses_name_length_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  code VARCHAR(20) NOT NULL UNIQUE
    CONSTRAINT courses_code_length_check CHECK (char_length(btrim(code)) BETWEEN 2 AND 20),
  detail VARCHAR(240) NOT NULL
    CONSTRAINT courses_detail_length_check CHECK (char_length(btrim(detail)) BETWEEN 3 AND 240),
  progress SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT courses_progress_check CHECK (progress BETWEEN 0 AND 100),
  tone VARCHAR(20) NOT NULL
    CONSTRAINT courses_tone_check CHECK (tone IN ('slate', 'sage', 'sand', 'navy', 'rose')),
  cover TEXT NOT NULL
    CONSTRAINT courses_cover_check CHECK (cover ~ '^/img/[a-z0-9-]+[.]webp$'),
  cover_alt VARCHAR(255) NOT NULL
    CONSTRAINT courses_cover_alt_length_check CHECK (char_length(btrim(cover_alt)) BETWEEN 3 AND 255),
  outline JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT courses_outline_array_check CHECK (jsonb_typeof(outline) = 'array'),
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT courses_outcomes_array_check CHECK (jsonb_typeof(outcomes) = 'array'),
  assessment JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT courses_assessment_array_check CHECK (jsonb_typeof(assessment) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX courses_code_idx ON courses (code);

-- Illustrative data only: these are natural Vietnamese examples for the demo,
-- not official syllabi, real schedules, lecturers, textbooks, or assessments.
INSERT INTO courses
  (slug, name, code, detail, progress, tone, cover, cover_alt, outline, outcomes, assessment)
VALUES
  (
    'cs-201', 'Công nghệ phần mềm', 'CS 201',
    'Thiết kế, kiểm thử và vận hành phần mềm theo nhóm', 62, 'slate',
    '/img/course-cs.webp', 'Màn hình mã nguồn trong không gian học tập',
    '[{"title":"Phân tích yêu cầu","summary":"Chuyển nhu cầu của người dùng thành phạm vi và tiêu chí kiểm chứng rõ ràng."},{"title":"Thiết kế và kiểm thử","summary":"Chia hệ thống thành các phần nhỏ, xác định hợp đồng và kiểm tra hành vi bằng test."},{"title":"Triển khai có trách nhiệm","summary":"Làm việc với Git, review thay đổi và trình bày bằng chứng kỹ thuật dễ kiểm tra."}]'::jsonb,
    '["Giải thích được luồng đi của một tính năng trong hệ thống.","Xây dựng và kiểm thử một chức năng nhỏ từ yêu cầu đã viết.","Review code và trình bày được lý do cho các quyết định kỹ thuật."]'::jsonb,
    '[{"method":"Bài tập thực hành","weight_percent":30,"description":"Các bài nhỏ về triển khai và giải thích kỹ thuật trong học kỳ."},{"method":"Đồ án ứng dụng","weight_percent":40,"description":"Một chức năng chạy được, có test và hồ sơ kỹ thuật ngắn gọn."},{"method":"Vấn đáp code","weight_percent":30,"description":"Trình bày luồng xử lý và trả lời câu hỏi về lựa chọn thiết kế."}]'::jsonb
  ), (
    'ma-210', 'Toán ứng dụng', 'MA 210',
    'Đại số tuyến tính và phương pháp giải bài toán', 45, 'sage',
    '/img/course-math.webp', 'Hệ phương trình tuyến tính được ghi trên giấy',
    '[{"title":"Vector và ma trận","summary":"Thực hiện phép toán ma trận và diễn giải ý nghĩa hình học của kết quả."},{"title":"Hệ phương trình tuyến tính","summary":"Mô hình hóa và giải hệ bằng phương pháp phù hợp với điều kiện bài toán."},{"title":"Lập luận và kiểm tra","summary":"Trình bày từng bước, kiểm tra giả thiết và đối chiếu đáp án bằng cách khác."}]'::jsonb,
    '["Giải và diễn giải được một hệ phương trình tuyến tính.","Liên hệ phép biến đổi ma trận với một mô hình ứng dụng.","Viết lời giải có cấu trúc và tự kiểm tra giả thiết."]'::jsonb,
    '[{"method":"Bài tập theo tuần","weight_percent":35,"description":"Bài giải cần thể hiện quá trình, không chỉ ghi đáp số."},{"method":"Kiểm tra khái niệm","weight_percent":25,"description":"Các câu hỏi ngắn về định nghĩa và cách diễn giải."},{"method":"Bài toán ứng dụng","weight_percent":40,"description":"Xây dựng một mô hình nhỏ và nêu giới hạn của kết quả."}]'::jsonb
  ), (
    'ec-102', 'Kinh tế vi mô', 'EC 102',
    'Lựa chọn, thị trường và các đánh đổi trong quyết định', 38, 'sand',
    '/img/course-econ.webp', 'Quầy rau quả trong một khu chợ có mái che',
    '[{"title":"Khan hiếm và động lực","summary":"Phân tích cách giới hạn nguồn lực và động lực ảnh hưởng tới lựa chọn."},{"title":"Cung, cầu và độ co giãn","summary":"Dùng mô hình đơn giản để giải thích biến động giá và lượng."},{"title":"Thị trường và chính sách","summary":"So sánh lựa chọn chính sách cùng các tác động dự kiến và ngoài dự kiến."}]'::jsonb,
    '["Áp dụng mô hình kinh tế cơ bản cho một tình huống giả định.","Diễn giải được ảnh hưởng của động lực và độ co giãn.","So sánh phương án và nêu rõ giả định đang sử dụng."]'::jsonb,
    '[{"method":"Phân tích tình huống","weight_percent":30,"description":"Bài viết ngắn áp dụng khái niệm vào tình huống minh họa."},{"method":"Đọc biểu đồ","weight_percent":30,"description":"Tính toán kèm giải thích kết quả bằng ngôn ngữ dễ hiểu."},{"method":"Bản đề xuất","weight_percent":40,"description":"Đưa ra đề xuất cân bằng và chỉ rõ điều còn chưa chắc chắn."}]'::jsonb
  ), (
    'bi-150', 'Sinh học đại cương', 'BI 150',
    'Tế bào, di truyền và phương pháp thực nghiệm', 29, 'navy',
    '/img/course-bio.webp', 'Ảnh hiển vi huỳnh quang của các tế bào được nhuộm màu',
    '[{"title":"Cấu trúc và hoạt động của tế bào","summary":"Liên hệ các cấu trúc chính với quá trình duy trì sự sống."},{"title":"Di truyền và biểu hiện thông tin","summary":"Theo dõi cách thông tin được lưu trữ, biểu hiện và truyền qua thế hệ."},{"title":"Thực nghiệm và bằng chứng","summary":"Đặt câu hỏi kiểm chứng được, ghi quan sát và đánh giá giới hạn dữ liệu."}]'::jsonb,
    '["Giải thích một quá trình sinh học ở nhiều cấp độ.","Dùng mô hình di truyền đơn giản và phân biệt dự đoán với quan sát.","Thiết kế khảo sát an toàn và đánh giá chất lượng bằng chứng."]'::jsonb,
    '[{"method":"Nhật ký thực hành","weight_percent":30,"description":"Ghi phương pháp, quan sát và suy ngẫm sau hoạt động hướng dẫn."},{"method":"Bài tập khái niệm","weight_percent":30,"description":"Sơ đồ và giải thích kết nối cơ chế với kết quả."},{"method":"Báo cáo khảo sát","weight_percent":40,"description":"Một khảo sát nhỏ có nêu rõ giới hạn của bằng chứng."}]'::jsonb
  ), (
    'hi-204', 'Lịch sử thế giới hiện đại', 'HI 204',
    'Nguồn tư liệu, bối cảnh và cách xây dựng lập luận lịch sử', 54, 'sage',
    '/img/course-hist.webp', 'Mái vòm đá và tháp của một công trình lịch sử',
    '[{"title":"Đánh giá nguồn tư liệu","summary":"Xem xét nguồn gốc, mục đích, góc nhìn và khoảng trống trước khi dùng làm bằng chứng."},{"title":"Bối cảnh, nguyên nhân và hệ quả","summary":"Phân biệt điều kiện nền với nguyên nhân trực tiếp trong một lời giải thích."},{"title":"Thay đổi và cách diễn giải","summary":"So sánh các cách nhìn và chỉ ra điều thay đổi, điều tiếp diễn."}]'::jsonb,
    '["Đánh giá được giá trị và giới hạn của một nguồn cho câu hỏi cụ thể.","Xây dựng lời giải thích dựa trên bằng chứng về nguyên nhân và hệ quả.","So sánh cách diễn giải mà không biến điều chưa chắc chắn thành sự thật tuyệt đối."]'::jsonb,
    '[{"method":"Phân tích tư liệu","weight_percent":35,"description":"Đánh giá ngắn các bộ tư liệu minh họa và giới hạn của chúng."},{"method":"Thảo luận nhóm","weight_percent":25,"description":"Chuẩn bị ý kiến và phản hồi tôn trọng cách đọc khác."},{"method":"Bài luận lập luận","weight_percent":40,"description":"Lập luận có cấu trúc, lý do minh bạch và thừa nhận điểm chưa chắc chắn."}]'::jsonb
  ), (
    'lt-101', 'Văn học và tư duy phản biện', 'LT 101',
    'Đọc gần, viết rõ và bảo vệ một cách diễn giải', 76, 'navy',
    '/img/course-lit.webp', 'Kệ gỗ chứa nhiều sách bìa cứng cũ',
    '[{"title":"Đọc gần và bằng chứng văn bản","summary":"Nhận ra mẫu ngôn ngữ và dùng chi tiết phù hợp để hỗ trợ cách hiểu."},{"title":"Thể loại, giọng kể và bối cảnh","summary":"Khám phá cách hình thức và điểm nhìn định hướng trải nghiệm đọc."},{"title":"Lập luận, viết nháp và chỉnh sửa","summary":"Phát triển một cách đọc có thể bảo vệ và chỉnh bài theo phản hồi."}]'::jsonb,
    '["Đưa ra nhận định và hỗ trợ bằng chi tiết văn bản phù hợp.","So sánh ảnh hưởng của thể loại và lựa chọn kể chuyện.","Chỉnh sửa bài phân tích dựa trên phản hồi có trọng tâm."]'::jsonb,
    '[{"method":"Ghi chú đọc","weight_percent":25,"description":"Ghi ngắn về mẫu ngôn ngữ, câu hỏi và cách hiểu có thể có."},{"method":"Thảo luận và phản tư","weight_percent":25,"description":"Thảo luận dựa trên bằng chứng rồi ghi lại điều đã thay đổi trong cách hiểu."},{"method":"Hồ sơ bài viết","weight_percent":50,"description":"Tập bài phân tích đã chỉnh sửa kèm lý do cho các thay đổi chính."}]'::jsonb
  );

-- Courses are served only through the backend. Browser-facing Supabase roles
-- do not receive table privileges, matching the boundary used by prior tables.
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON courses FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON courses FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
