-- Public pairings split by playing day.
--
-- This migration is additive. It creates one new function and nothing else: no table, column,
-- policy, grant on an existing object or existing function is changed or dropped. NOT APPLIED. It is
-- written for review and has not been pushed to any project.
--
-- Why: the published snapshot now stores `dayNumber`, `dayLabel` and `playDate` on every group. The
-- existing public_pairings() has no day column, so a two-day event shows two different groups that
-- both carry number 1 as one merged group. This function returns the same rows plus the day, and the
-- page groups by day and number together.
--
-- The function is a copy of the latest public_pairings() body with three changes:
--   * `day_number` is read from the group, defaulting to 1 for snapshots written before days.
--   * `play_date` is the group's own play date, falling back to the event date.
--   * `day_label` is the group's label, or null when the snapshot has none.
--
-- The new function is private by default; the grant below applies to this new object only, because
-- the signed-out public page calls it. public_pairings() keeps its own definition and grants.

create function public.public_pairings_by_day(p_tournament uuid default null)
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
  photo_path text,
  day_number smallint,
  day_label text
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
    -- The group's own playing date, so two days of one event never share a date by accident.
    coalesce((g.item ->> 'playDate')::date, s.play_date),
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
    end as photo_path,
    -- Snapshots written before days carry no day number; they are day 1.
    coalesce((g.item ->> 'dayNumber')::smallint, 1::smallint) as day_number,
    nullif(g.item ->> 'dayLabel', '') as day_label
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

revoke all on function public.public_pairings_by_day(uuid) from public;
grant execute on function public.public_pairings_by_day(uuid) to anon, authenticated;
