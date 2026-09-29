ALTER TABLE task_checklist_items
  DROP COLUMN IF EXISTS is_important,
  DROP COLUMN IF EXISTS points;
