-- T001: `notifications` table — per-user notification inbox, part of the constitution's public
-- library surface (v1.3.0, Principle I item c: "reading their own notification stream/inbox").
-- Populated only by the system (three trigger points in services/reservations.ts: confirm,
-- force-return, confirm-return); never written to directly by a user-facing endpoint. See
-- specs/006-notifications/data-model.md.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  related_reservation_id TEXT REFERENCES reservations(id),
  created_at TEXT NOT NULL,
  read_at TEXT
);

-- Serves both the history read (listNotificationsByUser) and the polling-since query
-- (listNotificationsSince) used by the SSE stream — both filter/order on this pair.
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at);
