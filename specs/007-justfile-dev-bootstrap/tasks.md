# Tasks: Justfile Dev Bootstrap

**Input**: Design documents from `/specs/007-justfile-dev-bootstrap/`

**Prerequisites**: plan.md, spec.md, research.md, contracts/justfile-recipes.md, quickstart.md

**Tests**: Not applicable in the usual sense — this is a `justfile`, not application code with a
test framework. "Tests" here means the manual/scripted verification scenarios in quickstart.md,
folded into each user story's own verification task below (not a separate TDD phase).

**Organization**: Tasks are grouped by user story per spec.md's priorities (P1/P2/P3). Nearly
every implementation task edits the same single file (`justfile`), which this feature
deliberately keeps as one file — so `[P]` parallel markers are omitted throughout (same-file
edits cannot safely run in parallel).

## Path Conventions

Single new file at the repo root: `justfile` (sibling to `admin-api/`, `admin-ui/`,
`public-ui/`). Verification tasks also update `specs/007-justfile-dev-bootstrap/quickstart.md`.

---

## Phase 1: Setup

**Purpose**: Establish the file and its documented conventions before any recipe logic

- [X] T001 Create `justfile` at the repo root with: (a) a top-of-file comment documenting the
      generic-to-specific composite naming convention this file follows (per
      `research.md`'s "Multi-word recipe invocation" decision), (b) a brief README-style comment
      block explaining that `just dev up all` is the one-command bootstrap, and (c) a `default`
      recipe (runs with no arguments) that prints `just --list` plus a one-line pointer to
      `just dev up all`

**Checkpoint**: `just` (no args) runs and lists recipes (even though only `default` exists yet)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared building-block recipes both `dev up all` (US1) and the granular/
single-step usage (US3) depend on. Must be complete and individually working before layering the
`dev` recipe's `up` branches on top.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Implement the `install target` recipe in `justfile`: `case` dispatch on
      `all|admin-api|admin-ui|public-ui`, running `npm install` in the corresponding project
      director(y/ies) (always run, no `node_modules/` pre-check, per `research.md`), with a
      usage error to stderr + non-zero exit for any other target
- [X] T003 Implement the `env action` recipe in `justfile`: for `action=setup`, copy
      `admin-api/.dev.vars.example` → `admin-api/.dev.vars`, `admin-ui/.env.example` →
      `admin-ui/.env`, `public-ui/.env.example` → `public-ui/.env`, **only** when the destination
      does not already exist (never overwrite); warn (not fail) if a source `.example` is
      missing; usage error to stderr + non-zero exit for any other action
- [X] T004 Implement the `db subcommand target *args` recipe in `justfile`: `migrate local` runs
      `admin-api`'s `npm run db:migrate:local`; `seed books` runs `admin-api`'s
      `npm run db:seed:local`, parsing an optional `count=N` word out of `*args` and passing it
      through as `-- --count=N` only when present; usage error to stderr + non-zero exit for any
      other `subcommand target` combination

**Checkpoint**: `just install all`, `just env setup`, `just db migrate local`, and
`just db seed books [count=N]` all work standalone against this worktree's real projects

---

## Phase 3: User Story 1 - One-command full-stack bootstrap (Priority: P1) 🎯 MVP

**Goal**: `just dev up all` takes a fresh checkout to three running, reachable dev servers in one
command, and stopping it leaves no orphaned processes.

**Independent Test**: From a clean state (no deps, no env files, no local DB), run
`just dev up all`; confirm dependencies/env/DB are handled before servers start, all three
servers become reachable at their printed URLs, and Ctrl+C stops all three cleanly.

### Implementation for User Story 1

- [X] T005 [US1] In `justfile`, add the `dev subcommand target` recipe with its `up` subcommand
      dispatch, and implement the `all` target's prerequisite sequence: shell out to
      `just install all`, `just env setup`, `just db migrate local`, `just db seed books` in
      that order, then print all three expected URLs (`http://localhost:8787`,
      `http://localhost:5173`, `http://localhost:5174`) before touching any server process
- [X] T006 [US1] Extend the `up all` branch in `justfile` to start all three dev servers
      concurrently: a `#!/usr/bin/env bash` shebang recipe body, `set -euo pipefail` + `set -m`
      for per-job process groups, three backgrounded `(cd <project> && exec npm run dev ...) &`
      subshells (admin-ui and public-ui pinned to ports 5173/5174 via
      `-- --port <N> --strictPort`, admin-api left unmodified per `research.md`'s ports
      decision), recording each `$!` into a PID array, ending in a blocking `wait`
- [X] T007 [US1] Add a `trap` (INT, TERM, EXIT) in the `up all` branch that runs an idempotent
      cleanup function: signal each tracked PID's process group (`kill -TERM -$pid`, falling
      back to a plain `kill $pid`), `wait` for everything to actually exit, print a stop
      confirmation, and guard against running the cleanup body twice (a boolean flag) since
      INT/TERM and the script's own natural EXIT can both fire it
- [X] T008 [US1] Verify User Story 1 end-to-end against quickstart.md's Scenario 3: run
      `just dev up all` from a reset state (no `node_modules/`, no env files, no local D1 state)
      in the background with a timeout; confirm install → env → migrate → seed → printed URLs →
      server startup happens in that order; `curl` each of the three URLs and confirm a
      response; stop the run and confirm via `ps` that no `wrangler`/`vite`/`workerd`/`esbuild`
      process from this run remains; record the exact commands/output in
      `specs/007-justfile-dev-bootstrap/quickstart.md`'s "Actual verification run" section

**Checkpoint**: `just dev up all` is fully functional and independently testable — this alone is
a shippable MVP of the feature

---

## Phase 4: User Story 2 - Run a single project's dev server (Priority: P2)

**Goal**: `just dev up <project>` starts exactly one project's own dev server in the foreground,
without touching the other two or re-running install/env/migrate/seed.

**Independent Test**: With deps/env already in place, run `just dev up admin-api` (or
`admin-ui`/`public-ui`) and confirm only that one server starts and becomes reachable.

### Implementation for User Story 2

- [X] T009 [US2] Extend the `dev subcommand target` recipe's `up` dispatch in `justfile` with the
      `admin-api`, `admin-ui`, and `public-ui` targets: each prints its own expected URL
      (`http://localhost:8787` for admin-api; `http://localhost:5173` — Vite's unmodified
      default — for admin-ui and public-ui alike, since only one Vite instance runs in this
      path) then runs that project's own `npm run dev` unmodified in the foreground (no port
      pinning, no prerequisite steps); any target outside
      `admin-api|admin-ui|public-ui|all` is a usage error
- [X] T010 [US2] Verify User Story 2 against quickstart.md's Scenario 2: with dependencies/env
      already set up, run `just dev up admin-api`, `just dev up admin-ui`, and
      `just dev up public-ui` one at a time, confirming each is reachable at its printed URL and
      that no other project's server was started; record results in
      `specs/007-justfile-dev-bootstrap/quickstart.md`

**Checkpoint**: Both `dev up all` and each `dev up <project>` work; single-project runs don't
interfere with each other or re-trigger install/env/migrate/seed

---

## Phase 5: User Story 3 - Run individual setup steps independently (Priority: P3)

**Goal**: `install`, `env setup`, `db migrate local`, and `db seed books` are each safe to run in
isolation and to re-run, without requiring a full `dev up all` bootstrap.

**Independent Test**: Run each granular recipe on its own against a partially-set-up checkout;
confirm each performs only its own step and is idempotent.

### Verification for User Story 3

*(No new implementation — Phase 2's Foundational recipes already provide this behavior. This
phase exists to explicitly prove the idempotency/no-overwrite guarantees the spec requires.)*

- [X] T011 [US3] Verify User Story 3 against quickstart.md's Scenario 1: re-run `just install
      all` when dependencies already exist (no error/corruption); hand-edit a generated
      `.env`/`.dev.vars` file and re-run `just env setup` (edit survives untouched); re-run
      `just db migrate local` when already migrated (no error); re-run `just db seed books` when
      already seeded (row count unchanged, no duplicates); run `just db seed books count=5`
      against a reset DB (exactly 5 rows); record results in
      `specs/007-justfile-dev-bootstrap/quickstart.md`

**Checkpoint**: All three user stories independently verified

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final whole-feature verification matching the task's "Verify before opening a PR"
requirements, beyond what any single user story's verification covers in isolation

- [X] T012 Run the full clean-room-equivalent verification pass: `just install all`,
      `just env setup`, `just db migrate local`, `just db seed books`, then
      `wrangler d1 execute library-admin-db --local --command "SELECT COUNT(*) FROM books"` to
      confirm 30+ seeded books; start `just dev up all` in the background with a timeout, `curl`
      admin-api's `GET /books`, admin-ui's index page, and public-ui's index page to confirm all
      three are reachable; stop the run; confirm via `ps` that no orphaned process remains;
      finalize `specs/007-justfile-dev-bootstrap/quickstart.md`'s "Actual verification run"
      section with the exact commands and output from this pass
- [X] T013 Review `git diff --stat` against the feature branch's base to confirm no
      `admin-api`/`admin-ui`/`public-ui` application source file was modified by this feature
      (only `justfile`, `specs/007-justfile-dev-bootstrap/**`, and the already-committed
      prerequisite seed-script files are expected to differ from `master`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (the `justfile` must exist). BLOCKS all user
  stories — `install`/`env setup`/`db migrate local`/`db seed books` are used directly by US3
  and indirectly (via `dev up all`) by US1.
- **User Story 1 (Phase 3)**: Depends on Phase 2 (its `up all` branch calls `install`, `env`,
  and `db` directly).
- **User Story 2 (Phase 4)**: Depends on Phase 2 only (does not call `install`/`env`/`db` at
  all) — could be implemented before or in parallel with Phase 3 if desired, though both edit
  the same `dev` recipe block so sequential work on `justfile` is simpler in practice.
- **User Story 3 (Phase 5)**: Depends on Phase 2 only — pure verification, no new code.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete.

### Within Each Phase

Tasks are listed in the order they should be applied to `justfile` (each task edits/extends the
same recipe block the previous task in its phase started), so treat them as sequential even
though `[P]` markers are omitted throughout.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T004) — required by `dev up all` regardless.
3. Complete Phase 3: User Story 1 (T005–T008).
4. **STOP and VALIDATE**: `just dev up all` alone already satisfies the feature's core value
   proposition (SC-001, SC-003, SC-004) and is independently demoable.

### Incremental Delivery

1. Setup + Foundational → recipes usable individually.
2. User Story 1 → `just dev up all` works end-to-end (MVP).
3. User Story 2 → `just dev up <project>` works standalone.
4. User Story 3 → idempotency of every granular recipe explicitly verified.
5. Polish → whole-feature clean-room-equivalent verification, matching the task's PR-readiness
   bar.
