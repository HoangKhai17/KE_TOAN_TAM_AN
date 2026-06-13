-- Migration 066: Archive custom columns + extra_fields per doc

ALTER TABLE company_archive_docs
  ADD COLUMN extra_fields JSONB NOT NULL DEFAULT '{}';

CREATE TABLE company_archive_columns (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name   VARCHAR(200) NOT NULL,
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_arch_col UNIQUE (company_id, col_name)
);

CREATE INDEX idx_cac_company ON company_archive_columns(company_id);
