-- Staff-only auth model and registration audit.
-- ADDITIVE: nothing is dropped except two policies this migration replaces on purpose.
--
-- Roles live in public.club_members.role (owner, organizer, desk). Enforcement is here, in RLS,
-- so a client cannot bypass it by calling the API directly.
--
--   owner, organizer : publish / unpublish, tournament settings, manage members
--   desk             : register players and edit registrations, nothing else above
--
-- Player identity stays separate from login identity: public.players has no user_id and gains none.

-- 1. Role helper --------------------------------------------------------------------------------

-- SECURITY DEFINER so the lookup itself is never filtered by club_members RLS (no recursion).
create or replace function public.has_club_role(p_club uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_members m
    where m.club_id = p_club
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.has_club_role(uuid, text[]) from public;
grant execute on function public.has_club_role(uuid, text[]) to authenticated;

-- 2. Tournaments: every member reads, only owner/organizer writes --------------------------------
-- Publishing, unpublishing and every tournament setting live in this table.

drop policy if exists tournaments_member_all on public.tournaments;

create policy tournaments_member_read on public.tournaments
  for select to authenticated using (public.is_club_member(club_id));

create policy tournaments_manager_write on public.tournaments
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

-- 3. Memberships: read your own row; owner/organizer may read and manage the rest -----------------

create policy club_members_manager_read on public.club_members
  for select to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']));

create policy club_members_manager_write on public.club_members
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

-- 4. Registration audit --------------------------------------------------------------------------
-- Who registered a player and who last changed the entry. Stamped by trigger from the session,
-- so a client cannot set or spoof these values in the request body.

alter table public.registrations
  add column if not exists registered_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

alter table public.registrations
  alter column registered_by set default auth.uid(),
  alter column updated_by set default auth.uid();

create or replace function public.stamp_registration_audit()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.registered_by := actor;
  else
    -- The original actor never changes on update, even if a client sends a value.
    new.registered_by := old.registered_by;
  end if;
  new.updated_by := actor;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists registrations_stamp_audit on public.registrations;

create trigger registrations_stamp_audit
  before insert or update on public.registrations
  for each row execute function public.stamp_registration_audit();

create index if not exists registrations_registered_by on public.registrations (registered_by);
create index if not exists registrations_updated_by on public.registrations (updated_by);
