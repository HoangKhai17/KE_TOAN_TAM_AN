-- KPI v2 · Phase C — Bảng kết quả KPI THÁNG (snapshot khi CHỐT SỔ).
-- Tháng CHƯA chốt: tính LIVE (không có dòng ở đây). Tháng ĐÃ chốt: có dòng/NV (khóa số liệu).
-- volume_points = Σ điểm checklist item (leaf) đã tick trong tháng (gom theo người phụ trách task).
-- on_time = task đúng hạn / được giao (theo due_date trong tháng).

CREATE TABLE IF NOT EXISTS kpi_monthly_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year    INTEGER NOT NULL,
  period_month   INTEGER NOT NULL,
  volume_points  INTEGER NOT NULL DEFAULT 0,
  assigned_count INTEGER NOT NULL DEFAULT 0,
  on_time_count  INTEGER NOT NULL DEFAULT 0,
  on_time_pct    INTEGER,                       -- NULL = không có task đến hạn trong tháng
  breakdown      JSONB   NOT NULL DEFAULT '{}', -- { byCompany:[...], byType:[...] } — snapshot chi tiết
  status         VARCHAR(10) NOT NULL DEFAULT 'closed',
  closed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at      TIMESTAMP,
  computed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_kpi_monthly_period ON kpi_monthly_results(period_year, period_month);
