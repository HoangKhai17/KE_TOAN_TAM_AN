-- ============================================================
-- DEMO SEED: Dữ liệu chấm công tháng 12/2025 – 19/05/2026
-- Mục đích: Sinh dữ liệu mẫu để test hệ thống chấm công
-- Chạy lệnh:
--   docker compose exec -T postgres psql -U ktta_user -d ktta_db \
--     < backend/migrations/seed_attendance_demo.sql
-- ============================================================

BEGIN;

-- ── Xóa dữ liệu demo cũ trong khoảng thời gian này ────────
-- Xóa adjustments trước để tránh vi phạm foreign key
DELETE FROM attendance_adjustments
  WHERE attendance_record_id IN (
    SELECT id FROM attendance_records
    WHERE work_date BETWEEN '2025-12-01' AND '2026-05-19'
  );

DELETE FROM attendance_records
  WHERE work_date BETWEEN '2025-12-01' AND '2026-05-19';

DELETE FROM attendance_logs
  WHERE logged_at >= '2025-12-01' AND logged_at < '2026-05-20';

DELETE FROM overtime_requests
  WHERE ot_date BETWEEN '2025-12-01' AND '2026-05-19';

DELETE FROM leave_requests
  WHERE start_date >= '2025-12-01' AND end_date <= '2026-05-19';

DELETE FROM work_schedules
  WHERE work_date BETWEEN '2025-12-01' AND '2026-05-19';

-- ── Khối PL/pgSQL chính ────────────────────────────────────
DO $$
DECLARE
  -- Ca Hành Chính 08:00–17:00 (dung sai 15 phút)
  SHIFT_HC  CONSTANT UUID := 'f11466d8-fb3b-4d71-b3c3-31f71c2003f3';
  -- Admin hệ thống (tạo lịch)
  ADMIN_SYS CONSTANT UUID := '508f2448-8a9a-4036-aa64-02e7051c2766';
  -- Admin thứ hai (duyệt một số đơn)
  ADMIN_THO CONSTANT UUID := 'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f';

  -- Ngày lễ trong khoảng Dec 2025 – May 2026 (lấy từ bảng public_holidays)
  HOLIDAYS CONSTANT DATE[] := ARRAY[
    '2026-01-01'::DATE,  -- Tết Dương Lịch (Thứ 5)
    '2026-01-27'::DATE,  -- Tết (29 Chạp – Thứ 3)
    '2026-01-28'::DATE,  -- Tết (30 Chạp – Thứ 4)
    '2026-01-29'::DATE,  -- Tết Mùng 1 (Thứ 5)
    '2026-01-30'::DATE,  -- Tết Mùng 2 (Thứ 6)
    '2026-01-31'::DATE,  -- Tết Mùng 3 (Thứ 7 – cuối tuần)
    '2026-02-01'::DATE,  -- Tết Mùng 4 (Chủ Nhật – cuối tuần)
    '2026-02-02'::DATE,  -- Tết Mùng 5 (Thứ 2)
    '2026-04-16'::DATE,  -- Giỗ Tổ Hùng Vương (Thứ 5)
    '2026-04-30'::DATE,  -- Giải Phóng Miền Nam (Thứ 5)
    '2026-05-01'::DATE   -- Quốc Tế Lao Động (Thứ 6)
  ];

  -- Toàn bộ 7 nhân viên (2 admin + 5 staff)
  ALL_USERS CONSTANT UUID[] := ARRAY[
    'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f'::UUID,  -- Hà Văn Thọ (admin)
    '508f2448-8a9a-4036-aa64-02e7051c2766'::UUID,  -- Quản trị viên (admin)
    '81e35ff6-38d6-45bf-b66a-ad2269e1c50e'::UUID,  -- Bảo Phúc (staff)
    'a1000000-0000-0000-0000-000000000001'::UUID,  -- Nguyễn Thị Lan (staff)
    'a1000000-0000-0000-0000-000000000002'::UUID,  -- Trần Văn Minh (staff)
    'a1000000-0000-0000-0000-000000000003'::UUID,  -- Lê Thị Hoa (staff)
    '03122a21-b40c-4715-b61a-613771a8018d'::UUID   -- hermorni (staff)
  ];

  -- UUID cho các đơn nghỉ phép cần link vào attendance_records
  LR_PHUC1 UUID;  -- Bảo Phúc: phép năm Dec 15–16
  LR_MINH1 UUID;  -- Trần Văn Minh: phép năm Jan 5–6
  LR_HOA1  UUID;  -- Lê Thị Hoa: nghỉ ốm Feb 10
  LR_LAN1  UUID;  -- Nguyễn Thị Lan: WFH Mar 3
  LR_HER1  UUID;  -- hermorni: nghỉ ốm Mar 16–17
  LR_THO1  UUID;  -- Hà Văn Thọ: phép năm Apr 22–23
  LR_QTV1  UUID;  -- Quản trị viên: phép năm May 5–6

  uid  UUID;
  d    DATE;
  r    FLOAT;
  s    attendance_status;
  ci   TIMESTAMP;
  co   TIMESTAMP;
  lm   INT;   -- late_minutes
  em   INT;   -- early_minutes
  ah   NUMERIC(4,2);
  lr_id UUID;
  is_off BOOLEAN;

BEGIN
  -- Cố định seed để kết quả tái hiện được
  PERFORM setseed(0.42);

  -- Khởi tạo UUID cho leave requests
  LR_PHUC1 := gen_random_uuid();
  LR_MINH1 := gen_random_uuid();
  LR_HOA1  := gen_random_uuid();
  LR_LAN1  := gen_random_uuid();
  LR_HER1  := gen_random_uuid();
  LR_THO1  := gen_random_uuid();
  LR_QTV1  := gen_random_uuid();

  -- ────────────────────────────────────────────────────────
  -- BƯỚC 1: LỊCH LÀM VIỆC (work_schedules)
  -- ────────────────────────────────────────────────────────
  FOREACH uid IN ARRAY ALL_USERS LOOP
    FOR d IN
      SELECT gs::DATE
      FROM generate_series(
        '2025-12-01'::TIMESTAMPTZ,
        '2026-05-19'::TIMESTAMPTZ,
        '1 day'::INTERVAL
      ) gs
    LOOP
      is_off := (EXTRACT(DOW FROM d) IN (0, 6)) OR (d = ANY(HOLIDAYS));
      INSERT INTO work_schedules (user_id, work_date, shift_id, is_day_off, created_by)
      VALUES (
        uid, d,
        CASE WHEN is_off THEN NULL ELSE SHIFT_HC END,
        is_off,
        ADMIN_SYS
      )
      ON CONFLICT (user_id, work_date) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ────────────────────────────────────────────────────────
  -- BƯỚC 2: ĐƠN NGHỈ PHÉP (leave_requests)
  -- ────────────────────────────────────────────────────────

  -- Bảo Phúc: Phép năm Thứ 2-3 15–16/12/2025 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_PHUC1, '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'annual',
     '2025-12-15', '2025-12-16', 2.0,
     'Nghỉ phép năm 2025 còn tồn, đi thăm gia đình',
     'approved', ADMIN_SYS,
     '2025-12-10 10:00:00', '2025-12-09 08:30:00', '2025-12-10 10:00:00');

  -- Trần Văn Minh: Phép năm Thứ 2-3 05–06/01/2026 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_MINH1, 'a1000000-0000-0000-0000-000000000002', 'annual',
     '2026-01-05', '2026-01-06', 2.0,
     'Nghỉ phép đầu năm mới, thu xếp công việc cá nhân',
     'approved', ADMIN_SYS,
     '2025-12-28 09:00:00', '2025-12-26 10:00:00', '2025-12-28 09:00:00');

  -- Trần Văn Minh: WFH Thứ 3 03/02/2026 (chờ duyệt)
  INSERT INTO leave_requests
    (user_id, leave_type, start_date, end_date, total_days,
     reason, status, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000002', 'wfh',
     '2026-02-03', '2026-02-03', 1.0,
     'Ngày đầu đi làm lại sau Tết, cần sắp xếp tài liệu tại nhà',
     'pending', '2026-02-02 18:00:00', '2026-02-02 18:00:00');

  -- Lê Thị Hoa: Nghỉ ốm Thứ 3 10/02/2026 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_HOA1, 'a1000000-0000-0000-0000-000000000003', 'sick',
     '2026-02-10', '2026-02-10', 1.0,
     'Cảm cúm, sốt nhẹ, xin nghỉ để nghỉ ngơi',
     'approved', ADMIN_SYS,
     '2026-02-10 07:45:00', '2026-02-10 07:30:00', '2026-02-10 07:45:00');

  -- Nguyễn Thị Lan: WFH Thứ 3 03/03/2026 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_LAN1, 'a1000000-0000-0000-0000-000000000001', 'wfh',
     '2026-03-03', '2026-03-03', 1.0,
     'Sửa chữa nhà, cần ở nhà để giám sát thợ',
     'approved', ADMIN_SYS,
     '2026-03-02 17:00:00', '2026-03-01 16:00:00', '2026-03-02 17:00:00');

  -- hermorni: Nghỉ ốm Thứ 2-3 16–17/03/2026 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_HER1, '03122a21-b40c-4715-b61a-613771a8018d', 'sick',
     '2026-03-16', '2026-03-17', 2.0,
     'Đau bụng cấp tính, có giấy khám bệnh',
     'approved', ADMIN_SYS,
     '2026-03-16 08:15:00', '2026-03-16 08:00:00', '2026-03-16 08:15:00');

  -- Lê Thị Hoa: Phép năm Thứ 4-5 08–09/04/2026 (từ chối)
  INSERT INTO leave_requests
    (user_id, leave_type, start_date, end_date, total_days,
     reason, status, rejection_note, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000003', 'annual',
     '2026-04-08', '2026-04-09', 2.0,
     'Nghỉ phép du lịch gia đình cuối tuần kéo dài',
     'rejected',
     'Giai đoạn quyết toán thuế TNDN, toàn bộ nhân viên kế toán cần có mặt',
     '2026-03-28 10:00:00', '2026-04-01 15:00:00');

  -- Hà Văn Thọ: Phép năm Thứ 4-5 22–23/04/2026 (đã duyệt)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_THO1, 'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f', 'annual',
     '2026-04-22', '2026-04-23', 2.0,
     'Nghỉ phép năm kết hợp chuỗi nghỉ lễ 30/4',
     'approved', ADMIN_SYS,
     '2026-04-18 16:00:00', '2026-04-17 10:00:00', '2026-04-18 16:00:00');

  -- Quản trị viên: Phép năm Thứ 3-4 05–06/05/2026 (đã duyệt bởi Hà Văn Thọ)
  INSERT INTO leave_requests
    (id, user_id, leave_type, start_date, end_date, total_days,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    (LR_QTV1, '508f2448-8a9a-4036-aa64-02e7051c2766', 'annual',
     '2026-05-05', '2026-05-06', 2.0,
     'Nghỉ phép sau kỳ nghỉ lễ 1/5, bù cho thời gian làm bù trước đó',
     'approved', ADMIN_THO,
     '2026-04-28 10:00:00', '2026-04-27 09:00:00', '2026-04-28 10:00:00');

  -- ────────────────────────────────────────────────────────
  -- BƯỚC 3: ĐƠN TĂNG CA (overtime_requests)
  -- ────────────────────────────────────────────────────────

  -- Trần Văn Minh – Thứ 7 20/12/2025 (đã duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000002',
     '2025-12-20', '09:00', '12:00', 3.0, 1.5,
     'Hoàn thành báo cáo tài chính tháng 12 trước deadline 31/12',
     'approved', ADMIN_SYS, '2025-12-19 17:00:00',
     '2025-12-19 09:00:00', '2025-12-19 17:00:00');

  -- Lê Thị Hoa – Thứ 7 10/01/2026 (đã duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000003',
     '2026-01-10', '08:00', '12:00', 4.0, 1.5,
     'Chuẩn bị số liệu quyết toán quý 4/2025 trước kỳ nghỉ Tết',
     'approved', ADMIN_SYS, '2026-01-09 16:00:00',
     '2026-01-09 08:30:00', '2026-01-09 16:00:00');

  -- Nguyễn Thị Lan – Thứ 7 28/02/2026 (chờ duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000001',
     '2026-02-28', '08:00', '12:00', 4.0, 1.5,
     'Xử lý hồ sơ khách hàng tồn đọng sau kỳ nghỉ Tết Nguyên Đán',
     'pending', '2026-02-25 17:00:00', '2026-02-25 17:00:00');

  -- Bảo Phúc – Thứ 7 07/03/2026 (đã duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, approved_by, approved_at, created_at, updated_at)
  VALUES
    ('81e35ff6-38d6-45bf-b66a-ad2269e1c50e',
     '2026-03-07', '09:00', '13:00', 4.0, 1.5,
     'Kiểm tra và đối soát số liệu thuế TNDN quý 1/2026',
     'approved', ADMIN_SYS, '2026-03-06 15:00:00',
     '2026-03-05 16:00:00', '2026-03-06 15:00:00');

  -- hermorni – Thứ 7 21/03/2026 (từ chối)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, rejection_note, created_at, updated_at)
  VALUES
    ('03122a21-b40c-4715-b61a-613771a8018d',
     '2026-03-21', '08:00', '12:00', 4.0, 1.5,
     'Cập nhật dữ liệu khách hàng trên hệ thống quản lý',
     'rejected',
     'Không có yêu cầu cấp thiết, công việc này có thể xử lý trong giờ làm việc thứ 2',
     '2026-03-18 10:00:00', '2026-03-19 09:00:00');

  -- Hà Văn Thọ – Chủ Nhật 12/04/2026 (chờ duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, created_at, updated_at)
  VALUES
    ('a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
     '2026-04-12', '08:00', '12:00', 4.0, 2.0,
     'Họp khẩn với đối tác về dự án quyết toán thuế năm tài chính 2025',
     'pending', '2026-04-11 19:00:00', '2026-04-11 19:00:00');

  -- Trần Văn Minh – Thứ 7 09/05/2026 (chờ duyệt)
  INSERT INTO overtime_requests
    (user_id, ot_date, start_time, end_time, ot_hours, ot_rate,
     reason, status, created_at, updated_at)
  VALUES
    ('a1000000-0000-0000-0000-000000000002',
     '2026-05-09', '09:00', '12:00', 3.0, 1.5,
     'Hoàn thiện báo cáo tài chính tháng 4/2026 cho ban giám đốc',
     'pending', '2026-05-08 17:30:00', '2026-05-08 17:30:00');

  -- ────────────────────────────────────────────────────────
  -- BƯỚC 4: DỮ LIỆU CHẤM CÔNG (attendance_records + logs)
  -- ────────────────────────────────────────────────────────
  FOREACH uid IN ARRAY ALL_USERS LOOP
    FOR d IN
      SELECT gs::DATE
      FROM generate_series(
        '2025-12-01'::TIMESTAMPTZ,
        '2026-05-19'::TIMESTAMPTZ,
        '1 day'::INTERVAL
      ) gs
    LOOP
      -- Bỏ qua cuối tuần (Thứ 7 = 6, Chủ Nhật = 0)
      IF EXTRACT(DOW FROM d) IN (0, 6) THEN
        CONTINUE;
      END IF;

      -- ── Ngày lễ → status = holiday ──────────────────────
      IF d = ANY(HOLIDAYS) THEN
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, status, is_holiday,
           work_units, late_minutes, early_minutes)
        VALUES (uid, d, SHIFT_HC, 'holiday', TRUE, 0, 0, 0)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        CONTINUE;
      END IF;

      -- ── Kiểm tra đơn nghỉ phép đã duyệt ────────────────
      lr_id := NULL;
      s     := NULL;

      IF uid = '81e35ff6-38d6-45bf-b66a-ad2269e1c50e'
         AND d BETWEEN '2025-12-15' AND '2025-12-16' THEN
        lr_id := LR_PHUC1; s := 'on_leave';

      ELSIF uid = 'a1000000-0000-0000-0000-000000000002'
         AND d BETWEEN '2026-01-05' AND '2026-01-06' THEN
        lr_id := LR_MINH1; s := 'on_leave';

      ELSIF uid = 'a1000000-0000-0000-0000-000000000003'
         AND d = '2026-02-10' THEN
        lr_id := LR_HOA1; s := 'on_leave';

      ELSIF uid = 'a1000000-0000-0000-0000-000000000001'
         AND d = '2026-03-03' THEN
        lr_id := LR_LAN1; s := 'wfh';

      ELSIF uid = '03122a21-b40c-4715-b61a-613771a8018d'
         AND d BETWEEN '2026-03-16' AND '2026-03-17' THEN
        lr_id := LR_HER1; s := 'on_leave';

      ELSIF uid = 'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f'
         AND d BETWEEN '2026-04-22' AND '2026-04-23' THEN
        lr_id := LR_THO1; s := 'on_leave';

      ELSIF uid = '508f2448-8a9a-4036-aa64-02e7051c2766'
         AND d BETWEEN '2026-05-05' AND '2026-05-06' THEN
        lr_id := LR_QTV1; s := 'on_leave';
      END IF;

      -- Chèn bản ghi nghỉ phép / WFH
      IF s IS NOT NULL THEN
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, status, work_units,
           leave_request_id, late_minutes, early_minutes, is_holiday)
        VALUES (uid, d, SHIFT_HC, s, 1, lr_id, 0, 0, FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        CONTINUE;
      END IF;

      -- ── Ngày làm việc bình thường (phát sinh ngẫu nhiên) ─
      r := random();

      IF r < 0.05 THEN
        -- 5%: Vắng mặt không phép
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, status, work_units,
           late_minutes, early_minutes, is_holiday)
        VALUES (uid, d, SHIFT_HC, 'absent', 0, 0, 0, FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;

      ELSIF r < 0.12 THEN
        -- 7%: Đi muộn (16 – 90 phút sau 08:00)
        lm := 16 + (random() * 74)::INT;
        ci := (d::TIMESTAMP + INTERVAL '8 hours') + (lm * INTERVAL '1 minute');
        co := (d::TIMESTAMP + INTERVAL '17 hours')
              + ((random() * 30)::INT * INTERVAL '1 minute');
        ah := ROUND(GREATEST(
                EXTRACT(EPOCH FROM (co - ci)) / 3600.0 - 1.0, 0)::NUMERIC, 2);
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, check_in_time, check_out_time,
           actual_hours, late_minutes, early_minutes, work_units, status, is_holiday)
        VALUES (uid, d, SHIFT_HC, ci, co, ah, lm, 0, 1, 'late', FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_in',  ci, 'web');
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_out', co, 'web');

      ELSIF r < 0.17 THEN
        -- 5%: Về sớm (15 – 120 phút trước 17:00)
        em := 15 + (random() * 105)::INT;
        ci := (d::TIMESTAMP + INTERVAL '7 hours 55 minutes')
              + ((random() * 10)::INT * INTERVAL '1 minute');
        co := (d::TIMESTAMP + INTERVAL '17 hours')
              - (em * INTERVAL '1 minute');
        ah := ROUND(GREATEST(
                EXTRACT(EPOCH FROM (co - ci)) / 3600.0 - 1.0, 0)::NUMERIC, 2);
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, check_in_time, check_out_time,
           actual_hours, late_minutes, early_minutes, work_units, status, is_holiday)
        VALUES (uid, d, SHIFT_HC, ci, co, ah, 0, em, 1, 'early_leave', FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_in',  ci, 'web');
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_out', co, 'web');

      ELSIF r < 0.19 THEN
        -- 2%: Vừa muộn vừa về sớm
        lm := 16 + (random() * 44)::INT;
        em := 15 + (random() * 45)::INT;
        ci := (d::TIMESTAMP + INTERVAL '8 hours')
              + (lm * INTERVAL '1 minute');
        co := (d::TIMESTAMP + INTERVAL '17 hours')
              - (em * INTERVAL '1 minute');
        ah := ROUND(GREATEST(
                EXTRACT(EPOCH FROM (co - ci)) / 3600.0 - 1.0, 0)::NUMERIC, 2);
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, check_in_time, check_out_time,
           actual_hours, late_minutes, early_minutes, work_units, status, is_holiday)
        VALUES (uid, d, SHIFT_HC, ci, co, ah, lm, em, 1, 'late_and_early', FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_in',  ci, 'web');
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_out', co, 'web');

      ELSE
        -- 81%: Đúng giờ, đủ công
        ci := (d::TIMESTAMP + INTERVAL '7 hours 50 minutes')
              + ((random() * 20)::INT * INTERVAL '1 minute');
        co := (d::TIMESTAMP + INTERVAL '17 hours')
              + ((random() * 60)::INT * INTERVAL '1 minute');
        ah := ROUND(GREATEST(
                EXTRACT(EPOCH FROM (co - ci)) / 3600.0 - 1.0, 0)::NUMERIC, 2);
        INSERT INTO attendance_records
          (user_id, work_date, shift_id, check_in_time, check_out_time,
           actual_hours, late_minutes, early_minutes, work_units, status, is_holiday)
        VALUES (uid, d, SHIFT_HC, ci, co, ah, 0, 0, 1, 'present', FALSE)
        ON CONFLICT (user_id, work_date) DO NOTHING;
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_in',  ci, 'web');
        INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
          VALUES (uid, 'check_out', co, 'web');
      END IF;

    END LOOP;
  END LOOP;

END;
$$;

COMMIT;
