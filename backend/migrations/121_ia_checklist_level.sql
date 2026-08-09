-- Migration 121: checklist phiếu giao việc nội bộ hỗ trợ phân cấp cha-con (như task_checklist_items).
-- level 0 = mục chính, 1 = mục phụ. ADDITIVE — dữ liệu cũ mặc định level 0.
ALTER TABLE ia_checklist_items ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 0;
