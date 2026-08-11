# Contract: Admin API — Admin Book Management Endpoints

Base backend for this feature (`admin-api/`). All four endpoints below are mounted under
`/admin/books` and require a valid administrator bearer token, exactly like `/admin/users`
(`requireAdminToken` — `Authorization: Bearer <token>`, 401 if missing/invalid, 403 if the token
belongs to a non-admin account). None of these endpoints are part of the public library surface.

All request/response bodies are JSON (`application/json`).

## POST /admin/books

Admin-only. Creates a new book. `quantityAvailable` is always set equal to `quantityTotal` at
creation (FR-003) — the request does not accept `quantityAvailable`.

**Request body**:

```json
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",
  "description": "A novel set in the Jazz Age.",
  "quantityTotal": 3
}
```

| Field           | Type    | Required | Notes                                                      |
|-----------------|---------|----------|-------------------------------------------------------------|
| `title`         | string  | Yes      | Non-empty after trimming.                                   |
| `author`        | string  | Yes      | Non-empty after trimming.                                   |
| `isbn`          | string  | No       | Omit or `null` for no ISBN.                                  |
| `description`   | string  | No       | Omit or `null` for no description.                           |
| `quantityTotal` | integer | Yes      | `>= 0`.                                                      |

**Responses**:
- `201 Created` — full book record (see [data-model.md](./data-model.md#api-representation-camelcase-unchanged-from-feature-002)):
  ```json
  {
    "id": "b1f2c3d4-...",
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "isbn": "9780743273565",
    "description": "A novel set in the Jazz Age.",
    "quantityTotal": 3,
    "quantityAvailable": 3,
    "createdAt": "2026-08-11T20:34:50.552Z"
  }
  ```
- `400 Bad Request` — `{ "error": "invalid_request" }` when `title`/`author` is missing/empty, or
  `quantityTotal` is missing, not an integer, or negative (FR-002).

## PATCH /admin/books/:id

Admin-only. Edits `title`/`author`/`isbn`/`description` only — never quantities (FR-004). Any
subset of these fields may be supplied; omitted fields are left unchanged. A body with none of
these fields is a valid no-op (Edge Cases).

**Request body** (all fields optional; at least conceptually a partial update):

```json
{
  "title": "The Great Gatsby (Corrected)",
  "isbn": "9780743273565"
}
```

**Responses**:
- `200 OK` — the full, updated book record (same shape as `POST /admin/books`'s `201`).
- `404 Not Found` — `{ "error": "not_found" }` when no book exists with that id (FR-005).
- `400 Bad Request` — `{ "error": "invalid_request" }` when a supplied `title`/`author` would be
  empty after trimming.

## DELETE /admin/books/:id

Admin-only. Removes a book, but only when all of its copies are currently available (none
checked out) — `quantityAvailable == quantityTotal`. See research.md's delete-blocking decision.

**Responses**:
- `204 No Content` — book removed.
- `404 Not Found` — `{ "error": "not_found" }` when no book exists with that id (FR-011).
- `409 Conflict` — `{ "error": "copies_unavailable" }` when `quantityAvailable < quantityTotal`
  (some copies are currently checked out); the book is left unchanged (FR-010).

## POST /admin/books/:id/quantity

Admin-only. Adjusts inventory by a signed delta applied to `quantityTotal`, mirrored onto
`quantityAvailable` (FR-006, FR-007, FR-008).

**Request body**:

```json
{ "delta": 5 }
```

```json
{ "delta": -2 }
```

| Field   | Type    | Required | Notes                                                                 |
|---------|---------|----------|------------------------------------------------------------------------|
| `delta` | integer | Yes      | Any integer, including `0` (valid no-op — Edge Cases). Positive adds copies, negative removes copies. |

**Responses**:
- `200 OK` — the full, updated book record (same shape as `POST /admin/books`'s `201`):
  ```json
  {
    "id": "b1f2c3d4-...",
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "isbn": "9780743273565",
    "description": "A novel set in the Jazz Age.",
    "quantityTotal": 5,
    "quantityAvailable": 5,
    "createdAt": "2026-08-11T20:34:50.552Z"
  }
  ```
- `400 Bad Request` — `{ "error": "invalid_request" }` when `delta` is missing or not an integer.
- `404 Not Found` — `{ "error": "not_found" }` when no book exists with that id (FR-009).
- `409 Conflict` — `{ "error": "insufficient_quantity" }` when applying a negative `delta` would
  take `quantityAvailable` below zero; the book is left completely unchanged (FR-008).
