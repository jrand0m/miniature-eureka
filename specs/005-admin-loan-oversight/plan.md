# Implementation Plan: Admin Loan Oversight

**Branch**: `005-admin-loan-oversight` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-admin-loan-oversight/spec.md`

## Summary

Give administrators oversight of the existing reservation lifecycle: filter the loan list by
book and/or member (in addition to the existing status filter) so an admin can see "who holds
book X" or "what does member Y hold"; let an admin confirm a physical return from either
`checked_out` or `return_requested` status (returning the copy to available inventory); and let
an admin flag a currently-out loan for early return without altering its status — a pure state
marker (`force_return_requested_at`) a later, out-of-scope notifications feature will read. A
new admin-ui "Loans" page surfaces all of this. This feature only extends the existing
`reservations` table/service/routes shipped by `004-reservation-flow`; it introduces no new
entities.

**Note on sibling-feature dependency**: a concurrently-developed feature (FEAT-04, member
self-service returns) is also touching `admin-api/src/services/reservations.ts` and may add its
own migration (`0005_*`) and a `return_requested_date`-style column, off the same base commit,
in a separate worktree. This plan uses migration number `0006` to avoid colliding with that
`0005`, per this feature's brief. Its serialization work (FR-010 style: surfacing
`returnRequestedDate` if present) is written defensively — checked against master's actual state
at implementation time rather than assumed — since the sibling feature had not merged as of this
plan being written.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for
the backend)

**Primary Dependencies**: Hono (Workers-native HTTP router) for the backend API; Vite for
building the Admin UI static bundle; native D1 bindings (`wrangler d1`) for migrations — no ORM,
matching the existing `reservations`/`books`/`users` raw-SQL service pattern

**Storage**: Cloudflare D1 (SQLite, free tier) — extends the existing `reservations` table via
migration `0006_add_force_return_flag.sql` (adds nullable `force_return_requested_at TEXT`); no
new tables

**Testing**: No test framework/harness exists in `admin-api/` or `admin-ui/` (confirmed by
inspection, consistent with prior features' findings). This feature does not introduce new test
infrastructure; verification is manual, documented as a runnable checklist in `quickstart.md`
(wrangler dev + curl through the full state machine, including the 409 conflict cases and the
new filters).

**Target Platform**: Cloudflare Workers (backend API) + Cloudflare Pages (Admin UI static
bundle)

**Project Type**: Web application — reuses the existing three-project split (`public-ui/`,
`admin-api/`, `admin-ui/`); this feature touches `admin-api/` and `admin-ui/` only, no
`public-ui/` changes required

**Performance Goals**: Hobby/self-hosted scale, consistent with the rest of the platform —
comfortably support low hundreds of loan records within Cloudflare's free-tier request and D1
row-read/write quotas

**Constraints**: Must stay within Cloudflare free-tier limits; must not collide with the
concurrently in-flight sibling feature's migration numbering (`0005` reserved for that feature,
so this feature uses `0006`); the new `force_return_requested_at` column must not alter the
`reservations.status` CHECK constraint or any existing column

**Scale/Scope**: Single library's loan oversight surface — realistically low hundreds of
reservations across tens to a few hundred users; three new/extended admin endpoints and one new
admin-ui page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. `admin-api/` remains the
  single backend. All new/extended endpoints (`GET /admin/reservations` filters,
  `POST /admin/reservations/:id/confirm-return`, `POST /admin/reservations/:id/force-return`)
  are admin-scoped, mounted under the existing `requireAdminToken` gate on
  `adminReservationsRoutes`. `admin-ui/` gets a new page that talks only to `admin-api/` through
  the established `admin-api-client.ts`. No new project is introduced; `public-ui/` is untouched.
- **Principle II (Static-First Public Delivery)** — PASS/N/A. This feature makes no `public-ui/`
  changes.
- **Principle III (Token-Protected Admin Access)** — PASS. All three endpoints sit behind
  `adminReservationsRoutes.use("*", ...requireAdminToken)`, unchanged.
- **Principle IV (Standards-Based Identity & Registration)** — PASS/N/A. No new identity or
  credential handling.
- **Principle V (Progressive Environments)** — PASS. Ships against the single dev environment;
  no production environment work introduced.

No unresolved violations against the constitution's Core Principles.

## Project Structure

### Documentation (this feature)

```text
specs/005-admin-loan-oversight/
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
│   │   └── admin-reservations.ts   # extend: bookId/userId filters, confirm-return, force-return
│   ├── services/
│   │   ├── reservations.ts          # extend: listReservationsForAdmin filters, confirmReturn,
│   │   │                            # forceReturn
│   │   └── books.ts                 # extend: incrementQuantityAvailable (mirrors
│   │                                 # decrementQuantityAvailable)
│   └── db/
│       └── migrations/
│           └── 0006_add_force_return_flag.sql   # this feature's schema deliverable
└── (no tests/ — none exist in this project yet)

admin-ui/
├── loans.html                       # new Loans page shell
├── src/
│   ├── pages/
│   │   └── loans.ts                 # new: list + filters + confirm-return/force-return actions
│   └── services/
│       └── admin-api-client.ts      # extend: listAdminReservations(filters), confirmReturn,
│                                     # forceReturn
└── (no tests/ — none exist in this project yet)
```

**Structure Decision**: Reuses the existing three-project split; only `admin-api/` and
`admin-ui/` are touched. No new route/service modules — this feature extends the
`admin-reservations.ts` route and `reservations.ts`/`books.ts` services already shipped by
`004-reservation-flow` and `003-admin-book-mgmt`, following the same guarded-UPDATE pattern
`decrementQuantityAvailable`/`confirmReservation`/`checkOutReservation` already established. The
new `loans.ts` admin-ui page follows the structure of the most recent analogous page,
`books.ts` (list + filters + inline action buttons), per this feature's brief.

## Complexity Tracking

No constitution violations to justify — this section is intentionally empty.
