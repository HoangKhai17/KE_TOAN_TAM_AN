-- Thêm cột "Tên viết tắt" cho công ty/khách hàng
ALTER TABLE companies ADD COLUMN IF NOT EXISTS short_name VARCHAR(100);

-- Cập nhật full-text index để có thể tìm kiếm theo tên viết tắt
DROP INDEX IF EXISTS idx_companies_fts;
CREATE INDEX idx_companies_fts ON companies
  USING gin(to_tsvector('simple',
    name || ' ' || coalesce(short_name, '') || ' ' || coalesce(tax_code, '')));
