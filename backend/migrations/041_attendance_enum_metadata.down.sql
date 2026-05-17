-- Rollback: remove attendance enum metadata rows
-- (PostgreSQL ENUM types themselves remain — they belong to migration 035)

DELETE FROM enum_types WHERE type_key IN (
  'attendance_status',
  'leave_type',
  'request_status',
  'shift_type',
  'checkin_method',
  'attendance_log_type'
);
-- enum_options cascade-delete automatically via FK ON DELETE CASCADE
