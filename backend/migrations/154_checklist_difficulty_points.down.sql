ALTER TABLE task_type_checklist_templates
  DROP COLUMN IF EXISTS is_important,
  DROP COLUMN IF EXISTS points,
  DROP COLUMN IF EXISTS difficulty;

DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'checklist_difficulty');
DELETE FROM enum_types WHERE type_key = 'checklist_difficulty';
