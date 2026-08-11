---

description: "Task list for Account Login, Registration & Admin User Management"
---

# Tasks: Account Login, Registration & Admin User Management

**Input**: Design documents from `/specs/001-auth-user-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md, quickstart.md

**Tests**: Not explicitly requested in spec.md; no test-writing tasks are included below. The
testing stack chosen in research.md (Vitest, `@cloudflare/vitest-pool-workers`, Playwright) is
available if tests are added later — see quickstart.md for the manual validation scenarios that
stand in for automated tests in this iteration.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's priorities)
to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes its exact file path, per plan.md's Project Structure

## Path Conventions

Three independently deployable projects at the repo root, per plan.md / Constitution Principle I:

- `admin-api/` — Cloudflare Worker (Hono), the single backend
- `public-ui/` — static site (Vite), Cloudflare Pages
- `admin-ui/` — static site (Vite), Cloudflare Pages

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the three projects so later phases have somewhere to add code.

- [X] T001 Create `public-ui/`, `admin-api/`, `admin-ui/` directories with the subtree from
      plan.md's Project Structure (empty `src/`, `tests/` folders in each)
- [X] T002 [P] Initialize `admin-api/` as a Cloudflare Workers project: `admin-api/package.json`,
      `admin-api/wrangler.toml` (with a D1 binding), `admin-api/tsconfig.json`, Hono as a
      dependency
- [X] T003 [P] Initialize `public-ui/` as a Vite project: `public-ui/package.json`,
      `public-ui/vite.config.ts`, `public-ui/tsconfig.json`
- [X] T004 [P] Initialize `admin-ui/` as a Vite project: `admin-ui/package.json`,
      `admin-ui/vite.config.ts`, `admin-ui/tsconfig.json`

**Checkpoint**: All three projects build (even if empty) before any feature code is added.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared backend building blocks every user story depends on (data model, crypto,
auth token handling, the seeded admin account).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Create the `users` table migration (per data-model.md: id, email, password_hash,
      password_salt, role, registered_at, last_login_at, enabled) in
      `admin-api/src/db/migrations/0001_create_users.sql`
- [X] T006 [P] Implement password hashing service (PBKDF2-HMAC-SHA256 via `crypto.subtle`,
      random per-user salt; `hashPassword`/`verifyPassword`) in
      `admin-api/src/services/password.ts`
- [X] T007 [P] Implement bearer token service (HMAC-signed payload with `sub`/`role`/`exp`,
      24h lifetime; `signToken`/`verifyToken`) in `admin-api/src/services/tokens.ts`
- [X] T008 Implement the User data-access service (`createUser`, `findByEmail`, `findById`,
      `listUsers`, `updateLastLogin`, `setEnabled`) in `admin-api/src/services/users.ts`
      (depends on T005)
- [X] T009 Set up the Hono app skeleton with a JSON error handler in `admin-api/src/index.ts`
      (depends on T002)
- [X] T010 Implement generic `require-auth` middleware (verifies the bearer token via T007,
      attaches the authenticated user to the request context) in
      `admin-api/src/middleware/require-auth.ts` (depends on T007)
- [X] T011 Seed the single hardcoded administrator account (`role = admin`) at first run in
      `admin-api/src/db/migrations/0002_seed_admin.sql` (depends on T005, T006) — per
      Constitution Principle III's documented bootstrap exception

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Self-Service Registration (Priority: P1) 🎯 MVP

**Goal**: A visitor can create an account with only an email and password, no confirmation step,
and is usable immediately; a second registration with the same email is rejected.

**Independent Test**: Submit a new email/password to `POST /auth/register` and confirm a token
is returned immediately; repeat with the same email and confirm a `409` with no duplicate
created.

### Implementation for User Story 1

- [X] T012 [US1] Implement `POST /auth/register` in `admin-api/src/routes/auth.ts`: validate
      body, reject duplicate email with `409 email_already_registered` (via T008), hash the
      password (via T006), create the user, issue a token (via T007), return `201`
- [X] T013 [US1] Wire the `/auth/register` route into the app router in
      `admin-api/src/index.ts` (depends on T012)
- [X] T014 [P] [US1] Build the registration form/page in `public-ui/src/pages/register.ts`
- [X] T015 [US1] Implement `register()` in `public-ui/src/services/auth-client.ts`, calling
      `POST /auth/register` and storing the returned token (depends on T014)
- [X] T016 [US1] Wire a successful registration to an immediately-authenticated state in the
      Public UI in `public-ui/src/pages/register.ts` (depends on T015)

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Login & Logout (Priority: P1)

**Goal**: Anyone with valid, enabled credentials (including the seeded administrator) can log in
and log out; wrong credentials get one generic error; a disabled account gets a distinct error.

**Independent Test**: Log in with the seeded administrator credentials, confirm a token is
returned and `last_login_at` updates, then log out and confirm a fresh login is required again.

### Implementation for User Story 2

- [X] T017 [US2] Implement `POST /auth/login` in `admin-api/src/routes/auth.ts`: verify password
      (via T006), reject non-matching credentials with a generic `401 invalid_credentials`,
      reject a matching-but-disabled account with `403 account_disabled`, update
      `last_login_at` (via T008), issue a token (via T007) (depends on T008, T006, T007)
- [X] T018 [US2] Implement `POST /auth/logout` in `admin-api/src/routes/auth.ts`, gated by the
      `require-auth` middleware, returning `204` (depends on T010)
- [X] T019 [US2] Wire `/auth/login` and `/auth/logout` into the app router in
      `admin-api/src/index.ts` (depends on T017, T018)
- [X] T020 [P] [US2] Build the login form/page in `public-ui/src/pages/login.ts`
- [X] T021 [US2] Implement `login()`/`logout()` in `public-ui/src/services/auth-client.ts`,
      storing/clearing the token (depends on T020)
- [X] T022 [US2] Add an authenticated-state view (logged-in indicator, logout action) in
      `public-ui/src/components/` (depends on T021)

**Checkpoint**: User Stories 1 and 2 both work independently — the full account lifecycle is
usable end-to-end via the Public UI, including the seeded administrator.

---

## Phase 5: User Story 3 - Administrator User Oversight (Priority: P2)

**Goal**: An administrator can see every account's registration date and last-login date, and
can disable/re-enable a specific account; disabling the sole administrator is prevented.

**Independent Test**: Log in as the administrator, view the user list, disable a test account,
confirm that account's next login is refused with `account_disabled`, then re-enable it and
confirm login succeeds again; confirm the administrator's own account cannot be disabled.

### Implementation for User Story 3

- [X] T023 [US3] Implement `require-admin-token` middleware (wraps `require-auth` from T010,
      additionally checks `role = admin`) in `admin-api/src/middleware/require-admin-token.ts`
      (depends on T010)
- [X] T024 [US3] Implement `GET /admin/users` in `admin-api/src/routes/users.ts`, returning each
      user's `id`, `email`, `role`, `registeredAt`, `lastLoginAt`, `enabled` (via T008),
      gated by T023 (depends on T008, T023)
- [X] T025 [US3] Implement `POST /admin/users/:id/disable` in `admin-api/src/routes/users.ts`:
      `404` if no such user, `409 cannot_disable_admin` if the target has `role = admin`,
      otherwise set `enabled = false` (via T008) (depends on T024)
- [X] T026 [US3] Implement `POST /admin/users/:id/enable` in `admin-api/src/routes/users.ts`,
      setting `enabled = true` (via T008) (depends on T024)
- [X] T027 [US3] Wire the `/admin/users` routes into the app router in `admin-api/src/index.ts`
      (depends on T025, T026)
- [X] T028 [P] [US3] Build the admin login page in `admin-ui/src/pages/login.ts`
- [X] T029 [P] [US3] Build the user list page (table with registration/last-login columns,
      disable/enable controls) in `admin-ui/src/pages/users.ts`
- [X] T030 [US3] Implement `admin-api-client` (`login`, `listUsers`, `disableUser`,
      `enableUser`) in `admin-ui/src/services/admin-api-client.ts` (depends on T028, T029)
- [X] T031 [US3] Wire disable/enable actions and list refresh in `admin-ui/src/pages/users.ts`
      (depends on T030)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Deployment plumbing and end-to-end validation that spans all three stories.

- [X] T032 [P] Configure CORS on the Admin API for the `public-ui` and `admin-ui` origins in
      `admin-api/src/index.ts` (pulled forward into Phase 5 to unblock browser-level testing of
      the Admin UI; origins are allow-listed via the `ALLOWED_ORIGINS` env var)
- [X] T033 [P] Add a GitHub Actions workflow to deploy `admin-api/` via Wrangler in
      `.github/workflows/admin-api-deploy.yml` (per Constitution's CI/CD requirement) — deploys
      via `cloudflare/wrangler-action`, applying D1 migrations remotely before the Worker deploy
- [X] T034 [P] Add a GitHub Actions workflow to build and deploy `public-ui/` to Cloudflare
      Pages in `.github/workflows/public-ui-deploy.yml` — builds with `VITE_ADMIN_API_BASE_URL`
      from a repo variable, deploys the static `dist/` via `wrangler pages deploy`
- [X] T035 [P] Add a GitHub Actions workflow to build and deploy `admin-ui/` to Cloudflare Pages
      in `.github/workflows/admin-ui-deploy.yml` (same pattern as T034)
- [X] T036 Run through all three quickstart.md scenarios end-to-end against the local dev
      environment — verified via curl against a real `wrangler dev` + local D1 instance:
      register/duplicate-reject, login (new user + seeded admin)/wrong-password/logout,
      admin list/disable/blocked-login/re-enable/re-allowed-login, and the
      cannot-disable-sole-admin guard. Both `public-ui` and `admin-ui` also build cleanly to
      pure static output via `npm run build`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T002 for T009) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational — no dependency on US1/US3, though it is
  most useful once US1 can create non-admin accounts to log in with
- **User Story 3 (Phase 5)**: Depends on Foundational; `require-admin-token` (T023) wraps the
  `require-auth` middleware built in Phase 2/US2 (T010) — no other dependency on US1/US2 code
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Parallel Opportunities

- T002, T003, T004 (Setup) run in parallel — different projects
- T006, T007 (Foundational) run in parallel — different files, no shared dependency
- Once Foundational is complete, US1 (Phase 3) and US2 (Phase 4) can be staffed in parallel;
  US3 (Phase 5) can start in parallel too but its middleware (T023) builds on T010 from
  Foundational, not on US1/US2 output
- T014 (US1), T020 (US2), T028 + T029 (US3) — frontend page tasks in each phase run in parallel
  with that phase's backend route tasks
- T032–T035 (Polish) run in parallel — independent workflow files

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement password hashing service in admin-api/src/services/password.ts"
Task: "Implement bearer token service in admin-api/src/services/tokens.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Build the admin login page in admin-ui/src/pages/login.ts"
Task: "Build the user list page in admin-ui/src/pages/users.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything else)
3. Complete Phase 3: User Story 1 (self-registration)
4. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
5. Note: User Story 1 alone lets people register but not yet log back in after leaving — Story 2
   is needed for a genuinely useful MVP demo; treat US1+US2 together as the practical MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → validate (quickstart Scenario 1) → registration works
3. Add User Story 2 → validate (quickstart Scenario 2) → full account lifecycle works (MVP demo)
4. Add User Story 3 → validate (quickstart Scenario 3) → admin oversight complete
5. Polish → CI/CD pipelines live, full quickstart re-run green

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels map each task to its spec.md user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before moving on
