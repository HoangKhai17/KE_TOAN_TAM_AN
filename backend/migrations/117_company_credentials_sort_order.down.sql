DROP INDEX IF EXISTS idx_company_credentials_order;
ALTER TABLE company_credentials DROP COLUMN IF EXISTS sort_order;
