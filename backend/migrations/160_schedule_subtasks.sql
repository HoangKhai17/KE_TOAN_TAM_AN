-- KPI v2 · VIỆC CON của LỊCH định kỳ (per công ty) — sửa được, mỗi việc con có checklist riêng có điểm.
-- 1) Thêm độ khó/điểm/★ cho bước checklist việc-con MẪU (để seed có ý nghĩa).
-- 2) Bảng schedule_subtasks: việc con của lịch (title + offset ngày).
-- 3) Bảng schedule_subtask_items: checklist RIÊNG của từng việc con (có điểm).
-- 4) Backfill: seed từ mẫu cho các lịch TỪ MẪU hiện có (lịch thủ công không có việc con mẫu).

-- (1) bước việc-con mẫu có điểm
ALTER TABLE task_type_subtask_steps
  ADD COLUMN IF NOT EXISTS difficulty   VARCHAR(20) NOT NULL DEFAULT 'trung_binh',
  ADD COLUMN IF NOT EXISTS points        SMALLINT   NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS is_important  BOOLEAN    NOT NULL DEFAULT FALSE;

-- (2) việc con của lịch
CREATE TABLE IF NOT EXISTS schedule_subtasks (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id                UUID NOT NULL REFERENCES customer_task_schedules(id) ON DELETE CASCADE,
  title                      VARCHAR(300) NOT NULL,
  start_offset_days          INTEGER NOT NULL DEFAULT 0,
  deadline_offset_days       INTEGER NOT NULL DEFAULT 0,
  sort_order                 INTEGER NOT NULL DEFAULT 0,
  source_template_subtask_id UUID REFERENCES task_type_subtask_templates(id) ON DELETE SET NULL,
  created_at                 TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sched_subtasks_schedule ON schedule_subtasks(schedule_id);

-- (3) checklist của việc con
CREATE TABLE IF NOT EXISTS schedule_subtask_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_subtask_id      UUID NOT NULL REFERENCES schedule_subtasks(id) ON DELETE CASCADE,
  step_order               INTEGER NOT NULL,
  step_text                TEXT NOT NULL,
  level                    SMALLINT NOT NULL DEFAULT 0,
  difficulty               VARCHAR(20) NOT NULL DEFAULT 'trung_binh',
  points                   SMALLINT NOT NULL DEFAULT 4,
  is_important             BOOLEAN NOT NULL DEFAULT FALSE,
  source_template_step_id  UUID REFERENCES task_type_subtask_steps(id) ON DELETE SET NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sched_subtask_items_sub ON schedule_subtask_items(schedule_subtask_id);

-- (4a) backfill việc con cho lịch TỪ MẪU (title IS NULL), chưa có việc con
INSERT INTO schedule_subtasks
  (schedule_id, title, start_offset_days, deadline_offset_days, sort_order, source_template_subtask_id)
SELECT s.id, st.title,
       COALESCE((s.subtask_offsets -> st.id::text ->> 'start')::int, 0),
       COALESCE((s.subtask_offsets -> st.id::text ->> 'deadline')::int, st.due_offset_days, 0),
       st.sort_order, st.id
FROM customer_task_schedules s
JOIN task_type_subtask_templates st ON st.task_type_id = s.task_type_id
WHERE s.title IS NULL
  AND NOT EXISTS (SELECT 1 FROM schedule_subtasks ss WHERE ss.schedule_id = s.id);

-- (4b) backfill checklist của việc con từ bước mẫu
INSERT INTO schedule_subtask_items
  (schedule_subtask_id, step_order, step_text, level, difficulty, points, is_important, source_template_step_id)
SELECT ss.id, step.step_order, step.step_text, step.level, step.difficulty, step.points, step.is_important, step.id
FROM schedule_subtasks ss
JOIN task_type_subtask_steps step ON step.subtask_template_id = ss.source_template_subtask_id
WHERE NOT EXISTS (SELECT 1 FROM schedule_subtask_items i WHERE i.schedule_subtask_id = ss.id);
