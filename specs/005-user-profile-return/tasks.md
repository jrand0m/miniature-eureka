---

description: "Task list for User Profile & Return Request"
---

# Tasks: User Profile & Return Request

**Input**: Design documents from `/specs/005-user-profile-return/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md, quickstart.md

**Tests**: Not explicitly requested in spec.md; no test-writing tasks are included below (no
test framework exists in `admin-api/`/`public-ui/` — see plan.md Technical Context).
quickstart.md is the manual validation record standing in for automated tests this iteration.

**Organization**: Tasks are grouped by user story (US1–US2, matching spec.md's priorities) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US2)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `public-ui/` — static site (Vite), Cloudflare Pages

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The schema change and data-access/state-transition function every user story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Create the `return_requested_date` column migration
      (`ALTER TABLE reservations ADD COLUMN return_requested_date TEXT;`) in
      `admin-api/src/db/migrations/0005_add_return_requested_date.sql`
- [X] T002 Implement `requestReturn(db, id, userId, preferredReturnDate)` in
      `admin-api/src/services/reservations.ts`: look up the reservation by id; if it doesn't
      exist or `userId` doesn't match the caller, return `{ outcome: "not_found" }`; otherwise
      run a guarded `UPDATE reservations SET status = 'return_requested',
      return_requested_date = ?, updated_at = ? WHERE id = ? AND status = 'checked_out'` and
      return `{ outcome: "invalid_status_transition" }` if zero rows changed, else
      `{ outcome: "ok"; reservation }` (depends on T001; reuses `findReservationById` — do not
      duplicate it; add this function alongside the existing ones without modifying or removing
      anything already in the file, since a concurrent sibling feature is also adding functions
      here)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 2: User Story 1 - View My Reservations on a Profile Page (Priority: P1) 🎯 MVP

**Goal**: A signed-in user can see a page listing all of their own reservations with status; a
signed-out visitor sees a login prompt instead of any reservation data.

**Independent Test**: Log in as a user with existing reservations, open the profile page,
confirm each reservation and its status is listed; log out and revisit the page, confirm no
reservation data is shown and a login prompt appears instead.

### Implementation for User Story 1

- [X] T003 [P] [US1] Add `profile.html` page shell in `public-ui/profile.html`, mirroring
      `public-ui/catalog.html`'s structure (nav with a new "My Profile" link, containers for a
      login prompt and a reservations list, `<script type="module" src="/src/pages/profile.ts">`)
- [X] T004 [US1] Implement `public-ui/src/pages/profile.ts`: on load, check `getToken()`
      (`public-ui/src/services/auth-client.ts`); if absent, show a "please log in" message and
      render nothing else; if present, call `listMyReservations()`
      (`public-ui/src/services/reservations-client.ts`, already exists) and render each
      reservation's status and relevant dates (depends on T003)
- [X] T005 [US1] Register the new page in `public-ui/vite.config.ts`
      (`rollupOptions.input.profile = resolve(__dirname, "profile.html")`), matching how
      `catalog` was registered (depends on T003)
- [X] T006 [P] [US1] Add a nav link to `/profile.html` on the existing pages
      (`public-ui/index.html`, `public-ui/catalog.html`, `public-ui/login.html`,
      `public-ui/register.html`), matching the existing nav link style/order

**Checkpoint**: User Story 1 is fully functional and independently testable — a signed-in user
can see their reservation history; a signed-out visitor cannot.

---

## Phase 3: User Story 2 - Request a Return for a Checked-Out Book (Priority: P1)

**Goal**: A signed-in user can request a return, with a preferred date, for one of their own
`checked_out` reservations; invalid targets (wrong owner, wrong status, missing date) are
rejected without side effects.

**Independent Test**: Sign in as a user with a `checked_out` reservation, submit a return
request with a date via the profile page, confirm the reservation's status updates to
`return_requested`; attempt the same against another user's reservation (expect 404) and against
a non-`checked_out` reservation (expect 409).

### Implementation for User Story 2

- [X] T007 [US2] Implement `POST /reservations/:id/return-request` in
      `admin-api/src/routes/reservations.ts`, mounted on the existing `requireAuth`-gated
      router: validate body (`400 invalid_request` if `preferredReturnDate` missing/blank), call
      `requestReturn` (T002) with the caller's user id from `c.get("user").sub`, and map its
      outcome to `404 not_found` / `409 invalid_status_transition` / `200 { reservation }` using
      the existing `serializeReservation` helper in that file (depends on T002)
- [X] T008 [P] [US2] Implement `requestReturn(id, preferredReturnDate)` in
      `public-ui/src/services/reservations-client.ts`, following the existing
      `createReservation`/`listMyReservations` pattern (bearer token header, JSON body, typed
      `ApiResult`)
- [X] T009 [US2] In `public-ui/src/pages/profile.ts`, render a "Request Return" control (date
      input + button) for each reservation currently in `checked_out` status only; on submit,
      call `requestReturn` (T008), show a success/error message, and re-render that reservation's
      row to reflect the new status without a full page reload (depends on T004, T008)

**Checkpoint**: Both user stories together deliver the full profile + self-service return-request
feature.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning both stories.

- [X] T010 Run `cd admin-api && npm run typecheck` and `cd public-ui && npm run build`; fix any
      errors (depends on T001–T009)
- [X] T011 Run through both quickstart.md scenarios end-to-end against a local `wrangler dev` +
      migrated local D1 instance (migrations 0001–0005), including the Public UI smoke check,
      and record actual results in quickstart.md's "Actual verification run" section and this
      feature's PR description (depends on T010)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately. BLOCKS both user stories.
- **US1 (Phase 2)**: Depends on Foundational — no dependency on US2 (a user with zero
  reservations can view the empty profile page before the return-request endpoint exists)
- **US2 (Phase 3)**: Depends on Foundational; its frontend piece (T009) depends on US1's page
  shell (T004) existing to attach the control to
- **Polish (Phase 4)**: Depends on both user stories being complete

### Parallel Opportunities

- T003 (page shell) and T006 (nav links on other pages) touch different files and can run in
  parallel
- T008 (frontend client function) can run in parallel with T007 (backend endpoint) — both depend
  only on the shared contract in contracts/admin-api.md, not on each other's code

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (schema + service foundation)
2. Complete Phase 2: User Story 1 (profile page listing reservations)
3. **STOP and VALIDATE**: confirm a signed-in user sees their reservations and a signed-out
   visitor sees a login prompt
4. Note: US1 alone has no way to act on a `checked_out` reservation — US2 is needed for the
   feature's actual point (self-service return requests) to be demonstrable.

### Incremental Delivery

1. Phase 1 → foundation ready (migration + `requestReturn` service function)
2. Add US1 → validate (quickstart Scenario 1 equivalent: profile page renders reservations,
   gated on auth) → users can see their history
3. Add US2 → validate (quickstart Scenario 2) → return requests work end-to-end, including the
   404-for-other-user and 409-invalid-status cases
4. Polish → full quickstart re-run green, typecheck/build clean

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
- `admin-api/src/services/reservations.ts` is being concurrently extended by a sibling feature
  (FEAT-05, admin loan oversight + forced return) in a separate worktree — T002 only adds a new
  function and must not remove or alter anything found in that file that isn't recognized as
  this feature's own prior work
