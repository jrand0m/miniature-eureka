# Feature Specification: User Notifications (Inbox & Live Stream)

**Feature Branch**: `006-notifications`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Per-user notifications: a persisted notification inbox plus a live stream, following the constitution's public-library-surface requireAuth pattern (Principle I item c: 'notification stream/inbox'). The system automatically creates notifications at three existing trigger points in the reservation lifecycle — reservation confirmed, early return force-requested, return confirmed. A signed-in user can view their own notification history, mark individual notifications read (404 for another user's), and receive new notifications live without manually re-polling. The Public UI gets a bell/inbox control in the nav on every page, visible only when logged in, with an unread badge, a toggleable panel, and per-item mark-read."

## Clarifications

### Session 2026-08-11

No critical ambiguities were identified requiring formal clarification. The originating task
description fully specifies the security-sensitive decision points (ownership-scoped access with
a 404 — not 403 — for another user's notification, mirroring the established
`005-user-profile-return` pattern), the three system-generated trigger points and their message
content, and the live-delivery requirement ("without needing to manually re-poll"). The
Assumptions section below records the remaining reasonable defaults (delivery latency target,
history ordering, no notification deletion, no cross-device read-state sync guarantee beyond the
shared backend record). Proceeding directly to `/speckit-plan`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what happened to my reservations without checking manually (Priority: P1)

A signed-in patron wants to know, without repeatedly checking their profile page, when something
relevant happens to one of their reservations — it gets confirmed with a pickup date, the library
asks for it back early, or their return is confirmed — because these are moments they need to
act on or simply want to be reassured about.

**Why this priority**: This is the entire reason the feature exists. Without automatic
notifications, a patron only learns about these events by manually revisiting their profile page
repeatedly, which is the exact friction this feature removes. Every other capability in this
feature (history, live delivery, read state) exists to serve this need.

**Independent Test**: Can be fully tested by signing in as a user, triggering one of the three
system events (an admin confirms the user's reservation, force-requests an early return, or
confirms a return) from another session, and confirming a corresponding notification appears in
that user's notification history.

**Acceptance Scenarios**:

1. **Given** a signed-in user has a `pending` reservation, **When** an admin confirms that
   reservation with an agreed date, **Then** a notification is recorded for that user stating
   their reservation was confirmed and naming the agreed date.
2. **Given** a signed-in user has a `checked_out` or `confirmed` reservation, **When** an admin
   force-requests an early return of that reservation, **Then** a notification is recorded for
   that user asking them to return the book early.
3. **Given** a signed-in user has a `checked_out` or `return_requested` reservation, **When** an
   admin confirms the physical return, **Then** a notification is recorded for that user
   confirming their return was received.
4. **Given** a signed-in user, **When** they open their notification history, **Then** they see
   all of their own notifications, most recent first, each identifying which reservation (and
   implicitly which book) it relates to where applicable.

---

### User Story 2 - Receive new notifications live while browsing (Priority: P2)

A signed-in patron who is actively using the site wants new notifications to appear without
having to refresh the page or navigate away and back, so time-sensitive notices (like an early
return request) are seen promptly.

**Why this priority**: Builds directly on User Story 1's history — the history alone already
delivers most of the value (nothing is lost; a patron can always find out eventually). Live
delivery is the incremental improvement that makes the notice timely, so it's important but not
the MVP-blocking piece.

**Independent Test**: Can be fully tested by signing in as a user with the notification panel/bell
visible, triggering one of the three system events from another session while the page stays
open, and confirming the new notification and updated unread count appear on the open page within
the feature's delivery-latency target without a manual refresh.

**Acceptance Scenarios**:

1. **Given** a signed-in user has the site open in their browser, **When** a new notification is
   created for them, **Then** it appears in their notification panel and their unread badge count
   increases within the feature's delivery-latency target, without the user reloading the page.
2. **Given** a signed-in user's live connection has been open for an extended period, **When** the
   connection reaches its maximum lifetime, **Then** the client reconnects automatically and live
   delivery continues to work without user intervention.
3. **Given** a signed-in user closes and reopens the site later, **When** the page loads, **Then**
   any notifications created while they were away are already present in their history and
   contribute to their unread count.

---

### User Story 3 - Manage the notification inbox (Priority: P3)

A signed-in patron wants to see how many notifications are unread at a glance, open a list of
them, and mark individual ones as read once they've seen them, so their unread count reflects
what they've actually attended to.

**Why this priority**: This is a usability refinement on top of Stories 1 and 2 — the feature is
already valuable as an unread stream of events; explicit per-item read tracking makes the inbox
pleasant to live with over time but isn't required for the core notice-delivery value.

**Independent Test**: Can be fully tested by signing in as a user with several notifications (a
mix of read and unread), opening the notification panel, marking one unread notification as read,
and confirming the unread badge count decreases by one and that notification no longer counts as
unread on subsequent loads.

**Acceptance Scenarios**:

1. **Given** a signed-in user with unread notifications, **When** they open the notification
   panel, **Then** they see each notification's message and whether it is read or unread.
2. **Given** a signed-in user viewing an unread notification in the panel, **When** they mark it
   read, **Then** its read state updates immediately in the panel and the unread badge count
   decreases accordingly, and this state persists across page reloads.
3. **Given** a signed-in user attempts to mark as read a notification that does not belong to
   them (or does not exist), **When** the request is submitted, **Then** the system rejects it
   without revealing whether such a notification exists for anyone else, and no notification's
   read state changes as a result.

### Edge Cases

- A user with zero notifications sees an empty inbox, not an error, and an unread badge showing
  zero (or hidden).
- A user who is not signed in never sees the notification control at all — no bell, no badge, no
  panel, no data leakage via the nav.
- Marking a notification read that's already read is a harmless no-op (idempotent from the user's
  perspective).
- Marking read a notification belonging to another user, or one that doesn't exist, is rejected
  identically in both cases (mirrors the ownership-scoping precedent already established for
  return requests).
- If a user has the site open in two tabs/devices at once, a notification created while both are
  open should eventually appear in both, and marking it read in one is reflected (at least on next
  reload) in the other, since read state lives on the shared backend record.
- If the live connection drops (network blip, connection lifetime reached, tab backgrounded), the
  user does not lose any notifications — reconnecting resumes from where their history already is,
  and nothing already recorded server-side is skipped or duplicated in a way that corrupts the
  unread count.
- The three system-generated notification types are produced only by their respective backend
  events; a user cannot create arbitrary notifications for themselves or anyone else through any
  exposed capability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically create a notification for the affected user when a
  reservation is confirmed, stating that their reservation was confirmed and identifying the
  agreed date.
- **FR-002**: System MUST automatically create a notification for the affected user when an early
  return is force-requested for one of their reservations, asking them to return the item early.
- **FR-003**: System MUST automatically create a notification for the affected user when their
  return is confirmed, confirming the return was received.
- **FR-004**: Each system-generated notification MUST identify which reservation it relates to.
- **FR-005**: System MUST allow a signed-in user to retrieve the full history of their own
  notifications, ordered most recent first.
- **FR-006**: System MUST allow a signed-in user to mark one of their own notifications as read.
- **FR-007**: System MUST reject an attempt to mark as read a notification that does not exist or
  belongs to a different user, responding identically in both cases so as not to reveal whether
  another user's notification exists.
- **FR-008**: System MUST allow a signed-in user to receive newly created notifications belonging
  to them while actively connected, without needing to manually reload or re-request their
  history, and MUST close each such live connection after a bounded maximum duration.
- **FR-009**: A user who is not signed in MUST NOT be able to view, receive, or act on any
  notification data, for themselves or anyone else.
- **FR-010**: Users MUST only ever be able to view or act on their own notifications — never
  another user's — through any capability this feature exposes.
- **FR-011**: The Public UI MUST present a notification control (indicating unread count and
  giving access to the notification list) on every page, visible only while the visitor is signed
  in.
- **FR-012**: The Public UI's notification control MUST let a signed-in user mark an individual
  notification as read from the list.
- **FR-013**: The Public UI MUST reflect newly arrived live notifications in the unread count and
  list while the page remains open and connected, and MUST automatically resume live delivery
  after a live connection ends (e.g., its bounded maximum duration is reached).

### Key Entities

- **Notification**: A message delivered to exactly one user, generated automatically by the
  system in response to a reservation-lifecycle event. Has a type, a human-readable message, an
  optional reference to the related reservation, a creation time, and a read/unread state
  (initially unread, transitioning to read only via an explicit user action). Never created,
  edited, or deleted directly by a user — only produced by the three defined system trigger
  points, and only ever mutated (read state) by its owning user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the three defined reservation-lifecycle events (confirmation, forced early
  return request, return confirmation) result in exactly one corresponding notification recorded
  for the affected user.
- **SC-002**: A signed-in user with an open, connected session sees a newly created notification
  reflected in their unread count within 10 seconds of the triggering event, without reloading the
  page.
- **SC-003**: A signed-in user can find their full notification history, and distinguish read from
  unread items, in under 10 seconds from any page on the site.
- **SC-004**: 100% of attempts to mark as read a notification belonging to another user (or a
  nonexistent one) are rejected without altering any notification's read state and without
  revealing whether the target notification exists.
- **SC-005**: A user who is not signed in never sees any notification content or unread indicator
  on any page.

## Assumptions

- "Live" delivery is satisfied by updates appearing within the SC-002 latency target (10 seconds)
  while the user's session is actively connected; this is not a strict real-time (sub-second)
  guarantee, and a brief, bounded gap after a live connection's maximum duration is reached (until
  the client automatically reconnects) is acceptable.
- Notifications are never deleted or edited once created; the only mutable attribute is read
  state, and only the owning user can change it (read, not unread — there is no "mark unread"
  requirement in this feature).
- There is no cross-user or admin-facing view of notifications in this feature; notifications are
  a purely per-user, self-service surface, consistent with the constitution's public library
  surface (Principle I item c).
- The existing reservation lifecycle and its three relevant transitions (confirm, force-return,
  confirm-return) are the system of record this feature observes; this feature does not change
  reservation behavior itself, only adds a side effect (notification creation) at those existing
  trigger points.
- A notification's message text is generated by the system at creation time (not recomputed
  later), so if a related book's title changes afterward, already-created notification messages
  are not retroactively updated — consistent with how other point-in-time records in this system
  behave.
- The unread badge count reflects all of a user's unread notifications; there is no cap or
  truncation on the count itself (e.g., it will show counts greater than 9 or 99 as an exact
  number, not a capped indicator like "9+"), since no such requirement was specified.
