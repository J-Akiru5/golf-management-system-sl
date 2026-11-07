-- Every playing day gets a competition_rounds row.
--
-- This migration is additive. It inserts rows into public.competition_rounds for the event days that
-- already exist, and adds one private trigger function plus its trigger so a day added or changed
-- later gets its round too. No table, column, constraint, policy, grant or existing function is
-- changed or dropped, and no row is deleted.
--
-- NOT APPLIED. It is written for review and `supabase db push` has not been run.
--
-- Why: the draw board belongs to one playing day, and the desk reads a round to find it. Only day 1
-- has a round row today, because open_round() is the only code that creates one and it runs when a
-- round is opened. A three-day event therefore had no round for day 2 or day 3, so the desk loaded
-- day 1 whichever day was asked for (audit finding A1, GitHub #174).
--
-- What the insert does: for each playing day that has no round on its day number, one draft round is
-- written with the event's club, allowance and course hole count. `on conflict do nothing` makes a
-- second run a no-op and skips a day whose play date is already used by another round instead of
-- failing the whole statement.
--
-- What the trigger does: after a day row is inserted or its event, day number, date or playing state
-- changes, the same round is written when the day is a playing day and no round exists for that
-- (tournament_id, day_number). The function is private: it is security definer, pins an empty
-- search_path, names every object in full, and is not granted to any role.

insert into public.competition_rounds
  (club_id, tournament_id, day_number, play_date, hole_count, status, allowance,
   handicap_rounding)
select
  d.club_id,
  d.tournament_id,
  d.day_number,
  d.play_date,
  greatest(1, least(36, c.holes)),
  'draft',
  t.allowance,
  'whs'
from public.tournament_days d
join public.tournaments t on t.id = d.tournament_id and t.club_id = d.club_id
join public.courses c on c.id = t.course_id and c.club_id = t.club_id
where d.is_playing_day
order by d.tournament_id, d.day_number
on conflict do nothing;

-- One quiet guard for the day rows the desk already writes. It never raises: a day whose play date
-- is already used by another round is skipped, and the day row itself is always accepted.
create or replace function public.ensure_round_for_playing_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holes smallint;
  v_allowance numeric(4, 3);
begin
  if new.is_playing_day is not true then
    return new;
  end if;

  if exists (
    select 1
    from public.competition_rounds r
    where r.tournament_id = new.tournament_id
      and r.day_number = new.day_number
  ) then
    return new;
  end if;

  select greatest(1, least(36, c.holes)), t.allowance
  into v_holes, v_allowance
  from public.tournaments t
  join public.courses c on c.id = t.course_id and c.club_id = t.club_id
  where t.id = new.tournament_id
    and t.club_id = new.club_id;

  if v_holes is null or v_allowance is null then
    return new;
  end if;

  insert into public.competition_rounds
    (club_id, tournament_id, day_number, play_date, hole_count, status, allowance,
     handicap_rounding)
  values
    (new.club_id, new.tournament_id, new.day_number, new.play_date, v_holes, 'draft',
     v_allowance, 'whs')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.ensure_round_for_playing_day() from public, anon;

drop trigger if exists tournament_days_ensure_round on public.tournament_days;
create trigger tournament_days_ensure_round
  after insert or update of tournament_id, day_number, play_date, is_playing_day
  on public.tournament_days
  for each row execute function public.ensure_round_for_playing_day();
