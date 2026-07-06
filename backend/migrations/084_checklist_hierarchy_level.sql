-- Checklist 2 tầng: thêm cột level (0 = mục chính, 1 = mục phụ).
-- Thứ tự hiển thị vẫn theo step_order (phẳng); mục phụ (level 1) thuộc mục chính (level 0) gần nhất phía trên.
-- Dữ liệu cũ mặc định level = 0 (thành mục chính độc lập) → không mất dữ liệu, báo cáo cũ không vỡ.
ALTER TABLE task_type_checklist_templates ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE task_checklist_items          ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 0;
