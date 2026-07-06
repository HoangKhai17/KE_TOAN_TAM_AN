-- ─────────────────────────────────────────────────────────────────────────────
-- 007_demo_extended.sql — Dữ liệu demo mở rộng:
--   • 20 tasks tháng 03/2026 (tất cả hoàn thành)
--   • Kỳ lương T03/2026 (đã thanh toán), T04/2026 (đã xác nhận), T05/2026 (nháp)
--   • Bản ghi lương cho 4 nhân viên nội bộ mỗi kỳ
-- Idempotent: ON CONFLICT DO NOTHING
-- Yêu cầu: 001–006 seeds phải chạy trước
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- Staff
  v_admin uuid;
  v_lan   uuid;
  v_minh  uuid;
  v_hoa   uuid;

  -- Task type IDs
  tt_gtgt     uuid;
  tt_tncn     uuid;
  tt_luong    uuid;
  tt_bhxh     uuid;
  tt_hd_vao   uuid;
  tt_doi_soat uuid;
  tt_cong_no  uuid;

  -- Company shortcuts
  c01 uuid := 'c0000000-0000-0000-0000-000000000001'; -- Minh Phát
  c02 uuid := 'c0000000-0000-0000-0000-000000000002'; -- Đại Phúc
  c04 uuid := 'c0000000-0000-0000-0000-000000000004'; -- Kỹ thuật Số
  c05 uuid := 'c0000000-0000-0000-0000-000000000005'; -- Nhựa Đông Nam
  c08 uuid := 'c0000000-0000-0000-0000-000000000008'; -- Thiên Ngân BĐS
  c09 uuid := 'c0000000-0000-0000-0000-000000000009'; -- Xanh Sạch
  c10 uuid := 'c0000000-0000-0000-0000-000000000010'; -- Phúc An Y tế
  c12 uuid := 'c0000000-0000-0000-0000-000000000012'; -- Tương Lai Edu
  c15 uuid := 'c0000000-0000-0000-0000-000000000015'; -- LUXHOME

  -- Task IDs — T03/2026 (t46–t65)
  t46 uuid := 'f0000000-0000-0000-0000-000000000046';
  t47 uuid := 'f0000000-0000-0000-0000-000000000047';
  t48 uuid := 'f0000000-0000-0000-0000-000000000048';
  t49 uuid := 'f0000000-0000-0000-0000-000000000049';
  t50 uuid := 'f0000000-0000-0000-0000-000000000050';
  t51 uuid := 'f0000000-0000-0000-0000-000000000051';
  t52 uuid := 'f0000000-0000-0000-0000-000000000052';
  t53 uuid := 'f0000000-0000-0000-0000-000000000053';
  t54 uuid := 'f0000000-0000-0000-0000-000000000054';
  t55 uuid := 'f0000000-0000-0000-0000-000000000055';
  t56 uuid := 'f0000000-0000-0000-0000-000000000056';
  t57 uuid := 'f0000000-0000-0000-0000-000000000057';
  t58 uuid := 'f0000000-0000-0000-0000-000000000058';
  t59 uuid := 'f0000000-0000-0000-0000-000000000059';
  t60 uuid := 'f0000000-0000-0000-0000-000000000060';
  t61 uuid := 'f0000000-0000-0000-0000-000000000061';
  t62 uuid := 'f0000000-0000-0000-0000-000000000062';
  t63 uuid := 'f0000000-0000-0000-0000-000000000063';
  t64 uuid := 'f0000000-0000-0000-0000-000000000064';
  t65 uuid := 'f0000000-0000-0000-0000-000000000065';

  -- Payroll period IDs
  pp03 uuid := 'b0000000-0000-0000-0000-000000000001'; -- T03/2026
  pp04 uuid := 'b0000000-0000-0000-0000-000000000002'; -- T04/2026
  pp05 uuid := 'b0000000-0000-0000-0000-000000000003'; -- T05/2026

  -- Payroll record IDs
  pr01 uuid := 'e0000000-0000-0000-0000-000000000001'; -- T03 — admin
  pr02 uuid := 'e0000000-0000-0000-0000-000000000002'; -- T03 — lan
  pr03 uuid := 'e0000000-0000-0000-0000-000000000003'; -- T03 — minh
  pr04 uuid := 'e0000000-0000-0000-0000-000000000004'; -- T03 — hoa
  pr05 uuid := 'e0000000-0000-0000-0000-000000000005'; -- T04 — admin
  pr06 uuid := 'e0000000-0000-0000-0000-000000000006'; -- T04 — lan
  pr07 uuid := 'e0000000-0000-0000-0000-000000000007'; -- T04 — minh
  pr08 uuid := 'e0000000-0000-0000-0000-000000000008'; -- T04 — hoa
  pr09 uuid := 'e0000000-0000-0000-0000-000000000009'; -- T05 — admin
  pr10 uuid := 'e0000000-0000-0000-0000-000000000010'; -- T05 — lan
  pr11 uuid := 'e0000000-0000-0000-0000-000000000011'; -- T05 — minh
  pr12 uuid := 'e0000000-0000-0000-0000-000000000012'; -- T05 — hoa

BEGIN
  -- ── Lookup users ─────────────────────────────────────────────────────────────
  SELECT id INTO v_admin FROM users WHERE email = 'admin@ketoan-taman.vn'        LIMIT 1;
  SELECT id INTO v_lan   FROM users WHERE email = 'lan.nguyen@ketoan-taman.vn'   LIMIT 1;
  SELECT id INTO v_minh  FROM users WHERE email = 'minh.tran@ketoan-taman.vn'    LIMIT 1;
  SELECT id INTO v_hoa   FROM users WHERE email = 'hoa.le@ketoan-taman.vn'       LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin user not found — run 001_admin_user.sql first';
  END IF;

  -- ── Lookup task types ─────────────────────────────────────────────────────────
  SELECT id INTO tt_gtgt     FROM task_types WHERE name = 'Kê khai thuế GTGT'        LIMIT 1;
  SELECT id INTO tt_tncn     FROM task_types WHERE name = 'Kê khai thuế TNCN'         LIMIT 1;
  SELECT id INTO tt_luong    FROM task_types WHERE name = 'Lập bảng lương'            LIMIT 1;
  SELECT id INTO tt_bhxh     FROM task_types WHERE name = 'Đóng BHXH / BHYT'          LIMIT 1;
  SELECT id INTO tt_hd_vao   FROM task_types WHERE name = 'Nhập hóa đơn đầu vào'      LIMIT 1;
  SELECT id INTO tt_doi_soat FROM task_types WHERE name = 'Đối soát sao kê ngân hàng' LIMIT 1;
  SELECT id INTO tt_cong_no  FROM task_types WHERE name = 'Kiểm tra công nợ'          LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TASKS T03/2026 — TẤT CẢ ĐÃ HOÀN THÀNH
  -- ═══════════════════════════════════════════════════════════════════════════

  -- ── GTGT T03/2026 ────────────────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t46,
    'Kê khai thuế GTGT tháng 03/2026 — Minh Phát',
    c01, tt_gtgt, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-10 10:30:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t47,
    'Kê khai thuế GTGT tháng 03/2026 — Đại Phúc',
    c02, tt_gtgt, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-12 14:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t48,
    'Kê khai thuế GTGT tháng 03/2026 — Nhựa Đông Nam',
    c05, tt_gtgt, v_minh, v_admin,
    'completed', 'high', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-15 09:30:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t49,
    'Kê khai thuế GTGT tháng 03/2026 — Tương Lai Edu',
    c12, tt_gtgt, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-11 11:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t50,
    'Kê khai thuế GTGT tháng 03/2026 — LUXHOME',
    c15, tt_gtgt, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-13 15:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── BẢNG LƯƠNG T03/2026 ──────────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t51,
    'Lập bảng lương tháng 03/2026 — Minh Phát',
    c01, tt_luong, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-03 17:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t52,
    'Lập bảng lương tháng 03/2026 — Đại Phúc',
    c02, tt_luong, v_minh, v_admin,
    'completed', 'high', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-04 16:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t53,
    'Lập bảng lương tháng 03/2026 — Kỹ thuật Số',
    c04, tt_luong, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-04 14:30:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t54,
    'Lập bảng lương tháng 03/2026 — Phúc An Y tế',
    c10, tt_luong, v_hoa, v_admin,
    'completed', 'high', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-03 15:30:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── BHXH T03/2026 ────────────────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t55,
    'Đóng BHXH / BHYT tháng 03/2026 — Minh Phát',
    c01, tt_bhxh, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-04-08', 'T03/2026',
    '2026-04-07 10:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t56,
    'Đóng BHXH / BHYT tháng 03/2026 — Đại Phúc',
    c02, tt_bhxh, v_minh, v_admin,
    'completed', 'high', 'auto', '2026-04-08', 'T03/2026',
    '2026-04-08 09:30:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t57,
    'Đóng BHXH / BHYT tháng 03/2026 — Kỹ thuật Số',
    c04, tt_bhxh, v_lan, v_admin,
    'completed', 'high', 'auto', '2026-04-08', 'T03/2026',
    '2026-04-07 14:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── HÓA ĐƠN ĐẦU VÀO T03/2026 ────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t58,
    'Nhập hóa đơn đầu vào tháng 03/2026 — Minh Phát',
    c01, tt_hd_vao, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-03 11:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t59,
    'Nhập hóa đơn đầu vào tháng 03/2026 — Thiên Ngân BĐS',
    c08, tt_hd_vao, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-04 10:30:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t60,
    'Nhập hóa đơn đầu vào tháng 03/2026 — LUXHOME',
    c15, tt_hd_vao, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-05', 'T03/2026',
    '2026-04-04 09:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── ĐỐI SOÁT SAO KÊ T03/2026 ────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t61,
    'Đối soát sao kê ngân hàng tháng 03/2026 — Đại Phúc',
    c02, tt_doi_soat, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-04-06', 'T03/2026',
    '2026-04-05 16:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t62,
    'Đối soát sao kê ngân hàng tháng 03/2026 — Nhựa Đông Nam',
    c05, tt_doi_soat, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-04-06', 'T03/2026',
    '2026-04-06 11:00:00', 5, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ── TNCN & CÔNG NỢ T03/2026 ──────────────────────────────────────────────────

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t63,
    'Kê khai thuế TNCN tháng 03/2026 — Đại Phúc',
    c02, tt_tncn, v_minh, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-12 10:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t64,
    'Kê khai thuế TNCN tháng 03/2026 — Tương Lai Edu',
    c12, tt_tncn, v_lan, v_admin,
    'completed', 'medium', 'auto', '2026-04-20', 'T03/2026',
    '2026-04-11 09:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (id, title, company_id, task_type_id, assigned_to, assigned_by,
    status, priority, source, due_date, period_label, completed_at, sla_days, created_by, created_at)
  VALUES (t65,
    'Kiểm tra công nợ tháng 03/2026 — Thiên Ngân BĐS',
    c08, tt_cong_no, v_minh, v_admin,
    'completed', 'low', 'auto', '2026-04-15', 'T03/2026',
    '2026-04-14 15:00:00', 7, v_admin, '2026-03-28 08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- CHECKLIST ITEMS — T03/2026
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T46: GTGT T03 Minh Phát (completed)
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t46, 1, 'Tổng hợp hóa đơn đầu vào tháng 03', TRUE, v_lan, '2026-04-08 09:00:00'),
    (t46, 2, 'Tổng hợp doanh thu và hóa đơn đầu ra', TRUE, v_lan, '2026-04-08 11:00:00'),
    (t46, 3, 'Kiểm tra thuế NK phát sinh trong tháng', TRUE, v_lan, '2026-04-09 08:30:00'),
    (t46, 4, 'Lập tờ khai 01/GTGT trên HTKK', TRUE, v_lan, '2026-04-09 14:00:00'),
    (t46, 5, 'Nộp tờ khai và lưu biên lai điện tử', TRUE, v_lan, '2026-04-10 10:00:00')
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- T51: Bảng lương T03 Minh Phát (completed)
  INSERT INTO task_checklist_items (task_id, step_order, step_text, is_completed, completed_by, completed_at)
  VALUES
    (t51, 1, 'Nhận dữ liệu chấm công từ HR', TRUE, v_lan, '2026-04-01 09:00:00'),
    (t51, 2, 'Tính lương cơ bản và phụ cấp', TRUE, v_lan, '2026-04-02 10:00:00'),
    (t51, 3, 'Tính BHXH và thuế TNCN', TRUE, v_lan, '2026-04-02 14:00:00'),
    (t51, 4, 'Phê duyệt bảng lương với giám đốc', TRUE, v_lan, '2026-04-03 11:00:00'),
    (t51, 5, 'Chuyển khoản lương', TRUE, v_lan, '2026-04-03 16:30:00')
  ON CONFLICT (task_id, step_order) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ACTIVITY LOGS — T03/2026
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T46: GTGT T03 Minh Phát
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t46, v_admin, 'task_created', NULL, 'pending', '2026-03-28 08:00:00'),
    (t46, v_lan,  'status_changed', 'pending', 'in_progress', '2026-04-07 08:00:00'),
    (t46, v_lan,  'status_changed', 'in_progress', 'pending_review', '2026-04-09 14:30:00'),
    (t46, v_admin,'status_changed', 'pending_review', 'completed', '2026-04-10 10:30:00')
  ON CONFLICT DO NOTHING;

  -- T51: Bảng lương T03 Minh Phát
  INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, created_at)
  VALUES
    (t51, v_admin, 'task_created', NULL, 'pending', '2026-03-28 08:00:00'),
    (t51, v_lan,  'status_changed', 'pending', 'in_progress', '2026-04-01 09:00:00'),
    (t51, v_lan,  'status_changed', 'in_progress', 'completed', '2026-04-03 17:00:00')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TIME LOGS — T03/2026
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
  VALUES
    (t46, v_lan, 1.5, 'Tổng hợp hóa đơn đầu vào', '2026-04-08'),
    (t46, v_lan, 2.0, 'Lập tờ khai và kiểm tra', '2026-04-09'),
    (t46, v_lan, 0.5, 'Nộp và lưu biên lai', '2026-04-10'),
    (t47, v_minh, 2.0, 'Kê khai GTGT T03 Đại Phúc', '2026-04-12'),
    (t51, v_lan, 1.5, 'Tính lương và phụ cấp', '2026-04-02'),
    (t51, v_lan, 1.0, 'Tính BHXH, TNCN và chuyển khoản', '2026-04-03'),
    (t52, v_minh, 2.0, 'Lập bảng lương T03 Đại Phúc', '2026-04-04'),
    (t55, v_lan, 1.0, 'Kê khai và nộp BHXH T03 Minh Phát', '2026-04-07'),
    (t63, v_minh, 1.5, 'Kê khai TNCN T03 Đại Phúc', '2026-04-12')
  ON CONFLICT DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- KỲ LƯƠNG (PAYROLL PERIODS)
  -- INSERT nếu chưa tồn tại, sau đó SELECT lại ID thực tế (có thể khác UUID cố định
  -- nếu kỳ lương đã được tạo trước qua UI hoặc seed trước đó).
  -- ═══════════════════════════════════════════════════════════════════════════

  -- T03/2026 — Đã thanh toán
  INSERT INTO payroll_periods (id, period_year, period_month, start_date, end_date,
    status, notes, created_by, confirmed_by, confirmed_at, created_at, updated_at)
  VALUES (pp03, 2026, 3, '2026-03-01', '2026-03-31',
    'paid', 'Kỳ lương tháng 03/2026 — đã hoàn tất',
    v_admin, v_admin, '2026-04-05 10:00:00', '2026-03-28 09:00:00', '2026-04-10 15:00:00')
  ON CONFLICT (period_year, period_month) DO NOTHING;
  SELECT id INTO pp03 FROM payroll_periods WHERE period_year = 2026 AND period_month = 3;

  -- T04/2026 — Đã xác nhận
  INSERT INTO payroll_periods (id, period_year, period_month, start_date, end_date,
    status, notes, created_by, confirmed_by, confirmed_at, created_at, updated_at)
  VALUES (pp04, 2026, 4, '2026-04-01', '2026-04-30',
    'confirmed', 'Kỳ lương tháng 04/2026 — đã xác nhận, chờ thanh toán',
    v_admin, v_admin, '2026-05-05 09:00:00', '2026-04-28 09:00:00', '2026-05-05 09:00:00')
  ON CONFLICT (period_year, period_month) DO NOTHING;
  SELECT id INTO pp04 FROM payroll_periods WHERE period_year = 2026 AND period_month = 4;

  -- T05/2026 — Nháp
  INSERT INTO payroll_periods (id, period_year, period_month, start_date, end_date,
    status, notes, created_by, created_at, updated_at)
  VALUES (pp05, 2026, 5, '2026-05-01', '2026-05-31',
    'draft', 'Kỳ lương tháng 05/2026 — có thưởng Ngày Lao động 01/5',
    v_admin, '2026-05-02 08:00:00', '2026-05-02 08:00:00')
  ON CONFLICT (period_year, period_month) DO NOTHING;
  SELECT id INTO pp05 FROM payroll_periods WHERE period_year = 2026 AND period_month = 5;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BẢN GHI LƯƠNG (PAYROLL RECORDS)
  -- Lương nội bộ Kế Toán Tâm An:
  --   Admin (Trưởng phòng): lương cơ bản 20tr, phụ cấp 3tr
  --   Minh (Kế toán trưởng): lương cơ bản 15tr, phụ cấp 2tr
  --   Lan, Hoa (Kế toán viên): lương cơ bản 12tr, phụ cấp 1.5tr
  --
  -- Khấu trừ:
  --   BHXH NV 8%, BHYT NV 1.5%, BHTN NV 1% (tính trên lương cơ bản)
  --   BHXH CT 17.5%, BHYT CT 3%, BHTN CT 1%
  --   Thuế TNCN tính theo biểu lũy tiến (giảm trừ bản thân 11tr)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- ── T03/2026 — đã thanh toán ─────────────────────────────────────────────────

  -- Admin T03
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr01, pp03, v_admin,
    20000000, 3000000, 0,
    1600000, 300000, 200000,
    3500000, 600000, 200000,
    740000, 0,
    'Tháng 03/2026', v_admin, '2026-04-02 09:00:00', '2026-04-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Lan T03
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr02, pp03, v_lan,
    12000000, 1500000, 0,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    62000, 0,
    'Tháng 03/2026', v_admin, '2026-04-02 09:00:00', '2026-04-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Minh T03
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr03, pp03, v_minh,
    15000000, 2000000, 0,
    1200000, 225000, 150000,
    2625000, 450000, 150000,
    221000, 0,
    'Tháng 03/2026', v_admin, '2026-04-02 09:00:00', '2026-04-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Hoa T03
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr04, pp03, v_hoa,
    12000000, 1500000, 0,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    62000, 0,
    'Tháng 03/2026', v_admin, '2026-04-02 09:00:00', '2026-04-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- ── T04/2026 — đã xác nhận ───────────────────────────────────────────────────

  -- Admin T04
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr05, pp04, v_admin,
    20000000, 3000000, 0,
    1600000, 300000, 200000,
    3500000, 600000, 200000,
    740000, 0,
    'Tháng 04/2026', v_admin, '2026-05-02 09:00:00', '2026-05-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Lan T04
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr06, pp04, v_lan,
    12000000, 1500000, 0,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    62000, 0,
    'Tháng 04/2026', v_admin, '2026-05-02 09:00:00', '2026-05-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Minh T04
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr07, pp04, v_minh,
    15000000, 2000000, 0,
    1200000, 225000, 150000,
    2625000, 450000, 150000,
    221000, 0,
    'Tháng 04/2026', v_admin, '2026-05-02 09:00:00', '2026-05-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Hoa T04
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr08, pp04, v_hoa,
    12000000, 1500000, 0,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    62000, 0,
    'Tháng 04/2026', v_admin, '2026-05-02 09:00:00', '2026-05-02 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- ── T05/2026 — nháp (có thưởng Ngày Lao động) ────────────────────────────────

  -- Admin T05 (thưởng 2tr)
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr09, pp05, v_admin,
    20000000, 3000000, 2000000,
    1600000, 300000, 200000,
    3500000, 600000, 200000,
    1035000, 0,
    'Tháng 05/2026 — thưởng Ngày Lao động 01/5', v_admin, '2026-05-10 09:00:00', '2026-05-10 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Lan T05 (thưởng 1tr)
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr10, pp05, v_lan,
    12000000, 1500000, 1000000,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    112000, 0,
    'Tháng 05/2026 — thưởng Ngày Lao động 01/5', v_admin, '2026-05-10 09:00:00', '2026-05-10 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Minh T05 (thưởng 1.5tr)
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr11, pp05, v_minh,
    15000000, 2000000, 1500000,
    1200000, 225000, 150000,
    2625000, 450000, 150000,
    343000, 0,
    'Tháng 05/2026 — thưởng Ngày Lao động 01/5', v_admin, '2026-05-10 09:00:00', '2026-05-10 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

  -- Hoa T05 (thưởng 1tr)
  INSERT INTO payroll_records (id, payroll_period_id, user_id,
    base_salary, allowances, bonus,
    bhxh_employee, bhyt_employee, bhtn_employee,
    bhxh_employer, bhyt_employer, bhtn_employer,
    pit_deduction, other_deductions,
    notes, created_by, created_at, updated_at)
  VALUES (pr12, pp05, v_hoa,
    12000000, 1500000, 1000000,
    960000, 180000, 120000,
    2100000, 360000, 120000,
    112000, 0,
    'Tháng 05/2026 — thưởng Ngày Lao động 01/5', v_admin, '2026-05-10 09:00:00', '2026-05-10 09:00:00')
  ON CONFLICT (payroll_period_id, user_id) DO NOTHING;

END $$;
