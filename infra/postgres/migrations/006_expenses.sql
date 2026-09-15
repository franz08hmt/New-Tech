CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- INTEGER, not BIGINT or NUMERIC, on purpose:
  --   * the dong has no minor unit, so there is nothing to store after a
  --     decimal point;
  --   * int4 tops out around 2.1 billion dong, far above any student expense,
  --     and the CHECK below keeps values well inside that;
  --   * the pg driver returns BIGINT as a STRING to avoid losing precision in
  --     JavaScript. Totals in the UI are plain additions, so a string would
  --     turn "380000" + "545000" into "380000545000" with nothing to catch it.
  amount INTEGER NOT NULL
    CONSTRAINT expenses_amount_check CHECK (amount > 0 AND amount <= 2000000000),
  description VARCHAR(160) NOT NULL
    CONSTRAINT expenses_description_length_check CHECK (
      char_length(btrim(description)) BETWEEN 2 AND 160
    ),
  spent_on DATE NOT NULL,
  category VARCHAR(20) NOT NULL
    CONSTRAINT expenses_category_check CHECK (
      category IN ('books', 'transport', 'food', 'supplies', 'fees', 'other')
    ),
  -- SET NULL rather than CASCADE, the opposite of exams: money that was spent
  -- stays spent even if the subject is removed from the workspace. Losing the
  -- link is right; losing the expense would be a lie about the total.
  course_id UUID REFERENCES courses (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expenses_spent_on_idx ON expenses (spent_on DESC);
CREATE INDEX expenses_course_idx ON expenses (course_id);

-- Illustrative data only: sample spending for the demo workspace, not real
-- financial records. Dates sit across the current day, week and month so the
-- period filter has something to show in each.
INSERT INTO expenses (amount, description, spent_on, category, course_id)
SELECT v.amount, v.description, v.spent_on::date, v.category, c.id
FROM (
  VALUES
    (35000, 'In tài liệu ôn thuật toán', '2026-09-15', 'books', 'cs-201'),
    (18000, 'Gửi xe buổi thực hành', '2026-09-15', 'transport', 'cs-201'),
    (120000, 'Mua sách bài tập đại số', '2026-09-14', 'books', 'ma-210'),
    (25000, 'Cà phê ngồi học nhóm', '2026-09-14', 'food', NULL),
    (60000, 'Photo đề cương kinh tế vi mô', '2026-09-12', 'books', 'ec-102'),
    (45000, 'Xe buýt tháng đi học', '2026-09-10', 'transport', NULL),
    (210000, 'Bộ dụng cụ thí nghiệm sinh học', '2026-09-09', 'supplies', 'bi-150'),
    (80000, 'Mua truyện cho bài phân tích', '2026-09-08', 'books', 'lt-101'),
    (150000, 'Lệ phí thi lại học phần', '2026-09-05', 'fees', 'ma-210'),
    (30000, 'In ảnh tư liệu lịch sử', '2026-09-03', 'supplies', 'hi-204'),
    (55000, 'Ăn trưa giữa hai ca học', '2026-09-02', 'food', NULL),
    (95000, 'Mua USB lưu bài tập', '2026-09-01', 'supplies', 'cs-201')
) AS v (amount, description, spent_on, category, slug)
LEFT JOIN courses c ON c.slug = v.slug;

-- Expenses are served only through the backend, matching every table before.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenses FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON expenses FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
