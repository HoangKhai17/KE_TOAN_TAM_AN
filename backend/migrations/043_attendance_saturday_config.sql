-- Insert default Saturday config: empty value = Saturday is day off
INSERT INTO system_configs (key, value, description)
VALUES (
  'attendance.saturday_shift_id',
  '',
  'UUID của ca làm việc áp dụng cho Thứ 7. Để trống = Thứ 7 là ngày nghỉ. Nhập UUID của ca = Thứ 7 là ngày làm việc theo ca đó.'
)
ON CONFLICT (key) DO NOTHING;
