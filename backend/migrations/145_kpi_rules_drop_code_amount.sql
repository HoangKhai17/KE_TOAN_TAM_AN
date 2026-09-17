-- Gỡ bỏ 2 cột không dùng khỏi bảng quy tắc KPI:
--   • code           — mã quy tắc (bỏ theo yêu cầu, không còn nhập)
--   • default_amount  — tiền gợi ý (bỏ theo yêu cầu, không còn nhập)
-- An toàn: IF EXISTS để chạy lại không lỗi.
ALTER TABLE kpi_rules DROP COLUMN IF EXISTS code;
ALTER TABLE kpi_rules DROP COLUMN IF EXISTS default_amount;
