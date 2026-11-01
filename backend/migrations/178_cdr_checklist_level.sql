-- Checklist Yêu cầu KH: thêm cấp cha–con (0 = mục chính, 1 = mục phụ) như Tasks.
ALTER TABLE client_request_checklist_items ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
