CREATE TABLE payroll_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year  SMALLINT NOT NULL CHECK (period_year >= 2020),
  period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       payroll_status NOT NULL DEFAULT 'draft',
  notes        TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (period_year, period_month),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_pp_year_month ON payroll_periods(period_year, period_month);
CREATE INDEX idx_pp_status     ON payroll_periods(status);
