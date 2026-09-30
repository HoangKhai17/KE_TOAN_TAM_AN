DROP TABLE IF EXISTS schedule_subtask_items;
DROP TABLE IF EXISTS schedule_subtasks;
ALTER TABLE task_type_subtask_steps
  DROP COLUMN IF EXISTS is_important,
  DROP COLUMN IF EXISTS points,
  DROP COLUMN IF EXISTS difficulty;
