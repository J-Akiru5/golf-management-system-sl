-- Public player profile: show each player's playing handicap -----------------------------------
--
-- The public profile used to take the playing handicap from the player's published scorecards, so a
-- player with no published card showed a dash. The system already stores a playing handicap on every
-- confirmed registration (it is what the draw and the scorecard use). This adds that number to the
-- player object `public_player_scorecard()` returns, under the same release gate as the rest of the
-- profile (the tournament is published and its leaderboard is released).
--
-- It is the same function as before with two lines added: `r.playing_handicap` in the player's own
-- row and `'playingHandicap'` in the player object. It changes no table, column, policy or grant, and
-- exposes no other field. Without this migration the page shows the card's handicap when a card is
-- published and a dash otherwise, exactly as before.
--
-- Not applied to the live project. It is safe to run twice.

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
      r.playing_handicap,
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
          'playingHandicap', playing_handicap,
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
