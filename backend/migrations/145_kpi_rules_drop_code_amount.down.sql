-- Khôi phục 2 cột đã gỡ (dữ liệu cũ không lấy lại được — chỉ dựng lại cấu trúc).
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS code           VARCHAR(40) UNIQUE;
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS default_amount NUMERIC;
