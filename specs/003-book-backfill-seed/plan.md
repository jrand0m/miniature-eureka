# Implementation Plan: Book Backfill Seed

**Branch**: `003-book-backfill-seed` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-book-backfill-seed/spec.md`

## Summary

Add a dev-only, non-HTTP local tooling script under `admin-api/` that backfills the `books`
table with a curated list of 30+ real, popular book titles/authors, each given a varied
`quantity_total` (with `quantity_available` initialized equal to it). The script accepts an
optional `--count=N` CLI flag (default: full curated list, capped at the curated list size),
generates SQL `INSERT` statements guarded by an existence check per title (skip-if-present for
idempotency), writes them to a temp `.sql` file, and executes that file against the local D1
instance via `wrangler d1 execute library-admin-db --local --file=...`. Wired up as
`npm run db:seed:local` in `admin-api/package.json`, mirroring the existing
`db:migrate:local` / `db:migrate:remote` naming convention. Never mounted in `src/index.ts` —
this is local tooling only, consumed directly by developers today and later by a root `justfile`
dev-bootstrap target.

## Technical Context

**Language/Version**: JavaScript (Node.js, ES modules) — plain `.mjs`, no TypeScript compilation
step, matching `admin-api`'s `"type": "module"` and its `devDependencies` (no TS runner such as
`tsx`/`ts-node` is present; adding one solely for this script would be an unjustified new
dependency).

**Primary Dependencies**: None beyond Node's built-in `node:crypto` (`crypto.randomUUID()`),
`node:fs`, `node:path`, and `node:child_process` (to shell out to `wrangler`), plus the
already-present `wrangler` CLI (devDependency) used exactly as the existing
`db:migrate:local` script uses it.

**Storage**: Cloudflare D1 (local simulation via `wrangler d1 execute ... --local`), binding
name `DB`, database name `library-admin-db` — matches `admin-api/wrangler.toml`. This feature
only inserts rows into the pre-existing `books` table (owned by a separate, concurrently-built
migration `0003_create_books.sql`); it creates no new tables or migrations.

**Testing**: No automated test suite exists for `admin-api` yet (none is configured in
`package.json`); verification is manual per the quickstart (apply migrations, run the seed
script, inspect row counts, re-run to confirm idempotency, run with `--count=5`). This matches
the project's current testing posture — no new test tooling is introduced by this feature.

**Target Platform**: Local developer machine (macOS/Linux/CI runner) running Node.js + the
`wrangler` CLI against `wrangler`'s local D1 (SQLite-backed) simulation. Never deployed, never
run against a remote/production database.

**Project Type**: CLI/tooling script within an existing single-backend project
(`admin-api`, Cloudflare Workers/Hono/D1).

**Performance Goals**: N/A (one-off/idempotent local dev command over ~30 rows; no
performance targets apply).

**Constraints**: MUST NOT be mounted as an HTTP route in `src/index.ts` or reachable over the
network under any circumstance. MUST NOT add new npm dependencies. MUST be safe to invoke
repeatedly/unattended (no interactive prompts), since a later feature's dev-bootstrap flow may
call it on every `just dev up`.

**Scale/Scope**: A single static curated list of 30+ books; a single generated SQL file of at
most ~30 `INSERT` statements per run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)**: PASS. This feature adds no route, no
  endpoint, and touches no frontend project. It is local tooling that runs outside the deployed
  Worker process entirely (a Node script invoked from a developer's shell), so it cannot be
  reached by any project's runtime traffic. Explicitly verified by NOT wiring anything into
  `admin-api/src/index.ts`.
- **Principle II (Static-First Public Delivery)**: N/A — no Public UI changes.
- **Principle III (Token-Protected Admin Access, NON-NEGOTIABLE)**: PASS by construction — there
  is no new endpoint to protect. Because the mechanism is never mounted as a route, there is no
  auth-less network surface introduced; the "protect all endpoints" rule has nothing to apply to
  here, which is the intended outcome per the feature brief (dev-only tooling, not an API).
- **Principle IV (Standards-Based Identity & Registration)**: N/A — no identity/session/token
  logic is touched.
- **Principle V (Progressive Environments)**: PASS — this is single dev-environment tooling by
  design; it explicitly does not target remote/production (no `db:seed:remote` is added).
- **Platform & Delivery Constraints — Data storage**: PASS — reuses the existing D1 `books`
  table and free-tier database; adds no new store, no new migration.
- **Platform & Delivery Constraints — CI/CD**: PASS — no new GitHub Actions workflow is
  required; `admin-api`'s existing `typecheck` continues to run in CI and must keep passing. The
  new script is plain `.mjs` and outside the TypeScript `include` path (`tsconfig.json` only
  includes `src`), so it does not participate in `tsc --noEmit` and cannot regress it.
- **Development Workflow**: PASS — implemented in its own worktree/branch
  (`003-book-backfill-seed`) and will ship as its own PR into `master`.

No violations. Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-book-backfill-seed/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── cli.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
admin-api/
├── package.json                      # add "db:seed:local" script (existing file, edited)
├── scripts/
│   ├── seed-books.mjs                # CLI entry point: parses --count=N, orchestrates seeding
│   └── seed-books-catalog.mjs        # curated static list of 30+ {title, author, isbn?,
│                                      # description?, quantityTotal} entries
└── src/
    └── db/migrations/                # untouched by this feature (0003_create_books.sql is
                                       # owned by a separate, concurrently-built feature)
```

**Structure Decision**: Single existing project (`admin-api`), no new project/workspace. New
files live under `admin-api/scripts/` (a new directory, sibling to `src/`), kept out of the
TypeScript `src/` tree and out of `tsconfig.json`'s `include` so they cannot affect
`npm run typecheck`. The curated book list is split into its own module
(`seed-books-catalog.mjs`) purely for readability/maintainability of the ~30-entry data list,
imported by the CLI entry point (`seed-books.mjs`), which is what `db:seed:local` invokes.

## Complexity Tracking

Not applicable — no Constitution Check violations.
