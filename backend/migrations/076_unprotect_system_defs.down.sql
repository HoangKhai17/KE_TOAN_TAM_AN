-- Rollback 076: khóa lại (chống xóa) 3 def migrate.
UPDATE company_table_defs SET is_system = TRUE WHERE table_key IN ('hdld', 'csc', 'nsnn');
