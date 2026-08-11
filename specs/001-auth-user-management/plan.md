# Implementation Plan: Account Login, Registration & Admin User Management

**Branch**: `001-auth-user-management` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-user-management/spec.md`

## Summary

Add self-service email/password registration and login/logout for end users, backed by a
single pre-seeded administrator account, plus an Admin UI screen listing all accounts (with
registration date and last-login date) where an administrator can disable/re-enable a user's
login access. The Public UI remains a statically built and statically hosted site (Cloudflare
Pages); the only new runtime behavior is client-side JS in the browser calling a small set of
unauthenticated/authenticated endpoints on the backend API for register/login/logout and, for
administrators, user listing and disable/enable.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for the backend)

**Primary Dependencies**: Hono (Workers-native HTTP router) for the backend API; Vite for
building both static frontends; Web Crypto API (`crypto.subtle`) for password hashing and token
signing — no external crypto library needed

**Storage**: Cloudflare D1 (SQLite, free tier) — a single `users` table; no separate sessions
table (see research.md for the stateless-token decision)

**Testing**: Vitest with `@cloudflare/vitest-pool-workers` for the backend; Vitest + Testing
Library for frontend unit tests; Playwright for the end-to-end flows captured in quickstart.md

**Target Platform**: Cloudflare Workers (backend API) + Cloudflare Pages (both static
frontends)

**Project Type**: Web application — three independently deployable projects per the
constitution (public-ui, admin-api, admin-ui)

**Performance Goals**: Hobby/self-hosted scale — comfortably support low hundreds of
registered users and their occasional login traffic within Cloudflare's free-tier request and
D1 row-read/write quotas

**Constraints**: Must stay within Cloudflare free-tier limits (Workers requests/day, D1 storage
and rows read/written per day, Pages build minutes); no paid add-ons

**Scale/Scope**: Single library's user base — realistically tens to a few hundred accounts; one
administrator account for this iteration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. Three projects are used:
  `public-ui/`, `admin-api/`, `admin-ui/`. Per the constitution's explicit allowance (v1.1.0),
  the Admin API — the system's single backend — hosts the public, unauthenticated `/auth/*`
  endpoints (register/login/logout) alongside its token-protected `/admin/*` endpoints; this is
  one backend serving two audiences, not a new project, so the three-project structure is
  unchanged. The Admin UI still talks to the system exclusively through this API, and the Public
  UI calls no backend beyond this narrow account surface.
- **Principle II (Static-First Public Delivery)** — PASS. Per the constitution's explicit
  wording (v1.1.0), this principle constrains the hosting/build layer, not the browser: the
  Public UI's build output is finalized static HTML/JS served from Cloudflare Pages (no SSR, no
  server-rendered pages), and its shipped client-side JavaScript is permitted to call the Admin
  API's narrow public account surface at runtime — exactly `/auth/register`, `/auth/login`, and
  `/auth/logout`, and nothing beyond that. No page's initial HTML depends on a server render.
- **Principle III (Token-Protected Admin Access)** — PASS. `/admin/*` endpoints require a
  signed bearer token tied to the administrator account. `/auth/register` and `/auth/login` are
  intentionally unauthenticated (that is their purpose); `/auth/logout` requires the caller's own
  token. The single hardcoded administrator account is the documented bootstrap exception this
  principle already allows.
- **Principle IV (Standards-Based Identity & Registration)** — PASS. Passwords are hashed with
  PBKDF2-HMAC-SHA256 via the platform's native Web Crypto API (see research.md); tokens are
  HMAC-signed and expiring; Cloudflare terminates TLS so all traffic is HTTPS.
- **Principle V (Progressive Environments)** — PASS. This feature ships against the single dev
  environment; no production environment work is introduced.

No unresolved violations — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-user-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
public-ui/
├── src/
│   ├── pages/            # catalog pages (existing/out of scope) + login & register pages
│   ├── components/
│   └── services/
│       └── auth-client.ts   # calls admin-api's /auth/register, /auth/login, /auth/logout
└── tests/

admin-api/
├── src/
│   ├── routes/
│   │   ├── auth.ts       # POST /auth/register, /auth/login, /auth/logout
│   │   └── users.ts      # GET /admin/users, POST /admin/users/:id/disable|enable
│   ├── services/
│   │   ├── password.ts   # PBKDF2 hash + verify
│   │   ├── tokens.ts      # sign/verify bearer tokens
│   │   └── users.ts       # user CRUD against D1
│   ├── middleware/
│   │   └── require-admin-token.ts
│   └── db/
│       └── migrations/    # D1 schema for `users`
└── tests/
    ├── contract/
    └── integration/

admin-ui/
├── src/
│   ├── pages/
│   │   ├── login.ts
│   │   └── users.ts        # user list + disable/enable controls
│   ├── components/
│   └── services/
│       └── admin-api-client.ts
└── tests/
```

**Structure Decision**: Three independently deployable projects at the repo root
(`public-ui/`, `admin-api/`, `admin-ui/`), matching Constitution Principle I. `admin-api/` is the
single backend and now exposes both the public `/auth/*` endpoints used by `public-ui/` and the
token-gated `/admin/*` endpoints used by `admin-ui/`.

## Complexity Tracking

*No violations to justify — table intentionally omitted.*
