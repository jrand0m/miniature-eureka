# Phase 0 Research: Book Backfill Seed

No `NEEDS CLARIFICATION` markers remain in the Technical Context — the task brief already fixed
the language, storage target, and CLI shape. This document records the remaining implementation
decisions and their rationale, since several had more than one reasonable approach.

## Decision: Script language — plain `.mjs`, not TypeScript

**Decision**: Implement as plain Node ES module scripts (`admin-api/scripts/seed-books.mjs`,
`admin-api/scripts/seed-books-catalog.mjs`), run directly via `node`.

**Rationale**: `admin-api/package.json` devDependencies contain only `@cloudflare/workers-types`,
`typescript`, and `wrangler` — no `tsx`, `ts-node`, or similar TS runner. `admin-api`'s only
TypeScript execution path is `tsc --noEmit` (type-checking only, no compiled output) plus
`wrangler dev`/`wrangler deploy`, which compile `src/index.ts` through Wrangler's bundler — not a
generic script runner. Writing the seed script in TypeScript would require either adding a new
runtime dependency (against the brief's explicit constraint) or manually compiling it, both of
which are unjustified for a ~200-line dev tool. Node's native ESM support (the package already
declares `"type": "module"`) runs `.mjs` directly with zero extra tooling.

**Alternatives considered**:
- Add `tsx` as a devDependency and write `seed-books.ts` — rejected: introduces a new dependency
  the brief explicitly asked to avoid unless already present.
- Write it as `.ts` and rely on `tsc` to emit JS — rejected: `tsconfig.json` has `"noEmit": true`
  and only includes `src/`; repurposing it for a one-off script's build step adds complexity for
  no benefit over plain `.mjs`.

## Decision: Idempotency — skip-if-exists by title, no new migration/unique index

**Decision**: Before generating each `INSERT`, check whether a row with that exact `title`
already exists (`SELECT id FROM books WHERE title = ?`) and skip generating the insert if so.
No new migration or `UNIQUE` constraint is added.

**Rationale**: The `books` table (schema owned by a separate, concurrently-developed feature) has
no uniqueness constraint on `title`. Adding one via a follow-up migration would require this
feature to reach into and extend a table it does not own, creating merge risk with the
in-flight feature that already owns `0003_create_books.sql` and its indexes. A plain
existence-check is simpler, requires no schema change, and is sufficient because the seed data
is a small, fully-controlled static list with no near-duplicate titles. The check is done in the
same script invocation that generates the SQL file (query `wrangler d1 execute ... --local
--command "SELECT title FROM books"` once up front, then diff the curated list against that set
in JS) rather than via `INSERT OR IGNORE`, so it works correctly with zero schema changes and
degrades safely (worst case: a harmless re-insert attempt is simply never generated).

**Alternatives considered**:
- `INSERT OR IGNORE` relying on a `UNIQUE(title)` constraint — rejected: requires a migration
  change in a table owned by a different in-flight feature; deferred as a documented option, not
  implemented.
- Per-row existence check (one `SELECT` per candidate book) — rejected in favor of a single
  up-front `SELECT title FROM books` fetch, avoiding 30 extra round-trips to `wrangler d1
  execute` (each invocation has significant CLI startup overhead).

## Decision: Execution mechanism — generate a `.sql` file, then `wrangler d1 execute --local --file=`

**Decision**: The script writes all generated `INSERT` statements (only for not-yet-present
titles) to a temporary `.sql` file, then shells out once to
`wrangler d1 execute library-admin-db --local --file=<path>`.

**Rationale**: `--file` handles many statements in a single Wrangler invocation reliably (avoids
shell quoting/escaping pitfalls of `--command` with 30 rows of text containing apostrophes, e.g.
"Where the Crawdads Sing" or O'Brien-style author names) and keeps CLI startup overhead to one
invocation instead of up to 30. Mirrors the existing `db:migrate:local` pattern, which also
ultimately applies `.sql` files via Wrangler.

**Alternatives considered**:
- One `--command` per row — rejected: 30 separate `wrangler` process spawns is slow and fragile
  to quote/escape.
- A single giant `--command "..."` string — rejected: shell quoting of apostrophes in real book
  titles/author names (e.g., *Where the Crawdads Sing*, *A Prayer for Owen Meany*) is error-prone;
  a file avoids shell-escaping entirely (SQL string-literal escaping only).

## Decision: `id` and `created_at` conventions

**Decision**: `id = crypto.randomUUID()` (Node's built-in `node:crypto`, same function used by
`admin-api/src/services/users.ts`); `created_at = new Date().toISOString()`, computed once per
seed run (not per statement) for a consistent batch timestamp.

**Rationale**: Matches the existing codebase convention exactly (see `createUser` in
`admin-api/src/services/users.ts`), so seeded rows are indistinguishable in shape/style from
rows created through the application's normal write paths.

## Decision: Quantity variation strategy

**Decision**: Each curated book entry carries a fixed `quantityTotal` value hand-picked at
authoring time (range 1–12, deliberately non-uniform across the list), rather than randomizing
quantities at seed-run time.

**Rationale**: The spec's idempotency requirement (re-running the seed must not change existing
data) is easiest to guarantee if the data generated for a given title is deterministic across
runs. Randomizing at run time would still satisfy "skip if already present" for idempotency, but
hand-picked fixed values remove any ambiguity and make manual QA reproducible (a developer
re-running the seed sees the exact same catalog every time).

**Alternatives considered**:
- Randomize `quantity_total` per run (only applied to newly-inserted rows) — rejected: adds
  nondeterminism with no benefit, since the row is only generated once per title anyway (skip
  logic makes the random value irrelevant after the first run, but complicates local reasoning
  about "what did seeding just do").

## Decision: `--count=N` parameter semantics

**Decision**: `--count=N` (CLI flag, parsed via `process.argv`) selects the first `N` entries of
the curated list in its declared order; omitted defaults to the full list length; `N` greater
than the list length is clamped to the list length; non-numeric or `N <= 0` is treated as a user
error (clear message, non-zero exit) rather than silently defaulting.

**Rationale**: Deterministic, order-stable slicing (rather than random sampling) keeps repeated
`--count=5` runs idempotent and predictable — the same 5 titles every time — which matters
because a later dev-bootstrap flow may call this on every `just dev up` with a fixed count.
