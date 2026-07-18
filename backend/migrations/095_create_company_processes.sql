-- Sơ đồ QUY TRÌNH LÀM VIỆC theo từng công ty.
-- Mô hình ĐỒ THỊ CÓ HƯỚNG (nút + cạnh) chứ không phải danh sách bước tuần tự,
-- vì quy trình thực tế có rẽ nhiều nhánh và có bước quay ngược về bước trước.

-- ① Sơ đồ quy trình — mỗi công ty có thể có nhiều sơ đồ (thuế, lương, BHXH…)
CREATE TABLE IF NOT EXISTS company_processes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  position    INTEGER,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ② Nút = một bước / điểm quyết định.
-- pos_x, pos_y là vị trí do người dùng kéo-thả trên canvas (React Flow).
CREATE TABLE IF NOT EXISTS company_process_nodes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES company_processes(id) ON DELETE CASCADE,
  code       TEXT,                                   -- nhãn ngắn: "B1", "B2"
  title      TEXT NOT NULL,
  node_type  TEXT NOT NULL DEFAULT 'step',           -- start | step | decision | end | document
  actor      TEXT,                                   -- KH / NV / Quản lý / CQT
  note       TEXT,
  pos_x      DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Cần cho khoá ngoại phức hợp ở bảng ③
  UNIQUE (process_id, id)
);

-- ③ Cạnh = mũi tên nối 2 nút. Cho phép nhiều nhánh ra từ một nút và cạnh quay ngược.
CREATE TABLE IF NOT EXISTS company_process_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id    UUID NOT NULL,
  from_node_id  UUID NOT NULL,
  to_node_id    UUID NOT NULL,
  label         TEXT,                                -- "Hợp lệ" / "Thiếu chứng từ"
  edge_kind     TEXT NOT NULL DEFAULT 'normal',      -- normal | back (vẽ nét đứt cho dễ đọc)
  source_handle TEXT,                                -- chừa sẵn cho nút nhiều cổng nối
  target_handle TEXT,
  position      INTEGER,                             -- thứ tự các nhánh ra từ cùng 1 nút
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  -- KHOÁ NGOẠI PHỨC HỢP: chặn ngay ở tầng DB việc một cạnh nối sang nút
  -- thuộc quy trình KHÁC (lỗi này nếu để lọt sẽ rất khó lần ra).
  FOREIGN KEY (process_id, from_node_id)
    REFERENCES company_process_nodes(process_id, id) ON DELETE CASCADE,
  FOREIGN KEY (process_id, to_node_id)
    REFERENCES company_process_nodes(process_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cp_company  ON company_processes(company_id);
CREATE INDEX IF NOT EXISTS idx_cpn_process ON company_process_nodes(process_id);
CREATE INDEX IF NOT EXISTS idx_cpe_process ON company_process_edges(process_id);
CREATE INDEX IF NOT EXISTS idx_cpe_from    ON company_process_edges(from_node_id);
