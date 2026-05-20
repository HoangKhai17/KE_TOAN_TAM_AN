-- Add approval_note to leave_requests and overtime_requests
ALTER TABLE leave_requests    ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS approval_note TEXT;
