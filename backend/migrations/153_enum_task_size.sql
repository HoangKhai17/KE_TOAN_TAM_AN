-- KPI Phase 1 (đúng chuẩn enum động): danh mục "Cỡ việc".
-- MÃ KỸ THUẬT (option_key) CHÍNH LÀ trọng số điểm: '1'=Nhỏ, '2'=Vừa, '3'=Lớn.
-- → enum vừa quản lý NHÃN (sửa được trong Danh mục hệ thống) vừa mang TRỌNG SỐ.
-- Thêm mức mới (vd '5' = Rất lớn) chỉ cần thêm option, không phải sửa code.
-- Cột tasks.size_points / task_types.size_points lưu đúng con số này.

INSERT INTO enum_types (type_key, label, description) VALUES
  ('task_size', N'Cỡ việc', N'Độ lớn/phức tạp của công việc — dùng tính điểm KPI (mã = điểm)')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('1', N'Nhỏ', 0),
  ('2', N'Vừa', 1),
  ('3', N'Lớn', 2)
) AS opt(key, label, ord)
WHERE type_key = 'task_size'
ON CONFLICT (type_id, option_key) DO NOTHING;
