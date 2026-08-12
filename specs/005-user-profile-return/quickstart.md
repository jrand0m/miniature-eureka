# Quickstart: User Profile & Return Request

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). No automated test harness exists in `admin-api/`/`public-ui/` at the time
of this feature (matches prior features' findings), so this is the authoritative verification
record — run manually and keep this file up to date with actual results.

## Prerequisites

- `cd admin-api && npm install`
- Apply all migrations (0001–0005) to a local D1 instance: `npm run db:migrate:local`
- `npm run dev` (wrangler dev) with `TOKEN_SIGNING_SECRET` and `ALLOWED_ORIGINS` set
- Two registered user accounts (via `POST /auth/register`) with bearer tokens — call them User A
  and User B
- A reservation belonging to User A, driven through `pending → confirmed → checked_out` using
  the existing `004-reservation-flow` endpoints (`POST /reservations`,
  `POST /admin/reservations/:id/confirm`, `POST /admin/reservations/:id/check-out`, using the
  seeded admin token for the latter two)

## Scenario 1 — User views their own reservations (User Story 1)

1. `curl $API/reservations -H "Authorization: Bearer $USER_A_TOKEN"` → expect `200` with a
   `reservations` array containing User A's reservation(s), each with `status` and dates.
2. As a brand-new user with no reservations → expect `200 { "reservations": [] }`.
3. Without an `Authorization` header → expect `401`.

## Scenario 2 — User requests a return on a checked-out reservation (User Story 2)

1. Using the `checked_out` reservation created in Prerequisites:
   `curl -X POST $API/reservations/<id>/return-request -H "Authorization: Bearer $USER_A_TOKEN" -H 'Content-Type: application/json' -d '{"preferredReturnDate":"2026-09-10"}'`
2. Expect `200` with `status: "return_requested"`.
3. Repeat the same call again (same id, now `return_requested`) → expect
   `409 invalid_status_transition`, and confirm (via `GET /reservations`) the reservation is
   unchanged.
4. Attempt a return request on a reservation still in `pending`/`confirmed` status →
   expect `409 invalid_status_transition`.
5. Attempt a return request with no body / missing `preferredReturnDate` →
   expect `400 invalid_request`.
6. As User B, attempt a return request on User A's `checked_out` reservation id →
   expect `404 not_found` (not `403`).
7. As User A, attempt a return request on a random/nonexistent reservation id →
   expect `404 not_found` — confirm the response body is identical in shape to step 6's.
8. Without an `Authorization` header → expect `401`.

## Public UI (manual smoke check)

1. `cd public-ui && npm run dev`; visit `/profile.html` while logged out → expect a "please log
   in" message, no reservation data rendered.
2. Log in as User A via the existing login page; revisit `/profile.html` → expect the list of
   User A's reservations with status shown.
3. For the `checked_out` reservation, confirm a "Request Return" control (date input + button) is
   shown; for reservations in any other status, confirm it is not shown.
4. Submit a return request with a date; confirm the UI reflects the updated status
   (`return_requested`) without a page reload, and the control disappears for that reservation.
5. Confirm the new page is linked from nav on the existing pages (home, catalog, login,
   register), matching how `catalog.html` is linked.

## Success criteria mapping

Scenario 1 → SC-001, SC-005. Scenario 2 → SC-002, SC-003, SC-004. The Public UI smoke check
covers the end-to-end experience underlying all five.

## Actual verification run

Performed 2026-08-12 against the local dev stack (all five migrations `0001`–`0005` applied via
`npm run db:migrate:local`, then `wrangler dev --local` on port 8787, `vite dev` on port 5173):

- `npm run typecheck` (admin-api) — clean.
- `npm run build` (public-ui) — clean, `profile.html`/`profile.ts` present in the output bundle
  alongside the existing pages.
- Registered two test users (User A, User B); logged in as the seeded admin
  (`admin@library.local`); created a test book via `POST /admin/books`; created a reservation for
  User A and drove it through `pending → confirmed → checked_out` via the existing endpoints.
- Scenario 1: `GET /reservations` as User A returned the reservation with `status: "checked_out"`.
- Scenario 2: `POST /reservations/<id>/return-request` as User A with a preferred date → `200`,
  `status: "return_requested"`; repeating the same call → `409 invalid_status_transition`;
  attempting on a separate still-`pending` reservation → `409 invalid_status_transition`;
  omitting `preferredReturnDate` → `400 invalid_request`; as User B against User A's `checked_out`
  reservation id → `404 {"error":"not_found"}`; as User A against a random nonexistent UUID →
  `404 {"error":"not_found"}`, byte-for-byte identical to the User B case; without an
  `Authorization` header → `401`.
- Public UI smoke check performed via a headless-browser pass (gstack's `browse` binary) against
  `vite dev` + `wrangler dev`: logged out, `/profile.html` showed `#login-prompt` visible and
  `#reservations-section` hidden, with no console errors; after setting `library_auth_token` in
  `localStorage` to User A's token and reloading, the login prompt hid, the reservations section
  showed, and all of User A's reservations rendered with their status and dates; a fresh
  `checked_out` reservation was created via the admin flow mid-session and, on reload, showed a
  date input + "Request Return" button while the `pending`/`return_requested` rows showed no
  control; filling the date and clicking the button updated that row's status to
  `return_requested` and showed a "Return requested — thanks for letting us know." success
  message without a page reload, after which the control disappeared for that row (no reservation
  was left in `checked_out` status); no console errors were observed at any step. Nav links to
  `/profile.html` were confirmed present on the home, catalog, login, and register pages.

All scenarios passed; no deviations from the contract in `contracts/admin-api.md` were found
during verification.
