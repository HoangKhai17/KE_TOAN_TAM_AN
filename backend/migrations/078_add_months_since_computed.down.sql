-- Rollback 078: bỏ 'months_since' (fail nếu đang có cột dùng nó — cần dọn trước).
ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_computed_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_computed_type_check
  CHECK (computed_type IN ('days_until', 'days_since', 'status_threshold'));
