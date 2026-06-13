-- Phase 21: Theo dõi HĐ Khách hàng / Nhà cung cấp (HĐ KH.NCC)
CREATE TABLE company_csc_contracts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_party   VARCHAR(100),
  party_name       VARCHAR(300) NOT NULL,
  contract_content VARCHAR(500),
  contract_number  VARCHAR(100),
  contract_date    DATE,
  end_date         DATE,
  notes            TEXT,
  custom_fields    JSONB        NOT NULL DEFAULT '{}',
  created_by       UUID         NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csc_company  ON company_csc_contracts(company_id);
CREATE INDEX idx_csc_end_date ON company_csc_contracts(end_date) WHERE end_date IS NOT NULL;
