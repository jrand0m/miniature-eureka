# Phase 1 Data Model: Book Backfill Seed

## Entities

### Book (existing entity — no schema change)

Owned by a separate, concurrently-developed feature's migration
(`admin-api/src/db/migrations/0003_create_books.sql`). This feature only writes rows into it;
it does not alter its shape. Documented here for reference since it's the write target:

| Column | Type | Constraints | Set by this feature to |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | `crypto.randomUUID()` |
| `title` | TEXT | NOT NULL | curated list value |
| `author` | TEXT | NOT NULL | curated list value |
| `isbn` | TEXT | nullable | curated list value or `NULL` |
| `description` | TEXT | nullable | curated list value or `NULL` |
| `quantity_total` | INTEGER | NOT NULL, CHECK `>= 0` | curated list value (1–12, varied) |
| `quantity_available` | INTEGER | NOT NULL, CHECK `>= 0 AND <= quantity_total` | same value as `quantity_total` |
| `created_at` | TEXT | NOT NULL | `new Date().toISOString()`, one timestamp per seed run |

### Curated Book Catalog (new — static data, not a table)

A static in-repo list (`admin-api/scripts/seed-books-catalog.mjs`), not persisted anywhere
except as source code. Each entry:

| Field | Type | Notes |
|---|---|---|
| `title` | string | real, well-known title |
| `author` | string | real author |
| `isbn` | string \| null | optional; may be omitted/`null` |
| `description` | string \| null | optional short blurb; may be `null` |
| `quantityTotal` | integer | fixed, hand-picked, range 1–12, varied across the list |

**Validation rules**:
- List MUST contain at least 30 entries.
- All `title` values MUST be unique within the list (case-sensitive exact match — the same
  granularity used by the runtime existence check against the `books` table).
- `quantityTotal` MUST be an integer `>= 1` (a freshly seeded book with 0 copies would be a
  pointless catalog entry) and the set of values across the list MUST include more than one
  distinct value (varied, not uniform), consistent with spec SC-002.

## Relationships

None beyond the existing `Book` entity's own (lack of) relationships — this feature introduces
no foreign keys, no new tables, and no relationship to the curated list at runtime (the curated
list is compiled into the script, not stored).

## State / Lifecycle

Not applicable — seeded `Book` rows have no lifecycle distinct from any other `Book` row created
through the application's normal write paths; this feature only concerns itself with initial
insertion (skip-if-title-exists), not updates or deletes.
