-- Rollback 077: recreate table shells (CẤU TRÚC ONLY — dữ liệu archive + code module/
-- component KHÔNG khôi phục). Chỉ để migrate:down không lỗi về cấu trúc.
CREATE TABLE IF NOT EXISTS company_archive_years (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  notes      TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_archive_year UNIQUE (company_id, year)
);
CREATE TABLE IF NOT EXISTS company_archive_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id         UUID NOT NULL REFERENCES company_archive_years(id) ON DELETE CASCADE,
  document_type   VARCHAR(300) NOT NULL,
  detail          VARCHAR(500),
  months          JSONB NOT NULL DEFAULT '{"1":"","2":"","3":"","4":"","5":"","6":"","7":"","8":"","9":"","10":"","11":"","12":""}',
  notes           TEXT,
  characteristics VARCHAR(300),
  position        INTEGER NOT NULL DEFAULT 0,
  extra_fields    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
