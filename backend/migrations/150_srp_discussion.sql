-- Giải trình dạng HỘI THOẠI (chat 2 chiều staff ↔ admin) cho dòng thưởng/phạt.
-- Mỗi phần tử: { role:'staff'|'admin', name, text, at }.
ALTER TABLE staff_reward_penalty ADD COLUMN IF NOT EXISTS discussion JSONB NOT NULL DEFAULT '[]'::jsonb;
