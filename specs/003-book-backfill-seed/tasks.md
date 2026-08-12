---

description: "Task list for Book Backfill Seed"
---

# Tasks: Book Backfill Seed

**Input**: Design documents from `/specs/003-book-backfill-seed/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md, quickstart.md

**Tests**: No automated test tasks — `admin-api` has no test framework configured, and the spec
was not explicit about adding one. Verification is manual, via the quickstart.md scenarios,
which are included below as explicit tasks.

**Organization**: Tasks are grouped by user story (US1 = P1 full default seed, US2 = P2
`--count=N` partial seed), per spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- File paths are relative to the repository root unless noted otherwise

## Path Conventions

Single project (`admin-api/`), new `scripts/` directory alongside existing `src/`. See
plan.md's Project Structure section.

---

## Phase 1: Setup

**Purpose**: Create the new script files this feature lives in

- [X] T001 Create `admin-api/scripts/` directory with stub files `admin-api/scripts/seed-books-catalog.mjs` (exports an empty array) and `admin-api/scripts/seed-books.mjs` (empty `main()` shell, `#!/usr/bin/env node` not needed since invoked via `node`), both as ES modules (project has `"type": "module"`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared curated data set and seeding engine that both user stories build on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Author the curated book catalog in `admin-api/scripts/seed-books-catalog.mjs`: export a default array of at least 30 objects `{ title, author, isbn, description, quantityTotal }` with real, well-known titles/authors spread across genres, unique `title` values, and `quantityTotal` integers in the 1–12 range with more than one distinct value used (per data-model.md validation rules)
- [X] T003 Implement the seeding engine in `admin-api/scripts/seed-books.mjs` (depends on T002): import the catalog from T002; run `wrangler d1 execute library-admin-db --local --command "SELECT title FROM books" --json` (via `node:child_process`) to fetch existing titles; for entries in the working set not already present, generate one `INSERT INTO books (id, title, author, isbn, description, quantity_total, quantity_available, created_at) VALUES (...)` statement per entry using `crypto.randomUUID()` for `id`, a single `new Date().toISOString()` computed once per run for `created_at`, and `quantity_available` equal to `quantity_total`; write the generated statements to a temp `.sql` file (e.g. under `os.tmpdir()`); execute that file via `wrangler d1 execute library-admin-db --local --file=<path>`; print a summary (`N inserted, M already present`) to stdout; escape single quotes in generated string literals for SQL safety
- [X] T004 Add the `"db:seed:local": "node scripts/seed-books.mjs"` entry to `admin-api/package.json` scripts (depends on T003 existing as a file)

**Checkpoint**: `npm run db:seed:local` (from `admin-api/`) runs the full curated list against a local D1 database with the `books` table already migrated

---

## Phase 3: User Story 1 - Populate a fresh local environment with realistic catalog data (Priority: P1) 🎯 MVP

**Goal**: Running the seed command with no arguments populates the full curated catalog (30+
real books, varied quantities) into an empty local `books` table, and re-running it never
duplicates rows

**Independent Test**: Starting from an empty local `books` table, run `npm run db:seed:local`
with no arguments and confirm at least 30 rows exist with varied `quantity_total` and
`quantity_available` equal to `quantity_total` for every row; run it again and confirm the row
count is unchanged

### Implementation for User Story 1

- [X] T005 [US1] Confirm/finish the default (no `--count` flag) code path in `admin-api/scripts/seed-books.mjs` selects the entire curated list from T002 as the working set (depends on T003)
- [X] T006 [US1] Manually run Quickstart Scenario 1 ("Full seed from empty") and Scenario 2 ("Idempotency (re-run)") from `specs/003-book-backfill-seed/quickstart.md` against a local D1 instance with `books` migrated; fix any issues found in `admin-api/scripts/seed-books.mjs` or `admin-api/scripts/seed-books-catalog.mjs` until both scenarios pass exactly as documented

**Checkpoint**: User Story 1 is fully functional and independently verified — the MVP is done

---

## Phase 4: User Story 2 - Seed a smaller sample for quick local iteration (Priority: P2)

**Goal**: `--count=N` seeds exactly `N` books drawn from the curated list (clamped to the list
size if `N` exceeds it), without fabricating entries

**Independent Test**: Starting from an empty local `books` table, run
`npm run db:seed:local -- --count=5` and confirm exactly 5 rows exist, each a real book from the
curated list

### Implementation for User Story 2

- [X] T007 [US2] Implement `--count=N` CLI argument parsing in `admin-api/scripts/seed-books.mjs` (depends on T003): parse `process.argv`, slice the curated list to the first `N` entries in declared order when `--count` is given, clamp `N` down to the curated list size if it exceeds it, and treat a non-numeric or `N <= 0` value as a user error — print a clear message to stderr and exit with a non-zero code without touching the database
- [X] T008 [US2] Manually run Quickstart Scenario 3 ("Partial count") from `specs/003-book-backfill-seed/quickstart.md` against a local D1 instance with an empty `books` table; fix any issues found until the scenario passes exactly as documented

**Checkpoint**: Both User Story 1 and User Story 2 work independently and together

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the feature meets its non-functional constraints (no HTTP surface, no
typecheck regression) and is documented for the later dev-bootstrap consumer

- [X] T009 [P] Run `npm run typecheck` in `admin-api/` and confirm it still passes (the new `.mjs` files under `scripts/` are outside `tsconfig.json`'s `include: ["src"]`, so they must not be picked up or cause errors)
- [X] T010 Manually run Quickstart Scenario 4 ("Not mounted as an HTTP route") from `specs/003-book-backfill-seed/quickstart.md`: `grep -r "seed" admin-api/src/index.ts` returns no matches
- [X] T011 [P] Add a short header comment to `admin-api/scripts/seed-books.mjs` documenting: this is dev-only local tooling (never mounted as an HTTP route), the skip-if-title-exists idempotency approach (and why no new migration/unique index was added — see research.md), and the `--count=N` contract, so a later dev-bootstrap `justfile` author and future maintainers understand the invocation contract without re-reading the spec

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only (independent of US1, though both live
  in the same `seed-books.mjs` file so sequential implementation is more practical than parallel)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Within Each Phase

- T002 and T003 both touch `seed-books.mjs`/`seed-books-catalog.mjs` sequentially (T003 imports
  the module T002 produces) — not parallelizable despite being in the same phase
- T005–T006 (US1) and T007–T008 (US2) all edit the same file (`seed-books.mjs`), so in practice
  implement sequentially even though US1 and US2 are conceptually independent stories

### Parallel Opportunities

- T002 (catalog data) has no code dependency on T001 beyond the stub file existing, so it can be
  drafted in parallel with finishing T001's other stub
- T009 and T011 (Polish) touch different concerns (running typecheck vs. adding a comment) and
  can be done in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (curated list + seeding engine + npm script — this is most of
   the actual work)
3. Complete Phase 3: User Story 1 — validate default full-seed + idempotency
4. **STOP and VALIDATE**: run Quickstart Scenarios 1 & 2
5. This alone satisfies the feature's primary purpose (SC-001, SC-002, SC-003)

### Incremental Delivery

1. Setup + Foundational → seeding engine ready
2. Add User Story 1 → validate → this is the MVP
3. Add User Story 2 (`--count=N`) → validate → full feature scope complete (SC-004)
4. Polish → confirm no HTTP surface, no typecheck regression, document for the later
   dev-bootstrap consumer (SC-005)

## Notes

- [P] tasks touch different files or are independently verifiable; sequential tasks touching the
  same file are called out explicitly above even where a [Story] label might otherwise suggest
  independence
- Verify each Quickstart scenario passes exactly as documented before considering its task done
- No production/remote seeding is in scope — do not add a `db:seed:remote` script
