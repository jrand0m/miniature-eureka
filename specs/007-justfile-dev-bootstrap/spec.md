# Feature Specification: Justfile Dev Bootstrap

**Feature Branch**: `007-justfile-dev-bootstrap`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "A root `justfile` (repo root, sibling to admin-api/, admin-ui/, public-ui/) that makes local dev setup a single command: just install all / just install <project>, just env setup (copy .env.example/.dev.vars.example to .env/.dev.vars only if missing, never overwrite), just db migrate local, just db seed books [count=N], just dev up <project> (run that project's own dev script in foreground), and just dev up all as the one-command bootstrap — ensure deps installed, ensure env files exist, run db migrate local, run db seed books (full default list), then start all three dev servers concurrently in the same terminal session, backgrounded with proper SIGINT/SIGTERM trap so Ctrl+C kills all three cleanly with no orphaned processes. Print each server's expected local URL/port before starting. A default bare `just` recipe that lists recipes or points to `just dev up all`. This is FEAT-08, the last feature in the buildout — no API/UI behavior changes, pure dev tooling/scripting. Follow the just command naming convention: composite recipes ordered from generic to specific (e.g. `just db seed books`), documented in a top-of-file comment."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-command full-stack bootstrap (Priority: P1)

A developer who has just cloned the repository (or is returning to it after time away) wants every piece of local infrastructure — dependencies, environment files, the local database, seed data, and all three dev servers (admin-api, admin-ui, public-ui) — up and running with a single command, without needing to remember the project-specific sequence of `npm install`, copying env files, running migrations, seeding data, and starting three separate dev servers in three separate terminals.

**Why this priority**: This is the core value proposition of the feature. Without it, the rest of the recipes are just conveniences around a process the developer must still orchestrate by hand.

**Independent Test**: From a checkout with no `node_modules/`, no `.env`/`.dev.vars` files, and no local D1 database, run the single bootstrap command. Observe dependencies get installed, env files get created, the database gets migrated and seeded, and all three dev servers start and become reachable at their documented local URLs. Stopping the command (Ctrl+C) leaves no server processes running.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with none of the three projects' dependencies installed, **When** the developer runs the bootstrap command, **Then** dependencies are installed for all three projects before anything else happens.
2. **Given** no `.env`/`.dev.vars` files exist yet, **When** the developer runs the bootstrap command, **Then** each project's environment file is created from its example file.
3. **Given** dependencies and env files are in place, **When** the developer runs the bootstrap command, **Then** the local database is migrated and then seeded with the full curated book list before any dev server starts.
4. **Given** migrations and seeding have completed, **When** the developer runs the bootstrap command, **Then** all three dev servers (API and both UIs) start and each becomes reachable at its expected local URL, and the command prints each server's URL before starting them.
5. **Given** the bootstrap command is running with all three servers up, **When** the developer sends an interrupt (Ctrl+C), **Then** all three server processes are stopped and no orphaned server process remains running afterward.

---

### User Story 2 - Run a single project's dev server (Priority: P2)

A developer who already has the environment fully bootstrapped, and only wants to restart or inspect one project (e.g. after switching branches and only needing the API), wants to start just that one project's dev server without re-installing dependencies, re-copying env files, or re-running migrations/seeding.

**Why this priority**: Common day-to-day workflow once the environment is already set up; saves time versus re-running the full bootstrap, and lets a developer run just the piece they're working on alongside servers they've started some other way.

**Independent Test**: With dependencies and env already in place, run the single-project command for one project (e.g. admin-api) and confirm only that project's dev server starts, runs in the foreground, and is reachable at its expected local URL.

**Acceptance Scenarios**:

1. **Given** dependencies are installed, **When** the developer runs the single-project dev command for a given project, **Then** only that project's own dev server starts, in the foreground, without touching the other two projects.

---

### User Story 3 - Run individual setup steps independently (Priority: P3)

A developer troubleshooting local setup, or scripting CI-adjacent tooling, wants to run individual bootstrap steps (install dependencies, create env files, run migrations, seed data) on their own, in isolation, to diagnose or redo just one step without re-running the whole bootstrap.

**Why this priority**: Supports debugging and partial re-runs (e.g. "my env file is fine, I just need to re-migrate") but is not required for the primary one-command value proposition to exist.

**Independent Test**: Run each granular command (install, env setup, db migrate, db seed) on its own against a partially-set-up checkout and confirm each performs only its own step, is safe to re-run, and does not require the others to have run first (beyond the underlying tool's own natural prerequisites, e.g. migrations must exist before seeding can find a table to write to).

**Acceptance Scenarios**:

1. **Given** dependencies are already installed, **When** the developer re-runs the install command, **Then** it completes without error and without duplicating or corrupting `node_modules/`.
2. **Given** a project's env file already exists and has been customized, **When** the developer re-runs the env setup command, **Then** the existing customized file is left untouched.
3. **Given** the database has already been migrated, **When** the developer re-runs the migrate command, **Then** it completes without error (already-applied migrations are not re-applied).
4. **Given** the database has already been seeded, **When** the developer re-runs the seed command, **Then** no duplicate rows are created.
5. **Given** the developer wants a smaller seed dataset, **When** the developer runs the seed command with an explicit count, **Then** only that many books are seeded (up to the size of the curated list).

---

### Edge Cases

- What happens when a developer runs `just dev up all` a second time while dependencies are already installed and env files already exist? Installation and env setup steps must be safe no-ops (or fast idempotent re-runs); migration and seeding must not fail or duplicate data; servers must still start.
- What happens when the developer runs the bootstrap command while one of the three dev server ports is already occupied by another process (e.g. a previous run's server didn't shut down cleanly)? The affected server's own tooling will report its own port-in-use failure; this feature is not responsible for detecting or resolving port conflicts, only for not leaving its own previously-started processes orphaned.
- What happens when the developer interrupts the bootstrap command while dependency installation, migration, or seeding is still in progress (before any dev server has started)? The interrupt must still stop the in-progress step's process cleanly without leaving background dev-server processes running (since none were started yet).
- What happens if `just db seed books` is run before `just db migrate local` (no `books` table yet)? The underlying seed tooling reports its own clear failure; this feature does not need to special-case that ordering beyond documenting the expected order in the bootstrap sequence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single command that installs dependencies for all three projects (admin-api, admin-ui, public-ui) in one invocation, and MUST also provide a way to install dependencies for one named project at a time.
- **FR-002**: The system MUST provide a single command that, for each of the three projects, creates that project's local environment/secrets file from its committed example file, and MUST NOT overwrite an existing local environment/secrets file that already has content a developer may have customized.
- **FR-003**: The system MUST provide a command that applies pending local database migrations.
- **FR-004**: The system MUST provide a command that seeds the local database with book data, defaulting to the full curated dataset when no size is specified, and accepting an optional parameter to seed a smaller number of books when one is specified.
- **FR-005**: The system MUST provide a command that starts a single named project's own local dev server in the foreground, for each of the three projects individually.
- **FR-006**: The system MUST provide one command that performs the complete bootstrap sequence in order — install all dependencies, ensure all environment files exist, migrate the local database, seed the local database with the full default dataset, then start all three dev servers — such that a developer starting from a clean checkout reaches a fully running local environment with a single invocation.
- **FR-007**: When the complete bootstrap command starts the three dev servers, it MUST run them concurrently (not sequentially) within the same invocation, and MUST print each server's expected local URL before starting the servers, so the developer knows where to find each one without reading tool output.
- **FR-008**: When the complete bootstrap command is interrupted by the developer (e.g. Ctrl+C) while the dev servers are running, the system MUST stop all three dev server processes it started, leaving no orphaned server processes running afterward.
- **FR-009**: The system MUST provide a default command (invoked with no arguments) that helps a developer discover the available commands or points them directly at the complete bootstrap command.
- **FR-010**: Every command the system provides MUST follow a consistent naming convention, ordered from a general category to a more specific action (e.g. a database-related action is grouped under a shared "db" category, a dev-server action under a shared "dev" category), and this convention MUST be documented at the top of the command definitions file.
- **FR-011**: The commands MUST NOT modify any backend or frontend application behavior — they orchestrate existing per-project install/build/migrate/seed/dev scripts only, without introducing new application code paths.

### Key Entities

- **Project**: One of the three buildable units in the repository (admin-api, admin-ui, public-ui), each with its own dependency manifest, environment example file, and existing dev/build scripts that this feature orchestrates but does not modify.
- **Environment file**: A local, git-ignored file (per project) holding developer-specific configuration/secrets, created from a committed `.example` template the first time it's needed, and never overwritten once present.
- **Local database**: The project's local D1 database instance, which this feature migrates (schema) and seeds (sample book data) via each project's existing scripts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with a fresh checkout can go from an empty local environment to all three dev servers running and reachable using exactly one command.
- **SC-002**: Re-running the full bootstrap command against an already-set-up environment completes successfully with no errors and no duplicated seed data.
- **SC-003**: Stopping the full bootstrap command leaves zero dev server processes running, verified by process inspection after the stop.
- **SC-004**: A developer can identify the correct local URL for each of the three servers without consulting any file other than the bootstrap command's own printed output.
- **SC-005**: A developer needing only one project's dev server, with the environment already set up, can start it with a single command that does not affect the other two projects.

## Assumptions

- The three existing projects (admin-api, admin-ui, public-ui) already have their own working `install`/`dev`/migrate/seed scripts (via `npm`/`wrangler`) that this feature orchestrates rather than reimplements; this feature adds no new application-level functionality.
- "Local database" refers to the existing local D1 database used by `wrangler dev`/`wrangler d1` tooling, already configured in `admin-api`; this feature does not introduce new database infrastructure.
- The developer's shell environment has `just`, `npm`, and `node` available; installing those tools themselves is out of scope.
- The default book-seed size and the ability to override it with a smaller count are provided by the existing seed tooling this feature invokes; this feature only needs to pass an optional count through, not implement seeding logic itself.
- Concurrency/process-group management for the "start all three servers, stop all three together" behavior is an implementation concern for the planning phase; the spec only requires the observable behavior (all start, all stop together, no orphans).
- This is dev-only tooling; it is not deployed, not part of the production build, and has no security/compliance surface beyond not silently overwriting a developer's existing secrets.
