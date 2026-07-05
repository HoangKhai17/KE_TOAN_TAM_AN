-- Khôi phục full-text index về dạng cũ (name + tax_code)
DROP INDEX IF EXISTS idx_companies_fts;
CREATE INDEX idx_companies_fts ON companies
  USING gin(to_tsvector('simple', name || ' ' || coalesce(tax_code, '')));

ALTER TABLE companies DROP COLUMN IF EXISTS short_name;
