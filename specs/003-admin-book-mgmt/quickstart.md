# Quickstart: Admin Book Catalog & Inventory Management

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). Assumes the single shared dev environment (Constitution Principle V). This
feature has no automated test suite (see [research.md](./research.md)); this document **is** the
verification record — fill in actual command output when running it.

## Verification record (2026-08-11)

Ran end-to-end against a local `wrangler dev` (port 8787) with a fresh `wrangler d1 migrations
apply library-admin-db --local` and the seeded admin account (`admin@library.local`). Results:

- `POST /admin/books` (valid) → `201`, `quantityAvailable == quantityTotal` (3/3). ✅
- `POST /admin/books` (missing `title`) → `400 invalid_request`. ✅
- `POST /admin/books` (no bearer token) → `401 unauthorized`. ✅
- `POST /admin/books/:id/quantity` `{"delta":2}` on a 3/3 book → `200`, 5/5. ✅
- `PATCH /admin/books/:id` `{"title": "..."}` → `200`, title updated, quantities unchanged. ✅
- `PATCH /admin/books/does-not-exist` → `404 not_found`. ✅
- Simulated 3 checked-out copies (`quantity_available` set to 2 of 5 via direct D1 `UPDATE`,
  since no reservation feature exists yet), then:
  - `DELETE /admin/books/:id` → `409 copies_unavailable`, book still present. ✅
  - `POST .../quantity` `{"delta":-2}` (5/2 → 3/0, still within bounds) → `200`, 3/0. ✅
  - `POST .../quantity` `{"delta":-1}` on a 3/0 book (would take available to −1) → `409
    insufficient_quantity`; re-fetched via `GET /books/:id` and confirmed quantities unchanged
    (3/0). ✅ — this is the required over-removal 409 verification.
  - `POST /admin/books/does-not-exist/quantity` → `404 not_found`. ✅
- Restored `quantity_available = quantity_total` via direct D1 `UPDATE`, then:
  - `DELETE /admin/books/:id` → `204`, and a subsequent `GET /books/:id` → `404`. ✅
  - `DELETE /admin/books/does-not-exist` → `404 not_found`. ✅
- Edge cases: `{"delta": 0}` on a fresh 2/2 book → `200`, unchanged 2/2 (valid no-op). ✅ A
  `PATCH` with an empty `{}` body → `200`, book fully unchanged (valid no-op). ✅
- `cd admin-api && npm run typecheck` → clean. `cd admin-ui && npm run build` → clean
  (`tsc --noEmit && vite build`, all five pages including `books.html` build successfully).
- Admin UI (Scenario 5) manually exercised via `npm run build`'s output and code review of
  `admin-ui/src/pages/books.ts`; the add/edit/delete/quantity-adjust controls and the
  Users↔Books nav link are wired per the plan (no interactive browser session was captured in
  this run — the API-level checks above are the primary verification for this pass).

## Prerequisites

- `admin-api/` running locally via `wrangler dev` with a local D1 database migrated using
  `npm run db:migrate:local` (applies all migrations in `src/db/migrations/`, including the
  pre-existing `0003_create_books.sql` — no new migration ships with this feature).
- An admin bearer token: log in as the seeded admin account (`0002_seed_admin.sql`) via
  `POST /auth/login` and use the returned `token` as `Authorization: Bearer <token>` for every
  call below.
- `admin-ui/` running locally via its Vite dev server, pointed at the local `admin-api/` URL
  (`VITE_ADMIN_API_BASE_URL`, per `admin-ui/.env.example`).

## Scenario 1 — Add a new book (User Story 1)

```sh
curl -s -X POST "$API/admin/books" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"The Great Gatsby","author":"F. Scott Fitzgerald","isbn":"9780743273565","quantityTotal":3}'
```

Expect: `201`, body has `quantityTotal: 3` and `quantityAvailable: 3` (FR-003). Repeat omitting
`title` — expect `400 invalid_request` (FR-002). Repeat omitting `isbn`/`description` — expect
`201` with those fields `null`.

## Scenario 2 — Adjust inventory (User Story 2)

Using the book id (`$ID`) from Scenario 1 (`quantityTotal`/`quantityAvailable` = 3/3):

```sh
curl -s -X POST "$API/admin/books/$ID/quantity" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"delta":2}'
```

Expect: `200`, `quantityTotal: 5`, `quantityAvailable: 5`.

Now simulate 3 copies checked out by manually setting `quantity_available` to 2 via D1 (no
reservation feature exists yet to do this through the API):

```sh
wrangler d1 execute library-admin-db --local --command \
  "UPDATE books SET quantity_available = 2 WHERE id = '$ID'"
```

```sh
curl -s -X POST "$API/admin/books/$ID/quantity" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"delta":-2}'
```

Expect: `200`, `quantityTotal: 3`, `quantityAvailable: 0`.

```sh
curl -s -X POST "$API/admin/books/$ID/quantity" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"delta":-1}'
```

Expect: `409 insufficient_quantity`; re-fetch the book (`GET /books/:id`) and confirm quantities
are unchanged (`3`/`0`) — this is the required manual verification of the 409 over-removal case.

```sh
curl -s -X POST "$API/admin/books/does-not-exist/quantity" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"delta":1}'
```

Expect: `404 not_found`.

## Scenario 3 — Edit descriptive details (User Story 3)

```sh
curl -s -X PATCH "$API/admin/books/$ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"The Great Gatsby (Corrected)"}'
```

Expect: `200`, `title` updated, `quantityTotal`/`quantityAvailable` unchanged from Scenario 2's
final state (`3`/`0`).

```sh
curl -s -X PATCH "$API/admin/books/does-not-exist" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"X"}'
```

Expect: `404 not_found`.

## Scenario 4 — Remove a book (User Story 4)

With `$ID` still at `quantityAvailable: 0 < quantityTotal: 3` (some copies "checked out"):

```sh
curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/admin/books/$ID" \
  -H "Authorization: Bearer $TOKEN"
```

Expect: `409`; `GET /books/$ID` still returns the book (delete-blocking policy — FR-010).

Restore full availability, then delete:

```sh
wrangler d1 execute library-admin-db --local --command \
  "UPDATE books SET quantity_available = quantity_total WHERE id = '$ID'"
curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/admin/books/$ID" \
  -H "Authorization: Bearer $TOKEN"
```

Expect: `204`; `GET /books/$ID` now returns `404`.

```sh
curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/admin/books/does-not-exist" \
  -H "Authorization: Bearer $TOKEN"
```

Expect: `404`.

## Scenario 5 — Admin UI end-to-end (FR-014)

1. Log into `admin-ui/` as the seeded admin.
2. Open the new Books page (linked from the nav alongside Users).
3. Add a book via the form; confirm it appears in the list.
4. Edit the book's title; confirm the change is reflected without altering its quantity display.
5. Adjust its quantity up, then down; confirm the displayed available/total counts update.
6. Attempt to delete a book with copies checked out (available < total); confirm the UI surfaces
   the refusal rather than silently failing.
7. Delete a fully-available book; confirm it disappears from the list.
8. Confirm every action above without a valid admin session redirects to `/login.html` (matching
   `users.ts`'s existing `loadUsers()` 401/expired-session handling).

## Success criteria mapping

Scenarios 1–4 correspond to SC-001 through SC-003 and SC-005; every 401/403 path implicit in
"Admin-only" above (FR-012) corresponds to SC-004. Scenario 5 validates FR-014 (the Admin UI
surface) end-to-end.
