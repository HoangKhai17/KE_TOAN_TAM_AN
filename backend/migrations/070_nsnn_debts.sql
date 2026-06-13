-- Migration 070: company_nsnn_debts (Báo cáo theo dõi nợ NSNN)

CREATE TABLE company_nsnn_debts (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type VARCHAR(300)  NOT NULL,
  category      VARCHAR(300),
  debt_amount   NUMERIC(20,2),
  update_date   DATE,
  repeat_count  INTEGER,
  notes         TEXT,
  custom_fields JSONB         NOT NULL DEFAULT '{}',
  created_by    UUID          NOT NULL REFERENCES users(id),
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nsnn_company     ON company_nsnn_debts(company_id);
CREATE INDEX idx_nsnn_update_date ON company_nsnn_debts(update_date) WHERE update_date IS NOT NULL;
