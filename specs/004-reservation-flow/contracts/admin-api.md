# Contract: Admin API — Reservation Endpoints

Base backend for this feature (`admin-api/`). Endpoints under `/reservations` require a valid
bearer token belonging to any signed-in user (`requireAuth`). Endpoints under
`/admin/reservations*` require a valid bearer token belonging to the `admin` role
(`requireAdminToken`).

All request/response bodies are JSON. All responses use `application/json` unless noted.
Dates (`requestedDate`, `agreedDate`) are date-only ISO 8601 strings (`YYYY-MM-DD`).

## POST /reservations

Requires a valid bearer token (any role). Creates a `pending` reservation for the caller.

**Request body**:
```json
{ "bookId": "uuid-of-book", "requestedDate": "2026-09-01" }
```

**Responses**:
- `201 Created`:
  ```json
  {
    "reservation": {
      "id": "uuid",
      "bookId": "uuid-of-book",
      "userId": "uuid-of-caller",
      "status": "pending",
      "requestedDate": "2026-09-01",
      "agreedDate": null,
      "checkedOutAt": null,
      "returnedAt": null,
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-08-11T12:00:00.000Z"
    }
  }
  ```
- `400 Bad Request` — missing/malformed `bookId` or `requestedDate`:
  `{ "error": "invalid_request" }`
- `401 Unauthorized` — missing/invalid/expired token
- `404 Not Found` — no book with that id: `{ "error": "book_not_found" }`
- `409 Conflict` — book has zero copies available:
  `{ "error": "no_copies_available" }` (soft check — re-verified at confirm time)

## GET /reservations

Requires a valid bearer token (any role). Returns only the caller's own reservations.

**Responses**:
- `200 OK`:
  ```json
  {
    "reservations": [
      {
        "id": "uuid",
        "bookId": "uuid-of-book",
        "userId": "uuid-of-caller",
        "status": "pending",
        "requestedDate": "2026-09-01",
        "agreedDate": null,
        "checkedOutAt": null,
        "returnedAt": null,
        "createdAt": "2026-08-11T12:00:00.000Z",
        "updatedAt": "2026-08-11T12:00:00.000Z"
      }
    ]
  }
  ```
- `401 Unauthorized` — missing/invalid/expired token

## GET /admin/reservations

Requires a valid bearer token with `role = admin`. Optional `?status=` query param, one of
`pending`, `confirmed`, `checked_out`, `return_requested`, `returned`, `cancelled`.

**Responses**:
- `200 OK`:
  ```json
  {
    "reservations": [
      {
        "id": "uuid",
        "bookId": "uuid-of-book",
        "bookTitle": "Some Title",
        "bookAuthor": "Some Author",
        "userId": "uuid-of-requester",
        "userEmail": "person@example.com",
        "status": "pending",
        "requestedDate": "2026-09-01",
        "agreedDate": null,
        "checkedOutAt": null,
        "returnedAt": null,
        "createdAt": "2026-08-11T12:00:00.000Z",
        "updatedAt": "2026-08-11T12:00:00.000Z"
      }
    ]
  }
  ```
- `400 Bad Request` — `status` present but not one of the six enum values:
  `{ "error": "invalid_request" }`
- `401`/`403` — as in the auth feature's contract

## POST /admin/reservations/{id}/confirm

Requires a valid bearer token with `role = admin`. Only valid when the reservation is currently
`pending`.

**Request body**:
```json
{ "agreedDate": "2026-09-03" }
```

**Responses**:
- `200 OK`:
  ```json
  {
    "reservation": {
      "id": "uuid",
      "bookId": "uuid-of-book",
      "userId": "uuid-of-requester",
      "status": "confirmed",
      "requestedDate": "2026-09-01",
      "agreedDate": "2026-09-03",
      "checkedOutAt": null,
      "returnedAt": null,
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-08-11T12:05:00.000Z"
    }
  }
  ```
- `400 Bad Request` — missing/malformed `agreedDate`: `{ "error": "invalid_request" }`
- `404 Not Found` — no such reservation: `{ "error": "not_found" }`
- `409 Conflict` — reservation is not currently `pending`:
  `{ "error": "invalid_status_transition" }`
- `409 Conflict` — book has zero copies available at confirm time:
  `{ "error": "no_copies_available" }`
- `401`/`403` — as above

## POST /admin/reservations/{id}/check-out

Requires a valid bearer token with `role = admin`. Only valid when the reservation is currently
`confirmed`. No request body required.

**Responses**:
- `200 OK`:
  ```json
  {
    "reservation": {
      "id": "uuid",
      "bookId": "uuid-of-book",
      "userId": "uuid-of-requester",
      "status": "checked_out",
      "requestedDate": "2026-09-01",
      "agreedDate": "2026-09-03",
      "checkedOutAt": "2026-09-03T09:00:00.000Z",
      "returnedAt": null,
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-09-03T09:00:00.000Z"
    }
  }
  ```
- `404 Not Found` — no such reservation: `{ "error": "not_found" }`
- `409 Conflict` — reservation is not currently `confirmed`:
  `{ "error": "invalid_status_transition" }`
- `401`/`403` — as above

---

## Provisional: GET /books, GET /books/:id

**Not this feature's deliverable** — a minimal, unauthenticated stand-in for the
concurrently-developed book-catalog feature (see plan.md Complexity Tracking), built only so
this feature can be runtime-verified end-to-end. Expected to be superseded by the sibling
feature's real contract when PRs merge.

- `GET /books` → `200 OK` `{ "books": [{ "id", "title", "author", "isbn", "description", "quantityTotal", "quantityAvailable" }] }`
- `GET /books/{id}` → `200 OK` `{ "book": { ...same shape } }` or `404 Not Found` `{ "error": "not_found" }`
