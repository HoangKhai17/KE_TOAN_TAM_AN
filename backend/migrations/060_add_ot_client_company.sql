-- Add client company reference to overtime requests
ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_or_client_company ON overtime_requests(client_company_id);
