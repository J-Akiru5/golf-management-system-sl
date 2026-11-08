-- A playing day's own afternoon start.
--
-- The afternoon shotgun used to be inferred from a day's position in the list: 12:30 on an ordinary
-- day, 11:30 on the last playing day. That is wrong the moment a day moves or the list is sparse, so
-- the club stores the afternoon start on the day it belongs to. Nothing stored means the event's
-- afternoon start, then the old default.
--
-- Additive only: one nullable column on an existing table. No policy, grant, trigger, data or
-- existing-object change, so it is safe to re-run (`if not exists`).
--
-- Not applied by the agent that wrote it. Applying it to a real project is the owner's call.
alter table public.tournament_days
  add column if not exists pm_start_time time;
