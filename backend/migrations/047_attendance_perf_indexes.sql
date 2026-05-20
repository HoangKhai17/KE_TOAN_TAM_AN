-- Performance indexes for attendance module queries

-- overtime_requests: composite for sync-payroll batch + approveOT + monthly report
CREATE INDEX IF NOT EXISTS idx_or_user_date_status ON overtime_requests(user_id, ot_date, status);
CREATE INDEX IF NOT EXISTS idx_or_date_status       ON overtime_requests(ot_date, status);

-- leave_requests: composite for calculateAttendanceRecord date-range look up
CREATE INDEX IF NOT EXISTS idx_lr_user_status_dates ON leave_requests(user_id, status, start_date, end_date);

-- attendance_records: composite for reports/summaries that filter by status
CREATE INDEX IF NOT EXISTS idx_ar_user_status ON attendance_records(user_id, status);
