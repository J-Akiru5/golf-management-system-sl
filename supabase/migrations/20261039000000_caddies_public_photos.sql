-- Caddie profiles, consented public player photos, player membership editing and public results.
--
-- STATUS: applied to the live project on 22 Oct 2026 and recorded as
-- 20261039000000 / caddies_public_photos. Every statement is additive.
--
-- The owner has asked for player photos on public pairings, the flight schedule and a leaderboard.
-- The project's previous rule was "photos only where consent is recorded; never on public pages".
-- That rule is now split in two:
--
--   photo_consent_at         internal use: check-in, desk profile, posters
--   photo_public_consent_at  public use: pairings, leaderboard, printed/posted sheets
--
-- Existing internal consent is NOT promoted to public consent. A public page only ever receives a
-- path from the public bucket, and only when the public consent timestamp is set. The private original
-- stays in the private bucket.

-- 1. Player public photo fields -----------------------------------------------------------------

alter table public.players
  add column if not exists photo_public_path text,
  add column if not exists photo_public_consent_at timestamptz;

-- A public path must point at this club's folder and this player's stable file. This stops a staff
-- account from pointing one player's public photo at another club's object.
alter table public.players
  add constraint players_public_photo_path_scope
  check (
    photo_public_path is null
    or photo_public_path = club_id::text || '/' || id::text || '.jpg'
  );

create index if not exists players_public_photo
  on public.players (club_id, photo_public_consent_at)
  where photo_public_consent_at is not null;

-- 2. Public photo bucket ------------------------------------------------------------------------
-- The original stays private. This bucket holds only images the player explicitly allowed on public
-- pages. The path is {club_id}/{player_id}.jpg; a new photo overwrites it, withdrawal removes it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos-public',
  'player-photos-public',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = true;

drop policy if exists player_photos_public_read on storage.objects;
create policy player_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'player-photos-public');

drop policy if exists player_photos_public_staff_write on storage.objects;
create policy player_photos_public_staff_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'player-photos-public'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'player-photos-public'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  );

-- 3. Caddie profiles ----------------------------------------------------------------------------

create table if not exists public.caddies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  full_name text not null,
  nickname text,
  phone text,
  email text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id)
);

create index if not exists caddies_club_name
  on public.caddies (club_id, lower(full_name));

create index if not exists caddies_club_active
  on public.caddies (club_id, active);

drop trigger if exists caddies_stamp_updated_at on public.caddies;
create trigger caddies_stamp_updated_at
  before update on public.caddies
  for each row execute function public.stamp_updated_at();

-- Assignments are anchored to a registration's day, not a group: save_draw replaces groups on every
-- draw save, so a group id would be destroyed. One active caddie per player-day, and one active player
-- per caddie per tournament day.
create unique index if not exists registration_days_id_club
  on public.registration_days (id, club_id);

create table if not exists public.caddie_assignments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  tournament_day_id uuid not null,
  registration_day_id uuid not null,
  caddie_id uuid not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'confirmed', 'cancelled')),
  note text,
  assigned_by uuid default auth.uid(),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (tournament_day_id, club_id) references public.tournament_days (id, club_id) on delete cascade,
  foreign key (registration_day_id, club_id) references public.registration_days (id, club_id) on delete cascade,
  foreign key (caddie_id, club_id) references public.caddies (id, club_id) on delete restrict
);

create unique index if not exists caddie_assignments_one_per_player_day
  on public.caddie_assignments (registration_day_id)
  where status in ('assigned', 'confirmed');

create unique index if not exists caddie_assignments_one_bag
  on public.caddie_assignments (caddie_id, tournament_day_id)
  where status in ('assigned', 'confirmed');

create index if not exists caddie_assignments_day
  on public.caddie_assignments (tournament_day_id, status);

create index if not exists caddie_assignments_caddie
  on public.caddie_assignments (caddie_id, tournament_day_id);

create or replace function public.validate_caddie_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration_day record;
  v_caddie record;
begin
  select rd.club_id, rd.tournament_id, rd.tournament_day_id into v_registration_day
  from public.registration_days rd
  where rd.id = new.registration_day_id;

  if not found then
    raise exception 'That registration day was not found.';
  end if;

  select c.club_id, c.active into v_caddie
  from public.caddies c
  where c.id = new.caddie_id;

  if not found then
    raise exception 'That caddie was not found.';
  end if;
  if v_caddie.club_id <> v_registration_day.club_id then
    raise exception 'That caddie belongs to a different club.';
  end if;
  if new.status <> 'cancelled' and not v_caddie.active then
    raise exception 'That caddie is not active.';
  end if;

  new.club_id := v_registration_day.club_id;
  new.tournament_id := v_registration_day.tournament_id;
  new.tournament_day_id := v_registration_day.tournament_day_id;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_caddie_assignment() from public;

drop trigger if exists caddie_assignments_validate on public.caddie_assignments;
create trigger caddie_assignments_validate
  before insert or update on public.caddie_assignments
  for each row execute function public.validate_caddie_assignment();

-- 4. RLS and audit ------------------------------------------------------------------------------

alter table public.caddies enable row level security;
alter table public.caddie_assignments enable row level security;

drop policy if exists caddies_read on public.caddies;
create policy caddies_read on public.caddies
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists caddies_manager_write on public.caddies;
create policy caddies_manager_write on public.caddies
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

drop policy if exists caddie_assignments_read on public.caddie_assignments;
create policy caddie_assignments_read on public.caddie_assignments
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists caddie_assignments_staff_write on public.caddie_assignments;
create policy caddie_assignments_staff_write on public.caddie_assignments
  for all to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

drop trigger if exists caddies_audit on public.caddies;
create trigger caddies_audit
  after insert or update or delete on public.caddies
  for each row execute function public.audit_row_change();

drop trigger if exists caddie_assignments_audit on public.caddie_assignments;
create trigger caddie_assignments_audit
  after insert or update or delete on public.caddie_assignments
  for each row execute function public.audit_row_change();

-- A caddie cannot be retired while still holding an active bag. Clear or reassign the player first;
-- the desk gets a clear error rather than an assignment that points at an inactive caddie.
create or replace function public.guard_caddie_retirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active then
    if exists (
      select 1 from public.caddie_assignments a
       where a.caddie_id = new.id
         and a.status in ('assigned', 'confirmed')
    ) then
      raise exception 'This caddie still has an active assignment. Clear or reassign it first.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_caddie_retirement() from public;

drop trigger if exists caddies_guard_retirement on public.caddies;
create trigger caddies_guard_retirement
  before update of active on public.caddies
  for each row execute function public.guard_caddie_retirement();

-- A player who drops a day must not keep a caddie holding that day's bag. The assignment history
-- stays; the active row is cancelled and therefore no longer blocks the caddie on another player.
create or replace function public.cancel_caddie_on_day_unselected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.selected and not new.selected then
    update public.caddie_assignments
       set status = 'cancelled', updated_at = now()
     where registration_day_id = new.id
       and status in ('assigned', 'confirmed');
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_caddie_on_day_unselected() from public;

drop trigger if exists registration_days_cancel_caddie on public.registration_days;
create trigger registration_days_cancel_caddie
  after update of selected on public.registration_days
  for each row execute function public.cancel_caddie_on_day_unselected();

-- 5. Guarded membership and caddie writes -------------------------------------------------------

create or replace function public.set_player_membership(
  p_player uuid,
  p_type text,
  p_member_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.players where id = p_player;
  if v_club is null then
    return jsonb_build_object('ok', false, 'message', 'That player was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change membership.' using errcode = '42501';
  end if;

  if p_type = 'member' then
    insert into public.player_memberships
      (club_id, player_id, membership_type, member_number, status)
    values
      (v_club, p_player, 'member', nullif(btrim(coalesce(p_member_number, '')), ''), 'active')
    on conflict (club_id, player_id) where status = 'active'
    do update set membership_type = 'member',
                  member_number = excluded.member_number,
                  updated_at = now();
  elsif p_type = 'guest' then
    update public.player_memberships
       set status = 'inactive', updated_at = now()
     where club_id = v_club and player_id = p_player and status = 'active';
  else
    return jsonb_build_object('ok', false, 'message', 'Membership must be member or guest.');
  end if;

  return jsonb_build_object('ok', true, 'membershipType', p_type);
end;
$$;

revoke all on function public.set_player_membership(uuid, text, text) from public;
grant execute on function public.set_player_membership(uuid, text, text) to authenticated;

create or replace function public.assign_caddie(
  p_registration uuid,
  p_day integer,
  p_caddie uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration_day record;
  v_caddie_name text;
  v_id uuid;
begin
  select rd.id, rd.club_id, rd.tournament_id, rd.tournament_day_id
    into v_registration_day
    from public.registration_days rd
    join public.tournament_days d
      on d.id = rd.tournament_day_id and d.club_id = rd.club_id
   where rd.registration_id = p_registration
     and d.day_number = p_day
     and rd.selected
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That player has not selected this day.');
  end if;

  if not public.has_club_role(v_registration_day.club_id, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to assign caddies for this event.' using errcode = '42501';
  end if;

  if p_caddie is null then
    update public.caddie_assignments
       set status = 'cancelled', updated_at = now()
     where registration_day_id = v_registration_day.id
       and status in ('assigned', 'confirmed');
    return jsonb_build_object('ok', true, 'caddieId', null, 'caddieName', null);
  end if;

  select full_name into v_caddie_name
    from public.caddies
   where id = p_caddie and club_id = v_registration_day.club_id and active;

  if v_caddie_name is null then
    return jsonb_build_object('ok', false, 'message', 'That caddie is not active in this club.');
  end if;

  if exists (
    select 1 from public.caddie_assignments a
     where a.club_id = v_registration_day.club_id
       and a.caddie_id = p_caddie
       and a.tournament_day_id = v_registration_day.tournament_day_id
       and a.status in ('assigned', 'confirmed')
       and a.registration_day_id <> v_registration_day.id
  ) then
    return jsonb_build_object('ok', false, 'message', 'That caddie is already carrying another player on this day.');
  end if;

  update public.caddie_assignments
     set status = 'cancelled', updated_at = now()
   where registration_day_id = v_registration_day.id
     and status in ('assigned', 'confirmed');

  insert into public.caddie_assignments
    (club_id, tournament_id, tournament_day_id, registration_day_id, caddie_id, status)
  values
    (v_registration_day.club_id, v_registration_day.tournament_id,
     v_registration_day.tournament_day_id, v_registration_day.id, p_caddie, 'assigned')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'assignmentId', v_id, 'caddieId', p_caddie, 'caddieName', v_caddie_name);
end;
$$;

revoke all on function public.assign_caddie(uuid, integer, uuid) from public;
grant execute on function public.assign_caddie(uuid, integer, uuid) to authenticated;

-- 6. Public pairings with ids and consented public photos ---------------------------------------
-- Old published snapshots have names only. They keep working with null id and photo. A new publish
-- writes `playerIds` beside `players`; the public function reads both.

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
  player_id uuid,
  player_name text,
  photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select
      t.id,
      t.club_id,
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
    player.player_id,
    p.player_name,
    case
      when player.player_id is null then null
      when pl.photo_public_consent_at is null then null
      else pl.photo_public_path
    end as photo_path
  from selected s
  left join lateral jsonb_array_elements(
    case
      when s.published and s.public_snapshot is not null then s.public_snapshot -> 'groups'
      else '[]'::jsonb
    end
  ) with ordinality as g(item, group_order) on true
  left join lateral jsonb_array_elements_text(g.item -> 'players')
    with ordinality as p(player_name, player_order) on true
  left join lateral (
    select nullif(g.item -> 'playerIds' ->> ((p.player_order - 1)::integer), '')::uuid as player_id
  ) player on true
  left join public.players pl
    on pl.id = player.player_id and pl.club_id = s.club_id
  order by g.group_order, p.player_order;
$$;

revoke all on function public.public_pairings(uuid) from public;
grant execute on function public.public_pairings(uuid) to anon, authenticated;

-- 7. Public results for the leaderboard ---------------------------------------------------------

create or replace function public.public_published_rounds()
returns table (
  round_id uuid,
  tournament_id uuid,
  event_name text,
  day_number smallint,
  play_date date,
  version integer,
  state text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (r.id)
      r.id,
      r.tournament_id,
      t.name,
      r.day_number,
      r.play_date,
      p.version,
      p.state,
      p.published_at
    from public.competition_rounds r
    join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
    join public.round_publications p on p.round_id = r.id and p.club_id = r.club_id
    where p.state in ('provisional', 'final')
    order by r.id, p.version desc
  )
  select * from latest
  order by play_date desc, day_number;
$$;

revoke all on function public.public_published_rounds() from public;
grant execute on function public.public_published_rounds() to anon, authenticated;

create or replace function public.public_player_photos(p_ids uuid[])
returns table (player_id uuid, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.photo_public_path
  from public.players p
  where p.id = any (coalesce(p_ids, array[]::uuid[]))
    and p.photo_public_consent_at is not null
    and p.photo_public_path is not null;
$$;

revoke all on function public.public_player_photos(uuid[]) from public;
grant execute on function public.public_player_photos(uuid[]) to anon, authenticated;

-- The results snapshot carries the player id so the leaderboard can fetch a current public photo.
-- Old snapshots remain readable; they simply have no id and no photo.
create or replace function public.build_round_snapshot(
  p_round uuid,
  p_state text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_event_name text;
  v_play_date date;
  v_holes integer;
  v_snapshot jsonb;
begin
  select r.club_id, r.play_date, t.name
  into v_club, v_play_date, v_event_name
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;

  select count(*) into v_holes
  from public.holes h
  join public.tournaments t on t.course_id = h.course_id and t.club_id = h.club_id
  join public.competition_rounds r on r.tournament_id = t.id and r.club_id = t.club_id
  where r.id = p_round and h.club_id = v_club;

  if v_holes = 0 then
    raise exception 'The course has no holes' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'eventName', v_event_name,
    'playDate', v_play_date,
    'version', p_version,
    'state', p_state,
    'publishedAt', now(),
    'gross', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.gross_points,
        'strokes', rr.gross_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.gross_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb),
    'net', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.net_points,
        'strokes', rr.net_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.net_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0 and rr.net_points is not null
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.build_round_snapshot(uuid, text, integer)
  from public, anon, authenticated;

-- 8. Self-check ---------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'players'
                    and column_name = 'photo_public_consent_at') then
    raise exception 'players.photo_public_consent_at was not added';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'players_public_photo_path_scope'
                    and conrelid = 'public.players'::regclass) then
    raise exception 'players_public_photo_path_scope was not added';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'caddies') then
    raise exception 'caddies was not created';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'caddie_assignments') then
    raise exception 'caddie_assignments was not created';
  end if;
  if not exists (select 1 from storage.buckets where id = 'player-photos-public' and public) then
    raise exception 'player-photos-public is not a public bucket';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'assign_caddie') then
    raise exception 'assign_caddie was not created';
  end if;
  if exists (select 1 from pg_proc p
              where p.proname = 'public_published_rounds'
                and p.proacl is not null
                and not exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')) then
    raise exception 'public_published_rounds is not executable by anon';
  end if;
end $$;
