-- Migration 080: Thêm loại thông báo 'birthday' (sinh nhật nhân viên)
-- Tiện thể vá 2 giá trị CDR đã dùng trong code (lib/notify, jobs/clientDocOverdue) +
-- đã có ở enum_options (migration 050) NHƯNG chưa được thêm vào enum type
-- → khiến thông báo CDR bị INSERT lỗi và bị nuốt âm thầm.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'client_doc_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'client_doc_overdue';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'birthday';

-- enum_options cho 'birthday' (để hiển thị nhãn trong quản lý enum)
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, 'birthday', N'Sinh nhật nhân viên', 20
FROM enum_types et
WHERE et.type_key = 'notification_type'
ON CONFLICT (type_id, option_key) DO NOTHING;
