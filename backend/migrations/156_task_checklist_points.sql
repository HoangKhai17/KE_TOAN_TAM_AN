-- KPI v2 · Phase A4 — Điểm + cờ QUAN TRỌNG cho từng bước checklist của TASK.
-- Task định kỳ copy điểm/★ từ schedule_checklist_items; task tay copy từ template.
-- Mặc định 0 / false → không phá tiến độ hiện tại (Phase B mới dùng điểm để tính %).

ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS points       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN  NOT NULL DEFAULT FALSE;
