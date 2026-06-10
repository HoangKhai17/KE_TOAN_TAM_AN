CREATE TABLE company_archive_docs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id         UUID         NOT NULL REFERENCES company_archive_years(id) ON DELETE CASCADE,
  document_type   VARCHAR(300) NOT NULL,
  detail          VARCHAR(500),
  months          JSONB        NOT NULL DEFAULT
    '{"1":"","2":"","3":"","4":"","5":"","6":"","7":"","8":"","9":"","10":"","11":"","12":""}'::jsonb,
  notes           TEXT,
  characteristics VARCHAR(300),
  position        INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cad_year     ON company_archive_docs(year_id);
CREATE INDEX idx_cad_position ON company_archive_docs(year_id, position);
