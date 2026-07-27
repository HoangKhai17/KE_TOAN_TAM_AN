-- Quay lại ENUM gốc. LƯU Ý: sẽ lỗi nếu đang có bản ghi mang giá trị ngoài tập gốc
-- (do admin đã thêm option mới) — phải dọn dữ liệu trước khi down.
ALTER TABLE attendance_logs        ALTER COLUMN method     DROP DEFAULT;
ALTER TABLE attendance_logs        ALTER COLUMN method     TYPE checkin_method USING method::checkin_method;
ALTER TABLE attendance_logs        ALTER COLUMN method     SET DEFAULT 'web';

ALTER TABLE attendance_records     ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE attendance_records     ALTER COLUMN status     TYPE attendance_status USING status::attendance_status;
ALTER TABLE attendance_records     ALTER COLUMN status     SET DEFAULT 'absent';

ALTER TABLE client_document_requests ALTER COLUMN status   DROP DEFAULT;
ALTER TABLE client_document_requests ALTER COLUMN status   TYPE client_doc_status USING status::client_doc_status;
ALTER TABLE client_document_requests ALTER COLUMN status   SET DEFAULT 'pending';

ALTER TABLE companies              ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE companies              ALTER COLUMN status     TYPE company_status USING status::company_status;
ALTER TABLE companies              ALTER COLUMN status     SET DEFAULT 'active';

ALTER TABLE documents              ALTER COLUMN category   DROP DEFAULT;
ALTER TABLE documents              ALTER COLUMN category   TYPE document_category USING category::document_category;
ALTER TABLE documents              ALTER COLUMN category   SET DEFAULT 'khac';

ALTER TABLE internal_assignment_assignees ALTER COLUMN status DROP DEFAULT;
ALTER TABLE internal_assignment_assignees ALTER COLUMN status TYPE assignee_status USING status::assignee_status;
ALTER TABLE internal_assignment_assignees ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE internal_assignments   ALTER COLUMN priority   DROP DEFAULT;
ALTER TABLE internal_assignments   ALTER COLUMN priority   TYPE assignment_priority USING priority::assignment_priority;
ALTER TABLE internal_assignments   ALTER COLUMN priority   SET DEFAULT 'normal';

ALTER TABLE internal_assignments   ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE internal_assignments   ALTER COLUMN status     TYPE assignment_status USING status::assignment_status;
ALTER TABLE internal_assignments   ALTER COLUMN status     SET DEFAULT 'draft';

ALTER TABLE leave_requests         ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE leave_requests         ALTER COLUMN status     TYPE request_status USING status::request_status;
ALTER TABLE leave_requests         ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE overtime_requests      ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE overtime_requests      ALTER COLUMN status     TYPE request_status USING status::request_status;
ALTER TABLE overtime_requests      ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE payroll_periods        ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE payroll_periods        ALTER COLUMN status     TYPE payroll_status USING status::payroll_status;
ALTER TABLE payroll_periods        ALTER COLUMN status     SET DEFAULT 'draft';

ALTER TABLE shifts                 ALTER COLUMN shift_type DROP DEFAULT;
ALTER TABLE shifts                 ALTER COLUMN shift_type TYPE shift_type USING shift_type::shift_type;
ALTER TABLE shifts                 ALTER COLUMN shift_type SET DEFAULT 'fixed';

ALTER TABLE tasks                  ALTER COLUMN priority   DROP DEFAULT;
ALTER TABLE tasks                  ALTER COLUMN priority   TYPE task_priority USING priority::task_priority;
ALTER TABLE tasks                  ALTER COLUMN priority   SET DEFAULT 'medium';

ALTER TABLE tasks                  ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE tasks                  ALTER COLUMN status     TYPE task_status USING status::task_status;
ALTER TABLE tasks                  ALTER COLUMN status     SET DEFAULT 'pending';

ALTER TABLE users                  ALTER COLUMN role       DROP DEFAULT;
ALTER TABLE users                  ALTER COLUMN role       TYPE user_role USING role::user_role;
ALTER TABLE users                  ALTER COLUMN role       SET DEFAULT 'staff';

ALTER TABLE users                  ALTER COLUMN status     DROP DEFAULT;
ALTER TABLE users                  ALTER COLUMN status     TYPE user_status USING status::user_status;
ALTER TABLE users                  ALTER COLUMN status     SET DEFAULT 'active';

ALTER TABLE attendance_logs               ALTER COLUMN log_type       TYPE attendance_log_type USING log_type::attendance_log_type;
ALTER TABLE customer_task_schedules       ALTER COLUMN recurrence_type TYPE recurrence_type USING recurrence_type::recurrence_type;
ALTER TABLE leave_requests                ALTER COLUMN leave_type     TYPE leave_type USING leave_type::leave_type;
ALTER TABLE notifications                 ALTER COLUMN type           TYPE notification_type USING type::notification_type;
ALTER TABLE report_jobs                   ALTER COLUMN report_type    TYPE report_type_enum USING report_type::report_type_enum;
ALTER TABLE task_type_custom_field_schemas ALTER COLUMN data_type     TYPE field_data_type USING data_type::field_data_type;
