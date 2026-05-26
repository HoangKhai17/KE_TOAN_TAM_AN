CREATE TABLE internal_doc_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
  sort_order INT          NOT NULL DEFAULT 0,
  created_by UUID         NOT NULL REFERENCES users(id),
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE internal_doc_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        REFERENCES internal_doc_categories(id) ON DELETE SET NULL,
  title       VARCHAR(200) NOT NULL,
  url         TEXT         NOT NULL,
  description TEXT,
  created_by  UUID         NOT NULL REFERENCES users(id),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idl_category ON internal_doc_links(category_id);
CREATE INDEX IF NOT EXISTS idx_idl_created  ON internal_doc_links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idl_creator  ON internal_doc_links(created_by);
CREATE INDEX IF NOT EXISTS idx_idc_sort     ON internal_doc_categories(sort_order, created_at);
