# Phase 1 Data Model: Admin Book Catalog & Inventory Management

## Entity: Book

Reuses, unchanged, the `Book` entity and `books` D1 table established by feature
002-book-catalog-search (`admin-api/src/db/migrations/0003_create_books.sql`). This feature adds
no new columns, tables, or migrations — it is the first (and, until a reservation/loan feature
ships, only) feature that writes to this table.

| Field                | Type (D1/SQLite)   | Nullable | Constraints                                                   |
|-----------------------|---------------------|----------|-----------------------------------------------------------------|
| `id`                  | `TEXT`              | No       | Primary key; UUID (`crypto.randomUUID()`), same convention as `users.id`. |
| `title`               | `TEXT`              | No       | Required on create; editable via `PATCH`.                       |
| `author`              | `TEXT`              | No       | Required on create; editable via `PATCH`.                       |
| `isbn`                | `TEXT`              | Yes      | Optional on create; editable via `PATCH`. No uniqueness constraint. |
| `description`         | `TEXT`              | Yes      | Optional on create; editable via `PATCH`.                        |
| `quantity_total`      | `INTEGER`           | No       | `CHECK (quantity_total >= 0)`. Set on create; changed only via the quantity-adjustment endpoint (never via `PATCH`). |
| `quantity_available`  | `INTEGER`           | No       | `CHECK (quantity_available >= 0 AND quantity_available <= quantity_total)`. Set equal to `quantity_total` on create; changed only via the quantity-adjustment endpoint. |
| `created_at`          | `TEXT`              | No       | ISO 8601 timestamp, same convention as `users.registered_at`. Set once, on create; never modified. |

### Validation rules

Enforced at the application layer (for a clean, typed 4xx response) and backstopped by the
existing table `CHECK` constraints:

- **Create** (`POST /admin/books`): `title` and `author` required, non-empty after trimming;
  `quantity_total` required, integer, `>= 0`. `quantity_available` is derived — always set equal
  to `quantity_total` at creation time (FR-003) — never accepted as client input.
- **Edit** (`PATCH /admin/books/:id`): any of `title`/`author`/`isbn`/`description` may be
  supplied; `quantity_total`/`quantity_available` are rejected/ignored if present in the request
  body (they are not this endpoint's concern — FR-004). A request with none of the editable
  fields present is a valid no-op (Edge Cases).
- **Quantity adjustment** (`POST /admin/books/:id/quantity`): `delta` required, a non-zero-or-zero
  integer (any integer, including 0, is valid — Edge Cases). If `delta > 0`:
  `quantity_total += delta`, `quantity_available += delta` (FR-007). If `delta < 0`: computed
  `new_available = quantity_available + delta`; if `new_available < 0`, the whole operation is
  rejected (409) and no columns change (FR-008); otherwise `quantity_total += delta`,
  `quantity_available += delta` (both `delta`, i.e. both decrease by `|delta|`).
- **Delete** (`DELETE /admin/books/:id`): allowed only when `quantity_available ==
  quantity_total`; otherwise rejected (409) and the row is untouched (FR-010, per
  research.md's delete-blocking decision).

### State transitions

```text
[create] --> Book{quantity_available == quantity_total == N}
Book --edit (title/author/isbn/description)--> Book{same quantities}
Book --quantity delta +K--> Book{quantity_total+K, quantity_available+K}
Book --quantity delta -K (if quantity_available-K >= 0)--> Book{quantity_total-K, quantity_available-K}
Book --quantity delta -K (if quantity_available-K < 0)--> [rejected, unchanged]
Book --delete (if quantity_available == quantity_total)--> [removed]
Book --delete (if quantity_available < quantity_total)--> [rejected, unchanged]
```

### API representation (camelCase, unchanged from feature 002)

Success responses for create/edit/quantity-adjust return the full updated book:

```jsonc
{
  "id": "b1f2c3d4-...",
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",       // or null
  "description": "...",           // or null
  "quantityTotal": 5,
  "quantityAvailable": 5,
  "createdAt": "2026-08-11T20:34:50.552Z"
}
```
