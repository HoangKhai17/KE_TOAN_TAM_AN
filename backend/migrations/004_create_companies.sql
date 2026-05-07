CREATE TABLE companies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(200) NOT NULL,
  tax_code           VARCHAR(20) UNIQUE,
  address            TEXT,
  business_type      business_type NOT NULL DEFAULT 'TNHH',
  industry           VARCHAR(150),
  legal_rep_name     VARCHAR(100),
  legal_rep_phone    VARCHAR(20),
  contact_name       VARCHAR(100),
  contact_phone      VARCHAR(20),
  contact_email      VARCHAR(150),
  bank_account       VARCHAR(30),
  bank_name          VARCHAR(150),
  service_start_date DATE,
  status             company_status NOT NULL DEFAULT 'active',
  notes              TEXT,
  assigned_staff_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_tax_code       ON companies(tax_code);
CREATE INDEX idx_companies_status         ON companies(status);
CREATE INDEX idx_companies_assigned_staff ON companies(assigned_staff_id);
CREATE INDEX idx_companies_fts            ON companies
  USING gin(to_tsvector('simple', name || ' ' || coalesce(tax_code, '')));
