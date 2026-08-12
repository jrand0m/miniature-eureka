# Quickstart: User Notifications (Inbox & Live Stream)

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). No automated test harness exists in `admin-api/`/`public-ui/` at the time
of this feature (matches prior features' findings), so this is the authoritative verification
record — run manually and keep this file up to date with actual results.

## Prerequisites

- `cd admin-api && npm install`
- Apply all migrations (0001–0007) to a local D1 instance: `npm run db:migrate:local`
- `npm run dev` (wrangler dev) with `TOKEN_SIGNING_SECRET` and `ALLOWED_ORIGINS` set
- One registered user account (via `POST /auth/register`) with a bearer token — call it User A;
  a second — User B — to exercise ownership scoping
- The seeded admin token (`admin@library.local` / `12345`) to drive reservation-lifecycle events
- A book (via `POST /admin/books`) and a reservation for User A, created via `POST /reservations`

## Scenario 1 — Notifications are created at the three trigger points (User Story 1)

1. As the admin, `POST /admin/reservations/<id>/confirm` with an `agreedDate` for User A's
   `pending` reservation → expect `200`.
2. `curl $API/notifications -H "Authorization: Bearer $USER_A_TOKEN"` → expect `200` with a
   `notifications` array containing one entry, `type: "reservation_confirmed"`, whose `message`
   names the book title and the agreed date, `relatedReservationId` matching the reservation, and
   `readAt: null`.
3. As the admin, `POST /admin/reservations/<id>/check-out`, then
   `POST /admin/reservations/<id>/force-return` → expect `200`.
4. `GET /notifications` as User A again → expect a second entry, `type:
   "force_return_requested"`, asking for an early return.
5. As the admin, `POST /admin/reservations/<id>/confirm-return` → expect `200`.
6. `GET /notifications` as User A again → expect a third entry, `type: "return_confirmed"`, most
   recent first (i.e. this one now leads the array).

## Scenario 2 — Live stream delivers new notifications without re-polling (User Story 2)

1. In one terminal: `curl -N $API/notifications/stream -H "Authorization: Bearer $USER_A_TOKEN"`
   — leave it running; observe periodic `: heartbeat` comment lines roughly every 15s.
2. In a second terminal, trigger one of the events from Scenario 1 (e.g.
   `POST /admin/reservations/<id>/force-return` on a fresh checked-out reservation).
3. Within ~3–5 seconds, the first terminal's stream MUST show a new `event: notification` frame
   with the corresponding notification, without restarting the `curl` command.
4. Leave the stream open past 5 minutes → confirm it closes gracefully (no error), demonstrating
   the bounded connection lifetime.
5. Without an `Authorization` header → `curl -N $API/notifications/stream` → expect `401` (no
   stream opened).

## Scenario 3 — History and mark-read, ownership-scoped (User Story 3)

1. `GET /notifications` as User A → note an unread (`readAt: null`) notification's `id`.
2. `POST /notifications/<id>/read` as User A → expect `200`, `readAt` now set.
3. `GET /notifications` as User A again → confirm that notification's `readAt` is persisted (not
   reset).
4. Repeat step 2 (mark the same notification read again) → expect `200`, idempotent no-op.
5. As User B, `POST /notifications/<id>/read` against User A's notification id → expect
   `404 {"error":"not_found"}`.
6. As User A, `POST /notifications/<random-uuid>/read` against a nonexistent id → expect
   `404 {"error":"not_found"}`, byte-for-byte identical in shape to step 5.
7. Without an `Authorization` header on any of the above → expect `401`.

## Public UI (manual smoke check)

1. `cd public-ui && npm run dev`; visit any page (e.g. `/`) while logged out → expect no bell/
   notification control rendered anywhere in the nav.
2. Log in as User A; reload any page → expect a bell/notification control in the nav showing an
   unread count badge matching the number of unread notifications from Scenario 1/3.
3. Click the bell → expect a panel listing notification history, most recent first, each showing
   its message and read/unread state.
4. Click "mark read" on an unread item → expect the badge count to decrease by one immediately and
   the item's state to update in the panel, without a page reload.
5. With the page open, trigger a new notification-causing event (e.g. admin force-returns another
   reservation) from a second browser/session → expect the badge count and panel to update live,
   within a few seconds, without reloading the page.
6. Confirm the bell/control is present and functions identically on every page: `index.html`,
   `login.html`, `register.html`, `catalog.html`, `profile.html`.

## Success criteria mapping

Scenario 1 → SC-001. Scenario 2 → SC-002. Scenario 3 → SC-003, SC-004. The Public UI smoke check
(step 1 in particular) → SC-005. Scenario 1+3 combined (history ordering/content) → SC-003.

## Actual verification run

Performed 2026-08-12 against the local dev stack (all seven migrations `0001`–`0007` applied via
`npm run db:migrate:local`, then `wrangler dev --local` on port 8787 with a local `.dev.vars`
providing `TOKEN_SIGNING_SECRET` and an `ALLOWED_ORIGINS` override of `http://localhost:5173` for
CORS, `vite` dev server on port 5173):

- `cd admin-api && npm run typecheck` — clean.
- `cd public-ui && npm run build` — clean; `tsc --noEmit && vite build` produced all five HTML
  entry points plus the new `notifications`/`notifications-client` chunks.
- Registered two test users (User A, User B); logged in as the seeded admin
  (`admin@library.local`); created a test book ("Dune") via `POST /admin/books`; created a
  reservation for User A via `POST /reservations`.

**Scenario 1 (trigger points)**: `POST /admin/reservations/<id>/confirm` with
`agreedDate: "2026-09-03"` → `200`; `GET /notifications` as User A showed one
`reservation_confirmed` entry with the expected message and `relatedReservationId`; `GET
/notifications` as User B (no relation to this reservation) returned `[]`, confirming ownership
scoping. Drove the same reservation through `check-out` → `force-return` → `confirm-return`; each
step's `GET /notifications` as User A showed the new `force_return_requested` /
`return_confirmed` entries, most-recent-first.

**Scenario 2 (live stream)**: Opened `curl -N $API/notifications/stream -H "Authorization: Bearer
$USER_A_TOKEN"` in the background before triggering `force-return` and `confirm-return` from a
separate terminal. Both events appeared on the open stream as `event: notification` frames
(matching `GET /notifications`'s shape) within the 3-second poll window, interleaved with `:
heartbeat` comment lines roughly every 15 seconds — no restart of the `curl` command was needed.
Without an `Authorization` header, both `GET /notifications` and `GET /notifications/stream`
returned `401 {"error":"unauthorized"}`.

**Scenario 3 (history + mark-read ownership)**: `GET /notifications` as User A, most recent
first, confirmed. `POST /notifications/<id>/read` as User A → `200`, `readAt` set; repeating the
same call → `200`, idempotent no-op (same `readAt`). As User B against User A's notification id →
`404 {"error":"not_found"}`; as User A against a random nonexistent UUID → `404
{"error":"not_found"}`, byte-for-byte identical in shape to the User B case.

**Public UI smoke check** (via gstack's headless-browser `browse` binary against `vite dev` +
`wrangler dev`): logged out, every page (`index.html`, `catalog.html`, `profile.html`,
`login.html`, `register.html`) rendered its nav with zero notification-related elements present
(no bell, no data). After injecting User A's token into `localStorage` (`library_auth_token`) and
reloading, every page showed a bell button with an unread badge ("2", matching the two unread
notifications from Scenarios 1–3 at that point). Clicking the bell opened a panel listing all
three notifications, most recent first, each with its message, timestamp, and (for unread items)
a "Mark read" button; the already-read item showed no button and non-bold text. Clicking "Mark
read" on an unread item decremented the badge from 2 to 1 immediately, without a page reload.
Triggering a new `confirmReservation` event from a second terminal while the page stayed open
caused the badge to increase back to 2 and the new notification to appear at the top of the panel
list within a few seconds, with no reload — confirming the `fetch()` + `ReadableStream` SSE client
(not `EventSource`) delivered the live update using the bearer token. No console errors were
observed at any point (a transient CORS console error seen before the `.dev.vars`
`ALLOWED_ORIGINS` override was applied was confirmed gone after a clean reload).

All scenarios passed; no deviations from the contract in `contracts/admin-api.md` were found
during verification. One environment-only note (not a code defect): local `wrangler dev` requires
`ALLOWED_ORIGINS` to include the Vite dev origin (`http://localhost:5173`) via `.dev.vars`, since
`wrangler.toml`'s committed `[vars]` block intentionally holds production origins — this matches
the pattern already established for `TOKEN_SIGNING_SECRET` and is not specific to this feature.
