-- Scoring workflow: handicap snapshots, card submission and approval, desk resolutions, results,
-- provisional publication and finalization.
--
-- NOT APPLIED. Review with 20261035000000_scoring_schema.sql before `supabase db push`.
--
-- The TypeScript engine in src/lib/scoring decides agreement, conflict and provisional status. The
-- functions here verify the proposal against the approved cards and the head resolution, then write
-- the canonical rows and the derived result in one transaction. They do not run a second scoring
-- algorithm and they do not choose a value by majority.
--
-- All functions are security definer with an empty search_path, and every public entry point checks
-- a club role. Helpers are revoked from every client role.

-- Stroke allocation helper ------------------------------------------------------------------------
-- Pure, and used only by recalculate_player_results(). Revoked from clients below.

create or replace function public.handicap_strokes(
  p_playing smallint,
  p_stroke_index smallint,
  p_holes smallint
)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (
    trunc(p_playing::numeric / p_holes)
    + case
        when (p_playing - trunc(p_playing::numeric / p_holes) * p_holes) > 0
             and p_stroke_index <= (p_playing - trunc(p_playing::numeric / p_holes) * p_holes)
          then 1
        when (p_playing - trunc(p_playing::numeric / p_holes) * p_holes) < 0
             and p_stroke_index > p_holes + (p_playing - trunc(p_playing::numeric / p_holes) * p_holes)
          then -1
        else 0
      end
  )::smallint;
$$;

revoke all on function public.handicap_strokes(smallint, smallint, smallint)
  from public, anon, authenticated;

-- Save a handicap snapshot ------------------------------------------------------------------------

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

  if v_max_index is not null and p_index > v_max_index then
    raise exception 'The Handicap Index is above this tournament''s maximum of %', v_max_index
      using errcode = '23514';
  end if;

  v_index := round(p_index, 1);
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
       'courseHandicap', v_course,
       'playingHandicap', v_playing,
       'allowance', v_allowance,
       'rounding', v_rounding,
       'rulesVersion', v_rules
     ));

  return v_id;
end;
$$;

revoke all on function public.save_handicap_snapshot(uuid, numeric, text, date, numeric, text, text)
  from public, anon;
grant execute on function public.save_handicap_snapshot(uuid, numeric, text, date, numeric, text, text)
  to authenticated;

-- Submit a card ----------------------------------------------------------------------------------
-- Idempotent on (club_id, capture_key). The same capture retried returns the existing card; the
-- same key reused for a different player, round or scorer is refused.

create or replace function public.submit_scorecard(
  p_round_entry uuid,
  p_scorer_id uuid,
  p_source text,
  p_capture_key text,
  p_entries jsonb,
  p_written_total smallint default null,
  p_image_path text default null,
  p_image_sha256 text default null,
  p_image_mime text default null,
  p_image_bytes bigint default null,
  p_engine text default null,
  p_engine_version text default null,
  p_extraction jsonb default null
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
  v_player uuid;
  v_existing uuid;
  v_existing_round uuid;
  v_existing_player uuid;
  v_existing_scorer uuid;
  v_assignment uuid;
  v_revision smallint;
  v_card uuid;
  v_image uuid;
  v_image_card uuid;
  v_sha text;
  v_extraction uuid;
  v_attempt smallint;
  v_entry jsonb;
  v_hole smallint;
  v_strokes smallint;
  v_confidence numeric;
  v_confirmed boolean;
begin
  select re.club_id, re.round_id, r.status, reg.player_id
  into v_club, v_round, v_status, v_player
  from public.round_entries re
  join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
  join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
  where re.id = p_round_entry
  for update of r;

  if v_club is null then
    raise exception 'Round entry not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can submit a scorecard' using errcode = '42501';
  end if;
  if v_status not in ('open', 'scoring', 'provisional') then
    raise exception 'The round is not accepting scorecards' using errcode = '23514';
  end if;
  if p_source is null or p_source not in ('webcam', 'upload', 'manual') then
    raise exception 'The card source must be webcam, upload or manual' using errcode = '22023';
  end if;
  if p_capture_key is null or btrim(p_capture_key) = '' then
    raise exception 'A capture key is required' using errcode = '22023';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'The card needs at least one hole entry' using errcode = '22023';
  end if;

  -- Idempotency ---------------------------------------------------------------------------------
  select id, round_id, player_id, scorer_id
  into v_existing, v_existing_round, v_existing_player, v_existing_scorer
  from public.scorecards
  where club_id = v_club and capture_key = p_capture_key;

  if v_existing is not null then
    if v_existing_round <> v_round or v_existing_player <> v_player
       or v_existing_scorer <> p_scorer_id then
      raise exception 'capture_key_reused: the capture key belongs to another card'
        using errcode = '23505';
    end if;
    return v_existing;
  end if;

  -- The assigned marker, when one is configured -------------------------------------------------
  if exists (
    select 1 from public.scorer_assignments a
    where a.round_id = v_round and a.player_id = v_player and a.active
  ) and not exists (
    select 1 from public.scorer_assignments a
    where a.round_id = v_round and a.player_id = v_player
      and a.scorer_id = p_scorer_id and a.active
  ) then
    raise exception 'The scorer is not the assigned marker for this player' using errcode = '23514';
  end if;

  select a.id into v_assignment
  from public.scorer_assignments a
  where a.round_id = v_round and a.player_id = v_player
    and a.scorer_id = p_scorer_id and a.active
  limit 1;

  select coalesce(max(revision), 0) + 1 into v_revision
  from public.scorecards
  where round_id = v_round and player_id = v_player and scorer_id = p_scorer_id;

  insert into public.scorecards
    (club_id, round_id, player_id, scorer_id, scorer_assignment_id, source, revision, status,
     written_total, capture_key, image_path, submitted_by)
  values
    (v_club, v_round, v_player, p_scorer_id, v_assignment, p_source, v_revision, 'submitted',
     p_written_total, p_capture_key, p_image_path, (select auth.uid()))
  returning id into v_card;

  -- Image, idempotent by hash ------------------------------------------------------------------
  if p_image_sha256 is not null then
    if p_image_sha256 !~ '^[0-9a-fA-F]{64}$' then
      raise exception 'The image hash must be 64 hexadecimal characters' using errcode = '22023';
    end if;
    v_sha := lower(p_image_sha256);

    select id, scorecard_id into v_image, v_image_card
    from public.scorecard_images
    where club_id = v_club and sha256 = v_sha;

    if v_image is not null and v_image_card <> v_card then
      raise exception 'The same image is already attached to another card' using errcode = '23505';
    end if;

    if v_image is null then
      if p_image_path is null or btrim(p_image_path) = ''
         or p_image_mime is null
         or p_image_bytes is null or p_image_bytes <= 0 then
        raise exception 'An image needs a path, mime type and size' using errcode = '22023';
      end if;
      insert into public.scorecard_images
        (club_id, scorecard_id, storage_path, sha256, mime_type, byte_size, captured_by)
      values
        (v_club, v_card, p_image_path, v_sha, p_image_mime, p_image_bytes, (select auth.uid()))
      returning id into v_image;
    end if;
  end if;

  -- Extraction attempt ---------------------------------------------------------------------------
  if p_engine is not null or p_engine_version is not null or p_extraction is not null then
    if p_engine is null or btrim(p_engine) = ''
       or p_engine_version is null or btrim(p_engine_version) = '' then
      raise exception 'An extraction needs an engine and a version' using errcode = '22023';
    end if;
    select coalesce(max(attempt), 0) + 1 into v_attempt
    from public.scorecard_extractions
    where image_id is not distinct from v_image
      and engine = p_engine and engine_version = p_engine_version;

    insert into public.scorecard_extractions
      (club_id, scorecard_id, image_id, engine, engine_version, attempt, status, raw)
    values
      (v_club, v_card, v_image, p_engine, p_engine_version, v_attempt, 'succeeded', p_extraction)
    returning id into v_extraction;
  end if;

  -- Entries ------------------------------------------------------------------------------------
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_hole := (v_entry ->> 'hole')::smallint;
    v_strokes := case
      when v_entry ? 'strokes' and nullif(btrim(v_entry ->> 'strokes'), '') is not null
        then (v_entry ->> 'strokes')::smallint
      else null
    end;
    v_confidence := case
      when v_entry ? 'confidence' and nullif(btrim(v_entry ->> 'confidence'), '') is not null
        then (v_entry ->> 'confidence')::numeric
      else null
    end;
    v_confirmed := coalesce((v_entry ->> 'manually_confirmed')::boolean, false);

    insert into public.scorecard_entries
      (club_id, scorecard_id, hole_number, strokes, confidence, manually_confirmed,
       source_extraction_id)
    values
      (v_club, v_card, v_hole, v_strokes, v_confidence, v_confirmed, v_extraction);
  end loop;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, v_round, 'scorecard', v_card, 'submitted', (select auth.uid()), null,
     jsonb_build_object(
       'playerId', v_player,
       'scorerId', p_scorer_id,
       'revision', v_revision,
       'source', p_source,
       'captureKey', p_capture_key
     ));

  return v_card;
end;
$$;

revoke all on function public.submit_scorecard(
  uuid, uuid, text, text, jsonb, smallint, text, text, text, bigint, text, text, jsonb
) from public, anon;
grant execute on function public.submit_scorecard(
  uuid, uuid, text, text, jsonb, smallint, text, text, text, bigint, text, text, jsonb
) to authenticated;

-- Recalculate one player's result ----------------------------------------------------------------
-- Derived from the current canonical rows. Net is null when there is no snapshot.

create or replace function public.recalculate_player_results(
  p_round uuid,
  p_player uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_tournament uuid;
  v_course uuid;
  v_rules text;
  v_hole_count smallint;
  v_entry public.round_entries%rowtype;
  v_snapshot public.handicap_snapshots%rowtype;
  v_gross_points integer;
  v_gross_strokes integer;
  v_net_points integer;
  v_net_strokes integer;
  v_holes_counted integer;
begin
  select r.club_id, r.tournament_id, t.course_id, coalesce(r.rules_version, 'unconfirmed')
  into v_club, v_tournament, v_course, v_rules
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;

  select * into v_entry
  from public.round_entries
  where round_id = p_round and club_id = v_club
    and registration_id in (
      select id from public.registrations
      where player_id = p_player and club_id = v_club and tournament_id = v_tournament
    )
  order by id
  limit 1;

  if v_entry.id is null then
    raise exception 'The player is not entered in this round' using errcode = '23503';
  end if;

  select count(*) into v_hole_count
  from public.holes
  where course_id = v_course and club_id = v_club;

  if v_hole_count is null or v_hole_count = 0 then
    raise exception 'The course has no holes' using errcode = '23514';
  end if;

  select count(*), coalesce(sum(s.strokes), 0),
         coalesce(sum(greatest(0, 2 + h.par - s.strokes)), 0)
  into v_holes_counted, v_gross_strokes, v_gross_points
  from public.approved_hole_scores s
  join public.holes h on h.course_id = v_course and h.club_id = v_club
    and h.number = s.hole_number
  where s.round_id = p_round and s.player_id = p_player
    and s.superseded_at is null
    and s.verification in ('verified', 'provisional');

  select * into v_snapshot
  from public.handicap_snapshots
  where round_id = p_round and round_entry_id = v_entry.id;

  if v_snapshot.id is null then
    v_net_points := null;
    v_net_strokes := null;
  else
    select coalesce(sum(greatest(0, 2 + h.par - (s.strokes - hs.strokes))), 0),
           coalesce(sum(s.strokes - hs.strokes), 0)
    into v_net_points, v_net_strokes
    from public.approved_hole_scores s
    join public.holes h on h.course_id = v_course and h.club_id = v_club
      and h.number = s.hole_number
    cross join lateral (
      select public.handicap_strokes(v_snapshot.playing_handicap, h.stroke_index, v_hole_count) as strokes
    ) hs
    where s.round_id = p_round and s.player_id = p_player
      and s.superseded_at is null
      and s.verification in ('verified', 'provisional');
  end if;

  update public.round_results
  set superseded_at = now()
  where round_id = p_round and player_id = p_player and superseded_at is null;

  insert into public.round_results
    (club_id, round_id, player_id, flight_id, gross_points, net_points, gross_strokes,
     net_strokes, holes_counted, status, calculation_version, calculated_at)
  values
    (v_club, p_round, p_player, v_entry.flight_id, v_gross_points, v_net_points,
     v_gross_strokes, v_net_strokes, v_holes_counted, 'provisional', v_rules, now());
end;
$$;

revoke all on function public.recalculate_player_results(uuid, uuid)
  from public, anon, authenticated;

-- Apply a canonical proposal ---------------------------------------------------------------------
-- The proposal has one row per hole the engine considers canonical:
--   [{"hole":1,"strokes":4,"verification":"verified","provenance":"agreement"}, ...]
-- The function verifies each row against the approved cards or the head resolution, then supersedes
-- the current rows and inserts the accepted set. A conflict or pending hole must have no row.

create or replace function public.apply_canonical(
  p_round uuid,
  p_player uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_course uuid;
  v_required smallint;
  v_allow_provisional boolean;
  v_min_confidence numeric;
  v_hole record;
  v_row jsonb;
  v_resolution public.hole_resolutions%rowtype;
  v_evidence integer;
  v_distinct integer;
  v_cards integer;
  v_value smallint;
  v_source_ids uuid[];
  v_expected_verification text;
  v_expected_provenance text;
  v_accepted integer := 0;
  v_proposed integer;
begin
  select r.club_id, r.status, t.course_id, r.required_cards,
         r.allow_provisional_single_card, r.min_ocr_confidence
  into v_club, v_status, v_course, v_required, v_allow_provisional, v_min_confidence
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;
  if v_status not in ('open', 'scoring', 'provisional') then
    raise exception 'Canonical scores can only change while scoring is open' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.round_entries re
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    where re.round_id = p_round and re.club_id = v_club
      and reg.player_id = p_player and re.status = 'active'
  ) then
    raise exception 'The player is not active in this round' using errcode = '23503';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The canonical proposal must be a JSON array' using errcode = '22023';
  end if;

  v_proposed := jsonb_array_length(p_rows);

  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    group by (e ->> 'hole') having count(*) > 1
  ) then
    raise exception 'The canonical proposal has a duplicate hole' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where not exists (
      select 1 from public.holes h
      where h.course_id = v_course and h.club_id = v_club
        and h.number = (e ->> 'hole')::smallint
    )
  ) then
    raise exception 'The canonical proposal names a hole outside this course'
      using errcode = '23503';
  end if;

  update public.approved_hole_scores
  set superseded_at = now()
  where round_id = p_round and player_id = p_player and superseded_at is null;

  for v_hole in
    select number, par, stroke_index
    from public.holes
    where course_id = v_course and club_id = v_club
    order by number
  loop
    select e into v_row
    from jsonb_array_elements(p_rows) e
    where (e ->> 'hole')::smallint = v_hole.number;

    select * into v_resolution
    from public.hole_resolutions
    where round_id = p_round and player_id = p_player
      and hole_number = v_hole.number and superseded_at is null;

    v_evidence := 0;
    v_distinct := 0;
    v_cards := 0;
    v_value := null;
    v_source_ids := '{}'::uuid[];

    with duplicate_scorers as (
      select s.scorer_id
      from public.scorecards s
      where s.round_id = p_round and s.player_id = p_player and s.status = 'approved'
      group by s.scorer_id, s.revision
      having count(*) > 1
    ),
    current_cards as (
      select distinct on (s.scorer_id) s.id, s.scorer_id
      from public.scorecards s
      where s.round_id = p_round and s.player_id = p_player
        and s.status = 'approved'
        and s.scorer_id <> s.player_id
        and s.scorer_id not in (select scorer_id from duplicate_scorers)
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = p_round and re.club_id = v_club
            and re.status = 'active' and reg.player_id = s.scorer_id
        )
      order by s.scorer_id, s.revision desc, s.submitted_at desc, s.id
    )
    select count(*), count(distinct e.strokes), count(distinct c.scorer_id),
           min(e.strokes), coalesce(array_agg(distinct c.id order by c.id), '{}'::uuid[])
    into v_evidence, v_distinct, v_cards, v_value, v_source_ids
    from current_cards c
    join public.scorecard_entries e on e.scorecard_id = c.id
    where e.hole_number = v_hole.number
      and e.strokes is not null
      and (e.manually_confirmed
           or (e.confidence is not null and e.confidence >= v_min_confidence));

    if v_resolution.id is not null then
      v_expected_verification := 'verified';
      v_expected_provenance := 'desk_resolution';
      v_value := v_resolution.strokes;
      v_source_ids := coalesce(v_resolution.evidence_card_ids, '{}'::uuid[]);
    elsif v_evidence = 0 then
      if v_row is not null then
        raise exception 'Hole % has no usable evidence but a canonical value was proposed',
          v_hole.number using errcode = '23514';
      end if;
      continue;
    elsif v_distinct > 1 then
      if v_row is not null then
        raise exception 'Hole % has conflicting cards but a canonical value was proposed',
          v_hole.number using errcode = '23514';
      end if;
      continue;
    elsif v_required is not null and v_cards >= v_required then
      v_expected_verification := 'verified';
      v_expected_provenance := case when v_cards = 1 then 'single_card' else 'agreement' end;
    elsif v_allow_provisional then
      v_expected_verification := 'provisional';
      v_expected_provenance := case when v_cards = 1 then 'single_card' else 'agreement' end;
    else
      if v_row is not null then
        raise exception 'Hole % does not meet the verification requirement',
          v_hole.number using errcode = '23514';
      end if;
      continue;
    end if;

    if v_row is null then
      raise exception 'Hole % should be canonical but no value was proposed',
        v_hole.number using errcode = '23514';
    end if;
    if (v_row ->> 'strokes')::smallint is distinct from v_value then
      raise exception 'Hole % proposes % but the evidence says %',
        v_hole.number, v_row ->> 'strokes', v_value using errcode = '23514';
    end if;
    if (v_row ->> 'verification') is distinct from v_expected_verification then
      raise exception 'Hole % proposes verification % but the rule requires %',
        v_hole.number, v_row ->> 'verification', v_expected_verification using errcode = '23514';
    end if;
    if (v_row ->> 'provenance') is distinct from v_expected_provenance then
      raise exception 'Hole % proposes provenance % but the evidence is %',
        v_hole.number, v_row ->> 'provenance', v_expected_provenance using errcode = '23514';
    end if;

    insert into public.approved_hole_scores
      (club_id, round_id, player_id, hole_number, strokes, verification, provenance,
       source_card_ids, resolution_id, approved_by)
    values
      (v_club, p_round, p_player, v_hole.number, v_value, v_expected_verification,
       v_expected_provenance, coalesce(v_source_ids, '{}'::uuid[]), v_resolution.id,
       (select auth.uid()));

    v_accepted := v_accepted + 1;
  end loop;

  if v_accepted <> v_proposed then
    raise exception 'The canonical proposal has % rows but only % are supported by the evidence',
      v_proposed, v_accepted using errcode = '23514';
  end if;

  perform public.recalculate_player_results(p_round, p_player);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, p_round, 'canonical_scores', p_player, 'recalculated', (select auth.uid()), null,
     jsonb_build_object('playerId', p_player, 'holesAccepted', v_accepted));
end;
$$;

revoke all on function public.apply_canonical(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Approve a card ---------------------------------------------------------------------------------

create or replace function public.approve_scorecard(
  p_card uuid,
  p_canonical jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_player uuid;
  v_scorer uuid;
  v_status text;
  v_round_status text;
  v_written_total smallint;
  v_min_confidence numeric;
  v_course uuid;
  v_holes integer;
  v_entries integer;
  v_sum integer;
begin
  select s.club_id, s.round_id, s.player_id, s.scorer_id, s.status, s.written_total,
         r.status, r.min_ocr_confidence, t.course_id
  into v_club, v_round, v_player, v_scorer, v_status, v_written_total,
       v_round_status, v_min_confidence, v_course
  from public.scorecards s
  join public.competition_rounds r on r.id = s.round_id and r.club_id = s.club_id
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where s.id = p_card
  for update of s, r;

  if v_club is null then
    raise exception 'Scorecard not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can approve a scorecard' using errcode = '42501';
  end if;
  if v_status not in ('submitted', 'in_review') then
    raise exception 'Only a submitted card can be approved' using errcode = '23514';
  end if;
  if v_round_status not in ('open', 'scoring', 'provisional') then
    raise exception 'The round is not accepting approvals' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.scorer_assignments a
    where a.round_id = v_round and a.player_id = v_player and a.active
  ) and not exists (
    select 1 from public.scorer_assignments a
    where a.round_id = v_round and a.player_id = v_player
      and a.scorer_id = v_scorer and a.active
  ) then
    raise exception 'The scorer is no longer the assigned marker for this player'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.round_entries re
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    where re.round_id = v_round and re.club_id = v_club
      and re.status = 'active' and reg.player_id = v_scorer
  ) then
    raise exception 'The scorer is not active in this round' using errcode = '23503';
  end if;

  select count(*) into v_holes
  from public.holes
  where course_id = v_course and club_id = v_club;

  select count(*), coalesce(sum(strokes), 0)
  into v_entries, v_sum
  from public.scorecard_entries
  where scorecard_id = p_card;

  if v_entries <> v_holes then
    raise exception 'The card has % entries but the course has % holes', v_entries, v_holes
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.scorecard_entries
    where scorecard_id = p_card and strokes is null
  ) then
    raise exception 'The card still has a blank or illegible hole' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.scorecard_entries
    where scorecard_id = p_card
      and not manually_confirmed
      and (confidence is null or confidence < v_min_confidence)
  ) then
    raise exception 'The card has a low-confidence value that a person has not confirmed'
      using errcode = '23514';
  end if;
  if v_written_total is not null and v_written_total <> v_sum then
    raise exception 'The written total is % but the holes add up to %', v_written_total, v_sum
      using errcode = '23514';
  end if;

  update public.scorecards
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
  where id = p_card;

  perform public.apply_canonical(v_round, v_player, p_canonical);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, v_round, 'scorecard', p_card, 'approved', (select auth.uid()),
     nullif(btrim(p_reason), ''),
     jsonb_build_object('playerId', v_player, 'writtenTotal', v_written_total));
end;
$$;

revoke all on function public.approve_scorecard(uuid, jsonb, text) from public, anon;
grant execute on function public.approve_scorecard(uuid, jsonb, text) to authenticated;

-- Reject a card -----------------------------------------------------------------------------------

create or replace function public.reject_scorecard(
  p_card uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_status text;
  v_round_status text;
begin
  select s.club_id, s.round_id, s.status, r.status
  into v_club, v_round, v_status, v_round_status
  from public.scorecards s
  join public.competition_rounds r on r.id = s.round_id and r.club_id = s.club_id
  where s.id = p_card
  for update of s, r;

  if v_club is null then
    raise exception 'Scorecard not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can reject a scorecard' using errcode = '42501';
  end if;
  if v_status not in ('submitted', 'in_review') then
    raise exception 'Only a submitted card can be rejected' using errcode = '23514';
  end if;
  if v_round_status not in ('open', 'scoring', 'provisional') then
    raise exception 'The round is not accepting decisions' using errcode = '23514';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A rejection needs a reason' using errcode = '22023';
  end if;

  update public.scorecards
  set status = 'rejected', rejection_reason = btrim(p_reason)
  where id = p_card;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason)
  values
    (v_club, v_round, 'scorecard', p_card, 'rejected', (select auth.uid()), btrim(p_reason));
end;
$$;

revoke all on function public.reject_scorecard(uuid, text) from public, anon;
grant execute on function public.reject_scorecard(uuid, text) to authenticated;

-- Resolve a disputed hole -------------------------------------------------------------------------

create or replace function public.resolve_hole(
  p_round uuid,
  p_player uuid,
  p_hole smallint,
  p_strokes smallint,
  p_reason text,
  p_canonical jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_course uuid;
  v_stroke_min smallint;
  v_stroke_max smallint;
  v_card_ids uuid[];
  v_previous smallint;
  v_id uuid;
begin
  select r.club_id, r.status, t.course_id, r.stroke_min, r.stroke_max
  into v_club, v_status, v_course, v_stroke_min, v_stroke_max
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round
  for update of r;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can resolve a hole' using errcode = '42501';
  end if;
  if v_status not in ('open', 'scoring', 'provisional') then
    raise exception 'Resolutions can only change while scoring is open' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.round_entries re
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    where re.round_id = p_round and re.club_id = v_club
      and reg.player_id = p_player and re.status = 'active'
  ) then
    raise exception 'The player is not active in this round' using errcode = '23503';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A resolution needs a reason' using errcode = '22023';
  end if;
  if p_strokes is null or p_strokes < v_stroke_min or p_strokes > v_stroke_max then
    raise exception 'The resolved score is outside the round limits (% to %)',
      v_stroke_min, v_stroke_max using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.holes h
    where h.course_id = v_course and h.club_id = v_club and h.number = p_hole
  ) then
    raise exception 'Hole % is not part of this course', p_hole using errcode = '23503';
  end if;

  select array_agg(distinct s.id)
  into v_card_ids
  from public.scorecards s
  join public.scorecard_entries e on e.scorecard_id = s.id
  where s.round_id = p_round and s.player_id = p_player
    and s.status = 'approved' and e.hole_number = p_hole;

  select strokes into v_previous
  from public.approved_hole_scores
  where round_id = p_round and player_id = p_player and hole_number = p_hole
    and superseded_at is null;

  update public.hole_resolutions
  set superseded_at = now()
  where round_id = p_round and player_id = p_player and hole_number = p_hole
    and superseded_at is null;

  insert into public.hole_resolutions
    (club_id, round_id, player_id, hole_number, strokes, reason, resolved_by,
     evidence_card_ids, previous_strokes)
  values
    (v_club, p_round, p_player, p_hole, p_strokes, btrim(p_reason), (select auth.uid()),
     coalesce(v_card_ids, '{}'::uuid[]), v_previous)
  returning id into v_id;

  perform public.apply_canonical(p_round, p_player, p_canonical);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, p_round, 'hole_resolution', v_id, 'resolved', (select auth.uid()), btrim(p_reason),
     jsonb_build_object('strokes', v_previous),
     jsonb_build_object('strokes', p_strokes, 'hole', p_hole, 'playerId', p_player));

  return v_id;
end;
$$;

revoke all on function public.resolve_hole(uuid, uuid, smallint, smallint, text, jsonb)
  from public, anon;
grant execute on function public.resolve_hole(uuid, uuid, smallint, smallint, text, jsonb)
  to authenticated;

-- Build a publication snapshot --------------------------------------------------------------------
-- Names, flight, points, strokes and holes counted only. No handicap indexes, contacts or photos.

create or replace function public.build_round_snapshot(
  p_round uuid,
  p_state text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_event_name text;
  v_play_date date;
  v_holes integer;
  v_snapshot jsonb;
begin
  select r.club_id, r.play_date, t.name
  into v_club, v_play_date, v_event_name
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;

  select count(*) into v_holes
  from public.holes h
  join public.tournaments t on t.course_id = h.course_id and t.club_id = h.club_id
  join public.competition_rounds r on r.tournament_id = t.id and r.club_id = t.club_id
  where r.id = p_round and h.club_id = v_club;

  if v_holes = 0 then
    raise exception 'The course has no holes' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'eventName', v_event_name,
    'playDate', v_play_date,
    'version', p_version,
    'state', p_state,
    'publishedAt', now(),
    'gross', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.gross_points,
        'strokes', rr.gross_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.gross_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb),
    'net', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.net_points,
        'strokes', rr.net_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.net_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0 and rr.net_points is not null
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.build_round_snapshot(uuid, text, integer)
  from public, anon, authenticated;

-- Publish provisional results ---------------------------------------------------------------------

create or replace function public.publish_round(
  p_round uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_publication text;
  v_version integer;
  v_snapshot jsonb;
begin
  select club_id, status, provisional_publication
  into v_club, v_status, v_publication
  from public.competition_rounds
  where id = p_round
  for update;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can publish results' using errcode = '42501';
  end if;
  if v_status not in ('scoring', 'provisional') then
    raise exception 'The round is not ready to publish provisional results' using errcode = '23514';
  end if;
  if v_publication = 'off' then
    raise exception 'Provisional publication is off for this round' using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.round_publications
  where round_id = p_round;

  v_snapshot := public.build_round_snapshot(p_round, 'provisional', v_version);

  if jsonb_array_length(v_snapshot -> 'gross') = 0 then
    raise exception 'There are no results to publish' using errcode = '23514';
  end if;

  insert into public.round_publications
    (club_id, round_id, version, state, snapshot, note, published_by)
  values
    (v_club, p_round, v_version, 'provisional', v_snapshot, nullif(btrim(p_note), ''),
     (select auth.uid()));

  update public.competition_rounds
  set status = 'provisional'
  where id = p_round and status = 'scoring';

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, p_round, 'round_publication', null, 'published_provisional', (select auth.uid()),
     nullif(btrim(p_note), ''), jsonb_build_object('version', v_version));

  return v_version;
end;
$$;

revoke all on function public.publish_round(uuid, text) from public, anon;
grant execute on function public.publish_round(uuid, text) to authenticated;

-- Finalize ----------------------------------------------------------------------------------------

create or replace function public.finalize_round(
  p_round uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_required smallint;
  v_tie_break uuid;
  v_authority text;
  v_rules text;
  v_course uuid;
  v_holes integer;
  v_entry record;
  v_verified integer;
  v_cards integer;
  v_version integer;
  v_snapshot jsonb;
begin
  select club_id, status, required_cards, tie_break_policy_id, finalization_authority,
         rules_version
  into v_club, v_status, v_required, v_tie_break, v_authority, v_rules
  from public.competition_rounds
  where id = p_round
  for update;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;

  if v_authority is null then
    raise exception 'The final approval authority has not been confirmed' using errcode = '23514';
  end if;
  if v_authority = 'committee' then
    raise exception 'Committee finalization is not implemented' using errcode = '0A000';
  end if;
  if v_authority = 'owner' and not public.has_club_role(v_club, array['owner']) then
    raise exception 'Only the owner can finalize this round' using errcode = '42501';
  end if;
  if v_authority = 'organizer'
     and not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can finalize this round' using errcode = '42501';
  end if;

  if v_status not in ('scoring', 'provisional') then
    raise exception 'The round is not ready to finalize' using errcode = '23514';
  end if;
  if v_required is null then
    raise exception 'The required number of scorecards has not been confirmed'
      using errcode = '23514';
  end if;
  if v_tie_break is null then
    raise exception 'The organizer''s tie-break policy has not been recorded' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.tie_break_policies
    where id = v_tie_break and club_id = v_club
      and confirmed_at is not null and confirmed_by is not null
  ) then
    raise exception 'The tie-break policy is not confirmed' using errcode = '23514';
  end if;
  if v_rules is null or btrim(v_rules) = '' then
    raise exception 'The rules version has not been recorded' using errcode = '23514';
  end if;

  select t.course_id into v_course
  from public.tournaments t
  join public.competition_rounds r on r.tournament_id = t.id and r.club_id = t.club_id
  where r.id = p_round;

  select count(*) into v_holes
  from public.holes
  where course_id = v_course and club_id = v_club;

  if v_holes = 0 then
    raise exception 'The course has no holes' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.round_entries
    where round_id = p_round and club_id = v_club and status = 'active'
  ) then
    raise exception 'The round has no active players' using errcode = '23514';
  end if;

  for v_entry in
    select re.registration_id, reg.player_id, p.full_name
    from public.round_entries re
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    join public.players p on p.id = reg.player_id and p.club_id = reg.club_id
    where re.round_id = p_round and re.club_id = v_club and re.status = 'active'
    order by p.full_name
  loop
    select count(*) into v_verified
    from public.approved_hole_scores
    where round_id = p_round and player_id = v_entry.player_id
      and superseded_at is null and verification = 'verified';

    if v_verified <> v_holes then
      raise exception 'Player % has % of % verified holes', v_entry.full_name,
        v_verified, v_holes using errcode = '23514';
    end if;

    select count(distinct s.scorer_id) into v_cards
    from public.scorecards s
    join public.round_entries re on re.round_id = s.round_id and re.club_id = s.club_id
    join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
    where s.round_id = p_round and s.player_id = v_entry.player_id
      and s.status = 'approved' and re.status = 'active'
      and reg.player_id = s.scorer_id;

    if coalesce(v_cards, 0) < v_required then
      raise exception 'Player % has % of % required cards', v_entry.full_name,
        coalesce(v_cards, 0), v_required using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.round_results
      where round_id = p_round and player_id = v_entry.player_id
        and superseded_at is null and net_points is not null
        and holes_counted = v_holes
    ) then
      raise exception 'Player % has no complete net result', v_entry.full_name
        using errcode = '23514';
    end if;
  end loop;

  update public.round_results
  set status = 'final', calculated_at = now()
  where round_id = p_round and superseded_at is null and status = 'provisional';

  select coalesce(max(version), 0) + 1 into v_version
  from public.round_publications
  where round_id = p_round;

  v_snapshot := public.build_round_snapshot(p_round, 'final', v_version);

  insert into public.round_publications
    (club_id, round_id, version, state, snapshot, note, published_by)
  values
    (v_club, p_round, v_version, 'final', v_snapshot, nullif(btrim(p_note), ''),
     (select auth.uid()));

  update public.competition_rounds
  set status = 'final'
  where id = p_round;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, p_round, 'round', p_round, 'finalized', (select auth.uid()),
     nullif(btrim(p_note), ''), jsonb_build_object('version', v_version));

  return v_version;
end;
$$;

revoke all on function public.finalize_round(uuid, text) from public, anon;
grant execute on function public.finalize_round(uuid, text) to authenticated;

-- Public results ----------------------------------------------------------------------------------
-- The only anonymous read path. It returns the latest immutable snapshot, never the live tables.

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
  select rp.version, rp.state, rp.published_at, rp.snapshot
  from public.round_publications rp
  where rp.round_id = p_round
  order by rp.version desc
  limit 1;
$$;

revoke all on function public.public_round_results(uuid) from public, anon;
grant execute on function public.public_round_results(uuid) to anon, authenticated;

-- A note, not a claim: these functions are written for review. They are not tested until the
-- migrations are applied to a disposable project and the checks in
-- docs/spec/SCORING_IMPLEMENTATION.md are run.
