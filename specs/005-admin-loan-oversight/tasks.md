---

description: "Task list for Admin Loan Oversight"
---

# Tasks: Admin Loan Oversight

**Input**: Design documents from `/specs/005-admin-loan-oversight/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md,
quickstart.md

**Tests**: Not explicitly requested in spec.md; no test-writing tasks are included below (no
test framework exists in `admin-api/`/`admin-ui/` — see plan.md Technical Context). quickstart.md
is the manual validation record standing in for automated tests this iteration.

**Organization**: Tasks are grouped by user story (US1–US3, matching spec.md's priorities) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `admin-ui/` — static site (Vite), Cloudflare Pages

## Phase 1: Setup

**Purpose**: Confirm the starting point this feature builds on.

- [X] T001 Confirm `master`'s real state before writing code: verify
      `admin-api/src/db/migrations/0004_create_reservations.sql`,
      `admin-api/src/services/reservations.ts`, and
      `admin-api/src/routes/admin-reservations.ts` exist as described in plan.md/data-model.md;
      confirm whether `0005_*.sql` (the concurrent sibling FEAT-04 migration) exists yet in
      `admin-api/src/db/migrations/` and note the result for T005/T009 below (no file changes —
      verification only)

**Checkpoint**: Starting point confirmed; safe to proceed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema and data-access additions every user story in this feature needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create migration `admin-api/src/db/migrations/0006_add_force_return_flag.sql`:
      `ALTER TABLE reservations ADD COLUMN force_return_requested_at TEXT;` (nullable; explicitly
      numbered `0006`, not `0005`, to avoid colliding with the concurrent sibling FEAT-04
      migration — see research.md §1)
- [X] T003 Add `force_return_requested_at` to `ReservationRow`/`ReservationRecord` (as
      `forceReturnRequestedAt`) in `admin-api/src/services/reservations.ts`, and map it in
      `mapRow`/`mapAdminRow` (depends on T002)

**Checkpoint**: Schema and type foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - See who holds which book (Priority: P1) 🎯 MVP

**Goal**: An administrator can filter the admin loan list by book and/or member, combinable with
the existing status filter, to answer "who holds book X" or "what does member Y hold".

**Independent Test**: Create reservations across multiple books/users; `GET
/admin/reservations?bookId=<id>` returns only that book's rows; `?userId=<id>` returns only that
user's rows; combining `bookId`/`userId` with `status` narrows further; an unmatched filter
returns an empty list, not an error.

### Implementation for User Story 1

- [X] T004 [US1] Extend `listReservationsForAdmin` in `admin-api/src/services/reservations.ts`
      to accept optional `bookId` and `userId` params alongside the existing `status` param,
      combining any supplied filters via `AND` in the `WHERE` clause (depends on T003)
- [X] T005 [US1] Extend `GET /admin/reservations` in
      `admin-api/src/routes/admin-reservations.ts` to read optional `bookId`/`userId` query
      params (plain strings, no enum validation — an unmatched value yields an empty list) and
      pass them through to `listReservationsForAdmin` (T004) alongside the existing `status`
      handling (depends on T004)

**Checkpoint**: User Story 1 is fully functional and independently testable — admin loan
visibility by book/member works end-to-end via the API.

---

## Phase 4: User Story 2 - Confirm a book has been returned (Priority: P1)

**Goal**: An administrator can confirm a physical return from either `checked_out` or
`return_requested` status, recording the return and restoring the book's available-copy count;
any other status is rejected without side effects.

**Independent Test**: Drive a reservation to `checked_out`; confirm-return it; verify `returned`
status, `returnedAt` set, and the book's `quantityAvailable` incremented by exactly one;
confirm-return it again (409, no further change); attempt on a `pending`/`confirmed` reservation
(409).

### Implementation for User Story 2

- [X] T006 [US2] Add `incrementQuantityAvailable(db, bookId)` to `admin-api/src/services/books.ts`,
      mirroring `decrementQuantityAvailable`'s guarded-`UPDATE` style but incrementing
      `quantity_available` by one, guarded only by `WHERE id = ?1` (the table's own `CHECK
      (quantity_available <= quantity_total)` constraint is the backstop — see research.md §3)
- [X] T007 [US2] Add a `confirmReturn` function to `admin-api/src/services/reservations.ts`:
      guarded `UPDATE reservations SET status = 'returned', returned_at = ?, updated_at = ? WHERE
      id = ? AND status IN ('checked_out', 'return_requested')`, checking `meta.changes` for a
      `not_found`/`invalid_status_transition` discriminated result (check existence first for
      404 vs 409, matching `confirmReservation`'s pattern), then call
      `incrementQuantityAvailable` (T006) on success and return the updated reservation (depends
      on T003, T006)
- [X] T008 [US2] Implement `POST /admin/reservations/:id/confirm-return` in
      `admin-api/src/routes/admin-reservations.ts`, gated by `requireAdminToken`: no request
      body required, call `confirmReturn` (T007), map its discriminated result to `404 not_found`
      / `409 invalid_status_transition` / `200 { reservation: ... }` (depends on T007)

**Checkpoint**: User Stories 1 and 2 together deliver full loan visibility plus the ability to
close out a loan and restore inventory.

---

## Phase 5: User Story 3 - Force an early return request (Priority: P2)

**Goal**: An administrator can flag a `checked_out` or `confirmed` loan for early return without
changing its status, idempotently, as a state marker a later notifications feature will consume.

**Independent Test**: Drive a reservation to `checked_out`; force-return it; verify status is
unchanged and `forceReturnRequestedAt` is now set; force-return it again (200, timestamp
updates, no error); attempt on a `pending`/`return_requested`/`returned`/`cancelled` reservation
(409, flag unchanged).

### Implementation for User Story 3

- [X] T009 [US3] Add a `forceReturn` function to `admin-api/src/services/reservations.ts`:
      guarded `UPDATE reservations SET force_return_requested_at = ?, updated_at = ? WHERE id = ?
      AND status IN ('checked_out', 'confirmed')` (no additional guard on the existing value of
      `force_return_requested_at`, so a repeat call still matches and simply overwrites the
      timestamp — see research.md §4), checking `meta.changes` for a
      `not_found`/`invalid_status_transition` discriminated result, returning the updated
      reservation on success (depends on T003)
- [X] T010 [US3] Implement `POST /admin/reservations/:id/force-return` in
      `admin-api/src/routes/admin-reservations.ts`, gated by `requireAdminToken`: no request body
      required, call `forceReturn` (T009), map its discriminated result to `404 not_found` /
      `409 invalid_status_transition` / `200 { reservation: ... }` (depends on T009)
- [X] T011 [US3] Update `serializeReservation`/`serializeAdminReservation` in
      `admin-api/src/routes/admin-reservations.ts`, and the equivalent serializer in
      `admin-api/src/routes/reservations.ts`, to include `forceReturnRequestedAt` in every
      serialized reservation object (not just the two new endpoints) — check whether the
      concurrent sibling FEAT-04's `returnRequestedDate`-style field has landed on `master` by
      this point (per T001's finding) and include it in the same serializers if so, otherwise
      omit it and note this in the PR description per this feature's brief (depends on T003)

**Checkpoint**: All three user stories are independently functional; the full admin-facing API
surface this feature owns is complete.

---

## Phase 6: Admin UI - Loans Page (spans US1/US2/US3)

**Purpose**: Give administrators a UI for everything Phases 3–5 expose via the API. Listed as
its own phase (rather than split into three) because the page is a single cohesive
list-plus-filters-plus-actions view that exercises all three stories together, following
`admin-ui/src/pages/books.ts`'s established structure per this feature's brief.

- [X] T012 [P] Add `listAdminReservations(filters)`, `confirmReturn(id)`, and `forceReturn(id)`
      to `admin-ui/src/services/admin-api-client.ts`, with a `AdminReservation` type matching
      the extended contract in contracts/admin-api.md (`bookTitle`, `bookAuthor`, `userEmail`,
      `status`, dates, `forceReturnRequestedAt`, etc.)
- [X] T013 Create `admin-ui/loans.html`, following `admin-ui/books.html`'s structure: nav with
      Users/Books/Loans links, a filter form (status/book/user), and a table for the loan list
      (depends on T012)
- [X] T014 Implement `admin-ui/src/pages/loans.ts`, following `admin-ui/src/pages/books.ts`'s
      structure: load and render loans with book title/author, holder email, status, and dates;
      wire the status/book/user filter form to re-fetch via `listAdminReservations` (T012); per
      row, show a "Confirm Return" button when status is `checked_out`/`return_requested`
      (calling `confirmReturn`) and a "Force Early Return" button when status is
      `checked_out`/`confirmed` (calling `forceReturn`), each reloading the list and showing a
      status message on completion; show a flag/badge on rows where `forceReturnRequestedAt` is
      set (depends on T012, T013)
- [X] T015 [P] Add a "Loans" nav link to `admin-ui/users.html` and `admin-ui/books.html`
      (alongside the existing Users/Books links), matching the pattern each page already uses

**Checkpoint**: The admin-ui Loans page provides full oversight (view/filter/confirm-return/
force-return) matching the API surface built in Phases 3–5.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning all three stories plus the UI.

- [X] T016 Run `cd admin-api && npm run typecheck` and `cd admin-ui && npm run build`; fix any
      issues (depends on T001–T015)
- [X] T017 Run through all four quickstart.md scenarios end-to-end against a local `wrangler dev`
      + fully-migrated local D1 instance (`0001`–`0006`), including the admin-ui smoke check, and
      record actual results in quickstart.md's "Actual verification run" section and this
      feature's PR description (depends on T016)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: No dependency beyond Phase 1's confirmation — BLOCKS all user
  stories
- **US1 (Phase 3)**: Depends on Foundational — no dependency on US2/US3
- **US2 (Phase 4)**: Depends on Foundational; independently testable against a directly-driven
  `checked_out` reservation, though naturally exercised after US1's list view
- **US3 (Phase 5)**: Depends on Foundational; shares route/service files with US2 but has no
  functional dependency on it
- **Admin UI (Phase 6)**: Depends on US1, US2, and US3 all being complete (the page exercises all
  three)
- **Polish (Phase 7)**: Depends on everything above

### Parallel Opportunities

- T004/T005 (US1) can proceed in parallel with T006 (US2's `incrementQuantityAvailable`, a
  different file) once Phase 2 is done
- T009 (US3's `forceReturn`) can proceed in parallel with T007/T008 (US2) once Phase 2 is done —
  different functions in the same service/route files, so sequence edits to avoid conflicting
  diffs even though they're logically independent
- T012 (admin-ui client) can start once contracts are stable (after Phase 5), in parallel with
  T016's typecheck setup for admin-api
- T015 (nav links on existing pages) can run in parallel with T014 (the new page's own logic)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (confirm state, add the migration/column)
2. Complete Phase 3: User Story 1 (book/user filters)
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
4. Note: US1 alone only adds visibility — US2 (confirm-return) is needed before loans can
   actually be closed out end-to-end.

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation ready (migration + type/mapping)
2. Add US1 → validate (quickstart Scenario 1) → book/member filtering works
3. Add US2 → validate (quickstart Scenario 2) → confirm-return + inventory restore works (core
   value)
4. Add US3 → validate (quickstart Scenario 3) → force-early-return flag works
5. Add Admin UI (Phase 6) → validate (quickstart Scenario 4) → full oversight UI complete
6. Polish → full quickstart re-run green

---

## Notes

- [P] tasks touch different files (or are logically independent enough to parallelize with care)
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
- Phase 6 (Admin UI) is intentionally not split into per-story sub-phases, since the Loans page
  is one cohesive view exercising all three stories together — see Phase 6's Purpose note
