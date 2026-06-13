-- Migration 071: company_nsnn_columns (Cột tùy chỉnh tab Nợ NSNN)

CREATE TABLE company_nsnn_columns (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name   VARCHAR(200) NOT NULL,
  col_type   VARCHAR(10)  NOT NULL DEFAULT 'text'
             CHECK (col_type IN ('text', 'number', 'date')),
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nsnn_cols_company ON company_nsnn_columns(company_id);
