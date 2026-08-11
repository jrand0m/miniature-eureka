<!--
Sync Impact Report
Version change: [TEMPLATE] → 1.0.0
Modified principles: n/a (initial ratification — all principles newly defined)
Added sections: Core Principles (I–V), Platform & Delivery Constraints, Development Workflow, Governance
Removed sections: none
Templates requiring updates: ⚠ pending — plan/spec/tasks templates read this constitution at runtime;
  no template files were modified by this command per the constitution scope guard.
Follow-up TODOs: none
-->

# Library Platform Constitution
<!-- Working title; rename here if a different product name is preferred. -->

## Core Principles

### I. Separated Frontend & Backend Projects
The system MUST be split into three independently deployable projects: (1) a Public UI,
(2) an Admin API, and (3) an Admin UI. Each project MUST build and deploy independently, with
no shared runtime process. The Admin UI MUST communicate with the system exclusively through
the Admin API — it MUST NOT access any datastore or backend logic directly.
**Rationale**: Independent deployability lets each surface evolve, scale, and fail
independently, and keeps the trust boundary between public-facing and administrative surfaces
explicit.

### II. Static-First Public Delivery
The Public UI MUST be compiled ahead of time into static assets (HTML/CSS/JS) and served as a
static site with no server-side or runtime computation. Any data the Public UI needs MUST be
resolved at build time; the Public UI MUST NOT call authenticated or computed backend endpoints
at request time.
**Rationale**: A static public surface has no runtime attack surface, needs no scaling logic,
and fits entirely within a free hosting tier.

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

- **Hosting/runtime**: The Admin API MUST run on Cloudflare Workers. The Public UI MUST be
  served as static assets via Cloudflare's static hosting.
- **Data storage**: Any persistent store used by the Admin API MUST fit within Cloudflare's
  free-tier limits (e.g., D1, KV, or R2 as applicable). Usage MUST be checked against free-tier
  quotas before adding features that increase read/write volume.
- **CI/CD**: All builds, tests, and deployments for the Public UI, Admin API, and Admin UI MUST
  run through GitHub Actions pipelines. Manual/local deploys to shared environments are
  prohibited outside of the initial dev bootstrap.

## Development Workflow

- Work starts against a single shared development environment for all three projects.
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

**Version**: 1.0.0 | **Ratified**: 2026-08-11 | **Last Amended**: 2026-08-11
