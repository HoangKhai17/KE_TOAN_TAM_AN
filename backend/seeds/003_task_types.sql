-- Lay admin user id de dung lam created_by
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  INSERT INTO task_types (id, name, group_name, description, default_sla_days, created_by) VALUES
    -- Khai thue
    (gen_random_uuid(), 'Kê khai thuế GTGT',           'Khai thuế',        'Kê khai và nộp thuế giá trị gia tăng hàng tháng/quý', 7,  v_admin_id),
    (gen_random_uuid(), 'Kê khai thuế TNCN',            'Khai thuế',        'Kê khai thuế thu nhập cá nhân hàng tháng/quý',        7,  v_admin_id),
    (gen_random_uuid(), 'Kê khai thuế môn bài',         'Khai thuế',        'Nộp thuế môn bài hàng năm',                           14, v_admin_id),
    (gen_random_uuid(), 'Kê khai thuế nhà thầu',        'Khai thuế',        'Kê khai và nộp thuế nhà thầu nước ngoài',             7,  v_admin_id),
    (gen_random_uuid(), 'Quyết toán thuế TNCN cuối năm','Khai thuế',        'Quyết toán thuế TNCN năm — tháng 3 năm sau',          30, v_admin_id),

    -- Bao cao tai chinh
    (gen_random_uuid(), 'Báo cáo tài chính quý',        'Báo cáo tài chính','Lập báo cáo tài chính theo quý',                      10, v_admin_id),
    (gen_random_uuid(), 'Báo cáo tài chính năm',        'Báo cáo tài chính','Lập báo cáo tài chính năm đầy đủ',                    30, v_admin_id),
    (gen_random_uuid(), 'Quyết toán thuế TNDN năm',     'Báo cáo tài chính','Quyết toán thuế thu nhập doanh nghiệp cuối năm',       30, v_admin_id),

    -- Nhan su
    (gen_random_uuid(), 'Lập bảng lương',               'Nhân sự',          'Tính lương và phụ cấp nhân viên hàng tháng',          5,  v_admin_id),
    (gen_random_uuid(), 'Đóng BHXH / BHYT',             'Nhân sự',          'Kê khai và nộp bảo hiểm xã hội, bảo hiểm y tế',      7,  v_admin_id),
    (gen_random_uuid(), 'Kê khai thay đổi lao động',    'Nhân sự',          'Báo cáo tăng/giảm lao động với cơ quan BHXH',        5,  v_admin_id),

    -- Chung tu ke toan
    (gen_random_uuid(), 'Nhập hóa đơn đầu vào',         'Chứng từ kế toán', 'Nhập và phân loại hóa đơn mua hàng hàng tháng',      5,  v_admin_id),
    (gen_random_uuid(), 'Đối soát sao kê ngân hàng',    'Chứng từ kế toán', 'Đối chiếu số liệu ngân hàng với sổ sách kế toán',    5,  v_admin_id),
    (gen_random_uuid(), 'Kiểm tra công nợ',             'Chứng từ kế toán', 'Rà soát và đối chiếu công nợ phải thu / phải trả',   7,  v_admin_id),

    -- Hanh chinh phap ly
    (gen_random_uuid(), 'Thay đổi đăng ký kinh doanh',  'Hành chính / Pháp lý','Thay đổi thông tin đăng ký doanh nghiệp',         14, v_admin_id),
    (gen_random_uuid(), 'Gia hạn giấy phép kinh doanh', 'Hành chính / Pháp lý','Gia hạn hoặc cấp lại giấy phép kinh doanh',       21, v_admin_id),
    (gen_random_uuid(), 'Lưu trữ hồ sơ chứng từ',      'Hành chính / Pháp lý','Sắp xếp và lưu trữ chứng từ theo quy định',       3,  v_admin_id)
  ON CONFLICT DO NOTHING;
END;
$$;
