-- One-off: bring the 24th Bamboo Tee's published results back in line with the desk (14 Nov 2026).
--
-- Run in the Supabase SQL editor after 20261114000400_class_and_handicap_follow_desk.sql is
-- applied. Nothing else is needed: the class sync for future edits is a trigger, and the handicap
-- function stays available for a single player.
--
-- What it does, in one transaction:
--   1. Every live result takes the class the desk holds now, so a class corrected after the card
--      was scored stops showing the old class on the leaderboard, All scores and the TV.
--   2. Every card whose handicap snapshot disagrees with the desk index is recalculated from that
--      index (course handicap, then playing handicap at the event allowance), and the player's
--      result is recalculated. 18 cards were on the wrong handicap on 14 Nov 2026, most of them
--      at index 0, which scored net as gross.
--
-- Points change only where the recalculated playing handicap differs. Every corrected player gets
-- one scoring_audit row naming what it was and what it became.

begin;

-- 1. Classes follow the desk ---------------------------------------------------------------------

with fixed as (
  update public.round_results rr
  set flight_id = reg.flight_id
  from public.round_entries re
  join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
  join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
  where re.status = 'active'
    and r.tournament_id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb'
    and r.status <> 'final'
    and rr.round_id = re.round_id
    and rr.club_id = re.club_id
    and rr.player_id = reg.player_id
    and rr.superseded_at is null
    and rr.flight_id is distinct from reg.flight_id
  returning rr.id
)
select count(*) as results_reclassed from fixed;

-- 2. Handicaps follow the desk index -------------------------------------------------------------

do $$
declare
  entry record;
  outcome jsonb;
  changed integer := 0;
  checked integer := 0;
begin
  for entry in
    select
      re.id as entry_id,
      p.full_name,
      hs.handicap_index as snapshot_index,
      reg.frozen_index as desk_index,
      case
        when t.max_index is not null then least(round(reg.frozen_index, 1), t.max_index)
        else round(reg.frozen_index, 1)
      end as expected_index
    from public.round_entries re
    join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
    join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    join public.players p on p.id = reg.player_id and p.club_id = reg.club_id
    join public.handicap_snapshots hs
      on hs.round_id = re.round_id and hs.round_entry_id = re.id
    where r.tournament_id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb'
      and r.status in ('scoring', 'provisional')
      and re.status = 'active'
      and reg.frozen_index is not null
      and round(hs.handicap_index, 1) is distinct from
          case
            when t.max_index is not null then least(round(reg.frozen_index, 1), t.max_index)
            else round(reg.frozen_index, 1)
          end
    order by p.full_name
  loop
    checked := checked + 1;
    outcome := public.reset_handicap_from_desk(
      entry.entry_id,
      'Desk index review, 14 Nov 2026'
    );
    if outcome ->> 'changed' = 'true' then
      changed := changed + 1;
      raise notice '%: index % (% ) to % (%)',
        entry.full_name,
        entry.snapshot_index,
        outcome ->> 'previousPlayingHandicap',
        outcome ->> 'newIndex',
        outcome ->> 'playingHandicap';
    end if;
  end loop;

  raise notice 'cards checked: %, cards recalculated: %', checked, changed;
end $$;

commit;
