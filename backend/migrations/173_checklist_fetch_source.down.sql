ALTER TABLE task_type_checklist_templates DROP COLUMN IF EXISTS fetch_source;
ALTER TABLE task_type_subtask_steps       DROP COLUMN IF EXISTS fetch_source;
ALTER TABLE schedule_checklist_items      DROP COLUMN IF EXISTS fetch_source;
ALTER TABLE schedule_subtask_items        DROP COLUMN IF EXISTS fetch_source;
ALTER TABLE task_checklist_items          DROP COLUMN IF EXISTS fetch_source;

DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'checklist_fetch_source');
DELETE FROM enum_types WHERE type_key = 'checklist_fetch_source';
