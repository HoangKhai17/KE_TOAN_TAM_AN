-- Khôi phục cột (dữ liệu cũ đã mất khi drop — chỉ tạo lại cấu trúc).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS license_established_date DATE;
