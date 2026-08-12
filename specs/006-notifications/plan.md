# Implementation Plan: User Notifications (Inbox & Live Stream)

**Branch**: `006-notifications` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-notifications/spec.md`

## Summary

Give every signed-in Public UI user a persisted, per-user notification inbox plus a live
(polling-backed SSE) stream of new notifications, following the constitution's public library
surface (`requireAuth` pattern, Principle I item c). Backend: a new `notifications` table
(migration `0007_create_notifications.sql`), a new `services/notifications.ts`
(`createNotification`, `listNotificationsByUser`, `markRead`, `listNotificationsSince`), a new
`routes/notifications.ts` (`GET /notifications`, `POST /notifications/:id/read`,
`GET /notifications/stream`) mounted at `/notifications`, and notification-creation calls wired
into the three existing reservation-lifecycle trigger points in `services/reservations.ts`
(`confirmReservation`, `forceReturn`, `confirmReturn`). Because Cloudflare Workers has no
persistent in-memory process and this repo has no Durable Objects, `GET /notifications/stream` is
implemented as a bounded-lifetime, DB-polling SSE endpoint via Hono's `streamSSE` helper — poll
D1 every 3s for anything newer than the last-emitted `(created_at, id)`, send a heartbeat comment
every 15s, and close gracefully after 5 minutes so the client reconnects. Frontend: a new
`public-ui/src/components/notifications.ts` bell/badge/panel component mounted into the nav of
every existing page, which — because the browser's native `EventSource` cannot send an
`Authorization` header — opens the stream via authenticated `fetch()` and parses the
`ReadableStream` body's `data: ...\n\n` frames itself rather than using `new EventSource(...)`.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for the
backend)

**Primary Dependencies**: Hono (Workers-native HTTP router), specifically its `hono/streaming`
`streamSSE` helper for the SSE endpoint; Vite for building the Public UI static bundle; native D1
bindings (`wrangler d1`) for migrations — no ORM, matching the existing services' raw-SQL pattern;
the browser's native `fetch()` + `ReadableStream`/`TextDecoder` on the client (no SSE/EventSource
library), per the auth-header constraint

**Storage**: Cloudflare D1 (SQLite, free tier) — one new table, `notifications` (migration
`0007_create_notifications.sql`), with an index on `(user_id, created_at)` to serve both the
history read and the polling-since query efficiently

**Testing**: No test framework/harness exists in `admin-api/` or `public-ui/` at the time of this
feature (matches prior features' findings). Verification is manual, documented as a runnable
checklist in `quickstart.md` (wrangler dev + curl through history/mark-read/ownership-404, plus a
`curl -N` session against the SSE stream observed live against triggering events in a second
terminal).

**Target Platform**: Cloudflare Workers (backend API) + Cloudflare Pages (Public UI static
bundle)

**Project Type**: Web application — reuses the existing three-project split (`public-ui/`,
`admin-api/`, `admin-ui/`); this feature touches `admin-api/` and `public-ui/` only, no
`admin-ui/` changes required

**Performance Goals**: Hobby/self-hosted scale, consistent with the rest of the platform. The
3-second poll interval against a `(user_id, created_at)`-indexed query on a low-hundreds-of-rows
table is well within Cloudflare Workers' D1 free-tier read-request budget for a handful of
concurrently-open streams; SC-002's 10-second delivery-latency target is met with margin by a
3-second poll cadence.

**Constraints**: Must stay within Cloudflare free-tier limits; no Durable Objects (out of scope
per the task); a Workers invocation/stream cannot run forever, so the SSE connection MUST be
capped (5 minutes chosen — long enough to cover a typical active browsing session without an
awkward frequent reconnect, short enough to bound worst-case resource usage per connection) and
the client MUST reconnect after a close; browser `EventSource` cannot carry the `Authorization`
bearer header this codebase's auth model requires everywhere else, so the stream is consumed via
authenticated `fetch()` + manual `ReadableStream` parsing instead.

**Scale/Scope**: Single library's user base — realistically low hundreds of users, each with a
low number of concurrently open browser tabs/streams.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. `admin-api/` remains the single
  backend. This feature adds exactly the capability v1.3.0 explicitly anticipated in its public
  library surface definition ("...and reading their own notification stream/inbox"), via
  `requireAuth`-gated `/notifications` routes. No new project introduced; `admin-ui/` untouched.
- **Principle II (Static-First Public Delivery)** — PASS. The notification bell/panel ships inside
  the static Vite bundle; its only runtime behavior is client-side JS calling
  `GET /notifications`, `POST /notifications/:id/read`, and `GET /notifications/stream` — all
  within the public library surface v1.3.0 carves out. No admin-scoped endpoint is called from
  `public-ui/`.
- **Principle III (Token-Protected Admin Access)** — PASS/N/A. No admin-scoped endpoint is added;
  the new router is mounted under `requireAuth` (the same generic-user pattern as
  `routes/reservations.ts`), not `requireAdminToken`.
- **Principle IV (Standards-Based Identity & Registration)** — PASS/N/A. No new identity or
  credential handling; reuses the existing bearer-token verification (`requireAuth`) unchanged,
  including for the SSE endpoint (via `fetch()` + header, not a token-in-URL workaround).
- **Principle V (Progressive Environments)** — PASS. Ships against the single dev environment; no
  production environment work introduced.

No unresolved violations against the constitution's Core Principles.

## Project Structure

### Documentation (this feature)

```text
specs/006-notifications/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
admin-api/
├── src/
│   ├── routes/
│   │   └── notifications.ts        # new: GET /, POST /:id/read, GET /stream (requireAuth)
│   ├── services/
│   │   ├── notifications.ts        # new: createNotification, listNotificationsByUser,
│   │   │                           #      markRead, listNotificationsSince
│   │   └── reservations.ts         # + createNotification(...) calls in confirmReservation,
│   │                               #   forceReturn, confirmReturn
│   ├── index.ts                    # + app.route("/notifications", notificationsRoutes)
│   └── db/
│       └── migrations/
│           └── 0007_create_notifications.sql  # this feature's schema change
└── (no tests/ — none exist in this project yet)

public-ui/
├── index.html, login.html, register.html, catalog.html, profile.html
│                                    # each: + a nav mount point for the notification control
├── src/
│   ├── components/
│   │   └── notifications.ts        # new: bell/badge/panel, fetch+ReadableStream SSE client
│   ├── pages/
│   │   └── (home|login|register|catalog|profile).ts
│   │                                # each: + mountNotifications(...) call, mirroring the
│   │                                #   existing renderAuthStatus(...) call pattern
│   └── services/
│       └── notifications-client.ts # new: listNotifications, markNotificationRead,
│                                    #      openNotificationStream (auth fetch + SSE parser)
└── vite.config.ts                  # unchanged — no new HTML entry points, only nav edits
```

**Structure Decision**: Reuses the existing three-project split; only `admin-api/` and
`public-ui/` are touched. New backend capability gets its own route/service module pair (like
`books.ts`/`reservations.ts` before it), rather than being folded into `reservations.ts`, because
notifications are a distinct resource with their own ownership and lifecycle even though three of
their creation points live inside `reservations.ts`. The Public UI gets one new shared component
(`components/notifications.ts`) mounted identically from every existing page's entry script,
following the same "small shared component + explicit mount call per page" pattern already
established by `components/auth-status.ts` — no new HTML pages, so no `vite.config.ts` changes are
needed, only a nav mount point added to each existing `.html` file.

## Complexity Tracking

*No entries — no constitution violations. The one deliberate architectural tradeoff (DB-polling
SSE instead of true push, and a bounded connection lifetime) is a platform constraint explicitly
called out and pre-approved in the task's own framing, not a self-inflicted complexity choice, and
is documented in `research.md` rather than here.*
