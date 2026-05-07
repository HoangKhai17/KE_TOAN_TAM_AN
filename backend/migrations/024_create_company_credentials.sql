CREATE TABLE company_credentials (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_name        VARCHAR(200) NOT NULL,
  system_url         TEXT,
  username           VARCHAR(200) NOT NULL,
  encrypted_password TEXT NOT NULL,
  iv                 VARCHAR(100) NOT NULL,
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by         UUID NOT NULL REFERENCES users(id),
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cc_company ON company_credentials(company_id);
CREATE INDEX idx_cc_active  ON company_credentials(company_id, is_active) WHERE is_active = TRUE;
