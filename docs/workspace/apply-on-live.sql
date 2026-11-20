-- TeeLine Workspace: the four migrations as ONE paste-ready script for the Supabase SQL editor.
-- Generated from supabase/migrations/20261120000100..400 (verbatim, in order). Do not edit by hand.
--
-- BEFORE you run it:
--   1. Realtime > Settings: turn ON "Enable Realtime Authorization" (needed for the private channels in part 4).
--      Leave "Allow public access" OFF.
--   2. Be on the live project (the one the golf app uses). It is additive: new ws_* tables, new functions,
--      two policies on realtime.messages and one FK to public.tournaments (a very short lock).
--   3. Run it once. It is wrapped in one transaction, so a failure changes nothing.
--
-- AFTER it runs: run supabase/seed/workspace_members.example.sql (after filling in the roster emails),
-- then supabase/seed/workspace_tasks_nov17.example.sql. The last query below should list 7 tables, all with rls_on = true.

begin;

-- ============================================================
-- 20261120000100_workspace_members.sql
-- ============================================================
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

-- ============================================================
-- 20261120000200_workspace_docs.sql
-- ============================================================
-- TeeLine Workspace, part 2 of 4: shared documents.
-- ADDITIVE: new tables only.
--
--   ws_docs           one row per document (title, archived flag)
--   ws_doc_states     the live Yjs state of each document, saved by the editor (debounced)
--   ws_doc_snapshots  named versions for history and restore; immutable once written
--
-- Document text is edited live through Yjs over a private Realtime channel (see part 4). The state
-- is stored as base64 text, which is the format @supabase-labs/y-supabase writes with its
-- persistence option (table, room column and state column are configurable, so the editor points it
-- at ws_doc_states / doc_id / state).
--
-- Who may do what (all rows need an ACTIVE workspace member):
--   read, create, edit, rename, archive : any member
--   delete a document or a snapshot     : owner or partner only
-- A member can never change who created a row.

-- 1. Documents ----------------------------------------------------------------------------------

create table public.ws_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ws_docs_listing on public.ws_docs (archived, updated_at desc);

create trigger ws_docs_touch
  before update on public.ws_docs
  for each row execute function public.ws_touch_updated_at();

create trigger ws_docs_lock_creator
  before update on public.ws_docs
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 2. Live state ---------------------------------------------------------------------------------

create table public.ws_doc_states (
  doc_id uuid primary key references public.ws_docs (id) on delete cascade,
  -- Base64 of the full Yjs update. 14 million characters is about 10 MB of binary state.
  state text not null check (char_length(state) <= 14000000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create function public.ws_doc_state_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- Keeps the document list ordered by last edit without the editor writing two tables.
create function public.ws_doc_touch_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ws_docs set updated_at = now() where id = new.doc_id;
  return null;
end;
$$;

revoke all on function public.ws_doc_state_saved() from public, anon;
revoke all on function public.ws_doc_touch_parent() from public, anon;

create trigger ws_doc_states_stamp
  before update on public.ws_doc_states
  for each row execute function public.ws_doc_state_saved();

create trigger ws_doc_states_touch_parent
  after insert or update on public.ws_doc_states
  for each row execute function public.ws_doc_touch_parent();

-- 3. Snapshots ----------------------------------------------------------------------------------
-- `state` is the full Yjs state at that moment. `content` is the same document as editor JSON, which
-- is what a restore applies (as a new edit, so the history keeps both sides) and what the history
-- list previews. `pre_restore` snapshots are written automatically just before a restore.

create table public.ws_doc_snapshots (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.ws_docs (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null default 'manual' check (kind in ('manual', 'auto', 'pre_restore')),
  state text not null check (char_length(state) <= 14000000),
  content jsonb not null check (octet_length(content::text) <= 10000000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ws_doc_snapshots_by_doc on public.ws_doc_snapshots (doc_id, created_at desc);

-- 4. Row level security -------------------------------------------------------------------------

alter table public.ws_docs enable row level security;
alter table public.ws_doc_states enable row level security;
alter table public.ws_doc_snapshots enable row level security;

revoke all on table public.ws_docs from public, anon;
revoke all on table public.ws_doc_states from public, anon;
revoke all on table public.ws_doc_snapshots from public, anon;

grant select, insert, update, delete on table public.ws_docs to authenticated;
grant select, insert, update on table public.ws_doc_states to authenticated;
grant select, insert, delete on table public.ws_doc_snapshots to authenticated;

create policy ws_docs_read on public.ws_docs
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_docs_create on public.ws_docs
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_docs_edit on public.ws_docs
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_docs_delete on public.ws_docs
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_doc_states_read on public.ws_doc_states
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_doc_states_create on public.ws_doc_states
  for insert to authenticated with check ((select public.ws_is_member()));

create policy ws_doc_states_edit on public.ws_doc_states
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_doc_snapshots_read on public.ws_doc_snapshots
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_doc_snapshots_create on public.ws_doc_snapshots
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_doc_snapshots_delete on public.ws_doc_snapshots
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

-- ============================================================
-- 20261120000300_workspace_pipeline_and_tasks.sql
-- ============================================================
-- TeeLine Workspace, part 3 of 4: the tournament pipeline board and team tasks.
-- ADDITIVE: new tables only. The foreign keys to public.tournaments reference it but do not change
-- it. Adding a foreign key takes a very short lock on public.tournaments; apply this migration
-- outside scoring peaks (the table is small, so the lock is milliseconds).
--
--   ws_pipeline_cards  one card per prospective or running tournament deal, on a 7-stage board
--   ws_tasks           team tasks, optionally linked to a card and to an existing tournament
--   ws_task_comments   discussion on a task
--
-- A card is linked to an existing tournament by tournament_id when one exists. Tournament data is
-- never copied: the card keeps only what the sales pipeline needs (club name, dates, price).
--
-- Who may do what (all rows need an ACTIVE workspace member):
--   read, create, edit, move : any member
--   delete a card or a task  : owner or partner only
--   comments                 : any member writes; the author edits; the author or owner/partner deletes
-- A member can never change who created a row.

-- 1. Pipeline cards -----------------------------------------------------------------------------

create table public.ws_pipeline_cards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  club_name text not null check (char_length(btrim(club_name)) between 1 and 160),
  stage text not null default 'inquiry'
    check (stage in ('inquiry', 'proposal_sent', 'confirmed', 'prep', 'live', 'wrap_up', 'invoiced_closed')),
  -- Order inside a stage. Fractional: a move writes the midpoint of its new neighbours.
  position double precision not null default 0,
  start_date date,
  end_date date,
  expected_players integer check (expected_players is null or expected_players between 0 and 5000),
  pricing_model text check (pricing_model in ('per_player', 'annual', 'promo_discount')),
  quoted_amount numeric(12, 2) check (quoted_amount is null or quoted_amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  owner_id uuid references public.workspace_members (user_id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 20000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index ws_pipeline_cards_board on public.ws_pipeline_cards (stage, position);
create index ws_pipeline_cards_tournament on public.ws_pipeline_cards (tournament_id)
  where tournament_id is not null;
create index ws_pipeline_cards_owner on public.ws_pipeline_cards (owner_id);

create trigger ws_pipeline_cards_touch
  before update on public.ws_pipeline_cards
  for each row execute function public.ws_touch_updated_at();

create trigger ws_pipeline_cards_lock_creator
  before update on public.ws_pipeline_cards
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 2. Tasks --------------------------------------------------------------------------------------

create table public.ws_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 20000),
  assignee_id uuid references public.workspace_members (user_id) on delete set null,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  position double precision not null default 0,
  pipeline_card_id uuid references public.ws_pipeline_cards (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ws_tasks_board on public.ws_tasks (status, position);
create index ws_tasks_assignee on public.ws_tasks (assignee_id, status);
create index ws_tasks_due on public.ws_tasks (due_date) where status <> 'done';
create index ws_tasks_card on public.ws_tasks (pipeline_card_id) where pipeline_card_id is not null;

create function public.ws_task_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.ws_task_stamp() from public, anon;

create trigger ws_tasks_stamp
  before insert or update on public.ws_tasks
  for each row execute function public.ws_task_stamp();

create trigger ws_tasks_lock_creator
  before update on public.ws_tasks
  for each row execute function public.ws_lock_columns('created_by', 'created_at');

-- 3. Task comments ------------------------------------------------------------------------------

create table public.ws_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ws_tasks (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index ws_task_comments_by_task on public.ws_task_comments (task_id, created_at);

create trigger ws_task_comments_lock_author
  before update on public.ws_task_comments
  for each row execute function public.ws_lock_columns('author_id', 'task_id', 'created_at');

-- 4. Row level security -------------------------------------------------------------------------

alter table public.ws_pipeline_cards enable row level security;
alter table public.ws_tasks enable row level security;
alter table public.ws_task_comments enable row level security;

revoke all on table public.ws_pipeline_cards from public, anon;
revoke all on table public.ws_tasks from public, anon;
revoke all on table public.ws_task_comments from public, anon;

grant select, insert, update, delete on table public.ws_pipeline_cards to authenticated;
grant select, insert, update, delete on table public.ws_tasks to authenticated;
grant select, insert, update, delete on table public.ws_task_comments to authenticated;

create policy ws_pipeline_cards_read on public.ws_pipeline_cards
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_pipeline_cards_create on public.ws_pipeline_cards
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_pipeline_cards_edit on public.ws_pipeline_cards
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_pipeline_cards_delete on public.ws_pipeline_cards
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_tasks_read on public.ws_tasks
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_tasks_create on public.ws_tasks
  for insert to authenticated
  with check ((select public.ws_is_member()) and created_by = (select auth.uid()));

create policy ws_tasks_edit on public.ws_tasks
  for update to authenticated
  using ((select public.ws_is_member()))
  with check ((select public.ws_is_member()));

create policy ws_tasks_delete on public.ws_tasks
  for delete to authenticated
  using ((select public.ws_has_role(array['owner', 'partner'])));

create policy ws_task_comments_read on public.ws_task_comments
  for select to authenticated using ((select public.ws_is_member()));

create policy ws_task_comments_create on public.ws_task_comments
  for insert to authenticated
  with check ((select public.ws_is_member()) and author_id = (select auth.uid()));

create policy ws_task_comments_edit on public.ws_task_comments
  for update to authenticated
  using ((select public.ws_is_member()) and author_id = (select auth.uid()))
  with check ((select public.ws_is_member()) and author_id = (select auth.uid()));

create policy ws_task_comments_delete on public.ws_task_comments
  for delete to authenticated
  using (
    (select public.ws_is_member())
    and (author_id = (select auth.uid()) or (select public.ws_has_role(array['owner', 'partner'])))
  );

-- ============================================================
-- 20261120000400_workspace_realtime.sql
-- ============================================================
-- TeeLine Workspace, part 4 of 4: Realtime authorization.
-- ADDITIVE: new policies on realtime.messages, and new trigger functions on the workspace tables.
--
-- PREREQUISITE (a project setting, not SQL): Realtime Authorization must be available on the
-- Supabase project (Project Settings > Realtime). Apply this part to a non-production project or
-- branch first and run the two-account check in docs/workspace/SPEC.md before the production apply.
-- Recommended after that: switch "Allow public access" off so only private channels can be joined.
-- The live tournament app uses no Realtime channels, so that switch does not affect it.
--
-- Channels (all PRIVATE; a client must open them with config.private = true):
--   ws:doc:<doc id>  Yjs sync and cursors for one document. Members read and send, and only if
--                    the document exists and is visible to them.
--   ws:board         row changes on ws_pipeline_cards, sent by the database. Members read only.
--   ws:tasks         row changes on ws_tasks and ws_task_comments, sent by the database. Members read only.
-- Clients never send on ws:board or ws:tasks, so a member cannot forge a "change" event.

-- 1. Who may receive and send -------------------------------------------------------------------

create policy ws_members_receive on realtime.messages
  for select to authenticated
  using (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (
      (select realtime.topic()) in ('ws:board', 'ws:tasks')
      or (
        (select realtime.topic()) like 'ws:doc:%'
        and exists (
          select 1
          from public.ws_docs d
          where d.id::text = substr((select realtime.topic()), 8)
        )
      )
    )
  );

create policy ws_members_send on realtime.messages
  for insert to authenticated
  with check (
    (select public.ws_is_member())
    and realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) like 'ws:doc:%'
    and exists (
      select 1
      from public.ws_docs d
      where d.id::text = substr((select realtime.topic()), 8)
    )
  );

-- 2. Database to client change feed -------------------------------------------------------------
-- realtime.broadcast_changes writes one private message per changed row. A failure here must never
-- block a save, so it is caught and reported as a warning only.

create function public.ws_broadcast_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'ws:board', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  exception when others then
    raise warning 'ws_broadcast_board failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create function public.ws_broadcast_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'ws:tasks', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  exception when others then
    raise warning 'ws_broadcast_tasks failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.ws_broadcast_board() from public, anon;
revoke all on function public.ws_broadcast_tasks() from public, anon;

create trigger ws_pipeline_cards_broadcast
  after insert or update or delete on public.ws_pipeline_cards
  for each row execute function public.ws_broadcast_board();

create trigger ws_tasks_broadcast
  after insert or update or delete on public.ws_tasks
  for each row execute function public.ws_broadcast_tasks();

create trigger ws_task_comments_broadcast
  after insert or update or delete on public.ws_task_comments
  for each row execute function public.ws_broadcast_tasks();

commit;

-- Check: 7 tables, rls_on true on every row:
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname=$$public$$ and c.relname in ($$workspace_members$$,$$ws_docs$$,$$ws_doc_states$$,$$ws_doc_snapshots$$,$$ws_pipeline_cards$$,$$ws_tasks$$,$$ws_task_comments$$)
order by 1;
