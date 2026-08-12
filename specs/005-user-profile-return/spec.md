# Feature Specification: User Profile & Return Request

**Feature Branch**: `005-user-profile-return`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "User profile page and return-request flow. A signed-in Public UI user needs a profile page listing their own reservations with status, and a way to request a return for a reservation that is currently checked out — specifying a preferred return date."

## Clarifications

### Session 2026-08-11

No critical ambiguities were identified requiring formal clarification. The originating task
description fully specified the security-sensitive decision points (owner-only access with a
404, not 403, for other users' reservations; the `checked_out` → `return_requested` transition
gate; the required preferred-return-date field), and the spec's Assumptions section already
records the remaining reasonable defaults (unauthenticated UX treatment, no calendar validation
of the preferred date, single open return request per reservation). Proceeding directly to
`/speckit-plan`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View my reservations on a profile page (Priority: P1)

A signed-in library patron wants to see all of their own book reservations — past and present — with each one's current status, in one place, so they know what they've requested, what's confirmed, what they currently have checked out, and what's already been returned.

**Why this priority**: Without a place to see reservation status, a patron has no way to track their own borrowing activity. This is the foundation the return-request action builds on.

**Independent Test**: Can be fully tested by signing in as a user with one or more existing reservations, navigating to the profile page, and confirming each reservation and its status is listed. Delivers value on its own even before the return-request action exists.

**Acceptance Scenarios**:

1. **Given** a signed-in user with existing reservations in various statuses, **When** they open their profile page, **Then** they see a list of their own reservations, each showing its status (and relevant dates).
2. **Given** a signed-in user with no reservations, **When** they open their profile page, **Then** they see the page with an empty/appropriate message rather than an error.
3. **Given** a visitor who is not signed in, **When** they open the profile page, **Then** they are shown a message asking them to log in (or are redirected to log in) instead of seeing any reservation data.

---

### User Story 2 - Request a return for a checked-out book (Priority: P1)

A signed-in patron who currently has a book checked out wants to tell the library they intend to return it, and specify a preferred date, so the library can plan for the book's return.

**Why this priority**: This is the core new capability of the feature — closing the loop on the borrowing lifecycle from the patron's side. It depends on User Story 1 (the profile listing) to be reachable, but is the primary reason the page exists.

**Independent Test**: Can be fully tested by signing in as a user with a reservation in `checked_out` status, using the "Request Return" action with a preferred date, and confirming the reservation's status updates to reflect the pending return and the preferred date is recorded.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing their profile with a reservation in `checked_out` status, **When** they choose to request a return and supply a preferred return date, **Then** the reservation's status updates to reflect the return request and the chosen date is recorded and visible.
2. **Given** a signed-in user viewing their profile, **When** they look at a reservation that is not `checked_out` (e.g. `pending`, `confirmed`, `return_requested`, `returned`, `cancelled`), **Then** no "Request Return" action is offered for that reservation.
3. **Given** a signed-in user attempts to request a return for a reservation that is not currently `checked_out` (e.g. via a stale page or replayed request), **When** the request is submitted, **Then** the system rejects it and the reservation's status is unchanged.
4. **Given** a signed-in user attempts to request a return for a reservation that belongs to a different user, **When** the request is submitted, **Then** the system does not reveal whether that reservation exists and treats it the same as a reservation that doesn't exist at all.

### Edge Cases

- A user with zero reservations sees an empty state, not an error, on their profile page.
- A user who is not signed in cannot see any reservation data by visiting the profile page directly (no data leakage via a direct URL visit).
- A return request for a reservation owned by another user is indistinguishable, from the requester's point of view, from a return request for a reservation that does not exist at all.
- A return request submitted for a reservation already in `return_requested`, `returned`, `cancelled`, `pending`, or `confirmed` status is rejected without changing the reservation.
- Submitting a return request without a preferred date is rejected before any state change occurs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a page where a signed-in user can view a list of their own reservations, each showing its current status.
- **FR-002**: System MUST prevent a user who is not signed in from viewing any reservation data on this page, instead presenting a prompt to log in.
- **FR-003**: System MUST show a "Request Return" action only for the current user's reservations that are currently in `checked_out` status.
- **FR-004**: System MUST allow a signed-in user to submit a return request for one of their own `checked_out` reservations, along with a preferred return date.
- **FR-005**: System MUST record the user's preferred return date against the reservation when a return request is accepted.
- **FR-006**: System MUST transition a reservation's status to indicate a return has been requested once the request is accepted.
- **FR-007**: System MUST reject a return request for a reservation that is not currently in `checked_out` status, and MUST leave that reservation's state unchanged.
- **FR-008**: System MUST reject a return request targeting a reservation owned by a different user, and MUST respond identically (from the requester's perspective) to how it responds when the target reservation does not exist at all, so as not to reveal whether another user's reservation exists.
- **FR-009**: System MUST reject a return request that does not include a preferred return date.
- **FR-010**: Users MUST only ever be able to view or act on their own reservations through this feature — never another user's.

### Key Entities

- **Reservation**: An existing record representing one patron's request to borrow one book, already tracked through statuses `pending` → `confirmed` → `checked_out` → `returned`/`cancelled` by prior features. This feature adds a new terminal-adjacent status transition (`checked_out` → `return_requested`) and a new attribute: the patron's preferred return date, captured at the moment a return is requested.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in patron can find and review the full list of their own reservations, with status, in under 10 seconds from landing on the profile page.
- **SC-002**: A signed-in patron with a checked-out book can submit a return request, including their preferred date, in three interactions or fewer (open profile, pick date, confirm).
- **SC-003**: 100% of return-request attempts for reservations not in `checked_out` status are rejected without altering reservation data.
- **SC-004**: 100% of return-request attempts targeting another user's reservation receive a response indistinguishable from a "does not exist" response, verified by inspection of the response.
- **SC-005**: A user who is not signed in is never able to retrieve another (or any) user's reservation list or status via this page.

## Assumptions

- "Preferred return date" is a free-form date supplied by the user; the system does not validate it against a due date, calendar, or loan-period business rule beyond requiring it be present — validating that logic is out of scope for this feature.
- Only one open return request is meaningful per reservation; since the return-request action is only available while status is `checked_out`, a reservation cannot be re-submitted for return request while already in `return_requested` status without an admin-side action (out of scope here) moving it back.
- The existing reservation lifecycle (statuses, ownership by `user_id`, and the endpoints/services from the prior reservation-flow feature) is the system of record this feature extends; this feature does not change how reservations are created, confirmed, or checked out.
- Visitors who are not signed in are shown a "please log in" prompt on the profile page itself rather than a hard redirect, consistent with how the rest of the Public UI treats unauthenticated states (e.g. the catalog page's reservation controls, which are simply hidden/absent when logged out rather than redirecting).
- The profile page and its data apply only to the reservations of the currently authenticated user; there is no admin or cross-user view in this feature (that already exists separately as the admin reservations surface).
