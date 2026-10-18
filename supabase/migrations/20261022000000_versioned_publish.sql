-- Versioned publish and an atomic, revision-guarded draw save.
--
-- NOT YET APPLIED to a real project. Review before `supabase db push`.
--
-- 1. tournaments.draw_revision: every draw save must name the revision it started from. A stale
--    save is refused, so two staff cannot silently overwrite each other.
-- 2. pairings_versions: one immutable row per publish (version 1, 2, 3...). Staff read it; only
--    publish_pairings() writes it. The public never reads it; the public reads only
--    tournaments.published_snapshot through public_pairings().
-- 3. groups and group_members become read-only for members. The draw is written only through
--    save_draw(), which checks the role, checks the revision and replaces the draw in one
--    transaction (replacing the earlier client-side delete/insert with a manual rollback).
-- 4. public_pairings() gains a `version` column.

alter table public.tournaments
  add column if not exists draw_revision integer not null default 0;

create table public.pairings_versions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  note text,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (tournament_id, version),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade
);

alter table public.pairings_versions enable row level security;

create policy pairings_versions_member_read on public.pairings_versions
  for select to authenticated using (public.is_club_member(club_id));
-- No insert, update or delete policy: only publish_pairings() (security definer) writes.

-- Groups: members read; writes go through save_draw() ----------------------------------------------

drop policy if exists groups_member_all on public.groups;
drop policy if exists group_members_member_all on public.group_members;

create policy groups_member_read on public.groups
  for select to authenticated using (public.is_club_member(club_id));
create policy group_members_member_read on public.group_members
  for select to authenticated using (public.is_club_member(club_id));

-- save_draw ------------------------------------------------------------------------------------------

create or replace function public.save_draw(
  p_tournament uuid,
  p_expected_revision integer,
  p_groups jsonb,
  p_overrides jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_rev integer;
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

  delete from public.group_members
  where group_id in (select id from public.groups where tournament_id = p_tournament);
  delete from public.groups where tournament_id = p_tournament;

  for g in select * from jsonb_array_elements(p_groups) loop
    insert into public.groups
      (club_id, tournament_id, flight_id, number, start_hole, wave, tee_time, locked)
    values (
      v_club,
      p_tournament,
      (g ->> 'flightId')::uuid,
      (g ->> 'number')::smallint,
      (g ->> 'startHole')::smallint,
      g ->> 'wave',
      (g ->> 'time')::time,
      coalesce((g ->> 'locked')::boolean, false)
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

revoke all on function public.save_draw(uuid, integer, jsonb, jsonb) from public;
grant execute on function public.save_draw(uuid, integer, jsonb, jsonb) to authenticated;

-- publish_pairings -----------------------------------------------------------------------------------
-- The caller sends the groups as players will see them. The event name, date, format and first tee
-- time are read from the tournament row here, so a client cannot publish different metadata.

create or replace function public.publish_pairings(
  p_tournament uuid,
  p_expected_revision integer,
  p_groups jsonb,
  p_signature text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tournaments%rowtype;
  v_version integer;
  v_at timestamptz := now();
  v_snapshot jsonb;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if t.id is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(t.club_id, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can publish' using errcode = '42501';
  end if;
  if t.draw_revision <> p_expected_revision then
    raise exception 'draw_revision_conflict: the draw changed since it was loaded (now revision %, you had %)',
      t.draw_revision, p_expected_revision using errcode = '40001';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'There are no groups to publish' using errcode = '22023';
  end if;

  select coalesce(max(v.version), 0) + 1 into v_version
  from public.pairings_versions v
  where v.tournament_id = p_tournament;

  v_snapshot := jsonb_build_object(
    'version', v_version,
    'at', v_at,
    'signature', coalesce(p_signature, ''),
    'eventName', t.name,
    'date', t.play_date,
    'startFormat', t.start_format,
    'firstTeeTime', t.first_tee_time,
    'groups', p_groups
  );

  insert into public.pairings_versions
    (club_id, tournament_id, version, snapshot, note, published_by, published_at)
  values
    (t.club_id, p_tournament, v_version, v_snapshot, nullif(btrim(p_note), ''), (select auth.uid()), v_at);

  update public.tournaments
  set published = true, published_snapshot = v_snapshot
  where id = p_tournament;

  return jsonb_build_object('version', v_version, 'at', v_at);
end;
$$;

revoke all on function public.publish_pairings(uuid, integer, jsonb, text, text) from public;
grant execute on function public.publish_pairings(uuid, integer, jsonb, text, text) to authenticated;

-- unpublish_pairings ---------------------------------------------------------------------------------
-- Takes the page down. The version history stays; the next publish continues the numbering.

create or replace function public.unpublish_pairings(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  select t.club_id into v_club from public.tournaments t where t.id = p_tournament for update;
  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can unpublish' using errcode = '42501';
  end if;
  update public.tournaments
  set published = false, published_snapshot = null
  where id = p_tournament;
end;
$$;

revoke all on function public.unpublish_pairings(uuid) from public;
grant execute on function public.unpublish_pairings(uuid) to authenticated;

-- public_pairings: unchanged except for the published version number ---------------------------------

drop function if exists public.public_pairings(uuid);

create function public.public_pairings(p_tournament uuid default null)
returns table (
  tournament_id uuid,
  tournament_name text,
  play_date date,
  start_format text,
  first_tee_time time,
  published_at timestamptz,
  version integer,
  group_number smallint,
  wave text,
  start_hole smallint,
  tee_time time,
  flight_name text,
  player_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select
      t.id,
      case
        when t.published and t.published_snapshot is not null then t.published_snapshot ->> 'eventName'
        else t.name
      end as name,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'date')::date
        else t.play_date
      end as play_date,
      case
        when t.published and t.published_snapshot is not null then t.published_snapshot ->> 'startFormat'
        else t.start_format
      end as start_format,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'firstTeeTime')::time
        else t.first_tee_time
      end as first_tee_time,
      t.published,
      case when t.published then t.published_snapshot end as public_snapshot,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'at')::timestamptz
        else null
      end as published_at,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'version')::integer
        else null
      end as version
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  )
  select
    s.id,
    s.name,
    s.play_date,
    s.start_format,
    s.first_tee_time,
    s.published_at,
    s.version,
    (g.item ->> 'number')::smallint,
    g.item ->> 'wave',
    (g.item ->> 'startHole')::smallint,
    (g.item ->> 'time')::time,
    g.item ->> 'flight',
    p.player_name
  from selected s
  left join lateral jsonb_array_elements(
    case
      when s.published and s.public_snapshot is not null then s.public_snapshot -> 'groups'
      else '[]'::jsonb
    end
  ) with ordinality as g(item, group_order) on true
  left join lateral jsonb_array_elements_text(g.item -> 'players')
    with ordinality as p(player_name, player_order) on true
  order by g.group_order, p.player_order;
$$;

revoke all on function public.public_pairings(uuid) from public;
grant execute on function public.public_pairings(uuid) to anon, authenticated;
