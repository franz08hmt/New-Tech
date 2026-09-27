CREATE TABLE study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A revision item belongs to a subject; without it there is nothing to revise.
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL
    CONSTRAINT study_plans_title_length_check CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  detail VARCHAR(500)
    CONSTRAINT study_plans_detail_length_check CHECK (
      detail IS NULL OR char_length(btrim(detail)) BETWEEN 1 AND 500
    ),
  due_date DATE,
  owner_name VARCHAR(80)
    CONSTRAINT study_plans_owner_length_check CHECK (
      owner_name IS NULL OR char_length(btrim(owner_name)) BETWEEN 1 AND 80
    ),
  -- Completion is a timestamp rather than a boolean: it answers "is it done"
  -- and "when did that happen" with one column and no second source of truth.
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX study_plans_course_idx ON study_plans (course_id);
CREATE INDEX study_plans_due_idx ON study_plans (due_date);

-- Illustrative data only: sample revision items for the demo workspace.
INSERT INTO study_plans (course_id, title, detail, due_date, owner_name, completed_at)
SELECT c.id, v.title, v.detail, v.due_date::date, v.owner_name, v.completed_at::timestamptz
FROM (
  VALUES
    ('cs-201', 'Ôn lại độ phức tạp thuật toán',
     'Làm lại năm bài so sánh O(n log n) với O(n²) và giải thích được vì sao.',
     '2026-09-19', 'Tài', NULL),
    ('cs-201', 'Dựng lại cây nhị phân tìm kiếm',
     'Tự cài đặt thêm, xoá, duyệt cây mà không nhìn tài liệu.',
     '2026-09-20', 'Tài', NULL),
    ('cs-201', 'Đọc lại ghi chú buổi thực hành',
     NULL, '2026-09-16', 'Tài', '2026-09-14T10:00:00Z'),
    ('ec-102', 'Vẽ lại đồ thị cung cầu',
     'Tập giải thích dịch chuyển đường cầu bằng lời, không dùng công thức.',
     '2026-09-22', 'Thắng', NULL),
    ('ec-102', 'Thuộc các loại độ co giãn',
     NULL, '2026-09-23', 'Thắng', NULL),
    ('lt-101', 'Chọn ba dẫn chứng cho bài luận',
     'Mỗi dẫn chứng kèm một câu giải thích vì sao nó hợp với luận điểm.',
     '2026-09-26', 'Tài', NULL),
    ('ma-210', 'Luyện giải hệ phương trình',
     'Làm mười bài, ghi rõ từng bước biến đổi.',
     '2026-10-01', NULL, NULL)
) AS v (slug, title, detail, due_date, owner_name, completed_at)
JOIN courses c ON c.slug = v.slug;

-- Study plans are served only through the backend, matching every table before.
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON study_plans FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON study_plans FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
