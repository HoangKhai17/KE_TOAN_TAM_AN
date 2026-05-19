-- 042: Thêm các trường hồ sơ nhân viên (CV, thông tin cá nhân)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dob        DATE,
  ADD COLUMN IF NOT EXISTS hire_date  DATE,
  ADD COLUMN IF NOT EXISTS id_card    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address    TEXT,
  ADD COLUMN IF NOT EXISTS education  TEXT,
  ADD COLUMN IF NOT EXISTS experience TEXT;
