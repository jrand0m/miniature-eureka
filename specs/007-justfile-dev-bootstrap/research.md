# Phase 0 Research: Justfile Dev Bootstrap

## Decision: Multi-word recipe invocation without `just` modules

**Decision**: Implement the "generic → specific" composite command style (`just db seed books`,
`just dev up all`, etc.) using a small number of top-level recipes (`install`, `env`, `db`,
`dev`) that each take one or more **positional parameters**, and dispatch internally with a
shell `case` statement, rather than using `just`'s module system (`mod` + separate `.just`
files per namespace).

**Rationale**: `just` recipe names cannot themselves contain spaces, so a literal three-word
invocation like `just db seed books` is only possible either via (a) nested modules — a
directory of additional justfiles — or (b) a single recipe (`db`) whose remaining words are
parsed as positional CLI arguments (`subcommand="seed"`, `target="books"`). The task explicitly
calls for **one root `justfile`**, sibling to the three project directories, not a directory of
per-namespace files. Positional-argument dispatch keeps everything in one file, is simpler to
read top-to-bottom, and still gives the exact invocation surface requested
(`just install all`, `just env setup`, `just db migrate local`, `just db seed books count=10`,
`just dev up admin-api`, `just dev up all`).

**Alternatives considered**:
- `just` modules (`mod db;` + `db.just`): rejected — contradicts "a root justfile" (single
  file) and adds indirection disproportionate to ~5 recipes worth of logic.
- Hyphenated recipe names only (`just db-seed-books`): rejected — does not match the requested
  `just <domain> <sub> <target>` space-separated convention, and reads worse.
- A `key=value`-style variadic capture for the `count=N` argument (rather than a true named
  `just` parameter): `just` does not natively parse `count=10` as a named parameter the way a
  Makefile does; the recipe accepts it as a raw variadic word and the recipe's own shell body
  parses `count=*` out of it. This exactly matches the requested `just db seed books count=10`
  call shape without requiring a different invocation style (e.g. `--count=10`).

## Decision: Concurrent server startup + clean shutdown in `dev up all`

**Decision**: Implement `dev up all` as a `just` recipe with a `#!/usr/bin/env bash` shebang
body (so the whole recipe runs as one script, not one shell per line), using:
- `set -euo pipefail` plus `set -m` (job control) so each backgrounded server gets its own
  process group.
- Three backgrounded subshells (`(cd <project> && exec npm run dev ...) &`), each replacing
  itself with the underlying dev command via `exec` (avoids an extra unnecessary process layer
  between the subshell and the real `wrangler`/`vite` process).
- A `trap` on `INT TERM EXIT` that kills each recorded PID's **process group**
  (`kill -TERM -$pid`, negative PID = group) — not just the single PID — so that a dev command's
  own child processes (e.g. `wrangler dev`'s worker runtime subprocess, `vite`'s esbuild
  workers) are also signaled, then falls back to a plain `kill` of the PID if group-kill fails,
  then `wait`s for everything to actually exit before printing a confirmation and returning.
- A guard flag so the cleanup logic only runs once even though it is registered for three
  different signals/EXIT (Ctrl+C triggers INT, which calls cleanup and then the script's own
  natural exit would otherwise re-trigger the EXIT trap).

**Rationale**: This is the standard, well-established pattern for "start N background jobs in
one shell, guarantee they all die together" in POSIX-ish shells — `just`'s own recipe-per-line
default execution model doesn't preserve shell state (traps, background job tables) across
lines, so the shebang-script form is required to keep one shell instance from `set -m` through
`wait`. Killing process groups rather than single PIDs is necessary because `npm run dev`
(and `wrangler dev`) fork children that would otherwise survive a plain `kill` of the top-level
PID and become orphaned — exactly the failure mode the spec's FR-008 / SC-003 forbid.

**Alternatives considered**:
- Plain `kill $pid` per process (no process groups): rejected — risks orphaned grandchildren
  (e.g. `wrangler`'s worker runtime, `vite`'s esbuild service), which is the orphan-process
  failure mode this feature must avoid.
- A separate shell script file (`scripts/dev-up-all.sh`) invoked by the recipe: rejected as
  unnecessary indirection for this size of task — an inline shebang recipe body keeps
  everything in the one root `justfile` the task asks for, and is short enough (~25 lines) to
  stay readable inline.
- `just`'s `--yes`/parallel recipe dependency execution: `just` does not have a built-in
  "run these N recipes concurrently and manage their lifecycle as a group" primitive; recipe
  dependencies run sequentially (or, with `just -j`... no such flag exists for recipe deps), so
  hand-rolled background-job management is required regardless of how the recipes are split.

## Decision: Deterministic ports for `dev up all` vs. default ports for single-project recipes

**Decision**: In `dev up all`, explicitly pin `admin-ui` to port 5173 and `public-ui` to port
5174 via `vite`'s own `--port --strictPort` flags (passed through `npm run dev -- --port ...
--strictPort`), matching the two origins already listed in `admin-api/.dev.vars.example`'s
`ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174`. `admin-api` keeps `wrangler
dev`'s unmodified default port (8787). The single-project recipes (`dev up admin-ui`,
`dev up public-ui`) do **not** pin a port — they run each project's `dev` script completely
unmodified (Vite's own default of 5173, since only one Vite instance is running at a time in
that path, there is no collision to resolve).

**Rationale**: Neither `admin-ui/vite.config.ts` nor `public-ui/vite.config.ts` configures an
explicit dev server port, so both projects share Vite's identical default (5173). That's a
non-issue when only one is running (the single-project recipes), but `dev up all` starts both
**concurrently**, and Vite's default behavior on a taken port is to silently fall forward to the
next free port (5174, 5175, …) — which one of the two UIs "wins" 5173 is a race with no
guaranteed outcome, it would make the printed "expected URL" wrong for whichever UI lost the
race, and a shifted port may fall outside `ALLOWED_ORIGINS`, breaking CORS against the API.
Pinning explicit, distinct ports (and using `--strictPort` so a genuine conflict fails loudly
instead of silently drifting) removes the race entirely and keeps the printed URLs always
accurate for `dev up all`. This asymmetry (pinned only in the "all" path) is a deliberate,
documented judgment call — see the feature's final report.

**Alternatives considered**:
- Set `server.port` in each `vite.config.ts`: rejected — that's an application source change
  outside this feature's scope (FR-011: no application behavior changes), and would also
  permanently change the single-project default even when no collision is possible.
- Pin ports everywhere, including the single-project recipes: rejected — the task description
  explicitly asks the single-project recipes to "run that project's own dev script" as-is; only
  the concurrent "all" path actually needs determinism.
- Let both default to 5173/auto-shift and just print both as "5173 (or next free port)": rejected
  — fails FR-007's requirement to print each server's *expected* URL usefully; an unresolved
  "or" is not an expected URL a developer can click.

## Decision: `install` idempotency strategy

**Decision**: `just install <target>` always runs `npm install` for the target project(s)
(no `node_modules/`-existence pre-check).

**Rationale**: `npm install` is already idempotent and fast when `package-lock.json` and
`node_modules/` are already in sync (it's a no-op-equivalent dependency resolution check), and
always running it also handles the case where `package.json` changed since the last install —
which a manual `node_modules/`-only existence check would miss. This matches the task
description's own suggested simplification ("or just always run npm install since it's a no-op
fast-path when up to date; your call").

**Alternatives considered**:
- Skip `npm install` if `node_modules/` exists: rejected — faster on repeat runs, but silently
  stale if `package.json` changed without a corresponding `node_modules/` wipe; not worth the
  edge-case risk for a bootstrap command whose whole point is reliability.
