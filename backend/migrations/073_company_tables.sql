-- Migration 073: Generic Company Tables (bảng báo cáo tùy biến do admin tạo)
-- Xem thiết kế: docs/019_GENERIC_COMPANY_TABLES.md

-- ── Định nghĩa TAB / loại bảng (GLOBAL) ───────────────────────────────────────
CREATE TABLE company_table_defs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_key    TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  description  TEXT,
  icon         TEXT,
  sort_order   INT     NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  allow_company_columns BOOLEAN NOT NULL DEFAULT FALSE,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,  -- def migrate từ tab cũ (khóa xóa)
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Cột của bảng (GLOBAL — đồng bộ mọi company) ───────────────────────────────
CREATE TABLE company_table_columns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id       UUID NOT NULL REFERENCES company_table_defs(id) ON DELETE CASCADE,
  col_key      TEXT NOT NULL,
  label        TEXT NOT NULL,
  data_type    TEXT NOT NULL DEFAULT 'text'
               CHECK (data_type IN ('text','number','date','select','computed')),
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  options      JSONB,
  sort_order   INT NOT NULL DEFAULT 0,
  width        INT,
  computed_type   TEXT
                  CHECK (computed_type IN ('days_until','days_since','status_threshold')),
  computed_config JSONB,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (def_id, col_key)
);
CREATE INDEX idx_ctc_def ON company_table_columns(def_id, sort_order);

-- ── Cột riêng theo từng company (hybrid, Pha 3) ───────────────────────────────
CREATE TABLE company_table_company_columns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id       UUID NOT NULL REFERENCES company_table_defs(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_key      TEXT NOT NULL,
  label        TEXT NOT NULL,
  data_type    TEXT NOT NULL DEFAULT 'text'
               CHECK (data_type IN ('text','number','date','select')),
  options      JSONB,
  sort_order   INT NOT NULL DEFAULT 0,
  width        INT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (def_id, company_id, col_key)
);
CREATE INDEX idx_ctcc_def_company ON company_table_company_columns(def_id, company_id, sort_order);

-- ── Dữ liệu dòng (PER-COMPANY) ────────────────────────────────────────────────
CREATE TABLE company_table_rows (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id     UUID NOT NULL REFERENCES company_table_defs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',
  position   INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ctr_def_company ON company_table_rows(def_id, company_id, position);
