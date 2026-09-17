-- Rollback CẤU TRÚC (dữ liệu cũ KHÔNG khôi phục — đã nằm ở engine mới). Dựng lại bảng rỗng + enum
-- để hệ thống trở về hình dạng trước GĐ6 nếu cần.
CREATE TABLE IF NOT EXISTS company_important_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  severity    VARCHAR(50) NOT NULL DEFAULT 'normal',
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  note_group  VARCHAR(50) NOT NULL DEFAULT 'customer',
  resolution  TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cin_company ON company_important_notes(company_id);

INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('important_note_group', N'Nhóm Điều cần lưu ý', N'Phân nhóm các điều cần lưu ý theo giai đoạn xử lý', true)
ON CONFLICT (type_key) DO NOTHING;
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, opt.key, opt.label, opt.ord
FROM enum_types et,
(VALUES ('customer', N'Khách hàng', 0), ('make_data', N'Làm dữ liệu', 1), ('check_data', N'Kiểm dữ liệu', 2)) AS opt(key, label, ord)
WHERE et.type_key = 'important_note_group'
ON CONFLICT (type_id, option_key) DO NOTHING;
