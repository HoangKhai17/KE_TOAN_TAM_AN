-- Add system-wide default shift config.
-- Value is seeded from the existing 'Ca Hành Chính' shift if it exists.
INSERT INTO system_configs (key, value, description)
SELECT
  'attendance.default_shift_id',
  id::text,
  'UUID của ca làm việc mặc định cho ngày thường (Thứ 2–6). Để trống = không tính giờ muộn/sớm.'
FROM shifts WHERE name = 'Ca Hành Chính' LIMIT 1
ON CONFLICT (key) DO NOTHING;
