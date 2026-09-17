-- Phân loại bảng cột-động (company_table_defs) theo NƠI HIỂN THỊ, dùng chung engine:
--   'data'           = tab "Bảng dữ liệu" (hiện có, mặc định)
--   'important_note' = tab "Điều cần lưu ý" (Hồ sơ) — sẽ dùng ở các giai đoạn sau
-- Nhờ cột này, hai nơi tách hẳn: listDefs lọc theo section nên def của bên này KHÔNG lọt sang bên kia.
ALTER TABLE company_table_defs ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'data';

ALTER TABLE company_table_defs DROP CONSTRAINT IF EXISTS company_table_defs_section_check;
ALTER TABLE company_table_defs ADD CONSTRAINT company_table_defs_section_check
  CHECK (section IN ('data', 'important_note'));

CREATE INDEX IF NOT EXISTS idx_ctd_section ON company_table_defs (section, sort_order);
