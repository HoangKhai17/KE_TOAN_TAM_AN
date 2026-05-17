-- Seed enum metadata (enum_types + enum_options) for attendance module enums.
-- These PostgreSQL ENUM types already exist (migration 035); this migration
-- only registers them in the metadata tables so the Settings UI can display
-- and manage their display labels.

-- ── enum_types ────────────────────────────────────────────────────────────────

INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('attendance_status',    N'Trạng thái chấm công',    N'Kết quả ngày công của nhân viên',            false),
  ('leave_type',           N'Loại nghỉ phép',           N'Phân loại các đơn xin nghỉ',                 false),
  ('request_status',       N'Trạng thái đơn',           N'Vòng đời của đơn nghỉ phép và đơn OT',       false),
  ('shift_type',           N'Loại ca làm việc',         N'Hình thức tổ chức ca làm việc',              false),
  ('checkin_method',       N'Phương thức chấm công',   N'Cách thức nhân viên thực hiện check-in/out', false),
  ('attendance_log_type',  N'Loại log chấm công',       N'Phân biệt log check-in và check-out',        false)
ON CONFLICT (type_key) DO NOTHING;

-- ── attendance_status ─────────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('present',        N'Đi làm đúng giờ',              0),
  ('late',           N'Đi trễ',                       1),
  ('early_leave',    N'Về sớm',                       2),
  ('late_and_early', N'Vừa trễ vừa về sớm',           3),
  ('absent',         N'Vắng mặt không phép',          4),
  ('on_leave',       N'Nghỉ phép được duyệt',         5),
  ('business_trip',  N'Công tác',                     6),
  ('wfh',            N'Làm tại nhà (WFH)',             7),
  ('holiday',        N'Ngày lễ quốc gia',             8),
  ('unscheduled',    N'Không có ca – chờ xử lý',      9)
) AS opt(key, label, ord)
WHERE type_key = 'attendance_status'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── leave_type ────────────────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('annual',        N'Phép năm',            0),
  ('sick',          N'Nghỉ bệnh',           1),
  ('compensatory',  N'Nghỉ bù OT',          2),
  ('unpaid',        N'Nghỉ không phép',     3),
  ('business_trip', N'Công tác',            4),
  ('wfh',           N'Làm tại nhà (WFH)',   5)
) AS opt(key, label, ord)
WHERE type_key = 'leave_type'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── request_status ────────────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('pending',   N'Chờ duyệt',     0),
  ('approved',  N'Đã duyệt',      1),
  ('rejected',  N'Từ chối',       2),
  ('cancelled', N'Đã huỷ',        3)
) AS opt(key, label, ord)
WHERE type_key = 'request_status'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── shift_type ────────────────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('fixed',    N'Ca cố định',   0),
  ('flexible', N'Ca linh hoạt', 1),
  ('shift',    N'Theo ca',      2)
) AS opt(key, label, ord)
WHERE type_key = 'shift_type'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── checkin_method ────────────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('web',    N'Web app',            0),
  ('mobile', N'Ứng dụng di động',  1),
  ('manual', N'Admin nhập thủ công', 2)
) AS opt(key, label, ord)
WHERE type_key = 'checkin_method'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── attendance_log_type ───────────────────────────────────────────────────────

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('check_in',  N'Check-in (vào làm)',   0),
  ('check_out', N'Check-out (ra về)',    1)
) AS opt(key, label, ord)
WHERE type_key = 'attendance_log_type'
ON CONFLICT (type_id, option_key) DO NOTHING;
