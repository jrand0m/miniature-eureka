# Phase 1 Data Model: Book Catalog & Public Search

## Entity: Book

Represents a single title held by the library (FR-001, spec Key Entities).

| Field                | Type (D1/SQLite)   | Nullable | Constraints                                                   |
|----------------------|---------------------|----------|-----------------------------------------------------------------|
| `id`                 | `TEXT`              | No       | Primary key; UUID (`crypto.randomUUID()`), same convention as `users.id`. |
| `title`               | `TEXT`              | No       |                                                                  |
| `author`              | `TEXT`              | No       |                                                                  |
| `isbn`                | `TEXT`              | Yes      | No uniqueness constraint in this iteration (out of scope; a later feature may add one when catalog management ships). |
| `description`         | `TEXT`              | Yes      |                                                                  |
| `quantity_total`      | `INTEGER`           | No       | `CHECK (quantity_total >= 0)`                                   |
| `quantity_available`  | `INTEGER`           | No       | `CHECK (quantity_available >= 0 AND quantity_available <= quantity_total)` |
| `created_at`          | `TEXT`              | No       | ISO 8601 timestamp, same convention as `users.registered_at`.   |

No relationships to other entities are introduced by this feature (reservations/loans, which
would reference `Book`, are out of scope — later features).

### Validation rules (enforced at the DB layer via `CHECK` constraints, matching the `users` table's convention of `CHECK (role IN (...))` / `CHECK (enabled IN (0,1))`)

- `quantity_total >= 0`
- `quantity_available >= 0`
- `quantity_available <= quantity_total`

### State transitions

None in this feature — the catalog is read-only from every surface this feature adds (FR-010).
`quantity_available` will change over time once reservation/return features ship, but no write
path exists yet.

### API representation (camelCase, per research.md)

```jsonc
{
  "id": "b1f2c3d4-...",
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",       // or null
  "description": "...",           // or null
  "quantityTotal": 3,
  "quantityAvailable": 2,
  "createdAt": "2026-08-11T20:34:50.552Z"
}
```
