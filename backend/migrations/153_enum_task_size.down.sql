DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'task_size');
DELETE FROM enum_types WHERE type_key = 'task_size';
