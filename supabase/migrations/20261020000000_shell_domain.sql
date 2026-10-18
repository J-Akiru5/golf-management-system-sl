-- Shell domain fields: what the tournament office holds beyond the first schema.
-- ADDITIVE. No existing column or policy is changed by this migration.
--
-- The shell's domain types (src/lib/data/types.ts) carry more than the first schema did:
-- names in parts with contact details, a multi-day schedule and lifecycle on an event, the
-- registration-config block, the record a frozen index came from, and the two import-tracking
-- tables. This adds exactly those, so the Supabase adapter can be faithful instead of dropping
-- fields silently.

-- 1. Players: structured name parts and contact details ------------------------------------------
-- full_name stays the single display name used on sheets and pairings.

alter table public.players
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists nickname text,
  add column if not exists home_course text,
  add column if not exists email text;

comment on column public.players.full_name is
  'Display name on sheets, pairings and posters. first_name/last_name are the structured parts.';

-- 2. Tournaments: multi-day schedule, lifecycle and the registration config block ----------------

alter table public.tournaments
  add column if not exists dates date[],
  add column if not exists state text not null default 'draft'
    check (state in ('draft', 'open', 'closed')),
  add column if not exists name_needs_confirmation boolean not null default false,
  add column if not exists schedule_needs_confirmation boolean not null default false,
  add column if not exists stale_index_days smallint not null default 120
    check (stale_index_days > 0),
  -- Payment instructions, per-day tee-time choices, shirt sizes and extra questions.
  add column if not exists registration jsonb,
  -- Move and lock reasons for the board, so an override is never anonymous.
  add column if not exists board_overrides jsonb;

-- play_date stays the first day; older rows get a one-day schedule rather than a null.
update public.tournaments
  set dates = array[play_date]
  where dates is null;

comment on column public.tournaments.play_date is
  'First day of play. Kept for compatibility; dates is the full schedule.';

-- 3. Registrations: which record the frozen index came from --------------------------------------

alter table public.registrations
  add column if not exists frozen_record_id uuid references public.handicap_records (id) on delete set null,
  add column if not exists frozen_effective_date date,
  add column if not exists frozen_at timestamptz;

comment on column public.registrations.frozen_record_id is
  'The handicap_records row copied onto this registration; the index never moves once set.';

-- 4. Import tracking -----------------------------------------------------------------------------

-- NH ("no handicap") is a real answer on an NGAP row, and the domain type allows a null index.
-- Without this, an NH revision could not be stored and would have to be dropped silently.
alter table public.handicap_records
  alter column handicap_index drop not null;

comment on column public.handicap_records.handicap_index is
  'Null = NH (no handicap) on that revision. Plus handicaps are stored negative.';

create table if not exists public.handicap_import_batches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  file_name text not null,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  applied_count integer not null default 0,
  skipped_count integer not null default 0,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  unique (id, club_id)
);

create table if not exists public.deferred_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  ngap_id text,
  handicap_index numeric(4, 1),
  effective_date date not null,
  reason text not null,
  candidate_player_ids uuid[] not null default '{}',
  file_name text not null,
  created_at timestamptz not null default now(),
  unique (id, club_id)
);

-- Same member policy shape as the other club tables: any club member may read and write.
alter table public.handicap_import_batches enable row level security;
alter table public.deferred_matches enable row level security;

create policy handicap_import_batches_member_all on public.handicap_import_batches
  for all to authenticated
  using (public.is_club_member(club_id)) with check (public.is_club_member(club_id));

create policy deferred_matches_member_all on public.deferred_matches
  for all to authenticated
  using (public.is_club_member(club_id)) with check (public.is_club_member(club_id));
