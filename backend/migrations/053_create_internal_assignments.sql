CREATE TABLE internal_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  priority      assignment_priority NOT NULL DEFAULT 'normal',
  deadline_date DATE,
  status        assignment_status NOT NULL DEFAULT 'draft',
  created_by    UUID NOT NULL REFERENCES users(id),
  sent_at       TIMESTAMP,
  closed_at     TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ia_created_by ON internal_assignments(created_by);
CREATE INDEX idx_ia_company    ON internal_assignments(company_id);
CREATE INDEX idx_ia_status     ON internal_assignments(status);
CREATE INDEX idx_ia_deadline   ON internal_assignments(deadline_date);

CREATE TABLE internal_assignment_assignees (
  assignment_id UUID NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        assignee_status NOT NULL DEFAULT 'pending',
  accepted_at   TIMESTAMP,
  completed_at  TIMESTAMP,
  rejected_at   TIMESTAMP,
  note          TEXT,

  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX idx_iaa_user_id ON internal_assignment_assignees(user_id);
CREATE INDEX idx_iaa_status  ON internal_assignment_assignees(user_id, status);

CREATE TABLE internal_assignment_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iac_assignment ON internal_assignment_comments(assignment_id);
