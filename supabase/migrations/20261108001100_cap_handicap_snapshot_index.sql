-- Cap an index above the tournament maximum when a handicap snapshot is saved (issue 190).
--
-- NOT APPLIED. Review before `supabase db push`.
--
-- The event rule changed on 8 November 2026: an index above the tournament maximum is capped at the
-- maximum instead of blocking the player. The draw already does this in src/lib/routing. Before this
-- file, `save_handicap_snapshot` still raised "The Handicap Index is above this tournament's maximum"
-- for the same player, so `open_round` would fail for anyone the draw had capped.
--
-- This migration only replaces the body of the existing function. The signature, return type,
-- `security definer`, `set search_path = ''` and the ACL are unchanged, and `create or replace`
-- keeps the existing grants. No table, column, policy, trigger or data is touched.
--
-- What changes:
--   * An index above `tournaments.max_index` is stored as `max_index`, and the course and playing
--     handicap are worked out from that number. The snapshot therefore holds the index that was
--     actually used, so recomputing it from the row gives the same handicap.
--   * The index that was passed in is kept in the audit row (`indexOnFile`, `capped`), so the real
--     number is not lost.
--   * The range check (-20 to 54) on the index passed in is unchanged.
-- Nothing else in the function moves.

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
