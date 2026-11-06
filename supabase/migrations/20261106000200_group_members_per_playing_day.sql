-- A player plays several days of one event, so one registration belongs in one group per day.
--
-- `group_members` was unique on `registration_id` alone. That allowed one group per player for the
-- whole event, so saving a second day's board failed with
-- `duplicate key value violates unique constraint "group_members_registration_id_key"` and a per-day
-- board could not be stored. The round is copied onto the member row, and the rule becomes one
-- group per player per playing day.
--
-- Applied by hand on 6 November 2026, because the board is drawn day by day and every day's board
-- holds the same players.

alter table public.group_members add column if not exists round_id uuid;

update public.group_members m
set round_id = g.round_id
from public.groups g
where g.id = m.group_id
  and m.round_id is null;

alter table public.group_members alter column round_id set not null;

alter table public.group_members drop constraint if exists group_members_registration_id_key;
drop index if exists public.group_members_registration_id_key;

create unique index if not exists group_members_one_per_playing_day
  on public.group_members (registration_id, round_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_members_round_fk'
      and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_round_fk foreign key (round_id)
      references public.competition_rounds (id) on delete cascade;
  end if;
end;
$$;

create index if not exists group_members_round on public.group_members (round_id);

-- save_draw writes the round on every member row, and takes it from the group when the caller did
-- not name a playing day, so the four-argument call keeps working.

create or replace function public.save_draw(
  p_tournament uuid,
  p_expected_revision integer,
  p_groups jsonb,
  p_overrides jsonb default null,
  p_round uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_rev integer;
  v_round uuid;
  v_group_round uuid;
  g jsonb;
  v_gid uuid;
  v_reg uuid;
  v_pid text;
  v_pos integer;
begin
  select t.club_id, t.draw_revision into v_club, v_rev
  from public.tournaments t
  where t.id = p_tournament
  for update;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change the draw' using errcode = '42501';
  end if;
  if v_rev <> p_expected_revision then
    raise exception 'draw_revision_conflict: the draw changed since it was loaded (now revision %, you had %)',
      v_rev, p_expected_revision using errcode = '40001';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'p_groups must be a JSON array' using errcode = '22023';
  end if;

  if p_round is not null then
    select r.id into v_round
    from public.competition_rounds r
    where r.id = p_round
      and r.tournament_id = p_tournament
      and r.club_id = v_club;
    if v_round is null then
      raise exception 'That playing day does not belong to this event' using errcode = '23503';
    end if;
  end if;

  if v_round is null then
    delete from public.group_members
    where group_id in (select id from public.groups where tournament_id = p_tournament);
    delete from public.groups where tournament_id = p_tournament;
  else
    delete from public.group_members
    where group_id in (
      select id from public.groups
      where tournament_id = p_tournament and round_id = v_round
    );
    delete from public.groups
    where tournament_id = p_tournament and round_id = v_round;
  end if;

  for g in select * from jsonb_array_elements(p_groups) loop
    insert into public.groups
      (club_id, tournament_id, flight_id, number, start_hole, wave, tee_time, locked, round_id)
    values (
      v_club,
      p_tournament,
      (g ->> 'flightId')::uuid,
      (g ->> 'number')::smallint,
      (g ->> 'startHole')::smallint,
      g ->> 'wave',
      (g ->> 'time')::time,
      coalesce((g ->> 'locked')::boolean, false),
      v_round
    )
    returning id, round_id into v_gid, v_group_round;

    v_pos := 0;
    for v_pid in select jsonb_array_elements_text(coalesce(g -> 'playerIds', '[]'::jsonb)) loop
      v_reg := null;
      select r.id into v_reg
      from public.registrations r
      where r.tournament_id = p_tournament and r.player_id = v_pid::uuid;
      if v_reg is null then
        raise exception 'Player % is not registered for this tournament', v_pid using errcode = '23503';
      end if;
      v_pos := v_pos + 1;
      insert into public.group_members (club_id, group_id, registration_id, position, round_id)
      values (v_club, v_gid, v_reg, v_pos, v_group_round);
    end loop;
  end loop;

  update public.tournaments
  set draw_revision = v_rev + 1,
      board_overrides = case when p_overrides is null then board_overrides else p_overrides end
  where id = p_tournament;

  return v_rev + 1;
end;
$$;

revoke all on function public.save_draw(uuid, integer, jsonb, jsonb, uuid) from public;
grant execute on function public.save_draw(uuid, integer, jsonb, jsonb, uuid) to authenticated;
