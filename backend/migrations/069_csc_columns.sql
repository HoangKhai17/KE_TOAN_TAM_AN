-- Phase 21: Cột tùy chỉnh cho tab HĐ KH.NCC
CREATE TABLE company_csc_columns (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name   VARCHAR(200) NOT NULL,
  col_type   VARCHAR(10)  NOT NULL DEFAULT 'text'
             CHECK (col_type IN ('text', 'number', 'date')),
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csc_cols_company ON company_csc_columns(company_id);
