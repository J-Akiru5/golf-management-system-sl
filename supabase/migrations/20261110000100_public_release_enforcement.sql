-- Enforce the public release policy on every public data surface (issue 209 / T-0010) ------------
--
-- 20261110000000_publish_views.sql added `tournaments.publish_views` and `publish_allows`, but only
-- the pairings list called it. The other keys were stored and inert. This migration makes the
-- policy authoritative inside the SECURITY DEFINER functions themselves, so an anon caller cannot
-- read a held surface by calling the RPC directly. A page or client gate would hide nothing.
--
-- Final surface keys. Every key defaults to true and an absent key also means true, so rows written
-- before this migration, and events created from an older default, keep behaving exactly as they
-- do today until the desk turns a surface off.
--
--   pairings    public_pairings and public_pairings_by_day. `photo_path` is additionally blanked
--               unless `photos` is also released, so a held photo surface cannot leak through a
--               released field list.
--   teeTimes    the day schedule and the players on it, inside public_programme.
--   roster      the confirmed player list, inside public_programme.
--   leaderboard public_team_leaderboard, public_published_rounds, public_round_results and
--               public_player_scorecard. There is deliberately no separate results key: the frozen
--               results are the leaderboard surface, and a second key would add no protection
--               without a page that needs to hold one and not the other.
--   photos      `photo_path` in the pairings and public_player_photos. Both still require
--               players.photo_public_consent_at; the key is an event-level hold on top of consent.
--   rules       rulesOfPlay, inside public_programme.
--
-- Not enforced here, and why:
--
--   ownPair     a player's own pair and start come from the player portal's own read, never from a
--               function in this file. The key is left alone and no public function reads it.
--   landing     not implemented. public_events is the event marketing list, not the field data
--               surface, and carries no player, tee, group or result rows, so it is not gated.
--
-- A released roster does not override a held tee-times board: the day list carries the names that
-- belong to its tee times, because a time without a name is not usable. The desk sees both keys.
--
-- The release state is readable through public_release_state (booleans only) and writable through
-- set_public_release (owner or organizer only). Both resolve the event the same way the public
-- programme and leaderboard do.
--
-- No event row is changed by this migration. The 24th Bamboo Tee keeps pairings = false from
-- 20261110000000 and every other key stays as stored. Nothing here is applied to the live project
-- by this branch.

-- 1. Audit columns and the future-event default ---------------------------------------------------

alter table public.tournaments
  add column if not exists publish_views_updated_at timestamptz,
  add column if not exists publish_views_updated_by uuid;

comment on column public.tournaments.publish_views_updated_at is
  'When the desk last changed one public release key. Null when it has never been changed in this column.';
comment on column public.tournaments.publish_views_updated_by is
  'The auth user who last changed a public release key. Internal audit only; never exposed publicly.';

-- Existing rows keep whatever object they already have. Only the default for new events changes.
alter table public.tournaments
  alter column publish_views set default
    '{"pairings":true,"ownPair":true,"roster":true,"leaderboard":true,"photos":true,"teeTimes":true,"rules":true}'::jsonb;

-- 2. Pairings: keep the gate and hold photos with it -----------------------------------------------

create or replace function public.public_pairings(p_tournament uuid default null)
returns TABLE(
  tournament_id uuid, tournament_name text, play_date date, start_format text,
  first_tee_time time without time zone, published_at timestamp with time zone, version integer,
  group_number smallint, wave text, start_hole smallint, tee_time time without time zone,
  flight_name text, player_id uuid, player_name text, photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.tournament_id, f.tournament_name, f.play_date, f.start_format,
    f.first_tee_time, f.published_at, f.version, f.group_number, f.wave,
    f.start_hole, f.tee_time, f.flight_name, f.player_id, f.player_name,
    case
      when public.publish_allows(f.tournament_id, 'photos') then f.photo_path
      else null
    end as photo_path
  from public.public_pairings_all(p_tournament) f
  where public.publish_allows(f.tournament_id, 'pairings');
$$;

create or replace function public.public_pairings_by_day(p_tournament uuid default null)
returns TABLE(
  tournament_id uuid, tournament_name text, play_date date, start_format text,
  first_tee_time time without time zone, published_at timestamp with time zone, version integer,
  group_number smallint, wave text, start_hole smallint, tee_time time without time zone,
  flight_name text, player_id uuid, player_name text, photo_path text,
  day_number smallint, day_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.tournament_id, f.tournament_name, f.play_date, f.start_format,
    f.first_tee_time, f.published_at, f.version, f.group_number, f.wave,
    f.start_hole, f.tee_time, f.flight_name, f.player_id, f.player_name,
    case
      when public.publish_allows(f.tournament_id, 'photos') then f.photo_path
      else null
    end as photo_path,
    f.day_number, f.day_label
  from public.public_pairings_by_day_all(p_tournament) f
  where public.publish_allows(f.tournament_id, 'pairings');
$$;

revoke all on function public.public_pairings(uuid) from public;
revoke all on function public.public_pairings_by_day(uuid) from public;
grant execute on function public.public_pairings(uuid) to anon, authenticated;
grant execute on function public.public_pairings_by_day(uuid) to anon, authenticated;

-- 3. The programme: rules, tee times and roster are three separate holds ---------------------------

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
      'rulesOfPlay', case
        when public.publish_allows(s.id, 'rules') then s.rules_of_play
        else null
      end,
      'days', case
        when public.publish_allows(s.id, 'teeTimes') then coalesce(
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
        )
        else '[]'::jsonb
      end,
      'players', case
        when public.publish_allows(s.id, 'roster') then coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
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
        else '[]'::jsonb
      end
    )
    else null
  end
  from selected s;
$$;

revoke all on function public.public_programme(uuid) from public;
grant execute on function public.public_programme(uuid) to anon, authenticated;

-- 4. The team leaderboard: published and released, or nothing -------------------------------------

create or replace function public.public_team_leaderboard(p_tournament uuid default null)
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
      pair.number,
      member.side
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
      po.side,
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
      team.side,
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
  select case
    when s.published and public.publish_allows(s.id, 'leaderboard')
    then jsonb_build_object(
      'tournamentId', s.id,
      'eventName', s.name,
      'tieBreak', (
        select jsonb_build_object(
          'name', policy.name,
          'procedure', policy.procedure,
          'version', policy.version
        )
        from public.competition_rounds r
        join selected s2 on s2.id = r.tournament_id and s2.club_id = r.club_id
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
              'side', side,
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
            order by
              day_number,
              pair_key,
              case side when 'member' then 0 when 'guest' then 1 else 2 end,
              player_name
          )
          from card_rows
        ),
        '[]'::jsonb
      )
    )
    else null
  end
  from selected s;
$$;

revoke all on function public.public_team_leaderboard(uuid) from public;
grant execute on function public.public_team_leaderboard(uuid) to anon, authenticated;

-- 5. Published rounds and their frozen results ----------------------------------------------------

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
      and t.published
      and public.publish_allows(r.tournament_id, 'leaderboard')
    order by r.id, p.version desc
  )
  select * from latest
  order by play_date desc, day_number;
$$;

revoke all on function public.public_published_rounds() from public;
grant execute on function public.public_published_rounds() to anon, authenticated;

create or replace function public.public_round_results(p_round uuid)
returns table (
  version integer,
  state text,
  published_at timestamptz,
  snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.version, rp.state, rp.published_at, rp.snapshot - 'cards'
  from public.round_publications rp
  join public.competition_rounds r
    on r.id = rp.round_id and r.club_id = rp.club_id
  join public.tournaments t
    on t.id = r.tournament_id and t.club_id = r.club_id
  where rp.round_id = p_round
    and t.published
    and public.publish_allows(t.id, 'leaderboard')
  order by rp.version desc
  limit 1;
$$;

revoke all on function public.public_round_results(uuid) from public;
grant execute on function public.public_round_results(uuid) to anon, authenticated;

-- 6. One player's frozen scorecard ----------------------------------------------------------------

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
     and public.publish_allows(s.id, 'leaderboard')
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

-- 7. Public photos: event release on top of per-player consent ------------------------------------
--
-- The old one-argument function could not see an event, so it could not respect an event hold. It is
-- replaced by the same name with an optional event argument. A one-argument call still works and
-- resolves the event exactly as public_programme does, so the photo path follows the surface the
-- public page is showing. An explicit event is strict about that event alone. The photo still needs
-- its own public consent.

drop function if exists public.public_player_photos(uuid[]);

create function public.public_player_photos(
  p_ids uuid[],
  p_tournament uuid default null
)
returns table (player_id uuid, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select t.id, t.club_id
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  )
  select distinct p.id, p.photo_public_path
  from selected s
  join public.tournaments t
    on t.id = s.id and t.club_id = s.club_id
  join public.registrations r
    on r.tournament_id = s.id and r.club_id = s.club_id
  join public.players p
    on p.id = r.player_id and p.club_id = r.club_id
  where t.published
    and public.publish_allows(s.id, 'photos')
    and p.id = any (coalesce(p_ids, array[]::uuid[]))
    and r.status = 'ok'
    and p.photo_public_consent_at is not null
    and p.photo_public_path is not null;
$$;

revoke all on function public.public_player_photos(uuid[], uuid) from public;
grant execute on function public.public_player_photos(uuid[], uuid) to anon, authenticated;

-- 8. The release state: booleans only -------------------------------------------------------------

create or replace function public.public_release_state(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select t.id
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
    when s.id is null then null
    else jsonb_build_object(
      'tournamentId', s.id,
      'pairings', public.publish_allows(s.id, 'pairings'),
      'teeTimes', public.publish_allows(s.id, 'teeTimes'),
      'roster', public.publish_allows(s.id, 'roster'),
      'leaderboard', public.publish_allows(s.id, 'leaderboard'),
      'photos', public.publish_allows(s.id, 'photos'),
      'rules', public.publish_allows(s.id, 'rules')
    )
  end
  from selected s;
$$;

revoke all on function public.public_release_state(uuid) from public;
grant execute on function public.public_release_state(uuid) to anon, authenticated;

-- 9. The authenticated setter ---------------------------------------------------------------------

create or replace function public.set_public_release(
  p_tournament uuid,
  p_surface text,
  p_released boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_release jsonb;
begin
  if p_released is null then
    raise exception 'A release value is required' using errcode = '22023';
  end if;

  if p_surface is null or p_surface not in (
    'pairings', 'teeTimes', 'roster', 'leaderboard', 'photos', 'rules'
  ) then
    raise exception 'Unknown public surface: %', coalesce(p_surface, '(null)')
      using errcode = '22023';
  end if;

  select t.club_id, t.publish_views
    into v_club, v_release
    from public.tournaments t
   where t.id = p_tournament
   for update;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer may change the public release'
      using errcode = '42501';
  end if;

  update public.tournaments
     set publish_views = jsonb_set(
           case
             when jsonb_typeof(v_release) = 'object' then v_release
             else '{}'::jsonb
           end,
           array[p_surface],
           to_jsonb(p_released),
           true
         ),
         publish_views_updated_at = now(),
         publish_views_updated_by = (select auth.uid())
   where id = p_tournament;

  return public.public_release_state(p_tournament);
end;
$$;

revoke all on function public.set_public_release(uuid, text, boolean) from public;
revoke all on function public.set_public_release(uuid, text, boolean) from anon;
grant execute on function public.set_public_release(uuid, text, boolean) to authenticated;

-- 10. Prove the posture without touching an event row ---------------------------------------------
-- Catalog checks only. No tournament, registration or player row is read or written here, so the
-- 24th Bamboo Tee's pairings = false cannot be changed by this migration.

do $$
declare
  v_body text;
  v_default text;
begin
  -- Every recreated function exists.
  if to_regprocedure('public.public_pairings(uuid)') is null
     or to_regprocedure('public.public_pairings_by_day(uuid)') is null
     or to_regprocedure('public.public_programme(uuid)') is null
     or to_regprocedure('public.public_team_leaderboard(uuid)') is null
     or to_regprocedure('public.public_published_rounds()') is null
     or to_regprocedure('public.public_round_results(uuid)') is null
     or to_regprocedure('public.public_player_scorecard(uuid, uuid)') is null
     or to_regprocedure('public.public_player_photos(uuid[], uuid)') is null
     or to_regprocedure('public.public_release_state(uuid)') is null
     or to_regprocedure('public.set_public_release(uuid, text, boolean)') is null then
    raise exception 'one of the public release functions was not created';
  end if;

  -- The old photo signature must be gone, or an anon caller could read around the event hold.
  if to_regprocedure('public.public_player_photos(uuid[])') is not null then
    raise exception 'the one-argument public_player_photos still exists';
  end if;

  -- Each surface that the task lists must consult the stored policy in its own body.
  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_programme';
  if v_body not like '%publish_allows(s.id, ''rules'')%'
     or v_body not like '%publish_allows(s.id, ''teeTimes'')%'
     or v_body not like '%publish_allows(s.id, ''roster'')%' then
    raise exception 'public_programme does not gate rules, teeTimes and roster';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_team_leaderboard';
  if v_body not like '%publish_allows(s.id, ''leaderboard'')%' then
    raise exception 'public_team_leaderboard does not gate the leaderboard key';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_published_rounds';
  if v_body not like '%publish_allows(r.tournament_id, ''leaderboard'')%'
     or v_body not like '%t.published%' then
    raise exception 'public_published_rounds does not hide held or unpublished events';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_round_results';
  if v_body not like '%publish_allows(t.id, ''leaderboard'')%'
     or v_body not like '%t.published%' then
    raise exception 'public_round_results does not hide held or unpublished events';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_player_scorecard';
  if v_body not like '%publish_allows(s.id, ''leaderboard'')%' then
    raise exception 'public_player_scorecard does not gate the leaderboard key';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_player_photos';
  if v_body not like '%publish_allows(s.id, ''photos'')%'
     or v_body not like '%photo_public_consent_at%' then
    raise exception 'public_player_photos does not require the photos key and public consent';
  end if;

  -- The setter is a security definer function and only authenticated may execute it.
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'set_public_release'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef
       and p.proacl is not null
       and exists (select 1 from unnest(p.proacl) a where a::text like 'authenticated=%')
       and not exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'set_public_release is not an authenticated-only security definer function';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'public_release_state'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef
  ) then
    raise exception 'public_release_state is not a security definer function';
  end if;

  -- The new-event default carries the extra keys; existing rows are untouched.
  select pg_get_expr(d.adbin, d.adrelid) into v_default
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.tournaments'::regclass
     and a.attname = 'publish_views';
  if v_default is null or v_default not like '%teeTimes%' or v_default not like '%rules%' then
    raise exception 'the publish_views default does not include teeTimes and rules';
  end if;
end $$;
