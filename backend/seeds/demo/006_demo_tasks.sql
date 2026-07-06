-- ─────────────────────────────────────────────────────────────────────────────
-- 006_demo_tasks.sql — Dữ liệu demo: 45 tasks + checklist + comments + logs
-- Idempotent: ON CONFLICT DO NOTHING
-- Yêu cầu: 001–005 seeds phải chạy trước
-- Ngày cơ sở demo: 2026-05-10
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- Staff
  v_admin uuid;
  v_lan   uuid;
  v_minh  uuid;
  v_hoa   uuid;

  -- Task type IDs (tra cứu theo tên)
  tt_gtgt       uuid;  -- Kê khai thuế GTGT
  tt_tncn       uuid;  -- Kê khai thuế TNCN
  tt_mon_bai    uuid;  -- Kê khai thuế môn bài
  tt_nha_thau   uuid;  -- Kê khai thuế nhà thầu
  tt_qt_tncn    uuid;  -- Quyết toán thuế TNCN cuối năm
  tt_bctc_quy   uuid;  -- Báo cáo tài chính quý
  tt_bctc_nam   uuid;  -- Báo cáo tài chính năm
  tt_qt_tndn    uuid;  -- Quyết toán thuế TNDN năm
  tt_luong      uuid;  -- Lập bảng lương
  tt_bhxh       uuid;  -- Đóng BHXH / BHYT
  tt_ld         uuid;  -- Kê khai thay đổi lao động
  tt_hd_vao     uuid;  -- Nhập hóa đơn đầu vào
  tt_doi_soat   uuid;  -- Đối soát sao kê ngân hàng
  tt_cong_no    uuid;  -- Kiểm tra công nợ
  tt_dkdn       uuid;  -- Thay đổi đăng ký kinh doanh
  tt_gplkd      uuid;  -- Gia hạn giấy phép kinh doanh
  tt_luu_tru    uuid;  -- Lưu trữ hồ sơ chứng từ

  -- Company shortcuts
  c01 uuid := 'c0000000-0000-0000-0000-000000000001'; -- Minh Phát
  c02 uuid := 'c0000000-0000-0000-0000-000000000002'; -- Đại Phúc
  c04 uuid := 'c0000000-0000-0000-0000-000000000004'; -- Kỹ thuật Số
  c05 uuid := 'c0000000-0000-0000-0000-000000000005'; -- Nhựa Đông Nam
  c08 uuid := 'c0000000-0000-0000-0000-000000000008'; -- Thiên Ngân BĐS
  c09 uuid := 'c0000000-0000-0000-0000-000000000009'; -- Xanh Sạch
  c10 uuid := 'c0000000-0000-0000-0000-000000000010'; -- Phúc An Y tế
  c12 uuid := 'c0000000-0000-0000-0000-000000000012'; -- Tương Lai Edu
  c14 uuid := 'c0000000-0000-0000-0000-000000000014'; -- Agile Software
  c15 uuid := 'c0000000-0000-0000-0000-000000000015'; -- LUXHOME

  -- Task IDs (fixed UUIDs)
  t01 uuid := 'f0000000-0000-0000-0000-000000000001';
  t02 uuid := 'f0000000-0000-0000-0000-000000000002';
  t03 uuid := 'f0000000-0000-0000-0000-000000000003';
  t04 uuid := 'f0000000-0000-0000-0000-000000000004';
  t05 uuid := 'f0000000-0000-0000-0000-000000000005';
  t06 uuid := 'f0000000-0000-0000-0000-000000000006';
  t07 uuid := 'f0000000-0000-0000-0000-000000000007';
  t08 uuid := 'f0000000-0000-0000-0000-000000000008';
  t09 uuid := 'f0000000-0000-0000-0000-000000000009';
  t10 uuid := 'f0000000-0000-0000-0000-000000000010';
  t11 uuid := 'f0000000-0000-0000-0000-000000000011';
  t12 uuid := 'f0000000-0000-0000-0000-000000000012';
  t13 uuid := 'f0000000-0000-0000-0000-000000000013';
  t14 uuid := 'f0000000-0000-0000-0000-000000000014';
  t15 uuid := 'f0000000-0000-0000-0000-000000000015';
  t16 uuid := 'f0000000-0000-0000-0000-000000000016';
  t17 uuid := 'f0000000-0000-0000-0000-000000000017';
  t18 uuid := 'f0000000-0000-0000-0000-000000000018';
  t19 uuid := 'f0000000-0000-0000-0000-000000000019';
  t20 uuid := 'f0000000-0000-0000-0000-000000000020';
  t21 uuid := 'f0000000-0000-0000-0000-000000000021';
  t22 uuid := 'f0000000-0000-0000-0000-000000000022';
  t23 uuid := 'f0000000-0000-0000-0000-000000000023';
  t24 uuid := 'f0000000-0000-0000-0000-000000000024';
  t25 uuid := 'f0000000-0000-0000-0000-000000000025';
  t26 uuid := 'f0000000-0000-0000-0000-000000000026';
  t27 uuid := 'f0000000-0000-0000-0000-000000000027';
  t28 uuid := 'f0000000-0000-0000-0000-000000000028';
  t29 uuid := 'f0000000-0000-0000-0000-000000000029';
  t30 uuid := 'f0000000-0000-0000-0000-000000000030';
  t31 uuid := 'f0000000-0000-0000-0000-000000000031';
  t32 uuid := 'f0000000-0000-0000-0000-000000000032';
  t33 uuid := 'f0000000-0000-0000-0000-000000000033';
  t34 uuid := 'f0000000-0000-0000-0000-000000000034';
  t35 uuid := 'f0000000-0000-0000-0000-000000000035';
  t36 uuid := 'f0000000-0000-0000-0000-000000000036';
  t37 uuid := 'f0000000-0000-0000-0000-000000000037';
  t38 uuid := 'f0000000-0000-0000-0000-000000000038';
  t39 uuid := 'f0000000-0000-0000-0000-000000000039';
  t40 uuid := 'f0000000-0000-0000-0000-000000000040';
  t41 uuid := 'f0000000-0000-0000-0000-000000000041';
  t42 uuid := 'f0000000-0000-0000-0000-000000000042';
  t43 uuid := 'f0000000-0000-0000-0000-000000000043';
  t44 uuid := 'f0000000-0000-0000-0000-000000000044';
  t45 uuid := 'f0000000-0000-0000-0000-000000000045';

BEGIN
  -- ── Lookup users ─────────────────────────────────────────────────────────────
  SELECT id INTO v_admin FROM users WHERE email = 'admin@ketoan-taman.vn' LIMIT 1;
  SELECT id INTO v_lan   FROM users WHERE email = 'lan.nguyen@ketoan-taman.vn'  LIMIT 1;
  SELECT id INTO v_minh  FROM users WHERE email = 'minh.tran@ketoan-taman.vn'   LIMIT 1;
  SELECT id INTO v_hoa   FROM users WHERE email = 'hoa.le@ketoan-taman.vn'      LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin user not found — run 001_admin_user.sql first';
  END IF;

  -- ── Lookup task types ─────────────────────────────────────────────────────────
  SELECT id INTO tt_gtgt     FROM task_types WHERE name = 'Kê khai thuế GTGT'            LIMIT 1;
  SELECT id INTO tt_tncn     FROM task_types WHERE name = 'Kê khai thuế TNCN'             LIMIT 1;
  SELECT id INTO tt_mon_bai  FROM task_types WHERE name = 'Kê khai thuế môn bài'          LIMIT 1;
  SELECT id INTO tt_nha_thau FROM task_types WHERE name = 'Kê khai thuế nhà thầu'         LIMIT 1;
  SELECT id INTO tt_qt_tncn  FROM task_types WHERE name = 'Quyết toán thuế TNCN cuối năm' LIMIT 1;
  SELECT id INTO tt_bctc_quy FROM task_types WHERE name = 'Báo cáo tài chính quý'         LIMIT 1;
  SELECT id INTO tt_bctc_nam FROM task_types WHERE name = 'Báo cáo tài chính năm'         LIMIT 1;
  SELECT id INTO tt_qt_tndn  FROM task_types WHERE name = 'Quyết toán thuế TNDN năm'      LIMIT 1;
  SELECT id INTO tt_luong    FROM task_types WHERE name = 'Lập bảng lương'                LIMIT 1;
  SELECT id INTO tt_bhxh     FROM task_types WHERE name = 'Đóng BHXH / BHYT'              LIMIT 1;
  SELECT id INTO tt_ld       FROM task_types WHERE name = 'Kê khai thay đổi lao động'     LIMIT 1;
  SELECT id INTO tt_hd_vao   FROM task_types WHERE name = 'Nhập hóa đơn đầu vào'          LIMIT 1;
  SELECT id INTO tt_doi_soat FROM task_types WHERE name = 'Đối soát sao kê ngân hàng'     LIMIT 1;
  SELECT id INTO tt_cong_no  FROM task_types WHERE name = 'Kiểm tra công nợ'              LIMIT 1;
  SELECT id INTO tt_dkdn     FROM task_types WHERE name = 'Thay đổi đăng ký kinh doanh'  LIMIT 1;
  SELECT id INTO tt_gplkd    FROM task_types WHERE name = 'Gia hạn giấy phép kinh doanh' LIMIT 1;
  SELECT id INTO tt_luu_tru  FROM task_types WHERE name = 'Lưu trữ hồ sơ chứng từ'       LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TASKS (45 công việc)
  -- Cột: id, title, description, company_id, task_type_id, assigned_to,
  --      assigned_by, status, priority, source, due_date, period_label,
  --      completed_at, on_hold_reason, sla_days, created_by, created_at
  -- ═══════════════════════════════════════════════════════════════════════════

  -- ── T01–T03: GTGT T04/2026 - ĐÃ HOÀN THÀNH ────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t01,
    'Kê khai thuế GTGT tháng 04/2026 — Minh Phát', c01, tt_gtgt, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-06 15:30:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t02,
    'Kê khai thuế GTGT tháng 04/2026 — Đại Phúc', c02, tt_gtgt, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-05 10:20:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t03,
    'Kê khai thuế GTGT tháng 04/2026 — Nhựa Đông Nam', c05, tt_gtgt, v_minh, v_admin,
    'completed', 'high', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-07 09:00:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T04–T07: GTGT T05/2026 - ĐANG XỬ LÝ ──────────────────────────────────

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t04,
    'Kê khai thuế GTGT tháng 05/2026 — Minh Phát',
    'Kê khai và nộp tờ khai 01/GTGT. Chú ý thuế NK hàng tháng.',
    c01, tt_gtgt, v_lan, v_admin,
    'pending_review', 'high', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t05,
    'Kê khai thuế GTGT tháng 05/2026 — Đại Phúc',
    c02, tt_gtgt, v_minh, v_admin,
    'in_progress', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t06,
    'Kê khai thuế GTGT tháng 05/2026 — Kỹ thuật Số',
    c04, tt_gtgt, v_lan, v_admin,
    'pending', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t07,
    'Kê khai thuế GTGT tháng 05/2026 — Nhựa Đông Nam',
    c05, tt_gtgt, v_minh, v_admin,
    'in_progress', 'high', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T08–T11: BẢNG LƯƠNG ───────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t08,
    'Lập bảng lương tháng 04/2026 — Minh Phát',
    c01, tt_luong, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-05-05', 'T04/2026',
    '2026-05-04 17:00:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t09,
    'Lập bảng lương tháng 04/2026 — Đại Phúc',
    c02, tt_luong, v_minh, v_admin,
    'completed', 'high', 'auto', '2026-05-05', 'T04/2026',
    '2026-05-03 16:30:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t10,
    'Lập bảng lương tháng 05/2026 — Kỹ thuật Số',
    'Tính lương và phụ cấp. Có thêm 2 nhân viên mới từ tháng này.',
    c04, tt_luong, v_lan, v_admin,
    'in_progress', 'high', 'auto', '2026-05-12', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t11,
    'Lập bảng lương tháng 05/2026 — Nhựa Đông Nam',
    c05, tt_luong, v_minh, v_admin,
    'pending', 'high', 'auto', '2026-05-12', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T12–T14: BHXH ─────────────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t12,
    'Đóng BHXH / BHYT tháng 04/2026 — Minh Phát',
    c01, tt_bhxh, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-05-08', 'T04/2026',
    '2026-05-07 14:00:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t13,
    'Đóng BHXH / BHYT tháng 04/2026 — Kỹ thuật Số',
    c04, tt_bhxh, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-05-08', 'T04/2026',
    '2026-05-08 10:30:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t14,
    'Đóng BHXH / BHYT tháng 05/2026 — Minh Phát',
    c01, tt_bhxh, v_lan, v_admin,
    'pending', 'medium', 'auto', '2026-05-25', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T15–T16: QUYẾT TOÁN CUỐI NĂM - QUÁ HẠN ──────────────────────────────

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t15,
    'Quyết toán thuế TNCN năm 2025 — Đại Phúc',
    'Quyết toán thuế TNCN cả năm 2025. Có 45 nhân viên, 3 người nước ngoài. Cần xác nhận danh sách uỷ quyền quyết toán.',
    c02, tt_qt_tncn, v_minh, v_admin,
    'needs_revision', 'urgent', 'manual', '2026-03-31', 30, v_admin, '2026-02-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t16,
    'Quyết toán thuế TNDN năm 2025 — Minh Phát',
    'Quyết toán thuế TNDN 2025. Cần tổng hợp BCTC đã kiểm toán. Chú ý phần chi phí XNK không hợp lệ cần loại.',
    c01, tt_qt_tndn, v_lan, v_admin,
    'pending_review', 'urgent', 'manual', '2026-04-30', 30, v_admin, '2026-02-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T17–T18: BÁO CÁO TÀI CHÍNH Q1/2026 ──────────────────────────────────

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t17,
    'Báo cáo tài chính Q1/2026 — Đại Phúc',
    'Lập BCTC quý 1 gồm BCĐKT, BCKQKD, BCLCTT. Đợi bảng tổng hợp TNCN T03 trước khi hoàn chỉnh.',
    c02, tt_bctc_quy, v_minh, v_admin,
    'pending_review', 'high', 'manual', '2026-05-15', 'Q1/2026', 10, v_admin, '2026-04-10 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t18,
    'Báo cáo tài chính Q1/2026 — Nhựa Đông Nam',
    'Hợp nhất BCTC từ 3 chi nhánh. Cần kiểm tra đối soát liên công ty trước.',
    c05, tt_bctc_quy, v_minh, v_admin,
    'needs_revision', 'high', 'manual', '2026-05-15', 'Q1/2026', 10, v_admin, '2026-04-10 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T19–T22: HÓA ĐƠN & ĐỐI SOÁT T04 ────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t19,
    'Nhập hóa đơn đầu vào tháng 04/2026 — Kỹ thuật Số',
    c04, tt_hd_vao, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-05', 'T04/2026',
    '2026-05-04 11:00:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t20,
    'Nhập hóa đơn đầu vào tháng 04/2026 — Thiên Ngân BĐS',
    c08, tt_hd_vao, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-05-05', 'T04/2026',
    '2026-05-05 15:00:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t21,
    'Đối soát sao kê ngân hàng tháng 04/2026 — Minh Phát',
    c01, tt_doi_soat, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-06', 'T04/2026',
    '2026-05-06 09:30:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, on_hold_reason, sla_days, created_by, created_at)
  VALUES (t22,
    'Đối soát sao kê ngân hàng tháng 04/2026 — Nhựa Đông Nam',
    'Đối soát 5 tài khoản ngân hàng. Phát hiện 3 giao dịch chưa hạch toán.',
    c05, tt_doi_soat, v_minh, v_admin,
    'on_hold', 'medium', 'auto', '2026-05-10', 'T04/2026',
    'Đang chờ sao kê bổ sung từ VietinBank chi nhánh Long An',
    5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T23–T26: CÁC TASK MANUAL ─────────────────────────────────────────────

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t23,
    'Kiểm tra công nợ phải thu Q1/2026 — Thiên Ngân BĐS',
    'Rà soát công nợ từ 12 hợp đồng môi giới. Ưu tiên 3 hợp đồng trên 1 tỷ.',
    c08, tt_cong_no, v_minh, v_admin,
    'in_progress', 'medium', 'manual', '2026-05-18', 7, v_admin, '2026-04-25 09:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t24,
    'Gia hạn giấy phép kinh doanh — Xanh Sạch',
    'Giấy phép hết hạn 30/4. Đang liên hệ Sở KHĐT. Cần bổ sung hồ sơ vệ sinh môi trường.',
    c09, tt_gplkd, v_lan, v_admin,
    'in_progress', 'urgent', 'manual', '2026-04-30', 21, v_admin, '2026-03-20 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t25,
    'Thay đổi đăng ký kinh doanh — Agile Software',
    'Bổ sung ngành nghề: tư vấn quản lý doanh nghiệp và phát triển AI. Cần họp HĐQT trước.',
    c14, tt_dkdn, v_minh, v_admin,
    'pending', 'high', 'manual', '2026-05-28', 14, v_admin, '2026-05-02 10:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t26,
    'Kiểm tra công nợ tháng 04/2026 — Minh Phát',
    c01, tt_cong_no, v_lan, v_admin,
    'completed', 'low', 'auto', '2026-05-08', 'T04/2026',
    '2026-05-08 16:00:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T27–T30: TNCN & MÔN BÀI ─────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t27,
    'Kê khai thuế TNCN tháng 04/2026 — Đại Phúc',
    c02, tt_tncn, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-06 14:00:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t28,
    'Kê khai thuế TNCN tháng 05/2026 — Đại Phúc',
    c02, tt_tncn, v_minh, v_admin,
    'pending', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t29,
    'Lưu trữ hồ sơ chứng từ Q1/2026 — Phúc An Y tế',
    c10, tt_luu_tru, v_hoa, v_admin,
    'pending', 'low', 'manual', '2026-05-31', 3, v_admin, '2026-05-05 09:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, completed_at, sla_days, created_by, created_at)
  VALUES (t30,
    'Kê khai thuế môn bài năm 2026 — Xanh Sạch',
    c09, tt_mon_bai, v_lan, v_admin,
    'completed', 'low', 'auto', '2026-01-31',
    '2026-01-28 10:00:00', 14, v_admin, '2026-01-05 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T31–T35: HÓA ĐƠN & LƯƠNG T05/2026 ──────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t31,
    'Nhập hóa đơn đầu vào tháng 05/2026 — Minh Phát',
    c01, tt_hd_vao, v_lan, v_admin,
    'pending', 'medium', 'auto', '2026-06-05', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t32,
    'Nhập hóa đơn đầu vào tháng 05/2026 — Đại Phúc',
    c02, tt_hd_vao, v_minh, v_admin,
    'pending', 'medium', 'auto', '2026-06-05', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t33,
    'Lập bảng lương tháng 05/2026 — Phúc An Y tế',
    'Tháng này có thưởng năng suất. Cần xác nhận số liệu từ trưởng bộ phận.',
    c10, tt_luong, v_hoa, v_admin,
    'in_progress', 'high', 'auto', '2026-05-12', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t34,
    'Đóng BHXH / BHYT tháng 05/2026 — Phúc An Y tế',
    c10, tt_bhxh, v_hoa, v_admin,
    'pending', 'medium', 'auto', '2026-05-25', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t35,
    'Kê khai thuế GTGT tháng 05/2026 — Phúc An Y tế',
    c10, tt_gtgt, v_hoa, v_admin,
    'pending', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T36–T40: BCTC NĂM & TƯƠNG LAI EDU ──────────────────────────────────

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, on_hold_reason, sla_days, created_by, created_at)
  VALUES (t36,
    'Báo cáo tài chính năm 2025 — Xanh Sạch',
    'Lập BCTC năm đầy đủ theo thông tư 200. Cần đợi kiểm toán viên xác nhận.',
    c09, tt_bctc_nam, v_lan, v_admin,
    'on_hold', 'medium', 'manual', '2026-04-30',
    'Đang chờ đơn vị kiểm toán cung cấp báo cáo kiểm toán độc lập',
    30, v_admin, '2026-02-15 09:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t37,
    'Kê khai thuế GTGT tháng 04/2026 — Tương Lai Edu',
    c12, tt_gtgt, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-06 10:00:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t38,
    'Kê khai thuế TNCN tháng 04/2026 — Tương Lai Edu',
    c12, tt_tncn, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-07', 'T04/2026',
    '2026-05-07 11:30:00', 7, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t39,
    'Lập bảng lương tháng 05/2026 — Tương Lai Edu',
    c12, tt_luong, v_lan, v_admin,
    'in_progress', 'high', 'auto', '2026-05-12', 'T05/2026', 5, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t40,
    'Kê khai thuế GTGT tháng 05/2026 — Tương Lai Edu',
    c12, tt_gtgt, v_lan, v_admin,
    'pending', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── T41–T45: LUXHOME & AGILE ─────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t41,
    'Đối soát sao kê ngân hàng tháng 04/2026 — LUXHOME',
    c15, tt_doi_soat, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-06', 'T04/2026',
    '2026-05-06 13:00:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t42,
    'Nhập hóa đơn đầu vào tháng 04/2026 — LUXHOME',
    c15, tt_hd_vao, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-05-05', 'T04/2026',
    '2026-05-05 09:30:00', 5, v_admin, '2026-04-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t43,
    'Kê khai thuế GTGT tháng 05/2026 — LUXHOME',
    c15, tt_gtgt, v_lan, v_admin,
    'pending', 'medium', 'auto', '2026-05-20', 'T05/2026', 7, v_admin, '2026-05-01 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, sla_days, created_by, created_at)
  VALUES (t44,
    'Kiểm tra công nợ tháng 04/2026 — Nhựa Đông Nam',
    'Phát sinh tranh chấp công nợ với đối tác. Cần tập hợp chứng từ gốc.',
    c05, tt_cong_no, v_minh, v_admin,
    'needs_revision', 'high', 'auto', '2026-04-15', 'T04/2026', 7, v_admin, '2026-04-08 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, description, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, sla_days, created_by, created_at)
  VALUES (t45,
    'Kê khai thuế nhà thầu Q1/2026 — Agile Software',
    'Kê khai thuế nhà thầu cho 2 đối tác công nghệ nước ngoài. Tổng giá trị hợp đồng ~800 triệu.',
    c14, tt_nha_thau, v_minh, v_admin,
    'in_progress', 'high', 'manual', '2026-05-30', 7, v_admin, '2026-04-20 10:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- CHECKLIST ITEMS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T01: GTGT T04 Minh Phát (completed) - checklist hoàn thành
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t01, 1, 'Tổng hợp hóa đơn đầu vào tháng 04', TRUE, v_lan, '2026-05-04 09:00:00'),
    (t01, 2, 'Tổng hợp doanh thu và hóa đơn đầu ra', TRUE, v_lan, '2026-05-04 10:30:00'),
    (t01, 3, 'Kiểm tra thuế NK phát sinh trong tháng', TRUE, v_lan, '2026-05-05 08:30:00'),
    (t01, 4, 'Lập tờ khai 01/GTGT trên HTKK', TRUE, v_lan, '2026-05-05 14:00:00'),
    (t01, 5, 'Nộp tờ khai và lưu biên lai điện tử', TRUE, v_lan, '2026-05-06 15:00:00')
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T04: GTGT T05 Minh Phát (pending_review) - checklist gần xong
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t04, 1, 'Tổng hợp hóa đơn đầu vào tháng 05', TRUE, v_lan, '2026-05-08 09:30:00'),
    (t04, 2, 'Tổng hợp doanh thu và hóa đơn đầu ra', TRUE, v_lan, '2026-05-09 10:00:00'),
    (t04, 3, 'Kiểm tra thuế NK phát sinh trong tháng', TRUE, v_lan, '2026-05-09 11:00:00'),
    (t04, 4, 'Lập tờ khai 01/GTGT trên HTKK', TRUE, v_lan, '2026-05-09 15:00:00'),
    (t04, 5, 'Nộp tờ khai và lưu biên lai điện tử', FALSE, NULL, NULL)
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T05: GTGT T05 Đại Phúc (in_progress) - đang làm
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t05, 1, 'Tổng hợp hóa đơn đầu vào tháng 05', TRUE, v_minh, '2026-05-08 10:00:00'),
    (t05, 2, 'Tổng hợp doanh thu và hóa đơn đầu ra', TRUE, v_minh, '2026-05-09 09:00:00'),
    (t05, 3, 'Lập tờ khai 01/GTGT trên HTKK', FALSE, NULL, NULL),
    (t05, 4, 'Nộp tờ khai và lưu biên lai điện tử', FALSE, NULL, NULL)
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T08: Bảng lương T04 Minh Phát (completed)
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t08, 1, 'Nhận dữ liệu chấm công từ HR', TRUE, v_lan, '2026-05-01 09:00:00'),
    (t08, 2, 'Tính lương cơ bản và phụ cấp', TRUE, v_lan, '2026-05-02 14:00:00'),
    (t08, 3, 'Tính BHXH và thuế TNCN', TRUE, v_lan, '2026-05-02 15:30:00'),
    (t08, 4, 'Phê duyệt bảng lương với giám đốc', TRUE, v_lan, '2026-05-03 11:00:00'),
    (t08, 5, 'Chuyển khoản lương', TRUE, v_lan, '2026-05-04 16:00:00')
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T16: QT TNDN Minh Phát (pending_review) - gần xong
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t16, 1, 'Thu thập BCTC đã kiểm toán năm 2025', TRUE, v_lan, '2026-04-02 09:00:00'),
    (t16, 2, 'Lập phụ biểu chi phí không được trừ', TRUE, v_lan, '2026-04-15 10:00:00'),
    (t16, 3, 'Tính thu nhập chịu thuế và số thuế phải nộp', TRUE, v_lan, '2026-04-20 14:00:00'),
    (t16, 4, 'Lập tờ khai quyết toán TNDN trên HTKK', TRUE, v_lan, '2026-04-25 15:00:00'),
    (t16, 5, 'Nộp tờ khai và nộp thuế bổ sung', FALSE, NULL, NULL),
    (t16, 6, 'Lưu hồ sơ quyết toán', FALSE, NULL, NULL)
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T15: QT TNCN Đại Phúc (needs_revision) - phát hiện lỗi
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t15, 1, 'Thu thập danh sách nhân viên và thu nhập năm 2025', TRUE, v_minh, '2026-02-15 09:00:00'),
    (t15, 2, 'Tổng hợp các khoản giảm trừ gia cảnh', TRUE, v_minh, '2026-02-20 10:00:00'),
    (t15, 3, 'Tính thuế TNCN theo biểu lũy tiến', TRUE, v_minh, '2026-03-01 14:00:00'),
    (t15, 4, 'Lập tờ khai quyết toán 02/QTT-TNCN', FALSE, NULL, NULL),
    (t15, 5, 'Tổng hợp danh sách uỷ quyền quyết toán', FALSE, NULL, NULL),
    (t15, 6, 'Nộp tờ khai và hoàn thuế (nếu có)', FALSE, NULL, NULL)
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T45: Thuế nhà thầu Agile (in_progress)
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t45, 1, 'Thu thập hợp đồng và invoice từ đối tác nước ngoài', TRUE, v_minh, '2026-04-22 10:00:00'),
    (t45, 2, 'Xác định phương pháp tính thuế (trực tiếp/khấu trừ)', TRUE, v_minh, '2026-04-25 14:00:00'),
    (t45, 3, 'Lập tờ khai thuế nhà thầu', FALSE, NULL, NULL),
    (t45, 4, 'Nộp tờ khai và thuế nhà thầu', FALSE, NULL, NULL)
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TASK DEPENDENCIES (phụ thuộc)
  -- task_id phụ thuộc vào depends_on_task_id (phải hoàn thành trước)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T17 (BCTC Q1 Đại Phúc) phụ thuộc vào T28 (TNCN T05 Đại Phúc) → BLOCKED (T28 pending)
  INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
  VALUES (t17, t28, v_admin)
  ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

  -- T18 (BCTC Q1 Nhựa ĐN) phụ thuộc vào T22 (Đối soát T04 Nhựa ĐN) → BLOCKED (T22 on_hold)
  INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
  VALUES (t18, t22, v_admin)
  ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

  -- T16 (QT TNDN Minh Phát) phụ thuộc vào T21 (Đối soát T04 Minh Phát) → OK (T21 completed)
  INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
  VALUES (t16, t21, v_admin)
  ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

  -- T04 (GTGT T05 Minh Phát) phụ thuộc vào T01 (GTGT T04 Minh Phát) → OK (T01 completed)
  INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
  VALUES (t04, t01, v_admin)
  ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- COMMENTS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T04: GTGT T05 Minh Phát (pending_review)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t04, v_lan, 'Đã tổng hợp xong hóa đơn đầu vào. Có 3 hóa đơn cần xác minh tính hợp lệ từ kho trước khi kê khai.', '2026-05-08 09:45:00'),
    (t04, v_admin, 'Lan kiểm tra lại hóa đơn từ NCC Đồng Tâm nhé — phòng kế toán Minh Phát đang dispute lô hàng T4.', '2026-05-08 11:00:00'),
    (t04, v_lan, 'Đã liên hệ Minh Phát. 2/3 hóa đơn xác nhận hợp lệ, 1 hóa đơn đang chờ phiếu nhập kho đính kèm. Tờ khai đã lập xong, chờ nộp.', '2026-05-09 15:30:00')
  ON CONFLICT DO NOTHING;

  -- T15: QT TNCN Đại Phúc (needs_revision)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t15, v_minh, 'Phát hiện 3 nhân viên có thu nhập từ 2 nguồn nhưng chưa khai tổng hợp. Cần bổ sung thêm chứng từ khấu trừ.', '2026-03-15 10:30:00'),
    (t15, v_admin, 'Vui lòng xử lý khẩn. Hạn nộp 31/3 sắp đến. Liên hệ phòng nhân sự Đại Phúc lấy đủ tài liệu.', '2026-03-20 09:00:00'),
    (t15, v_minh, 'HR Đại Phúc xác nhận có 3 người làm thêm dự án bên ngoài. Đang tập hợp hợp đồng và chứng từ khấu trừ. Cần thêm 1 tuần.', '2026-03-25 14:00:00'),
    (t15, v_admin, 'OK, nhớ gia hạn nộp tờ khai (có thể xin gia hạn 30 ngày theo điều 46 Luật QLT). Làm văn bản xin gia hạn ngay.', '2026-03-26 08:30:00')
  ON CONFLICT DO NOTHING;

  -- T22: Đối soát Nhựa Đông Nam (on_hold)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t22, v_minh, 'Đã đối soát 4/5 tài khoản. TK VietinBank chi nhánh Long An có 3 giao dịch cuối tháng chưa khớp với sổ phụ. Đang chờ sao kê chi tiết.', '2026-05-08 16:00:00'),
    (t22, v_admin, 'Liên hệ kế toán Nhựa Đông Nam lấy sao kê bổ sung nhé. Nếu quá 2026-05-15 chưa có thì báo lại để điều chỉnh plan.', '2026-05-09 09:00:00')
  ON CONFLICT DO NOTHING;

  -- T24: Gia hạn GPKD Xanh Sạch (overdue, in_progress)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t24, v_lan, 'Đã nộp hồ sơ lên Sở KHĐT ngày 2026-04-15. Cán bộ thụ lý yêu cầu bổ sung giấy chứng nhận PCCC mới (mới hết hạn 2026-02).', '2026-04-20 14:30:00'),
    (t24, v_admin, 'Quan trọng! Giấy phép đã hết hạn 30/4. Xanh Sạch cần giấy tờ này để ký hợp đồng mới. Ưu tiên số 1.', '2026-05-02 08:00:00'),
    (t24, v_lan, 'Đã hỗ trợ Xanh Sạch làm hồ sơ PCCC. Nộp bổ sung ngày 2026-05-08. Hẹn trả kết quả 2026-05-20.', '2026-05-08 17:00:00')
  ON CONFLICT DO NOTHING;

  -- T10: Bảng lương T05 Kỹ thuật Số (in_progress)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t10, v_lan, 'Đã nhận bảng chấm công. Có 2 nhân viên mới từ 2026-05-02, cần xác nhận mức lương chính thức từ HR.', '2026-05-09 10:00:00'),
    (t10, v_admin, 'Kế toán KTS sẽ gửi xác nhận hôm nay. Hạn chuyển lương là 12/5 nên cần đẩy nhanh.', '2026-05-09 11:30:00')
  ON CONFLICT DO NOTHING;

  -- T16: QT TNDN Minh Phát (pending_review)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t16, v_lan, 'Đã hoàn thành tờ khai. Số thuế TNDN bổ sung phải nộp khoảng 85 triệu. Chờ giám đốc ký trước khi nộp.', '2026-04-28 16:00:00'),
    (t16, v_admin, 'Nhắc Minh Phát ký sớm nhé. Nộp trước 30/4 để tránh phạt chậm nộp (0.03%/ngày).', '2026-04-29 08:00:00')
  ON CONFLICT DO NOTHING;

  -- T45: Thuế nhà thầu Agile (in_progress)
  INSERT INTO task_comments (task_id, user_id, content, created_at)
  VALUES
    (t45, v_minh, 'Xác nhận 2 nhà thầu nước ngoài: 1 công ty Singapore (thuế suất VAT 5% + TNDN 5%), 1 công ty Mỹ (theo Hiệp định tránh đánh thuế 2 lần).', '2026-04-23 14:00:00'),
    (t45, v_admin, 'Lưu ý Hiệp định Việt-Mỹ về thuế nhà thầu. Tư vấn Agile nộp đúng hạn tránh phạt.', '2026-04-24 09:00:00')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ACTIVITY LOGS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T01: Created + completed
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t01, v_admin, 'task_created', NULL, 'pending', '2026-04-28 08:00:00'),
    (t01, v_lan,  'status_changed', 'pending', 'in_progress', '2026-05-03 08:30:00'),
    (t01, v_lan,  'status_changed', 'in_progress', 'pending_review', '2026-05-05 14:30:00'),
    (t01, v_admin,'status_changed', 'pending_review', 'completed', '2026-05-06 15:30:00')
  ON CONFLICT DO NOTHING;

  -- T04: Created + in progress
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t04, v_admin, 'task_created', NULL, 'pending', '2026-05-01 08:00:00'),
    (t04, v_lan,  'status_changed', 'pending', 'in_progress', '2026-05-07 08:00:00'),
    (t04, v_lan,  'checklist_checked', NULL, NULL, '2026-05-08 09:45:00'),
    (t04, v_lan,  'comment_added', NULL, NULL, '2026-05-08 09:45:00'),
    (t04, v_lan,  'status_changed', 'in_progress', 'pending_review', '2026-05-09 15:30:00')
  ON CONFLICT DO NOTHING;

  -- T15: Nhiều hoạt động
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t15, v_admin,'task_created', NULL, 'pending', '2026-02-01 08:00:00'),
    (t15, v_minh, 'status_changed', 'pending', 'in_progress', '2026-02-10 09:00:00'),
    (t15, v_minh, 'checklist_checked', NULL, NULL, '2026-02-15 09:00:00'),
    (t15, v_minh, 'checklist_checked', NULL, NULL, '2026-02-20 10:00:00'),
    (t15, v_minh, 'checklist_checked', NULL, NULL, '2026-03-01 14:00:00'),
    (t15, v_minh, 'status_changed', 'in_progress', 'pending_review', '2026-03-10 16:00:00'),
    (t15, v_admin,'status_changed', 'pending_review', 'needs_revision', '2026-03-20 09:00:00'),
    (t15, v_minh, 'comment_added', NULL, NULL, '2026-03-25 14:00:00')
  ON CONFLICT DO NOTHING;

  -- T22: on_hold
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t22, v_admin, 'task_created', NULL, 'pending', '2026-04-28 08:00:00'),
    (t22, v_minh,  'status_changed', 'pending', 'in_progress', '2026-05-06 09:00:00'),
    (t22, v_minh,  'status_changed', 'in_progress', 'on_hold', '2026-05-08 16:30:00')
  ON CONFLICT DO NOTHING;

  -- T24: urgent overdue in_progress
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t24, v_admin, 'task_created', NULL, 'pending', '2026-03-20 08:00:00'),
    (t24, v_lan,  'status_changed', 'pending', 'in_progress', '2026-04-01 08:00:00'),
    (t24, v_lan,  'comment_added', NULL, NULL, '2026-04-20 14:30:00'),
    (t24, v_lan,  'comment_added', NULL, NULL, '2026-05-08 17:00:00')
  ON CONFLICT DO NOTHING;

  -- T16: pending_review
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t16, v_admin,'task_created', NULL, 'pending', '2026-02-01 08:00:00'),
    (t16, v_lan,  'status_changed', 'pending', 'in_progress', '2026-04-01 09:00:00'),
    (t16, v_lan,  'dependency_added', NULL, NULL, '2026-04-01 09:05:00'),
    (t16, v_lan,  'checklist_checked', NULL, NULL, '2026-04-15 10:00:00'),
    (t16, v_lan,  'checklist_checked', NULL, NULL, '2026-04-20 14:00:00'),
    (t16, v_lan,  'checklist_checked', NULL, NULL, '2026-04-25 15:00:00'),
    (t16, v_lan,  'status_changed', 'in_progress', 'pending_review', '2026-04-28 16:00:00')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TIME LOGS
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T01: GTGT T04 Minh Phát (completed)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t01, v_lan, 1.5, 'Tổng hợp hóa đơn đầu vào', '2026-05-04'),
    (t01, v_lan, 2.0, 'Lập tờ khai và kiểm tra', '2026-05-05'),
    (t01, v_lan, 0.5, 'Nộp và lưu biên lai', '2026-05-06')
  ON CONFLICT DO NOTHING;

  -- T08: Bảng lương T04 Minh Phát (completed)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t08, v_lan, 2.0, 'Tính lương cơ bản và phụ cấp', '2026-05-02'),
    (t08, v_lan, 1.5, 'Tính BHXH và thuế TNCN', '2026-05-02'),
    (t08, v_lan, 0.5, 'Phê duyệt và chuyển khoản', '2026-05-04')
  ON CONFLICT DO NOTHING;

  -- T15: QT TNCN Đại Phúc (needs_revision)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t15, v_minh, 3.0, 'Thu thập và tổng hợp danh sách nhân viên', '2026-02-15'),
    (t15, v_minh, 2.5, 'Tính thuế TNCN biểu lũy tiến', '2026-03-01'),
    (t15, v_minh, 1.5, 'Xử lý 3 trường hợp đặc biệt có thu nhập 2 nguồn', '2026-03-25')
  ON CONFLICT DO NOTHING;

  -- T16: QT TNDN Minh Phát (pending_review)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t16, v_lan, 4.0, 'Tổng hợp BCTC và lập phụ biểu chi phí', '2026-04-15'),
    (t16, v_lan, 3.0, 'Tính thuế và lập tờ khai HTKK', '2026-04-25'),
    (t16, v_lan, 1.0, 'Kiểm tra lần cuối và hoàn thiện hồ sơ', '2026-04-28')
  ON CONFLICT DO NOTHING;

  -- T24: Gia hạn GPKD Xanh Sạch (urgent overdue)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t24, v_lan, 2.0, 'Chuẩn bị hồ sơ và nộp lần đầu', '2026-04-15'),
    (t24, v_lan, 1.5, 'Bổ sung hồ sơ PCCC theo yêu cầu', '2026-05-08')
  ON CONFLICT DO NOTHING;

  -- T45: Thuế nhà thầu Agile (in_progress)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t45, v_minh, 2.0, 'Nghiên cứu Hiệp định tránh đánh thuế Việt-Mỹ', '2026-04-22'),
    (t45, v_minh, 1.5, 'Phân tích hợp đồng và xác định căn cứ tính thuế', '2026-04-25')
  ON CONFLICT DO NOTHING;

  -- T17: BCTC Q1 Đại Phúc (pending_review)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t17, v_minh, 5.0, 'Lập BCĐKT và BCKQKD Q1', '2026-05-05'),
    (t17, v_minh, 2.5, 'Kiểm tra số liệu và đối chiếu với sổ cái', '2026-05-07')
  ON CONFLICT DO NOTHING;

  -- T10: Bảng lương T05 Kỹ thuật Số (in_progress)
  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t10, v_lan, 1.5, 'Nhận và kiểm tra bảng chấm công', '2026-05-09')
  ON CONFLICT DO NOTHING;

END $$;
