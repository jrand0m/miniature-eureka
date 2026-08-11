# Phase 0 Research: Account Login, Registration & Admin User Management

## 1. Backend HTTP framework on Cloudflare Workers

**Decision**: Hono.

**Rationale**: Purpose-built for Workers/edge runtimes, zero cold-start overhead beyond the
Worker itself, small enough to stay well within Workers' bundle-size limits on the free tier,
and gives typed routing/middleware for the auth and admin-user routes without pulling in a
Node-oriented framework that doesn't run natively on Workers.

**Alternatives considered**:
- Raw `fetch` handler with manual path matching — sufficient for ~5 routes but pushes
  boilerplate (body parsing, error shaping) into every route; rejected for maintainability.
- itty-router — smaller than Hono but offers materially less out of the box (no built-in
  JSON helpers/middleware chain); rejected since Hono's extra weight is negligible on Workers.

## 2. Data storage

**Decision**: Cloudflare D1 (SQLite), a single `users` table.

**Rationale**: D1's free tier (5 GB storage, generous daily row read/write allowance) comfortably
covers a single library's user base. A relational table is a natural fit for the admin user list
(sortable by registration/last-login date) — something KV's key-value model handles awkwardly.

**Alternatives considered**:
- Cloudflare KV — rejected: no efficient way to list/sort all users for the Admin UI without
  maintaining a separate index structure, adding complexity for no benefit at this scale.
- Durable Objects — rejected: designed for strongly-consistent per-entity state and
  coordination; overkill for a single low-volume relational table.

## 3. Password storage

**Decision**: PBKDF2-HMAC-SHA256 (high iteration count) via the Workers runtime's native
`crypto.subtle` (Web Crypto API), with a random per-user salt stored alongside the hash.

**Rationale**: Available natively in the Workers runtime with no WASM/npm dependency, satisfies
Constitution Principle IV's "modern KDF" requirement, and keeps the deployed bundle small (a
concern under Workers' free-tier size limits).

**Alternatives considered**:
- bcrypt/argon2 via a WASM package — stronger in isolation, but adds bundle weight and a
  non-native dependency for marginal benefit at this scale; can be revisited later if a security
  review calls for it.

## 4. Auth token strategy

**Decision**: Stateless, HMAC-signed, expiring bearer tokens (compact payload + signature,
verified per request via `crypto.subtle.verify`). No server-side sessions table. Token lifetime:
24 hours. "Logout" deletes the token client-side; the Admin API does not maintain a revocation
list for v1.

**Rationale**: Matches Constitution Principle III's example mechanism ("signed bearer tokens")
without needing an extra D1 table or write volume for session bookkeeping. The spec's own
Assumptions section already accepts that disabling a user blocks *future* logins rather than
force-ending an active session — the same reasoning extends to logout: once a token is
discarded by the client, reaching the system again requires a fresh login, which is what User
Story 2 requires. The 24-hour lifetime bounds how long a discarded-but-technically-valid token
could theoretically still verify if it leaked.

**Alternatives considered**:
- Server-side session table in D1 (session id, user id, expiry) — enables true server-side
  logout/revocation, but adds a table and a write on every login for a benefit (instant
  revocation) the spec explicitly doesn't require yet; deferred.
- Full JWT library (e.g., a JOSE package) — more standardized claim handling, but adds
  dependency weight for a token carrying only `sub`, `role`, and `exp`; a minimal hand-rolled
  signed payload covers this with less surface area. Revisit if token claims grow.

## 5. Frontend build/hosting

**Decision**: Vite for both `public-ui/` and `admin-ui/`, producing plain static HTML/CSS/JS
output, deployed to Cloudflare Pages.

**Rationale**: Produces a fully static build with no server runtime, satisfying Principle II's
hosting constraint while still allowing the shipped JS to make client-side `fetch` calls to the
backend for auth (per the planning clarification). Keeps both frontends on the same simple
toolchain.

**Alternatives considered**:
- Next.js/SvelteKit/Nuxt with SSR — rejected: reintroduces a server-rendering runtime, directly
  conflicting with Principle II even under the clarified reading.
- Same frameworks in static-export mode — viable, but heavier tooling than needed for what are,
  for this feature, a handful of forms and a table; plain Vite keeps the bundle and build
  simpler for a project this size.

## 6. Testing approach

**Decision**: Vitest + `@cloudflare/vitest-pool-workers` for `admin-api/` (runs tests inside a
real Workers-like runtime, including D1 bindings); Vitest + Testing Library for frontend unit
tests in both static projects; Playwright for the end-to-end scenarios in quickstart.md.

**Rationale**: `@cloudflare/vitest-pool-workers` is the maintained, Workers-accurate way to test
code that depends on Workers-only APIs (D1 bindings, `crypto.subtle` in that runtime) without
mocking them away. Playwright covers the real cross-project flow (register in `public-ui/`, then
verify in `admin-ui/`).

**Alternatives considered**:
- Plain Jest with mocked bindings — rejected: mocking D1/Workers APIs risks tests passing while
  the real deployed behavior differs, which is exactly the mismatch the project's testing
  approach should avoid at this scale.

## 7. CI/CD

**Decision**: One GitHub Actions workflow per project (three total), per Constitution's
Development Workflow section — `admin-api` deploys via Wrangler, `public-ui`/`admin-ui` build
with Vite and deploy to Cloudflare Pages.

**Rationale**: Directly required by the constitution; keeping one workflow per project preserves
independent deployability (Principle I) instead of one monolithic pipeline that couples releases.

**Alternatives considered**: A single combined workflow — rejected as it couples deploys of
independently-versioned projects, against Principle I's intent.
