-- Cột tuỳ chỉnh dùng chung cho toàn bộ hợp đồng của một công ty
CREATE TABLE company_labor_contract_columns (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name   VARCHAR(100) NOT NULL,
  col_type   VARCHAR(10)  NOT NULL DEFAULT 'text'
               CHECK (col_type IN ('text', 'number', 'date')),
  position   INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_labor_col_per_company UNIQUE (company_id, col_name)
);

CREATE INDEX idx_clcol_company ON company_labor_contract_columns(company_id);

-- Chuyển custom_fields từ dạng array [] sang object {} (key = tên cột, value = giá trị)
UPDATE company_labor_contracts SET custom_fields = '{}'::jsonb;
