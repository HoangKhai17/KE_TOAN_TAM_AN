-- Checklist cho 5 loai cong viec quan trong nhat
DO $$
DECLARE
  v_gtgt_id   UUID;
  v_luong_id  UUID;
  v_bhxh_id   UUID;
  v_bctc_id   UUID;
  v_doi_soa_id UUID;
BEGIN
  SELECT id INTO v_gtgt_id   FROM task_types WHERE name = 'Kê khai thuế GTGT' LIMIT 1;
  SELECT id INTO v_luong_id  FROM task_types WHERE name = 'Lập bảng lương' LIMIT 1;
  SELECT id INTO v_bhxh_id   FROM task_types WHERE name = 'Đóng BHXH / BHYT' LIMIT 1;
  SELECT id INTO v_bctc_id   FROM task_types WHERE name = 'Báo cáo tài chính năm' LIMIT 1;
  SELECT id INTO v_doi_soa_id FROM task_types WHERE name = 'Đối soát sao kê ngân hàng' LIMIT 1;

  -- Ke khai thue GTGT
  IF v_gtgt_id IS NOT NULL THEN
    INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
      (v_gtgt_id, 1, 'Thu thập hóa đơn đầu vào / đầu ra trong kỳ'),
      (v_gtgt_id, 2, 'Đối chiếu số liệu với phần mềm kế toán'),
      (v_gtgt_id, 3, 'Lập tờ khai trên phần mềm khai thuế (HTKK / MISA)'),
      (v_gtgt_id, 4, 'Kiểm tra và ký số tờ khai'),
      (v_gtgt_id, 5, 'Nộp tờ khai điện tử lên cổng thuế eTax'),
      (v_gtgt_id, 6, 'Lưu biên lai xác nhận đã nộp vào hồ sơ')
    ON CONFLICT (task_type_id, step_order) DO NOTHING;
  END IF;

  -- Lap bang luong
  IF v_luong_id IS NOT NULL THEN
    INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
      (v_luong_id, 1, 'Xác nhận danh sách nhân viên và ngày công tháng'),
      (v_luong_id, 2, 'Tính lương cơ bản, phụ cấp và thưởng'),
      (v_luong_id, 3, 'Tính khấu trừ BHXH / BHYT / BHTN phần nhân viên'),
      (v_luong_id, 4, 'Tính thuế TNCN phải khấu trừ'),
      (v_luong_id, 5, 'Lập bảng lương hoàn chỉnh và trình ký duyệt'),
      (v_luong_id, 6, 'Chuyển khoản lương cho nhân viên'),
      (v_luong_id, 7, 'Lưu bảng lương và chứng từ chuyển khoản')
    ON CONFLICT (task_type_id, step_order) DO NOTHING;
  END IF;

  -- Dong BHXH / BHYT
  IF v_bhxh_id IS NOT NULL THEN
    INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
      (v_bhxh_id, 1, 'Kiểm tra danh sách tăng/giảm lao động trong tháng'),
      (v_bhxh_id, 2, 'Tính số tiền BHXH / BHYT / BHTN phải nộp'),
      (v_bhxh_id, 3, 'Lập hồ sơ kê khai trên cổng VssID / BHXH điện tử'),
      (v_bhxh_id, 4, 'Nộp tiền bảo hiểm qua ngân hàng'),
      (v_bhxh_id, 5, 'Lưu biên lai nộp BHXH vào hồ sơ')
    ON CONFLICT (task_type_id, step_order) DO NOTHING;
  END IF;

  -- Bao cao tai chinh nam
  IF v_bctc_id IS NOT NULL THEN
    INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
      (v_bctc_id, 1,  'Đóng sổ kế toán cuối năm — kiểm tra số dư các tài khoản'),
      (v_bctc_id, 2,  'Kiểm kê tồn kho và tài sản cố định'),
      (v_bctc_id, 3,  'Đối chiếu công nợ phải thu / phải trả cuối năm'),
      (v_bctc_id, 4,  'Lập bảng cân đối kế toán'),
      (v_bctc_id, 5,  'Lập báo cáo kết quả hoạt động kinh doanh'),
      (v_bctc_id, 6,  'Lập báo cáo lưu chuyển tiền tệ'),
      (v_bctc_id, 7,  'Lập thuyết minh báo cáo tài chính'),
      (v_bctc_id, 8,  'Kiểm tra và ký số BCTC'),
      (v_bctc_id, 9,  'Nộp BCTC lên cơ quan thuế và sở KH-ĐT'),
      (v_bctc_id, 10, 'Lưu toàn bộ hồ sơ BCTC')
    ON CONFLICT (task_type_id, step_order) DO NOTHING;
  END IF;

  -- Doi soat sao ke ngan hang
  IF v_doi_soa_id IS NOT NULL THEN
    INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
      (v_doi_soa_id, 1, 'Tải sao kê ngân hàng tháng về'),
      (v_doi_soa_id, 2, 'Đối chiếu từng giao dịch thu với sổ kế toán'),
      (v_doi_soa_id, 3, 'Đối chiếu từng giao dịch chi với chứng từ'),
      (v_doi_soa_id, 4, 'Ghi nhận và xử lý các khoản chênh lệch (nếu có)'),
      (v_doi_soa_id, 5, 'Xác nhận số dư cuối kỳ khớp với sổ tiền gửi ngân hàng')
    ON CONFLICT (task_type_id, step_order) DO NOTHING;
  END IF;
END;
$$;
