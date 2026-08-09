-- Migration 119: mở rộng kiểu cột Bảng tùy chỉnh — thêm 'link', 'file', 'formula'
-- + thêm attachments.field_key để 1 dòng có nhiều CỘT file (phân biệt file thuộc cột nào).
-- Tất cả ADDITIVE — không phá dữ liệu/kiểu cũ.

-- Cột GLOBAL: text/number/date/select/computed + link/file/formula
ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_data_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select','computed','link','file','formula'));

-- Cột RIÊNG theo công ty: KHÔNG có formula (bảng này không có cột computed_config)
ALTER TABLE company_table_company_columns DROP CONSTRAINT IF EXISTS company_table_company_columns_data_type_check;
ALTER TABLE company_table_company_columns ADD CONSTRAINT company_table_company_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select','link','file'));

-- Phân biệt file theo CỘT trong cùng một dòng (entity). NULL cho 4 module cũ → không ảnh hưởng.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS field_key TEXT;
CREATE INDEX IF NOT EXISTS idx_attachments_module_entity_field
  ON attachments (module, entity_id, field_key);
