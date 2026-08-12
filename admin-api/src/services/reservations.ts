// T008: Reservation data-access service — see specs/004-reservation-flow/data-model.md and
// research.md §3 for the guarded-update-with-compensation concurrency pattern used by
// confirmReservation.
import { decrementQuantityAvailable, incrementQuantityAvailable, findBookById } from "./books";
import { createNotification } from "./notifications";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_out"
  | "return_requested"
  | "returned"
  | "cancelled";

export interface ReservationRecord {
  id: string;
  bookId: string;
  userId: string;
  status: ReservationStatus;
  requestedDate: string;
  agreedDate: string | null;
  checkedOutAt: string | null;
  returnedAt: string | null;
  // T003: admin "force early return" marker — see specs/005-admin-loan-oversight/data-model.md.
  // Never implies a status change by itself; set/re-set only by forceReturn.
  forceReturnRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReservationRecord extends ReservationRecord {
  bookTitle: string;
  bookAuthor: string;
  userEmail: string;
}

interface ReservationRow {
  id: string;
  book_id: string;
  user_id: string;
  status: string;
  requested_date: string;
  agreed_date: string | null;
  checked_out_at: string | null;
  returned_at: string | null;
  force_return_requested_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminReservationRow extends ReservationRow {
  book_title: string;
  book_author: string;
  user_email: string;
}

function mapRow(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    status: row.status as ReservationStatus,
    requestedDate: row.requested_date,
    agreedDate: row.agreed_date,
    checkedOutAt: row.checked_out_at,
    returnedAt: row.returned_at,
    forceReturnRequestedAt: row.force_return_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminRow(row: AdminReservationRow): AdminReservationRecord {
  return {
    ...mapRow(row),
    bookTitle: row.book_title,
    bookAuthor: row.book_author,
    userEmail: row.user_email,
  };
}

export async function createReservation(
  db: D1Database,
  params: { bookId: string; userId: string; requestedDate: string },
): Promise<ReservationRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO reservations
         (id, book_id, user_id, status, requested_date, agreed_date, checked_out_at, returned_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?, ?)`,
    )
    .bind(id, params.bookId, params.userId, params.requestedDate, now, now)
    .run();
  return {
    id,
    bookId: params.bookId,
    userId: params.userId,
    status: "pending",
    requestedDate: params.requestedDate,
    agreedDate: null,
    checkedOutAt: null,
    returnedAt: null,
    forceReturnRequestedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function findReservationById(db: D1Database, id: string): Promise<ReservationRecord | null> {
  const row = await db.prepare("SELECT * FROM reservations WHERE id = ?1").bind(id).first<ReservationRow>();
  return row ? mapRow(row) : null;
}

export async function listReservationsByUser(db: D1Database, userId: string): Promise<ReservationRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM reservations WHERE user_id = ?1 ORDER BY created_at DESC")
    .bind(userId)
    .all<ReservationRow>();
  return results.map(mapRow);
}

const VALID_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "checked_out",
  "return_requested",
  "returned",
  "cancelled",
];

export function isValidReservationStatus(value: string): value is ReservationStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

// T004: bookId/userId filters added alongside the existing status filter — combined via AND
// when multiple are supplied. See specs/005-admin-loan-oversight/data-model.md.
export async function listReservationsForAdmin(
  db: D1Database,
  filters?: { status?: ReservationStatus; bookId?: string; userId?: string },
): Promise<AdminReservationRecord[]> {
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (filters?.status) {
    conditions.push("r.status = ?");
    bindings.push(filters.status);
  }
  if (filters?.bookId) {
    conditions.push("r.book_id = ?");
    bindings.push(filters.bookId);
  }
  if (filters?.userId) {
    conditions.push("r.user_id = ?");
    bindings.push(filters.userId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT
      r.*,
      b.title AS book_title,
      b.author AS book_author,
      u.email AS user_email
    FROM reservations r
    JOIN books b ON b.id = r.book_id
    JOIN users u ON u.id = r.user_id
    ${where}
    ORDER BY r.created_at DESC
  `;
  const { results } = await db
    .prepare(query)
    .bind(...bindings)
    .all<AdminReservationRow>();
  return results.map(mapAdminRow);
}

export type ConfirmReservationResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_status_transition" }
  | { outcome: "no_copies_available" }
  | { outcome: "ok"; reservation: ReservationRecord };

// Guarded-update-with-compensation pattern — see research.md §3.
export async function confirmReservation(
  db: D1Database,
  id: string,
  agreedDate: string,
): Promise<ConfirmReservationResult> {
  const existing = await findReservationById(db, id);
  if (!existing) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const transition = await db
    .prepare(
      `UPDATE reservations SET status = 'confirmed', agreed_date = ?1, updated_at = ?2
       WHERE id = ?3 AND status = 'pending'`,
    )
    .bind(agreedDate, now, id)
    .run();

  if ((transition.meta.changes ?? 0) === 0) {
    return { outcome: "invalid_status_transition" };
  }

  const decremented = await decrementQuantityAvailable(db, existing.bookId);
  if (!decremented) {
    // Compensate: revert the status transition above — the book ran out between the initial
    // soft check and confirmation (research.md §3 / spec.md Edge Cases race scenario).
    await db
      .prepare(`UPDATE reservations SET status = 'pending', agreed_date = NULL, updated_at = ?1 WHERE id = ?2`)
      .bind(new Date().toISOString(), id)
      .run();
    return { outcome: "no_copies_available" };
  }

  const reservation = await findReservationById(db, id);

  // T005 (006-notifications): notify the reservation's owner that it was confirmed. Only on the
  // success path — no notification is created for the no_copies_available compensation case
  // above, since that event never actually happened. See specs/006-notifications/research.md §5.
  const book = await findBookById(db, existing.bookId);
  await createNotification(db, {
    userId: existing.userId,
    type: "reservation_confirmed",
    message: `Your reservation for "${book?.title ?? "your book"}" was confirmed for ${agreedDate}.`,
    relatedReservationId: id,
  });

  return { outcome: "ok", reservation: reservation! };
}

export type ConfirmReturnResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_status_transition" }
  | { outcome: "ok"; reservation: ReservationRecord };

// T007: POST /admin/reservations/:id/confirm-return — valid from 'checked_out' or
// 'return_requested' (an admin can confirm a physical return even without a prior explicit
// return request). See specs/005-admin-loan-oversight/data-model.md and research.md §3.
export async function confirmReturn(db: D1Database, id: string): Promise<ConfirmReturnResult> {
  const existing = await findReservationById(db, id);
  if (!existing) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const transition = await db
    .prepare(
      `UPDATE reservations SET status = 'returned', returned_at = ?1, updated_at = ?1
       WHERE id = ?2 AND status IN ('checked_out', 'return_requested')`,
    )
    .bind(now, id)
    .run();

  if ((transition.meta.changes ?? 0) === 0) {
    return { outcome: "invalid_status_transition" };
  }

  const incremented = await incrementQuantityAvailable(db, existing.bookId);
  if (!incremented) {
    // Should not happen in normal operation — a checked_out/return_requested reservation implies
    // a copy is genuinely out, so the table's own quantity_available <= quantity_total CHECK
    // should never reject this increment. Surface as an unexpected internal error (research.md §3).
    throw new Error(`incrementQuantityAvailable failed unexpectedly for book ${existing.bookId}`);
  }

  const reservation = await findReservationById(db, id);

  // T007 (006-notifications): notify the owner their return was confirmed.
  const book = await findBookById(db, existing.bookId);
  await createNotification(db, {
    userId: existing.userId,
    type: "return_confirmed",
    message: `Your return of "${book?.title ?? "your book"}" has been confirmed. Thank you!`,
    relatedReservationId: id,
  });

  return { outcome: "ok", reservation: reservation! };
}

export type ForceReturnResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_status_transition" }
  | { outcome: "ok"; reservation: ReservationRecord };

// T009: POST /admin/reservations/:id/force-return — valid only from 'checked_out' or 'confirmed'.
// Does NOT change status (the book is still physically out); only sets
// force_return_requested_at. Idempotent: no extra guard on the column's current value, so a
// repeat call still matches the WHERE and simply overwrites the timestamp. See
// specs/005-admin-loan-oversight/data-model.md and research.md §4.
export async function forceReturn(db: D1Database, id: string): Promise<ForceReturnResult> {
  const existing = await findReservationById(db, id);
  if (!existing) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const transition = await db
    .prepare(
      `UPDATE reservations SET force_return_requested_at = ?1, updated_at = ?1
       WHERE id = ?2 AND status IN ('checked_out', 'confirmed')`,
    )
    .bind(now, id)
    .run();

  if ((transition.meta.changes ?? 0) === 0) {
    return { outcome: "invalid_status_transition" };
  }

  const reservation = await findReservationById(db, id);

  // T006 (006-notifications): notify the owner the library has requested an early return.
  const book = await findBookById(db, existing.bookId);
  await createNotification(db, {
    userId: existing.userId,
    type: "force_return_requested",
    message: `Please return "${book?.title ?? "your book"}" soon — the library has requested an early return.`,
    relatedReservationId: id,
  });

  return { outcome: "ok", reservation: reservation! };
}

// T002 (005-user-profile-return): a signed-in user requests a return of their own checked-out
// reservation — see specs/005-user-profile-return/research.md §2 and §4 for why the ownership
// check lives here and collapses "doesn't exist" and "belongs to someone else" into the same
// not_found outcome.
export type RequestReturnResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_status_transition" }
  | { outcome: "ok"; reservation: ReservationRecord };

export async function requestReturn(
  db: D1Database,
  id: string,
  userId: string,
  preferredReturnDate: string,
): Promise<RequestReturnResult> {
  const existing = await findReservationById(db, id);
  if (!existing || existing.userId !== userId) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const transition = await db
    .prepare(
      `UPDATE reservations SET status = 'return_requested', return_requested_date = ?1, updated_at = ?2
       WHERE id = ?3 AND status = 'checked_out'`,
    )
    .bind(preferredReturnDate, now, id)
    .run();

  if ((transition.meta.changes ?? 0) === 0) {
    return { outcome: "invalid_status_transition" };
  }

  const reservation = await findReservationById(db, id);
  return { outcome: "ok", reservation: reservation! };
}

export type CheckOutReservationResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_status_transition" }
  | { outcome: "ok"; reservation: ReservationRecord };

export async function checkOutReservation(db: D1Database, id: string): Promise<CheckOutReservationResult> {
  const existing = await findReservationById(db, id);
  if (!existing) {
    return { outcome: "not_found" };
  }

  const now = new Date().toISOString();
  const transition = await db
    .prepare(
      `UPDATE reservations SET status = 'checked_out', checked_out_at = ?1, updated_at = ?1
       WHERE id = ?2 AND status = 'confirmed'`,
    )
    .bind(now, id)
    .run();

  if ((transition.meta.changes ?? 0) === 0) {
    return { outcome: "invalid_status_transition" };
  }

  const reservation = await findReservationById(db, id);
  return { outcome: "ok", reservation: reservation! };
}
