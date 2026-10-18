-- Supabase data layer: membership profile fields and a frozen public-pairings snapshot.
-- This migration is additive. It has not been applied to a real Supabase project.

alter table public.club_members
  add column if not exists display_name text;

alter table public.club_members
  drop constraint if exists club_members_role_check;

alter table public.club_members
  add constraint club_members_role_check
  check (role in ('owner', 'organizer', 'desk'));

alter table public.tournaments
  add column if not exists published_snapshot jsonb;

alter table public.tournaments
  add constraint tournaments_published_snapshot_shape
  check (
    published_snapshot is null
    or (
      jsonb_typeof(published_snapshot) = 'object'
      and coalesce(jsonb_typeof(published_snapshot -> 'at') = 'string', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'signature') = 'string', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'groups') = 'array', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'eventName') = 'string', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'date') = 'string', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'startFormat') = 'string', false)
      and coalesce(jsonb_typeof(published_snapshot -> 'firstTeeTime') = 'string', false)
    )
  );

-- Pairings come only from the frozen snapshot. The optional argument lets the current single-club
-- public route show the nearest upcoming event without a tournament picker; an unpublished event
-- returns its name/date/format with null pairing columns, never live group data.
drop function if exists public.public_pairings(uuid);

create function public.public_pairings(p_tournament uuid default null)
returns table (
  tournament_id uuid,
  tournament_name text,
  play_date date,
  start_format text,
  first_tee_time time,
  published_at timestamptz,
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
      end as published_at
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
