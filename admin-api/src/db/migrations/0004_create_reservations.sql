-- T007: `reservations` table.
--
-- Status enum is intentionally sized for three later features beyond this one (a user-initiated
-- return request, an admin-forced return/oversight page, and a notifications system) — see
-- specs/004-reservation-flow/research.md §2. This feature only drives
-- pending -> confirmed -> checked_out; the other three values are reserved schema space and are
-- never produced by this feature's endpoints.
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'confirmed', 'checked_out', 'return_requested', 'returned', 'cancelled')
  ),
  requested_date TEXT NOT NULL,
  agreed_date TEXT,
  checked_out_at TEXT,
  returned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_reservations_status ON reservations(status);
