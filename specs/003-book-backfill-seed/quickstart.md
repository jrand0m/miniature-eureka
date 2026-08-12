# Quickstart: Book Backfill Seed

Validates that the seed mechanism works end-to-end against a local D1 database. Run from the
`admin-api/` directory.

## Prerequisites

- Node.js and the project's npm dependencies installed (`npm install` in `admin-api/`).
- The `books` table migration available locally. On `master` (post-merge of the concurrently
  developed book-catalog feature) this is `0003_create_books.sql`, applied via:

  ```sh
  npm run db:migrate:local
  ```

  (During local development of this feature only, ahead of that migration landing, testers can
  temporarily drop the migration file into `admin-api/src/db/migrations/` to validate — it must
  not be included in this feature's own commits, since it is owned by a different in-flight
  feature/PR.)

## Scenario 1 — Full seed from empty

```sh
npm run db:seed:local
```

**Expected**: stdout reports the number of books inserted (should be the full curated list size,
30+) and 0 skipped. Verify:

```sh
npx wrangler d1 execute library-admin-db --local --command "SELECT COUNT(*) AS n FROM books"
```

`n` is >= 30.

```sh
npx wrangler d1 execute library-admin-db --local --command "SELECT DISTINCT quantity_total FROM books ORDER BY quantity_total"
```

More than one distinct value is returned (varied quantities, per spec SC-002).

```sh
npx wrangler d1 execute library-admin-db --local --command "SELECT title FROM books WHERE quantity_total != quantity_available"
```

Returns zero rows (every seeded book's `quantity_available` equals its `quantity_total`).

## Scenario 2 — Idempotency (re-run)

```sh
npm run db:seed:local
```

**Expected**: stdout reports 0 inserted, all skipped (already present). Row count from Scenario
1's `COUNT(*)` query is unchanged.

## Scenario 3 — Partial count

Against a fresh/empty `books` table:

```sh
npm run db:seed:local -- --count=5
```

**Expected**: stdout reports 5 inserted. `SELECT COUNT(*) FROM books` returns 5, and all 5 titles
are drawn from the curated list (spot-check a couple of titles against
`admin-api/scripts/seed-books-catalog.mjs`).

## Scenario 4 — Not mounted as an HTTP route

```sh
grep -r "seed" admin-api/src/index.ts
```

**Expected**: no matches — confirms the seed mechanism is never wired into the running Hono app
and cannot be triggered over HTTP.

See [contracts/cli.md](./contracts/cli.md) for the full flag/exit-code contract and
[data-model.md](./data-model.md) for the curated list's shape.
