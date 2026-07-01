-- ============================================================================
-- CLEAR DEMO DATA — Xoá toàn bộ dữ liệu demo để chạy lại hệ thống cho khách thật
-- ============================================================================
-- ⚠️  GHI ĐÈ / XOÁ KHÔNG HOÀN TÁC. Hãy backup trước (Cài đặt › Sao lưu › Sao lưu ngay).
--
-- XOÁ:  công ty, công việc, chấm công (record/log/nghỉ/tăng ca), yêu cầu KH (CDR),
--       phiếu nội bộ, bảng lương, tài liệu, thông báo, ghi chú nhanh, audit log,
--       và TẤT CẢ user — CHỈ GIỮ 1 admin chính (email nguyenhoangkhai.010103@gmail.com).
-- GIỮ:  schema, ENUM (enum_types/options), cấu hình hệ thống (system_configs),
--       thư viện Loại công việc (task_types…), định nghĩa bảng tuỳ chỉnh,
--       ca làm việc, ngày lễ, danh mục tài liệu nội bộ, và 1 tài khoản admin nêu trên.
--
-- ⚠️  KIỂM TRA TRƯỚC KHI CHẠY (đảm bảo email tồn tại, tránh tự khoá mình):
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
--     -c "SELECT id, email, role FROM users WHERE lower(email)=lower('nguyenhoangkhai.010103@gmail.com');"
--   → PHẢI trả về đúng 1 dòng role=admin. Nếu trống → DỪNG, kiểm tra lại email.
--
-- CÁCH CHẠY (trên máy chủ demo, thư mục deploy):
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U <POSTGRES_USER> -d <POSTGRES_DB> < scripts/clear-demo-data.sql
-- ============================================================================

BEGIN;

-- Tắt kiểm tra FK trong lúc TRUNCATE (cho phép xoá theo nhóm, không cần thứ tự)
SET session_replication_role = replica;

TRUNCATE TABLE
  -- Chấm công
  attendance_adjustments, attendance_logs, attendance_records,
  leave_requests, overtime_requests, work_schedules,
  -- Log / hệ thống tạm
  audit_logs, scheduler_run_logs, report_jobs, notifications, quick_notes, refresh_tokens,
  -- Yêu cầu tài liệu KH (CDR)
  client_document_requests,
  -- Phiếu giao việc nội bộ
  internal_assignment_assignees, internal_assignment_comments,
  ia_checklist_items, ia_links, internal_doc_links, internal_assignments,
  -- Bảng lương
  payroll_records, payroll_periods,
  -- Công việc
  task_activity_logs, task_checklist_items, task_comments, task_custom_field_values,
  task_dependencies, task_links, task_time_logs, tasks,
  -- Tài liệu
  documents,
  -- Dữ liệu theo công ty + công ty
  company_credentials, company_notes, company_table_rows, company_table_company_columns,
  company_archive_columns, company_labor_contract_columns, customer_task_schedules,
  staff_company_assignments, companies
  RESTART IDENTITY;

-- Bật lại FK
SET session_replication_role = DEFAULT;

-- Xoá TẤT CẢ user (kể cả các admin khác), CHỈ GIỮ 1 admin chính theo email.
-- ⚠️  BẮT BUỘC kiểm tra email tồn tại trước khi chạy (xem lệnh kiểm tra bên dưới file),
--     nếu gõ sai email → xoá SẠCH mọi user → không đăng nhập được!
-- So khớp không phân biệt hoa/thường cho an toàn.
DELETE FROM users WHERE lower(email) <> lower('nguyenhoangkhai.010103@gmail.com');

COMMIT;

-- Kiểm tra sau khi xoá
SELECT 'companies' AS bang, COUNT(*) FROM companies
  UNION ALL SELECT 'users (admin còn lại)', COUNT(*) FROM users
  UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
  UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records
  UNION ALL SELECT 'enum_options (giữ)', COUNT(*) FROM enum_options
  UNION ALL SELECT 'task_types (giữ)', COUNT(*) FROM task_types;
