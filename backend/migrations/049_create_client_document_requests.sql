CREATE TABLE IF NOT EXISTS client_document_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              UUID REFERENCES tasks(id) ON DELETE SET NULL,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_name        VARCHAR(200) NOT NULL,
  description          TEXT,
  period_label         VARCHAR(20),
  deadline_date        DATE,
  status               client_doc_status NOT NULL DEFAULT 'pending',
  received_at          TIMESTAMP,
  received_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  reminder_sent_count  INTEGER NOT NULL DEFAULT 0,
  last_reminder_at     TIMESTAMP,
  reminded_email       VARCHAR(150),
  public_token         VARCHAR(64) UNIQUE,
  token_expires_at     TIMESTAMP,
  token_submitted_at   TIMESTAMP,
  token_submitted_data JSONB,
  notes                TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_company_id    ON client_document_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_cdr_task_id       ON client_document_requests(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cdr_status        ON client_document_requests(status);
CREATE INDEX IF NOT EXISTS idx_cdr_deadline_date ON client_document_requests(deadline_date) WHERE deadline_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cdr_public_token  ON client_document_requests(public_token) WHERE public_token IS NOT NULL;
