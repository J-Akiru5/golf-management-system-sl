-- Stored desk notifications, with per-user read state.
--
-- Decision 14 asked whether the overview attention list and the shell bell were enough. They were
-- not, so alerts are now rows the desk can mark as read and that survive a refresh.
--
-- Two tables, because an alert is one event and read state belongs to one person:
--   notifications      the alert itself, one row per problem
--   notification_reads who has seen which alert
--
-- Alerts are NOT written from scattered call sites. Every feature would have to remember to notify,
-- and an alert would stay on screen after the problem was fixed. Instead one function computes the
-- alerts the data currently implies, upserts the new ones and stamps resolved_at on the rest. That
-- keeps the rows and the read state, without the staleness.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  kind text not null,
  -- What the alert is about, so the same kind of problem for two players makes two alerts.
  subject text not null default '',
  severity text not null check (severity in ('info', 'warning', 'blocking')),
  title text not null,
  detail text,
  created_at timestamptz not null default now(),
  -- Set when the problem no longer applies. A resolved alert is history, not a to-do.
  resolved_at timestamptz,
  unique (tournament_id, kind, subject),
  unique (id, club_id)
);

create table if not exists public.notification_reads (
  club_id uuid not null,
  notification_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id),
  foreign key (notification_id, club_id) references public.notifications (id, club_id) on delete cascade
);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

-- Members read their club's alerts. Nobody writes them from the client: they come from the function.
create policy notifications_member_read on public.notifications
  for select to authenticated using (public.is_club_member(club_id));

-- A member manages only their own read rows.
create policy notification_reads_own on public.notification_reads
  for all to authenticated
  using (public.is_club_member(club_id) and user_id = (select auth.uid()))
  with check (public.is_club_member(club_id) and user_id = (select auth.uid()));

-- Reads are taken for granted when deciding what is outstanding, so index them.
create index if not exists notifications_outstanding
  on public.notifications (tournament_id) where resolved_at is null;

-- The alerts the data currently implies ------------------------------------------------------------------
-- Only what the database can see for itself. The draw's own rules (a player in two groups, a group
-- over the cap) live in the app's validator, so the desk keeps showing those from there.

create or replace function public.sync_notifications(p_tournament uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_cutoff date;
  v_group_size smallint;
  v_min smallint;
  n int;
  v_open int := 0;
begin
  select t.club_id, t.cutoff_date, t.group_size, t.min_group_size
    into v_club, v_cutoff, v_group_size, v_min
    from public.tournaments t
   where t.id = p_tournament;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.is_club_member(v_club) then
    raise exception 'Not a member of this club' using errcode = '42501';
  end if;

  -- Everything is treated as fixed until the checks below say otherwise. An alert that stops
  -- applying goes away by itself.
  update public.notifications
     set resolved_at = now()
   where tournament_id = p_tournament and resolved_at is null;

  -- Ready players the draw does not place.
  select count(*) into n
    from public.registrations r
   where r.tournament_id = p_tournament
     and r.status = 'ok'
     and not exists (select 1 from public.group_members gm where gm.registration_id = r.id);

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'unplaced', '', 'blocking',
      n || ' ready player(s) have no group',
      'They are registered and eligible, but the draw does not place them.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Entries the desk has not confirmed.
  select count(*) into n
    from public.registrations r
   where r.tournament_id = p_tournament and r.status = 'needs_review';

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'needs_review', '', 'warning',
      n || ' registration(s) need review',
      'The routing could not place them without a decision.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Groups over the cap the event allows.
  select count(*) into n
    from public.groups g
   where g.tournament_id = p_tournament
     and (select count(*) from public.group_members gm where gm.group_id = g.id) > v_group_size;

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'group_over_capacity', '', 'blocking',
      n || ' group(s) are over the limit',
      'A group has more players than the event allows (' || v_group_size || ').')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Groups below the minimum, which the engine flags rather than blocks.
  select count(*) into n
    from public.groups g
   where g.tournament_id = p_tournament
     and (select count(*) from public.group_members gm where gm.group_id = g.id) between 1 and (v_min - 1);

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'group_under_minimum', '', 'warning',
      n || ' group(s) are below the minimum',
      'Aim for ' || v_min || ' to ' || v_group_size || ' players a group.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- The cut-off is close. Seven days is a heads-up, not a rule.
  if v_cutoff is not null and v_cutoff >= current_date and v_cutoff - current_date <= 7 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'cutoff_soon', '', 'info',
      'Entry cut-off is within a week',
      'The cut-off is ' || to_char(v_cutoff, 'FMDD FMMon YYYY') ||
      '. Upload a fresh NGAP export before it passes.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  return v_open;
end;
$$;

-- Mark everything outstanding for this event as read by the caller.
create or replace function public.mark_notifications_read(p_tournament uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  n int;
begin
  select club_id into v_club from public.tournaments where id = p_tournament;
  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  insert into public.notification_reads (club_id, notification_id, user_id)
  select v_club, nt.id, (select auth.uid())
    from public.notifications nt
   where nt.tournament_id = p_tournament
     and nt.resolved_at is null
     and (select auth.uid()) is not null
  on conflict (notification_id, user_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_notifications(uuid) from public;
revoke all on function public.mark_notifications_read(uuid) from public;
grant execute on function public.sync_notifications(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
