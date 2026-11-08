-- Public player profile and cumulative team leaderboard (issue 198) ----------------------------
--
-- ADDITIVE. Three read-only changes:
--
--   1. `public_programme()` gains a stable player id in its player list, so the profile search can
--      point at one confirmed player.
--   2. `public_player_scorecard(p_player, p_tournament)` returns that player's frozen hole-by-hole
--      cards. It only answers for a confirmed entry in the selected event.
--   3. `public_team_leaderboard(p_tournament)` returns one row per player per published round. The
--      page adds the two partners together, so the anonymous payload never carries every player's
--      hole-by-hole card.
--
-- Both new functions read `round_publications.snapshot`, the same frozen document the published
-- leaderboard already uses. No live scoring table is read. No table, policy or existing grant is
-- changed.
--
-- This migration references `registration_pairs` and `registration_pair_members`, added by
-- 20261108002000_registration_pairs.sql. Apply that migration first.

-- 1. The programme carries the player id ---------------------------------------------------------

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
                    and r.status = 'ok'
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
              -- The id is already public through the pairings and the photo lookup. The profile
              -- search needs it to name one player without guessing from a duplicated name.
              'id', p.id,
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

-- 2. One player's frozen cards ------------------------------------------------------------------

create or replace function public.public_player_scorecard(
  p_player uuid,
  p_tournament uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select t.id, t.club_id, t.name, t.published
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  ),
  latest as (
    select distinct on (r.id)
      r.id as round_id,
      r.day_number,
      r.play_date,
      p.version,
      p.state,
      p.published_at,
      p.snapshot
    from public.competition_rounds r
    join public.round_publications p
      on p.round_id = r.id and p.club_id = r.club_id
    join selected s on s.id = r.tournament_id and s.club_id = r.club_id
    where p.state in ('provisional', 'final')
    order by r.id, p.version desc
  ),
  pair_of as (
    select distinct on (reg.player_id)
      reg.player_id,
      pair.number
    from public.registration_pair_members member
    join public.registration_pairs pair
      on pair.id = member.pair_id and pair.club_id = member.club_id
    join public.registrations reg
      on reg.id = member.registration_id and reg.club_id = member.club_id
    join selected s on s.id = pair.tournament_id and s.club_id = pair.club_id
    order by reg.player_id, pair.updated_at desc
  ),
  me as (
    select distinct on (r.player_id)
      r.player_id,
      r.id as registration_id,
      p.full_name,
      r.frozen_index,
      c.name as category_name,
      f.name as flight_name,
      coalesce(
        po.number,
        case
          when (r.answers ->> 'teamNo') ~ '^[0-9]+$' then (r.answers ->> 'teamNo')::integer
        end
      ) as pair_number
    from public.registrations r
    join selected s
      on s.id = r.tournament_id
     and s.club_id = r.club_id
     and s.published
    join public.players p on p.id = r.player_id and p.club_id = r.club_id
    left join public.categories c on c.id = r.category_id and c.club_id = r.club_id
    left join public.flights f on f.id = r.flight_id and f.club_id = r.club_id
    left join pair_of po on po.player_id = r.player_id
    where r.player_id = p_player
      and r.status = 'ok'
    order by r.player_id, r.created_at
  ),
  pair_partner as (
    select partner.id, partner.full_name
    from me
    join public.registration_pair_members mine
      on mine.registration_id = me.registration_id
    join public.registration_pair_members other
      on other.pair_id = mine.pair_id
     and other.registration_id <> mine.registration_id
    join public.registrations reg
      on reg.id = other.registration_id
     and reg.status = 'ok'
    join public.players partner
      on partner.id = reg.player_id and partner.club_id = reg.club_id
    limit 1
  ),
  team_no_partner as (
    select partner.id, partner.full_name
    from me
    join public.registrations reg
      on reg.tournament_id = (select id from selected)
     and reg.club_id = (select club_id from selected)
     and reg.player_id <> me.player_id
     and reg.status = 'ok'
    join public.players partner
      on partner.id = reg.player_id and partner.club_id = reg.club_id
    where me.pair_number is not null
      and not exists (select 1 from pair_partner)
      and case
        when (reg.answers ->> 'teamNo') ~ '^[0-9]+$' then (reg.answers ->> 'teamNo')::integer
      end = me.pair_number
    limit 1
  ),
  cards as (
    select
      expanded.card || jsonb_build_object(
        'roundId', l.round_id,
        'dayNumber', l.day_number,
        'playDate', l.play_date,
        'state', l.state,
        'version', l.version,
        'publishedAt', l.published_at
      ) as card,
      l.day_number
    from latest l,
    lateral (
      select value as card
      from jsonb_array_elements(coalesce(l.snapshot -> 'cards', '[]'::jsonb)) value
    ) expanded
    where expanded.card ->> 'playerId' = p_player::text
  )
  select case
    when not exists (select 1 from me) then null
    else jsonb_build_object(
      'tournamentId', (select id from selected),
      'player', (
        select jsonb_build_object(
          'id', player_id,
          'name', full_name,
          'index', frozen_index,
          'category', category_name,
          'flight', flight_name,
          'pairNumber', pair_number
        )
        from me
      ),
      'partner', (
        select jsonb_build_object('id', id, 'name', full_name)
        from (
          select * from pair_partner
          union all
          select * from team_no_partner
        ) partner
        limit 1
      ),
      'cards', coalesce((select jsonb_agg(card order by day_number) from cards), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.public_player_scorecard(uuid, uuid) from public;
grant execute on function public.public_player_scorecard(uuid, uuid) to anon, authenticated;

-- 3. The cumulative team leaderboard -------------------------------------------------------------
-- One row per player per published round. The two partners are added together by the page. The
-- payload carries totals only: no hole-by-hole card leaves the database on this path.

create or replace function public.public_team_leaderboard(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select t.id, t.club_id, t.name
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  ),
  latest as (
    select distinct on (r.id)
      r.id as round_id,
      r.day_number,
      r.play_date,
      p.version,
      p.state,
      p.published_at,
      p.snapshot
    from public.competition_rounds r
    join public.round_publications p
      on p.round_id = r.id and p.club_id = r.club_id
    join selected s on s.id = r.tournament_id and s.club_id = r.club_id
    where p.state in ('provisional', 'final')
    order by r.id, p.version desc
  ),
  pair_of as (
    select distinct on (reg.player_id)
      reg.player_id,
      pair.number
    from public.registration_pair_members member
    join public.registration_pairs pair
      on pair.id = member.pair_id and pair.club_id = member.club_id
    join public.registrations reg
      on reg.id = member.registration_id and reg.club_id = member.club_id
    join selected s on s.id = pair.tournament_id and s.club_id = pair.club_id
    order by reg.player_id, pair.updated_at desc
  ),
  team_of as (
    select distinct on (r.player_id)
      r.player_id,
      coalesce(
        po.number,
        case
          when (r.answers ->> 'teamNo') ~ '^[0-9]+$' then (r.answers ->> 'teamNo')::integer
        end
      ) as pair_number,
      c.name as category_name
    from public.registrations r
    join selected s on s.id = r.tournament_id and s.club_id = r.club_id
    left join pair_of po on po.player_id = r.player_id
    left join public.categories c
      on c.id = r.category_id and c.club_id = r.club_id
    where r.status = 'ok'
    order by r.player_id, r.created_at
  ),
  card_rows as (
    select
      l.round_id,
      l.day_number,
      l.play_date,
      l.state,
      l.version,
      l.published_at,
      expanded.card ->> 'playerId' as player_id,
      expanded.card ->> 'playerName' as player_name,
      expanded.card ->> 'flightName' as flight_name,
      team.category_name,
      team.pair_number,
      case
        when team.pair_number is null then 'solo:' || (expanded.card ->> 'playerId')
        else 'pair:' || team.pair_number::text
      end as pair_key,
      nullif(expanded.card ->> 'grossStrokes', '')::integer as gross_strokes,
      nullif(expanded.card ->> 'netStrokes', '')::integer as net_strokes,
      nullif(expanded.card ->> 'grossPoints', '')::integer as gross_points,
      nullif(expanded.card ->> 'netPoints', '')::integer as net_points,
      nullif(expanded.card ->> 'holesCounted', '')::integer as holes_counted,
      nullif(expanded.card ->> 'holesTotal', '')::integer as holes_total,
      coalesce(
        (
          select sum((hole ->> 'par')::integer)
          from jsonb_array_elements(coalesce(expanded.card -> 'holes', '[]'::jsonb)) hole
        ),
        0
      ) as par_total
    from latest l,
    lateral (
      select value as card
      from jsonb_array_elements(coalesce(l.snapshot -> 'cards', '[]'::jsonb)) value
    ) expanded
    left join team_of team on team.player_id::text = expanded.card ->> 'playerId'
    where expanded.card ->> 'playerId' is not null
  )
  select jsonb_build_object(
    'tournamentId', (select id from selected),
    'eventName', (select name from selected),
    'tieBreak', (
      select jsonb_build_object(
        'name', policy.name,
        'procedure', policy.procedure,
        'version', policy.version
      )
      from public.competition_rounds r
      join selected s on s.id = r.tournament_id and s.club_id = r.club_id
      join public.tie_break_policies policy
        on policy.id = r.tie_break_policy_id and policy.club_id = r.club_id
      where policy.confirmed_at is not null
        and policy.confirmed_by is not null
      order by r.day_number desc
      limit 1
    ),
    'rounds', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'roundId', round_id,
            'dayNumber', day_number,
            'playDate', play_date,
            'state', state,
            'version', version,
            'publishedAt', published_at
          )
          order by day_number
        )
        from latest
      ),
      '[]'::jsonb
    ),
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'roundId', round_id,
            'dayNumber', day_number,
            'playDate', play_date,
            'state', state,
            'version', version,
            'publishedAt', published_at,
            'playerId', player_id,
            'playerName', player_name,
            'flightName', flight_name,
            'categoryName', category_name,
            'pairNumber', pair_number,
            'pairKey', pair_key,
            'grossStrokes', gross_strokes,
            'netStrokes', net_strokes,
            'grossPoints', gross_points,
            'netPoints', net_points,
            'holesCounted', holes_counted,
            'holesTotal', holes_total,
            'parTotal', par_total
          )
          order by day_number, pair_key, player_name
        )
        from card_rows
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.public_team_leaderboard(uuid) from public;
grant execute on function public.public_team_leaderboard(uuid) to anon, authenticated;

-- 4. Prove the posture in this transaction -------------------------------------------------------

do $$
declare
  v_leaderboard text;
  v_profile text;
begin
  if to_regprocedure('public.public_player_scorecard(uuid, uuid)') is null then
    raise exception 'public_player_scorecard was not created';
  end if;
  if to_regprocedure('public.public_team_leaderboard(uuid)') is null then
    raise exception 'public_team_leaderboard was not created';
  end if;

  select prosrc into v_leaderboard
    from pg_proc
   where proname = 'public_team_leaderboard'
     and pronamespace = 'public'::regnamespace;
  select prosrc into v_profile
    from pg_proc
   where proname = 'public_player_scorecard'
     and pronamespace = 'public'::regnamespace;

  -- The public paths must read the frozen publication, never a live scoring table.
  if v_leaderboard like '%approved_hole_scores%'
     or v_leaderboard like '%public.scorecards%' then
    raise exception 'public_team_leaderboard reads a live scoring table';
  end if;
  if v_profile like '%approved_hole_scores%'
     or v_profile like '%public.scorecards%' then
    raise exception 'public_player_scorecard reads a live scoring table';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'public_player_scorecard'
       and prosecdef
       and proacl is not null
       and exists (select 1 from unnest(proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_player_scorecard is not a security definer function executable by anon';
  end if;
  if not exists (
    select 1 from pg_proc
     where proname = 'public_team_leaderboard'
       and prosecdef
       and proacl is not null
       and exists (select 1 from unnest(proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_team_leaderboard is not a security definer function executable by anon';
  end if;
  if not exists (
    select 1 from pg_proc
     where proname = 'public_programme'
       and prosrc like '%''id'', p.id%'
  ) then
    raise exception 'public_programme does not expose the player id';
  end if;
end $$;
