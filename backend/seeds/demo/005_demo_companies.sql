-- ─────────────────────────────────────────────────────────────────────────────
-- 005_demo_companies.sql — Dữ liệu demo 15 công ty + 3 nhân viên staff
-- Idempotent: ON CONFLICT DO NOTHING
-- Mật khẩu nhân viên: Staff@2026!
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 3 nhân viên demo ─────────────────────────────────────────────────────────

INSERT INTO users (id, name, email, password_hash, role, status, phone, job_title, must_change_pw)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan',  'lan.nguyen@ketoan-taman.vn',
   '$2b$12$Ux9cVq03Y7RugERSwHty6.R/BENDBzoe/0iX7SA.7rofSKJVDlzom',
   'staff', 'active', '0901 111 001', 'Kế toán viên', FALSE),

  ('a1000000-0000-0000-0000-000000000002', 'Trần Văn Minh',   'minh.tran@ketoan-taman.vn',
   '$2b$12$Ux9cVq03Y7RugERSwHty6.R/BENDBzoe/0iX7SA.7rofSKJVDlzom',
   'staff', 'active', '0901 111 002', 'Kế toán trưởng', FALSE),

  ('a1000000-0000-0000-0000-000000000003', 'Lê Thị Hoa',      'hoa.le@ketoan-taman.vn',
   '$2b$12$Ux9cVq03Y7RugERSwHty6.R/BENDBzoe/0iX7SA.7rofSKJVDlzom',
   'staff', 'active', '0901 111 003', 'Kế toán viên', FALSE)
ON CONFLICT (email) DO NOTHING;

-- ── Helper: lấy ID admin ──────────────────────────────────────────────────────

DO $$
DECLARE
  v_admin   uuid;
  v_lan     uuid;
  v_minh    uuid;
  v_hoa     uuid;
BEGIN
  SELECT id INTO v_admin FROM users WHERE email = 'admin@ketoan-taman.vn' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin user not found — run 001_admin_user.sql first';
  END IF;
  SELECT id INTO v_lan  FROM users WHERE email = 'lan.nguyen@ketoan-taman.vn'  LIMIT 1;
  SELECT id INTO v_minh FROM users WHERE email = 'minh.tran@ketoan-taman.vn'   LIMIT 1;
  SELECT id INTO v_hoa  FROM users WHERE email = 'hoa.le@ketoan-taman.vn'      LIMIT 1;

  -- ── 15 công ty ─────────────────────────────────────────────────────────────

  -- 1. Công ty TNHH Thương mại Minh Phát
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000001',
    'Công ty TNHH Thương mại Minh Phát', '0312345678',
    '45 Đinh Tiên Hoàng, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
    'TNHH', 'Thương mại — Xuất nhập khẩu hàng tiêu dùng',
    'Nguyễn Minh Phát', '0903 456 789', 'Trần Thị Thu', '0912 345 678', 'thu.tran@minhphat.vn',
    '0451000123456', 'Vietcombank — Chi nhánh Quận 1',
    '2022-03-15', 'active',
    'Công ty XNK — cần khai thêm thuế NK hàng tháng. Quyết toán năm vào tháng 3.',
    v_lan, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Công ty Cổ phần Xây dựng Đại Phúc
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000002',
    'Công ty Cổ phần Xây dựng Đại Phúc', '0201234567',
    '128 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    'CP', 'Xây dựng dân dụng và công nghiệp',
    'Lê Đại Phúc', '0908 123 456', 'Phạm Văn Hùng', '0918 234 567', 'hung.pham@daiphuc.vn',
    '1901000234567', 'Techcombank — Chi nhánh Lê Lợi',
    '2021-07-01', 'active',
    'Nhiều hợp đồng thầu phụ. Cần theo dõi thuế GTGT hàng tháng và quyết toán TNDN.',
    v_minh, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 3. Hộ kinh doanh Bánh mì Sài Gòn Ngon
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000003',
    'Hộ kinh doanh Bánh mì Sài Gòn Ngon', '0311122233',
    '72 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
    'HKD', 'Thực phẩm & Đồ ăn uống',
    'Huỳnh Văn Nam', '0909 876 543', 'Huỳnh Văn Nam', '0909 876 543', 'banhmi.saigon@gmail.com',
    '0601001345678', 'ACB — Chi nhánh Nguyễn Trãi',
    '2023-01-10', 'active',
    'Hộ kinh doanh nhỏ, khai thuế theo quý. Chú ý miễn thuế GTGT nếu doanh thu < 100tr/năm.',
    v_hoa, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Công ty TNHH Kỹ thuật Số Tân Bình
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000004',
    'Công ty TNHH Kỹ thuật Số Tân Bình', '0304567890',
    '32 Phổ Quang, Phường 2, Quận Tân Bình, TP. Hồ Chí Minh',
    'TNHH', 'Công nghệ thông tin — Phát triển phần mềm',
    'Đỗ Thanh Sơn', '0916 789 012', 'Nguyễn Thị Kim Anh', '0926 012 345', 'kimanh@tanbinh-tech.vn',
    '0721000456789', 'BIDV — Chi nhánh Tân Bình',
    '2022-09-20', 'active', NULL,
    v_lan, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 5. Công ty Cổ phần Sản xuất Nhựa Đông Nam
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000005',
    'Công ty Cổ phần Sản xuất Nhựa Đông Nam', '0510234567',
    'Lô B5, Khu công nghiệp Long Hậu, Long An',
    'CP', 'Sản xuất — Nhựa & Bao bì',
    'Vũ Thị Hồng Nhung', '0903 222 111', 'Đinh Quốc Tuấn', '0913 333 222', 'tuan.dinh@dongnam-plastic.vn',
    '0341000567890', 'VietinBank — Chi nhánh Long An',
    '2020-11-05', 'active',
    'Nhiều chi nhánh. Cần hợp nhất BCTC cuối năm. Thuế GTGT khai theo tháng.',
    v_minh, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Doanh nghiệp tư nhân Vận tải Hoàng Long
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000006',
    'Doanh nghiệp tư nhân Vận tải Hoàng Long', '0406789012',
    '89 Quốc lộ 1A, Phường Bình Hưng Hòa, Quận Bình Tân, TP. Hồ Chí Minh',
    'DN_TU_NHAN', 'Vận tải — Logistics',
    'Hoàng Văn Long', '0934 567 890', 'Hoàng Văn Long', '0934 567 890', 'hoanglongvantai@gmail.com',
    '0711000678901', 'Agribank — Chi nhánh Bình Tân',
    '2023-05-01', 'active',
    'Nhiều phương tiện, cần theo dõi chi phí nhiên liệu và khấu hao. Khai thuế quý.',
    v_hoa, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 7. Công ty TNHH Thực phẩm Hương Việt (inactive)
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000007',
    'Công ty TNHH Thực phẩm Hương Việt', '0607890123',
    '15 Lý Thường Kiệt, Phường 7, Quận 10, TP. Hồ Chí Minh',
    'TNHH', 'Sản xuất & Phân phối thực phẩm',
    'Phan Thị Hương', '0917 890 123', 'Bùi Văn Tú', '0927 901 234', 'tu.bui@huongviet-food.vn',
    '0271000789012', 'MBBank — Chi nhánh Quận 10',
    '2021-02-14', 'inactive',
    'Tạm dừng hoạt động do đang tái cơ cấu. Vẫn cần nộp báo cáo thuế định kỳ.',
    NULL, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 8. Công ty Cổ phần Bất động sản Thiên Ngân
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000008',
    'Công ty Cổ phần Bất động sản Thiên Ngân', '0308901234',
    '200 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh',
    'CP', 'Bất động sản — Môi giới và Phát triển dự án',
    'Lý Thiên Phú', '0908 012 345', 'Trương Mỹ Linh', '0918 123 456', 'mylinh@thiengan-realty.vn',
    '1921000890123', 'Sacombank — Chi nhánh Quận 3',
    '2020-06-01', 'active',
    'Cần theo dõi thuế chuyển nhượng BĐS và tiến độ nộp nghĩa vụ tài chính từng dự án.',
    v_minh, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 9. Công ty TNHH Dịch vụ Vệ sinh Môi trường Xanh Sạch
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000009',
    'Công ty TNHH Dịch vụ Vệ sinh Môi trường Xanh Sạch', '0209012345',
    '56 Nguyễn Oanh, Phường 7, Quận Gò Vấp, TP. Hồ Chí Minh',
    'TNHH', 'Dịch vụ vệ sinh & Môi trường',
    'Ngô Thanh Bình', '0939 234 567', 'Cao Thị Thu Hà', '0949 345 678', 'thuha@xanhsach.vn',
    '0141000901234', 'VPBank — Chi nhánh Gò Vấp',
    '2023-08-15', 'active', NULL,
    v_lan, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 10. Công ty Cổ phần Y tế Phúc An
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000010',
    'Công ty Cổ phần Y tế Phúc An', '0110123456',
    '38 Hoàng Văn Thụ, Phường 9, Quận Phú Nhuận, TP. Hồ Chí Minh',
    'CP', 'Y tế — Thiết bị y tế & Dược phẩm',
    'Trần Phúc An', '0911 456 789', 'Nguyễn Bảo Châu', '0921 567 890', 'baochau@phucan-medical.vn',
    '0301001012345', 'HSBC — Chi nhánh TP.HCM',
    '2021-10-20', 'active',
    'Lĩnh vực y tế, cần lưu ý quy định đặc thù về thuế GTGT cho hàng hoá y tế.',
    v_hoa, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 11. Hộ kinh doanh Cafe & Trà sữa Hoa Thảo
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000011',
    'Hộ kinh doanh Cafe & Trà sữa Hoa Thảo', '0411234567',
    '109 Võ Văn Tần, Phường 6, Quận 3, TP. Hồ Chí Minh',
    'HKD', 'F&B — Đồ uống & Café',
    'Võ Thị Hoa Thảo', '0946 678 901', 'Võ Thị Hoa Thảo', '0946 678 901', 'hoathao.cafe@gmail.com',
    '0671001123456', 'TPBank — Chi nhánh Quận 3',
    '2023-11-01', 'active',
    'Khai thuế khoán theo quý. Doanh thu dưới ngưỡng VAT.',
    v_hoa, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 12. Công ty TNHH Giáo dục và Đào tạo Tương Lai
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000012',
    'Công ty TNHH Giáo dục và Đào tạo Tương Lai', '0312345987',
    '22 Đinh Bộ Lĩnh, Phường 26, Quận Bình Thạnh, TP. Hồ Chí Minh',
    'TNHH', 'Giáo dục & Đào tạo kỹ năng',
    'Nguyễn Văn Tài', '0907 345 678', 'Lê Thị Ánh Ngọc', '0917 456 789', 'anhngoc@tuonglai-edu.vn',
    '0791001234567', 'VietinBank — Chi nhánh Bình Thạnh',
    '2022-01-15', 'active', NULL,
    v_lan, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 13. Công ty Cổ phần Xuất nhập khẩu Nam Hải (terminated)
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000013',
    'Công ty Cổ phần Xuất nhập khẩu Nam Hải', '0213456789',
    '5 Khánh Hội, Phường 3, Quận 4, TP. Hồ Chí Minh',
    'CP', 'Xuất nhập khẩu — Hàng tiêu dùng',
    'Phạm Nam Hải', '0932 890 123', 'Đinh Thị Lan Hương', '0942 901 234', 'lanhuong@namhai-trade.vn',
    '0541001345678', 'Vietcombank — Chi nhánh Quận 4',
    '2019-04-10', 'terminated',
    'Kết thúc HĐ tháng 12/2024. Lưu hồ sơ quyết toán thuế 2023-2024.',
    NULL, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 14. Công ty TNHH Phần mềm và Giải pháp Agile
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000014',
    'Công ty TNHH Phần mềm và Giải pháp Agile', '0314567891',
    '185 Cách Mạng Tháng 8, Phường 10, Quận 3, TP. Hồ Chí Minh',
    'TNHH', 'Công nghệ thông tin — SaaS & Tư vấn',
    'Bùi Trọng Khoa', '0919 012 345', 'Trần Thanh Tùng', '0929 123 456', 'thanhtung@agile-solutions.vn',
    '0191001456789', 'OCB — Chi nhánh Cách Mạng Tháng 8',
    '2024-02-01', 'active',
    'Startup công nghệ. Cần tư vấn ưu đãi thuế TNDN 4 năm đầu. Có nhân sự nước ngoài.',
    v_minh, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 15. Công ty Cổ phần Nội thất và Trang trí LUXHOME
  INSERT INTO companies (id, name, tax_code, address, business_type, industry,
    legal_rep_name, legal_rep_phone, contact_name, contact_phone, contact_email,
    bank_account, bank_name, service_start_date, status, notes, assigned_staff_id, created_by)
  VALUES ('c0000000-0000-0000-0000-000000000015',
    'Công ty Cổ phần Nội thất và Trang trí LUXHOME', '0415678901',
    '88 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh',
    'CP', 'Nội thất — Thiết kế & Thi công nội thất cao cấp',
    'Hồ Minh Lâm', '0905 789 012', 'Dương Thị Kiều Oanh', '0915 890 123', 'kieuoanh@luxhome.vn',
    '0371001567890', 'SHB — Chi nhánh Bình Thạnh',
    '2023-09-01', 'active',
    'Xuất hoá đơn cho cả khách hàng cá nhân và doanh nghiệp. Cần kiểm soát công trình đang thi công.',
    v_lan, v_admin)
  ON CONFLICT (id) DO NOTHING;

  -- ── Lịch sử phân công ──────────────────────────────────────────────────────

  -- Cty 1 - Minh Phát: Lan phụ trách từ đầu
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date, notes)
  VALUES ('a5000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001', v_lan, v_admin, '2022-03-15', 'Phân công ban đầu')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 2 - Đại Phúc: Lan → chuyển Minh (2023-02)
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date, end_date, notes)
  VALUES ('a5000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002', v_lan, v_admin, '2021-07-01', '2023-01-31', NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date, notes)
  VALUES ('a5000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000002', v_minh, v_admin, '2023-02-01', 'Chuyển giao do tăng khối lượng công việc')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 3 - Bánh mì: Hoa
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000003', v_hoa, v_admin, '2023-01-10')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 4 - Kỹ thuật Số: Lan
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000004', v_lan, v_admin, '2022-09-20')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 5 - Nhựa Đông Nam: Minh
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000006',
    'c0000000-0000-0000-0000-000000000005', v_minh, v_admin, '2020-11-05')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 6 - Hoàng Long: Hoa
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000007',
    'c0000000-0000-0000-0000-000000000006', v_hoa, v_admin, '2023-05-01')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 8 - Thiên Ngân BĐS: Minh
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000008',
    'c0000000-0000-0000-0000-000000000008', v_minh, v_admin, '2020-06-01')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 9 - Xanh Sạch: Lan
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000009',
    'c0000000-0000-0000-0000-000000000009', v_lan, v_admin, '2023-08-15')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 10 - Phúc An Y tế: Hoa
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000010',
    'c0000000-0000-0000-0000-000000000010', v_hoa, v_admin, '2021-10-20')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 11 - Hoa Thảo Cafe: Hoa
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000011',
    'c0000000-0000-0000-0000-000000000011', v_hoa, v_admin, '2023-11-01')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 12 - Tương Lai Edu: Lan
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000012',
    'c0000000-0000-0000-0000-000000000012', v_lan, v_admin, '2022-01-15')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 14 - Agile Software: Minh
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000013',
    'c0000000-0000-0000-0000-000000000014', v_minh, v_admin, '2024-02-01')
  ON CONFLICT (id) DO NOTHING;

  -- Cty 15 - LUXHOME: Lan
  INSERT INTO staff_company_assignments (id, company_id, staff_id, assigned_by, start_date)
  VALUES ('a5000000-0000-0000-0000-000000000014',
    'c0000000-0000-0000-0000-000000000015', v_lan, v_admin, '2023-09-01')
  ON CONFLICT (id) DO NOTHING;

END $$;
