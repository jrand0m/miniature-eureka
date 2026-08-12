# Implementation Plan: Justfile Dev Bootstrap

**Branch**: `007-justfile-dev-bootstrap` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-justfile-dev-bootstrap/spec.md`

## Summary

Add a single root `justfile` (repo root, sibling to `admin-api/`, `admin-ui/`, `public-ui/`)
that wraps each of the three existing projects' own `npm`/`wrangler` scripts behind a small set
of composable, generically-to-specifically named `just` recipes, so a developer can bootstrap
the entire local environment — dependency install, env file creation, DB migration, DB seeding,
and all three dev servers running concurrently — with one command (`just dev up all`), or run
any individual step on its own. This introduces no new application code, API, or UI behavior;
it is orchestration only, implemented entirely in the `justfile`'s recipe bodies (POSIX shell,
matching `.specify/init-options.json`'s `"script": "sh"` convention already used by this repo's
Spec Kit tooling).

## Technical Context

**Language/Version**: POSIX `sh` recipe bodies inside a `justfile`, run by the `just` command
runner (any recent `just` — no version-specific features used beyond what's been stable for
years: recipe dependencies, `[no-cd]`/working-directory control via `cd` in recipe bodies,
`{{...}}` string interpolation, and shell `trap`/`&`/`wait`).

**Primary Dependencies**: `just` (must be pre-installed on the developer's machine — this repo
does not vendor or install it), plus the three existing per-project toolchains this feature
orchestrates but does not modify: `npm` (all three projects), `wrangler` (admin-api), `vite`
(admin-ui, public-ui).

**Storage**: N/A — no new storage; `just db migrate local` / `just db seed books` invoke
admin-api's existing `db:migrate:local` / `db:seed:local` npm scripts against the existing local
D1 database (`library-admin-db`, `wrangler dev`'s local SQLite-backed emulation).

**Testing**: No unit-test framework applies to a `justfile` — this is dev tooling. Verification
is manual/scripted end-to-end execution (see `quickstart.md`): run each recipe, run the full
bootstrap, confirm servers come up and the DB is seeded, confirm clean shutdown leaves no
orphaned processes.

**Target Platform**: Developer workstations (macOS/Linux primarily, matching the existing
`zsh`/`bash` shell assumptions already visible in this repo's tooling); recipe bodies use POSIX
`sh` constructs (`trap`, background `&`, `wait`) that are standard on both.

**Project Type**: Repo-root tooling/orchestration script (not a fourth "project" — it has no
build output, no deployment, and is explicitly out of scope for the constitution's three-project
separation, which governs deployable projects, not local dev scripts).

**Performance Goals**: N/A (dev tooling; no runtime performance target — success is "servers
become reachable in the time their own underlying tools normally take to start").

**Constraints**: Must never overwrite an existing `.env`/`.dev.vars` file (FR-002). Must not
leave orphaned `wrangler`/`vite` processes after `just dev up all` is interrupted (FR-008). Must
not modify any application source file, migration, or API/UI behavior (FR-011).

**Scale/Scope**: Exactly one new file at the repo root (`justfile`); no changes to
`admin-api`/`admin-ui`/`public-ui` application source. (The one pre-existing gap this feature
depends on — `admin-api`'s `db:seed:local` script — was brought in as a separate prerequisite
commit; see that commit's message for details. No further application changes are needed.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Separated Frontend & Backend Projects)**: PASS. This feature adds no new
  project and does not blur the three-project boundary — each `just dev up <project>` recipe
  simply shells out to that project's own already-independent `npm run dev`. No cross-project
  code sharing or new runtime coupling is introduced.
- **Principle II (Static-First Public Delivery)**: PASS / N/A. No change to how Public UI is
  built or what it calls at runtime; `just dev up public-ui` runs the exact same `vite` dev
  command the project already defines.
- **Principle III (Token-Protected Admin Access)**: PASS / N/A. No Admin API endpoint or auth
  behavior is touched.
- **Principle IV (Standards-Based Identity & Registration)**: N/A. No identity/auth code touched.
- **Principle V (Progressive Environments)**: PASS — directly advances this principle by making
  the single shared development environment easier to stand up from scratch.
- **Platform & Delivery Constraints — "Manual/local deploys to shared environments are
  prohibited outside of the initial dev bootstrap"**: PASS. This feature *is* the initial dev
  bootstrap tooling explicitly carved out by that sentence; every recipe operates purely
  locally (`wrangler dev`, `wrangler d1 ... --local`, `vite`) and deploys nothing.
- **Development Workflow — worktree/branch/PR rules**: Followed — this work is on its own
  branch (`007-justfile-dev-bootstrap`) in its own worktree, to be submitted as its own PR.

No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/007-justfile-dev-bootstrap/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command) — N/A, see note below
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command) — recipe contract, see below
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`data-model.md` is not generated: this feature introduces no data entities beyond the
already-documented "Project / Environment file / Local database" concepts in spec.md's Key
Entities, which are process/config concepts, not a data model. `contracts/` instead documents
the recipe surface (the `justfile`'s public interface to developers), which is the closest
analog to a "contract" for a CLI-style tool per the plan template's own guidance.

### Source Code (repository root)

```text
justfile                 # NEW — the only source file this feature adds

admin-api/
├── package.json         # unchanged by this feature (db:seed:local already present — see
│                         # prerequisite commit)
└── ...                  # unchanged

admin-ui/
└── ...                  # unchanged

public-ui/
└── ...                  # unchanged
```

**Structure Decision**: Single new file at the repo root (`justfile`), sibling to the three
existing project directories. This matches Option 1 (single project) from the template in
spirit — there is exactly one artifact — but it is not application source; it is a root-level
orchestration script, the natural location for a tool (`just`) that operates repo-wide.

## Complexity Tracking

*No violations — table omitted per template guidance ("Fill ONLY if Constitution Check has
violations that must be justified").*
