# Phase 1 Data Model: Admin Loan Oversight

This feature extends the existing `reservations` entity (owned by `004-reservation-flow`); it
introduces no new tables or entities of its own.

## Reservation (extended)

All fields are unchanged from `004-reservation-flow`'s data-model.md except the addition below.

| Field | Type | Notes |
|---|---|---|
| `force_return_requested_at` | text (ISO datetime), nullable | **New in this feature.** `NULL` until an admin forces an early return on a `checked_out` or `confirmed` reservation; set to the current time on each force-return request (including repeats — see research.md §4). Never cleared by this feature (there is no "un-flag" action in this feature's scope). Never implies a `status` change by itself. |

**Validation rules** (from spec Functional Requirements, this feature's additions only):

- `GET /admin/reservations` MAY be filtered by `bookId` and/or `userId`, each combined with any
  other supplied filter (including the existing `status` filter) via AND (FR-001, FR-002,
  FR-003). An unmatched filter value yields an empty result list, not an error (Edge Cases).
- Confirming a return MUST only succeed when `status IN ('checked_out', 'return_requested')`
  (FR-004) — enforced by a guarded `UPDATE ... WHERE` statement, consistent with
  `confirmReservation`/`checkOutReservation`'s pattern (research.md §3). On success:
  `returned_at` is set to now, `status` becomes `returned`, and the associated book's
  `quantity_available` is incremented by exactly one (FR-006).
- Forcing an early return MUST only succeed when `status IN ('checked_out', 'confirmed')`
  (FR-007) — enforced the same way. On success, only `force_return_requested_at` is set to now;
  `status` is left unchanged (FR-007). Calling it again on an already-flagged row is not an
  error — it simply updates the timestamp (FR-009).
- Any confirm-return or force-return attempt on a reservation in an ineligible status is
  rejected (409 `invalid_status_transition`) with no state change (FR-005, FR-008).

**State transitions** (this feature's additions only — existing `pending → confirmed →
checked_out` transitions from `004-reservation-flow` are unchanged):

```text
checked_out --admin confirms return--> returned
    returned_at=now, books.quantity_available += 1

return_requested --admin confirms return--> returned
    returned_at=now, books.quantity_available += 1

checked_out --admin forces early return--> checked_out   (status unchanged)
    force_return_requested_at=now

confirmed --admin forces early return--> confirmed   (status unchanged)
    force_return_requested_at=now
```

Any confirm-return attempt on a row not in `checked_out`/`return_requested`, or force-return
attempt on a row not in `checked_out`/`confirmed`, is rejected (409) with no state change
(FR-005, FR-008).

## Relationships

Unchanged from `004-reservation-flow`: each `Reservation` belongs to exactly one `Book`
(`book_id → books.id`) and exactly one `User` (`user_id → users.id`). This feature reads
`books.id`/`title`/`author` (via the existing `listReservationsForAdmin` join) and increments
`books.quantity_available` on confirmed returns via the new `incrementQuantityAvailable`
service function (mirrors `decrementQuantityAvailable`).
