# Phase 1 Data Model: User Profile & Return Request

## Reservation (extended)

Extends the existing `reservations` table from `004-reservation-flow` with one new nullable
column. No new entity is introduced.

| Field | Type | Notes |
|---|---|---|
| `id` | text (UUID) | Primary key (existing) |
| `book_id` | text | References `books.id` (existing) |
| `user_id` | text | References `users.id`; the owning user (existing) |
| `status` | text enum: `pending` \| `confirmed` \| `checked_out` \| `return_requested` \| `returned` \| `cancelled` | This feature drives the `checked_out → return_requested` transition; all other transitions remain owned by `004-reservation-flow` (and, concurrently, FEAT-05's admin forced-return) |
| `requested_date` | text (ISO date) | Existing — unrelated to this feature |
| `agreed_date` | text, nullable | Existing — unrelated to this feature |
| `checked_out_at` | text, nullable | Existing — unrelated to this feature |
| `return_requested_date` | text (ISO date), nullable | **New in this feature.** The user's preferred return date; `NULL` until a return request is accepted, set exactly once at that point |
| `returned_at` | text, nullable | Existing — out of scope; a later feature (admin forced return) sets this |
| `created_at` | text (ISO datetime) | Existing |
| `updated_at` | text (ISO datetime) | Existing — updated by this feature's transition like every other transition |

**Validation rules** (from spec Functional Requirements):
- A return request MUST only succeed when `status = 'checked_out'` at write time (FR-007) —
  enforced by a guarded `UPDATE ... WHERE status = 'checked_out'` (research.md §3).
- A return request MUST only be accepted for a reservation owned by the requesting user
  (FR-008, FR-010); a reservation that doesn't exist, or belongs to another user, MUST produce an
  identical `404`-shaped response (research.md §2).
- A return request MUST include a preferred return date; missing/empty is rejected before any
  state change (FR-009), returning `400`, distinct from the `409` transition-guard case.
- On success, `return_requested_date` is set to the supplied date and `status` becomes
  `return_requested` (FR-005, FR-006), in the same write.

**State transition** (this feature's scope only):

```text
checked_out --user requests return (preferredReturnDate given, caller owns the reservation)-->
    status=return_requested, return_requested_date=<given>, updated_at=now
```

Any return-request attempt on a non-`checked_out` row is rejected (409) with no state change.
Any return-request attempt on a reservation not owned by the caller (or that doesn't exist) is
rejected (404) with no state change and no ownership information disclosed.

## Relationships

Unchanged from `004-reservation-flow` — this feature adds no new relationships, only reads and
conditionally writes existing `reservations` rows scoped to `user_id = caller`.
