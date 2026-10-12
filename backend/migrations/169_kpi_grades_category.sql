-- Tách xếp loại thành 2 nhánh độc lập:
--   'progress'       = theo tiến độ công việc (định kỳ + task khác + điểm đúng hạn)
--   'reward_penalty' = theo vi phạm quy chế thưởng/phạt (tính riêng, có mức thưởng riêng)
-- Mỗi nhánh có dải điểm + mức tiền riêng. Dòng cũ (đang gộp) mặc định về 'progress'.
ALTER TABLE kpi_grades ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'progress';
ALTER TABLE kpi_grades DROP CONSTRAINT IF EXISTS kpi_grades_category_chk;
ALTER TABLE kpi_grades ADD CONSTRAINT kpi_grades_category_chk
  CHECK (category IN ('progress', 'reward_penalty'));

CREATE INDEX IF NOT EXISTS idx_kpi_grades_category ON kpi_grades (category, sort_order);

-- Seed bộ xếp loại cho nhánh THƯỞNG/PHẠT (admin chỉnh lại dải điểm + tiền tuỳ nhu cầu).
-- Điểm = tổng điểm thưởng/phạt trong kỳ (âm = vi phạm, dương = được thưởng).
INSERT INTO kpi_grades (code, label, min_points, max_points, amount, sort_order, category)
SELECT * FROM (VALUES
  ('E', N'Vi phạm nhiều',   NULL::numeric, -16::numeric,  -800000::numeric, 0, 'reward_penalty'),
  ('D', N'Vi phạm',         -15::numeric,  -6::numeric,   -500000::numeric, 1, 'reward_penalty'),
  ('C', N'Đạt',             -5::numeric,   5::numeric,    0::numeric,       2, 'reward_penalty'),
  ('B', N'Tốt',             6::numeric,    10::numeric,   300000::numeric,  3, 'reward_penalty'),
  ('A', N'Rất tốt',         11::numeric,   20::numeric,   500000::numeric,  4, 'reward_penalty'),
  ('S', N'Gương mẫu',       21::numeric,   NULL::numeric, 800000::numeric,  5, 'reward_penalty')
) AS v(code, label, min_points, max_points, amount, sort_order, category)
WHERE NOT EXISTS (SELECT 1 FROM kpi_grades WHERE category = 'reward_penalty');
