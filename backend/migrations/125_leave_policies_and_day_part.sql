-- GĐ2 Nhóm B — Chính sách nghỉ trở thành CẤU HÌNH, và đơn nghỉ lưu được thời lượng.
--
-- Trước migration này, chính sách từng loại nghỉ nằm rải rác trong chuỗi SQL và
-- object JS: annual/sick/compensatory/unpaid đều bị gom thành status='on_leave' nên
-- không thể phân biệt; wfh/business_trip bị xếp nhầm vào "nghỉ" dù thực chất là ĐANG
-- LÀM VIỆC; và không có chỗ nào biểu diễn "nghỉ nửa ngày".
--
-- QUY ƯỚC KIỂU: migration 104 đã bỏ ENUM gốc Postgres cho MỌI cột danh mục, chuyển
-- sang VARCHAR + bảng enum_types/enum_options (để admin thêm option mà không phải
-- ALTER TYPE). Bảng dưới đây theo đúng quy ước đó — leave_type/maps_to_status là
-- VARCHAR, KHÔNG dùng kiểu enum, nếu không sẽ không JOIN được với leave_requests.

-- ── Bảng chính sách ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  leave_type      VARCHAR(50)  PRIMARY KEY,     -- khớp enum_options(type_key='leave_type')
  label           VARCHAR(100) NOT NULL,
  is_paid         BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Tỉ lệ hưởng lương. NUMERIC(4,3) để chịu được 0.750 mà không làm tròn.
  paid_rate       NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  allow_half_day  BOOLEAN      NOT NULL DEFAULT TRUE,
  deduct_balance  BOOLEAN      NOT NULL DEFAULT FALSE,
  -- TRUE = ngày này vẫn là ĐANG LÀM VIỆC (wfh, công tác), không phải nghỉ
  counts_as_work  BOOLEAN      NOT NULL DEFAULT FALSE,
  maps_to_status  VARCHAR(50)  NOT NULL DEFAULT 'on_leave',
  sort_order      INTEGER      NOT NULL DEFAULT 0,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),

  CHECK (paid_rate >= 0 AND paid_rate <= 1),
  -- Nghỉ không lương thì paid_rate phải bằng 0 — chặn cấu hình tự mâu thuẫn
  CHECK (is_paid OR paid_rate = 0)
);

INSERT INTO leave_policies
  (leave_type, label, is_paid, paid_rate, allow_half_day, deduct_balance, counts_as_work, maps_to_status, sort_order) VALUES
  ('annual',        'Nghỉ phép năm',     TRUE,  1.000, TRUE,  TRUE,  FALSE, 'on_leave',      0),
  ('sick',          'Nghỉ ốm',           TRUE,  1.000, TRUE,  FALSE, FALSE, 'on_leave',      1),
  ('compensatory',  'Nghỉ bù OT',        TRUE,  1.000, TRUE,  FALSE, FALSE, 'on_leave',      2),
  ('unpaid',        'Nghỉ không lương',  FALSE, 0.000, TRUE,  FALSE, FALSE, 'on_leave',      3),
  ('business_trip', 'Công tác',          TRUE,  1.000, FALSE, FALSE, TRUE,  'business_trip', 4),
  ('wfh',           'Làm tại nhà (WFH)', TRUE,  1.000, FALSE, FALSE, TRUE,  'wfh',           5)
ON CONFLICT (leave_type) DO NOTHING;

-- Loại nghỉ admin tự thêm sau này (qua enum_options) mà chưa có chính sách:
-- sinh sẵn bản ghi mặc định "nghỉ có lương nguyên ngày" để không bị bỏ sót.
INSERT INTO leave_policies (leave_type, label, sort_order)
SELECT eo.option_key, eo.label, eo.sort_order
FROM enum_options eo
JOIN enum_types et ON et.id = eo.type_id AND et.type_key = 'leave_type'
ON CONFLICT (leave_type) DO NOTHING;

-- ── Thời lượng trên đơn nghỉ ─────────────────────────────────────────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS day_part VARCHAR(20)  NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS hours    NUMERIC(4,2);

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS chk_lr_day_part,
  ADD  CONSTRAINT chk_lr_day_part
       CHECK (day_part IN ('full','morning','afternoon','hours'));

-- Nghỉ theo buổi/giờ chỉ áp dụng cho đơn MỘT ngày. Đơn nhiều ngày luôn là nguyên ngày.
-- Giữ schema phẳng; nếu sau này cần "chiều T2 → sáng T5" thì bỏ ràng buộc này và
-- thêm bảng con leave_request_days(request_id, work_date, units).
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS chk_lr_halfday_single_day,
  ADD  CONSTRAINT chk_lr_halfday_single_day
       CHECK (day_part = 'full' OR start_date = end_date);

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS chk_lr_hours,
  ADD  CONSTRAINT chk_lr_hours
       CHECK (day_part <> 'hours' OR (hours IS NOT NULL AND hours > 0));

-- ── Danh mục động cho day_part (để giao diện lấy nhãn từ một nguồn) ─────────
INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('leave_day_part', 'Thời lượng nghỉ', 'Nghỉ cả ngày, nửa ngày hay theo giờ', false)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('full',      'Cả ngày',    0),
  ('morning',   'Buổi sáng',  1),
  ('afternoon', 'Buổi chiều', 2),
  ('hours',     'Theo giờ',   3)
) AS opt(key, label, ord)
WHERE type_key = 'leave_day_part'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- ── Sửa nhãn enum đang lệch với giao diện ────────────────────────────────────
-- DB seed 'Nghỉ không phép' (migration 041) trong khi UI hiển thị 'Nghỉ không lương'
-- — hai nghĩa khác hẳn nhau. Lấy nhãn của UI làm chuẩn.
UPDATE enum_options SET label = 'Nghỉ không lương'
 WHERE option_key = 'unpaid'
   AND type_id = (SELECT id FROM enum_types WHERE type_key = 'leave_type');

CREATE INDEX IF NOT EXISTS idx_lr_day_part ON leave_requests(day_part);
