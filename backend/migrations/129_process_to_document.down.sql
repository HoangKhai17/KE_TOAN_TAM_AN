-- Rollback: dựng lại mô hình canvas (nút + cạnh) và bỏ cột content.
-- Lưu ý: dữ liệu tài liệu trong content sẽ MẤT khi rollback (không thể tái tạo nút/cạnh từ HTML).

-- ② Dựng lại 2 bảng canvas (copy nguyên trạng từ migration 095–098)
CREATE TABLE IF NOT EXISTS company_process_nodes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES company_processes(id) ON DELETE CASCADE,
  code       TEXT,
  title      TEXT NOT NULL,
  node_type  TEXT NOT NULL DEFAULT 'rectangle',
  actor      TEXT,
  note       TEXT,
  pos_x      DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y      DOUBLE PRECISION NOT NULL DEFAULT 0,
  width      DOUBLE PRECISION,
  height     DOUBLE PRECISION,
  style      JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (process_id, id)
);

CREATE TABLE IF NOT EXISTS company_process_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id    UUID NOT NULL,
  from_node_id  UUID NOT NULL,
  to_node_id    UUID NOT NULL,
  label         TEXT,
  edge_kind     TEXT NOT NULL DEFAULT 'arrow',
  edge_shape    TEXT NOT NULL DEFAULT 'curved',
  dashed        BOOLEAN NOT NULL DEFAULT FALSE,
  source_handle TEXT,
  target_handle TEXT,
  position      INTEGER,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (process_id, from_node_id)
    REFERENCES company_process_nodes(process_id, id) ON DELETE CASCADE,
  FOREIGN KEY (process_id, to_node_id)
    REFERENCES company_process_nodes(process_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cpn_process ON company_process_nodes(process_id);
CREATE INDEX IF NOT EXISTS idx_cpe_process ON company_process_edges(process_id);
CREATE INDEX IF NOT EXISTS idx_cpe_from    ON company_process_edges(from_node_id);

-- ① Bỏ cột content
ALTER TABLE company_processes DROP COLUMN IF EXISTS content;
