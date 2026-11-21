-- TeeLine Workspace: two-way GitHub issue sync for the Tasks board (#350), as ONE paste-ready script
-- for the Supabase SQL editor. Generated from
-- supabase/migrations/20261123000500_github_task_sync.sql (verbatim below). Do not edit by hand.
--
-- BEFORE you run it:
--   1. Be on the project the golf app and apps/ops both use (verify with `select current_database();`
--      and the project ref in the Supabase dashboard; never run this against production by habit).
--   2. Set GITHUB_TOKEN and GITHUB_WEBHOOK_SECRET on the Vercel project that runs apps/ops, then
--      redeploy. Without them the screen still loads and says what is missing; the sync stays off.
--   3. It is additive: eight nullable link columns on ws_tasks, two new tables, four functions and
--      two triggers. Nothing existing changes meaning. The lock is the short one that adding
--      nullable columns takes on a small table.
--   4. Run it once. It is wrapped in one transaction, so a failure changes nothing.
--
-- AFTER it runs: the checks at the bottom should return eight columns, two tables with row level
-- security, and the sync functions. Then open Settings in the workspace; the GitHub section should
-- say the token and secret are present.

begin;

-- ============================================================
-- 20261123000500_github_task_sync.sql
-- ============================================================
-- TeeLine Workspace: two-way sync between GitHub issues and workspace tasks (#350).
-- ADDITIVE: new nullable link columns on ws_tasks, two new tables, four functions and two triggers.
-- Nothing existing changes meaning, so the app keeps working before, during and after the run. The
-- only lock is the brief one that adding nullable columns and a defaulted array takes on ws_tasks.
--
-- Who reads and writes what:
--   ws_tasks GitHub columns : the sync only. A trigger refuses a direct write from the app, so a
--                             member cannot fake a link by calling the table's REST endpoint.
--   github_user_map         : an active member may read it; only an owner may change it.
--   github_sync_log         : an owner may read it; nobody writes it through the table. The two sync
--                             functions append the rows, and no table grant or policy exists.
--
-- The webhook has no signed-in user, so its write goes through gh_apply_issue, a SECURITY DEFINER
-- function granted to service_role alone. The workspace's own outbound push calls
-- gh_mark_task_synced as the signed-in member who made the edit.
--
-- The loop guard is github_updated_at: an issue event whose updated_at is not newer than the one
-- already stored is an echo (GitHub reports the change we just pushed) and is skipped. A conflict is
-- decided by comparing the task's last workspace edit with the last sync (synced_at) and with the
-- event's timestamp: a sync-only write sets updated_at and synced_at in the same statement, so it
-- never looks like a workspace edit.

-- 1. Link columns on tasks -----------------------------------------------------------------------

alter table public.ws_tasks
  add column github_issue_number integer,
  add column github_url text,
  add column github_state text,
  add column github_labels text[] not null default '{}'::text[],
  add column github_milestone text,
  add column github_assignees text[] not null default '{}'::text[],
  add column github_updated_at timestamptz,
  add column synced_at timestamptz;

alter table public.ws_tasks
  add constraint ws_tasks_github_issue_number_key unique (github_issue_number),
  add constraint ws_tasks_github_issue_number_check
    check (github_issue_number is null or github_issue_number > 0),
  add constraint ws_tasks_github_state_check
    check (github_state is null or github_state in ('open', 'closed')),
  add constraint ws_tasks_github_url_check
    check (github_url is null or (github_url ~ '^https://' and char_length(github_url) <= 500)),
  add constraint ws_tasks_github_milestone_check
    check (github_milestone is null or char_length(github_milestone) <= 120),
  add constraint ws_tasks_github_labels_check
    check (cardinality(github_labels) <= 50),
  add constraint ws_tasks_github_assignees_check
    check (cardinality(github_assignees) <= 50);

comment on column public.ws_tasks.github_issue_number is
  'The linked GitHub issue number. NULL means the task is not linked to GitHub.';
comment on column public.ws_tasks.github_updated_at is
  'The issue updated_at last seen or pushed. An older or equal event is an echo and is skipped.';
comment on column public.ws_tasks.synced_at is
  'When this row last synced with GitHub.';

create index ws_tasks_github_issue on public.ws_tasks (github_issue_number)
  where github_issue_number is not null;

-- 2. Which GitHub login belongs to which member ---------------------------------------------------

create table public.github_user_map (
  -- GitHub treats a login case-insensitively, so the stored key is the lower-case form. A login
  -- starts and ends with a letter or digit and may hold single hyphens inside, up to 39 characters.
  github_login text primary key
    check (github_login = lower(github_login)
      and github_login ~ '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$'),
  member_id uuid not null references public.workspace_members (user_id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.github_user_map is
  'Owner-maintained link between a GitHub login and a workspace member. Used for assignees both ways.';

create index github_user_map_member on public.github_user_map (member_id);

create trigger github_user_map_touch
  before update on public.github_user_map
  for each row execute function public.ws_touch_updated_at();

-- 3. What changed, which way, and what happened ---------------------------------------------------

create table public.github_sync_log (
  id bigint generated always as identity primary key,
  task_id uuid references public.ws_tasks (id) on delete set null,
  issue_number integer,
  direction text not null check (direction in ('inbound', 'outbound')),
  outcome text not null check (outcome in ('applied', 'skipped', 'conflict', 'error')),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.github_sync_log is
  'One row per sync attempt. Never holds a token, a secret or a full issue body.';

create index github_sync_log_recent on public.github_sync_log (created_at desc);

-- 4. Write guards on ws_tasks --------------------------------------------------------------------
-- A sync-only write is marked by the teeline.github_sync setting, which the functions below set for
-- their own transaction. Without the mark, the GitHub columns cannot be changed or set on insert, so
-- the only writers are the two functions.

create function public.gh_tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('teeline.github_sync', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.github_issue_number is not null
       or new.github_url is not null
       or new.github_state is not null
       or new.github_milestone is not null
       or new.github_updated_at is not null
       or new.synced_at is not null
       or cardinality(new.github_labels) > 0
       or cardinality(new.github_assignees) > 0 then
      raise exception 'the GitHub columns on a task are written by the sync only'
        using errcode = '42501';
    end if;
  else
    if new.github_issue_number is distinct from old.github_issue_number
       or new.github_url is distinct from old.github_url
       or new.github_state is distinct from old.github_state
       or new.github_milestone is distinct from old.github_milestone
       or new.github_updated_at is distinct from old.github_updated_at
       or new.synced_at is distinct from old.synced_at
       or new.github_labels is distinct from old.github_labels
       or new.github_assignees is distinct from old.github_assignees then
      raise exception 'the GitHub columns on a task are written by the sync only'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.gh_tasks_guard() from public, anon;

create trigger gh_tasks_guard
  before insert or update on public.ws_tasks
  for each row execute function public.gh_tasks_guard();

-- 5. Helpers -------------------------------------------------------------------------------------

-- The first member mapped from a list of GitHub logins, or null when none is mapped. Order is not
-- promised beyond "one of them", which is why the screen shows every login as well.
create function public.gh_sync_member_for(p_logins text[])
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.member_id
  from public.github_user_map m
  where m.github_login = any (
    select lower(login) from unnest(coalesce(p_logins, '{}'::text[])) as login
  )
  order by m.github_login
  limit 1;
$$;

revoke all on function public.gh_sync_member_for(text[]) from public, anon;
grant execute on function public.gh_sync_member_for(text[]) to authenticated, service_role;

-- 6. GitHub -> workspace, used by the webhook and the owner's import ---------------------------------
-- Callable with the service role only: the caller has already been proved by the HMAC signature or
-- by the owner check in the app. Returns the outcome and the resulting row, so the route can push a
-- conflicting workspace title back out.

create function public.gh_apply_issue(p_issue jsonb, p_direction text default 'inbound')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer := nullif(p_issue ->> 'issue_number', '')::integer;
  v_updated timestamptz := nullif(p_issue ->> 'updated_at', '')::timestamptz;
  v_title text := btrim(coalesce(p_issue ->> 'title', ''));
  v_body text := p_issue ->> 'body';
  v_state text := coalesce(nullif(p_issue ->> 'state', ''), 'open');
  v_url text := nullif(btrim(coalesce(p_issue ->> 'url', '')), '');
  v_milestone text := nullif(btrim(coalesce(p_issue ->> 'milestone', '')), '');
  v_labels text[] := '{}'::text[];
  v_assignees text[] := '{}'::text[];
  v_member uuid;
  v_task public.ws_tasks%rowtype;
  v_title_next text;
  v_body_next text;
  v_status_next text;
  v_assignee_next uuid;
  v_conflict boolean := false;
  v_position double precision;
begin
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'unknown direction %', p_direction using errcode = '22023';
  end if;
  if v_number is null or v_number <= 0 then
    raise exception 'the issue payload has no issue number' using errcode = '22023';
  end if;
  if v_updated is null then
    raise exception 'the issue payload has no updated_at' using errcode = '22023';
  end if;
  if v_title = '' then
    raise exception 'the issue payload has no title' using errcode = '22023';
  end if;
  if v_state not in ('open', 'closed') then
    raise exception 'unknown issue state %', v_state using errcode = '22023';
  end if;

  -- Labels and assignees arrive as JSON arrays of strings. A missing key means "not reported" and
  -- is stored as empty; the app always sends both.
  if jsonb_typeof(p_issue -> 'labels') = 'array' then
    select coalesce(array_agg(value order by value), '{}'::text[])
      into v_labels
      from jsonb_array_elements_text(p_issue -> 'labels') as value;
  end if;
  if jsonb_typeof(p_issue -> 'assignees') = 'array' then
    select coalesce(array_agg(value order by value), '{}'::text[])
      into v_assignees
      from jsonb_array_elements_text(p_issue -> 'assignees') as value;
  end if;

  perform set_config('teeline.github_sync', 'on', true);

  select * into v_task
  from public.ws_tasks
  where github_issue_number = v_number
  for update;

  if not found then
    v_member := public.gh_sync_member_for(v_assignees);
    select coalesce(max(position), 0) + 1000 into v_position
    from public.ws_tasks
    where status = case when v_state = 'closed' then 'done' else 'todo' end;

    insert into public.ws_tasks (
      title, description, assignee_id, status, position,
      github_issue_number, github_url, github_state, github_labels, github_milestone,
      github_assignees, github_updated_at, synced_at
    )
    values (
      left(v_title, 200),
      left(v_body, 20000),
      v_member,
      case when v_state = 'closed' then 'done' else 'todo' end,
      v_position,
      v_number, v_url, v_state, v_labels, v_milestone,
      v_assignees, v_updated, now()
    )
    returning * into v_task;

    insert into public.github_sync_log (task_id, issue_number, direction, outcome, detail)
    values (v_task.id, v_number, p_direction, 'applied', 'New GitHub issue added as a task');

    return jsonb_build_object('status', 'created', 'task', to_jsonb(v_task));
  end if;

  -- An event no newer than the last one we saw is our own change coming back, or a replay.
  if v_task.github_updated_at is not null and v_updated <= v_task.github_updated_at then
    insert into public.github_sync_log (task_id, issue_number, direction, outcome, detail)
    values (v_task.id, v_number, p_direction, 'skipped', 'No newer change than the last sync');
    return jsonb_build_object('status', 'skipped', 'task', to_jsonb(v_task));
  end if;

  -- The workspace row wins only when it holds an edit the last sync has not seen and that edit is
  -- newer than this GitHub change. Otherwise GitHub's version is applied.
  v_conflict := v_task.updated_at > coalesce(v_task.synced_at, v_task.created_at)
                and v_task.updated_at > v_updated;

  if v_conflict then
    v_title_next := v_task.title;
    v_body_next := v_task.description;
    v_status_next := v_task.status;
    v_assignee_next := v_task.assignee_id;
  else
    v_title_next := left(v_title, 200);
    v_body_next := left(v_body, 20000);
    -- Closing the issue completes the task. Reopening it returns a done task to to do; a task that
    -- is in progress or blocked keeps that column.
    v_status_next := case
      when v_state = 'closed' then 'done'
      when v_task.status = 'done' then 'todo'
      else v_task.status
    end;
    -- No assignees on the issue means nobody is assigned. Logins nobody mapped leave the current
    -- assignee alone rather than guessing.
    v_assignee_next := case
      when cardinality(v_assignees) = 0 then null
      else coalesce(public.gh_sync_member_for(v_assignees), v_task.assignee_id)
    end;
  end if;

  update public.ws_tasks set
    title = v_title_next,
    description = v_body_next,
    status = v_status_next,
    assignee_id = v_assignee_next,
    github_url = v_url,
    github_state = v_state,
    github_labels = v_labels,
    github_milestone = v_milestone,
    github_assignees = v_assignees,
    github_updated_at = v_updated,
    synced_at = now()
  where id = v_task.id
  returning * into v_task;

  insert into public.github_sync_log (task_id, issue_number, direction, outcome, detail)
  values (
    v_task.id,
    v_number,
    p_direction,
    case when v_conflict then 'conflict' else 'applied' end,
    case
      when v_conflict
        then 'Both changed; the newer workspace edit was kept for the shared fields'
      else 'GitHub change applied'
    end
  );

  return jsonb_build_object(
    'status', case when v_conflict then 'conflict' else 'applied' end,
    'task', to_jsonb(v_task)
  );
end;
$$;

revoke all on function public.gh_apply_issue(jsonb, text) from public, anon, authenticated;
grant execute on function public.gh_apply_issue(jsonb, text) to service_role;

-- 7. Workspace -> GitHub: record the result of a push ---------------------------------------------
-- Called by the signed-in member's server action after the GitHub API call, with the issue GitHub
-- returned. The member check here keeps the mirrored columns from being written by a session that is
-- not on the workspace list.

create function public.gh_mark_task_synced(
  p_task_id uuid,
  p_issue jsonb,
  p_direction text,
  p_outcome text,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  v_labels text[] := '{}'::text[];
  v_assignees text[] := '{}'::text[];
begin
  if not public.ws_is_member() then
    raise exception 'only an active workspace member can record a GitHub sync' using errcode = '42501';
  end if;
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'unknown direction %', p_direction using errcode = '22023';
  end if;
  if p_outcome not in ('applied', 'skipped', 'conflict', 'error') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;
  if p_detail is not null and char_length(p_detail) > 500 then
    raise exception 'the detail is longer than 500 characters' using errcode = '22023';
  end if;

  perform set_config('teeline.github_sync', 'on', true);

  if p_issue is not null then
    v_number := nullif(p_issue ->> 'issue_number', '')::integer;
    if jsonb_typeof(p_issue -> 'labels') = 'array' then
      select coalesce(array_agg(value order by value), '{}'::text[])
        into v_labels
        from jsonb_array_elements_text(p_issue -> 'labels') as value;
    end if;
    if jsonb_typeof(p_issue -> 'assignees') = 'array' then
      select coalesce(array_agg(value order by value), '{}'::text[])
        into v_assignees
        from jsonb_array_elements_text(p_issue -> 'assignees') as value;
    end if;

    update public.ws_tasks set
      github_issue_number = coalesce(v_number, github_issue_number),
      github_url = coalesce(nullif(btrim(coalesce(p_issue ->> 'url', '')), ''), github_url),
      github_state = coalesce(nullif(btrim(coalesce(p_issue ->> 'state', '')), ''), github_state),
      github_labels = v_labels,
      github_milestone = nullif(btrim(coalesce(p_issue ->> 'milestone', '')), ''),
      github_assignees = v_assignees,
      github_updated_at = coalesce(
        nullif(p_issue ->> 'updated_at', '')::timestamptz,
        github_updated_at
      ),
      synced_at = now()
    where id = p_task_id;
  else
    update public.ws_tasks
    set synced_at = now()
    where id = p_task_id;
  end if;

  insert into public.github_sync_log (task_id, issue_number, direction, outcome, detail)
  values (p_task_id, v_number, p_direction, p_outcome, p_detail);
end;
$$;

revoke all on function public.gh_mark_task_synced(uuid, jsonb, text, text, text)
  from public, anon;
grant execute on function public.gh_mark_task_synced(uuid, jsonb, text, text, text)
  to authenticated;

-- 8. Row level security --------------------------------------------------------------------------

alter table public.github_user_map enable row level security;
alter table public.github_sync_log enable row level security;

revoke all on table public.github_user_map from public, anon;
revoke all on table public.github_sync_log from public, anon;

grant select on table public.github_user_map to authenticated;
grant insert, update, delete on table public.github_user_map to authenticated;
grant select on table public.github_sync_log to authenticated;

create policy github_user_map_read on public.github_user_map
  for select to authenticated using ((select public.ws_is_member()));

create policy github_user_map_create on public.github_user_map
  for insert to authenticated
  with check ((select public.ws_has_role(array['owner'])));

create policy github_user_map_edit on public.github_user_map
  for update to authenticated
  using ((select public.ws_has_role(array['owner'])))
  with check ((select public.ws_has_role(array['owner'])));

create policy github_user_map_delete on public.github_user_map
  for delete to authenticated
  using ((select public.ws_has_role(array['owner'])));

-- The log is read by the owner on the Settings screen. It is written by the two functions only, so
-- there is deliberately no insert, update or delete policy and no table grant for them.

create policy github_sync_log_read on public.github_sync_log
  for select to authenticated using ((select public.ws_has_role(array['owner'])));

-- 9. Self-check ----------------------------------------------------------------------------------
-- A missing column, a mis-granted function or a lost policy should stop the migration instead of
-- leaving a half-wired sync behind.

do $$
declare
  v_columns integer;
  v_tables integer;
  v_functions integer;
  v_anon_execute boolean;
  v_authenticated_apply boolean;
  v_policies integer;
begin
  select count(*) into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ws_tasks'
    and column_name in (
      'github_issue_number', 'github_url', 'github_state', 'github_labels',
      'github_milestone', 'github_assignees', 'github_updated_at', 'synced_at'
    );
  if v_columns <> 8 then
    raise exception 'expected 8 GitHub columns on ws_tasks, found %', v_columns;
  end if;

  select count(*) into v_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('github_user_map', 'github_sync_log')
    and c.relrowsecurity;
  if v_tables <> 2 then
    raise exception 'expected row level security on both GitHub tables, found %', v_tables;
  end if;

  select count(*) into v_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('gh_apply_issue', 'gh_mark_task_synced', 'gh_sync_member_for', 'gh_tasks_guard');
  if v_functions <> 4 then
    raise exception 'expected 4 GitHub sync functions, found %', v_functions;
  end if;

  select has_function_privilege('anon', 'public.gh_apply_issue(jsonb, text)', 'execute')
    into v_anon_execute;
  if v_anon_execute then
    raise exception 'anon must not be able to apply a GitHub issue';
  end if;

  select has_function_privilege('authenticated', 'public.gh_apply_issue(jsonb, text)', 'execute')
    into v_authenticated_apply;
  if v_authenticated_apply then
    raise exception 'a signed-in session must not apply a GitHub issue directly';
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'github_sync_log'
    and cmd = 'SELECT';
  if v_policies <> 1 then
    raise exception 'expected one read policy on github_sync_log, found %', v_policies;
  end if;
end;
$$;

commit;

-- ============================================================
-- Read-only checks. Run these after the commit; nothing here writes.
-- ============================================================

-- 1. The eight link columns, with their types.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ws_tasks'
  and (column_name like 'github%' or column_name = 'synced_at')
order by column_name;

-- 2. Row level security on the two new tables.
select c.relname as table_name, c.relrowsecurity as row_level_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('github_user_map', 'github_sync_log')
order by c.relname;

-- 3. The sync functions and the roles they are granted to. gh_apply_issue must not be granted to
-- anon or authenticated.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       coalesce(array_to_string(p.proacl, ', '), 'default') as access
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('gh_apply_issue', 'gh_mark_task_synced', 'gh_sync_member_for')
order by p.proname;
