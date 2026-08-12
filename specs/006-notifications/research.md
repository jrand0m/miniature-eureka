# Phase 0 Research: User Notifications (Inbox & Live Stream)

No item in Technical Context was left as `NEEDS CLARIFICATION` — this feature reuses the stack,
patterns, and conventions already established by `001-auth-user-management` through
`005-admin-loan-oversight`. The items below are the feature-specific decisions worth recording,
in particular the DB-polling SSE tradeoff called out in the task brief.

## 1. Live delivery: DB-polling SSE instead of true push

**Decision**: `GET /notifications/stream` is a `requireAuth`-gated Hono route implemented with
`streamSSE` from `hono/streaming`. Once connected, it loops for the connection's lifetime: every
3 seconds it queries `listNotificationsSince(db, userId, lastCreatedAt, lastId)` for anything the
caller owns created after the last item already emitted on this connection, writes each as an SSE
`data:` event (`event: notification`), and every 15 seconds (independent of whether new data was
found) writes an SSE comment (`: heartbeat`) to keep intermediary proxies/load balancers from
timing out an idle-looking connection. After 5 minutes of total connection lifetime, the handler
closes the stream gracefully (no error) and returns.

**Rationale**: Cloudflare Workers has no persistent in-memory process shared across requests, and
this repo has no Durable Objects (explicitly out of scope for this feature per the task brief) —
so there is no way to hold a live in-memory list of open connections and push to them from a
different request's handler, the way a long-running Node/Express server could. Polling D1 from
inside the same long-lived streaming request is the only mechanism available that still gives the
client a real "no manual re-polling needed" experience while connected, satisfying spec FR-008 and
SC-002 (updates reflected within 10 seconds — comfortably met by a 3-second poll cadence).

**Alternatives considered**:
- *True server push via Durable Objects* — the "correct" long-term architecture for this problem
  on Workers, but explicitly out of scope for this feature (no DO infrastructure exists in this
  repo yet, and introducing it is a repo-wide architectural decision bigger than one feature).
- *Client-side polling of `GET /notifications` on a timer, no SSE at all* — simpler, but does not
  meet the spec's explicit "without needing to manually re-poll" framing (User Story 2) as
  naturally; an SSE endpoint keeps the polling implementation detail entirely server-side and
  gives the client a single long-lived connection to reason about, matching the task brief's
  explicit instruction to use `streamSSE`.
- *No heartbeat* — rejected because idle SSE connections are commonly killed by intermediary
  proxies/load balancers within 30–60s of silence; a 15s heartbeat is comfortably inside that
  window with margin.
- *Unbounded connection lifetime* — rejected; Workers requests are not meant to run indefinitely,
  and an unbounded loop risks hitting platform CPU/duration limits unpredictably rather than
  closing on the implementer's own terms. 5 minutes is long enough to cover a typical active
  browsing session without a jarring, frequent reconnect cadence, while bounding the worst-case
  per-connection resource usage. This is a known, documented limitation: the Public UI client MUST
  reconnect after a close, which it does automatically (component-level retry loop).

## 2. Client-side auth: authenticated `fetch()` + manual SSE parsing, not `EventSource`

**Decision**: `public-ui/src/services/notifications-client.ts` opens the stream via
`fetch(url, { headers: { Authorization: \`Bearer ${token}\` } })`, then reads
`response.body!.getReader()`, decodes chunks with `TextDecoder`, buffers on a `\n\n` frame
boundary, and parses each frame's `data: ...` line(s) as one notification event (ignoring
`:`-prefixed heartbeat comment lines and any other non-`data:` SSE fields).

**Rationale**: The browser's native `EventSource` API has no mechanism to attach custom request
headers, so it cannot send `Authorization: Bearer ...` — the only auth mechanism this codebase
uses anywhere (see `requireAuth`, `auth-client.ts`'s `getToken()`/bearer pattern used by every
other Public UI service call). Using `fetch()` keeps this endpoint's auth model identical to every
other authenticated call in `public-ui/`, rather than introducing a one-off exception (e.g. a
token-in-query-string workaround, which would leak the bearer token into server logs/proxies and
break the "standards-based identity" posture of Constitution Principle IV).

**Alternatives considered**:
- `new EventSource(url)` with the token appended as a query parameter — rejected: leaks the bearer
  token into URLs (browser history, server access logs, Referer headers), which the constitution's
  standards-based-identity principle disfavors, and is explicitly called out as the wrong approach
  in the task brief.
- A cookie-based session instead of bearer tokens for this one endpoint — rejected: would require
  introducing a second auth mechanism alongside the bearer-token scheme used everywhere else in
  this codebase, solely to accommodate `EventSource`'s limitation; strictly worse than just not
  using `EventSource`.

## 3. Polling-since query correctness: tie-breaking on identical `created_at`

**Decision**: `listNotificationsSince(db, userId, sinceCreatedAt, sinceId)` orders by
`created_at ASC, id ASC` and filters with
`WHERE user_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))`, comparing UUID `id`
lexicographically as the tiebreaker. The stream handler tracks the `(created_at, id)` of the last
row it has emitted (initialized from the most recent row in history at connection-open time, if
any) and passes both into each poll.

**Rationale**: `created_at` is an ISO-8601 timestamp with millisecond resolution; two notifications
created in the same request-handling millisecond (e.g. if a future feature ever creates multiple
notifications in one write) would otherwise either both be skipped or both be repeatedly re-sent
by a naive `created_at > last` comparison. Composing the comparison with the row's `id` as a
tiebreaker guarantees each row is emitted exactly once, regardless of timestamp collisions,
without requiring a monotonic sequence column.

**Alternatives considered**: A separate auto-increment `seq` column — rejected as unnecessary
schema complexity; `id` (a UUID, per this codebase's `crypto.randomUUID()` convention used by
every other table) combined with `created_at` is sufficient for correct tie-breaking and avoids
introducing the first non-UUID primary/ordering key in the schema.

## 4. Notification message composition: point-in-time text, not a live join

**Decision**: `createNotification` is called with a fully-composed `message` string (the book
title already looked up via `findBookById` and interpolated) at the moment of the triggering
event, and the `notifications` table stores that literal string — it does not store a book/
reservation reference that's re-rendered at read time.

**Rationale**: Matches the Assumptions section of spec.md ("a notification's message text is
generated by the system at creation time... not recomputed later") and is the simplest correct
implementation — `listNotificationsByUser`/`listNotificationsSince` become plain
single-table reads with no join, keeping the polling query (run every 3 seconds per open
connection) cheap.

**Alternatives considered**: Storing only structured fields (`type`, `related_reservation_id`) and
rendering the message client-side or via a join at read time — rejected: more complex, requires
the polling query to join `reservations`/`books`, and contradicts the point-in-time semantics the
spec's Assumptions section already settled on.

## 5. Where the three notification-creation calls live

**Decision**: `createNotification(...)` calls are added directly inside
`confirmReservation`, `forceReturn`, and `confirmReturn` in `admin-api/src/services/reservations.ts`,
after each function's guarded status-transition `UPDATE` succeeds (i.e. only on the `"ok"` path),
using the already-loaded `existing`/`reservation` record for `userId`/`bookId` and a
`findBookById` lookup for the title.

**Rationale**: The task brief explicitly names these three call sites. Placing the call
immediately after each guarded transition succeeds (not before) ensures a notification is only
ever created for an event that actually happened — if the guarded `UPDATE` fails (409, or the
`confirmReservation` no-copies-available compensation path), no notification is created, matching
spec SC-001's "100% of the three defined events" framing (an event only counts once it has
actually occurred).

**Alternatives considered**: A generic "event bus"/observer pattern decoupling notification
creation from the reservation service — rejected as over-engineering for three call sites in a
small codebase with no existing event-dispatch infrastructure; direct calls match every other
cross-service call already in this file (e.g. `decrementQuantityAvailable`/
`incrementQuantityAvailable` calls from `books.ts`).
