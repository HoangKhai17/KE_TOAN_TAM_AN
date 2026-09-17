DROP INDEX IF EXISTS idx_ctd_section;
ALTER TABLE company_table_defs DROP CONSTRAINT IF EXISTS company_table_defs_section_check;
ALTER TABLE company_table_defs DROP COLUMN IF EXISTS section;
