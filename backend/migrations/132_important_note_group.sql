-- "Điều cần lưu ý": chia thành các NHÓM (tab) bằng enum ĐỘNG — admin thêm nhóm mới
-- ở Settings mà không cần sửa code. Ban đầu: Khách hàng / Làm dữ liệu / Kiểm dữ liệu.

-- ① Enum type (is_editable = true → cho phép thêm/sửa ở Settings)
INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('important_note_group', N'Nhóm Điều cần lưu ý', N'Phân nhóm các điều cần lưu ý theo giai đoạn xử lý', true)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, opt.key, opt.label, opt.ord
FROM enum_types et,
(VALUES
  ('customer',   N'Khách hàng',   0),
  ('make_data',  N'Làm dữ liệu',  1),
  ('check_data', N'Kiểm dữ liệu', 2)
) AS opt(key, label, ord)
WHERE et.type_key = 'important_note_group'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ② Cột nhóm cho bảng company_important_notes. Dòng cũ → 'customer' (nhóm đầu).
ALTER TABLE company_important_notes
  ADD COLUMN IF NOT EXISTS note_group VARCHAR(50) NOT NULL DEFAULT 'customer';
