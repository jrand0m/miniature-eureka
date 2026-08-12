---

description: "Task list for Admin Book Catalog & Inventory Management"
---

# Tasks: Admin Book Catalog & Inventory Management

**Input**: Design documents from `/specs/003-admin-book-mgmt/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md,
quickstart.md

**Tests**: Not explicitly requested in spec.md, and (per research.md) no test runner is currently
configured in `admin-api`/`admin-ui` — no test-writing tasks are included below. quickstart.md's
manual `wrangler dev` + `curl` scenarios (plus a manual Admin UI walkthrough) stand in for
automated tests in this iteration.

**Organization**: Tasks are grouped by user story (US1/US2/US3/US4, matching spec.md's
priorities) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

Reuses the existing three-project layout, per plan.md / Constitution Principle I. This feature
touches only:

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `admin-ui/` — static site (Vite), Cloudflare Pages

`public-ui/` is untouched by this feature.

## Phase 1: Setup

**Purpose**: None required — both projects already exist and build (per features 001/002). This
feature adds files to existing projects only, and reuses the existing `books` table unchanged; no
new project scaffolding or migration is needed.

*(No tasks — proceed directly to Phase 2.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The book data-access functions every admin endpoint depends on, plus the route
group and its mount point (unauthenticated by default until gated — gating itself happens per
endpoint below, but the group-level `requireAdminToken` wiring is shared setup).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Add `createBook`, `updateBook`, `adjustQuantity`, and `deleteBook` data-access
      functions to `admin-api/src/services/books.ts` (extending the existing `listBooks`/
      `findBookById` — do not duplicate `mapRow`/`BookRow`/`BookRecord`), per data-model.md's
      validation rules: `createBook` generates `id`/`createdAt` the same way
      `services/users.ts`'s `createUser` does (`crypto.randomUUID()`, `new Date().toISOString()`)
      and sets `quantity_available = quantity_total`; `updateBook` writes only
      title/author/isbn/description; `adjustQuantity` applies a signed delta to both quantity
      columns in one `UPDATE`, returning a typed result distinguishing "not found" from "would go
      negative" from success (per research.md's decision to check the invariant in application
      code, not rely on the raw `CHECK` constraint error); `deleteBook` deletes only when
      `quantity_available == quantity_total`, returning a typed result distinguishing "not found"
      from "blocked" from "deleted"
- [X] T002 Create `admin-api/src/routes/admin-books.ts`: a new Hono router `adminBooksRoutes`
      with `adminBooksRoutes.use("*", ...requireAdminToken)` applied to the whole group, exactly
      like `admin-api/src/routes/users.ts`'s `usersRoutes.use("*", ...requireAdminToken)` (empty
      route handlers for now — added per user story below) (depends on T001)
- [X] T003 Mount the new admin router at `/admin/books` in `admin-api/src/index.ts`
      (`app.route("/admin/books", adminBooksRoutes)`, alongside the existing
      `app.route("/admin/users", usersRoutes)` and the public `/books` mount) (depends on T002)
- [X] T004 [P] Add `AdminBook`-adjacent request/response types and `createBook`, `updateBook`,
      `deleteBook`, `adjustBookQuantity`, `listAdminBooks` client functions to
      `admin-ui/src/services/admin-api-client.ts` (mirrors `listUsers`/`disableUser`/`enableUser`
      — auth header handling already lives in the shared `request()` helper, reuse it as-is)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Add a New Book to the Catalog (Priority: P1) 🎯 MVP

**Goal**: An administrator can create a new catalog entry with title, author, and total quantity
(optionally ISBN/description), immediately available with `quantityAvailable == quantityTotal`.

**Independent Test**: `POST /admin/books` with a valid admin token and a title/author/
quantityTotal body; confirm `201` with `quantityAvailable` equal to the submitted
`quantityTotal`. Repeat missing `title` or `author` or with a negative/non-integer
`quantityTotal`; confirm `400`. Confirm the created book appears via the existing public
`GET /books`.

### Implementation for User Story 1

- [X] T005 [US1] Implement `POST /admin/books` in `admin-api/src/routes/admin-books.ts`:
      validate `title`/`author` (required, non-empty after trim) and `quantityTotal` (required,
      integer, `>= 0`) per contracts/admin-api.md, returning `400 { "error": "invalid_request" }`
      on failure; otherwise call `createBook` (via T001) and return `201` with the full book
      record (depends on T001, T002)
- [X] T006 [US1] [P] Build the Admin UI books page skeleton — `admin-ui/books.html` (mirrors
      `admin-ui/users.html`'s structure: nav with logout button, `<h1>`, `#message`, a table with
      a `<tbody id="books-body">`) plus an "Add book" form (title/author/isbn/description/
      quantityTotal inputs) — and `admin-ui/src/pages/books.ts` wiring the form's submit handler
      to `createBook()` (via T004), reloading the list on success and showing errors via the same
      `showMessage()` pattern as `admin-ui/src/pages/users.ts`
- [X] T007 [US1] [P] Add a nav link between the Users and Books pages in `admin-ui/users.html`
      and `admin-ui/books.html` (mirrors how `admin-ui/src/pages/index.ts` currently redirects to
      `/users.html` — add the equivalent link/redirect awareness for `/books.html`), so an
      administrator can move between both admin pages (depends on T006)
- [X] T008 [US1] Render the book list (title, author, isbn, quantityTotal, quantityAvailable) in
      `admin-ui/src/pages/books.ts`'s `loadBooks()`, calling `listAdminBooks()` (via T004) on
      page load, following `users.ts`'s `loadUsers()` pattern including the 401/expired-session
      redirect to `/login.html` (depends on T006)

**Checkpoint**: User Story 1 is fully functional and independently testable — an administrator
can add books via the API and the Admin UI, and they appear in the public catalog.

---

## Phase 4: User Story 2 - Adjust a Book's Inventory (Priority: P1)

**Goal**: An administrator can add or remove copies from a book's inventory via a signed delta,
with over-removal safely refused.

**Independent Test**: `POST /admin/books/:id/quantity` with `{"delta":2}` on a book with 3/3
copies; confirm `200` with 5/5. With available quantity artificially reduced below total (e.g.
2 available of 5 total), request `{"delta":-3}`; confirm `409` and unchanged quantities. Request
against a nonexistent id; confirm `404`.

### Implementation for User Story 2

- [X] T009 [US2] Implement `POST /admin/books/:id/quantity` in
      `admin-api/src/routes/admin-books.ts`: validate `delta` is present and an integer (`400
      { "error": "invalid_request" }` otherwise); call `adjustQuantity` (via T001); map its typed
      result to `404 { "error": "not_found" }`, `409 { "error": "insufficient_quantity" }`, or
      `200` with the full updated book record, per contracts/admin-api.md (depends on T001, T002)
- [X] T010 [US2] Add a quantity-adjust control (a delta number input plus an "Apply" button, or
      +/- buttons) per book row in `admin-ui/src/pages/books.ts`'s row rendering, calling
      `adjustBookQuantity()` (via T004) and reloading the list on success, surfacing a `409` as a
      clear inline message via the shared `showMessage()` pattern (depends on T008)

**Checkpoint**: User Stories 1 and 2 both work independently — books can be added and their
inventory kept accurate, via both the API and the Admin UI.

---

## Phase 5: User Story 3 - Edit a Book's Descriptive Details (Priority: P2)

**Goal**: An administrator can correct/update title, author, isbn, and/or description without
touching quantities.

**Independent Test**: `PATCH /admin/books/:id` with `{"title": "New Title"}`; confirm `200` with
the new title and unchanged `quantityTotal`/`quantityAvailable`. Request against a nonexistent
id; confirm `404`.

### Implementation for User Story 3

- [X] T011 [US3] Implement `PATCH /admin/books/:id` in `admin-api/src/routes/admin-books.ts`:
      accept a partial body of `title`/`author`/`isbn`/`description` (ignore any
      `quantityTotal`/`quantityAvailable` present — per FR-004, this endpoint never touches
      quantities); return `400 { "error": "invalid_request" }` if a supplied `title`/`author`
      would be empty after trim; call `updateBook` (via T001); return `404
      { "error": "not_found" }` if missing, else `200` with the full updated book record (depends
      on T001, T002)
- [X] T012 [US3] Add an "Edit" control per book row in `admin-ui/src/pages/books.ts` (an inline
      edit form or a prompt-based flow, consistent with the page's existing form patterns) for
      title/author/isbn/description, calling `updateBook()` (via T004) and reloading the list on
      success (depends on T008)

**Checkpoint**: User Stories 1–3 are all independently functional.

---

## Phase 6: User Story 4 - Remove a Book from the Catalog (Priority: P3)

**Goal**: An administrator can remove a book outright, but only when all of its copies are
currently available (none checked out).

**Independent Test**: `DELETE /admin/books/:id` on a book with `quantityAvailable ==
quantityTotal`; confirm `204` and a subsequent `GET /books/:id` returns `404`. On a book with
`quantityAvailable < quantityTotal`, confirm `409` and the book still exists. Request against a
nonexistent id; confirm `404`.

### Implementation for User Story 4

- [X] T013 [US4] Implement `DELETE /admin/books/:id` in `admin-api/src/routes/admin-books.ts`:
      call `deleteBook` (via T001); map its typed result to `404 { "error": "not_found" }`, `409
      { "error": "copies_unavailable" }` (per research.md's delete-blocking decision), or `204 No
      Content`, per contracts/admin-api.md (depends on T001, T002)
- [X] T014 [US4] Add a "Delete" control per book row in `admin-ui/src/pages/books.ts`, calling
      `deleteBook()` (via T004), reloading the list on success, and surfacing a `409` as a clear
      inline message (e.g. "Some copies are checked out — cannot remove this book.") via the
      shared `showMessage()` pattern (depends on T008)

**Checkpoint**: All four user stories are independently functional — full admin book-management
lifecycle (add, adjust inventory, edit, remove) works end-to-end via both the API and the Admin
UI.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning all four stories. No new CI/CD workflows are needed —
the existing `admin-api-deploy.yml`/`admin-ui-deploy.yml` workflows already cover
typecheck/build/deploy for both touched projects, and this feature adds no new migration,
environment variable, or binding.

- [X] T015 Run `cd admin-api && npm run typecheck` and `cd admin-ui && npm run build` to confirm
      both projects still typecheck/build cleanly with the new code
- [X] T016 Run through all five quickstart.md scenarios end-to-end against a local `wrangler dev`
      + local D1 instance: create (valid + invalid), quantity adjust (increase, decrease,
      over-removal 409, not-found 404), edit (valid + not-found), delete (blocked 409, success
      204, not-found 404), and the Admin UI walkthrough (Scenario 5) — record results/confirm
      pass in quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — skipped, both projects already exist
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational (T001's `adjustQuantity`) and on US1's
  Admin UI list rendering (T008) for its UI task (T010), but its API task (T009) only depends on
  Foundational — independent of US1's API task in practice, though both land in
  `admin-api/src/routes/admin-books.ts` so should be merged sequentially
- **User Story 3 (Phase 5)**: Depends on Foundational (T001's `updateBook`) and, for its UI task
  (T012), on US1's T008; independent of US2
- **User Story 4 (Phase 6)**: Depends on Foundational (T001's `deleteBook`) and, for its UI task
  (T014), on US1's T008; independent of US2/US3
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T004 (Admin UI client functions) can run in parallel with T002/T003 (Admin API route wiring)
  once T001 exists, since it only depends on the *shape* of the endpoints (documented in
  contracts/admin-api.md), not their implementation
- T006, T007 (US1 Admin UI skeleton + nav) run in parallel with each other once T004 is done
- Once Foundational (T001–T003) is complete, the four route handlers (T005 US1, T009 US2, T011
  US3, T013 US4) touch the same file (`admin-api/src/routes/admin-books.ts`) so should be merged
  sequentially in practice, even though each only depends on Foundational
- T010, T012, T014 (per-row UI controls for quantity/edit/delete) all depend on T008 but are
  otherwise independent edits to the same row-rendering function in `books.ts`, so should also be
  sequenced rather than parallelized in practice

---

## Parallel Example: Foundational

```bash
Task: "Add createBook/updateBook/adjustQuantity/deleteBook to admin-api/src/services/books.ts"
Task: "Add client functions to admin-ui/src/services/admin-api-client.ts per contracts/admin-api.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (blocks everything else)
2. Complete Phase 3: User Story 1 (add a book)
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
4. User Story 1 alone is a complete, demoable increment — an administrator can populate the
   catalog (previously only possible by hand-inserting D1 rows).

### Incremental Delivery

1. Foundational → book data-access functions + admin route group + client wiring ready
2. Add User Story 1 → validate (quickstart Scenario 1) → books can be added (MVP demo)
3. Add User Story 2 → validate (quickstart Scenario 2) → inventory stays accurate, over-removal
   safely refused
4. Add User Story 3 → validate (quickstart Scenario 3) → descriptive details can be corrected
   without disturbing quantities
5. Add User Story 4 → validate (quickstart Scenario 4) → books can be retired from the catalog,
   guarded against removing one with copies still checked out
6. Polish → typecheck/build clean, full quickstart re-run (including the Admin UI walkthrough)
   green

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
