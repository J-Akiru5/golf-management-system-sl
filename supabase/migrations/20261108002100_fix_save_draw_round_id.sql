-- Fix save_draw so every group_members row carries the playing day's round_id.
--
-- APPLIED to the live project on 8 November 2026 by the owner. Verified by saving a Move; no app
-- deploy was needed.
--
-- 20261106000200 made group_members.round_id NOT NULL and taught save_draw to copy the group's
-- round_id into each member. 20261108000900 replaced the function body with a version copied from
-- before that change, so it inserted group_members without round_id. Every draw save then failed
-- with
--
--   null value in column "round_id" of relation "group_members" violates not-null constraint
--
-- and the desk showed "Not saved" (seen on a Move, 8 November 2026). The groups insert still named
-- round_id, so the failure was only in the member rows.
--
-- This migration keeps the null-round guard from 20261108000900 and restores the round_id copy from
-- 20261106000200. It replaces only the function body. The signature, return type, security definer,
-- search_path and ACL are unchanged, and no table, column, policy, trigger or data is touched.
-- Additive and safe to re-run.
--
-- After applying, a Move on a multi-day event must save. This query must return no rows:
--
--   select gm.group_id, gm.registration_id
--   from public.group_members gm
--   join public.groups g on g.id = gm.group_id
--   where gm.round_id is null or gm.round_id <> g.round_id;

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
  v_round_count integer;
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

  -- A null round means "replace the whole event board". That is only safe when the event has a
  -- single board to replace. With more than one round it would destroy the other days.
  if v_round is null then
    select count(*) into v_round_count
    from public.competition_rounds r
    where r.tournament_id = p_tournament;

    if v_round_count > 1 then
      raise exception 'This event has % playing days. Save the draw for one day, not the whole event.',
        v_round_count using errcode = '22023';
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
