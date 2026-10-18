-- Course data confirmation.
--
-- The desk saves tees and holes, but nothing recorded whether anyone had checked those numbers
-- against the club scorecard. A first save of the starter (sample) ratings looked exactly like a
-- save of the real ones, so a printed sheet could not tell the difference and the placeholder
-- watermark had to be hard-coded on forever.
--
-- This adds one flag to the event: an owner or organizer has confirmed that the saved tees and
-- holes match the club scorecard. It is per event, defaults to false, and is withdrawn by the desk
-- whenever a rating, par or stroke index changes afterwards. Printed sheets are watermarked until
-- it is true.
--
-- It lives on `tournaments` on purpose: that table is already writable only by an owner or
-- organizer (see 20261019000000_staff_auth_audit.sql), which is who may vouch for the numbers, so
-- no new policy is needed. The desk writes it in a separate statement from the event row, so a
-- database that has not applied this file still saves everything else and reports the missing
-- column clearly instead of failing every save.
--
-- Additive and safe to re-run. No existing row changes meaning: every current event is
-- unconfirmed, which is the truthful state.

alter table public.tournaments
  add column if not exists course_data_confirmed boolean not null default false;

comment on column public.tournaments.course_data_confirmed is
  'An owner or organizer confirmed the tees and holes against the club scorecard. Printed sheets carry a placeholder mark until true.';
