-- Staff giải trình cho dòng thưởng/phạt (để admin xem xét giữ/xoá).
ALTER TABLE staff_reward_penalty ADD COLUMN IF NOT EXISTS staff_explanation TEXT;
ALTER TABLE staff_reward_penalty ADD COLUMN IF NOT EXISTS explained_at TIMESTAMP;
