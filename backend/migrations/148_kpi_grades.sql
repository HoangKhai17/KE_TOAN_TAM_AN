-- Quy đổi xếp loại: dải điểm → xếp loại (E→S) + mức thưởng/phạt (tiền) mỗi loại.
CREATE TABLE IF NOT EXISTS kpi_grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20)  NOT NULL,                 -- E, D, C, B, A, S…
  label       VARCHAR(200) NOT NULL,                 -- nhãn (VD: Nhân viên Ưu tú)
  min_points  NUMERIC,                               -- null = không giới hạn dưới
  max_points  NUMERIC,                               -- null = không giới hạn trên
  amount      NUMERIC      NOT NULL DEFAULT 0,        -- tiền thưởng/phạt (âm = phạt)
  sort_order  INTEGER      NOT NULL DEFAULT 0,        -- 0 = thấp nhất → cao dần
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_grades_sort ON kpi_grades (sort_order);

-- Seed mẫu (admin chỉnh lại dải điểm + tiền tuỳ nhu cầu).
INSERT INTO kpi_grades (code, label, min_points, max_points, amount, sort_order)
SELECT * FROM (VALUES
  ('E', N'Cần cải thiện',     NULL::numeric, -16::numeric, 0::numeric, 0),
  ('D', N'Dưới trung bình',   -15::numeric,  -6::numeric,  0::numeric, 1),
  ('C', N'Bình thường',       -5::numeric,   5::numeric,   0::numeric, 2),
  ('B', N'Khá',               6::numeric,    10::numeric,  0::numeric, 3),
  ('A', N'Tốt',               11::numeric,   20::numeric,  0::numeric, 4),
  ('S', N'Nhân viên Ưu tú',   21::numeric,   NULL::numeric, 0::numeric, 5)
) AS v(code, label, min_points, max_points, amount, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM kpi_grades);
