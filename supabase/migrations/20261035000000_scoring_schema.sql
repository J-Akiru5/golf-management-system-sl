-- Scoring schema: daily rounds, evidence, canonical scores and publications.
--
-- NOT APPLIED. Review before `supabase db push`. This file is the schema half; the workflow
-- functions are in 20261036000000_scoring_workflow.sql.
--
-- Dependencies and warnings:
-- 1. 20261034000000_course_maps.sql is written but NOT applied. `supabase db push` would apply
--    both it and this file. Decide the sequence first.
-- 2. `holes` is keyed by course, so it cannot hold a different par or stroke index per tee. If
--    IGCC's tees differ, `tee_holes` is needed before real net scoring. This migration does not
--    invent that table.
-- 3. `groups` gains `round_id`. Existing draws are backfilled to a default day-1 round, and a
--    trigger fills it for the current save_draw() which does not name a round. The tournament-wide
--    unique group number stays for now; moving the draw save to a round parameter is a later step.
-- 4. Everything except the groups change is additive.

-- Tie-break policy ------------------------------------------------------------------------------
-- Metadata only. No procedure is implemented in this build. A finalized round requires a
-- confirmed policy row; the application must also support the named procedure.

create table public.tie_break_policies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  procedure text not null check (btrim(procedure) <> ''),
  written_source text not null check (btrim(written_source) <> ''),
  version text not null default '1' check (btrim(version) <> ''),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (club_id, name, version)
);

create index tie_break_policies_club on public.tie_break_policies (club_id);

-- Daily competition ----------------------------------------------------------------------------

create table public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  day_number smallint not null check (day_number > 0),
  play_date date not null,
  hole_count smallint not null default 18 check (hole_count between 1 and 36),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'scoring', 'provisional', 'final')),
  allowance numeric(4, 3) not null default 1 check (allowance > 0 and allowance <= 1),
  handicap_rounding text not null default 'whs' check (handicap_rounding in ('whs', 'single')),
  stroke_min smallint not null default 1 check (stroke_min > 0),
  stroke_max smallint not null default 20 check (stroke_max >= stroke_min),
  required_cards smallint check (required_cards is null or required_cards > 0),
  allow_provisional_single_card boolean not null default false,
  min_ocr_confidence numeric(3, 2) not null default 0.85
    check (min_ocr_confidence >= 0 and min_ocr_confidence <= 1),
  provisional_publication text not null default 'off'
    check (provisional_publication in ('off', 'verified_holes')),
  tie_break_policy_id uuid,
  finalization_authority text
    check (finalization_authority in ('owner', 'organizer', 'committee')),
  rules_version text check (rules_version is null or btrim(rules_version) <> ''),
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (tournament_id, day_number),
  unique (tournament_id, play_date),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (tie_break_policy_id, club_id) references public.tie_break_policies (id, club_id)
);

create index competition_rounds_tournament on public.competition_rounds (tournament_id, day_number);

-- Per-day participation. One tournament registration may enter several days, subject to the
-- event's eligibility rules, which are not encoded here.

create table public.round_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  registration_id uuid not null,
  flight_id uuid,
  status text not null default 'active'
    check (status in ('active', 'withdrawn', 'disqualified')),
  withdrawn_reason text,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (round_id, registration_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (registration_id, club_id) references public.registrations (id, club_id) on delete cascade,
  foreign key (flight_id, club_id) references public.flights (id, club_id) on delete set null
);

create index round_entries_round on public.round_entries (round_id, status);

-- Scorer rotation. The pattern names are not fixed yet; the validator is a later build. Until a
-- policy is confirmed, the desk assigns a marker by hand.

create table public.scorer_rotation_policies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  kind text not null check (btrim(kind) <> ''),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade
);

create table public.scorer_assignments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  scorer_id uuid not null,
  policy_id uuid,
  active boolean not null default true,
  assigned_by uuid references auth.users (id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  unique (id, club_id),
  check (player_id <> scorer_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (scorer_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (policy_id, club_id) references public.scorer_rotation_policies (id, club_id) on delete set null
);

create unique index scorer_assignments_current
  on public.scorer_assignments (round_id, player_id) where active;

-- Handicap snapshot -----------------------------------------------------------------------------
-- Written only by save_handicap_snapshot(), which recomputes Course and Playing Handicap from the
-- tee row. Frozen once the round leaves draft/open.

create table public.handicap_snapshots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  round_entry_id uuid not null,
  handicap_index numeric(4, 1) not null check (handicap_index >= -20 and handicap_index <= 54),
  index_source text not null check (btrim(index_source) <> ''),
  index_effective_date date not null,
  tee_id uuid not null,
  course_rating numeric(4, 1) not null check (course_rating between 50 and 90),
  slope smallint not null check (slope between 55 and 155),
  course_par smallint not null check (course_par between 27 and 80),
  allowance numeric(4, 3) not null check (allowance > 0 and allowance <= 1),
  rounding text not null check (rounding in ('whs', 'single')),
  course_handicap smallint not null,
  playing_handicap smallint not null,
  rules_version text not null check (btrim(rules_version) <> ''),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (round_id, round_entry_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (round_entry_id, club_id) references public.round_entries (id, club_id) on delete cascade,
  foreign key (tee_id, club_id) references public.tees (id, club_id)
);

-- Cards and extraction --------------------------------------------------------------------------

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  scorer_id uuid not null,
  scorer_assignment_id uuid,
  source text not null check (source in ('webcam', 'upload', 'manual')),
  revision smallint not null default 1 check (revision > 0),
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'approved', 'rejected', 'superseded')),
  written_total smallint check (written_total is null or written_total > 0),
  capture_key text not null check (btrim(capture_key) <> ''),
  image_path text,
  submitted_by uuid references auth.users (id) on delete set null default auth.uid(),
  submitted_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  unique (id, club_id),
  unique (club_id, capture_key),
  unique (round_id, player_id, scorer_id, revision),
  check (player_id <> scorer_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (scorer_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (scorer_assignment_id, club_id) references public.scorer_assignments (id, club_id) on delete set null
);

create index scorecards_round_player on public.scorecards (round_id, player_id, status);
create index scorecards_scorer on public.scorecards (round_id, scorer_id);

create table public.scorecard_images (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  scorecard_id uuid not null,
  storage_path text not null check (
    btrim(storage_path) <> '' and storage_path like club_id::text || '/%'
  ),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint not null check (byte_size > 0),
  captured_by uuid references auth.users (id) on delete set null default auth.uid(),
  captured_at timestamptz not null default now(),
  unique (id, club_id),
  unique (club_id, sha256),
  foreign key (scorecard_id, club_id) references public.scorecards (id, club_id) on delete cascade
);

create table public.scorecard_extractions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  scorecard_id uuid not null,
  image_id uuid,
  engine text not null check (btrim(engine) <> ''),
  engine_version text not null check (btrim(engine_version) <> ''),
  attempt smallint not null check (attempt > 0),
  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed')),
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (image_id, engine, engine_version, attempt),
  foreign key (scorecard_id, club_id) references public.scorecards (id, club_id) on delete cascade,
  foreign key (image_id, club_id) references public.scorecard_images (id, club_id)
);

create table public.scorecard_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  scorecard_id uuid not null,
  hole_number smallint not null check (hole_number > 0),
  strokes smallint check (strokes is null or strokes > 0),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  manually_confirmed boolean not null default false,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  source_extraction_id uuid,
  unique (id, club_id),
  unique (scorecard_id, hole_number),
  foreign key (scorecard_id, club_id) references public.scorecards (id, club_id) on delete cascade,
  foreign key (source_extraction_id, club_id)
    references public.scorecard_extractions (id, club_id)
);

create index scorecard_entries_card on public.scorecard_entries (scorecard_id);

-- Desk decisions and canonical scores --------------------------------------------------------------

create table public.hole_resolutions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  hole_number smallint not null check (hole_number > 0),
  strokes smallint not null check (strokes > 0),
  reason text not null check (length(btrim(reason)) >= 3),
  resolved_by uuid references auth.users (id) on delete set null default auth.uid(),
  resolved_at timestamptz not null default now(),
  evidence_card_ids uuid[] not null default '{}',
  previous_strokes smallint,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade
);

create unique index hole_resolutions_current
  on public.hole_resolutions (round_id, player_id, hole_number) where superseded_at is null;

create index hole_resolutions_round on public.hole_resolutions (round_id, player_id);

-- One current canonical value per player, round and hole. A conflict or a pending hole has no row.
-- `verification` separates a hole that may be shown provisionally from one that is final-ready.

create table public.approved_hole_scores (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  hole_number smallint not null check (hole_number > 0),
  strokes smallint not null check (strokes > 0),
  verification text not null check (verification in ('verified', 'provisional')),
  provenance text not null check (provenance in ('agreement', 'single_card', 'desk_resolution')),
  source_card_ids uuid[] not null default '{}',
  resolution_id uuid,
  approved_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (resolution_id, club_id) references public.hole_resolutions (id, club_id)
);

create unique index approved_hole_scores_current
  on public.approved_hole_scores (round_id, player_id, hole_number) where superseded_at is null;

create index approved_hole_scores_round on public.approved_hole_scores (round_id, player_id);

create table public.round_results (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  flight_id uuid,
  gross_points smallint not null check (gross_points >= 0),
  net_points smallint check (net_points is null or net_points >= 0),
  gross_strokes smallint not null check (gross_strokes >= 0),
  net_strokes smallint check (net_strokes is null or net_strokes >= 0),
  holes_counted smallint not null check (holes_counted >= 0),
  status text not null default 'provisional' check (status in ('provisional', 'final')),
  calculation_version text not null default 'unconfirmed'
    check (btrim(calculation_version) <> ''),
  calculated_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (id, club_id),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade,
  foreign key (flight_id, club_id) references public.flights (id, club_id) on delete set null
);

create unique index round_results_current
  on public.round_results (round_id, player_id) where superseded_at is null;

create table public.round_publications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  round_id uuid not null,
  version integer not null check (version > 0),
  state text not null check (state in ('provisional', 'final')),
  snapshot jsonb not null,
  published_by uuid references auth.users (id) on delete set null default auth.uid(),
  published_at timestamptz not null default now(),
  note text,
  unique (id, club_id),
  unique (round_id, version),
  foreign key (round_id, club_id) references public.competition_rounds (id, club_id) on delete cascade
);

-- Audit -----------------------------------------------------------------------------------------
-- Append-only by grant: no client role may insert, update or delete. The workflow functions write
-- the rows. `round_id` deliberately has no foreign key so the audit survives a round deletion.

create table public.scoring_audit (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  round_id uuid,
  entity text not null check (btrim(entity) <> ''),
  entity_id uuid,
  action text not null check (btrim(action) <> ''),
  actor_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  reason text,
  before jsonb,
  after jsonb,
  unique (id, club_id)
);

create index scoring_audit_round on public.scoring_audit (round_id, at desc);
create index scoring_audit_club on public.scoring_audit (club_id, at desc);

-- Groups: round-aware without breaking the current draw save --------------------------------------
-- The live project has no group rows, but the backfill is written to be safe if it does.

alter table public.groups add column round_id uuid;

insert into public.competition_rounds
  (club_id, tournament_id, day_number, play_date, hole_count, status, allowance, handicap_rounding)
select t.club_id, t.id, 1, t.play_date, c.holes, 'draft', t.allowance, 'whs'
from public.tournaments t
join public.courses c on c.id = t.course_id and c.club_id = t.club_id
on conflict do nothing;

update public.groups g
set round_id = r.id
from public.competition_rounds r
where r.tournament_id = g.tournament_id
  and r.club_id = g.club_id
  and r.day_number = (
    select min(r2.day_number)
    from public.competition_rounds r2
    where r2.tournament_id = g.tournament_id and r2.club_id = g.club_id
  )
  and g.round_id is null;

alter table public.groups
  add constraint groups_round_fk foreign key (round_id, club_id)
  references public.competition_rounds (id, club_id) on delete cascade;

alter table public.groups alter column round_id set not null;

create index groups_round on public.groups (round_id, number);

-- Set up triggers ---------------------------------------------------------------------------------

create or replace function public.assert_round_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_tournament uuid;
  v_reg_tournament uuid;
  v_flight_ok boolean;
begin
  select r.tournament_id into v_round_tournament
  from public.competition_rounds r
  where r.id = new.round_id and r.club_id = new.club_id;

  select r.tournament_id into v_reg_tournament
  from public.registrations r
  where r.id = new.registration_id and r.club_id = new.club_id;

  if v_round_tournament is null or v_reg_tournament is null
     or v_round_tournament <> v_reg_tournament then
    raise exception 'The registration and the round belong to different tournaments'
      using errcode = '23503';
  end if;

  if new.flight_id is not null then
    select exists (
      select 1
      from public.flights f
      join public.categories c on c.id = f.category_id and c.club_id = f.club_id
      where f.id = new.flight_id and f.club_id = new.club_id
        and c.tournament_id = v_round_tournament
    ) into v_flight_ok;
    if not v_flight_ok then
      raise exception 'The flight does not belong to this tournament' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.assert_round_entry() from public, anon, authenticated;

create trigger round_entries_assert
  before insert or update on public.round_entries
  for each row execute function public.assert_round_entry();

create or replace function public.assert_scorer_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_ok boolean;
  v_scorer_ok boolean;
begin
  -- A status-only update does not change who the participants are, and must not be blocked
  -- because one of them was withdrawn after the card was submitted.
  if tg_op = 'UPDATE'
     and new.round_id is not distinct from old.round_id
     and new.player_id is not distinct from old.player_id
     and new.scorer_id is not distinct from old.scorer_id then
    return new;
  end if;

  if new.player_id = new.scorer_id then
    raise exception 'A player cannot mark their own card' using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.round_entries re
    join public.registrations r on r.id = re.registration_id and r.club_id = re.club_id
    where re.round_id = new.round_id and re.club_id = new.club_id
      and re.status = 'active' and r.player_id = new.player_id
  ) into v_player_ok;

  select exists (
    select 1
    from public.round_entries re
    join public.registrations r on r.id = re.registration_id and r.club_id = re.club_id
    where re.round_id = new.round_id and re.club_id = new.club_id
      and re.status = 'active' and r.player_id = new.scorer_id
  ) into v_scorer_ok;

  if not v_player_ok or not v_scorer_ok then
    raise exception 'Both the player and the scorer must be active in this round'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_scorer_participants() from public, anon, authenticated;

create trigger scorer_assignments_assert
  before insert or update on public.scorer_assignments
  for each row execute function public.assert_scorer_participants();

create or replace function public.stamp_scorer_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_by := coalesce((select auth.uid()), new.assigned_by);
    new.assigned_at := now();
  else
    new.assigned_by := old.assigned_by;
    new.assigned_at := old.assigned_at;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_scorer_assignment()
  from public, anon, authenticated;

create trigger scorer_assignments_stamp
  before insert or update on public.scorer_assignments
  for each row execute function public.stamp_scorer_assignment();

create trigger scorecards_assert
  before insert or update on public.scorecards
  for each row execute function public.assert_scorer_participants();

create or replace function public.set_group_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round uuid;
begin
  if new.round_id is not null then
    return new;
  end if;

  select r.id into v_round
  from public.competition_rounds r
  where r.tournament_id = new.tournament_id and r.club_id = new.club_id
  order by r.day_number
  limit 1;

  if v_round is null then
    insert into public.competition_rounds
      (club_id, tournament_id, day_number, play_date, hole_count, status, allowance, handicap_rounding)
    select t.club_id, t.id, 1, t.play_date, c.holes, 'draft', t.allowance, 'whs'
    from public.tournaments t
    join public.courses c on c.id = t.course_id and c.club_id = t.club_id
    where t.id = new.tournament_id and t.club_id = new.club_id
    on conflict do nothing
    returning id into v_round;
  end if;

  if v_round is null then
    select r.id into v_round
    from public.competition_rounds r
    where r.tournament_id = new.tournament_id and r.club_id = new.club_id
    order by r.day_number
    limit 1;
  end if;

  if v_round is null then
    raise exception 'No scoring round exists for tournament %', new.tournament_id
      using errcode = '23503';
  end if;

  new.round_id := v_round;
  return new;
end;
$$;

revoke all on function public.set_group_round() from public, anon, authenticated;

create trigger groups_set_round
  before insert or update of tournament_id, round_id on public.groups
  for each row execute function public.set_group_round();

create or replace function public.competition_round_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The scoring rules are frozen once scoring starts. Finalization settings may still be added.
  if old.status not in ('draft', 'open') then
    if new.allowance is distinct from old.allowance
       or new.handicap_rounding is distinct from old.handicap_rounding
       or new.stroke_min is distinct from old.stroke_min
       or new.stroke_max is distinct from old.stroke_max
       or new.required_cards is distinct from old.required_cards
       or new.allow_provisional_single_card is distinct from old.allow_provisional_single_card
       or new.min_ocr_confidence is distinct from old.min_ocr_confidence
       or new.rules_version is distinct from old.rules_version then
      raise exception 'Scoring settings are frozen once scoring starts' using errcode = '23514';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'open')
      or (old.status = 'open' and new.status = 'scoring')
      or (old.status = 'scoring' and new.status in ('provisional', 'final'))
      or (old.status = 'provisional' and new.status = 'final')
    ) then
      raise exception 'A round cannot move from % to %', old.status, new.status
        using errcode = '23514';
    end if;

    if new.status = 'provisional' and not exists (
      select 1 from public.round_publications rp
      where rp.round_id = new.id and rp.state = 'provisional'
    ) then
      raise exception 'A provisional round needs a provisional publication'
        using errcode = '23514';
    end if;

    if new.status = 'final' and not exists (
      select 1 from public.round_publications rp
      where rp.round_id = new.id and rp.state = 'final'
    ) then
      raise exception 'A final round needs a final publication' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.competition_round_status_guard()
  from public, anon, authenticated;

create trigger competition_rounds_status_guard
  before update on public.competition_rounds
  for each row execute function public.competition_round_status_guard();

create or replace function public.handicap_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.competition_rounds r
    where r.id = old.round_id and r.club_id = old.club_id
      and r.status not in ('draft', 'open')
  ) then
    raise exception 'A handicap snapshot is frozen once scoring starts'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.handicap_snapshot_guard() from public, anon, authenticated;

create trigger handicap_snapshots_guard
  before update or delete on public.handicap_snapshots
  for each row execute function public.handicap_snapshot_guard();

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

  if new.strokes is not null and (new.strokes < v_min or new.strokes > v_max) then
    raise exception 'Hole % score is outside the round limits (% to %)',
      new.hole_number, v_min, v_max using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_scorecard_entry() from public, anon, authenticated;

create trigger scorecard_entries_check
  before insert or update on public.scorecard_entries
  for each row execute function public.check_scorecard_entry();

create or replace function public.stamp_entry_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.manually_confirmed then
    new.confirmed_by := coalesce((select auth.uid()), new.confirmed_by);
    new.confirmed_at := now();
  else
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_entry_confirmation() from public, anon, authenticated;

create trigger scorecard_entries_confirm
  before insert or update on public.scorecard_entries
  for each row execute function public.stamp_entry_confirmation();

create or replace function public.check_canonical_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Superseding historical rows is allowed even when the resolution they named has since been
  -- replaced. No score field may change in that update.
  if tg_op = 'UPDATE'
     and old.superseded_at is null and new.superseded_at is not null
     and (new.id, new.round_id, new.player_id, new.hole_number, new.strokes, new.verification,
          new.provenance, new.source_card_ids, new.resolution_id, new.approved_by, new.approved_at)
         is not distinct from
         (old.id, old.round_id, old.player_id, old.hole_number, old.strokes, old.verification,
          old.provenance, old.source_card_ids, old.resolution_id, old.approved_by, old.approved_at)
  then
    return new;
  end if;

  if new.provenance = 'desk_resolution' then
    if new.resolution_id is null then
      raise exception 'A desk-resolved hole needs its resolution record' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.hole_resolutions r
      where r.id = new.resolution_id and r.club_id = new.club_id
        and r.round_id = new.round_id and r.player_id = new.player_id
        and r.hole_number = new.hole_number and r.superseded_at is null
    ) then
      raise exception 'The resolution does not match this round, player and hole'
        using errcode = '23503';
    end if;
  elsif new.resolution_id is not null then
    raise exception 'Only a desk-resolved hole may name a resolution' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_canonical_score() from public, anon, authenticated;

create trigger approved_hole_scores_check
  before insert or update on public.approved_hole_scores
  for each row execute function public.check_canonical_score();

create or replace function public.round_publications_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Published round snapshots are immutable' using errcode = '23514';
end;
$$;

revoke all on function public.round_publications_immutable() from public, anon, authenticated;

create trigger round_publications_immutable
  before update or delete on public.round_publications
  for each row execute function public.round_publications_immutable();

-- Row-level security ------------------------------------------------------------------------------
-- Setup tables are writable by the staff roles named here. Every evidence table is read-only to
-- clients; the workflow functions (security definer) are the only writers.

alter table public.tie_break_policies enable row level security;
alter table public.competition_rounds enable row level security;
alter table public.round_entries enable row level security;
alter table public.scorer_rotation_policies enable row level security;
alter table public.scorer_assignments enable row level security;
alter table public.handicap_snapshots enable row level security;
alter table public.scorecards enable row level security;
alter table public.scorecard_images enable row level security;
alter table public.scorecard_extractions enable row level security;
alter table public.scorecard_entries enable row level security;
alter table public.hole_resolutions enable row level security;
alter table public.approved_hole_scores enable row level security;
alter table public.round_results enable row level security;
alter table public.round_publications enable row level security;
alter table public.scoring_audit enable row level security;

create policy tie_break_policies_member_read on public.tie_break_policies
  for select to authenticated using (public.is_club_member(club_id));
create policy tie_break_policies_manager_write on public.tie_break_policies
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

create policy competition_rounds_member_read on public.competition_rounds
  for select to authenticated using (public.is_club_member(club_id));
create policy competition_rounds_manager_write on public.competition_rounds
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

create policy round_entries_member_read on public.round_entries
  for select to authenticated using (public.is_club_member(club_id));
create policy round_entries_staff_write on public.round_entries
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer', 'desk']))
  with check (public.has_club_role(club_id, array['owner', 'organizer', 'desk']));

create policy scorer_rotation_policies_member_read on public.scorer_rotation_policies
  for select to authenticated using (public.is_club_member(club_id));
create policy scorer_rotation_policies_manager_write on public.scorer_rotation_policies
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

create policy scorer_assignments_member_read on public.scorer_assignments
  for select to authenticated using (public.is_club_member(club_id));
create policy scorer_assignments_staff_write on public.scorer_assignments
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer', 'desk']))
  with check (public.has_club_role(club_id, array['owner', 'organizer', 'desk']));

create policy handicap_snapshots_member_read on public.handicap_snapshots
  for select to authenticated using (public.is_club_member(club_id));

create policy scorecards_member_read on public.scorecards
  for select to authenticated using (public.is_club_member(club_id));

create policy scorecard_images_member_read on public.scorecard_images
  for select to authenticated using (public.is_club_member(club_id));

create policy scorecard_extractions_member_read on public.scorecard_extractions
  for select to authenticated using (public.is_club_member(club_id));

create policy scorecard_entries_member_read on public.scorecard_entries
  for select to authenticated using (public.is_club_member(club_id));

create policy hole_resolutions_member_read on public.hole_resolutions
  for select to authenticated using (public.is_club_member(club_id));

create policy approved_hole_scores_member_read on public.approved_hole_scores
  for select to authenticated using (public.is_club_member(club_id));

create policy round_results_member_read on public.round_results
  for select to authenticated using (public.is_club_member(club_id));

create policy round_publications_member_read on public.round_publications
  for select to authenticated using (public.is_club_member(club_id));

create policy scoring_audit_member_read on public.scoring_audit
  for select to authenticated using (public.is_club_member(club_id));

-- Private scorecard images ------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scorecard-images',
  'scorecard-images',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy scorecard_images_member_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'scorecard-images'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'scorecard-images'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  );

-- A note, not a claim: the SQL guards in this file are written for review. They are not tested
-- until the migration is applied to a disposable project and the checks in
-- docs/spec/SCORING_IMPLEMENTATION.md are run.
