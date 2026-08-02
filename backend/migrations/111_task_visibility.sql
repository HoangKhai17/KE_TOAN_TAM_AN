-- Task visibility: 'company' (mặc định — nhân sự phụ trách công ty thấy được)
-- vs 'private' (chỉ admin + người được giao + người hỗ trợ thấy; ẩn với nhân sự
-- quản lý công ty). Dùng cho task cấp quản lý trao đổi trực tiếp với khách.
ALTER TABLE tasks
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'company'
  CHECK (visibility IN ('company', 'private'));

-- Truy vấn danh sách lọc theo visibility khi xét phạm vi nhân sự.
CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks(visibility);
