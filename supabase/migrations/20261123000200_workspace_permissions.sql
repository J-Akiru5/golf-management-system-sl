-- Workspace permissions: a role matrix plus per-person overrides, enforced in the menu, the routes,
-- the server actions and here.
--
-- NOT purely additive. It creates two tables and five functions, and it NARROWS existing objects:
--   * eight tables get their policies replaced with the same rule plus ws_can;
--   * the two Realtime policies get ws_can;
--   * six existing functions are renamed to *_checked and called through a new wrapper that asks
--     ws_can first.
-- Nothing is widened: every existing role check stays in place, and the owner's own row can never be
-- lowered. An override can therefore only give access up to the old role gate, never past it.
--
-- Apply this after 20261123000100. It reads public.god_audit, so god mode must be applied first.
-- The builder does not apply it. Apply docs/permissions/apply-on-live.sql.

-- 1. Tables -------------------------------------------------------------------------------------

create table public.ws_role_permissions (
  role text not null check (role in ('owner', 'partner', 'member')),
  page text not null check (char_length(btrim(page)) between 1 and 60),
  level text not null check (level in ('none', 'view', 'edit')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role, page)
);

comment on table public.ws_role_permissions is
  'What each workspace role may do on each page. Owner can never be lowered below edit.';

create table public.ws_user_permissions (
  user_id uuid not null references auth.users (id) on delete cascade,
  page text not null check (char_length(btrim(page)) between 1 and 60),
  level text not null check (level in ('none', 'view', 'edit')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, page)
);

comment on table public.ws_user_permissions is
  'One person''s override for one page. It wins over the role default. No row means use the role.';

alter table public.ws_role_permissions enable row level security;
alter table public.ws_user_permissions enable row level security;

revoke all on table public.ws_role_permissions from public, anon, authenticated;
revoke all on table public.ws_user_permissions from public, anon, authenticated;

-- No policy on either table: the functions below are the only door.

-- 2. Seed: the owner's role matrix of 21 Nov 2026 -----------------------------------------------

insert into public.ws_role_permissions (role, page, level) values
  ('owner', 'overview', 'edit'),
  ('owner', 'documents', 'edit'),
  ('owner', 'pipeline', 'edit'),
  ('owner', 'tasks', 'edit'),
  ('owner', 'settings.profile', 'edit'),
  ('owner', 'settings.members', 'edit'),
  ('owner', 'settings.ai_providers', 'edit'),
  ('owner', 'admin', 'edit'),
  ('partner', 'overview', 'edit'),
  ('partner', 'documents', 'edit'),
  ('partner', 'pipeline', 'edit'),
  ('partner', 'tasks', 'edit'),
  ('partner', 'settings.profile', 'edit'),
  ('partner', 'settings.members', 'view'),
  ('partner', 'settings.ai_providers', 'none'),
  ('partner', 'admin', 'none'),
  ('member', 'overview', 'edit'),
  ('member', 'documents', 'edit'),
  ('member', 'pipeline', 'view'),
  ('member', 'tasks', 'edit'),
  ('member', 'settings.profile', 'edit'),
  ('member', 'settings.members', 'none'),
  ('member', 'settings.ai_providers', 'none'),
  ('member', 'admin', 'none')
on conflict (role, page) do nothing;

-- 3. The effective level ------------------------------------------------------------------------

create function public.ws_effective_level(p_role text, p_user uuid, p_page text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role = 'owner' then 'edit'
    else coalesce(
      (
        select up.level
        from public.ws_user_permissions up
        where up.user_id = p_user and up.page = p_page
      ),
      (
        select rp.level
        from public.ws_role_permissions rp
        where rp.role = p_role and rp.page = p_page
      ),
      'none'
    )
  end;
$$;

comment on function public.ws_effective_level(text, uuid, text) is
  'The override if there is one, otherwise the role default, otherwise none. Internal only.';

revoke all on function public.ws_effective_level(text, uuid, text)
  from public, anon, authenticated;

-- ws_can is the one question the rest of the database asks. `view` means read; `edit` means change.
create function public.ws_can(p_page text, p_level text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_level text;
  v_need integer;
begin
  if p_level is null or p_level not in ('view', 'edit') then
    raise exception 'unknown access level %', p_level using errcode = '22023';
  end if;
  if p_page is null or char_length(btrim(p_page)) = 0 then
    raise exception 'a page is required' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.workspace_members m
  where m.user_id = v_user and m.status = 'active';

  if v_role is null then
    return false;
  end if;

  v_need := case p_level when 'edit' then 2 else 1 end;
  v_level := public.ws_effective_level(v_role, v_user, p_page);

  return (case v_level when 'edit' then 2 when 'view' then 1 else 0 end) >= v_need;
end;
$$;

comment on function public.ws_can(text, text) is
  'True when the caller''s effective level for a page is at least the level asked for.';

-- A void helper for the functions that wrap an existing body: it raises rather than returning.
create function public.ws_require(p_page text, p_level text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ws_can(p_page, p_level) then
    raise exception 'You do not have % access to that part of the workspace.', p_level
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.ws_require(text, text) from public, anon, authenticated;

-- 4. The four doors -----------------------------------------------------------------------------

-- Any active member: their effective level per page. The menu is built from this.
create function public.ws_my_access()
returns table (page text, level text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  select m.role into v_role
  from public.workspace_members m
  where m.user_id = v_user and m.status = 'active';

  if v_role is null then
    raise exception 'only an active workspace member can read their access'
      using errcode = '42501';
  end if;

  return query
    select p.page, public.ws_effective_level(v_role, v_user, p.page)
    from (select distinct rp.page from public.ws_role_permissions rp) p
    order by p.page;
end;
$$;

comment on function public.ws_my_access() is
  'The caller''s effective level for every page. Used by the menu; reads nothing about anyone else.';

-- Owner only: the whole matrix and every override, for the Permissions screen.
create function public.ws_permission_matrix()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roles jsonb;
  v_overrides jsonb;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('role', rp.role, 'page', rp.page, 'level', rp.level)
      order by rp.role, rp.page
    ),
    '[]'::jsonb
  )
  into v_roles
  from public.ws_role_permissions rp;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('userId', up.user_id, 'page', up.page, 'level', up.level)
      order by up.user_id, up.page
    ),
    '[]'::jsonb
  )
  into v_overrides
  from public.ws_user_permissions up;

  return jsonb_build_object('roles', v_roles, 'overrides', v_overrides);
end;
$$;

comment on function public.ws_permission_matrix() is
  'The role matrix and every per-person override. Owner only.';

create function public.ws_set_role_permission(
  p_role text,
  p_page text,
  p_level text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('owner', 'partner', 'member') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('none', 'view', 'edit') then
    raise exception 'unknown access level %', p_level using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is needed.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ws_role_permissions rp where rp.page = p_page) then
    raise exception 'unknown page %', p_page using errcode = '22023';
  end if;
  if p_role = 'owner' and p_level <> 'edit' then
    raise exception 'the owner keeps edit on every page' using errcode = '42501';
  end if;

  select rp.level into v_previous
  from public.ws_role_permissions rp
  where rp.role = p_role and rp.page = p_page;

  insert into public.ws_role_permissions (role, page, level, updated_by)
  values (p_role, p_page, p_level, v_actor)
  on conflict (role, page) do update
    set level = excluded.level,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.god_audit (actor, action, details, reason)
  values (
    v_actor,
    'role_permission',
    jsonb_build_object('role', p_role, 'page', p_page, 'level', p_level, 'previous', v_previous),
    v_reason
  );
end;
$$;

comment on function public.ws_set_role_permission(text, text, text, text) is
  'Sets one cell of the role matrix and records it. Owner only; the owner role stays at edit.';

-- A null level clears the override and puts the person back on their role default.
create function public.ws_set_user_permission(
  p_user uuid,
  p_page text,
  p_level text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role text;
  v_email text;
  v_previous text;
begin
  if not public.ws_has_role(array['owner']) then
    raise exception 'Only a workspace owner can do that.' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'choose a person' using errcode = '22023';
  end if;
  if p_level is not null and p_level not in ('none', 'view', 'edit') then
    raise exception 'unknown access level %', p_level using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is needed.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ws_role_permissions rp where rp.page = p_page) then
    raise exception 'unknown page %', p_page using errcode = '22023';
  end if;

  select m.role into v_role
  from public.workspace_members m
  where m.user_id = p_user and m.status = 'active';

  if v_role is null then
    raise exception 'that account is not an active workspace member' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'an owner keeps edit on every page' using errcode = '42501';
  end if;

  select up.level into v_previous
  from public.ws_user_permissions up
  where up.user_id = p_user and up.page = p_page;

  if p_level is null then
    delete from public.ws_user_permissions up
    where up.user_id = p_user and up.page = p_page;
  else
    insert into public.ws_user_permissions (user_id, page, level, updated_by)
    values (p_user, p_page, p_level, v_actor)
    on conflict (user_id, page) do update
      set level = excluded.level,
          updated_by = excluded.updated_by,
          updated_at = now();
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user;

  insert into public.god_audit (actor, target, target_email, action, details, reason)
  values (
    v_actor,
    p_user,
    v_email,
    'user_permission',
    jsonb_build_object('page', p_page, 'level', p_level, 'previous', v_previous),
    v_reason
  );
end;
$$;

comment on function public.ws_set_user_permission(uuid, text, text, text) is
  'Sets or clears one person''s override for one page and records it. Owner only.';

-- 5. Existing functions: ask ws_can first, then do exactly what they did ------------------------

alter function public.ws_add_member(text, text, text)
  rename to ws_add_member_checked;
alter function public.ws_list_members() rename to ws_list_members_checked;
alter function public.ws_list_ai_providers() rename to ws_list_ai_providers_checked;
alter function public.ws_save_ai_provider(text, text, integer, boolean, text, text, text, text)
  rename to ws_save_ai_provider_checked;
alter function public.ws_set_ai_provider_key(text, text, text, text, integer, text, text)
  rename to ws_set_ai_provider_key_checked;
alter function public.ws_clear_ai_provider_key(text, text)
  rename to ws_clear_ai_provider_key_checked;

revoke all on function public.ws_add_member_checked(text, text, text)
  from public, anon, authenticated;
revoke all on function public.ws_list_members_checked()
  from public, anon, authenticated;
revoke all on function public.ws_list_ai_providers_checked()
  from public, anon, authenticated;
revoke all on function public.ws_save_ai_provider_checked(
  text, text, integer, boolean, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.ws_set_ai_provider_key_checked(
  text, text, text, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public.ws_clear_ai_provider_key_checked(text, text)
  from public, anon, authenticated;

create function public.ws_add_member(p_email text, p_role text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ws_require('settings.members', 'edit');
  return public.ws_add_member_checked(p_email, p_role, p_display_name);
end;
$$;

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
  perform public.ws_require('settings.members', 'view');
  return query select * from public.ws_list_members_checked();
end;
$$;

create function public.ws_list_ai_providers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.ws_require('settings.ai_providers', 'view');
  return public.ws_list_ai_providers_checked();
end;
$$;

create function public.ws_save_ai_provider(
  p_provider text,
  p_model text,
  p_priority integer,
  p_enabled boolean,
  p_reasoning_effort text,
  p_base_url text,
  p_api_key_env text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ws_require('settings.ai_providers', 'edit');
  perform public.ws_save_ai_provider_checked(
    p_provider, p_model, p_priority, p_enabled, p_reasoning_effort, p_base_url, p_api_key_env,
    p_reason
  );
end;
$$;

create function public.ws_set_ai_provider_key(
  p_provider text,
  p_ciphertext text,
  p_iv text,
  p_tag text,
  p_key_version integer,
  p_hint text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ws_require('settings.ai_providers', 'edit');
  perform public.ws_set_ai_provider_key_checked(
    p_provider, p_ciphertext, p_iv, p_tag, p_key_version, p_hint, p_reason
  );
end;
$$;

create function public.ws_clear_ai_provider_key(p_provider text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ws_require('settings.ai_providers', 'edit');
  perform public.ws_clear_ai_provider_key_checked(p_provider, p_reason);
end;
$$;

-- 6. Policies: the same rule as before, plus ws_can ---------------------------------------------

-- Documents
drop policy ws_docs_read on public.ws_docs;
create policy ws_docs_read on public.ws_docs
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('documents', 'view')));

drop policy ws_docs_create on public.ws_docs;
create policy ws_docs_create on public.ws_docs
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('documents', 'edit'))
    and created_by = (select auth.uid())
  );

drop policy ws_docs_edit on public.ws_docs;
create policy ws_docs_edit on public.ws_docs
  for update to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('documents', 'edit')))
  with check ((select public.ws_is_member()) and (select public.ws_can('documents', 'edit')));

drop policy ws_docs_delete on public.ws_docs;
create policy ws_docs_delete on public.ws_docs
  for delete to authenticated
  using (
    (select public.ws_has_role(array['owner', 'partner']))
    and (select public.ws_can('documents', 'edit'))
  );

drop policy ws_doc_states_read on public.ws_doc_states;
create policy ws_doc_states_read on public.ws_doc_states
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('documents', 'view')));

drop policy ws_doc_states_create on public.ws_doc_states;
create policy ws_doc_states_create on public.ws_doc_states
  for insert to authenticated
  with check ((select public.ws_is_member()) and (select public.ws_can('documents', 'edit')));

drop policy ws_doc_states_edit on public.ws_doc_states;
create policy ws_doc_states_edit on public.ws_doc_states
  for update to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('documents', 'edit')))
  with check ((select public.ws_is_member()) and (select public.ws_can('documents', 'edit')));

drop policy ws_doc_snapshots_read on public.ws_doc_snapshots;
create policy ws_doc_snapshots_read on public.ws_doc_snapshots
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('documents', 'view')));

drop policy ws_doc_snapshots_create on public.ws_doc_snapshots;
create policy ws_doc_snapshots_create on public.ws_doc_snapshots
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('documents', 'edit'))
    and created_by = (select auth.uid())
  );

drop policy ws_doc_snapshots_delete on public.ws_doc_snapshots;
create policy ws_doc_snapshots_delete on public.ws_doc_snapshots
  for delete to authenticated
  using (
    (select public.ws_has_role(array['owner', 'partner']))
    and (select public.ws_can('documents', 'edit'))
  );

-- Pipeline
drop policy ws_pipeline_cards_read on public.ws_pipeline_cards;
create policy ws_pipeline_cards_read on public.ws_pipeline_cards
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('pipeline', 'view')));

drop policy ws_pipeline_cards_create on public.ws_pipeline_cards;
create policy ws_pipeline_cards_create on public.ws_pipeline_cards
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('pipeline', 'edit'))
    and created_by = (select auth.uid())
  );

drop policy ws_pipeline_cards_edit on public.ws_pipeline_cards;
create policy ws_pipeline_cards_edit on public.ws_pipeline_cards
  for update to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('pipeline', 'edit')))
  with check ((select public.ws_is_member()) and (select public.ws_can('pipeline', 'edit')));

drop policy ws_pipeline_cards_delete on public.ws_pipeline_cards;
create policy ws_pipeline_cards_delete on public.ws_pipeline_cards
  for delete to authenticated
  using (
    (select public.ws_has_role(array['owner', 'partner']))
    and (select public.ws_can('pipeline', 'edit'))
  );

-- Tasks and comments
drop policy ws_tasks_read on public.ws_tasks;
create policy ws_tasks_read on public.ws_tasks
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('tasks', 'view')));

drop policy ws_tasks_create on public.ws_tasks;
create policy ws_tasks_create on public.ws_tasks
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('tasks', 'edit'))
    and created_by = (select auth.uid())
  );

drop policy ws_tasks_edit on public.ws_tasks;
create policy ws_tasks_edit on public.ws_tasks
  for update to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('tasks', 'edit')))
  with check ((select public.ws_is_member()) and (select public.ws_can('tasks', 'edit')));

drop policy ws_tasks_delete on public.ws_tasks;
create policy ws_tasks_delete on public.ws_tasks
  for delete to authenticated
  using (
    (select public.ws_has_role(array['owner', 'partner']))
    and (select public.ws_can('tasks', 'edit'))
  );

drop policy ws_task_comments_read on public.ws_task_comments;
create policy ws_task_comments_read on public.ws_task_comments
  for select to authenticated
  using ((select public.ws_is_member()) and (select public.ws_can('tasks', 'view')));

drop policy ws_task_comments_create on public.ws_task_comments;
create policy ws_task_comments_create on public.ws_task_comments
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('tasks', 'edit'))
    and author_id = (select auth.uid())
  );

drop policy ws_task_comments_edit on public.ws_task_comments;
create policy ws_task_comments_edit on public.ws_task_comments
  for update to authenticated
  using (
    (select public.ws_is_member())
    and (select public.ws_can('tasks', 'edit'))
    and author_id = (select auth.uid())
  )
  with check (
    (select public.ws_is_member())
    and (select public.ws_can('tasks', 'edit'))
    and author_id = (select auth.uid())
  );

drop policy ws_task_comments_delete on public.ws_task_comments;
create policy ws_task_comments_delete on public.ws_task_comments
  for delete to authenticated
  using (
    (select public.ws_is_member())
    and (select public.ws_can('tasks', 'edit'))
    and (
      author_id = (select auth.uid())
      or (select public.ws_has_role(array['owner', 'partner']))
    )
  );

-- Members: the read policy stays open to every active member, because task assignment, the board
-- owner list and the document "last edited by" all need names. Managing a member is the page.
drop policy workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (
    ((select public.ws_has_role(array['owner'])) and (select public.ws_can('settings.members', 'edit')))
    or user_id = (select auth.uid())
  )
  with check (
    ((select public.ws_has_role(array['owner'])) and (select public.ws_can('settings.members', 'edit')))
    or user_id = (select auth.uid())
  );

drop policy workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    (select public.ws_has_role(array['owner']))
    and (select public.ws_can('settings.members', 'edit'))
  );

-- Realtime: a channel carries the rows of the page it belongs to.
drop policy ws_members_receive on realtime.messages;
create policy ws_members_receive on realtime.messages
  for select to authenticated
  using (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (
      (
        (select realtime.topic()) = 'ws:board'
        and (select public.ws_can('pipeline', 'view'))
      )
      or (
        (select realtime.topic()) = 'ws:tasks'
        and (select public.ws_can('tasks', 'view'))
      )
      or (
        (select realtime.topic()) like 'ws:doc:%'
        and (select public.ws_can('documents', 'view'))
        and exists (
          select 1
          from public.ws_docs d
          where d.id::text = substr((select realtime.topic()), 8)
        )
      )
    )
  );

drop policy ws_members_send on realtime.messages;
create policy ws_members_send on realtime.messages
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (select public.ws_can('documents', 'edit'))
    and (select realtime.topic()) like 'ws:doc:%'
    and exists (
      select 1
      from public.ws_docs d
      where d.id::text = substr((select realtime.topic()), 8)
    )
  );

-- 7. Grants -------------------------------------------------------------------------------------

revoke all on function public.ws_my_access() from public, anon;
revoke all on function public.ws_permission_matrix() from public, anon;
revoke all on function public.ws_set_role_permission(text, text, text, text) from public, anon;
revoke all on function public.ws_set_user_permission(uuid, text, text, text) from public, anon;
revoke all on function public.ws_can(text, text) from public, anon;

grant execute on function public.ws_my_access() to authenticated;
grant execute on function public.ws_permission_matrix() to authenticated;
grant execute on function public.ws_set_role_permission(text, text, text, text) to authenticated;
grant execute on function public.ws_set_user_permission(uuid, text, text, text) to authenticated;
grant execute on function public.ws_can(text, text) to authenticated;

grant execute on function public.ws_add_member(text, text, text) to authenticated;
grant execute on function public.ws_list_members() to authenticated;
grant execute on function public.ws_list_ai_providers() to authenticated;
grant execute on function public.ws_save_ai_provider(
  text, text, integer, boolean, text, text, text, text
) to authenticated;
grant execute on function public.ws_set_ai_provider_key(
  text, text, text, text, integer, text, text
) to authenticated;
grant execute on function public.ws_clear_ai_provider_key(text, text) to authenticated;

-- 8. Self-check ---------------------------------------------------------------------------------

do $$
declare
  v_rows integer;
  v_rls integer;
  v_policies integer;
  v_functions integer;
begin
  if to_regclass('public.ws_role_permissions') is null
     or to_regclass('public.ws_user_permissions') is null then
    raise exception 'the permission tables were not created';
  end if;

  select count(*) into v_rows from public.ws_role_permissions;
  if v_rows <> 24 then
    raise exception 'expected 24 seeded role permissions, found %', v_rows;
  end if;

  select count(*) into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('ws_role_permissions', 'ws_user_permissions')
    and c.relrowsecurity;
  if v_rls <> 2 then
    raise exception 'row level security is off on a permission table';
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('ws_role_permissions', 'ws_user_permissions');
  if v_policies <> 0 then
    raise exception 'the permission tables must have no policy';
  end if;

  select count(*) into v_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'ws_can',
      'ws_my_access',
      'ws_permission_matrix',
      'ws_set_role_permission',
      'ws_set_user_permission'
    );
  if v_functions <> 5 then
    raise exception 'expected 5 permission functions, found %', v_functions;
  end if;

  if has_function_privilege('anon', 'public.ws_my_access()', 'execute') then
    raise exception 'anon must not execute ws_my_access';
  end if;
  if not has_function_privilege('authenticated', 'public.ws_my_access()', 'execute') then
    raise exception 'authenticated must execute ws_my_access';
  end if;
  if not has_function_privilege('authenticated', 'public.ws_can(text, text)', 'execute') then
    raise exception 'authenticated must execute ws_can';
  end if;
  if has_function_privilege('authenticated', 'public.ws_effective_level(text, uuid, text)', 'execute') then
    raise exception 'ws_effective_level is internal and must not be callable by authenticated';
  end if;
  if has_function_privilege('authenticated', 'public.ws_add_member_checked(text, text, text)', 'execute') then
    raise exception 'the unchecked ws_add_member must not be callable by authenticated';
  end if;
  if has_function_privilege('authenticated', 'public.ws_list_ai_providers_checked()', 'execute') then
    raise exception 'the unchecked ws_list_ai_providers must not be callable by authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.ws_add_member(text, text, text)', 'execute') then
    raise exception 'the wrapped ws_add_member must be callable by authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.ws_list_ai_providers()', 'execute') then
    raise exception 'the wrapped ws_list_ai_providers must be callable by authenticated';
  end if;
end $$;
