-- Tối ưu truy vấn Tổng hợp (lọc kỳ + status='approved', gộp theo NV/quy tắc/loại).
CREATE INDEX IF NOT EXISTS idx_srp_period_status
  ON staff_reward_penalty (period_year, period_month, status);
