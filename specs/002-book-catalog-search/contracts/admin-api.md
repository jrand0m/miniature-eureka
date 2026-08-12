# Contract: Admin API — Book Catalog Endpoints

Base backend for this feature (`admin-api/`). Both endpoints below are part of the constitution's
public library surface: **fully unauthenticated** — no bearer token, no `Authorization` header,
no `requireAdminToken`/`requireAuth` gate. They are mounted at the API root (`/books`, `/books/:id`),
**not** under `/admin/*`.

All response bodies are JSON (`application/json`).

## GET /books

Public. Lists/searches the book catalog with offset-based pagination.

**Query parameters** (all optional):

| Param     | Type    | Default | Notes                                                                |
|-----------|---------|---------|-----------------------------------------------------------------------|
| `title`   | string  | —       | Case-insensitive partial (substring) match against `title`.           |
| `author`  | string  | —       | Case-insensitive partial (substring) match against `author`.          |
| `limit`   | integer | `20`    | Clamped to `[1, 100]`; values above 100 are silently clamped to 100, values below 1 (or non-numeric) fall back to the default. |
| `offset`  | integer | `0`     | Clamped to `>= 0`; negative or non-numeric values fall back to 0.     |

When both `title` and `author` are supplied, a book must match **both** (logical AND) to appear
in the results.

**Responses**:
- `200 OK`:
  ```json
  {
    "books": [
      {
        "id": "b1f2c3d4-...",
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "isbn": "9780743273565",
        "description": "...",
        "quantityTotal": 3,
        "quantityAvailable": 2,
        "createdAt": "2026-08-11T20:34:50.552Z"
      }
    ],
    "limit": 20,
    "offset": 0,
    "total": 1
  }
  ```
  `total` is the count of books matching the given `title`/`author` filters (before pagination is
  applied), so a client can compute whether more pages remain (`offset + books.length < total`).
  A search with no matches, or an `offset` beyond the last page, returns `"books": []` with `200
  OK` — never an error (Edge Cases).
- No error responses — all inputs are validated defensively (invalid `limit`/`offset` are
  clamped, not rejected); malformed query strings simply behave as if the parameter were absent.

## GET /books/:id

Public. Returns full detail for a single book.

**Responses**:
- `200 OK`:
  ```json
  {
    "id": "b1f2c3d4-...",
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "isbn": "9780743273565",
    "description": "...",
    "quantityTotal": 3,
    "quantityAvailable": 2,
    "createdAt": "2026-08-11T20:34:50.552Z"
  }
  ```
- `404 Not Found` — no book with that id: `{ "error": "not_found" }` (FR-006)
