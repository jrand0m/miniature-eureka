# Implementation Plan: Reservation Flow

**Branch**: `004-reservation-flow` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-reservation-flow/spec.md`

## Summary

Add a "propose then confirm" book reservation flow on top of the existing catalog/inventory
model: a signed-in user requests a reservation for a book and a preferred delivery date; an
administrator confirms the request (committing one copy of inventory and agreeing a delivery
date) or, later, marks it checked out once the book is physically handed over. A new
`reservations` D1 table drives `pending → confirmed → checked_out`, with its status enum
pre-sized (per the constitution's future public-library-surface roadmap) to also hold
`return_requested`, `returned`, and `cancelled` for three later features (user-initiated
returns, admin-forced returns, notifications) — none of which this feature builds UI or
endpoints for. The Public UI gets a minimal "Reserve" action on the catalog page, gated behind
the existing signed-in-user check.

**Note on sibling-feature dependency (RECONCILED)**: this feature was originally started in a
worktree that branched before two sibling features — book catalog/browse (FEAT-01) and admin
book CRUD/quantity management (FEAT-02) — landed. Those were developed concurrently by other
agents and were not visible here at the start, so this plan initially proceeded by building a
minimal, spec-matching provisional `books` migration/service/route and public catalog page
strictly to the extent needed to exercise and runtime-verify the reservation flow end-to-end
(see original rationale in Complexity Tracking below). Partway through implementation, the
worktree was fast-forwarded onto the real `master` tip (commit `2bba414`, "feat: add book
catalog and public search (002-book-catalog-search)"), and the provisional
`0003_create_books.sql` / `services/books.ts` / `routes/books.ts` / `public-ui` catalog page
were deleted and replaced by the real ones from that merge; this feature's own
`decrementQuantityAvailable` helper was re-appended onto the real `services/books.ts`. All of
this feature's own deliverables (`0004_create_reservations.sql`, `services/reservations.ts`,
`routes/reservations.ts`, `routes/admin-reservations.ts`, and the catalog page's "Reserve"
action) were unaffected by the reconciliation and were built/verified against the real
infrastructure.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for
the backend)

**Primary Dependencies**: Hono (Workers-native HTTP router) for the backend API; Vite for
building the Public UI static bundle; native D1 bindings (`wrangler d1`) for migrations — no
ORM, matching the existing `users` table's raw-SQL service pattern

**Storage**: Cloudflare D1 (SQLite, free tier) — a new `reservations` table (migration
`0004_create_reservations.sql`), referencing the existing `books` and `users` tables by id

**Testing**: No test framework/harness exists in `admin-api/` or `public-ui/` at the time of
this feature (confirmed by inspection — matches the prior feature's finding of none). This
feature does not introduce new test infrastructure as a side effect; verification is manual,
documented as a runnable checklist in `quickstart.md` (wrangler dev + curl through the full
state machine, including the 409 conflict cases).

**Target Platform**: Cloudflare Workers (backend API) + Cloudflare Pages (Public UI static
bundle)

**Project Type**: Web application — reuses the existing three-project split
(`public-ui/`, `admin-api/`, `admin-ui/`); this feature touches `admin-api/` and `public-ui/`
only, no `admin-ui/` changes required

**Performance Goals**: Hobby/self-hosted scale, consistent with the rest of the platform —
comfortably support low hundreds of users making occasional reservation requests within
Cloudflare's free-tier request and D1 row-read/write quotas

**Constraints**: Must stay within Cloudflare free-tier limits; SQLite/D1 `CHECK` constraints are
expensive to alter later, so the `reservations.status` enum is defined once, now, with room for
all six states the constitution's roadmap anticipates, even though this feature only drives
three of them

**Scale/Scope**: Single library's reservation queue — realistically low hundreds of reservations
across tens to a few hundred users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. `admin-api/` remains the
  single backend. This feature adds to its public library surface (explicitly anticipated by
  v1.3.0: "authenticated end-user endpoints gated by the `requireAuth` pattern covering a
  signed-in user's own reservations") via `POST /reservations` and `GET /reservations`, and to
  its admin-scoped surface via `/admin/reservations*` under `requireAdminToken`. No new project
  is introduced; `admin-ui/` is untouched.
- **Principle II (Static-First Public Delivery)** — PASS. The Public UI's reservation UI is
  built into the static Vite bundle; the only new runtime behavior is client-side JS calling
  `POST /reservations` and `GET /reservations` — both within the public library surface v1.3.0
  explicitly carves out. No admin-scoped endpoint is called from `public-ui/`.
- **Principle III (Token-Protected Admin Access)** — PASS. `/admin/reservations*` is mounted
  behind `requireAdminToken`, reusing the existing middleware array unchanged.
- **Principle IV (Standards-Based Identity & Registration)** — PASS/N/A. This feature performs
  no new identity/credential handling; it reuses the existing token-issuance and verification
  mechanism (`requireAuth`) as-is.
- **Principle V (Progressive Environments)** — PASS. Ships against the single dev environment;
  no production environment work introduced.

No unresolved violations against the constitution's Core Principles — see Complexity Tracking
below for the one documented, non-constitutional judgment call (the provisional books
infrastructure) this plan makes to cope with the concurrent-worktree situation.

## Project Structure

### Documentation (this feature)

```text
specs/004-reservation-flow/
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
│   │   ├── reservations.ts        # POST /reservations, GET /reservations (requireAuth)
│   │   ├── admin-reservations.ts  # GET/POST /admin/reservations* (requireAdminToken)
│   │   └── books.ts                # [provisional — see Complexity Tracking] GET /books, GET /books/:id
│   ├── services/
│   │   ├── reservations.ts         # reservations D1 access + state transitions
│   │   └── books.ts                # [provisional] findBookById + decrementAvailable
│   └── db/
│       └── migrations/
│           ├── 0003_create_books.sql        # [provisional]
│           └── 0004_create_reservations.sql # this feature's real deliverable
└── (no tests/ — none exist in this project yet)

public-ui/
├── src/
│   ├── pages/
│   │   └── catalog.ts        # [provisional shell] + this feature's "Reserve" action
│   └── services/
│       ├── books-client.ts       # [provisional] GET /books
│       └── reservations-client.ts # POST/GET /reservations
└── (no tests/ — none exist in this project yet)
```

**Structure Decision**: Reuses the existing three-project split; only `admin-api/` and
`public-ui/` are touched. Reservation routes/services follow the same route-module +
service-module + D1-migration pattern established by `auth.ts`/`users.ts`/`services/users.ts`
in the `001-auth-user-management` feature. The `books.ts` route/service and the `catalog.ts`
page are marked provisional (see Complexity Tracking) because their canonical versions are
being built concurrently in sibling worktrees not visible here.

## Complexity Tracking

> Documenting one judgment call that isn't a constitution violation, but is a deliberate
> deviation from "just build the reservations feature" — recorded here for transparency since
> the Complexity Tracking section is the designated place to justify non-obvious scope
> decisions.

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|---------------------------------------|
| Create a provisional `0003_create_books.sql` migration, `services/books.ts` (`findBookById`, availability decrement), a minimal `GET /books`/`GET /books/:id`, and a minimal `public-ui` catalog page + `books-client.ts` — all matching the exact schema/contract this feature's brief specifies for the sibling book-CRUD feature | This feature's own runtime-verification requirement (`wrangler dev` + `curl` through the full pending → confirmed → checked_out flow, including the 409 cases) is impossible to satisfy without a real `books` table and a way to look up/decrement it — the brief is explicit that "Master already has" this, but it is absent from this worktree because the sibling feature is mid-flight in a separate worktree off the same base commit | Stubbing `findBookById`/availability checks in-memory or skipping runtime verification entirely was rejected: it would leave the confirm/check-out inventory logic — the highest-risk part of this feature — unverified, and would violate the feature's explicit "Exercise at runtime" requirement. Building the provisional pieces to the exact schema given in the brief keeps the eventual merge reconciliation (dropping this feature's placeholder `0003`/`books.ts`/`catalog.ts` in favor of the sibling feature's real versions, then rebasing `0004_create_reservations.sql` on top) as close to a no-op as the information available here allows |
