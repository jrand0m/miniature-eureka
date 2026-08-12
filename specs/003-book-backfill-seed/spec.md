# Feature Specification: Book Backfill Seed

**Feature Branch**: `003-book-backfill-seed`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Dev-only book backfill seed mechanism for the admin-api. Add a local tooling script (not an HTTP endpoint, not mounted in the Hono app) that seeds the `books` table with a curated list of at least 30 real, well-known/popular book titles and authors spread across genres. Each seeded book must get a varied quantity_total (e.g. in the 1-12 range, not uniform), with quantity_available initialized equal to quantity_total. The script must accept an optional count parameter (default: full curated list size, 30+) capped at the curated list size. Running the script twice must not create duplicate rows for the same title (idempotent, skip-if-exists). Wire it up as an npm script following the existing db:migrate:local / db:migrate:remote naming convention. This is purely dev/local tooling to support a later feature's one-command dev bootstrap."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Populate a fresh local environment with realistic catalog data (Priority: P1)

A developer (or a later automated dev-bootstrap flow) sets up the project locally for the first
time. The `books` table exists (via a prior migration) but is empty, which makes it hard to
exercise catalog browse/search, admin inventory management, or reservation flows realistically.
The developer runs a single local command and the `books` table is populated with a curated set
of real, recognizable book titles spread across genres, each with a plausible, varied number of
copies available.

**Why this priority**: Without this, every other feature that reads from `books` (catalog
search, admin inventory, reservations) has nothing meaningful to demonstrate against locally.
This is the entire reason the feature exists.

**Independent Test**: Starting from an empty local `books` table, run the seed command with no
arguments and confirm the table contains at least 30 rows, each with a real title/author, a
`quantity_total` that varies across rows (not a single constant value), and
`quantity_available` equal to `quantity_total` for every row.

**Acceptance Scenarios**:

1. **Given** a local D1 database with an empty `books` table, **When** the developer runs the
   seed command with no arguments, **Then** the `books` table contains the full curated list
   (at least 30 real books), each with a varied `quantity_total` and `quantity_available` equal
   to `quantity_total`.
2. **Given** a local `books` table that already contains the full seeded catalog, **When** the
   developer runs the seed command again, **Then** no additional rows are created for titles
   that already exist and the table's row count is unchanged.

---

### User Story 2 - Seed a smaller sample for quick local iteration (Priority: P2)

A developer wants a lighter local dataset (for example, to keep test fixtures small or to speed
up a quick manual check) and doesn't need the full curated catalog.

**Why this priority**: Useful convenience for local development but not required for the core
value of the feature (a populated catalog); the full-list default already satisfies most needs.

**Independent Test**: Run the seed command with a requested count smaller than the curated list
size and confirm exactly that many rows are inserted, all drawn from the curated list (no
fabricated entries).

**Acceptance Scenarios**:

1. **Given** an empty local `books` table, **When** the developer runs the seed command
   requesting 5 books, **Then** exactly 5 rows are inserted, each a real book from the curated
   list.
2. **Given** an empty local `books` table, **When** the developer requests more books than exist
   in the curated list, **Then** the command seeds the full curated list rather than fabricating
   additional entries.

---

### Edge Cases

- What happens when the seed command is run before the `books` table migration has been applied
  locally? The command should fail clearly rather than silently doing nothing (the underlying
  database operation errors on the missing table; this is acceptable dev-tooling behavior — no
  special handling is required beyond letting the error surface).
- What happens when the seed command is run repeatedly, including interleaved with partial runs
  (e.g., a smaller count run after a larger one)? Titles already present must never be
  duplicated, regardless of the order or count used in prior runs.
- What happens when a curated title collides case-insensitively or via minor formatting
  differences with an existing row title? Out of scope — existence is checked by exact title
  match; this is acceptable because the curated list itself has no near-duplicate titles and the
  table is dev-only, backfill-only data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a curated list of at least 30 real, well-known/popular
  book titles with real authors, spanning a variety of genres (not placeholder or fabricated
  titles).
- **FR-002**: The system MUST provide a way to populate the `books` table from this curated list
  without requiring any authenticated or unauthenticated network-accessible endpoint — this is
  local developer tooling only, not a mounted route in the running API.
- **FR-003**: Each seeded book MUST be assigned a `quantity_total` that varies meaningfully
  across the seeded set (not a single uniform value for every row).
- **FR-004**: Each seeded book's `quantity_available` MUST be initialized equal to its
  `quantity_total` (a freshly seeded book has no copies already checked out).
- **FR-005**: The seed mechanism MUST accept an optional count parameter specifying how many
  books to seed.
- **FR-006**: When the count parameter is omitted, the seed mechanism MUST seed the full curated
  list (at least 30 books).
- **FR-007**: When the requested count exceeds the size of the curated list, the seed mechanism
  MUST seed the full curated list rather than inventing additional entries.
- **FR-008**: Running the seed mechanism multiple times MUST NOT create duplicate rows for a
  title that was already seeded in a previous run — a title already present in the table is
  skipped, not re-inserted.
- **FR-009**: The seed mechanism MUST be invocable as a single local command, consistent with
  how existing local database setup commands (e.g., applying migrations) are invoked in this
  project.
- **FR-010**: Each seeded book's identifier and creation timestamp MUST follow the same
  conventions already used elsewhere in the system for generating record identifiers and
  timestamps.

### Key Entities

- **Book (existing entity)**: A catalog item with a title, author, optional ISBN, optional
  description, a total quantity owned, and a quantity currently available for reservation. This
  feature only inserts new rows into this existing entity's storage; it does not change the
  entity's shape.
- **Curated Book Catalog (new, static)**: A fixed reference list, owned by this feature, of at
  least 30 real book title/author pairs (plus a per-title default total quantity) used as the
  source of truth for what gets seeded. Not a database table — a static list embedded in the
  seed tooling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from an empty catalog, a single local command populates at least 30 real,
  recognizable books spanning multiple genres, with no manual data entry required.
- **SC-002**: Across the seeded books, the number of distinct `quantity_total` values used is
  greater than one (quantities are visibly varied, not a flat constant).
- **SC-003**: Running the seeding command twice in a row against the same local database results
  in the same total row count after the second run as after the first (zero duplicate rows
  created).
- **SC-004**: Requesting a smaller count than the curated list size results in exactly that many
  rows being seeded, every one of them drawn from the curated list.
- **SC-005**: A later automated local-dev bootstrap flow can invoke the seeding command
  unattended (no interactive prompts) and rely on it being safe to call on every startup.

## Assumptions

- The `books` table (with columns for id, title, author, isbn, description, quantity_total,
  quantity_available, and created_at) is created by a separate, already-owned migration and is
  not created or altered by this feature.
- This feature targets the local development database only; seeding a remote/production
  database is explicitly out of scope.
- "Idempotent" is interpreted as skip-if-already-present by exact title match, which is
  sufficient for a curated, developer-controlled list with no near-duplicate titles.
- No authentication or authorization concerns apply, since this mechanism is never exposed over
  HTTP and never mounted in the running API — it only ever runs as a local tooling command
  against the local database.
- A default per-title quantity is chosen once as part of the curated list (not randomized on
  each run), so re-running the seed produces the same data, consistent with the idempotency
  requirement.
