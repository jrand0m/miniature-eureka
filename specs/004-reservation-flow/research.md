# Phase 0 Research: Reservation Flow

No item in Technical Context was left as `NEEDS CLARIFICATION` — this feature reuses the stack,
patterns, and conventions already established by `001-auth-user-management`. The items below
are the small number of feature-specific decisions worth recording.

## 1. Reservation id generation

**Decision**: `crypto.randomUUID()`, identical to `services/users.ts::createUser`.

**Rationale**: Matches the one existing precedent in this codebase exactly; no reason to
diverge (no requirement for sortable/sequential ids).

**Alternatives considered**: Auto-increment integer primary key — rejected only because it
breaks convention with the existing `users` table's UUID primary key; D1/SQLite supports either
equally well at this scale.

## 2. Status enum sizing

**Decision**: `CHECK (status IN ('pending','confirmed','checked_out','return_requested','returned','cancelled'))`
on a single `TEXT` column, all six values defined in this feature's migration even though only
the first three are driven by this feature.

**Rationale**: The task brief and the ratified constitution (v1.3.0) both anticipate three
later features — a user-initiated return request, an admin-forced return/oversight page, and a
notifications system — that will need `return_requested`, `returned`, and `cancelled`
respectively (cancellation was folded in as the natural terminal state for a pending/confirmed
reservation the user or admin abandons). Altering a `CHECK` constraint in SQLite requires a
table rebuild (`ALTER TABLE` cannot modify constraints in place), which is expensive and
migration-risky once the table holds real rows — so the constraint is sized correctly once, now,
while the table is still empty.

**Alternatives considered**:
- Two separate enums (a "core" status and a nullable "extension" status) — rejected as needless
  complexity; a single flat enum is simpler to query and matches how `users.role` is modeled
  (single `TEXT` + `CHECK`).
- No `CHECK` constraint, validate only in application code — rejected; every other enum-shaped
  column in this codebase (`users.role`) uses a DB-level `CHECK`, and the task brief explicitly
  calls out the cost of altering this later as the reason to get it right now.

## 3. Inventory decrement transaction safety

**Decision**: The confirm handler uses a sequential guarded-update-with-compensation pattern,
not `db.batch()` (batch runs all statements unconditionally as a group — it does not let a
later statement branch on an earlier statement's row count, so it cannot express "only
decrement if the status transition actually happened"):
1. `UPDATE reservations SET status = 'confirmed', agreed_date = ?, updated_at = ? WHERE id = ? AND status = 'pending'` — check the reported row-count (`meta.changes`). Zero rows means either the reservation doesn't exist (checked separately beforehand for the 404 case) or it wasn't `pending` (409).
2. Only if step 1 changed exactly one row: `UPDATE books SET quantity_available = quantity_available - 1 WHERE id = ? AND quantity_available > 0` — check row-count again. Zero rows means availability was exhausted by another confirm between the initial soft check and now.
3. If step 2 changed zero rows, compensate by reverting step 1 (`UPDATE reservations SET status = 'pending', agreed_date = NULL WHERE id = ?`) and return `409 no_copies_available`.

**Rationale**: The spec's Edge Cases explicitly call out the two-admin race scenario; guarding
every write with a `WHERE status = '<expected prior status>'`/`WHERE quantity_available > 0`
clause and checking the reported row-count is the standard optimistic-concurrency pattern for
SQLite/D1. Because a D1-backed Worker request runs against a single-writer SQLite instance,
consecutive statements in one request handler observe a consistent view without needing a
general interactive transaction API.

**Alternatives considered**: A separate `SELECT ... then UPDATE` without a guard clause —
rejected as racy (two concurrent confirms could both read `pending` before either writes).
`db.batch()` — rejected per above, it cannot make the second statement conditional on the
first's outcome, which is exactly the guarantee this handler needs.

## 4. Provisional `books` infrastructure (see plan.md Complexity Tracking)

**Decision**: Build a minimal `0003_create_books.sql` migration, `services/books.ts`
(`findBookById`, `decrementQuantityAvailable`), a minimal public `GET /books`/`GET /books/:id`,
and a minimal `public-ui` catalog page, matching exactly the schema/contract described in this
feature's brief for the concurrently-developed sibling book-CRUD feature.

**Rationale**: This feature's own runtime-verification requirement cannot be satisfied without
a real, queryable `books` table in this worktree — the sibling feature exists in a different,
inaccessible worktree at the time of this build. Matching the given schema/contract exactly
(rather than inventing a different one) minimizes eventual merge-reconciliation cost.

**Alternatives considered**: Skip runtime verification and rely on typecheck/build only —
rejected; the confirm/check-out inventory-decrement logic is this feature's highest-risk code
path and the task explicitly requires exercising it via `wrangler dev` + `curl`.
