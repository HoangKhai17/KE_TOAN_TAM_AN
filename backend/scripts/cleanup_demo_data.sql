-- ============================================================================
-- DỌN DỮ LIỆU DEMO ĐÃ BỊ CHÈN NHẦM (do npm run seed / migrate chạy seed_*.sql)
-- ----------------------------------------------------------------------------
-- Chỉ xóa các bản ghi DEMO nhận diện qua prefix UUID cố định:
--   users     a1000000-...   companies  c0000000-...   staff_assign a5000000-...
--   tasks     f0000000-...   payroll_periods b0000000-...  payroll_records e0000000-...
-- Dữ liệu THẬT (UUID ngẫu nhiên) KHÔNG bị đụng tới.
--
-- ⚠️ BẮT BUỘC backup trước khi chạy. Toàn bộ nằm trong 1 transaction:
--    nếu 1 câu lỗi FK (vd có bản ghi THẬT tham chiếu tới demo) → ROLLBACK toàn bộ,
--    không mất gì; hãy gửi lỗi cho tôi để xử lý tiếp.
--
-- Cách chạy trên server (sau khi đã backup):
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
--     < backend/scripts/cleanup_demo_data.sql
-- ============================================================================

BEGIN;

-- 1) Chấm công demo (seed_attendance_demo) — theo user a1000000
DELETE FROM attendance_logs    WHERE user_id::text LIKE 'a1000000-%';
DELETE FROM attendance_records WHERE user_id::text LIKE 'a1000000-%';
DELETE FROM overtime_requests  WHERE user_id::text LIKE 'a1000000-%';
DELETE FROM leave_requests     WHERE user_id::text LIKE 'a1000000-%';
DELETE FROM work_schedules     WHERE user_id::text LIKE 'a1000000-%';

-- 2) Giao việc nội bộ demo (seed_internal_assignments) — theo company c0000000
--    (internal_assignment_assignees tự CASCADE)
DELETE FROM internal_assignments WHERE company_id::text LIKE 'c0000000-%';

-- 3) Công việc demo + bản ghi con (xóa con trước vì có FK ON DELETE SET NULL)
DELETE FROM task_time_logs      WHERE task_id::text LIKE 'f0000000-%';
DELETE FROM task_activity_logs  WHERE task_id::text LIKE 'f0000000-%';
DELETE FROM task_comments       WHERE task_id::text LIKE 'f0000000-%';
DELETE FROM task_dependencies   WHERE task_id::text LIKE 'f0000000-%'
                                    OR depends_on_task_id::text LIKE 'f0000000-%';
DELETE FROM task_checklist_items WHERE task_id::text LIKE 'f0000000-%';
DELETE FROM tasks                WHERE id::text LIKE 'f0000000-%';

-- 4) Bảng lương demo (payroll_records tự CASCADE từ payroll_periods, xóa rõ cho chắc)
DELETE FROM payroll_records WHERE id::text LIKE 'e0000000-%'
                               OR payroll_period_id::text LIKE 'b0000000-%'
                               OR user_id::text LIKE 'a1000000-%';
DELETE FROM payroll_periods WHERE id::text LIKE 'b0000000-%';

-- 5) Phân công nhân sự demo
DELETE FROM staff_company_assignments WHERE id::text LIKE 'a5000000-%'
                                         OR company_id::text LIKE 'c0000000-%'
                                         OR staff_id::text LIKE 'a1000000-%';

-- 6) Công ty & user demo (xóa sau cùng)
DELETE FROM companies WHERE id::text LIKE 'c0000000-%';
DELETE FROM users     WHERE id::text LIKE 'a1000000-%';

-- Xem lại số dòng đã xóa ở output (DELETE n) trước khi COMMIT.
-- Nếu muốn thử trước mà KHÔNG áp dụng: đổi COMMIT thành ROLLBACK.
COMMIT;
