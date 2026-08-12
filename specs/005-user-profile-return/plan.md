# Implementation Plan: User Profile & Return Request

**Branch**: `005-user-profile-return` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-user-profile-return/spec.md`

## Summary

Give a signed-in Public UI user a profile page listing their own reservations and their
statuses, plus a self-service "request a return" action for any reservation currently
`checked_out`. Backend: a new nullable `return_requested_date` column on the existing
`reservations` table (migration `0005_add_return_requested_date.sql`) and a new
`POST /reservations/:id/return-request` endpoint (owner-only, `requireAuth`) added to the
existing `routes/reservations.ts` + `services/reservations.ts`, following the exact
guarded-update, error-shape, and 404-vs-409 conventions the `004-reservation-flow` feature
established for `confirmReservation`/`checkOutReservation`. Frontend: a new `profile.html` +
`src/pages/profile.ts` page in `public-ui/`, following the `catalog.html`/`catalog.ts` pattern,
authenticated-only, listing `GET /reservations` results and offering "Request Return" only on
`checked_out` rows.

**Note on concurrent sibling feature**: another agent is concurrently building admin loan
oversight + forced return (FEAT-05) in a separate worktree off the same base commit, and is
expected to also add functions to `admin-api/src/services/reservations.ts`. This plan only adds
a new function (`requestReturn`) to that file and does not modify or remove anything already
there; reconciliation with the sibling's additions is expected at merge time and is out of scope
for this plan.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for
the backend)

**Primary Dependencies**: Hono (Workers-native HTTP router) for the backend API; Vite for
building the Public UI static bundle; native D1 bindings (`wrangler d1`) for migrations — no
ORM, matching the existing services' raw-SQL pattern

**Storage**: Cloudflare D1 (SQLite, free tier) — extends the existing `reservations` table
(migration `0005_add_return_requested_date.sql`, adding one nullable `TEXT` column); no new
table

**Testing**: No test framework/harness exists in `admin-api/` or `public-ui/` at the time of
this feature (matches prior features' findings). Verification is manual, documented as a
runnable checklist in `quickstart.md` (wrangler dev + curl through the full state machine,
including the 404-for-other-user and 409-invalid-status cases).

**Target Platform**: Cloudflare Workers (backend API) + Cloudflare Pages (Public UI static
bundle)

**Project Type**: Web application — reuses the existing three-project split
(`public-ui/`, `admin-api/`, `admin-ui/`); this feature touches `admin-api/` and `public-ui/`
only, no `admin-ui/` changes required

**Performance Goals**: Hobby/self-hosted scale, consistent with the rest of the platform —
comfortably support low hundreds of users within Cloudflare's free-tier request and D1
row-read/write quotas

**Constraints**: Must stay within Cloudflare free-tier limits; the new column is nullable and
added via `ALTER TABLE ... ADD COLUMN`, which SQLite/D1 supports in place (no table rebuild
needed, unlike a `CHECK` constraint change)

**Scale/Scope**: Single library's reservation queue — realistically low hundreds of
reservations across tens to a few hundred users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. `admin-api/` remains the
  single backend. This feature adds to its public library surface, explicitly anticipated by
  v1.3.0 ("authenticated end-user endpoints gated by the `requireAuth` pattern... requesting
  returns"), via `POST /reservations/:id/return-request`. No new project introduced; `admin-ui/`
  untouched.
- **Principle II (Static-First Public Delivery)** — PASS. The new profile page is built into the
  static Vite bundle; its only runtime behavior is client-side JS calling `GET /reservations`
  and `POST /reservations/:id/return-request`, both within the public library surface v1.3.0
  carves out. No admin-scoped endpoint is called from `public-ui/`.
- **Principle III (Token-Protected Admin Access)** — PASS/N/A. This feature adds no admin-scoped
  endpoint; the new route is mounted under the existing `requireAuth`-gated `reservationsRoutes`
  router, not `requireAdminToken`.
- **Principle IV (Standards-Based Identity & Registration)** — PASS/N/A. No new identity or
  credential handling; reuses the existing token verification (`requireAuth`) unchanged.
- **Principle V (Progressive Environments)** — PASS. Ships against the single dev environment; no
  production environment work introduced.

No unresolved violations against the constitution's Core Principles.

## Project Structure

### Documentation (this feature)

```text
specs/005-user-profile-return/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
admin-api/
├── src/
│   ├── routes/
│   │   └── reservations.ts        # + POST /reservations/:id/return-request (requireAuth)
│   ├── services/
│   │   └── reservations.ts        # + requestReturn(db, id, userId, preferredReturnDate)
│   └── db/
│       └── migrations/
│           └── 0005_add_return_requested_date.sql  # this feature's schema change
└── (no tests/ — none exist in this project yet)

public-ui/
├── profile.html                    # new page shell (nav + containers), mirrors catalog.html
├── src/
│   ├── pages/
│   │   └── profile.ts              # new: list own reservations, Request Return action
│   └── services/
│       └── reservations-client.ts  # + requestReturn(id, preferredReturnDate)
└── vite.config.ts                  # + profile entry point
```

**Structure Decision**: Reuses the existing three-project split; only `admin-api/` and
`public-ui/` are touched. The new endpoint and service function are added to the existing
reservation route/service modules rather than new files, since this is a small extension of the
same resource (consistent with how `confirmReservation`/`checkOutReservation` were added
alongside `createReservation` in the same file rather than split out). The new page follows the
exact `catalog.html`/`catalog.ts`/`vite.config.ts` registration pattern from
`002-book-catalog-search`.

## Complexity Tracking

*No entries — no constitution violations or non-obvious scope deviations to justify. This
feature reuses existing infrastructure (auth, reservations table, route/service modules, Public
UI page-registration pattern) throughout.*
