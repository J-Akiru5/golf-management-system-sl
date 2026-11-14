-- Correct a played round's handicap snapshot when the round has no rules version (issue 204,
-- #270 point 2; hotfix of 15 Nov 2026).
--
-- NOT APPLIED. Apply it after 20261114000300_correct_handicap_snapshot.sql.
--
-- Why it exists. Day 2 and Day 3 of the 24th Bamboo Tee were opened and published before a
-- `rules_version` was stored on their `competition_rounds` row. The scoring settings guard freezes
-- that field once scoring starts, so it can no longer be filled in. The first version of
-- `correct_handicap_snapshot` raised "The handicap rules version must be named" for those rounds,
-- which left an index correction on the registration and the old playing handicap in the round's
-- snapshot and scores.
--
-- What changes. Only the body of `public.correct_handicap_snapshot` is replaced. When the round has
-- no rules version, the snapshot records 'unconfirmed', the same value `recalculate_player_results`
-- already uses for such a round. A real version is stored unchanged. Nothing else moves: the role,
-- the final-round refusal, the reason and index checks, the freeze bypass, the recalculation, the
-- audit row and the return value stay exactly as they were. No table, column, constraint, trigger,
-- policy, index or data is touched. The guard bypass itself is installed by 20261114000300, so that
-- file must be applied first.

create or replace function public.correct_handicap_snapshot(
  p_round_entry uuid,
  p_index numeric,
  p_effective date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_registration uuid;
  v_status text;
  v_tournament uuid;
  v_player uuid;
  v_tee uuid;
  v_allowance numeric;
  v_rounding text;
  v_rules text;
  v_tee_row public.tees%rowtype;
  v_max_index numeric;
  v_on_file numeric;
  v_index numeric;
  v_raw numeric;
  v_course smallint;
  v_playing smallint;
  v_id uuid;
  v_previous_index numeric;
  v_previous_playing smallint;
begin
  select re.club_id, re.round_id, re.registration_id, r.status, r.tournament_id,
         r.allowance, r.handicap_rounding, r.rules_version,
         reg.player_id, reg.tee_id
  into v_club, v_round, v_registration, v_status, v_tournament,
       v_allowance, v_rounding, v_rules, v_player, v_tee
  from public.round_entries re
  join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
  join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
  where re.id = p_round_entry;

  if v_club is null then
    raise exception 'Round entry not found' using errcode = 'P0002';
  end if;
  -- Owner or organizer only. The desk can read the snapshot but cannot change it.
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can correct a handicap snapshot'
      using errcode = '42501';
  end if;
  if v_status not in ('draft', 'open', 'scoring', 'provisional') then
    raise exception 'The round is final, so its handicap snapshot cannot be corrected'
      using errcode = '23514';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A handicap correction needs a reason of at least 3 characters'
      using errcode = '22023';
  end if;
  if p_index is null or p_index < -10 or p_index > 54 then
    raise exception 'The Handicap Index must be between -10 and 54' using errcode = '22023';
  end if;
  if p_effective is null then
    raise exception 'The Handicap Index needs its effective date' using errcode = '22023';
  end if;

  if v_allowance is null or v_allowance <= 0 or v_allowance > 1 then
    raise exception 'The allowance must be a fraction above 0 and at most 1' using errcode = '22023';
  end if;
  if v_rounding is null or v_rounding not in ('whs', 'single') then
    raise exception 'The rounding mode must be whs or single' using errcode = '22023';
  end if;
  -- A round opened before the rules version was saved has none, and the scoring settings guard
  -- freezes that field once scoring starts. Record the honest 'unconfirmed' instead of blocking the
  -- correction the committee decided; recalculate_player_results treats a missing version the same
  -- way.
  v_rules := coalesce(nullif(btrim(v_rules), ''), 'unconfirmed');
  if v_tee is null then
    raise exception 'The registration has no tee' using errcode = '23503';
  end if;

  select * into v_tee_row
  from public.tees
  where id = v_tee and club_id = v_club;

  if v_tee_row.id is null then
    raise exception 'The tee was not found' using errcode = '23503';
  end if;

  if v_tee_row.course_id <> (
    select t.course_id from public.tournaments t
    where t.id = v_tournament and t.club_id = v_club
  ) then
    raise exception 'The tee does not belong to this tournament''s course' using errcode = '23503';
  end if;

  select max_index into v_max_index
  from public.tournaments
  where id = v_tournament and club_id = v_club;

  -- The event rule caps an index above the maximum at the maximum, and the snapshot stores the
  -- capped number: the same rule and the same arithmetic as save_handicap_snapshot.
  v_on_file := round(p_index, 1);
  v_index := case
    when v_max_index is not null then least(v_on_file, v_max_index)
    else v_on_file
  end;
  v_raw := v_index * (v_tee_row.slope::numeric / 113)
    + (v_tee_row.course_rating - v_tee_row.par);
  v_course := floor(v_raw + 0.5)::smallint;
  v_playing := case
    when v_rounding = 'whs' then floor(v_course * v_allowance + 0.5)::smallint
    else floor(v_raw * v_allowance + 0.5)::smallint
  end;

  select hs.id, hs.handicap_index, hs.playing_handicap
  into v_id, v_previous_index, v_previous_playing
  from public.handicap_snapshots hs
  where hs.round_id = v_round and hs.round_entry_id = p_round_entry;

  -- The one place the freeze is lifted, and only for the statement below.
  perform set_config('teeline.allow_frozen_snapshot', 'on', true);

  insert into public.handicap_snapshots
    (club_id, round_id, round_entry_id, handicap_index, index_source, index_effective_date,
     tee_id, course_rating, slope, course_par, allowance, rounding, course_handicap,
     playing_handicap, rules_version, created_by)
  values
    (v_club, v_round, p_round_entry, v_index, 'Manual correction', p_effective,
     v_tee, v_tee_row.course_rating, v_tee_row.slope, v_tee_row.par, v_allowance, v_rounding,
     v_course, v_playing, v_rules, (select auth.uid()))
  on conflict (round_id, round_entry_id) do update
    set handicap_index = excluded.handicap_index,
        index_source = excluded.index_source,
        index_effective_date = excluded.index_effective_date,
        tee_id = excluded.tee_id,
        course_rating = excluded.course_rating,
        slope = excluded.slope,
        course_par = excluded.course_par,
        allowance = excluded.allowance,
        rounding = excluded.rounding,
        course_handicap = excluded.course_handicap,
        playing_handicap = excluded.playing_handicap,
        rules_version = excluded.rules_version
  returning id into v_id;

  perform set_config('teeline.allow_frozen_snapshot', 'off', true);

  -- Net points are read from the snapshot's playing handicap, so the player's result is stale until
  -- it is recalculated.
  perform public.recalculate_player_results(v_round, v_player);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, v_round, 'handicap_snapshot', v_id, 'corrected', (select auth.uid()), p_reason,
     jsonb_build_object(
       'handicapIndex', v_previous_index,
       'playingHandicap', v_previous_playing
     ),
     jsonb_build_object(
       'previousIndex', v_previous_index,
       'newIndex', v_index,
       'previousPlayingHandicap', v_previous_playing,
       'newPlayingHandicap', v_playing,
       'effectiveDate', p_effective,
       'roundStatus', v_status
     ));

  return jsonb_build_object(
    'ok', true,
    'snapshotId', v_id,
    'previousIndex', v_previous_index,
    'newIndex', v_index,
    'previousPlayingHandicap', v_previous_playing,
    'playingHandicap', v_playing,
    'effectiveDate', p_effective,
    'roundStatus', v_status
  );
end;
$$;

revoke all on function public.correct_handicap_snapshot(uuid, numeric, date, text) from public, anon;
grant execute on function public.correct_handicap_snapshot(uuid, numeric, date, text) to authenticated;

-- Checks to run once applied to a disposable project, in one transaction that is rolled back:
--   1. With a round in `scoring`, call the function as an organizer: expect `ok = true`, the
--      snapshot's `index_source` = 'Manual correction', the new playing handicap, one
--      `scoring_audit` row with action 'corrected' and both old and new values, and one superseded
--      plus one current `round_results` row for that player.
--   2. As a desk account, expect 'Only an owner or organizer can correct a handicap snapshot'.
--   3. With a `final` round, expect 'The round is final, so its handicap snapshot cannot be
--      corrected'.
--   4. Directly update the same snapshot without the setting, as an owner: expect 'A handicap
--      snapshot is frozen once scoring starts'.
--   5. Call `save_card_handicap_snapshot` for the same scoring round with a different card value:
--      expect the same freeze error, so the guard is unchanged for every other caller.
