# Phase 0 Research: Book Catalog & Public Search

All unknowns from the feature description were resolved during `/speckit-specify` (Assumptions
section) and `/speckit-clarify` (Clarifications section) — this feature reuses the existing
codebase's stack end-to-end, so there are no open technology-choice questions. This document
records the decisions and their rationale for traceability.

## Decision: Pagination shape

- **Decision**: Offset-based pagination via `limit` and `offset` query parameters on
  `GET /books`. Default `limit` is 20 when omitted; values above 100 are clamped to 100; `offset`
  defaults to 0.
- **Rationale**: D1 is SQLite, whose `LIMIT`/`OFFSET` clauses map directly onto this shape with
  no extra bookkeeping. The codebase has no existing cursor-pagination convention to match
  instead (feature 001's `GET /admin/users` returns its full list unpaginated), and at this
  project's stated scale (hundreds to low thousands of books) offset pagination's well-known
  "skipped/duplicated row on concurrent insert" weakness is not a practical concern — the catalog
  is read-only for regular visitors and updated only by a separate, later admin feature.
- **Alternatives considered**: Cursor/keyset pagination (opaque token encoding the last-seen
  sort key) — more robust under concurrent writes and avoids the O(offset) scan cost of large
  offsets, but adds encoding/decoding complexity and a new convention with no precedent
  elsewhere in this codebase, for no benefit at the stated scale. Rejected as premature for this
  iteration; can be revisited if the catalog grows far beyond current scope.

## Decision: Search matching

- **Decision**: `title` and `author` are independent, optional query parameters; when supplied,
  each is matched via a case-insensitive `LIKE '%term%'` (SQLite `LIKE` is case-insensitive for
  ASCII by default) against the corresponding column. When both are supplied, results must match
  both (AND).
- **Rationale**: Directly satisfies FR-003 and the spec's edge case for combined filters, using
  SQL's native `LIKE` rather than a bespoke matching layer — consistent with the codebase's
  existing pattern of simple, direct D1 queries in `services/*.ts` (e.g. `users.ts`'s
  `WHERE email = ?1 COLLATE NOCASE`).
- **Alternatives considered**: A single free-text `q` parameter matching title OR author — ruled
  out because the spec (Assumptions) explicitly scopes matching to independent per-field terms
  for this iteration, not a combined free-text mode.

## Decision: Response shape / field naming

- **Decision**: JSON responses use camelCase field names (`quantityTotal`, `quantityAvailable`,
  `createdAt`, etc.), matching the existing `GET /admin/users` response shape
  (`registeredAt`, `lastLoginAt`) in `admin-api/src/routes/users.ts`.
- **Rationale**: Consistency with the one existing precedent in this codebase for translating
  D1's `snake_case` columns to API JSON.
- **Alternatives considered**: Passing through raw `snake_case` column names — rejected as
  inconsistent with the existing `/admin/users` contract.

## Decision: No automated test suite added

- **Decision**: This feature does not add a test framework, `tests/` directory, or automated
  test files to `admin-api` or `public-ui`.
- **Rationale**: Neither project currently has a test runner configured (`admin-api/package.json`
  and `public-ui/package.json` have no `test` script and no test-framework dependency), and no
  `tests/` directory exists in the repository despite one being sketched in feature 001's
  `plan.md` — it was never actually implemented for that feature either. Introducing a full test
  framework is a cross-cutting infrastructure decision out of scope for a single feature and best
  handled by its own future setup task; this feature instead relies on `tsc --noEmit` typechecks
  (already the project's CI gate per `justfile`/CI config) plus a documented manual
  `wrangler dev` + `curl` verification pass in `quickstart.md`.
- **Alternatives considered**: Standing up Vitest for `admin-api` just for this feature — rejected
  as disproportionate scope creep for a read-only, two-endpoint feature; better done later as its
  own cross-project testing-infrastructure feature if desired.
