INSERT INTO system_configs (key, value, description) VALUES
  ('deadline_warning_days',   '3',     'Số ngày trước deadline hiển thị cảnh báo vàng'),
  ('escalation_overdue_days', '2',     'Số ngày quá hạn trước khi tự động escalate'),
  ('escalation_on_hold_days', '5',     'Số ngày tạm hoãn trước khi gửi nhắc nhở'),
  ('morning_email_time',      '07:00', 'Giờ gửi email tổng hợp sáng cho quản lý'),
  ('max_login_attempts',      '5',     'Số lần sai mật khẩu tối đa trước khi khoá tài khoản'),
  ('lock_duration_minutes',   '30',    'Thời gian khoá tài khoản (phút)')
ON CONFLICT (key) DO NOTHING;
