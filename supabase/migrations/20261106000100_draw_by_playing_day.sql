-- A draw belongs to a playing day, and a day runs a morning and an afternoon shotgun.
--
-- `groups.round_id` has existed since 20261035000000, but `save_draw` never named it, so every board
-- saved from the desk landed on the first round and a per-day board could not be stored. This gives
-- the save a playing day, numbers groups per day, and puts the afternoon start on the event so the
-- draw is not given a made-up time.
--
-- The new argument is defaulted and the old four-argument call is dropped rather than left beside
-- it, so PostgREST has one signature to resolve. A caller that sends no round behaves exactly as
-- before: the whole event board is replaced and the trigger puts it on the first round.

alter table public.tournaments
  add column if not exists pm_first_tee_time time not null default '12:30';

-- Group numbers restart on each playing day, because that is how a day's sheet reads.
alter table public.groups drop constraint if exists groups_tournament_id_number_key;
alter table public.groups drop constraint if exists groups_round_number_key;
alter table public.groups add constraint groups_round_number_key unique (round_id, number);

drop function if exists public.save_draw(uuid, integer, jsonb, jsonb);

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

  -- A named day is replaced on its own; the rest of the week is left as it is.
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
    returning id into v_gid;

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
      insert into public.group_members (club_id, group_id, registration_id, position)
      values (v_club, v_gid, v_reg, v_pos);
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
