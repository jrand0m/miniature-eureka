// T002: Notification data-access service — see specs/006-notifications/data-model.md and
// research.md §3-4 for the polling-since tie-breaking and point-in-time message rationale.

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  message: string;
  relatedReservationId: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  message: string;
  related_reservation_id: string | null;
  created_at: string;
  read_at: string | null;
}

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    relatedReservationId: row.related_reservation_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export interface CreateNotificationParams {
  userId: string;
  type: string;
  message: string;
  relatedReservationId: string | null;
}

// Called only from the system's three reservation-lifecycle trigger points
// (confirmReservation, forceReturn, confirmReturn in services/reservations.ts) — never directly
// from a user-facing endpoint (spec.md FR-001-FR-004, FR-010).
export async function createNotification(
  db: D1Database,
  params: CreateNotificationParams,
): Promise<NotificationRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO notifications
         (id, user_id, type, message, related_reservation_id, created_at, read_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)`,
    )
    .bind(id, params.userId, params.type, params.message, params.relatedReservationId, now)
    .run();
  return {
    id,
    userId: params.userId,
    type: params.type,
    message: params.message,
    relatedReservationId: params.relatedReservationId,
    createdAt: now,
    readAt: null,
  };
}

// GET /notifications — full history, most recent first. Ties on created_at broken by id (desc)
// so ordering is stable/deterministic.
export async function listNotificationsByUser(
  db: D1Database,
  userId: string,
): Promise<NotificationRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC, id DESC")
    .bind(userId)
    .all<NotificationRow>();
  return results.map(mapRow);
}

export async function findNotificationById(db: D1Database, id: string): Promise<NotificationRecord | null> {
  const row = await db.prepare("SELECT * FROM notifications WHERE id = ?1").bind(id).first<NotificationRow>();
  return row ? mapRow(row) : null;
}

export type MarkReadResult =
  | { outcome: "not_found" }
  | { outcome: "ok"; notification: NotificationRecord };

// POST /notifications/:id/read — ownership-scoped like requestReturn's pattern
// (specs/005-user-profile-return): a nonexistent id and someone else's id both produce
// "not_found", so the response never discloses which. Marking an already-read notification read
// again is a harmless no-op — the row still exists and belongs to the caller, so it still
// succeeds with outcome "ok", not "not_found".
export async function markRead(db: D1Database, id: string, userId: string): Promise<MarkReadResult> {
  const existing = await findNotificationById(db, id);
  if (!existing || existing.userId !== userId) {
    return { outcome: "not_found" };
  }

  if (!existing.readAt) {
    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND user_id = ?3`)
      .bind(now, id, userId)
      .run();
    return { outcome: "ok", notification: { ...existing, readAt: now } };
  }

  return { outcome: "ok", notification: existing };
}

// Polling-since query for the SSE stream (GET /notifications/stream) — see research.md §3.
// `created_at` alone is not a safe cursor because two notifications can share the same
// millisecond timestamp; comparing (created_at, id) together guarantees each row is delivered
// exactly once across repeated polls.
export async function listNotificationsSince(
  db: D1Database,
  userId: string,
  sinceCreatedAt: string,
  sinceId: string,
): Promise<NotificationRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id = ?1 AND (created_at > ?2 OR (created_at = ?2 AND id > ?3))
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(userId, sinceCreatedAt, sinceId)
    .all<NotificationRow>();
  return results.map(mapRow);
}
