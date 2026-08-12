# Feature Specification: Admin Loan Oversight

**Feature Branch**: `005-admin-loan-oversight`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Admin loan oversight: extend GET /admin/reservations with optional bookId and userId query filters (combinable with existing status filter via AND) so admins can see who holds which book (filter by book) or what a user holds (filter by user). Add POST /admin/reservations/:id/confirm-return (valid from return_requested or checked_out status; sets returned_at, transitions to returned, increments the book's quantity_available; 409 invalid_status_transition otherwise). Add a force-early-return power: POST /admin/reservations/:id/force-return (valid only from checked_out or confirmed status; does not change the reservation status since the book is still physically out — it only sets a new nullable force_return_requested_at timestamp column, idempotently updating the timestamp if already set; 409 invalid_status_transition otherwise). This flag is a state marker a later notifications feature will hook into. Serialize the new force_return_requested_at field (as forceReturnRequestedAt) in reservation API responses. Add a new admin-ui Loans page listing all reservations with book title/author, holder email, status, and dates, filterable by status/book/user, with action buttons 'Confirm Return' (shown on checked_out/return_requested rows) and 'Force Early Return' (shown on checked_out/confirmed rows, showing a badge once the flag is set), linked into the admin nav alongside Users and Books."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See who holds which book (Priority: P1)

An administrator wants to know, at a glance, who currently holds a given book (or all the
books a given member currently holds), so they can answer member questions, chase down overdue
copies, or investigate a dispute.

**Why this priority**: This is the core "oversight" value of the feature — without it, an
admin has no way to answer "who has book X right now" other than scanning the entire
reservation list by eye. It is the foundation every other action in this feature builds on.

**Independent Test**: Can be fully tested by creating reservations for multiple books/users,
then calling the reservation list filtered by a specific book and separately by a specific
user, and confirming each filtered view returns exactly the matching rows.

**Acceptance Scenarios**:

1. **Given** several reservations exist across multiple books and users, **When** an admin
   views the loan list filtered to one book, **Then** they see every reservation (in any
   status) for that book, and no reservations for other books.
2. **Given** several reservations exist across multiple books and users, **When** an admin
   views the loan list filtered to one user, **Then** they see every reservation for that user,
   and no reservations for other users.
3. **Given** several reservations exist, **When** an admin filters by both a book and a status
   at the same time, **Then** only reservations matching both conditions are returned.

---

### User Story 2 - Confirm a book has been returned (Priority: P1)

An administrator wants to record that a physical book has come back to the library, whether or
not the borrower formally requested a return first, so the catalog's available-copy count and
the loan record both reflect reality.

**Why this priority**: Confirming returns is the other half of the loan lifecycle the
reservation flow feature didn't cover; without it, checked-out copies never come back into
circulation and the catalog's available count silently drifts from the truth.

**Independent Test**: Can be fully tested by driving a reservation to `checked_out`, confirming
its return, and observing the reservation's status become `returned`, its return timestamp be
set, and the book's available-copy count increase by one. Repeated independently for a
reservation in `return_requested` status.

**Acceptance Scenarios**:

1. **Given** a reservation is in `checked_out` status, **When** an admin confirms its return,
   **Then** the reservation transitions to `returned`, a return timestamp is recorded, and the
   book's available-copy count increases by one.
2. **Given** a reservation is in `return_requested` status, **When** an admin confirms its
   return, **Then** the same outcome occurs as above.
3. **Given** a reservation is in any other status (e.g. `pending`, `confirmed`, `returned`,
   `cancelled`), **When** an admin attempts to confirm its return, **Then** the action is
   rejected and the reservation is left unchanged.

---

### User Story 3 - Force an early return request (Priority: P2)

An administrator wants to flag that a currently-out book should be returned early (for example,
another member urgently needs it, or the library is recalling copies), without waiting for the
holder to act and without pretending the book is already back.

**Why this priority**: This is a secondary oversight power — valuable for exceptional cases,
but the library can function on day one with just visibility and normal return confirmation
(User Stories 1 and 2). It also lays the groundwork future notification delivery will build on,
but sending an actual notice to the holder is explicitly out of scope here.

**Independent Test**: Can be fully tested by driving a reservation to `checked_out`, forcing an
early return, and observing the reservation's status is unchanged while a force-return flag and
timestamp are now set and visible; repeating the force-return action again and observing the
timestamp updates without error.

**Acceptance Scenarios**:

1. **Given** a reservation is in `checked_out` status, **When** an admin forces an early return,
   **Then** the reservation's status remains `checked_out`, and a force-return flag with a
   timestamp is now set on the reservation.
2. **Given** a reservation is in `confirmed` status (agreed but not yet picked up), **When** an
   admin forces an early return, **Then** the same flag-setting outcome occurs as above, and
   status remains `confirmed`.
3. **Given** a reservation already has the force-return flag set, **When** an admin forces an
   early return again, **Then** the action succeeds and simply updates the flag's timestamp
   (no error, no duplicate side effects).
4. **Given** a reservation is in any other status (e.g. `pending`, `return_requested`,
   `returned`, `cancelled`), **When** an admin attempts to force an early return, **Then** the
   action is rejected and the reservation is left unchanged.

---

### Edge Cases

- What happens when an admin filters the loan list by a book or user that does not exist? The
  list returns empty (not an error) — an unmatched filter is not itself invalid input.
- What happens when an admin confirms a return that was already confirmed (already `returned`)?
  The action is rejected as an invalid status transition, consistent with User Story 2's
  acceptance scenario 3 — a return cannot be confirmed twice.
- What happens if confirming a return would push the book's available-copy count above its
  total-copy count? This should not occur in normal operation (a `checked_out` or
  `return_requested` reservation implies a copy is genuinely out), so the system treats this as
  an unexpected internal error rather than a normal rejection.
- What happens when an admin forces an early return on a reservation and then later confirms its
  return? Confirmation still follows its own independent rule (valid from `checked_out` or
  `return_requested`) — the force-return flag does not change how confirmation behaves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an administrator list loan records (reservations) filtered by
  book, so they can see every current and past holder of a given book.
- **FR-002**: The system MUST let an administrator list loan records filtered by member
  (user), so they can see every book a given member currently holds or has held.
- **FR-003**: The system MUST let an administrator combine the book filter, member filter, and
  the existing status filter together, returning only records matching all supplied filters.
- **FR-004**: The system MUST let an administrator confirm that a book has been physically
  returned when the loan record is in the `checked_out` status or the `return_requested` status.
- **FR-005**: The system MUST reject a return confirmation attempted on a loan record in any
  status other than `checked_out` or `return_requested`, leaving the record unchanged.
- **FR-006**: On a successful return confirmation, the system MUST record the return time on the
  loan record, transition the loan record's status to `returned`, and increase the associated
  book's available-copy count by one.
- **FR-007**: The system MUST let an administrator mark a loan record for early return when it
  is in the `checked_out` status or the `confirmed` status, without changing the loan record's
  status (the book remains recorded as out).
- **FR-008**: The system MUST reject a force-early-return attempt on a loan record in any status
  other than `checked_out` or `confirmed`, leaving the record unchanged.
- **FR-009**: The system MUST record when a force-early-return was most recently requested for a
  loan record, and MUST allow this to be requested again on an already-flagged loan record
  (updating the recorded time) without error.
- **FR-010**: The system MUST make the force-early-return flag and its timestamp visible
  wherever a loan record's other details are visible to an administrator, so a later
  notification capability (out of scope here) can act on it.
- **FR-011**: Administrators MUST be able to view, in one place, all loan records with the
  associated book's title and author, the holder's member identity, the loan's status, and its
  relevant dates.
- **FR-012**: Administrators MUST be able to filter that view by status, by book, and by member.
- **FR-013**: Administrators MUST be able to trigger return confirmation, from that view, on
  loan records eligible for it (per FR-004).
- **FR-014**: Administrators MUST be able to trigger a force-early-return, from that view, on
  loan records eligible for it (per FR-007), and MUST be able to see at a glance which loan
  records already have a force-early-return flag set.
- **FR-015**: All actions described in this feature MUST be restricted to authenticated
  administrators, consistent with every other administrative capability in the system.

### Key Entities

- **Loan record (reservation)**: Represents one member's claim on one copy of one book, already
  tracked by the existing reservation lifecycle (requested, confirmed, checked out, return
  requested, returned, cancelled). This feature adds one new piece of state to it: a
  force-early-return marker (present/absent, with a timestamp of when it was last set) that
  records an administrator's request for early return without altering the loan's own status.
  This feature does not add, remove, or restructure any other loan record field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can determine every current holder of a specific book, or every
  book a specific member currently holds, in a single lookup, without manually scanning the full
  loan list.
- **SC-002**: An administrator can confirm a book's return, and see the catalog's available-copy
  count reflect that return, in under 10 seconds of interaction.
- **SC-003**: An administrator can flag a loan for early return in under 10 seconds of
  interaction, and can visually distinguish flagged loans from unflagged ones in the same list.
- **SC-004**: 100% of return-confirmation and force-early-return attempts made against a loan
  record in an ineligible status are rejected without altering that record's stored state.
- **SC-005**: Every loan record shown to an administrator displays the book's title and author,
  the holder's identity, the loan's status, its relevant dates, and its early-return flag state,
  with no need to cross-reference a separate screen.

## Assumptions

- Only administrators perform the actions in this feature; there is no member-facing UI change
  here (a member-facing "request a return" capability is a separate, concurrently-developed
  feature and is not part of this spec).
- Sending an actual notice to a book's holder when an admin forces an early return is explicitly
  out of scope for this feature; this feature only records that the request was made, for a
  later notifications capability to act on.
- The existing loan-record status vocabulary (`pending`, `confirmed`, `checked_out`,
  `return_requested`, `returned`, `cancelled`) is fixed by an already-shipped feature and is not
  altered here.
- "Book" and "member" filters accept the same identifiers already used elsewhere in the system
  for books and users; no new identifier scheme is introduced.
- If the concurrently-developed member-facing return-request feature has already added its own
  new loan-record field by the time this feature is built, that field is simply displayed
  alongside this feature's fields where loan records are shown to an administrator; this feature
  does not depend on it being present to function.
