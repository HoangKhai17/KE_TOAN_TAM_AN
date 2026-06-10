CREATE TABLE company_labor_contracts (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  employee_name    VARCHAR(200) NOT NULL,
  contract_type    VARCHAR(150),
  contract_number  VARCHAR(100),
  contract_date    DATE,
  end_date         DATE,

  notes            TEXT,
  custom_fields    JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clc_company  ON company_labor_contracts(company_id);
CREATE INDEX idx_clc_end_date ON company_labor_contracts(end_date) WHERE end_date IS NOT NULL;
