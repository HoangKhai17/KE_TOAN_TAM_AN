-- Bình luận phiếu nội bộ: thêm cờ đã sửa (đồng bộ task_comments/CDR).
ALTER TABLE internal_assignment_comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE internal_assignment_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
