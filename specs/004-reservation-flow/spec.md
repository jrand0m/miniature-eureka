# Feature Specification: Reservation Flow

**Feature Branch**: `004-reservation-flow`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "FEAT-03 reservation-flow: Book reservations with an admin-agreed delivery date — a simple one-shot propose-then-confirm flow. Any logged-in user can request to reserve a book, picking a preferred delivery date. An admin reviews pending requests and confirms one (agreeing a delivery date and reserving a copy), then later marks the book checked out once handed over. The reservation status model must reserve room for later features (return requests, admin-forced returns, notifications) without this feature building UI/endpoints for those states."

## Clarifications

### Session 2026-08-11

*Run unattended (no user available to answer) — each question below was resolved by choosing the most conventional option consistent with this codebase's existing patterns, per the feature's execution instructions. Recorded here for traceability.*

- Q: What format should the preferred/agreed delivery dates use — a date-only string or a full date-time? → A: Date-only ISO 8601 (`YYYY-MM-DD`), no time component — these are calendar delivery dates, not timestamps.
- Q: If an admin passes an unrecognized value in the `status` filter on the reservation queue, what should happen? → A: Reject with a 400 "invalid request" style error, matching the existing malformed-body convention used elsewhere in the Admin API (see `POST /auth/register` and `/auth/login`), rather than silently returning an empty list.
- Q: How strictly should the admin-agreed delivery date be validated when confirming a reservation? → A: Same shallow validation as the user's requested date (must be present and a non-empty string) — no calendar-range or business-day validation, consistent with this feature's Assumptions that rich date validation is out of scope.

### Session 2026-08-11 (coverage note)

All other taxonomy categories (functional scope, entity lifecycle, interaction flow, security/authZ split between `requireAuth` and `requireAdminToken`, integration with the sibling books/users features, edge cases, terminology) were already Clear from the initial specification and the cited sibling-feature conventions; no further questions were needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Request a reservation (Priority: P1)

A signed-in library visitor is browsing the catalog, finds a book they want, and asks the library to hold a copy for them, indicating the date they'd like to receive it.

**Why this priority**: This is the entry point of the entire flow — without it nothing downstream (admin confirmation, checkout) has anything to act on. It is also the only piece of this feature end users interact with directly.

**Independent Test**: Can be fully tested by logging in as a user, submitting a reservation request for an in-stock book with a preferred date, and confirming a `pending` reservation now exists for that user and that book — without needing the admin-side endpoints to exist yet (they can be exercised directly via the API/admin token).

**Acceptance Scenarios**:

1. **Given** a signed-in user and a book with at least one copy available, **When** the user requests a reservation with a preferred delivery date, **Then** a new reservation is created in `pending` status tied to that user and book, and the book's available copy count is unchanged.
2. **Given** a signed-in user, **When** they request a reservation for a book id that does not exist, **Then** the request is rejected as not found and no reservation is created.
3. **Given** a signed-in user and a book with zero copies currently available, **When** the user requests a reservation, **Then** the request is rejected as unavailable and no reservation is created.
4. **Given** a visitor who is not signed in, **When** they attempt to request a reservation, **Then** the request is rejected as unauthenticated.

---

### User Story 2 - Review and confirm a reservation (Priority: P2)

An administrator reviews the queue of pending reservation requests and, for a given request, agrees on a delivery date and commits a copy of the book to that user.

**Why this priority**: Confirmation is what turns a request into a real commitment (and is what actually reserves inventory) — it's the second step of the value chain and depends on Story 1 existing, but delivers the core "propose then confirm" value once available.

**Independent Test**: Can be fully tested by creating a pending reservation (directly or via Story 1), then, as an admin, confirming it with an agreed date, and verifying the reservation moves to `confirmed`, the agreed date is stored, and the book's available copy count decreases by one.

**Acceptance Scenarios**:

1. **Given** a `pending` reservation for a book with at least one copy available, **When** an admin confirms it with an agreed delivery date, **Then** the reservation becomes `confirmed`, the agreed date is recorded, and the book's available copy count decreases by exactly one.
2. **Given** a reservation that is not currently `pending` (e.g. already `confirmed`), **When** an admin attempts to confirm it again, **Then** the request is rejected as a conflicting state change and no further inventory is decremented.
3. **Given** a `pending` reservation whose book now has zero copies available (availability changed after the original request), **When** an admin attempts to confirm it, **Then** the request is rejected as unavailable and the reservation remains `pending`.
4. **Given** a non-admin caller, **When** they attempt to confirm a reservation, **Then** the request is rejected as forbidden.

---

### User Story 3 - Check out a confirmed reservation (Priority: P3)

On the agreed delivery date, the administrator marks the reservation as checked out once the book has been physically handed to the visitor.

**Why this priority**: This closes out the flow this feature is responsible for. It depends on Story 2 (a reservation must be confirmed first) and is lower priority than the request/confirm steps because a demo of the propose-then-confirm value doesn't strictly require this last step, though the feature is incomplete without it.

**Independent Test**: Can be fully tested by confirming a reservation (Story 2), then, as an admin, marking it checked out, and verifying the reservation moves to `checked_out` with a checkout timestamp recorded.

**Acceptance Scenarios**:

1. **Given** a `confirmed` reservation, **When** an admin marks it checked out, **Then** the reservation becomes `checked_out` and a checkout timestamp is recorded.
2. **Given** a reservation that is not currently `confirmed` (e.g. still `pending`, or already `checked_out`), **When** an admin attempts to check it out, **Then** the request is rejected as a conflicting state change.
3. **Given** a non-admin caller, **When** they attempt to check out a reservation, **Then** the request is rejected as forbidden.

---

### User Story 4 - View my own reservations (Priority: P4)

A signed-in user checks the status of the reservations they've made, without seeing anyone else's.

**Why this priority**: Useful confirmation/feedback for the user after Story 1, but the flow is fully functional (from the library's operational point of view) without it — it's a read-only convenience, and a fuller version of this view is explicitly deferred to a later profile feature.

**Independent Test**: Can be fully tested by creating reservations for two different users and confirming that when user A requests their reservation list, only user A's reservations are returned.

**Acceptance Scenarios**:

1. **Given** a signed-in user with two reservations, **When** they request their reservation list, **Then** both of their reservations are returned and no other user's reservations appear.
2. **Given** a signed-in user with no reservations, **When** they request their reservation list, **Then** an empty list is returned.

---

### User Story 5 - Admin views the reservation queue (Priority: P5)

An administrator views all reservation requests, optionally narrowed to a single status (e.g. just the pending ones needing action), with enough book and requester detail to act on each one without cross-referencing other screens.

**Why this priority**: Operationally necessary for an admin to actually find and act on reservations, but it's a read-only listing — the write endpoints (Story 2, 3) are the ones that carry the actual business logic and can be exercised directly without this view existing.

**Independent Test**: Can be fully tested by creating reservations in several statuses, then, as an admin, requesting the list filtered by one status, and confirming only reservations in that status are returned, each annotated with its book's title/author and the requesting user's email.

**Acceptance Scenarios**:

1. **Given** reservations in multiple statuses, **When** an admin requests the list without a filter, **Then** all reservations are returned, each including the associated book's title and author and the requester's email.
2. **Given** reservations in multiple statuses, **When** an admin requests the list filtered to `pending`, **Then** only `pending` reservations are returned.
3. **Given** a non-admin caller, **When** they attempt to view the reservation queue, **Then** the request is rejected as forbidden.

---

### Edge Cases

- What happens when a user submits a second reservation request for the same book while their first request is still pending? The system allows it (no uniqueness constraint on user+book+status is required by this feature) — duplicate-request prevention is out of scope for this iteration.
- What happens if the preferred or agreed date is in the past? This feature performs no date-validity checking beyond requiring the field be present and a plausible date string — richer date validation is out of scope for this iteration.
- How does the system handle a confirm or check-out call against a reservation id that does not exist at all? It is rejected as not found.
- How does the system behave if two admins race to confirm the same pending reservation at nearly the same moment? The status-guarded transition (only proceeding when the row is still `pending`) ensures only one confirm succeeds; the second observes the now-`confirmed` status and is rejected as a conflicting state change.
- What happens to a book's available copy count if a confirmed or checked-out reservation is later cancelled or returned? Out of scope for this feature — those transitions belong to later features (return requests, admin-forced returns) that this feature's schema reserves room for but does not implement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow any signed-in user to submit a reservation request for a specific book, including their preferred delivery date as a date-only ISO 8601 string (`YYYY-MM-DD`).
- **FR-002**: The system MUST reject a reservation request for a book that does not exist.
- **FR-003**: The system MUST reject a reservation request for a book that currently has no copies available, without creating a reservation.
- **FR-004**: The system MUST NOT reduce a book's available copy count when a reservation request is created — inventory is only committed at confirmation.
- **FR-005**: The system MUST reject reservation requests from callers who are not signed in.
- **FR-006**: The system MUST allow a signed-in user to retrieve a list of only their own reservations.
- **FR-007**: The system MUST allow an administrator to retrieve a list of all reservations, optionally filtered to a single status, with each entry showing the associated book's title and author and the requesting user's email. An unrecognized status filter value MUST be rejected as an invalid request rather than silently returning an empty or unfiltered list.
- **FR-008**: The system MUST allow an administrator to confirm a reservation that is currently in the `pending` status, recording an agreed delivery date (a date-only ISO 8601 string, validated only for presence — no calendar-range validation) and transitioning it to `confirmed`.
- **FR-009**: The system MUST reduce the associated book's available copy count by exactly one when a reservation is confirmed.
- **FR-010**: The system MUST reject a confirm request if the reservation is not currently `pending`, without changing inventory or reservation state.
- **FR-011**: The system MUST reject a confirm request if the associated book has no copies available at confirmation time, without changing inventory or reservation state.
- **FR-012**: The system MUST allow an administrator to check out a reservation that is currently in the `confirmed` status, recording a checkout timestamp and transitioning it to `checked_out`.
- **FR-013**: The system MUST reject a check-out request if the reservation is not currently `confirmed`.
- **FR-014**: The system MUST reject all admin-only reservation operations (queue listing, confirm, check-out) from callers who are not authenticated as an administrator.
- **FR-015**: The reservation status model MUST include, in addition to the three statuses this feature drives (`pending`, `confirmed`, `checked_out`), three additional statuses reserved for later features (`return_requested`, `returned`, `cancelled`); this feature MUST NOT expose any endpoint or user interface that produces those three reserved statuses.
- **FR-016**: The Public UI MUST offer a "Reserve" action on the book catalog/browse page that is visible only to a signed-in visitor and lets them pick a preferred delivery date and submit a reservation request, showing the outcome (success or the specific rejection reason) to the visitor.

### Key Entities

- **Reservation**: Represents one visitor's request to borrow a specific book on a preferred date, and its progress toward being honored. Attributes: which book, which user, current status (one of the six defined above, though this feature only produces `pending`/`confirmed`/`checked_out`), the user's requested delivery date, the admin-agreed delivery date (present only once confirmed), a checkout timestamp (present only once checked out), a return timestamp (reserved for a later feature), and creation/last-updated timestamps. Relates to exactly one Book and exactly one User.
- **Book** *(existing entity owned by a sibling feature; referenced, not redefined, here)*: The catalog item being reserved. This feature depends on the book's identity and its current available-copy count, and is responsible for decrementing that count at confirmation time.
- **User** *(existing entity owned by a sibling feature; referenced, not redefined, here)*: The person requesting a reservation or, in the administrator case, the person managing the queue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in visitor can submit a reservation request for an available book in under 30 seconds from the catalog page.
- **SC-002**: 100% of reservation requests for books with zero available copies are rejected without ever creating a reservation record.
- **SC-003**: 100% of confirm attempts against a non-pending reservation, and 100% of check-out attempts against a non-confirmed reservation, are rejected without changing any state.
- **SC-004**: An administrator can go from viewing the pending queue to a confirmed reservation with a committed copy in two actions (view, confirm).
- **SC-005**: A signed-in user retrieving their own reservation list never sees another user's reservation, verified across 100% of sampled requests.

## Assumptions

- A `books` table already exists (or lands immediately upstream of this feature, from a concurrently-developed sibling feature) with at least: an id, title, author, a total copy count, and a currently-available copy count that this feature reads and, on confirm, decrements by one. This feature does not define or migrate the `books` table.
- A `users` table and an existing signed-in-user authentication mechanism (bearer token, resolved to a user id) already exist, from the platform's account feature, and are reused as-is rather than re-implemented.
- An existing admin-only authentication mechanism, distinct from the general signed-in-user mechanism, already exists and is reused as-is for every admin-facing endpoint in this feature.
- An existing public book catalog/browse page already exists (or lands immediately upstream of this feature, from a concurrently-developed sibling feature) that this feature extends with a "Reserve" action; this feature does not build catalog browsing/search itself.
- One reservation reserves exactly one physical copy; partial or multi-copy reservations in a single request are out of scope.
- No email/notification is sent to the user when their reservation is confirmed or checked out in this iteration — a notifications system is an explicitly later, separate feature.
- A full "my account" / profile page listing and managing reservations (including cancellation) is an explicitly later, separate feature; this feature's own-reservations view is read-only and minimal.
- A full admin oversight page (who holds which book, forced early return) is an explicitly later, separate feature; this feature's admin queue view is minimal (list + two state-transition actions) and does not attempt to be that page.
