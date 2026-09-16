-- Checklist của việc con định kỳ: hỗ trợ 2 cấp (mục chính / mục phụ) như checklist cha.
ALTER TABLE task_type_subtask_steps ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
