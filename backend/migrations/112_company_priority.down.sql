DROP INDEX IF EXISTS idx_companies_is_priority;
ALTER TABLE companies DROP COLUMN IF EXISTS is_priority;
