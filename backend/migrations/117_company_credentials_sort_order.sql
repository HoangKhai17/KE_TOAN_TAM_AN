ALTER TABLE company_credentials
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY system_name, created_at, id) - 1 AS position
  FROM company_credentials
)
UPDATE company_credentials AS credential
SET sort_order = ranked.position
FROM ranked
WHERE credential.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_company_credentials_order
  ON company_credentials(company_id, sort_order, created_at);
