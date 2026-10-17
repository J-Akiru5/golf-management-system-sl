-- IGCC Tournament Desk: initial schema.
-- Multi-tenant from day one: every table carries club_id and is protected by row-level security.
-- Cross-club references are blocked by composite foreign keys (id, club_id).

create extension if not exists btree_gist;

-- Tenancy -------------------------------------------------------------------------------------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'organizer' check (role in ('organizer')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create function public.is_club_member(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club and m.user_id = (select auth.uid())
  );
$$;

-- Course setup --------------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  holes smallint not null default 18 check (holes in (9, 18, 27, 36)),
  unique (id, club_id)
);

create table public.tees (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  course_id uuid not null,
  name text not null,
  course_rating numeric(4, 1) not null check (course_rating between 50 and 90),
  slope smallint not null check (slope between 55 and 155),
  par smallint not null check (par between 27 and 80),
  unique (id, club_id),
  unique (course_id, name),
  foreign key (course_id, club_id) references public.courses (id, club_id) on delete cascade
);

create table public.holes (
  club_id uuid not null,
  course_id uuid not null,
  number smallint not null check (number > 0),
  par smallint not null check (par between 3 and 6),
  stroke_index smallint not null check (stroke_index > 0),
  primary key (course_id, number),
  unique (course_id, stroke_index),
  foreign key (course_id, club_id) references public.courses (id, club_id) on delete cascade
);

-- Players -------------------------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  full_name text not null,
  birthdate date not null,
  gender text not null check (gender in ('M', 'F')),
  ngap_id text,
  phone text,
  -- Private storage path inside the player-photos bucket, never a public URL.
  photo_path text,
  photo_consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (club_id, ngap_id)
);

create table public.handicap_records (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  player_id uuid not null,
  handicap_index numeric(4, 1) not null,
  effective_date date not null,
  source text not null check (source in ('ngap_import', 'manual')),
  created_at timestamptz not null default now(),
  unique (player_id, effective_date),
  foreign key (player_id, club_id) references public.players (id, club_id) on delete cascade
);
create index handicap_records_lookup on public.handicap_records (player_id, effective_date desc);

-- Tournaments ---------------------------------------------------------------------------------

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  course_id uuid not null,
  name text not null,
  play_date date not null,
  cutoff_date date not null,
  start_format text not null check (start_format in ('shotgun', 'two_tee')),
  first_tee_time time not null,
  interval_minutes smallint not null default 12 check (interval_minutes > 0),
  wave_gap_minutes smallint not null default 300 check (wave_gap_minutes > 0),
  group_size smallint not null default 4 check (group_size between 2 and 5),
  min_group_size smallint not null default 3 check (min_group_size between 1 and 5),
  max_index numeric(4, 1) not null default 30,
  allowance numeric(4, 3) not null default 1 check (allowance between 0.1 and 1),
  flight_basis text not null default 'index' check (flight_basis in ('index', 'course_handicap')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (course_id, club_id) references public.courses (id, club_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  tee_id uuid not null,
  name text not null,
  gender text not null default 'any' check (gender in ('M', 'F', 'any')),
  min_age smallint not null default 0,
  max_age smallint,
  sort_order smallint not null default 0,
  unique (id, club_id),
  check (max_age is null or max_age >= min_age),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (tee_id, club_id) references public.tees (id, club_id)
);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  category_id uuid not null,
  name text not null,
  min_value numeric(4, 1) not null,
  max_value numeric(4, 1) not null,
  unique (id, club_id),
  check (max_value >= min_value),
  foreign key (category_id, club_id) references public.categories (id, club_id) on delete cascade,
  -- Two flights in one category can never cover the same value.
  exclude using gist (category_id with =, numrange(min_value, max_value, '[]') with &&)
);

create table public.registration_fields (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  key text not null,
  label text not null,
  options jsonb,
  required boolean not null default false,
  unique (tournament_id, key),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  player_id uuid not null,
  status text not null default 'ok' check (status in ('ok', 'ineligible', 'needs_review')),
  reasons text[] not null default '{}',
  -- Index frozen at registration so later NGAP uploads cannot change a published draw.
  frozen_index numeric(4, 1),
  category_id uuid,
  tee_id uuid,
  playing_handicap smallint,
  flight_id uuid,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'waived')),
  answers jsonb not null default '{}',
  -- True when the organizer changed category, tee or flight by hand.
  overridden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (tournament_id, player_id),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (player_id, club_id) references public.players (id, club_id),
  foreign key (category_id, club_id) references public.categories (id, club_id),
  foreign key (tee_id, club_id) references public.tees (id, club_id),
  foreign key (flight_id, club_id) references public.flights (id, club_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  flight_id uuid not null,
  number smallint not null,
  start_hole smallint not null check (start_hole > 0),
  -- Shotgun wave letter (A, B...). Null for a two-tee start.
  wave text,
  tee_time time not null,
  locked boolean not null default false,
  unique (id, club_id),
  unique (tournament_id, number),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (flight_id, club_id) references public.flights (id, club_id)
);

create table public.group_members (
  club_id uuid not null,
  group_id uuid not null,
  registration_id uuid not null unique,
  position smallint not null check (position > 0),
  primary key (group_id, position),
  foreign key (group_id, club_id) references public.groups (id, club_id) on delete cascade,
  foreign key (registration_id, club_id) references public.registrations (id, club_id) on delete cascade
);

-- Row-level security --------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

create policy clubs_member_read on public.clubs
  for select to authenticated using (public.is_club_member(id));

create policy club_members_read_own on public.club_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Clubs and memberships are created with the service role during onboarding, not from the app.

do $$
declare t text;
begin
  foreach t in array array[
    'courses', 'tees', 'holes', 'players', 'handicap_records', 'tournaments', 'categories',
    'flights', 'registration_fields', 'registrations', 'groups', 'group_members'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_club_member(club_id)) with check (public.is_club_member(club_id))',
      t || '_member_all', t
    );
  end loop;
end $$;

-- Public pairings -----------------------------------------------------------------------------
-- Visitors see names, flight, hole and time for published tournaments only. No birthdates,
-- phone numbers, photos or handicaps leave the database through this function.

create function public.public_pairings(p_tournament uuid)
returns table (
  group_number smallint,
  wave text,
  start_hole smallint,
  tee_time time,
  flight_name text,
  player_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.number, g.wave, g.start_hole, g.tee_time, f.name, p.full_name
  from public.groups g
  join public.tournaments t on t.id = g.tournament_id and t.club_id = g.club_id
  join public.flights f on f.id = g.flight_id and f.club_id = g.club_id
  join public.group_members gm on gm.group_id = g.id and gm.club_id = g.club_id
  join public.registrations r on r.id = gm.registration_id and r.club_id = gm.club_id
  join public.players p on p.id = r.player_id and p.club_id = r.club_id
  where g.tournament_id = p_tournament and t.published
  order by g.number, gm.position;
$$;

revoke all on function public.public_pairings(uuid) from public;
grant execute on function public.public_pairings(uuid) to anon, authenticated;

-- Photo storage -------------------------------------------------------------------------------
-- Private bucket. Object path must start with the club id: {club_id}/{player_id}.jpg

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', false)
on conflict (id) do nothing;

create policy player_photos_member_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'player-photos'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'player-photos'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  );
