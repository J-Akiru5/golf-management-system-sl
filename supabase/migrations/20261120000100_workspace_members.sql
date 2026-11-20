-- TeeLine Workspace, part 1 of 4: who may use the workspace.
-- ADDITIVE: creates new objects only. Nothing existing is altered or dropped.
--
-- The workspace is the internal ops portal for Syntaxure Labs, MDM Events and ZenLabs. It is a
-- separate app (apps/ops) that shares this Supabase project. Its access list is NOT club_members:
-- a tabulator or a desk account has no row here, so it sees nothing in the workspace.
--
--   owner    : everything, including adding, removing and re-roling members
--   partner  : everything on content, including deleting it; cannot manage members
--   member   : read and write content; cannot delete what only owner/partner may delete
--
-- Status is separate from the row so a person can be locked out without losing their history.
-- Only `active` members pass the helpers below.
--
-- The first owner is added by SQL, run by the project owner (see supabase/seed/workspace_members.example.sql).
-- Nobody is seeded by this migration.

-- 1. Members ------------------------------------------------------------------------------------

create table public.workspace_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'partner', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspace_members is
  'Access list for the TeeLine Workspace (apps/ops). Separate from club_members on purpose.';

-- 2. Helpers ------------------------------------------------------------------------------------
-- SECURITY DEFINER so the lookup is never filtered by the table's own RLS (no recursion). They read
-- auth.uid() from the caller's JWT, so they say nothing about anyone else.

create function public.ws_is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function public.ws_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.ws_is_member() from public, anon;
revoke all on function public.ws_has_role(text[]) from public, anon;
grant execute on function public.ws_is_member() to authenticated;
grant execute on function public.ws_has_role(text[]) to authenticated;

-- 3. Shared triggers ----------------------------------------------------------------------------

create function public.ws_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Refuses to change the columns named in the trigger arguments. A client cannot re-attribute a row
-- to someone else. Trusted callers with no JWT (the SQL editor, service role) are not restricted.
create function public.ws_lock_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  before_value jsonb;
  after_value jsonb;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  foreach col in array tg_argv loop
    before_value := to_jsonb(old) -> col;
    after_value := to_jsonb(new) -> col;
    if before_value is distinct from after_value then
      raise exception 'column % cannot be changed', col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.ws_touch_updated_at() from public, anon;
revoke all on function public.ws_lock_columns() from public, anon;

create trigger workspace_members_touch
  before update on public.workspace_members
  for each row execute function public.ws_touch_updated_at();

-- 4. Member guard -------------------------------------------------------------------------------
-- RLS cannot compare old and new values, so the rules about what may change live here.
--   * Only an owner may change role, status or who invited someone.
--   * Anyone may change their own display name, nothing else.
--   * The last active owner can neither be demoted, suspended nor removed: the workspace would be
--     left with nobody who can manage it.
-- A caller with no JWT (SQL editor, service role) skips the role rules so the project owner can
-- always repair the table, but the last-owner rule still applies to everyone.

create function public.ws_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_is_owner boolean;
  other_owners integer;
begin
  if tg_op = 'UPDATE' and caller is not null then
    caller_is_owner := public.ws_has_role(array['owner']);
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot be changed' using errcode = '42501';
    end if;
    if not caller_is_owner
       and (new.role is distinct from old.role
         or new.status is distinct from old.status
         or new.invited_by is distinct from old.invited_by) then
      raise exception 'only an owner can change role or status' using errcode = '42501';
    end if;
  end if;

  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    select count(*) into other_owners
    from public.workspace_members m
    where m.role = 'owner' and m.status = 'active' and m.user_id <> old.user_id;
    if other_owners = 0 then
      raise exception 'the workspace needs at least one active owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ws_members_guard() from public, anon;

create trigger workspace_members_guard
  before update or delete on public.workspace_members
  for each row execute function public.ws_members_guard();

-- 5. Row level security -------------------------------------------------------------------------

alter table public.workspace_members enable row level security;

revoke all on table public.workspace_members from public, anon;
grant select, update, delete on table public.workspace_members to authenticated;
-- No insert grant: members are added through ws_add_member below, which checks the caller is an owner.

-- A person can always read their own row (so the app can say "suspended" instead of "no access");
-- active members can read everyone's (names and roles, for avatars and assignment lists).
create policy workspace_members_read on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.ws_is_member()));

-- Update: an owner may change anyone, anyone may update their own row. The guard trigger limits a
-- non-owner to the display name.
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using ((select public.ws_has_role(array['owner'])) or user_id = (select auth.uid()))
  with check ((select public.ws_has_role(array['owner'])) or user_id = (select auth.uid()));

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using ((select public.ws_has_role(array['owner'])));

-- 6. Owner-only functions -----------------------------------------------------------------------
-- Adding a member needs to find an account by email, which the browser may not do. These run as the
-- definer, refuse anyone who is not an active owner, and never hand the service-role key to the app.

create function public.ws_add_member(p_email text, p_role text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can add members' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'partner', 'member') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  select u.id into target
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;

  if target is null then
    raise exception 'no account has that email address; create the account in Supabase first'
      using errcode = 'P0002';
  end if;

  insert into public.workspace_members (user_id, role, display_name, invited_by)
  values (target, p_role, btrim(p_display_name), (select auth.uid()));

  return target;
end;
$$;

-- Owners see member emails; nobody else does. Emails live in auth.users and are not copied.
create function public.ws_list_members()
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  display_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'only an owner can list member emails' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.status, m.display_name, m.created_at
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    order by m.created_at;
end;
$$;

revoke all on function public.ws_add_member(text, text, text) from public, anon;
revoke all on function public.ws_list_members() from public, anon;
grant execute on function public.ws_add_member(text, text, text) to authenticated;
grant execute on function public.ws_list_members() to authenticated;
