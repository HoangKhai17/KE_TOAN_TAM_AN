DROP INDEX IF EXISTS idx_al_user_device;
DROP INDEX IF EXISTS idx_al_held;
ALTER TABLE attendance_logs DROP COLUMN IF EXISTS device_id;
ALTER TABLE attendance_logs DROP COLUMN IF EXISTS held;
