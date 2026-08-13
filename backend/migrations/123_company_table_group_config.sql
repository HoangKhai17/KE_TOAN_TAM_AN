-- Bảng con dạng "Gom nhóm (Pivot)" tự sinh dòng từ bảng cha.
-- group_config JSONB (nullable) trên company_table_defs (chỉ dùng cho bảng con có parent_def_id):
--   { enabled: bool, keys: [{ childCol, parentCol }], autoSync: bool, removeOrphans: bool }
ALTER TABLE company_table_defs ADD COLUMN IF NOT EXISTS group_config JSONB;
