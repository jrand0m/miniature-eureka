# Phase 0 Research: User Profile & Return Request

No item in Technical Context was left as `NEEDS CLARIFICATION` — this feature reuses the stack,
patterns, and conventions already established by `001-auth-user-management` and
`004-reservation-flow`. The items below are the small number of feature-specific decisions
worth recording.

## 1. Schema change shape: `ALTER TABLE ... ADD COLUMN` vs. new table

**Decision**: A single-statement migration, `ALTER TABLE reservations ADD COLUMN
return_requested_date TEXT;` — nullable, no default, no `CHECK` constraint.

**Rationale**: SQLite (and D1) supports adding a nullable column without a table rebuild, unlike
changing a `CHECK` constraint (which `004-reservation-flow`'s research.md §2 already documented
as expensive). The task brief specifies this exact column and migration filename directly, so no
alternative shape was considered for the column itself.

**Alternatives considered**: A separate `return_requests` table (one row per return request) —
rejected as over-engineering for a single nullable date that only ever holds the most recent
request; the existing `reservations.status` state machine already represents "is a return
pending" via the `return_requested` status value reserved for exactly this purpose since
`004-reservation-flow`'s migration.

## 2. Ownership check: 404 vs. 403 for another user's reservation

**Decision**: `findReservationById` returns the row regardless of owner; the route/service layer
compares `existing.userId !== callerId` and returns `404 not_found` (the same shape as "no such
reservation") rather than `403 forbidden`.

**Rationale**: Explicitly required by the task brief, and consistent with the constitution's
data-minimization posture — a `403` would confirm to an attacker that a reservation with that id
exists and belongs to someone else, which is exactly the kind of existence leak `404` avoids.
This mirrors the general principle (not yet exercised elsewhere in this codebase, since
`004-reservation-flow`'s admin endpoints are role-gated, not per-owner-gated) that owned-resource
lookups should fail closed and uniformly.

**Alternatives considered**: `403 Forbidden` — rejected per the brief's explicit instruction and
the existence-leak rationale above. Silently returning `200` with no-op — rejected as it would
mask the request from the caller instead of giving them an honest "this isn't yours/doesn't
exist" signal without over-disclosing which.

## 3. Status-transition guard pattern

**Decision**: Reuse the exact guarded-update-with-row-count-check pattern from
`confirmReservation`/`checkOutReservation` in `services/reservations.ts`: look up the row first
(for the 404/ownership check), then run `UPDATE reservations SET status = 'return_requested',
return_requested_date = ?, updated_at = ? WHERE id = ? AND status = 'checked_out'` and inspect
`meta.changes`; zero rows means the transition was invalid (409), since the row existed (already
confirmed by the prior lookup) but wasn't in `checked_out` status at write time.

**Rationale**: Matches the established convention exactly (same file, same result-type shape:
`{ outcome: "not_found" } | { outcome: "invalid_status_transition" } | { outcome: "ok"; reservation }`),
and correctly handles the race where a reservation's status changes between the initial lookup
and the guarded write (e.g., an admin-side action from the concurrently-developed FEAT-05 forced
return acts on the same row between this feature's lookup and update).

**Alternatives considered**: `SELECT` then unconditional `UPDATE` without a `WHERE status = ...`
guard — rejected as racy, for the same reason `004-reservation-flow`'s research.md §3 rejected it
for `confirmReservation`.

## 4. Where the ownership check happens (route vs. service)

**Decision**: The ownership comparison (`existing.userId !== callerId`) lives in the new service
function `requestReturn`, which takes `userId` as an explicit parameter and returns `not_found`
for both "no such row" and "row belongs to someone else" — the caller (route handler) never sees
which case it was.

**Rationale**: Keeps the security-sensitive decision (never leak existence) inside the one
function responsible for it, rather than splitting the check between the route and service layer
where a future edit could accidentally reintroduce a distinguishing response. This also matches
how `confirmReservation`/`checkOutReservation` keep their whole transition-validity decision
inside the service function and let the route purely translate `outcome` to an HTTP status.

**Alternatives considered**: Doing the ownership check in the route handler after calling a
generic `findReservationById` — rejected because it would require the route layer to hold and
act on security logic that's easy to get wrong/drift from the service's own transition guard, and
splits one security decision across two files.
