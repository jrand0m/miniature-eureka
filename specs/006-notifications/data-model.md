# Phase 1 Data Model: User Notifications (Inbox & Live Stream)

## Notification (new entity)

New `notifications` table (migration `0007_create_notifications.sql`). One row per
system-generated notification, owned by exactly one user.

| Field | Type | Notes |
|---|---|---|
| `id` | text (UUID) | Primary key; `crypto.randomUUID()`, matching every other table's convention |
| `user_id` | text | References `users.id` (existing table); the notification's owner |
| `type` | text | Short machine-readable category, e.g. `reservation_confirmed`, `force_return_requested`, `return_confirmed` — one value per trigger point |
| `message` | text | Human-readable, fully-composed at creation time (research.md §4) — e.g. `Your reservation for "Dune" was confirmed for 2026-09-01.` |
| `related_reservation_id` | text, nullable | References `reservations.id` (existing table); set on all three system trigger points, present for context/linking |
| `created_at` | text (ISO datetime) | Set once at creation; never updated |
| `read_at` | text, nullable | `NULL` until the owning user marks it read; set exactly once, never cleared (no "mark unread" per spec Assumptions) |

**Indexes**: `idx_notifications_user_created` on `(user_id, created_at)` — serves both
`listNotificationsByUser` (history, most-recent-first) and `listNotificationsSince` (the polling
query), the two read paths that filter/order by this pair.

**Validation rules** (from spec Functional Requirements):
- A notification is only ever created by the system (three defined trigger points in
  `services/reservations.ts`), never directly by a user-facing endpoint (FR-001–FR-004, FR-010).
- `GET /notifications` and the SSE stream MUST only ever return notifications where
  `user_id = caller` (FR-005, FR-008–FR-010).
- `POST /notifications/:id/read` MUST only succeed for a notification owned by the caller; a
  notification that doesn't exist, or belongs to another user, MUST produce an identical
  `404`-shaped response (FR-007), mirroring the ownership-scoping precedent already established by
  `005-user-profile-return`'s `requestReturn`.
- Marking an already-read notification read again is a harmless no-op (idempotent — the write sets
  `read_at` to "now" again if unset, or leaves an already-set `read_at` as informational; either
  way the response is `200` and the caller-visible state, "read", is unchanged).

**State transition** (this feature's scope only):

```text
(created, unread: read_at = NULL)
  --owning user marks read-->
(read: read_at = <timestamp of mark-read call>)
```

There is no reverse transition (no "mark unread") and no deletion, per spec Assumptions.

## Relationships

- `notifications.user_id` → `users.id` (existing table, `001-auth-user-management`) — many
  notifications per user.
- `notifications.related_reservation_id` → `reservations.id` (existing table,
  `004-reservation-flow`), nullable — many notifications may reference the same reservation over
  its lifecycle (e.g. one on confirmation, potentially another later on forced return, another on
  return confirmation), but a notification is never required to reference a reservation (schema
  allows `NULL` for future non-reservation notification types, though this feature only produces
  reservation-related ones).

No changes to any existing table's schema; `reservations` and `users` are read-only from this
feature's perspective (`findBookById`/`findReservationById` lookups only).
