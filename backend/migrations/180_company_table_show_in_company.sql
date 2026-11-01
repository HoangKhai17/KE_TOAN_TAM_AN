-- Cờ ẩn/hiện 1 bảng tùy chỉnh trong tab "Bảng dữ liệu" của từng công ty.
-- FALSE = chỉ xem/quản lý ở Báo cáo quy trình (dữ liệu vẫn giữ nguyên, không xóa).
ALTER TABLE company_table_defs ADD COLUMN IF NOT EXISTS show_in_company BOOLEAN NOT NULL DEFAULT TRUE;
