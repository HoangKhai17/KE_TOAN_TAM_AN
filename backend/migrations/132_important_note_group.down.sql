ALTER TABLE company_important_notes DROP COLUMN IF EXISTS note_group;
DELETE FROM enum_types WHERE type_key = 'important_note_group';  -- cascade xoá options
