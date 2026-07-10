-- Cho phép cấu hình giờ chạy 2 job của "Cảnh báo deadline" (giờ Việt Nam, HH:MM).
-- Trước đây hardcode: nhắc deadline 07:30, quét quá hạn 08:00.
INSERT INTO system_configs (key, value, description)
VALUES
  ('deadline_reminder_time', '07:30',
   'Giờ gửi email nhắc trước deadline (giờ VN, HH:MM)'),
  ('escalation_run_time',    '08:00',
   'Giờ quét quá hạn: chuyển trạng thái sang needs_revision + gửi email escalation (giờ VN, HH:MM)')
ON CONFLICT (key) DO NOTHING;
