# Phase 1 Data Model: Account Login, Registration & Admin User Management

## User

Represents one account — the sole administrator or a self-registered end user.

| Field | Type | Notes |
|---|---|---|
| `id` | text (UUID) | Primary key |
| `email` | text | Unique (case-insensitive); required for registration and login |
| `password_hash` | text | PBKDF2-HMAC-SHA256 output, base64/hex-encoded |
| `password_salt` | text | Random per-user salt, base64/hex-encoded |
| `role` | text enum: `admin` \| `user` | Exactly one row has `role = admin` (seeded at first run) |
| `registered_at` | datetime | Set once, at creation |
| `last_login_at` | datetime, nullable | `NULL` until the first successful login; updated on every successful login |
| `enabled` | boolean | Defaults to `true`; administrator toggles this via disable/enable |

**Validation rules** (from spec Functional Requirements):
- `email` MUST be unique — a second registration attempt with an existing email is rejected
  (FR-004).
- `password_hash`/`password_salt` are never exposed by any API response (FR-014).
- Exactly one `admin` row must exist at all times — disabling logic MUST refuse to set
  `enabled = false` on the row where `role = admin` (FR-013).
- Login MUST be refused (generic message) when credentials don't match a row, and refused with
  a distinct "account disabled" message when credentials match a row with `enabled = false`
  (FR-007, Edge Cases).

**State transitions**:

```text
[no account] --register--> enabled=true, role=user, registered_at=now, last_login_at=NULL
enabled=true --admin disables--> enabled=false      (blocked if role=admin)
enabled=false --admin enables--> enabled=true
(any enabled account) --successful login--> last_login_at=now
```

## Auth Token (conceptual — not a stored entity)

Not persisted; described here because it carries the same fields other systems might store in a
sessions table.

| Claim | Type | Notes |
|---|---|---|
| `sub` | text | The `User.id` this token authenticates |
| `role` | text enum: `admin` \| `user` | Copied from `User.role` at issuance, used to gate `/admin/*` |
| `exp` | datetime | Issued-at + 24 hours (see research.md §4) |

The token is the concatenation of this payload and an HMAC-SHA256 signature over it, both
base64url-encoded; the Admin API verifies the signature and `exp` on every authenticated
request. Logout is a client-side action (discard the token); see research.md §4 for why no
server-side revocation exists in this iteration.
