-- Người HỖ TRỢ cho task truyền thống (khác với owner = tasks.assigned_to).
-- Owner vẫn là người CHỊU TRÁCH NHIỆM (báo cáo/KPI/nhắc hạn tính theo owner).
-- Collaborator chỉ mở rộng lớp "thấy & làm" — không đụng vào lớp trách nhiệm.
CREATE TABLE IF NOT EXISTS task_collaborators (
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

-- Tra nhanh "những task mà user X đang hỗ trợ" (scope danh sách, dashboard).
CREATE INDEX IF NOT EXISTS idx_task_collab_user ON task_collaborators(user_id);
