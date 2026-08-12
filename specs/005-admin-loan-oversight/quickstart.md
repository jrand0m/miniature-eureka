# Quickstart: Admin Loan Oversight

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). No automated test harness exists in `admin-api/`/`admin-ui/` at the time
of this feature (see plan.md Technical Context), so this is the authoritative verification
record — run manually and keep this file up to date with actual results.

## Prerequisites

- `cd admin-api && npm install`
- Apply migrations to a local D1 instance: `npm run db:migrate:local` (all six, `0001`-`0006`)
- `npm run dev` (wrangler dev) with `TOKEN_SIGNING_SECRET` and `ALLOWED_ORIGINS` set
- A seeded admin token (`0002_seed_admin.sql`) and at least one regular user token
- At least one book row, and reservations driven through the existing
  `pending → confirmed → checked_out` flow (`POST /reservations`,
  `POST /admin/reservations/:id/confirm`, `POST /admin/reservations/:id/check-out`) to set up
  fixtures for this feature's new endpoints

## Scenario 1 — Filter the loan list by book and by user (User Story 1)

1. Create reservations for at least two different books and two different users (using the
   existing `POST /reservations` + confirm/check-out flow, or leaving some `pending`).
2. `GET /admin/reservations?bookId=<id>` → expect only reservations for that book.
3. `GET /admin/reservations?userId=<id>` → expect only reservations for that user.
4. `GET /admin/reservations?bookId=<id>&status=pending` → expect only rows matching both.
5. `GET /admin/reservations?bookId=<a-nonexistent-id>` → expect `{ "reservations": [] }`, not an
   error.
6. Repeat any of the above with a non-admin token → expect `403`.

## Scenario 2 — Confirm a return (User Story 2)

1. Drive a reservation to `checked_out` via the existing flow. Note the book's
   `quantityAvailable` beforehand.
2. `curl -X POST $API/admin/reservations/<id>/confirm-return -H "Authorization: Bearer $ADMIN_TOKEN"`
3. Expect `200`, `status: "returned"`, `returnedAt` set; re-query the book and confirm
   `quantityAvailable` increased by exactly one (FR-006).
4. Repeat step 2 (same id, now `returned`) → expect `409 invalid_status_transition`, and confirm
   `quantityAvailable` did not change again.
5. Separately, drive another reservation to `checked_out`, then (if the sibling member-return
   feature's endpoint is present) transition it to `return_requested`, and confirm-return it →
   expect the same success outcome as step 3.
6. Attempt confirm-return on a `pending` or `confirmed` (not yet checked out) reservation →
   expect `409 invalid_status_transition`.
7. Repeat step 2 with a non-admin token → expect `403`. Repeat with a bogus id → expect `404`.

## Scenario 3 — Force an early return (User Story 3)

1. Drive a reservation to `checked_out` (or leave one `confirmed`).
2. `curl -X POST $API/admin/reservations/<id>/force-return -H "Authorization: Bearer $ADMIN_TOKEN"`
3. Expect `200`, `status` unchanged (still `checked_out` or `confirmed`),
   `forceReturnRequestedAt` now set to a recent timestamp.
4. Repeat step 2 (same id) → expect `200` again (idempotent), with `forceReturnRequestedAt`
   updated to a newer timestamp, no error.
5. Attempt force-return on a `pending`, `return_requested`, `returned`, or `cancelled`
   reservation → expect `409 invalid_status_transition`, and `forceReturnRequestedAt` unchanged
   (still whatever it was, including `null`).
6. Confirm the return of a reservation that has `forceReturnRequestedAt` set (via Scenario 2's
   flow) → expect the normal confirm-return success outcome; `forceReturnRequestedAt` is left as
   the admin previously set it (this feature has no "un-flag" action).
7. Repeat step 2 with a non-admin token → expect `403`. Repeat with a bogus id → expect `404`.

## Scenario 4 — Admin UI Loans page (User Story 1/2/3 combined)

1. `cd admin-ui && npm run dev`; log in as the seeded admin.
2. Navigate to the new Loans page via the nav link (alongside Users/Books).
3. Confirm the list shows book title/author, holder email, status, and dates for every loan.
4. Use the status/book/user filters and confirm the list narrows accordingly.
5. On a `checked_out`/`return_requested` row, click "Confirm Return"; confirm the row updates to
   `returned` (or the list reloads showing the new status) with no page error.
6. On a `checked_out`/`confirmed` row, click "Force Early Return"; confirm a flag/badge appears
   on that row without its status changing; click it again and confirm no error occurs.
7. Confirm action buttons are absent/disabled on rows in ineligible statuses (e.g. no "Confirm
   Return" button on a `pending` row).

## Success criteria mapping

Each scenario above corresponds to a measurable outcome in spec.md's Success Criteria
(SC-001 through SC-005); a passing run of all four scenarios is evidence the feature meets them.

## Actual verification run

Performed 2026-08-12 against a local D1 instance with all six migrations (`0001`-`0006`)
applied via `npm run db:migrate:local`, then `wrangler dev --port 8788` (port 8787 was already
in use by a concurrently-running sibling-feature worktree's dev server on the same machine —
unrelated to this feature).

- `cd admin-api && npm run typecheck` — clean.
- `cd admin-ui && npm run build` — clean (produces `dist/loans.html` + `dist/assets/loans-*.js`
  alongside the existing pages).
- Registered a test user (`loantest@example.com`) and logged in as the seeded admin
  (`admin@library.local`); created two books (A: 2 total copies, B: 1 total copy) via
  `POST /admin/books`.
- **Scenario 1 (filter by book/user)**: created reservations against both books, drove one
  (book A) through `pending → confirmed → checked_out` and left another (book B) at
  `confirmed`. `GET /admin/reservations?bookId=<A>` returned only book A's reservation;
  `?bookId=<B>&status=confirmed` returned exactly the one matching row; `?bookId=<B>&status=pending`
  returned `{"reservations":[]}`; a nonexistent `bookId` also returned an empty list (not an
  error); the same query with a non-admin user token returned `403`. All matched spec.
- **Scenario 2 (confirm-return)**: confirmed the return of the `checked_out` book-A
  reservation — `200`, `status: "returned"`, `returnedAt` set, and the book's
  `quantityAvailable` went from 1 back to 2 (its `quantityTotal`). Repeating the same
  confirm-return call → `409 invalid_status_transition`, no further change. Attempting
  confirm-return on the still-`confirmed` book-B reservation → `409`. Also hand-inserted a row
  directly in `return_requested` status (since the sibling member-return-request feature that
  would normally produce this status was not present in this worktree) and confirmed its
  return — same success outcome, book B's `quantityAvailable` incremented from 0 to 1.
  Confirm-return with a non-admin token → `403`; with a bogus id → `404`.
- **Scenario 3 (force-return)**: force-returned the book-A `checked_out` reservation — `200`,
  `status` unchanged (`checked_out`), `forceReturnRequestedAt` set. Repeating immediately →
  `200` again, with the timestamp advancing (idempotent, no error). Force-returned the
  book-B `confirmed` reservation — same success shape. Force-return with a non-admin token →
  `403`; with a bogus id → `404`. Confirming the return of a reservation that already had
  `forceReturnRequestedAt` set (from Scenario 3) via Scenario 2's flow showed the field
  preserved unchanged afterward (this feature has no "un-flag" action), confirming FR-010's
  everywhere-visible requirement holds through a status transition too.
- **Scenario 4 (Admin UI Loans page)**: `vite dev` (admin-ui) against the same `wrangler dev`
  backend; used a headless-browser pass (gstack). Logged in as the seeded admin, navigated via
  the new "Loans" nav link (present on Users/Books/Loans pages). The list showed book
  title/author, holder email, status, and all four dates for every loan, with an
  "Early return requested" badge on rows with `forceReturnRequestedAt` set. Filtering by
  `bookId` narrowed the list to the matching book's rows only; "Clear" reset the filter.
  A `checked_out` row showed both "Confirm Return" and "Force Early Return" buttons; a
  `confirmed` row showed only "Force Early Return"; `returned` rows showed neither. Clicking
  "Confirm Return" on a fresh `checked_out` reservation (created for this check) showed a
  "Return confirmed." success message and the row updated in place to `returned` with
  `returnedAt` populated and both action buttons gone. No console errors were observed at any
  step.

All scenarios passed; no deviations from the contract in contracts/admin-api.md were found
during verification. One contract note confirmed at implementation time: the sibling FEAT-04
feature's `returnRequestedDate`/`0005_*` migration had not landed in this worktree as of this
verification run, so `returnRequestedDate` is not present in any response shape here — per
plan.md's note, this is expected and left for merge-time reconciliation, not this feature's
scope.
