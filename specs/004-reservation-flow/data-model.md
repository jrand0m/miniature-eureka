# Phase 1 Data Model: Reservation Flow

## Reservation

Represents one user's request to borrow a specific book on a preferred date, and its progress
toward being honored.

| Field | Type | Notes |
|---|---|---|
| `id` | text (UUID) | Primary key |
| `book_id` | text | References `books.id`; the book being reserved |
| `user_id` | text | References `users.id`; the requesting user |
| `status` | text enum: `pending` \| `confirmed` \| `checked_out` \| `return_requested` \| `returned` \| `cancelled` | This feature drives only `pending → confirmed → checked_out`; the last three values are reserved schema space for later features (user-initiated returns, admin-forced returns, notifications) and are never produced by this feature's endpoints |
| `requested_date` | text (ISO date, `YYYY-MM-DD`) | The user's preferred delivery date, set at creation, never changed afterward |
| `agreed_date` | text (ISO date, `YYYY-MM-DD`), nullable | `NULL` until an admin confirms; set exactly once, at confirm time |
| `checked_out_at` | text (ISO datetime), nullable | `NULL` until an admin checks the reservation out; set exactly once |
| `returned_at` | text (ISO datetime), nullable | Reserved for a later feature (user/admin return flow); this feature never sets it |
| `created_at` | text (ISO datetime) | Set once, at creation |
| `updated_at` | text (ISO datetime) | Updated on every state transition this feature performs |

**Validation rules** (from spec Functional Requirements):
- `status` MUST be one of the six enumerated values (DB-level `CHECK` constraint — see
  research.md §2 for why all six are defined now).
- A reservation MUST NOT be created unless the referenced book exists and currently has
  `quantity_available > 0` (FR-002, FR-003) — enforced in the service layer at request time
  (soft check).
- Creating a reservation MUST NOT modify `books.quantity_available` (FR-004).
- Confirming a reservation MUST only succeed when `status = 'pending'` (FR-010) and the book
  still has `quantity_available > 0` at that moment (FR-011) — both enforced by guarded
  `UPDATE ... WHERE` statements (research.md §3), and confirming decrements
  `books.quantity_available` by exactly one (FR-009).
- Checking out a reservation MUST only succeed when `status = 'confirmed'` (FR-013).
- A user retrieving reservations MUST only ever see rows where `user_id` matches their own
  authenticated id (FR-006).

**State transitions** (this feature's scope only — `return_requested`/`returned`/`cancelled`
are out of scope and have no transition defined here):

```text
[no row] --user requests reservation (book exists, quantity_available > 0)-->
    status=pending, requested_date=<given>, agreed_date=NULL, checked_out_at=NULL, returned_at=NULL

pending --admin confirms (book still quantity_available > 0)-->
    status=confirmed, agreed_date=<given>, books.quantity_available -= 1

confirmed --admin checks out-->
    status=checked_out, checked_out_at=now
```

Any confirm attempt on a non-`pending` row, or check-out attempt on a non-`confirmed` row, is
rejected (409) with no state change (FR-010, FR-013).

## Relationships

- Each `Reservation` belongs to exactly one `Book` (`book_id → books.id`) and exactly one `User`
  (`user_id → users.id`). Both `books` and `users` are owned by sibling features (see plan.md);
  this feature only reads/decrements `books.quantity_available` and reads `users.email` for the
  admin queue display.
