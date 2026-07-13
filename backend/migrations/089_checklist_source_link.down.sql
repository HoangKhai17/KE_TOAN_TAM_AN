DROP INDEX IF EXISTS idx_task_checklist_items_source;
ALTER TABLE task_checklist_items
  DROP COLUMN IF EXISTS source_step_id,
  DROP COLUMN IF EXISTS source_parent_id;
