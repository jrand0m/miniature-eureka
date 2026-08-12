---

description: "Task list for Reservation Flow"
---

# Tasks: Reservation Flow

**Input**: Design documents from `/specs/004-reservation-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md, quickstart.md

**Tests**: Not explicitly requested in spec.md; no test-writing tasks are included below (no
test framework exists in `admin-api/`/`public-ui/` at all — see plan.md Technical Context).
quickstart.md is the manual validation record standing in for automated tests this iteration.

**Organization**: Tasks are grouped by user story (US1–US5, matching spec.md's priorities) to
enable independent implementation and testing of each story. A Phase 0 covers the provisional
`books` infrastructure this feature needs but does not own (see plan.md Complexity Tracking).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `public-ui/` — static site (Vite), Cloudflare Pages

## Phase 0: Provisional Books Infrastructure (superseded — see note)

**RECONCILED**: This worktree was originally branched before the concurrently-developed
book-catalog-search feature (FEAT-01) landed on `master`, so T001–T006 below were built as
provisional stand-ins to implement and runtime-verify reservations against. Before this
feature's implementation continued, the worktree was fast-forwarded onto the real `master` tip
(commit `2bba414`, "feat: add book catalog and public search (002-book-catalog-search)"), which
brought in the real `0003_create_books.sql`, `services/books.ts` (`findBookById`, `listBooks`),
`routes/books.ts`, and `public-ui/src/pages/catalog.ts` + `catalog.html`. The provisional
versions of those files were deleted and replaced by the real ones; this feature's own
`decrementQuantityAvailable` helper (still needed, and not part of FEAT-01's scope) was
re-appended onto the real `services/books.ts`. T001–T006 are therefore marked superseded, not
completed — the checkpoint below was achieved via the real merged feature instead.

- [~] T001 SUPERSEDED — real `admin-api/src/db/migrations/0003_create_books.sql` from FEAT-01
- [~] T002 SUPERSEDED — real `admin-api/src/services/books.ts` from FEAT-01 (this feature's
      `decrementQuantityAvailable` was re-appended onto it, see Phase 1)
- [~] T003 SUPERSEDED — real `admin-api/src/routes/books.ts` from FEAT-01
- [~] T004 SUPERSEDED — FEAT-01 already mounts `booksRoutes` in `admin-api/src/index.ts`
- [~] T005 SUPERSEDED — real `public-ui/src/pages/catalog.ts` + `catalog.html` from FEAT-01
- [~] T006 SUPERSEDED — real `public-ui/src/services/books-client.ts` from FEAT-01

**Checkpoint**: A `books` table exists (seeded via manual `wrangler d1 execute` inserts for
verification, per quickstart.md) and is browsable from the Public UI — everything downstream
was built and manually verified end-to-end against the real FEAT-01 infrastructure.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The `reservations` table and its data-access/state-transition layer that every
user story writes to or reads from.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Create the `reservations` table migration (id, book_id, user_id, status TEXT NOT
      NULL CHECK IN the six-value enum, requested_date, agreed_date nullable, checked_out_at
      nullable, returned_at nullable, created_at, updated_at) in
      `admin-api/src/db/migrations/0004_create_reservations.sql` (depends on T001 for the
      `books` FK target, `0001_create_users.sql` for the `users` FK target)
- [X] T008 Implement the reservations data-access service — `createReservation`,
      `listReservationsByUser`, `listReservationsForAdmin` (with optional status filter, joined
      book title/author + user email), `findReservationById`, `confirmReservation` (guarded
      `UPDATE ... WHERE status = 'pending'` + book decrement + compensation on failure, per
      research.md §3), `checkOutReservation` (guarded `UPDATE ... WHERE status = 'confirmed'`)
      — in `admin-api/src/services/reservations.ts` (depends on T007, T002)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 2: User Story 1 - Request a Reservation (Priority: P1) 🎯 MVP

**Goal**: A signed-in user can request a reservation for an available book with a preferred
delivery date; unavailable/nonexistent books and unauthenticated callers are rejected.

**Independent Test**: Log in as a user, `POST /reservations` for an in-stock book, confirm a
`pending` reservation is created and the book's `quantityAvailable` is unchanged; repeat against
a nonexistent book (404) and a zero-availability book (409).

### Implementation for User Story 1

- [X] T009 [US1] Implement `POST /reservations` in `admin-api/src/routes/reservations.ts`,
      gated by `requireAuth`: validate body, 404 `book_not_found` via `findBookById` (T002),
      409 `no_copies_available` if `quantityAvailable <= 0`, else create a `pending` reservation
      for the caller's user id (from the auth context) via T008, return `201` (depends on T008)
- [X] T010 [US1] Wire `/reservations` into the app router in `admin-api/src/index.ts` (depends
      on T009)
- [X] T011 [P] [US1] Implement `reservations-client.ts` (`createReservation`) in
      `public-ui/src/services/reservations-client.ts`
- [X] T012 [US1] Add a "Reserve" action (date input + submit, visible only when
      `getToken()` is set, reusing the `auth-status` pattern) and a result status area to
      `public-ui/src/pages/catalog.ts` / `catalog.html` (depends on T011, T005)

**Checkpoint**: User Story 1 is fully functional and independently testable — the entry point
of the whole flow works end-to-end.

---

## Phase 3: User Story 2 - Review and Confirm a Reservation (Priority: P2)

**Goal**: An administrator can confirm a pending reservation with an agreed delivery date,
committing one copy of inventory; re-confirming or confirming against exhausted inventory is
rejected without side effects.

**Independent Test**: Create a pending reservation (US1), confirm it as admin with an agreed
date, verify `confirmed` status + decremented `quantityAvailable`; confirm again (409); zero out
availability and confirm a different pending reservation (409, no state change).

### Implementation for User Story 2

- [X] T013 [US2] Implement `POST /admin/reservations/:id/confirm` in
      `admin-api/src/routes/admin-reservations.ts`, gated by `requireAdminToken`: 404 if no such
      reservation, validate `agreedDate` (400 `invalid_request` if missing/blank), call
      `confirmReservation` (T008) which returns a discriminated result for
      `invalid_status_transition` (409) vs `no_copies_available` (409) vs success (200) (depends
      on T008)
- [X] T014 [US2] Wire `/admin/reservations` into the app router in `admin-api/src/index.ts`
      (depends on T013)

**Checkpoint**: User Stories 1 and 2 together deliver the core "propose then confirm" value.

---

## Phase 4: User Story 3 - Check Out a Confirmed Reservation (Priority: P3)

**Goal**: An administrator marks a confirmed reservation as checked out once handed over;
checking out a non-confirmed reservation is rejected.

**Independent Test**: Confirm a reservation (US2), check it out as admin, verify `checked_out`
status + `checkedOutAt` timestamp; check it out again (409); check out a still-`pending`
reservation (409).

### Implementation for User Story 3

- [X] T015 [US3] Implement `POST /admin/reservations/:id/check-out` in
      `admin-api/src/routes/admin-reservations.ts`, gated by `requireAdminToken`: 404 if no such
      reservation, call `checkOutReservation` (T008) which returns `invalid_status_transition`
      (409) vs success (200) (depends on T008, T013 for the shared route file)

**Checkpoint**: This feature's full status pipeline (`pending → confirmed → checked_out`) is
implemented end-to-end.

---

## Phase 5: User Story 4 - View My Own Reservations (Priority: P4)

**Goal**: A signed-in user can list only their own reservations.

**Independent Test**: Create reservations for two different users; confirm `GET /reservations`
as user A returns only user A's rows.

### Implementation for User Story 4

- [X] T016 [US4] Implement `GET /reservations` in `admin-api/src/routes/reservations.ts`, gated
      by `requireAuth`, scoped to the caller's own user id via `listReservationsByUser` (T008)
      (depends on T008, T009 for the shared route file)
- [X] T017 [P] [US4] Implement `listMyReservations()` in
      `public-ui/src/services/reservations-client.ts` and render a minimal status list under the
      "Reserve" action on `public-ui/src/pages/catalog.ts` (depends on T012)

**Checkpoint**: Users get feedback on their own reservation history without seeing anyone
else's.

---

## Phase 6: User Story 5 - Admin Views the Reservation Queue (Priority: P5)

**Goal**: An administrator can list all reservations, optionally filtered by status, with book
and requester detail.

**Independent Test**: Create reservations in multiple statuses; `GET /admin/reservations` with
no filter returns all with book/requester detail; `?status=pending` returns only pending;
`?status=bogus` is rejected as invalid.

### Implementation for User Story 5

- [X] T018 [US5] Implement `GET /admin/reservations` in
      `admin-api/src/routes/admin-reservations.ts`, gated by `requireAdminToken`: validate an
      optional `status` query param against the six-value enum (400 `invalid_request` if
      unrecognized), call `listReservationsForAdmin` (T008) (depends on T008, T013 for the
      shared route file)

**Checkpoint**: All five user stories are independently functional; the full admin-facing
surface this feature owns is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning all five stories.

- [X] T019 Run through all five quickstart.md scenarios end-to-end against a local `wrangler
      dev` + migrated local D1 instance, including the Public UI smoke check, and record actual
      results in this feature's PR description (depends on T001–T018)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Provisional Books)**: No dependencies — start immediately
- **Phase 1 (Foundational)**: Depends on Phase 0 (T001, T002 for the `books` FK/lookup) — BLOCKS
  all user stories
- **US1 (Phase 2)**: Depends on Foundational — no dependency on US2–US5
- **US2 (Phase 3)**: Depends on Foundational; independently testable against a directly-inserted
  pending row, though naturally exercised after US1
- **US3 (Phase 4)**: Depends on Foundational and shares a route file with US2 (T013) — logically
  depends on a `confirmed` reservation existing (from US2) to be demoed, though the handler
  itself only depends on T008
- **US4 (Phase 5)**: Depends on Foundational — no dependency on US2/US3
- **US5 (Phase 6)**: Depends on Foundational; shares a route file with US2/US3
- **Polish (Phase 7)**: Depends on all five user stories being complete

### Parallel Opportunities

- T002, T003 within Phase 0 have a direct dependency chain (T001→T002→T003); T005/T006
  (Public UI) run in parallel with the `admin-api` Phase 0 tasks
- T011 (US1 frontend client) runs in parallel with T009/T010 (US1 backend)
- T017 (US4 frontend) runs in parallel with T016 (US4 backend) once T012 lands

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 0 + Phase 1 (provisional books + reservations foundation)
2. Complete Phase 2: User Story 1 (request a reservation)
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
4. Note: US1 alone only creates pending requests with no way to act on them — US2 (confirm) is
   needed before the "propose then confirm" value is actually demonstrable end-to-end.

### Incremental Delivery

1. Phase 0 + Phase 1 → foundation ready (provisional books + reservations schema/service)
2. Add US1 → validate (quickstart Scenario 1) → requests work
3. Add US2 → validate (quickstart Scenario 2) → confirm + inventory commit works (core value)
4. Add US3 → validate (quickstart Scenario 3) → full status pipeline complete
5. Add US4 → validate (quickstart Scenario 4) → users see their own history
6. Add US5 → validate (quickstart Scenario 5) → admin queue complete
7. Polish → full quickstart re-run green

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
- Phase 0 tasks are explicitly provisional (see plan.md Complexity Tracking) — they are not
  labeled with a [Story] tag because they belong to a sibling feature's scope, not this one
