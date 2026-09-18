-- Bỏ cột tiền (amount) khỏi sổ thưởng/phạt: hệ thống chuyển sang ĐIỂM THUẦN,
-- chưa quy đổi ra tiền. Quy đổi điểm → tiền (nếu có) sẽ làm ở bước sau.
ALTER TABLE staff_reward_penalty DROP COLUMN IF EXISTS amount;
