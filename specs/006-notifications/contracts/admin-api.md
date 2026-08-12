# Contract: Admin API — Notifications Endpoints

Base backend for this feature (`admin-api/`). New resource, mounted at `/notifications`. Every
endpoint requires a valid bearer token belonging to any signed-in user (`requireAuth`) — same
posture as `/reservations`. All endpoints are scoped to the calling user's own notifications
(`c.get("user").sub`) — no endpoint accepts or exposes another user's notifications.

All request/response bodies are JSON except the stream endpoint, which is `text/event-stream`.

## GET /notifications

Returns the calling user's full notification history, most recent first.

**Response `200 OK`**:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "force_return_requested",
      "message": "Please return \"Dune\" soon — the library has requested an early return.",
      "relatedReservationId": "uuid-of-reservation",
      "createdAt": "2026-08-11T12:00:00.000Z",
      "readAt": null
    }
  ]
}
```
- `401 Unauthorized` — missing/invalid/expired token.

## POST /notifications/{id}/read

Marks one of the caller's own notifications as read.

**Response `200 OK`**:
```json
{
  "notification": {
    "id": "uuid",
    "type": "force_return_requested",
    "message": "Please return \"Dune\" soon — the library has requested an early return.",
    "relatedReservationId": "uuid-of-reservation",
    "createdAt": "2026-08-11T12:00:00.000Z",
    "readAt": "2026-08-11T12:05:00.000Z"
  }
}
```
- `401 Unauthorized` — missing/invalid/expired token.
- `404 Not Found` — no such notification, OR the notification belongs to a different user (these
  two cases are indistinguishable in the response, by design, mirroring
  `005-user-profile-return`'s `POST /reservations/:id/return-request`):
  `{ "error": "not_found" }`

## GET /notifications/stream

Opens a Server-Sent Events (`text/event-stream`) connection delivering the caller's own
notifications as they are created, for the lifetime of the connection.

**Must be called via `fetch()` with an explicit `Authorization` header — NOT the browser's native
`EventSource` API**, which cannot attach custom headers. See `research.md` §2.

- `401 Unauthorized` — missing/invalid/expired token (returned as a normal JSON error response,
  same as every other `requireAuth`-gated route, before the stream is opened).
- `200 OK`, `Content-Type: text/event-stream` — on success. Event framing:
  - `event: notification` events, one per new notification, `data:` payload identical in shape to
    one element of `GET /notifications`'s `notifications` array (JSON-encoded).
  - Periodic heartbeat: an SSE comment line (`: heartbeat`) approximately every 15 seconds,
    carrying no `data:` payload — clients MUST ignore lines with no `data:` field.
  - Polling cadence: the server checks for new notifications approximately every 3 seconds.
  - Maximum connection lifetime: approximately 5 minutes, after which the server closes the stream
    gracefully (no error event, just stream end). Clients MUST reconnect (a fresh `fetch()` call)
    to resume live delivery — see `research.md` §1 for why this bound exists and quickstart.md for
    how to observe it manually.

**Delivery ordering/completeness guarantee**: within one connection, notifications are delivered
in `(created_at, id)` order, each exactly once (research.md §3). Across a reconnect, the client is
expected to already hold its notification history (via `GET /notifications`, fetched on mount);
the stream's purpose is only to deliver what's new since the client started watching, not to
replace the history endpoint.
