ALTER TABLE enum_types  DROP COLUMN IF EXISTS has_groups;
ALTER TABLE enum_options DROP COLUMN IF EXISTS group_id;
DROP TABLE IF EXISTS enum_option_groups;
