-- KPI v2 · Phase A2 — Checklist RIÊNG của từng Lịch định kỳ (per công ty).
-- Seed từ checklist mẫu của loại CV khi tạo lịch, rồi cho SỬA tự do (thêm/bớt/sửa + độ khó/điểm/★).
-- Thay thế cơ chế excluded_step_ids (chỉ ẩn/hiện). excluded_step_ids giữ lại tạm cho tương thích ngược.

CREATE TABLE IF NOT EXISTS schedule_checklist_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id              UUID NOT NULL REFERENCES customer_task_schedules(id) ON DELETE CASCADE,
  step_order               INTEGER NOT NULL,
  step_text                TEXT NOT NULL,
  level                    SMALLINT NOT NULL DEFAULT 0,          -- 0 = mục chính, 1 = mục phụ
  difficulty               VARCHAR(20) NOT NULL DEFAULT 'trung_binh',
  points                   SMALLINT NOT NULL DEFAULT 4,
  is_important             BOOLEAN NOT NULL DEFAULT FALSE,
  source_template_step_id  UUID REFERENCES task_type_checklist_templates(id) ON DELETE SET NULL,  -- NULL = item tự thêm
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_sched_checklist_schedule ON schedule_checklist_items(schedule_id);

-- Backfill: seed checklist cho các lịch HIỆN CÓ = checklist mẫu của loại CV TRỪ các bước đã loại
-- (excluded_step_ids). Chỉ seed lịch chưa có checklist (idempotent). Mang theo độ khó/điểm/★ của mẫu.
INSERT INTO schedule_checklist_items
  (schedule_id, step_order, step_text, level, difficulty, points, is_important, source_template_step_id)
SELECT s.id,
       ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY t.step_order),
       t.step_text, t.level, t.difficulty, t.points, t.is_important, t.id
FROM customer_task_schedules s
JOIN task_type_checklist_templates t ON t.task_type_id = s.task_type_id
WHERE NOT (s.excluded_step_ids ? t.id::text)
  AND NOT EXISTS (SELECT 1 FROM schedule_checklist_items sci WHERE sci.schedule_id = s.id);
