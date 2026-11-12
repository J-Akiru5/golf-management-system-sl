-- Pick-up scores ----------------------------------------------------------------------------------
--
-- A pick-up is a hole the player could not finish. The scorer writes an X. The hole scores 0 points
-- gross and net, counts as a played hole, and has no stroke count.
--
-- NOT APPLIED. Review before `supabase db push`.
--
-- This file changes existing tables and replaces existing functions, so the owner must approve
-- applying it by name.
--
-- It depends on the scoring schema, the scoring workflow and the later migrations
-- (20261035000000_scoring_schema.sql, 20261036000000_scoring_workflow.sql and
-- 20261042000000_player_scorecard_snapshot.sql). Those may not be applied to the live project yet.
--
-- Stored shape: a card entry is `picked_up = true` with no stroke count. A resolution and a
-- canonical score are `picked_up = true` with `strokes = 0`, because both columns require a number.
-- A published hole carries `"pickedUp": true` and `grossStrokes` 0, which is the shape the player
-- portal and the paper card already read.

-- Tables -----------------------------------------------------------------------------------------

alter table public.scorecard_entries
  add column picked_up boolean not null default false;

alter table public.scorecard_entries
  add constraint scorecard_entries_pickup_check
  check (not picked_up or strokes is null);

alter table public.hole_resolutions
  add column picked_up boolean not null default false;

alter table public.hole_resolutions
  drop constraint hole_resolutions_strokes_check;

alter table public.hole_resolutions
  add constraint hole_resolutions_pickup_score_check
  check ((picked_up and strokes = 0) or (not picked_up and strokes > 0));

alter table public.approved_hole_scores
  add column picked_up boolean not null default false;

alter table public.approved_hole_scores
  drop constraint approved_hole_scores_strokes_check;

alter table public.approved_hole_scores
  add constraint approved_hole_scores_pickup_score_check
  check ((picked_up and strokes = 0) or (not picked_up and strokes > 0));

-- Entry trigger -----------------------------------------------------------------------------------
-- A pick-up entry has no number, so it passes the stroke range check. A number on a pick-up entry
-- is refused before the row reaches the table constraint.

create or replace function public.check_scorecard_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.scorecards%rowtype;
  v_course uuid;
  v_min smallint;
  v_max smallint;
begin
  select * into v_card
  from public.scorecards s
  where s.id = new.scorecard_id and s.club_id = new.club_id;

  if v_card.id is null then
    raise exception 'Scorecard not found' using errcode = '23503';
  end if;

  if v_card.status in ('approved', 'rejected', 'superseded') then
    raise exception 'An approved, rejected or superseded card cannot be edited'
      using errcode = '23514';
  end if;

  select t.course_id, r.stroke_min, r.stroke_max
  into v_course, v_min, v_max
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = v_card.round_id and r.club_id = v_card.club_id;

  if v_course is null then
    raise exception 'The round was not found' using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.holes h
    where h.course_id = v_course and h.club_id = new.club_id
      and h.number = new.hole_number
  ) then
    raise exception 'Hole % is not part of this course', new.hole_number
      using errcode = '23503';
  end if;

  if new.picked_up and new.strokes is not null then
    raise exception 'A picked-up hole has no stroke count' using errcode = '23514';
  end if;

  if not new.picked_up and new.strokes is not null
     and (new.strokes < v_min or new.strokes > v_max) then
    raise exception 'Hole % score is outside the round limits (% to %)',
      new.hole_number, v_min, v_max using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Submit a card -----------------------------------------------------------------------------------
-- Same as 20261036000000_scoring_workflow.sql, plus `picked_up` in each entry. A true value needs a
-- blank or absent stroke count; a number beside it is refused.

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
  v_picked_up boolean;
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
    v_picked_up := coalesce((v_entry ->> 'picked_up')::boolean, false);
    v_confidence := case
      when v_entry ? 'confidence' and nullif(btrim(v_entry ->> 'confidence'), '') is not null
        then (v_entry ->> 'confidence')::numeric
      else null
    end;
    v_confirmed := coalesce((v_entry ->> 'manually_confirmed')::boolean, false);

    if v_picked_up and v_strokes is not null then
      raise exception 'A picked-up hole has no stroke count' using errcode = '22023';
    end if;

    insert into public.scorecard_entries
      (club_id, scorecard_id, hole_number, strokes, picked_up, confidence, manually_confirmed,
       source_extraction_id)
    values
      (v_club, v_card, v_hole, v_strokes, v_picked_up, v_confidence, v_confirmed, v_extraction);
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

-- Recalculate one player's result ----------------------------------------------------------------
-- Same as 20261036000000_scoring_workflow.sql, plus a pick-up. A pick-up counts as a played hole,
-- scores 0 gross and net points, and adds nothing to either stroke total.

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

  select count(*), coalesce(sum(case when s.picked_up then 0 else s.strokes end), 0),
         coalesce(sum(case when s.picked_up then 0
                          else greatest(0, 2 + h.par - s.strokes) end), 0)
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
    select coalesce(sum(case when s.picked_up then 0
                             else greatest(0, 2 + h.par - (s.strokes - hs.strokes)) end), 0),
           coalesce(sum(case when s.picked_up then 0
                             else s.strokes - hs.strokes end), 0)
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

-- Apply a canonical proposal ---------------------------------------------------------------------
-- Same as 20261036000000_scoring_workflow.sql, plus pick-ups:
--   [{"hole":1,"strokes":4,"verification":"verified","provenance":"agreement"}, ...]
-- A picked-up hole carries 0 strokes and `"pickedUp": true`. A number and a pick-up on the same
-- hole are a conflict and have no row, like two different numbers.

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
  v_pickups integer;
  v_value smallint;
  v_source_ids uuid[];
  v_expected_verification text;
  v_expected_provenance text;
  v_expected_pickup boolean;
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
    v_pickups := 0;
    v_value := null;
    v_source_ids := '{}'::uuid[];
    v_expected_pickup := false;

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
    select count(*),
           count(distinct case when e.picked_up then 0 else e.strokes end),
           count(distinct c.scorer_id),
           min(case when e.picked_up then 0 else e.strokes end),
           count(*) filter (where e.picked_up),
           coalesce(array_agg(distinct c.id order by c.id), '{}'::uuid[])
    into v_evidence, v_distinct, v_cards, v_value, v_pickups, v_source_ids
    from current_cards c
    join public.scorecard_entries e on e.scorecard_id = c.id
    where e.hole_number = v_hole.number
      and (e.strokes is not null or e.picked_up)
      and (e.manually_confirmed
           or (e.confidence is not null and e.confidence >= v_min_confidence));

    if v_resolution.id is not null then
      v_expected_verification := 'verified';
      v_expected_provenance := 'desk_resolution';
      v_value := v_resolution.strokes;
      v_expected_pickup := v_resolution.picked_up;
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
      v_expected_pickup := v_pickups = v_evidence;
    elsif v_allow_provisional then
      v_expected_verification := 'provisional';
      v_expected_provenance := case when v_cards = 1 then 'single_card' else 'agreement' end;
      v_expected_pickup := v_pickups = v_evidence;
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
    if coalesce((v_row ->> 'pickedUp')::boolean, false) is distinct from v_expected_pickup then
      raise exception 'Hole % disagrees on whether the hole was picked up',
        v_hole.number using errcode = '23514';
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
      (club_id, round_id, player_id, hole_number, strokes, picked_up, verification, provenance,
       source_card_ids, resolution_id, approved_by)
    values
      (v_club, p_round, p_player, v_hole.number, v_value, v_expected_pickup,
       v_expected_verification, v_expected_provenance, coalesce(v_source_ids, '{}'::uuid[]),
       v_resolution.id, (select auth.uid()));

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

-- Approve a card ---------------------------------------------------------------------------------
-- Same as 20261036000000_scoring_workflow.sql, plus pick-ups. A pick-up entry is a filled hole. The
-- written-total comparison leaves pick-ups out and is skipped when the card has any pick-up, because
-- the numbers cannot add up to a card total.

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
  v_pickups integer;
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

  select count(*), coalesce(sum(strokes) filter (where not picked_up), 0),
         count(*) filter (where picked_up)
  into v_entries, v_sum, v_pickups
  from public.scorecard_entries
  where scorecard_id = p_card;

  if v_entries <> v_holes then
    raise exception 'The card has % entries but the course has % holes', v_entries, v_holes
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.scorecard_entries
    where scorecard_id = p_card and strokes is null and not picked_up
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
  if v_pickups = 0 and v_written_total is not null and v_written_total <> v_sum then
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

-- Resolve a disputed hole -------------------------------------------------------------------------
-- Same as 20261036000000_scoring_workflow.sql, plus `p_strokes = 0`, which settles the hole as a
-- pick-up. A negative value is still refused. `previous_strokes` still means the number before.

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
  v_previous_picked boolean;
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
  if p_strokes is null or p_strokes < 0 then
    raise exception 'The resolved score must be 0 for a pick-up or a positive number'
      using errcode = '23514';
  end if;
  if p_strokes > 0 and (p_strokes < v_stroke_min or p_strokes > v_stroke_max) then
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

  select strokes, picked_up into v_previous, v_previous_picked
  from public.approved_hole_scores
  where round_id = p_round and player_id = p_player and hole_number = p_hole
    and superseded_at is null;

  if v_previous_picked is true then
    v_previous := null;
  end if;

  update public.hole_resolutions
  set superseded_at = now()
  where round_id = p_round and player_id = p_player and hole_number = p_hole
    and superseded_at is null;

  insert into public.hole_resolutions
    (club_id, round_id, player_id, hole_number, strokes, picked_up, reason, resolved_by,
     evidence_card_ids, previous_strokes)
  values
    (v_club, p_round, p_player, p_hole, p_strokes, p_strokes = 0, btrim(p_reason),
     (select auth.uid()), coalesce(v_card_ids, '{}'::uuid[]), v_previous)
  returning id into v_id;

  perform public.apply_canonical(p_round, p_player, p_canonical);

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, p_round, 'hole_resolution', v_id, 'resolved', (select auth.uid()), btrim(p_reason),
     jsonb_build_object('strokes', v_previous)
       || case when v_previous_picked is true
            then jsonb_build_object('previousPickedUp', true) else '{}'::jsonb end,
     jsonb_build_object('strokes', p_strokes, 'hole', p_hole, 'playerId', p_player)
       || case when p_strokes = 0
            then jsonb_build_object('pickedUp', true) else '{}'::jsonb end);

  return v_id;
end;
$$;

-- Published scorecard ----------------------------------------------------------------------------
-- Same as 20261042000000_player_scorecard_snapshot.sql, plus a pick-up hole. A pick-up carries
-- `"pickedUp": true` and 0 for strokes and both point rows, which is what the portal reads. A hole
-- that is not a pick-up produces exactly the JSON it did before.

create or replace function public.build_round_scorecards(
  p_round uuid,
  p_holes integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with course as (
    select r.club_id, t.course_id
    from public.competition_rounds r
    join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
    where r.id = p_round
  )
  select coalesce(jsonb_agg(card order by player_name), '[]'::jsonb)
  from (
    select
      p.full_name as player_name,
      jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'playingHandicap', hs.playing_handicap,
        'courseHandicap', hs.course_handicap,
        'grossStrokes', rr.gross_strokes,
        'netStrokes', rr.net_strokes,
        'grossPoints', rr.gross_points,
        'netPoints', rr.net_points,
        'holesCounted', rr.holes_counted,
        'holesTotal', p_holes,
        'holes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'hole', s.hole_number,
            'par', h.par,
            'strokeIndex', h.stroke_index,
            'grossStrokes', case when s.picked_up then 0 else s.strokes end,
            'handicapStrokes', st.strokes,
            'netStrokes', case
              when st.strokes is null then null
              when s.picked_up then 0
              else s.strokes - st.strokes
            end,
            'grossPoints', case
              when s.picked_up then 0
              else greatest(0, 2 + h.par - s.strokes)
            end,
            'netPoints', case
              when st.strokes is null then null
              when s.picked_up then 0
              else greatest(0, 2 + h.par - (s.strokes - st.strokes))
            end
          ) || case when s.picked_up
               then jsonb_build_object('pickedUp', true) else '{}'::jsonb end
          order by s.hole_number)
          from public.approved_hole_scores s
          join public.holes h
            on h.club_id = s.club_id
           and h.course_id = c.course_id
           and h.number = s.hole_number
          cross join lateral (
            select public.handicap_strokes(
              hs.playing_handicap, h.stroke_index, p_holes::smallint
            ) as strokes
          ) st
          where s.round_id = rr.round_id
            and s.player_id = rr.player_id
            and s.club_id = rr.club_id
            and s.superseded_at is null
            and s.verification in ('verified', 'provisional')
        ), '[]'::jsonb)
      ) as card
    from public.round_results rr
    join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
    left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
    cross join course c
    left join lateral (
      select snapshot.*
      from public.handicap_snapshots snapshot
      join public.round_entries entry
        on entry.id = snapshot.round_entry_id and entry.club_id = snapshot.club_id
      join public.registrations registration
        on registration.id = entry.registration_id and registration.club_id = entry.club_id
      where snapshot.round_id = rr.round_id
        and snapshot.club_id = rr.club_id
        and entry.round_id = rr.round_id
        and registration.player_id = rr.player_id
      order by snapshot.created_at desc
      limit 1
    ) hs on true
    where rr.round_id = p_round
      and rr.club_id = c.club_id
      and rr.superseded_at is null
      and rr.holes_counted > 0
      and exists (
        select 1
        from public.round_entries re
        join public.registrations reg
          on reg.id = re.registration_id and reg.club_id = re.club_id
        where re.round_id = rr.round_id and re.club_id = rr.club_id
          and re.status = 'active' and reg.player_id = rr.player_id
      )
  ) cards;
$$;

-- Checks to run once applied to a disposable project ---------------------------------------------
--
-- 1. Submit a card with two pick-ups and approve it: the approval succeeds and both holes score 0.
-- 2. Approve the same card with a written total on it: the approval still succeeds, because the
--    written-total check is skipped when a card has a pick-up.
-- 3. Approve two cards for one player where one has a pick-up and the other a number on the same
--    hole: apply_canonical refuses a row for that hole and the canonical value stays absent.
-- 4. Call resolve_hole with p_strokes = 0: the resolution is stored as a pick-up with 0 strokes and
--    the audit after JSON carries pickedUp true.
-- 5. Recalculate the player: the pick-up holes are in holes_counted, add 0 gross and net points and
--    add nothing to either stroke total.
-- 6. Build a publication and read the card: a pick-up hole carries "pickedUp": true with
--    grossStrokes 0, and a hole that is not a pick-up has no pickedUp key.
