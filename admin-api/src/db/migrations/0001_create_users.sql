-- T005: users table (see specs/001-auth-user-management/data-model.md)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  registered_at TEXT NOT NULL,
  last_login_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

-- Case-insensitive email uniqueness, per FR-004.
CREATE UNIQUE INDEX idx_users_email ON users (email COLLATE NOCASE);
