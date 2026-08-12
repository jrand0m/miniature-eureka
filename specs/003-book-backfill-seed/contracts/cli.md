# CLI Contract: `db:seed:local`

This feature exposes no HTTP interface. Its only interface is a local npm script — this is the
contract a later feature's dev-bootstrap `justfile` target is expected to call directly, so it
is documented precisely and must be kept stable.

## Invocation

```sh
cd admin-api
npm run db:seed:local
npm run db:seed:local -- --count=5
```

Equivalent direct invocation (what the npm script runs under the hood):

```sh
node scripts/seed-books.mjs
node scripts/seed-books.mjs --count=5
```

## Flags

| Flag | Required | Default | Behavior |
|---|---|---|---|
| `--count=N` | No | full curated list size (30+) | Seeds the first `N` entries of the curated list, in declared order. `N` greater than the curated list size is clamped to the list size (no fabricated entries). `N` that is non-numeric or `<= 0` is a user error: the script prints a message to stderr and exits non-zero without touching the database. |

## Preconditions

- The `books` table must already exist in the local D1 database (via
  `npm run db:migrate:local` in `admin-api`, which applies
  `0003_create_books.sql` from a separate, concurrently-developed feature). If the table does
  not exist, the underlying `wrangler d1 execute` call fails with a database error and the
  script exits non-zero — this is treated as acceptable "let the error surface" behavior per the
  spec's edge cases, not specially handled.
- `wrangler` must be available (already a devDependency of `admin-api`) and able to reach the
  local D1 simulation (same requirement as `db:migrate:local`).

## Behavior contract

1. Reads the curated list (30+ entries) from `admin-api/scripts/seed-books-catalog.mjs`.
2. Determines the working set: full list, or the first `N` per `--count=N` (clamped to list
   size).
3. Queries the local `books` table once for existing titles.
4. For each entry in the working set whose title is not already present, generates one `INSERT`
   statement with a freshly generated `id` (`crypto.randomUUID()`), the entry's `title`,
   `author`, `isbn`, `description`, `quantityTotal` as both `quantity_total` and
   `quantity_available`, and a single `created_at` timestamp shared by the whole run.
5. Writes the generated statements to a temporary `.sql` file and executes it in one call to
   `wrangler d1 execute library-admin-db --local --file=<path>`.
6. Prints a summary to stdout: how many books were inserted vs. how many were already present
   and skipped.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Script completed (including the case where 0 rows were inserted because everything already existed). |
| non-zero | Invalid `--count` value, or the underlying `wrangler d1 execute` call failed (e.g., table missing, D1 not initialized). |

## Idempotency guarantee

Calling this command any number of times, with any sequence of `--count` values, never produces
more than one row per curated title. Titles already present in `books` are always skipped, never
re-inserted or updated.
