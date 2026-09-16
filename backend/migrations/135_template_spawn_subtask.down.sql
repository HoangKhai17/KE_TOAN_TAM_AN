ALTER TABLE task_type_checklist_templates
  DROP COLUMN IF EXISTS spawn_as_subtask,
  DROP COLUMN IF EXISTS due_offset_days,
  DROP COLUMN IF EXISTS depends_on_prev;
