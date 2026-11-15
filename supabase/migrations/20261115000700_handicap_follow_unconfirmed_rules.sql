-- Hotfix for 20261115000600: the handicap follow trigger recalculated nothing for Day 3 and Day 4.
--
-- RUN AFTER 20261115000600 (the numbers were 000400/000500 when first run; same SQL). Not applied by the agent.
--
-- Why: the trigger calls public.reset_handicap_from_desk, which still refused any round with no
-- rules_version ("The handicap rules version must be named"). Those rounds were opened without one
-- and the settings guard froze the field, so the error was swallowed and the snapshot kept the old
-- playing handicap (PH 0 on the scorecard) while the index itself had updated.
--
-- Change: that check, plus the playing-handicap cap from 20261115000400_cap_playing_handicap.
-- A round with no rules version records 'unconfirmed', the same value
-- correct_handicap_snapshot and recalculate_player_results use. Everything else is unchanged.
-- The last statement re-saves each player's latest record so every snapshot is recalculated now.

create or replace function public.reset_handicap_from_desk(
  p_round_entry uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_status text;
  v_tournament uuid;
  v_player uuid;
  v_tee uuid;
  v_index_on_file numeric;
  v_allowance numeric;
  v_rounding text;
  v_rules text;
  v_tee_row public.tees%rowtype;
  v_max_index numeric;
  v_index numeric;
  v_raw numeric;
  v_course smallint;
  v_playing smallint;
  v_id uuid;
  v_previous_index numeric;
  v_previous_playing smallint;
  v_reason text;
begin
  select re.club_id, re.round_id, r.status, r.tournament_id,
         r.allowance, r.handicap_rounding, r.rules_version,
         reg.player_id, reg.tee_id, reg.frozen_index
  into v_club, v_round, v_status, v_tournament,
       v_allowance, v_rounding, v_rules,
       v_player, v_tee, v_index_on_file
  from public.round_entries re
  join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
  join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
  where re.id = p_round_entry;

  if v_club is null then
    raise exception 'Round entry not found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'open', 'scoring', 'provisional') then
    raise exception 'The round is final, so its handicap snapshot cannot be corrected'
      using errcode = '23514';
  end if;
  if v_index_on_file is null then
    raise exception 'The desk has no handicap index for this player' using errcode = '22023';
  end if;
  if v_allowance is null or v_allowance <= 0 or v_allowance > 1 then
    raise exception 'The allowance must be a fraction above 0 and at most 1' using errcode = '22023';
  end if;
  if v_rounding is null or v_rounding not in ('whs', 'single') then
    raise exception 'The rounding mode must be whs or single' using errcode = '22023';
  end if;
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

  -- The same rule and the same arithmetic as save_handicap_snapshot: the event caps the index, the
  -- course handicap is the slope and rating calculation, the playing handicap applies the allowance.
  v_index := case
    when v_max_index is not null then least(round(v_index_on_file, 1), v_max_index)
    else round(v_index_on_file, 1)
  end;
  v_raw := v_index * (v_tee_row.slope::numeric / 113)
    + (v_tee_row.course_rating - v_tee_row.par);
  v_course := floor(v_raw + 0.5)::smallint;
  v_playing := case
    when v_rounding = 'whs' then floor(v_course * v_allowance + 0.5)::smallint
    else floor(v_raw * v_allowance + 0.5)::smallint
  end;
  -- The event maximum holds the playing handicap too (owner decision 14 Nov 2026, 20261115000400).
  v_playing := least(v_playing, floor(v_max_index)::smallint);

  select hs.id, hs.handicap_index, hs.playing_handicap
  into v_id, v_previous_index, v_previous_playing
  from public.handicap_snapshots hs
  where hs.round_id = v_round and hs.round_entry_id = p_round_entry;

  if v_id is not null and v_previous_playing = v_playing
     and v_previous_index is not distinct from v_index then
    return jsonb_build_object('ok', true, 'changed', false, 'playingHandicap', v_playing);
  end if;

  v_reason := coalesce(nullif(btrim(p_reason), ''), 'Handicap set from the desk index');

  -- The one place the freeze is lifted, only for the statement below (same bypass as
  -- correct_handicap_snapshot).
  perform set_config('teeline.allow_frozen_snapshot', 'on', true);

  insert into public.handicap_snapshots
    (club_id, round_id, round_entry_id, handicap_index, index_source, index_effective_date,
     tee_id, course_rating, slope, course_par, allowance, rounding, course_handicap,
     playing_handicap, rules_version, created_by)
  values
    (v_club, v_round, p_round_entry, v_index, 'Desk index', current_date,
     v_tee, v_tee_row.course_rating, v_tee_row.slope, v_tee_row.par, v_allowance, v_rounding,
     v_course, v_playing, v_rules, null)
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

  perform public.recalculate_player_results(v_round, v_player);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, v_round, 'handicap_snapshot', v_id, 'corrected', null, v_reason,
     jsonb_build_object(
       'handicapIndex', v_previous_index,
       'playingHandicap', v_previous_playing
     ),
     jsonb_build_object(
       'previousIndex', v_previous_index,
       'newIndex', v_index,
       'previousPlayingHandicap', v_previous_playing,
       'newPlayingHandicap', v_playing,
       'indexSource', 'Desk index'
     ));

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'previousIndex', v_previous_index,
    'newIndex', v_index,
    'previousPlayingHandicap', v_previous_playing,
    'playingHandicap', v_playing
  );
end;
$$;

revoke all on function public.reset_handicap_from_desk(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_handicap_from_desk(uuid, text) to service_role;

update public.handicap_records hr
   set handicap_index = hr.handicap_index
 where hr.id in (
   select distinct on (player_id) id
   from public.handicap_records
   order by player_id, effective_date desc
 );
