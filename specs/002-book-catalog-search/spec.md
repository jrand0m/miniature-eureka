# Feature Specification: Book Catalog & Public Search

**Feature Branch**: `002-book-catalog-search`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Build the book catalog and public search: a new D1 migration creating a `books` table (id, title, author, isbn nullable, description nullable, quantity_total, quantity_available, created_at; no seed data); Admin API unauthenticated `GET /books` (search/filter by title and/or author, case-insensitive partial match, paginated) and `GET /books/:id` (404 if missing); a Public UI browse/search page with a search box and a paginated results list showing title/author/available-quantity. Follows the constitution's public library surface (unauthenticated book browse/search) and the existing routes/services + Public UI page/client conventions."

## Clarifications

### Session 2026-08-11

*Run unattended (no reviewer available to answer interactively); each question below was
self-answered using the most conventional choice for this codebase's existing patterns, per
task instructions. Recorded here for traceability instead of via an interactive Q&A loop.*

- Q: What pagination mechanism should the catalog list use? → A: Offset-based pagination via
  `limit`/`offset` query parameters (not an opaque cursor token) — simplest, matches D1's
  SQL `LIMIT`/`OFFSET`, and there is no existing cursor-pagination convention elsewhere in this
  codebase to follow instead.
- Q: What are the default and maximum page sizes? → A: Default page size 20 when `limit` is
  omitted; maximum accepted `limit` is 100 (requests above 100 are clamped to 100, not rejected).
- Q: What are the search query parameter names? → A: `title` and `author` (each optional,
  case-insensitive partial/substring match against the respective field), alongside `limit` and
  `offset` for pagination — plain, self-describing query parameter names consistent with the
  existing Admin API's plain JSON request/response style.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and Search the Catalog (Priority: P1)

Any visitor — logged in or not — can open the Public UI, see books in the library's catalog, and
narrow the list by typing part of a title or author's name, without needing an account.

**Why this priority**: Browsing/searching the catalog is the foundation every other library
feature (reservations, returns) is built on; without it there is nothing for a visitor to act on.

**Independent Test**: Can be fully tested by opening the Public UI's browse page with no session
and confirming a list of books appears, then typing a partial title or author into the search box
and confirming the list narrows to matching books only.

**Acceptance Scenarios**:

1. **Given** the catalog contains books, **When** a visitor opens the browse page with no search
   terms, **Then** a list of books is shown with, for each book, its title, author, and current
   available quantity.
2. **Given** the catalog contains a book titled "The Great Gatsby", **When** a visitor searches
   for "gatsby" (any letter casing) or "great", **Then** that book appears in the results.
3. **Given** the catalog contains a book by author "Jane Austen", **When** a visitor searches for
   "austen" (any letter casing), **Then** that book appears in the results.
4. **Given** a search term that matches no title or author, **When** a visitor submits it,
   **Then** the results list is empty and the visitor is shown a clear "no results" state rather
   than an error.

---

### User Story 2 - Paginated Browsing of a Large Catalog (Priority: P2)

A visitor browsing or searching a catalog with more books than fit on one screen can move through
the results in manageable pages instead of receiving the entire catalog at once.

**Why this priority**: Keeps both the visitor's experience and the system's response times
reasonable as the catalog grows; not required for a catalog small enough to fit on one page, so it
is secondary to basic browse/search.

**Independent Test**: Can be fully tested by seeding more books than one page holds, confirming
the first page shows only a bounded number of results, and confirming a "next" action reveals the
remaining books without repeats or omissions.

**Acceptance Scenarios**:

1. **Given** more books exist than fit on a single page of results, **When** a visitor opens the
   browse page, **Then** only the first page of results is shown along with a way to view more.
2. **Given** a visitor is viewing a page of results, **When** they request the next page, **Then**
   they see the next set of books, distinct from the ones already shown.
3. **Given** a visitor has narrowed results with a search term, **When** they page through
   results, **Then** pagination applies to the filtered set, not the full catalog.

---

### User Story 3 - Look Up a Single Book's Detail (Priority: P3)

A system (or, later, another feature such as reservations) can retrieve the full detail of one
specific book by its identifier, including fields not shown in the list view such as its
description and ISBN.

**Why this priority**: Not required for the browse/search list view itself, but establishes the
per-book lookup other, later features (book detail page, reservations) will depend on; lowest
priority because the spec's UI requirement is satisfied by the list view alone.

**Independent Test**: Can be fully tested by requesting a known book's identifier and confirming
its full detail is returned, and by requesting an identifier that does not exist and confirming a
clear "not found" outcome.

**Acceptance Scenarios**:

1. **Given** a book exists in the catalog, **When** its identifier is looked up, **Then** its full
   detail (title, author, ISBN, description, total quantity, available quantity) is returned.
2. **Given** no book exists for a given identifier, **When** that identifier is looked up,
   **Then** a clear "not found" outcome is returned and no partial or default data is fabricated.

---

### Edge Cases

- What happens when the search term contains no matches? → An empty result set is returned/shown,
  not an error (User Story 1, Scenario 4).
- What happens when the search term is empty or omitted? → The full catalog is returned, subject
  to pagination (equivalent to User Story 1, Scenario 1).
- What happens when a requested page is beyond the last page of results? → An empty result set is
  returned, not an error.
- What happens when both a title term and an author term are supplied together? → Results match
  books satisfying both filters (books whose title matches the title term AND whose author matches
  the author term).
- What happens when a book has zero available quantity? → It still appears in browse/search
  results (it exists in the catalog); available quantity is simply shown as zero. Hiding
  fully-unavailable books, or otherwise acting on availability, is out of scope for this feature.
- What happens when a book's ISBN or description was never recorded? → The list/detail views show
  those fields as absent rather than a placeholder value.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a catalog of books, each with a title, an author, an optional
  ISBN, an optional description, a total quantity owned, and a quantity currently available.
- **FR-002**: System MUST allow any visitor, without an account or session, to retrieve a list of
  books in the catalog.
- **FR-003**: System MUST allow a visitor to narrow the book list by a title search term, by an
  author search term, or by both together, matching case-insensitively on any part of the
  respective field (partial match, not exact match).
- **FR-004**: System MUST return catalog list results in bounded pages rather than the entire
  catalog at once, using an offset-based `limit`/`offset` page shape (default `limit` 20, maximum
  accepted `limit` 100), and MUST allow a visitor to retrieve subsequent pages by advancing
  `offset`.
- **FR-005**: System MUST allow any visitor, without an account or session, to retrieve the full
  detail of a single book by its identifier.
- **FR-006**: System MUST return a clear "not found" outcome when a single-book lookup is made for
  an identifier that does not exist in the catalog, without fabricating placeholder data.
- **FR-007**: System MUST NOT require authentication or any admin credential for either the
  catalog list/search capability or the single-book detail capability (this is part of the
  public library surface).
- **FR-008**: The catalog's available quantity for a book MUST NOT exceed that book's total
  quantity, and neither value MUST be negative.
- **FR-009**: Public UI MUST provide a page where a visitor can enter a search term, see the
  resulting list of books (each showing at least title, author, and available quantity), and move
  between pages of results.
- **FR-010**: This feature MUST NOT introduce any way, for any actor, to create, edit, or delete
  catalog entries, or to change a book's quantities — the catalog is populated and maintained by
  separate, later features. This feature is read-only.

### Key Entities

- **Book**: A single title held by the library — title, author, optional ISBN, optional
  description, total quantity owned by the library, quantity currently available to reserve/loan,
  and the date it was added to the catalog. Quantities are whole, non-negative numbers, and
  available quantity never exceeds total quantity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can go from opening the browse page to seeing a relevant, narrowed list of
  books in under 10 seconds, with no login step involved.
- **SC-002**: 100% of searches for a title or author substring that exists in the catalog return
  every matching book, regardless of the letter casing used in the search term.
- **SC-003**: A catalog of any size can be browsed page by page without the visitor ever receiving
  an unbounded, single-page dump of the entire catalog.
- **SC-004**: 100% of single-book lookups for a nonexistent identifier return a clear "not found"
  outcome rather than an error page or fabricated data.
- **SC-005**: 0 catalog entries can be created, changed, or removed through this feature's
  surfaces (list, search, or detail lookup are all read-only).

## Assumptions

- No seed/test data is populated by this feature; the `books` table starts empty and a separate,
  later feature is responsible for backfilling real catalog data (per the feature description).
  Acceptance scenarios describing catalog contents assume data has been populated by that later
  step or by manual testing.
- Search matches are evaluated independently per field: a title term matches against the title
  field and an author term matches against the author field; there is no combined "matches title
  OR author" free-text mode in this iteration.
- A single-book detail lookup (User Story 3) is exposed as a general-purpose capability for reuse
  by later features (e.g., a future book detail page, reservations); this feature does not itself
  require a public UI page for it beyond what the list view already provides.
- Default and maximum page size are fixed per the Clarifications section above (default 20,
  maximum 100), resolved as an implementation-convention decision rather than one requiring
  stakeholder input.
- Books with zero available quantity remain visible in browse/search; whether a visitor can act on
  a zero-availability book (e.g., attempt a reservation) is governed by a separate, later feature.
