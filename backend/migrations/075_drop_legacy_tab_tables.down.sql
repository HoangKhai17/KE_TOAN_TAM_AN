-- Rollback 075: recreate table shells (CẤU TRÚC ONLY — dữ liệu & code module/component
-- KHÔNG được khôi phục; dữ liệu hiện nằm trong company_table_rows). Chỉ để migrate:down
-- không lỗi về mặt cấu trúc.

CREATE TABLE IF NOT EXISTS company_labor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name VARCHAR(255) NOT NULL,
  contract_type VARCHAR(255), contract_number VARCHAR(255),
  contract_date DATE, end_date DATE, notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '[]',
  tax_code VARCHAR(50),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_csc_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_party VARCHAR(255), party_name VARCHAR(255),
  contract_content VARCHAR(500), contract_number VARCHAR(255),
  contract_date DATE, end_date DATE, notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS company_csc_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name VARCHAR(200) NOT NULL, col_type VARCHAR(10) NOT NULL DEFAULT 'text',
  position INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_nsnn_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type VARCHAR(255) NOT NULL, category VARCHAR(255),
  debt_amount NUMERIC, update_date DATE, repeat_count INTEGER, notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS company_nsnn_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name VARCHAR(200) NOT NULL, col_type VARCHAR(10) NOT NULL DEFAULT 'text',
  position INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
