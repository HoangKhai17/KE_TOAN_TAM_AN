-- Gỡ danh mục "Tài khoản mẫu" (options tự xoá theo ON DELETE CASCADE)
DELETE FROM enum_types WHERE type_key = 'credential_template';
