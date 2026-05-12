CREATE TABLE leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type   VARCHAR(30) NOT NULL
               CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'maternity', 'paternity', 'other')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days_count   INTEGER NOT NULL DEFAULT 1,
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ
);

CREATE INDEX idx_leave_requests_user_id    ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status     ON leave_requests(status);
CREATE INDEX idx_leave_requests_start_date ON leave_requests(start_date);
