-- Checklist items for internal assignments
CREATE TABLE ia_checklist_items (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID    NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  text          VARCHAR(500) NOT NULL,
  is_done       BOOLEAN NOT NULL DEFAULT false,
  position      INTEGER NOT NULL DEFAULT 0,
  created_by    UUID    NOT NULL REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ia_checklist_assignment ON ia_checklist_items(assignment_id);

-- Link attachments for internal assignments
CREATE TABLE ia_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  url           TEXT NOT NULL,
  description   TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ia_links_assignment ON ia_links(assignment_id);
