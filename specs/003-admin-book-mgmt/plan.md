# Implementation Plan: Admin Book Catalog & Inventory Management

**Branch**: `003-admin-book-mgmt` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-admin-book-mgmt/spec.md`

## Summary

Add administrator-only catalog-management endpoints to the existing Admin API — `POST
/admin/books` (create), `PATCH /admin/books/:id` (edit descriptive fields), `DELETE
/admin/books/:id` (remove, blocked while any copies are checked out), and `POST
/admin/books/:id/quantity` (signed inventory delta, blocked if it would drive available quantity
negative) — all gated by the existing `requireAdminToken` middleware exactly like `/admin/users`.
No new migration: the `books` table and its invariant-enforcing `CHECK` constraints already exist
from feature 002. Extends the existing `admin-api/src/services/books.ts` with new data-access
functions rather than duplicating query logic, adds a new `admin-api/src/routes/admin-books.ts`
route group (kept separate from the existing, unauthenticated `routes/books.ts` so every route
file keeps a single, uniform auth posture — matching how `routes/users.ts` is entirely
admin-gated and `routes/books.ts`/`routes/auth.ts` are entirely public), and adds a matching
Admin UI page (`books.html` + `src/pages/books.ts`) that lists the catalog with add/edit/delete
and quantity-adjust controls, following the `users.html`/`users.ts` page conventions exactly.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for the
backend)

**Primary Dependencies**: Hono (existing Workers-native HTTP router already used by `admin-api`)
for the new routes; no new runtime dependencies for `admin-api` or `admin-ui`.

**Storage**: Cloudflare D1 (SQLite, free tier) — reuses the existing `books` table from
`0003_create_books.sql` (feature 002) unchanged. No new migration in this feature.

**Testing**: No automated test runner is configured in `admin-api` or `admin-ui` (no `test`
script in either `package.json`, no `tests/` directory — consistent with feature 001 and 002's
findings). This feature does not introduce one; it is verified via `tsc --noEmit` typechecks
(admin-api and admin-ui), `admin-ui`'s `vite build`, and a runtime `wrangler dev` + `curl` smoke
pass documented in `quickstart.md`.

**Target Platform**: Cloudflare Workers (`admin-api`, existing) + Cloudflare Pages (`admin-ui`,
existing) — no new platform surface.

**Project Type**: Web application — reuses the existing three-project structure (`public-ui`,
`admin-api`, `admin-ui`); this feature touches only `admin-api` and `admin-ui`.

**Performance Goals**: Hobby/self-hosted scale, matching features 001/002 — a single library's
catalog (hundreds to low thousands of books), low-frequency administrative writes.

**Constraints**: Must stay within Cloudflare free-tier limits (Workers requests/day, D1 storage
and rows read/written per day, Pages build minutes); no paid add-ons; no new runtime dependencies.
Quantity invariants (`quantity_total >= 0`, `0 <= quantity_available <= quantity_total`) must hold
after every write, both at the application layer (so callers get a clean 409 instead of a raw D1
constraint-violation error) and as a backstop via the table's existing `CHECK` constraints.

**Scale/Scope**: A single library's catalog — realistically hundreds to low thousands of book
records; administrative write traffic is low-frequency (one admin operating the catalog).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. All four new endpoints are
  mounted under `/admin/books` (not the public library surface) and gated by `requireAdminToken`,
  matching `/admin/users` exactly. `admin-ui` continues to talk to the system exclusively through
  `admin-api`'s HTTP surface — no direct D1/backend access from the frontend. No new project is
  introduced.
- **Principle II (Static-First Public Delivery)** — N/A. This feature touches `admin-ui`, not
  `public-ui`; `public-ui` is untouched and this feature adds no public/unauthenticated surface.
- **Principle III (Token-Protected Admin Access)** — PASS. Every new endpoint requires a valid
  admin bearer token via the existing `requireAdminToken` middleware (`requireAuth` +
  admin-role check), the same standard, already-reviewed mechanism used by `/admin/users`. No
  custom auth scheme is introduced.
- **Principle IV (Standards-Based Identity & Registration)** — N/A. No identity, registration, or
  session logic is touched by this feature.
- **Principle V (Progressive Environments)** — PASS. This feature ships against the single dev
  environment; no production environment work is introduced.

No unresolved violations — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-admin-book-mgmt/
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
│   │   ├── books.ts         # existing public GET /books, GET /books/:id — untouched, unauthenticated
│   │   └── admin-books.ts   # new: adminBooksRoutes — POST/PATCH/DELETE /, POST /:id/quantity,
│   │                        #   gated by requireAdminToken (mounted at /admin/books)
│   ├── services/
│   │   └── books.ts        # existing listBooks/findBookById (untouched) + new createBook,
│   │                        #   updateBook, adjustQuantity, deleteBook
│   └── index.ts             # add `app.route("/admin/books", adminBooksRoutes)`
└── (no tests/ — see Technical Context: no test runner configured in this project)

admin-ui/
├── books.html                       # new static entry (mirrors users.html)
├── src/
│   ├── pages/
│   │   ├── books.ts                 # catalog list + add/edit/delete/quantity-adjust controls
│   │   └── users.ts                 # existing — add a nav link to books.html (and vice versa)
│   └── services/
│       └── admin-api-client.ts      # add listAdminBooks, createBook, updateBook, deleteBook,
│                                     #   adjustBookQuantity
```

**Structure Decision**: Reuses the existing three-project layout. Within `admin-api`, the existing
`services/books.ts` is extended (not duplicated) with the four new data-access functions; the
existing `routes/books.ts` (public, unauthenticated `GET /books`/`GET /books/:id`) is left
untouched, and a new `routes/admin-books.ts` file holds the four new `/admin/books*` endpoints
behind `requireAdminToken`, mounted separately in `index.ts` — mirroring how `usersRoutes` is
mounted at `/admin/users`, and keeping every route file's auth posture uniform (a judgment call:
the task brief didn't mandate a file name, so a separate file was chosen over adding a second,
differently-gated router to the existing `routes/books.ts`). `admin-ui/` gains one new static HTML
entry, one page script, and extends the existing API client module, following the exact
file-per-concern pattern `users.html`/`users.ts` already establishes. `public-ui/` is untouched.

## Complexity Tracking

*No violations to justify — table intentionally omitted.*
