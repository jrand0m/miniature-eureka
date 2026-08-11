# Feature Specification: Account Login, Registration & Admin User Management

**Feature Branch**: `001-auth-user-management`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "I want to have the possibility to log in and log out into the system and register simple account. So for the starters, all accounts get registered if we have provided the email and password. So we don't do the any confirmation for it. Um and don't do any anything like to you know to to uh to prevent the new users from happening. Additionally, I'd like to have the separate admin account with password 1,2,3,4,5. I will change later, that is preceded into the system. Additionally, I want to have in the admin UI list of the users with their login date and with their last login date and possibility to disable login for the user"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Service Registration (Priority: P1)

A visitor with just an email address and a password can create their own account, with no
confirmation step, approval step, or other gate standing between them and an active account.

**Why this priority**: Without a way to create accounts, there is no one to log in — this is the
entry point for every other story.

**Independent Test**: Can be fully tested by submitting a new email/password pair and observing
that a usable account exists immediately afterward, with no email confirmation link, admin
approval, or waiting period involved.

**Acceptance Scenarios**:

1. **Given** no existing account for a given email, **When** a visitor submits that email and a
   password, **Then** a new account is created and immediately usable.
2. **Given** an email that already has an account, **When** someone submits that email to
   register again, **Then** the system rejects the second registration and does not create a
   duplicate account.

---

### User Story 2 - Login & Logout (Priority: P1)

Anyone with valid account credentials — a self-registered user or the built-in administrator —
can log in to start a session and log out to end it.

**Why this priority**: Registration is only useful if the resulting account can actually be used
to access the system; login/logout is the core session lifecycle every user depends on.

**Independent Test**: Can be fully tested using the pre-seeded administrator credentials alone
(no registration required): log in, confirm access, then log out and confirm access ends.

**Acceptance Scenarios**:

1. **Given** a valid, enabled account, **When** the correct email and password are submitted,
   **Then** the user is logged in and reaches the system.
2. **Given** an active logged-in session, **When** the user logs out, **Then** the session ends
   and the system requires login again to regain access.
3. **Given** a valid account, **When** an incorrect password is submitted, **Then** login is
   refused with a generic error that does not reveal whether the email or the password was
   wrong.

---

### User Story 3 - Administrator User Oversight (Priority: P2)

An administrator, using the Admin UI, can see every account in the system — including when each
one registered and when it last logged in — and can turn off a specific user's ability to log
in.

**Why this priority**: Once self-registration is open to anyone, an administrator needs
visibility into who has signed up and a way to cut off access for a specific account; this
builds directly on Stories 1 and 2 rather than standing alone.

**Independent Test**: Can be fully tested by logging in as the administrator, viewing the user
list, disabling one test account, and confirming that account can no longer log in while all
other accounts are unaffected.

**Acceptance Scenarios**:

1. **Given** at least one registered user, **When** an administrator opens the user list,
   **Then** each user's registration date and most recent login date are visible (showing
   clearly when a user has never logged in).
2. **Given** an enabled user account, **When** an administrator disables it, **Then** that user's
   next login attempt is refused.
3. **Given** a disabled user account, **When** an administrator re-enables it, **Then** that
   user can log in again normally.
4. **Given** the system's sole administrator account, **When** that administrator attempts to
   disable their own account, **Then** the system prevents it so the system is never left with
   no usable administrator.

---

### Edge Cases

- What happens when someone submits registration with an email that is already registered? →
  Rejected; no duplicate account is created (User Story 1, Scenario 2).
- What happens when a disabled user tries to log in? → Refused with a clear message that access
  has been disabled (not a generic "wrong password" message).
- What happens when a user has registered but never logged in? → Their last-login value is shown
  as empty/"Never" rather than a misleading date.
- What happens when login credentials are simply wrong (bad password or unknown email)? → A
  single generic failure message is shown, without indicating which part was incorrect.
- What happens if an administrator tries to disable the only administrator account? → Prevented,
  to avoid locking everyone out of administration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow any visitor to self-register a new account by providing only an
  email address and a password.
- **FR-002**: System MUST NOT require email confirmation, manual approval, or any other
  verification step before a self-registered account becomes active and usable.
- **FR-003**: System MUST NOT apply anti-abuse gates (e.g., CAPTCHA, invite codes, rate limits
  that block registration) that would prevent or delay new accounts from being created.
- **FR-004**: System MUST reject a registration attempt for an email address that already has an
  account, and MUST NOT create a duplicate account.
- **FR-005**: System MUST allow any holder of valid, enabled account credentials to log in with
  their email and password.
- **FR-006**: System MUST allow a logged-in user to log out, ending their active session.
- **FR-007**: System MUST refuse login for incorrect credentials with a single generic failure
  message that does not reveal whether the email or the password was the invalid part.
- **FR-008**: System MUST provision exactly one built-in administrator account at first run,
  separate from self-registered accounts, usable to log in from day one.
- **FR-009**: System MUST record, for every account, the date the account was registered and the
  date/time of that account's most recent successful login.
- **FR-010**: Admin UI MUST display a list of all accounts showing each account's registration
  date and last-login date (or an explicit "never logged in" indicator).
- **FR-011**: Admin UI MUST allow an administrator to disable a specific user account, which MUST
  cause all future login attempts for that account to be refused.
- **FR-012**: Admin UI MUST allow an administrator to re-enable a previously disabled account,
  restoring its ability to log in.
- **FR-013**: System MUST prevent the sole administrator account from being disabled, whether by
  itself or by any other actor.
- **FR-014**: System MUST store account passwords using a secure, industry-standard method and
  MUST NOT store or display passwords in plain, readable form at any time.

### Key Entities

- **Account**: A person's identity in the system — email address, password credential, whether
  it is the administrator or a standard self-registered user, registration date/time, most
  recent successful-login date/time, and whether login is currently enabled or disabled.
- **Session**: The state representing a logged-in account between login and logout (or
  expiration); used to determine whether a given request is authenticated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can go from "no account" to "logged in and using the system" in
  under one minute, with zero manual approval or confirmation steps involved.
- **SC-002**: 100% of login attempts against a disabled account are refused, with 0 disabled
  accounts able to reach the system.
- **SC-003**: An administrator can find any given user's registration date and last-login date,
  and disable or re-enable that user's access, in under 30 seconds from opening the Admin UI.
- **SC-004**: 0 user passwords are ever stored or displayed anywhere in the system in a plainly
  readable form.
- **SC-005**: The system is never left in a state with zero usable administrator accounts.

## Assumptions

- Successful registration (User Story 1) automatically logs the new user in; no separate
  first-login step is required.
- Exactly one administrator account exists for this iteration; self-registered accounts cannot
  become administrators, and the Admin UI does not offer a way to create additional
  administrators yet.
- The built-in administrator account is seeded with a fixed, known initial password (as
  requested) purely to bootstrap the system; this is treated as a temporary operational
  credential that the operator is expected to change, consistent with the project constitution's
  bootstrap-admin exception.
- No password complexity or strength rules are enforced in this iteration, matching the
  request to keep registration frictionless.
- Disabling a user blocks future login attempts; it does not forcibly terminate a session that
  is already active at the moment of disabling. Forced session termination is out of scope for
  this iteration.
- "Login date" in the admin list refers to the account's registration date, shown alongside a
  separate, most-recent "last login date" column.
