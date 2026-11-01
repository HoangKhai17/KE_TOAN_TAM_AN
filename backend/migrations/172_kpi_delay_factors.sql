-- Hệ số LŨY TUYẾN theo số tháng hoàn thành TRỄ (áp cho điểm task định kỳ).
-- Điểm thực nhận = điểm gốc × factor_pct/100. Trễ càng nhiều hệ số càng giảm (có thể ÂM = phạt).
-- Admin cấu hình được (thêm/sửa/xoá dòng) trong tab Quy đổi xếp loại.
CREATE TABLE IF NOT EXISTS kpi_delay_factors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  months_late INTEGER NOT NULL,          -- số tháng trễ (0 = xong đúng tháng hạn)
  factor_pct  INTEGER NOT NULL,          -- hệ số %: 100 / 50 / 0 / -25 / ... (âm = trừ điểm)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT kpi_delay_factors_months_uq UNIQUE (months_late)
);

-- Seed mặc định: 0→100%, 1→50%, 2→0%, 3→-25%, 4→-50%, 5→-75%, 6→-100%.
INSERT INTO kpi_delay_factors (months_late, factor_pct, sort_order)
VALUES (0,100,0),(1,50,1),(2,0,2),(3,-25,3),(4,-50,4),(5,-75,5),(6,-100,6)
ON CONFLICT (months_late) DO NOTHING;
