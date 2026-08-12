# Quickstart: Justfile Dev Bootstrap

Validates the feature end-to-end against the acceptance scenarios in
[spec.md](./spec.md) and the recipe contract in
[contracts/justfile-recipes.md](./contracts/justfile-recipes.md). No automated test harness
applies to a `justfile` — this is the authoritative verification record — run manually (or via
scripted `curl`/`ps` checks) and keep this file up to date with actual results.

## Prerequisites

- `just` installed and on `PATH` (`just --version`).
- A clean-enough local state to prove the bootstrap path: no `node_modules/` in any of the three
  projects, no `.env`/`.dev.vars` files, no local D1 state, nothing already listening on 8787,
  5173, or 5174. (Verification may be done per-recipe against the real worktree instead of a
  fully wiped copy, as long as each recipe's *individual* behavior is proven — see "Actual
  verification run" below for which approach was used.)

## Scenario 1 — Granular recipes (User Story 3)

1. `just install all` → dependencies installed in `admin-api/`, `admin-ui/`, `public-ui/`.
2. `just env setup` → `admin-api/.dev.vars`, `admin-ui/.env`, `public-ui/.env` created from their
   `.example` files.
3. Re-run `just env setup` after hand-editing one of the created files → confirm the edit
   survives (file untouched).
4. `just db migrate local` → local D1 schema created/updated; re-run → no error, no change.
5. `just db seed books` → `SELECT COUNT(*) FROM books` on the local DB shows the full curated
   count (36); re-run → same count (idempotent, no duplicates).
6. `just db seed books count=5` (against a reset DB) → exactly 5 rows.

## Scenario 2 — Single-project dev server (User Story 2)

1. With dependencies/env already in place, `just dev up admin-api` → `wrangler dev` starts in
   the foreground; `curl http://localhost:8787/books` responds (once migrated/seeded).
2. `just dev up admin-ui` (separately) → `vite` starts in the foreground on its default port;
   the index page is reachable.
3. `just dev up public-ui` (separately) → same, for `public-ui`.

## Scenario 3 — One-command full bootstrap (User Story 1)

1. From a state with no `node_modules/`, no env files, and no local DB: run `just dev up all` in
   the background with a timeout.
2. Confirm dependencies get installed, env files get created, migrations run, and books get
   seeded — all before any server-startup output appears.
3. Confirm the three expected URLs are printed before the servers start.
4. Confirm all three servers become reachable: `curl http://localhost:8787/books`,
   `curl http://localhost:5173/`, `curl http://localhost:5174/`.
5. Stop the command (send the process group SIGINT/SIGTERM, simulating Ctrl+C).
6. Confirm no `wrangler`/`vite`/`workerd`/`esbuild` process tied to this run remains in `ps`
   output afterward.

## Success criteria mapping

Scenario 3 → SC-001, SC-003, SC-004. Scenario 1 → SC-002. Scenario 2 → SC-005.

## Actual verification run

Performed 2026-08-11 in the feature worktree
(`/Users/mike/other/miniature-eureka/.claude/worktrees/agent-ad31f2524843056d2`). To prove the
bootstrap path without leaving the worktree in a broken state, dependencies/env/DB state were
reset in place (removed `node_modules/`, `.env`/`.dev.vars`, and `.wrangler/` local D1 state
across all three projects) rather than cloning to a separate scratch checkout, then each recipe
was run in the exact order a fresh clone would need them.

_(Filled in after running the commands below — see the exact transcript this section was
generated from for command-by-command output.)_
