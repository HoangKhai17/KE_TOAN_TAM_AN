-- Đảo ngược 120. Def con sẽ mất liên kết cha (nếu còn tồn tại thì thành def cấp cao).
DROP INDEX IF EXISTS idx_ctd_parent;
ALTER TABLE company_table_defs DROP COLUMN IF EXISTS parent_def_id;
