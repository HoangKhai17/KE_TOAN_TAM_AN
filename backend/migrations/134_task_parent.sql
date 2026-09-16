-- Việc cha–con (chuỗi công việc liên đới): thêm parent_task_id để GOM NHÓM việc con
-- vào một việc cha. Đây CHỈ là quan hệ gom nhóm/hiển thị — mỗi task vẫn hoàn thành độc
-- lập theo checklist & ngày hết hạn của chính nó (không có cổng roll-up nào).
--   • Xoá cha → ON DELETE SET NULL: giữ con lại, chỉ gỡ liên kết (an toàn dữ liệu).
--   • Khoá "1 cấp" (việc con không có cháu) được enforce ở tầng service.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
