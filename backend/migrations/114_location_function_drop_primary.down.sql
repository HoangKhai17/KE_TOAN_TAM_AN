-- Khôi phục cột is_primary; bỏ location_function + enum.
ALTER TABLE company_locations
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  DROP COLUMN IF EXISTS location_function;

DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'location_function');
DELETE FROM enum_types WHERE type_key = 'location_function';
