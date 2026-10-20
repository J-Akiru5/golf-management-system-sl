-- Player, tournament, registration and import model.
--
-- STATUS: written for review on 20 Oct 2026. NOT APPLIED to the production project.
-- Every statement is additive or a relaxation of a constraint; nothing is dropped or truncated.
-- The owner applies it with `supabase db push --linked` after reviewing this file and taking a
-- backup. The rollback plan is section 9 of docs/production-integrity-2026-10-20.md.
--
-- Why this migration exists
-- -------------------------
-- The current schema keeps a player as one row, a registration as one row, and the event's days as
-- a `date[]` on `tournaments`. That is enough to route a single-day demo, but not enough to import
-- the club's registration workbook or to assign a player to two of four playing days. It also has
-- no durable record of an import batch's individual row outcomes, and no audit log for privileged
-- writes.
--
-- This migration adds:
--   1. club-scoped player memberships (member / guest) separate from the canonical player row
--   2. explicit tournament days, with a rule for how many days a player must take
--   3. per-registration day selection, with tee-time assignment kept in separate columns
--   4. durable import batches and per-row outcomes for both registration and handicap imports
--   5. an append-only audit log stamped with the actor and, where applicable, the import batch
--   6. guarded, transactional functions for the import commit, day changes and day rules
--
-- It deliberately does not guess a membership for the players already in the directory. A player
-- with no active membership row is treated as a guest by the desk until someone records otherwise.

-- 1. Canonical player additions ----------------------------------------------------------------

alter table public.players
  add column if not exists whs_id text,
  add column if not exists updated_at timestamptz not null default now();

-- The domain has always allowed an incomplete profile: an imported guest may have a name and
-- nothing else. The routing engine marks that player `needs_review`; it never invents a birthdate
-- or a gender. The original NOT NULL constraints contradicted that contract, so they are relaxed
-- here. The public form still requires both, and the desk's new-player form still asks for them.
alter table public.players
  alter column birthdate drop not null,
  alter column gender drop not null;

create index if not exists players_club_name_lookup
  on public.players (club_id, lower(full_name));

create index if not exists players_club_email_lookup
  on public.players (club_id, lower(email))
  where email is not null;

create index if not exists players_club_phone_lookup
  on public.players (club_id, phone)
  where phone is not null;

create or replace function public.stamp_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_updated_at() from public;

drop trigger if exists players_stamp_updated_at on public.players;
create trigger players_stamp_updated_at
  before update on public.players
  for each row execute function public.stamp_updated_at();

-- 2. Club-scoped membership --------------------------------------------------------------------
-- A membership belongs to one club. The same person can be a member at IGCC and a guest elsewhere;
-- that is why the row is keyed by (club_id, player_id), not by the player alone.

create table if not exists public.player_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null,
  membership_type text not null check (membership_type in ('member', 'guest')),
  member_number text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  valid_from date,
  valid_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade
);

-- One active classification per player per club. History rows stay.
create unique index if not exists player_memberships_one_active
  on public.player_memberships (club_id, player_id)
  where status = 'active';

create unique index if not exists player_memberships_member_number
  on public.player_memberships (club_id, member_number)
  where member_number is not null;

create index if not exists player_memberships_player
  on public.player_memberships (club_id, player_id, status);

drop trigger if exists player_memberships_stamp_updated_at on public.player_memberships;
create trigger player_memberships_stamp_updated_at
  before update on public.player_memberships
  for each row execute function public.stamp_updated_at();

-- 3. Tournament days and the participation rule ------------------------------------------------
-- `tournaments.dates` stays as the quick list the Settings screen edits. This table is the stable
-- identity the registrations point at, so changing a date does not rewrite a registration.

alter table public.tournaments
  add column if not exists required_days smallint,
  add column if not exists max_days smallint;

alter table public.tournaments
  drop constraint if exists tournaments_day_rule_check;

alter table public.tournaments
  add constraint tournaments_day_rule_check check (
    (required_days is null or required_days between 1 and 14)
    and (max_days is null or max_days between 1 and 14)
    and (required_days is null or max_days is null or required_days <= max_days)
  );

create table if not exists public.tournament_days (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  -- Stable label and identity. The desk displays the date, not this number, when they disagree.
  day_number smallint not null check (day_number > 0),
  play_date date not null,
  label text not null,
  start_time time,
  notes text,
  is_playing_day boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id),
  -- Deferrable so a date reorder can swap two day numbers in one transaction.
  unique (tournament_id, day_number) deferrable initially deferred,
  unique (tournament_id, play_date),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade
);

create index if not exists tournament_days_event
  on public.tournament_days (tournament_id, play_date);

-- Backfill the event days that already exist. The label is the only thing invented, and it is
-- plainly "Day N"; the date, the start time and the playing state come from the event row.
insert into public.tournament_days (club_id, tournament_id, day_number, play_date, label, start_time, is_playing_day)
select
  t.club_id,
  t.id,
  d.ord::smallint,
  d.play_date,
  'Day ' || d.ord,
  case when d.ord = 1 then t.first_tee_time else null end,
  true
from public.tournaments t
cross join lateral unnest(coalesce(t.dates, array[t.play_date])) with ordinality as d(play_date, ord)
where not exists (
  select 1 from public.tournament_days td
  where td.tournament_id = t.id and td.play_date = d.play_date
);

-- Keep the day rows in step with the Settings date list. Removed dates are deactivated, never
-- deleted, because a registration may point at them.
create or replace function public.sync_tournament_days()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  v_offset constant integer := 1000;
begin
  if tg_op = 'UPDATE'
     and new.dates is not distinct from old.dates
     and new.play_date = old.play_date
     and new.first_tee_time = old.first_tee_time then
    return new;
  end if;

  -- Move every existing day out of the 1..n range first, so a reorder or a replacement cannot
  -- collide on the deferrable unique constraint.
  update public.tournament_days
     set day_number = day_number + v_offset
   where tournament_id = new.id;

  for rec in
    select d.play_date, d.ord
    from unnest(coalesce(new.dates, array[new.play_date])) with ordinality as d(play_date, ord)
  loop
    update public.tournament_days
       set day_number = rec.ord::smallint,
           play_date = rec.play_date,
           is_playing_day = true,
           label = case when label ~ '^Day [0-9]+$' then 'Day ' || rec.ord else label end,
           updated_at = now()
     where tournament_id = new.id and play_date = rec.play_date;

    if not found then
      insert into public.tournament_days
        (club_id, tournament_id, day_number, play_date, label, start_time, is_playing_day)
      values
        (new.club_id, new.id, rec.ord::smallint, rec.play_date, 'Day ' || rec.ord,
         case when rec.ord = 1 then new.first_tee_time else null end, true);
    end if;
  end loop;

  update public.tournament_days
     set is_playing_day = false,
         updated_at = now()
   where tournament_id = new.id
     and day_number > v_offset;

  -- Leftover inactive rows keep a unique, out-of-range number so they are never shown as a day.
  update public.tournament_days td
     set day_number = v_offset + x.rn
    from (
      select id, row_number() over (order by play_date) as rn
      from public.tournament_days
      where tournament_id = new.id and day_number > v_offset
    ) x
   where td.id = x.id;

  return new;
end;
$$;

revoke all on function public.sync_tournament_days() from public;

drop trigger if exists tournaments_sync_days on public.tournaments;
create trigger tournaments_sync_days
  after insert or update of dates, play_date, first_tee_time on public.tournaments
  for each row execute function public.sync_tournament_days();

-- 4. Registrations: event-specific facts -------------------------------------------------------

alter table public.registrations
  add column if not exists membership_type text,
  add column if not exists shirt_size text,
  add column if not exists payment_amount numeric(10, 2),
  add column if not exists payment_reference text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_note text,
  add column if not exists sponsor boolean,
  add column if not exists sponsor_details text,
  add column if not exists source text not null default 'desk',
  add column if not exists import_batch_id uuid;

alter table public.registrations
  drop constraint if exists registrations_membership_type_check;

alter table public.registrations
  add constraint registrations_membership_type_check
  check (membership_type is null or membership_type in ('member', 'guest'));

alter table public.registrations
  drop constraint if exists registrations_source_check;

alter table public.registrations
  add constraint registrations_source_check
  check (source in ('desk', 'public_form', 'import', 'demo'));

alter table public.registrations
  drop constraint if exists registrations_payment_amount_check;

alter table public.registrations
  add constraint registrations_payment_amount_check
  check (payment_amount is null or payment_amount >= 0);

-- Older code paths (and the public form) still write the role, shirt and sponsor into `answers`.
-- Keep the explicit columns in step without forcing every caller to know about them yet.
create or replace function public.sync_registration_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_type is null and new.answers ->> 'role' in ('member', 'guest') then
    new.membership_type := new.answers ->> 'role';
  end if;
  if new.shirt_size is null then
    new.shirt_size := nullif(btrim(coalesce(new.answers ->> 'shirt', '')), '');
  end if;
  if new.sponsor is null and jsonb_typeof(new.answers -> 'sponsor') = 'boolean' then
    new.sponsor := (new.answers -> 'sponsor')::boolean;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_registration_answers() from public;

drop trigger if exists registrations_sync_answers on public.registrations;
create trigger registrations_sync_answers
  before insert or update on public.registrations
  for each row execute function public.sync_registration_answers();

create index if not exists registrations_tournament_status
  on public.registrations (tournament_id, status);

create index if not exists registrations_club_created
  on public.registrations (club_id, created_at desc);

create index if not exists registrations_import_batch
  on public.registrations (import_batch_id)
  where import_batch_id is not null;

-- Backfill the event-specific values the old schema kept inside `answers`. Nothing is invented:
-- a missing role stays null, a missing shirt stays null.
update public.registrations
   set membership_type = case
         when answers ->> 'role' in ('member', 'guest') then answers ->> 'role'
         else null
       end,
       shirt_size = nullif(btrim(coalesce(answers ->> 'shirt', '')), ''),
       sponsor = case
         when jsonb_typeof(answers -> 'sponsor') = 'boolean' then (answers -> 'sponsor')::boolean
         else null
       end
 where membership_type is null
    or shirt_size is null
    or sponsor is null;

-- 5. Registration days -------------------------------------------------------------------------
-- Selection and assignment are separate facts in one row: `selected` is the player's event days,
-- `tee_time`/`start_hole` are the desk's confirmed assignment, and `tee_confirmed` says whether the
-- assignment is final. The player's requested time stays in `registrations.answers.teePreferences`.

create table if not exists public.registration_days (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  registration_id uuid not null,
  tournament_day_id uuid not null,
  selected boolean not null default true,
  tee_time time,
  start_hole smallint,
  tee_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, tournament_day_id),
  check (start_hole is null or start_hole between 1 and 36),
  check (not tee_confirmed or (tee_time is not null and start_hole is not null)),
  foreign key (registration_id, club_id) references public.registrations (id, club_id) on delete cascade,
  foreign key (tournament_day_id, club_id) references public.tournament_days (id, club_id) on delete restrict
);

create index if not exists registration_days_day
  on public.registration_days (tournament_day_id, selected);

create index if not exists registration_days_registration
  on public.registration_days (registration_id, selected);

-- Backfill from the old teePreferences object: a non-empty ISO date key means that day was picked.
insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
select r.club_id, r.id, d.id, true
from public.registrations r
join public.tournament_days d
  on d.tournament_id = r.tournament_id
 and d.club_id = r.club_id
 and d.is_playing_day
 and d.play_date::text in (
   select key from jsonb_each_text(coalesce(r.answers -> 'teePreferences', '{}'::jsonb))
   where btrim(value) <> ''
 )
on conflict (registration_id, tournament_day_id) do nothing;

create or replace function public.validate_registration_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration record;
  v_day record;
  v_holes smallint;
  v_first_tee time;
begin
  select r.id, r.club_id, r.tournament_id into v_registration
  from public.registrations r
  where r.id = new.registration_id;

  if not found then
    raise exception 'Registration % does not exist.', new.registration_id;
  end if;

  select d.id, d.club_id, d.tournament_id, d.is_playing_day, d.start_time into v_day
  from public.tournament_days d
  where d.id = new.tournament_day_id;

  if not found then
    raise exception 'Tournament day % does not exist.', new.tournament_day_id;
  end if;

  if v_day.club_id <> v_registration.club_id or v_day.tournament_id <> v_registration.tournament_id then
    raise exception 'That day belongs to a different tournament.';
  end if;

  if new.selected and not v_day.is_playing_day then
    raise exception 'That day is not a playing day for this event.';
  end if;

  select c.holes, t.first_tee_time into v_holes, v_first_tee
  from public.tournaments t
  join public.courses c on c.id = t.course_id and c.club_id = t.club_id
  where t.id = v_registration.tournament_id and t.club_id = v_registration.club_id;

  if new.start_hole is not null and (new.start_hole < 1 or new.start_hole > coalesce(v_holes, 18)) then
    raise exception 'Start hole % is outside this course''s % holes.', new.start_hole, coalesce(v_holes, 18);
  end if;

  if new.tee_time is not null
     and new.tee_time < coalesce(v_day.start_time, v_first_tee, '00:00'::time) then
    raise exception 'Tee time % is before the day start %.', new.tee_time,
      coalesce(v_day.start_time, v_first_tee, '00:00'::time);
  end if;

  new.club_id := v_registration.club_id;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_registration_day() from public;

drop trigger if exists registration_days_validate on public.registration_days;
create trigger registration_days_validate
  before insert or update on public.registration_days
  for each row execute function public.validate_registration_day();

-- The participation rule is checked at transaction end, so a batch of day rows can be written in
-- one go. It is a constraint trigger, not a UI check.
create or replace function public.check_registration_day_rule(p_registration uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required smallint;
  v_max smallint;
  v_count integer;
  v_bad integer;
begin
  select t.required_days, t.max_days into v_required, v_max
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_registration;

  if not found then
    return;
  end if;

  select count(*) into v_count
  from public.registration_days rd
  where rd.registration_id = p_registration and rd.selected;

  if v_required is not null and v_count <> v_required then
    raise exception 'This event requires exactly % playing day(s); % selected.', v_required, v_count;
  end if;

  if v_max is not null and v_count > v_max then
    raise exception 'This event allows at most % playing day(s); % selected.', v_max, v_count;
  end if;

  select count(*) into v_bad
  from public.registration_days rd
  join public.tournament_days d on d.id = rd.tournament_day_id
  where rd.registration_id = p_registration
    and rd.selected
    and not d.is_playing_day;

  if v_bad > 0 then
    raise exception 'A selected day is no longer a playing day for this event.';
  end if;
end;
$$;

revoke all on function public.check_registration_day_rule(uuid) from public;

create or replace function public.check_registration_day_rule_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'registrations' then
    perform public.check_registration_day_rule(new.id);
  elsif tg_op = 'DELETE' then
    perform public.check_registration_day_rule(old.registration_id);
  else
    perform public.check_registration_day_rule(new.registration_id);
  end if;
  return null;
end;
$$;

revoke all on function public.check_registration_day_rule_trigger() from public;

drop trigger if exists registration_days_rule on public.registration_days;
create constraint trigger registration_days_rule
  after insert or update or delete on public.registration_days
  deferrable initially deferred
  for each row execute function public.check_registration_day_rule_trigger();

drop trigger if exists registrations_day_rule on public.registrations;
create constraint trigger registrations_day_rule
  after insert or update on public.registrations
  deferrable initially deferred
  for each row execute function public.check_registration_day_rule_trigger();

-- A public entry carries its day choices as teePreferences keys. Fill the structured rows from
-- them when the caller did not write registration_days itself. This keeps the old entry form and
-- the new table in step without changing the public function's signature.
create or replace function public.attach_registration_days_from_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.registration_days where registration_id = new.id) then
    insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
    select new.club_id, new.id, d.id, true
    from public.tournament_days d
    where d.tournament_id = new.tournament_id
      and d.club_id = new.club_id
      and d.is_playing_day
      and d.play_date::text in (
        select key from jsonb_each_text(coalesce(new.answers -> 'teePreferences', '{}'::jsonb))
        where btrim(value) <> ''
      )
    on conflict (registration_id, tournament_day_id) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.attach_registration_days_from_preferences() from public;

drop trigger if exists registrations_attach_days on public.registrations;
create trigger registrations_attach_days
  after insert on public.registrations
  for each row execute function public.attach_registration_days_from_preferences();

-- 6. Import batches and row outcomes -----------------------------------------------------------

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid,
  kind text not null check (kind in ('registration', 'handicap')),
  file_name text not null,
  worksheet text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  mapping jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'committed', 'partial', 'failed')),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  rejected_count integer not null default 0,
  idempotency_key text not null,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  error text,
  unique (id, club_id),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade
);

create unique index if not exists import_batches_committed_key
  on public.import_batches (club_id, idempotency_key)
  where status in ('committed', 'partial');

create index if not exists import_batches_club_created
  on public.import_batches (club_id, created_at desc);

-- The registration points at the batch that produced it. Batches are never deleted from the desk,
-- so RESTRICT is the honest rule; a cleanup with the service role must decide what to do first.
alter table public.registrations
  drop constraint if exists registrations_import_batch_fk;

alter table public.registrations
  add constraint registrations_import_batch_fk
  foreign key (import_batch_id, club_id) references public.import_batches (id, club_id)
  on delete restrict;

create table if not exists public.import_rows (
  id bigint generated by default as identity primary key,
  batch_id uuid not null,
  club_id uuid not null,
  row_number integer not null,
  raw jsonb,
  normalized jsonb,
  action text not null check (action in ('insert', 'update', 'skip', 'reject')),
  status text not null check (status in ('committed', 'skipped', 'rejected')),
  error text,
  player_id uuid,
  registration_id uuid,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number),
  foreign key (batch_id, club_id) references public.import_batches (id, club_id) on delete cascade
);

create index if not exists import_rows_batch_status
  on public.import_rows (batch_id, status);

-- The old handicap batch table gets the same idempotency and outcome columns. Existing rows keep
-- their values; the new columns are nullable except the status default.
alter table public.handicap_import_batches
  add column if not exists file_sha256 text,
  add column if not exists worksheet text,
  add column if not exists status text not null default 'committed',
  add column if not exists rejected_count integer not null default 0,
  add column if not exists committed_at timestamptz,
  add column if not exists idempotency_key text;

create unique index if not exists handicap_import_batches_key
  on public.handicap_import_batches (club_id, idempotency_key)
  where idempotency_key is not null and status in ('committed', 'partial');

create table if not exists public.handicap_import_rows (
  id bigint generated by default as identity primary key,
  batch_id uuid not null references public.handicap_import_batches (id) on delete cascade,
  club_id uuid not null,
  row_number integer not null,
  player_id uuid,
  name text,
  handicap_index numeric(4, 1),
  effective_date date,
  status text not null check (status in ('inserted', 'updated', 'skipped', 'rejected')),
  error text,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

alter table public.handicap_import_rows enable row level security;

drop policy if exists handicap_import_rows_manager_read on public.handicap_import_rows;
create policy handicap_import_rows_manager_read on public.handicap_import_rows
  for select to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']));

-- 7. Audit log ---------------------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated by default as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  batch_id uuid,
  changed_columns text[],
  result text not null default 'ok' check (result in ('ok', 'refused', 'failed')),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_club_created
  on public.audit_log (club_id, created_at desc);

create index if not exists audit_log_batch
  on public.audit_log (batch_id)
  where batch_id is not null;

-- Append-only. Values are never copied into `detail`; only the names of changed columns.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_club uuid;
  v_entity_id text;
  v_batch uuid;
  v_changed text[];
begin
  v_club := coalesce((to_jsonb(new) ->> 'club_id')::uuid, (to_jsonb(old) ->> 'club_id')::uuid);
  v_entity_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  v_batch := nullif(current_setting('teeline.audit_batch', true), '')::uuid;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where to_jsonb(old) -> n.key is distinct from n.value;
  end if;

  insert into public.audit_log
    (club_id, actor_id, action, entity, entity_id, batch_id, changed_columns, result)
  values
    (v_club, v_actor, lower(tg_op), tg_table_name, v_entity_id, v_batch, v_changed, 'ok');

  return null;
end;
$$;

revoke all on function public.audit_row_change() from public;

-- 8. Row-level security ------------------------------------------------------------------------

alter table public.player_memberships enable row level security;
alter table public.tournament_days enable row level security;
alter table public.registration_days enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists player_memberships_read on public.player_memberships;
create policy player_memberships_read on public.player_memberships
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists player_memberships_manager_write on public.player_memberships;
create policy player_memberships_manager_write on public.player_memberships
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

drop policy if exists tournament_days_read on public.tournament_days;
create policy tournament_days_read on public.tournament_days
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists tournament_days_manager_write on public.tournament_days;
create policy tournament_days_manager_write on public.tournament_days
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

drop policy if exists registration_days_read on public.registration_days;
create policy registration_days_read on public.registration_days
  for select to authenticated using (public.is_club_member(club_id));

-- The desk may change a player's days. The trigger and the deferred rule check every write.
drop policy if exists registration_days_staff_write on public.registration_days;
create policy registration_days_staff_write on public.registration_days
  for all to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

drop policy if exists import_batches_manager_read on public.import_batches;
create policy import_batches_manager_read on public.import_batches
  for select to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']));

drop policy if exists import_rows_manager_read on public.import_rows;
create policy import_rows_manager_read on public.import_rows
  for select to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']));

drop policy if exists audit_log_manager_read on public.audit_log;
create policy audit_log_manager_read on public.audit_log
  for select to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']));

-- No insert/update/delete policies on batches, rows or the audit log: those writes happen only
-- inside the security-definer functions below.

-- 9. Guarded functions -------------------------------------------------------------------------

-- 9.1 Day rule. Owner/organizer only; changing it changes what every registration must satisfy.
create or replace function public.save_day_rule(
  p_tournament uuid,
  p_required smallint,
  p_max smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_days integer;
  v_bad integer;
begin
  select club_id, coalesce(cardinality(dates), 1) into v_club, v_days
  from public.tournaments
  where id = p_tournament;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change the playing-day rule.' using errcode = '42501';
  end if;

  if (p_required is not null and p_required < 1)
     or (p_max is not null and p_max < 1)
     or (p_required is not null and p_max is not null and p_required > p_max) then
    return jsonb_build_object('ok', false, 'message', 'The day rule is not valid.');
  end if;

  if p_max is not null and p_max > v_days then
    return jsonb_build_object('ok', false, 'message', 'The maximum cannot exceed the number of days in the event.');
  end if;

  if p_required is not null and p_required > v_days then
    return jsonb_build_object('ok', false, 'message', 'The required number cannot exceed the number of days in the event.');
  end if;

  -- Do not make the rule retroactively invalid for registrations already on file. The owner can
  -- fix those rows first and then save the rule.
  if p_required is not null then
    select count(*) into v_bad
    from public.registrations r
    where r.tournament_id = p_tournament
      and (
        select count(*) from public.registration_days rd
        where rd.registration_id = r.id and rd.selected
      ) <> p_required;

    if v_bad > 0 then
      return jsonb_build_object('ok', false,
        'message', format('%s registration(s) do not have exactly %s selected day(s). Fix them before setting the rule.', v_bad, p_required));
    end if;
  end if;

  update public.tournaments
     set required_days = p_required, max_days = p_max
   where id = p_tournament;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'day_rule', 'tournaments', p_tournament::text,
          jsonb_build_object('required', p_required, 'max', p_max));

  return jsonb_build_object('ok', true, 'required', p_required, 'max', p_max);
end;
$$;

revoke all on function public.save_day_rule(uuid, smallint, smallint) from public;
grant execute on function public.save_day_rule(uuid, smallint, smallint) to authenticated;

-- 9.2 Day selection. Accepts day numbers (1, 2, ...) and writes the complete set in one go.
create or replace function public.set_registration_days(
  p_registration uuid,
  p_days integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_tournament uuid;
  v_day integer;
  v_day_id uuid;
  v_selected integer := 0;
begin
  select club_id, tournament_id into v_club, v_tournament
  from public.registrations where id = p_registration;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That registration was not found.');
  end if;

  if not public.is_club_member(v_club) then
    raise exception 'You do not have access to this event.' using errcode = '42501';
  end if;

  foreach v_day in array coalesce(p_days, array[]::integer[]) loop
    select id into v_day_id
    from public.tournament_days
    where tournament_id = v_tournament and club_id = v_club
      and day_number = v_day and is_playing_day;

    if v_day_id is null then
      return jsonb_build_object('ok', false, 'message', format('Day %s is not a playing day for this event.', v_day));
    end if;

    insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
    values (v_club, p_registration, v_day_id, true)
    on conflict (registration_id, tournament_day_id)
    do update set selected = true, updated_at = now();
  end loop;

  update public.registration_days rd
     set selected = false, tee_time = null, start_hole = null, tee_confirmed = false, updated_at = now()
   where rd.registration_id = p_registration
     and rd.selected
     and not exists (
       select 1 from public.tournament_days d
       where d.id = rd.tournament_day_id
         and d.is_playing_day
         and d.day_number = any (coalesce(p_days, array[]::integer[]))
     );

  select count(*) into v_selected
  from public.registration_days rd
  where rd.registration_id = p_registration and rd.selected;

  perform public.check_registration_day_rule(p_registration);

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'set_days', 'registrations', p_registration::text,
          jsonb_build_object('days', coalesce(p_days, array[]::integer[]), 'selected', v_selected));

  return jsonb_build_object('ok', true, 'selected', v_selected);
end;
$$;

revoke all on function public.set_registration_days(uuid, integer[]) from public;
grant execute on function public.set_registration_days(uuid, integer[]) to authenticated;

-- 9.3 Assigned tee time for one day. Kept separate from the day selection above.
create or replace function public.assign_registration_day_tee(
  p_registration uuid,
  p_day integer,
  p_tee_time time,
  p_start_hole smallint,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_tournament uuid;
  v_day_id uuid;
begin
  select club_id, tournament_id into v_club, v_tournament
  from public.registrations where id = p_registration;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That registration was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to schedule this event.' using errcode = '42501';
  end if;

  select id into v_day_id
  from public.tournament_days
  where tournament_id = v_tournament and club_id = v_club
    and day_number = p_day and is_playing_day;

  if v_day_id is null then
    return jsonb_build_object('ok', false, 'message', 'That is not a playing day for this event.');
  end if;

  update public.registration_days
     set tee_time = p_tee_time,
         start_hole = p_start_hole,
         tee_confirmed = coalesce(p_confirmed, false),
         selected = true,
         updated_at = now()
   where registration_id = p_registration and tournament_day_id = v_day_id;

  if not found then
    -- The day was not selected. Select it and the assignment together, so a caller cannot end up
    -- with a tee time on a day the player is not playing.
    insert into public.registration_days
      (club_id, registration_id, tournament_day_id, selected, tee_time, start_hole, tee_confirmed)
    values
      (v_club, p_registration, v_day_id, true, p_tee_time, p_start_hole, coalesce(p_confirmed, false));
  end if;

  perform public.check_registration_day_rule(p_registration);

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'assign_tee', 'registrations', p_registration::text,
          jsonb_build_object('day', p_day, 'teeTime', p_tee_time, 'startHole', p_start_hole, 'confirmed', p_confirmed));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.assign_registration_day_tee(uuid, integer, time, smallint, boolean) from public;
grant execute on function public.assign_registration_day_tee(uuid, integer, time, smallint, boolean) to authenticated;

-- 9.4 Import commit helpers. Private by default; only the commit functions call them.
create or replace function public.import_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g');
$$;

revoke all on function public.import_name_key(text) from public;

create or replace function public.find_or_create_import_player(
  p_club uuid,
  p_name text,
  p_first text,
  p_last text,
  p_birthdate date,
  p_gender text,
  p_ngap text,
  p_phone text,
  p_email text,
  p_home_course text,
  p_whs text,
  p_link_player uuid,
  p_force_new boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer;
  v_parts text[];
begin
  -- An explicit operator choice wins, but only after checking the player is in this club. This is
  -- what makes "link to this candidate" mean the chosen person, not a re-match by name.
  if p_link_player is not null then
    select id into v_id
    from public.players
    where id = p_link_player and club_id = p_club;

    if v_id is null then
      return jsonb_build_object('ok', false, 'code', 'not_found',
        'message', 'The linked player is not in this club.');
    end if;
    return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
  end if;

  if p_ngap is not null and btrim(p_ngap) <> '' then
    select count(*) into v_count
    from public.players
    where club_id = p_club and ngap_id = btrim(p_ngap);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', format('NGAP ID %s matches more than one player.', p_ngap));
    end if;
    if v_count = 1 then
      select id into v_id
      from public.players
      where club_id = p_club and ngap_id = btrim(p_ngap)
      limit 1;
      return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
    end if;
  end if;

  if not coalesce(p_force_new, false) then
    select count(*) into v_count
    from public.players
    where club_id = p_club and public.import_name_key(full_name) = public.import_name_key(p_name);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', format('More than one player is named "%s". Add an NGAP ID.', p_name));
    end if;

    if v_count = 1 then
      select id into v_id
      from public.players
      where club_id = p_club and public.import_name_key(full_name) = public.import_name_key(p_name)
      limit 1;
      return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
    end if;
  end if;

  if p_gender is not null and p_gender not in ('M', 'F') then
    return jsonb_build_object('ok', false, 'code', 'invalid_gender',
      'message', 'The gender must be M, F or empty.');
  end if;

  v_parts := regexp_split_to_array(btrim(p_name), '\s+');

  insert into public.players
    (club_id, full_name, first_name, last_name, birthdate, gender, ngap_id, phone, email, home_course, whs_id)
  values
    (p_club,
     btrim(p_name),
     nullif(btrim(coalesce(p_first, '')), ''),
     nullif(btrim(coalesce(p_last, '')), ''),
     p_birthdate,
     p_gender,
     nullif(btrim(coalesce(p_ngap, '')), ''),
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_email, '')), ''),
     nullif(btrim(coalesce(p_home_course, '')), ''),
     nullif(btrim(coalesce(p_whs, '')), ''))
  returning id into v_id;

  -- The first/last columns are optional in the table; fill them when the caller did not.
  if p_first is null or btrim(p_first) = '' then
    update public.players
       set first_name = case
             when array_length(v_parts, 1) > 1
             then array_to_string(v_parts[1:array_length(v_parts, 1) - 1], ' ')
             else null
           end,
           last_name = case
             when array_length(v_parts, 1) > 1
             then v_parts[array_length(v_parts, 1)]
             else v_parts[1]
           end
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'playerId', v_id, 'created', true);
end;
$$;

revoke all on function public.find_or_create_import_player(uuid, text, text, text, date, text, text, text, text, text, text, uuid, boolean) from public;

-- 9.5 The registration import commit. One transaction, one batch, one outcome per row.
create or replace function public.commit_registration_import(
  p_tournament uuid,
  p_file_name text,
  p_worksheet text,
  p_file_sha256 text,
  p_storage_path text,
  p_mapping jsonb,
  p_rows jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_batch uuid;
  v_existing uuid;
  v_row jsonb;
  v_row_number integer;
  v_action text;
  v_player jsonb;
  v_player_id uuid;
  v_registration uuid;
  v_existing_registration uuid;
  v_day integer;
  v_day_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_total integer := 0;
  v_error text;
  v_cutoff date;
  v_index numeric(4, 1);
  v_payment_status text;
  v_reasons text[] := array['Imported from a registration workbook; the desk confirms it.'];
begin
  select club_id, cutoff_date into v_club, v_cutoff
  from public.tournaments where id = p_tournament;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end if;

  -- Serialise imports for the same event. Two operators pressing Commit at once must not race the
  -- same registration rows. The lock is released when the transaction ends.
  perform pg_advisory_xact_lock(hashtext(p_tournament::text));

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can import registrations.' using errcode = '42501';
  end if;

  if p_file_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'message', 'The file fingerprint is not valid.');
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    return jsonb_build_object('ok', false, 'message', 'The idempotency key is missing.');
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'The import rows are not an array.');
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    return jsonb_build_object('ok', false, 'message', 'This file has more than 5,000 rows. Split it.');
  end if;

  -- A committed batch for the same event and file is returned as-is. Retrying cannot duplicate.
  select id into v_existing
  from public.import_batches
  where club_id = v_club
    and idempotency_key = p_idempotency_key
    and status in ('committed', 'partial')
  limit 1;

  if v_existing is not null then
    return (
      select jsonb_build_object(
        'ok', true,
        'alreadyCommitted', true,
        'batchId', b.id,
        'inserted', b.inserted_count,
        'updated', b.updated_count,
        'skipped', b.skipped_count,
        'rejected', b.rejected_count,
        'rowCount', b.row_count
      )
      from public.import_batches b where b.id = v_existing
    );
  end if;

  insert into public.import_batches
    (club_id, tournament_id, kind, file_name, worksheet, file_sha256, storage_path, mapping,
     status, idempotency_key, uploaded_by)
  values
    (v_club, p_tournament, 'registration', p_file_name, p_worksheet, p_file_sha256, p_storage_path,
     coalesce(p_mapping, '{}'::jsonb), 'pending', p_idempotency_key, (select auth.uid()))
  returning id into v_batch;

  perform set_config('teeline.audit_batch', v_batch::text, true);

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_row_number := case
      when (v_row ->> 'row') ~ '^[0-9]{1,6}$' then (v_row ->> 'row')::integer
      else v_total
    end;
    v_action := coalesce(v_row ->> 'action', 'insert');
    v_error := null;

    begin
      if v_action = 'skip' then
        insert into public.import_rows (batch_id, club_id, row_number, raw, normalized, action, status, error)
        values (v_batch, v_club, v_row_number, v_row, v_row, 'skip', 'skipped',
                nullif(v_row ->> 'skipReason', 'Skipped by the operator.'));
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if coalesce(btrim(v_row ->> 'name'), '') = '' then
        raise exception 'The name is empty.';
      end if;

      if coalesce(v_row ->> 'membershipType', '') not in ('member', 'guest') then
        raise exception 'Membership must be member or guest.';
      end if;

      if v_action not in ('insert', 'update', 'skip', 'reject') then
        raise exception 'The row action is not valid.';
      end if;

      if v_action = 'reject' then
        insert into public.import_rows
          (batch_id, club_id, row_number, raw, normalized, action, status, error)
        values (v_batch, v_club, v_row_number, v_row, v_row, 'reject', 'rejected',
                coalesce(nullif(v_row ->> 'rejectReason', ''), 'Rejected by the operator.'))
        on conflict (batch_id, row_number) do nothing;
        v_rejected := v_rejected + 1;
        continue;
      end if;

      -- Resolve the player first. This is where an ambiguous name or NGAP ID is refused, before a
      -- registration or a handicap row can be attached to the wrong person.
      v_player := public.find_or_create_import_player(
        v_club,
        v_row ->> 'name',
        v_row ->> 'firstName',
        v_row ->> 'lastName',
        nullif(v_row ->> 'birthdate', '')::date,
        nullif(v_row ->> 'gender', ''),
        v_row ->> 'ngapId',
        v_row ->> 'contactNumber',
        v_row ->> 'email',
        v_row ->> 'homeCourse',
        v_row ->> 'whsId',
        nullif(v_row ->> 'linkPlayerId', '')::uuid,
        coalesce((v_row ->> 'forceNew')::boolean, false)
      );

      if not (v_player ->> 'ok')::boolean then
        raise exception '%', v_player ->> 'message';
      end if;

      v_player_id := (v_player ->> 'playerId')::uuid;

      -- A member row is the explicit club relationship. A guest has no active membership row; that
      -- absence is what "guest" means. Never downgrade an existing member because an event row says
      -- guest: the event classification is a snapshot, the club relationship is separate.
      if v_row ->> 'membershipType' = 'member' then
        insert into public.player_memberships (club_id, player_id, membership_type, status)
        select v_club, v_player_id, 'member', 'active'
        where not exists (
          select 1 from public.player_memberships m
          where m.club_id = v_club and m.player_id = v_player_id and m.status = 'active'
        )
        on conflict (club_id, player_id) where status = 'active' do nothing;
      end if;

      select r.id into v_existing_registration
      from public.registrations r
      where r.club_id = v_club
        and r.tournament_id = p_tournament
        and r.player_id = v_player_id
      limit 1;

      if v_existing_registration is not null and v_action <> 'update' then
        insert into public.import_rows (batch_id, club_id, row_number, raw, normalized, action, status, error, registration_id)
        values (v_batch, v_club, v_row_number, v_row, v_row, 'skip', 'skipped',
                'A registration already exists for this player; the row was not overwritten.',
                v_existing_registration)
        on conflict (batch_id, row_number) do nothing;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_existing_registration is null and v_action = 'update' then
        raise exception 'There is no registration to update for this player.';
      end if;

      v_payment_status := case
        when v_row ->> 'paymentStatus' in ('paid', 'recorded_paid') then 'paid'
        when v_row ->> 'paymentStatus' = 'waived' then 'waived'
        when v_row ->> 'paymentStatus' in ('unpaid', 'pending', 'not_recorded') then 'unpaid'
        else null
      end;

      if v_existing_registration is not null then
        v_registration := v_existing_registration;
        update public.registrations
           set membership_type = v_row ->> 'membershipType',
               shirt_size = coalesce(nullif(btrim(coalesce(v_row ->> 'shirtSize', '')), ''), shirt_size),
               payment_status = coalesce(v_payment_status, payment_status),
               payment_amount = coalesce(nullif(v_row ->> 'paymentAmount', '')::numeric, payment_amount),
               payment_reference = coalesce(nullif(v_row ->> 'paymentReference', ''), payment_reference),
               payment_note = coalesce(nullif(v_row ->> 'paymentNote', ''), payment_note),
               paid_at = case
                 when coalesce(v_payment_status, payment_status) = 'paid' then coalesce(paid_at, now())
                 else null
               end,
               sponsor = case when jsonb_typeof(v_row -> 'sponsor') = 'boolean'
                              then (v_row -> 'sponsor')::boolean else sponsor end,
               sponsor_details = coalesce(nullif(v_row ->> 'sponsorDetails', ''), sponsor_details),
               source = 'import',
               import_batch_id = v_batch,
               answers = jsonb_set(
                 coalesce(answers, '{}'::jsonb),
                 '{fromImport}',
                 to_jsonb(v_batch::text),
                 true
               )
         where id = v_registration;
        v_updated := v_updated + 1;
      else
        select h.handicap_index into v_index
        from public.handicap_records h
        where h.club_id = v_club and h.player_id = v_player_id
          and h.effective_date <= v_cutoff
        order by h.effective_date desc
        limit 1;

        insert into public.registrations
          (club_id, tournament_id, player_id, status, reasons, frozen_index, payment_status,
           membership_type, shirt_size, payment_amount, payment_reference, payment_note, paid_at,
           sponsor, sponsor_details, source, import_batch_id, answers)
        values
          (v_club, p_tournament, v_player_id, 'needs_review', v_reasons, v_index,
           coalesce(v_payment_status, 'unpaid'),
           v_row ->> 'membershipType',
           nullif(btrim(coalesce(v_row ->> 'shirtSize', '')), ''),
           nullif(v_row ->> 'paymentAmount', '')::numeric,
           nullif(v_row ->> 'paymentReference', ''),
           nullif(v_row ->> 'paymentNote', ''),
           case when coalesce(v_payment_status, 'unpaid') = 'paid' then now() else null end,
           case when jsonb_typeof(v_row -> 'sponsor') = 'boolean'
                then (v_row -> 'sponsor')::boolean else null end,
           nullif(v_row ->> 'sponsorDetails', ''),
           'import', v_batch,
           jsonb_build_object(
             'role', v_row ->> 'membershipType',
             'shirt', nullif(btrim(coalesce(v_row ->> 'shirtSize', '')), ''),
             'teePreferences', coalesce(v_row -> 'teePreferences', '{}'::jsonb),
             'declaredWshId', nullif(btrim(coalesce(v_row ->> 'whsId', '')), ''),
             'declaredWshHandicap', nullif(btrim(coalesce(v_row ->> 'declaredHandicap', '')), ''),
             'extra', coalesce(v_row -> 'extra', '{}'::jsonb),
             'submittedFrom', 'import'
           ))
        returning id into v_registration;
        v_inserted := v_inserted + 1;
      end if;

      -- The days are a complete set for this registration. Invalid day numbers reject the row,
      -- and the row's subtransaction rolls the player/registration insert back with it.
      if jsonb_typeof(v_row -> 'days') = 'array' then
        for v_day in select jsonb_array_elements_text(v_row -> 'days')::integer loop
          select id into v_day_id
          from public.tournament_days
          where tournament_id = p_tournament and club_id = v_club
            and day_number = v_day and is_playing_day;

          if v_day_id is null then
            raise exception 'Day % is not a playing day for this event.', v_day;
          end if;

          insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
          values (v_club, v_registration, v_day_id, true)
          on conflict (registration_id, tournament_day_id)
          do update set selected = true, updated_at = now();
        end loop;

        update public.registration_days rd
           set selected = false, tee_time = null, start_hole = null, tee_confirmed = false, updated_at = now()
         where rd.registration_id = v_registration
           and rd.selected
           and not exists (
             select 1 from public.tournament_days d
             where d.id = rd.tournament_day_id
               and d.is_playing_day
               and d.day_number in (
                 select jsonb_array_elements_text(v_row -> 'days')::integer
               )
           );
      end if;

      -- Check the rule inside this row's subtransaction. The deferred constraint trigger would
      -- otherwise abort the whole import at commit instead of rejecting just this row.
      perform public.check_registration_day_rule(v_registration);

      insert into public.import_rows
        (batch_id, club_id, row_number, raw, normalized, action, status, player_id, registration_id)
      values
        (v_batch, v_club, v_row_number, v_row, v_row,
         case when v_existing_registration is null then 'insert' else 'update' end,
         'committed', v_player_id, v_registration)
      on conflict (batch_id, row_number) do nothing;

    exception when others then
      v_error := sqlerrm;
      insert into public.import_rows
        (batch_id, club_id, row_number, raw, normalized, action, status, error)
      values (v_batch, v_club, v_row_number, v_row, v_row,
              case when v_action = 'update' then 'update' else 'reject' end, 'rejected', v_error)
      on conflict (batch_id, row_number) do nothing;
      v_rejected := v_rejected + 1;
    end;
  end loop;

  update public.import_batches
     set status = case when v_rejected > 0 then 'partial' else 'committed' end,
         row_count = v_total,
         inserted_count = v_inserted,
         updated_count = v_updated,
         skipped_count = v_skipped,
         rejected_count = v_rejected,
         committed_at = now()
   where id = v_batch;

  insert into public.audit_log
    (club_id, actor_id, action, entity, entity_id, batch_id, detail)
  values
    (v_club, (select auth.uid()), 'import_commit', 'import_batches', v_batch::text, v_batch,
     jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped, 'rejected', v_rejected));

  return jsonb_build_object(
    'ok', v_rejected = 0,
    'partial', v_rejected > 0,
    'alreadyCommitted', false,
    'batchId', v_batch,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'rejected', v_rejected,
    'rowCount', v_total
  );
end;
$$;

revoke all on function public.commit_registration_import(uuid, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function public.commit_registration_import(uuid, text, text, text, text, jsonb, jsonb, text) to authenticated;

-- 9.6 Handicap import commit. Existing players only; a new golfer needs a complete player record,
-- which is what the registration import creates.
create or replace function public.commit_handicap_import(
  p_file_name text,
  p_file_sha256 text,
  p_rows jsonb,
  p_deferred jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_batch uuid;
  v_existing uuid;
  v_row jsonb;
  v_row_number integer;
  v_player_id uuid;
  v_record_id uuid;
  v_index numeric(4, 1);
  v_effective date;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_total integer := 0;
begin
  v_club := null;
  select m.club_id into v_club
  from public.club_members m
  where m.user_id = (select auth.uid())
  order by m.created_at
  limit 1;

  if v_club is null then
    raise exception 'You do not have access to a club.' using errcode = '42501';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can import handicaps.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('handicap:' || v_club::text));

  if p_file_sha256 !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'The import payload is not valid.');
  end if;

  select id into v_existing
  from public.handicap_import_batches
  where club_id = v_club and idempotency_key = p_idempotency_key and status in ('committed', 'partial')
  limit 1;

  if v_existing is not null then
    return (
      select jsonb_build_object('ok', true, 'alreadyCommitted', true, 'batchId', b.id,
                                'inserted', b.applied_count, 'rejected', b.rejected_count)
      from public.handicap_import_batches b where b.id = v_existing
    );
  end if;

  insert into public.handicap_import_batches
    (club_id, file_name, file_sha256, status, idempotency_key, created_by, imported_at)
  values (v_club, p_file_name, p_file_sha256, 'pending', p_idempotency_key, (select auth.uid()), now())
  returning id into v_batch;

  perform set_config('teeline.audit_batch', v_batch::text, true);

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_row_number := case
      when (v_row ->> 'row') ~ '^[0-9]{1,6}$' then (v_row ->> 'row')::integer
      else v_total
    end;

    begin
      if (v_row ->> 'playerId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_player_id := (v_row ->> 'playerId')::uuid;
      else
        v_player_id := null;
      end if;
      if v_player_id is null then
        raise exception 'No matching player. Add the player first, then import the index.';
      end if;

      if not exists (select 1 from public.players where id = v_player_id and club_id = v_club) then
        raise exception 'That player is not in this club.';
      end if;

      v_index := nullif(v_row ->> 'index', '')::numeric(4, 1);
      v_effective := nullif(v_row ->> 'effectiveDate', '')::date;

      if v_effective is null then
        raise exception 'The effective date is missing.';
      end if;

      select id into v_record_id
      from public.handicap_records
      where club_id = v_club and player_id = v_player_id and effective_date = v_effective;

      if v_record_id is null then
        insert into public.handicap_records (club_id, player_id, handicap_index, effective_date, source)
        values (v_club, v_player_id, v_index, v_effective, 'ngap_import')
        returning id into v_record_id;
        v_inserted := v_inserted + 1;
        insert into public.handicap_import_rows
          (batch_id, club_id, row_number, player_id, name, handicap_index, effective_date, status)
        values (v_batch, v_club, v_row_number, v_player_id, v_row ->> 'name', v_index, v_effective, 'inserted');
      else
        update public.handicap_records
           set handicap_index = v_index, source = 'ngap_import'
         where id = v_record_id;
        v_updated := v_updated + 1;
        insert into public.handicap_import_rows
          (batch_id, club_id, row_number, player_id, name, handicap_index, effective_date, status)
        values (v_batch, v_club, v_row_number, v_player_id, v_row ->> 'name', v_index, v_effective, 'updated');
      end if;
    exception when others then
      insert into public.handicap_import_rows
        (batch_id, club_id, row_number, player_id, name, handicap_index, effective_date, status, error)
      values (v_batch, v_club, v_row_number, v_player_id, v_row ->> 'name',
              case when (v_row ->> 'index') ~ '^[+-]?\d{1,2}(\.\d{1,2})?$'
                   then (v_row ->> 'index')::numeric(4, 1) else null end,
              case when (v_row ->> 'effectiveDate') ~ '^\d{4}-\d{2}-\d{2}$'
                   then (v_row ->> 'effectiveDate')::date else null end,
              'rejected', sqlerrm);
      v_rejected := v_rejected + 1;
    end;
  end loop;

  -- Deferred rows are part of the same transaction: they are not imported, but they cannot be lost
  -- if the batch succeeds.
  if jsonb_typeof(p_deferred) = 'array' then
    insert into public.deferred_matches
      (club_id, name, ngap_id, handicap_index, effective_date, reason, candidate_player_ids, file_name)
    select
      v_club,
      d ->> 'name',
      nullif(d ->> 'ngapId', ''),
      nullif(d ->> 'index', '')::numeric(4, 1),
      (d ->> 'effectiveDate')::date,
      coalesce(nullif(d ->> 'reason', ''), 'Deferred by the organizer.'),
      coalesce(array(select jsonb_array_elements_text(d -> 'candidatePlayerIds')), array[]::text[]),
      p_file_name
    from jsonb_array_elements(p_deferred) d
    where nullif(d ->> 'effectiveDate', '') is not null;
    get diagnostics v_skipped = row_count;
  end if;

  update public.handicap_import_batches
     set status = case when v_rejected > 0 then 'partial' else 'committed' end,
         row_count = v_total,
         applied_count = v_inserted + v_updated,
         skipped_count = v_skipped,
         rejected_count = v_rejected,
         committed_at = now()
   where id = v_batch;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, batch_id, detail)
  values (v_club, (select auth.uid()), 'handicap_import_commit', 'handicap_import_batches', v_batch::text, v_batch,
          jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'rejected', v_rejected));

  return jsonb_build_object(
    'ok', v_rejected = 0,
    'partial', v_rejected > 0,
    'alreadyCommitted', false,
    'batchId', v_batch,
    'inserted', v_inserted,
    'updated', v_updated,
    'rejected', v_rejected,
    'rowCount', v_total
  );
end;
$$;

revoke all on function public.commit_handicap_import(text, text, jsonb, jsonb, text) from public;
grant execute on function public.commit_handicap_import(text, text, jsonb, jsonb, text) to authenticated;

-- 10. Audit triggers ----------------------------------------------------------------------------
-- Created after the backfills, so the migration does not write audit rows for its own data changes.

drop trigger if exists players_audit on public.players;
create trigger players_audit after insert or update or delete on public.players
  for each row execute function public.audit_row_change();

drop trigger if exists player_memberships_audit on public.player_memberships;
create trigger player_memberships_audit after insert or update or delete on public.player_memberships
  for each row execute function public.audit_row_change();

drop trigger if exists tournament_days_audit on public.tournament_days;
create trigger tournament_days_audit after insert or update or delete on public.tournament_days
  for each row execute function public.audit_row_change();

drop trigger if exists registrations_audit on public.registrations;
create trigger registrations_audit after insert or update or delete on public.registrations
  for each row execute function public.audit_row_change();

drop trigger if exists registration_days_audit on public.registration_days;
create trigger registration_days_audit after insert or update or delete on public.registration_days
  for each row execute function public.audit_row_change();

-- 11. Storage for the original upload -----------------------------------------------------------
-- Private bucket, path {club_id}/{batch_id}/{file_name}. The file is evidence, not a public asset.

insert into storage.buckets (id, name, public)
values ('registration-imports', 'registration-imports', false)
on conflict (id) do nothing;

drop policy if exists registration_imports_manager_insert on storage.objects;
create policy registration_imports_manager_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'registration-imports'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['owner', 'organizer'])
  );

drop policy if exists registration_imports_manager_read on storage.objects;
create policy registration_imports_manager_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'registration-imports'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['owner', 'organizer'])
  );

-- No update or delete policy on purpose: an upload is immutable. Retention is handled with the
-- service role, not from the desk.

-- 12. Self-check --------------------------------------------------------------------------------
-- These are structural assertions, not data assertions. A failure rolls the migration back.

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_days') then
    raise exception 'tournament_days was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'registration_days') then
    raise exception 'registration_days was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'import_batches') then
    raise exception 'import_batches was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'audit_log') then
    raise exception 'audit_log was not created';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'commit_registration_import'
  ) then
    raise exception 'commit_registration_import was not created';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('commit_registration_import', 'save_day_rule', 'set_registration_days')
      and p.proacl is not null
      and exists (select 1 from unnest(p.proacl) a where a like 'anon=%')
  ) then
    raise exception 'An import function is executable by anon';
  end if;
  if (select count(*) from public.tournaments t where not exists (
        select 1 from public.tournament_days d where d.tournament_id = t.id
      )) > 0 then
    raise exception 'At least one tournament has no day rows after the backfill';
  end if;
end $$;
