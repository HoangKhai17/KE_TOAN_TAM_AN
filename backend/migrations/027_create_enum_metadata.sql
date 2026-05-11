-- Enum metadata tables: store display labels for all PostgreSQL enum values
-- so the frontend can render human-readable labels without hardcoding them.

CREATE TABLE enum_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key    TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT,
  is_editable BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE enum_options (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id     UUID        NOT NULL REFERENCES enum_types(id) ON DELETE CASCADE,
  option_key  TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type_id, option_key)
);

CREATE INDEX idx_enum_options_type_id ON enum_options(type_id);

-- ── Seed: enum_types ──────────────────────────────────────────────────────────

INSERT INTO enum_types (type_key, label, description) VALUES
  ('user_role',          N'Vai trò người dùng',       N'Phân quyền hệ thống'),
  ('user_status',        N'Trạng thái tài khoản',     N'Tình trạng hoạt động của tài khoản'),
  ('business_type',      N'Loại hình doanh nghiệp',   N'Phân loại pháp lý của khách hàng'),
  ('company_status',     N'Trạng thái khách hàng',    N'Tình trạng hợp tác của khách hàng'),
  ('task_status',        N'Trạng thái công việc',     N'Vòng đời xử lý công việc'),
  ('task_priority',      N'Mức ưu tiên',              N'Độ ưu tiên xử lý công việc'),
  ('task_source',        N'Nguồn tạo công việc',      N'Công việc được tạo thủ công hay tự động'),
  ('recurrence_type',    N'Kiểu lặp lịch',            N'Tần suất lặp của lịch biểu định kỳ'),
  ('payroll_status',     N'Trạng thái bảng lương',    N'Trạng thái phê duyệt bảng lương'),
  ('field_data_type',    N'Kiểu dữ liệu trường tùy chỉnh', N'Kiểu dữ liệu của custom field'),
  ('document_category',  N'Danh mục tài liệu',        N'Phân loại tài liệu đính kèm'),
  ('notification_type',  N'Loại thông báo',           N'Phân loại các sự kiện thông báo hệ thống'),
  ('report_type_enum',   N'Loại báo cáo',             N'Các mẫu báo cáo hệ thống');

-- ── Seed: enum_options ────────────────────────────────────────────────────────

-- user_role
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('admin', N'Quản trị viên', 0),
  ('staff', N'Nhân viên',     1)
) AS opt(key, label, ord)
WHERE type_key = 'user_role';

-- user_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('active',   N'Hoạt động', 0),
  ('on_leave', N'Tạm dừng',  1),
  ('resigned', N'Đã nghỉ',   2)
) AS opt(key, label, ord)
WHERE type_key = 'user_status';

-- business_type
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('TNHH',       N'Công ty TNHH',         0),
  ('CP',         N'Công ty Cổ phần',       1),
  ('HKD',        N'Hộ kinh doanh',         2),
  ('DN_TU_NHAN', N'Doanh nghiệp tư nhân', 3),
  ('KHAC',       N'Khác',                  4)
) AS opt(key, label, ord)
WHERE type_key = 'business_type';

-- company_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('active',     N'Đang hợp tác',    0),
  ('inactive',   N'Tạm ngừng',       1),
  ('terminated', N'Đã chấm dứt HĐ', 2)
) AS opt(key, label, ord)
WHERE type_key = 'company_status';

-- task_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('pending',         N'Chờ xử lý',      0),
  ('in_progress',     N'Đang thực hiện', 1),
  ('on_hold',         N'Tạm hoãn',       2),
  ('pending_review',  N'Chờ duyệt',      3),
  ('needs_revision',  N'Cần xem lại',    4),
  ('completed',       N'Hoàn thành',     5)
) AS opt(key, label, ord)
WHERE type_key = 'task_status';

-- task_priority
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('urgent', N'Khẩn cấp',   0),
  ('high',   N'Cao',         1),
  ('medium', N'Trung bình',  2),
  ('low',    N'Thấp',        3)
) AS opt(key, label, ord)
WHERE type_key = 'task_priority';

-- task_source
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('auto',   N'Tự động',  0),
  ('manual', N'Thủ công', 1)
) AS opt(key, label, ord)
WHERE type_key = 'task_source';

-- recurrence_type
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('daily',              N'Hàng ngày',                  0),
  ('weekly',             N'Hàng tuần',                  1),
  ('monthly_by_date',    N'Hàng tháng (theo ngày)',     2),
  ('monthly_by_weekday', N'Hàng tháng (theo thứ)',      3),
  ('monthly_last_day',   N'Hàng tháng (ngày cuối)',     4),
  ('quarterly',          N'Hàng quý',                   5),
  ('yearly',             N'Hàng năm',                   6),
  ('custom_dates',       N'Ngày cụ thể',                7),
  ('once',               N'Một lần',                    8)
) AS opt(key, label, ord)
WHERE type_key = 'recurrence_type';

-- payroll_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('draft',     N'Nháp',       0),
  ('confirmed', N'Đã xác nhận', 1),
  ('paid',      N'Đã thanh toán', 2)
) AS opt(key, label, ord)
WHERE type_key = 'payroll_status';

-- field_data_type
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('text',    N'Văn bản',     0),
  ('number',  N'Số',          1),
  ('date',    N'Ngày tháng',  2),
  ('boolean', N'Có / Không',  3),
  ('select',  N'Lựa chọn',    4)
) AS opt(key, label, ord)
WHERE type_key = 'field_data_type';

-- document_category
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('hop_dong',    N'Hợp đồng',          0),
  ('bao_cao_thue', N'Báo cáo thuế',     1),
  ('so_sach',     N'Sổ sách kế toán',   2),
  ('giay_phep',   N'Giấy phép',         3),
  ('khac',        N'Khác',              4)
) AS opt(key, label, ord)
WHERE type_key = 'document_category';

-- notification_type
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('task_assigned',       N'Công việc được giao',     0),
  ('task_overdue',        N'Công việc quá hạn',       1),
  ('deadline_reminder',   N'Nhắc nhở deadline',       2),
  ('escalation',          N'Escalation',               3),
  ('morning_summary',     N'Tóm tắt buổi sáng',       4),
  ('task_status_changed', N'Trạng thái công việc thay đổi', 5)
) AS opt(key, label, ord)
WHERE type_key = 'notification_type';

-- report_type_enum
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('monthly_summary',   N'Tóm tắt tháng',          0),
  ('staff_performance', N'Hiệu suất nhân viên',    1),
  ('customer_status',   N'Tình trạng khách hàng',  2),
  ('sla_compliance',    N'Tuân thủ SLA',            3),
  ('aging',             N'Báo cáo tuổi công việc', 4),
  ('velocity',          N'Tốc độ xử lý',           5),
  ('forecast',          N'Dự báo',                  6),
  ('custom',            N'Tùy chỉnh',               7)
) AS opt(key, label, ord)
WHERE type_key = 'report_type_enum';
