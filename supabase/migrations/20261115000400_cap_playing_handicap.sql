-- Hold the playing handicap to the event maximum (owner's decision, 14 Nov 2026).
--
-- NOT APPLIED. The owner applies it by name. Apply it after
-- 20261115000300_correct_handicap_no_rules_version.sql, and BEFORE the app change that caps the
-- playing handicap goes live: until it is applied, `Correct handicap` still works the playing
-- handicap out from the tee alone, so correcting a capped player would put 34 back.
--
-- The rule. The index was already capped at `tournaments.max_index` (issue 190, applied). The
-- decision of 14 Nov 2026 is that the playing handicap is capped too: an index of 30 on the Blue
-- tee works out to 34 strokes, and the player plays off 30. The app's draw, registration dialog,
-- card save and tabulator page already apply it.
--
-- What changes. Only the two functions that work a playing handicap out from an index are replaced,
-- and only one line in each: after the playing handicap is computed it is held to
-- `floor(max_index)`, `v_playing := least(v_playing, floor(v_max_index)::smallint)`. Everything else
-- is copied unchanged from the version now installed:
--   * `public.save_handicap_snapshot`, from 20261108001100_cap_handicap_snapshot_index.sql (used by
--     `open_round` and the registration freeze).
--   * `public.correct_handicap_snapshot`, from 20261115000300_correct_handicap_no_rules_version.sql
--     (the Correct handicap button).
-- `public.save_card_handicap_snapshot` is not touched: it stores the number the app hands it, and
-- the app now hands it the capped figure.
--
-- No table, column, constraint, trigger, policy or data is touched. The signatures, `security
-- definer`, `set search_path = ''` and the grants are unchanged. Existing snapshots are NOT changed
-- by this file: a snapshot that already holds 31 to 34 keeps it until its player is corrected with
-- Correct handicap (the same index), which writes the capped figure and recalculates that player's
-- result. See the list query at the end.

create or replace function public.save_handicap_snapshot(
  p_round_entry uuid,
  p_index numeric,
  p_index_source text,
  p_index_effective_date date,
  p_allowance numeric default null,
  p_rounding text default null,
  p_rules_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_status text;
  v_tournament uuid;
  v_registration uuid;
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
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can save a handicap snapshot' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'open') then
    raise exception 'The round is not open for handicap setup' using errcode = '23514';
  end if;
  if p_index is null or p_index < -20 or p_index > 54 then
    raise exception 'The Handicap Index must be between -20 and 54' using errcode = '22023';
  end if;
  if p_index_source is null or btrim(p_index_source) = '' then
    raise exception 'The Handicap Index needs a source' using errcode = '22023';
  end if;
  if p_index_effective_date is null then
    raise exception 'The Handicap Index needs its effective date' using errcode = '22023';
  end if;

  v_allowance := coalesce(p_allowance, v_allowance);
  v_rounding := coalesce(p_rounding, v_rounding);
  v_rules := coalesce(nullif(btrim(p_rules_version), ''), v_rules);

  if v_allowance is null or v_allowance <= 0 or v_allowance > 1 then
    raise exception 'The allowance must be a fraction above 0 and at most 1' using errcode = '22023';
  end if;
  if v_rounding is null or v_rounding not in ('whs', 'single') then
    raise exception 'The rounding mode must be whs or single' using errcode = '22023';
  end if;
  if v_rules is null or btrim(v_rules) = '' then
    raise exception 'The handicap rules version must be named' using errcode = '22023';
  end if;
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

  -- The event rule caps an index above the maximum at the maximum. The snapshot stores the capped
  -- number, which is the one the handicap is worked out from; the number passed in goes to the audit.
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
  -- Nobody plays off more than the event maximum (owner's decision, 14 Nov 2026), so the playing
  -- handicap is held to it as well as the index. least() ignores a null maximum, so an event with no
  -- maximum keeps the tee formula's figure.
  v_playing := least(v_playing, floor(v_max_index)::smallint);

  insert into public.handicap_snapshots
    (club_id, round_id, round_entry_id, handicap_index, index_source, index_effective_date,
     tee_id, course_rating, slope, course_par, allowance, rounding, course_handicap,
     playing_handicap, rules_version, created_by)
  values
    (v_club, v_round, p_round_entry, v_index, p_index_source, p_index_effective_date,
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

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, v_round, 'handicap_snapshot', v_id, 'saved', (select auth.uid()), null,
     jsonb_build_object(
       'handicapIndex', v_index,
       'indexOnFile', v_on_file,
       'capped', v_index < v_on_file,
       'courseHandicap', v_course,
       'playingHandicap', v_playing,
       'allowance', v_allowance,
       'rounding', v_rounding,
       'rulesVersion', v_rules
     ));

  return v_id;
end;
$$;

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
  -- Nobody plays off more than the event maximum (owner's decision, 14 Nov 2026), so the playing
  -- handicap is held to it as well as the index. least() ignores a null maximum, so an event with no
  -- maximum keeps the tee formula's figure.
  v_playing := least(v_playing, floor(v_max_index)::smallint);

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

-- Read-only: the players whose stored snapshot is above the maximum and still needs correcting.
-- Run it after applying this file. It changes nothing.
--
--   select p.full_name, hs.handicap_index, hs.playing_handicap, t.max_index, cr.day_number
--   from public.handicap_snapshots hs
--   join public.round_entries re on re.id = hs.round_entry_id
--   join public.registrations reg on reg.id = re.registration_id
--   join public.players p on p.id = reg.player_id
--   join public.competition_rounds cr on cr.id = hs.round_id
--   join public.tournaments t on t.id = cr.tournament_id
--   where hs.playing_handicap > t.max_index
--   order by cr.day_number, p.full_name;
