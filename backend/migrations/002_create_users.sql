CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           user_role NOT NULL DEFAULT 'staff',
  status         user_status NOT NULL DEFAULT 'active',
  phone          VARCHAR(20),
  job_title      VARCHAR(100),
  avatar_url     TEXT,
  must_change_pw BOOLEAN NOT NULL DEFAULT FALSE,
  login_attempts INT NOT NULL DEFAULT 0,
  locked_until   TIMESTAMP,
  last_login_at  TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);
