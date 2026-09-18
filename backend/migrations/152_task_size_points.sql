-- KPI Phase 1 — "Cỡ việc" (điểm độ lớn/phức tạp) theo LOẠI công việc.
-- 1 = Nhỏ (S), 2 = Vừa (M), 3 = Lớn (L). Gán 1 lần ở loại CV; task có thể override.
-- Cỡ hiệu lực của 1 task = COALESCE(tasks.size_points, task_types.size_points, 2).

ALTER TABLE task_types ADD COLUMN IF NOT EXISTS size_points SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE tasks      ADD COLUMN IF NOT EXISTS size_points SMALLINT;   -- NULL = kế thừa cỡ của loại
