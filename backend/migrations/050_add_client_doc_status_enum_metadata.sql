-- Phase 17: Add client_doc_status enum metadata + CDR notification types

-- ── client_doc_status enum type ──────────────────────────────────────────────

INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('client_doc_status', N'Trạng thái yêu cầu tài liệu KH', N'Vòng đời xử lý yêu cầu tài liệu từ khách hàng', false)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, opt.key, opt.label, opt.ord
FROM enum_types et,
(VALUES
  ('pending',      N'Chờ KH cung cấp', 0),
  ('received',     N'Đã nhận',          1),
  ('overdue',      N'Quá hạn',          2),
  ('not_required', N'Không cần thiết',  3)
) AS opt(key, label, ord)
WHERE et.type_key = 'client_doc_status'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── New notification types for CDR events ────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, opt.key, opt.label, opt.ord
FROM enum_types et,
(VALUES
  ('client_doc_submitted', N'KH đã gửi tài liệu',       10),
  ('client_doc_overdue',   N'Tài liệu KH quá hạn',      11)
) AS opt(key, label, ord)
WHERE et.type_key = 'notification_type'
ON CONFLICT (type_id, option_key) DO NOTHING;
