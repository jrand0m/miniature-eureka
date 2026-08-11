# Quickstart: Account Login, Registration & Admin User Management

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md). Assumes the single shared dev environment (Constitution Principle V).

## Prerequisites

- `admin-api/` running locally via `wrangler dev` with a local D1 database migrated using the
  schema in [data-model.md](./data-model.md).
- `public-ui/` and `admin-ui/` running locally via their Vite dev servers, each pointed at the
  local `admin-api/` URL.
- The seeded administrator account exists (see data-model.md — the single `role = admin` row,
  bootstrapped per Constitution Principle III).

## Scenario 1 — Self-service registration (User Story 1)

1. In `public-ui/`, submit the registration form with a new email + password.
2. Expect: immediate logged-in state (no confirmation step) — see contract
   `POST /auth/register` in [contracts/admin-api.md](./contracts/admin-api.md).
3. Repeat step 1 with the same email.
4. Expect: registration rejected, no duplicate account (`409`, `email_already_registered`).

## Scenario 2 — Login & logout (User Story 2)

1. Log in using the seeded administrator credentials via the login form.
2. Expect: access granted; a bearer token is issued (`POST /auth/login`).
3. Log out.
4. Expect: session ends; accessing an authenticated page again requires login.
5. Attempt login with a valid email and a wrong password.
6. Expect: a single generic failure message (`invalid_credentials`), not a hint about which
   field was wrong.

## Scenario 3 — Admin user oversight (User Story 3)

1. Log in as the administrator; open the Admin UI's user list (`GET /admin/users`).
2. Expect: every registered account is listed with its registration date and last-login date
   (or an explicit "never" indicator for the account from Scenario 1, before it ever logs in
   again).
3. Disable the test user created in Scenario 1 (`POST /admin/users/{id}/disable`).
4. In `public-ui/`, attempt to log in as that user.
5. Expect: refused with the distinct `account_disabled` message, not the generic
   `invalid_credentials` message.
6. Re-enable the same user (`POST /admin/users/{id}/enable`); repeat the login.
7. Expect: login succeeds again.
8. Attempt to disable the seeded administrator account itself.
9. Expect: refused (`409`, `cannot_disable_admin`) — the system is never left without a usable
   administrator.

## Success criteria mapping

Each scenario above corresponds to a measurable outcome in spec.md's Success Criteria
(SC-001 through SC-005) — a passing run of all three scenarios is evidence the feature meets
them.
