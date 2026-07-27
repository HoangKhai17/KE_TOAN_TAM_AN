-- DANH MỤC ĐỘNG TOÀN BỘ: bỏ hardcode ENUM gốc Postgres cho MỌI cột danh mục
--
-- Hệ danh mục (enum_types/enum_options) cho admin tự thêm/sửa option, nhưng nhiều
-- cột lại neo vào ENUM gốc Postgres (chỉ nhận tập giá trị cứng) → thêm option mới
-- thì lọc crash 500 và không gán được. Đổi tất cả các cột này sang VARCHAR để nhận
-- bất kỳ option_key nào; nguồn nhãn/nhóm vẫn là enum_types/enum_options.
--
-- Dữ liệu cũ giữ nguyên (USING ::text). Giữ lại các KIỂU enum gốc để down migrate.
-- NOT NULL được giữ tự động; default phải drop rồi set lại dạng text.

-- Partial index có predicate ép ::enum → phải bỏ trước khi đổi kiểu, tạo lại sau
-- (dùng literal KHÔNG ép kiểu để chạy đúng cho cả varchar lẫn enum).
DROP INDEX IF EXISTS idx_ar_period;
DROP INDEX IF EXISTS idx_tasks_overdue;

-- ── Cột CÓ default → drop → đổi kiểu → set lại ─────────────────────────────────
ALTER TABLE attendance_logs        ALTER COLUMN method     DROP DEFAULT;
ALTER TABLE attendance_logs        ALTER COLUMN method     TYPE VARCHAR(50) USING method::text;
ALTER TABLE attendance_logs        ALTER COLUMN method     SET DEFAULT 'web';

ALTER TABLE attendance_records     ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE attendance_records     ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE attendance_records     ALTER COLUMN status     SET DEFAULT 'absent';

ALTER TABLE client_document_requests ALTER COLUMN status   DROP DEFAULT;
ALTER TABLE client_document_requests ALTER COLUMN status   TYPE VARCHAR(50) USING status::text;
ALTER TABLE client_document_requests ALTER COLUMN status   SET DEFAULT 'pending';

ALTER TABLE companies              ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE companies              ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE companies              ALTER COLUMN status     SET DEFAULT 'active';

ALTER TABLE documents              ALTER COLUMN category   DROP DEFAULT;
ALTER TABLE documents              ALTER COLUMN category   TYPE VARCHAR(50) USING category::text;
ALTER TABLE documents              ALTER COLUMN category   SET DEFAULT 'khac';

ALTER TABLE internal_assignment_assignees ALTER COLUMN status DROP DEFAULT;
ALTER TABLE internal_assignment_assignees ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE internal_assignment_assignees ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE internal_assignments   ALTER COLUMN priority   DROP DEFAULT;
ALTER TABLE internal_assignments   ALTER COLUMN priority   TYPE VARCHAR(50) USING priority::text;
ALTER TABLE internal_assignments   ALTER COLUMN priority   SET DEFAULT 'normal';

ALTER TABLE internal_assignments   ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE internal_assignments   ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE internal_assignments   ALTER COLUMN status     SET DEFAULT 'draft';

ALTER TABLE leave_requests         ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE leave_requests         ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE leave_requests         ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE overtime_requests      ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE overtime_requests      ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE overtime_requests      ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE payroll_periods        ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE payroll_periods        ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE payroll_periods        ALTER COLUMN status     SET DEFAULT 'draft';

ALTER TABLE shifts                 ALTER COLUMN shift_type DROP DEFAULT;
ALTER TABLE shifts                 ALTER COLUMN shift_type TYPE VARCHAR(50) USING shift_type::text;
ALTER TABLE shifts                 ALTER COLUMN shift_type SET DEFAULT 'fixed';

ALTER TABLE tasks                  ALTER COLUMN priority   DROP DEFAULT;
ALTER TABLE tasks                  ALTER COLUMN priority   TYPE VARCHAR(50) USING priority::text;
ALTER TABLE tasks                  ALTER COLUMN priority   SET DEFAULT 'medium';

ALTER TABLE tasks                  ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE tasks                  ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE tasks                  ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE users                  ALTER COLUMN role       DROP DEFAULT;
ALTER TABLE users                  ALTER COLUMN role       TYPE VARCHAR(50) USING role::text;
ALTER TABLE users                  ALTER COLUMN role       SET DEFAULT 'staff';

ALTER TABLE users                  ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE users                  ALTER COLUMN status     TYPE VARCHAR(50) USING status::text;
ALTER TABLE users                  ALTER COLUMN status     SET DEFAULT 'active';

-- ── Cột KHÔNG default → chỉ đổi kiểu ───────────────────────────────────────────
ALTER TABLE attendance_logs               ALTER COLUMN log_type       TYPE VARCHAR(50) USING log_type::text;
ALTER TABLE customer_task_schedules       ALTER COLUMN recurrence_type TYPE VARCHAR(50) USING recurrence_type::text;
ALTER TABLE leave_requests                ALTER COLUMN leave_type     TYPE VARCHAR(50) USING leave_type::text;
ALTER TABLE notifications                 ALTER COLUMN type           TYPE VARCHAR(50) USING type::text;
ALTER TABLE report_jobs                   ALTER COLUMN report_type    TYPE VARCHAR(50) USING report_type::text;
ALTER TABLE task_type_custom_field_schemas ALTER COLUMN data_type     TYPE VARCHAR(50) USING data_type::text;

-- Tạo lại partial index (literal không ép kiểu — hợp cả varchar lẫn enum)
CREATE INDEX idx_ar_period ON attendance_records (work_date, user_id) WHERE (status <> 'holiday');
CREATE INDEX idx_tasks_overdue ON tasks (due_date, status) WHERE (status <> 'completed' AND due_date IS NOT NULL);
