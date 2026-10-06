-- Thiết bị tin cậy cho chấm công mobile.
-- device_id do client sinh (lưu localStorage), gửi kèm mỗi lần chấm công.
-- status: pending (mới, chờ duyệt) | approved (admin đã duyệt) | revoked (thu hồi).
-- Khi bật "khóa thiết bị" (system_configs['attendance.device_lock_enabled']='1'),
-- chỉ thiết bị approved mới chấm công được.
CREATE TABLE IF NOT EXISTS trusted_devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(64) NOT NULL,
  label       VARCHAR(120),
  status      VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'revoked')),
  device_info VARCHAR(200),
  last_ip     VARCHAR(64),
  first_seen  TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user   ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_status ON trusted_devices(status);
