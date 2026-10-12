DELETE FROM kpi_grades WHERE category = 'reward_penalty';
DROP INDEX IF EXISTS idx_kpi_grades_category;
ALTER TABLE kpi_grades DROP CONSTRAINT IF EXISTS kpi_grades_category_chk;
ALTER TABLE kpi_grades DROP COLUMN IF EXISTS category;
