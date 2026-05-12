CREATE TABLE company_notes (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content     TEXT     NOT NULL,
  is_pinned   BOOLEAN  NOT NULL DEFAULT FALSE,
  created_by  UUID     REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX company_notes_company_id_idx ON company_notes (company_id, created_at DESC);
