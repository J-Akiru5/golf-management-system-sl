-- Cap every player's playing handicap at the event's maximum index (24th Bamboo Tee: 30).
--
-- Owner decision, 14 Nov 2026: the tee formula decides the playing handicap
--   Course Handicap = Index x (Slope / 113) + (Course Rating - Par)
--   Playing Handicap = round(Course Handicap x allowance), capped at the event's max_index.
-- The card's HDCP box is a comparison only and is never the scoring value.
--
-- This migration:
--   1. adds a BEFORE INSERT/UPDATE trigger that caps playing_handicap at the event's max_index;
--   2. corrects the existing snapshots above the cap (13 Day 1 rows at the time of writing).
--
-- The course handicap is left as the formula produced it (34 stays 34); only the playing handicap
-- is capped (34 -> 30). The hand score results and publications are recalculated by the admin's
-- Publish action after this migration; this file does not publish anything.
--
-- The existing snapshot guard freezes a snapshot once the round leaves draft/open. The correction
-- therefore disables that guard only inside this migration's transaction, updates the approved
-- rows, and enables it again. The pre-change rows are in
-- backups/handicap-cap-30-2026-11-14T04-27-13-606Z/ on the build machine.

create or replace function public.cap_playing_handicap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max numeric;
begin
  select t.max_index
  into v_max
  from public.competition_rounds r
  join public.tournaments t
    on t.id = r.tournament_id
   and t.club_id = r.club_id
  where r.id = new.round_id
    and r.club_id = new.club_id;

  if v_max is not null and new.playing_handicap > v_max then
    new.playing_handicap := v_max::smallint;
  end if;
  return new;
end;
$$;

drop trigger if exists handicap_snapshots_playing_cap on public.handicap_snapshots;
create trigger handicap_snapshots_playing_cap
before insert or update of playing_handicap on public.handicap_snapshots
for each row execute function public.cap_playing_handicap();

alter table public.handicap_snapshots disable trigger handicap_snapshots_guard;

update public.handicap_snapshots hs
set playing_handicap = t.max_index::smallint
from public.competition_rounds r
join public.tournaments t
  on t.id = r.tournament_id
 and t.club_id = r.club_id
where hs.round_id = r.id
  and hs.club_id = r.club_id
  and hs.playing_handicap > t.max_index;

alter table public.handicap_snapshots enable trigger handicap_snapshots_guard;
