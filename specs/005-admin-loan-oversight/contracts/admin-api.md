# Contract: Admin API — Loan Oversight Endpoints

Extends `specs/004-reservation-flow/contracts/admin-api.md`'s `/admin/reservations*` endpoints.
All endpoints below require a valid bearer token with `role = admin` (`requireAdminToken`), same
as the existing admin reservation endpoints.

All request/response bodies are JSON. All responses use `application/json` unless noted.

## GET /admin/reservations (extended)

Adds two new optional query params, `bookId` and `userId`, to the existing `status` param. All
three are combined via AND when multiple are supplied.

**Query params** (all optional):
- `status` — one of `pending`, `confirmed`, `checked_out`, `return_requested`, `returned`,
  `cancelled`. Invalid value → `400 { "error": "invalid_request" }` (unchanged from existing
  contract).
- `bookId` — an exact book id. No validation beyond "non-empty string"; a value that matches no
  book simply yields an empty list (not an error).
- `userId` — an exact user id. Same non-validation/empty-list behavior as `bookId`.

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
        "status": "checked_out",
        "requestedDate": "2026-09-01",
        "agreedDate": "2026-09-03",
        "checkedOutAt": "2026-09-03T09:00:00.000Z",
        "returnedAt": null,
        "forceReturnRequestedAt": null,
        "createdAt": "2026-08-11T12:00:00.000Z",
        "updatedAt": "2026-09-03T09:00:00.000Z"
      }
    ]
  }
  ```
  Note: `returnRequestedDate` (the sibling FEAT-04 member-return-request feature's field) is
  included in this shape only if that feature's column has already merged to `master` by the
  time this feature is implemented — see plan.md's note on the concurrent sibling feature. If not
  present at implementation time, this response omits it and this contract is implemented without
  it; a later merge reconciliation is expected to add it, not this feature.
- `400 Bad Request` — `status` present but not one of the six enum values:
  `{ "error": "invalid_request" }`
- `401`/`403` — as in the auth feature's contract

## POST /admin/reservations/{id}/confirm-return

Requires a valid bearer token with `role = admin`. Only valid when the reservation is currently
`checked_out` or `return_requested`. No request body required.

**Responses**:
- `200 OK`:
  ```json
  {
    "reservation": {
      "id": "uuid",
      "bookId": "uuid-of-book",
      "userId": "uuid-of-requester",
      "status": "returned",
      "requestedDate": "2026-09-01",
      "agreedDate": "2026-09-03",
      "checkedOutAt": "2026-09-03T09:00:00.000Z",
      "returnedAt": "2026-09-10T14:00:00.000Z",
      "forceReturnRequestedAt": null,
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-09-10T14:00:00.000Z"
    }
  }
  ```
- `404 Not Found` — no such reservation: `{ "error": "not_found" }`
- `409 Conflict` — reservation is not currently `checked_out` or `return_requested`:
  `{ "error": "invalid_status_transition" }`
- `401`/`403` — as above

## POST /admin/reservations/{id}/force-return

Requires a valid bearer token with `role = admin`. Only valid when the reservation is currently
`checked_out` or `confirmed`. Does not change `status`. Idempotent: calling it again on an
already-flagged reservation succeeds and updates the timestamp. No request body required.

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
      "forceReturnRequestedAt": "2026-09-05T10:00:00.000Z",
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-09-05T10:00:00.000Z"
    }
  }
  ```
- `404 Not Found` — no such reservation: `{ "error": "not_found" }`
- `409 Conflict` — reservation is not currently `checked_out` or `confirmed`:
  `{ "error": "invalid_status_transition" }`
- `401`/`403` — as above

## Serialization note (all `/reservations*` responses)

Both `serializeReservation`/`serializeAdminReservation` in `admin-api/src/routes/admin-reservations.ts`
and the equivalent serializer in `admin-api/src/routes/reservations.ts` (the member-facing
endpoint) are updated to include `forceReturnRequestedAt` in every reservation object they
return, not just the two new endpoints above — so an admin or a member can see the flag's state
on any reservation, including via the plain `GET /admin/reservations` and `GET /reservations`
list endpoints.
