# Quickstart: Reservation Flow

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). No automated test harness exists in `admin-api/`/`public-ui/` at the time
of this feature (see plan.md Technical Context), so this is the authoritative verification
record — run manually and keep this file up to date with actual results.

## Prerequisites

- `cd admin-api && npm install`
- Apply migrations to a local D1 instance: `npm run db:migrate:local`
- `npm run dev` (wrangler dev) with `TOKEN_SIGNING_SECRET` and `ALLOWED_ORIGINS` set (wrangler
  dev picks up `.dev.vars` if present, or pass `--var`)
- A seeded/registered admin token and a regular user token (register via `POST /auth/register`;
  the seed migration `0002_seed_admin.sql` provides the admin account per feature 001)
- At least one row in `books` with `quantity_available > 0` (via the provisional `POST`-free
  seed path documented in `admin-api/src/db/migrations/0003_create_books.sql` — for this
  feature's manual verification, insert a test row directly with `wrangler d1 execute`)

## Scenario 1 — Request a reservation (User Story 1)

1. `POST /auth/register` (or `/auth/login`) to get a user bearer token.
2. `curl -X POST $API/reservations -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' -d '{"bookId":"<id>","requestedDate":"2026-09-01"}'`
3. Expect `201` with a `pending` reservation; re-query the book and confirm
   `quantityAvailable` is unchanged (FR-004).
4. Repeat with a bogus `bookId` → expect `404 book_not_found`.
5. Set a book's `quantity_available` to `0` (directly via `wrangler d1 execute`) and repeat →
   expect `409 no_copies_available`, no reservation row created.
6. Repeat step 2 without an `Authorization` header → expect `401`.

## Scenario 2 — Admin confirms a reservation (User Story 2)

1. `curl $API/admin/reservations?status=pending -H "Authorization: Bearer $ADMIN_TOKEN"` →
   expect the pending reservation from Scenario 1, with `bookTitle`/`bookAuthor`/`userEmail`
   populated.
2. `curl -X POST $API/admin/reservations/<id>/confirm -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"agreedDate":"2026-09-03"}'`
3. Expect `200`, `status: "confirmed"`, `agreedDate` set; re-query the book and confirm
   `quantityAvailable` decreased by exactly one (FR-009).
4. Repeat step 2 immediately (same reservation id) → expect `409 invalid_status_transition`, and
   confirm `quantityAvailable` did not change again.
5. Create a second pending reservation against a book with `quantity_available = 0` (set it to
   zero after the request was created, simulating the race in the spec's Edge Cases) and confirm
   it → expect `409 no_copies_available`, and confirm the reservation is still `pending`
   afterward (compensated back, per research.md §3).
6. Repeat step 2 with a non-admin (user) token → expect `403`.

## Scenario 3 — Admin checks out a confirmed reservation (User Story 3)

1. `curl -X POST $API/admin/reservations/<id>/check-out -H "Authorization: Bearer $ADMIN_TOKEN"`
   using the reservation confirmed in Scenario 2.
2. Expect `200`, `status: "checked_out"`, `checkedOutAt` set.
3. Repeat step 1 (same id) → expect `409 invalid_status_transition`.
4. Attempt check-out on a reservation that is still `pending` (never confirmed) →
   expect `409 invalid_status_transition`.
5. Repeat step 1 with a non-admin (user) token → expect `403`.

## Scenario 4 — A user only sees their own reservations (User Story 4)

1. Register a second user; create a reservation for them.
2. `GET /reservations` as the first user → expect only their own reservation(s), not the second
   user's.
3. `GET /reservations` as a brand-new user with none → expect `{ "reservations": [] }`.

## Scenario 5 — Admin queue filtering (User Story 5)

1. With reservations in at least two different statuses (e.g. one `pending`, one `confirmed`),
   `GET /admin/reservations` with no filter → expect all of them.
2. `GET /admin/reservations?status=pending` → expect only `pending` rows.
3. `GET /admin/reservations?status=not_a_real_status` → expect `400 invalid_request`.

## Public UI (manual smoke check)

1. `cd public-ui && npm run dev`; log in as the test user via the existing login page.
2. On the catalog page, confirm the "Reserve" action is visible only while logged in.
3. Submit a reservation with a delivery date; confirm the status area reflects success, and
   confirm calling `POST /auth/logout` (or clearing the token) hides the action again.

## Success criteria mapping

Each scenario above corresponds to a measurable outcome in spec.md's Success Criteria
(SC-001 through SC-005); a passing run of all five scenarios plus the Public UI smoke check is
evidence the feature meets them.

## Actual verification run

Performed 2026-08-11 against the real, merged FEAT-01 book-catalog infrastructure (commit
`2bba414`) plus this feature's `0004_create_reservations.sql`, applied locally via
`npm run db:migrate:local` (all four migrations `0001`–`0004` applied cleanly), then
`wrangler dev --local` with two manually-inserted test books (one with 1 available copy, one
with 0):

- `npm run typecheck` (admin-api) — clean.
- Registered a test user via `POST /auth/register`; logged in as the seeded admin via
  `POST /auth/login`.
- Scenario 1 (request): `201 pending` for the in-stock book, book's `quantityAvailable`
  unchanged afterward; `404 book_not_found` for a bogus id; `409 no_copies_available` for the
  zero-availability book; `401` with no `Authorization` header. All matched spec.
- Scenario 2 (confirm): `GET /admin/reservations?status=pending` showed the request with
  `bookTitle`/`bookAuthor`/`userEmail` populated; `POST .../confirm` → `200 confirmed`,
  `agreedDate` set, book's `quantityAvailable` decremented by exactly one; repeating the same
  confirm → `409 invalid_status_transition` with no further decrement; confirming as a non-admin
  user token → `403`; confirming a still-`pending` reservation after manually zeroing its book's
  `quantity_available` (simulating the race) → `409 no_copies_available`, and the reservation
  was verified (via `wrangler d1 execute`) to have been compensated back to `pending` with
  `agreed_date` cleared, per research.md §3. Confirming/checking-out a nonexistent id → `404`
  in both cases.
- Scenario 3 (check-out): `POST .../check-out` on the confirmed reservation → `200 checked_out`
  with `checkedOutAt` set; repeating → `409`; checking out a still-`pending` reservation → `409`;
  checking out as a non-admin token → `403`.
- Scenario 4 (own reservations): `GET /reservations` as the test user returned only that user's
  own reservations (verified across the multiple reservations created during the run above).
- Scenario 5 (admin queue filtering): unfiltered `GET /admin/reservations` returned all rows
  with book/requester detail; `?status=pending` returned only pending rows; `?status=bogus` →
  `400 invalid_request`.
- Public UI smoke check: `npm run build` (public-ui) — clean. Used a headless-browser pass
  (gstack) against `vite dev` + `wrangler dev`: with no session, the catalog page showed no
  Reserve controls and the "My Reservations" section was hidden (`is visible #my-reservations`
  → `false`); after logging in as the seeded admin, each book showed a date input + "Reserve"
  button (disabled when `quantityAvailable` is 0); submitting a reservation on the in-stock book
  showed the success message ("Reservation requested for ... — awaiting admin confirmation.")
  and the "My Reservations" list updated to show the new `pending` entry; no console errors were
  observed at any step.

All scenarios passed; no deviations from the contract in contracts/admin-api.md were found
during verification.
