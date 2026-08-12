# Phase 0 Research: Admin Loan Oversight

No item in Technical Context was left as `NEEDS CLARIFICATION` — this feature reuses the stack,
patterns, and conventions already established by `003-admin-book-mgmt` and
`004-reservation-flow`. The items below are the small number of feature-specific decisions worth
recording.

## 1. Migration numbering under a concurrent sibling feature

**Decision**: Use `0006_add_force_return_flag.sql`, explicitly skipping `0005`.

**Rationale**: Per this feature's brief, a sibling feature (FEAT-04, member self-service return
requests) is concurrently in flight in a separate worktree off the same base commit and is
expected to claim migration number `0005` for its own unrelated column. Using `0006` avoids a
collision at merge time. At the time this plan was written, `0005` did not yet exist in this
worktree (confirmed: `admin-api/src/db/migrations/` contains only `0001`-`0004`), which is
consistent with — not contradictory to — the sibling feature being mid-flight elsewhere.

**Alternatives considered**: Using `0005` — rejected outright per the explicit brief instruction,
since it would collide with the sibling feature's migration at merge time. Waiting for the
sibling feature to merge first — rejected; the two features are intentionally decoupled so they
can proceed in parallel and be reconciled at merge time.

## 2. `force_return_requested_at` does not change `status`

**Decision**: `POST /admin/reservations/:id/force-return` writes only
`force_return_requested_at`; it never touches the `status` column.

**Rationale**: The book is still physically checked out when an admin forces an early return —
this is a *request*, not a completed return. Modeling it as a separate nullable timestamp column
(rather than, say, a new `status` value or reusing `return_requested`) keeps the existing status
state machine untouched and gives a later notifications feature an unambiguous signal
("early-return has been requested but not yet fulfilled") independent of whatever status the
loan is otherwise in. It also composes cleanly with confirm-return: a loan can have
`force_return_requested_at` set and then later be confirmed returned through the normal
`confirm-return` action, with no special-casing needed in that handler.

**Alternatives considered**: Introducing a new `status` value (e.g., `force_return_requested`) —
rejected because it would collide with the existing `return_requested` value's meaning (a
member-initiated request) and would require a `CHECK` constraint rebuild; a boolean flag column
without a timestamp — rejected because FR-009/FR-010 and the future notifications hook both
benefit from knowing *when* the request was (most recently) made, and idempotent re-requesting
needs somewhere to record the update.

## 3. `confirm-return`'s guarded-update pattern

**Decision**: Follow the exact guarded-UPDATE style already used by `confirmReservation` and
`checkOutReservation` in `services/reservations.ts`: a single `UPDATE ... WHERE id = ? AND status
IN ('checked_out','return_requested')` (checking `meta.changes` for the 409 case), followed by a
call to the new `incrementQuantityAvailable`.

**Rationale**: Consistent with the codebase's established optimistic-concurrency convention
(see `004-reservation-flow`'s research.md §3) — no new pattern is introduced. Unlike
`confirmReservation`'s decrement, this increment has no failure mode that requires compensating
the status transition: the table's own `CHECK (quantity_available <= quantity_total)` constraint
is the only thing that could reject the increment, and per this feature's brief that should never
happen in the normal flow (a `checked_out`/`return_requested` reservation implies a copy is
genuinely out) — if it somehow does, it surfaces as an unexpected 500, not a modeled 409 outcome.

**Alternatives considered**: Running the status UPDATE and the inventory increment as two
independent, unguarded statements — rejected; guarding both writes (status transition guarded by
`WHERE status IN (...)`, increment guarded implicitly by the table's own CHECK) keeps the same
optimistic-concurrency safety property the rest of this table's transitions already have.

## 4. `force-return`'s idempotent re-request

**Decision**: `force-return`'s guard is `WHERE status IN ('checked_out','confirmed')` only (not
also `AND force_return_requested_at IS NULL`) — so calling it again on an already-flagged loan
still matches the guard and simply overwrites the timestamp with `now`.

**Rationale**: FR-009 explicitly requires idempotent re-requesting (updating the timestamp,
no error) rather than treating an already-set flag as a conflict.

**Alternatives considered**: Returning a no-op/short-circuit response when already set without
re-running the UPDATE — rejected as needless special-casing; letting the same guarded UPDATE run
again naturally satisfies "idempotent" while keeping one code path.

## 5. Admin-UI Loans page structure

**Decision**: `admin-ui/loans.html` + `admin-ui/src/pages/loans.ts`, structured like
`admin-ui/src/pages/books.ts` (list + client-side filter controls + inline per-row action
buttons), per this feature's explicit brief.

**Rationale**: `books.ts` is the newest and closest analog already in the codebase — matching its
structure (module-level DOM element lookups, a `loadX()` refresh function, per-row action
buttons wired to API calls that `showMessage()` and reload the list) keeps the admin-ui
conventions consistent across pages rather than introducing a new pattern for one page.

**Alternatives considered**: Following `users.ts` instead — rejected; `books.ts` is explicitly
called out in the brief as the closer analog (it has filters and multiple action buttons per
row, which `users.ts` — a simpler enable/disable toggle list — does not).
