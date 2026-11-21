-- God mode: paste-ready for the Supabase SQL editor.
-- Generated from supabase/migrations/20261123000100_god_mode.sql (verbatim, then wrapped).
-- Do not edit by hand; change the migration and regenerate this file.
--
-- BEFORE you run it:
--   1. Be on the live project (the same project the ops app uses).
--   2. This script is additive: two new tables, new functions, and nothing else is changed.
--      It is wrapped in one transaction, so a failure changes nothing.
--   3. Set the ops app's SUPABASE_SERVICE_ROLE_KEY in its environment AFTER this runs. The
--      migration never contains a key.
--
-- AFTER it runs:
--   * The first workspace owner is already on the list (workspace_members). If the owner account
--     is not an active workspace owner, add it with supabase/seed/workspace_members.example.sql
--     first; every function below refuses anyone who is not an active owner.
--   * In Supabase Authentication > URL Configuration, add the ops app's
--     /auth/confirm?next=/auth/set-password URL to the redirect allow list.
--   * Configure the SMTP/email settings in Supabase Authentication > Emails, or the invite and
--     reset emails will not arrive.
--   * The last queries below should show both tables with rls_on = true and no policies, and
--     every god_* function with anon_execute = false and authenticated_execute = true.

begin;

-- ============================================================
-- 20261123000100_god_mode.sql
-- ============================================================

-- God mode: the owner's view of every account, its access, and what changed.
-- ADDITIVE: creates two tables and new functions only. Nothing existing is altered or dropped.
--
-- Scope: every Supabase account, not only workspace members. That includes workshop members,
-- club desk staff, tabulation accounts and player accounts.
--
-- Every function below is SECURITY DEFINER, refuses anyone who is not an active workspace owner
-- (42501), is granted to `authenticated` only, and writes one public.god_audit row for the action.
-- The two tables have row level security on and no policies, so a browser cannot read or write
-- them directly. They are only reachable through the functions.
--
-- Revoke is a reversible suspend: the roles the person had are copied into god_suspensions.previous,
-- the roles are removed, and every session is deleted so the person is signed out everywhere. No
-- account is deleted and no password is ever read or written here.

-- 1. Tables ------------------------------------------------------------------------------------

create table public.god_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  target uuid references auth.users (id) on delete set null,
  target_email text,
  action text not null check (char_length(btrim(action)) between 1 and 60),
  details jsonb not null default '{}'::jsonb,
  reason text
);

comment on table public.god_audit is
  'One row per Admin action. Written only by the god_* functions; readable only through god_audit_list().';

create index god_audit_at on public.god_audit (at desc);
create index god_audit_target on public.god_audit (target, at desc);
create index god_audit_action on public.god_audit (action, at desc);

create table public.god_suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended_at timestamptz not null default now(),
  suspended_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) >= 5),
  apps text[] not null check (cardinality(apps) > 0),
  previous jsonb not null default '{}'::jsonb,
  restored_at timestamptz
);

comment on table public.god_suspensions is
  'A reversible suspend: what the person had (previous) and when it was put back (restored_at).';

create index god_suspensions_open on public.god_suspensions (user_id) where restored_at is null;

alter table public.god_audit enable row level security;
alter table public.god_suspensions enable row level security;

revoke all on table public.god_audit from public, anon, authenticated;
revoke all on table public.god_suspensions from public, anon, authenticated;

-- 2. Shared helper ------------------------------------------------------------------------------

-- A display name for a brand new member row. Internal only: not granted, called from the definer
-- functions below.

create function public.god_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Account'
    ),
    80
  )
  from auth.users u
  where u.id = p_user;
$$;

revoke all on function public.god_display_name(uuid) from public, anon, authenticated;

-- 3. Read: every account ------------------------------------------------------------------------

create function public.god_list_accounts()
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  last_active_at timestamptz,
  email_confirmed boolean,
  invited_pending boolean,
  banned boolean,
  workspace_role text,
  workspace_status text,
  desk_roles jsonb,
  tabulator boolean,
  player_name text,
  suspended boolean,
  suspended_at timestamptz,
  suspended_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  insert into public.god_audit (actor, action, details)
  values (v_actor, 'view_accounts', '{}'::jsonb);

  return query
    select
      u.id as user_id,
      u.email::text as email,
      coalesce(
        m.display_name,
        nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
        'Account'
      )::text as display_name,
      u.created_at as account_created_at,
      u.last_sign_in_at,
      s.last_active_at,
      (u.email_confirmed_at is not null) as email_confirmed,
      (u.invited_at is not null and u.last_sign_in_at is null and u.email_confirmed_at is null)
        as invited_pending,
      (u.banned_until is not null and u.banned_until > now()) as banned,
      m.role as workspace_role,
      m.status as workspace_status,
      coalesce(
        (
          select jsonb_agg(
                   jsonb_build_object('clubId', c.id, 'clubName', c.name, 'role', cm.role)
                   order by c.name
                 )
          from public.club_members cm
          join public.clubs c on c.id = cm.club_id
          where cm.user_id = u.id
        ),
        '[]'::jsonb
      ) as desk_roles,
      coalesce((u.raw_app_meta_data ->> 'scorecard_role') = 'tabulation', false) as tabulator,
      (
        select p.full_name
        from public.players p
        where p.user_id = u.id
        order by p.created_at
        limit 1
      ) as player_name,
      (g.user_id is not null) as suspended,
      g.suspended_at,
      g.reason as suspended_reason
    from auth.users u
    left join public.workspace_members m on m.user_id = u.id
    left join public.god_suspensions g on g.user_id = u.id and g.restored_at is null
    left join lateral (
      select greatest(max(x.updated_at), max(x.refreshed_at)::timestamptz) as last_active_at
      from auth.sessions x
      where x.user_id = u.id
    ) s on true
    order by u.created_at desc, lower(coalesce(u.email, ''));
end;
$$;

comment on function public.god_list_accounts() is
  'Every Supabase account with its access. Owner only. Never returns hashes, tokens or session ids.';

-- Clubs, for the desk-role control. A workspace owner is usually not a club member, so the normal
-- clubs policy would show them nothing.

create function public.god_list_clubs()
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  insert into public.god_audit (actor, action, details)
  values (v_actor, 'view_clubs', '{}'::jsonb);

  return query select c.id, c.name from public.clubs c order by c.name;
end;
$$;

comment on function public.god_list_clubs() is
  'Club ids and names for the desk-role control. Owner only.';

-- 4. Workspace role -----------------------------------------------------------------------------

create function public.god_set_workspace_role(
  p_user uuid,
  p_role text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_previous text;
  v_name text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('owner', 'partner', 'member', 'none') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  if p_role = 'none'
     and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    raise exception 'A reason of at least 5 characters is needed to remove access.'
      using errcode = '22023';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no account has that id' using errcode = 'P0002';
  end if;

  select m.role into v_previous from public.workspace_members m where m.user_id = p_user;

  if p_role = 'none' then
    delete from public.workspace_members m where m.user_id = p_user;
  else
    v_name := coalesce(public.god_display_name(p_user), 'Account');
    insert into public.workspace_members (user_id, role, display_name, invited_by)
    values (p_user, p_role, v_name, v_actor)
    on conflict (user_id) do update set role = excluded.role;
  end if;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor, p_user, v_email, 'workspace_role',
    jsonb_build_object('role', p_role, 'previous', v_previous),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.god_set_workspace_role(uuid, text, text) is
  'Sets or removes a workspace role. Owner only; the last active owner is still protected.';

-- 5. Desk role ----------------------------------------------------------------------------------

create function public.god_set_desk_role(
  p_user uuid,
  p_club uuid,
  p_role text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_club_name text;
  v_previous text;
  v_name text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('owner', 'organizer', 'desk', 'none') then
    raise exception 'unknown desk role %', p_role using errcode = '22023';
  end if;

  if p_role = 'none'
     and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    raise exception 'A reason of at least 5 characters is needed to remove access.'
      using errcode = '22023';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no account has that id' using errcode = 'P0002';
  end if;

  select c.name into v_club_name from public.clubs c where c.id = p_club;
  if not found then
    raise exception 'no club has that id' using errcode = 'P0002';
  end if;

  select cm.role into v_previous
  from public.club_members cm
  where cm.club_id = p_club and cm.user_id = p_user;

  if p_role = 'none' then
    delete from public.club_members cm where cm.club_id = p_club and cm.user_id = p_user;
  else
    v_name := coalesce(public.god_display_name(p_user), 'Account');
    insert into public.club_members (club_id, user_id, role, display_name)
    values (p_club, p_user, p_role, v_name)
    on conflict (club_id, user_id) do update set role = excluded.role;
  end if;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor, p_user, v_email, 'desk_role',
    jsonb_build_object(
      'clubId', p_club, 'clubName', v_club_name, 'role', p_role, 'previous', v_previous
    ),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.god_set_desk_role(uuid, uuid, text, text) is
  'Sets or removes a club desk role. Owner only.';

-- 6. Suspend and restore ------------------------------------------------------------------------

-- Suspending copies the person's access into `previous` before removing it. A suspended owner
-- cannot be the last active owner, and nobody suspends their own account.

create function public.god_suspend(
  p_user uuid,
  p_apps text[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_app text;
  v_previous jsonb;
  v_other_owners integer;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  if p_user = v_actor then
    raise exception 'You cannot suspend your own account.' using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is needed.' using errcode = '22023';
  end if;

  if p_apps is null or cardinality(p_apps) = 0 then
    raise exception 'Choose at least one app.' using errcode = '22023';
  end if;

  foreach v_app in array p_apps loop
    if v_app not in ('workspace', 'desk', 'tabulator') then
      raise exception 'unknown app %', v_app using errcode = '22023';
    end if;
  end loop;

  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no account has that id' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.god_suspensions g
    where g.user_id = p_user and g.restored_at is null
  ) then
    raise exception 'that account is already suspended' using errcode = '23505';
  end if;

  if 'workspace' = any (p_apps) then
    select count(*) into v_other_owners
    from public.workspace_members m
    where m.role = 'owner' and m.status = 'active' and m.user_id <> p_user;

    if v_other_owners = 0 and exists (
      select 1 from public.workspace_members m
      where m.user_id = p_user and m.role = 'owner' and m.status = 'active'
    ) then
      raise exception 'the workspace needs at least one active owner' using errcode = '23514';
    end if;
  end if;

  v_previous := jsonb_build_object(
    'workspace',
    (
      select jsonb_build_object('role', m.role, 'status', m.status)
      from public.workspace_members m
      where m.user_id = p_user
    ),
    'desk',
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('clubId', c.id, 'clubName', c.name, 'role', cm.role)
                 order by c.name
               )
        from public.club_members cm
        join public.clubs c on c.id = cm.club_id
        where cm.user_id = p_user
      ),
      '[]'::jsonb
    ),
    'tabulator',
    coalesce(
      (select (u.raw_app_meta_data ->> 'scorecard_role') = 'tabulation' from auth.users u where u.id = p_user),
      false
    )
  );

  insert into public.god_suspensions (user_id, suspended_by, reason, apps, previous)
  values (p_user, v_actor, btrim(p_reason), p_apps, v_previous)
  on conflict (user_id) do update
    set suspended_at = now(),
        suspended_by = excluded.suspended_by,
        reason = excluded.reason,
        apps = excluded.apps,
        previous = excluded.previous,
        restored_at = null;

  if 'workspace' = any (p_apps) then
    delete from public.workspace_members m where m.user_id = p_user;
  end if;

  if 'desk' = any (p_apps) then
    delete from public.club_members cm where cm.user_id = p_user;
  end if;

  if 'tabulator' = any (p_apps) then
    update auth.users u
       set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'scorecard_role'
     where u.id = p_user;
  end if;

  delete from auth.sessions s where s.user_id = p_user;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor, p_user, v_email, 'suspend',
    jsonb_build_object('apps', p_apps, 'previous', v_previous),
    btrim(p_reason)
  );
end;
$$;

comment on function public.god_suspend(uuid, text[], text) is
  'Reversible suspend: records what the person had, removes the chosen roles, signs them out everywhere.';

create function public.god_restore(p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_previous jsonb;
  v_workspace jsonb;
  v_item jsonb;
  v_name text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no account has that id' using errcode = 'P0002';
  end if;

  select g.previous into v_previous
  from public.god_suspensions g
  where g.user_id = p_user and g.restored_at is null;

  if not found then
    raise exception 'that account is not suspended' using errcode = 'P0002';
  end if;

  v_workspace := v_previous -> 'workspace';
  if v_workspace is not null and jsonb_typeof(v_workspace) = 'object' then
    v_name := coalesce(public.god_display_name(p_user), 'Account');
    insert into public.workspace_members (user_id, role, status, display_name, invited_by)
    values (
      p_user,
      v_workspace ->> 'role',
      coalesce(nullif(v_workspace ->> 'status', ''), 'active'),
      v_name,
      v_actor
    )
    on conflict (user_id) do update
      set role = excluded.role, status = excluded.status;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(v_previous -> 'desk', '[]'::jsonb))
  loop
    if exists (select 1 from public.clubs c where c.id = (v_item ->> 'clubId')::uuid) then
      v_name := coalesce(public.god_display_name(p_user), 'Account');
      insert into public.club_members (club_id, user_id, role, display_name)
      values ((v_item ->> 'clubId')::uuid, p_user, v_item ->> 'role', v_name)
      on conflict (club_id, user_id) do update set role = excluded.role;
    end if;
  end loop;

  if coalesce((v_previous ->> 'tabulator')::boolean, false) then
    update auth.users u
       set raw_app_meta_data =
             coalesce(u.raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object('scorecard_role', 'tabulation')
     where u.id = p_user;
  end if;

  update public.god_suspensions g
     set restored_at = now()
   where g.user_id = p_user and g.restored_at is null;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor, p_user, v_email, 'restore',
    jsonb_build_object('previous', v_previous),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.god_restore(uuid, text) is
  'Puts back exactly what the suspension recorded. Owner only.';

-- 7. Sign out everywhere ------------------------------------------------------------------------

create function public.god_sign_out(p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_removed integer;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no account has that id' using errcode = 'P0002';
  end if;

  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_removed = row_count;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor, p_user, v_email, 'sign_out',
    jsonb_build_object('sessions', v_removed),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.god_sign_out(uuid, text) is
  'Deletes every session for one account. Owner only.';

-- 8. Audit records for actions the server does through the Auth admin API ------------------------

create function public.god_record(
  p_target uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  if p_action is null or char_length(btrim(p_action)) = 0 then
    raise exception 'an audit action is needed' using errcode = '22023';
  end if;

  if p_target is not null then
    select u.email::text into v_email from auth.users u where u.id = p_target;
  end if;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor,
    p_target,
    v_email,
    btrim(p_action),
    coalesce(p_details, '{}'::jsonb),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.god_record(uuid, text, jsonb, text) is
  'Writes one audit row for an action done through the Auth admin API. Owner only.';

-- 9. Read: the audit log ------------------------------------------------------------------------

create function public.god_audit_list(
  p_limit integer default 100,
  p_before timestamptz default null,
  p_action text default null,
  p_target uuid default null
)
returns table (
  id bigint,
  at timestamptz,
  actor uuid,
  actor_email text,
  target uuid,
  target_email text,
  action text,
  details jsonb,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  insert into public.god_audit (actor, action, details)
  values (v_actor, 'view_audit', jsonb_build_object('limit', v_limit));

  return query
    select
      a.id,
      a.at,
      a.actor,
      actor_user.email::text,
      a.target,
      coalesce(a.target_email, target_user.email::text),
      a.action,
      a.details,
      a.reason
    from public.god_audit a
    left join auth.users actor_user on actor_user.id = a.actor
    left join auth.users target_user on target_user.id = a.target
    where (p_before is null or a.at < p_before)
      and (p_action is null or a.action = p_action)
      and (p_target is null or a.target = p_target)
    order by a.at desc, a.id desc
    limit v_limit;
end;
$$;

comment on function public.god_audit_list(integer, timestamptz, text, uuid) is
  'The audit log, newest first, with an action, person and date filter. Owner only.';

-- 10. Grants ------------------------------------------------------------------------------------

revoke all on function public.god_list_accounts() from public, anon;
revoke all on function public.god_list_clubs() from public, anon;
revoke all on function public.god_set_workspace_role(uuid, text, text) from public, anon;
revoke all on function public.god_set_desk_role(uuid, uuid, text, text) from public, anon;
revoke all on function public.god_suspend(uuid, text[], text) from public, anon;
revoke all on function public.god_restore(uuid, text) from public, anon;
revoke all on function public.god_sign_out(uuid, text) from public, anon;
revoke all on function public.god_record(uuid, text, jsonb, text) from public, anon;
revoke all on function public.god_audit_list(integer, timestamptz, text, uuid) from public, anon;

grant execute on function public.god_list_accounts() to authenticated;
grant execute on function public.god_list_clubs() to authenticated;
grant execute on function public.god_set_workspace_role(uuid, text, text) to authenticated;
grant execute on function public.god_set_desk_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.god_suspend(uuid, text[], text) to authenticated;
grant execute on function public.god_restore(uuid, text) to authenticated;
grant execute on function public.god_sign_out(uuid, text) to authenticated;
grant execute on function public.god_record(uuid, text, jsonb, text) to authenticated;
grant execute on function public.god_audit_list(integer, timestamptz, text, uuid) to authenticated;

-- 11. Self-check --------------------------------------------------------------------------------

do $$
declare
  v_rls boolean;
begin
  if to_regclass('public.god_audit') is null then
    raise exception 'god_audit was not created';
  end if;
  if to_regclass('public.god_suspensions') is null then
    raise exception 'god_suspensions was not created';
  end if;

  select c.relrowsecurity into v_rls from pg_class c where c.oid = 'public.god_audit'::regclass;
  if v_rls is not true then
    raise exception 'row level security is off on god_audit';
  end if;
  select c.relrowsecurity into v_rls from pg_class c where c.oid = 'public.god_suspensions'::regclass;
  if v_rls is not true then
    raise exception 'row level security is off on god_suspensions';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('god_audit', 'god_suspensions')
  ) then
    raise exception 'the god tables must have no policies';
  end if;

  if has_function_privilege('anon', 'public.god_list_accounts()', 'execute') then
    raise exception 'anon must not execute god_list_accounts';
  end if;
  if not has_function_privilege('authenticated', 'public.god_list_accounts()', 'execute') then
    raise exception 'authenticated must execute god_list_accounts';
  end if;
  if has_function_privilege('authenticated', 'public.god_suspend(uuid, text[], text)', 'execute') is not true then
    raise exception 'authenticated must execute god_suspend';
  end if;
end $$;

commit;

-- ============================================================
-- Checks
-- ============================================================

-- Both tables exist, have row level security on, and have no policies.
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
 where c.oid in ('public.god_audit'::regclass, 'public.god_suspensions'::regclass)
 order by c.relname;

-- Every god_* function exists, is security definer, and is not executable by anon.
select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'god\_%'
 order by p.proname;

-- The owner gate answers for the signed-in account. Run this while signed in as the owner.
-- It must return true for an active workspace owner and false for everyone else.
select public.ws_has_role(array['owner']) as caller_is_owner;

-- After the first real action, the newest audit rows:
select id, at, action, target_email, reason
  from public.god_audit
 order by id desc
 limit 20;
