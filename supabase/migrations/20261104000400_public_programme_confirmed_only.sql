-- The public programme must list confirmed players only.
--
-- `public_programme()` builds the public player cards from the live registrations and filtered them
-- only by `status <> 'ineligible'`. A `needs_review` entry is not ineligible, so its name, home club
-- and frozen index were published before the desk had accepted the entry. That is exactly the state
-- an entry lands in when a rule or a handicap needs a human, so the card could be wrong as well as
-- unconfirmed.
--
-- This migration recreates the function with one change: the player list keeps `status = 'ok'` only.
-- The day list, the confirmed-time rule, the rules of play, the JSON shape, the security definer
-- setting and the grants are unchanged. The day list is left alone on purpose; see the note at the
-- end of this file.

create or replace function public.public_programme(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select
      t.id,
      t.club_id,
      t.published,
      t.rules_of_play,
      case
        when t.published and t.published_snapshot is not null then t.published_snapshot ->> 'eventName'
        else t.name
      end as name,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'date')::date
        else t.play_date
      end as play_date
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  )
  select case
    when s.published then jsonb_build_object(
      'tournamentId', s.id,
      'name', s.name,
      'date', s.play_date,
      'rulesOfPlay', s.rules_of_play,
      'days', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'dayNumber', d.day_number,
              'label', d.label,
              'playDate', d.play_date,
              'startTime', case
                when d.start_time is null then null
                else to_char(d.start_time, 'HH24:MI')
              end,
              'players', coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'name', p.full_name,
                      'teeTime', case
                        when rd.tee_confirmed then to_char(rd.tee_time, 'HH24:MI')
                        else null
                      end,
                      'startHole', case
                        when rd.tee_confirmed then rd.start_hole
                        else null
                      end,
                      'confirmed', coalesce(rd.tee_confirmed, false)
                    )
                    order by case when rd.tee_confirmed then rd.tee_time end nulls last,
                             p.full_name
                  )
                  from public.registration_days rd
                  join public.registrations r
                    on r.id = rd.registration_id and r.club_id = rd.club_id
                  join public.players p
                    on p.id = r.player_id and p.club_id = r.club_id
                  where rd.tournament_day_id = d.id
                    and rd.selected
                    and r.status <> 'ineligible'
                ),
                '[]'::jsonb
              )
            )
            order by d.day_number
          )
          from public.tournament_days d
          where d.tournament_id = s.id
            and d.club_id = s.club_id
            and d.is_playing_day
        ),
        '[]'::jsonb
      ),
      'players', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', p.full_name,
              'homeCourse', nullif(btrim(p.home_course), ''),
              'index', r.frozen_index,
              'category', c.name,
              'flight', f.name
            )
            order by p.full_name
          )
          from public.registrations r
          join public.players p
            on p.id = r.player_id and p.club_id = r.club_id
          left join public.categories c
            on c.id = r.category_id and c.club_id = r.club_id
          left join public.flights f
            on f.id = r.flight_id and f.club_id = r.club_id
          where r.tournament_id = s.id
            and r.club_id = s.club_id
            -- Only a confirmed entry is a programme player. A needs_review entry carries the same
            -- name, home club and index, so publishing it would show data the desk has not accepted.
            and r.status = 'ok'
        ),
        '[]'::jsonb
      )
    )
    else null
  end
  from selected s;
$$;

revoke all on function public.public_programme(uuid) from public;
grant execute on function public.public_programme(uuid) to anon, authenticated;

-- Self-check: the replacement is in place, still security definer, still callable by anon.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'public_programme'
       and p.prosecdef
       and p.prosrc like '%r.status = ''ok''%'
  ) then
    raise exception 'public_programme was not replaced with the confirmed-only player list';
  end if;

  if exists (
    select 1 from pg_proc p
     where p.proname = 'public_programme'
       and p.proacl is not null
       and not exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_programme is not executable by anon';
  end if;
end $$;

-- Known limit: the day list above still keeps `status <> 'ineligible'`, unchanged from
-- 20261041000000 as this migration was scoped. An unconfirmed player can therefore still appear by
-- name, with no tee time. Filtering that list to `ok` is the next step if the owner wants the whole
-- page confirmed-only.
