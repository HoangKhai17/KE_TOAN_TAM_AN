-- Bỏ khỏi hồ sơ công ty (theo yêu cầu KH): Địa chỉ, Ngày thành lập (theo GP),
-- Số TK ngân hàng, Tên ngân hàng. Địa chỉ & ngày thành lập của ĐỊA ĐIỂM (locations)
-- và địa chỉ của NHÂN SỰ (users) là bảng khác — KHÔNG đụng tới.
ALTER TABLE companies
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS bank_account,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS license_established_date;
