---

description: "Task list for User Notifications (Inbox & Live Stream)"
---

# Tasks: User Notifications (Inbox & Live Stream)

**Input**: Design documents from `/specs/006-notifications/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md,
quickstart.md

**Tests**: Not explicitly requested in spec.md; no test-writing tasks are included below (no
test framework exists in `admin-api/`/`public-ui/` — see plan.md Technical Context).
quickstart.md is the manual validation record standing in for automated tests this iteration.

**Organization**: Tasks are grouped by user story (US1–US3, matching spec.md's priorities) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `public-ui/` — static site (Vite), Cloudflare Pages

## Phase 1: Setup

**Purpose**: Schema and route mounting shared by every user story.

- [X] T001 Create the `notifications` table migration in
      `admin-api/src/db/migrations/0007_create_notifications.sql`: columns `id` (TEXT PRIMARY
      KEY), `user_id` (TEXT NOT NULL REFERENCES users(id)), `type` (TEXT NOT NULL), `message`
      (TEXT NOT NULL), `related_reservation_id` (TEXT, nullable, REFERENCES reservations(id)),
      `created_at` (TEXT NOT NULL), `read_at` (TEXT, nullable); plus
      `CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at);` (see
      data-model.md)

**Checkpoint**: Schema exists; ready for the foundational service/route layer.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The data-access service and route module every user story's endpoints depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Implement `admin-api/src/services/notifications.ts`: `NotificationRecord` type +
      row mapper (mirrors `services/reservations.ts`'s `mapRow` pattern); `createNotification(db,
      { userId, type, message, relatedReservationId })` (inserts with `crypto.randomUUID()` id
      and `new Date().toISOString()` `created_at`, `read_at` NULL); `listNotificationsByUser(db,
      userId)` (`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id
      DESC`); `markRead(db, id, userId)` (ownership-scoped: look up by id, return `{ outcome:
      "not_found" }` if missing or `user_id !== userId`, else guarded `UPDATE notifications SET
      read_at = ? WHERE id = ? AND user_id = ?` and return `{ outcome: "ok"; notification }` —
      treat an already-read row as a successful no-op, not an error); `listNotificationsSince(db,
      userId, sinceCreatedAt, sinceId)` (`SELECT * FROM notifications WHERE user_id = ? AND
      (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC`, per
      research.md §3's tie-breaking) (depends on T001)
- [X] T003 Implement `admin-api/src/routes/notifications.ts`: a `requireAuth`-gated Hono router
      (mirrors `routes/reservations.ts`'s `.use("*", requireAuth)` pattern) with a
      `serializeNotification` helper (camelCase JSON shape per contracts/admin-api.md); wire
      `GET /notifications` → `listNotificationsByUser` and `POST /notifications/:id/read` →
      `markRead`, mapping `not_found` → `404`; leave `GET /notifications/stream` as a stub
      returning `501` for now (implemented in US2) (depends on T002)
- [X] T004 Mount the new router in `admin-api/src/index.ts`:
      `app.route("/notifications", notificationsRoutes)`, alongside the existing route mounts
      (depends on T003)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - See what happened to my reservations without checking manually (Priority: P1) 🎯 MVP

**Goal**: The three reservation-lifecycle trigger points automatically create notifications for
the affected user, and a signed-in user can retrieve their full notification history.

**Independent Test**: Sign in as a user, have an admin confirm/force-return/confirm-return one of
that user's reservations from another session, and confirm a corresponding notification appears
in `GET /notifications` for that user (most recent first) with the expected message content.

### Implementation for User Story 1

- [X] T005 [US1] In `admin-api/src/services/reservations.ts`, import `createNotification` from
      `./notifications` and `findBookById` from `./books` (already imported); in
      `confirmReservation`, after the `"ok"` outcome is determined (copy successfully
      decremented), look up the book via `findBookById` and call `createNotification(db, {
      userId: reservation.userId, type: "reservation_confirmed", message: \`Your reservation for
      "${book.title}" was confirmed for ${agreedDate}.\`, relatedReservationId: reservation.id
      })` before returning (depends on T002)
- [X] T006 [US1] In the same file, in `forceReturn`, after the `"ok"` outcome is determined, look
      up the book via `findBookById` and call `createNotification(db, { userId:
      reservation.userId, type: "force_return_requested", message: \`Please return "${book.title}"
      soon — the library has requested an early return.\`, relatedReservationId: reservation.id
      })` before returning (depends on T002)
- [X] T007 [US1] In the same file, in `confirmReturn`, after the `"ok"` outcome is determined,
      look up the book via `findBookById` and call `createNotification(db, { userId:
      reservation.userId, type: "return_confirmed", message: \`Your return of "${book.title}" has
      been confirmed. Thank you!\`, relatedReservationId: reservation.id })` before returning
      (depends on T002)
- [X] T008 [P] [US1] Implement `listNotifications()` in a new
      `public-ui/src/services/notifications-client.ts`, following the existing
      `reservations-client.ts` pattern (bearer token header from `getToken()`, typed `ApiResult`,
      camelCase `Notification` type matching contracts/admin-api.md) — calls `GET /notifications`
      (depends on T003; can proceed in parallel with T005–T007 since it only needs the contract,
      not the trigger-point wiring)

**Checkpoint**: User Story 1 is fully functional and independently testable — the three trigger
points create notifications, and a signed-in user can retrieve their history via the API.

---

## Phase 4: User Story 2 - Receive new notifications live while browsing (Priority: P2)

**Goal**: A signed-in user with an open connection receives newly created notifications without
manually reloading, via a bounded-lifetime DB-polling SSE stream that the client reconnects to
after each close.

**Independent Test**: Open the SSE stream for a signed-in user (e.g. via `curl -N` per
quickstart.md Scenario 2), trigger one of the three system events for that user from another
session, and confirm the new notification arrives on the open stream within a few seconds without
restarting the connection; confirm the stream closes gracefully after its maximum lifetime.

### Implementation for User Story 2

- [X] T009 [US2] Implement `GET /notifications/stream` in
      `admin-api/src/routes/notifications.ts` using `streamSSE` from `hono/streaming`, replacing
      the T003 stub: on connect, initialize `lastCreatedAt`/`lastId` from the caller's most recent
      existing notification (if any, via a new small helper or by reusing
      `listNotificationsByUser`'s first row) so only genuinely new notifications are streamed;
      loop for up to 5 minutes total, every 3 seconds calling `listNotificationsSince` (T002) and
      writing each result as `event: notification` SSE data (JSON-encoded, `serializeNotification`
      shape), updating `lastCreatedAt`/`lastId` after each; every 15 seconds (independent of the
      poll) write an SSE comment (`: heartbeat`) via the stream's raw write API; after the 5-minute
      bound, end the stream gracefully (no error) — see research.md §1 and contracts/admin-api.md
      for exact framing (depends on T002, T003)
- [X] T010 [P] [US2] Implement `openNotificationStream(onNotification: (n: Notification) => void):
      { close(): void }` in `public-ui/src/services/notifications-client.ts`: call
      `fetch(`${API_BASE}/notifications/stream`, { headers: { Authorization: \`Bearer
      ${token}\` } })` (NOT `EventSource` — see research.md §2), read `response.body!.getReader()`,
      decode chunks with `TextDecoder`, buffer and split on `\n\n` frame boundaries, parse each
      frame's `data:` line as JSON and invoke `onNotification`, ignore frames with no `data:` line
      (heartbeats); on stream end (reader done) or fetch error, automatically reopen a fresh
      connection (loop) so live delivery survives the server's bounded connection lifetime;
      return a handle whose `close()` aborts the underlying connection (e.g. via `AbortController`)
      so a page navigating away can stop it (depends on T008)

**Checkpoint**: Both P1 and P2 stories together deliver history plus live delivery, fully testable
via curl per quickstart.md Scenarios 1–2.

---

## Phase 5: User Story 3 - Manage the notification inbox (Priority: P3)

**Goal**: A signed-in user sees an unread badge count, can open a panel listing their
notifications, and can mark individual ones read, with the change persisting and reflected
immediately in the badge — surfaced identically on every existing Public UI page.

**Independent Test**: Sign in with a mix of read/unread notifications, open the bell/panel,
confirm the badge count matches the unread count, mark one unread item read, confirm the badge
decrements immediately and the state persists across a reload; attempt (via direct API call) to
mark another user's notification read and confirm it's rejected.

### Implementation for User Story 3

- [X] T011 [US3] Implement `markNotificationRead(id: string)` in
      `public-ui/src/services/notifications-client.ts`, following the existing
      `reservations-client.ts` `requestReturn`-style pattern (bearer token header, `POST
      /notifications/:id/read`, typed `ApiResult`) (depends on T008)
- [X] T012 [US3] Implement `mountNotifications(container: HTMLElement): void` in new
      `public-ui/src/components/notifications.ts`, following `components/auth-status.ts`'s
      "render into a passed container, no-op when logged out" pattern: when `getToken()` is
      absent, render nothing; when present, render a bell button with an unread-count badge and a
      toggleable panel; on mount, call `listNotifications()` (T008) to compute initial unread
      count (`readAt === null`) and populate the panel; call `openNotificationStream()` (T010) to
      receive live updates, prepending each new notification to the panel's list and incrementing
      the badge; wire each panel item's "mark read" action to `markNotificationRead()` (T011),
      updating that item's rendered state and decrementing the badge on success (depends on T010,
      T011)
- [X] T013 [P] [US3] Add a notification-control mount point to the nav of
      `public-ui/index.html`, `public-ui/login.html`, `public-ui/register.html`,
      `public-ui/catalog.html`, `public-ui/profile.html` (e.g. `<div
      id="notifications-root"></div>` inside each `<nav>`, alongside the existing links)
- [X] T014 [US3] In each of `public-ui/src/pages/home.ts`, `login.ts`, `register.ts`,
      `catalog.ts`, `profile.ts`, import `mountNotifications` from `../components/notifications`
      and call it with the page's `#notifications-root` element, mirroring how
      `renderAuthStatus` is invoked from `home.ts` (depends on T012, T013)

**Checkpoint**: All three user stories together deliver the full notifications feature: automatic
creation, live delivery, and a manageable inbox UI on every page.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation spanning all three stories.

- [X] T015 Run `cd admin-api && npm run typecheck` and `cd public-ui && npm run build`; fix any
      errors (depends on T001–T014)
- [X] T016 Run through all three quickstart.md scenarios end-to-end against a local `wrangler
      dev` + migrated local D1 instance (migrations 0001–0007), including the `curl -N` SSE
      session and the Public UI smoke check, and record actual results in quickstart.md's "Actual
      verification run" section and this feature's PR description (depends on T015)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational — delivers history + trigger-point wiring; no
  dependency on US2/US3.
- **US2 (Phase 4)**: Depends on Foundational; T010 depends on T008 (US1's client file existing).
  Independently testable via curl without any US3 (frontend UI) work.
- **US3 (Phase 5)**: Depends on US1 (T008) and US2 (T010) for its client-side building blocks;
  delivers the visible Public UI surface.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T008 (frontend history client) can proceed in parallel with T005–T007 (backend trigger-point
  wiring) — both depend only on the shared contract, not on each other's code.
- T010 (frontend SSE client) can proceed in parallel with T009 (backend SSE route) for the same
  reason.
- T013 (nav mount points, five HTML files) can run in parallel with T012 (component
  implementation) — different files, no shared dependency until T014 wires them together.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (schema + service/route foundation).
2. Complete Phase 3: User Story 1 (trigger-point wiring + history endpoint).
3. **STOP and VALIDATE**: confirm the three system events each produce exactly one notification,
   retrievable via `GET /notifications` — quickstart.md Scenario 1.
4. Note: US1 alone has no live delivery and no UI — it proves the core data model and automatic
   creation logic end-to-end via the API only.

### Incremental Delivery

1. Phase 1 + 2 → foundation ready (schema, service, route skeleton).
2. Add US1 → validate (quickstart Scenario 1) → notifications are created and retrievable.
3. Add US2 → validate (quickstart Scenario 2) → live delivery works over `curl -N`, including the
   bounded-lifetime close.
4. Add US3 → validate (quickstart Scenario 3 + Public UI smoke check) → the bell/badge/panel work
   on every page.
5. Polish → full quickstart re-run green, typecheck/build clean.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- [Story] labels map each task to its spec.md user story for traceability.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently before moving on.
- `admin-api/src/services/reservations.ts` and `admin-api/src/index.ts` are shared files edited
  by T005–T007 and T004 respectively — this feature is the sole active editor of both this wave
  (no concurrent sibling feature, per the task brief), so no reconciliation-at-merge concern
  applies here (unlike `005-user-profile-return`'s equivalent note).
