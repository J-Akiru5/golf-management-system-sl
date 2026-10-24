-- Event branding, calendar conflict protection and the email outbox.
--
-- Additive. Hotel booking is not assumed: a course/date can host more than one event, but the same
-- course, date and tee time cannot be double-booked. Same-day events at different times are allowed;
-- the calendar warns about them before the organizer saves.

-- 1. Event branding ------------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists host_name text,
  add column if not exists logo_path text;

create index if not exists tournaments_host_name
  on public.tournaments (club_id, lower(host_name))
  where host_name is not null;

-- Private logo storage. The event logo is used on staff screens and printed cards; it is not a
-- public page asset in this release.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-logos',
  'event-logos',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set public = false;

drop policy if exists event_logos_staff_read on storage.objects;
create policy event_logos_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-logos'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists event_logos_manager_write on storage.objects;
create policy event_logos_manager_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'event-logos'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['owner', 'organizer'])
  )
  with check (
    bucket_id = 'event-logos'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['owner', 'organizer'])
  );

-- 2. Calendar conflict protection -----------------------------------------------------------------
-- The calendar shows same-day events as a warning. The database only refuses the unambiguous case:
-- the same course, same playing date and same tee time. A day with no start time is not a slot.

create or replace function public.check_tournament_day_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
begin
  if not new.is_playing_day or new.start_time is null then
    return new;
  end if;

  select course_id into v_course
  from public.tournaments
  where id = new.tournament_id and club_id = new.club_id;

  if v_course is null then
    return new;
  end if;

  -- Serialize the same course/date/slot across concurrent event saves. The trigger is a check-then-
  -- insert; without this lock two transactions could both see no conflict.
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.club_id::text || ':' || v_course::text || ':' || new.play_date::text || ':' || new.start_time::text,
      0
    )
  );

  if exists (
    select 1
    from public.tournament_days d
    join public.tournaments t on t.id = d.tournament_id and t.club_id = d.club_id
    where d.club_id = new.club_id
      and d.is_playing_day
      and d.play_date = new.play_date
      and d.start_time = new.start_time
      and d.tournament_id <> new.tournament_id
      and t.course_id = v_course
  ) then
    raise exception 'That course is already booked at % on %.', new.start_time, new.play_date
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function public.check_tournament_day_booking() from public;

drop trigger if exists tournament_days_booking_guard on public.tournament_days;
create trigger tournament_days_booking_guard
  before insert or update of tournament_id, play_date, start_time, is_playing_day
  on public.tournament_days
  for each row execute function public.check_tournament_day_booking();

create index if not exists tournament_days_booking_lookup
  on public.tournament_days (club_id, play_date, start_time)
  where is_playing_day and start_time is not null;

-- A course change on the event is not a tournament_days update, so check the existing days directly.
create or replace function public.check_tournament_course_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day record;
begin
  if new.course_id is not distinct from old.course_id then
    return new;
  end if;

  for v_day in
    select play_date, start_time
    from public.tournament_days
    where tournament_id = new.id and club_id = new.club_id
      and is_playing_day and start_time is not null
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        new.club_id::text || ':' || new.course_id::text || ':' || v_day.play_date::text || ':' || v_day.start_time::text,
        0
      )
    );
    if exists (
      select 1
      from public.tournament_days d
      join public.tournaments t on t.id = d.tournament_id and t.club_id = d.club_id
      where d.club_id = new.club_id
        and d.is_playing_day
        and d.play_date = v_day.play_date
        and d.start_time = v_day.start_time
        and d.tournament_id <> new.id
        and t.course_id = new.course_id
    ) then
      raise exception 'That course is already booked at % on %.', v_day.start_time, v_day.play_date
        using errcode = '23P01';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.check_tournament_course_move() from public;

drop trigger if exists tournaments_course_booking_guard on public.tournaments;
create trigger tournaments_course_booking_guard
  before update of course_id on public.tournaments
  for each row execute function public.check_tournament_course_move();

-- 3. Event audit ----------------------------------------------------------------------------------
-- Tournaments had no audit trigger. Branding edits, date changes and deletes are now recorded.

drop trigger if exists tournaments_audit on public.tournaments;
create trigger tournaments_audit
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_row_change();

-- 4. Email outbox ---------------------------------------------------------------------------------
-- A queued row is a draft, not a claim that mail was delivered. The API marks sent or failed only
-- after the provider answers. No service-role key is stored in the browser.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid not null,
  registration_id uuid,
  recipient_email text not null,
  recipient_name text not null,
  kind text not null check (kind in ('confirmation', 'reminder', 'custom')),
  subject text not null,
  body text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  dedupe_key text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, dedupe_key),
  foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  foreign key (registration_id, club_id) references public.registrations (id, club_id) on delete cascade
);

create index if not exists email_outbox_queue
  on public.email_outbox (club_id, tournament_id, status, created_at);

drop trigger if exists email_outbox_stamp_updated_at on public.email_outbox;
create trigger email_outbox_stamp_updated_at
  before update on public.email_outbox
  for each row execute function public.stamp_updated_at();

alter table public.email_outbox enable row level security;

drop policy if exists email_outbox_manager_all on public.email_outbox;
create policy email_outbox_manager_all on public.email_outbox
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

-- 5. Self-check -----------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tournaments'
                    and column_name = 'host_name') then
    raise exception 'tournaments.host_name was not added';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tournaments'
                    and column_name = 'logo_path') then
    raise exception 'tournaments.logo_path was not added';
  end if;
  if not exists (select 1 from storage.buckets where id = 'event-logos' and not public) then
    raise exception 'event-logos is missing or not private';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tournament_days_booking_guard') then
    raise exception 'tournament_days_booking_guard was not created';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'email_outbox') then
    raise exception 'email_outbox was not created';
  end if;
end $$;
