---

description: "Task list for Book Catalog & Public Search"
---

# Tasks: Book Catalog & Public Search

**Input**: Design documents from `/specs/002-book-catalog-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md, quickstart.md

**Tests**: Not explicitly requested in spec.md, and (per research.md) no test runner is currently
configured in `admin-api`/`public-ui` — no test-writing tasks are included below. quickstart.md's
manual `wrangler dev` + `curl` scenarios stand in for automated tests in this iteration.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's priorities)
to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

Reuses the existing three-project layout, per plan.md / Constitution Principle I. This feature
touches only:

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `public-ui/` — static site (Vite), Cloudflare Pages

`admin-ui/` is untouched by this feature.

## Phase 1: Setup

**Purpose**: None required — both projects already exist and build (per feature 001). This
feature adds files to existing projects only; no new project scaffolding is needed.

*(No tasks — proceed directly to Phase 2.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `books` table and its data-access service, which every user story's endpoint
depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Create the `books` table migration (per data-model.md: id, title, author, isbn
      nullable, description nullable, quantity_total, quantity_available, created_at, with
      `CHECK` constraints on the two quantity columns) in
      `admin-api/src/db/migrations/0003_create_books.sql`. No seed data (per spec Assumptions).
- [X] T002 Implement the Book data-access service — `listBooks(db, { title?, author?, limit,
      offset }): { books, total }` (case-insensitive `LIKE` filtering per research.md,
      camelCase row mapping per data-model.md) and `findBookById(db, id)` — in
      `admin-api/src/services/books.ts` (depends on T001)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Browse and Search the Catalog (Priority: P1) 🎯 MVP

**Goal**: Any visitor can retrieve the book list, optionally narrowed by a case-insensitive
partial `title` and/or `author` match, with no login required.

**Independent Test**: Call `GET /books` with no query params and confirm a list of books (each
with title/author/available quantity) is returned; call it again with `title=gatsby` (mixed
case) or `author=austen` and confirm only matching books are returned; call it with a term
matching nothing and confirm an empty, non-error result.

### Implementation for User Story 1

- [X] T003 [US1] Implement `GET /books` in `admin-api/src/routes/books.ts`: parse optional
      `title`/`author`/`limit`/`offset` query params (defaults/clamping per contracts/admin-api.md
      — limit default 20, clamped to [1,100]; offset default 0, clamped to >= 0), call
      `listBooks` (via T002), return `{ books, limit, offset, total }` (depends on T002)
- [X] T004 [US1] Mount the books routes at the API root (`app.route("/books", booksRoutes)`,
      unauthenticated — no `requireAdminToken`/`requireAuth`) in `admin-api/src/index.ts`
      (depends on T003)
- [X] T005 [P] [US1] Add the `catalog.html` static entry (mirrors `index.html`/`login.html`) in
      `public-ui/catalog.html` and register it as a build input in `public-ui/vite.config.ts`
- [X] T006 [P] [US1] Implement `listBooks()` in `public-ui/src/services/books-client.ts`,
      calling `GET /books` with `title`/`author`/`limit`/`offset` (mirrors
      `public-ui/src/services/auth-client.ts`'s `API_BASE`/fetch pattern)
- [X] T007 [US1] Build the catalog page — search box (title/author inputs) wired to
      `listBooks()`, rendering a results list (title/author/available quantity per book) and a
      "no results" state — in `public-ui/src/pages/catalog.ts` (depends on T006, T005)
- [X] T008 [P] [US1] Add a nav link to the new catalog page in `public-ui/index.html`,
      `public-ui/login.html`, and `public-ui/register.html` (depends on T005)

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Paginated Browsing of a Large Catalog (Priority: P2)

**Goal**: A visitor can move through catalog/search results in bounded pages instead of
receiving the entire matching set at once.

**Independent Test**: Seed more books than one page holds; confirm the first `GET /books` call
returns only `limit` books plus an accurate `total`; confirm requesting the next `offset`
returns the remaining books with no repeats/omissions; confirm this holds with a search filter
applied too.

### Implementation for User Story 2

- [X] T009 [US2] Add "next"/"previous" pagination controls (enabled/disabled based on
      `offset`/`limit`/`total` from the last response) to the catalog page in
      `public-ui/src/pages/catalog.ts` (depends on T007) — re-issues `listBooks()` with an
      updated `offset`, preserving the active `title`/`author` search terms

**Checkpoint**: User Stories 1 and 2 both work independently — full search + pagination is
usable end-to-end via the Public UI.

---

## Phase 5: User Story 3 - Look Up a Single Book's Detail (Priority: P3)

**Goal**: A single book's full detail (including fields not in the list view — ISBN,
description) can be retrieved by id; a nonexistent id returns a clear "not found" outcome.

**Independent Test**: Call `GET /books/:id` with a known id and confirm full detail is
returned; call it with a random/nonexistent id and confirm `404` with no fabricated data.

### Implementation for User Story 3

- [X] T010 [US3] Implement `GET /books/:id` in `admin-api/src/routes/books.ts`: call
      `findBookById` (via T002), return `404 { "error": "not_found" }` if missing, else the full
      book detail (depends on T002; shares the route file with T003, mounted already via T004)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning all three stories. No new CI/CD workflows are needed
— the existing `admin-api-deploy.yml`/`public-ui-deploy.yml` workflows from feature 001 already
cover typecheck/build/deploy for both touched projects, and this feature adds no new
environment variables or bindings beyond the migration already applied by
`db:migrate:remote`/`db:migrate:local`.

- [X] T011 Run `cd admin-api && npm run typecheck` and `cd public-ui && npm run build` to confirm
      both projects still typecheck/build cleanly with the new code
- [X] T012 Run through all three quickstart.md scenarios end-to-end against a local
      `wrangler dev` + local D1 instance with manually-inserted test rows: browse/search
      (title + author, case-insensitive, no-match case), pagination (first page, next page,
      filtered pagination), and single-book lookup (found + 404)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — skipped, both projects already exist
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on User Story 1 (adds pagination UI on top of the catalog
  page built in Phase 3); the underlying `GET /books` endpoint already supports `limit`/`offset`
  from T003, so only the UI controls are new work here
- **User Story 3 (Phase 5)**: Depends on Foundational only (T002) — independent of US1/US2, but
  shares `admin-api/src/routes/books.ts` with T003 (same file, sequenced after it to avoid
  merge friction)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Parallel Opportunities

- T005, T006 (US1) run in parallel — different files, both only depend on Foundational
- T008 (US1 nav links) runs in parallel with T006/T007 once T005 exists
- Once Foundational (T002) is complete, US3's T010 can be built in parallel with US1's T003,
  though both land in the same file (`admin-api/src/routes/books.ts`) so should be merged
  sequentially in practice

---

## Parallel Example: User Story 1

```bash
Task: "Add the catalog.html static entry in public-ui/catalog.html"
Task: "Implement listBooks() in public-ui/src/services/books-client.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (blocks everything else)
2. Complete Phase 3: User Story 1 (browse + search)
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
4. User Story 1 alone is a complete, demoable MVP — a visitor can browse and search the catalog.

### Incremental Delivery

1. Foundational → `books` table + service ready
2. Add User Story 1 → validate (quickstart Scenario 1) → browse/search works (MVP demo)
3. Add User Story 2 → validate (quickstart Scenario 2) → pagination works for large result sets
4. Add User Story 3 → validate (quickstart Scenario 3) → single-book lookup available for reuse
   by later features (detail page, reservations)
5. Polish → typecheck/build clean, full quickstart re-run green

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
