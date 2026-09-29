-- KPI v2 · Phase D — Bảng MỐC quy đổi % ĐÚNG HẠN → điểm KPI (để cộng vào điểm xếp loại).
-- Điểm xếp loại cuối = điểm KPI (từ % đúng hạn theo bảng này) + net thưởng/phạt → dò kpi_grades.
-- match: on_time_pct nằm trong [min_pct, max_pct] (bao gồm 2 đầu; NULL = không giới hạn).

CREATE TABLE IF NOT EXISTS kpi_ontime_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_pct     INTEGER,                          -- NULL = không giới hạn dưới
  max_pct     INTEGER,                          -- NULL = không giới hạn trên
  points      NUMERIC NOT NULL DEFAULT 0,       -- điểm cộng (âm = trừ) khi rơi vào mốc
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_ontime_tiers_sort ON kpi_ontime_tiers(sort_order);

-- Seed mẫu (admin chỉnh lại). Mốc theo % đúng hạn.
INSERT INTO kpi_ontime_tiers (min_pct, max_pct, points, sort_order)
SELECT * FROM (VALUES
  (NULL::int, 49::int,   -10::numeric, 0),
  (50::int,   69::int,    -5::numeric, 1),
  (70::int,   79::int,     0::numeric, 2),
  (80::int,   89::int,     5::numeric, 3),
  (90::int,   NULL::int,  10::numeric, 4)
) AS v(min_pct, max_pct, points, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM kpi_ontime_tiers);
