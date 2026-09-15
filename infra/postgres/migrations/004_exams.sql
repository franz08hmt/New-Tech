CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- An exam only means anything alongside its course, so it leaves with it.
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  topic VARCHAR(160) NOT NULL
    CONSTRAINT exams_topic_length_check CHECK (char_length(btrim(topic)) BETWEEN 3 AND 160),
  exam_date DATE NOT NULL,
  exam_time TIME NOT NULL,
  room VARCHAR(80) NOT NULL
    CONSTRAINT exams_room_length_check CHECK (char_length(btrim(room)) BETWEEN 1 AND 80),
  revision_note VARCHAR(500)
    CONSTRAINT exams_note_length_check CHECK (
      revision_note IS NULL OR char_length(btrim(revision_note)) BETWEEN 1 AND 500
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The list is always read in chronological order, and always joined to courses.
CREATE INDEX exams_schedule_idx ON exams (exam_date, exam_time);
CREATE INDEX exams_course_idx ON exams (course_id);

-- Illustrative data only: sample timetable entries for the demo workspace,
-- not a real examination schedule, real rooms, or real dates.
INSERT INTO exams (course_id, topic, exam_date, exam_time, room, revision_note)
SELECT c.id, v.topic, v.exam_date::date, v.exam_time::time, v.room, v.revision_note
FROM (
  VALUES
    ('cs-201', 'Kiểm tra giữa kỳ phần thuật toán', '2026-09-21', '09:00', 'Phòng A201',
     'Ôn lại độ phức tạp, cây nhị phân tìm kiếm và một lượt bài tập đệ quy.'),
    ('ec-102', 'Bài kiểm tra kinh tế vi mô', '2026-09-24', '13:30', 'Phòng B102',
     'Xem kỹ phần độ co giãn và cách đọc đồ thị cung cầu.'),
    ('lt-101', 'Thuyết trình bài luận', '2026-09-28', '10:00', 'Phòng C301',
     'Chuẩn bị dàn ý và chọn sẵn ba dẫn chứng từ văn bản.'),
    ('ma-210', 'Kiểm tra đại số tuyến tính', '2026-10-05', '07:30', 'Phòng A105',
     'Luyện giải hệ phương trình và phép biến đổi ma trận.'),
    ('bi-150', 'Bài kiểm tra chương tế bào', '2026-09-08', '14:00', 'Phòng D204',
     'Đã thi xong, giữ lại để đối chiếu khi ôn cuối kỳ.')
) AS v (slug, topic, exam_date, exam_time, room, revision_note)
JOIN courses c ON c.slug = v.slug;

-- Exams are served only through the backend, matching the boundary used by
-- every table before this one.
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exams FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON exams FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
