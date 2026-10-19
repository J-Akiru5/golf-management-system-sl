-- Verified course maps: a versioned map with recorded confirmations and an explicit publish step.
--
-- NOT APPLIED. The owner applies migrations to the live project; this file is the proposal, so the
-- design can be read and argued with before anything exists in the database.
--
-- Why a new layer rather than a change to `courses`/`tees`/`holes`: those tables hold the official
-- numbers the draw, the handicaps and the printed sheets depend on, and `tournaments.course_data_confirmed`
-- already records that an owner/organizer checked them against the club scorecard. This migration adds
-- the missing half — *where each hole is on the map* — without touching the numbers or that flag.
--
-- Two confirmations, kept apart on purpose:
--   * `tournaments.course_data_confirmed` (existing) vouches for par, stroke index, rating and slope;
--   * a map version here is confirmed by Sir Philip (technical: numbering and hole positions) and
--     validated by Ma'am Mary Ann (validation), then published by an owner or organizer.
-- Neither implies the other. Publishing a map does not change course numbers; confirming numbers does
-- not publish a map.
--
-- The safeguards asked for in the brief, and where they live:
--   * drafts cannot replace the official map: the app reads only `published` rows, and a unique index
--     allows one published map per course;
--   * only owner/organizer may write: `has_club_role(...)` in every function below;
--   * approvals are attached to a specific version: reviews carry `map_id`, and publish re-reads them;
--   * publication is explicit: `publish_course_map` is the only way a map becomes published;
--   * published versions are immutable: a trigger refuses edits to their holes, so a change means a
--     new version (`rejected`/`superseded` keep history distinguishable);
--   * an edit to a draft after a confirmation withdraws both confirmations (trigger below);
--   * no direct writes to these tables are granted, so the functions cannot be bypassed from the API;
--   * a failed call rolls back: each function is one transaction.

create table if not exists public.course_maps (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  course_id uuid not null,
  -- 1, 2, 3 … per course. A new number is a new proposal; an old one is never overwritten.
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_technical', 'awaiting_validation', 'approved', 'published', 'superseded', 'rejected'
  )),
  -- What changed in this version, in the organizer's words.
  note text,
  -- The picture this version refers to (a bundled path or a storage key). Null means the built-in
  -- illustration, which must never be described as the club's verified map.
  base_image text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  -- Set when a confirmation is recorded, cleared when the map changes afterwards.
  technical_confirmed_at timestamptz,
  validation_confirmed_at timestamptz,
  published_by uuid references auth.users (id),
  published_at timestamptz,
  unique (course_id, version),
  unique (id, club_id),
  foreign key (course_id, club_id) references public.courses (id, club_id) on delete cascade
);

-- One official map per course, enforced by the database rather than by convention.
create unique index if not exists course_maps_one_published
  on public.course_maps (course_id) where status = 'published';

create table if not exists public.course_map_holes (
  club_id uuid not null,
  map_id uuid not null,
  number smallint not null check (number > 0),
  -- Normalised 0..1 from the top-left of the base image. These are marker positions on a picture,
  -- not survey geometry, and null means "not placed yet".
  tee_x numeric(6, 5) check (tee_x between 0 and 1),
  tee_y numeric(6, 5) check (tee_y between 0 and 1),
  green_x numeric(6, 5) check (green_x between 0 and 1),
  green_y numeric(6, 5) check (green_y between 0 and 1),
  -- Direction of play, free text until the club settles a vocabulary ("north", "towards the road").
  direction text,
  -- Where the placement came from, so the app can say what it is standing on.
  source text not null default 'illustration' check (source in ('illustration', 'aerial', 'survey')),
  notes text,
  primary key (map_id, number),
  foreign key (map_id, club_id) references public.course_maps (id, club_id) on delete cascade
);

create table if not exists public.course_map_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  map_id uuid not null,
  kind text not null check (kind in ('technical', 'validation')),
  -- The reviewer may not have an account, so the name is stored; the account is kept when known.
  reviewer_name text not null check (length(btrim(reviewer_name)) between 2 and 120),
  reviewer_user uuid references auth.users (id),
  decision text not null check (decision in ('confirmed', 'changes_requested')),
  note text,
  created_at timestamptz not null default now(),
  foreign key (map_id, club_id) references public.course_maps (id, club_id) on delete cascade
);

create index if not exists course_map_reviews_by_map
  on public.course_map_reviews (map_id, kind, created_at desc);

alter table public.course_maps enable row level security;
alter table public.course_map_holes enable row level security;
alter table public.course_map_reviews enable row level security;

-- Members read their club's maps. Nobody writes through the API: the grants below leave SELECT only,
-- and the functions are the single write path.
create policy course_maps_member_read on public.course_maps
  for select to authenticated using (public.is_club_member(club_id));
create policy course_map_holes_member_read on public.course_map_holes
  for select to authenticated using (public.is_club_member(club_id));
create policy course_map_reviews_member_read on public.course_map_reviews
  for select to authenticated using (public.is_club_member(club_id));

revoke all on table public.course_maps, public.course_map_holes, public.course_map_reviews
  from anon, authenticated;
grant select on table public.course_maps, public.course_map_holes, public.course_map_reviews
  to authenticated;

-- A published or superseded map is history: its holes may not be edited. Editing a draft that was
-- already confirmed withdraws both confirmations, because the map is no longer the one that was
-- checked. This is the "approval does not carry over to later edits" rule made automatic.
create or replace function public.guard_course_map_holes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map uuid := coalesce(new.map_id, old.map_id);
  v_status text;
begin
  select status into v_status
    from public.course_maps
   where id = v_map
   for update;

  if v_status is null then
    raise exception 'Map not found' using errcode = 'P0002';
  end if;

  if v_status in ('published', 'superseded') then
    raise exception 'A published map is fixed. Create a new version instead.'
      using errcode = '22023';
  end if;

  if v_status in ('approved', 'awaiting_technical', 'awaiting_validation') then
    update public.course_maps
       set status = 'draft',
           technical_confirmed_at = null,
           validation_confirmed_at = null
     where id = v_map;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists course_map_holes_guard on public.course_map_holes;
create trigger course_map_holes_guard
  before insert or update or delete on public.course_map_holes
  for each row execute function public.guard_course_map_holes();

-- Create the next draft version of a course's map.
create or replace function public.create_course_map(p_course uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_version integer;
  v_id uuid;
begin
  select club_id into v_club from public.courses where id = p_course;
  if v_club is null then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer may prepare a course map' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.course_maps where course_id = p_course;

  insert into public.course_maps (club_id, course_id, version, note, created_by)
  values (v_club, p_course, v_version, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Replace a draft's hole placements in one transaction. Refused once the map is published.
create or replace function public.save_course_map_holes(p_map uuid, p_holes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_count integer;
begin
  select club_id, status into v_club, v_status
    from public.course_maps where id = p_map
   for update;

  if v_club is null then
    raise exception 'Map not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer may edit a course map' using errcode = '42501';
  end if;
  if v_status in ('published', 'superseded') then
    raise exception 'A published map is fixed. Create a new version instead.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_holes) <> 'array' then
    raise exception 'Holes must be a JSON array' using errcode = '22023';
  end if;

  delete from public.course_map_holes where map_id = p_map;

  begin
    insert into public.course_map_holes
      (club_id, map_id, number, tee_x, tee_y, green_x, green_y, direction, source, notes)
    select
      v_club,
      p_map,
      (h ->> 'number')::smallint,
      (h ->> 'teeX')::numeric(6, 5),
      (h ->> 'teeY')::numeric(6, 5),
      (h ->> 'greenX')::numeric(6, 5),
      (h ->> 'greenY')::numeric(6, 5),
      nullif(btrim(coalesce(h ->> 'direction', '')), ''),
      coalesce(nullif(h ->> 'source', ''), 'illustration'),
      nullif(btrim(coalesce(h ->> 'notes', '')), '')
    from jsonb_array_elements(p_holes) as h;
  exception
    when unique_violation then
      raise exception 'Each hole number may appear once' using errcode = '22023';
    when not_null_violation or invalid_text_representation or check_violation then
      raise exception 'Each hole needs a number; positions are 0..1 or null' using errcode = '22023';
  end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Record a confirmation or a change request, and move the map on by one step.
-- Technical: draft/awaiting_technical -> awaiting_validation. Validation: awaiting_validation -> approved.
-- A change request at the technical stage goes back to draft; at the validation stage the proposed
-- version is rejected, which keeps it distinguishable from a draft still being worked on. Either way
-- both confirmation stamps are cleared.
create or replace function public.record_course_map_review(
  p_map uuid,
  p_kind text,
  p_reviewer_name text,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_next text;
begin
  select club_id, status into v_club, v_status
    from public.course_maps where id = p_map
   for update;

  if v_club is null then
    raise exception 'Map not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer may record a review' using errcode = '42501';
  end if;
  if p_kind not in ('technical', 'validation') then
    raise exception 'Review kind must be technical or validation' using errcode = '22023';
  end if;
  if p_decision not in ('confirmed', 'changes_requested') then
    raise exception 'Decision must be confirmed or changes_requested' using errcode = '22023';
  end if;
  if v_status in ('published', 'superseded', 'rejected') then
    raise exception 'This version is closed. Create a new version instead.' using errcode = '22023';
  end if;

  insert into public.course_map_reviews (club_id, map_id, kind, reviewer_name, reviewer_user, decision, note)
  values (
    v_club,
    p_map,
    p_kind,
    btrim(p_reviewer_name),
    (select auth.uid()),
    p_decision,
    nullif(btrim(coalesce(p_note, '')), '')
  );

  if p_decision = 'changes_requested' then
    v_next := case when p_kind = 'validation' then 'rejected' else 'draft' end;
    update public.course_maps
       set status = v_next,
           technical_confirmed_at = null,
           validation_confirmed_at = null
     where id = p_map;
  elsif p_kind = 'technical' and v_status in ('draft', 'awaiting_technical') then
    v_next := 'awaiting_validation';
    update public.course_maps
       set status = v_next, technical_confirmed_at = now()
     where id = p_map;
  elsif p_kind = 'validation' and v_status = 'awaiting_validation' then
    v_next := 'approved';
    update public.course_maps
       set status = v_next, validation_confirmed_at = now()
     where id = p_map;
  else
    raise exception 'That confirmation does not fit the map''s current state (%)', v_status
      using errcode = '22023';
  end if;

  return v_next;
end;
$$;

-- Publish an approved map after both confirmations, superseding the course's previous one.
create or replace function public.publish_course_map(p_map uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_course uuid;
  v_status text;
  v_technical text;
  v_validation text;
begin
  select club_id, course_id, status into v_club, v_course, v_status
    from public.course_maps where id = p_map
   for update;

  if v_club is null then
    raise exception 'Map not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer may publish a course map' using errcode = '42501';
  end if;
  if v_status <> 'approved' then
    raise exception 'Only an approved map can be published (this one is %)', v_status
      using errcode = '22023';
  end if;

  -- The latest decision of each kind must still be a confirmation. A later change request wins.
  select decision into v_technical
    from public.course_map_reviews
   where map_id = p_map and kind = 'technical'
   order by created_at desc limit 1;
  select decision into v_validation
    from public.course_map_reviews
   where map_id = p_map and kind = 'validation'
   order by created_at desc limit 1;

  if v_technical is distinct from 'confirmed' then
    raise exception 'A map needs a technical confirmation before it can be published' using errcode = '22023';
  end if;
  if v_validation is distinct from 'confirmed' then
    raise exception 'A map needs a validation before it can be published' using errcode = '22023';
  end if;

  update public.course_maps
     set status = 'superseded'
   where course_id = v_course and status = 'published';

  update public.course_maps
     set status = 'published', published_at = now(), published_by = (select auth.uid())
   where id = p_map;

  return 'published';
end;
$$;

-- The functions above are the only write path. New functions are private by default in this schema
-- (20261031000000); these are for signed-in staff, and the body still checks the role.
grant execute on function public.create_course_map(uuid, text) to authenticated;
grant execute on function public.save_course_map_holes(uuid, jsonb) to authenticated;
grant execute on function public.record_course_map_review(uuid, text, text, text, text) to authenticated;
grant execute on function public.publish_course_map(uuid) to authenticated;

comment on table public.course_maps is
  'Versioned course map. The app reads only the published row; drafts, reviews and rejections keep their history.';
comment on table public.course_map_holes is
  'Marker positions for one map version, normalised 0..1 from the top-left of its picture. Not survey geometry.';
comment on table public.course_map_reviews is
  'Recorded confirmations and change requests per map version: technical (Sir Philip) and validation (Ma''am Mary Ann).';
