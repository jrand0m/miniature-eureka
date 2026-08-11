# Implementation Plan: Book Catalog & Public Search

**Branch**: `002-book-catalog-search` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-book-catalog-search/spec.md`

## Summary

Add a read-only, unauthenticated book catalog surface to the existing Admin API — `GET /books`
(offset-paginated, optionally filtered by case-insensitive partial `title` and/or `author`) and
`GET /books/:id` (single book detail, 404 if missing) — backed by a new `books` D1 table, plus a
Public UI browse/search page that calls it. This is part of the constitution's "public library
surface" (Principle I item b): no admin token, no user auth token, and no admin-ui changes. The
catalog starts empty; a later feature owns seeding real data.

## Technical Context

**Language/Version**: TypeScript (Node 20 tooling for builds; Cloudflare Workers runtime for the
backend)

**Primary Dependencies**: Hono (existing Workers-native HTTP router, already used by
`admin-api`) for the new routes; Vite (existing) for the `public-ui` build — no new dependencies
are introduced by this feature.

**Storage**: Cloudflare D1 (SQLite, free tier) — a new `books` table, added via the next
sequentially-numbered migration after the existing `0001_create_users.sql` /
`0002_seed_admin.sql` (i.e. `0003_create_books.sql`). No seed data in this feature.

**Testing**: No automated test runner is currently configured in `admin-api` or `public-ui`
(neither `package.json` declares a test script or test framework, and no `tests/` directory
exists despite one being sketched — but never implemented — in feature 001's plan). This feature
does not introduce one; instead it is verified via `tsc --noEmit` typechecks and a runtime
`wrangler dev` + `curl` smoke pass documented in `quickstart.md`, consistent with how feature 001
was actually delivered.

**Target Platform**: Cloudflare Workers (backend API, existing) + Cloudflare Pages (`public-ui`,
existing) — no new platform surface.

**Project Type**: Web application — reuses the existing three-project structure
(`public-ui`, `admin-api`, `admin-ui`); this feature touches only `public-ui` and `admin-api`.

**Performance Goals**: Hobby/self-hosted scale, matching feature 001 — comfortably support a
catalog of a few thousand books and casual browse/search traffic within Cloudflare's free-tier
D1 row-read quotas; `LIMIT`/`OFFSET` pagination is sufficient at this scale.

**Constraints**: Must stay within Cloudflare free-tier limits (Workers requests/day, D1 storage
and rows read/written per day, Pages build minutes); no paid add-ons; no new runtime
dependencies.

**Scale/Scope**: A single library's catalog — realistically hundreds to low thousands of book
records for the foreseeable lifetime of this project.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)** — PASS. `admin-api` remains the single
  backend; this feature adds `GET /books` and `GET /books/:id` as unauthenticated, read-only
  endpoints under the public library surface explicitly permitted by v1.3.0 ("unauthenticated,
  read-only book browse/search endpoints over the catalog"). They are not mounted under
  `/admin/*` and are not gated by `requireAdminToken` or `requireAuth`. No new project is
  introduced; `admin-ui` is untouched.
- **Principle II (Static-First Public Delivery)** — PASS. The new `public-ui` browse/search page
  is a statically built page (via the existing Vite multi-page setup) whose shipped JS calls only
  the newly-added public catalog endpoints on `admin-api` — exactly the kind of runtime call
  Principle II explicitly permits. No SSR, no build-time dependency on the API being live.
- **Principle III (Token-Protected Admin Access)** — PASS/N-A. This feature adds no `/admin/*`
  endpoints and touches no admin-token logic; the new endpoints are intentionally, per the
  constitution, unauthenticated.
- **Principle IV (Standards-Based Identity & Registration)** — N/A. No identity, registration, or
  session logic is touched by this feature.
- **Principle V (Progressive Environments)** — PASS. This feature ships against the single dev
  environment; no production environment work is introduced.

No unresolved violations — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-book-catalog-search/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
admin-api/
├── src/
│   ├── routes/
│   │   └── books.ts        # GET /books, GET /books/:id
│   ├── services/
│   │   └── books.ts        # book search/list/find-by-id against D1
│   └── db/
│       └── migrations/
│           └── 0003_create_books.sql
└── (no tests/ — see Technical Context: no test runner is configured in this project yet)

public-ui/
├── catalog.html             # new static entry (mirrors index.html/login.html/register.html)
├── src/
│   ├── pages/
│   │   └── catalog.ts       # search box + results list + pagination controls
│   └── services/
│       └── books-client.ts  # calls admin-api's GET /books, GET /books/:id
```

**Structure Decision**: Reuses the existing three-project layout. `admin-api/` gains one route
module + one service module + one migration, mounted in `admin-api/src/index.ts` exactly like
`usersRoutes`. `public-ui/` gains one new static HTML entry (registered in `vite.config.ts`
alongside the existing `index.html`/`login.html`/`register.html` entries), one page script, and
one API client module — following the same file-per-concern pattern as `home.ts`/`login.ts`/
`register.ts` and `auth-client.ts`. `admin-ui/` is untouched.

## Complexity Tracking

*No violations to justify — table intentionally omitted.*
