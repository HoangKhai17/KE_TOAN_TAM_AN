-- Rollback 074: xóa 3 system def (cascade columns + company-columns + rows generic).
-- Bảng cũ (company_labor_contracts/csc/nsnn) không bị ảnh hưởng.
DELETE FROM company_table_defs WHERE table_key IN ('hdld', 'csc', 'nsnn');
