-- T011: seed the single hardcoded administrator account.
--
-- This is the bootstrap exception documented in Constitution Principle III: a known
-- initial credential exists ONLY to get the system running, and MUST be rotated by the
-- operator immediately after first deploy (there is no in-app "change admin password"
-- flow in this iteration — rotate by re-running hashPassword() from
-- admin-api/src/services/password.ts with a new password and UPDATE-ing this row, or by
-- deleting and re-seeding before go-live).
--
-- Credentials: admin@library.local / 12345 (per the original request — CHANGE BEFORE
-- ANY real deployment; this password is intentionally weak and is not a secret once this
-- repository is public).
INSERT INTO users (id, email, password_hash, password_salt, role, registered_at, last_login_at, enabled)
VALUES (
  'dd6fd659-cbf9-4aaa-a8e0-0de631955b68',
  'admin@library.local',
  '6f8f2dfd1532d43a1913cc09a43eefab87cb01706c58113e7417a76af4087e8e',
  'e3804253ab8154c558c66b0596bbc80f',
  'admin',
  '2026-08-11T20:34:50.552Z',
  NULL,
  1
);
