-- Migration 076: bỏ cờ is_system cho 3 def migrate (hdld/csc/nsnn) theo yêu cầu
-- → admin có thể XÓA chúng như bảng tùy chỉnh thông thường (mất lớp bảo vệ chống xóa nhầm).
UPDATE company_table_defs SET is_system = FALSE WHERE table_key IN ('hdld', 'csc', 'nsnn');
