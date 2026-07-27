-- Ngày thành lập (theo Giấy phép) — cho công ty và từng địa điểm bổ sung.
-- Khác service_start_date (ngày bắt đầu dịch vụ) và start_date của địa điểm.
ALTER TABLE companies         ADD COLUMN license_established_date DATE;
ALTER TABLE company_locations ADD COLUMN license_established_date DATE;
