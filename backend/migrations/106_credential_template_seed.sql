-- DANH MỤC ĐỘNG: "Tài khoản mẫu" (credential_template)
--
-- Danh sách các hệ thống tài khoản mà công ty nào cũng cần khai báo. Dùng cho nút
-- "Import mẫu" trong tab Tài khoản hệ thống: user bấm 1 lần là tạo sẵn các dòng
-- tài khoản trống (chỉ có tên), rồi tự bổ sung đường dẫn / user / mật khẩu sau.
--
-- Đây CHỈ là seed dữ liệu (INSERT) vào 2 bảng danh mục động có sẵn (enum_types +
-- enum_options) — KHÔNG tạo bảng mới, KHÔNG đổi schema. Sau khi seed, admin có thể
-- vào Settings → Danh mục hệ thống để sửa/thêm/bớt nhãn (is_editable = true).

INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('credential_template', 'Tài khoản mẫu',
   'Danh sách tài khoản hệ thống mặc định cho nút Import mẫu (Thuế, HĐĐT, Bảo hiểm...)', true)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('tax_service_portal', 'Thuế điện tử/Dịch vụ công (Thuế)',  0),
  ('hoadondientu',       'Trang hoadondientu (Thuế)',         1),
  ('einvoice_export',    'Trang xuất hóa đơn (NCC HDĐT)',      2),
  ('insurance_portal',   'Trang bảo hiểm (Bảo hiểm)',          3)
) AS opt(key, label, ord)
WHERE type_key = 'credential_template'
ON CONFLICT (type_id, option_key) DO NOTHING;
