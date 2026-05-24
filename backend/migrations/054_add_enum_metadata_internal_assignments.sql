-- Enum metadata for Internal Assignments module

INSERT INTO enum_types (type_key, label, description) VALUES
  ('assignment_priority', N'Mức ưu tiên phiếu giao việc', N'Độ ưu tiên của phiếu giao việc nội bộ'),
  ('assignment_status',   N'Trạng thái phiếu giao việc',  N'Vòng đời của phiếu giao việc nội bộ'),
  ('assignee_status',     N'Trạng thái nhân sự thực hiện', N'Trạng thái của từng nhân sự được giao trong phiếu');

-- assignment_priority
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('low',    N'Thấp',       3),
  ('normal', N'Bình thường', 2),
  ('high',   N'Cao',         1),
  ('urgent', N'Khẩn cấp',   0)
) AS opt(key, label, ord)
WHERE type_key = 'assignment_priority';

-- assignment_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('draft',     N'Nháp',              0),
  ('active',    N'Đang thực hiện',    1),
  ('done',      N'Hoàn thành',        2),
  ('cancelled', N'Đã hủy',            3)
) AS opt(key, label, ord)
WHERE type_key = 'assignment_status';

-- assignee_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('pending',     N'Chờ tiếp nhận',   0),
  ('accepted',    N'Đã tiếp nhận',    1),
  ('in_progress', N'Đang thực hiện',  2),
  ('done',        N'Hoàn thành',      3),
  ('rejected',    N'Đã từ chối',      4)
) AS opt(key, label, ord)
WHERE type_key = 'assignee_status';
