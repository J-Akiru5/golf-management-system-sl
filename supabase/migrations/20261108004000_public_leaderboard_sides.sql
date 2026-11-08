-- Add the pair side (member or guest) to the public team leaderboard.
--
-- The team leaderboard already groups the two partners by pair number, but it returns only the
-- player name. The page cannot tell which name is the member and which is the guest, so it cannot
-- show the pair as two labelled columns in a stable order.
--
-- This migration replaces only the body of public.public_team_leaderboard(uuid). The signature,
-- return type, security definer, search_path and ACL are unchanged. It adds one nullable `side`
-- field to each row and orders a pair member first inside the JSON. No table, column, policy, trigger
-- or data is touched. Additive and safe to re-run. NOT applied by this branch.
--
-- `side` is null for a legacy pair that only has answers.teamNo and no registration_pair_members row.

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
  );
$$;

revoke all on function public.public_team_leaderboard(uuid) from public;
grant execute on function public.public_team_leaderboard(uuid) to anon, authenticated;
