-- Migration 120: "Bảng con" cho Bảng tùy chỉnh.
-- 1 def có thể là CON của def khác → hiển thị dạng sub-tab dưới def cha.
-- Bảng con vẫn là 1 def bình thường (cột + dòng riêng); CHỈ khác: ẩn khỏi tab cấp cao.
-- ON DELETE CASCADE: xoá def cha → tự xoá các def con (kéo theo cột + dòng của con).
ALTER TABLE company_table_defs
  ADD COLUMN IF NOT EXISTS parent_def_id UUID REFERENCES company_table_defs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ctd_parent ON company_table_defs (parent_def_id, sort_order);
