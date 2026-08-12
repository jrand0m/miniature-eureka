# Contract: Admin API — Return Request Endpoint

Base backend for this feature (`admin-api/`). Extends the existing `/reservations` contract from
`004-reservation-flow` (see `specs/004-reservation-flow/contracts/admin-api.md`) with one new
endpoint. Requires a valid bearer token belonging to any signed-in user (`requireAuth`) — same
posture as `POST /reservations` and `GET /reservations`.

All request/response bodies are JSON. Dates (`preferredReturnDate`, and the existing
`requestedDate`/`agreedDate`) are date-only ISO 8601 strings (`YYYY-MM-DD`).

## POST /reservations/{id}/return-request

Requires a valid bearer token (any role). Only the reservation's own owner (`user_id` matching
the caller's token subject) may call this. Only valid when the reservation is currently
`checked_out`.

**Request body**:
```json
{ "preferredReturnDate": "2026-09-10" }
```

**Responses**:
- `200 OK`:
  ```json
  {
    "reservation": {
      "id": "uuid",
      "bookId": "uuid-of-book",
      "userId": "uuid-of-caller",
      "status": "return_requested",
      "requestedDate": "2026-09-01",
      "agreedDate": "2026-09-03",
      "checkedOutAt": "2026-09-03T09:00:00.000Z",
      "returnedAt": null,
      "createdAt": "2026-08-11T12:00:00.000Z",
      "updatedAt": "2026-09-05T10:00:00.000Z"
    }
  }
  ```
  Note: `returnRequestedDate` is intentionally not added to the serialized response shape — the
  existing per-reservation JSON shape used by `POST /reservations` and `GET /reservations` is
  reused unchanged (see Complexity Tracking-equivalent note in plan.md; the field exists in the
  database for the admin/notification surfaces this schema space was reserved for, but this
  feature's own UI only needs the `status` transition to reflect the request, matching what the
  brief's exact response shape enumerates).
- `400 Bad Request` — missing/empty `preferredReturnDate`: `{ "error": "invalid_request" }`
- `401 Unauthorized` — missing/invalid/expired token
- `404 Not Found` — no such reservation, OR the reservation belongs to a different user (these
  two cases are indistinguishable in the response, by design): `{ "error": "not_found" }`
- `409 Conflict` — reservation exists and is owned by the caller, but is not currently
  `checked_out`: `{ "error": "invalid_status_transition" }`
