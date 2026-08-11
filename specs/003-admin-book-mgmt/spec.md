# Feature Specification: Admin Book Catalog & Inventory Management

**Feature Branch**: `003-admin-book-mgmt`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Admin-only book catalog and inventory management: create/edit/delete
books in the catalog and adjust inventory quantities, gated by admin token exactly like the
existing admin user-management endpoints, plus an Admin UI page to drive it."

## Clarifications

### Session 2026-08-11

*Run unattended (no reviewer available to answer interactively); each question below was
self-answered using the most conventional choice for this codebase's existing patterns, per task
instructions. Recorded here for traceability instead of via an interactive Q&A loop.*

- Q: Should deleting a catalog entry be blocked while some of its copies are checked out
  (available quantity less than total quantity)? → A: Yes — block deletion (return a conflict)
  whenever available quantity is less than total quantity. There is no reservation/loan table yet
  to enforce this via a hard database constraint, but a later feature will add one; blocking is the
  safer default that avoids silently orphaning a copy someone currently holds.
- Q: How is an inventory quantity change expressed? → A: As a single signed adjustment (a positive
  or negative delta) applied to the total quantity in one request, rather than separate
  "increase"/"decrease" endpoints or an endpoint that sets an absolute new total — mirrors how the
  available-quantity invariant is naturally expressed as a delta, and keeps the request shape
  simple (one field).
- Q: Can an inventory decrease ever be rejected? → A: Yes — a decrease MUST be rejected when it
  would take available quantity below zero, i.e. an administrator cannot remove more copies than
  are currently available (some may be checked out elsewhere and are not the administrator's to
  remove out from under a borrower).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a New Book to the Catalog (Priority: P1)

An administrator adds a new title to the library's catalog, recording its title, author, and how
many copies the library owns, so that it immediately becomes visible and available in the public
catalog and browsable/searchable by visitors.

**Why this priority**: Without the ability to add books, the catalog stays permanently empty and
no other administrative or public-facing capability (search, reservations) has anything to act on.

**Independent Test**: Can be fully tested by an administrator submitting a new book's title,
author, and quantity, and confirming it appears in the catalog with all its copies available.

**Acceptance Scenarios**:

1. **Given** an administrator is signed in, **When** they submit a new book with a title, author,
   and a total quantity of 3, **Then** the book is added to the catalog with 3 total copies and 3
   available copies.
2. **Given** an administrator submits a new book without a title or without an author, **When**
   the submission is made, **Then** the book is rejected and not added to the catalog.
3. **Given** an administrator submits a new book with an ISBN and description, **When** the
   submission succeeds, **Then** those optional details are stored and visible alongside the book.
4. **Given** an administrator submits a new book leaving ISBN and description blank, **When** the
   submission succeeds, **Then** the book is added successfully with those fields absent.

---

### User Story 2 - Adjust a Book's Inventory (Priority: P1)

An administrator records that new physical copies of a book have arrived, or that copies have been
withdrawn from circulation (e.g. lost, damaged, discontinued), keeping the catalog's total and
available counts accurate.

**Why this priority**: Inventory accuracy is core to the library's operation — reservations and
availability information are meaningless if quantities drift from reality; equally critical to
adding a book in the first place.

**Independent Test**: Can be fully tested by increasing a book's quantity and confirming both
total and available counts rise by the same amount, then decreasing it and confirming both fall by
the same amount, and confirming an over-large decrease is refused.

**Acceptance Scenarios**:

1. **Given** a book has 3 total and 3 available copies, **When** an administrator adds 2 more
   copies, **Then** the book has 5 total and 5 available copies.
2. **Given** a book has 5 total and 2 available copies (3 currently checked out), **When** an
   administrator removes 2 copies, **Then** the book has 3 total and 0 available copies.
3. **Given** a book has 5 total and 2 available copies (3 currently checked out), **When** an
   administrator attempts to remove 3 copies, **Then** the request is refused and the book's
   quantities are unchanged, because doing so would take available copies below zero.
4. **Given** an administrator attempts to adjust the inventory of a book that does not exist,
   **When** the adjustment is submitted, **Then** it is refused with a clear "not found" outcome.

---

### User Story 3 - Edit a Book's Descriptive Details (Priority: P2)

An administrator corrects or updates a book's title, author, ISBN, or description — for example,
fixing a typo or adding a missing ISBN — without affecting its inventory counts.

**Why this priority**: Important for catalog quality and correctness, but the catalog is
functional without it once a book has been added; lower priority than getting books in and their
quantities right in the first place.

**Independent Test**: Can be fully tested by editing an existing book's title and confirming the
change is reflected, while its total and available quantities remain exactly as they were before
the edit.

**Acceptance Scenarios**:

1. **Given** an existing book, **When** an administrator updates its title, author, ISBN, and/or
   description, **Then** those fields reflect the update and its total/available quantities are
   unchanged.
2. **Given** an administrator attempts to edit a book that does not exist, **When** the edit is
   submitted, **Then** it is refused with a clear "not found" outcome.

---

### User Story 4 - Remove a Book from the Catalog (Priority: P3)

An administrator removes a title the library no longer carries at all, so it no longer appears in
the catalog.

**Why this priority**: Least frequently needed of the four capabilities — most catalog changes are
additions, edits, and inventory adjustments; outright removal is a rarer, more consequential
operation, so it is guarded most conservatively (see Edge Cases) and prioritized last.

**Independent Test**: Can be fully tested by removing a book whose copies are all available and
confirming it no longer appears in the catalog, and by attempting to remove a book with copies
currently checked out and confirming the removal is refused.

**Acceptance Scenarios**:

1. **Given** a book exists with all of its copies available (none checked out), **When** an
   administrator removes it, **Then** it no longer appears in the catalog.
2. **Given** a book exists with some of its copies unavailable (checked out), **When** an
   administrator attempts to remove it, **Then** the removal is refused and the book remains in the
   catalog.
3. **Given** an administrator attempts to remove a book that does not exist, **When** the removal
   is submitted, **Then** it is refused with a clear "not found" outcome.

---

### Edge Cases

- What happens when a non-administrator (or an unauthenticated caller) attempts any of these
  operations? → The operation is refused; only an authenticated administrator may create, edit,
  delete, or adjust inventory for catalog entries (this surface is not part of the public library
  surface).
- What happens when an inventory adjustment's delta is zero? → Allowed as a no-op; the book's
  quantities are unchanged and the operation still succeeds (there is no meaningful harm in a
  zero-sized adjustment, and rejecting it would add complexity without protecting any invariant).
- What happens when a new book is created with a total quantity of zero? → Allowed; the book is
  added to the catalog with zero total and zero available copies (e.g., a title the library plans
  to acquire copies of soon).
- What happens when an edit submission includes no changed fields? → Allowed as a no-op; the book
  is unchanged and the operation still succeeds.
- What happens when a removal is attempted on a book with zero total copies (never had any, or all
  ever-adjusted out)? → Allowed; zero total and zero available copies trivially satisfies "all
  copies available," so removal proceeds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated administrator to add a new book to the catalog by
  supplying a title, an author, and a total quantity of copies owned (each required), plus an
  optional ISBN and optional description.
- **FR-002**: System MUST reject a new-book submission that is missing a title, missing an author,
  or whose total quantity is missing, not a whole number, or negative.
- **FR-003**: System MUST set a newly added book's available quantity equal to its total quantity
  at the moment of creation.
- **FR-004**: System MUST allow an authenticated administrator to edit an existing book's title,
  author, ISBN, and/or description, independent of and without altering its total or available
  quantities.
- **FR-005**: System MUST return a clear "not found" outcome when an edit is submitted for a book
  identifier that does not exist in the catalog.
- **FR-006**: System MUST allow an authenticated administrator to adjust an existing book's
  inventory by a single signed amount (positive to add copies, negative to remove copies) applied
  to its total quantity.
- **FR-007**: System MUST apply an inventory increase equally to both total and available
  quantity (adding N copies raises both by N).
- **FR-008**: System MUST apply an inventory decrease equally to both total and available quantity
  (removing N copies lowers both by N), and MUST refuse the adjustment entirely, leaving the book's
  quantities unchanged, when doing so would take available quantity below zero.
- **FR-009**: System MUST return a clear "not found" outcome when an inventory adjustment is
  submitted for a book identifier that does not exist in the catalog.
- **FR-010**: System MUST allow an authenticated administrator to remove a book from the catalog
  only when its available quantity equals its total quantity (i.e., no copies of it are currently
  checked out), and MUST refuse the removal, leaving the book in the catalog, otherwise.
- **FR-011**: System MUST return a clear "not found" outcome when a removal is submitted for a book
  identifier that does not exist in the catalog.
- **FR-012**: System MUST require a valid administrator credential for every catalog-management
  capability in this feature (add, edit, remove, inventory adjustment); none of these capabilities
  are part of the public library surface and none are reachable without one.
- **FR-013**: System MUST NOT allow a book's total or available quantity to become negative, or
  available quantity to exceed total quantity, as a result of any operation in this feature.
- **FR-014**: Admin UI MUST provide a page where a signed-in administrator can see the full
  catalog and, for each book, add a new book, edit an existing book's descriptive details, adjust
  its inventory by a signed amount, and remove it, reflecting the outcome (including a refusal, if
  any) back to the administrator.

### Key Entities

- **Book**: The same catalog entry established by the prior catalog/search feature — title,
  author, optional ISBN, optional description, total quantity owned by the library, quantity
  currently available, and the date it was added. This feature is the sole way, in the system so
  far, that these records and their quantities come to exist, change, or are removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can add a new book to the catalog, with it immediately visible in
  the public catalog, in under 1 minute.
- **SC-002**: 100% of inventory adjustments that would drive a book's available quantity below
  zero are refused, with the book's prior quantities left completely unchanged.
- **SC-003**: 100% of attempts to remove a book with any copies currently checked out are refused,
  with the book remaining in the catalog.
- **SC-004**: 100% of add/edit/remove/inventory-adjustment attempts made without a valid
  administrator credential are refused.
- **SC-005**: An administrator can correct a book's descriptive details (e.g. fix a typo in its
  title) without any change occurring to its total or available quantities, 100% of the time.

## Assumptions

- This feature builds directly on the `Book` catalog entity and public read surface introduced by
  the prior catalog/search feature; it does not redefine that entity, only adds the
  administrator-only capabilities to create, edit, remove, and adjust inventory for it.
- "Administrator" here means the same authenticated, admin-role actor already established by the
  existing account/user-management feature and its admin-token gate; this feature introduces no
  new actor type or permission tier.
- There is, as of this feature, no reservation/loan tracking table in the system; "copies currently
  checked out" is inferred purely from the gap between a book's total and available quantity. A
  later feature is expected to introduce a hard reservation/loan relationship; this feature's
  delete-blocking rule is intentionally conservative in anticipation of that.
- Inventory adjustments are expressed as a single signed delta per request rather than as separate
  absolute "set total to X" or "increase"/"decrease" endpoints, matching this feature's
  Clarifications above.
- A zero-sized inventory adjustment (delta of 0) and a no-op edit (no fields actually changed) are
  both treated as valid, successful operations rather than rejected as meaningless.
