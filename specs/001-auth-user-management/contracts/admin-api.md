# Contract: Admin API — Auth & User Management Endpoints

Base backend for this feature (`admin-api/`). Endpoints under `/auth/*` are intentionally
unauthenticated (that is their purpose); endpoints under `/admin/*` require a valid bearer token
belonging to the `admin` role.

All request/response bodies are JSON. All responses use `application/json` unless noted.

## POST /auth/register

Public. Creates a new standard-user account.

**Request body**:
```json
{ "email": "person@example.com", "password": "plaintext-in-transit-over-https" }
```

**Responses**:
- `201 Created` — `{ "token": "<bearer token>", "userId": "<uuid>" }` (registration logs the
  user in immediately, per spec Assumptions)
- `409 Conflict` — email already registered: `{ "error": "email_already_registered" }`
- `400 Bad Request` — missing/malformed email or password: `{ "error": "invalid_request" }`

## POST /auth/login

Public. Authenticates an existing account.

**Request body**:
```json
{ "email": "person@example.com", "password": "..." }
```

**Responses**:
- `200 OK` — `{ "token": "<bearer token>" }`
- `401 Unauthorized` — email/password combination doesn't match any account:
  `{ "error": "invalid_credentials" }` (generic — never indicates which field was wrong, per
  FR-007)
- `403 Forbidden` — credentials are correct but the account is disabled:
  `{ "error": "account_disabled" }` (distinct message, per Edge Cases)

## POST /auth/logout

Requires a valid bearer token (any role). Client-side no-op on the server beyond returning
success — see research.md §4 for why no server-side revocation exists yet.

**Responses**:
- `204 No Content`

## GET /admin/users

Requires a valid bearer token with `role = admin`.

**Responses**:
- `200 OK`:
  ```json
  {
    "users": [
      {
        "id": "uuid",
        "email": "person@example.com",
        "role": "user",
        "registeredAt": "2026-08-11T12:00:00Z",
        "lastLoginAt": null,
        "enabled": true
      }
    ]
  }
  ```
- `401 Unauthorized` — missing/invalid/expired token
- `403 Forbidden` — token is valid but not an admin token

## POST /admin/users/{id}/disable

Requires a valid bearer token with `role = admin`.

**Responses**:
- `204 No Content` — account disabled
- `404 Not Found` — no such user
- `409 Conflict` — target is the sole administrator account: `{ "error": "cannot_disable_admin" }`
  (FR-013)
- `401`/`403` — as above

## POST /admin/users/{id}/enable

Requires a valid bearer token with `role = admin`.

**Responses**:
- `204 No Content` — account re-enabled
- `404 Not Found` — no such user
- `401`/`403` — as above
