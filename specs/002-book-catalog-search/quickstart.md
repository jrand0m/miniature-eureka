# Quickstart: Book Catalog & Public Search

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). Assumes the single shared dev environment (Constitution Principle V).

## Prerequisites

- `admin-api/` running locally via `wrangler dev` with a local D1 database migrated using
  `npm run db:migrate:local` (applies `0003_create_books.sql` alongside the existing
  migrations — see [data-model.md](./data-model.md)).
- Since this feature ships no seed data, insert a few test rows directly via
  `wrangler d1 execute library-admin-db --local --command "INSERT INTO books (...) VALUES (...)"`
  before exercising search/pagination.
- `public-ui/` running locally via its Vite dev server, pointed at the local `admin-api/` URL
  (`VITE_ADMIN_API_BASE_URL`, per `public-ui/.env.example`).

## Scenario 1 — Browse and search the catalog (User Story 1)

1. Insert at least two books via D1, e.g. one titled "The Great Gatsby" by "F. Scott
   Fitzgerald" and one by "Jane Austen".
2. Open `public-ui/`'s new catalog page with no search terms.
3. Expect: both books appear, each showing title, author, and available quantity — see
   `GET /books` in [contracts/admin-api.md](./contracts/admin-api.md).
4. Search for "gatsby" (mixed case).
5. Expect: only the Fitzgerald book appears.
6. Search for "austen" (mixed case) via the author field.
7. Expect: only the Austen book appears.
8. Search for a term matching neither book.
9. Expect: an empty, non-error "no results" state.

## Scenario 2 — Paginated browsing (User Story 2)

1. Insert more than `limit` (default 20) books via D1.
2. Call `GET /books` with no `offset`.
3. Expect: exactly `limit` books returned, plus `total` reflecting the full count.
4. Call `GET /books?offset=<limit>`.
5. Expect: the next page of books, disjoint from page 1.
6. Repeat steps 2–5 with a `title` or `author` filter applied.
7. Expect: `total` reflects only the filtered count, and pagination stays within the filtered
   set.

## Scenario 3 — Single book lookup (User Story 3)

1. Call `GET /books/:id` with a known book's id.
2. Expect: full detail (title, author, isbn, description, quantityTotal, quantityAvailable,
   createdAt), `200 OK`.
3. Call `GET /books/:id` with a random/nonexistent id.
4. Expect: `404 Not Found`, `{ "error": "not_found" }` — no fabricated data.

## Success criteria mapping

Each scenario above corresponds to a measurable outcome in spec.md's Success Criteria
(SC-001 through SC-005) — a passing run of all three scenarios is evidence the feature meets
them.
