-- Migration 078: thêm computed_type 'months_since' (Số tháng chậm) cho generic tables.
ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_computed_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_computed_type_check
  CHECK (computed_type IN ('days_until', 'days_since', 'months_since', 'status_threshold'));
