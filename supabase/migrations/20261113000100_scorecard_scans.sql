-- Scorecard scans: the inbox for photographed cards that are not scorecards yet.
--
-- NOT APPLIED. Review before `supabase db push`.
--
-- Dependencies:
-- 1. 20261035000000_scoring_schema.sql, which creates public.competition_rounds,
--    public.scorecards, public.players, public.scoring_audit, public.is_club_member and the private
--    `scorecard-images` bucket. It is also not applied to the live project.
-- 2. 20261036000000_scoring_workflow.sql, which creates public.submit_scorecard. The desk creates
--    the card with that function and this file only links the card to the scan. It is also not
--    applied to the live project.
--
-- Why a separate table: a scan exists before any scorecard does, and public.scorecards.player_id
-- and scorer_id are not null. The system suggests a player (public.scorecard_scans.candidates) and
-- a person at the desk confirms one. Confirming is the approval step (owner decision D7,
-- 13 November 2026).
--
-- Additive only: no existing table, column, policy or function is changed. The image itself stays
-- in the existing private bucket; this file creates no bucket and changes no storage policy.

-- The inbox ---------------------------------------------------------------------------------------

create table public.scorecard_scans (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  round_id uuid not null,
  storage_path text not null,
  sha256 text not null,
  mime_type text not null,
  byte_size bigint not null,

  -- What the reader returned. Null until a reader is configured and has read the image.
  reader_engine text,
  reader_engine_version text,
  reader_name text,
  reader_written_total smallint,
  reader_holes jsonb,
  reader_raw jsonb,
  read_at timestamptz,

  -- What the matcher suggested: each {playerId, score, reasons}. A record, not a decision.
  candidates jsonb not null default '[]'::jsonb,

  state text not null default 'uploaded',

  -- What the desk decided.
  player_id uuid,
  marker_id uuid,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  scorecard_id uuid,
  set_aside_reason text,
  set_aside_by uuid references auth.users (id) on delete set null,
  set_aside_at timestamptz,

  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, club_id),
  -- The same image uploaded twice is one scan.
  unique (club_id, sha256),

  constraint scorecard_scans_storage_path check (
    btrim(storage_path) <> '' and storage_path like club_id::text || '/%'
  ),
  constraint scorecard_scans_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint scorecard_scans_mime check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  constraint scorecard_scans_byte_size check (byte_size > 0),
  constraint scorecard_scans_reader_total check (
    reader_written_total is null or reader_written_total > 0
  ),
  constraint scorecard_scans_reader_holes check (
    reader_holes is null or jsonb_typeof(reader_holes) = 'array'
  ),
  constraint scorecard_scans_candidates check (jsonb_typeof(candidates) = 'array'),
  constraint scorecard_scans_state check (
    state in ('uploaded', 'read', 'matched', 'confirmed', 'card_created', 'set_aside')
  ),
  -- A player cannot mark their own card. Both values are null before the desk decides.
  constraint scorecard_scans_not_own_marker check (
    player_id is null or marker_id is null or player_id <> marker_id
  ),
  -- Each state carries exactly the fields it means, so a half-finished transition cannot be stored.
  constraint scorecard_scans_state_fields check (
    case state
      when 'uploaded' then
        reader_engine is null
        and reader_engine_version is null
        and reader_name is null
        and reader_written_total is null
        and reader_holes is null
        and reader_raw is null
        and read_at is null
        and player_id is null
        and marker_id is null
        and confirmed_by is null
        and confirmed_at is null
        and scorecard_id is null
      when 'read' then
        (reader_name is not null or reader_holes is not null)
        and read_at is not null
        and player_id is null
        and marker_id is null
        and confirmed_by is null
        and confirmed_at is null
        and scorecard_id is null
      when 'matched' then
        player_id is not null
        and marker_id is null
        and confirmed_by is null
        and confirmed_at is null
        and scorecard_id is null
      when 'confirmed' then
        player_id is not null
        and marker_id is not null
        and confirmed_by is not null
        and confirmed_at is not null
        and scorecard_id is null
      when 'card_created' then
        player_id is not null
        and marker_id is not null
        and confirmed_by is not null
        and confirmed_at is not null
        and scorecard_id is not null
      when 'set_aside' then
        set_aside_reason is not null
        and length(btrim(set_aside_reason)) >= 3
        and set_aside_by is not null
        and set_aside_at is not null
        and scorecard_id is null
      else false
    end
  ),

  foreign key (round_id, club_id)
    references public.competition_rounds (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id),
  foreign key (marker_id, club_id) references public.players (id, club_id),
  -- club_id is not nullable, so the column list is explicit. Deleting a card keeps the scan and
  -- only clears the link.
  foreign key (scorecard_id, club_id)
    references public.scorecards (id, club_id) on delete set null (scorecard_id)
);

create index scorecard_scans_round_state on public.scorecard_scans (round_id, state);
create index scorecard_scans_club_created on public.scorecard_scans (club_id, created_at);

-- Row-level security ------------------------------------------------------------------------------
-- Read only to members, like public.scorecards. Every write goes through the functions below, so
-- there is no insert, update or delete policy.

alter table public.scorecard_scans enable row level security;

create policy scorecard_scans_member_read on public.scorecard_scans
  for select to authenticated using (public.is_club_member(club_id));

-- Create a scan -----------------------------------------------------------------------------------
-- Idempotent on (club_id, sha256). The same image uploaded twice returns the existing scan and
-- changes nothing, including the audit trail.

create or replace function public.create_scorecard_scan(
  p_round uuid,
  p_storage_path text,
  p_sha256 text,
  p_mime text,
  p_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_sha text;
  v_existing uuid;
  v_id uuid;
begin
  select r.club_id into v_club
  from public.competition_rounds r
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can add a scan'
      using errcode = '42501';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = ''
     or p_storage_path not like v_club::text || '/%' then
    raise exception 'The storage path must be inside the club folder' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'The image hash must be 64 hexadecimal characters' using errcode = '22023';
  end if;
  if p_mime is null
     or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'The image must be a JPEG, PNG, WebP or PDF' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'The image size must be above 0' using errcode = '22023';
  end if;

  v_sha := lower(p_sha256);

  select s.id into v_existing
  from public.scorecard_scans s
  where s.club_id = v_club and s.sha256 = v_sha;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.scorecard_scans
    (club_id, round_id, storage_path, sha256, mime_type, byte_size, created_by)
  values
    (v_club, p_round, p_storage_path, v_sha, p_mime, p_bytes, (select auth.uid()))
  on conflict (club_id, sha256) do nothing
  returning id into v_id;

  if v_id is null then
    select s.id into v_id
    from public.scorecard_scans s
    where s.club_id = v_club and s.sha256 = v_sha;
    return v_id;
  end if;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, p_round, 'scorecard_scan', v_id, 'created', (select auth.uid()),
     jsonb_build_object('sha256', v_sha, 'state', 'uploaded'));

  return v_id;
end;
$$;

revoke all on function public.create_scorecard_scan(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.create_scorecard_scan(uuid, text, text, text, bigint)
  to authenticated;

-- Record what the reader returned -----------------------------------------------------------------
-- A second call replaces the reading and the candidates. The scan stays in the inbox.

create or replace function public.record_scan_reading(
  p_scan uuid,
  p_engine text,
  p_engine_version text,
  p_name text,
  p_written_total smallint,
  p_holes jsonb,
  p_raw jsonb,
  p_candidates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_state text;
begin
  select s.club_id, s.round_id, s.state
    into v_club, v_round, v_state
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can record a reading'
      using errcode = '42501';
  end if;
  if v_state not in ('uploaded', 'read') then
    raise exception 'Only an uploaded or read scan can take a reading' using errcode = '23514';
  end if;
  if (p_name is null or btrim(p_name) = '') and p_holes is null then
    raise exception 'A reading needs the name or the holes that were read'
      using errcode = '22023';
  end if;
  if p_holes is not null and jsonb_typeof(p_holes) <> 'array' then
    raise exception 'The holes read must be a JSON array' using errcode = '22023';
  end if;
  if p_candidates is not null and jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'The candidates must be a JSON array' using errcode = '22023';
  end if;
  if p_written_total is not null and p_written_total <= 0 then
    raise exception 'The written total must be above 0' using errcode = '22023';
  end if;

  update public.scorecard_scans
  set reader_engine = nullif(btrim(p_engine), ''),
      reader_engine_version = nullif(btrim(p_engine_version), ''),
      reader_name = nullif(btrim(p_name), ''),
      reader_written_total = p_written_total,
      reader_holes = p_holes,
      reader_raw = p_raw,
      read_at = now(),
      candidates = coalesce(p_candidates, '[]'::jsonb),
      state = 'read',
      updated_at = now()
  where id = p_scan;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'reading_recorded', (select auth.uid()),
     jsonb_build_object(
       'state', 'read',
       'engine', nullif(btrim(p_engine), ''),
       'name', nullif(btrim(p_name), ''),
       'writtenTotal', p_written_total
     ));
end;
$$;

revoke all on function public.record_scan_reading(
  uuid, text, text, text, smallint, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.record_scan_reading(
  uuid, text, text, text, smallint, jsonb, jsonb, jsonb
) to authenticated;

-- Match a scan to a player ------------------------------------------------------------------------
-- The desk suggests or changes the player. A null player clears the suggestion. Changing the player
-- on a confirmed scan reopens the decision.

create or replace function public.match_scorecard_scan(
  p_scan uuid,
  p_player uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_state text;
  v_player uuid;
begin
  select s.club_id, s.round_id, s.state
    into v_club, v_round, v_state
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can match a scan'
      using errcode = '42501';
  end if;
  if v_state not in ('read', 'matched', 'confirmed') then
    raise exception 'Only a read, matched or confirmed scan can be matched' using errcode = '23514';
  end if;

  if p_player is not null then
    select p.id into v_player
    from public.players p
    where p.id = p_player and p.club_id = v_club;

    if v_player is null then
      raise exception 'The player does not belong to this club' using errcode = '22023';
    end if;

    update public.scorecard_scans
    set player_id = v_player,
        marker_id = null,
        confirmed_by = null,
        confirmed_at = null,
        state = 'matched',
        updated_at = now()
    where id = p_scan;
  else
    update public.scorecard_scans
    set player_id = null,
        marker_id = null,
        confirmed_by = null,
        confirmed_at = null,
        state = 'read',
        updated_at = now()
    where id = p_scan;
  end if;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'matched', (select auth.uid()),
     jsonb_build_object('state', case when v_player is null then 'read' else 'matched' end,
                        'playerId', v_player));
end;
$$;

revoke all on function public.match_scorecard_scan(uuid, uuid) from public, anon;
grant execute on function public.match_scorecard_scan(uuid, uuid) to authenticated;

-- Confirm the player and the marker ----------------------------------------------------------------
-- Confirming is the approval step (D7). The desk picks the marker, by D6 a player from the other
-- team in the group; a player cannot mark their own card.

create or replace function public.confirm_scorecard_scan(
  p_scan uuid,
  p_marker uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_state text;
  v_player uuid;
  v_marker uuid;
begin
  select s.club_id, s.round_id, s.state, s.player_id
    into v_club, v_round, v_state, v_player
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can confirm a scan'
      using errcode = '42501';
  end if;
  if v_state <> 'matched' then
    raise exception 'Only a matched scan can be confirmed' using errcode = '23514';
  end if;
  if p_marker is null then
    raise exception 'A confirmed scan needs a marker' using errcode = '22023';
  end if;

  select p.id into v_marker
  from public.players p
  where p.id = p_marker and p.club_id = v_club;

  if v_marker is null then
    raise exception 'The marker does not belong to this club' using errcode = '22023';
  end if;
  if v_marker = v_player then
    raise exception 'A player cannot mark their own card' using errcode = '23514';
  end if;

  update public.scorecard_scans
  set marker_id = v_marker,
      confirmed_by = (select auth.uid()),
      confirmed_at = now(),
      state = 'confirmed',
      updated_at = now()
  where id = p_scan;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'confirmed', (select auth.uid()),
     jsonb_build_object('state', 'confirmed', 'playerId', v_player, 'markerId', v_marker));
end;
$$;

revoke all on function public.confirm_scorecard_scan(uuid, uuid) from public, anon;
grant execute on function public.confirm_scorecard_scan(uuid, uuid) to authenticated;

-- Set a scan aside ---------------------------------------------------------------------------------
-- A scan can wait for a person and can be set aside at any point before a card exists. A scan whose
-- card exists is final for this inbox.

create or replace function public.set_aside_scorecard_scan(
  p_scan uuid,
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
  v_state text;
begin
  select s.club_id, s.round_id, s.state
    into v_club, v_round, v_state
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can set a scan aside'
      using errcode = '42501';
  end if;
  if v_state not in ('uploaded', 'read', 'matched', 'confirmed') then
    raise exception 'A scan without a card cannot be set aside' using errcode = '23514';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Setting a scan aside needs a reason' using errcode = '22023';
  end if;

  update public.scorecard_scans
  set set_aside_reason = btrim(p_reason),
      set_aside_by = (select auth.uid()),
      set_aside_at = now(),
      state = 'set_aside',
      updated_at = now()
  where id = p_scan;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'set_aside', (select auth.uid()),
     btrim(p_reason), jsonb_build_object('state', v_state),
     jsonb_build_object('state', 'set_aside'));
end;
$$;

revoke all on function public.set_aside_scorecard_scan(uuid, text) from public, anon;
grant execute on function public.set_aside_scorecard_scan(uuid, text) to authenticated;

-- Put a set-aside scan back ------------------------------------------------------------------------
-- Back to read when a reading exists, otherwise back to uploaded. The decision is cleared, because
-- a set-aside scan may have been matched or confirmed before it was set aside.

create or replace function public.restore_scorecard_scan(p_scan uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_state text;
  v_next text;
begin
  select s.club_id, s.round_id, s.state
    into v_club, v_round, v_state
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can restore a scan'
      using errcode = '42501';
  end if;
  if v_state <> 'set_aside' then
    raise exception 'Only a set-aside scan can be restored' using errcode = '23514';
  end if;

  update public.scorecard_scans
  set state = case
        when reader_name is not null or reader_holes is not null then 'read'
        else 'uploaded'
      end,
      player_id = null,
      marker_id = null,
      confirmed_by = null,
      confirmed_at = null,
      set_aside_reason = null,
      set_aside_by = null,
      set_aside_at = null,
      updated_at = now()
  where id = p_scan
  returning state into v_next;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'restored', (select auth.uid()),
     jsonb_build_object('state', v_next));
end;
$$;

revoke all on function public.restore_scorecard_scan(uuid) from public, anon;
grant execute on function public.restore_scorecard_scan(uuid) to authenticated;

-- Link the card the desk created -------------------------------------------------------------------
-- The card is created by public.submit_scorecard, not here. This function only checks that the card
-- is the right one and then records the link. card_created is final.

create or replace function public.attach_scan_card(
  p_scan uuid,
  p_card uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_state text;
  v_player uuid;
  v_card_player uuid;
begin
  select s.club_id, s.round_id, s.state, s.player_id
    into v_club, v_round, v_state, v_player
    from public.scorecard_scans s
   where s.id = p_scan
   for update;

  if v_club is null then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only the owner, an organizer or the desk can attach a card'
      using errcode = '42501';
  end if;
  if v_state <> 'confirmed' then
    raise exception 'Only a confirmed scan can take a card' using errcode = '23514';
  end if;
  if p_card is null then
    raise exception 'A card is required' using errcode = '22023';
  end if;

  select s.player_id into v_card_player
  from public.scorecards s
  where s.id = p_card and s.club_id = v_club and s.round_id = v_round;

  if v_card_player is null then
    raise exception 'The card is not in this round' using errcode = '22023';
  end if;
  if v_card_player <> v_player then
    raise exception 'The card belongs to another player' using errcode = '23514';
  end if;

  update public.scorecard_scans
  set scorecard_id = p_card,
      state = 'card_created',
      updated_at = now()
  where id = p_scan;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'scorecard_scan', p_scan, 'card_attached', (select auth.uid()),
     jsonb_build_object('state', 'card_created', 'playerId', v_player, 'scorecardId', p_card));
end;
$$;

revoke all on function public.attach_scan_card(uuid, uuid) from public, anon;
grant execute on function public.attach_scan_card(uuid, uuid) to authenticated;

-- Checks to run once applied to a disposable project -----------------------------------------------
--
-- 1. create_scorecard_scan called twice with the same round, path, hash, mime type and size returns
--    the same id and leaves one row in public.scorecard_scans.
-- 2. confirm_scorecard_scan with the scan's own player as the marker is refused (23514).
-- 3. confirm_scorecard_scan on an uploaded or matched scan is refused (23514); only a matched scan
--    can be confirmed.
-- 4. attach_scan_card with a card whose player is not the scan's player is refused (23514), and
--    attach_scan_card on a scan that is not confirmed is refused.
-- 5. A member who is not the owner, an organizer or the desk cannot call any of the seven
--    functions (42501).
