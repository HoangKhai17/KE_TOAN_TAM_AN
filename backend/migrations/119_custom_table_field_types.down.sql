-- Đảo ngược 119. LƯU Ý: nếu đã có cột dùng kiểu mới thì phải xoá/đổi trước khi hạ.
DROP INDEX IF EXISTS idx_attachments_module_entity_field;
ALTER TABLE attachments DROP COLUMN IF EXISTS field_key;

ALTER TABLE company_table_company_columns DROP CONSTRAINT IF EXISTS company_table_company_columns_data_type_check;
ALTER TABLE company_table_company_columns ADD CONSTRAINT company_table_company_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select'));

ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_data_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select','computed'));
