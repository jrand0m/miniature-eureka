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

**Granular recipes (Scenario 1 / US3)**:
- `just install admin-api` → `npm install` in `admin-api/`: "added 39 packages ... found 0
  vulnerabilities". Repeated for `admin-ui` (17 packages) and `public-ui` (17 packages) — all
  clean.
- `just env setup` (no files present yet) → created `admin-api/.dev.vars`, `admin-ui/.env`,
  `public-ui/.env` from their `.example` files. Appended `CUSTOM=1` to `admin-api/.dev.vars` by
  hand, then re-ran `just env setup` → output was `admin-api/.dev.vars already exists, leaving
  it untouched` for all three; `CUSTOM=1` confirmed still present afterward — the "never
  overwrite" guarantee holds.
- `just db migrate local` → all 7 migrations (`0001`–`0007`) applied successfully. Re-ran
  immediately after → `✅ No migrations to apply!` (idempotent, no error).
- `just db seed books` → `db:seed:local: 36 inserted, 0 already present.` Confirmed via
  `wrangler d1 execute library-admin-db --local --command "SELECT COUNT(*) FROM books"` →
  `{"COUNT(*)": 36}`. Re-ran `just db seed books` → `db:seed:local: 0 inserted, 36 already
  present. Nothing to do.` (idempotent, no duplicates).
- Reset the table (`DELETE FROM books`), ran `just db seed books count=5` →
  `db:seed:local: 5 inserted, 0 already present.`; count query confirmed exactly 5 rows. Ran
  `just db seed books` (no count) again → `db:seed:local: 31 inserted, 5 already present.`,
  bringing the total back to 36 (confirmed via count query) — the 5 already-seeded titles were
  correctly skipped rather than duplicated.

**Single-project dev servers (Scenario 2 / US2)**: with dependencies/env/DB already in place,
ran each of `just dev up admin-api`, `just dev up admin-ui`, `just dev up public-ui` individually
(each backgrounded with a `timeout`, simulating a manual run + Ctrl+C):
- `just dev up admin-api` printed `admin-api -> http://localhost:8787` before `wrangler dev`
  started; `curl http://localhost:8787/books` → `200`. Sending the recipe SIGTERM (via
  `timeout`) stopped it cleanly; `ps aux | grep -E "wrangler|workerd"` afterward showed nothing.
- `just dev up admin-ui` printed `admin-ui -> http://localhost:5173`; Vite came up on `5173`
  ("VITE v7.3.6 ready"); `curl http://localhost:5173/` → `200`. Clean stop, no leftover `vite`
  process.
- `just dev up public-ui` printed `public-ui -> http://localhost:5173` (Vite's own default —
  the only instance running in this path); `curl http://localhost:5173/` → `200`. Clean stop, no
  leftover `vite` process.

**Full bootstrap (Scenario 3 / US1)**: started `just dev up all` in the background. The log
showed, in order: `npm install` for all three projects (all "up to date" fast-paths since already
installed from the granular-recipe pass above), `env setup` (all three "already exists, leaving
it untouched"), `db migrate local` ("No migrations to apply!"), `db seed books` ("0 inserted, 36
already present"), then the three expected URLs printed together:
```
Starting dev servers:
  admin-api  -> http://localhost:8787
  admin-ui   -> http://localhost:5173
  public-ui  -> http://localhost:5174
```
followed by all three dev commands starting concurrently (`wrangler dev`, `vite --port 5173
--strictPort`, `vite --port 5174 --strictPort`). Confirmed reachability:
`curl http://localhost:8787/books` → `200`, `curl http://localhost:5173/` → `200`,
`curl http://localhost:5174/` → `200`. `ps` showed the expected process tree: `wrangler dev` in
its own process group (with two `workerd` children under it), `vite --port 5173` in its own
group, `vite --port 5174` in its own group — each job's `set -m`-created process group
independent of the recipe script's own group, confirming the design in `research.md`.

Sent `SIGINT` to the recipe's own process group (simulating `Ctrl+C` in an interactive
terminal). The log showed:
```
Stopping dev servers...
All dev servers stopped.
```
and a follow-up `ps aux | grep -E "wrangler|vite|workerd"` returned **no matches** — zero
orphaned processes, confirming SC-003 and FR-008.

All scenarios passed; no deviations from `contracts/justfile-recipes.md` were found during
verification.
