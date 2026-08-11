<!--
Sync Impact Report
Version change: 1.2.0 → 1.3.0
Modified principles: I. Separated Frontend & Backend Projects (broadened the Admin API's
  permitted unauthenticated/public surface); II. Static-First Public Delivery (broadened what
  browser JS in the static bundle MAY call at runtime to match Principle I)
Added sections: none — introduced and defined the "public library surface" concept within the
  existing Principle I text (unauthenticated book browse/search endpoints, plus authenticated
  end-user endpoints gated by the requireAuth pattern covering a signed-in user's own
  reservations, return requests, and notification stream/inbox), and referenced it from
  Principle II. The Public UI's prohibition on calling admin-scoped (/admin/*) endpoints is
  retained and made explicit.
Removed sections: none
Templates requiring updates: ⚠ pending — plan/spec/tasks templates read this constitution at
  runtime; no template files were modified by this command per the constitution scope guard.
Follow-up TODOs: none — see Next Actions for the deferred, non-governance implementation work
  (book browse/search, user reservations, user-initiated returns, admin inventory/oversight, and
  a per-user SSE notification stream).
-->

# Library Platform Constitution
<!-- Working title; rename here if a different product name is preferred. -->

## Core Principles

### I. Separated Frontend & Backend Projects
The system MUST be split into three independently deployable projects: (1) a Public UI,
(2) an Admin API, and (3) an Admin UI. Each project MUST build and deploy independently, with
no shared runtime process. The Admin API is the system's single backend: in addition to its
token-protected administrative endpoints (`/admin/*`), it MAY expose a **public library
surface** consisting of (a) a small, narrowly-scoped set of unauthenticated account endpoints
(e.g., registration, login, logout), (b) unauthenticated, read-only book browse/search endpoints
over the catalog, and (c) authenticated end-user endpoints gated by a valid user auth token
(the `requireAuth` pattern, distinct from the admin-only `requireAdminToken` pattern) that let a
signed-in user act on their own data — creating, viewing, and cancelling their own reservations,
requesting returns, and reading their own notification stream/inbox. The Admin UI MUST
communicate with the system exclusively through the Admin API — it MUST NOT access any datastore
or backend logic directly — and the Public UI MUST NOT call any backend other than the Admin
API's public library surface; the Public UI MUST NOT call any admin-scoped (`/admin/*`) endpoint.
**Rationale**: Independent deployability lets each surface evolve, scale, and fail
independently, and keeps the trust boundary between public-facing and administrative surfaces
explicit; letting one backend expose a public library surface (self-service account, catalog,
and a signed-in user's own actions) alongside a protected administrative surface avoids standing
up additional projects while still drawing a hard line at admin-scoped endpoints.

### II. Static-First Public Delivery
The Public UI MUST be compiled ahead of time into static assets (HTML/CSS/JS) and served,
unchanged, from Cloudflare Pages — never from a server-rendering or compute runtime. This
principle constrains the hosting/build layer, not the browser: JavaScript shipped in the static
bundle MAY make runtime calls, from the visitor's browser, to the Admin API's public library
surface as defined in Principle I — the unauthenticated account and catalog endpoints, and, once
the visitor holds a valid user auth token, the authenticated endpoints for their own
reservations, returns, and notifications. Every other page and every other piece of content MUST
be resolved at build time; the Public UI MUST NOT depend on server-side rendering and MUST NOT
call any backend endpoint beyond that publicly-documented public library surface — in
particular, it MUST NOT call any admin-scoped (`/admin/*`) endpoint.
**Rationale**: A statically hosted public surface has no server runtime to attack, needs no
scaling logic, and fits entirely within a free hosting tier; permitting browser-initiated calls
to the account, catalog, and the caller's own authenticated actions is what makes self-service
login/registration, browsing, reservations, returns, and notifications possible without
reintroducing server-side rendering or a fourth project.

### III. Token-Protected Admin Access (NON-NEGOTIABLE)
All Admin API endpoints MUST require token-based authentication using a standard, well-reviewed
mechanism (e.g., signed bearer tokens). Custom or home-grown auth schemes are prohibited. For
the initial phase, a single hardcoded administrator account MAY be used to bootstrap the
system, but this exception MUST be clearly marked in code and removed once real account
management ships.
**Rationale**: Admin capability is the highest-privilege surface in the system; it must never
be left unauthenticated, even temporarily, while still allowing an honest, fast bootstrap path.

### IV. Standards-Based Identity & Registration
Any user registration, login, or session/token issuance MUST follow established, widely
reviewed security practices (e.g., password hashing via a modern KDF, signed/expiring tokens,
HTTPS-only transport). Rolling custom cryptography or ad hoc session schemes is prohibited.
**Rationale**: Identity handling is where informal shortcuts create the most severe and
hardest-to-detect vulnerabilities.

### V. Progressive Environments
The system MUST be deliverable and demonstrable from a single development environment before
any production environment is introduced. Production readiness (scaling, custom domains,
hardened secrets, monitoring) is an explicit, later expansion — not a prerequisite for initial
delivery.
**Rationale**: Avoids over-building infrastructure before the core admin/public/API split is
proven end-to-end.

## Platform & Delivery Constraints

- **Hosting/runtime**: The Admin API MUST run on Cloudflare Workers. Both the Public UI and the
  Admin UI MUST be compiled to static assets and served from Cloudflare Pages — neither frontend
  runs on Workers or any other compute runtime; only the Admin API does.
- **Data storage**: Any persistent store used by the Admin API MUST fit within Cloudflare's
  free-tier limits (e.g., D1, KV, or R2 as applicable). Usage MUST be checked against free-tier
  quotas before adding features that increase read/write volume.
- **CI/CD**: All builds, tests, and deployments for the Public UI, Admin API, and Admin UI MUST
  run through GitHub Actions pipelines. Every pull request MUST run its affected project's tests
  and prerequisite checks (build, typecheck, and any other configured checks); a pull request
  MUST NOT be merged while those checks are failing. Merging a pull request into `master` MUST
  automatically trigger deployment of the affected project(s) to Cloudflare. Manual/local deploys
  to shared environments are prohibited outside of the initial dev bootstrap.

## Development Workflow

- Work starts against a single shared development environment for all three projects.
- Every unit of work MUST be done in its own git worktree on its own branch — work MUST NOT be
  done directly against `master` in the repository's primary working directory.
- Every unit of work MUST be submitted as its own pull request into `master`; direct commits or
  pushes to `master` are prohibited except for the initial repository bootstrap.
- Promotion to a production environment is a deliberate, later milestone and MUST be planned as
  its own feature/spec rather than assumed as part of day-one work.
- Each of the three projects (Public UI, Admin API, Admin UI) MUST have its own workspace and
  its own GitHub Actions workflow, even while sharing a single dev environment target.

## Governance

This constitution supersedes ad hoc technical decisions for this project. Any change to a Core
Principle, or to the Platform & Delivery Constraints, requires an amendment to this file with an
updated Sync Impact Report.

- **Amendment procedure**: Propose the change via `/speckit-constitution`, update this file,
  bump the version per the policy below, and record the change in the Sync Impact Report at the
  top of the file.
- **Versioning policy**: MAJOR for backward-incompatible principle removals/redefinitions;
  MINOR for new principles or materially expanded guidance; PATCH for clarifications and wording
  fixes.
- **Compliance review**: Every `/speckit-plan` and `/speckit-implement` run MUST check its
  approach against these principles — in particular the three-project separation (Principle I),
  the static-only Public UI (Principle II), and the token-protected Admin API (Principle III).

**Version**: 1.3.0 | **Ratified**: 2026-08-11 | **Last Amended**: 2026-08-11
