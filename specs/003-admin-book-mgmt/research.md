# Phase 0 Research: Admin Book Catalog & Inventory Management

All unknowns from the feature description were resolved during `/speckit-specify` (Assumptions
section and Clarifications session) — this feature reuses the existing codebase's stack and
conventions end-to-end, so there are no open technology-choice questions. This document records
the decisions and their rationale for traceability.

## Decision: Quantity-adjustment request shape

- **Decision**: `POST /admin/books/:id/quantity` accepts `{ "delta": <signed integer> }` — one
  signed number applied to `quantity_total`, mirrored onto `quantity_available` by the same
  amount, in a single request.
- **Rationale**: A signed delta is the simplest possible shape that satisfies both directions
  (restock and withdrawal) with one field and one endpoint, and it maps directly onto the
  invariant check needed anyway (`quantity_available + delta >= 0`). It also avoids a
  race-prone "read current total, compute new absolute total, PATCH it" client-side pattern.
- **Alternatives considered**: Separate `POST /:id/quantity/increase` and
  `.../decrease` endpoints — rejected as two endpoints doing the same underlying arithmetic with
  opposite signs, adding surface area for no benefit. An absolute "set quantity_total to N"
  endpoint — rejected because the caller would have to know the current total (a stale read) to
  compute a safe value, and it obscures the available-quantity invariant the endpoint exists to
  protect; a delta expresses admin intent ("I received 5 more copies" / "I'm removing 2 copies")
  more directly than an absolute target does.

## Decision: Delete-blocking policy

- **Decision**: `DELETE /admin/books/:id` succeeds only when `quantity_available ==
  quantity_total` (no copies currently checked out); otherwise it returns `409 Conflict` and
  leaves the book untouched.
- **Rationale**: There is no reservation/loan table yet in this codebase, so there is no
  foreign-key constraint that would otherwise prevent deleting a book some patron currently
  holds. The task brief explicitly directs erring toward the safer choice when unsure, since a
  later feature (reservation-flow) will add that FK relationship — blocking now avoids silently
  deleting a book out from under an outstanding loan today, and is a strictly safer subset of
  what any future FK constraint would additionally enforce.
- **Alternatives considered**: Always allow deletion (rely on a future FK constraint to prevent
  the unsafe case once it exists) — rejected because it leaves an unsafe window before that
  future feature ships. Soft-delete (mark inactive rather than remove the row) — rejected as
  scope creep beyond what the spec calls for (spec explicitly requires a real "no longer appears
  in the catalog" removal, and no other feature in this codebase uses a soft-delete convention to
  follow).

## Decision: Invariant enforcement — application layer vs. `CHECK` constraints alone

- **Decision**: The service layer explicitly checks the would-be resulting `quantity_available`
  before issuing a decrease `UPDATE`, and returns a typed "would go negative" failure the route
  turns into `409`, rather than relying solely on the table's `CHECK (quantity_available >= 0)`
  constraint and catching the resulting D1 error.
- **Rationale**: A raw D1 `CHECK` constraint violation surfaces as a generic SQLite error, not a
  clean, typed condition the route can map to `409` with a specific error body — matching this
  codebase's existing pattern of application-level guards backed by DB constraints as a backstop
  (e.g. `users.ts`'s admin-disable rule is enforced in the route, not solely relied upon at the
  DB layer). The `CHECK` constraints remain in place unchanged as a correctness backstop.
- **Alternatives considered**: Let the `UPDATE` fail on the `CHECK` constraint and translate the
  D1 error in a catch block — rejected as fragile (parsing driver error messages/codes to
  distinguish "constraint failed" from other D1 errors) and inconsistent with how other
  guarded operations in this codebase are written (pre-condition checked in application code,
  e.g. `usersRoutes.post("/:id/disable")`'s admin-role check).

## Decision: Response shape / field naming

- **Decision**: All new endpoints reuse the exact `BookRecord` camelCase JSON shape already
  established by `GET /books`/`GET /books/:id` (`quantityTotal`, `quantityAvailable`,
  `createdAt`, etc.) for their success responses.
- **Rationale**: Consistency with the existing, precedent-setting `books` API contract from
  feature 002 — no reason to introduce a second shape for the same entity.
- **Alternatives considered**: None seriously considered — this is a direct continuation of an
  existing, working convention.

## Decision: No automated test suite added

- **Decision**: This feature does not add a test framework, `tests/` directory, or automated test
  files to `admin-api` or `admin-ui`.
- **Rationale**: Neither project currently has a test runner configured (no `test` script, no
  test-framework dependency in either `package.json`), and no `tests/` directory exists despite
  one being sketched — but never implemented — in feature 001's plan, a finding features 001 and
  002 both independently confirmed still holds. Introducing a full test framework is a
  cross-cutting infrastructure decision out of scope for a single feature; this feature instead
  relies on `tsc --noEmit` typechecks (already each project's CI gate) plus a documented manual
  `wrangler dev` + `curl` verification pass in `quickstart.md`, per task instructions.
- **Alternatives considered**: Standing up Vitest for `admin-api` just for this feature — rejected
  as disproportionate scope creep; better done later as its own cross-project testing
  infrastructure feature (tracked separately, e.g. FEAT-08 justfile-dev-bootstrap or a dedicated
  testing feature) if desired.
