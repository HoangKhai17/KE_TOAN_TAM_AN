-- Khôi phục cột amount (cấu trúc; dữ liệu cũ không lấy lại được).
ALTER TABLE staff_reward_penalty ADD COLUMN IF NOT EXISTS amount NUMERIC;
