CREATE TABLE payroll_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  base_salary       NUMERIC(15,0) NOT NULL DEFAULT 0,
  allowances        NUMERIC(15,0) NOT NULL DEFAULT 0,
  bonus             NUMERIC(15,0) NOT NULL DEFAULT 0,
  gross_income      NUMERIC(15,0) GENERATED ALWAYS AS (base_salary + allowances + bonus) STORED,
  bhxh_employee     NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhyt_employee     NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhtn_employee     NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhxh_employer     NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhyt_employer     NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhtn_employer     NUMERIC(15,0) NOT NULL DEFAULT 0,
  pit_deduction     NUMERIC(15,0) NOT NULL DEFAULT 0,
  other_deductions  NUMERIC(15,0) NOT NULL DEFAULT 0,
  net_salary        NUMERIC(15,0) GENERATED ALWAYS AS (
                      base_salary + allowances + bonus
                      - bhxh_employee - bhyt_employee - bhtn_employee
                      - pit_deduction - other_deductions
                    ) STORED,
  components        JSONB,
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (payroll_period_id, user_id)
);

CREATE INDEX idx_pr_period ON payroll_records(payroll_period_id);
CREATE INDEX idx_pr_user   ON payroll_records(user_id);
