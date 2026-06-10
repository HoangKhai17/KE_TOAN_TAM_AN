CREATE TABLE company_archive_years (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year       INT       NOT NULL CHECK (year >= 2000 AND year <= 2100),
  notes      TEXT,
  created_by UUID      REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_archive_year UNIQUE (company_id, year)
);

CREATE INDEX idx_cay_company ON company_archive_years(company_id);
