CREATE TYPE assignment_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE assignment_status AS ENUM (
  'draft',
  'active',
  'done',
  'cancelled'
);

CREATE TYPE assignee_status AS ENUM (
  'pending',
  'accepted',
  'in_progress',
  'done',
  'rejected'
);
