-- T002: adds the admin "force early return" flag to `reservations` — see
-- specs/005-admin-loan-oversight/data-model.md and research.md §2.
--
-- Nullable; set (and re-set on repeat requests) by POST /admin/reservations/:id/force-return.
-- Never implies a `status` change by itself — the book is still physically checked out when this
-- is set. Numbered 0006 (not 0005) to avoid colliding with the concurrently in-flight sibling
-- FEAT-04 migration, which claims 0005 for its own unrelated column — see research.md §1.
ALTER TABLE reservations ADD COLUMN force_return_requested_at TEXT;
