-- T001: adds the user's preferred return date, captured when a return request is accepted
-- (005-user-profile-return). Nullable — only set once a return has been requested. See
-- specs/005-user-profile-return/data-model.md.
ALTER TABLE reservations ADD COLUMN return_requested_date TEXT;
