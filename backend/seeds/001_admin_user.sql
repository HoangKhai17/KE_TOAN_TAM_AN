-- Default admin user: admin@ketoan-taman.vn / Admin@2026!
-- must_change_pw = TRUE: buoc doi mat khau lan dang nhap dau tien
INSERT INTO users (id, name, email, password_hash, role, status, job_title, must_change_pw)
VALUES (
  gen_random_uuid(),
  'Quản trị viên',
  'admin@ketoan-taman.vn',
  '$2b$12$Ux9cVq03Y7RugERSwHty6.R/BENDBzoe/0iX7SA.7rofSKJVDlzom',
  'admin',
  'active',
  'Quản lý',
  TRUE
)
ON CONFLICT (email) DO NOTHING;
