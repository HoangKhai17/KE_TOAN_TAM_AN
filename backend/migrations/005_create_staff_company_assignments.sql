CREATE TABLE staff_company_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id),
  start_date  DATE NOT NULL,
  end_date    DATE,
  notes       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT no_overlap CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_sca_company ON staff_company_assignments(company_id);
CREATE INDEX idx_sca_staff   ON staff_company_assignments(staff_id);
CREATE INDEX idx_sca_current ON staff_company_assignments(company_id) WHERE end_date IS NULL;
