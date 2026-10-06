-- Chấm công "treo" (chờ duyệt thiết bị): khi bật khóa thiết bị và máy chưa được duyệt,
-- lần chấm vẫn được ghi (giữ đúng giờ bấm thật) nhưng held=true → KHÔNG tính vào công.
-- Khi admin duyệt thiết bị → các log held của đúng (user, device) chuyển held=false và tính lại công.
-- device_id: id thiết bị client gửi lúc chấm, để biết log nào thuộc thiết bị nào khi duyệt.
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS held      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_al_held ON attendance_logs(held) WHERE held = true;
CREATE INDEX IF NOT EXISTS idx_al_user_device ON attendance_logs(user_id, device_id);
